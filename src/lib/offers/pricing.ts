/**
 * The offer, as copy — and the only numbers that may appear next to it.
 *
 * WHY THE PRICES ARE NOT IN HERE
 * They come from `GET /pricing`, which resolves the region from the Cloudflare
 * country header and the experiment cell from a hash of the account. A price
 * written into the app would be a price the app decided, which is exactly the
 * thing this offer is meant not to do: a learner in Cairo must never be shown
 * the standard price and then charged the special one.
 *
 * WHAT IS IN HERE
 * The promises, the limits and the legal placeholders. Every claim here is one
 * the app can keep: no "unlimited", no "lifetime", no "guaranteed pass". The
 * refund text is a `{{OWNER_FILL}}` placeholder — the app refuses to invent a
 * refund policy, and a placeholder that ships is louder than a sentence nobody
 * has checked.
 */

/** Products in the order they are offered: the pass leads, the mock is a link. */
export const OFFER_ORDER = ['pass90', 'monthly', 'mock'] as const;
export type OfferProduct = (typeof OFFER_ORDER)[number];

export interface OfferCopy {
  product: OfferProduct;
  /** Arabic product name. */
  nameAr: string;
  /** One sentence, and the only promise about what it does. */
  pitchAr: string;
  /** What the learner gets, as short honest lines. */
  includesAr: string[];
  /** The one limit, stated plainly. `null` where there is none. */
  fairUseAr: string | null;
  /** Whether this row is a link out rather than the lead card. */
  isLink: boolean;
}

/**
 * The plain-language fair-use cap.
 *
 * UNPROVEN as a number: it is derived from the measured AI cost per learner-day
 * and the spend cap, not from observed abuse. It is stated anyway, because an
 * unstated limit discovered later reads as a bait-and-switch, and a stated one
 * read in advance does not.
 */
export const FAIR_USE_AI_PER_DAY = 120;

/** What is deliberately NOT promised. Exported so a test can pin the absence. */
export const FORBIDDEN_CLAIMS_AR = ['غير محدود', 'مدى الحياة', 'ضمان النجاح'];

export const OFFER_COPY: Record<OfferProduct, OfferCopy> = {
  pass90: {
    product: 'pass90',
    nameAr: 'باقة الامتحان — 90 يوماً',
    pitchAr: 'محادثة B1 كاملة مع تقرير، حتى تاريخ الامتحان.',
    includesAr: [
      'محادثاتレベル B1 كاملة مع تصحيح مباشر',
      'محاكاة B1 بثلاثة أجزاء، وتقرير مفصّل بعد كل محاكاة',
      'كل المفردون والقواعد والمراجعة اليومية',
    ],
    fairUseAr: `الحد العادل للاستخدام: حتى ${FAIR_USE_AI_PER_DAY} طلب ذكاء اصطناعي يومياً. يكفي لثلاث جلسات؛ لن يُقفل حسابك فجأة.`,
    isLink: false,
  },
  monthly: {
    product: 'monthly',
    nameAr: 'الاشتراك الشهري',
    pitchAr: 'نفس كل شيء، يُجدَّد كل 30 يوماً.',
    includesAr: ['كل ما في باقة الامتحان', 'تحديثات المحتوى مع كل إصدار'],
    fairUseAr: `الحد العادل للاستخدام: حتى ${FAIR_USE_AI_PER_DAY} طلب ذكاء اصطناعي يومياً.`,
    isLink: false,
  },
  mock: {
    product: 'mock',
    nameAr: 'محاكاة واحدة',
    pitchAr: 'محاكاة B1 واحدة بتقريرها الكامل — بدون اشتراك.',
    includesAr: ['محاكاة B1 بثلاثة أجزاء', 'التقرير الكامل بعد المحاكاة'],
    fairUseAr: 'محاكاة واحدة، ثم تُشترى أخرى.',
    isLink: true,
  },
};

/**
 * A price in the right words.
 *
 * The units are whole euros and the cents are shown only when there are any, so a
 * €29 price never appears as "29.00 €" (which reads as a placeholder) and a €12.99
 * price never appears as "13 €" (which would be a lie).
 */
export function formatEuro(amountCents: number, currency = 'EUR'): string {
  if (!Number.isInteger(amountCents) || amountCents < 0) return '—';
  const euros = Math.floor(amountCents / 100);
  const cents = amountCents % 100;
  const symbol = currency === 'EUR' ? '€' : currency;
  return cents === 0 ? `${euros} ${symbol}` : `${euros},${String(cents).padStart(2, '0')} ${symbol}`;
}

/**
 * The refund line, exactly as the owner must fill it in.
 *
 * Shipped as a placeholder on purpose: an invented refund promise is a legal
 * statement this product must not make on its own, and a visible gap is easier
 * to notice than a plausible sentence nobody checked.
 */
export const REFUND_TEXT = '{{OWNER_FILL}}';

/**
 * Whether a price may be shown.
 *
 * A missing or malformed amount shows nothing rather than "€0" or a dash next to
 * a buy button: a free-looking offer is worse than an absent one.
 */
export function priceLabel(
  row: { amountCents?: number; currency?: string } | null | undefined,
): string | null {
  if (!row || !Number.isInteger(row.amountCents)) return null;
  return formatEuro(row.amountCents as number, row.currency || 'EUR');
}