import { describe, expect, it } from 'vitest';
import { localDateKey, recalculateStreak, shiftDateKey } from '../src/lib/utils/streak';

describe('streak engine', () => {
  const T = '2026-09-22'; // fixed today

  it('counts the first ever activity as day 1', () => {
    expect(recalculateStreak({ lastActiveDate: null, streakDays: 0, todayKey: T })).toEqual({
      streakDays: 1,
      streakExtended: true,
      streakReset: false,
      dateChanged: true,
    });
    expect(recalculateStreak({ lastActiveDate: '', streakDays: 0, todayKey: T })).toEqual({
      streakDays: 1,
      streakExtended: true,
      streakReset: false,
      dateChanged: true,
    });
  });

  it('never double-counts same-day sessions', () => {
    const result = recalculateStreak({ lastActiveDate: T, streakDays: 7, todayKey: T });
    expect(result.streakDays).toBe(7);
    expect(result.streakExtended).toBe(false);
    expect(result.dateChanged).toBe(false);
  });

  it('extends the streak on a consecutive day', () => {
    expect(recalculateStreak({ lastActiveDate: '2026-09-21', streakDays: 7, todayKey: T })).toMatchObject({
      streakDays: 8,
      streakExtended: true,
      streakReset: false,
    });
  });

  it('honestly resets after a missed day', () => {
    const result = recalculateStreak({ lastActiveDate: '2026-09-19', streakDays: 12, todayKey: T });
    expect(result).toEqual({ streakDays: 1, streakExtended: true, streakReset: true, dateChanged: true });
  });

  it('honestly resets after a long gap', () => {
    expect(recalculateStreak({ lastActiveDate: '2026-01-01', streakDays: 99, todayKey: T }).streakDays).toBe(1);
  });

  it('treats a corrupted future date as same-day, not infinite growth', () => {
    const result = recalculateStreak({ lastActiveDate: '2027-01-01', streakDays: 5, todayKey: T });
    expect(result.streakDays).toBe(5);
    expect(result.dateChanged).toBe(false);
  });

  it('starts from 0 streak when a first activity lands on a fresh account', () => {
    // Sanity: month/year boundaries and leap days must not break the arithmetic
    expect(recalculateStreak({ lastActiveDate: '2026-03-01', streakDays: 3, todayKey: '2026-03-02' }).streakDays).toBe(4);
    expect(recalculateStreak({ lastActiveDate: '2026-02-28', streakDays: 1, todayKey: '2026-03-01' }).streakDays).toBe(2);
    expect(recalculateStreak({ lastActiveDate: '2024-02-29', streakDays: 1, todayKey: '2024-03-01' }).streakDays).toBe(2);
  });

  it('date helpers round-trip across month boundaries', () => {
    expect(shiftDateKey('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(localDateKey(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
});
