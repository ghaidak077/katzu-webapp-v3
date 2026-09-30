import { describe, expect, it } from 'vitest';
import {
  calculateIndependentAccuracy,
  getNextPromotionLevel,
  isEligibleForPromotion,
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

  // V21 Phase 1/2: A0 is a first-class level, so a from-zero learner who earns
  // three strong independent sessions walks the same ladder — A0 → A1 — instead
  // of being silently capped at the floor.
  it('walks the A0 learner up to A1 by the same rule, and B2 stays the ceiling', () => {
    expect(getNextPromotionLevel('A0')).toBe('A1');
    expect(isEligibleForPromotion('A0', [
      { cefrLevel: 'A0', independentSentences: 4, accuracyPercent: 80, timestamp: 1 },
      { cefrLevel: 'A0', independentSentences: 4, accuracyPercent: 75, timestamp: 2 },
      { cefrLevel: 'A0', independentSentences: 4, accuracyPercent: 78, timestamp: 3 },
    ])).toBe(true);
  });
});
