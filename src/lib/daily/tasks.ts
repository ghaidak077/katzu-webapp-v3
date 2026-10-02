import { localDateKey, shiftDateKey } from '@/lib/utils/streak';

/**
 * The three daily tasks (V28 Stage 3) — the "what do I do today" contract.
 *
 * WHY IT IS PURE AND SEPARATE: the owner requirement is exactly three tasks
 * (one scenario session, one grammar step, one review batch), reset at local
 * midnight, with a single forgiven day so one missed day does not erase a
 * habit. Those are rules, so they live in tested functions rather than inline
 * in a screen where they would drift from the panel, the streak and the tests.
 *
 * Nothing here reads a database or a clock directly: the caller passes today's
 * evidence and the day key, which is what makes local-midnight reset and the
 * forgiveness window deterministic and testable without freezing time.
 */

export type DailyTaskKind = 'scenario' | 'grammar' | 'review';

export interface DailyTaskDefinition {
  kind: DailyTaskKind;
  /** Arabic task name shown on the card. */
  labelAr: string;
  /** Arabic label of the one action that completes it. */
  actionAr: string;
  /** Short Arabic line explaining what counts. */
  hintAr: string;
}

/**
 * How many graded review items are one honest batch.
 *
 * The rule (see `reviewTaskDone`) is `reps >= REVIEW_BATCH_SIZE` OR the queue is
 * empty after at least one review, so a learner whose queue is shorter than the
 * floor is never blocked on a task they cannot finish.
 */
export const REVIEW_BATCH_SIZE = 5;

export const DAILY_TASK_DEFS: readonly DailyTaskDefinition[] = [
  {
    kind: 'scenario',
    labelAr: 'محادثة مشهد واحدة',
    actionAr: 'ابدأ محادثة',
    hintAr: 'جلسة مشهد واحدة كاملة — تدريب أو محادثة حقيقية.',
  },
  {
    kind: 'grammar',
    labelAr: 'خطوة قواعد واحدة',
    actionAr: 'افتح القاعدة',
    hintAr: 'درس قواعد واحد في مسارك المفتوح.',
  },
  {
    kind: 'review',
    labelAr: 'دفعة مراجعة',
    actionAr: 'ابدأ المراجعة',
    hintAr: `راجع ما حان وقته — ${REVIEW_BATCH_SIZE} عناصر أو إفراغ قائمة اليوم.`,
  },
] as const;

export interface DailyTaskEvidence {
  /** Finished conversations recorded today. */
  sessionsToday: number;
  /** Grammar-lesson attempts recorded today. */
  grammarAttemptsToday: number;
  /** Review items graded today. */
  reviewRepsToday: number;
  /** Review items still due right now (used for the "queue emptied" path). */
  reviewDue: number;
  /**
   * Whether the day row already recorded the review batch complete.
   *
   * This exists because the review rule is the only one that depends on LIVE
   * state (`reviewDue`): a learner who emptied the queue at 10:00 completed the
   * batch, but if a new item becomes due at 18:00 the recomputed rule would say
   * "not done". A completed day is a fact about the learner, not a live query, so
   * the persisted flag has to win — otherwise more work would visibly *undo* the
   * task and drop the streak. Scenario and grammar do not need it because their
   * evidence is already passed as a finished 1/0.
   */
  reviewCompleted?: boolean;
}

export interface DailyTaskStatus extends DailyTaskDefinition {
  done: boolean;
  /** Progress toward the target, capped at it (a review batch is the only >1). */
  progress: number;
  target: number;
}

/** The review task's own rule, exposed because the writer stamps it too. */
export function reviewTaskDone(repsToday: number, dueCount: number): boolean {
  const reps = Math.max(0, Math.floor(repsToday || 0));
  if (reps <= 0) return false;
  return reps >= REVIEW_BATCH_SIZE || Math.max(0, dueCount || 0) === 0;
}

function taskStatus(def: DailyTaskDefinition, evidence: DailyTaskEvidence): DailyTaskStatus {
  switch (def.kind) {
    case 'scenario': {
      const progress = Math.max(0, evidence.sessionsToday || 0);
      return { ...def, done: progress >= 1, progress: Math.min(progress, 1), target: 1 };
    }
    case 'grammar': {
      const progress = Math.max(0, evidence.grammarAttemptsToday || 0);
      return { ...def, done: progress >= 1, progress: Math.min(progress, 1), target: 1 };
    }
    case 'review': {
      const reps = Math.max(0, evidence.reviewRepsToday || 0);
      // Monotonic: once the day row recorded the batch, a later due item cannot
      // un-complete it (see `reviewCompleted`).
      const done = evidence.reviewCompleted === true || reviewTaskDone(reps, evidence.reviewDue);
      return {
        ...def,
        done,
        progress: Math.min(reps, REVIEW_BATCH_SIZE),
        target: REVIEW_BATCH_SIZE,
      };
    }
  }
}

/** Today's three tasks, in the fixed order the panel renders them. */
export function dailyTaskStatuses(evidence: DailyTaskEvidence): DailyTaskStatus[] {
  return DAILY_TASK_DEFS.map((def) => taskStatus(def, evidence));
}

export function dailyTasksDoneCount(statuses: readonly DailyTaskStatus[]): number {
  return statuses.filter((status) => status.done).length;
}

export function allDailyTasksDone(statuses: readonly DailyTaskStatus[]): boolean {
  return statuses.length > 0 && statuses.every((status) => status.done);
}

/** The YYYY-MM-DD key the app resets at local midnight. */
export function dailyResetKey(date: Date = new Date()): string {
  return localDateKey(date);
}

/** How many missed days a streak survives. One day, by product decision. */
export const FORGIVEN_DAYS = 1;

/** Hard bound so a corrupted history can never spin the loop forever. */
const MAX_LOOKBACK_DAYS = 730;

export interface DailyStreakInput {
  /** Local day keys on which all three tasks were completed. */
  completedDateKeys: readonly string[];
  /** Today's local day key. */
  todayKey: string;
  /** Whether all three tasks are complete today already. */
  completedToday: boolean;
  /** Injectable for tests; defaults to FORGIVEN_DAYS. */
  forgivenDays?: number;
}

export interface DailyStreakResult {
  /** Consecutive completed days ending today (or yesterday), one gap forgiven. */
  streakDays: number;
  /** True when exactly one missed day is currently being forgiven. */
  forgiving: boolean;
  /** The day currently forgiven, when there is one. */
  missedDateKey: string | null;
}

/**
 * The daily-task streak.
 *
 * - Today incomplete: counting starts at yesterday, because today is not a miss
 *   yet — a learner who has not opened the app today must not see a broken
 *   streak before the day is over.
 * - A single missing day inside the run is forgiven (`FORGIVEN_DAYS`); a second
 *   missing day ends the run, so the streak is still honest about real habit.
 * - Same-day repeats never inflate it: each day key counts once.
 */
export function dailyTaskStreak(input: DailyStreakInput): DailyStreakResult {
  const completed = new Set((input.completedDateKeys || []).filter(Boolean));
  const forgivenDays = Math.max(0, Math.floor(input.forgivenDays ?? FORGIVEN_DAYS));

  let cursor = input.completedToday ? input.todayKey : shiftDateKey(input.todayKey, -1);
  let streakDays = 0;
  let gapsUsed = 0;
  let missedDateKey: string | null = null;

  // Walk backwards from today (or yesterday while today is still open). A run of
  // missing days is only forgiven when a completed day follows it — a gap that
  // simply runs off the end of the history ends the streak instead of being
  // dressed up as a forgiven day.
  for (let step = 0; step < MAX_LOOKBACK_DAYS; step += 1) {
    if (completed.has(cursor)) {
      streakDays += 1;
      cursor = shiftDateKey(cursor, -1);
      continue;
    }

    let gap = 0;
    let probe = cursor;
    while (gap < forgivenDays && !completed.has(probe)) {
      gap += 1;
      probe = shiftDateKey(probe, -1);
    }
    if (gap > 0 && gapsUsed + gap <= forgivenDays && completed.has(probe)) {
      gapsUsed += gap;
      if (missedDateKey === null) missedDateKey = cursor;
      cursor = probe;
      continue;
    }
    break;
  }

  // A gap only "counts" as forgiveness once the run it protects actually has a
  // day in it; otherwise a brand-new learner would be told a day was forgiven.
  const forgiving = gapsUsed > 0 && streakDays > 0;
  return { streakDays, forgiving, missedDateKey: forgiving ? missedDateKey : null };
}
