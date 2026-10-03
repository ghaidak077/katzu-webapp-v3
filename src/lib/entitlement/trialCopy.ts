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

import { arCount } from '@/lib/i18n/arabicCount';

const SESSION_FORMS = {
  one: 'جلسة واحدة',
  two: 'جلستان',
  few: 'جلسات',
  many: 'جلسة',
} as const;

/** What the paywall says about the free allowance. Never guesses a number. */
export function freeSessionsCopy(remaining: number | null | undefined): string {
  const tail = 'المراجعة وكل ما تعلّمته مجانيان بلا حد.';
  if (remaining === null || remaining === undefined || !Number.isFinite(remaining)) {
    return `رصيد جلساتك التجريبية يُحسب على خوادمنا — لم نتمكن من تحديثه الآن. ${tail}`;
  }
  if (remaining <= 0) {
    return 'انتهت جلساتك التجريبية المجانية. المراجعة وكل ما تعلّمته مجانيان بلا حد.';
  }
  return `لديك ${arCount(remaining, SESSION_FORMS)} محادثة تجريبية متبقية. ${tail}`;
}