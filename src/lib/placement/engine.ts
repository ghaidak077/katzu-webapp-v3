import type { CEFRLevel } from '@/types/models';

/**
 * Adaptive placement: a 2-up / 1-down staircase.
 *
 * WHY A STAIRCASE AND NOT A SCORE
 * A fixed set of questions can only tell you how many answers someone got right,
 * which depends as much on the questions as on the learner. A staircase walks
 * difficulty towards the point where they stop succeeding, so the level it
 * settles on means something regardless of which items were drawn.
 *
 * It converges on roughly 70% success — the level where someone is stretched but
 * not lost — which is the right place to start teaching. Two correct answers are
 * needed to move up and one wrong to move down, so a lucky guess cannot promote
 * anyone but a careless slip is forgiven by the next two answers.
 *
 * Pure by design: the level a learner is placed at decides what they are taught,
 * and that must be reproducible and testable rather than a screen's side effect.
 */

export const CEFR_LADDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];
export const PLACEMENT_START_LEVEL: CEFRLevel = 'A2';
/** Correct answers at one level before moving up. */
export const PROMOTE_AFTER = 2;
/** Below this, the estimate is too thin to be worth reporting. */
export const MIN_ITEMS = 6;
/** The check must always end. */
export const MAX_ITEMS = 14;
/** Wrong answers in a row at the floor: they are a beginner, stop asking. */
const FLOOR_WRONG_STREAK = 3;
/** Responses examined when judging whether the staircase has settled. */
const CONVERGENCE_WINDOW = 4;

export type PlacementKind = 'vocab' | 'phrase';

export interface PlacementResponse {
  kind: PlacementKind;
  level: CEFRLevel;
  correct: boolean;
  wasListening: boolean;
  /** Source content row id, so missed items can be scheduled for review. */
  sourceId: number;
}

export interface PlacementState {
  level: CEFRLevel;
  responses: PlacementResponse[];
  correctAtLevel: number;
  wrongStreakAtFloor: number;
}

export function createPlacementState(startLevel: CEFRLevel = PLACEMENT_START_LEVEL): PlacementState {
  return { level: startLevel, responses: [], correctAtLevel: 0, wrongStreakAtFloor: 0 };
}

function step(level: CEFRLevel, direction: 1 | -1): CEFRLevel {
  const index = CEFR_LADDER.indexOf(level);
  const next = Math.min(CEFR_LADDER.length - 1, Math.max(0, index + direction));
  return CEFR_LADDER[next];
}

export function applyPlacementResponse(state: PlacementState, response: PlacementResponse): PlacementState {
  const responses = [...state.responses, response];
  const atFloor = state.level === CEFR_LADDER[0];

  if (response.correct) {
    const correctAtLevel = state.correctAtLevel + 1;
    const shouldPromote = correctAtLevel >= PROMOTE_AFTER && state.level !== CEFR_LADDER[CEFR_LADDER.length - 1];
    if (!shouldPromote) {
      return { ...state, responses, correctAtLevel, wrongStreakAtFloor: 0 };
    }
    return { level: step(state.level, 1), responses, correctAtLevel: 0, wrongStreakAtFloor: 0 };
  }

  // One wrong answer steps down; at the floor there is nowhere to go, so count
  // the failure instead and stop once it is clearly a beginner.
  const wrongStreakAtFloor = atFloor ? state.wrongStreakAtFloor + 1 : 0;
  if (atFloor) {
    return { ...state, responses, correctAtLevel: 0, wrongStreakAtFloor };
  }
  return { level: step(state.level, -1), responses, correctAtLevel: 0, wrongStreakAtFloor: 0 };
}

/**
 * Settled means the recent questions were all within one step of each other.
 * A staircase at a learner's real level oscillates between two neighbours, so
 * requiring a *static* level would never converge and would always run the full
 * question budget — more questions, not more accuracy.
 */
export function isConverged(state: PlacementState, window: number = CONVERGENCE_WINDOW): boolean {
  if (state.responses.length < window) return false;
  const recent = state.responses.slice(-window).map((response) => CEFR_LADDER.indexOf(response.level));
  return Math.max(...recent) - Math.min(...recent) <= 1;
}

export function isPlacementFinished(state: PlacementState): boolean {
  if (state.responses.length >= MAX_ITEMS) return true;
  // Never place someone off three or four answers; a thin estimate is worse
  // than a slightly longer check.
  if (state.responses.length < MIN_ITEMS) return false;
  if (state.wrongStreakAtFloor >= FLOOR_WRONG_STREAK) return true;
  return isConverged(state);
}

export function placementEstimate(state: PlacementState): CEFRLevel {
  return state.level;
}

function countCorrectAt(state: PlacementState, level: CEFRLevel): { correct: number; total: number } {
  const atLevel = state.responses.filter((response) => response.level === level);
  return { correct: atLevel.filter((response) => response.correct).length, total: atLevel.length };
}

export interface PlacementResult {
  level: CEFRLevel;
  headlineAr: string;
  detailAr: string;
  /** Correct on the listening items, used to describe the honest skill split. */
  listeningCorrect: number;
  listeningTotal: number;
}

/**
 * The explanation matters as much as the level: "B1" tells a learner nothing,
 * while "you handled everyday sentences but the compound tenses are not there
 * yet" tells them what the app is going to do about it.
 */
export function describePlacementResult(state: PlacementState): PlacementResult {
  const level = placementEstimate(state);
  const index = CEFR_LADDER.indexOf(level);
  const listening = state.responses.filter((response) => response.wasListening);
  const listeningCorrect = listening.filter((response) => response.correct).length;

  // Includes the resting level itself: a learner who answered every A2 question
  // correctly *is* handling A2, and saying otherwise would understate them.
  const solidLevels = CEFR_LADDER.slice(0, index + 1).filter((candidate) => {
    const { correct, total } = countCorrectAt(state, candidate);
    return total > 0 && correct === total;
  });
  const above = CEFR_LADDER[index + 1];
  const aboveStats = above ? countCorrectAt(state, above) : null;

  const strengthAr = solidLevels.length
    ? `أجبت صحيحاً على كل أسئلة ${solidLevels.join(' و ')} التي واجهتها`
    : 'لم تُثبت بعد مستوى كاملاً، لذا سنبني من الأساس';

  const ceilingAr =
    aboveStats && aboveStats.total > 0
      ? `، وتوقفت عند ${above} — وهناك سنعمل`
      : index >= CEFR_LADDER.length - 1
        ? '، وأسئلتنا لم تعد تقيسك — نبدأ من B2'
        : '، وسنبدأ من هنا ونبني صعوداً';

  const listeningAr =
    listening.length === 0
      ? ''
      : listeningCorrect === listening.length
        ? ' وأذنك تلتقط الألمانية المنطوقة جيداً.'
        : ` وفهمت ${listeningCorrect} من ${listening.length} من الجمل المسموعة — سنتدرب على الاستماع.`;

  return {
    level,
    headlineAr: `مستواك التقديري: ${level}`,
    detailAr: `${strengthAr}${ceilingAr}.${listeningAr}`,
    listeningCorrect,
    listeningTotal: listening.length,
  };
}

/** The items the learner missed, ready to become their first review session. */
export function missedPlacementSourceIds(state: PlacementState): number[] {
  return [
    ...new Set(
      state.responses
        .filter((response) => !response.correct && Number.isFinite(response.sourceId))
        .map((response) => response.sourceId),
    ),
  ];
}
