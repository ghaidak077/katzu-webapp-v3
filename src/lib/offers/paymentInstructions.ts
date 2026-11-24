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
import type { UiLanguage } from '@/lib/i18n/languages';
import { translate, type UiStringKey } from '@/lib/i18n/strings';

/** Region groups the payment instructions differ by (price no longer does). */
export type RegionGroup = 'standard' | 'special';

export interface PaymentInstruction {
  /** Short heading: what this region needs to know. */
  headingAr: string;
  /** The ordered steps, each one thing the learner actually does. */
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

const COPY: Record<RegionGroup, { heading: UiStringKey; steps: UiStringKey[]; caveat: UiStringKey }> = {
  standard: {
    heading: 'payment.standard.heading',
    steps: [
      'payment.standard.step1',
      'payment.standard.step2',
      'payment.standard.step3',
      'payment.standard.step4',
      'payment.standard.step5',
    ],
    caveat: 'payment.standard.caveat',
  },
  special: {
    heading: 'payment.special.heading',
    steps: [
      'payment.special.step1',
      'payment.special.step2',
      'payment.special.step3',
      'payment.special.step4',
      'payment.special.step5',
    ],
    caveat: 'payment.special.caveat',
  },
};

/** The published activation promise. One number, in both regions. */
export const ACTIVATION_PROMISE_AR = translate('ar', 'payment.timing', { hours: ACTIVATION_HOURS });

export const ACTIVATION_TIMING_AR: Record<RegionGroup, string | null> = {
  standard: ACTIVATION_PROMISE_AR,
  special: ACTIVATION_PROMISE_AR,
};

/** The group the server sent, normalised. Anything unknown reads as standard. */
export function normaliseRegionGroup(group: unknown): RegionGroup {
  return group === 'special' ? 'special' : 'standard';
}

export function paymentInstructionsFor(group: unknown, language: UiLanguage = 'ar'): PaymentInstruction {
  const key = normaliseRegionGroup(group);
  const copy = COPY[key];
  return {
    headingAr: translate(language, copy.heading),
    stepsAr: copy.steps.map((step) => translate(language, step)),
    timingAr: translate(language, 'payment.timing', { hours: ACTIVATION_HOURS }),
    caveatAr: translate(language, copy.caveat),
    unproven: true,
  };
}

export const PAYMENT_INSTRUCTIONS: Record<RegionGroup, PaymentInstruction> = {
  standard: paymentInstructionsFor('standard'),
  special: paymentInstructionsFor('special'),
};
