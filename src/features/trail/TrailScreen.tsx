import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { refreshCurriculumCache } from '@/lib/api/workerClient';
import { arCount } from '@/lib/i18n/arabicCount';
import { Button } from '@/components/ui/Button';
import { isProEffective } from '@/lib/utils/subscription';
import { FREE_LEVEL, isLevelFree, servedLevel } from '@/lib/entitlement/trial';
import { journeyOrderedScenarios } from '@/lib/content/scenarioOrder';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { LtrCounter } from '@/components/common/LtrCounter';
import { Card } from '@/components/ui/Card';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import { track } from '@/lib/analytics/client';
import type { CEFRLevel, ScenarioEntity } from '@/types/models';
import {
  ArrowLeft,
  Brain,
  Check,
  ChevronDown,
  Clock,
  Compass,
  Flame,
  GraduationCap,
  KeyRound,
  Lock,
  MessagesSquare,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { countDue } from '@/lib/srs/engine';
import {
  reviewBacklog,
  reviewMinutes,
  scenarioMinutes,
  REVIEW_SESSION_CAP,
} from '@/lib/mission/scenarioMinutes';
import { isSameLocalDay } from '@/lib/progress/dailyXp';
import { buildCapabilityModel } from '@/lib/capability/model';
import { unitForScenario, unitGoalForLearnerGoal, type UnitLevel } from '@/lib/units/units';
import {
  STAGE_LABEL_AR,
  buildUnitProgress,
  composeSession,
  recommendScenario,
  type LearnerEvidence,
  type SessionStep,
} from '@/lib/units/progress';

/** V31: agreement for the review strip's title. See `arabicCount`. */
const REVIEW_ITEM_FORMS = { one: 'عنصر', two: 'عنصران', few: 'عناصر', many: 'عنصراً' } as const;

/**
 * The four levels this screen renders. A0 exists in the product (a learner can
 * be measured at A0) and stays served, but it has no bar of its own: an A0
 * learner meets the A1 units, which is where the content starts.
 */
type ShownLevel = 'A1' | 'A2' | 'B1' | 'B2';
const SHOWN_LEVELS: ShownLevel[] = ['A1', 'A2', 'B1', 'B2'];

/**
 * One plain-language ability line per level — the owner-approved copy, verbatim.
 * This is the promise the units below deliver on. No fluency, certificate or
 * speed promise is made here.
 */
const LEVEL_ABILITY_AR: Record<ShownLevel, string> = {
  A1: 'أتصرّف في المواقف اليومية',
  A2: 'أتحرّك في يومي بثقة',
  B1: 'أتعامل مع المواقف الرسمية والعمل',
  B2: 'أتحدّث عن الدراسة والعمل بثقة',
};

/** The free trial's shape, mirrored for display only — the server owns the count. */
const FREE_SESSION_TOTAL = 3;

/**
 * A category icon tile, tinted from one palette per category.
 *
 * The old card used the scene's blurred gradient artwork as a thumbnail. At
 * 64px the gradient read as a smudge rather than a place, and two scenarios in
 * different categories could look identical. A flat tinted glyph is the same
 * width, is recognisable before the title is read, and costs no image request.
 */
const CATEGORY_VISUALS: Array<{
  keys: string[];
  Icon: typeof Compass;
  tint: string;
}> = [
  { keys: ['health', 'arzt', 'doctor', 'apotheke', 'zahn', 'kranken'], Icon: ShieldCheck, tint: 'bg-status-success/10 text-status-success' },
  { keys: ['travel', 'transport', 'station', 'airport', 'train', 'flight'], Icon: Compass, tint: 'bg-primary/10 text-primary' },
  { keys: ['housing', 'wohnung', 'apartment', 'home', 'miet'], Icon: KeyRound, tint: 'bg-status-learning/10 text-status-learning' },
  { keys: ['work', 'job', 'career', 'office', 'interview', 'ausbildung', 'betrieb'], Icon: UserCheck, tint: 'bg-status-info/10 text-status-info' },
  { keys: ['official', 'document', 'visa', 'behoerde', 'amt', 'anmeldung'], Icon: ScrollText, tint: 'bg-status-info/10 text-status-info' },
  { keys: ['exam', 'study', 'school', 'university', 'berufsschule', 'pruefung'], Icon: GraduationCap, tint: 'bg-primary/10 text-primary' },
  { keys: ['food', 'cafe', 'shop', 'bakery', 'supermarket', 'daily'], Icon: ShoppingCart, tint: 'bg-status-learning/10 text-status-learning' },
];

function visualFor(category: string | undefined) {
  const value = String(category || '').toLowerCase();
  for (const entry of CATEGORY_VISUALS) {
    if (entry.keys.some((key) => value.includes(key))) return entry;
  }
  return { keys: [], Icon: MessagesSquare, tint: 'bg-surface-subtle text-text-secondary' };
}

/** One stage of the three-step mastery marker on a compact card. */
const MasteryStage: React.FC<{ done: boolean; label: string }> = ({ done, label }) => (
  <span
    className={`inline-flex items-center gap-1 ${
      done ? 'font-bold text-primary' : 'text-text-muted'
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

function stepTitle(step: SessionStep): string {
  if (step.kind === 'review') return step.titleAr;
  return `${step.titleAr} · ${STAGE_LABEL_AR[step.stage as keyof typeof STAGE_LABEL_AR]}`;
}

export interface TrailScreenProps {
  onSelectScenario: (scenarioId: string) => void;
  onOpenSubscription: () => void;
  onOpenReview: () => void;
  /** Opens the preference editor; omitted only in tests/stories. */
  onOpenOnboarding?: () => void;
}

/**
 * The path — one vertical unit map that answers «what do I do now?».
 *
 * The learner never chooses a level or a mode. The recommendation walks the
 * units in order (continuing anything already begun, checkpoints last), the
 * current unit is open, finished and next units show «3 من 6», and everything
 * further out is dimmed without becoming a second decision.
 *
 *   header        identity + today's goal ring (streak only when it exists)
 *   ONE CTA       «ابدأ جلسة اليوم» / «تابع» with the composed session preview
 *   free tier     «جلسة مجانية N من 3» — one honest line, never a countdown
 *   review row    secondary, capped at ten items, backlog in small text
 *   level card    one progression system, ability line, percent ring
 *   unit map      current unit expanded, others collapsed, future ones locked
 *   cards         tinted category glyph, Arabic title, German subtitle,
 *                 and a three-stage evidence marker (دراسة · مع مساعدة · وحدك)
 *
 * Rank and XP live on the profile; the path carries one progression story.
 */
export const TrailScreen: React.FC<TrailScreenProps> = ({
  onSelectScenario,
  onOpenSubscription,
  onOpenReview,
  onOpenOnboarding,
}) => {
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState({ title: '', description: '' });

  const user = useLiveQuery(() => db.users.get('current_user'));
  const scenarios = journeyOrderedScenarios(useLiveQuery(() => db.scenarios.toArray()) || []);
  const trainingRecords = useLiveQuery(() => db.scenario_training.toArray()) || [];
  const reviewItems = useLiveQuery(() => db.review_items.toArray()) || [];
  const mistakes = useLiveQuery(() => db.mistakes.toArray()) || [];
  const sessions = useLiveQuery(() => db.sessions.toArray()) || [];

  const dueCount = useMemo(() => countDue(reviewItems, Date.now()), [reviewItems]);

  const isPro = isProEffective(user);
  const learnerLevel: CEFRLevel = user?.cefrLevel || 'A1';
  const episodeLevel = servedLevel(learnerLevel, isPro);
  const unitGoal = unitGoalForLearnerGoal(user?.primaryGoal);
  const shownLevel: ShownLevel = (SHOWN_LEVELS as string[]).includes(episodeLevel)
    ? (episodeLevel as ShownLevel)
    : 'A1';

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

  const sessionScenarioIds = useMemo(
    () => new Set(sessions.map((session) => session.scenarioId)),
    [sessions],
  );

  /** A completed unaided conversation, per the capability model. */
  const isDone = (scenarioId: string) => {
    const state = capability.byScenario[scenarioId]?.state || 'NOT_STARTED';
    return state === 'INDEPENDENT' || state === 'RETAINED';
  };

  // The only inputs the recommendation reads. Everything here is recorded
  // evidence: a studied row, a conversation, a completed scene — never a mode
  // the learner picked from a menu.
  const evidence = useMemo<LearnerEvidence>(() => {
    const completed = new Set<string>();
    const studied = new Set<string>();
    const practised = new Set<string>();

    for (const scenario of scenarios) {
      if (isDone(scenario.id)) completed.add(scenario.id);
    }
    for (const record of trainingRecords) {
      if (record.studiedAt) studied.add(record.scenarioId);
      if (record.quizAttempted) practised.add(record.scenarioId);
    }
    for (const session of sessions) {
      studied.add(session.scenarioId);
      practised.add(session.scenarioId);
    }
    for (const [scenarioId, entry] of Object.entries(capability.byScenario)) {
      if (entry.state === 'PRACTISING' || entry.state === 'INDEPENDENT' || entry.state === 'RETAINED') {
        practised.add(scenarioId);
      }
    }

    const started = new Set<string>([...studied, ...practised]);
    return {
      completedIds: [...completed],
      startedIds: [...started],
      studiedIds: [...studied],
      practisedIds: [...practised],
    };
    // `isDone` is derived from `capability`; listing it here would re-run on
    // every identity change of the same data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarios, trainingRecords, sessions, capability]);

  const recommendation = useMemo(
    () => recommendScenario({ level: episodeLevel, goal: unitGoal, evidence, lastEase: user?.lastSessionEase ?? null }),
    [episodeLevel, unitGoal, evidence, user?.lastSessionEase],
  );

  const titles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const scenario of scenarios) map[scenario.id] = scenario.title_ar;
    return map;
  }, [scenarios]);

  const sessionPlan = useMemo(
    () =>
      composeSession({
        level: episodeLevel,
        goal: unitGoal,
        evidence,
        lastEase: user?.lastSessionEase ?? null,
        dueReviewCount: dueCount,
        titles,
      }),
    [episodeLevel, unitGoal, evidence, user?.lastSessionEase, dueCount, titles],
  );

  const unitProgress = useMemo(
    () => buildUnitProgress({ completedIds: evidence.completedIds, level: episodeLevel, goal: unitGoal }),
    [evidence.completedIds, episodeLevel, unitGoal],
  );

  const currentUnitId = unitProgress.find((entry) => entry.current)?.unit.id;
  const openUnitId = expandedUnitId ?? currentUnitId;
  const hasProgress = [...evidence.completedIds].length > 0 || [...evidence.startedIds].length > 0;

  const studiedSet = useMemo(() => new Set(evidence.studiedIds), [evidence.studiedIds]);
  const practisedSet = useMemo(() => new Set(evidence.practisedIds), [evidence.practisedIds]);

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

  const levelLocked = (lvl: CEFRLevel) => !isLevelFree(lvl, isPro);

  const handleScenarioClick = (scenarioId: string, level: CEFRLevel, unitTitleAr?: string) => {
    track('scenario_started', { scenarioId, source: 'trail' });
    if (levelLocked(level)) {
      // The paywall is shown at a session boundary — the learner tapped a
      // specific scene — and never mid-unit after work has started.
      setPaywallReason({
        title: unitTitleAr ? `وحدة «${unitTitleAr}» تُفتح مع Pro` : `مستوى ${level} يُفتح مع Pro`,
        description: `الخطة المجانية تغطي ${FREE_LEVEL} و A0. هذه الوحدة عند ${level} — كل مواقفها ظاهرة هنا، وتُفتح مع Pro.`,
      });
      setShowPaywall(true);
      return;
    }
    onSelectScenario(scenarioId);
  };

  const primaryStep = sessionPlan.steps.find((step) => step.kind === 'scenario');
  const primaryScenarioId = primaryStep?.scenarioId ?? recommendation?.scenarioId;
  const totalMinutes = sessionPlan.totalMinutes || scenarioMinutes(episodeLevel);

  const handlePrimary = () => {
    // Phase 2: the composed plan is the session. Persist it so the report can
    // hand off to the next step without re-deriving a different one.
    try {
      sessionStorage.setItem('katzu_session_plan', JSON.stringify(sessionPlan));
    } catch {
      /* storage full/blocked: the report simply falls back to its own CTA */
    }
    if (sessionPlan.steps[0]?.kind === 'review' && dueCount > 0) {
      onOpenReview();
      return;
    }
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

  // Level percent: scenarios that belong to the shown level, and how many have
  // been produced unaided. A scenario outside the served unit map (older local
  // content) simply does not count — it is not silently called done.
  const levelScenarios = scenarios.filter((scenario) => {
    const unit = unitForScenario(scenario.id);
    return unit ? unit.level === shownLevel : false;
  });
  const levelDone = levelScenarios.filter((scenario) => isDone(scenario.id)).length;
  const levelPercent = levelScenarios.length
    ? Math.round((levelDone / levelScenarios.length) * 100)
    : 0;

  const freeSessions = Math.max(
    0,
    Math.min(FREE_SESSION_TOTAL, user?.freeSessionsRemaining ?? FREE_SESSION_TOTAL),
  );

  const ringRadius = 18;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    <div className="min-h-screen bg-black pb-28 pt-4 px-4 max-w-md mx-auto relative text-text-primary">
      {/* ---------------------------------------------------------------- *
       * HEADER — who you are, how today is going, nothing else.
       * ---------------------------------------------------------------- */}
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <KatzuMascot name="avatar" className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold leading-tight font-arabic">
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
            <span className="rounded-chip border border-status-success/30 bg-status-success/10 px-2.5 py-1 font-arabic text-micro font-bold text-status-success">
              Katzu Pro
            </span>
          )}

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
        className="mb-1.5 min-h-[56px] justify-between px-4"
      >
        <span className="flex min-w-0 flex-col items-start text-start">
          <span className="font-arabic text-sm font-bold">
            {hasProgress ? 'تابع' : 'ابدأ جلسة اليوم'}
          </span>
          <span data-testid="trail-session-preview" className="max-w-full truncate font-arabic text-micro opacity-80">
            {sessionPlan.steps.length
              ? sessionPlan.steps.map(stepTitle).join(' · ')
              : 'حدّث المشاهد للمتابعة'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="font-arabic text-xs font-bold">{totalMinutes} دقائق</span>
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </span>
      </Button>

      {!isPro && (
        <p data-testid="trail-free-sessions" className="mb-3 font-arabic text-micro text-text-muted">
          جلسة مجانية {freeSessions} من {FREE_SESSION_TOTAL}
        </p>
      )}

      {/* THE SECONDARY REVIEW ROW — capped at ten items. The backlog is context,
          not a button label, so the action never carries three digits. */}
      {dueCount > 0 ? (
        <div className="mb-3">
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
        <p className="mb-3 font-arabic text-micro text-text-muted">
          لا مراجعة مستحقة الآن — وقتك للمشهد التالي.
        </p>
      )}

      {/* ---------------------------------------------------------------- *
       * THE ONE PROGRESSION SYSTEM — a level ring and the unit map below it.
       * There is no level selector: the level is what the server serves, and
       * the unit list is the plan.
       * ---------------------------------------------------------------- */}
      <Card className="mb-3 p-3" data-testid="trail-level-card">
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
              <span className="font-german">{shownLevel}</span> · {LEVEL_ABILITY_AR[shownLevel]}
            </p>
            <p className="mt-0.5 font-arabic text-micro leading-relaxed text-text-secondary">
              {levelScenarios.length === 0
                ? 'محتوى هذا المستوى يصل مع أول تحديث.'
                : `${arCount(levelDone, { one: 'موقف واحد', two: 'موقفان', few: 'مواقف', many: 'موقفاً' })} أتقنتها من ${levelScenarios.length}`}
            </p>
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- *
       * THE UNIT MAP — one ladder. The current unit is expanded; finished and
       * next units show their count; future units are dimmed and locked.
       * ---------------------------------------------------------------- */}
      <ol className="space-y-2" data-testid="trail-unit-map">
        {unitProgress.map((entry, index) => {
          const expanded = entry.unit.id === openUnitId;
          const levelBlocked = levelLocked(entry.unit.level as UnitLevel);
          const softLocked = entry.locked;
          const headerLocked = softLocked;

          return (
            <li
              key={entry.unit.id}
              className={softLocked ? 'opacity-50' : levelBlocked && !expanded ? 'opacity-80' : ''}
            >
              <button
                type="button"
                data-testid="trail-unit-header"
                disabled={headerLocked}
                aria-expanded={expanded && !softLocked}
                aria-label={`${entry.unit.titleAr} — ${entry.done} من ${entry.total}${
                  softLocked ? ' (مقفلة)' : levelBlocked ? ' (تفتح مع Pro)' : ''
                }`}
                onClick={() =>
                  setExpandedUnitId(expanded ? null : entry.unit.id)
                }
                className={`flex w-full min-h-touch items-center gap-2 rounded-control border px-3 py-2.5 text-start transition-colors ${
                  expanded
                    ? 'border-primary/50 bg-surface-card'
                    : 'border-border-subtle bg-surface-card pointer-hover:border-primary/40'
                } ${headerLocked ? 'cursor-default' : ''}`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-chip font-german text-micro font-bold ${
                    entry.finished
                      ? 'bg-status-success/15 text-status-success'
                      : expanded
                        ? 'bg-primary/15 text-primary'
                        : 'bg-surface-subtle text-text-secondary'
                  }`}
                >
                  {entry.finished ? <Check className="h-4 w-4" aria-hidden /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-arabic text-sm font-bold text-text-primary">
                    {entry.unit.titleAr}
                  </span>
                  <span className="mt-0.5 block font-arabic text-micro text-text-secondary">
                    <span className="font-german">{entry.unit.level}</span>
                    {' · '}
                    <span data-testid="trail-unit-count">
                      {entry.done} من {entry.total}
                    </span>
                  </span>
                </span>
                {levelBlocked && <Lock className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />}
                {headerLocked ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
                ) : (
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-text-secondary transition-transform duration-fast motion-reduce:transition-none ${
                      expanded ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                  />
                )}
              </button>

              {expanded && !softLocked && (
                <div className="mt-2 rounded-panel border border-border-subtle bg-surface-card/60 p-3">
                  <p className="font-arabic text-xs leading-relaxed text-text-secondary">
                    {entry.unit.outcomeAr}
                  </p>
                  <p className="mt-1.5 font-arabic text-micro font-bold text-text-primary">
                    الوحدة {index + 1} · {entry.done} من {entry.total}
                  </p>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-subtle"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={entry.total}
                    aria-valuenow={entry.done}
                    aria-label={`تقدّم ${entry.unit.titleAr}`}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-panels ease-out motion-reduce:transition-none"
                      style={{ width: `${entry.total ? Math.round((entry.done / entry.total) * 100) : 0}%` }}
                    />
                  </div>

                  <ol className="mt-2.5 space-y-1.5">
                    {entry.unit.scenarioIds.map((scenarioId) => {
                      const scenario = scenarios.find((row) => row.id === scenarioId);
                      if (!scenario) return null;
                      return (
                        <li key={scenario.id}>
                          <ScenarioCard
                            scenario={scenario}
                            level={entry.unit.level}
                            done={isDone(scenario.id)}
                            studied={studiedSet.has(scenario.id)}
                            withHelp={practisedSet.has(scenario.id)}
                            current={scenario.id === primaryScenarioId}
                            locked={levelBlocked}
                            onOpen={() => handleScenarioClick(scenario.id, entry.unit.level, entry.unit.titleAr)}
                          />
                        </li>
                      );
                    })}
                  </ol>

                  {entry.finished && (
                    <p className="mt-2 flex items-center gap-1 font-arabic text-micro font-bold text-status-success">
                      <Check className="h-3 w-3" aria-hidden />
                      أكملت هذه الوحدة
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

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

/**
 * One compact situation card.
 *
 * No status pill: «التالي» and «جديد» are quiet inline labels, and progress is
 * the three evidence stages — the same marker on every card, in every unit.
 */
const ScenarioCard: React.FC<{
  scenario: ScenarioEntity;
  level: UnitLevel;
  done: boolean;
  studied: boolean;
  withHelp: boolean;
  current: boolean;
  locked: boolean;
  onOpen: () => void;
}> = ({ scenario, level, done, studied, withHelp, current, locked, onOpen }) => {
  const visual = visualFor(scenario.category);
  const Icon = visual.Icon;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${scenario.title_ar} (${scenario.title_de})${locked ? ' — تفتح مع Pro' : ''}`}
      data-testid="trail-scenario-card"
      className={`flex w-full min-h-touch items-start gap-2.5 rounded-control border bg-surface-card p-2.5 text-start transition-[background-color,border-color] ${
        current
          ? 'border-primary/60'
          : done
            ? 'border-status-success/40 pointer-hover:border-status-success/60'
            : 'border-border-subtle pointer-hover:border-primary/50'
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control ${visual.tint}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 font-arabic text-sm font-bold leading-snug text-text-primary">
            <bdi dir="rtl">{scenario.title_ar}</bdi>
          </span>
          {current ? (
            <span data-testid="trail-next-label" className="shrink-0 font-arabic text-micro font-bold text-primary">
              التالي
            </span>
          ) : !done && !studied && !withHelp ? (
            <span data-testid="trail-new-label" className="shrink-0 font-arabic text-micro text-text-muted">
              جديد
            </span>
          ) : null}
        </span>

        <span className="mt-0.5 flex items-center justify-between gap-2">
          <GermanText className="line-clamp-1 block min-w-0 text-micro leading-snug text-text-secondary">
            {scenario.title_de}
          </GermanText>
          <span className="inline-flex shrink-0 items-center gap-1 font-arabic text-micro text-text-muted">
            <Clock className="h-3 w-3" aria-hidden />
            {scenarioMinutes(level)} دقائق
          </span>
        </span>

        <span
          data-testid="trail-mastery"
          className="mt-1.5 flex items-center gap-2.5 font-arabic text-micro leading-none"
        >
          <MasteryStage done={studied} label="دراسة" />
          <MasteryStage done={withHelp} label="مع مساعدة" />
          <MasteryStage done={done} label="وحدك" />
        </span>
      </span>
    </button>
  );
};
