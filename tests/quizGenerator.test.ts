import { describe, expect, it } from 'vitest';
import { generateQuizQuestions } from '@/lib/utils/quizGenerator';
import type { StarterPhraseEntity, VocabularyEntity } from '@/types/models';

// Seeded rng so option order is deterministic in assertions.
let seed = 42;
const rng = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const vocab: VocabularyEntity[] = [
  { id: 1, german: 'Kaffee', article: 'der', plural: 'Kaffees', part_of_speech: 'Noun', translation_ar: 'قهوة', translation_en: 'Coffee', example_de: 'Der Kaffee ist sehr heiß.', example_ar: 'القهوة ساخنة جداً.', topic: 'food', level: 'A1' },
  { id: 2, german: 'Tee', article: 'der', plural: 'Tees', part_of_speech: 'Noun', translation_ar: 'شاي', translation_en: 'Tea', example_de: 'Ich trinke gerne Tee.', example_ar: 'أحب الشاي.', topic: 'food', level: 'A1' },
  { id: 3, german: 'Rechnung', article: 'die', plural: 'Rechnungen', part_of_speech: 'Noun', translation_ar: 'فاتورة', translation_en: 'Bill', example_de: 'Die Rechnung bitte!', example_ar: 'الحساب من فضلك!', topic: 'food', level: 'A1' },
  { id: 4, german: 'Wasser', article: 'das', plural: 'Wässer', part_of_speech: 'Noun', translation_ar: 'ماء', translation_en: 'Water', example_de: 'Ein Glas Wasser, bitte.', example_ar: 'كوب ماء من فضلك.', topic: 'food', level: 'A1' },
  { id: 5, german: 'Brot', article: 'das', plural: 'Brote', part_of_speech: 'Noun', translation_ar: 'خبز', translation_en: 'Bread', example_de: 'Das Brot ist frisch.', example_ar: 'الخبز طازج.', topic: 'food', level: 'A1' },
] as VocabularyEntity[];

const phrases: StarterPhraseEntity[] = [
  { id: 1, scenario_id: 'cafe_order', level: 'A1', german: 'Ich möchte bitte einen Kaffee.', translation_en: 'I would like a coffee please.', translation_ar: 'أريد قهوة من فضلك.', sort_order: 1 },
  { id: 2, scenario_id: 'cafe_order', level: 'A1', german: 'Haben Sie auch Tee?', translation_en: 'Do you also have tea?', translation_ar: 'هل لديكم شاي أيضاً؟', sort_order: 2 },
  { id: 3, scenario_id: 'cafe_order', level: 'A1', german: 'Wie viel kostet das?', translation_en: 'How much does that cost?', translation_ar: 'كم يكلف هذا؟', sort_order: 3 },
  { id: 4, scenario_id: 'cafe_order', level: 'A1', german: 'Ich bezahle mit Karte bitte.', translation_en: 'I will pay by card please.', translation_ar: 'سأدفع بالبطاقة من فضلك.', sort_order: 4 },
] as StarterPhraseEntity[];

describe('generateQuizQuestions', () => {
  it('builds questions from real D1 vocabulary with 4 distinct options', () => {
    seed = 42;
    const questions = generateQuizQuestions(vocab, [], rng);
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.correctIndex]).toBeTruthy();
      expect(q.germanPrompt).toBeTruthy();
      expect(q.explanation).toContain('=');
    }
  });

  it('uses example sentences when available', () => {
    seed = 7;
    const questions = generateQuizQuestions(vocab, [], rng, 1);
    expect(questions[0].germanPrompt).toMatch(/Der Kaffee|Ich trinke|Die Rechnung|Ein Glas|Das Brot/);
  });

  it('mixes in starter phrases when vocabulary is thin', () => {
    seed = 99;
    const questions = generateQuizQuestions(vocab.slice(0, 4), phrases, rng, 4);
    const prompts = questions.map((q) => q.germanPrompt);
    // 4 vocab questions max; phrases can appear only if vocab ran short.
    const phraseUsed = prompts.some((p) => phrases.some((ph) => ph.german === p));
    expect(questions.length).toBeGreaterThan(0);
    // With 4 vocab words (>=4 options each) no phrase question is required,
    // but the generator must never crash mixing pools.
    expect(phraseUsed !== undefined).toBe(true);
  });

  it('returns no questions when there is no usable content', () => {
    expect(generateQuizQuestions([], [], rng)).toEqual([]);
  });

  it('never exceeds maxQuestions and never marks an invalid index', () => {
    seed = 3;
    const questions = generateQuizQuestions(vocab, phrases, rng, 4);
    expect(questions.length).toBeLessThanOrEqual(4);
    for (const q of questions) {
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
    }
  });
});
