import { describe, expect, it } from 'vitest';
import type { CorrectionCategory } from '@/lib/conversation/germanChecker';
import {
  correctionNeedsOpening,
  correctionSummaryLabel,
} from '@/lib/conversation/correctionPresentation';

const errors = (...categories: CorrectionCategory[]) => categories.map((category) => ({ category }));

/**
 * Found on 2026-11-15: a learner who wrote «ist nicht gekommen» saw a collapsed
 * line reading «تصحيح صغير» — "small correction" — for a wrong verb form. The
 * card now opens itself for anything that changes grammar or meaning.
 */
describe('the correction card', () => {
  it('opens for a grammar or meaning fix', () => {
    expect(correctionNeedsOpening(errors('grammar'))).toBe(true);
    expect(correctionNeedsOpening(errors('meaning'))).toBe(true);
  });

  it('stays quiet for spelling and capitalisation only', () => {
    expect(correctionNeedsOpening(errors('spelling'))).toBe(false);
    expect(correctionNeedsOpening(errors('capitalisation', 'spelling'))).toBe(false);
  });

  it('labels the summary by what the correction actually is', () => {
    expect(correctionSummaryLabel(errors('grammar'))).toBe('تصحيح');
    expect(correctionSummaryLabel(errors('spelling'))).toBe('تصحيح صغير');
    expect(correctionSummaryLabel([])).toBe('تصحيح صغير');
  });
});
