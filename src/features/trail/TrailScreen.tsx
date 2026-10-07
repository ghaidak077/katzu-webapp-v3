import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { arCount } from '@/lib/i18n/arabicCount';
import { GlassButton } from '@/components/glass/GlassButton';
import { Button } from '@/components/ui/Button';
import { isProEffective } from '@/lib/utils/subscription';
import { FREE_LEVEL, isLevelFree, servedLevel } from '@/lib/entitlement/trial';
import { journeyOrderedScenarios } from '@/lib/content/scenarioOrder';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { ScenarioBanner } from '@/components/glass/ScenarioBanner';
import { sceneFor } from '@/lib/design/scenes';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import { track } from '@/lib/analytics/client';
import type { CEFRLevel, CapabilityState, ScenarioEntity } from '@/types/models';
import { Sparkles, Check, Lock, Play, Flame, ArrowLeft, Brain } from 'lucide-react';
import { rankFor } from '@/lib/progress/ranks';
import { countDue } from '@/lib/srs/engine';
import { missionStatusAr, selectDailyMission, type ScenarioLevelIndex } from '@/lib/mission/selectMission';
import { buildCheckInMessage } from '@/lib/utils/checkIn';
import {
  CAPABILITY_LABEL_AR,
  buildCapabilityModel,
  weakestMeasuredSkill,
} from '@/lib/capability/model';

/** V32: how many situations the roadmap shows before the learner asks for more. */
const TRAIL_PREVIEW_COUNT = 5;
const MORE_FORMS = { one: 'مشهد واحد', two: 'مشهدان', few: 'مشاهد', many: 'مشهداً' } as const;
/** V31: agreement for the review strip's title. See `arabicCount`. */
const REVIEW_ITEM_FORMS = { one: 'عنصر', two: 'عنصران', few: 'عناصر', many: 'عنصراً' } as const;

/**
 * The path chip's wording, per state.
 *
 * The bare state name for PRACTISING («قيد التدريب») failed the new-learner
 * test: beside «لم يبدأ» it says that something is happening, but not THAT THE
 * LEARNER practised it and is not independent in it yet — which is exactly what
 * the old hint line under the card said. That hint is folded into the chip so
 * the state stays one line and carries its own meaning. Other states keep the
 * shared labels; the longer sentence is a Trail-only override, so compact
 * surfaces elsewhere (Progress, the capability card) are untouched.
 */
const PATH_CHIP_LABEL_AR: Record<CapabilityState, string> = {
  ...CAPABILITY_LABEL_AR,
  PRACTISING: 'تدرّبت عليه — لم تستقل فيه بعد',
};

export interface TrailScreenProps {
  onSelectScenario: (scenarioId: string) => void;
  onOpenSubscription: () => void;
  onOpenReview: () => void;
  /** Opens the preference editor; omitted only in tests/stories. */
  onOpenOnboarding?: () => void;
}

/**
 * The journey path — every situation, on one timeline.
 *
 * Layout rules this screen now follows (they were the defects in review):
 *  - ONE column, full-width cards. The old zigzag narrowed every card to 82%,
 *    pushed alternate rows off the edge, and ran the timeline straight through
 *    the artwork.
 *  - The timeline is a hairline on the START edge (right in RTL) with one node
 *    per card, so it can never cross a card.
 *  - A card with no real artwork renders compact — no blank 16:9 block. A card
 *    that has artwork shows it as a small 16:9 thumbnail.
 *  - Exactly one glow on the screen: the current node's card.
 *  - Section rhythm is the shared spacing scale, and every surface is the shared
 *    card material (`Card` → `.kz-surface`), not a hand-rolled panel.
 */
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
  // The Trail is a journey, not a list: the order comes from
  // `journeyOrderedScenarios` (arrival → first words → everyday → home →
  // official → health → work → interviews → exam practice). Nothing is hidden —
  // the "show the rest" control and the level filter below are untouched, and
  // the rule only reorders. It replaced `examFirstScenarios` on 2026-10-07, which
  // sorted on a field no row has and so fell back to alphabetical id order.
  const scenarios = journeyOrderedScenarios(useLiveQuery(() => db.scenarios.toArray()) || []);
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

  const xpRank = useMemo(() => rankFor(user?.totalXp ?? 0), [user?.totalXp]);
  const streakDays = user?.streakDays ?? 0;

  // Katzu's one-line welcome, restored from the old check-in card: the same
  // existing copy, now a single quiet line above the mission strip. The second
  // line (the card's old subtitle) stays dropped — one line, no card.
  const checkIn = useMemo(
    () =>
      user
        ? buildCheckInMessage({ lastActiveDate: user.lastActiveDate, streakDays: user.streakDays || 0 })
        : null,
    [user?.lastActiveDate, user?.streakDays],
  );

  // Katzu's one-line welcome, restored from the old check-in card: the same
  // existing copy, now a single quiet line above the mission strip. The second
  // line (the card's old subtitle) stays dropped — one line, no card.

  /**
   * The scenario card's status now comes from the capability model, so "done"
   * means a recorded unaided success — not merely opening the lesson or
   * answering one quiz. Tests pin those transitions.
   */
  const capabilityFor = (scenarioId: string) => capability.byScenario[scenarioId]?.state || 'NOT_STARTED';
  const isDone = (scenarioId: string) => {
    const state = capabilityFor(scenarioId);
    return state === 'INDEPENDENT' || state === 'RETAINED';
  };

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

  // The one mission action, shared by every mission kind so the screen keeps
  // exactly one primary button.
  const missionCta = (() => {
    if (mission.kind === 'review') {
      return (
        <Button variant="primary" size="sm" onClick={onOpenReview} className="shrink-0">
          <Brain className="h-3.5 w-3.5" aria-hidden />
          <span className="whitespace-nowrap">{mission.ctaAr}</span>
        </Button>
      );
    }
    if (mission.kind === 'no_content') {
      return (
        <Button variant="primary" size="sm" onClick={() => window.location.reload()} className="shrink-0">
          <span className="whitespace-nowrap">{mission.ctaAr}</span>
        </Button>
      );
    }
    if (missionScenarioId) {
      return (
        <Button
          variant="primary"
          size="sm"
          onClick={() => handleScenarioClick(missionScenarioId)}
          className="shrink-0"
        >
          <span className="whitespace-nowrap">{mission.ctaAr}</span>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        </Button>
      );
    }
    return null;
  })();

  const missionTitle =
    mission.kind === 'review' ? (
      <p className="font-arabic text-sm font-bold leading-snug text-text-primary">
        {arCount(dueCount, REVIEW_ITEM_FORMS)} للمراجعة
      </p>
    ) : mission.scenarioId && mission.titleDe ? (
      <GermanText className="block text-sm font-bold leading-snug text-text-primary">
        {mission.titleDe}
      </GermanText>
    ) : (
      <p className="font-arabic text-sm font-bold leading-snug text-text-primary">مهمتك اليومية قيد التجهيز</p>
    );

  const missionSubtitle = mission.kind === 'review' ? (
    <p className="text-sm font-arabic leading-relaxed text-text-secondary">{mission.subtitleAr}</p>
  ) : (
    <p className="line-clamp-2 text-sm font-arabic leading-relaxed text-text-secondary">
      <bdi dir="rtl">{mission.titleAr || mission.subtitleAr}</bdi>
    </p>
  );

  return (
    <div className="min-h-screen bg-black text-text-primary pb-28 pt-4 px-4 max-w-md mx-auto relative">
      {/* ---------------------------------------------------------------- *
       * HEADER — one row for identity, one for status.
       *
       * The old header put the streak, a "•" separator and the full rank name
       * on one line beside the name, which wrapped on a 360px phone and left
       * the separator orphaned. Now: avatar + name on the start side, the Pro
       * badge on the end side, then TWO chips that never wrap — a streak chip
       * and a rank pill carrying only «الرتبة N من M». The rank's name moved
       * into the rank card below, where it has room.
       * ---------------------------------------------------------------- */}
      <header className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <KatzuMascot name="avatar" className="h-10 w-10 shrink-0" />
            <h2 className="truncate text-base font-bold font-arabic leading-tight">
              {user?.displayName || 'مستكشف كَاتْزُو'}
            </h2>
          </div>
          {!isPro ? (
            <button
              onClick={onOpenSubscription}
              aria-label="اكتشف مزايا Pro"
              className="flex min-h-touch shrink-0 items-center gap-1.5 rounded-chip border border-primary/40 bg-primary/15 px-3 text-micro font-bold text-primary transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="whitespace-nowrap">اكتشف مزايا Pro</span>
            </button>
          ) : (
            <Badge variant="success" size="sm">
              Katzu Pro نشط
            </Badge>
          )}
        </div>

        {/* Two chips, each on one line. A zero-day streak is a GOAL, so it reads
            neutral grey; a live streak is the warm highlight. */}
        <div className="mt-2 flex items-center gap-2">
          <span
            data-testid="trail-streak-chip"
            className={`inline-flex min-h-touch items-center gap-1 whitespace-nowrap rounded-chip border px-2.5 font-arabic text-micro ${
              streakDays > 0
                ? 'border-status-learning/30 bg-status-learning/15 font-bold text-status-learning'
                : 'border-border-subtle bg-surface-subtle text-text-muted'
            }`}
          >
            <Flame
              className={`h-3.5 w-3.5 ${streakDays > 0 ? 'fill-learning text-learning' : 'text-text-muted'}`}
              aria-hidden
            />
            {streakDays} أيام حماس
          </span>
          <Badge variant="primary" size="sm" data-testid="trail-rank-pill">
            الرتبة {xpRank.rankNumber} من {xpRank.totalRanks}
          </Badge>
        </div>
      </header>

      {/* The greeting, one line: the same check-in copy the old card carried,
          kept only while it costs the path nothing (probe-pinned below). */}
      {checkIn && (
        <p
          data-testid="journey-greeting"
          className="mb-2 font-arabic text-sm leading-relaxed text-text-secondary"
        >
          {checkIn.headline}
        </p>
      )}

      {/* TODAY'S MISSION — one compact strip (≈88px). ONE primary action for today,
       * as before; it just no longer needs 200px to say it.
       * It used to be a 200px+ hero with a 96px mascot, a tag that repeated its
       * own title, a peach CTA that competed with the app's purple primary, and
       * a purple glow. Now: small mascot, one title, one subtitle, one primary
       * button, shared card material, no glow. Peach is gone — the Review
       * screen's own review CTA is the primary fill, so this one is too.
       * ---------------------------------------------------------------- */}
      <Card variant="card" className="mb-4 p-3">
        <div className="flex items-center gap-3">
          <KatzuMascot
            name={mission.kind === 'review' ? 'thumbs_up' : 'trail_header'}
            className="h-12 w-12 shrink-0"
          />
          <div className="min-w-0 flex-1">
            {mission.kind !== 'review' && (
              <Badge variant={mission.kind === 'no_content' ? 'subtle' : 'primary'} size="sm" className="mb-1">
                {missionStatusAr(mission.kind)}
              </Badge>
            )}
            {missionTitle}
            {missionSubtitle}
            {/* B6: the days-left line, only inside the last month of an exam, and
                never as a reason to skip the mission above it. */}
            {mission.countdownAr ? (
              <p data-testid="exam-countdown" className="mt-1 font-arabic text-micro text-status-warning">
                {mission.countdownAr}
              </p>
            ) : null}
            {mission.kind === 'no_content' && (
              <p className="mt-1 font-arabic text-micro leading-relaxed text-text-muted">
                يمكنك المتابعة بالمراجعة والتدريبات المتاحة على هذا الجهاز حتى يتوفر الاتصال.
              </p>
            )}
          </div>
          {missionCta}
        </div>
      </Card>

      {/* Learners whose profile predates onboarding are prompted once here —
          never redirected mid-task, and never asked twice after they answer. */}
      {user?.isLoggedIn && !user.onboardingCompletedAt && onOpenOnboarding && (
        <button
          onClick={onOpenOnboarding}
          className="mb-4 flex w-full min-h-touch items-center justify-between gap-3 rounded-panel border border-border-subtle bg-surface-card px-4 py-3 text-start transition-colors pointer-hover:border-primary/40"
        >
          <span className="min-w-0">
            <span className="block font-arabic text-sm font-bold text-text-primary">
              أكمل تفضيلاتك (30 ثانية)
            </span>
            <span className="mt-0.5 block font-arabic text-micro leading-relaxed text-text-secondary">
              يجعل المهمة اليومية أدق — ومستواك غير مقيس حتى تختاره.
            </span>
          </span>
          <ArrowLeft className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
        </button>
      )}

      {/* ---------------------------------------------------------------- *
       * RANK CARD — collapsed to ~72px: name, the XP line, one full-width bar.
       *
       * The bar used to be a 6px sliver inside a paragraph of greeting copy,
       * with the XP label rendered as «XP 325 للرتبة التالية» — the number and
       * its unit were split by the bidi algorithm. The label now isolates
       * «325 XP» in a <bdi dir="ltr">, so it reads in the intended order, and
       * the number sits directly above a bar the eye can actually follow.
       * ---------------------------------------------------------------- */}
      <Card variant="card" className="mb-4 p-3" data-testid="trail-rank-card">
        <div className="flex items-center gap-3">
          <KatzuMascot name="peace" className="h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-arabic text-sm font-bold text-text-primary">
                {xpRank.rank.nameAr}
              </span>
              {xpRank.next ? (
                <span className="shrink-0 whitespace-nowrap font-arabic text-micro text-text-secondary">
                  <bdi dir="ltr">{xpRank.xpToNext} XP</bdi> للرتبة التالية
                </span>
              ) : (
                <span className="shrink-0 font-arabic text-micro text-text-secondary">أعلى رتبة</span>
              )}
            </div>
            <div
              className="mt-2 h-[7px] w-full overflow-hidden rounded-full bg-surface-subtle"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={xpRank.progressPercent}
              aria-label={`التقدم نحو ${xpRank.next ? xpRank.next.nameAr : 'أعلى رتبة'}`}
            >
              <div
                className="h-full w-full rounded-full bg-primary origin-right transition-transform duration-panels ease-out"
                style={{ transform: `scaleX(${xpRank.progressPercent / 100})` }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* CEFR level tabs — the same segmented shape as the Practice filters:
          44px targets, the chip radius, `fill` for the selected segment. The
          selected pill's glow is gone; the one glow on this screen belongs to
          the current path node. */}
      <div className="mb-4 flex items-center justify-between gap-2 rounded-panel border border-border-subtle bg-surface-card p-1.5">
        {levels.map((lvl) => {
          const isLvlLocked = levelLocked(lvl);
          return (
            <button
              key={lvl}
              onClick={() => handleLevelSelect(lvl)}
              className={`flex min-h-touch flex-1 items-center justify-center gap-1 rounded-chip py-2 font-german text-xs font-bold transition-colors ${
                selectedLevel === lvl
                  ? 'bg-fill text-on-fill'
                  : 'text-text-secondary pointer-hover:text-text-primary'
              }`}
            >
              <span>{lvl}</span>
              {isLvlLocked && <Lock className="h-3 w-3 text-text-muted" aria-hidden />}
            </button>
          );
        })}
      </div>

      {/* ---------------------------------------------------------------- *
       * THE PATH — one column, a hairline on the start edge, one node per card.
       * ---------------------------------------------------------------- */}
      <ol className="relative space-y-4" data-testid="trail-path">
        {/* The timeline: inside the node gutter only, so it can never cross a
            card. `start` is the right edge in RTL. */}
        <div
          aria-hidden
          className="absolute bottom-3 top-3 w-[2px] bg-border-subtle start-[19px]"
        />

        {scenarios.slice(0, showAllScenarios ? undefined : TRAIL_PREVIEW_COUNT).map((scenario: ScenarioEntity, index) => {
          const state = capabilityFor(scenario.id);
          const done = isDone(scenario.id);
          const current = !done && scenario.id === missionScenarioId;
          const scene = sceneFor({
            id: scenario.id,
            category: scenario.category,
            bannerUrl: scenario.banner_url,
          });

          return (
            <li key={scenario.id} className="relative flex items-stretch gap-3">
              {/* Node gutter. The node is the state marker; the line runs behind
                  it and stops at the gutter's edge. */}
              <div className="relative z-10 flex w-10 shrink-0 items-center justify-center">
                <span
                  data-testid={`trail-node-${state}`}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                    done
                      ? 'border-transparent bg-fill text-on-fill'
                      : current
                        ? 'border-primary bg-black'
                        : 'border-border-subtle bg-surface-subtle'
                  }`}
                >
                  {done ? (
                    <Check className="h-4 w-4" aria-hidden />
                  ) : current ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
                  ) : null}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleScenarioClick(scenario.id)}
                aria-label={`${scenario.title_ar} (${scenario.title_de})`}
                className={`flex min-h-touch flex-1 flex-col overflow-hidden rounded-panel border bg-surface-card text-start transition-[background-color,border-color,box-shadow] ${
                  current
                    ? 'border-primary/60 shadow-glow-purple'
                    : done
                      ? 'border-status-success/40 pointer-hover:border-status-success/60'
                      : 'border-border-subtle pointer-hover:border-primary/50'
                }`}
              >
                {/* Every card now leads with its own 16:9 banner, full width.
                    WHY THIS REVERSED
                    The card used to render a 96px thumbnail only when the
                    scenario had artwork, and nothing at all otherwise — a
                    compact-text card for the art-less majority. That made the
                    list two different products side by side, and made the
                    situations a learner cannot yet read (the ones with no art)
                    the hardest to recognise, which is exactly backwards: the
                    banner is what says "this is a bakery" before any German is
                    read.
                    The floor is not a broken frame — `sceneFor` always returns
                    usable scene lighting, so an art-less scenario shows a lit
                    16:9 scene rather than a grey box (see ScenarioBanner).
                    The first card loads eagerly: it is above the fold, and lazy
                    there costs a visible pop-in on the screen's hero. */}
                <ScenarioBanner scene={scene} loading={index === 0 ? 'eager' : 'lazy'} className="shrink-0" />

                <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={done ? 'success' : 'subtle'} size="sm">
                      {PATH_CHIP_LABEL_AR[state]}
                    </Badge>
                    <Play className="h-3.5 w-3.5 text-text-muted" aria-hidden />
                  </div>
                  {/* The headline is the Arabic title, and the German is the
                      label underneath.
                      WHY
                      The card's biggest line used to be German (`title_de`,
                      bold, primary) with the Arabic as a smaller grey line.
                      Katzu teaches German TO Arabic speakers, and the learner
                      is choosing a situation, not reading a sentence: «عند
                      الخبّاز» is a decision they can make at a glance, while
                      «Beim Bäcker einkaufen» is homework for a word they have
                      not learned yet. The German stays — one line, beneath, as
                      the thing they are about to learn. */}
                  <p className="font-arabic text-base font-bold leading-snug text-text-primary">
                    {/* The Arabic title can carry Latin parentheses («(أسلوب
                        الامتحان)»); the <bdi dir="rtl"> keeps them on the RTL base
                        direction so they mirror the way Arabic reads them. */}
                    <bdi dir="rtl">{scenario.title_ar}</bdi>
                  </p>
                  <GermanText className="line-clamp-1 block text-xs leading-snug text-text-secondary">
                    {scenario.title_de}
                  </GermanText>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {/* The one obvious thing left to do on a wall of cards. */}
      {!showAllScenarios && scenarios.length > TRAIL_PREVIEW_COUNT && (
        <GlassButton
          variant="secondary"
          fullWidth
          onClick={() => setShowAllScenarios(true)}
          className="mt-4 justify-center"
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
