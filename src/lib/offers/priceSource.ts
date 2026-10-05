/**
 * The one price table, fetched once and shared by every surface that shows money.
 *
 * WHY THIS IS NOT IN `pricing.ts`
 * That module is pure on purpose — its test runs in node beside the worker's own
 * pricing table, with no DOM and no Dexie. A network cache and a React hook
 * cannot live there without dragging the whole client into a pure test, so the
 * retrieval sits here and `pricing.ts` keeps owning what a price *means*.
 *
 * WHAT IT REFUSES TO DO
 * It never invents, defaults, rounds or translates a number. `null` from
 * `/pricing` means the server did not say, and every caller renders no price and
 * no buy button — the same rule `PaywallScreen` has always used. A failure is
 * NOT cached: a paywall that once could not reach the server must be able to
 * recover on the next mount instead of being blank for the rest of the session.
 */

import { useEffect, useState } from 'react';
import { workerClient } from '@/lib/api/workerClient';
import { priceLabel } from './pricing';

/** One row of `GET /pricing`, exactly as the server sent it. */
export interface PriceRow {
  product: string;
  amountCents: number;
  currency: string;
  group: string;
  cell: number | null;
}

export interface PricingAnswer {
  prices: PriceRow[];
  group: string;
  currency?: string;
  cell?: number | null;
  unproven?: boolean;
  experimentEnabled?: boolean;
}

/** Only a success is remembered; see the module note on failure. */
let cached: PricingAnswer | null = null;
let resolvedOnce = false;
let inflight: Promise<PricingAnswer | null> | null = null;

/** Forgets the cached answer. Tests, and nothing else. */
export function resetPriceCache(): void {
  cached = null;
  resolvedOnce = false;
  inflight = null;
}

/**
 * The price table, from the server, once per page load.
 *
 * Concurrent callers share one request, which is what makes the three surfaces
 * agree by construction rather than by each being lucky.
 */
export function loadPricing(): Promise<PricingAnswer | null> {
  if (resolvedOnce) return Promise.resolve(cached);
  if (!inflight) {
    inflight = workerClient
      .getPricing()
      .then((answer) => {
        if (answer) {
          cached = answer;
          resolvedOnce = true;
        }
        return answer ?? null;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The row for one product, or nothing when the server did not price it. */
export function priceRowFor(answer: PricingAnswer | null, product: string): PriceRow | undefined {
  return answer?.prices?.find((row) => row?.product === product);
}

/** One product's price as the learner reads it, or `null` when there is none. */
export function priceFor(answer: PricingAnswer | null, product: string): string | null {
  return priceLabel(priceRowFor(answer, product));
}

/**
 * The one number a headline may carry: the exam pass, because that is the offer.
 * `null` when the server priced neither the pass nor the subscription — the
 * caller must then show the offer with no amount rather than reach for another.
 */
export function headlinePrice(answer: PricingAnswer | null): string | null {
  return priceFor(answer, 'pass90') ?? priceFor(answer, 'monthly');
}

/**
 * The price table for a screen, plus the two states every caller needs to tell
 * apart: "still loading" (show nothing, claim nothing) and "the server has
 * spoken" (render, or admit it did not send a price).
 */
export function usePricing(): {
  pricing: PricingAnswer | null;
  loaded: boolean;
  /** The headline amount, or `null` — never a fallback number. */
  headline: string | null;
  /** The region group the SERVER resolved, for instructions and analytics. */
  group: string | null;
  cell: number | null;
  /** Price for one product, or `null`. */
  priceFor: (product: string) => string | null;
} {
  const [pricing, setPricing] = useState<PricingAnswer | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadPricing().then((answer) => {
      if (!alive) return;
      setPricing(answer);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return {
    pricing,
    loaded,
    headline: headlinePrice(pricing),
    group: pricing?.group ?? null,
    cell: pricing?.cell ?? null,
    priceFor: (product: string) => priceFor(pricing, product),
  };
}
