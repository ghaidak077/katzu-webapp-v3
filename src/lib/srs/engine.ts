import type {
  CEFRLevel,
  MistakeEntity,
  ReviewGrade,
  ReviewItemEntity,
  ReviewKind,
  StarterPhraseEntity,
  VocabularyEntity,
} from '@/types/models';

/**
 * The memory engine: when to bring a piece of knowledge back.
 *
 * WHY THIS FILE IS PURE
 * Scheduling is the part of the app a learner trusts to be right, and it is
 * invisible when it is wrong — a bad interval just quietly wastes their time.
 * So it lives here as pure functions with no database and no clock access:
 * every decision is a value in, a value out, and fully unit-tested.
 *
 * The model is a deliberately small SM-2. A full FSRS would behave almost
 * identically at this volume while being impossible to reason about or explain
 * to a learner, and complexity here is paid back in confusion, not learning.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** A failed item comes back inside the same session, not tomorrow. */
const AGAIN_DELAY_MS = 10 * 60 * 1000;

/** Interval ladder for a 'good' grade, in days, before ease scaling. */
const GOOD_LADDER_DAYS = [1, 3, 7, 16, 35, 90];

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;
/** Reps (consecutive 'good' grades) needed before a mistake counts as mastered. */
export const MASTERED_REPS = 3;
/** A single review session never exceeds this, so it always ends. */
export const SESSION_LIMIT = 20;

const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 180;

/** Leading article on a German noun phrase (`der Kaffee`). */
const ARTICLE_PREFIX = /^(der|die|das|den|dem)\s+/;

export type AnswerVerdict = 'correct' | 'close' | 'wrong';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampEase(value: number): number {
  return clamp(Number.isFinite(value) ? value : DEFAULT_EASE, MIN_EASE, MAX_EASE);
}

function clampInterval(value: number): number {
  return clamp(Math.round(Number.isFinite(value) ? value : MIN_INTERVAL_DAYS), MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS);
}

/** Stable, human-readable identity for a scheduled item. Enrolment is keyed on it. */
export function reviewRefId(kind: ReviewKind, sourceId: string | number): string {
  return `${kind}:${sourceId}`;
}

/**
 * Folds the two ways a learner can legitimately spell a German word: umlauts or
 * their standard transliteration (ä = ae, ß = ss), plus case, punctuation and
 * whitespace. Accepting `fuer` for `für` is not leniency — it is the correct
 * transliteration, and rejecting it on a phone keyboard would punish typing
 * speed instead of knowledge.
 */
export function normalizeGermanAnswer(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 'correct' = same answer; 'close' = the noun is right but the article is
 * missing or wrong, which is useful feedback of its own (gender is the thing
 * Arabic speakers most often skip); 'wrong' = something else is off.
 */
export function gradeAnswer(expected: string, actual: string): AnswerVerdict {
  const target = normalizeGermanAnswer(expected);
  const given = normalizeGermanAnswer(actual);
  if (!given) return 'wrong';
  if (target === given) return 'correct';
  // Gender is the error Arabic speakers make most, so a missing OR wrong
  // article is its own verdict — 'die Rechnung' answered as 'der Rechnung'
  // deserves "the noun is right, the article is not", not "wrong answer".
  if (target.replace(ARTICLE_PREFIX, '') === given.replace(ARTICLE_PREFIX, '')) return 'close';
  return 'wrong';
}

export interface ScheduleState {
  dueAt: number;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

/**
 * The scheduling rule, in one place:
 *  - 'again' → back in 10 minutes, consecutive progress reset, ease drops.
 *  - 'hard'  → advance, but grow only 20% and drop ease (it was not solid).
 *  - 'good'  → advance along the 1/3/7/16/35/90 ladder, scaled by ease.
 *
 * Ease only ever moves down. Raising it on success made the ladder drift
 * (16 becomes 17, 35 becomes 38) so the schedule stopped matching its own
 * documentation — a learner who stumbles gets shorter intervals at the same
 * rep count, which is the whole point, and a clean item keeps the exact ladder.
 */
export function scheduleNext(
  state: Pick<ReviewItemEntity, 'intervalDays' | 'ease' | 'reps' | 'lapses'>,
  grade: ReviewGrade,
  now: number,
): ScheduleState {
  const previousInterval = Math.max(0, Number(state.intervalDays) || 0);
  const ease = clampEase(Number(state.ease) || DEFAULT_EASE);
  const reps = Math.max(0, Number(state.reps) || 0);
  const lapses = Math.max(0, Number(state.lapses) || 0);

  if (grade === 'again') {
    return {
      intervalDays: 0,
      ease: clampEase(ease - 0.2),
      reps: 0,
      lapses: lapses + 1,
      dueAt: now + AGAIN_DELAY_MS,
    };
  }

  if (grade === 'hard') {
    const intervalDays = clampInterval(Math.max(MIN_INTERVAL_DAYS, previousInterval * 1.2));
    return {
      intervalDays,
      ease: clampEase(ease - 0.15),
      reps: reps + 1,
      lapses,
      dueAt: now + intervalDays * DAY_MS,
    };
  }

  const ladderIndex = Math.min(reps, GOOD_LADDER_DAYS.length - 1);
  const intervalDays = clampInterval(GOOD_LADDER_DAYS[ladderIndex] * (ease / DEFAULT_EASE));
  return {
    intervalDays,
    ease,
    reps: reps + 1,
    lapses,
    dueAt: now + intervalDays * DAY_MS,
  };
}

export function isDue(item: Pick<ReviewItemEntity, 'dueAt'>, now: number): boolean {
  return (Number(item.dueAt) || 0) <= now;
}

export function countDue(items: Array<Pick<ReviewItemEntity, 'dueAt'>>, now: number): number {
  return items.reduce((total, item) => (isDue(item, now) ? total + 1 : total), 0);
}

/**
 * The session queue: only due items, most overdue first, then **interleaved by
 * kind** so a session never becomes a block of one drill. Mixed practice is the
 * evidence-backed default; blocked practice feels easier and retains worse.
 */
export function buildReviewQueue<T extends Pick<ReviewItemEntity, 'dueAt' | 'kind' | 'id'>>(
  items: T[],
  now: number,
  limit: number = SESSION_LIMIT,
): T[] {
  const due = items
    .filter((item) => isDue(item, now))
    .sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0) || (a.id ?? 0) - (b.id ?? 0));

  if (limit <= 0) return [];
  if (due.length <= 1) return due.slice(0, limit);

  const buckets = new Map<ReviewKind, T[]>();
  for (const item of due) {
    const bucket = buckets.get(item.kind);
    if (bucket) bucket.push(item);
    else buckets.set(item.kind, [item]);
  }

  // Sorted keys keep the interleave order stable across sessions and tests.
  const kinds = [...buckets.keys()].sort();
  const queue: T[] = [];
  let placedInRound = true;
  while (queue.length < limit && placedInRound) {
    placedInRound = false;
    for (const kind of kinds) {
      if (queue.length >= limit) break;
      const next = buckets.get(kind)!.shift();
      if (!next) continue;
      queue.push(next);
      placedInRound = true;
    }
  }
  return queue;
}

/** A brand-new item is due immediately: the first retrieval should be soon. */
function newReviewItem(
  base: Pick<ReviewItemEntity, 'kind' | 'refId' | 'promptAr' | 'answerDe'> &
    Partial<Pick<ReviewItemEntity, 'sourceId' | 'contextDe' | 'explanationAr' | 'scenarioId' | 'level'>>,
  now: number,
  userId: string,
): ReviewItemEntity {
  return {
    userId,
    kind: base.kind,
    refId: base.refId,
    sourceId: base.sourceId,
    promptAr: base.promptAr,
    answerDe: base.answerDe,
    contextDe: base.contextDe,
    explanationAr: base.explanationAr,
    scenarioId: base.scenarioId,
    level: base.level,
    dueAt: now,
    intervalDays: 0,
    ease: DEFAULT_EASE,
    reps: 0,
    lapses: 0,
    reviews: 0,
    createdAt: now,
  };
}

export function newReviewItemFromVocabulary(
  vocabulary: VocabularyEntity,
  now: number,
  userId = 'current_user',
): ReviewItemEntity {
  const article = vocabulary.article ? `${vocabulary.article} ` : '';
  return newReviewItem(
    {
      kind: 'vocab',
      refId: reviewRefId('vocab', vocabulary.id),
      promptAr: vocabulary.translation_ar,
      // The article is part of the answer on purpose: gender is the detail
      // Arabic speakers most often lose, and 'close' feedback teaches it.
      answerDe: `${article}${vocabulary.german}`,
      contextDe: vocabulary.example_de || undefined,
      explanationAr: vocabulary.example_ar || undefined,
      scenarioId: vocabulary.topic || undefined,
      level: vocabulary.level,
    },
    now,
    userId,
  );
}

export function newReviewItemFromPhrase(
  phrase: StarterPhraseEntity,
  now: number,
  userId = 'current_user',
): ReviewItemEntity {
  return newReviewItem(
    {
      kind: 'phrase',
      refId: reviewRefId('phrase', phrase.id),
      promptAr: phrase.translation_ar,
      answerDe: phrase.german,
      scenarioId: phrase.scenario_id || undefined,
      level: phrase.level as CEFRLevel,
    },
    now,
    userId,
  );
}

/**
 * A mistake is retested as production from the rule that was broken, not as a
 * multiple-choice question: recognising the fix is not the same skill as
 * producing it, and only the second one transfers to a real conversation.
 */
export function newReviewItemFromMistake(
  mistake: MistakeEntity,
  sourceId: number | undefined,
  now: number,
  userId = 'current_user',
): ReviewItemEntity {
  const refId = mistake.syncId
    ? reviewRefId('mistake', mistake.syncId)
    : reviewRefId('mistake', `${mistake.scenarioId}:${mistake.timestamp}:${mistake.original}`);
  return newReviewItem(
    {
      kind: 'mistake',
      refId,
      sourceId,
      promptAr: mistake.grammarRule || 'صيغة صحيحة',
      answerDe: mistake.corrected,
      contextDe: mistake.original,
      explanationAr: mistake.roastComment,
      scenarioId: mistake.scenarioId,
    },
    now,
    userId,
  );
}
