import { describe, expect, it } from 'vitest';
import { DEFAULT_EASE } from '@/lib/srs/engine';
import type { ReviewItemEntity } from '@/types/models';
import {
  arabicMeaningFor,
  buildReviewTask,
  cleanArabicExplanation,
  diffGermanTokens,
  gradeTaskAnswer,
  gradeVocabAnswer,
  isFullGermanSentence,
} from '@/lib/review/validate';

/**
 * The task layer (V41).
 *
 * The screen no longer guesses what a row is asking from `kind`/`direction`.
 * `buildReviewTask` is the single decision, and these tests pin every branch:
 * one clear task, or no card at all. A regression here is a learner staring at
 * a rule label with no question, which is the bug this release fixes.
 */

const NOW = 1_700_000_000_000;

function item(overrides: Partial<ReviewItemEntity> = {}): ReviewItemEntity {
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

describe('buildReviewTask — vocabulary', () => {
  it('asks for one German word from an Arabic word, with a gloss and plural', () => {
    const task = buildReviewTask(
      item({ explanationAr: 'مشروب ساخن', pluralDe: 'Kaffeesorten' }),
    );
    expect(task).toEqual({
      kind: 'vocab',
      chipAr: 'مفردة',
      headerAr: 'اكتب الكلمة الألمانية',
      meaningAr: 'قهوة',
      answerDe: 'der Kaffee',
      glossAr: 'مشروب ساخن',
      pluralDe: 'Kaffeesorten',
      typed: true,
    });
  });

  it('prefers an explicit meaning over a legacy prompt', () => {
    const task = buildReviewTask(item({ promptAr: 'Perfekt mit haben', meaningAr: 'أريد قهوة' }));
    expect(task?.meaningAr).toBe('أريد قهوة');
  });

  it('returns no task when the row has no usable Arabic or German', () => {
    expect(buildReviewTask(item({ promptAr: '' }))).toBeNull();
    expect(buildReviewTask(item({ promptAr: 'Perfekt mit haben' }))).toBeNull();
    expect(buildReviewTask(item({ answerDe: '' }))).toBeNull();
  });
});

describe('buildReviewTask — sentences', () => {
  it('asks for a German sentence from a full Arabic sentence', () => {
    const task = buildReviewTask(
      item({ kind: 'phrase', refId: 'phrase:1', promptAr: 'أريد قهوة من فضلك.', answerDe: 'Ich möchte einen Kaffee, bitte.' }),
    );
    expect(task?.kind).toBe('sentence_ar_to_de');
    expect(task?.chipAr).toBe('جملة');
    expect(task?.headerAr).toBe('اكتب الجملة بالألمانية');
    expect(task?.typed).toBe(true);
  });

  it('is read-and-reveal when the direction is German to Arabic', () => {
    const task = buildReviewTask(
      item({ kind: 'phrase', refId: 'phrase:2', direction: 'de_to_ar', promptAr: 'أريد قهوة من فضلك.', answerDe: 'Ich möchte einen Kaffee, bitte.' }),
    );
    expect(task?.kind).toBe('sentence_de_to_ar');
    expect(task?.typed).toBe(false);
    expect(task?.sourceDe).toBe('Ich möchte einen Kaffee, bitte.');
    expect(task?.meaningAr).toBe('أريد قهوة من فضلك.');
  });
});

describe('buildReviewTask — corrections', () => {
  const base = item({
    kind: 'mistake',
    refId: 'mistake:1',
    promptAr: 'اكتب الجملة الصحيحة بالألمانية',
    meaningAr: 'أريد قهوة',
    contextDe: 'Ich möchte ein Kaffee',
    answerDe: 'Ich möchte einen Kaffee',
  });

  it('shows the meaning, the learner sentence and the correction as one task', () => {
    const task = buildReviewTask({
      ...base,
      grammarReference: {
        id: 'g_articles_a1',
        titleAr: 'أدوات التعريف',
        ruleAr: 'بعد möchte نستخدم einen.',
        ruleDe: 'Nach möchte steht einen.',
        exampleDe: 'Ich möchte einen Kaffee.',
      },
    });
    expect(task?.kind).toBe('correction');
    expect(task?.chipAr).toBe('تصحيح');
    expect(task?.headerAr).toBe('صحّح جملتك السابقة');
    expect(task?.meaningAr).toBe('أريد قهوة');
    expect(task?.wrongDe).toBe('Ich möchte ein Kaffee');
    expect(task?.answerDe).toBe('Ich möchte einen Kaffee');
    expect(task?.reasonAr).toBe('بعد möchte نستخدم einen.');
    expect(task?.typed).toBe(true);
  });

  it('converts to a sentence task when only a fragment of the old sentence survived', () => {
    const task = buildReviewTask({ ...base, contextDe: 'ist jetzt fertiggestellt' });
    expect(task?.kind).toBe('sentence_ar_to_de');
    expect(task?.meaningAr).toBe('أريد قهوة');
    expect(task?.answerDe).toBe('Ich möchte einen Kaffee');
  });

  it('drops a fragment target instead of asking it as a sentence', () => {
    expect(
      buildReviewTask({ ...base, contextDe: '', answerDe: 'ist jetzt fertiggestellt' }),
    ).toBeNull();
  });

  it('drops a full previous sentence that changes nothing', () => {
    expect(
      buildReviewTask({
        ...base,
        contextDe: 'Ich möchte einen Kaffee.',
        answerDe: 'ich möchte einen kaffee',
      }),
    ).toBeNull();
  });

  it('drops the old rule-label card with no meaning', () => {
    expect(buildReviewTask({ ...base, meaningAr: undefined, promptAr: 'Akkusativ — اكتب الجملة الصحيحة بالألمانية' })).toBeNull();
  });
});

describe('arabicMeaningFor', () => {
  it('accepts a meaning and rejects instructions, rule labels and German text', () => {
    expect(arabicMeaningFor(item({ kind: 'mistake', promptAr: 'أريد قهوة' }))).toBe('أريد قهوة');
    expect(arabicMeaningFor(item({ kind: 'mistake', promptAr: 'اكتب الجملة الصحيحة بالألمانية' }))).toBeNull();
    expect(arabicMeaningFor(item({ kind: 'mistake', promptAr: 'Perfekt mit haben — اكتب الجملة الصحيحة بالألمانية' }))).toBeNull();
    expect(arabicMeaningFor(item({ kind: 'mistake', promptAr: 'أريد Kaffee' }))).toBeNull();
    expect(arabicMeaningFor(item({ kind: 'vocab', promptAr: 'قهوة' }))).toBe('قهوة');
  });
});

describe('isFullGermanSentence', () => {
  it('requires a capital letter and at least three words', () => {
    expect(isFullGermanSentence('Ich möchte einen Kaffee')).toBe(true);
    expect(isFullGermanSentence('Guten Tag!')).toBe(false);
    expect(isFullGermanSentence('ist jetzt fertiggestellt')).toBe(false);
    expect(isFullGermanSentence('')).toBe(false);
  });
});

describe('cleanArabicExplanation', () => {
  it('keeps Arabic and drops mojibake or non-Arabic noise', () => {
    expect(cleanArabicExplanation('بعد möchte نستخدم einen.')).toBe('بعد möchte نستخدم einen.');
    expect(cleanArabicExplanation('Ø£Ù†Ø§ Ù‡Ù†Ø§')).toBeUndefined();
    expect(cleanArabicExplanation('Perfekt mit sein')).toBeUndefined();
    expect(cleanArabicExplanation('   ')).toBeUndefined();
    expect(cleanArabicExplanation(undefined)).toBeUndefined();
  });
});

describe('gradeVocabAnswer', () => {
  it('accepts the noun with or without its article', () => {
    expect(gradeVocabAnswer('der Kaffee', 'der Kaffee')).toBe('correct');
    expect(gradeVocabAnswer('der Kaffee', 'Kaffee')).toBe('correct');
    expect(gradeVocabAnswer('die Rechnung', 'rechnung')).toBe('correct');
  });

  it('marks a wrong article as close, never correct', () => {
    expect(gradeVocabAnswer('der Kaffee', 'die Kaffee')).toBe('close');
    expect(gradeVocabAnswer('der Termin', 'den Termin')).toBe('close');
  });

  it('never passes a different word or an empty answer', () => {
    expect(gradeVocabAnswer('der Kaffee', 'der Tee')).toBe('wrong');
    expect(gradeVocabAnswer('der Kaffee', '')).toBe('wrong');
  });

  it('accepts the transliterated umlaut and ß', () => {
    expect(gradeVocabAnswer('der Käse', 'der Kaese')).toBe('correct');
    expect(gradeVocabAnswer('die Straße', 'die Strasse')).toBe('correct');
  });
});

describe('gradeTaskAnswer', () => {
  it('uses the vocabulary rule for a word and the sentence rule otherwise', () => {
    const vocab = buildReviewTask(item());
    expect(vocab && gradeTaskAnswer(vocab, 'Kaffee')).toBe('correct');

    const sentence = buildReviewTask(
      item({ kind: 'phrase', refId: 'phrase:1', promptAr: 'أريد قهوة.', answerDe: 'Ich möchte einen Kaffee.' }),
    );
    expect(sentence && gradeTaskAnswer(sentence, 'ich moechte einen kaffee')).toBe('correct');
    // A full-sentence article slip is a miss with a highlighted diff; "close"
    // is reserved for a vocabulary word where gender is the single detail wrong.
    expect(sentence && gradeTaskAnswer(sentence, 'Ich möchte ein Kaffee')).toBe('wrong');
  });
});

describe('diffGermanTokens', () => {
  it('marks only the words the learner missed, in the expected order', () => {
    const diff = diffGermanTokens('Ich möchte einen Kaffee', 'Ich möchte ein Kaffee');
    expect(diff.map((token) => token.text)).toEqual(['Ich', 'möchte', 'einen', 'Kaffee']);
    expect(diff.map((token) => token.changed)).toEqual([false, false, true, false]);
  });

  it('ignores case, punctuation and umlaut spelling when matching', () => {
    const diff = diffGermanTokens('Ich möchte einen Kaffee.', 'ich moechte einen kaffee');
    expect(diff.every((token) => !token.changed)).toBe(true);
  });

  it('marks every word when the learner gave nothing', () => {
    expect(diffGermanTokens('Ich möchte einen Kaffee', '').every((token) => token.changed)).toBe(true);
  });
});
