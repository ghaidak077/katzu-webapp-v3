import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/katzuDb';
import {
  clearGrammarLessonProgress,
  loadLessonProgress,
  markLessonTestedOut,
  recordLessonAttempt,
} from '@/lib/grammar/pathStore';
import { MAX_LESSON_ATTEMPTS, lessonState } from '@/lib/grammar/path';

/**
 * The database half of the grammar path: it must store exactly what the pure rule
 * reads, and it must stay bounded and additive. The rule itself is proven in
 * grammarPath.test.ts; this file proves the store does not distort it.
 */

beforeEach(async () => {
  await db.open();
  await db.grammar_lessons.clear();
});

afterEach(async () => {
  await db.grammar_lessons.clear();
});

describe('grammar path store', () => {
  it('records attempts and lets the pure rule decide the state', async () => {
    await recordLessonAttempt('g_a', { correct: 3, total: 3, sessionId: 's1' });
    expect(lessonState(await db.grammar_lessons.get('g_a'))).toBe('in_progress');

    // A second attempt in the SAME sitting is still one session.
    await recordLessonAttempt('g_a', { correct: 3, total: 3, sessionId: 's1' });
    expect(lessonState(await db.grammar_lessons.get('g_a'))).toBe('in_progress');

    // A separate session passes it.
    await recordLessonAttempt('g_a', { correct: 2, total: 3, sessionId: 's2' });
    expect(lessonState(await db.grammar_lessons.get('g_a'))).toBe('passed');
  });

  it('round-trips every lesson into a keyed map', async () => {
    await recordLessonAttempt('g_a', { correct: 1, total: 3, sessionId: 's1' });
    await recordLessonAttempt('g_b', { correct: 3, total: 3, sessionId: 's1' });
    const loaded = await loadLessonProgress();
    expect(Object.keys(loaded).sort()).toEqual(['g_a', 'g_b']);
    expect(loaded.g_b.attempts).toHaveLength(1);
  });

  it('stamps a test-out without losing the attempts already recorded', async () => {
    await recordLessonAttempt('g_a', { correct: 1, total: 3, sessionId: 's1' });
    const stamped = await markLessonTestedOut('g_a');
    expect(stamped.testedOutAt).toBeGreaterThan(0);
    expect(stamped.attempts).toHaveLength(1);
    expect(lessonState(stamped)).toBe('tested_out');
  });

  it('keeps the attempt list bounded', async () => {
    for (let i = 0; i < MAX_LESSON_ATTEMPTS + 5; i += 1) {
      await recordLessonAttempt('g_a', { correct: 3, total: 3, sessionId: `s${i}` });
    }
    const row = await db.grammar_lessons.get('g_a');
    expect(row?.attempts).toHaveLength(MAX_LESSON_ATTEMPTS);
  });

  it('clears all path progress', async () => {
    await recordLessonAttempt('g_a', { correct: 3, total: 3, sessionId: 's1' });
    await markLessonTestedOut('g_b');
    await clearGrammarLessonProgress();
    expect(await db.grammar_lessons.count()).toBe(0);
  });
});
