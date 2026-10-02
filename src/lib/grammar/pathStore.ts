import { db } from '@/lib/db/katzuDb';
import { MAX_LESSON_ATTEMPTS } from './path';
import type { GrammarLessonAttempt, GrammarLessonProgressEntity } from '@/types/models';

/**
 * Database-facing half of the grammar path. The rules ("is this passed, may I
 * open the next lesson") live in ./path.ts, pure and unit-tested; this file only
 * reads and writes them, so there is exactly one source of truth for the rule.
 *
 * Everything here is bounded and additive: an attempt list is capped, a second
 * attempt in the same session is recorded but cannot fake the second session a
 * pass requires, and a test-out is a stamp rather than a deletion.
 */

/** Reads every lesson's progress, keyed by lesson id. */
export async function loadLessonProgress(): Promise<Record<string, GrammarLessonProgressEntity>> {
  const rows = await db.grammar_lessons.toArray();
  return Object.fromEntries(rows.map((row) => [row.lessonId, row]));
}

/**
 * Records one completed run of a lesson's own exercise set and returns the stored
 * row. `sessionId` is supplied by the caller (one per lesson sitting) so two
 * attempts made in the same sitting are honestly one session.
 */
export async function recordLessonAttempt(
  lessonId: string,
  result: { correct: number; total: number; sessionId: string },
  now: number = Date.now(),
): Promise<GrammarLessonProgressEntity> {
  const existing = await db.grammar_lessons.get(lessonId);
  const attempt: GrammarLessonAttempt = {
    correct: Math.max(0, Math.floor(result.correct)),
    total: Math.max(0, Math.floor(result.total)),
    at: now,
    sessionId: result.sessionId,
  };
  const attempts = [...(existing?.attempts ?? []), attempt].slice(-MAX_LESSON_ATTEMPTS);
  const row: GrammarLessonProgressEntity = {
    lessonId,
    attempts,
    testedOutAt: existing?.testedOutAt,
    updatedAt: now,
  };
  await db.grammar_lessons.put(row);
  return row;
}

/**
 * Stamps a lesson as tested out. Only the caller that judged the check may call
 * this; the pure `isTestOutPass` decides.
 */
export async function markLessonTestedOut(
  lessonId: string,
  now: number = Date.now(),
): Promise<GrammarLessonProgressEntity> {
  const existing = await db.grammar_lessons.get(lessonId);
  const row: GrammarLessonProgressEntity = {
    lessonId,
    attempts: existing?.attempts ?? [],
    testedOutAt: existing?.testedOutAt ?? now,
    updatedAt: now,
  };
  await db.grammar_lessons.put(row);
  return row;
}

/** Clears all grammar-path progress (sign-out; the user-scoped wipe calls it too). */
export async function clearGrammarLessonProgress(): Promise<void> {
  await db.grammar_lessons.clear();
}
