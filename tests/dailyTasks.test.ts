import { describe, expect, it } from 'vitest';
import {
  DAILY_TASK_DEFS,
  FORGIVEN_DAYS,
  REVIEW_BATCH_SIZE,
  allDailyTasksDone,
  dailyResetKey,
  dailyTaskStatuses,
  dailyTaskStreak,
  dailyTasksDoneCount,
  reviewTaskDone,
} from '../src/lib/daily/tasks';

const base = { sessionsToday: 0, grammarAttemptsToday: 0, reviewRepsToday: 0, reviewDue: 0 };

describe('daily tasks', () => {
  it('defines exactly the three required tasks, in a fixed order', () => {
    expect(DAILY_TASK_DEFS.map((def) => def.kind)).toEqual(['scenario', 'grammar', 'review']);
    for (const def of DAILY_TASK_DEFS) {
      expect(def.labelAr.trim().length).toBeGreaterThan(0);
      expect(def.actionAr.trim().length).toBeGreaterThan(0);
    }
  });

  it('marks the scenario task done after one session', () => {
    const statuses = dailyTaskStatuses({ ...base, sessionsToday: 1 });
    expect(statuses[0].done).toBe(true);
    expect(statuses[0].target).toBe(1);
    expect(statuses[0].progress).toBe(1);
  });

  it('marks the grammar task done after one attempt', () => {
    const statuses = dailyTaskStatuses({ ...base, grammarAttemptsToday: 1 });
    expect(statuses[1].done).toBe(true);
  });

  it('completes the review batch at the floor, or when the queue is emptied', () => {
    expect(reviewTaskDone(0, 0)).toBe(false);
    expect(reviewTaskDone(1, 0)).toBe(true);
    expect(reviewTaskDone(1, 3)).toBe(false);
    expect(reviewTaskDone(REVIEW_BATCH_SIZE, 3)).toBe(true);
    expect(reviewTaskDone(REVIEW_BATCH_SIZE - 1, 0)).toBe(true);
  });

  it('reports a review batch that is only part-done without calling it done', () => {
    const statuses = dailyTaskStatuses({ ...base, reviewRepsToday: 2, reviewDue: 4 });
    expect(statuses[2].done).toBe(false);
    expect(statuses[2].progress).toBe(2);
    expect(statuses[2].target).toBe(REVIEW_BATCH_SIZE);
  });

  it('keeps a recorded review completion after new items become due', () => {
    // The review rule depends on live due-count, so without the persisted flag a
    // learner who emptied the queue at 10:00 and made one mistake at 18:00 would
    // see the task un-complete. The flag is authoritative.
    const regressed = dailyTaskStatuses({ ...base, reviewRepsToday: 2, reviewDue: 3, reviewCompleted: false });
    expect(regressed[2].done).toBe(false);

    const recorded = dailyTaskStatuses({ ...base, reviewRepsToday: 2, reviewDue: 3, reviewCompleted: true });
    expect(recorded[2].done).toBe(true);
    expect(allDailyTasksDone(recorded)).toBe(false); // scenario + grammar still open
  });

  it('counts done tasks and only reports all-done when all three are', () => {
    const partial = dailyTaskStatuses({ ...base, sessionsToday: 1, grammarAttemptsToday: 1 });
    expect(dailyTasksDoneCount(partial)).toBe(2);
    expect(allDailyTasksDone(partial)).toBe(false);

    const full = dailyTaskStatuses({ sessionsToday: 1, grammarAttemptsToday: 1, reviewRepsToday: 1, reviewDue: 0 });
    expect(allDailyTasksDone(full)).toBe(true);
    expect(dailyTasksDoneCount(full)).toBe(3);
  });

  it('uses the local calendar day as the reset key', () => {
    // Constructed from local parts on purpose: the key must not shift with UTC.
    expect(dailyResetKey(new Date(2026, 9, 2, 23, 59))).toBe('2026-10-02');
    expect(dailyResetKey(new Date(2026, 9, 3, 0, 1))).toBe('2026-10-03');
  });
});

describe('daily task streak (one forgiven day)', () => {
  const today = '2026-10-10';

  it('is zero with no history and says nothing was forgiven', () => {
    expect(dailyTaskStreak({ completedDateKeys: [], todayKey: today, completedToday: false })).toEqual({
      streakDays: 0,
      forgiving: false,
      missedDateKey: null,
    });
  });

  it('counts consecutive completed days ending today', () => {
    const result = dailyTaskStreak({
      completedDateKeys: ['2026-10-10', '2026-10-09', '2026-10-08'],
      todayKey: today,
      completedToday: true,
    });
    expect(result.streakDays).toBe(3);
    expect(result.forgiving).toBe(false);
  });

  it('does not count today as a miss while it is still in progress', () => {
    const result = dailyTaskStreak({
      completedDateKeys: ['2026-10-09', '2026-10-08'],
      todayKey: today,
      completedToday: false,
    });
    expect(result.streakDays).toBe(2);
    expect(result.forgiving).toBe(false);
  });

  it('forgives exactly one missing day inside the run', () => {
    const result = dailyTaskStreak({
      completedDateKeys: ['2026-10-10', '2026-10-08', '2026-10-07'],
      todayKey: today,
      completedToday: true,
    });
    expect(result.streakDays).toBe(3);
    expect(result.forgiving).toBe(true);
    expect(result.missedDateKey).toBe('2026-10-09');
  });

  it('ends the run at two missing days and does not dress them up as forgiven', () => {
    const result = dailyTaskStreak({
      completedDateKeys: ['2026-10-10', '2026-10-07', '2026-10-06'],
      todayKey: today,
      completedToday: true,
    });
    expect(result.streakDays).toBe(1);
    expect(result.forgiving).toBe(false);
    expect(result.missedDateKey).toBe(null);
  });

  it('forgives a single gap immediately before today', () => {
    const result = dailyTaskStreak({
      completedDateKeys: ['2026-10-10', '2026-10-08'],
      todayKey: today,
      completedToday: true,
    });
    expect(result.streakDays).toBe(2);
    expect(result.missedDateKey).toBe('2026-10-09');
  });

  it('never inflates on duplicate day keys', () => {
    const result = dailyTaskStreak({
      completedDateKeys: ['2026-10-10', '2026-10-10', '2026-10-09'],
      todayKey: today,
      completedToday: true,
    });
    expect(result.streakDays).toBe(2);
  });

  it('honours an explicit forgiveness override', () => {
    const result = dailyTaskStreak({
      completedDateKeys: ['2026-10-10', '2026-10-07'],
      todayKey: today,
      completedToday: true,
      forgivenDays: 2,
    });
    expect(result.streakDays).toBe(2);
    expect(result.forgiving).toBe(true);
  });

  it('defaults the forgiveness window to one day', () => {
    expect(FORGIVEN_DAYS).toBe(1);
  });
});
