/**
 * How to actually pay, in the learner's own language, for the region the SERVER
 * resolved.
 *
 * WHY THIS IS SEPARATE FROM THE PRICE
 * A price says what it costs. This says what happens next — and the next step is
 * different in Cairo from Berlin in a way the app must not guess at: which
 * transfer routes are reachable, whether an intermediary bank may hold the money,
 * and how long activation can take. Getting that wrong costs a paying learner
 * their money and their trust.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It does not name a payment provider, quote an exchange rate, or promise an
 * activation time. The sale happens on the owner's sales site; what this file
 * guarantees is only that the learner is told, in advance, the sequence of steps
 * and which of them are outside the app's control. Times are marked UNPROVEN
 * where they are estimates, because an activation estimate presented as a fact is
 * the same class of lie as an invented refund policy.
 *
 * The region group is the SAME string the price table uses (`standard` or
 * `special`), resolved from the request the app already made. If it is missing or
 * unknown, the standard instructions are used — the same direction the prices
 * fail, toward the more expensive and the more explicit.
 */

/** Matches `cloudflare-pricing.js`: the two price groups. */
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
 * UNPROVEN timings.
 *
 * These are the order of magnitude a payment can take through a banking chain,
 * not a measured figure from this product: an owner who has real delivery data
 * should replace them. They are written as ranges with the caveat attached so
 * that reading them wrong does not read as a broken promise.
 */
export const ACTIVATION_TIMING_AR: Record<RegionGroup, string | null> = {
  standard: 'أقل من بضع دقائق غالباً، وقد يصل إلى 24 ساعة عبر التحويل المصرفي.',
  special: 'من بضع ساعات إلى يوم عمل واحد، لأن التحويل غالباً يمرّ عبر مصرف وسيط.',
};

export const PAYMENT_INSTRUCTIONS: Record<RegionGroup, PaymentInstruction> = {
  standard: {
    headingAr: 'كيف تدفع',
    stepsAr: [
      'اختر الباقة من هذه الشاشة؛ سيظهر السعر الذي رآه جهازك.',
      'افتح صفحة الدفع على موقع البيع، وأكمل بياناتك.',
      'حوّل المبلغ بالطريقة التي يعرضها لك موقع البيع.',
      'سيصلك كود التفعيل على وسائل التواصل التي تُدخلها عند الدفع.',
      'أدخل الكود في شاشة التفعيل؛ يُضاف المدة إلى حسابك فوراً.',
    ],
    timingAr: ACTIVATION_TIMING_AR.standard,
    caveatAr: 'التحويل يمرّ عبر مصرفك، وقد يحتجز البنك المبلغ أياماً قبل وصوله.',
    unproven: true,
  },
  special: {
    headingAr: 'كيف تدفع من هذه المنطقة',
    stepsAr: [
      'اختر الباقة؛ السعر المعروض هنا هو سعر منطقتك.',
      'افتح صفحة الدفع على موقع البيع.',
      'حوّل المبلغ عبر الطريقة التي يعرضها الموقع لك.',
      'سيصلك كود التفعيل بعد تأكيد التحويل.',
      'أدخل الكود في شاشة التفعيل؛ يُضاف المدة إلى حسابك فوراً.',
    ],
    timingAr: ACTIVATION_TIMING_AR.special,
    caveatAr: 'معظم التحويلات تمرّ عبر مصرف وسيط، وقد يتأخر التأكيد ساعات.',
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