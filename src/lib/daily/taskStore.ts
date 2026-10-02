import { db } from '@/lib/db/katzuDb';
import { countDue } from '@/lib/srs/engine';
import { localDateKey } from '@/lib/utils/streak';
import {
  allDailyTasksDone,
  dailyTaskStatuses,
  dailyTaskStreak,
  dailyTasksDoneCount,
  reviewTaskDone,
  type DailyTaskStatus,
} from '@/lib/daily/tasks';
import type { DailyTaskEntity } from '@/types/models';

/**
 * The database-facing half of the daily tasks. The rules ("what makes a task
 * done", "how the forgiven-day streak counts") live in `./tasks.ts`, pure and
 * unit-tested; this file only reads and writes them, so there is exactly one
 * source of truth for the rules.
 *
 * A day row is MONOTONIC: once a task is complete for the day it stays complete,
 * even if the evidence that produced it changes (a review item becoming due
 * again). That is deliberate — a completed day is a fact about the learner, not
 * a live query — and it is what makes the streak read history instead of
 * re-deriving it from lossy fields.
 */

export interface DailyTasksSnapshot {
  statuses: DailyTaskStatus[];
  doneCount: number;
  allDone: boolean;
  /** Consecutive completed days, one forgiven day included. */
  streakDays: number;
  /** True when one missed day is currently being forgiven by the streak. */
  forgiving: boolean;
  missedDateKey: string | null;
  /** Review items due right now, so the panel can show the queue's size. */
  dueCount: number;
}

function emptyRow(dateKey: string, now: number): DailyTaskEntity {
  return { dateKey, scenario: false, grammar: false, review: false, reviewReps: 0, updatedAt: now };
}

function finalize(row: DailyTaskEntity, now: number): DailyTaskEntity {
  const complete = row.scenario && row.grammar && row.review;
  return {
    ...row,
    completedAt: row.completedAt ?? (complete ? now : undefined),
    updatedAt: now,
  };
}

async function loadOrCreate(dateKey: string, now: number): Promise<DailyTaskEntity> {
  return (await db.daily_tasks.get(dateKey)) ?? emptyRow(dateKey, now);
}

/** Review items due right now, ignoring suppressed ones (they are never shown). */
async function countDueNow(now: number): Promise<number> {
  const items = await db.review_items.toArray();
  const visible = items.filter((item) => !item.suppressed).map((item) => ({ dueAt: item.dueAt }));
  return countDue(visible, now);
}

/** Records a finished scenario conversation for today's task. */
export async function markScenarioTaskDone(now: number = Date.now()): Promise<void> {
  const dateKey = localDateKey(new Date(now));
  const row = await loadOrCreate(dateKey, now);
  row.scenario = true;
  await db.daily_tasks.put(finalize(row, now));
}

/** Records a completed grammar lesson attempt for today's task. */
export async function markGrammarTaskDone(now: number = Date.now()): Promise<void> {
  const dateKey = localDateKey(new Date(now));
  const row = await loadOrCreate(dateKey, now);
  row.grammar = true;
  await db.daily_tasks.put(finalize(row, now));
}

/**
 * Records one graded review item. The batch is complete when the floor is
 * reached OR the queue is empty after at least one review, so a learner with a
 * short queue is never stuck on a task they cannot finish.
 */
export async function markReviewGraded(now: number = Date.now()): Promise<void> {
  const dateKey = localDateKey(new Date(now));
  const row = await loadOrCreate(dateKey, now);
  row.reviewReps = Math.max(0, row.reviewReps || 0) + 1;
  if (reviewTaskDone(row.reviewReps, await countDueNow(now))) row.review = true;
  await db.daily_tasks.put(finalize(row, now));
}

/** Today's three tasks plus the forgiven-day streak, in one read. */
export async function readDailyTasks(now: number = Date.now()): Promise<DailyTasksSnapshot> {
  const [rows, dueCount] = await Promise.all([db.daily_tasks.toArray(), countDueNow(now)]);
  const todayKey = localDateKey(new Date(now));
  const todayRow = rows.find((row) => row.dateKey === todayKey) ?? null;

  const statuses = dailyTaskStatuses({
    sessionsToday: todayRow?.scenario ? 1 : 0,
    grammarAttemptsToday: todayRow?.grammar ? 1 : 0,
    reviewRepsToday: todayRow?.reviewReps ?? 0,
    reviewDue: dueCount,
    // The row is authoritative (see `DailyTaskEvidence.reviewCompleted`): a batch
    // completed earlier today stays complete even if a new item becomes due now.
    reviewCompleted: todayRow?.review === true,
  });

  const completedDateKeys = rows
    .filter((row) => row.scenario && row.grammar && row.review)
    .map((row) => row.dateKey);
  // Derived from the stored row, not from the live statuses: the day's completion
  // is a recorded fact, so a later due review item can never erase today from the
  // streak. This is the same source `completedDateKeys` filters on, keeping the
  // panel and the streak in agreement by construction.
  const completedToday = !!(todayRow && todayRow.scenario && todayRow.grammar && todayRow.review);
  const streak = dailyTaskStreak({
    completedDateKeys,
    todayKey,
    completedToday,
  });

  return {
    statuses,
    doneCount: dailyTasksDoneCount(statuses),
    allDone: allDailyTasksDone(statuses),
    streakDays: streak.streakDays,
    forgiving: streak.forgiving,
    missedDateKey: streak.missedDateKey,
    dueCount,
  };
}
