import type { StarterPhraseEntity, VocabularyEntity } from '@/types/models';

export interface QuizQuestion {
  /** Vocabulary questions ask about ONE word; phrase questions about a whole sentence. */
  kind: 'vocab' | 'phrase';
  /**
   * The thing being asked about, in German: the word itself (with its article)
   * for vocabulary, the full sentence for a starter phrase. This is the
   * question, so it always identifies exactly what the learner must translate
   * — an example sentence never stands in for it (that mismatch shipped as a
   * real bug: the prompt showed a sentence while the marked answer was one
   * hidden word's meaning).
   */
  germanPrompt: string;
  /** Supporting German example sentence (vocabulary only) — context, not the question. */
  exampleSentence?: string;
  /** Arabic translation of that example, revealed with the explanation. */
  exampleTranslationAr?: string;
  /** CEFR level of the source D1 row. */
  sourceLevel?: string;
  options: string[]; // Arabic options
  correctIndex: number;
  explanation: string;
}

/** Deterministic Fisher–Yates when a seeded rng is supplied (tests). */
function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const MIN_OPTIONS = 4;

// Guard against garbled/stale D1 rows: a translation without a single Arabic
// letter is never a valid option (character-scrambled legacy rows historically
// slipped through). Keeping them out protects the learner from nonsense.
const ARABIC_RE = /[\u0600-\u06FF]/;
export function isUsableTranslationAr(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length >= 2 && ARABIC_RE.test(value);
}

/**
 * Two Arabic options are ambiguous when one meaning contains the other
 * ("يقدّم" vs "يُبرز / يقدّم", "أعراض" vs "أعراض / شكاوى", "مدير" vs
 * "قائد/مدير تنفيذي"). Marking one of those wrong teaches the learner nothing,
 * so they can never appear in the same question.
 */
function normalizeOptionKey(value: string): string {
  return String(value || '')
    .replace(/[\u064B-\u0652\u0640]/g, '') // harakat + tatweel
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/[\u0649\u064A]/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/[^\u0621-\u064Aa-z0-9]/gi, '')
    .toLowerCase();
}

export function optionsCollide(a: string, b: string): boolean {
  const x = normalizeOptionKey(a);
  const y = normalizeOptionKey(b);
  if (!x || !y) return true;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Picks up to `count` distractors that neither mean the correct answer nor
 * duplicate each other — two options that both read "to submit" make a
 * question unanswerable even when the marked answer is right.
 */
function pickDistractors(
  candidates: string[],
  correct: string,
  count: number
): string[] {
  const chosen: string[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= count) break;
    if (optionsCollide(candidate, correct)) continue;
    if (chosen.some((c) => optionsCollide(c, candidate))) continue;
    chosen.push(candidate);
  }
  return chosen;
}

/**
 * Builds comprehension questions from the scenario's real D1 content:
 * vocabulary word → Arabic meaning, and starter phrase → Arabic meaning.
 * No German-learning content is ever hardcoded in the client (rule 3).
 */
export function generateQuizQuestions(
  vocabulary: VocabularyEntity[],
  phrases: StarterPhraseEntity[],
  rng: () => number = Math.random,
  maxQuestions = 4
): QuizQuestion[] {
  const questions: QuizQuestion[] = [];

  // 1) Vocabulary word → meaning
  const vocabPool = shuffle(
    vocabulary.filter((v) => v.german && isUsableTranslationAr(v.translation_ar)),
    rng
  );
  for (const target of vocabPool) {
    if (questions.length >= maxQuestions) break;
    const distractors = pickDistractors(
      shuffle(
        vocabulary.filter((v) => v.id !== target.id && isUsableTranslationAr(v.translation_ar)),
        rng
      ).map((v) => v.translation_ar),
      target.translation_ar,
      MIN_OPTIONS - 1
    );
    if (distractors.length < MIN_OPTIONS - 1) continue; // not enough real options
    const options = shuffle([target.translation_ar, ...distractors], rng);
    const word = `${target.article ? target.article + ' ' : ''}${target.german}`;
    questions.push({
      kind: 'vocab',
      germanPrompt: word,
      exampleSentence: target.example_de || undefined,
      exampleTranslationAr: target.example_ar || undefined,
      sourceLevel: target.level,
      options,
      correctIndex: options.indexOf(target.translation_ar),
      explanation: `${word} = ${target.translation_ar}${target.example_ar ? ` — ${target.example_ar}` : ''}`,
    });
  }

  // 2) Starter phrase → meaning (only if vocab questions are still short)
  const phrasePool = shuffle(
    phrases.filter((p) => p.german && isUsableTranslationAr(p.translation_ar)),
    rng
  );
  for (const p of phrasePool) {
    if (questions.length >= maxQuestions) break;
    const distractors = pickDistractors(
      shuffle(
        phrases.filter((q) => q.id !== p.id && isUsableTranslationAr(q.translation_ar)),
        rng
      ).map((q) => q.translation_ar),
      p.translation_ar,
      MIN_OPTIONS - 1
    );
    if (distractors.length < MIN_OPTIONS - 1) continue;
    const options = shuffle([p.translation_ar, ...distractors], rng);
    questions.push({
      kind: 'phrase',
      germanPrompt: p.german,
      sourceLevel: p.level,
      options,
      correctIndex: options.indexOf(p.translation_ar),
      explanation: `${p.german} = ${p.translation_ar}`,
    });
  }

  return questions.slice(0, maxQuestions);
}
