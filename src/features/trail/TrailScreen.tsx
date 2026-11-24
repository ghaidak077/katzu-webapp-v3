import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { refreshCurriculumCache } from '@/lib/api/workerClient';
import { arCount } from '@/lib/i18n/arabicCount';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { REVIEW_ITEM_BARE, STREAK_DAY_CHIP, UNIT_AHEAD } from '@/lib/i18n/countForms';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { isProEffective } from '@/lib/utils/subscription';
import { FREE_LEVEL, isLevelFree, servedLevel } from '@/lib/entitlement/trial';
import { journeyOrderedScenarios } from '@/lib/content/scenarioOrder';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { LtrCounter } from '@/components/common/LtrCounter';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import { track } from '@/lib/analytics/client';
import type { CEFRLevel, ScenarioEntity } from '@/types/models';
import {
  ArrowLeft,
  Brain,
  Check,
  ChevronDown,
  Clock,
  Flame,
  Lock,
  Play,
  Sparkles,
  X,
} from 'lucide-react';
import { countDue } from '@/lib/srs/engine';
import {
  reviewMinutes,
  scenarioMinutes,
  REVIEW_SESSION_CAP,
} from '@/lib/mission/scenarioMinutes';
import { buildCapabilityModel } from '@/lib/capability/model';
import { sceneFor } from '@/lib/design/scenes';
import { unitForScenario, unitGoalForLearnerGoal, type UnitLevel } from '@/lib/units/units';
import {
  STAGE_LABEL_AR,
  buildUnitProgress,
  composeSession,
  recommendScenario,
  stageFor,
  type LearnerEvidence,
  type SessionStage,
} from '@/lib/units/progress';

/** V31: agreement for the review strip's title. See `arabicCount`. */
// The bare count noun lives with the other Arabic count forms, so a language
// change can never leave two copies of it to drift apart.
const REVIEW_ITEM_FORMS = REVIEW_ITEM_BARE;

/** The three stages, in the order a learner walks them. Never a menu. */
const STAGES: SessionStage[] = ['study', 'with_help', 'solo'];

/** The free trial's shape, mirrored for display only — the server owns the count. */
const FREE_SESSION_TOTAL = 3;

/**
 * The three evidence stages, as one compact meter.
 *
 * The path used to print «دراسة · مع مساعدة · وحدك» on every row, which is
 * twelve words of the same sentence repeated six times. The information is
 * still there — it is a meter now, drawn on the lesson in progress only, and
 * the row's accessible name carries the stage the evidence supports, while the
 * sheet spells out all three.
 */
const StageMeter: React.FC<{
  studied: boolean;
  withHelp: boolean;
  done: boolean;
  className?: string;
}> = ({ studied, withHelp, done, className }) => {
  const states = [studied, withHelp, done];
  return (
    <span data-testid="trail-mastery" aria-hidden className={`flex items-center gap-1 ${className || ''}`}>
      {states.map((reached, index) => (
        <span
          key={STAGES[index]}
          data-testid="trail-stage-segment"
          className={`h-1 w-5 rounded-full ${reached ? 'bg-primary' : 'bg-border-subtle'}`}
        />
      ))}
    </span>
  );
};

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
 * current unit is open, and every unit header shows «3/6» on the same line as
 * its name and chevron.
 *
 *   header      identity, the Pro mark when it applies, the served level, one streak chip
 *   hero        the next situation, a three-step bar and ONE «ابدأ» button that
 *               starts the stage the evidence supports
 *   review      a ghost row stating how much is waiting
 *   unit        «الوحدة N · name» + «k/n» + chevron, with a thin bar under the open one
 *   timeline    one node per situation: done check, current accent, else number —
 *               only the lesson in progress carries the stage meter and minutes
 *   sheet       tapping a row opens its three stages and one start button
 *
 * There is deliberately no daily-minutes ring here: a «0 / 20» in the header
 * was today's recorded minutes against the learner's goal, which is a
 * scoreboard on a screen whose job is to name the next action. Progress lives
 * on the profile; the path carries one plan and one primary button.
 */
export const TrailScreen: React.FC<TrailScreenProps> = ({
  onSelectScenario,
  onOpenSubscription,
  onOpenReview,
  onOpenOnboarding,
}) => {
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);
  const [sheetScenarioId, setSheetScenarioId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState({ title: '', description: '' });
  const { t, uiLanguage } = useLanguage();

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

  // Stored, not rendered: the report reads it to hand off to the next step
  // without re-deriving a different plan.
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

  const hasProgress =
    [...evidence.completedIds].length > 0 || [...evidence.startedIds].length > 0;

  // Day one: the path shows the unit the learner is in, the next one, and a
  // single locked preview. Rendering the whole ladder put a column of padlocks
  // above the fold, which advertises doors instead of answering «what do I do
  // now?». Once anything is started the full path is useful context again.

  const studiedSet = useMemo(() => new Set(evidence.studiedIds), [evidence.studiedIds]);
  const practisedSet = useMemo(() => new Set(evidence.practisedIds), [evidence.practisedIds]);

  const streakDays = user?.streakDays ?? 0;

  const levelLocked = (lvl: CEFRLevel) => !isLevelFree(lvl, isPro);

  const handleScenarioClick = (scenarioId: string, level: CEFRLevel, unitTitleAr?: string) => {
    track('scenario_started', { scenarioId, source: 'trail' });
    if (levelLocked(level)) {
      // The paywall is shown at a session boundary — the learner tapped a
      // specific scene — and never mid-unit after work has started.
      setPaywallReason({
        title: unitTitleAr
          ? t('trail.lock.unitTitle', { unit: unitTitleAr })
          : t('trail.lock.levelTitle', { level }),
        description: t('trail.lock.description', { free: FREE_LEVEL, level }),
      });
      setShowPaywall(true);
      return;
    }
    onSelectScenario(scenarioId);
  };

  /**
   * The next situation, its stage, and its level — all from recorded evidence.
   *
   * The recommendation is derived from the static unit ladder, so it can name a
   * scene the device has not loaded yet (a fresh install, a partial download),
   * or one inside a unit the ladder has not unlocked. The hero may only
   * announce a scene it can actually open, so the order is: the recommendation
   * when it is loaded and startable, the composed plan's first scenario step
   * when that one is, then the first unfinished row in ladder order — preferring
   * nothing the lock would refuse.
   */
  const downloadedIds = new Set(scenarios.map((scenario) => scenario.id));
  const unlockedIds = new Set(
    unitProgress.filter((entry) => !entry.locked).flatMap((entry) => entry.unit.scenarioIds),
  );
  const startable = (scenarioId?: string) =>
    scenarioId && downloadedIds.has(scenarioId) && unlockedIds.has(scenarioId) ? scenarioId : undefined;
  const nextScenarioId =
    startable(recommendation?.scenarioId) ??
    startable(sessionPlan.steps.find((step) => step.kind === 'scenario')?.scenarioId) ??
    [...unlockedIds].find(
      (scenarioId) => downloadedIds.has(scenarioId) && !isDone(scenarioId),
    ) ??
    scenarios[0]?.id;
  const nextScenario = scenarios.find((scenario) => scenario.id === nextScenarioId);

  // The open unit is the one holding the next situation, so the row the hero
  // names is the row in view. The ladder's own current unit is the fallback —
  // a unit with nothing loaded opens an empty panel, which is how the path once
  // showed no current lesson at all.
  const unitHasRows = (entry: (typeof unitProgress)[number]) =>
    !entry.locked && entry.unit.scenarioIds.some((scenarioId) => downloadedIds.has(scenarioId));
  const heroUnit = nextScenario ? unitForScenario(nextScenario.id)?.id : undefined;
  const currentUnitId =
    unitProgress.find((entry) => entry.unit.id === heroUnit && unitHasRows(entry))?.unit.id ??
    unitProgress.find((entry) => entry.current && unitHasRows(entry))?.unit.id ??
    unitProgress.find(unitHasRows)?.unit.id;
  const openUnitId = expandedUnitId ?? currentUnitId;

  // Never fewer than the unit holding the next row, even on day one.
  const currentUnitIndex = unitProgress.findIndex((entry) => entry.unit.id === currentUnitId);
  const visibleUnitCount = hasProgress
    ? unitProgress.length
    : Math.min(unitProgress.length, Math.max(3, currentUnitIndex + 1));
  const hiddenUnitCount = unitProgress.length - visibleUnitCount;
  const nextStage: SessionStage = nextScenarioId
    ? stageFor(nextScenarioId, { evidence, lastEase: user?.lastSessionEase ?? null })
    : 'study';
  const nextLevel: CEFRLevel =
    (nextScenario && unitForScenario(nextScenario.id)?.level) || episodeLevel;
  const nextMinutes = scenarioMinutes(nextLevel);

  const handlePrimary = () => {
    // Phase 2: the composed plan is the session. Persist it so the report can
    // hand off to the next step without re-deriving a different one.
    try {
      sessionStorage.setItem('katzu_session_plan', JSON.stringify(sessionPlan));
    } catch {
      /* storage full/blocked: the report simply falls back to its own CTA */
    }
    if (nextScenarioId) {
      handleScenarioClick(nextScenarioId, nextLevel);
      return;
    }
    void refreshCurriculumCache();
  };

  const reviewItemsLabel =
    uiLanguage === 'ar'
      ? arCount(Math.min(dueCount, REVIEW_SESSION_CAP), REVIEW_ITEM_FORMS)
      : t('trail.review.items', { count: Math.min(dueCount, REVIEW_SESSION_CAP) });
  const reviewLabel =
    dueCount > 0
      ? t('trail.review.summary', {
          items: reviewItemsLabel,
          minutes: reviewMinutes(dueCount),
        })
      : '';

  const freeSessions = Math.max(
    0,
    Math.min(FREE_SESSION_TOTAL, user?.freeSessionsRemaining ?? FREE_SESSION_TOTAL),
  );

  /** How much of a level the learner has produced unaided. */
  const levelPercentFor = (level: UnitLevel) => {
    const rows = scenarios.filter((scenario) => unitForScenario(scenario.id)?.level === level);
    if (!rows.length) return 0;
    return Math.round((rows.filter((scenario) => isDone(scenario.id)).length / rows.length) * 100);
  };

  // The level belongs to the screen, not to one unit's header: it was a floating
  // line inside the open unit, which read as a caption on the wrong thing.
  const currentUnitEntry = unitProgress.find((entry) => entry.current) ?? unitProgress[0];
  const currentLevelPercent = currentUnitEntry
    ? levelPercentFor(currentUnitEntry.unit.level as UnitLevel)
    : 0;

  // The sheet reads evidence; it never writes a stage.
  const sheetScenario = sheetScenarioId
    ? scenarios.find((scenario) => scenario.id === sheetScenarioId)
    : undefined;
  const sheetLevel: CEFRLevel =
    (sheetScenario && unitForScenario(sheetScenario.id)?.level) || episodeLevel;
  const sheetStage: SessionStage = sheetScenario
    ? stageFor(sheetScenario.id, { evidence, lastEase: user?.lastSessionEase ?? null })
    : 'study';
  const sheetStageIndex = STAGES.indexOf(sheetStage);
  const sheetDone = sheetScenario ? isDone(sheetScenario.id) : false;

  const startSheetScenario = () => {
    if (!sheetScenario) return;
    const scenarioId = sheetScenario.id;
    setSheetScenarioId(null);
    handleScenarioClick(scenarioId, sheetLevel);
  };

  return (
    <div className="min-h-screen bg-black pb-28 pt-4 px-4 max-w-md mx-auto relative text-text-primary">
      {/* ---------------------------------------------------------------- *
       * HEADER — who you are, and one streak. Nothing to score here.
       * ---------------------------------------------------------------- */}
      <header className="mb-3 flex items-center gap-3">
        <KatzuMascot name="avatar" className="h-11 w-11 shrink-0" />

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-arabic text-base font-bold leading-tight">
            {t('trail.greeting', { name: user?.displayName || t('profile.defaultName') })}
          </h1>
          <div className="mt-0.5 flex items-center gap-2">
            {isPro && (
              <span
                data-testid="trail-pro-label"
                className="inline-flex items-center gap-1 whitespace-nowrap font-arabic text-micro font-bold text-status-success"
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                Katzu Pro
              </span>
            )}
            {currentUnitEntry && (
              <bdi
                dir="ltr"
                data-testid="trail-level-line"
                className="font-german text-micro text-text-muted"
              >
                {currentUnitEntry.unit.level} · {currentLevelPercent}%
              </bdi>
            )}
          </div>
        </div>

        {streakDays > 0 ? (
          <span
            data-testid="trail-streak-chip"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-chip border border-status-learning/30 bg-status-learning/10 px-2.5 py-1 font-arabic text-micro font-bold text-status-learning"
          >
            <Flame className="h-3.5 w-3.5 fill-learning text-learning" aria-hidden />
            {t('trail.streak', {
              days:
                uiLanguage === 'ar'
                  ? arCount(streakDays, STREAK_DAY_CHIP)
                  : streakDays,
            })}
          </span>
        ) : (
          <span
            data-testid="trail-streak-chip"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-chip border border-border-subtle bg-surface-subtle px-2.5 py-1 font-arabic text-micro text-text-secondary"
          >
            <Flame className="h-3.5 w-3.5" aria-hidden />
            {t('trail.streakStart')}
          </span>
        )}
      </header>

      {/* ---------------------------------------------------------------- *
       * THE HERO — the next situation and ONE PRIMARY ACTION that starts it.
       * ---------------------------------------------------------------- */}
      <Card variant="hero" padded={false} className="mb-2" data-testid="trail-hero">
        <div className="p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p data-testid="trail-next-label" className="font-arabic text-micro font-bold text-primary">
              {t('trail.next')}
            </p>
            {nextScenario && (
              <span className="inline-flex shrink-0 items-center gap-1 font-arabic text-micro text-text-muted">
                <Clock className="h-3 w-3" aria-hidden />
                {t('trail.minutes', { count: nextMinutes })}
              </span>
            )}
          </div>
          <h2 className="mt-0.5 font-arabic text-lg font-bold leading-snug text-text-primary">
            {nextScenario ? nextScenario.title_ar : t('trail.noneLeft')}
          </h2>
          {nextScenario && (
            <GermanText className="mt-0.5 block truncate text-xs text-text-secondary">
              {nextScenario.title_de}
            </GermanText>
          )}

          {nextScenario && (
            <div data-testid="trail-session-preview" className="mt-3 flex items-start gap-1.5">
              {STAGES.map((stage, index) => {
                const reached = index < STAGES.indexOf(nextStage);
                return (
                  <div key={stage} className="min-w-0 flex-1">
                    <span
                      aria-hidden
                      className={`block h-1 rounded-full ${
                        reached ? 'bg-primary/45' : stage === nextStage ? 'bg-primary' : 'bg-border-subtle'
                      }`}
                    />
                    <span
                      aria-current={stage === nextStage ? 'step' : undefined}
                      className={`mt-1 block truncate font-arabic text-micro ${
                        stage === nextStage ? 'font-bold text-primary' : 'text-text-muted'
                      }`}
                    >
                      {STAGE_LABEL_AR[stage]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <Button
            variant="primary"
            size="md"
            fullWidth
            data-testid="trail-primary-cta"
            onClick={handlePrimary}
            aria-label={
              nextScenario
                ? t('trail.cta.start', {
                    title: nextScenario.title_ar,
                    stage: STAGE_LABEL_AR[nextStage],
                  })
                : t('trail.cta.refresh')
            }
            className="mt-3 h-[52px] justify-center gap-2 text-base"
          >
            {nextScenario ? t('trail.cta.startShort') : t('trail.cta.refresh')}
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </Card>

      {/* The free tier's remaining sittings — one flat muted line, never a pill
          with a border: above the fold only the hero and the current lesson are
          allowed to hold a surface. */}
      {!isPro && (
        <button
          type="button"
          data-testid="trail-free-sessions"
          onClick={onOpenSubscription}
          aria-label={t('trail.freeSessions.aria', {
            left: freeSessions,
            total: FREE_SESSION_TOTAL,
          })}
          className="mb-2 inline-flex min-h-touch items-center gap-1.5 font-arabic text-micro text-text-muted transition-colors pointer-hover:text-text-secondary"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t('trail.freeSessions.label', { left: freeSessions, total: FREE_SESSION_TOTAL })}
        </button>
      )}

      {/* THE SECONDARY REVIEW ROW — a ghost row. The capped count and the
          minutes are in its accessible name and in the review screen; the row
          itself says how much is waiting, not what to do about it. */}
      {dueCount > 0 ? (
        <button
          type="button"
          data-testid="trail-review-row"
          onClick={onOpenReview}
          aria-label={reviewLabel}
          className="mb-3 flex min-h-touch w-full items-center gap-2 py-2 text-start transition-colors pointer-hover:text-text-primary"
        >
          <Brain className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="font-arabic text-xs font-bold">{t('trail.review.title')}</span>
          <span className="font-arabic text-micro text-text-muted">
            {t('trail.review.waiting', { count: dueCount })}
          </span>
          <ArrowLeft className="ms-auto h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
        </button>
      ) : (
        <p className="mb-3 font-arabic text-micro text-text-muted">
          {t('trail.review.none')}
        </p>
      )}

      {/* ---------------------------------------------------------------- *
       * THE UNIT MAP — one ladder. The current unit is open and carries the
       * one thin bar; everything further out is a dimmed text row.
       * ---------------------------------------------------------------- */}
      <ol className="space-y-3" data-testid="trail-unit-map">
        {unitProgress.slice(0, visibleUnitCount).map((entry, index) => {
          const expanded = entry.unit.id === openUnitId;
          const levelBlocked = levelLocked(entry.unit.level as UnitLevel);
          const headerLocked = entry.locked;
          const rows = entry.unit.scenarioIds
            .map((scenarioId) => scenarios.find((scenario) => scenario.id === scenarioId))
            .filter((scenario): scenario is ScenarioEntity => Boolean(scenario));
          /**
           * The unit's face: the first situation it holds.
           *
           * A unit is a place before it is a list of titles, so the header shows
           * the same 56px artwork the scene cards use — one photograph per unit,
           * resolved from content, absent when the content has none (then the
           * box keeps its size and shows the scene's own light instead of an
           * empty frame).
           */
          const unitScene = rows[0] ? sceneFor(rows[0]) : undefined;

          return (
            <li key={entry.unit.id}>
              <button
                type="button"
                data-testid="trail-unit-header"
                disabled={headerLocked}
                aria-expanded={expanded && !headerLocked}
                aria-label={t('trail.unit.aria', {
                  title: entry.unit.titleAr,
                  done: entry.done,
                  total: entry.total,
                  state: headerLocked
                    ? t('trail.unit.stateLocked')
                    : levelBlocked
                      ? t('trail.unit.statePro')
                      : entry.skipped
                        ? t('trail.unit.stateSkipped')
                        : '',
                })}
                onClick={() => setExpandedUnitId(expanded ? null : entry.unit.id)}
                className={`flex w-full min-h-touch items-center gap-2.5 rounded-control py-1.5 text-start transition-colors ${
                  headerLocked
                    ? 'cursor-default'
                    : expanded
                      ? 'pointer-hover:bg-surface-subtle'
                      : 'pointer-hover:bg-surface-subtle'
                }`}
              >
                <span
                  aria-hidden
                  data-testid="trail-unit-thumb"
                  className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-chip bg-gradient-to-br from-primary/25 to-kz-black ${
                    headerLocked ? 'opacity-60' : ''
                  }`}
                >
                  {unitScene?.artUrl && (
                    <img
                      src={unitScene.artUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  )}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate font-arabic text-sm font-bold ${
                    expanded ? 'text-text-primary' : 'text-text-secondary'
                  } ${headerLocked ? 'opacity-60' : ''}`}
                >
                  {t('trail.unit.index', { index: index + 1, title: entry.unit.titleAr })}
                </span>
                <span
                  data-testid="trail-unit-count"
                  className={`shrink-0 font-german text-micro ${
                    expanded ? 'text-text-secondary' : 'text-text-muted'
                  }`}
                >
                  <LtrCounter value={entry.done} total={entry.total} />
                </span>

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

              {expanded && !headerLocked && (
                <>
                  <div
                    className="h-0.5 overflow-hidden rounded-full bg-border-strong"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={entry.total}
                    aria-valuenow={entry.done}
                    aria-label={t('trail.unit.progressAria', { title: entry.unit.titleAr })}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-panels ease-out motion-reduce:transition-none"
                      style={{ width: `${entry.total ? Math.round((entry.done / entry.total) * 100) : 0}%` }}
                    />
                  </div>

                  <ol className="mt-1" data-testid="trail-timeline">
                    {rows.map((scenario, rowIndex) => {
                      const done = isDone(scenario.id);
                      const current = scenario.id === nextScenarioId;
                      const last = rowIndex === rows.length - 1;
                      return (
                        <li
                          key={scenario.id}
                          className={last ? '' : 'border-b border-border-subtle'}
                        >
                          <button
                            type="button"
                            data-testid="trail-scenario-card"
                            aria-label={`${scenario.title_ar} (${scenario.title_de})${
                              current ? ` — ${t('trail.next')}` : ''
                            } — ${
                              STAGE_LABEL_AR[stageFor(scenario.id, { evidence, lastEase: user?.lastSessionEase ?? null })]
                            }${levelBlocked ? ` — ${t('trail.unit.stateProBare')}` : ''}`}
                            onClick={() => {
                              if (levelBlocked) {
                                handleScenarioClick(scenario.id, entry.unit.level, entry.unit.titleAr);
                                return;
                              }
                              setSheetScenarioId(scenario.id);
                            }}
                            className={`flex w-full min-h-touch items-start gap-2 px-1 py-2.5 text-start transition-colors ${
                              current ? 'rounded-control bg-primary/[0.06]' : 'pointer-hover:bg-surface-subtle'
                            }`}
                          >
                            <span aria-hidden className="flex w-7 shrink-0 flex-col items-center">
                              <span
                                className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border font-german text-micro font-bold ${
                                  done
                                    ? 'border-status-success/40 bg-status-success/15 text-status-success'
                                    : current
                                      ? 'border-primary bg-primary text-kz-ink'
                                      : 'border-border-subtle text-text-muted'
                                }`}
                              >
                                {done ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : current ? (
                                  <Play className="h-3.5 w-3.5" />
                                ) : (
                                  rowIndex + 1
                                )}
                              </span>
                              {!last && <span className="mt-1 w-px flex-1 bg-border-subtle" />}
                            </span>

                            <span className="min-w-0 flex-1 pb-1">
                              <span className="flex items-start gap-2">
                                <span className="min-w-0 flex-1 font-arabic text-sm font-bold leading-snug text-text-primary">
                                  {scenario.title_ar}
                                </span>
                                {current && (
                                  <span className="mt-1 inline-flex shrink-0 items-center gap-1 font-arabic text-micro text-primary">
                                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
                                    {t('trail.inProgress')}
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 flex items-start gap-2">
                                <GermanText className="line-clamp-2 min-w-0 flex-1 text-micro leading-snug text-text-secondary">
                                  {scenario.title_de}
                                </GermanText>
                                {current && (
                                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 font-arabic text-micro text-text-muted">
                                    <StageMeter
                                      studied={studiedSet.has(scenario.id)}
                                      withHelp={practisedSet.has(scenario.id)}
                                      done={done}
                                    />
                                    <Clock className="h-3 w-3" aria-hidden />
                                    {t('trail.minutes', { count: scenarioMinutes(entry.unit.level) })}
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </li>
          );
        })}
      </ol>

      {hiddenUnitCount > 0 && (
        <p className="mt-2 text-center font-arabic text-micro text-text-muted">
          {t('trail.unitsAhead', {
            units:
              uiLanguage === 'ar'
                ? arCount(hiddenUnitCount, UNIT_AHEAD)
                : hiddenUnitCount,
          })}
        </p>
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
                {t('trail.onboarding.title')}
              </span>
              <span className="mt-0.5 block font-arabic text-micro leading-relaxed text-text-secondary">
                {t('trail.onboarding.body')}
              </span>
            </span>
            <ArrowLeft className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
          </button>
          <button
            onClick={() => void db.users.update('current_user', { onboardingPromptDismissedAt: Date.now() })}
            aria-label={t('trail.onboarding.dismiss')}
            className="absolute top-1.5 end-1.5 flex min-h-touch min-w-touch items-center justify-center rounded-full text-text-secondary pointer-hover:bg-surface-raised"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      {/* ---------------------------------------------------------------- *
       * THE SITUATION SHEET — its three stages, the one that fits now.
       * ---------------------------------------------------------------- */}
      <BottomSheet
        isOpen={Boolean(sheetScenario)}
        onClose={() => setSheetScenarioId(null)}
        title={sheetScenario?.title_ar}
      >
        {sheetScenario && (
          <div>
            <GermanText className="block text-xs text-text-secondary">
              {sheetScenario.title_de}
            </GermanText>
            <p className="mt-1 flex items-center gap-1.5 font-arabic text-micro text-text-muted">
              <Clock className="h-3 w-3" aria-hidden />
              {t('trail.minutes', { count: scenarioMinutes(sheetLevel) })}
            </p>

            <ol className="mt-3 space-y-1.5">
              {STAGES.map((stage, index) => {
                const complete = sheetDone || index < sheetStageIndex;
                const isCurrent = !sheetDone && index === sheetStageIndex;
                return (
                  <li
                    key={stage}
                    className={`flex items-center gap-3 rounded-control border px-3 py-2.5 ${
                      isCurrent ? 'border-primary/60 bg-primary/10' : 'border-border-subtle bg-surface-card'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-german text-micro font-bold ${
                        complete
                          ? 'border-status-success/40 bg-status-success/15 text-status-success'
                          : isCurrent
                            ? 'border-primary/60 text-primary'
                            : 'border-border-subtle text-text-muted'
                      }`}
                    >
                      {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    <span className="font-arabic text-xs font-bold text-text-primary">
                      {STAGE_LABEL_AR[stage]}
                    </span>
                    {isCurrent && (
                      <span className="ms-auto font-arabic text-micro font-bold text-primary">
                        {t('trail.suggested')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>

            <Button
              variant="primary"
              size="md"
              fullWidth
              data-testid="trail-sheet-start"
              onClick={startSheetScenario}
              aria-label={t('trail.cta.start', {
                title: sheetScenario.title_ar,
                stage: STAGE_LABEL_AR[sheetStage],
              })}
              className="mt-3 justify-center"
            >
              {t('trail.sheetStart', { stage: STAGE_LABEL_AR[sheetStage] })}
            </Button>
          </div>
        )}
      </BottomSheet>

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
