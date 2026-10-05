import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { arCount } from '@/lib/i18n/arabicCount';
import { GlassButton } from '@/components/glass/GlassButton';
import { isProEffective } from '@/lib/utils/subscription';
import { FREE_LEVEL, isLevelFree, servedLevel } from '@/lib/entitlement/trial';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { ScenarioBanner } from '@/components/glass/ScenarioBanner';
import { sceneFor } from '@/lib/design/scenes';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import { track } from '@/lib/analytics/client';
import type { CEFRLevel, ScenarioEntity } from '@/types/models';
import { Sparkles, CheckCircle2, Lock, Play, Flame, ArrowLeft, Brain } from 'lucide-react';
import { buildCheckInMessage } from '@/lib/utils/checkIn';
import { rankFor } from '@/lib/progress/ranks';
import { countDue } from '@/lib/srs/engine';
import { missionStatusAr, selectDailyMission, type ScenarioLevelIndex } from '@/lib/mission/selectMission';
import {
  CAPABILITY_LABEL_AR,
  buildCapabilityModel,
  weakestMeasuredSkill,
} from '@/lib/capability/model';

/** V32: how many situations the roadmap shows before the learner asks for more. */
const TRAIL_PREVIEW_COUNT = 5;
const MORE_FORMS = { one: 'مشهد واحد', two: 'مشهدان', few: 'مشاهد', many: 'مشهداً' } as const;

export interface TrailScreenProps {
  onSelectScenario: (scenarioId: string) => void;
  onOpenSubscription: () => void;
  onOpenReview: () => void;
  /** Opens the preference editor; omitted only in tests/stories. */
  onOpenOnboarding?: () => void;
}

export const TrailScreen: React.FC<TrailScreenProps> = ({
  onSelectScenario,
  onOpenSubscription,
  onOpenReview,
  onOpenOnboarding,
}) => {
  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel>('A1');
  const [levelChosen, setLevelChosen] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  /** V32: the roadmap opens on the next few situations, not on all 49 at once. */
  const [showAllScenarios, setShowAllScenarios] = useState(false);
  const [paywallReason, setPaywallReason] = useState({ title: '', description: '' });

  const user = useLiveQuery(() => db.users.get('current_user'));
  const scenarios = useLiveQuery(() => db.scenarios.toArray()) || [];
  const trainingRecords = useLiveQuery(() => db.scenario_training.toArray()) || [];
  const reviewItems = useLiveQuery(() => db.review_items.toArray()) || [];
  const mistakes = useLiveQuery(() => db.mistakes.toArray()) || [];
  const skillPractice = useLiveQuery(() => db.skill_practice.toArray()) || [];
  const sessions = useLiveQuery(() => db.sessions.toArray()) || [];
  const starterPhrases = useLiveQuery(() => db.starter_phrases.toArray()) || [];
  const vocabulary = useLiveQuery(() => db.vocabulary.toArray()) || [];

  const dueCount = useMemo(() => countDue(reviewItems, Date.now()), [reviewItems]);

  const isPro = isProEffective(user);
  const levels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];
  // The learner's measured level is what this screen reports; the pills below
  // are a filter for browsing, not the source of truth. The level an *episode*
  // starts at is `servedLevel` — the level the server will actually serve.
  const learnerLevel: CEFRLevel = user?.cefrLevel || 'A1';
  const episodeLevel = servedLevel(learnerLevel, isPro);

  // Which levels each scenario actually has content for, derived from real
  // content rows (phrases + vocabulary), so an A2 learner is never sent to a
  // scenario with only A1 material while A2 material exists.
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
    () =>
      buildCapabilityModel({
        scenarios,
        training: trainingRecords,
        sessions,
        mistakes,
        reviewItems,
      }),
    [scenarios, trainingRecords, sessions, mistakes, reviewItems],
  );

  // One primary action for today, chosen by the tested, deterministic selector
  // (review due → unfinished → weakest skill → today's mission → new scenario).
  const mission = useMemo(
    () =>
      selectDailyMission({
        level: episodeLevel,
        goal: user?.primaryGoal,
        scenarios: scenarios.map((s) => ({
          id: s.id,
          title_de: s.title_de,
          title_ar: s.title_ar,
          category: s.category,
        })),
        training: trainingRecords.map((record) => ({
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
        // B6: the learner's own date. It never chooses the mission — it only adds
        // the days-left line when there are thirty or fewer of them.
        targetDate: user?.targetDate,
        targetDateKind: user?.targetDateKind,
      }),
    [episodeLevel, user?.primaryGoal, user?.dailyGoalMinutes, user?.targetDate, user?.targetDateKind, scenarios, trainingRecords, reviewItems, scenarioLevels, skillPractice, sessions],
  );
  const missionScenarioId = mission.scenarioId;

  // Katzu's daily welcome-back line reflects the user's real habit state.
  const checkIn = useMemo(
    () =>
      user
        ? buildCheckInMessage({ lastActiveDate: user.lastActiveDate, streakDays: user.streakDays || 0 })
        : null,
    [user?.lastActiveDate, user?.streakDays],
  );

  const xpRank = useMemo(() => rankFor(user?.totalXp ?? 0), [user?.totalXp]);

  /**
   * The scenario card's status now comes from the capability model, so "done"
   * means a recorded unaided success — not merely opening the lesson or
   * answering one quiz. Tests pin those transitions.
   */
  const capabilityFor = (scenarioId: string) => capability.byScenario[scenarioId]?.state || 'NOT_STARTED';

  // The pills start on the learner's measured level (never silently A1), and a
  // deliberate tap wins from then on.
  useEffect(() => {
    if (!levelChosen && user?.cefrLevel) setSelectedLevel(user.cefrLevel);
  }, [user?.cefrLevel, levelChosen]);

  /**
   * The boundary is the Worker's, not a second opinion: free covers A1.
   *
   * Offering the learner's own measured level here reads better, but it promises
   * an episode the server refuses — an A2 learner opens an A2 scenario and meets
   * the paywall on their first turn, which is the one paywall that cannot be
   * defended. A locked row with honest copy costs a tap; a broken episode costs
   * the learner's trust in the whole app.
   */
  const levelLocked = (lvl: CEFRLevel) => !isLevelFree(lvl, isPro);

  const handleLevelSelect = (lvl: CEFRLevel) => {
    setLevelChosen(true);
    if (levelLocked(lvl)) {
      setPaywallReason({
        title: `المستوى ${lvl} يُفتح مع Pro`,
        description: `الخطة المجانية تغطي مستوى ${FREE_LEVEL}. Katzu Pro يفتح بقية المستويات حتى B2 — لترى أين تتجه بعد ذلك.`,
      });
      setShowPaywall(true);
      return;
    }
    setSelectedLevel(lvl);
  };

  const handleScenarioClick = (scenarioId: string) => {
    track('scenario_started', { scenarioId, source: 'trail' });
    if (levelLocked(selectedLevel)) {
      setPaywallReason({
        title: `مستوى ${selectedLevel} يُفتح مع Pro`,
        description: `في الخطة المجانية تتدرب على مستوى ${FREE_LEVEL}. Pro يفتح كل المستويات من A0 إلى B2 لمتابعة ما بعدها.`,
      });
      setShowPaywall(true);
      return;
    }
    onSelectScenario(scenarioId);
  };

  return (
    <div className="min-h-screen bg-black text-text-primary pb-28 pt-4 px-4 max-w-md mx-auto relative">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <KatzuMascot name="avatar" className="w-10 h-10" />
          <div>
            <h2 className="text-base font-bold font-arabic leading-tight">{user?.displayName || 'مستكشف كَاتْزُو'}</h2>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="flex items-center gap-1 text-learning font-bold">
                <Flame className="w-3.5 h-3.5 fill-learning text-learning" />
                {user?.streakDays ?? 0} أيام حماس
              </span>
              <span>•</span>
              <span className="text-primary font-bold">
                {xpRank.rank.nameAr} · الرتبة {xpRank.rankNumber} من {xpRank.totalRanks}
              </span>
            </div>
          </div>
        </div>

        {!isPro ? (
          <button
            onClick={onOpenSubscription}
            aria-label="اكتشف مزايا Pro"
            className="flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/40 text-primary text-xs font-bold shadow-glow-purple transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>اكتشف مزايا Pro</span>
          </button>
        ) : (
          <Badge variant="success" size="sm">
            Katzu Pro نشط
          </Badge>
        )}
      </div>

      {/* Katzu Daily Check-in */}
      {checkIn && (
        <div className="mb-4 flex items-center gap-3 rounded-3xl border border-border-subtle bg-surface-card p-4">
          <KatzuMascot name="peace" className="h-14 w-14 shrink-0 object-contain" />
          <div className="min-w-0">
            <p className="font-arabic text-sm font-bold leading-snug text-text-primary">{checkIn.headline}</p>
            <p className="mt-0.5 font-arabic text-xs leading-snug text-text-secondary">{checkIn.sub}</p>
            {xpRank.next && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-micro font-arabic text-text-secondary">
                  <span className="text-primary font-bold">{xpRank.rank.nameAr}</span>
                  <span>{xpRank.xpToNext} XP للرتبة التالية</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
                  <div className="h-full w-full rounded-full bg-primary origin-right transition-transform duration-panels ease-out" style={{ transform: `scaleX(${xpRank.progressPercent / 100})` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ONE primary action for today. Review-due content becomes this card
          rather than a competing banner: the mission selector already put it
          first, and two prominent CTAs is how a learner ends up doing neither. */}
      <Card
        variant="hero"
        className={`p-4 mb-6 relative overflow-hidden flex items-center justify-between border shadow-glow-purple ${
          mission.kind === 'review' ? 'border-status-learning/50' : 'border-primary/40'
        }`}
      >
        <div className="z-10 max-w-[65%]">
          <Badge variant={mission.kind === 'review' ? 'learning' : 'primary'} size="sm" className="mb-2">
            {missionStatusAr(mission.kind)}
          </Badge>
          {mission.kind === 'review' ? (
            <>
              <h3 className="text-base font-bold font-arabic mb-1 leading-snug">
                مراجعة اليوم: {dueCount} عنصر
              </h3>
              <p className="text-xs text-text-secondary font-arabic">{mission.subtitleAr}</p>
            </>
          ) : mission.scenarioId ? (
            <>
              <GermanText className="text-base font-bold text-text-primary block mb-1 leading-snug">
                {mission.titleDe || ''}
              </GermanText>
              <p className="text-xs text-text-secondary font-arabic">{mission.titleAr || mission.subtitleAr}</p>
            </>
          ) : (
            <>
              <h3 className="text-base font-bold font-arabic mb-1 leading-snug">مهمتك اليومية قيد التجهيز</h3>
              <p className="text-xs text-text-secondary font-arabic">{mission.subtitleAr}</p>
            </>
          )}

          {mission.kind === 'review' && (
            <button
              onClick={onOpenReview}
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-status-learning px-3.5 py-1.5 text-xs font-bold text-black shadow-glow-purple transition-colors min-h-[44px]"
            >
              <Brain className="w-3.5 h-3.5" />
              <span>{mission.ctaAr}</span>
            </button>
          )}

          {/* B6: the days-left line, only inside the last month of an exam, and
              never as a reason to skip the mission above it. */}
          {mission.countdownAr ? (
            <p data-testid="exam-countdown" className="mt-2 text-xs font-arabic text-status-warning">
              {mission.countdownAr}
            </p>
          ) : null}
          {missionScenarioId && mission.kind !== 'review' && (
            <button
              onClick={() => handleScenarioClick(missionScenarioId)}
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-fill px-3.5 py-1.5 text-xs font-bold text-on-fill shadow-glow-purple transition-colors min-h-[44px]"
            >
              <span>{mission.ctaAr}</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
          {mission.kind === 'no_content' && (
            <p className="mt-3 text-micro font-arabic text-text-muted leading-relaxed">
              يمكنك المتابعة بالمراجعة والتدريبات المتاحة على هذا الجهاز حتى يتوفر الاتصال.
            </p>
          )}
        </div>
        <KatzuMascot name="trail_header" className="w-24 h-24 object-contain -me-2 z-10" />
      </Card>

      {/* Learners whose profile predates onboarding are prompted once here —
          never redirected mid-task, and never asked twice after they answer.

          V32: this used to sit ABOVE the mission, where it read as a second,
          equally-urgent thing to do. The mission is today's work; this is setup.
          Below it, and quiet, it stops competing with the one action that
          matters. */}
      {user?.isLoggedIn && !user.onboardingCompletedAt && onOpenOnboarding && (
        <button
          onClick={onOpenOnboarding}
          className="mb-6 flex w-full items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-card px-4 py-3 text-start transition-colors pointer-hover:border-primary/40 min-h-[44px]"
        >
          <span className="min-w-0">
            <span className="block font-arabic text-xs font-bold text-text-primary">
              أكمل تفضيلاتك (٣٠ ثانية)
            </span>
            <span className="mt-0.5 block font-arabic text-micro text-text-secondary">
              يجعل المهمة اليومية أدق — ومستواك غير مقيس حتى تختاره.
            </span>
          </span>
          <ArrowLeft className="h-4 w-4 shrink-0 text-text-secondary" />
        </button>
      )}

      {/* CEFR Level Selector Pills */}
      <div className="flex items-center justify-between gap-2 p-1.5 bg-surface-card border border-border-subtle rounded-2xl mb-8">
        {levels.map((lvl) => {
          const isLvlLocked = levelLocked(lvl);
          return (
            <button
              key={lvl}
              onClick={() => handleLevelSelect(lvl)}
              className={`flex-1 min-h-[44px] py-2 rounded-xl text-xs font-german font-bold transition-colors flex items-center justify-center gap-1 ${
                selectedLevel === lvl
                  ? 'bg-fill text-on-fill shadow-glow-purple'
                  : 'text-text-secondary pointer-hover:text-text-primary'
              }`}
            >
              <span>{lvl}</span>
              {isLvlLocked && <Lock className="w-3 h-3 text-text-muted" />}
            </button>
          );
        })}
      </div>

      {/* Vertical Curriculum Trail Roadmap.

          V32: measured 12 controls on this screen that all read as *the* main
          action — eight 82%-wide cards plus four level chips, with the level
          pills sitting ABOVE the cards so they led the hierarchy. The trail
          metaphor is worth keeping; what is not worth keeping is a wall of
          equals. The roadmap now opens on the next few situations with one
          obvious "show the rest" action, and the level row is demoted to a
          quiet filter. */}
      <div className="relative flex flex-col items-center space-y-6">
        {/* Glowing Path Line */}
        <div className="absolute top-4 bottom-4 w-1 bg-gradient-to-b from-primary via-primary/30 to-border-subtle z-0" />

        {scenarios.slice(0, showAllScenarios ? undefined : TRAIL_PREVIEW_COUNT).map((scenario: ScenarioEntity, index: number) => {
          const state = capabilityFor(scenario.id);
          const isMastered = state === 'INDEPENDENT' || state === 'RETAINED';
          const isOffsetLeft = index % 2 === 0;

          return (
            <div
              key={scenario.id}
              className={`w-full flex items-center z-10 ${
                isOffsetLeft ? 'justify-start pe-8' : 'justify-end ps-8'
              }`}
            >
              <button
                type="button"
                onClick={() => handleScenarioClick(scenario.id)}
                aria-label={`${scenario.title_ar} (${scenario.title_de})`}
                className={`relative w-[82%] overflow-hidden rounded-3xl border text-start cursor-pointer transition-[background-color,border-color,box-shadow] ${
                  isMastered
                    ? 'bg-surface-card border-status-success/40 shadow-glow-green'
                    : 'bg-surface-card border-border-subtle pointer-hover:border-primary/50'
                }`}
              >
                {/* The scenario's 16:9 thumbnail — the same banner the mission card
                    and the scenario's own screen use, so one scenario looks like one
                    situation everywhere. */}
                <ScenarioBanner
                  scene={sceneFor({
                    id: scenario.id,
                    category: scenario.category,
                    bannerUrl: scenario.banner_url,
                  })}
                >
                  <div className="flex items-start justify-end p-2.5">
                    <Badge variant={isMastered ? 'success' : 'subtle'} size="sm">
                      {CAPABILITY_LABEL_AR[state]}
                    </Badge>
                  </div>
                </ScenarioBanner>

                <div className="p-3.5">
                  {isMastered ? (
                    <CheckCircle2 className="mb-1 h-5 w-5 text-status-success" />
                  ) : (
                    <div className="mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary">
                      <Play className="h-3.5 w-3.5 fill-primary text-primary" />
                    </div>
                  )}

                  <GermanText className="text-base font-bold text-text-primary block mb-0.5">
                    {scenario.title_de}
                  </GermanText>
                  {/* V35: one line cut Arabic scenario titles mid-phrase. The card opens the
                      full title, but a card should not need opening to be read. */}
                  <div className="text-xs text-text-secondary font-arabic line-clamp-2">
                    {scenario.title_ar}
                  </div>
                  {capabilityFor(scenario.id) === 'PRACTISING' && (
                    <p className="mt-1.5 text-micro font-arabic text-status-learning">
                      تدرّبت عليه — لم تصبح مستقلاً فيه بعد
                    </p>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* The one obvious thing left to do on a wall of cards. */}
      {!showAllScenarios && scenarios.length > TRAIL_PREVIEW_COUNT && (
        <GlassButton
          variant="secondary"
          fullWidth
          onClick={() => setShowAllScenarios(true)}
          className="justify-center"
        >
          <span className="font-arabic">اعرض بقية المشاهد</span>
          <span className="kz-ar-micro font-german text-kz-inkFaint">
            ({arCount(scenarios.length - TRAIL_PREVIEW_COUNT, MORE_FORMS)})
          </span>
        </GlassButton>
      )}

      {/* Paywall Modal */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onUpgrade={onOpenSubscription}
        title={paywallReason.title}
        description={paywallReason.description}
      />
    </div>
  );
};
