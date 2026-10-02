import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, wipeUserScopedData } from '@/lib/db/katzuDb';
import {
  markGrammarTaskDone,
  markReviewGraded,
  markScenarioTaskDone,
  readDailyTasks,
} from '@/lib/daily/taskStore';
import { localDateKey } from '@/lib/utils/streak';
import type { DailyTaskEntity, ReviewItemEntity } from '@/types/models';

/**
 * The database half of the daily tasks. The rules are proven in
 * dailyTasks.test.ts; this file proves the store records them faithfully —
 * including the review batch's "queue emptied" path and the one-forgiven-day
 * streak — and that a sign-out wipe takes the day rows with it.
 */

const TODAY = new Date(2026, 9, 10, 12, 0).getTime();

function dayKey(date: Date): string {
  return localDateKey(date);
}

function completeRow(date: Date): DailyTaskEntity {
  return {
    dateKey: dayKey(date),
    scenario: true,
    grammar: true,
    review: true,
    reviewReps: 5,
    completedAt: date.getTime(),
    updatedAt: date.getTime(),
  };
}

function reviewItem(id: number, dueAt: number): ReviewItemEntity {
  return {
    id,
    userId: 'current_user',
    kind: 'vocab',
    refId: `ref_${id}`,
    promptAr: 'كلمة',
    answerDe: 'Wort',
    dueAt,
    intervalDays: 1,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    reviews: 0,
    createdAt: dueAt,
  };
}

beforeEach(async () => {
  await db.open();
  await db.daily_tasks.clear();
  await db.review_items.clear();
});

afterEach(async () => {
  await db.daily_tasks.clear();
  await db.review_items.clear();
});

describe('daily task store', () => {
  it('records the scenario and grammar tasks for today', async () => {
    await markScenarioTaskDone(TODAY);
    await markGrammarTaskDone(TODAY);

    const snapshot = await readDailyTasks(TODAY);
    expect(snapshot.statuses.find((s) => s.kind === 'scenario')?.done).toBe(true);
    expect(snapshot.statuses.find((s) => s.kind === 'grammar')?.done).toBe(true);
    expect(snapshot.statuses.find((s) => s.kind === 'review')?.done).toBe(false);
    expect(snapshot.doneCount).toBe(2);
    expect(snapshot.allDone).toBe(false);
    expect(await db.daily_tasks.get(dayKey(new Date(TODAY)))).toMatchObject({ scenario: true, grammar: true });
  });

  it('completes the review batch when the queue is emptied after a review', async () => {
    // A short queue: three due items, one graded — the floor is not reached, yet
    // the batch is genuinely done because nothing is left due.
    await db.review_items.bulkPut([reviewItem(1, TODAY - 1000), reviewItem(2, TODAY - 1000)]);
    await markReviewGraded(TODAY);
    await db.review_items.clear(); // the learner cleared the last due item too
    await markReviewGraded(TODAY);

    const row = await db.daily_tasks.get(dayKey(new Date(TODAY)));
    expect(row?.reviewReps).toBe(2);
    expect((await readDailyTasks(TODAY)).statuses.find((s) => s.kind === 'review')?.done).toBe(true);
  });

  it('keeps a day complete (and the streak intact) when a new item becomes due later', async () => {
    // Regression: the batch was completed by emptying a short queue, then a later
    // mistake added a due item. A completed day must not be un-completed by that.
    await db.review_items.bulkPut([reviewItem(1, TODAY - 1000), reviewItem(2, TODAY - 1000)]);
    await db.review_items.clear();
    await markReviewGraded(TODAY);
    await markScenarioTaskDone(TODAY);
    await markGrammarTaskDone(TODAY);

    // Two prior completed days so the streak is provable, not just 1.
    await db.daily_tasks.bulkPut([completeRow(new Date(2026, 9, 9, 12)), completeRow(new Date(2026, 9, 8, 12))]);
    const complete = await readDailyTasks(TODAY);
    expect(complete.allDone).toBe(true);
    expect(complete.streakDays).toBe(3);

    // A new item becomes due after the batch was already recorded.
    await db.review_items.put(reviewItem(9, TODAY - 500));

    const after = await readDailyTasks(TODAY);
    expect(after.statuses.find((s) => s.kind === 'review')?.done).toBe(true);
    expect(after.allDone).toBe(true);
    expect(after.doneCount).toBe(3);
    expect(after.streakDays).toBe(3);
  });

  it('does not complete a short review batch while items are still due', async () => {
    await db.review_items.bulkPut([
      reviewItem(1, TODAY - 1000),
      reviewItem(2, TODAY - 1000),
      reviewItem(3, TODAY - 1000),
    ]);
    await markReviewGraded(TODAY);
    await markReviewGraded(TODAY);
    await markReviewGraded(TODAY);

    const snapshot = await readDailyTasks(TODAY);
    const review = snapshot.statuses.find((s) => s.kind === 'review');
    expect(review?.done).toBe(false);
    expect(review?.progress).toBe(3);
  });

  it('completes the review batch at the floor even with due items left', async () => {
    for (let i = 0; i < 10; i += 1) await db.review_items.put(reviewItem(i + 1, TODAY - 1000));
    for (let i = 0; i < 5; i += 1) await markReviewGraded(TODAY);
    expect((await readDailyTasks(TODAY)).statuses.find((s) => s.kind === 'review')?.done).toBe(true);
  });

  it('counts a streak of completed days and forgives exactly one gap', async () => {
    // 10-08 and 10-09 complete, today (10-10) completed now.
    await db.daily_tasks.bulkPut([completeRow(new Date(2026, 9, 8, 12)), completeRow(new Date(2026, 9, 9, 12))]);
    await markScenarioTaskDone(TODAY);
    await markGrammarTaskDone(TODAY);
    await markReviewGraded(TODAY);

    const snapshot = await readDailyTasks(TODAY);
    expect(snapshot.allDone).toBe(true);
    expect(snapshot.streakDays).toBe(3);
    expect(snapshot.forgiving).toBe(false);
  });

  it('forgives a single missed day inside the run', async () => {
    // Today complete, yesterday missed, the two days before complete.
    await db.daily_tasks.bulkPut([completeRow(new Date(2026, 9, 8, 12)), completeRow(new Date(2026, 9, 7, 12))]);
    await markScenarioTaskDone(TODAY);
    await markGrammarTaskDone(TODAY);
    await markReviewGraded(TODAY);

    const snapshot = await readDailyTasks(TODAY);
    expect(snapshot.streakDays).toBe(3);
    expect(snapshot.forgiving).toBe(true);
    expect(snapshot.missedDateKey).toBe(dayKey(new Date(2026, 9, 9, 12)));
  });

  it('wipes the day rows with the rest of the user-scoped data', async () => {
    await markScenarioTaskDone(TODAY);
    await wipeUserScopedData();
    expect(await db.daily_tasks.count()).toBe(0);
  });
});
