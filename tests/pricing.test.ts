import { describe, expect, it } from 'vitest';
import pricingConfig from '../pricing.config.json';
import {
  ACTIVATION_HOURS,
  FREE_LESSONS_PER_MONTH,
  FOUNDING_CAP,
  PLANS,
  PLAN_BY_ID,
  PRODUCTS,
  PRODUCT_DURATION_DAYS,
  RECOMMENDED_PRODUCT,
  REFUND_DAYS,
  REFUND_PLAN_IDS,
  SPECIAL_COUNTRIES,
  catalogueFor,
  daysUntilExpiry,
  entitlementExpiryFor,
  isEntitlementActive,
  mockCreditsRemaining,
  shouldRemindAboutExpiry,
  isRegionMismatch,
  priceFor,
  regionGroupFromCountry,
  regionGroupFromRequest,
} from '../cloudflare-pricing.js';

/**
 * Prices are a server decision. These tests exist so the two failure modes that
 * would cost money are impossible to ship silently: a price drifting away from
 * the config, and a plan that is sold without a duration or a refund rule.
 */
describe('regionGroupFromCountry', () => {
  it('labels each special country as special', () => {
    for (const code of SPECIAL_COUNTRIES) {
      expect(regionGroupFromCountry(code)).toBe('special');
    }
  });

  it('is case- and whitespace-insensitive, because the header is not', () => {
    expect(regionGroupFromCountry(' eg ')).toBe('special');
    expect(regionGroupFromCountry('Ps')).toBe('special');
  });

  it('treats an unknown country as standard, never as special', () => {
    // The dangerous direction is a spoofed or unmapped code reaching the wrong
    // payment instructions.
    for (const code of ['DE', 'US', 'ZZ', 'XX', 'NLD']) {
      expect(regionGroupFromCountry(code)).toBe('standard');
    }
  });

  it('treats a missing or empty header as standard', () => {
    expect(regionGroupFromCountry(undefined)).toBe('standard');
    expect(regionGroupFromCountry(null)).toBe('standard');
    expect(regionGroupFromCountry('')).toBe('standard');
    expect(regionGroupFromCountry('   ')).toBe('standard');
  });
});

describe('regionGroupFromRequest', () => {
  const withCountry = (value) => ({ headers: { get: () => value } });

  it('reads the Cloudflare country header', () => {
    expect(regionGroupFromRequest(withCountry('EG'))).toBe('special');
  });

  it('falls back to standard when the header is absent', () => {
    expect(regionGroupFromRequest(withCountry(null))).toBe('standard');
    expect(regionGroupFromRequest({ headers: { get: () => undefined } })).toBe('standard');
  });

  it('does not throw on a request with no headers at all', () => {
    expect(regionGroupFromRequest({})).toBe('standard');
    expect(regionGroupFromRequest(undefined)).toBe('standard');
  });
});

describe('the plan table', () => {
  it('sells exactly the four config plans, in config order', () => {
    expect(PRODUCTS).toEqual(['monthly', 'quarterly', 'halfyear', 'yearly']);
    expect(PRODUCTS).toEqual(pricingConfig.plans.map((p) => p.id));
  });

  it('reads every amount from pricing.config.json, in integer cents', () => {
    for (const plan of pricingConfig.plans) {
      const row = priceFor({ product: plan.id });
      expect(row.amountCents).toBe(Math.round(plan.foundingUsd * 100));
      expect(row.futureCents).toBe(Math.round(plan.futureUsd * 100));
      expect(Number.isInteger(row.amountCents)).toBe(true);
      expect(row.currency).toBe('USD');
    }
  });

  it('publishes a future price above every founding price', () => {
    // A struck-through price that is not higher would be a fake discount.
    for (const plan of PLANS) {
      expect(plan.futureCents).toBeGreaterThan(plan.amountCents);
    }
  });

  it('prices each longer plan below the cost of stacking the shorter one', () => {
    const monthly = PLAN_BY_ID.monthly.amountCents;
    expect(PLAN_BY_ID.quarterly.amountCents).toBeLessThan(monthly * 3);
    expect(PLAN_BY_ID.halfyear.amountCents).toBeLessThan(monthly * 6);
    expect(PLAN_BY_ID.yearly.amountCents).toBeLessThan(monthly * 12);
  });

  it('pre-selects exactly one plan, and it is the 6-month one', () => {
    expect(RECOMMENDED_PRODUCT).toBe('halfyear');
    expect(PLANS.filter((plan) => plan.recommended)).toHaveLength(1);
  });

  it('returns null for an id we do not sell, rather than a price of 0', () => {
    // A free plan by accident is exactly the dark pattern to avoid.
    expect(priceFor({ product: 'annual' })).toBeNull();
    expect(priceFor({ product: 'pass90' })).toBeNull();
    expect(priceFor({ product: 'mock' })).toBeNull();
    expect(priceFor({ product: 'lifetime' })).toBeNull();
  });

  it('marks every price unproven, because none of them has been sold at', () => {
    expect(priceFor({ product: 'yearly' }).unproven).toBe(true);
  });
});

describe('catalogueFor', () => {
  it('carries the four plans and the published rules', () => {
    const cat = catalogueFor({ group: 'special' });
    expect(cat.prices.map((p) => p.product)).toEqual(PRODUCTS);
    expect(cat.group).toBe('special');
    expect(cat.foundingCap).toBe(FOUNDING_CAP);
    expect(cat.foundingEndsOn).toBe('2027-01-31');
    expect(cat.refundDays).toBe(REFUND_DAYS);
    expect(cat.refundPlanIds).toEqual(REFUND_PLAN_IDS);
    expect(cat.activationHours).toBe(ACTIVATION_HOURS);
    expect(cat.freeLessonsPerMonth).toBe(FREE_LESSONS_PER_MONTH);
  });

  it('does not move the price by region — one table for everyone', () => {
    const standard = catalogueFor({ group: 'standard' });
    const special = catalogueFor({ group: 'special' });
    expect(special.prices).toEqual(standard.prices);
  });

  it('refunds the 3-, 6- and 12-month plans and never the 1-month one', () => {
    expect(REFUND_PLAN_IDS).toEqual(['quarterly', 'halfyear', 'yearly']);
    expect(REFUND_PLAN_IDS).not.toContain('monthly');
    for (const id of REFUND_PLAN_IDS) expect(PRODUCTS).toContain(id);
  });

  it('promises activation within 12 hours, not a day', () => {
    expect(ACTIVATION_HOURS).toBe(12);
    expect(FREE_LESSONS_PER_MONTH).toBe(3);
  });
});

describe('isRegionMismatch', () => {
  it('flags a code redeemed in a different region', () => {
    expect(isRegionMismatch('special', 'standard')).toBe(true);
    expect(isRegionMismatch('standard', 'special')).toBe(true);
  });

  it('does not flag a matching region', () => {
    expect(isRegionMismatch('special', 'special')).toBe(false);
    expect(isRegionMismatch('standard', 'standard')).toBe(false);
  });

  it('does not flag an unlabelled code', () => {
    // Legacy codes carry no region and must not be reported as mismatches.
    expect(isRegionMismatch(null, 'special')).toBe(false);
    expect(isRegionMismatch(undefined, 'standard')).toBe(false);
  });
});

/**
 * Expiry is the boundary that quietly costs someone paid months, so it is
 * pinned at the exact millisecond rather than approximated.
 */
describe('entitlement duration and expiry', () => {
  const T0 = Date.parse('2026-10-05T00:00:00.000Z');
  const DAY = 86400000;

  it('maps each plan to its nominal days', () => {
    expect(PRODUCT_DURATION_DAYS).toEqual({
      monthly: 30,
      quarterly: 90,
      halfyear: 180,
      yearly: 365,
    });
  });

  it('gives a quarterly plan 90 days and a monthly one 30', () => {
    expect(entitlementExpiryFor('quarterly', T0)).toBe('2027-01-03T00:00:00.000Z');
    expect(entitlementExpiryFor('monthly', T0)).toBe('2026-11-04T00:00:00.000Z');
  });

  it('gives an unknown id no expiry rather than a sentinel date', () => {
    expect(entitlementExpiryFor('mock', T0)).toBeNull();
    expect(entitlementExpiryFor('not_a_product', T0)).toBeNull();
  });

  it('is live right up to the expiry and over at the exact millisecond', () => {
    const record = { expiresAt: entitlementExpiryFor('quarterly', T0) };
    const expiry = Date.parse(record.expiresAt);
    expect(isEntitlementActive(record, expiry - 1)).toBe(true);
    expect(isEntitlementActive(record, expiry)).toBe(false);
    expect(isEntitlementActive(record, expiry + 1)).toBe(false);
  });

  it('treats a missing or unparseable expiry as not active', () => {
    expect(isEntitlementActive(null)).toBe(false);
    expect(isEntitlementActive({})).toBe(false);
    expect(isEntitlementActive({ expiresAt: 'not-a-date' })).toBe(false);
  });

  it('counts whole days left and never goes negative', () => {
    const expiresAt = entitlementExpiryFor('quarterly', T0);
    expect(daysUntilExpiry(expiresAt, T0)).toBe(90);
    expect(daysUntilExpiry(expiresAt, T0 + 89 * DAY)).toBe(1);
    expect(daysUntilExpiry(expiresAt, T0 + 200 * DAY)).toBe(0);
    expect(daysUntilExpiry(null)).toBeNull();
  });

  it('warns only inside the 7-day window', () => {
    const record = { expiresAt: entitlementExpiryFor('quarterly', T0) };
    expect(shouldRemindAboutExpiry(record, T0)).toBe(false);
    // 8 whole days left is outside the window; 7 is the first day inside it.
    expect(shouldRemindAboutExpiry(record, T0 + 82 * DAY)).toBe(false);
    expect(shouldRemindAboutExpiry(record, T0 + 83 * DAY)).toBe(true);
    expect(shouldRemindAboutExpiry(record, T0 + 84 * DAY)).toBe(true);
    // Already lapsed: do not tell someone they are about to expire.
    expect(shouldRemindAboutExpiry(record, T0 + 90 * DAY)).toBe(false);
  });

  it('never reports negative mock credits', () => {
    expect(mockCreditsRemaining({ mockCredits: 2 })).toBe(2);
    expect(mockCreditsRemaining({ mockCredits: -3 })).toBe(0);
    expect(mockCreditsRemaining({})).toBe(0);
    expect(mockCreditsRemaining(null)).toBe(0);
  });
});
