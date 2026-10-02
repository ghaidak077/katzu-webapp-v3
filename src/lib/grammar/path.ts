import { LEVEL_LADDER } from '@/lib/levels/levelSpec';
import type { CEFRLevel, GrammarEntity, GrammarLessonAttempt, GrammarLessonProgressEntity } from '@/types/models';

/**
 * The القواعد PATH (V28 Stage 2B): grammar as a locked course, not a row list.
 *
 * WHY A PATH AND NOT A LIST
 * A flat list of 70+ rules answers "what grammar exists", which is a question
 * only a syllabus author asks. A learner's question is "what do I do next", and a
 * list answers it with every row at once. So the rows are ordered into ONE path:
 * level A0 → B2, with each lesson depending on the one before it. Lesson N+1
 * unlocks only after lesson N is passed, which is what turns browsing into a
 * course.
 *
 * WHY THE RULE LIVES HERE, PURE
 * The decision "may I open this lesson / is this lesson passed" decides what a
 * learner is allowed to study, so it must be reproducible and unit-testable
 * rather than a screen's side effect. Everything here is pure: no Dexie, no
 * React, no clock. The database half lives in ./pathStore.ts, exactly as the
 * review engine (`srs/engine.ts`) is split from its store.
 *
 * WHY A PASS NEEDS TWO SESSIONS
 * One strong answer is a lucky answer. A pass is a threshold reached in at least
 * two SEPARATE sessions, so it records something that survives the day rather
 * than something a single tap produced. A deliberate test-out (a full, perfect
 * run of the lesson's own check) is the one honest shortcut, and it is still a
 * multi-item check, never one answer.
 */

/** Authored order hints, within a level. Ids absent from the live rows are ignored. */
export const GRAMMAR_ORDER_HINTS: string[] = [
  'g_a0_hallo_ich_heisse',
  'g_a0_ich_bin_aus',
  'g_a0_praesens_konjugation',
  'g_a0_ich_moechte',
  'g_a0_hilfe_nicht_verstanden',
  'g_a1_der_die_das_uebersicht',
  'g_articles_a1',
  'g_a1_frage_wo_woher',
  'g_polite_requests_a1',
  'g_modal_moechte',
  'g_a1_adjektivendung_bestimmt',
  'g_verb_position_a1',
  'g_a1_negation_nicht_kein',
  'g_a1_zahlen_bis_zehn',
  'g_a1_buchstabieren_alphabet',
  'g_anmeldung_trennbar_a1',
  'g_anmeldung_akkusativ_a1',
  'g_anmeldung_verbposition_a1',
  'g_exam_wfragen_a1',
];

/** Correct ratio inside ONE session that counts as a qualifying attempt. */
export const LESSON_PASS_RATIO = 2 / 3;
/** Distinct sessions at or above the threshold before a lesson is passed. */
export const LESSON_PASS_SESSIONS = 2;
/** A test-out is a full, perfect run of the lesson's own check. */
export const TEST_OUT_RATIO = 1;
/** Attempts kept per lesson — bounded, so a practised lesson cannot grow forever. */
export const MAX_LESSON_ATTEMPTS = 20;

export interface GrammarLesson {
  id: string;
  /** 1-based position in the path ("lesson 3 of 12"). */
  order: number;
  titleAr: string;
  ruleAr: string;
  level: CEFRLevel;
  /** Ids that must be satisfied before this lesson unlocks (the previous lesson). */
  prerequisites: string[];
}

export type GrammarProgressMap = Record<string, GrammarLessonProgressEntity | undefined>;

export type LessonState = 'not_started' | 'in_progress' | 'passed' | 'tested_out';

export interface GrammarPathNode {
  lesson: GrammarLesson;
  index: number;
  state: LessonState;
  unlocked: boolean;
  /** Placed above this lesson: it stays open as optional review, never a wall. */
  optional: boolean;
  /** The single lesson the learner should do next. */
  isNext: boolean;
}

export interface GrammarPath {
  nodes: GrammarPathNode[];
  /** 0-based index of the first lesson the learner is expected to work on. */
  startIndex: number;
  completedCount: number;
  totalCount: number;
  /** The frontier lesson id, or null when every lesson from the start is cleared. */
  nextId: string | null;
}

/**
 * Orders the live grammar rows into the path.
 *
 * Deterministic by construction: level first (A0 → B2), then the authored order
 * hints, then the id. Two devices holding the same rows compute the same order,
 * and adding a row cannot shuffle the ones before it. Each lesson's prerequisite
 * is the lesson before it, so the path is a chain and "lesson N+1 unlocks after
 * lesson N is passed" is a property of the data, not of a screen.
 */
export function orderGrammarLessons(rows: Array<Pick<GrammarEntity, 'id' | 'title_ar' | 'rule_ar' | 'level'>>): GrammarLesson[] {
  const hintIndex = new Map(GRAMMAR_ORDER_HINTS.map((id, index) => [id, index]));
  const sorted = [...rows].sort((a, b) => {
    const levelDelta = LEVEL_LADDER.indexOf(a.level) - LEVEL_LADDER.indexOf(b.level);
    if (levelDelta !== 0) return levelDelta;
    const hintA = hintIndex.has(a.id) ? (hintIndex.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
    const hintB = hintIndex.has(b.id) ? (hintIndex.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
    if (hintA !== hintB) return hintA - hintB;
    return a.id.localeCompare(b.id);
  });
  return sorted.map((row, index) => ({
    id: row.id,
    order: index + 1,
    titleAr: row.title_ar,
    ruleAr: row.rule_ar,
    level: row.level,
    prerequisites: index > 0 ? [sorted[index - 1].id] : [],
  }));
}

/**
 * Where a learner placed at `startLevel` begins.
 *
 * A placement must never wall someone: every lesson below their first lesson at
 * their level is optional review, and the first lesson at their level is already
 * open. Locking then binds from their level upward, which is where it helps.
 * Returns the lesson count when they are placed above all content, so nothing is
 * locked.
 */
export function placementStartIndex(
  lessons: GrammarLesson[],
  startLevel: CEFRLevel | null | undefined,
): number {
  if (!startLevel || lessons.length === 0) return 0;
  const target = LEVEL_LADDER.indexOf(startLevel);
  if (target <= 0) return 0;
  const index = lessons.findIndex((lesson) => LEVEL_LADDER.indexOf(lesson.level) >= target);
  return index === -1 ? lessons.length : index;
}

/** One attempt counts toward the pass when it clears the ratio. */
export function isQualifyingAttempt(attempt: GrammarLessonAttempt): boolean {
  return attempt.total > 0 && attempt.correct / attempt.total >= LESSON_PASS_RATIO;
}

/** A test-out needs a complete, perfect run of the lesson's own check. */
export function isTestOutPass(correct: number, total: number): boolean {
  return total > 0 && correct / total >= TEST_OUT_RATIO;
}

/**
 * The pass rule. A lesson is passed only when the threshold was reached in at
 * least `LESSON_PASS_SESSIONS` distinct sessions — two qualifying attempts inside
 * one session count once, because that is one sitting, not two.
 */
export function lessonState(progress: GrammarLessonProgressEntity | undefined | null): LessonState {
  if (!progress) return 'not_started';
  if (progress.testedOutAt) return 'tested_out';
  const sessions = new Set(
    progress.attempts
      .filter(isQualifyingAttempt)
      .map((attempt) => attempt.sessionId || `at:${attempt.at}`),
  );
  if (sessions.size >= LESSON_PASS_SESSIONS) return 'passed';
  if (progress.attempts.length > 0) return 'in_progress';
  return 'not_started';
}

/** Passed or tested out — either clears the lesson for the one after it. */
export function isLessonCleared(progress: GrammarLessonProgressEntity | undefined | null): boolean {
  const state = lessonState(progress);
  return state === 'passed' || state === 'tested_out';
}

/**
 * The whole path as the screen needs it: per-lesson state, what is open, what is
 * optional review, and the ONE lesson to do next.
 */
export function buildGrammarPath(
  rows: Array<Pick<GrammarEntity, 'id' | 'title_ar' | 'rule_ar' | 'level'>>,
  progress: GrammarProgressMap = {},
  startLevel: CEFRLevel | null | undefined = null,
): GrammarPath {
  const lessons = orderGrammarLessons(rows);
  const startIndex = placementStartIndex(lessons, startLevel);
  const indexById = new Map(lessons.map((lesson, index) => [lesson.id, index]));

  const satisfied = (id: string): boolean => {
    const index = indexById.get(id);
    if (index === undefined) return false;
    return isLessonCleared(progress[id]) || index < startIndex;
  };

  const nodes: GrammarPathNode[] = lessons.map((lesson, index) => ({
    lesson,
    index,
    state: lessonState(progress[lesson.id]),
    unlocked: index <= startIndex || lesson.prerequisites.every(satisfied),
    optional: index < startIndex,
    isNext: false,
  }));

  const nextId =
    nodes.find(
      (node) =>
        node.unlocked && node.index >= startIndex && !isLessonCleared(progress[node.lesson.id]),
    )?.lesson.id ?? null;
  for (const node of nodes) node.isNext = node.lesson.id === nextId;

  return {
    nodes,
    startIndex,
    completedCount: nodes.filter((node) => node.state === 'passed' || node.state === 'tested_out').length,
    totalCount: nodes.length,
    nextId,
  };
}

/**
 * A small mixed review drawn from the lessons just before this one.
 *
 * Retrieval beats re-reading, and mixing an earlier rule into a new lesson is
 * what stops the path becoming a sequence of forgettings. Deterministic (the
 * nearest earlier lessons), so the same lesson always reviews the same material.
 */
export function mixedReviewLessonIds(lessons: GrammarLesson[], currentIndex: number, count = 2): string[] {
  if (currentIndex <= 0 || count <= 0) return [];
  return lessons.slice(0, currentIndex).slice(-count).map((lesson) => lesson.id);
}
