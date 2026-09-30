/**
 * External links the app hands to the learner.
 *
 * The sales site is a separate property (a Cloudflare Pages project of its own)
 * that sells activation codes — the app itself only ever redeems a code through
 * `/verify` and never takes a payment. Overridable at build time with
 * `VITE_SALES_URL`; the production value is the default so nothing has to be
 * configured for the link to work.
 */
const env = (import.meta as any).env || {};

export const SALES_URL: string = String(env.VITE_SALES_URL || 'https://katzu-sales.pages.dev').replace(/\/+$/, '');

export const FALLBACK_PRICE_LABEL = '5 دولار / شهر';

/**
 * Live price label, mirrored from the worker's `/crypto/health` (which exposes
 * only `priceUsd` and `months`). The worker owns the price — this keeps the
 * paywall, landing page and redemption screen from drifting from what checkout
 * actually charges. Session-cached, one in-flight request, and the constant
 * fallback on any failure so a broken fetch can never blank the paywall.
 */
let cachedPriceLabel: string | null = null;
let priceInflight: Promise<string> | null = null;

/** One plan tier as the worker vouched for it (V21 Phase 7). */
export interface PlanTier {
  id: string;
  months: number;
  priceUsd: number;
  label_ar: string;
  requires_discount_code?: boolean;
}

let cachedPlans: PlanTier[] | null = null;

async function fetchPriceData(): Promise<{ label: string; plans: PlanTier[] } | null> {
  const workerUrl = String((import.meta as any).env?.VITE_WORKER_URL || '').replace(/\/+$/, '');
  if (!workerUrl) return null;
  const res = await fetch(`${workerUrl}/crypto/health`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const data = (await res.json()) as { priceUsd?: unknown; months?: unknown; plans?: unknown };
  const price = Number(data.priceUsd);
  const months = Number(data.months);
  // Only a sane, positive price the worker actually vouched for changes the label.
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(months) || months < 1) {
    return null;
  }
  const monthsPart = months === 1 ? 'شهر' : `${months} أشهر`;
  const plans = Array.isArray(data.plans)
    ? (data.plans as PlanTier[]).filter(
        (p) => p && typeof p.id === 'string' && Number.isFinite(Number(p.priceUsd)) && Number(p.priceUsd) > 0,
      )
    : [];
  return { label: `${price} دولار / ${monthsPart}`, plans };
}

/** Resolves the live price label; never throws. */
export async function getProPriceLabel(): Promise<string> {
  if (cachedPriceLabel) return cachedPriceLabel;
  if (!priceInflight) {
    priceInflight = fetchPriceData()
      .then((data) => {
        const label = data?.label ?? FALLBACK_PRICE_LABEL;
        cachedPriceLabel = label;
        cachedPlans = data?.plans?.length ? data.plans : null;
        return label;
      })
      .catch(() => FALLBACK_PRICE_LABEL)
      .finally(() => {
        priceInflight = null;
      });
  }
  return priceInflight;
}

/**
 * Resolves the plan tiers the worker currently sells. Empty when the worker is
 * unreachable or pre-Phase-7 — callers must render an honest single-price view
 * from getProPriceLabel() in that case, never invent tiers.
 */
export async function getProPlanTiers(): Promise<PlanTier[]> {
  if (!cachedPlans) await getProPriceLabel();
  return cachedPlans ?? [];
}

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
 * The sales page with referral attribution preserved. Referral codes live in
 * the URL (`?ref=REF-XXXXXXXX`) and the sales site forwards them to checkout, so
 * a learner who was invited does not lose the attribution by leaving the app.
 */
export function buildSalesUrl(referralCode?: string | null): string {
  const code = String(referralCode || '').trim().toUpperCase();
  if (!code) return SALES_URL;
  try {
    const url = new URL(SALES_URL);
    url.searchParams.set('ref', code);
    return url.toString();
  } catch {
    // A malformed SALES_URL must not break the CTA: return it unchanged rather
    // than a URL assembled by string concatenation.
    return SALES_URL;
  }
}
