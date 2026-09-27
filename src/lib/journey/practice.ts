import type { CEFRLevel, StarterPhraseEntity, VocabularyEntity } from '@/types/models';
import { gradeAnswer, type AnswerVerdict } from '@/lib/srs/engine';
import { diffDictation, type DictationResult } from '@/lib/listening/drill';

/**
 * Guided Practice: the short preparation before the real conversation.
 *
 * Two or three phrases, one retrieval, one listening moment — then the learner
 * goes and talks. The set is built from real content rows, never from generated
 * text, and it is deliberately small: this screen exists to get a learner's mouth
 * moving, not to become a third curriculum.
 *
 * The exercise graders are the review engine's own (`gradeAnswer`,
 * `diffDictation`), so "correct" means exactly the same thing here as it does in
 * Review and in the dictation drill.
 */

export interface PracticeCard {
  id: string;
  de: string;
  ar: string;
  level: CEFRLevel;
  /** Optional Arabic note (article, register, or where the phrase is used). */
  noteAr?: string;
}

export interface GuidedPractice {
  cards: PracticeCard[];
  /** Say this in German, from the Arabic meaning. */
  retrieval: { promptAr: string; answerDe: string; level: CEFRLevel } | null;
  /** Listen and repeat: the longest phrase the learner just saw. */
  listening: { de: string; ar: string; level: CEFRLevel } | null;
  /** True when the device has no usable content for this scenario yet. */
  empty: boolean;
}

const MAX_CARDS = 3;
const LEVEL_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];

function levelRank(level: CEFRLevel): number {
  const index = LEVEL_ORDER.indexOf(level);
  return index === -1 ? LEVEL_ORDER.length : index;
}

function cardFromPhrase(phrase: StarterPhraseEntity): PracticeCard {
  return {
    id: `phrase_${phrase.id}`,
    de: phrase.german.trim(),
    ar: phrase.translation_ar.trim(),
    level: phrase.level,
  };
}

function cardFromVocabulary(word: VocabularyEntity): PracticeCard {
  const article = word.article ? `${word.article} ` : '';
  const example = (word.example_de || '').trim();
  // A word card teaches a usable sentence where one exists: "der Termin" alone is
  // memorisation, "Ich habe morgen einen Termin." is something to say out loud.
  return {
    id: `vocab_${word.id}`,
    de: example || `${article}${word.german}`.trim(),
    ar: example ? word.example_ar.trim() : word.translation_ar.trim(),
    level: word.level,
    noteAr: example ? `${article}${word.german} — ${word.translation_ar}`.trim() : undefined,
  };
}

/**
 * Content the learner can practise right now: phrases ordered by how close they
 * are to the learner's level (an A1 learner is offered A1 first and B1 only if
 * nothing easier exists — a scarce level must not produce an empty screen),
 * then the scenario's vocabulary. Duplicate German lines are dropped so a deck
 * is never padded with the same sentence twice.
 */
export function buildGuidedPractice(input: {
  phrases: StarterPhraseEntity[];
  vocabulary: VocabularyEntity[];
  level: CEFRLevel;
}): GuidedPractice {
  const { phrases = [], vocabulary = [], level } = input;
  const learnerRank = levelRank(level);

  const usablePhrases = [...phrases]
    .filter((phrase) => phrase?.german?.trim() && phrase?.translation_ar?.trim())
    .sort(
      (a, b) =>
        Math.abs(levelRank(a.level) - learnerRank) - Math.abs(levelRank(b.level) - learnerRank) ||
        (a.sort_order || 0) - (b.sort_order || 0),
    );

  const usableVocabulary = [...vocabulary]
    .filter((word) => word?.german?.trim() && (word.translation_ar?.trim() || word.example_ar?.trim()))
    .sort((a, b) => levelRank(a.level) - levelRank(b.level));

  const pool: PracticeCard[] = [
    ...usablePhrases.map(cardFromPhrase),
    ...usableVocabulary.map(cardFromVocabulary),
  ];

  const seen = new Set<string>();
  const cards: PracticeCard[] = [];
  for (const card of pool) {
    const key = card.de.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(card);
    if (cards.length >= MAX_CARDS) break;
  }

  if (cards.length === 0) {
    return { cards: [], retrieval: null, listening: null, empty: true };
  }

  // Retrieval tests the first card: it is the one the learner just heard and
  // read, so a successful production is genuine retrieval rather than a guess.
  const retrievalCard = cards[0];
  // Listening uses the longest line, which is the one worth hearing twice.
  const listeningCard = [...cards].sort((a, b) => b.de.split(/\s+/).length - a.de.split(/\s+/).length)[0];

  return {
    cards,
    retrieval: { promptAr: retrievalCard.ar, answerDe: retrievalCard.de, level: retrievalCard.level },
    listening: { de: listeningCard.de, ar: listeningCard.ar, level: listeningCard.level },
    empty: false,
  };
}

/** Arabic feedback for a typed/spoken production. Calm correction, never red. */
export function retrievalFeedback(verdict: AnswerVerdict): { tone: 'earned' | 'neutral'; messageAr: string } {
  switch (verdict) {
    case 'correct':
      return { tone: 'earned', messageAr: 'صحيحة تماماً — هذه هي الجملة التي ستقولها هناك.' };
    case 'close':
      // The article is the mistake Arabic speakers make most; name it precisely.
      return {
        tone: 'neutral',
        messageAr: 'الكلمة صحيحة، لكن أداة التعريف مختلفة. الأداة جزء من الكلمة في الألمانية — أعدها مع الأداة الصحيحة.',
      };
    default:
      return { tone: 'neutral', messageAr: 'ليست المطلوبة بعد. انظر إلى الجملة الصحيحة ثم قلّدها مرة واحدة.' };
  }
}

export interface RepeatResult {
  verdict: DictationResult['verdict'];
  matched: number;
  total: number;
  missedWords: string[];
  messageAr: string;
}

/**
 * What the microphone actually heard, compared with the target sentence.
 *
 * Honest wording on purpose: this reports *word coverage*, never pronunciation
 * quality. The app cannot score an accent and must not imply it can.
 */
export function gradeRepeat(expected: string, heard: string): RepeatResult {
  const result = diffDictation(expected, heard);
  const messageAr =
    result.verdict === 'correct'
      ? `سمعنا كل الكلمات (${result.total} من ${result.total}).`
      : result.total > 0 && result.matched > 0
        ? `سمعنا ${result.matched} من ${result.total} كلمات — الباقي: ${result.missedWords.join('، ')}.`
        : 'لم نسمع كلمات واضحة هذه المرة. أعد المحاولة، أو اكتب ما سمعته.';
  return { ...result, messageAr };
}

/**
 * Grading for the typed fallback, exposed so the screen does not re-derive
 * "what counts as the same sentence" with its own string logic.
 */
export function gradeTypedProduction(expected: string, actual: string): ReturnType<typeof retrievalFeedback> & { verdict: AnswerVerdict } {
  const verdict = gradeAnswer(expected, actual);
  return { verdict, ...retrievalFeedback(verdict) };
}
