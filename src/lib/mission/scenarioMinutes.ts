import type { CEFRLevel } from '@/types/models';

/**
 * How long an action will take — one honest number, in minutes.
 *
 * The path used to say «10 دقائق» for every scenario regardless of level, and
 * the review row repeated the raw backlog count. A beginner reading a six-line
 * café scene and a B2 learner rehearsing a job interview are not the same
 * sitting, and a button that promises ten minutes for both makes the first one
 * feel long and the second one cheap.
 *
 * These are estimates, not measurements: they are deliberately coarse and live
 * in one pure function so the button, the card and their tests agree.
 */

/** A review sitting is capped: more than this is a backlog to show, not a task. */
export const REVIEW_SESSION_CAP = 10;

/** Roughly 18 seconds per review item, rounded up to whole minutes. */
const REVIEW_MINUTES_PER_ITEM = 0.3;

const LEVEL_MINUTES: Record<CEFRLevel, number> = {
  A0: 5,
  A1: 6,
  A2: 8,
  B1: 10,
  B2: 12,
};

/** Minutes for one scenario at a level. Unknown levels fall back to A1. */
export function scenarioMinutes(level: CEFRLevel | undefined): number {
  return LEVEL_MINUTES[level || 'A1'] ?? LEVEL_MINUTES.A1;
}

/**
 * Minutes for the capped review sitting. Zero due items is zero minutes; any
 * real sitting takes at least two, because opening, answering and closing is
 * never a one-minute action.
 */
export function reviewMinutes(dueCount: number): number {
  const n = Math.min(Math.max(0, Math.floor(Number(dueCount) || 0)), REVIEW_SESSION_CAP);
  if (n === 0) return 0;
  return Math.max(2, Math.ceil(n * REVIEW_MINUTES_PER_ITEM));
}

/** The backlog left out of the button, so the button never carries three digits. */
export function reviewBacklog(dueCount: number): number {
  return Math.max(0, Math.floor(Number(dueCount) || 0) - REVIEW_SESSION_CAP);
}
