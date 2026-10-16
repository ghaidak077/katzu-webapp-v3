import { arCount } from '@/lib/i18n/arabicCount';

/**
 * B3: what a paying learner is told before their month runs out.
 *
 * Nothing was. `check-status` returned `days_remaining` on every check and no
 * surface read it, so the first news a learner got that their subscription had
 * ended was the level chip dropping to A1 mid-episode, with no explanation and no
 * way to renew from where they were standing. Losing access silently is how a
 * paying customer decides the app is unreliable rather than that their month
 * ended.
 *
 * The date comes from the row the app already holds — the one B2 now refreshes
 * on every open — so this notice costs no request and works offline. That is why
 * the warning is a function of (date, active, now) rather than of a response:
 * a learner on a train still needs to know.
 *
 * Two boundaries are deliberate:
 *
 * - **Only the last week speaks.** A countdown running for thirty days is nagging,
 *   and a learner who has paid does not need to be sold to from the day they buy.
 * - **An inactive row is silent.** A revoked or expired subscription keeps its
 *   date (see `reconcileEntitlement`), so without the `isActive` check the app
 *   would promise a month it has already stopped honouring.
 */

/** The last stretch in which the app mentions the end of a subscription. */
export const EXPIRY_WARN_DAYS = 7;

/**
 * Whole days left, or `null` when there is no usable date.
 *
 * Rounded UP, so a subscription with four hours left reads as "today" rather
 * than as "0 days" or as nothing at all — the learner has hours of Pro, not
 * nothing. A past date returns a negative number rather than null: "it already
 * ended" is information, and the caller decides what to do with it.
 */
export function daysUntilExpiry(expiresAt?: string | null, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  const at = new Date(expiresAt).getTime();
  if (!Number.isFinite(at)) return null;
  return Math.ceil((at - now) / 86_400_000);
}

/**
 * The one line the home screen shows, or `null` when there is nothing to say.
 *
 * Arabic count agreement goes through `arCount`, because "1 أيام" and "2 يوم"
 * are the strings that make an Arabic-first product read as translated.
 */
export function expiryNoticeAr(
  expiresAt: string | null | undefined,
  isActive: boolean,
  now: number = Date.now(),
): string | null {
  if (!isActive) return null;
  const days = daysUntilExpiry(expiresAt, now);
  if (days === null || days < 0 || days > EXPIRY_WARN_DAYS) return null;
  if (days === 0) {
    return 'ينتهي اشتراكك اليوم — جدّد بكود جديد لتبقى المحادثات مفتوحة.';
  }
  const left = arCount(days, { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يوماً' });
  return `يتبقّى ${left} على نهاية اشتراكك — جدّد بكود جديد لتبقى المحادثات مفتوحة.`;
}
