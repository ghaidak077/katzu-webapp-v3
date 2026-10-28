/**
 * How to actually pay, in the learner's own language, for the region the SERVER
 * resolved.
 *
 * WHY THIS IS SEPARATE FROM THE PRICE
 * A price says what it costs. This says what happens next — and the next step is
 * different in Cairo from Berlin in a way the app must not guess at: which
 * transfer routes are reachable, whether an intermediary bank may hold the money.
 *
 * WHAT THIS DOES NOT DO
 * It does not name a payment provider or quote an exchange rate. The sale happens
 * on the owner's sales site; what this file guarantees is the sequence of steps
 * and which of them are outside the app's control.
 *
 * THE ONE PROMISE
 * Activation is within `ACTIVATION_HOURS` (12 hours), read from
 * `pricing.config.json` so the card, the instructions and the FAQ cannot state
 * three different numbers. There is no "24 hours" wording anywhere: the promise
 * is the exact upper bound, in both regions.
 *
 * The region group is resolved from the request the app already made. If it is
 * missing or unknown, the standard instructions are used.
 */

import { ACTIVATION_HOURS } from './pricing';

/** Region groups the payment instructions differ by (price no longer does). */
export type RegionGroup = 'standard' | 'special';

export interface PaymentInstruction {
  /** Short Arabic heading: what this region needs to know. */
  headingAr: string;
  /** The ordered steps, Arabic, each one thing the learner actually does. */
  stepsAr: string[];
  /**
   * How long activation may take, or null when it is immediate. A string, not a
   * number, because "usually a few minutes" is honest and "5" is not.
   */
  timingAr: string | null;
  /**
   * The part the app genuinely cannot promise. Rendered as a caution so the
   * learner is never surprised by an intermediary bank they did not know about.
   */
  caveatAr: string;
  /** True when the numbers on this screen rest on an assumption, not a measurement. */
  unproven: boolean;
}

/**
 * The published activation promise. One number, in both regions, because a
 * learner comparing two screens must not read two deadlines.
 */
export const ACTIVATION_PROMISE_AR = `خلال ${ACTIVATION_HOURS} ساعة كحد أقصى`;

export const ACTIVATION_TIMING_AR: Record<RegionGroup, string | null> = {
  standard: ACTIVATION_PROMISE_AR,
  special: ACTIVATION_PROMISE_AR,
};

export const PAYMENT_INSTRUCTIONS: Record<RegionGroup, PaymentInstruction> = {
  standard: {
    headingAr: 'كيف تدفع',
    stepsAr: [
      'اختر الباقة من هذه الشاشة.',
      'افتح صفحة الدفع على موقع البيع، وأكمل بياناتك.',
      'حوّل المبلغ بالطريقة التي يعرضها لك موقع البيع.',
      'سيصلك كود التفعيل على وسائل التواصل التي تُدخلها عند الدفع.',
      'أدخل الكود في شاشة التفعيل؛ تُضاف المدة إلى حسابك فور وصول الكود.',
    ],
    timingAr: ACTIVATION_TIMING_AR.standard,
    caveatAr: 'التحويل يمرّ عبر مصرفك، وقد يحتجز البنك المبلغ أياماً قبل وصوله.',
    unproven: true,
  },
  special: {
    headingAr: 'كيف تدفع من هذه المنطقة',
    stepsAr: [
      'اختر الباقة.',
      'افتح صفحة الدفع على موقع البيع.',
      'حوّل المبلغ عبر الطريقة التي يعرضها الموقع لك.',
      'سيصلك كود التفعيل بعد تأكيد التحويل.',
      'أدخل الكود في شاشة التفعيل؛ تُضاف المدة إلى حسابك فور وصول الكود.',
    ],
    timingAr: ACTIVATION_TIMING_AR.special,
    caveatAr: 'معظم التحويلات تمرّ عبر مصرف وسيط، وقد يتأخر التأكيد ساعات قبل وصول الكود.',
    unproven: true,
  },
};

/** The group the server sent, normalised. Anything unknown reads as standard. */
export function normaliseRegionGroup(group: unknown): RegionGroup {
  return group === 'special' ? 'special' : 'standard';
}

export function paymentInstructionsFor(group: unknown): PaymentInstruction {
  return PAYMENT_INSTRUCTIONS[normaliseRegionGroup(group)];
}