import { describe, expect, it } from 'vitest';
import {
  PRACTICE_ESTIMATE_NOTICE_AR,
  debriefView,
  estimatePracticeScore,
  formatPartClock,
  type MockPartResult,
} from '../src/lib/mockexam/score';

/**
 * The practice estimate, the free tier and the clock.
 *
 * What must not be possible here: a number that claims to be an official grade,
 * a pass/fail verdict, a score computed from nothing, or a free learner seeing
 * the whole debrief.
 */

const part = (overrides: Partial<MockPartResult> = {}): MockPartResult => ({
  partIndex: 1,
  sentencesSpoken: 4,
  independentSentences: 2,
  accuracyPercent: 75,
  durationSeconds: 240,
  mistakes: [],
  ...overrides,
});

describe('the practice estimate', () => {
  it('says nothing rather than scoring an almost-silent learner', () => {
    const estimate = estimatePracticeScore([part({ sentencesSpoken: 1, independentSentences: 1 })]);
    expect(estimate.score).toBeNull();
    expect(estimate.band).toBeNull();
    expect(estimate.headlineAr).toMatch(/[؀-ۿ]/);
    // Never zero: zero is a score, and a score is a claim.
    expect(estimate.score).not.toBe(0);
  });

  it('computes every component from what the session measured', () => {
    const estimate = estimatePracticeScore([
      part({ partIndex: 1, sentencesSpoken: 5, independentSentences: 4, accuracyPercent: 80 }),
      part({ partIndex: 2, sentencesSpoken: 5, independentSentences: 2, accuracyPercent: 60 }),
      part({ partIndex: 3, sentencesSpoken: 5, independentSentences: 3, accuracyPercent: 70, durationSeconds: 300 }),
    ]);
    expect(estimate.components.independence).toBe(60); // 9 of 15
    expect(estimate.components.accuracy).toBe(70); // mean of 80/60/70
    expect(estimate.components.coverage).toBe(100); // all three parts
    expect(estimate.totals).toMatchObject({ sentences: 15, independent: 9, mistakes: 0 });
    expect(estimate.score).toBeGreaterThan(0);
    expect(estimate.score).toBeLessThanOrEqual(100);
  });

  it('never scores a part that was never attempted as covered', () => {
    const estimate = estimatePracticeScore([part({ partIndex: 1 })]);
    expect(estimate.components.coverage).toBe(33);
  });

  it('rewards independence over raw length', () => {
    const assisted = estimatePracticeScore([
      part({ partIndex: 1, sentencesSpoken: 6, independentSentences: 0 }),
      part({ partIndex: 2, sentencesSpoken: 6, independentSentences: 0 }),
      part({ partIndex: 3, sentencesSpoken: 6, independentSentences: 0 }),
    ]);
    const alone = estimatePracticeScore([
      part({ partIndex: 1, sentencesSpoken: 6, independentSentences: 6 }),
      part({ partIndex: 2, sentencesSpoken: 6, independentSentences: 6 }),
      part({ partIndex: 3, sentencesSpoken: 6, independentSentences: 6 }),
    ]);
    expect(alone.score!).toBeGreaterThan(assisted.score!);
    expect(assisted.components.independence).toBe(0);
  });

  it('carries the honest notice and marks itself unproven', () => {
    const estimate = estimatePracticeScore([part(), part({ partIndex: 2 }), part({ partIndex: 3 })]);
    expect(estimate.noticeAr).toBe(PRACTICE_ESTIMATE_NOTICE_AR);
    expect(estimate.noticeAr).toMatch(/محاكاة|تدريب/);
    expect(estimate.noticeAr).toMatch(/ليس درجة رسمية/);
    expect(estimate.unproven).toBe(true);
  });

  it('states no pass mark anywhere in its own wording', () => {
    const estimate = estimatePracticeScore([part(), part({ partIndex: 2 }), part({ partIndex: 3 })]);
    expect(estimate.headlineAr).not.toMatch(/ناجح|راسب|اجتزت|رسوب/);
    const json = JSON.stringify(estimate);
    expect(json).not.toMatch(/goethe|telc|ösd/i);
    expect(json).not.toMatch(/pass(ed)?|fail(ed)?\b/i);
  });

  it('survives an empty, malformed or ungraded mock', () => {
    for (const input of [[], null as never, [part({ accuracyPercent: null })]]) {
      const estimate = estimatePracticeScore(input as MockPartResult[]);
      expect(estimate.components.accuracy === null || typeof estimate.components.accuracy === 'number').toBe(true);
      expect(estimate.totals.sentences).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic — the same session always yields the same number', () => {
    const parts = [part({ partIndex: 1 }), part({ partIndex: 2 }), part({ partIndex: 3 })];
    expect(estimatePracticeScore(parts).score).toBe(estimatePracticeScore(parts).score);
  });
});

describe('the debrief gate', () => {
  const mistakes = [
    { original: 'Ich gehe ein Kaffee', corrected: 'Ich gehe einen Kaffee.' },
    { original: 'Ich habe 25 Jahre', corrected: 'Ich bin 25 Jahre alt.' },
    { original: 'Wohnung ist klein', corrected: 'Die Wohnung ist klein.' },
  ];

  it('gives a free learner the estimate and two corrections, and says how many are locked', () => {
    const view = debriefView(mistakes, { fullDebrief: false });
    expect(view.full).toBe(false);
    expect(view.visible).toHaveLength(2);
    expect(view.lockedCount).toBe(1);
  });

  it('shows everything to a learner the server said is entitled', () => {
    const view = debriefView(mistakes, { fullDebrief: true });
    expect(view.visible).toHaveLength(3);
    expect(view.lockedCount).toBe(0);
  });

  it('treats a missing server answer as free, never as paid', () => {
    expect(debriefView(mistakes, null).full).toBe(false);
    expect(debriefView(mistakes, undefined).visible).toHaveLength(2);
    expect(debriefView(mistakes, {}).full).toBe(false);
  });

  it('handles a learner with fewer mistakes than the free allowance', () => {
    const view = debriefView(mistakes.slice(0, 1), { fullDebrief: false });
    expect(view.visible).toHaveLength(1);
    expect(view.lockedCount).toBe(0);
  });
});

describe('the part clock', () => {
  it('reads like a clock and never rounds up to a full minute', () => {
    expect(formatPartClock(299)).toBe('4:59');
    expect(formatPartClock(300)).toBe('5:00');
    expect(formatPartClock(61)).toBe('1:01');
    expect(formatPartClock(9)).toBe('0:09');
  });

  it('floors at zero instead of showing a negative time', () => {
    expect(formatPartClock(-5)).toBe('0:00');
    expect(formatPartClock(Number.NaN)).toBe('0:00');
  });
});