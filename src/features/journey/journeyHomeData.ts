import type {
  MistakeEntity,
  ReviewItemEntity,
  ScenarioEntity,
  ScenarioTrainingEntity,
  SessionEntity,
  SkillPracticeEntity,
  StarterPhraseEntity,
  VocabularyEntity,
} from '@/types/models';
import type { ScenarioLevelIndex } from '@/lib/mission/selectMission';
import type { CapabilityModelInput } from '@/lib/capability/model';
import { db } from '@/lib/db/katzuDb';

/**
 * Bounded reads for the Journey Home (B4a).
 *
 * The screen used to run eight separate full-table `toArray()` live queries —
 * every scenario, phrase, word, mistake and session on the device, re-delivered
 * on every write to any of those tables, so opening one screen re-materialised
 * the whole database into React state on each turn of a conversation.
 *
 * What the screen actually renders is far smaller, and this module is the single
 * place that knows exactly what that is:
 *
 *   - scenarios: only the fields the mission selector, the journey context and
 *     the capability model read;
 *   - phrases/vocabulary: not rendered at all — only the set of (scenario |
 *     topic) → levels each fills, so the projection collapses them to that index;
 *   - sessions: only `timestamp` (journey context) plus the three capability
 *     fields, projected per scenario;
 *   - mistakes/review items: only the four capability fields, per scenario;
 *   - skill practice: only the skill/score pair the weakest-skill check reads.
 *
 * Everything is a pure projection: no row cap, no LIMIT, no "first 50 mistakes".
 * A cap on evidence rows could flip a capability state or a due count while the
 * data still exists, and a mission selector that depends on the order rows
 * happen to come back in is not deterministic. The bound is *memory shape*
 * (columns + grouping), not row count, so the output is provably the same as
 * feeding the full rows through the same pure functions.
 *
 * `useJourneyHomeData` runs the whole read in ONE live query (one Dexie
 * transaction, one re-render per change to any of the eight tables) and
 * memoises the projection until one of them actually changes.
 */

/** Scenario fields JourneyHome's derivations read. */
export type JourneyScenario = Pick<
  ScenarioEntity,
  'id' | 'title_de' | 'title_ar' | 'category' | 'banner_url'
>;

export interface JourneySessionSlice {
  scenarioId: string;
  timestamp: number;
  accuracyPercent: number | null;
  independentSentences: number;
  hintAssistedSentences: number;
}

export interface JourneyMistakeSlice {
  scenarioId: string;
  isMastered: boolean;
  timestamp: number;
  grammarRule: string;
}

export interface JourneyReviewSlice {
  scenarioId?: string;
  kind: ReviewItemEntity['kind'];
  reps: number;
  lastReviewedAt?: number;
  /** Kept on the slice: the SRS due count and the review card both read it. */
  dueAt: number;
}

export interface JourneyTrainingSlice {
  scenarioId: string;
  studiedAt: number | null;
  quizAttempted: boolean;
  lastScore: number;
  updatedAt?: number;
}

export interface JourneySkillPracticeSlice {
  skill: SkillPracticeEntity['skill'];
  score: number;
}

export interface JourneyHomeProjection {
  scenarios: JourneyScenario[];
  training: JourneyTrainingSlice[];
  sessionsByScenario: Record<string, JourneySessionSlice[]>;
  allSessions: Array<{ timestamp: number }>;
  mistakesByScenario: Record<string, JourneyMistakeSlice[]>;
  reviewItems: JourneyReviewSlice[];
  skillPractice: JourneySkillPracticeSlice[];
  /** (scenario | topic) → CEFR levels that actually have content. */
  scenarioLevels: ScenarioLevelIndex;
}

export function projectJourneyHomeData(rows: {
  scenarios: ScenarioEntity[];
  training: ScenarioTrainingEntity[];
  sessions: SessionEntity[];
  mistakes: MistakeEntity[];
  reviewItems: ReviewItemEntity[];
  skillPractice: SkillPracticeEntity[];
  starterPhrases: StarterPhraseEntity[];
  vocabulary: VocabularyEntity[];
}): JourneyHomeProjection {
  const {
    scenarios,
    training,
    sessions,
    mistakes,
    reviewItems,
    skillPractice,
    starterPhrases,
    vocabulary,
  } = rows;

  const sessionsByScenario: Record<string, JourneySessionSlice[]> = {};
  const allSessions: Array<{ timestamp: number }> = [];
  for (const session of sessions) {
    const slice: JourneySessionSlice = {
      scenarioId: session.scenarioId,
      timestamp: session.timestamp,
      accuracyPercent: session.accuracyPercent,
      independentSentences: session.independentSentences ?? 0,
      hintAssistedSentences: session.hintAssistedSentences ?? 0,
    };
    allSessions.push({ timestamp: slice.timestamp });
    if (session.scenarioId) {
      (sessionsByScenario[session.scenarioId] ||= []).push(slice);
    }
  }

  const mistakesByScenario: Record<string, JourneyMistakeSlice[]> = {};
  for (const mistake of mistakes) {
    (mistakesByScenario[mistake.scenarioId] ||= []).push({
      scenarioId: mistake.scenarioId,
      isMastered: !!mistake.isMastered,
      timestamp: mistake.timestamp,
      grammarRule: mistake.grammarRule || '',
    });
  }

  const reviewSlices: JourneyReviewSlice[] = [];
  for (const item of reviewItems) {
    reviewSlices.push({
      scenarioId: item.scenarioId,
      kind: item.kind,
      reps: item.reps ?? 0,
      lastReviewedAt: item.lastReviewedAt,
      dueAt: item.dueAt,
    });
  }

  // The level index the mission selector reads — previously rebuilt on the
  // client from two full content tables on every render.
  const scenarioLevels: ScenarioLevelIndex = {};
  for (const phrase of starterPhrases) {
    if (!phrase?.scenario_id) continue;
    const levels = scenarioLevels[phrase.scenario_id] || [];
    if (!levels.includes(phrase.level)) levels.push(phrase.level);
    scenarioLevels[phrase.scenario_id] = levels;
  }
  for (const word of vocabulary) {
    if (!word?.topic) continue;
    const levels = scenarioLevels[word.topic] || [];
    if (!levels.includes(word.level)) levels.push(word.level);
    scenarioLevels[word.topic] = levels;
  }

  return {
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      title_de: scenario.title_de,
      title_ar: scenario.title_ar,
      category: scenario.category,
      banner_url: scenario.banner_url,
    })),
    training: training.map((record) => ({
      scenarioId: record.scenarioId,
      studiedAt: record.studiedAt,
      quizAttempted: record.quizAttempted,
      lastScore: record.lastScore,
      updatedAt: record.updatedAt,
    })),
    sessionsByScenario,
    allSessions,
    mistakesByScenario,
    reviewItems: reviewSlices,
    skillPractice: skillPractice.map((row) => ({ skill: row.skill, score: row.score })),
    scenarioLevels,
  };
}

export type JourneyLiveQuery = <T>(querier: () => Promise<T> | T) => T | undefined;

/**
 * One live query for the whole screen: any change to any of the eight tables
 * re-runs this single transactional read, and the screen re-renders once.
 * Dexie's `useLiveQuery` re-executes the querier when an observed table
 * changes; reading all eight inside one querier is the documented way to
 * subscribe to them atomically.
 */
export function readJourneyHomeData(): Promise<JourneyHomeProjection> {
  return Promise.all([
    db.scenarios.toArray(),
    db.scenario_training.toArray(),
    db.sessions.toArray(),
    db.mistakes.toArray(),
    db.review_items.toArray(),
    db.skill_practice.toArray(),
    db.starter_phrases.toArray(),
    db.vocabulary.toArray(),
  ]).then(([scenarios, training, sessions, mistakes, reviewItems, skillPractice, starterPhrases, vocabulary]) =>
    projectJourneyHomeData({ scenarios, training, sessions, mistakes, reviewItems, skillPractice, starterPhrases, vocabulary }),
  );
}

/** Adapter: shape the projection back into the capability model's input. */
export function capabilityInputFromProjection(
  projection: JourneyHomeProjection,
): CapabilityModelInput {
  return {
    scenarios: projection.scenarios,
    training: projection.training,
    sessions: Object.values(projection.sessionsByScenario).flat(),
    mistakes: Object.values(projection.mistakesByScenario).flat(),
    reviewItems: projection.reviewItems,
  };
}
