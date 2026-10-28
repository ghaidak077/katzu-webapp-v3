/**
 * The price table and the one order block for website.katzuai.com.
 *
 * WHY THIS IS ITS OWN MODULE
 * `pricing.config.json` is the single source of every amount in the project —
 * the app, the Worker and the three site pages all read it. Keeping the whole
 * money vocabulary in one file means the marketing page cannot quietly grow a
 * second opinion about a price, and `scripts/site-content.mjs` stays about copy.
 *
 * NO PRICE IS TYPED IN THIS FILE EITHER. The cards, the struck future price, the
 * per-month line, the JSON-LD offers and the pre-filled order mail are all built
 * from `pricing.config.json` at build time.
 */

import { readFileSync } from 'node:fs';

export const SITE = 'https://website.katzuai.com';
export const APP = 'https://katzuai.com';
/**
 * The Worker the app calls, and the only host the site may ask "is this partner
 * code real?" — the same deploy the app and the checkout use, one origin.
 */
export const WORKER = 'https://katzu-test.ghaidakalosh008.workers.dev';
/** Where every "ابدأ مجاناً" CTA goes: the demo lesson was removed. */
export const START = `${APP}/welcome`;
export const SUPPORT = 'support@ghaidak.com';
export const UPDATED = '2026-10-28';
export const CTA_LABEL = 'ابدأ مجاناً';

/* ------------------------------------------------------------------ */
/* The price table — the same file the app and the Worker read         */
/* ------------------------------------------------------------------ */

const PRICING_CONFIG = JSON.parse(
  readFileSync(new URL('../pricing.config.json', import.meta.url), 'utf8'),
);

const toCents = (usd) => Math.round(Number(usd) * 100);

/** Attribute-safe: a mailto query is full of `&`, which HTML wants as `&amp;`. */
export const escAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Cents to the words a learner reads; cents appear only when there are any. */
export function formatUsd(cents) {
  const whole = Math.floor(cents / 100);
  const rest = Math.round(cents % 100);
  return rest === 0 ? `$${whole}` : `$${whole}.${String(rest).padStart(2, '0')}`;
}

const PLAN_NAMES = {
  monthly: 'شهر واحد',
  quarterly: '3 أشهر',
  halfyear: '6 أشهر',
  yearly: '12 شهراً',
};

export const PLANS = PRICING_CONFIG.plans.map((plan) => {
  const months = Math.max(1, Math.trunc(plan.months));
  const cents = toCents(plan.foundingUsd);
  return {
    id: plan.id,
    months,
    cents,
    futureCents: toCents(plan.futureUsd),
    perMonthCents: Math.round(cents / months),
    recommended: plan.recommended === true,
    nameAr: PLAN_NAMES[plan.id],
  };
});

export const FOUNDING_CAP = Number(PRICING_CONFIG.foundingCap) || 1000;
export const REFUND_DAYS = Number(PRICING_CONFIG.refundDays) || 7;
export const ACTIVATION_HOURS = Number(PRICING_CONFIG.activationHours) || 12;
export const FREE_LESSONS_PER_MONTH = Number(PRICING_CONFIG.freeLessonsPerMonth) || 3;

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
const ENDS = new Date(`${PRICING_CONFIG.foundingEndsOn}T00:00:00Z`);
const ENDS_AR = `${ENDS.getUTCDate()} ${MONTHS_AR[ENDS.getUTCMonth()]} ${ENDS.getUTCFullYear()}`;
const CAP = FOUNDING_CAP.toLocaleString('en-US');

/**
 * The four rules, in the order a buyer asks them: when does this end, do I keep
 * my price, can I get my money back, how fast do I get in. Same sentences as the
 * app (`src/lib/offers/foundingPlans.ts`), built from the same numbers.
 */
export const PRICING_RULES_AR = [
  `أسعار المؤسسين تنتهي عند ${CAP} عضو دافع مؤكَّد أو في ${ENDS_AR} — أيهما أسبق؛ بعدها تُطبَّق الأسعار المستقبلية.`,
  'الأعضاء المؤسسون يحتفظون بسعرهم في كل تجديد ما دام الاشتراك متصلاً.',
  `استرداد كامل خلال أول ${REFUND_DAYS} أيام على باقات 3 و6 و12 شهراً؛ لا استرداد على باقة الشهر الواحد.`,
  `الوصول والتفعيل خلال ${ACTIVATION_HOURS} ساعة كحد أقصى.`,
];

export const PRICING_HEADLINE_AR = 'أسعار المؤسسين';
export const BEST_VALUE_AR = 'أفضل قيمة';

/* ------------------------------------------------------------------ */
/* Purchase flow                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_PLAN = PLANS.find((plan) => plan.recommended) ?? PLANS[PLANS.length - 1];

function mailto(subject, body) {
  return `mailto:${SUPPORT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The pre-filled order mail for one plan; JS rewrites it when a card is picked. */
function orderMailto(plan) {
  return mailto(
    `طلب اشتراك كاتزو — ${plan.nameAr}`,
    [
      'مرحباً،',
      '',
      `أريد باقة: ${plan.nameAr} بسعر ${formatUsd(plan.cents)}.`,
      '',
      'بريدي في Google:',
      'البلد:',
      '',
      'أرسلوا لي تفاصيل الدفع المتاحة.',
    ].join('\n'),
  );
}

export const RESTORE_MAILTO = mailto(
  'استعادة كود التفعيل — كاتزو',
  [
    'مرحباً،',
    '',
    'لم يصلني كود التفعيل أو فقدته.',
    '',
    'بريد الشراء:',
    'تاريخ الدفع:',
    'الباقة:',
  ].join('\n'),
);

/**
 * The raw order mail per plan. The picker script rewrites the button href from
 * this map, so the page itself never needs a second copy of a price.
 */
export const PLAN_ORDER_MAILTO = Object.fromEntries(
  PLANS.map((plan) => [plan.id, orderMailto(plan)]),
);

/** The recommended plan's mail — what the one order button ships with. */
export const DEFAULT_PLAN_MAILTO = orderMailto(DEFAULT_PLAN);

/* ------------------------------------------------------------------ */
/* The price cards + the one rules block                               */
/* ------------------------------------------------------------------ */

const FREE_FEATURES = [
  `${FREE_LESSONS_PER_MONTH} دروس بالذكاء الاصطناعي كل شهر بعد التسجيل.`,
  'المهمة اليومية والمراجعة المتباعدة.',
  'اختبار المستوى وبنك الأخطاء.',
  'بلا بطاقة بنكية.',
];

/** What every paid plan includes — stated once, above the cards. */
export const PAID_FEATURES = [
  'كل المواقف والمستويات.',
  'بنك المفردات والقواعد.',
  'محادثة يومية بحدّ عادل للاستخدام، معلن قبل أن تصل إليه.',
];

export function planBadge(plan) {
  return plan.recommended ? BEST_VALUE_AR : '';
}

/**
 * The free card plus one card per plan. The cards never repeat the feature list:
 * the shared benefits sit once above the grid, so the only thing that changes
 * between two plans is the duration and the money.
 */
export function pricingCardsHtml() {
  const free = `<article class="plan free">
  <div class="plan-top"><h3>مجاناً دائماً</h3></div>
  <p class="price">$0</p>
  <p class="per">بلا بطاقة بنكية</p>
  <ul class="small">${FREE_FEATURES.map((li) => `<li>${li}</li>`).join('')}</ul>
  <a class="btn gh" href="${START}">${CTA_LABEL}</a>
</article>`;

  const paid = PLANS.map((plan) => {
    const selected = plan.id === DEFAULT_PLAN.id;
    const badge = planBadge(plan);
    const perMonth =
      plan.months > 1
        ? `<p class="per">${formatUsd(plan.perMonthCents)} شهرياً</p>`
        : '';
    return `<article class="plan${selected ? ' sel' : ''}" data-plan="${plan.id}">
  <div class="plan-top"><h3>${plan.nameAr}</h3>${badge ? `<span class="badge">${badge}</span>` : ''}</div>
  <p class="price">${formatUsd(plan.cents)}</p>
  <p class="was"><s>${formatUsd(plan.futureCents)}</s> بعد عرض المؤسسين</p>
  ${perMonth}
  <button class="btn gh pick" type="button" data-pick="${plan.id}" aria-pressed="${selected ? 'true' : 'false'}">اختر هذه الباقة</button>
</article>`;
  });

  return [free, ...paid].join('\n');
}

/** The rules, printed once on the pricing page. */
export function pricingRulesHtml() {
  return `<section class="wrap sec rules">
  <h2>قواعد العرض</h2>
  <ol>${PRICING_RULES_AR.map((rule) => `<li>${rule}</li>`).join('')}</ol>
</section>`;
}

/** Schema.org offers, priced from the same table as the cards. */
export function pricingOffersJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    name: 'باقات كاتزو',
    url: `${SITE}/pricing`,
    itemListElement: PLANS.map((plan) => ({
      '@type': 'Offer',
      name: plan.nameAr,
      price: (plan.cents / 100).toFixed(2),
      priceCurrency: 'USD',
      url: `${SITE}/pricing#pay`,
      availability: 'https://schema.org/InStock',
    })),
  };
}
