import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * One price, one source — and the absence of a second.
 *
 * What this defends is a launch-week property, not a refactor: a learner who
 * sees the founding price on the landing page, opens the paywall and then the
 * redemption screen must be quoted the SAME amount, in the server's currency, or
 * no amount at all. The old path broke both halves of that — `/crypto/health` in
 * USD next to `/pricing` in EUR, with a hardcoded «5 دولار / شهر» behind it for
 * the case where the network failed.
 *
 * The offer is now four plans with a founding price and a published future
 * price, so the table has more to carry. None of it is allowed to live here: the
 * figures below are the server's answer, read back.
 */

const getPricing = vi.fn();
vi.mock('@/lib/api/workerClient', () => ({
  workerClient: { getPricing: () => getPricing() },
}));

import {
  PRICING_NOT_CONFIGURED_AR,
  PRICING_UNAVAILABLE_AR,
  headlinePrice,
  loadPricing,
  priceFor,
  priceSourceConfigured,
  priceRowFor,
  resetPriceCache,
} from '../src/lib/offers/priceSource';

/**
 * "This build has no server address" and "the server did not answer" are
 * different problems with different fixes, and the paywall used to say the same
 * sentence for both. It cost real time once: a reused dev server started from an
 * empty `VITE_WORKER_URL` made the price assertions fail as if the paywall had
 * dropped the price.
 */
describe('the two reasons a price can be missing', () => {
  it('a build with no worker origin is a configuration fact, not a retry', () => {
    expect(priceSourceConfigured('')).toBe(false);
    expect(priceSourceConfigured('   ')).toBe(false);
    expect(priceSourceConfigured('https://worker.example')).toBe(true);
  });

  it('names each state in its own words', () => {
    expect(PRICING_NOT_CONFIGURED_AR).not.toBe(PRICING_UNAVAILABLE_AR);
    expect(PRICING_UNAVAILABLE_AR).toBe('السعر غير متاح الآن');
  });
});

/** The catalogue `GET /pricing` answers with, standard group. */
const ANSWER = {
  prices: [
    {
      product: 'monthly',
      amountCents: 1499,
      futureCents: 2999,
      months: 1,
      recommended: false,
      currency: 'USD',
      group: 'standard',
    },
    {
      product: 'quarterly',
      amountCents: 2999,
      futureCents: 5999,
      months: 3,
      recommended: false,
      currency: 'USD',
      group: 'standard',
    },
    {
      product: 'halfyear',
      amountCents: 4999,
      futureCents: 9999,
      months: 6,
      recommended: true,
      currency: 'USD',
      group: 'standard',
    },
    {
      product: 'yearly',
      amountCents: 9999,
      futureCents: 19999,
      months: 12,
      recommended: false,
      currency: 'USD',
      group: 'standard',
    },
  ],
  group: 'standard',
  foundingCap: 1000,
  foundingEndsOn: '2027-01-31',
  refundDays: 7,
  refundPlanIds: ['quarterly', 'halfyear', 'yearly'],
  activationHours: 12,
  freeLessonsPerMonth: 3,
} as never;

beforeEach(() => {
  getPricing.mockReset();
  resetPriceCache();
});

afterEach(() => {
  resetPriceCache();
});

describe('the price table every surface reads', () => {
  it('answers one request for concurrent callers, so two screens cannot disagree', async () => {
    getPricing.mockResolvedValue(ANSWER);
    const [a, b, c] = await Promise.all([loadPricing(), loadPricing(), loadPricing()]);
    expect(getPricing).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('reuses the answer for the rest of the page load', async () => {
    getPricing.mockResolvedValue(ANSWER);
    await loadPricing();
    await loadPricing();
    expect(getPricing).toHaveBeenCalledTimes(1);
  });

  it("renders all four plans at the server's own amount, cents and all", async () => {
    getPricing.mockResolvedValue(ANSWER);
    const pricing = await loadPricing();
    // 14.99 must never round to $15, and a whole-dollar amount keeps no ".00".
    expect(priceFor(pricing, 'monthly')).toBe('$14.99');
    expect(priceFor(pricing, 'quarterly')).toBe('$29.99');
    expect(priceFor(pricing, 'halfyear')).toBe('$49.99');
    expect(priceFor(pricing, 'yearly')).toBe('$99.99');
  });

  it('carries the future price and the month count beside the founding price', async () => {
    getPricing.mockResolvedValue(ANSWER);
    const pricing = await loadPricing();
    const yearly = priceRowFor(pricing, 'yearly');
    expect(yearly?.futureCents).toBe(19999);
    expect(yearly?.months).toBe(12);
    // The struck price is a real published price, never a made-up anchor.
    for (const product of ['monthly', 'quarterly', 'halfyear', 'yearly']) {
      const row = priceRowFor(pricing, product);
      expect(row!.futureCents).toBeGreaterThan(row!.amountCents);
    }
  });

  it('pre-selects exactly one plan, and the server says which', async () => {
    getPricing.mockResolvedValue(ANSWER);
    const pricing = await loadPricing();
    const recommended = pricing!.prices.filter((row) => row.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0].product).toBe('halfyear');
  });

  it('leads the headline with the entry price, the smallest commitment', async () => {
    getPricing.mockResolvedValue(ANSWER);
    expect(headlinePrice(await loadPricing())).toBe('$14.99');
  });

  it('serves the rules the page and the FAQ both state', async () => {
    getPricing.mockResolvedValue(ANSWER);
    const pricing = await loadPricing();
    expect(pricing!.foundingCap).toBe(1000);
    expect(pricing!.foundingEndsOn).toBe('2027-01-31');
    expect(pricing!.refundDays).toBe(7);
    expect(pricing!.refundPlanIds).toEqual(['quarterly', 'halfyear', 'yearly']);
    expect(pricing!.activationHours).toBe(12);
  });

  it('keeps the region for instructions and analytics, but not for the price', async () => {
    getPricing.mockResolvedValue({
      ...(ANSWER as Record<string, unknown>),
      group: 'special',
      prices: (ANSWER as any).prices,
    } as never);
    const pricing = await loadPricing();
    expect(pricing!.group).toBe('special');
    expect(priceFor(pricing, 'yearly')).toBe('$99.99');
  });

  it('shows no price for a product the server did not price', async () => {
    getPricing.mockResolvedValue({
      prices: [
        { product: 'monthly', amountCents: 1499, months: 1, currency: 'USD', group: 'standard' },
      ],
      group: 'standard',
    } as never);
    const pricing = await loadPricing();
    expect(priceFor(pricing, 'monthly')).toBe('$14.99');
    expect(priceFor(pricing, 'yearly')).toBeNull();
    expect(priceRowFor(pricing, 'yearly')).toBeUndefined();
    // A plan id we no longer sell stays unpriced rather than free.
    expect(priceFor(pricing, 'pass90')).toBeNull();
  });

  it('shows no price at all when the server cannot be reached', async () => {
    getPricing.mockResolvedValue(null);
    const pricing = await loadPricing();
    expect(pricing).toBeNull();
    expect(headlinePrice(pricing)).toBeNull();
    expect(priceFor(pricing, 'monthly')).toBeNull();
  });

  it('shows no price when the call throws', async () => {
    getPricing.mockRejectedValue(new Error('offline'));
    expect(headlinePrice(await loadPricing())).toBeNull();
  });

  it('does not cache a failure, so a paywall can recover on the next mount', async () => {
    getPricing.mockResolvedValueOnce(null).mockResolvedValue(ANSWER);
    expect(await loadPricing()).toBeNull();
    expect(getPricing).toHaveBeenCalledTimes(1);
    // A blank paywall for the rest of the session would be a worse defect than
    // a brief one: the second visit is allowed to ask again.
    expect(headlinePrice(await loadPricing())).toBe('$14.99');
    expect(getPricing).toHaveBeenCalledTimes(2);
  });

  it('treats a malformed amount as no price rather than as zero', async () => {
    getPricing.mockResolvedValue({
      prices: [
        { product: 'monthly', amountCents: 'free', currency: 'USD', group: 'standard' },
      ],
      group: 'standard',
    } as never);
    expect(priceFor(await loadPricing(), 'monthly')).toBeNull();
  });
});

describe('the four plans the modal shows', () => {
  it('reads the plan list from the one table instead of restating it', async () => {
    getPricing.mockResolvedValue(ANSWER);
    const pricing = await loadPricing();
    const modal = readFileSync('src/components/sheets/PaywallModal.tsx', 'utf8');
    // The declaration maps PLANS; a second hand-written tier list inside the
    // modal is exactly the drift this change removes.
    const declared = modal.slice(modal.indexOf('const OFFERED_TIERS'));
    const block = declared.slice(0, declared.indexOf('}));'));
    expect(block).toContain('PLANS.map');
    expect(block).not.toMatch(/pass90|student|سنوي|طلاب/);
    // Every product the modal offers is priced by the server.
    for (const product of ['monthly', 'quarterly', 'halfyear', 'yearly']) {
      expect(priceFor(pricing, product)).toMatch(/^\$/);
    }
  });

  it('badges the 6-month plan, not the cheapest or the longest', () => {
    const modal = readFileSync('src/components/sheets/PaywallModal.tsx', 'utf8');
    expect(modal).toContain('recommended');
    expect(modal).toMatch(/BEST_VALUE_AR/);
  });
});

describe('no second price source survives in the app', () => {
  /** Every user-facing file: not tests, not the worker, not docs. */
  function appFiles(dir = 'src'): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) out.push(...appFiles(path));
      else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
    }
    return out;
  }

  /**
   * The runnable source, with comments removed.
   *
   * A file that explains *why* the dollar path is gone must keep saying so — the
   * explanation is the only thing stopping the next run from re-adding it. So
   * these scans read code, not prose, which is also what a user-facing path
   * actually executes.
   */
  function code(file: string): string {
    return readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it('no app file reads a price off /crypto/health', () => {
    const offenders = appFiles().filter((f) => /crypto\/health/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('no app file mentions the price fields the check-out used to mirror', () => {
    const offenders = appFiles().filter((f) => /priceUsd|FALLBACK_PRICE_LABEL|getProPriceLabel/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('every surface that shows money reads the one shared source', () => {
    const surfaces = [
      'src/features/offers/PaywallScreen.tsx',
      'src/components/sheets/PaywallModal.tsx',
      'src/features/auth/SubscriptionRedemptionScreen.tsx',
    ];
    for (const file of surfaces) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must read prices from priceSource`).toMatch(/usePricing|from '@\/lib\/offers\/priceSource'/);
      // The old shape was a local `useState` seeded with a fallback string; the
      // only state a price surface keeps now is null-until-the-server-answers.
      expect(source, `${file} must not seed a price into state`).not.toMatch(/useState(?:<[^>]*>)?\(\s*FALLBACK/);
    }
  });

  it('hardcodes no currency amount in app code', () => {
    // A literal amount in code is the thing this change exists to remove. Only
    // money shapes are matched, and only where the currency sits against the
    // number — `formatUsd(cents)` passes a value, not a price, and the old
    // «5 دولار / شهر» fallback matched the currency-then-number shape.
    const money = /[€$]\s*\d|\d\s*(?:€|\$|دولار|يورو)\b|\b(?:EUR|USD)\s*\d|\b(?:EUR|USD)\s*=\s*\d/;
    const offenders = appFiles().filter((f) => money.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('keeps every price surface free of the retired offer', () => {
    // $60 a year, $42, the KATZU26 coupon and the "limited time" label are gone
    // from shipped copy, not just from the pages the owner happens to open.
    const retired = /\$60\b|\$42\b|KATZU26|limited[- ]time|لفترة محدودة|24 ساعة|60 دولار/;
    const offenders = appFiles().filter((f) => retired.test(code(f)));
    expect(offenders).toEqual([]);
  });
});
