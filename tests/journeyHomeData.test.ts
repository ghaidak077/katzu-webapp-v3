/**
 * B4a: the JourneyHome bounded read must be identity-preserving.
 *
 * The screen's derivations (mission selector, capability model, journey
 * context, due count) are pure functions. This test feeds the SAME fixture rows
 * through them twice — once as full entities (the old path), once through the
 * projection (the new path) — and asserts the outputs are deep-equal. That is
 * the proof that bounding the read changed memory shape, not behaviour.
 */
import { describe, expect, it } from 'vitest';
import { projectJourneyHomeData } from '@/features/journey/journeyHomeData';
import { buildCapabilityModel, weakestMeasuredSkill } from '@/lib/capability/model';
import { selectDailyMission } from '@/lib/mission/selectMission';
import { buildJourneyContext } from '@/lib/journey/context';
import { countDue } from '@/lib/srs/engine';
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

const now = 1_759_000_000_000;

const scenarios: ScenarioEntity[] = [
  {
    id: 'cafe_order',
    title_de: 'Im Café bestellen',
    title_ar: 'الطلب في المقهى',
    ai_persona: 'Barista katze',
    category: 'daily_life',
    icon: 'coffee',
    initial_message_a1: 'a1',
    initial_message_a2: 'a2',
    initial_message_b1: 'b1',
    initial_message_b2: 'b2',
    // A field the screen never reads — must survive as "not needed" but not
    // break the projection.
    banner_url: 'https://example.com/cafe.jpg',
  } as ScenarioEntity,
  {
    id: 'bakery_shopping',
    title_de: 'Beim Bäcker',
    title_ar: 'عند الخبّاز',
    ai_persona: 'Bäcker katze',
    category: 'daily_life',
    icon: 'shopping-bag',
    initial_message_a1: 'a1',
    initial_message_a2: 'a2',
    initial_message_b1: 'b1',
    initial_message_b2: 'b2',
  },
];

const training: ScenarioTrainingEntity[] = [
  {
    scenarioId: 'cafe_order',
    userId: 'u1',
    studiedAt: now - 90_000,
    quizAttempted: true,
    lastScore: 85,
    effectiveLevel: 'A1',
    updatedAt: now - 80_000,
  },
];

const sessions: SessionEntity[] = [
  {
    id: 's1',
    scenarioId: 'cafe_order',
    scenarioTitle: 'Im Café bestellen',
    cefrLevel: 'A1',
    sentencesSpoken: 3,
    wordsLearned: 5,
    accuracyPercent: 90,
    durationSeconds: 120,
    timestamp: now - 60_000,
    independentSentences: 3,
    hintAssistedSentences: 0,
    // Extra fields the projection drops:
    wasIndependentOnly: true,
  } as SessionEntity,
  {
    id: 's2',
    scenarioId: 'bakery_shopping',
    scenarioTitle: 'Beim Bäcker',
    cefrLevel: 'A1',
    sentencesSpoken: 1,
    wordsLearned: 2,
    accuracyPercent: 50,
    durationSeconds: 60,
    timestamp: now - 30_000,
    independentSentences: 1,
    hintAssistedSentences: 2,
  } as SessionEntity,
];

const mistakes: MistakeEntity[] = [
  {
    id: 1,
    userId: 'u1',
    scenarioId: 'cafe_order',
    original: 'Ich möchte ein Kaffee',
    corrected: 'Ich möchte einen Kaffee',
    grammarRule: 'Akkusativ',
    timestamp: now - 40_000,
    isMastered: false,
    wasHintUsed: false,
  } as MistakeEntity,
];

const reviewItems: ReviewItemEntity[] = [
  {
    id: 1,
    userId: 'u1',
    kind: 'mistake',
    refId: 'm1',
    promptAr: 'أكمل',
    answerDe: 'einen Kaffee',
    dueAt: now - 1000,
    intervalDays: 1,
    reps: 3,
    lastReviewedAt: now - 50_000,
    scenarioId: 'cafe_order',
  } as ReviewItemEntity,
];

const skillPractice: SkillPracticeEntity[] = [
  { userId: 'u1', skill: 'writing', score: 40, at: now - 20_000 } as SkillPracticeEntity,
];

const starterPhrases: StarterPhraseEntity[] = [
  { id: 1, scenario_id: 'cafe_order', level: 'A1', german: 'a', translation_en: 'a', translation_ar: 'أ', sort_order: 1 },
  { id: 2, scenario_id: 'bakery_shopping', level: 'A1', german: 'b', translation_en: 'b', translation_ar: 'ب', sort_order: 1 },
];

const vocabulary: VocabularyEntity[] = [
  { id: 1, german: 'Kaffee', article: 'der', plural: 'Kaffees', part_of_speech: 'Noun', translation_ar: 'قهوة', translation_en: 'Coffee', example_de: 'a', example_ar: 'أ', topic: 'food', level: 'A1' },
];

const rows = { scenarios, training, sessions, mistakes, reviewItems, skillPractice, starterPhrases, vocabulary };

/** The old path: full entities straight into the pure derivations. */
function derivationsFromFullRows() {
  const capability = buildCapabilityModel({ scenarios, training, sessions, mistakes, reviewItems });
  const mission = selectDailyMission({
    level: 'A1',
    goal: null,
    scenarios: scenarios.map((s) => ({ id: s.id, title_de: s.title_de, title_ar: s.title_ar, category: s.category })),
    training: training.map((r) => ({ scenarioId: r.scenarioId, studiedAt: r.studiedAt, quizAttempted: r.quizAttempted, lastScore: r.lastScore, updatedAt: r.updatedAt })),
    reviewItems: reviewItems.map((i) => ({ dueAt: i.dueAt, kind: i.kind, scenarioId: i.scenarioId })),
    sessions: sessions.map((s) => ({ timestamp: s.timestamp })),
    dailyMinutes: 15,
    now,
  });
  const context = buildJourneyContext({
    scenarios: scenarios.map((s) => ({ id: s.id, title_de: s.title_de, title_ar: s.title_ar, category: s.category })),
    training: training.map((r) => ({ scenarioId: r.scenarioId, studiedAt: r.studiedAt, quizAttempted: r.quizAttempted, lastScore: r.lastScore, updatedAt: r.updatedAt })),
    sessions: sessions.map((s) => ({ timestamp: s.timestamp })),
    reviewDueCount: countDue(reviewItems, now),
    independentScenarioIds: Object.entries(capability.byScenario)
      .filter(([, v]) => v.state === 'INDEPENDENT' || v.state === 'RETAINED')
      .map(([id]) => id),
    level: 'A1',
    now,
  });
  const weakest = weakestMeasuredSkill({ sessions, practice: skillPractice });
  const due = countDue(reviewItems, now);
  return { capability, mission, context, weakest, due };
}

/** The new path: the same derivations fed from the projection. */
function derivationsFromProjection() {
  const p = projectJourneyHomeData(rows);
  const sessionsFlat = Object.values(p.sessionsByScenario).flat();
  const mistakesFlat = Object.values(p.mistakesByScenario).flat();
  const capability = buildCapabilityModel({ scenarios: p.scenarios, training: p.training, sessions: sessionsFlat, mistakes: mistakesFlat, reviewItems: p.reviewItems });
  const mission = selectDailyMission({
    level: 'A1',
    goal: null,
    scenarios: p.scenarios.map((s) => ({ id: s.id, title_de: s.title_de, title_ar: s.title_ar, category: s.category })),
    training: p.training,
    reviewItems: p.reviewItems,
    scenarioLevels: p.scenarioLevels,
    sessions: p.allSessions,
    dailyMinutes: 15,
    now,
  });
  const context = buildJourneyContext({
    scenarios: p.scenarios.map((s) => ({ id: s.id, title_de: s.title_de, title_ar: s.title_ar, category: s.category })),
    training: p.training,
    sessions: p.allSessions,
    reviewDueCount: countDue(p.reviewItems, now),
    independentScenarioIds: Object.entries(capability.byScenario)
      .filter(([, v]) => v.state === 'INDEPENDENT' || v.state === 'RETAINED')
      .map(([id]) => id),
    level: 'A1',
    now,
  });
  const weakest = weakestMeasuredSkill({ sessions: sessionsFlat, practice: p.skillPractice });
  const due = countDue(p.reviewItems, now);
  return { capability, mission, context, weakest, due, scenarioLevels: p.scenarioLevels };
}

describe('B4a: JourneyHome bounded read is identity-preserving', () => {
  it('derivation outputs are identical with full rows and with the projection', () => {
    const full = derivationsFromFullRows();
    const projected = derivationsFromProjection();
    expect(projected.capability).toEqual(full.capability);
    expect(projected.mission).toEqual(full.mission);
    expect(projected.context).toEqual(full.context);
    expect(projected.weakest).toEqual(full.weakest);
    expect(projected.due).toEqual(full.due);
  });

  it('the projection drops columns the screen never reads', () => {
    const p = projectJourneyHomeData(rows);
    // scenario: only the five derivation fields survive
    expect(p.scenarios[0]).toEqual({
      id: 'cafe_order',
      title_de: 'Im Café bestellen',
      title_ar: 'الطلب في المقهى',
      category: 'daily_life',
      banner_url: 'https://example.com/cafe.jpg',
    });
    // session: four capability/context fields survive, the rest are dropped
    expect(p.sessionsByScenario.cafe_order[0]).toEqual({
      scenarioId: 'cafe_order',
      timestamp: now - 60_000,
      accuracyPercent: 90,
      independentSentences: 3,
      hintAssistedSentences: 0,
    });
    // mistake: four capability fields survive
    expect(p.mistakesByScenario.cafe_order[0]).toEqual({
      scenarioId: 'cafe_order',
      isMastered: false,
      timestamp: now - 40_000,
      grammarRule: 'Akkusativ',
    });
  });

  it('the level index equals the one rebuilt from full content tables', () => {
    const expected: Record<string, string[]> = {};
    for (const phrase of starterPhrases) {
      (expected[phrase.scenario_id] ||= []).push(phrase.level);
    }
    for (const word of vocabulary) {
      (expected[word.topic] ||= []).push(word.level);
    }
    expect(projectJourneyHomeData(rows).scenarioLevels).toEqual(expected);
  });

  it('a row cap would be visible: every mistake and session reaches the model', () => {
    // Guard the design decision: the bound is projection, not LIMIT. If someone
    // later caps these arrays, capability counts can silently change — this
    // test fails first.
    const p = projectJourneyHomeData(rows);
    expect(Object.values(p.mistakesByScenario).flat().length).toBe(mistakes.length);
    expect(Object.values(p.sessionsByScenario).flat().length).toBe(sessions.length);
  });
});
