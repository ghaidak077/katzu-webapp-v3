/**
 * The paywall's free-session line, told honestly.
 *
 * The number comes from the Worker's trial ledger (`/check-status`). `null`
 * means the ledger could not be read — which is NOT the same as zero, and
 * certainly not the same as three. V31's copy printed the client's own locally
 * seeded value, so a learner who had spent all three free conversations was
 * told they still had three, on the one screen whose entire job is to be
 * believed.
 */

import { arCountWith, toArabicDigits } from '@/lib/i18n/arabicCount';

/**
 * The free-conversation allowance, in ONE place on the client.
 *
 * The number itself is owned by the Worker (`MAX_FREE_AI_SESSIONS` in
 * `cloudflare-unified-worker.js`) — this is a mirror of it, never a second
 * decision. `tests/trialPromise.test.ts` reads the Worker's declaration out of
 * the source and fails if the two ever disagree, so the copy, the offer screen
 * and the ledger cannot drift apart without turning the gate red.
 *
 * WHY THE MIRROR AT ALL
 * Every public promise about the trial ("٣ جلسات محادثة مجانية") has to be
 * written before the learner has an account, when there is no ledger to ask. A
 * number that is written by hand in each surface is how "three" turns into
 * "five" on the landing page while the Worker still enforces three.
 */
export const MAX_FREE_AI_SESSIONS = 3;

const SESSION_FORMS = {
  one: 'جلسة واحدة',
  two: 'جلستان',
  few: 'جلسات',
  many: 'جلسة',
} as const;

/** The allowance as Arabic words, e.g. «٣ جلسات». Never a bare digit. */
export const MAX_FREE_SESSIONS_AR: string = arCountWith(
  MAX_FREE_AI_SESSIONS,
  SESSION_FORMS,
  toArabicDigits,
);

/** The same shapes, for the balance the server reports. */
function sessionsPhrase(count: number): string {
  return arCountWith(count, SESSION_FORMS, toArabicDigits);
}

/** What the paywall says about the free allowance. Never guesses a number. */
export function freeSessionsCopy(remaining: number | null | undefined): string {
  const tail = 'المراجعة وكل ما تعلّمته مجانيان بلا حد.';
  if (remaining === null || remaining === undefined || !Number.isFinite(remaining)) {
    return `رصيد جلساتك التجريبية يُحسب على خوادمنا — لم نتمكن من تحديثه الآن. ${tail}`;
  }
  if (remaining <= 0) {
    return 'انتهت جلساتك التجريبية المجانية. المراجعة وكل ما تعلّمته مجانيان بلا حد.';
  }
  return `لديك ${sessionsPhrase(remaining)} محادثة تجريبية متبقية. ${tail}`;
}