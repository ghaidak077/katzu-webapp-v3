import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { countDue } from '@/lib/srs/engine';
import { isProEffective } from '@/lib/utils/subscription';
import { servedLevel } from '@/lib/entitlement/trial';
import { BorderBeam } from '@/components/effects/BorderBeam';
import { selectDailyMission, INTRO_SCENARIO_ID, type ScenarioLevelIndex } from '@/lib/mission/selectMission';
import { buildCapabilityModel, CAPABILITY_LABEL_AR, weakestMeasuredSkill } from '@/lib/capability/model';
import { buildJourneyContext, katzuJourneyLineAr, missionReasonAr } from '@/lib/journey/context';
import { sceneFor } from '@/lib/design/scenes';
import { track } from '@/lib/analytics/client';
import { GermanText } from '@/components/common/GermanText';

import { GlassCard, FloatingControl } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { GlassWell, useSpecularHighlight } from '@/components/glass/GlassSurface';
import { ScenarioBanner } from '@/components/glass/ScenarioBanner';
import { ProgressStrip } from '@/components/v2/ProgressStrip';
import { StatusIndicator } from '@/components/v2/StatusIndicator';
import { KatzuPresence } from '@/components/v2/KatzuPresence';
import { useOnlineStatus } from '@/lib/utils/onlineStatus';
import { ArrowLeft, Brain, RefreshCw, Sparkles } from 'lucide-react';
import type { CEFRLevel } from '@/types/models';

export interface JourneyHomeScreenProps {
  /** Opens Story Setup for a scene — the mission's one primary action. */
  onStartMission: (scenarioId: string) => void;
  onOpenReview: () => void;
  onOpenSubscription: () => void;
  /** The scenario library (the pre-V2 trail), kept reachable as a quiet link. */
  onOpenLibrary: () => void;
  onOpenOnboarding?: () => void;
}

/**
 * Journey Home.
 *
 * One question: *what do I do today?* — answered once, by the deterministic
 * mission selector, and rendered as one mission with one action. The status line,
 * the chapter segments and the "why today" line all come from recorded evidence,
 * so a learner can tell at a glance where they are without the screen asserting
 * anything the app has not measured.
 */
export const JourneyHomeScreen: React.FC<JourneyHomeScreenProps> = ({
  onStartMission,
  onOpenReview,
  onOpenSubscription,
  onOpenLibrary,
  onOpenOnboarding,
}) => {
  const specular = useSpecularHighlight<HTMLDivElement>();
  const isOnline = useOnlineStatus();

  const user = useLiveQuery(() => db.users.get('current_user'));
  const scenarios = useLiveQuery(() => db.scenarios.toArray()) || [];
  const training = useLiveQuery(() => db.scenario_training.toArray()) || [];
  const reviewItems = useLiveQuery(() => db.review_items.toArray()) || [];
  const mistakes = useLiveQuery(() => db.mistakes.toArray()) || [];
  const sessions = useLiveQuery(() => db.sessions.toArray()) || [];
  const skillPractice = useLiveQuery(() => db.skill_practice.toArray()) || [];
  const starterPhrases = useLiveQuery(() => db.starter_phrases.toArray()) || [];
  const vocabulary = useLiveQuery(() => db.vocabulary.toArray()) || [];

  const learnerLevel: CEFRLevel = user?.cefrLevel || 'A1';
  const isPro = isProEffective(user);

  /**
   * The level today's episode runs at — not always the learner's own.
   *
   * The trial serves A1, so a free learner measured above it is given an A1
   * mission on purpose: an episode at their measured level would end in the
   * paywall half-way through their first conversation, which is the one wall the
   * product is not allowed to build. Their own level is what Pro unlocks, and
   * the Debrief is where that gets said — after the win, never before it.
   */
  const level = servedLevel(learnerLevel, isPro);
  const dueCount = useMemo(() => countDue(reviewItems, Date.now()), [reviewItems]);

  const scenarioLevels = useMemo<ScenarioLevelIndex>(() => {
    const index: ScenarioLevelIndex = {};
    for (const phrase of starterPhrases) {
      if (!phrase?.scenario_id) continue;
      const levels = index[phrase.scenario_id] || [];
      if (!levels.includes(phrase.level)) levels.push(phrase.level);
      index[phrase.scenario_id] = levels;
    }
    for (const word of vocabulary) {
      if (!word?.topic) continue;
      const levels = index[word.topic] || [];
      if (!levels.includes(word.level)) levels.push(word.level);
      index[word.topic] = levels;
    }
    return index;
  }, [starterPhrases, vocabulary]);

  const capability = useMemo(
    () => buildCapabilityModel({ scenarios, training, sessions, mistakes, reviewItems }),
    [scenarios, training, sessions, mistakes, reviewItems],
  );

  const independentScenarioIds = useMemo(
    () =>
      Object.entries(capability.byScenario)
        .filter(([, value]) => value.state === 'INDEPENDENT' || value.state === 'RETAINED')
        .map(([scenarioId]) => scenarioId),
    [capability],
  );

  const mission = useMemo(
    () =>
      selectDailyMission({
        level,
        goal: user?.primaryGoal,
        scenarios: scenarios.map((scenario) => ({
          id: scenario.id,
          title_de: scenario.title_de,
          title_ar: scenario.title_ar,
          category: scenario.category,
        })),
        training: training.map((record) => ({
          scenarioId: record.scenarioId,
          studiedAt: record.studiedAt,
          quizAttempted: record.quizAttempted,
          lastScore: record.lastScore,
          updatedAt: record.updatedAt,
        })),
        reviewItems: reviewItems.map((item) => ({ dueAt: item.dueAt, kind: item.kind, scenarioId: item.scenarioId })),
        scenarioLevels,
        weakestSkill: weakestMeasuredSkill({ sessions, practice: skillPractice }),
        dailyMinutes: user?.dailyGoalMinutes,
      }),
    [level, user?.primaryGoal, user?.dailyGoalMinutes, scenarios, training, reviewItems, scenarioLevels, sessions, skillPractice],
  );

  const missionScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === mission.scenarioId) || null,
    [scenarios, mission.scenarioId],
  );

  const scene = useMemo(
    () =>
      sceneFor(
        missionScenario
          ? {
              id: missionScenario.id,
              category: missionScenario.category,
              bannerUrl: missionScenario.banner_url,
            }
          : undefined,
      ),
    [missionScenario],
  );

  const context = useMemo(
    () =>
      buildJourneyContext({
        scenarios: scenarios.map((scenario) => ({
          id: scenario.id,
          title_de: scenario.title_de,
          title_ar: scenario.title_ar,
          category: scenario.category,
        })),
        training: training.map((record) => ({
          scenarioId: record.scenarioId,
          studiedAt: record.studiedAt,
          quizAttempted: record.quizAttempted,
          lastScore: record.lastScore,
          updatedAt: record.updatedAt,
        })),
        sessions: sessions.map((session) => ({ timestamp: session.timestamp })),
        reviewDueCount: dueCount,
        independentScenarioIds,
        goal: user?.primaryGoal,
        arrivalStatus: user?.arrivalStatus,
        level,
      }),
    [scenarios, training, sessions, dueCount, independentScenarioIds, user?.primaryGoal, user?.arrivalStatus, level],
  );

  const reasonAr = missionReasonAr(mission, { goal: user?.primaryGoal, arrivalStatus: user?.arrivalStatus }, missionScenario);

  // A mission whose content is cached works offline; that is what the indicator
  // is allowed to claim. It never claims the AI conversation will work offline.
  const cachedMission = !!missionScenario && dueCount === 0 && mission.kind !== 'no_content' && mission.kind !== 'review';
  const katzuLineAr = katzuJourneyLineAr({ context, plan: mission, offline: !isOnline, cachedMission });
  const katzuState = context.isFirstRun
    ? 'journey'
    : mission.kind === 'review'
      ? 'review_due'
      : context.isAllCaughtUp
        ? 'all_caught_up'
        : !isOnline
          ? 'blocked'
          : 'journey';

  // The most recent genuinely earned capability — the only thing allowed to wear
  // magenta on this screen. Absent until the app has recorded one.
  const latestCapability = useMemo(() => {
    const entries = Object.entries(capability.byScenario)
      .filter(([, value]) => value.state === 'INDEPENDENT' || value.state === 'RETAINED')
      .sort((a, b) => (b[1].lastActivityAt || 0) - (a[1].lastActivityAt || 0));
    const first = entries[0];
    if (!first) return null;
    const scenario = scenarios.find((entry) => entry.id === first[0]);
    if (!scenario) return null;
    return { titleAr: scenario.title_ar, labelAr: CAPABILITY_LABEL_AR[first[1].state] };
  }, [capability, scenarios]);

  const totalMinutes = mission.estimatedMinutes || user?.dailyGoalMinutes || 10;

  /**
   * There is no gate here, on purpose.
   *
   * Today's mission is always startable — on the first run and on the
   * hundredth, at whatever level `servedLevel` says the trial will serve. The trial limit lives in the Worker, which is
   * the only thing that knows how many conversations are left, and the Pro offer
   * is made on the Debrief after a finished episode (see `lib/entitlement/trial`).
   * A wall before the learner has seen what the product does is the one paywall
   * that cannot be defended.
   */
  const handlePrimary = () => {
    if (!mission.scenarioId) return;
    track('scenario_started', { scenarioId: mission.scenarioId, source: 'journey_home' });
    onStartMission(mission.scenarioId);
  };

  return (
    <div
      ref={specular.ref}
      onPointerMove={specular.onPointerMove}
      className="min-h-screen bg-black px-4 pb-28 pt-5"
    >
      <div className="mx-auto max-w-md">
        {/* Status line: where am I? Day, chapter, and the situation it belongs to. */}
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kz-ar-micro text-kz-inkFaint">
              اليوم {context.dayNumber} · الفصل {context.chapterIndex} من {context.chapterCount}
            </p>
            <h1 className="kz-ar-title mt-0.5 truncate text-kz-ink">{context.chapterTitleAr}</h1>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatusIndicator state={isOnline ? 'online' : 'offline'} compact />
            {!isPro && (
              <GlassButton variant="quiet" onClick={onOpenSubscription} className="!min-h-0 !px-0 text-[0.7rem]">
                <Sparkles className="h-3 w-3" />
                Katzu Pro
              </GlassButton>
            )}
          </div>
        </header>

        {/* Learners whose profile predates onboarding answer once, here, and are
            never redirected mid-task. */}
        {user?.isLoggedIn && !user.onboardingCompletedAt && onOpenOnboarding && (
          <GlassButton variant="secondary" fullWidth onClick={onOpenOnboarding} className="mb-4 justify-between">
            <span className="flex flex-col items-start text-start">
              <span className="kz-ar-caption text-kz-ink">أكمل تفضيلاتك (٣٠ ثانية)</span>
              <span className="kz-ar-micro font-normal text-kz-inkFaint">
                هدفك ووقتك يجعلان مهمة اليوم أدق
              </span>
            </span>
            <ArrowLeft className="h-4 w-4 shrink-0" />
          </GlassButton>
        )}

        {/* The mission. Scene art carries the mood; the glass panel carries the
            Arabic story and the one action. */}
        {/* The mission card breathes: an ambient lavender beam at rest is the layer
            that makes the one thing to do today feel alive rather than painted. */}
        <BorderBeam role="ambient" className="mb-4">
        <GlassCard
          tier="glass"
          emphasis="primary"
          padded={false}
          className="animate-kz-rise overflow-hidden"
        >
          {/* The scenario's own 16:9 banner: what today's mission looks like, not
              only what it is called. */}
          <ScenarioBanner scene={scene} drift loading="eager">
            <div className="flex h-full flex-col justify-between p-4">
              <span className="kz-ar-micro self-start rounded-full bg-black/45 px-2.5 py-1 text-kz-inkDim backdrop-blur-sm">
                {scene.locationAr}
              </span>
              <KatzuPresence state="journey" size="md" className="self-end" />
            </div>
          </ScenarioBanner>

          <div className="p-4">
            <p className="kz-ar-micro mb-1 text-kz-inkFaint">{missionTitleBadgeAr(mission.kind, dueCount, mission.scenarioId)}</p>
            {missionScenario ? (
              <>
                <GermanText className="kz-de-title block text-kz-ink">{missionScenario.title_de}</GermanText>
                <p className="kz-ar-body mt-1 text-kz-ink">{missionScenario.title_ar}</p>
              </>
            ) : (
              <p className="kz-ar-title text-kz-ink">
                {mission.kind === 'review' ? `مراجعة اليوم — ${dueCount} عنصر` : 'مهمتك اليومية قيد التجهيز'}
              </p>
            )}

            <p className="kz-ar-caption mt-2 text-kz-inkDim">{reasonAr}</p>
            <p className="kz-ar-micro mt-2 text-kz-inkFaint">
              {mission.kind === 'review'
                ? 'المراجعة تعمل بدون اتصال'
                : `وقت متوقع: ${totalMinutes} دقائق`}
            </p>
            {/* Said out loud rather than discovered mid-conversation: the episode
                runs at a level the free tier serves, and that is why it is not
                the level the placement measured. */}
            {level !== learnerLevel && (
              <p className="kz-ar-micro mt-1 text-kz-inkFaint">
                هذه المهمة بمستوى {level} — وهو المتاح في الخطة المجانية.
              </p>
            )}

            <div className="mt-4">
              {/* The plan owns the button's wording, so today's action is named once.
                  That is what lets the opening episode say "ابدأ من لحظة الوصول"
                  while a scheduled day says "ابدأ مهمة اليوم (10 د)" — one label,
                  chosen where the mission was chosen. */}
              {mission.kind === 'review' ? (
                <PrimaryAction hintAr="المراجعة محفوظة على جهازك وتعمل بدون اتصال." onClick={onOpenReview}>
                  {mission.ctaAr}
                </PrimaryAction>
              ) : mission.kind === 'no_content' ? (
                // An honest empty state: one useful action, and a real explanation.
                <PrimaryAction
                  hintAr="بعد أول اتصال يعمل كل شيء بدون إنترنت لاحقاً."
                  onClick={() => window.location.reload()}
                  icon={<RefreshCw className="h-4 w-4" />}
                >
                  {mission.ctaAr}
                </PrimaryAction>
              ) : (
                <PrimaryAction
                  hintAr="خطوات قصيرة: قصة، تدريب، ثم محادثة."
                  onClick={handlePrimary}
                >
                  {mission.ctaAr}
                </PrimaryAction>
              )}
            </div>
          </div>
        </GlassCard>
        </BorderBeam>

        {/* Katzu's one line. Only rendered when a real state produced it. */}
        {katzuLineAr && (
          <FloatingControl className="mb-4 flex items-start gap-3 p-3.5">
            <KatzuPresence state={katzuState} size="sm" className="shrink-0" />
            <p className="kz-ar-caption min-w-0 flex-1 pt-1 text-kz-inkDim">{katzuLineAr}</p>
          </FloatingControl>
        )}

        {/* Review-due row: quiet, secondary, and only when something is due.
            When review IS today's mission it is not repeated here — two prominent
            CTAs is how a learner does neither. */}
        {dueCount > 0 && mission.kind !== 'review' && (
          <GlassButton variant="secondary" fullWidth onClick={onOpenReview} className="mb-4 justify-between">
            <span className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-kz-lavender" />
              <span className="kz-ar-caption text-kz-ink">مراجعة مستحقة: {dueCount}</span>
            </span>
            <ArrowLeft className="h-4 w-4 text-kz-inkFaint" />
          </GlassButton>
        )}

        {/* Earned capability. Magenta appears here and nowhere else on this
            screen, and only when the app recorded a real unaided success. */}
        {latestCapability && (
          <BorderBeam role="ambient" palette="earned" className="mb-4">
            <GlassCard tier="canvas" emphasis="earned">
              <p className="kz-ar-micro kz-earned-text mb-1">قدرة مكتسبة · {latestCapability.labelAr}</p>
              <p className="kz-ar-caption text-kz-ink">
                تستطيع التعامل مع «{latestCapability.titleAr}» بالألمانية بدون مساعدة.
              </p>
            </GlassCard>
          </BorderBeam>
        )}

        {/* Chapter progress: segments, never a percentage. */}
        <GlassWell className="mb-4 p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="kz-ar-micro text-kz-inkDim">تقدّم الفصل</span>
            <span className="kz-ar-micro text-kz-inkFaint">
              {context.chapterSegmentsDone} من {context.chapterSegments} مشاهد
            </span>
          </div>
          <ProgressStrip
            segments={context.chapterSegments}
            completed={context.chapterSegmentsDone}
            activeIndex={context.activeSegment}
            earned={context.chapterSegmentsDone >= context.chapterSegments}
            labelAr={context.chapterTitleAr}
          />
        </GlassWell>

        {/* Library + level: real navigation, kept quiet so the mission stays the
            only prominent path forward. */}
        <div className="flex items-center justify-between gap-3">
          <GlassButton variant="quiet" onClick={onOpenLibrary}>
            كل المشاهد والمستويات
          </GlassButton>
          <span className="kz-ar-micro text-kz-inkFaint">مستواك: {learnerLevel}</span>
        </div>
      </div>

    </div>
  );
};

function missionTitleBadgeAr(kind: string, dueCount: number, scenarioId?: string): string {
  // The one episode that is not "today's situation": the story's first scene.
  if (scenarioId === INTRO_SCENARIO_ID) return 'لحظة الوصول · أول موقف في القصة';
  switch (kind) {
    case 'review':
      return `مراجعة اليوم · ${dueCount}`;
    case 'continue':
      return 'أكمل مشهداً مفتوحاً';
    case 'weak_skill':
      return 'تدريب على أضعف مهارة';
    case 'daily':
      return 'مهمة اليوم';
    case 'new':
      return 'مشهد جديد';
    default:
      return 'بانتظار المحتوى';
  }
}
