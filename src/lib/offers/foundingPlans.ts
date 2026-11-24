/**
 * The founding-price table — ONE config object, read by every surface.
 *
 * `pricing.config.json` (repo root) is the only place a price is written. This
 * module types it, converts to integer cents once (so no float arithmetic can
 * move a price by a cent), and builds every sentence the app and the static
 * site say about it. The Worker's `/pricing` endpoint and the crypto checkout
 * read the same JSON; the site build reads the same JSON. A price written into
 * a page would be a second source of truth, which is the defect this file
 * exists to prevent.
 *
 * The offer is a FOUNDING price with a real, published FUTURE price next to it.
 * The old table quoted a coupon and a "limited-time" label that nothing behind
 * checkout enforced; this one states the two conditions that end it (a member
 * cap and a date), the renewal promise, and the refund rule per plan.
 */

import config from '../../../pricing.config.json';
import type { UiLanguage } from '@/lib/i18n/languages';

export type PlanId = 'monthly' | 'quarterly' | 'halfyear' | 'yearly';

export interface Plan {
  id: PlanId;
  months: number;
  /** What the learner pays today, in cents. */
  amountCents: number;
  /** The published price once the founding window ends, in cents. */
  futureCents: number;
  /** What today's price works out to per month, in cents (rounded). */
  perMonthCents: number;
  /** True for the pre-selected plan with the "Best value" badge. */
  recommended: boolean;
  nameAr: string;
  nameEn: string;
  nameId: string;
}

interface RawPlan {
  id: string;
  months: number;
  foundingUsd: number;
  futureUsd: number;
  recommended?: boolean;
}

const toCents = (usd: number): number => Math.round(usd * 100);

const NAMES: Record<PlanId, { ar: string; en: string; id: string }> = {
  monthly: { ar: 'شهر واحد', en: '1 month', id: '1 bulan' },
  quarterly: { ar: '3 أشهر', en: '3 months', id: '3 bulan' },
  halfyear: { ar: '6 أشهر', en: '6 months', id: '6 bulan' },
  yearly: { ar: '12 شهراً', en: '12 months', id: '12 bulan' },
};

const RAW = (config as { plans: RawPlan[] }).plans;

export const PLANS: readonly Plan[] = RAW.map((raw) => {
  const id = raw.id as PlanId;
  const months = Math.max(1, Math.trunc(raw.months));
  const amountCents = toCents(raw.foundingUsd);
  return {
    id,
    months,
    amountCents,
    futureCents: toCents(raw.futureUsd),
    perMonthCents: Math.round(amountCents / months),
    recommended: raw.recommended === true,
    nameAr: NAMES[id].ar,
    nameEn: NAMES[id].en,
    nameId: NAMES[id].id,
  };
});

export const PLAN_BY_ID: Record<PlanId, Plan> = PLANS.reduce(
  (acc, plan) => ({ ...acc, [plan.id]: plan }),
  {} as Record<PlanId, Plan>,
);

/** The pre-selected plan: the one the badge and the default order point at. */
export const RECOMMENDED_PLAN: Plan = PLANS.find((plan) => plan.recommended) ?? PLANS[0];

export const FOUNDING_CAP: number = (config as { foundingCap: number }).foundingCap;
export const FOUNDING_ENDS_ON: string = (config as { foundingEndsOn: string }).foundingEndsOn;
export const REFUND_DAYS: number = (config as { refundDays: number }).refundDays;
export const REFUND_PLAN_IDS: readonly string[] = (config as { refundPlanIds: string[] }).refundPlanIds;
export const ACTIVATION_HOURS: number = (config as { activationHours: number }).activationHours;
export const FREE_LESSONS_PER_MONTH: number = (config as { freeLessonsPerMonth: number }).freeLessonsPerMonth;

/**
 * A dollar amount in the words a learner reads. Cents appear only when there are
 * any, so "$30" never reads as a placeholder and "$14.99" never rounds to "$15".
 */
export function formatUsd(cents: number): string {
  if (!Number.isFinite(cents) || cents < 0) return '—';
  const whole = Math.floor(cents / 100);
  const rest = Math.round(cents % 100);
  return rest === 0 ? `$${whole}` : `$${whole}.${String(rest).padStart(2, '0')}`;
}

export function foundingLabel(plan: Plan): string {
  return formatUsd(plan.amountCents);
}

export function futureLabel(plan: Plan): string {
  return formatUsd(plan.futureCents);
}

export function perMonthLabel(plan: Plan): string {
  return formatUsd(plan.perMonthCents);
}

/**
 * The four rules, in the order a buyer asks them: when does this end, do I keep
 * my price, can I get my money back, how fast do I get in. Arabic first; the
 * English twin is a mirror, never a second policy. Every number is read from
 * `pricing.config.json` — a date or a day count typed here would be a second
 * source of truth.
 */
const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const ENDS = new Date(`${FOUNDING_ENDS_ON}T00:00:00Z`);
const ENDS_AR = `${ENDS.getUTCDate()} ${MONTHS_AR[ENDS.getUTCMonth()]} ${ENDS.getUTCFullYear()}`;
const ENDS_EN = `${ENDS.getUTCDate()} ${MONTHS_EN[ENDS.getUTCMonth()]} ${ENDS.getUTCFullYear()}`;
const CAP_AR = FOUNDING_CAP.toLocaleString('en-US');

/** "3, 6 and 12" — the refundable plans, from the same id list. */
const refundMonths = REFUND_PLAN_IDS.map((id) => PLAN_BY_ID[id as PlanId]?.months).filter(
  (months): months is number => Number.isFinite(months),
);
const REFUND_MONTHS_EN =
  refundMonths.length > 1
    ? `${refundMonths.slice(0, -1).join(', ')} and ${refundMonths[refundMonths.length - 1]}-month`
    : `${refundMonths[0]}-month`;
const REFUND_PLANS_AR = REFUND_PLAN_IDS.map((id) => PLAN_BY_ID[id as PlanId]?.nameAr)
  .filter(Boolean)
  .join(' و');

export const PRICING_RULES_AR: readonly string[] = [
  `أسعار المؤسسين تنتهي عند ${CAP_AR} عضو دافع مؤكَّد أو في ${ENDS_AR} — أيهما أسبق؛ بعدها تُطبَّق الأسعار المستقبلية.`,
  'الأعضاء المؤسسون يحتفظون بسعرهم في كل تجديد ما دام الاشتراك متصلاً.',
  `استرداد كامل خلال أول ${REFUND_DAYS} أيام على باقات ${REFUND_PLANS_AR}؛ لا استرداد على باقة ${PLAN_BY_ID.monthly.nameAr}.`,
  `الوصول والتفعيل خلال ${ACTIVATION_HOURS} ساعة كحد أقصى.`,
];

export const PRICING_RULES_EN: readonly string[] = [
  `Founding prices end at ${CAP_AR} confirmed paying members or on ${ENDS_EN} — whichever comes first; future prices then apply.`,
  'Founding members keep their price on every renewal while the subscription stays active.',
  `Full refund within the first ${REFUND_DAYS} days on the ${REFUND_MONTHS_EN} plans; no refund on the ${PLAN_BY_ID.monthly.months}-month plan.`,
  `Access and activation within ${ACTIVATION_HOURS} hours at the latest.`,
];

export const PRICING_HEADLINE_AR = 'سعر المؤسسين. ثابت ما دمت مشتركاً.';
export const PRICING_HEADLINE_EN = 'Founding price. Locked for as long as you stay subscribed.';

/** Under the cards: the three facts a buyer needs before paying. */
export const PRICING_FOOTNOTE_AR = `الدفع دون بطاقة بنكية · التفعيل خلال ${ACTIVATION_HOURS} ساعة · استرداد كامل خلال ${REFUND_DAYS} أيام على باقات ${REFUND_PLANS_AR}.`;
export const PRICING_FOOTNOTE_EN = `Pay without a bank card · activation within ${ACTIVATION_HOURS} hours · full refund within ${REFUND_DAYS} days on the ${REFUND_MONTHS_EN} plans.`;

/** The best-value badge, in both languages. */
export const BEST_VALUE_AR = 'أفضل قيمة';
export const BEST_VALUE_EN = 'Best value';

/** The refund line for one plan, or null when that plan has none. */
export const REFUND_TEXT = `استرداد كامل خلال ${REFUND_DAYS} أيام على باقات ${REFUND_PLANS_AR}؛ لا استرداد على باقة ${PLAN_BY_ID.monthly.nameAr}.`;

// --- Indonesian twins ------------------------------------------------------
// The offer is written in three languages now. Every number still comes from
// `pricing.config.json`; these are the same sentences, never a second policy.

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const ENDS_ID = `${ENDS.getUTCDate()} ${MONTHS_ID[ENDS.getUTCMonth()]} ${ENDS.getUTCFullYear()}`;
const REFUND_MONTHS_ID =
  refundMonths.length > 1
    ? `${refundMonths.slice(0, -1).join(', ')}, dan ${refundMonths[refundMonths.length - 1]}`
    : String(refundMonths[0]);
const REFUND_PLANS_ID = REFUND_PLAN_IDS.map((id) => PLAN_BY_ID[id as PlanId]?.nameId)
  .filter(Boolean)
  .join(', ');

export const PRICING_RULES_ID: readonly string[] = [
  `Harga perdana berakhir saat ${CAP_AR} anggota membayar terkonfirmasi atau pada ${ENDS_ID} — mana yang lebih dulu; setelah itu harga mendatang berlaku.`,
  'Anggota perdana mempertahankan harganya pada setiap perpanjangan selama langganan tetap aktif.',
  `Pengembalian penuh dalam ${REFUND_DAYS} hari pertama untuk paket ${REFUND_PLANS_ID}; tidak ada pengembalian untuk paket ${PLAN_BY_ID.monthly.months} bulan.`,
  `Akses dan aktivasi paling lambat dalam ${ACTIVATION_HOURS} jam.`,
];

export const PRICING_HEADLINE_ID = 'Harga perdana. Terkunci selama kamu tetap berlangganan.';

export const PRICING_FOOTNOTE_ID = `Bayar tanpa kartu bank · aktivasi dalam ${ACTIVATION_HOURS} jam · pengembalian penuh dalam ${REFUND_DAYS} hari untuk paket ${REFUND_MONTHS_ID} bulan.`;

export const BEST_VALUE_ID = 'Nilai terbaik';

const REFUND_TEXT_ID = `Pengembalian penuh dalam ${REFUND_DAYS} hari untuk paket ${REFUND_PLANS_ID}; tidak ada pengembalian untuk paket ${PLAN_BY_ID.monthly.months} bulan.`;

/** The plan's name in the UI language. */
export function planName(plan: Plan, language: UiLanguage = 'ar'): string {
  return language === 'en' ? plan.nameEn : language === 'id' ? plan.nameId : plan.nameAr;
}

export function pricingRules(language: UiLanguage = 'ar'): readonly string[] {
  return language === 'en' ? PRICING_RULES_EN : language === 'id' ? PRICING_RULES_ID : PRICING_RULES_AR;
}

export function pricingHeadline(language: UiLanguage = 'ar'): string {
  return language === 'en' ? PRICING_HEADLINE_EN : language === 'id' ? PRICING_HEADLINE_ID : PRICING_HEADLINE_AR;
}

export function pricingFootnote(language: UiLanguage = 'ar'): string {
  return language === 'en' ? PRICING_FOOTNOTE_EN : language === 'id' ? PRICING_FOOTNOTE_ID : PRICING_FOOTNOTE_AR;
}

export function bestValue(language: UiLanguage = 'ar'): string {
  return language === 'en' ? BEST_VALUE_EN : language === 'id' ? BEST_VALUE_ID : BEST_VALUE_AR;
}

export function refundText(language: UiLanguage = 'ar'): string {
  return language === 'en'
    ? `Full refund within the first ${REFUND_DAYS} days on the ${REFUND_MONTHS_EN} plans; no refund on the ${PLAN_BY_ID.monthly.months}-month plan.`
    : language === 'id'
      ? REFUND_TEXT_ID
      : REFUND_TEXT;
}

/**
 * The invitation language for a Pro offer shown after a first Arabic correction.
 * It is copy, not a trigger: the mid-episode sheet that used to open 1.2 s after
 * that correction is gone (its scrim covered the sentence field for the rest of
 * the episode — the day-0 browser suite caught it as an unclickable composer).
 * The finish line owns the offer now; these strings stay for a surface that can
 * show them without covering the learner's next sentence.
 */
export const SOFT_PROMPT_TITLE_AR = 'افتح كل المستويات والمواقف';
export const SOFT_PROMPT_BODY_AR = `جرّبت أول تصحيح بالعربية — هذا ما يفعله كاتزو. Pro يفتح كل المستويات والمواقف، ومحادثة يومية ضمن حدّ عادل معلن، من ${foundingLabel(PLANS[0])} شهرياً. ويبقى مجانياً: ${FREE_LESSONS_PER_MONTH} دروس بالذكاء الاصطناعي في المجموع، والمهمة اليومية، ومراجعة أخطائك.`;
export const SOFT_PROMPT_TITLE_EN = 'Open every level and situation';
export const SOFT_PROMPT_BODY_EN = `You just got your first correction in Arabic — that is what Katzu does. Pro opens every level and situation, with daily conversation on a published fair-use limit, from ${foundingLabel(PLANS[0])} a month. Free stays: ${FREE_LESSONS_PER_MONTH} AI lessons in total, the daily mission and your review.`;
export const CONTINUE_FREE_AR = 'تابع مجاناً';
export const CONTINUE_FREE_EN = 'Continue free';
