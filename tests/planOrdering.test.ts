import { describe, expect, it } from 'vitest';
import { orderTiersByRecommendation, type PlanTier } from '../src/lib/utils/links';

/**
 * V24 Phase 4: the 3-month pass is the default and recommended tier. The
 * worker owns the recommendation (`recommended: true` on the quarterly tier);
 * the client only re-orders, so the display can never promise a tier the
 * checkout would not charge for.
 */

function tier(overrides: Partial<PlanTier> & { id: string }): PlanTier {
  return { months: 1, priceUsd: 5, label_ar: overrides.id, ...overrides };
}

describe('orderTiersByRecommendation (V24 Phase 4)', () => {
  it('puts the server-recommended tier first and keeps the rest in worker order', () => {
    const tiers: PlanTier[] = [
      tier({ id: 'monthly', months: 1 }),
      tier({ id: 'quarterly', months: 3, recommended: true }),
      tier({ id: 'yearly', months: 12 }),
    ];
    expect(orderTiersByRecommendation(tiers).map((p) => p.id)).toEqual(['quarterly', 'monthly', 'yearly']);
  });

  it('is a no-op when nothing is recommended (pre-Phase-4 worker)', () => {
    const tiers: PlanTier[] = [tier({ id: 'monthly' }), tier({ id: 'yearly' })];
    expect(orderTiersByRecommendation(tiers).map((p) => p.id)).toEqual(['monthly', 'yearly']);
  });

  it('does not mutate the input array', () => {
    const tiers: PlanTier[] = [tier({ id: 'a' }), tier({ id: 'b', recommended: true })];
    orderTiersByRecommendation(tiers);
    expect(tiers.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('leaves the student tier out of the decision — the caller filters it before ordering', () => {
    // The paywall filters requires_discount_code tiers before calling this;
    // if one slips through anyway, the ordering must still be stable.
    const tiers: PlanTier[] = [
      tier({ id: 'student', requires_discount_code: true }),
      tier({ id: 'quarterly', recommended: true }),
    ];
    expect(orderTiersByRecommendation(tiers).map((p) => p.id)).toEqual(['quarterly', 'student']);
  });
});
