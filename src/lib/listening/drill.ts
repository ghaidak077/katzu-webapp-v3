import { normalizeGermanAnswer } from '@/lib/srs/engine';
import type { CEFRLevel, StarterPhraseEntity, VocabularyEntity } from '@/types/models';

/**
 * Listening dictation: hear German, write it down.
 *
 * WHY DICTATION AND NOT "CHOOSE WHAT YOU HEARD"
 * Every other exercise in the app can be passed by recognising text on screen.
 * Dictation is the only one that cannot: the learner has to hold the sound in
 * working memory, segment it into words, and reconstruct the spelling. That is
 * the skill a learner actually needs in a Bürgeramt queue or on a phone call,
 * and it is the skill a multiple-choice question quietly trains away.
 *
 * The scoring is deliberately forgiving about spelling variants (ä = ae, ß = ss)
 * and strict about which words were heard, because mixing those two up teaches
 * the wrong lesson: it would penalise keyboard limitations and reward guessing.
 */

export const DRILL_SIZE = 8;
/** Share of the sentence's words that must land before it counts as close. */
const CLOSE_THRESHOLD = 0.7;

export type DrillKind = 'vocab' | 'phrase';

export interface DrillItem {
  /** Unique per source row, so one item is never drilled twice in a run. */
  id: string;
  kind: DrillKind;
  level: CEFRLevel;
  /** What is played aloud — never shown before the learner answers. */
  german: string;
  translationAr: string;
  sourceId: number;
  scenarioId?: string;
}

export type DictationVerdict = 'correct' | 'close' | 'wrong';

export interface DictationResult {
  verdict: DictationVerdict;
  matched: number;
  total: number;
  /** Expected words the learner did not produce, in their original spelling. */
  missedWords: string[];
}

/**
 * Words are compared with the same folding the review engine uses, so German has
 * exactly one definition of "the same word" across the app.
 */
function normalizedTokens(text: string): string[] {
  // Normalising per token keeps this array parallel to the original words, which
  // is what lets the feedback name the words that were actually missed.
  return String(text ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => normalizeGermanAnswer(token))
    .filter(Boolean);
}

export function diffDictation(expected: string, actual: string): DictationResult {
  const expectedTokens = normalizedTokens(expected);
  const remaining = normalizedTokens(actual);

  const missedWords: string[] = [];
  let matched = 0;

  String(expected ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .forEach((originalWord, index) => {
      const token = expectedTokens[index];
      const position = remaining.indexOf(token);
      if (token && position >= 0) {
        matched += 1;
        remaining.splice(position, 1);
      } else {
        missedWords.push(originalWord.replace(/[.,!?;:]+$/, ''));
      }
    });

  const total = expectedTokens.length;
  if (total === 0) return { verdict: 'wrong', matched: 0, total: 0, missedWords: [] };
  if (missedWords.length === 0) return { verdict: 'correct', matched, total, missedWords };

  const ratio = matched / total;
  return {
    verdict: ratio >= CLOSE_THRESHOLD ? 'close' : 'wrong',
    matched,
    total,
    missedWords,
  };
}

export interface DrillPool {
  vocabulary: VocabularyEntity[];
  phrases: StarterPhraseEntity[];
}

function levelItems(pool: DrillPool, level: CEFRLevel, usedIds: Set<string>): DrillItem[] {
  const words: DrillItem[] = pool.vocabulary
    .filter((word) => word.level === level && !!word.german && !!word.translation_ar)
    .filter((word) => !usedIds.has(`vocab:${word.id}`))
    .map((word) => ({
      id: `vocab:${word.id}`,
      kind: 'vocab' as const,
      level,
      german: word.article ? `${word.article} ${word.german}` : word.german,
      translationAr: word.translation_ar,
      sourceId: word.id,
      scenarioId: word.topic || undefined,
    }));

  const phrases: DrillItem[] = pool.phrases
    .filter((phrase) => phrase.level === level && !!phrase.german && !!phrase.translation_ar)
    .filter((phrase) => !usedIds.has(`phrase:${phrase.id}`))
    .map((phrase) => ({
      id: `phrase:${phrase.id}`,
      kind: 'phrase' as const,
      level,
      german: phrase.german,
      translationAr: phrase.translation_ar,
      sourceId: phrase.id,
      scenarioId: phrase.scenario_id || undefined,
    }));

  return [...words, ...phrases];
}

/**
 * Sentences first: real listening is understanding a whole utterance, and a
 * single word is the easier half of it. Vocabulary fills the remainder so a
 * learner with few phrases still gets a full drill.
 */
export function buildDrillQueue(
  pool: DrillPool,
  level: CEFRLevel,
  count: number = DRILL_SIZE,
  rng: () => number = Math.random,
  usedIds: Set<string> = new Set(),
): DrillItem[] {
  const levels: CEFRLevel[] = [level, 'A1', 'A2', 'B1', 'B2'];
  const seen = new Set<string>(usedIds);
  const queue: DrillItem[] = [];

  for (const candidateLevel of levels) {
    if (queue.length >= count) break;
    const items = levelItems(pool, candidateLevel, seen);
    const sentences = shuffle(items.filter((item) => item.kind === 'phrase'), rng);
    const words = shuffle(items.filter((item) => item.kind === 'vocab'), rng);

    for (const item of sentences) {
      if (queue.length >= count) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      queue.push(item);
    }
    // Only top up with single words once the sentences of this level are used.
    for (const item of words) {
      if (queue.length >= count) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      queue.push(item);
    }
  }

  return shuffle(queue, rng);
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** What a run's result means, in the learner's own terms. */
export function describeDrillResult(correct: number, total: number): string {
  if (total === 0) return 'لم نتمكن من تشغيل التدريب — لا يوجد محتوى بعد.';
  const ratio = correct / total;
  if (ratio === 1) return 'سمعت كل جملة بدقة. أذنك تتبع الألمانية جيداً.';
  if (ratio >= 0.7) return 'سمعت معظم الجمل. ما فاتك كان كلمات صغيرة — وهذا طبيعي في البداية.';
  if (ratio >= 0.4) return 'أمسكت جزءاً من كل جملة. سنعيد هذه الجمل عليك حتى تصبح واضحة.';
  return 'الاستماع للألمانية سريع في البداية. أعدنا هذه الجمل إلى مراجعتك — ستتحسن بسرعة.';
}
