import { describe, expect, it } from 'vitest';
import {
  PRACTICE_XP_MULTIPLIER,
  REAL_XP_MULTIPLIER,
  sessionXp,
} from '../src/lib/progress/sessionXp';

/**
 * The XP rule is a product promise ("a REAL conversation counts for more"), so it
 * is pinned here rather than left as an inline expression in the hook.
 */
describe('sessionXp', () => {
  it('keeps the historical practice award exactly', () => {
    // The pre-Stage-1D formula: accuracy*1.5 + (50 if fully independent else 25).
    expect(sessionXp({ accuracyPercent: 80, assistedSentences: 0, mode: 'practice' })).toBe(0 * 0 + Math.round(80 * 1.5) + 50);
    expect(sessionXp({ accuracyPercent: 80, assistedSentences: 2, mode: 'practice' })).toBe(Math.round(80 * 1.5) + 25);
  });

  it('pays more for the same performance in REAL mode', () => {
    const practice = sessionXp({ accuracyPercent: 70, assistedSentences: 0, mode: 'practice' });
    const real = sessionXp({ accuracyPercent: 70, assistedSentences: 0, mode: 'real' });
    expect(real).toBeGreaterThan(practice);
    expect(real).toBe(Math.round(practice * REAL_XP_MULTIPLIER));
    expect(PRACTICE_XP_MULTIPLIER).toBe(1);
  });

  it('treats an unmeasured (null) accuracy as zero rather than guessing', () => {
    expect(sessionXp({ accuracyPercent: null, assistedSentences: 0, mode: 'practice' })).toBe(50);
    expect(sessionXp({ accuracyPercent: null, assistedSentences: 1, mode: 'practice' })).toBe(25);
  });

  it('never returns a negative award', () => {
    expect(sessionXp({ accuracyPercent: 0, assistedSentences: 0, mode: 'real' })).toBe(75);
  });
});
