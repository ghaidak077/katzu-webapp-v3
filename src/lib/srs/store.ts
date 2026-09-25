import { db } from '@/lib/db/katzuDb';
import {
  MASTERED_REPS,
  newReviewItemFromMistake,
  newReviewItemFromPhrase,
  newReviewItemFromVocabulary,
  scheduleNext,
} from './engine';
import type {
  MistakeEntity,
  ReviewGrade,
  ReviewItemEntity,
  StarterPhraseEntity,
  VocabularyEntity,
} from '@/types/models';

/**
 * Database-facing half of the memory engine. The scheduling rules live in
 * ./engine.ts (pure and unit-tested); this file only reads and writes them, so
 * there is exactly one source of truth for "when does this come back".
 */

const USER_ID = 'current_user';

/**
 * Enrolment is idempotent by design: an item the learner is already partway
 * through keeping must never have its schedule reset just because they studied
 * the same scenario again. That would punish repetition, which is the one thing
 * we want them to do.
 */
async function enrolIfNew(candidate: ReviewItemEntity): Promise<boolean> {
  const existing = await db.review_items
    .where('[kind+refId]')
    .equals([candidate.kind, candidate.refId])
    .first();
  if (existing) return false;
  await db.review_items.add(candidate);
  return true;
}

/** Words the learner has just studied become due for retrieval. */
export async function enrolStudiedVocabulary(
  vocabulary: VocabularyEntity[],
  now: number = Date.now(),
): Promise<number> {
  let enrolled = 0;
  for (const word of vocabulary) {
    if (!word?.german || !word?.translation_ar) continue;
    const added = await enrolIfNew(newReviewItemFromVocabulary(word, now, USER_ID));
    if (added) enrolled += 1;
  }
  return enrolled;
}

export async function enrolStudiedPhrases(
  phrases: StarterPhraseEntity[],
  now: number = Date.now(),
): Promise<number> {
  let enrolled = 0;
  for (const phrase of phrases) {
    if (!phrase?.german || !phrase?.translation_ar) continue;
    const added = await enrolIfNew(newReviewItemFromPhrase(phrase, now, USER_ID));
    if (added) enrolled += 1;
  }
  return enrolled;
}

/**
 * Every correction the conversation engine produces is scheduled for a later
 * retrieval — this is the coach behaviour: the app remembers what *you* keep
 * getting wrong instead of only what the syllabus says comes next.
 */
export async function enrolMistake(
  mistake: MistakeEntity & { id?: number },
  now: number = Date.now(),
): Promise<void> {
  if (!mistake?.corrected) return;
  await enrolIfNew(newReviewItemFromMistake(mistake, mistake.id, now, USER_ID));
}

/**
 * Applies a self-assessed grade and persists the new schedule. Finishing a
 * mistake drill three times running is what "mastered" honestly means, so the
 * mistake bank and the review queue agree with each other rather than drifting.
 */
export async function gradeReviewItem(item: ReviewItemEntity, grade: ReviewGrade): Promise<void> {
  if (item.id == null) return;
  // Read the stored row rather than trusting the caller's snapshot: an item
  // graded 'again' is re-queued inside the same session, and scheduling its
  // second attempt from stale state would quietly corrupt its interval.
  const stored = await db.review_items.get(item.id);
  const base = stored ?? item;
  const now = Date.now();
  const next = scheduleNext(base, grade, now);

  await db.review_items.update(item.id, {
    ...next,
    reviews: (base.reviews || 0) + 1,
    lastReviewedAt: now,
  });

  if (item.kind === 'mistake' && item.sourceId != null && next.reps >= MASTERED_REPS) {
    await db.mistakes.update(item.sourceId, { isMastered: true, updatedAt: now });
  }
}

/** Saves a word the learner explicitly bookmarked — an explicit "I want this". */
export async function enrolSavedWord(wordId: number, now: number = Date.now()): Promise<void> {
  const word = await db.vocabulary.get(wordId);
  if (!word) return;
  await enrolIfNew(newReviewItemFromVocabulary(word, now, USER_ID));
}

/**
 * Pulls a set of mistakes forward so the review screen drills them next, used by
 * the error-profile screen's "practise this" action: the learner has just seen
 * their own pattern and wants it now, not on its original schedule.
 *
 * A mistake that was never enrolled is enrolled rather than skipped — every
 * conversation correction is enrolled, but rows recorded before the queue
 * existed are not, and a button that silently does nothing is a dead end.
 */
export async function focusMistakesForReview(
  mistakes: Array<MistakeEntity & { id?: number }>,
  now: number = Date.now(),
): Promise<number> {
  let due = 0;
  for (const mistake of mistakes) {
    if (!mistake?.corrected) continue;
    const candidate = newReviewItemFromMistake(mistake, mistake.id, now, USER_ID);
    const existing = await db.review_items
      .where('[kind+refId]')
      .equals([candidate.kind, candidate.refId])
      .first();
    if (existing?.id != null) {
      await db.review_items.update(existing.id, { dueAt: now });
    } else {
      await db.review_items.add(candidate);
    }
    due += 1;
  }
  return due;
}

export async function loadReviewItems(): Promise<ReviewItemEntity[]> {
  return db.review_items.where('userId').equals(USER_ID).toArray();
}
