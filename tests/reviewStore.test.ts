import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, wipeUserScopedData } from '@/lib/db/katzuDb';
import {
  enrolMistake,
  enrolSavedWord,
  enrolStudiedVocabulary,
  focusMistakesForReview,
  gradeReviewItem,
} from '@/lib/srs/store';
import { DEFAULT_EASE, MIN_EASE } from '@/lib/srs/engine';
import type { MistakeEntity, VocabularyEntity } from '@/types/models';

/**
 * The scheduling rules are unit-tested in srsEngine.test.ts. This file covers the
 * other half — the database layer — because a schema or query mistake there would
 * break the queue silently for every learner, and no amount of pure-function
 * testing would catch it. It runs against a real Dexie instance over an in-memory
 * IndexedDB, including the actual v4 migration.
 */

function word(id: number, german: string, translationAr: string, article: 'der' | 'die' | 'das' | null = null) {
  return {
    id,
    german,
    article,
    plural: null,
    part_of_speech: 'Noun',
    translation_ar: translationAr,
    translation_en: german,
    example_de: '',
    example_ar: '',
    topic: 'cafe_order',
    level: 'A1',
  } as VocabularyEntity;
}

function mistake(syncId: string): MistakeEntity & { id?: number } {
  return {
    userId: 'current_user',
    scenarioId: 'cafe_order',
    original: 'Ich möchte ein Kaffee',
    corrected: 'Ich möchte einen Kaffee',
    grammarRule: 'Akkusativ',
    timestamp: 1_700_000_000_000,
    wasHintUsed: false,
    syncId,
  };
}

beforeEach(async () => {
  await db.open();
  await db.review_items.clear();
  await db.mistakes.clear();
  await db.vocabulary.clear();
  await db.saved_words.clear();
});

describe('schema migration', () => {
  it('opens with the review queue table available', async () => {
    expect(db.tables.map((table) => table.name)).toContain('review_items');
  });

  it('supports the compound index the enrolment guard depends on', async () => {
    await db.review_items.add({
      userId: 'current_user',
      kind: 'vocab',
      refId: 'vocab:1',
      promptAr: 'قهوة',
      answerDe: 'der Kaffee',
      dueAt: 0,
      intervalDays: 0,
      ease: DEFAULT_EASE,
      reps: 0,
      lapses: 0,
      reviews: 0,
      createdAt: 0,
    });
    const found = await db.review_items.where('[kind+refId]').equals(['vocab', 'vocab:1']).first();
    expect(found?.answerDe).toBe('der Kaffee');
  });
});

describe('enrolment', () => {
  it('enrols studied vocabulary and never duplicates it on a second study pass', async () => {
    const words = [word(1, 'Kaffee', 'قهوة', 'der'), word(2, 'Tee', 'شاي', 'der')];

    expect(await enrolStudiedVocabulary(words, 1_000)).toBe(2);
    // Replaying the same scenario must not reset the learner's progress.
    expect(await enrolStudiedVocabulary(words, 2_000)).toBe(0);
    expect(await db.review_items.count()).toBe(2);

    const stored = await db.review_items.where('refId').equals('vocab:1').first();
    expect(stored?.promptAr).toBe('قهوة');
    expect(stored?.answerDe).toBe('der Kaffee');
    expect(stored?.createdAt).toBe(1_000);
  });

  it('enrols a conversation mistake once, keyed on its sync id', async () => {
    const correction = mistake('sub:cafe_order:1:Ich möchte ein Kaffee');
    await enrolMistake(correction, 1_000);
    await enrolMistake(correction, 2_000);
    expect(await db.review_items.count()).toBe(1);

    const stored = await db.review_items.toArray();
    expect(stored[0].kind).toBe('mistake');
    expect(stored[0].answerDe).toBe('Ich möchte einen Kaffee');
    expect(stored[0].contextDe).toBe('Ich möchte ein Kaffee');
  });

  it('schedules a bookmarked word from the practice screen', async () => {
    await db.vocabulary.put(word(5, 'Rechnung', 'فاتورة', 'die'));
    await enrolSavedWord(5, 1_000);
    const stored = await db.review_items.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].answerDe).toBe('die Rechnung');
  });

  it('ignores a bookmark for a word that is not in the local content cache', async () => {
    await enrolSavedWord(999, 1_000);
    expect(await db.review_items.count()).toBe(0);
  });
});

describe('grading', () => {
  it('writes the next schedule to the stored row', async () => {
    await enrolStudiedVocabulary([word(1, 'Kaffee', 'قهوة', 'der')], 1_000);
    const item = await db.review_items.toArray();

    await gradeReviewItem(item[0], 'good');
    const graded = await db.review_items.get(item[0].id!);

    expect(graded?.reps).toBe(1);
    expect(graded?.intervalDays).toBe(1);
    expect(graded?.reviews).toBe(1);
    expect(graded?.dueAt).toBeGreaterThan(Date.now());
    expect(graded?.lastReviewedAt).toBeGreaterThan(0);
  });

  it('schedules a re-queued item from stored state, not from a stale snapshot', async () => {
    await enrolStudiedVocabulary([word(1, 'Kaffee', 'قهوة', 'der')], 1_000);
    const snapshot = (await db.review_items.toArray())[0];

    // The screen holds one frozen snapshot for the whole session, so the second
    // grade arrives with the item object the first grade already moved on from.
    await gradeReviewItem(snapshot, 'again');
    await gradeReviewItem(snapshot, 'again');

    const stored = await db.review_items.get(snapshot.id!);
    expect(stored?.lapses).toBe(2);
    expect(stored?.ease).toBeCloseTo(DEFAULT_EASE - 0.4, 5);
    expect(stored?.ease).toBeGreaterThanOrEqual(MIN_EASE);
    expect(stored?.reviews).toBe(2);
  });

  it('marks a mistake mastered only after three consecutive successes', async () => {
    // Mirrors the real conversation flow: the mistake row is written first and its
    // key is handed to the enrolment, which is what links the two together.
    const mistakeId = await db.mistakes.put(mistake('sub:cafe_order:2:Ich möchte ein Kaffee'));
    await enrolMistake({ ...mistake('sub:cafe_order:2:Ich möchte ein Kaffee'), id: mistakeId }, 1_000);
    const savedMistake = await db.mistakes.toArray();
    const snapshot = (await db.review_items.toArray())[0];
    expect(snapshot.sourceId).toBe(mistakeId);

    await gradeReviewItem(snapshot, 'good');
    expect((await db.mistakes.get(savedMistake[0].id!))?.isMastered).toBeFalsy();

    await gradeReviewItem(snapshot, 'good');
    await gradeReviewItem(snapshot, 'good');
    expect((await db.mistakes.get(savedMistake[0].id!))?.isMastered).toBe(true);
  });

  it('resets progress when the learner forgets an item', async () => {
    await enrolStudiedVocabulary([word(1, 'Kaffee', 'قهوة', 'der')], 1_000);
    const snapshot = (await db.review_items.toArray())[0];

    await gradeReviewItem(snapshot, 'good');
    await gradeReviewItem(snapshot, 'good');
    await gradeReviewItem(snapshot, 'again');

    const stored = await db.review_items.get(snapshot.id!);
    expect(stored?.reps).toBe(0);
    expect(stored?.intervalDays).toBe(0);
  });
});

describe('focusing mistakes for a drill', () => {
  it('brings an already-scheduled mistake back to due now', async () => {
    const mistakeId = await db.mistakes.put(mistake('sub:cafe_order:3:Ich möchte ein Kaffee'));
    const row = { ...mistake('sub:cafe_order:3:Ich möchte ein Kaffee'), id: mistakeId };
    await enrolMistake(row, 1_000);

    // Grade it forward so it is no longer due — the drill must override that.
    const snapshot = (await db.review_items.toArray())[0];
    await gradeReviewItem(snapshot, 'good');
    const before = await db.review_items.get(snapshot.id!);
    expect(before!.dueAt).toBeGreaterThan(1_000);

    const before2 = Date.now();
    expect(await focusMistakesForReview([row])).toBe(1);

    const stored = await db.review_items.get(snapshot.id!);
    expect(stored!.dueAt).toBeGreaterThanOrEqual(before2);
    expect(stored!.intervalDays).toBe(before!.intervalDays);
    expect(await db.review_items.count()).toBe(1);
  });

  it('enrols a mistake the queue never saw instead of silently doing nothing', async () => {
    // Rows recorded before the queue existed are exactly this case.
    const mistakeId = await db.mistakes.put(mistake('sub:cafe_order:4:Ich möchte ein Kaffee'));
    const row = { ...mistake('sub:cafe_order:4:Ich möchte ein Kaffee'), id: mistakeId };

    expect(await focusMistakesForReview([row], 5_000)).toBe(1);

    const stored = (await db.review_items.toArray())[0];
    expect(stored.kind).toBe('mistake');
    expect(stored.sourceId).toBe(mistakeId);
    expect(stored.dueAt).toBe(5_000);
  });

  it('skips a correction with no corrected text rather than queueing an empty card', async () => {
    const empty = { ...mistake('sub:cafe_order:5:'), corrected: '', id: 1 };
    expect(await focusMistakesForReview([empty], 5_000)).toBe(0);
    expect(await db.review_items.count()).toBe(0);
  });
});

describe('sign-out', () => {
  it('wipes the review queue with the rest of the user-scoped data', async () => {
    await enrolStudiedVocabulary([word(1, 'Kaffee', 'قهوة', 'der')], 1_000);
    expect(await db.review_items.count()).toBe(1);

    await wipeUserScopedData();
    expect(await db.review_items.count()).toBe(0);
  });
});
