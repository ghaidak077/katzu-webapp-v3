import type {
  CEFRLevel,
  GrammarEntity,
  MistakeEntity,
  ScenarioEntity,
  VocabularyEntity,
} from '@/types/models';
import { MASTERED_REPS, reviewRefId } from '@/lib/srs/engine';
import { scenarioToVocabTopic } from '@/lib/utils/scenarioVocab';
import { CATEGORY_COPY, classifyMistake, type MistakeCategory } from '@/lib/coach/taxonomy';

/**
 * The Progress screen's two lists.
 *
 * A list of words the app knows about is worthless; a list of words *this learner
 * has a relationship with* is the point. So every row carries exactly two derived
 * facts and nothing else:
 *
 *   - **state**, taken from the review queue the learner actually has (three
 *     successful recalls is what "ثابتة" means, here as everywhere);
 *   - **origin**, the scenario whose topic this word belongs to, or the scenario
 *     where the mistake against this rule actually happened.
 *
 * Both are derivable from recorded data, both are testable without a browser, and
 * neither is a count that cannot be traced back to something the learner can
 * point at. Rows of unknown provenance are dropped rather than guessed at.
 */

export type VocabularyMemoryState = 'unseen' | 'learning' | 'retained';

export interface VocabularyEntry {
  id: number;
  /** German, with its article when it has one: "der Termin". */
  de: string;
  ar: string;
  level: CEFRLevel;
  topic: string;
  state: VocabularyMemoryState;
  stateLabelAr: string;
  /** Successful recalls recorded by the review engine (0 when never reviewed). */
  reps: number;
  dueAt: number | null;
  /** True when the learner explicitly saved the word — an explicit "I want this". */
  isSaved: boolean;
  /** The scenario this word belongs to, by topic. Absent when no scenario matches. */
  scenarioId?: string;
  scenarioTitleAr?: string;
}

/** Honest wording for each state, used verbatim by the screen. */
export const VOCABULARY_STATE_LABEL_AR: Record<VocabularyMemoryState, string> = {
  unseen: 'لم تُراجَع بعد',
  learning: 'في المراجعة المجدولة',
  retained: `ثابتة (${MASTERED_REPS} مراجعات ناجحة)`,
};

export function buildVocabularyEntries(input: {
  vocabulary: VocabularyEntity[];
  reviewItems: Array<{ refId?: string; reps?: number; dueAt?: number }>;
  savedWords: Array<{ wordId: number }>;
  scenarios: Array<Pick<ScenarioEntity, 'id' | 'title_ar' | 'category'>>;
}): VocabularyEntry[] {
  const { vocabulary = [], reviewItems = [], savedWords = [], scenarios = [] } = input;

  // Topic → the first scenario that teaches it, so a word can name its origin.
  const scenarioByTopic = new Map<string, { id: string; titleAr: string }>();
  for (const scenario of scenarios) {
    const topic = scenarioToVocabTopic(scenario);
    if (topic && !scenarioByTopic.has(topic)) {
      scenarioByTopic.set(topic, { id: scenario.id, titleAr: scenario.title_ar });
    }
  }

  const reviewByRef = new Map(reviewItems.map((item) => [item.refId, item]));
  const saved = new Set(savedWords.map((word) => word.wordId));

  const entries: VocabularyEntry[] = [];
  for (const word of vocabulary) {
    if (word?.id == null || !word.german?.trim()) continue;
    const item = reviewByRef.get(reviewRefId('vocab', word.id));
    const reps = Number(item?.reps) || 0;
    const state: VocabularyMemoryState =
      item && reps >= MASTERED_REPS ? 'retained' : item ? 'learning' : 'unseen';
    const origin = word.topic ? scenarioByTopic.get(word.topic) : undefined;

    entries.push({
      id: word.id,
      de: `${word.article ? `${word.article} ` : ''}${word.german}`.trim(),
      ar: word.translation_ar || word.example_ar || '',
      level: word.level,
      topic: word.topic || '',
      state,
      stateLabelAr: VOCABULARY_STATE_LABEL_AR[state],
      reps,
      dueAt: typeof item?.dueAt === 'number' ? item.dueAt : null,
      isSaved: saved.has(word.id),
      scenarioId: origin?.id,
      scenarioTitleAr: origin?.titleAr,
    });
  }

  // Words the learner has a relationship with come first: saved, then reviewed,
  // then the rest — and inside each group the ones due soonest.
  const rank = (entry: VocabularyEntry) =>
    entry.isSaved ? 0 : entry.state === 'learning' ? 1 : entry.state === 'retained' ? 2 : 3;
  return entries.sort(
    (a, b) => rank(a) - rank(b) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.id - b.id,
  );
}

export type GrammarState = 'not_met' | 'correcting' | 'repeating';

export interface GrammarEntry {
  id: string;
  titleAr: string;
  ruleDe: string;
  level: CEFRLevel;
  /** How the learner is doing with it, from their own recorded mistakes. */
  state: GrammarState;
  stateLabelAr: string;
  /** Mistakes classified into this rule's category by the same taxonomy the coach uses. */
  mistakeCount: number;
  /** Where it happened: the most recent scenario with a mistake in this category. */
  scenarioId?: string;
  scenarioTitleAr?: string;
}

export const GRAMMAR_STATE_LABEL_AR: Record<GrammarState, string> = {
  not_met: 'لم نرصد أخطاء فيها بعد',
  correcting: 'تكررت مرة أو مرتين',
  repeating: 'نمط متكرر عندك',
};

/** Two mistakes is where a pattern starts; one is an accident. */
const REPEATING_THRESHOLD = 2;

export function buildGrammarEntries(input: {
  grammar: GrammarEntity[];
  mistakes: Array<Pick<MistakeEntity, 'grammarRule' | 'original' | 'corrected' | 'scenarioId' | 'timestamp' | 'isMastered'>>;
  scenarios: Array<Pick<ScenarioEntity, 'id' | 'title_ar'>>;
}): GrammarEntry[] {
  const { grammar = [], mistakes = [], scenarios = [] } = input;

  const scenarioTitles = new Map(scenarios.map((scenario) => [scenario.id, scenario.title_ar]));

  // Classify each recorded mistake once, then attribute it to the grammar rows
  // that describe the same category. Both sides read the coach's taxonomy, so a
  // rule and a mistake can never be filed under different names.
  const byCategory = new Map<MistakeCategory, Array<{ scenarioId: string; timestamp: number }>>();
  for (const mistake of mistakes) {
    if (mistake.isMastered) continue;
    const category = classifyMistake(mistake.grammarRule, mistake.original, mistake.corrected);
    const rows = byCategory.get(category) || [];
    rows.push({ scenarioId: mistake.scenarioId, timestamp: Number(mistake.timestamp) || 0 });
    byCategory.set(category, rows);
  }

  const entries: GrammarEntry[] = [];
  for (const rule of grammar) {
    if (!rule?.id || (!rule.title_ar && !rule.rule_de)) continue;
    const category = classifyMistake(`${rule.title_ar || ''} ${rule.rule_de || ''}`);
    // 'other' means the rule text matched no known category: claiming "no mistakes"
    // there would be an assumption, so such a rule keeps the honest neutral state
    // and no counts.
    const attributed = category === 'other' ? undefined : byCategory.get(category);
    const count = attributed?.length || 0;
    const latest = [...(attributed || [])].sort((a, b) => b.timestamp - a.timestamp)[0];
    const state: GrammarState =
      count >= REPEATING_THRESHOLD ? 'repeating' : count > 0 ? 'correcting' : 'not_met';

    entries.push({
      id: rule.id,
      titleAr: rule.title_ar || CATEGORY_COPY[category].labelAr,
      ruleDe: rule.rule_de || '',
      level: rule.level,
      state,
      stateLabelAr: GRAMMAR_STATE_LABEL_AR[state],
      mistakeCount: count,
      scenarioId: latest?.scenarioId,
      scenarioTitleAr: latest ? scenarioTitles.get(latest.scenarioId) : undefined,
    });
  }

  // Rules the learner is actually struggling with lead the list.
  const rank = (entry: GrammarEntry) =>
    entry.state === 'repeating' ? 0 : entry.state === 'correcting' ? 1 : 2;
  return entries.sort((a, b) => rank(a) - rank(b) || b.mistakeCount - a.mistakeCount || a.id.localeCompare(b.id));
}
