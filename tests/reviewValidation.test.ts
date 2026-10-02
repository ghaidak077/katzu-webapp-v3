import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/katzuDb';
import {
  enrolMistake,
  enrolStudiedPhrases,
  enrolStudiedVocabulary,
  stampReviewItem,
  suppressInvalidReviewItems,
} from '@/lib/srs/store';
import { DEFAULT_EASE, newReviewItemFromMistake, newReviewItemFromPhrase, newReviewItemFromVocabulary } from '@/lib/srs/engine';
import {
  BANNED_PROMPT_PLACEHOLDERS,
  clozeContext,
  dedupeReviewItems,
  directionFromRefId,
  gradeArabicAnswer,
  isMeaningfulCorrection,
  isServableReviewItem,
  normalizeArabicAnswer,
  validateReviewItem,
} from '@/lib/review/validate';
import type { MistakeEntity, ReviewItemEntity, StarterPhraseEntity, VocabularyEntity } from '@/types/models';

/**
 * The review card contract (V28 Stage 1B).
 *
 * The owner's report from real use: review "contains many mistakes the learner
 * never made, and many questions are illogical, with no clear question or no
 * clear answer." Each describe block below pins one half of the fix — the pure
 * rules, and the store behaviour that refuses or suppresses an item that breaks
 * them.
 */

const NOW = 1_700_000_000_000;

function baseItem(overrides: Partial<ReviewItemEntity> = {}): ReviewItemEntity {
  return {
    userId: 'current_user',
    kind: 'vocab',
    refId: 'vocab:1',
    promptAr: 'قهوة',
    answerDe: 'der Kaffee',
    dueAt: NOW,
    intervalDays: 0,
    ease: DEFAULT_EASE,
    reps: 0,
    lapses: 0,
    reviews: 0,
    createdAt: NOW,
    ...overrides,
  };
}

describe('normalizeArabicAnswer', () => {
  it('folds hamza forms, ta marbuta, harakat, tatweel and punctuation', () => {
    expect(normalizeArabicAnswer('أَحْمَد')).toBe('احمد');
    expect(normalizeArabicAnswer('مَكْتَبَة')).toBe('مكتبه');
    expect(normalizeArabicAnswer('قهوة!')).toBe('قهوه');
    expect(normalizeArabicAnswer('إلى')).toBe('الي');
  });
});

describe('gradeArabicAnswer', () => {
  it('accepts the exact meaning and a harakat-free spelling', () => {
    expect(gradeArabicAnswer('قهوة', 'قهوة')).toBe('correct');
    expect(gradeArabicAnswer('قهوة ساخنة', 'قهوه ساخنه')).toBe('correct');
  });

  it('is close when every expected word is present', () => {
    expect(gradeArabicAnswer('القهوة ساخنة', 'القهوه ساخنه جدا')).toBe('close');
  });

  it('never passes an empty or unrelated answer', () => {
    expect(gradeArabicAnswer('قهوة', '')).toBe('wrong');
    expect(gradeArabicAnswer('قهوة', 'ماء')).toBe('wrong');
  });
});

describe('isMeaningfulCorrection', () => {
  it('ignores capitalisation, punctuation and umlaut transliteration', () => {
    expect(isMeaningfulCorrection('ich moechte einen kaffee', 'Ich möchte einen Kaffee.')).toBe(false);
    expect(isMeaningfulCorrection('Ich bin gegangen', 'ich bin gegangen!')).toBe(false);
  });

  it('counts a real word change as a correction', () => {
    expect(isMeaningfulCorrection('fertig', 'fertiggestellt')).toBe(true);
    expect(isMeaningfulCorrection('Ich habe ein Kaffee', 'Ich möchte einen Kaffee')).toBe(true);
  });

  it('never calls an empty correction meaningful', () => {
    expect(isMeaningfulCorrection('Ich habe ein Kaffee', '')).toBe(false);
  });
});

describe('validateReviewItem', () => {
  it('accepts a well-formed vocabulary card', () => {
    expect(validateReviewItem(baseItem()).ok).toBe(true);
  });

  it('rejects a prompt that is not a question in Arabic', () => {
    expect(validateReviewItem(baseItem({ promptAr: '' })).reasons).toContain('prompt_missing');
    expect(validateReviewItem(baseItem({ promptAr: 'Perfekt mit haben' })).reasons).toContain('prompt_not_arabic');
    expect(validateReviewItem(baseItem({ promptAr: BANNED_PROMPT_PLACEHOLDERS[0] })).reasons).toContain('prompt_placeholder');
  });

  it('rejects a card with no answer', () => {
    expect(validateReviewItem(baseItem({ answerDe: '' })).reasons).toContain('answer_missing');
  });

  it('requires a correction to carry the learner original and a meaningful change', () => {
    const correction = { kind: 'mistake' as const, promptAr: 'اكتب الجملة الصحيحة بالألمانية', answerDe: 'Ich möchte einen Kaffee' };
    expect(validateReviewItem(correction).reasons).toContain('mistake_original_missing');
    expect(validateReviewItem({ ...correction, contextDe: 'Ich möchte ein Kaffee' }).ok).toBe(true);
    // A stylistic-only "correction" is not a mistake the learner made.
    const stylistic = validateReviewItem({ ...correction, contextDe: 'Ich möchte einen Kaffee', answerDe: 'ich möchte einen kaffee.' });
    expect(stylistic.reasons).toContain('correction_not_meaningful');
  });
});

describe('servability and dedupe', () => {
  it('hides a suppressed item without deleting it', () => {
    const item = baseItem({ suppressed: true });
    expect(isServableReviewItem(item)).toBe(false);
  });

  it('drops a later duplicate of the same question', () => {
    const items = [baseItem({ id: 1 }), baseItem({ id: 2 }), baseItem({ id: 3, refId: 'vocab:9', answerDe: 'der Tee', promptAr: 'شاي' })];
    const kept = dedupeReviewItems(items);
    expect(kept.map((item) => item.id)).toEqual([1, 3]);
  });
});

describe('direction and cloze', () => {
  it('assigns a stable direction from the refId and uses both directions', () => {
    expect(directionFromRefId('vocab:42')).toBe(directionFromRefId('vocab:42'));
    const directions = new Set(Array.from({ length: 40 }, (_, index) => directionFromRefId(`vocab:${index}`)));
    expect(directions.has('ar_to_de')).toBe(true);
    expect(directions.has('de_to_ar')).toBe(true);
  });

  it('blanks the target word in its example, and returns null when absent', () => {
    expect(clozeContext('Der Kaffee ist heiß.', 'der Kaffee')).toBe('Der ______ ist heiß.');
    expect(clozeContext('Der Tee ist heiß.', 'der Kaffee')).toBeNull();
    expect(clozeContext(undefined, 'der Kaffee')).toBeNull();
  });
});

describe('every generated item passes the contract (property)', () => {
  it('holds for vocabulary, phrases and corrections across fixtures', () => {
    const words: VocabularyEntity[] = [
      { id: 1, german: 'Kaffee', article: 'der', plural: null, part_of_speech: 'Noun', translation_ar: 'قهوة', translation_en: '', example_de: 'Der Kaffee ist heiß.', example_ar: '', topic: 'cafe_order', level: 'A1' },
      { id: 2, german: 'gern', article: null, plural: null, part_of_speech: 'Adverb', translation_ar: 'بكل سرور', translation_en: '', example_de: '', example_ar: '', topic: 'cafe_order', level: 'A1' },
    ];
    const phrases: StarterPhraseEntity[] = [
      { id: 1, scenario_id: 'cafe_order', level: 'A1', german: 'Ich möchte einen Kaffee, bitte.', translation_ar: 'أريد قهوة من فضلك.', sort_order: 1 } as StarterPhraseEntity,
    ];
    const mistakes: MistakeEntity[] = [
      { userId: 'current_user', scenarioId: 'cafe_order', original: 'Ich möchte ein Kaffee', corrected: 'Ich möchte einen Kaffee', grammarRule: 'أدوات النكرة في حالة النصب', timestamp: NOW, wasHintUsed: false },
      { userId: 'current_user', scenarioId: 'cafe_order', original: 'Ich habe gegangen', corrected: 'Ich bin gegangen', grammarRule: 'Perfekt mit sein', timestamp: NOW, wasHintUsed: false },
    ];

    const items: ReviewItemEntity[] = [
      ...words.map((word) => newReviewItemFromVocabulary(word, NOW)),
      ...phrases.map((phrase) => newReviewItemFromPhrase(phrase, NOW)),
      ...mistakes.map((mistake) => newReviewItemFromMistake(mistake, 1, NOW)),
    ];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const reasons = validateReviewItem(item).reasons;
      expect(reasons, `${item.kind} ${item.refId}: ${reasons.join(',')}`).toEqual([]);
    }
  });
});

describe('store enforcement', () => {
  beforeEach(async () => {
    await db.open();
    await db.review_items.clear();
    await db.mistakes.clear();
    await db.vocabulary.clear();
  });

  it('refuses to enrol a correction that changes nothing', async () => {
    const stylistic: MistakeEntity & { id?: number } = {
      userId: 'current_user',
      scenarioId: 'cafe_order',
      original: 'Ich möchte einen Kaffee.',
      corrected: 'ich möchte einen kaffee',
      grammarRule: 'ترقيم',
      timestamp: NOW,
      wasHintUsed: false,
      syncId: 'sub:cafe_order:9:stylistic',
    };
    await enrolMistake(stylistic, NOW);
    expect(await db.review_items.count()).toBe(0);
  });

  it('stamps a direction and a suppression default on every item', async () => {
    await enrolStudiedVocabulary(
      [{ id: 1, german: 'Kaffee', article: 'der', plural: null, part_of_speech: 'Noun', translation_ar: 'قهوة', translation_en: '', example_de: '', example_ar: '', topic: 'cafe_order', level: 'A1' }],
      NOW,
    );
    const item = (await db.review_items.toArray())[0];
    expect(item.direction).toBeDefined();
    expect(item.suppressed).toBe(false);
  });

  it('suppresses a stored item that no longer meets the contract, keeping the row', async () => {
    await db.review_items.add(baseItem({ promptAr: 'Perfekt mit haben', answerDe: '' }));
    const changed = await suppressInvalidReviewItems();
    expect(changed).toBe(1);
    const stored = await db.review_items.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].suppressed).toBe(true);
  });

  it('does not suppress a valid item', async () => {
    await db.review_items.add(baseItem());
    expect(await suppressInvalidReviewItems()).toBe(0);
    expect((await db.review_items.toArray())[0].suppressed).not.toBe(true);
  });

  it('leaves a servable enrolled phrase reachable in the queue', async () => {
    await enrolStudiedPhrases([{ id: 1, scenario_id: 'cafe_order', level: 'A1', german: 'Guten Morgen!', translation_ar: 'صباح الخير!', sort_order: 1 } as StarterPhraseEntity], NOW);
    const stored = (await db.review_items.toArray())[0];
    expect(isServableReviewItem(stored)).toBe(true);
  });
});

describe('stampReviewItem', () => {
  it('forces a correction into the German-production direction', () => {
    const stamped = stampReviewItem(baseItem({ kind: 'mistake', contextDe: 'Ich möchte ein Kaffee', answerDe: 'Ich möchte einen Kaffee' }));
    expect(stamped.direction).toBe('ar_to_de');
  });
});
