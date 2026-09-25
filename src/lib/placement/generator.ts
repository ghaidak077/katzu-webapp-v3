import { isUsableTranslationAr, optionsCollide } from '@/lib/utils/quizGenerator';
import type { CEFRLevel, StarterPhraseEntity, VocabularyEntity } from '@/types/models';
import { CEFR_LADDER, type PlacementKind } from './engine';

/**
 * Draws placement items from the same backend content the learner studies —
 * never from item text written into the app (rule: content lives in D1). The
 * only thing decided here is which existing row to ask about and which
 * distractor rows are fair to offer beside it.
 *
 * Distractor safety is imported from the quiz generator rather than reimplemented:
 * two Arabic options that mean the same thing make a question unanswerable, and
 * that rule must have exactly one definition in the codebase.
 */

export const MIN_OPTIONS = 4;
/** Every Nth question is played instead of shown, when the device can speak. */
const LISTENING_EVERY = 3;

export interface PlacementPool {
  vocabulary: VocabularyEntity[];
  phrases: StarterPhraseEntity[];
}

export interface PlacementItem {
  /** Unique per source row, so one question is never asked twice. */
  id: string;
  kind: PlacementKind;
  level: CEFRLevel;
  /** German prompt: displayed, or played aloud for a listening question. */
  german: string;
  /** Arabic options to choose from. */
  options: string[];
  correctIndex: number;
  correctAr: string;
  isListening: boolean;
  sourceId: number;
  explanationAr: string;
}

function usableVocabulary(pool: PlacementPool, level: CEFRLevel): VocabularyEntity[] {
  return pool.vocabulary.filter(
    (word) => word.level === level && !!word.german && isUsableTranslationAr(word.translation_ar),
  );
}

function usablePhrases(pool: PlacementPool, level: CEFRLevel): StarterPhraseEntity[] {
  return pool.phrases.filter(
    (phrase) => phrase.level === level && !!phrase.german && isUsableTranslationAr(phrase.translation_ar),
  );
}

export function levelHasItems(pool: PlacementPool, level: CEFRLevel): boolean {
  return usableVocabulary(pool, level).length + usablePhrases(pool, level).length > 0;
}

/**
 * A level with no content must never end the check: step outwards to the closest
 * level that does have items so the staircase can keep moving.
 */
export function nearestLevelWithItems(pool: PlacementPool, level: CEFRLevel): CEFRLevel | null {
  const start = Math.max(0, CEFR_LADDER.indexOf(level));
  for (let offset = 0; offset < CEFR_LADDER.length; offset += 1) {
    const below = start - offset;
    const above = start + offset;
    if (below >= 0 && offset > 0 && levelHasItems(pool, CEFR_LADDER[below])) return CEFR_LADDER[below];
    if (above < CEFR_LADDER.length && levelHasItems(pool, CEFR_LADDER[above])) return CEFR_LADDER[above];
  }
  return null;
}

/** Listening questions only when the device can actually speak. */
export function shouldUseListening(index: number, speechAvailable: boolean): boolean {
  if (!speechAvailable) return false;
  return index > 0 && index % LISTENING_EVERY === LISTENING_EVERY - 1;
}

function pickDistractors(candidates: string[], correct: string, count: number): string[] {
  const chosen: string[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= count) break;
    if (optionsCollide(candidate, correct)) continue;
    if (chosen.some((existing) => optionsCollide(existing, candidate))) continue;
    chosen.push(candidate);
  }
  return chosen;
}

/**
 * Builds one question at `level`. Distractors are drawn from the same level
 * first: an A1 learner choosing between four A1 meanings is being asked about
 * their German, while the same learner choosing between A1/B2 meanings is being
 * asked about their elimination skills.
 */
export function buildPlacementItem(
  pool: PlacementPool,
  level: CEFRLevel,
  usedIds: Set<string>,
  rng: () => number = Math.random,
  isListening = false,
): PlacementItem | null {
  const vocabulary = usableVocabulary(pool, level).filter((word) => !usedIds.has(`vocab:${word.id}`));
  const phrases = usablePhrases(pool, level).filter((phrase) => !usedIds.has(`phrase:${phrase.id}`));

  const sameLevelOptions = [
    ...usableVocabulary(pool, level).map((word) => word.translation_ar),
    ...usablePhrases(pool, level).map((phrase) => phrase.translation_ar),
  ];
  const otherLevelOptions = CEFR_LADDER.filter((other) => other !== level).flatMap((other) => [
    ...usableVocabulary(pool, other).map((word) => word.translation_ar),
    ...usablePhrases(pool, other).map((phrase) => phrase.translation_ar),
  ]);

  // Prefer vocabulary, then sentences: a word isolates the vocabulary check.
  const candidates: Array<{ kind: PlacementKind; sourceId: number; german: string; correctAr: string; exampleAr?: string }> = [
    ...vocabulary.map((word) => ({
      kind: 'vocab' as const,
      sourceId: word.id,
      german: word.article ? `${word.article} ${word.german}` : word.german,
      correctAr: word.translation_ar,
      exampleAr: word.example_ar || undefined,
    })),
    ...phrases.map((phrase) => ({
      kind: 'phrase' as const,
      sourceId: phrase.id,
      german: phrase.german,
      correctAr: phrase.translation_ar,
    })),
  ];
  if (!candidates.length) return null;

  const target = candidates[Math.floor(rng() * candidates.length) % candidates.length];
  const distractors = pickDistractors(
    [
      ...sameLevelOptions.filter((option) => !optionsCollide(option, target.correctAr)),
      ...otherLevelOptions,
    ],
    target.correctAr,
    MIN_OPTIONS - 1,
  );
  if (distractors.length < MIN_OPTIONS - 1) return null;

  // Deterministic shuffle: the correct answer must not sit in a fixed position.
  const options = [target.correctAr, ...distractors];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return {
    id: `${target.kind}:${target.sourceId}`,
    kind: target.kind,
    level,
    german: target.german,
    options,
    correctIndex: options.indexOf(target.correctAr),
    correctAr: target.correctAr,
    isListening,
    sourceId: target.sourceId,
    explanationAr: `${target.german} = ${target.correctAr}${target.exampleAr ? ` — ${target.exampleAr}` : ''}`,
  };
}
