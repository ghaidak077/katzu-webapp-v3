import type { CEFRLevel } from '@/types/models';
import {
  isCheckpointScenario,
  learnerScenarioOrder,
  orderedUnits,
  startUnitIndexForLevel,
  type Unit,
  type UnitGoal,
} from './units';
import { REVIEW_SESSION_CAP, reviewMinutes, scenarioMinutes } from '@/lib/mission/scenarioMinutes';

/**
 * What to do next — decided once, in one pure place.
 *
 * The learner never chooses a mode. Two questions are answered here from
 * recorded evidence only:
 *
 *   1. Which scenario is next? (continue what was started → next unfinished
 *      non-checkpoint → an unfinished checkpoint last)
 *   2. Which stage of it? (study → with help → solo, never self-selected)
 *
 * The one thing this module refuses to do is let a two-percent learner see an
 * exam-style scenario while an earlier one is unfinished. `exam_*` ids sort
 * last inside their unit, and the recommendation walks the unit order before
 * it touches one.
 */

export type SessionStage = 'study' | 'with_help' | 'solo';

export const STAGE_LABEL_AR: Record<SessionStage, string> = {
  study: 'دراسة',
  with_help: 'مع مساعدة',
  solo: 'وحدك',
};

/** The evidence needed to choose a stage. All ids are scenario ids. */
export interface LearnerEvidence {
  completedIds: Iterable<string>;
  /** Studied or practised, but not yet independent. */
  startedIds: Iterable<string>;
  /** Has a studied/opened record — the `دراسة` dot. */
  studiedIds: Iterable<string>;
  /** Has produced a conversation in it — the `مع مساعدة` dot. */
  practisedIds: Iterable<string>;
}

export interface RecommendationInput {
  level: CEFRLevel | undefined | null;
  goal?: UnitGoal | null;
  evidence: LearnerEvidence;
  /**
   * The last post-session answer. It only nudges the STAGE, never the level:
   * «صعبة» repeats with help, «سهلة» may move straight to solo.
   */
  lastEase?: 'easy' | 'ok' | 'hard' | null;
}

export interface Recommendation {
  scenarioId: string;
  stage: SessionStage;
  /** Why this scenario — used by the screen, never invented at render time. */
  reason: 'continue' | 'next' | 'checkpoint';
}

function toSet(ids: Iterable<string> | undefined | null): Set<string> {
  return ids ? new Set(ids) : new Set<string>();
}

/** The first id in order that satisfies `predicate`. */
function firstInOrder(order: string[], predicate: (id: string) => boolean): string | undefined {
  for (const scenarioId of order) {
    if (predicate(scenarioId)) return scenarioId;
  }
  return undefined;
}

/**
 * The next scenario, or undefined when the learner has finished everything at
 * or above their starting level.
 */
export function recommendScenario(input: RecommendationInput): Recommendation | undefined {
  const order = learnerScenarioOrder(input.level, input.goal);
  const completed = toSet(input.evidence.completedIds);
  const started = toSet(input.evidence.startedIds);

  const unfinished = (scenarioId: string) => !completed.has(scenarioId);

  // 1. Continue what was already begun. This is the strongest signal: the
  // learner has context in their head right now, and abandoning it for the
  // next new scene is how a path starts to feel like a list.
  const continued = firstInOrder(order, (scenarioId) => unfinished(scenarioId) && started.has(scenarioId));
  if (continued) {
    return {
      scenarioId: continued,
      stage: stageFor(continued, input),
      reason: 'continue',
    };
  }

  // 2. The next unscored, non-checkpoint scenario in unit order.
  const next = firstInOrder(
    order,
    (scenarioId) => unfinished(scenarioId) && !isCheckpointScenario(scenarioId),
  );
  if (next) {
    return { scenarioId: next, stage: stageFor(next, input), reason: 'next' };
  }

  // 3. Only now may a checkpoint lead.
  const checkpoint = firstInOrder(order, (scenarioId) => unfinished(scenarioId));
  if (checkpoint) {
    return {
      scenarioId: checkpoint,
      stage: stageFor(checkpoint, input),
      reason: 'checkpoint',
    };
  }

  return undefined;
}

/** The stage the evidence supports — the learner never picks it. */
export function stageFor(scenarioId: string, input: Pick<RecommendationInput, 'evidence' | 'lastEase'>): SessionStage {
  const completed = toSet(input.evidence.completedIds);
  const studied = toSet(input.evidence.studiedIds);
  const practised = toSet(input.evidence.practisedIds);

  if (completed.has(scenarioId)) return 'solo';
  if (input.lastEase === 'hard') {
    return studied.has(scenarioId) ? 'with_help' : 'study';
  }
  if (input.lastEase === 'easy' && (studied.has(scenarioId) || practised.has(scenarioId))) {
    return 'solo';
  }
  if (practised.has(scenarioId)) return 'with_help';
  if (studied.has(scenarioId)) return 'with_help';
  return 'study';
}

export type SessionStepKind = 'review' | 'scenario';

export interface SessionStep {
  kind: SessionStepKind;
  /** Present for a scenario step; absent for review. */
  scenarioId?: string;
  stage: SessionStage | 'review';
  titleAr: string;
  minutes: number;
}

export interface SessionPlan {
  steps: SessionStep[];
  totalMinutes: number;
  /** The capped review count this plan actually offers. */
  reviewCount: number;
}

export interface ComposeSessionInput extends RecommendationInput {
  dueReviewCount: number;
  /** Titles by scenario id; a missing title falls back to the id. */
  titles?: Record<string, string>;
}

/**
 * Today's session, in one plan: due review (max 10) → the next stage of the
 * recommended scenario → a short second scene when the first one is solo work.
 *
 * The plan is deliberately short. A session that previews six steps is a
 * backlog wearing a plan's clothes; three is the most this returns.
 */
export function composeSession(input: ComposeSessionInput): SessionPlan {
  const steps: SessionStep[] = [];
  const reviewCount = Math.min(
    Math.max(0, Math.floor(Number(input.dueReviewCount) || 0)),
    REVIEW_SESSION_CAP,
  );
  if (reviewCount > 0) {
    steps.push({
      kind: 'review',
      stage: 'review',
      titleAr: `مراجعة سريعة (${reviewCount})`,
      minutes: reviewMinutes(reviewCount),
    });
  }

  const recommendation = recommendScenario(input);
  if (recommendation) {
    const minutes = scenarioMinutes(input.level ?? undefined);
    steps.push({
      kind: 'scenario',
      scenarioId: recommendation.scenarioId,
      stage: recommendation.stage,
      titleAr: input.titles?.[recommendation.scenarioId] || recommendation.scenarioId,
      minutes,
    });

    // A solo scene is a free-conversation sitting already. When the learner is
    // still studying or using help, one more scene would make the sitting long
    // and dilute the stage that matters — so the second step is added only
    // once the first is solo.
    if (recommendation.stage === 'solo') {
      const order = learnerScenarioOrder(input.level, input.goal);
      const completed = toSet(input.evidence.completedIds);
      const second = firstInOrder(
        order,
        (scenarioId) =>
          scenarioId !== recommendation.scenarioId &&
          !completed.has(scenarioId) &&
          !isCheckpointScenario(scenarioId),
      );
      if (second) {
        steps.push({
          kind: 'scenario',
          scenarioId: second,
          stage: stageFor(second, input),
          titleAr: input.titles?.[second] || second,
          minutes,
        });
      }
    }
  }

  return {
    steps,
    totalMinutes: steps.reduce((total, step) => total + step.minutes, 0),
    reviewCount,
  };
}

/** The next step after a finished scenario, for the report's 2-second hand-off. */
export function nextPlanStep(plan: SessionPlan | null | undefined, finishedScenarioId: string): SessionStep | undefined {
  if (!plan || !plan.steps.length) return undefined;
  const finishedAt = plan.steps.findIndex(
    (step) => step.kind === 'scenario' && step.scenarioId === finishedScenarioId,
  );
  if (finishedAt === -1) return plan.steps[0]?.kind === 'scenario' ? plan.steps[0] : undefined;
  return plan.steps.slice(finishedAt + 1).find((step) => step.kind === 'scenario');
}

/**
 * The 75% promotion rule, kept in one place for the path and the tests.
 *
 * A learner who handled the unit easily is offered «تخطَّ الوحدة باختبار قصير»
 * only AFTER the session, never as a question up front. Below half is an offer
 * to repeat with help, not a failure screen.
 */
export function sessionOutcomeOffer(accuracyPercent: number | null | undefined): 'test_out' | 'repeat_help' | null {
  if (typeof accuracyPercent !== 'number' || !Number.isFinite(accuracyPercent)) return null;
  if (accuracyPercent > 85) return 'test_out';
  if (accuracyPercent < 50) return 'repeat_help';
  return null;
}

/**
 * Unit progress, derived from completed scenarios. No migration writes: an
 * existing learner's sessions already name scenario ids, so the same completed
 * ids map onto the new units and nothing is reset.
 */
export interface UnitProgress {
  unit: Unit;
  done: number;
  total: number;
  /** The unit the learner is standing in: first unfinished unit in the path. */
  current: boolean;
  /** Future units are dimmed and locked; the next unit is still tappable. */
  locked: boolean;
  finished: boolean;
  /**
   * A unit below the level the placement measured. It stays open and tappable
   * — nothing is locked behind the starting point — and is shown as «تخطّيتَ».
   */
  skipped: boolean;
}

export function buildUnitProgress(input: {
  completedIds: Iterable<string>;
  level: CEFRLevel | undefined | null;
  goal?: UnitGoal | null;
}): UnitProgress[] {
  const completed = toSet(input.completedIds);
  const path = orderedUnits(input.goal);
  const start = startUnitIndexForLevel(input.level);
  const firstUnfinished = path.findIndex(
    (entry, index) => index >= start && entry.scenarioIds.some((id) => !completed.has(id)),
  );
  const currentIndex = firstUnfinished === -1 ? path.length - 1 : firstUnfinished;

  return path.map((entry, index) => {
    const done = entry.scenarioIds.filter((id) => completed.has(id)).length;
    const total = entry.scenarioIds.length;
    const finished = done >= total;
    return {
      unit: entry,
      done,
      total,
      current: index === currentIndex,
      // Soft lock: everything beyond the NEXT unit is dark. The next unit stays
      // tappable so a strong learner can look one step ahead without a wall.
      locked: index > currentIndex + 1,
      finished,
      // Placement starts the learner at their measured level; everything below
      // it stays open (never locked) and is labelled «تخطّيتَ».
      skipped: index < start,
    };
  });
}

/** The recommended unit is the one the recommended scenario belongs to. */
export function recommendedUnitId(
  level: CEFRLevel | undefined | null,
  goal?: UnitGoal | null,
  evidence?: LearnerEvidence,
): string | undefined {
  const recommendation = recommendScenario({
    level,
    goal,
    evidence: evidence || {
      completedIds: [],
      startedIds: [],
      studiedIds: [],
      practisedIds: [],
    },
  });
  if (!recommendation) return undefined;
  const units = orderedUnits(goal);
  return units.find((entry) => entry.scenarioIds.includes(recommendation.scenarioId))?.id;
}
