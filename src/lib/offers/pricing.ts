/**
 * What the offer SAYS — the promises, the limits and the refund rule.
 *
 * WHY THE NUMBERS ARE NOT IN HERE
 * They live in `pricing.config.json` (repo root) and are typed by
 * `./foundingPlans.ts`, which the site build and the Worker read too. A price
 * written into a component would be a second source of truth, and a learner in
 * Cairo must never be shown one number and charged another.
 *
 * WHAT IS IN HERE
 * The claims the app can keep: no "unlimited", no "lifetime", no "guaranteed
 * pass" (`FORBIDDEN_CLAIMS_AR`). The refund rule is now real — 7 days on the 3-,
 * 6- and 12-month plans, none on the 1-month plan — so the old
 * `{{OWNER_FILL}}` placeholder is gone.
 */

export {
  PLANS,
  PLAN_BY_ID,
  RECOMMENDED_PLAN,
  FOUNDING_CAP,
  FOUNDING_ENDS_ON,
  REFUND_DAYS,
  REFUND_PLAN_IDS,
  ACTIVATION_HOURS,
  FREE_LESSONS_PER_MONTH,
  PRICING_RULES_AR,
  PRICING_RULES_EN,
  PRICING_HEADLINE_AR,
  PRICING_HEADLINE_EN,
  PRICING_FOOTNOTE_AR,
  PRICING_FOOTNOTE_EN,
  BEST_VALUE_AR,
  BEST_VALUE_EN,
  SOFT_PROMPT_TITLE_AR,
  SOFT_PROMPT_TITLE_EN,
  SOFT_PROMPT_BODY_AR,
  SOFT_PROMPT_BODY_EN,
  CONTINUE_FREE_AR,
  CONTINUE_FREE_EN,
  REFUND_TEXT,
  formatUsd,
  foundingLabel,
  futureLabel,
  perMonthLabel,
  type Plan,
  type PlanId,
} from './foundingPlans';

import { formatUsd } from './foundingPlans';

/** What is deliberately NOT promised. Exported so a test can pin the absence. */
export const FORBIDDEN_CLAIMS_AR = ['غير محدود', 'مدى الحياة', 'ضمان النجاح'];

/** The plain-language fair-use cap, stated on the plan that carries a price. */
export const FAIR_USE_AI_PER_DAY = 120;

/**
 * Whether a value is really copy, or still the owner's placeholder.
 *
 * Kept because `check-launch` still scans shipped strings for `{{...}}` and
 * because the trust pages use the same rule. An empty string counts as unfilled:
 * a blank sentence under a price reads as a promise the app forgot to make.
 */
export function isOwnerFilled(text: string | null | undefined): boolean {
  const value = String(text ?? '').trim();
  if (!value) return false;
  return !value.includes('{{');
}

/**
 * Whether a price may be shown.
 *
 * A missing or malformed amount shows nothing rather than "$0" or a dash next to
 * a buy button: a free-looking offer is worse than an absent one.
 */
export function priceLabel(
  row: { amountCents?: number } | null | undefined,
): string | null {
  if (!row || !Number.isInteger(row.amountCents)) return null;
  return formatUsd(row.amountCents as number);
}
