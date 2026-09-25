import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EASE,
  MASTERED_REPS,
  MAX_EASE,
  MIN_EASE,
  SESSION_LIMIT,
  buildReviewQueue,
  countDue,
  gradeAnswer,
  isDue,
  newReviewItemFromMistake,
  newReviewItemFromVocabulary,
  normalizeGermanAnswer,
  reviewRefId,
  scheduleNext,
} from '@/lib/srs/engine';
import type { MistakeEntity, ReviewItemEntity, VocabularyEntity } from '@/types/models';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function item(overrides: Partial<ReviewItemEntity> = {}): ReviewItemEntity {
  return {
    userId: 'u',
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

describe('normalizeGermanAnswer', () => {
  it('folds case, punctuation and whitespace', () => {
    expect(normalizeGermanAnswer('  Der  Kaffee,  bitte! ')).toBe('der kaffee bitte');
  });

  it('accepts umlauts and their standard transliteration as equal', () => {
    expect(normalizeGermanAnswer('für')).toBe(normalizeGermanAnswer('fuer'));
    expect(normalizeGermanAnswer('Straße')).toBe(normalizeGermanAnswer('STRASSE'));
  });
});

describe('gradeAnswer', () => {
  it('accepts the exact answer and the transliterated spelling', () => {
    expect(gradeAnswer('der Kaffee', 'Der Kaffee')).toBe('correct');
    expect(gradeAnswer('für', 'fuer')).toBe('correct');
  });

  it('reports a missing or wrong article as close, not wrong', () => {
    expect(gradeAnswer('der Kaffee', 'Kaffee')).toBe('close');
    expect(gradeAnswer('die Rechnung', 'der Rechnung')).toBe('close');
  });

  it('reports a different word as wrong, and an empty answer never passes', () => {
    expect(gradeAnswer('der Kaffee', 'der Tee')).toBe('wrong');
    expect(gradeAnswer('der Kaffee', '   ')).toBe('wrong');
  });
});

describe('scheduleNext', () => {
  it('advances a good item along the 1/3/7/16/35/90 ladder', () => {
    let state = { intervalDays: 0, ease: DEFAULT_EASE, reps: 0, lapses: 0 };
    const intervals: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const next = scheduleNext(state, 'good', NOW);
      intervals.push(next.intervalDays);
      state = next;
    }
    expect(intervals).toEqual([1, 3, 7, 16, 35, 90, 90]);
  });

  it('brings a failed item back inside the same session and resets its progress', () => {
    const settled = { intervalDays: 35, ease: DEFAULT_EASE, reps: 5, lapses: 0 };
    const next = scheduleNext(settled, 'again', NOW);
    expect(next.intervalDays).toBe(0);
    expect(next.reps).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.dueAt).toBe(NOW + 10 * 60 * 1000);
    expect(next.ease).toBeLessThan(DEFAULT_EASE);
  });

  it('grows a hard item more slowly than a good one and lowers its ease', () => {
    const settled = { intervalDays: 10, ease: DEFAULT_EASE, reps: 3, lapses: 0 };
    const hard = scheduleNext(settled, 'hard', NOW);
    const good = scheduleNext(settled, 'good', NOW);
    expect(hard.intervalDays).toBeLessThan(good.intervalDays);
    expect(hard.ease).toBeLessThan(DEFAULT_EASE);
    expect(hard.reps).toBe(4);
  });

  it('never lets ease fall below the floor or rise above the ceiling', () => {
    let broken = { intervalDays: 0, ease: DEFAULT_EASE, reps: 0, lapses: 0 };
    for (let i = 0; i < 30; i += 1) broken = scheduleNext(broken, 'again', NOW);
    expect(broken.ease).toBe(MIN_EASE);

    // Ease is a penalty multiplier only: success must never inflate it.
    let strong = { intervalDays: 1, ease: DEFAULT_EASE, reps: 0, lapses: 0 };
    for (let i = 0; i < 30; i += 1) strong = scheduleNext(strong, 'good', NOW);
    expect(strong.ease).toBe(DEFAULT_EASE);
    expect(strong.ease).toBeLessThanOrEqual(MAX_EASE);
  });

  it('brings a repeatedly-failed item back sooner than a clean one at the same rep', () => {
    const clean = scheduleNext({ intervalDays: 7, ease: DEFAULT_EASE, reps: 3, lapses: 0 }, 'good', NOW);
    const shaky = scheduleNext({ intervalDays: 7, ease: MIN_EASE, reps: 3, lapses: 2 }, 'good', NOW);
    expect(shaky.intervalDays).toBeLessThan(clean.intervalDays);
  });

  it('caps the interval so nothing disappears for years', () => {
    let state = { intervalDays: 90, ease: MAX_EASE, reps: 20, lapses: 0 };
    for (let i = 0; i < 10; i += 1) state = scheduleNext(state, 'good', NOW);
    expect(state.intervalDays).toBeLessThanOrEqual(180);
  });
});

describe('due counting and the session queue', () => {
  it('counts only items whose time has come', () => {
    const items = [
      item({ dueAt: NOW - 1 }),
      item({ dueAt: NOW }),
      item({ dueAt: NOW + DAY }),
    ];
    expect(countDue(items, NOW)).toBe(2);
    expect(isDue(items[1], NOW)).toBe(true);
    expect(isDue(items[2], NOW)).toBe(false);
  });

  it('puts the most overdue item first', () => {
    const queue = buildReviewQueue(
      [
        item({ id: 1, kind: 'vocab', dueAt: NOW - DAY }),
        item({ id: 2, kind: 'vocab', dueAt: NOW - 5 * DAY }),
      ],
      NOW,
    );
    expect(queue.map((q) => q.id)).toEqual([2, 1]);
  });

  it('never exceeds the session limit, so a session always ends', () => {
    const many = Array.from({ length: 50 }, (_, i) => item({ id: i + 1, dueAt: NOW - i }));
    expect(buildReviewQueue(many, NOW)).toHaveLength(SESSION_LIMIT);
    expect(buildReviewQueue(many, NOW, 5)).toHaveLength(5);
  });

  it('interleaves kinds instead of blocking one drill type together', () => {
    const due = [
      ...Array.from({ length: 5 }, (_, i) => item({ id: i + 1, kind: 'vocab', dueAt: NOW - i })),
      ...Array.from({ length: 5 }, (_, i) => item({ id: 100 + i, kind: 'mistake', dueAt: NOW - i })),
    ];
    const queue = buildReviewQueue(due, NOW, 10);
    expect(queue.slice(0, 4).map((q) => q.kind)).toEqual(['mistake', 'vocab', 'mistake', 'vocab']);
    expect(queue).toHaveLength(10);
  });

  it('is deterministic, so a queue is reproducible for the same data', () => {
    const due = [
      item({ id: 3, kind: 'phrase', dueAt: NOW - DAY }),
      item({ id: 1, kind: 'vocab', dueAt: NOW - DAY }),
      item({ id: 2, kind: 'mistake', dueAt: NOW - DAY }),
    ];
    expect(buildReviewQueue(due, NOW, 3).map((q) => q.id)).toEqual(
      buildReviewQueue(due, NOW, 3).map((q) => q.id),
    );
  });
});

describe('enrolment builders', () => {
  it('turns a vocabulary row into a due item that asks for production', () => {
    const word = {
      id: 42,
      german: 'Kaffee',
      article: 'der',
      plural: 'Kaffees',
      part_of_speech: 'Noun',
      translation_ar: 'قهوة',
      translation_en: 'Coffee',
      example_de: 'Der Kaffee ist heiß.',
      example_ar: 'القهوة ساخنة.',
      topic: 'cafe_order',
      level: 'A1',
    } as VocabularyEntity;

    const review = newReviewItemFromVocabulary(word, NOW);
    expect(review.kind).toBe('vocab');
    expect(review.refId).toBe(reviewRefId('vocab', 42));
    expect(review.promptAr).toBe('قهوة');
    expect(review.answerDe).toBe('der Kaffee');
    expect(review.contextDe).toBe('Der Kaffee ist heiß.');
    expect(review.scenarioId).toBe('cafe_order');
    expect(review.dueAt).toBe(NOW);
    expect(review.ease).toBe(DEFAULT_EASE);
    expect(review.reps).toBe(0);
  });

  it('keeps the article out of the answer when the row has none', () => {
    const word = { id: 7, german: 'gern', article: null, translation_ar: 'بكل سرور' } as VocabularyEntity;
    expect(newReviewItemFromVocabulary(word, NOW).answerDe).toBe('gern');
  });

  it('retests a mistake from its rule, recording where it came from', () => {
    const mistake = {
      userId: 'current_user',
      scenarioId: 'job_interview',
      original: 'Ich habe gegangen',
      corrected: 'Ich bin gegangen',
      grammarRule: 'الفعل sein مع gegangen',
      timestamp: NOW,
      wasHintUsed: false,
      syncId: 'sub:job_interview:123:Ich habe gegangen',
    } as MistakeEntity;

    const review = newReviewItemFromMistake(mistake, 9, NOW);
    expect(review.kind).toBe('mistake');
    expect(review.refId).toBe(reviewRefId('mistake', mistake.syncId));
    expect(review.promptAr).toBe('الفعل sein مع gegangen');
    expect(review.answerDe).toBe('Ich bin gegangen');
    expect(review.contextDe).toBe('Ich habe gegangen');
    expect(review.sourceId).toBe(9);
    expect(review.scenarioId).toBe('job_interview');
  });

  it('gives the same mistake a stable refId, so re-enrolment cannot duplicate it', () => {
    const mistake = {
      userId: 'current_user',
      scenarioId: 'cafe_order',
      original: 'Ich möchte ein Kaffee',
      corrected: 'Ich möchte einen Kaffee',
      grammarRule: 'Akkusativ',
      timestamp: NOW,
      wasHintUsed: false,
      syncId: 'sub:cafe_order:1:Ich möchte ein Kaffee',
    } as MistakeEntity;
    const first = newReviewItemFromMistake(mistake, 1, NOW);
    const second = newReviewItemFromMistake(mistake, 1, NOW + 5 * DAY);
    expect(first.refId).toBe(second.refId);
  });
});

describe('mastery threshold', () => {
  it('needs three consecutive successes, not one lucky retrieval', () => {
    expect(MASTERED_REPS).toBe(3);
    let state = { intervalDays: 0, ease: DEFAULT_EASE, reps: 0, lapses: 0 };
    state = scheduleNext(state, 'good', NOW);
    expect(state.reps).toBe(1);
    state = scheduleNext(state, 'good', NOW);
    state = scheduleNext(state, 'good', NOW);
    expect(state.reps).toBe(3);
  });
});
