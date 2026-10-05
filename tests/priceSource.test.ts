import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * One price, one source — and the absence of a second.
 *
 * What this defends is a launch-week property, not a refactor: a learner who
 * sees the pass on the landing page, opens the paywall and then the redemption
 * screen must be quoted the SAME amount, in the server's currency, or no amount
 * at all. The old path broke both halves of that — `/crypto/health` in USD next
 * to `/pricing` in EUR, with a hardcoded «5 دولار / شهر» behind it for the case
 * where the network failed.
 */

const getPricing = vi.fn();
vi.mock('@/lib/api/workerClient', () => ({
  workerClient: { getPricing: () => getPricing() },
}));

import {
  headlinePrice,
  loadPricing,
  priceFor,
  priceRowFor,
  resetPriceCache,
} from '../src/lib/offers/priceSource';

/** The catalogue `GET /pricing` answers with, standard group. */
const ANSWER = {
  prices: [
    { product: 'pass90', amountCents: 2900, currency: 'EUR', group: 'standard', cell: null },
    { product: 'monthly', amountCents: 1299, currency: 'EUR', group: 'standard', cell: null },
    { product: 'mock', amountCents: 900, currency: 'EUR', group: 'standard', cell: null },
  ],
  group: 'standard',
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

  it('renders the same amount for every product, in the server\'s own currency', async () => {
    getPricing.mockResolvedValue(ANSWER);
    const pricing = await loadPricing();
    // Whole euros print without cents, and 12.99 never rounds to 13 €.
    expect(priceFor(pricing, 'pass90')).toBe('29 €');
    expect(priceFor(pricing, 'monthly')).toBe('12,99 €');
    expect(priceFor(pricing, 'mock')).toBe('9 €');
  });

  it('leads the headline with the exam pass, and falls back to the subscription', async () => {
    getPricing.mockResolvedValue(ANSWER);
    expect(headlinePrice(await loadPricing())).toBe('29 €');

    getPricing.mockResolvedValue({
      ...ANSWER,
      prices: [{ product: 'monthly', amountCents: 1299, currency: 'EUR', group: 'standard', cell: null }],
    } as never);
    resetPriceCache();
    expect(headlinePrice(await loadPricing())).toBe('12,99 €');
  });

  it('prices a non-euro region in the currency the server chose, with no local conversion', async () => {
    getPricing.mockResolvedValue({
      prices: [{ product: 'pass90', amountCents: 1200, currency: 'EUR', group: 'special', cell: 1 }],
      group: 'special',
      cell: 1,
    } as never);
    const pricing = await loadPricing();
    expect(priceFor(pricing, 'pass90')).toBe('12 €');
    expect(pricing!.group).toBe('special');
    expect(pricing!.cell).toBe(1);
  });

  it('shows no price for a product the server did not price', async () => {
    getPricing.mockResolvedValue({
      prices: [{ product: 'pass90', amountCents: 2900, currency: 'EUR', group: 'standard', cell: null }],
      group: 'standard',
    } as never);
    const pricing = await loadPricing();
    expect(priceFor(pricing, 'pass90')).toBe('29 €');
    expect(priceFor(pricing, 'monthly')).toBeNull();
    expect(priceFor(pricing, 'yearly')).toBeNull();
    expect(priceRowFor(pricing, 'yearly')).toBeUndefined();
  });

  it('shows no price at all when the server cannot be reached', async () => {
    getPricing.mockResolvedValue(null);
    const pricing = await loadPricing();
    expect(pricing).toBeNull();
    expect(headlinePrice(pricing)).toBeNull();
    expect(priceFor(pricing, 'pass90')).toBeNull();
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
    expect(headlinePrice(await loadPricing())).toBe('29 €');
    expect(getPricing).toHaveBeenCalledTimes(2);
  });

  it('treats a malformed amount as no price rather than as zero', async () => {
    getPricing.mockResolvedValue({
      prices: [{ product: 'pass90', amountCents: 'free', currency: 'EUR', group: 'standard', cell: null }],
      group: 'standard',
    } as never);
    expect(priceFor(await loadPricing(), 'pass90')).toBeNull();
  });
});

describe('the two offers the modal shows', () => {
  it('offers the 3-month pass as recommended, and the month after it — nothing else', async () => {
    getPricing.mockResolvedValue(ANSWER);
    const pricing = await loadPricing();
    const modal = readFileSync('src/components/sheets/PaywallModal.tsx', 'utf8');
    // Read the declared list rather than restating it here, so the test fails
    // if a third tier is added to the modal.
    const products = [...modal.matchAll(/product: '([a-z0-9]+)'/g)].map((m) => m[1]);
    expect(products).toEqual(['pass90', 'monthly']);
    // And the recommended one is the pass, not the subscription.
    expect(modal).toMatch(/product: 'pass90',[\s\S]*recommended: true/);
    // Both are priced by the server, so both must be present in its answer.
    for (const product of products) expect(priceFor(pricing, product)).toMatch(/^\d/);
  });

  it('has no yearly or student tier anywhere in the modal', () => {
    // The declaration only — the file's own note about *why* there is no annual
    // tier must keep naming them, or the next run cannot see the decision.
    const modal = readFileSync('src/components/sheets/PaywallModal.tsx', 'utf8');
    const declared = modal.slice(modal.indexOf('const OFFERED_TIERS'));
    expect(declared.slice(0, declared.indexOf(']'))).not.toMatch(/yearly|student|سنوي|طلاب/);
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
      'src/features/marketing/LandingScreen.tsx',
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
    // number — `formatEuro(cents, 'EUR')` passes a code, not a price, and the
    // old «5 دولار / شهر» fallback matched the currency-then-number shape.
    const money = /[€$]\s*\d|\d\s*(?:€|\$|دولار|يورو)\b|\b(?:EUR|USD)\s*\d|\b(?:EUR|USD)\s*=\s*\d/;
    const offenders = appFiles().filter((f) => money.test(code(f)));
    expect(offenders).toEqual([]);
  });
});
