/**
 * Progressive reveal — the guided home's order of disclosure.
 *
 * Day 0 has one job: start. Every surface that describes a learner's history is
 * a claim about something they have not done yet, and the old home made six of
 * those claims at once (the reason the guided shape exists). So the facts arrive
 * in the order the learner earns them:
 *
 *   - the **habit panel** (three daily tasks) appears once one conversation has
 *     actually finished — it is a habit surface, not a first-run one;
 *   - the **review obligation** (the hero's review mission and the sheet's review
 *     row) waits for a finished session AND a day of distance (`dayNumber > 1`),
 *     so review is something the learner returns to, never something the first
 *     screen opens with;
 *   - the **progress facts** (capability card, weekly recap, level chip) wait for
 *     three finished conversations — two data points are an anecdote, three are a
 *     small history — unless the fact underneath is already actionable, like the
 *     last week of a paid month.
 *
 * One rule, one entry point: review is offered once. When today's mission IS the
 * review, the sheet does not repeat it (a second CTA is how a learner does
 * neither); when the mission is something else, the sheet is where the queue
 * stays reachable.
 *
 * All of it is pure, so `tests/journeyReveal.test.ts` can prove the thresholds
 * without a browser. With the flag off every predicate answers "revealed", which
 * is what keeps OFF the screen that shipped.
 */

/** Review needs at least the second day: the day of the first session is day 1. */
export const REVIEW_REVEAL_MIN_DAY = 2;

/** Progress facts need a small history, not one lucky episode. */
export const PROGRESS_REVEAL_MIN_SESSIONS = 3;

export interface ReviewRevealInput {
  /** The build's guided-home switch; OFF renders the shipped screen unchanged. */
  guided: boolean;
  /** The shared first-session fact (`lib/journey/firstSession`). */
  firstSessionDone: boolean;
  /** `context.dayNumber`: 1 on the day of the first session, 2 the next day. */
  dayNumber: number;
}

/** Is the review obligation (mission or sheet row) allowed on screen today? */
export function isReviewRevealed(input: ReviewRevealInput): boolean {
  if (!input.guided) return true;
  return input.firstSessionDone && input.dayNumber >= REVIEW_REVEAL_MIN_DAY;
}

export interface ProgressRevealInput {
  guided: boolean;
  /** Finished conversations, from the recorded sessions themselves. */
  sessionCount: number;
  /**
   * True when the fact is already actionable whatever the history says — the
   * paid month ending is the case the plan names. Actionable wins: hiding a
   * notice that needs a decision would be a worse screen, not a calmer one.
   */
  actionable?: boolean;
}

/** May the progress facts (capability, recap, level) render? */
export function isProgressRevealed(input: ProgressRevealInput): boolean {
  if (!input.guided) return true;
  if (input.actionable) return true;
  return input.sessionCount >= PROGRESS_REVEAL_MIN_SESSIONS;
}

export interface SheetReviewCountInput {
  /** Items the SRS says are due right now. */
  dueCount: number;
  /** Is today's mission already the review? Then the hero is the entry point. */
  missionIsReview: boolean;
  reviewRevealed: boolean;
}

/**
 * How many due items the sheet may list — 0 keeps the row off.
 *
 * The count is the sheet's copy, not a second decision: the row is hidden when
 * review has not been revealed, when nothing is due, or when the hero already
 * offers it (exactly one review entry point).
 */
export function sheetReviewCount(input: SheetReviewCountInput): number {
  if (!input.reviewRevealed) return 0;
  if (input.dueCount <= 0) return 0;
  if (input.missionIsReview) return 0;
  return input.dueCount;
}
