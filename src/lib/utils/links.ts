/**
 * External links the app hands to the learner.
 *
 * The sales site is a separate property (a Cloudflare Pages project of its own)
 * that sells activation codes — the app itself only ever redeems a code through
 * `/verify` and never takes a payment. Overridable at build time with
 * `VITE_SALES_URL`; the production value is the default so nothing has to be
 * configured for the link to work.
 *
 * NO PRICE LIVES HERE. It used to: `getProPriceLabel()` mirrored the crypto
 * check-out's `/crypto/health` and fell back to a hardcoded «5 دولار / شهر», so
 * two sources in two currencies could reach the learner — one of them (checkout)
 * not live. Every amount the learner sees now comes from `GET /pricing` through
 * `src/lib/offers/priceSource.ts`, and nothing is shown when that call fails.
 */
import { withSource } from '@/lib/attribution/source';

const env = (import.meta as any).env || {};

export const SALES_URL: string = String(env.VITE_SALES_URL || 'https://katzu-sales.pages.dev').replace(/\/+$/, '');

/**
 * The app's own public origin. `katzu.app` does not resolve yet, so nothing may
 * hardcode a production hostname: canonical URLs, Open Graph URLs, share links
 * and legal-page links all read this, and a deploy sets `VITE_PUBLIC_APP_URL`
 * once (no code change) when the domain is live.
 */
export const PUBLIC_APP_URL: string = String(env.VITE_PUBLIC_APP_URL || '').replace(/\/+$/, '');

/** Falls back to the origin the app is actually running on. */
export function publicAppUrl(): string {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

/** Absolute URL of a public route, for shares, canonical tags and sitemaps. */
export function publicAppUrlFor(path = '/'): string {
  const origin = publicAppUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${origin}${normalized}` : normalized;
}

export function legalPageUrl(page: 'privacy' | 'terms' | 'contact'): string {
  return publicAppUrlFor(`/trust/${page}`);
}

/**
 * The sales page with attribution preserved.
 *
 * Two different things travel with the learner, and they answer different
 * questions: `ref` is a referral CODE (who invited you, which buys them months)
 * and `src` is the CHANNEL that produced the visit. The sales site forwards both
 * to checkout, so neither is lost by leaving the app.
 */
export function buildSalesUrl(referralCode?: string | null, source?: string | null): string {
  const code = String(referralCode || '').trim().toUpperCase();
  const withRef = code
    ? (() => {
        try {
          const url = new URL(SALES_URL);
          url.searchParams.set('ref', code);
          return url.toString();
        } catch {
          // A malformed SALES_URL must not break the CTA: return it unchanged
          // rather than a URL assembled by string concatenation.
          return SALES_URL;
        }
      })()
    : SALES_URL;
  return withSource(withRef, source);
}
