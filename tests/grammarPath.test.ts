import { describe, expect, it } from 'vitest';
import {
  GRAMMAR_ORDER_HINTS,
  LESSON_PASS_RATIO,
  buildGrammarPath,
  isLessonCleared,
  isQualifyingAttempt,
  isTestOutPass,
  lessonState,
  mixedReviewLessonIds,
  orderGrammarLessons,
  placementStartIndex,
  type GrammarLesson,
} from '@/lib/grammar/path';
import type { GrammarEntity, GrammarLessonProgressEntity } from '@/types/models';

/**
 * The grammar path's deciding rules (V28 Stage 2B).
 *
 * These are the tests that make "lesson N+1 unlocks only after N is passed" a
 * fact rather than an intention, and that stop one lucky answer from promoting
 * anyone. Everything here is pure — no Dexie, no React, no clock.
 */

type Row = Pick<GrammarEntity, 'id' | 'title_ar' | 'rule_ar' | 'level'>;

const row = (id: string, level: Row['level'] = 'A1'): Row => ({
  id,
  title_ar: `درس ${id}`,
  rule_ar: `قاعدة ${id}`,
  level,
});

function progress(
  lessonId: string,
  attempts: Array<{ correct: number; total: number; sessionId: string; at?: number }>,
  testedOutAt?: number,
): GrammarLessonProgressEntity {
  return {
    lessonId,
    attempts: attempts.map((attempt, index) => ({ ...attempt, at: attempt.at ?? index + 1 })),
    testedOutAt,
    updatedAt: 1,
  };
}

describe('orderGrammarLessons', () => {
  it('is deterministic regardless of input order', () => {
    const rows = [row('g_c'), row('g_a1_z'), row('g_b', 'A2'), row('g_a')];
    const first = orderGrammarLessons(rows).map((lesson) => lesson.id);
    const shuffled = orderGrammarLessons([row('g_a'), row('g_b', 'A2'), row('g_a1_z'), row('g_c')]).map(
      (lesson) => lesson.id,
    );
    expect(first).toEqual(shuffled);
  });

  it('orders by level first (A0 → B2), then by id within a level', () => {
    const ordered = orderGrammarLessons([row('g_z', 'B1'), row('g_a', 'A0'), row('g_m', 'A0'), row('g_b', 'A2')]);
    expect(ordered.map((lesson) => lesson.id)).toEqual(['g_a', 'g_m', 'g_b', 'g_z']);
    expect(ordered.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4]);
  });

  it('uses the authored order hints ahead of the alphabetical fallback', () => {
    const [firstHint, secondHint] = GRAMMAR_ORDER_HINTS;
    // A row that sorts later alphabetically still comes first when it is hinted.
    const later = firstHint < secondHint ? secondHint : firstHint;
    const earlier = later === firstHint ? secondHint : firstHint;
    const ordered = orderGrammarLessons([row(later), row(earlier)]);
    expect(ordered.map((lesson) => lesson.id)).toEqual([earlier, later]);
  });

  it('gives every lesson after the first a single prerequisite (the one before it)', () => {
    const ordered = orderGrammarLessons([row('g_a'), row('g_b'), row('g_c')]);
    expect(ordered[0].prerequisites).toEqual([]);
    expect(ordered[1].prerequisites).toEqual(['g_a']);
    expect(ordered[2].prerequisites).toEqual(['g_b']);
  });

  it('is never empty-safe: an empty row set produces an empty path, not a throw', () => {
    expect(orderGrammarLessons([])).toEqual([]);
    const path = buildGrammarPath([], {});
    expect(path).toMatchObject({ totalCount: 0, completedCount: 0, nextId: null, nodes: [] });
  });
});

describe('placementStartIndex', () => {
  const lessons = orderGrammarLessons([row('g_a0', 'A0'), row('g_a1', 'A1'), row('g_a2', 'A2')]);

  it('starts at the first lesson of the placed level', () => {
    expect(placementStartIndex(lessons, 'A1')).toBe(1);
    expect(placementStartIndex(lessons, 'A2')).toBe(2);
  });

  it('treats no placement as the very first lesson', () => {
    expect(placementStartIndex(lessons, null)).toBe(0);
    expect(placementStartIndex(lessons, 'A0')).toBe(0);
  });

  it('places someone above all content after every lesson, so nothing is locked', () => {
    expect(placementStartIndex(lessons, 'B2')).toBe(lessons.length);
  });
});

describe('the pass rule (lessonState)', () => {
  it('needs two SEPARATE sessions at the threshold, never one answer', () => {
    expect(lessonState(undefined)).toBe('not_started');
    expect(lessonState(progress('g_a', []))).toBe('not_started');

    // One qualifying session: in progress, not passed.
    const oneSession = progress('g_a', [{ correct: 3, total: 3, sessionId: 's1' }]);
    expect(lessonState(oneSession)).toBe('in_progress');
    expect(isLessonCleared(oneSession)).toBe(false);

    // Two qualifying attempts inside the SAME session are one sitting.
    const sameSession = progress('g_a', [
      { correct: 3, total: 3, sessionId: 's1' },
      { correct: 3, total: 3, sessionId: 's1' },
    ]);
    expect(lessonState(sameSession)).toBe('in_progress');

    // Two separate qualifying sessions pass.
    const twoSessions = progress('g_a', [
      { correct: 2, total: 3, sessionId: 's1' },
      { correct: 3, total: 3, sessionId: 's2' },
    ]);
    expect(lessonState(twoSessions)).toBe('passed');
    expect(isLessonCleared(twoSessions)).toBe(true);
  });

  it('counts an attempt only at the threshold (two of three)', () => {
    expect(LESSON_PASS_RATIO).toBeCloseTo(2 / 3);
    expect(isQualifyingAttempt({ correct: 2, total: 3, at: 0, sessionId: 's' })).toBe(true);
    expect(isQualifyingAttempt({ correct: 1, total: 3, at: 0, sessionId: 's' })).toBe(false);
    expect(isQualifyingAttempt({ correct: 1, total: 2, at: 0, sessionId: 's' })).toBe(false);
    expect(isQualifyingAttempt({ correct: 0, total: 0, at: 0, sessionId: 's' })).toBe(false);
  });

  it('a test-out clears without the two sessions', () => {
    const testedOut = progress('g_a', [], 123);
    expect(lessonState(testedOut)).toBe('tested_out');
    expect(isLessonCleared(testedOut)).toBe(true);
  });
});

describe('isTestOutPass', () => {
  it('requires a complete, perfect run', () => {
    expect(isTestOutPass(3, 3)).toBe(true);
    expect(isTestOutPass(2, 3)).toBe(false);
    expect(isTestOutPass(0, 0)).toBe(false);
  });
});

describe('buildGrammarPath', () => {
  const rows = [row('g_a'), row('g_b'), row('g_c')];

  it('opens lesson 1 and locks the rest until the lesson before them is cleared', () => {
    const path = buildGrammarPath(rows, {}, 'A1');
    expect(path.nodes.map((node) => node.unlocked)).toEqual([true, false, false]);
    expect(path.nextId).toBe('g_a');

    const afterFirst = buildGrammarPath(rows, { g_a: progress('g_a', [{ correct: 3, total: 3, sessionId: 's1' }, { correct: 3, total: 3, sessionId: 's2' }]) }, 'A1');
    // Passing g_a unlocks exactly g_b, not g_c.
    expect(afterFirst.nodes.map((node) => node.unlocked)).toEqual([true, true, false]);
    expect(afterFirst.nextId).toBe('g_b');
    expect(afterFirst.completedCount).toBe(1);
  });

  it('clears a lesson by test-out so the next one opens', () => {
    const path = buildGrammarPath(rows, { g_a: progress('g_a', [], 5) }, 'A1');
    expect(path.nodes[0].state).toBe('tested_out');
    expect(path.nodes[1].unlocked).toBe(true);
    expect(path.nextId).toBe('g_b');
  });

  it('marks lessons below a placement as optional review, never a wall', () => {
    const path = buildGrammarPath([row('g_a0', 'A0'), row('g_a1', 'A1'), row('g_a2', 'A2')], {}, 'A2');
    expect(path.startIndex).toBe(2);
    expect(path.nodes[0]).toMatchObject({ unlocked: true, optional: true });
    expect(path.nodes[1]).toMatchObject({ unlocked: true, optional: true });
    expect(path.nodes[2]).toMatchObject({ unlocked: true, optional: false, isNext: true });
    // Nobody is blocked, even with zero progress.
    expect(path.nodes.every((node) => node.unlocked)).toBe(true);
  });

  it('has exactly one next lesson, or none when the path is finished', () => {
    const allCleared = {
      g_a: progress('g_a', [], 1),
      g_b: progress('g_b', [], 2),
      g_c: progress('g_c', [], 3),
    };
    const path = buildGrammarPath(rows, allCleared, 'A1');
    expect(path.nextId).toBeNull();
    expect(path.completedCount).toBe(3);
    expect(path.nodes.filter((node) => node.isNext)).toEqual([]);
  });

  it('never opens a lesson whose own prerequisite is untouched', () => {
    // The rule is direct-prerequisite by design: g_b needs g_a. (g_b cannot in
    // practice be cleared without g_a, because clearing it requires unlocking it,
    // which requires g_a — so this branch is only reachable from a hand-written
    // progress map, and it still must not open g_b.)
    const path = buildGrammarPath(rows, { g_b: progress('g_b', [], 1) }, 'A1');
    expect(path.nodes[1].unlocked).toBe(false);
  });
});

describe('mixedReviewLessonIds', () => {
  const lessons: GrammarLesson[] = orderGrammarLessons([row('g_a'), row('g_b'), row('g_c')]);

  it('draws from the nearest earlier lessons, and nothing before the first lesson', () => {
    expect(mixedReviewLessonIds(lessons, 0)).toEqual([]);
    expect(mixedReviewLessonIds(lessons, 1)).toEqual(['g_a']);
    expect(mixedReviewLessonIds(lessons, 2)).toEqual(['g_a', 'g_b']);
    expect(mixedReviewLessonIds(lessons, 2, 1)).toEqual(['g_b']);
  });
});
