import { describe, expect, it } from 'vitest';
import {
  calculateIndependentAccuracy,
  countUsedVocabulary,
  getDisplayStreak,
  getNextPromotionLevel,
  isEligibleForPromotion,
  toLocalDateKey,
  updateStreak,
} from '@/features/report/metrics';

describe('honest conversation metrics', () => {
  it('returns no accuracy when there are no independent turns', () => {
    expect(calculateIndependentAccuracy([])).toBeNull();
  });

  it('calculates accuracy only from independent turns without a floor', () => {
    expect(
      calculateIndependentAccuracy([
        { hasError: true },
        { hasError: true },
        { hasError: false },
      ]),
    ).toBe(33);
  });

  it('requires three recent sessions with four independent turns each', () => {
    const sessions = [80, 80, 80].map((accuracy, index) => ({
      cefrLevel: 'A1' as const,
      independentSentences: index === 0 ? 3 : 4,
      accuracyPercent: accuracy,
      timestamp: index,
    }));

    expect(isEligibleForPromotion('A1', sessions)).toBe(false);
  });

  it('promotes sequentially only when the last three sessions average at least 75%', () => {
    const sessions = [70, 80, 80].map((accuracy, index) => ({
      cefrLevel: 'A1' as const,
      independentSentences: 4,
      accuracyPercent: accuracy,
      timestamp: index,
    }));

    expect(isEligibleForPromotion('A1', sessions)).toBe(true);
    expect(getNextPromotionLevel('A1')).toBe('A2');
    expect(getNextPromotionLevel('B1')).toBe('B2');
    expect(getNextPromotionLevel('B2')).toBeNull();
    expect(isEligibleForPromotion('B2', sessions)).toBe(false);
  });
});

describe('streak', () => {
  it('starts at 1 with no history', () => {
    expect(updateStreak({ streakDays: 0, lastActiveDate: null }, '2026-09-21')).toEqual({ streakDays: 1, lastActiveDate: '2026-09-21' });
  });

  it('keeps the streak on the same day and repairs a legacy 0', () => {
    expect(updateStreak({ streakDays: 4, lastActiveDate: '2026-09-21' }, '2026-09-21').streakDays).toBe(4);
    expect(updateStreak({ streakDays: 0, lastActiveDate: '2026-09-21' }, '2026-09-21').streakDays).toBe(1);
  });

  it('increments on consecutive days across month, year and DST boundaries', () => {
    expect(updateStreak({ streakDays: 2, lastActiveDate: '2026-09-20' }, '2026-09-21').streakDays).toBe(3);
    expect(updateStreak({ streakDays: 5, lastActiveDate: '2026-01-31' }, '2026-02-01').streakDays).toBe(6);
    expect(updateStreak({ streakDays: 9, lastActiveDate: '2026-12-31' }, '2027-01-01').streakDays).toBe(10);
    expect(updateStreak({ streakDays: 1, lastActiveDate: '2026-03-28' }, '2026-03-29').streakDays).toBe(2);
    expect(updateStreak({ streakDays: 1, lastActiveDate: '2026-03-29' }, '2026-03-30').streakDays).toBe(2);
    expect(updateStreak({ streakDays: 1, lastActiveDate: '2026-03-07' }, '2026-03-08').streakDays).toBe(2);
    expect(updateStreak({ streakDays: 1, lastActiveDate: '2026-10-25' }, '2026-10-26').streakDays).toBe(2);
  });

  it('resets to 1 after a gap and never resets when the clock goes backwards', () => {
    expect(updateStreak({ streakDays: 7, lastActiveDate: '2026-09-18' }, '2026-09-21').streakDays).toBe(1);
    const future = { streakDays: 7, lastActiveDate: '2026-09-25' };
    expect(updateStreak(future, '2026-09-21')).toEqual(future);
  });

  it('shows zero once a day has been missed', () => {
    expect(getDisplayStreak({ streakDays: 6, lastActiveDate: '2026-09-20' }, '2026-09-21')).toBe(6);
    expect(getDisplayStreak({ streakDays: 6, lastActiveDate: '2026-09-19' }, '2026-09-21')).toBe(0);
    expect(getDisplayStreak({ streakDays: 0, lastActiveDate: null }, '2026-09-21')).toBe(0);
  });

  it('formats local calendar dates', () => {
    expect(toLocalDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('countUsedVocabulary', () => {
  const vocab = [
    { german: 'Kaffee', plural: null },
    { german: 'Brötchen', plural: 'Brötchen' },
    { german: 'guten Tag', plural: null },
    { german: 'Tee', plural: null },
  ];

  it('counts distinct scenario words actually written, ignoring case and punctuation', () => {
    expect(countUsedVocabulary(['Ich möchte einen KAFFEE, bitte.', 'Guten Tag! Noch ein Kaffee.'], vocab)).toBe(2);
  });

  it('does not match substrings of other words', () => {
    expect(countUsedVocabulary(['Das Teeglas ist leer.'], vocab)).toBe(0);
  });

  it('returns 0 for no sentences', () => {
    expect(countUsedVocabulary([], vocab)).toBe(0);
  });
});
