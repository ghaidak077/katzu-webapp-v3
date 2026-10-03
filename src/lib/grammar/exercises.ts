import type { CEFRLevel, GrammarEntity } from '@/types/models';
import { normalizeGermanAnswer } from '@/lib/srs/engine';
import { hashString, seededRng } from '../utils/seededRng';

// Re-exported so existing importers keep one source of truth; the implementation
// lives in an alias-free module the Node-run audit scripts can also load.
export { hashString, seededRng };

/**
 * The القواعد section's production exercises (V21 Phase 4).
 *
 * Deterministic by construction: the exercises are GENERATED from the grammar
 * row itself (no per-exercise content to author, nothing to drift), the seeded
 * RNG makes them reproducible, and one wrong answer feeds the EXISTING mistake
 * bank + review queue — so a miss here is remembered by the tutor and comes
 * back in spaced review instead of vanishing.
 *
 * What an exercise never does: claim mastery from one answer. It reports the
 * verdict of THIS attempt; mastery stays the review engine's business.
 */

export type GrammarExerciseKind = 'fill' | 'reorder' | 'translate';

export interface GrammarExercise {
  kind: GrammarExerciseKind;
  /** Arabic prompt shown above the input. */
  promptAr: string;
  /** The full correct German sentence (the reveal / the standard for grading). */
  answerDe: string;
  /** 'fill': sentence with a gap. 'reorder': shuffled tokens. 'translate': Arabic. */
  displayDe?: string;
  displayAr?: string;
  /** 'reorder' only: the bank to click from, with 1–2 distractors from the row. */
  tokens?: string[];
  /** 'fill' only: the token(s) the gap wants, for the targeted reveal. */
  gapAnswer?: string;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The sentence the exercises are built from: the row's example, else its rule. */
function sourceSentence(row: Pick<GrammarEntity, 'example_de' | 'rule_de'>): string {
  const sentence = (row.example_de || '').trim() || (row.rule_de || '').trim();
  return sentence.replace(/\s+/g, ' ');
}

const FILL_PROMPTS = [
  'أكمل الفراغ بالكلمة الصحيحة:',
  'ضع الكلمة المناسبة في الفراغ:',
];
const TRANSLATE_PROMPTS = [
  'ترجم إلى الألمانية:',
  'كتبها بالألمانية:',
];

/**
 * Builds 3 exercises for one grammar row: fill-the-gap, word-order, and
 * translate-from-Arabic. Every answer is the row's own German sentence.
 */
export function buildGrammarExercises(
  row: Pick<GrammarEntity, 'id' | 'example_de' | 'rule_de' | 'example_ar' | 'rule_ar'>,
  rng: () => number = seededRng(hashString(row.id)),
): GrammarExercise[] {
  const sentence = sourceSentence(row);
  if (!sentence) return [];
  const arabic = (row.example_ar || row.rule_ar || '').trim();

  // ---- fill: the content word at the row's "watch-out" position is masked ----
  const words = sentence.split(' ');
  const fillIndex = Math.min(words.length - 1, Math.max(1, Math.floor(words.length / 2)));
  const gapAnswer = words[fillIndex];
  const fill: GrammarExercise = {
    kind: 'fill',
    promptAr: FILL_PROMPTS[Math.floor(rng() * FILL_PROMPTS.length)],
    answerDe: sentence,
    displayDe: `${words.slice(0, fillIndex).join(' ')} ____ ${words.slice(fillIndex + 1).join(' ')}`,
    gapAnswer,
  };

  // ---- reorder: the sentence's own words plus a distractor from the row ----
  const distractorPool = sentence
    .split(' ')
    .map((word) => word.replace(/[.,!?]/g, ''))
    .filter((word) => word.length > 1 && !sentence.includes(` ${word} `));
  const distractor = distractorPool[0] || 'nicht';
  const tokens = shuffle(
    [...sentence.split(' ').map((word) => word.replace(/[.,!?]/g, '')), distractor],
    rng,
  );
  const reorder: GrammarExercise = {
    kind: 'reorder',
    promptAr: 'رتّب الكلمات لتكوين جملة صحيحة:',
    answerDe: sentence,
    tokens,
  };

  // ---- translate: Arabic → German production, the hardest retrieval ----
  const translate: GrammarExercise = {
    kind: 'translate',
    promptAr: arabic ? TRANSLATE_PROMPTS[Math.floor(rng() * TRANSLATE_PROMPTS.length)] : TRANSLATE_PROMPTS[0],
    answerDe: sentence,
    displayAr: arabic || undefined,
  };

  return [fill, reorder, translate];
}

/** Case-insensitive, punctuation-tolerant verdict for one attempt. */
export function gradeGrammarAttempt(exercise: GrammarExercise, given: string): 'correct' | 'close' | 'wrong' {
  const target = normalizeGermanAnswer(exercise.answerDe);
  const attempt = normalizeGermanAnswer(given);
  if (!attempt) return 'wrong';
  if (target === attempt) return 'correct';
  // One correct word off (a wrong article, a wrong ending) is 'close' — the
  // same distinction the review engine draws, so feedback words agree.
  const targetWords = target.split(' ');
  const attemptWords = attempt.split(' ');
  if (targetWords.length === attemptWords.length) {
    const wrong = targetWords.filter((word, index) => word !== attemptWords[index]).length;
    if (wrong <= 1) return 'close';
  }
  if (target.includes(attempt) || attempt.includes(target)) return 'close';
  return 'wrong';
}

/** The mistake row a wrong attempt produces (feeds the existing memory). */
export function grammarAttemptMistake(
  row: Pick<GrammarEntity, 'id' | 'title_ar' | 'rule_ar'>,
  exercise: GrammarExercise,
  given: string,
): { original: string; corrected: string; grammarRule: string; grammarId: string } {
  return {
    original: given.trim() || exercise.displayDe || '—',
    corrected: exercise.answerDe,
    grammarRule: `${row.title_ar} — ${row.rule_ar}`,
    grammarId: row.id,
  };
}

/** Grouping key for the section's level tabs. */
export function grammarLevelSort(a: CEFRLevel, b: CEFRLevel): number {
  const order: CEFRLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2'];
  return order.indexOf(a) - order.indexOf(b);
}
