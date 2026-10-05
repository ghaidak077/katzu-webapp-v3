import { describe, expect, it } from 'vitest';
import {
  PASS_CELLS,
  PRICES,
  PRODUCTS,
  SPECIAL_COUNTRIES,
  catalogueFor,
  experimentBucket,
  isRegionMismatch,
  priceFor,
  regionGroupFromCountry,
  regionGroupFromRequest,
} from '../cloudflare-pricing.js';

/**
 * Prices are a server decision. These tests exist so the two failure modes that
 * would cost money are impossible to ship silently: a learner reaching the
 * cheaper region table, and a price drifting away from the table.
 */
describe('regionGroupFromCountry', () => {
  it('prices each special country as special', () => {
    for (const code of SPECIAL_COUNTRIES) {
      expect(regionGroupFromCountry(code)).toBe('special');
    }
  });

  it('is case- and whitespace-insensitive, because the header is not', () => {
    expect(regionGroupFromCountry(' eg ')).toBe('special');
    expect(regionGroupFromCountry('Ps')).toBe('special');
  });

  it('treats an unknown country as standard, never as special', () => {
    // The dangerous direction is a spoofed or unmapped code reaching cheap prices.
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

describe('experimentBucket', () => {
  it('is stable for the same account, which is the whole point of a bucket', () => {
    for (const id of ['sub-abc', 'google-oauth2|12345', '', 'a']) {
      expect(experimentBucket(id)).toBe(experimentBucket(id));
    }
  });

  it('lands inside the cell range', () => {
    for (let i = 0; i < 50; i++) {
      const bucket = experimentBucket(`learner-${i}`);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(3);
    }
  });

  it('spreads different accounts across more than one cell', () => {
    // A bucket that never varies would silently report a flat experiment.
    const buckets = new Set(Array.from({ length: 40 }, (_, i) => experimentBucket(`learner-${i}`)));
    expect(buckets.size).toBeGreaterThan(1);
  });

  it('handles a degenerate cell count without dividing by zero', () => {
    expect(experimentBucket('x', 0)).toBe(0);
    expect(experimentBucket('x', -1)).toBe(0);
  });
});

describe('priceFor', () => {
  it('reads standard and special from the one table', () => {
    expect(priceFor({ group: 'standard', product: 'pass90' }).amountCents).toBe(PRICES.standard.pass90);
    expect(priceFor({ group: 'special', product: 'pass90' }).amountCents).toBe(PRICES.special.pass90);
    expect(priceFor({ group: 'special', product: 'mock' }).amountCents).toBe(PRICES.special.mock);
  });

  it('defaults to standard when no group is supplied', () => {
    expect(priceFor({ product: 'monthly' }).amountCents).toBe(PRICES.standard.monthly);
  });

  it('uses the experiment cell for pass90 only', () => {
    expect(priceFor({ group: 'standard', product: 'pass90', cell: 0 }).amountCents).toBe(1900);
    expect(priceFor({ group: 'special', product: 'pass90', cell: 2 }).amountCents).toBe(1900);
    // Monthly and Mock are not in the experiment.
    expect(priceFor({ group: 'standard', product: 'monthly', cell: 0 }).cell).toBeNull();
  });

  it('falls back to the plain price when the experiment is off', () => {
    expect(priceFor({ group: 'standard', product: 'pass90', cell: null }).amountCents).toBe(2900);
    // An out-of-range cell must not read past the end of the table.
    expect(priceFor({ group: 'standard', product: 'pass90', cell: 9 }).amountCents).toBe(2900);
  });

  it('returns null for a product we do not sell, rather than a price of 0', () => {
    // A free "annual" plan by accident is exactly the dark pattern to avoid.
    expect(priceFor({ product: 'annual' })).toBeNull();
    expect(priceFor({ product: 'lifetime' })).toBeNull();
  });

  it('marks every price unproven, because none of them has been sold at', () => {
    expect(priceFor({ product: 'pass90' }).unproven).toBe(true);
  });

  it('keeps the cell tables and the base table consistent', () => {
    // The middle cell of each group is the control price; if they drift apart the
    // experiment silently stops measuring what it claims to.
    expect(PASS_CELLS.standard[1]).toBe(PRICES.standard.pass90);
    expect(PASS_CELLS.special[1]).toBe(PRICES.special.pass90);
  });
});

describe('catalogueFor', () => {
  it('sells exactly the three decided products — no annual, no lifetime', () => {
    expect(PRODUCTS).toEqual(['pass90', 'monthly', 'mock']);
    expect(catalogueFor({ group: 'standard' }).prices.map((p) => p.product)).toEqual(PRODUCTS);
  });

  it('prices special below standard for every product', () => {
    for (const product of PRODUCTS) {
      expect(priceFor({ group: 'special', product }).amountCents).toBeLessThan(
        priceFor({ group: 'standard', product }).amountCents,
      );
    }
  });

  it('carries the group and cell so the client never has to decide them', () => {
    const cat = catalogueFor({ group: 'special', cell: 1 });
    expect(cat.group).toBe('special');
    expect(cat.cell).toBe(1);
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