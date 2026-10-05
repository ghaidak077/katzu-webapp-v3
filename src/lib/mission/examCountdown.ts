import { arCount } from '@/lib/i18n/arabicCount';
import { SENTENCE_NOM } from '@/lib/i18n/countForms';

/**
 * The countdown to the learner's own date.
 *
 * WHY IT IS A SEPARATE MODULE
 * "Days left" is the one number in this app that can be *wrong in the emotional
 * direction* — a date that has passed must read as passed, never as a large
 * positive number, and a date that was never set must read as nothing at all
 * rather than as "infinity days". Both mistakes are silent, so both are pinned
 * by tests instead of being re-derived on each screen.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It never implies the learner is ready, and it never counts down to a moment
 * the app cannot support: it counts to the day, and the line it produces says
 * what that day is, in the learner's words.
 */

const DAY_MS = 86_400_000;

/**
 * Whole days from `now` until `targetDate`, in the learner's local day terms.
 *
 * Calendar days, not `Math.ceil` of a duration: a target set for this evening
 * must read "اليوم" rather than "0 days", and a target 25 hours out must read
 * "غداً" rather than "1". Computed from local midnights so the answer is the same
 * in every timezone.
 */
export function daysUntilTarget(targetDate?: number | null, now = Date.now()): number | null {
  const target = Number(targetDate);
  if (!Number.isFinite(target) || target <= 0) return null;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(target);
  startOfTarget.setHours(0, 0, 0, 0);
  const days = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / DAY_MS);
  return Number.isFinite(days) ? days : null;
}

/**
 * The Arabic line, or null when there is nothing honest to say.
 *
 * `null` for a missing date and for a date in the past — the app must not keep
 * counting toward something that already happened, and must not announce a day
 * it was never told about.
 */
export type CountdownKind = 'exam' | 'move' | 'interview' | 'job' | 'other';

export function countdownLineAr(
  targetDate?: number | null,
  kind: CountdownKind = 'exam',
  now = Date.now(),
): string | null {
  const days = daysUntilTarget(targetDate, now);
  if (days === null || days < 0) return null;
  const what =
    kind === 'exam'
      ? 'امتحانك'
      : kind === 'move'
        ? 'انتقالك'
        : kind === 'interview'
          ? 'مقابلتك'
          : kind === 'job'
            ? 'بدء عملك'
            : 'تاريخك المهم';
  if (days === 0) return `اليوم هو ${what}.`;
  if (days === 1) return `بقي يوم واحد على ${what}.`;
  if (days <= 7) return `بقي ${arCount(days, SENTENCE_NOM)} على ${what} — يوم${days === 2 ? 'ان' : 'اً'} واضح.`;
  if (days <= 60) return `بقي ${arCount(days, SENTENCE_NOM)} على ${what}.`;
  return `${what} بعد ${arCount(days, SENTENCE_NOM)}.`;
}

/**
 * Whether the mission should shout the countdown.
 *
 * Only inside the last month, and only for an exam: a moving countdown shouted at
 * a learner 90 days out is noise, and it is the month where the number changes
 * what someone does today.
 */
export function shouldFeatureCountdown(
  targetDate?: number | null,
  kind: CountdownKind = 'exam',
  now = Date.now(),
): boolean {
  if (kind !== 'exam') return false;
  const days = daysUntilTarget(targetDate, now);
  return days !== null && days >= 0 && days <= 30;
}