/**
 * Katzu pricing — one table, no secrets, one source of truth.
 *
 * Every amount a learner is shown or charged is read from `pricing.config.json`
 * (repo root) and nowhere else. This module shapes that config for the Worker
 * and the app; the static site's build reads the same file. A price written into
 * a page or a component would be a second source of truth, and a learner shown
 * one number while being charged another is the defect this file prevents.
 *
 * The offer is a FOUNDING price with a real, published FUTURE price beside it.
 * The founding window ends on a member cap or a date (whichever comes first),
 * and founding members keep their price on renewal — both facts live in the JSON
 * and are rendered from it, not copied by hand.
 *
 * Region no longer moves the price (one table for everyone); it is still resolved
 * server-side because the payment instructions differ by region.
 */

import pricingConfig from './pricing.config.json';

const toCents = (usd) => Math.round(Number(usd) * 100);

/** Countries whose payment instructions differ. Everything else is `standard`. */
export const SPECIAL_COUNTRIES = ['SY', 'EG', 'IQ', 'PS'];

/**
 * The four plans, in the order they are offered. `product` is the plan id the
 * rest of the system already uses (`monthly`, `quarterly`, `halfyear`, `yearly`).
 * Amounts are integer cents so no float arithmetic can move a price by a cent.
 */
export const PLANS = (pricingConfig.plans || []).map((plan) => ({
  product: String(plan.id),
  amountCents: toCents(plan.foundingUsd),
  futureCents: toCents(plan.futureUsd),
  months: Math.max(1, Math.trunc(Number(plan.months) || 1)),
  recommended: plan.recommended === true,
  currency: 'USD',
}));

/** Plan ids the app is allowed to sell, in display order. */
export const PRODUCTS = PLANS.map((plan) => plan.product);

/** One plan by id, or undefined when the id is not in the table. */
export const PLAN_BY_ID = Object.fromEntries(PLANS.map((plan) => [plan.product, plan]));

/** The pre-selected plan (the "Best value" plan), or the first row. */
export const RECOMMENDED_PRODUCT =
  (PLANS.find((plan) => plan.recommended) || PLANS[0] || {}).product || null;

export const CURRENCY = 'USD';
export const FOUNDING_CAP = Number(pricingConfig.foundingCap) || 1000;
export const FOUNDING_ENDS_ON = String(pricingConfig.foundingEndsOn || '');
export const REFUND_DAYS = Number(pricingConfig.refundDays) || 7;
export const REFUND_PLAN_IDS = Array.isArray(pricingConfig.refundPlanIds)
  ? pricingConfig.refundPlanIds.map(String)
  : [];
export const ACTIVATION_HOURS = Number(pricingConfig.activationHours) || 12;
// The name is historical: the allowance is paid ONCE per account, never monthly.
// `MAX_FREE_AI_SESSIONS` in cloudflare-unified-worker.js counts every row in
// `trial_quota_ledger` for the account with no period filter, and nothing in the
// worker resets it — so every public page says «في المجموع», never «كل شهر».
export const FREE_LESSONS_PER_MONTH = Number(pricingConfig.freeLessonsPerMonth) || 3;

/**
 * Which group a country belongs to. UNKNOWN MEANS STANDARD, never special: an
 * unrecognised or spoofed header must not be able to reach a cheaper set of
 * payment instructions than the one it is entitled to.
 */
export function regionGroupFromCountry(country) {
  const code = String(country ?? '').trim().toUpperCase();
  return SPECIAL_COUNTRIES.includes(code) ? 'special' : 'standard';
}

/**
 * Reads the region from a request. The Cloudflare header is `CF-IPCountry`; it
 * is absent for local dev and for anything that did not come through Cloudflare,
 * and both cases resolve to `standard`.
 */
export function regionGroupFromRequest(request) {
  const header = request?.headers?.get?.('CF-IPCountry');
  return regionGroupFromCountry(header);
}

/** One plan's row for the learner, or null when the id is not sold. */
export function priceFor({ product = RECOMMENDED_PRODUCT } = {}) {
  const plan = PLAN_BY_ID[product];
  if (!plan) return null;
  return { ...plan, unproven: true };
}

/** The whole catalogue for one learner, so the paywall renders in one call. */
export function catalogueFor({ group = 'standard' } = {}) {
  const rows = PRODUCTS.map((product) => priceFor({ product })).filter(Boolean);
  return {
    group,
    currency: CURRENCY,
    foundingCap: FOUNDING_CAP,
    foundingEndsOn: FOUNDING_ENDS_ON,
    refundDays: REFUND_DAYS,
    refundPlanIds: REFUND_PLAN_IDS,
    activationHours: ACTIVATION_HOURS,
    freeLessonsPerMonth: FREE_LESSONS_PER_MONTH,
    unproven: true,
    prices: rows,
  };
}

/**
 * Whether a code was minted for one region group and redeemed by a learner in
 * another. Redemption is NEVER blocked on this — a code is code, and a learner
 * who travelled or moved must still get what they paid for. It is recorded as a
 * metric so the owner can see whether the region table is aimed correctly.
 */
export function isRegionMismatch(codeGroup, learnerGroup) {
  if (!codeGroup) return false;
  return codeGroup !== (learnerGroup || 'standard');
}

const DAY_MS = 86400000;

/**
 * How long each plan lasts, in days. A nominal duration — redemption itself is
 * server-authoritative — kept here so a client-side preview can never disagree
 * with the plan table about what "3 months" means.
 */
export const PRODUCT_DURATION_DAYS = Object.fromEntries(
  PLANS.map((plan) => [
    plan.product,
    plan.months === 12 ? 365 : plan.months === 6 ? 180 : plan.months * 30,
  ]),
);

/**
 * When an entitlement redeemed at `from` runs out. Returns null for an unknown
 * product, which is the honest answer rather than a sentinel date nobody should
 * ever see.
 */
export function entitlementExpiryFor(product, from = Date.now()) {
  const days = PRODUCT_DURATION_DAYS[product];
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(Number(from) + days * DAY_MS).toISOString();
}

/**
 * Is a stored entitlement still live at `now`?
 *
 * The comparison is strict: at exactly `expiresAt` the entitlement is over. A
 * learner who redeems at 23:59:59 gets a full day, and a learner whose expiry
 * lands on this millisecond gets nothing — which is the correct reading of "90
 * days", and is pinned by a boundary test so it cannot drift to `>=`.
 */
export function isEntitlementActive(record, now = Date.now()) {
  if (!record || !record.expiresAt) return false;
  const expiry = new Date(record.expiresAt).getTime();
  if (!Number.isFinite(expiry)) return false;
  return expiry > now;
}

/** Whole days left, floored at 0. `null` when there is no expiry to count to. */
export function daysUntilExpiry(expiresAt, now = Date.now()) {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return null;
  return Math.max(0, Math.floor((expiry - now) / DAY_MS));
}

/** How many mock credits a learner has left. Never negative. */
export function mockCreditsRemaining(record) {
  const credits = Number(record?.mockCredits);
  if (!Number.isFinite(credits) || credits < 0) return 0;
  return Math.floor(credits);
}

// ----------------------------------------------------------------------------
// THE MOCK ENTITLEMENT
// ----------------------------------------------------------------------------
//
// One free B1 mock per account, then a paid entry: a `mock` credit, or any live
// subscription. The free mock is what the whole funnel is built on — it is why
// the learner stays long enough to see the debrief — so it is deliberately
// generous and deliberately countable.
//
// DECIDED HERE, NOT IN THE HANDLER: `decideMockAccess` is pure and the worker
// only reads its answer, which is what makes "one free mock" a rule that can be
// tested without a KV or a D1.

/** How many mocks an account gets before it must pay. */
export const FREE_MOCKS_PER_ACCOUNT = 1;

/** Corrections a free learner sees in the debrief. The full list is paid. */
export const MOCK_TOP_CORRECTIONS_FREE = 2;

/**
 * May this learner start another mock, and what does it cost them?
 *
 * Order matters and is deliberate: the free mock first (so an account that has
 * somehow lost its subscription still gets its one free attempt), then a credit,
 * then a live subscription. `consume` says whether the caller must debit a
 * credit — nothing else spends anything.
 *
 * Fails closed on nonsense input: a missing record means "no free mock yet",
 * not "unlimited".
 */
export function decideMockAccess({ freeUsed = 0, credits = 0, subscribed = false } = {}) {
  const used = Math.max(0, Number.isFinite(Number(freeUsed)) ? Math.floor(Number(freeUsed)) : 0);
  const available = mockCreditsRemaining({ mockCredits: credits });
  if (used < FREE_MOCKS_PER_ACCOUNT) {
    return {
      allowed: true,
      source: 'free',
      consumeCredit: false,
      freeRemaining: FREE_MOCKS_PER_ACCOUNT - used,
      creditsRemaining: available,
    };
  }
  if (available >= 1) {
    return { allowed: true, source: 'credit', consumeCredit: true, freeRemaining: 0, creditsRemaining: available - 1 };
  }
  if (subscribed) {
    return { allowed: true, source: 'subscription', consumeCredit: false, freeRemaining: 0, creditsRemaining: 0 };
  }
  return { allowed: false, source: null, consumeCredit: false, freeRemaining: 0, creditsRemaining: 0 };
}

/**
 * What the debrief may show.
 *
 * The free tier gets the number and the two most useful corrections — enough to
 * want the rest — and never a pass mark, because the app cannot compute one.
 */
export function mockDebriefAccess({ access = null, hasActiveEntitlement = false } = {}) {
  const paid = hasActiveEntitlement || ['credit', 'subscription'].includes(access?.source);
  return {
    fullDebrief: paid,
    repeatMock: paid,
    correctionsVisible: paid ? Number.POSITIVE_INFINITY : MOCK_TOP_CORRECTIONS_FREE,
    reason: paid ? 'entitled' : 'free_mock',
  };
}

/** The 7-day warning the app shows before an entitlement lapses. */
export const EXPIRY_REMINDER_DAYS = 7;

/**
 * Should the learner be warned yet? True only inside the reminder window, so a
 * subscriber with 60 days left is not nagged and an expired one is not told they
 * are about to expire.
 */
export function shouldRemindAboutExpiry(record, now = Date.now()) {
  if (!isEntitlementActive(record, now)) return false;
  const days = daysUntilExpiry(record.expiresAt, now);
  return days !== null && days <= EXPIRY_REMINDER_DAYS;
}
