import type { StarterPhraseEntity, VocabularyEntity } from '@/types/models';

export interface QuizQuestion {
  germanPrompt: string;
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
    vocabulary.filter((v) => v.german && v.translation_ar),
    rng
  );
  for (const target of vocabPool) {
    if (questions.length >= maxQuestions) break;
    const distractors = shuffle(
      vocabulary.filter((v) => v.id !== target.id && v.translation_ar && v.translation_ar !== target.translation_ar),
      rng
    )
      .slice(0, MIN_OPTIONS - 1)
      .map((v) => v.translation_ar);
    if (distractors.length < MIN_OPTIONS - 1) continue; // not enough real options
    const options = shuffle([target.translation_ar, ...distractors], rng);
    questions.push({
      germanPrompt: target.example_de || `${target.article ? target.article + ' ' : ''}${target.german}`,
      options,
      correctIndex: options.indexOf(target.translation_ar),
      explanation: `${target.german} = ${target.translation_ar}${target.example_ar ? ` — ${target.example_ar}` : ''}`,
    });
  }

  // 2) Starter phrase → meaning (only if vocab questions are still short)
  const phrasePool = shuffle(
    phrases.filter((p) => p.german && p.translation_ar),
    rng
  );
  for (const p of phrasePool) {
    if (questions.length >= maxQuestions) break;
    const distractors = shuffle(
      phrases.filter((q) => q.id !== p.id && q.translation_ar && q.translation_ar !== p.translation_ar),
      rng
    )
      .slice(0, MIN_OPTIONS - 1)
      .map((q) => q.translation_ar);
    if (distractors.length < MIN_OPTIONS - 1) continue;
    const options = shuffle([p.translation_ar, ...distractors], rng);
    questions.push({
      germanPrompt: p.german,
      options,
      correctIndex: options.indexOf(p.translation_ar),
      explanation: `${p.german} = ${p.translation_ar}`,
    });
  }

  return questions.slice(0, maxQuestions);
}
