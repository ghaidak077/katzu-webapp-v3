import { describe, expect, it } from 'vitest';
import {
  isProgressRevealed,
  isReviewRevealed,
  sheetReviewCount,
  PROGRESS_REVEAL_MIN_SESSIONS,
  REVIEW_REVEAL_MIN_DAY,
} from '../src/lib/journey/reveal';

/**
 * Step 7's thresholds, as a pure table.
 *
 * `e2e/guidedHomeMore.spec.ts` proves the rendered result; this proves the rule
 * itself, including the two edges a browser test would be slow to reach: the day
 * boundary (`dayNumber` 1 → 2) and the session boundary (2 → 3).
 */
describe('isReviewRevealed', () => {
  it('off is always revealed — the shipped screen keeps its review row and mission', () => {
    expect(isReviewRevealed({ guided: false, firstSessionDone: false, dayNumber: 1 })).toBe(true);
    expect(isReviewRevealed({ guided: false, firstSessionDone: true, dayNumber: 1 })).toBe(true);
  });

  it('guided day 0 (no finished session) never reveals review', () => {
    expect(isReviewRevealed({ guided: true, firstSessionDone: false, dayNumber: 1 })).toBe(false);
    // Even a context that counted days cannot reveal it without a session.
    expect(isReviewRevealed({ guided: true, firstSessionDone: false, dayNumber: 9 })).toBe(false);
  });

  it('the day of the first session is still day 1: review waits for tomorrow', () => {
    expect(isReviewRevealed({ guided: true, firstSessionDone: true, dayNumber: 1 })).toBe(false);
  });

  it('day 2 and later reveals it', () => {
    expect(REVIEW_REVEAL_MIN_DAY).toBe(2);
    expect(isReviewRevealed({ guided: true, firstSessionDone: true, dayNumber: 2 })).toBe(true);
    expect(isReviewRevealed({ guided: true, firstSessionDone: true, dayNumber: 7 })).toBe(true);
  });
});

describe('isProgressRevealed', () => {
  it('off is always revealed', () => {
    expect(isProgressRevealed({ guided: false, sessionCount: 0 })).toBe(true);
  });

  it('guided reveals the progress facts after three finished conversations', () => {
    expect(PROGRESS_REVEAL_MIN_SESSIONS).toBe(3);
    expect(isProgressRevealed({ guided: true, sessionCount: 0 })).toBe(false);
    expect(isProgressRevealed({ guided: true, sessionCount: 1 })).toBe(false);
    expect(isProgressRevealed({ guided: true, sessionCount: 2 })).toBe(false);
    expect(isProgressRevealed({ guided: true, sessionCount: 3 })).toBe(true);
  });

  it('an actionable fact is shown whatever the history says', () => {
    // The plan's example: the last week of a paid month. Hiding it to keep the
    // screen calm would cost the learner the one notice they must act on.
    expect(isProgressRevealed({ guided: true, sessionCount: 0, actionable: true })).toBe(true);
  });
});

describe('sheetReviewCount', () => {
  it('no row before review is revealed, or when nothing is due', () => {
    expect(sheetReviewCount({ dueCount: 4, missionIsReview: false, reviewRevealed: false })).toBe(0);
    expect(sheetReviewCount({ dueCount: 0, missionIsReview: false, reviewRevealed: true })).toBe(0);
  });

  it('exactly one review entry point: the hero wins when today’s mission is review', () => {
    expect(sheetReviewCount({ dueCount: 4, missionIsReview: true, reviewRevealed: true })).toBe(0);
    expect(sheetReviewCount({ dueCount: 4, missionIsReview: false, reviewRevealed: true })).toBe(4);
  });
});
