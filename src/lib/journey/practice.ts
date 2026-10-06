import type { CEFRLevel, GrammarEntity, StarterPhraseEntity, VocabularyEntity } from '@/types/models';
import { gradeAnswer, normalizeGermanAnswer, type AnswerVerdict } from '@/lib/srs/engine';
import { diffDictation, type DictationResult } from '@/lib/listening/drill';
import { dayIndexFor } from '@/lib/utils/dailyMission';
import { vocabularyWithinLevelRadius } from '@/lib/utils/scenarioVocab';

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
  /** Bounded scenario topic pool available to the immediately following conversation. */
  vocabularyContext: string[];
  /** Say this in German, from the Arabic meaning. */
  retrieval: { promptAr: string; answerDe: string; level: CEFRLevel } | null;
  /** Listen and repeat: the longest phrase the learner just saw. */
  listening: { de: string; ar: string; level: CEFRLevel } | null;
  /**
   * Today's rule: a real `grammar` row at (or nearest to) the learner's level,
   * with its own example as the production target. This is the "explain and drill"
   * beat between the phrases and the conversation, so an episode is
   * story → rule → drill → speak rather than phrases → speak.
   */
  grammar: PracticeGrammar | null;
  /** True when the device has no usable content for this scenario yet. */
  empty: boolean;
}

/** One grammar point, ready to render, with the sentence the learner must produce. */
export interface PracticeGrammar {
  id: string;
  titleAr: string;
  ruleAr: string;
  ruleDe: string;
  /** Arabic explanation, revealed with the answer. */
  explanationAr: string;
  /** What the learner is asked to produce, from `exampleAr`. */
  exampleDe: string;
  exampleAr: string;
  level: CEFRLevel;
}

const MAX_CARDS = 3;
const MAX_VOCABULARY_CONTEXT = 12;
const MAX_VOCABULARY_CONTEXT_TEXT = 80;
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
 * Which rule today's episode teaches.
 *
 * `grammar` rows carry no scenario link (the D1 table has no `scenario_id`), so
 * the honest choice is the rule nearest the learner's level, rotated by calendar
 * day: the same learner gets a different rule tomorrow rather than the same A1
 * rule forever, and every device shows the same rule on the same day. A rule
 * whose example is a sentence already on the deck is skipped — teaching the same
 * line twice is not reinforcement, it is padding.
 */
// Words long enough to carry meaning (`der`, `ich` are noise for a relevance test).
function contentWords(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3);
}

/** How many of a rule's example words the episode's own content already uses. */
function sharedWordCount(example: string, vocabulary: Set<string>): number {
  if (vocabulary.size === 0) return 0;
  return contentWords(example).filter((word) => vocabulary.has(word)).length;
}

export function selectGrammarRule(
  grammar: GrammarEntity[],
  level: CEFRLevel,
  options: { now?: number; excludeGerman?: string[]; scenarioVocabulary?: string[] } = {},
): PracticeGrammar | null {
  const learnerRank = levelRank(level);
  const excluded = new Set((options.excludeGerman || []).map((value) => normalizeGermanAnswer(value)));
  // Words the episode already put in front of the learner. A rule whose example
  // reuses them is possible to ATTEMPT; the off-scenario rule (measured: airport
  // luggage taught "trennbare Verben" with "Ich richte den Zugang ein") is not.
  const scenarioVocabulary = new Set((options.scenarioVocabulary || []).flatMap(contentWords));

  /**
   * Level cap (launch polish, Screen 2.3 — verify then fix, owner brief): the
   * app's own rule is "never harder than the level". The old pool sorted by
   * DISTANCE from the learner's level, so a thin grammar table served a B1
   * rule (sich freuen auf) inside an A1 scenario to an A1 learner — a
   * deliberate-looking stretch nobody had decided on. The pool is now CAPPED
   * at the learner's rank: at-or-below first, and above the level only when
   * nothing at or below it exists (a scarce table must not empty the beat).
   */
  const valid = (grammar || []).filter(
    (rule) => rule?.id && rule.title_ar?.trim() && rule.rule_ar?.trim() && rule.example_de?.trim(),
  );
  const atOrBelow = valid.filter((rule) => levelRank(rule.level) <= learnerRank);
  const cappedPool = atOrBelow.length > 0 ? atOrBelow : valid;

  const pool = cappedPool
    .filter((rule) => !excluded.has(normalizeGermanAnswer(rule.example_de)))
    .sort(
      (a, b) =>
        Math.abs(levelRank(a.level) - learnerRank) - Math.abs(levelRank(b.level) - learnerRank) ||
        String(a.id).localeCompare(String(b.id)),
    );

  if (pool.length === 0) return null;

  // Relevance filter: when any rule reuses the episode's own words, the day's
  // rule is drawn from those and never from the off-scenario remainder. When
  // none do (a topic-poor device), the previous full-pool behaviour stands, so
  // the screen still teaches something real rather than nothing.
  const relevant = pool.filter((rule) => sharedWordCount(rule.example_de, scenarioVocabulary) > 0);
  const rotationPool = relevant.length > 0 ? relevant : pool;

  const dayIndex = dayIndexFor(new Date(options.now ?? Date.now()));
  const rule = rotationPool[((dayIndex % rotationPool.length) + rotationPool.length) % rotationPool.length];

  return {
    id: rule.id,
    titleAr: rule.title_ar.trim(),
    ruleAr: rule.rule_ar.trim(),
    ruleDe: (rule.rule_de || '').trim(),
    explanationAr: (rule.explanation_ar || '').trim(),
    exampleDe: rule.example_de.trim(),
    exampleAr: (rule.example_ar || '').trim(),
    level: rule.level,
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
  /** The global `grammar` rows; optional so an offline device without them still works. */
  grammar?: GrammarEntity[];
  /** Injectable clock, so the day-rotated rule is testable. */
  now?: number;
}): GuidedPractice {
  const { phrases = [], vocabulary = [], level } = input;
  const learnerRank = levelRank(level);

  // D5: the rehearsal deck draws vocabulary from the learner's level ±1, with
  // the same never-empty fallback as Study and Quiz — a topic that only ships
  // rows far from the learner still shows something rather than nothing.
  const levelWindowedVocabulary = vocabularyWithinLevelRadius(vocabulary, level);

  const usablePhrases = [...phrases]
    .filter((phrase) => phrase?.german?.trim() && phrase?.translation_ar?.trim())
    .sort(
      (a, b) =>
        Math.abs(levelRank(a.level) - learnerRank) - Math.abs(levelRank(b.level) - learnerRank) ||
        (a.sort_order || 0) - (b.sort_order || 0),
    );

  const usableVocabulary = [...levelWindowedVocabulary]
    .filter((word) => word?.german?.trim() && (word.translation_ar?.trim() || word.example_ar?.trim()))
    .sort((a, b) => levelRank(a.level) - levelRank(b.level));
  const vocabularyContext = [...new Set(usableVocabulary
    .map((word) => word.german.trim().slice(0, MAX_VOCABULARY_CONTEXT_TEXT)))]
    .slice(0, MAX_VOCABULARY_CONTEXT);

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

  const grammar = selectGrammarRule(input.grammar || [], level, {
    now: input.now,
    excludeGerman: cards.map((card) => card.de),
    // Relevance key: the words on today's deck plus the topic pool the following
    // conversation will draw from.
    scenarioVocabulary: [...cards.map((card) => card.de), ...vocabularyContext],
  });

  // The empty state is honest, not a placeholder: it means there is nothing on
  // this device to practise — no phrase, no word, and no rule. A rule on its own
  // is still worth a screen, so it keeps the practice alive on a device whose
  // cached vocabulary is missing.
  if (cards.length === 0) {
    return { cards: [], vocabularyContext, retrieval: null, listening: null, grammar, empty: grammar === null };
  }

  // Retrieval tests the first card: it is the one the learner just heard and
  // read, so a successful production is genuine retrieval rather than a guess.
  const retrievalCard = cards[0];
  // Listening uses the longest line, which is the one worth hearing twice.
  const listeningCard = [...cards].sort((a, b) => b.de.split(/\s+/).length - a.de.split(/\s+/).length)[0];

  return {
    cards,
    vocabularyContext,
    retrieval: { promptAr: retrievalCard.ar, answerDe: retrievalCard.de, level: retrievalCard.level },
    listening: { de: listeningCard.de, ar: listeningCard.ar, level: listeningCard.level },
    grammar,
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
