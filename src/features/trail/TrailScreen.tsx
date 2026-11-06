import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { refreshCurriculumCache } from '@/lib/api/workerClient';
import { arCount } from '@/lib/i18n/arabicCount';
import { GlassButton } from '@/components/glass/GlassButton';
import { Button } from '@/components/ui/Button';
import { isProEffective } from '@/lib/utils/subscription';
import { FREE_LEVEL, isLevelFree, servedLevel } from '@/lib/entitlement/trial';
import { journeyOrderedScenarios } from '@/lib/content/scenarioOrder';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { LtrCounter } from '@/components/common/LtrCounter';
import { ScenarioBanner } from '@/components/glass/ScenarioBanner';
import { sceneFor } from '@/lib/design/scenes';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import { track } from '@/lib/analytics/client';
import type { CEFRLevel, CapabilityState, ScenarioEntity } from '@/types/models';
import { Check, Lock, ArrowLeft, Brain, Flame, Sparkles, X, Clock } from 'lucide-react';
import { countDue } from '@/lib/srs/engine';
import { selectDailyMission, type ScenarioLevelIndex } from '@/lib/mission/selectMission';
import { reviewBacklog, reviewMinutes, scenarioMinutes, REVIEW_SESSION_CAP } from '@/lib/mission/scenarioMinutes';
import { isSameLocalDay } from '@/lib/progress/dailyXp';
import {
  CAPABILITY_LABEL_AR,
  buildCapabilityModel,
} from '@/lib/capability/model';

/** V32: how many situations the roadmap shows before the learner asks for more. */
const TRAIL_PREVIEW_COUNT = 5;
const MORE_FORMS = { one: 'مشهد واحد', two: 'مشهدان', few: 'مشاهد', many: 'مشهداً' } as const;
/** V31: agreement for the review strip's title. See `arabicCount`. */
const REVIEW_ITEM_FORMS = { one: 'عنصر', two: 'عنصران', few: 'عناصر', many: 'عنصراً' } as const;
const SITUATION_FORMS = { one: 'موقف واحد', two: 'موقفان', few: 'مواقف', many: 'موقفاً' } as const;

/**
 * The four levels this screen renders. A0 exists in the product (a learner can
 * be measured at A0), but it is not a bar destination: the journey is shown at
 * the level the server serves, and A0 content is reached through the mission.
 */
type BarLevel = 'A1' | 'A2' | 'B1' | 'B2';
const BAR_LEVELS: BarLevel[] = ['A1', 'A2', 'B1', 'B2'];

/**
 * One plain-language ability line per level. This is the promise the situations
 * below deliver on — the old tabs carried a level code and nothing else, so a
 * learner had no way to know what "B1" would let them do.
 *
 * Owner approval pending (see OWNER INPUT NEEDED in the hand-off).
 */
const LEVEL_ABILITY_AR: Record<'A1' | 'A2' | 'B1' | 'B2', string> = {
  A1: 'أتدبّر أمري في ألمانيا',
  A2: 'أتحرّك في يومي بثقة',
  B1: 'أتعامل مع المواقف الرسمية والعمل',
  B2: 'أتحدّث بطلاقة في العمل والدراسة',
};

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

/** One stage of the three-step mastery marker on a compact card. */
const MasteryStage: React.FC<{ done: boolean; label: string }> = ({ done, label }) => (
  <span
    className={`inline-flex items-center gap-1 ${
      done ? 'font-bold text-status-success' : 'text-text-muted'
    }`}
  >
    {done ? (
      <Check className="h-3 w-3 shrink-0" aria-hidden />
    ) : (
      <span className="h-3 w-3 shrink-0 rounded-full border border-current" aria-hidden />
    )}
    {label}
  </span>
);

/**
 * The path — one page that answers «what do I do now?».
 *
 * The previous screen asked the learner to hold four competing stories at once:
 * a rank bar, a separate CEFR tab strip, a mission strip, and a review chip, all
 * above the fold, with three-digit review counts and full-width banners pushing
 * the situations off screen. This version keeps every rule and every piece of
 * data, and changes what is visible:
 *
 *   header        identity + today's goal ring (streak only when it exists)
 *   ONE CTA       «تابع: [scenario] · [N] دقائق»
 *   review row    secondary, capped at ten items, backlog in small text
 *   level card    one progression system (CEFR), with ability and count left
 *   level bar     sticky A1/A2/B1/B2; locked levels say why
 *   cards         compact 64px thumbnail, Arabic title, German subtitle,
 *                 duration, and a three-stage evidence marker
 *
 * Rank and XP moved to the profile, and a rank-up is celebrated after the
 * session that earned it — so the path has one progression system, not two.
 */
export const TrailScreen: React.FC<TrailScreenProps> = ({
  onSelectScenario,
  onOpenSubscription,
  onOpenReview,
  onOpenOnboarding,
}) => {
  const [selectedLevel, setSelectedLevel] = useState<BarLevel>('A1');
  const [levelChosen, setLevelChosen] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showAllScenarios, setShowAllScenarios] = useState(false);
  const [paywallReason, setPaywallReason] = useState({ title: '', description: '' });

  const user = useLiveQuery(() => db.users.get('current_user'));
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

  // ONE action for today, chosen by the tested selector. Review is deliberately
  // removed from the selector's input here: it has its own secondary row, and
  // the primary action must always name a situation the learner can picture.
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
        reviewItems: [],
        scenarioLevels,
        weakestSkill: null,
        completedScenarioIds: sessions.map((session) => session.scenarioId),
        dailyMinutes: user?.dailyGoalMinutes,
        targetDate: user?.targetDate,
        targetDateKind: user?.targetDateKind,
      }),
    [
      episodeLevel,
      user?.primaryGoal,
      user?.dailyGoalMinutes,
      user?.targetDate,
      user?.targetDateKind,
      scenarios,
      trainingRecords,
      scenarioLevels,
      sessions,
    ],
  );

  const streakDays = user?.streakDays ?? 0;
  const goalMinutes = user?.dailyGoalMinutes ?? 15;

  // Today's minutes, from recorded sessions only — never a timer that runs
  // while the app is open.
  const todayMinutes = useMemo(
    () =>
      sessions.reduce(
        (total, session) =>
          session?.timestamp && isSameLocalDay(session.timestamp, Date.now())
            ? total + Math.round((session.durationSeconds || 0) / 60)
            : total,
        0,
      ),
    [sessions],
  );
  const goalPercent = goalMinutes > 0 ? Math.min(100, Math.round((todayMinutes / goalMinutes) * 100)) : 0;

  /** A completed unaided conversation, per the capability model. */
  const isDone = (scenarioId: string) => {
    const state = capability.byScenario[scenarioId]?.state || 'NOT_STARTED';
    return state === 'INDEPENDENT' || state === 'RETAINED';
  };

  // The pills start on the level the mission is served at (never silently A1),
  // and a deliberate tap wins from then on. A0 is served but not a bar
  // destination, so it maps to the first rendered level.
  useEffect(() => {
    if (!levelChosen && user?.cefrLevel) {
      setSelectedLevel(BAR_LEVELS.find((lvl) => lvl === episodeLevel) || 'A1');
    }
  }, [user?.cefrLevel, levelChosen, episodeLevel]);

  const levelLocked = (lvl: CEFRLevel) => !isLevelFree(lvl, isPro);

  // The path is filtered by the chosen level using the real content index; a
  // scenario with no index yet stays listed, so a loading catalog never looks
  // empty.
  const pathScenarios = useMemo(
    () => scenarios.filter((s) => !scenarioLevels[s.id] || scenarioLevels[s.id].includes(selectedLevel)),
    [scenarios, scenarioLevels, selectedLevel],
  );

  const handleLevelSelect = (lvl: BarLevel) => {
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

  const handleScenarioClick = (scenarioId: string, level: CEFRLevel = selectedLevel) => {
    track('scenario_started', { scenarioId, source: 'trail' });
    if (levelLocked(level)) {
      setPaywallReason({
        title: `مستوى ${level} يُفتح مع Pro`,
        description: `في الخطة المجانية تتدرب على مستوى ${FREE_LEVEL}. Pro يفتح كل المستويات من A0 إلى B2 لمتابعة ما بعدها.`,
      });
      setShowPaywall(true);
      return;
    }
    onSelectScenario(scenarioId);
  };

  const primaryScenarioId = mission.scenarioId;
  const primaryTitle =
    mission.titleAr || scenarios.find((scenario) => scenario.id === primaryScenarioId)?.title_ar || '';
  const primaryMinutes = scenarioMinutes(episodeLevel);
  const hasPrimaryScenario = Boolean(primaryScenarioId);

  const handlePrimary = () => {
    if (primaryScenarioId) {
      handleScenarioClick(primaryScenarioId, episodeLevel);
      return;
    }
    void refreshCurriculumCache();
  };

  const reviewLabel =
    dueCount > 0
      ? `مراجعة سريعة: ${arCount(Math.min(dueCount, REVIEW_SESSION_CAP), REVIEW_ITEM_FORMS)} · ${reviewMinutes(
          dueCount,
        )} دقائق`
      : '';
  const backlog = reviewBacklog(dueCount);

  const doneCount = pathScenarios.filter((scenario) => isDone(scenario.id)).length;
  const levelPercent = pathScenarios.length ? Math.round((doneCount / pathScenarios.length) * 100) : 0;
  const remaining = Math.max(0, pathScenarios.length - doneCount);
  const nextLevel = BAR_LEVELS[BAR_LEVELS.indexOf(selectedLevel) + 1];
  const nextIsLocked = Boolean(nextLevel && levelLocked(nextLevel));

  const trainingByScenario = useMemo(() => {
    const map = new Map<string, (typeof trainingRecords)[number]>();
    for (const record of trainingRecords) map.set(record.scenarioId, record);
    return map;
  }, [trainingRecords]);

  const sessionScenarioIds = useMemo(
    () => new Set(sessions.map((session) => session.scenarioId)),
    [sessions],
  );

  const ringRadius = 18;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    <div className="min-h-screen bg-black text-text-primary pb-28 pt-4 px-4 max-w-md mx-auto relative">
      {/* ---------------------------------------------------------------- *
       * HEADER — who you are, how today is going, nothing else.
       * ---------------------------------------------------------------- */}
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <KatzuMascot name="avatar" className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold font-arabic leading-tight">
              {user?.displayName || 'مستكشف كَاتْزُو'}
            </h2>
            {streakDays > 0 ? (
              <span
                data-testid="trail-streak-chip"
                className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap font-arabic text-micro font-bold text-status-learning"
              >
                <Flame className="h-3 w-3 fill-learning text-learning" aria-hidden />
                {arCount(streakDays, { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يوماً' })} متتابعة
              </span>
            ) : (
              <span
                data-testid="trail-streak-chip"
                className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap font-arabic text-micro text-text-muted"
              >
                ابدأ سلسلتك اليوم
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isPro ? (
            <button
              onClick={onOpenSubscription}
              aria-label="اكتشف مزايا Pro"
              className="flex min-h-touch items-center gap-1 rounded-chip border border-border-subtle bg-surface-subtle px-2.5 font-arabic text-micro font-bold text-text-secondary transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="whitespace-nowrap">Pro</span>
            </button>
          ) : (
            <Badge variant="success" size="sm">
              Katzu Pro
            </Badge>
          )}

          {/* The daily-goal ring replaces the old numeric streak chip's partner:
              one glance says whether today is done, and the label underneath is
              the exact fraction, so nothing is a guess. */}
          <div
            data-testid="trail-goal-ring"
            role="img"
            aria-label={`هدف اليوم: ${todayMinutes} من ${goalMinutes} دقيقة`}
            className="relative h-11 w-11 shrink-0"
          >
            <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90" aria-hidden>
              <circle
                cx="22"
                cy="22"
                r={ringRadius}
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-surface-subtle"
              />
              <circle
                cx="22"
                cy="22"
                r={ringRadius}
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringCircumference * (1 - goalPercent / 100)}
                className="text-primary transition-[stroke-dashoffset] duration-panels ease-out motion-reduce:transition-none"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-german text-micro font-bold text-text-primary">
              <LtrCounter value={todayMinutes} total={goalMinutes} />
            </span>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- *
       * ONE PRIMARY ACTION. Everything else on this screen is secondary.
       * ---------------------------------------------------------------- */}
      <Button
        variant="primary"
        size="md"
        fullWidth
        data-testid="trail-primary-cta"
        onClick={handlePrimary}
        className="mb-2 min-h-[56px] justify-between px-4"
      >
        {hasPrimaryScenario ? (
          <>
            <span className="min-w-0 truncate text-start font-arabic text-sm font-bold">
              تابع: {primaryTitle} · {primaryMinutes} دقائق
            </span>
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          </>
        ) : (
          <>
            <span className="font-arabic text-sm font-bold">حدّث المشاهد للمتابعة</span>
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          </>
        )}
      </Button>

      {/* THE SECONDARY REVIEW ROW — capped at ten items. The backlog is context,
          not a button label, so the action never carries three digits. */}
      {dueCount > 0 ? (
        <div className="mb-4">
          <Button
            variant="secondary"
            size="md"
            fullWidth
            data-testid="trail-review-row"
            onClick={onOpenReview}
            className="justify-between px-4"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Brain className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="truncate font-arabic text-xs font-bold">{reviewLabel}</span>
            </span>
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
          {backlog > 0 && (
            <p className="mt-1 text-end font-arabic text-micro text-text-muted">
              +{backlog} في الانتظار
            </p>
          )}
        </div>
      ) : (
        <p className="mb-4 font-arabic text-micro text-text-muted">
          لا مراجعة مستحقة الآن — وقتك للمشهد التالي.
        </p>
      )}

      {/* ---------------------------------------------------------------- *
       * THE ONE PROGRESSION SYSTEM — CEFR, with a sticky jump bar.
       * ---------------------------------------------------------------- */}
      <div
        data-testid="trail-level-bar"
        className="sticky top-0 z-20 -mx-4 mb-3 border-b border-border-subtle bg-black/95 px-4 py-2 backdrop-blur"
      >
        <div className="flex items-center gap-1 rounded-panel border border-border-subtle bg-surface-card p-1">
          {BAR_LEVELS.map((lvl) => {
            const locked = levelLocked(lvl);
            const active = selectedLevel === lvl;
            return (
              <button
                key={lvl}
                onClick={() => handleLevelSelect(lvl)}
                aria-pressed={active}
                aria-label={`المستوى ${lvl}${locked ? ' — يُفتح مع Pro' : ''}`}
                className={`flex min-h-touch flex-1 items-center justify-center gap-1 rounded-chip py-2 font-german text-xs font-bold transition-colors ${
                  active
                    ? 'bg-fill text-on-fill'
                    : locked
                      ? 'text-text-muted'
                      : 'text-text-secondary pointer-hover:text-text-primary'
                }`}
              >
                <span>{lvl}</span>
                {locked && <Lock className="h-3 w-3" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      <Card className="mb-4 p-3" data-testid="trail-level-card">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0">
            <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90" aria-hidden>
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" className="text-surface-subtle" />
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 20}
                strokeDashoffset={2 * Math.PI * 20 * (1 - levelPercent / 100)}
                className="text-primary transition-[stroke-dashoffset] duration-panels ease-out motion-reduce:transition-none"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-german text-micro font-bold text-text-primary">
              {levelPercent}%
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-arabic text-sm font-bold leading-snug text-text-primary">
              <span className="font-german">{selectedLevel}</span> · {LEVEL_ABILITY_AR[selectedLevel]}
            </p>
            <p className="mt-1 font-arabic text-micro leading-relaxed text-text-secondary">
              {remaining === 0
                ? 'أكملت مواقف هذا المستوى — إلى الذي بعده.'
                : `${arCount(remaining, SITUATION_FORMS)} للمستوى التالي`}
            </p>
          </div>
        </div>

        {nextLevel && nextIsLocked && (
          <p className="mt-2 flex items-center gap-1.5 font-arabic text-micro text-text-muted">
            <Lock className="h-3 w-3 shrink-0" aria-hidden />
            <span>
              <bdi>{nextLevel}</bdi> · {LEVEL_ABILITY_AR[nextLevel]} — يُفتح مع Pro
            </span>
          </p>
        )}
      </Card>

      {/* ---------------------------------------------------------------- *
       * THE PATH — compact, recognisable cards. No side timeline: the states
       * now live on the card itself (badge + three evidence markers).
       * ---------------------------------------------------------------- */}
      <ol className="space-y-2" data-testid="trail-path">
        {pathScenarios.slice(0, showAllScenarios ? undefined : TRAIL_PREVIEW_COUNT).map((scenario: ScenarioEntity) => {
          const state = capability.byScenario[scenario.id]?.state || 'NOT_STARTED';
          const done = isDone(scenario.id);
          const current = !done && scenario.id === primaryScenarioId;
          const training = trainingByScenario.get(scenario.id);
          const studied = Boolean(training?.studiedAt) || sessionScenarioIds.has(scenario.id);
          const withHelp =
            studied || Boolean(training?.quizAttempted) || state === 'PRACTISING' || state === 'INDEPENDENT' || state === 'RETAINED';
          const scene = sceneFor({
            id: scenario.id,
            category: scenario.category,
            bannerUrl: scenario.banner_url,
          });
          const badge = current ? 'التالي' : state === 'NOT_STARTED' ? 'جديد' : PATH_CHIP_LABEL_AR[state];

          return (
            <li key={scenario.id}>
              <button
                type="button"
                onClick={() => handleScenarioClick(scenario.id)}
                aria-label={`${scenario.title_ar} (${scenario.title_de})`}
                data-testid="trail-scenario-card"
                className={`flex min-h-touch w-full items-center gap-3 overflow-hidden rounded-control border bg-surface-card p-2.5 text-start transition-[background-color,border-color] ${
                  current
                    ? 'border-primary/60'
                    : done
                      ? 'border-status-success/40 pointer-hover:border-status-success/60'
                      : 'border-border-subtle pointer-hover:border-primary/50'
                }`}
              >
                <ScenarioBanner
                  scene={scene}
                  loading="lazy"
                  className="h-16 w-16 shrink-0 rounded-control"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-arabic text-sm font-bold leading-snug text-text-primary">
                      <bdi dir="rtl">{scenario.title_ar}</bdi>
                    </p>
                    <Badge variant={current ? 'primary' : done ? 'success' : 'subtle'} size="sm" className="shrink-0">
                      {badge}
                    </Badge>
                  </div>

                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <GermanText className="line-clamp-1 block min-w-0 text-xs leading-snug text-text-secondary">
                      {scenario.title_de}
                    </GermanText>
                    <span className="inline-flex shrink-0 items-center gap-1 font-arabic text-micro text-text-muted">
                      <Clock className="h-3 w-3" aria-hidden />
                      {scenarioMinutes(selectedLevel)} دقائق
                    </span>
                  </div>

                  <div
                    data-testid="trail-mastery"
                    className="mt-1.5 flex items-center gap-2.5 font-arabic text-micro leading-none"
                  >
                    <MasteryStage done={studied} label="دراسة" />
                    <MasteryStage done={withHelp} label="مع مساعدة" />
                    <MasteryStage done={done} label="وحدك" />
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {pathScenarios.length === 0 && (
        <p className="mt-4 text-center font-arabic text-sm text-text-secondary" role="status">
          لا توجد مشاهد على مستوى {selectedLevel} بعد.
        </p>
      )}

      {!showAllScenarios && pathScenarios.length > TRAIL_PREVIEW_COUNT && (
        <GlassButton
          variant="secondary"
          fullWidth
          onClick={() => setShowAllScenarios(true)}
          className="mt-3 justify-center"
        >
          <span className="font-arabic">اعرض بقية المشاهد</span>
          <span className="kz-ar-micro font-german text-kz-inkFaint">
            ({arCount(pathScenarios.length - TRAIL_PREVIEW_COUNT, MORE_FORMS)})
          </span>
        </GlassButton>
      )}

      {/* Learners whose profile predates onboarding are prompted once here —
          after the path, so it never pushes a situation below the fold. The X
          persists the dismissal on the user row. */}
      {user?.isLoggedIn && !user.onboardingCompletedAt && !user.onboardingPromptDismissedAt && onOpenOnboarding && (
        <div className="relative mt-4">
          <button
            onClick={onOpenOnboarding}
            className="flex w-full min-h-touch items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface-card px-4 py-3 text-start transition-colors pointer-hover:border-primary/40"
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
          <button
            onClick={() => void db.users.update('current_user', { onboardingPromptDismissedAt: Date.now() })}
            aria-label="إخفاء هذا التنبيه"
            className="absolute top-1.5 end-1.5 flex min-h-touch min-w-touch items-center justify-center rounded-full text-text-secondary pointer-hover:bg-surface-raised"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

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
