// Pure streak logic for the daily habit loop. Honest by design: missing a day
// resets the streak, and same-day repeats never inflate it.

export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + deltaDays);
  return localDateKey(date);
}

export interface StreakInput {
  lastActiveDate: string | null | undefined; // local YYYY-MM-DD
  streakDays: number; // current stored value
  todayKey?: string; // injectable for tests; defaults to local today
}

export interface StreakResult {
  streakDays: number; // new streak value
  streakExtended: boolean; // true when today continues the streak
  streakReset: boolean; // true when a missed day(s) reset the streak
  dateChanged: boolean; // true when lastActiveDate must be updated
}

/**
 * Recompute the streak given the last active local date.
 * - First ever activity: streak = 1.
 * - Same day repeat: streak unchanged (no double counting).
 * - Consecutive day: streak + 1.
 * - Gap of >= 2 days: honest reset to 1.
 * - Corrupted future date (device clock change): treated as same-day, no growth.
 */
export function recalculateStreak(input: StreakInput): StreakResult {
  const today = input.todayKey ?? localDateKey();
  const last = (input.lastActiveDate || '').trim();

  if (!last) {
    return { streakDays: 1, streakExtended: true, streakReset: false, dateChanged: true };
  }

  if (last === today) {
    return {
      streakDays: Math.max(0, input.streakDays ?? 0),
      streakExtended: false,
      streakReset: false,
      dateChanged: false,
    };
  }

  // Future/corrupted date (device clock jumped ahead): stay conservative —
  // no growth, no punishment. Real dates resume normal logic later.
  if (last > today) {
    return {
      streakDays: Math.max(0, input.streakDays ?? 0),
      streakExtended: false,
      streakReset: false,
      dateChanged: false,
    };
  }

  const yesterday = shiftDateKey(today, -1);
  if (last === yesterday) {
    return { streakDays: input.streakDays + 1, streakExtended: true, streakReset: false, dateChanged: true };
  }

  // Any older date: honest reset.
  return { streakDays: 1, streakExtended: true, streakReset: true, dateChanged: true };
}
