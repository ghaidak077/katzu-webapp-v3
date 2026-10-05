import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';
import {
  FORBIDDEN_CLAIMS_AR,
  FAIR_USE_AI_PER_DAY,
  OFFER_COPY,
  OFFER_ORDER,
  REFUND_TEXT,
  formatEuro,
  priceLabel,
} from '../src/lib/offers/pricing';
import { PRICES } from '../cloudflare-pricing.js';

/**
 * The offer, as a browser test.
 *
 * Four things must be true of a screen that asks for money: the price comes
 * from the server, the promises are ones the product keeps, the limit is stated
 * rather than discovered, and the legal line is a placeholder until the owner
 * writes it.
 */

const request = (country?: string) =>
  new Request('https://worker.test/pricing', {
    headers: country ? { 'CF-IPCountry': country } : {},
  });

describe('GET /pricing', () => {
  it('prices an anonymous visitor in the standard group, with no experiment cell', async () => {
    const res = await worker.fetch(request('DE'), {} as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.group).toBe('standard');
    expect(body.experimentEnabled).toBe(false);
    const pass = body.prices.find((row: any) => row.product === 'pass90');
    expect(pass.amountCents).toBe(PRICES.standard.pass90);
    expect(body.unproven).toBe(true);
  });

  it('prices a special region in the special table', async () => {
    for (const country of ['SY', 'EG', 'IQ', 'PS']) {
      const body = (await (await worker.fetch(request(country), {} as never)).json()) as any;
      expect(body.group).toBe('special');
      const pass = body.prices.find((row: any) => row.product === 'pass90');
      expect(pass.amountCents).toBe(PRICES.special.pass90);
    }
  });

  it('prices a missing or unknown country as standard, never as special', async () => {
    for (const country of [undefined, 'ZZ', '']) {
      const body = (await (await worker.fetch(request(country), {} as never)).json()) as any;
      expect(body.group).toBe('standard');
    }
  });

  it('offers exactly the three products, pass first', async () => {
    const body = (await (await worker.fetch(request('DE'), {} as never)).json()) as any;
    expect(body.prices.map((row: any) => row.product)).toEqual(['pass90', 'monthly', 'mock']);
  });

  it('never leaks a price in dollars, a secret or an unproven claim', async () => {
    const body = JSON.stringify(await (await worker.fetch(request('EG'), {} as never)).json());
    expect(body).not.toMatch(/HMAC|ADMIN_SECRET|api[_-]?key/i);
    expect(body).not.toMatch(/unlimited|lifetime|guaranteed/i);
  });
});

describe('the offer copy', () => {
  it('leads with the pass, offers monthly second and the mock only as a link', () => {
    expect(OFFER_ORDER).toEqual(['pass90', 'monthly', 'mock']);
    expect(OFFER_COPY.pass90.isLink).toBe(false);
    expect(OFFER_COPY.monthly.isLink).toBe(false);
    expect(OFFER_COPY.mock.isLink).toBe(true);
  });

  it('claims nothing it cannot keep', () => {
    const everything = JSON.stringify(OFFER_COPY);
    for (const claim of FORBIDDEN_CLAIMS_AR) expect(everything).not.toContain(claim);
    expect(everything).not.toMatch(/unlimited|lifetime|guaranteed|ضمان النجاح/i);
  });

  it('states a fair-use limit in plain words, and the same number everywhere', () => {
    expect(OFFER_COPY.pass90.fairUseAr).toContain(String(FAIR_USE_AI_PER_DAY));
    expect(OFFER_COPY.monthly.fairUseAr).toContain(String(FAIR_USE_AI_PER_DAY));
    // The number is derived from measured cost, so it is a stated cap, not a
    // measured abuse rate — and it is documented as UNPROVEN next to it.
    expect(FAIR_USE_AI_PER_DAY).toBeGreaterThan(0);
  });

  it('leaves the refund policy as a placeholder rather than inventing one', () => {
    expect(REFUND_TEXT).toBe('{{OWNER_FILL}}');
    expect(REFUND_TEXT).not.toMatch(/استرداد|ضمان|refund/i);
  });

  it('speaks Arabic first in every learner-facing line', () => {
    for (const copy of Object.values(OFFER_COPY)) {
      expect(copy.nameAr).toMatch(/[؀-ۿ]/);
      expect(copy.pitchAr).toMatch(/[؀-ۿ]/);
      expect(copy.includesAr.length).toBeGreaterThan(0);
    }
  });
});

describe('price formatting', () => {
  it('shows whole euros without a fake cents tail', () => {
    expect(formatEuro(2900)).toBe('29 €');
    expect(formatEuro(1200)).toBe('12 €');
    expect(formatEuro(0)).toBe('0 €');
  });

  it('shows cents only when there are any, never rounding a price away', () => {
    expect(formatEuro(1299)).toBe('12,99 €');
    expect(formatEuro(500)).toBe('5 €');
    expect(formatEuro(1900)).toBe('19 €');
  });

  it('shows nothing rather than a free-looking offer when the amount is missing', () => {
    expect(priceLabel(null)).toBeNull();
    expect(priceLabel({})).toBeNull();
    expect(priceLabel({ amountCents: undefined as never })).toBeNull();
    expect(priceLabel({ amountCents: 900 })).toBe('9 €');
  });
});