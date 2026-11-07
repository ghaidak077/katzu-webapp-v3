import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import liveFixture from './fixtures/live-scenarios.json';
import {
  UNITS,
  allUnitScenarioIds,
  isCheckpointScenario,
  learnerScenarioOrder,
  orderedUnits,
  startUnitIndexForLevel,
  unitForScenario,
} from '@/lib/units/units';
import {
  buildUnitProgress,
  composeSession,
  recommendScenario,
  sessionOutcomeOffer,
  stageFor,
  type LearnerEvidence,
} from '@/lib/units/progress';
import { REVIEW_SESSION_CAP, reviewMinutes } from '@/lib/mission/scenarioMinutes';

const servedIds: string[] = liveFixture.scenarios.map((scenario: { id: string }) => scenario.id);

function evidence(partial: Partial<LearnerEvidence> = {}): LearnerEvidence {
  return {
    completedIds: partial.completedIds ?? [],
    startedIds: partial.startedIds ?? [],
    studiedIds: partial.studiedIds ?? [],
    practisedIds: partial.practisedIds ?? [],
  };
}

describe('the unit map owns every served scenario exactly once', () => {
  it('covers the 49 served ids with no duplicate and no stray row', () => {
    const unitIds = allUnitScenarioIds();
    expect(new Set(servedIds).size).toBe(servedIds.length);
    expect(new Set(unitIds).size).toBe(unitIds.length);
    expect([...unitIds].sort()).toEqual([...servedIds].sort());
    expect(unitIds).toHaveLength(servedIds.length);
  });

  it('has nine units and each scenario resolves to exactly one', () => {
    expect(UNITS).toHaveLength(9);
    for (const id of servedIds) {
      expect(unitForScenario(id), id).toBeDefined();
      expect(UNITS.filter((unit) => unit.scenarioIds.includes(id)), id).toHaveLength(1);
    }
  });

  it('always places a checkpoint last inside its unit', () => {
    for (const unit of UNITS) {
      const firstNonCheckpointAfterCheckpoint = unit.scenarioIds.findIndex(
        (id, index) => isCheckpointScenario(id) && unit.scenarioIds.slice(index + 1).some((next) => !isCheckpointScenario(next)),
      );
      expect(firstNonCheckpointAfterCheckpoint, unit.id).toBe(-1);
    }
  });
});

describe('units are ordered level first, then goal, then authored order', () => {
  it('never lets a goal jump a lower level', () => {
    const levels = ['A1', 'A2', 'B1', 'B2'];
    for (const goal of ['family', 'work', 'study', 'travel', 'general'] as const) {
      const ranks = orderedUnits(goal).map((unit) => levels.indexOf(unit.level));
      for (let index = 1; index < ranks.length; index += 1) {
        expect(ranks[index], `${goal} at ${index}`).toBeGreaterThanOrEqual(ranks[index - 1]);
      }
    }
  });

  it('reorders inside a level by the learner goal', () => {
    const travel = orderedUnits('travel')
      .filter((unit) => unit.level === 'A1')
      .map((unit) => unit.id);
    expect(travel[0]).toBe('u2-arrival');
    const standard = orderedUnits()
      .filter((unit) => unit.level === 'A1')
      .map((unit) => unit.id);
    expect(standard).toEqual(['u1-first-words', 'u2-arrival', 'u3-out-and-about']);
  });

  it('starts a learner at their measured level', () => {
    expect(UNITS[startUnitIndexForLevel('B1')].level).toBe('B1');
    expect(UNITS[startUnitIndexForLevel('A0')].level).toBe('A1');
    expect(UNITS[startUnitIndexForLevel(undefined)].level).toBe('A1');
  });
});

describe('the recommendation never asks the learner to choose', () => {
  it('starts at the first situation of the first unit', () => {
    const recommendation = recommendScenario({ level: 'A1', evidence: evidence() });
    expect(recommendation).toMatchObject({ scenarioId: 'first_greetings', reason: 'next' });
  });

  it('continues an unfinished scenario before anything new', () => {
    const recommendation = recommendScenario({
      level: 'A1',
      evidence: evidence({ startedIds: ['cafe_order'] }),
    });
    expect(recommendation?.scenarioId).toBe('cafe_order');
    expect(recommendation?.reason).toBe('continue');
  });

  it('lets a checkpoint lead only after every earlier situation is finished', () => {
    const allExceptExam = servedIds.filter((id) => !isCheckpointScenario(id));
    const recommendation = recommendScenario({
      level: 'A1',
      evidence: evidence({ completedIds: allExceptExam }),
    });
    expect(isCheckpointScenario(recommendation?.scenarioId || '')).toBe(true);
    expect(recommendation?.reason).toBe('checkpoint');
  });

  it('never gives a 2% learner an exam scenario while an earlier one is unfinished', () => {
    const order = learnerScenarioOrder('A1');
    const firstUnfinished = order.find((id) => !isCheckpointScenario(id))!;
    const recommendation = recommendScenario({
      level: 'A1',
      evidence: evidence({ completedIds: [], studiedIds: [firstUnfinished] }),
    });
    expect(isCheckpointScenario(recommendation?.scenarioId || '')).toBe(false);
    expect(recommendation?.scenarioId).toBe(firstUnfinished);
  });

  it('returns nothing when the whole path is finished', () => {
    expect(
      recommendScenario({ level: 'A1', evidence: evidence({ completedIds: servedIds }) }),
    ).toBeUndefined();
  });
});

describe('the stage follows evidence, not a menu', () => {
  it('walks study → with help → solo', () => {
    expect(stageFor('cafe_order', { evidence: evidence() })).toBe('study');
    expect(stageFor('cafe_order', { evidence: evidence({ studiedIds: ['cafe_order'] }) })).toBe('with_help');
    expect(stageFor('cafe_order', { evidence: evidence({ practisedIds: ['cafe_order'] }) })).toBe('with_help');
    expect(stageFor('cafe_order', { evidence: evidence({ completedIds: ['cafe_order'] }) })).toBe('solo');
  });

  it('repeats with help after «صعبة» and allows solo after «سهلة»', () => {
    expect(
      stageFor('cafe_order', { evidence: evidence({ studiedIds: ['cafe_order'] }), lastEase: 'hard' }),
    ).toBe('with_help');
    expect(
      stageFor('cafe_order', {
        evidence: evidence({ studiedIds: ['cafe_order'] }),
        lastEase: 'easy',
      }),
    ).toBe('solo');
  });
});

describe('today’s session is composed, not browsed', () => {
  it('caps review at ten and puts it before the next situation', () => {
    const plan = composeSession({
      level: 'A1',
      evidence: evidence(),
      dueReviewCount: 37,
      titles: { first_greetings: 'أول تحية' },
    });
    expect(plan.reviewCount).toBe(REVIEW_SESSION_CAP);
    expect(plan.steps[0]).toMatchObject({ kind: 'review', minutes: reviewMinutes(REVIEW_SESSION_CAP) });
    expect(plan.steps[1]).toMatchObject({
      kind: 'scenario',
      scenarioId: 'first_greetings',
      stage: 'study',
      titleAr: 'أول تحية',
    });
    expect(plan.totalMinutes).toBe(plan.steps.reduce((total, step) => total + step.minutes, 0));
  });

  it('omits review when nothing is due and never previews more than two scenes', () => {
    const plan = composeSession({ level: 'A1', evidence: evidence(), dueReviewCount: 0 });
    expect(plan.steps.every((step) => step.kind !== 'review')).toBe(true);
    expect(plan.steps.filter((step) => step.kind === 'scenario').length).toBeLessThanOrEqual(2);
  });
});

describe('the post-session offer is honest and never a question up front', () => {
  it('offers a short test-out above 85 and a repeat with help below 50', () => {
    expect(sessionOutcomeOffer(86)).toBe('test_out');
    expect(sessionOutcomeOffer(85)).toBeNull();
    expect(sessionOutcomeOffer(50)).toBeNull();
    expect(sessionOutcomeOffer(49)).toBe('repeat_help');
    expect(sessionOutcomeOffer(null)).toBeNull();
    expect(sessionOutcomeOffer(Number.NaN)).toBeNull();
  });
});

describe('unit progress is derived from completed scenarios', () => {
  it('marks the first unfinished unit current and locks beyond the next', () => {
    const progress = buildUnitProgress({ completedIds: [], level: 'A1' });
    const current = progress.findIndex((entry) => entry.current);
    expect(current).toBe(0);
    expect(progress[0]).toMatchObject({ done: 0, total: 6, locked: false, finished: false });
    expect(progress[1].locked).toBe(false);
    expect(progress[2].locked).toBe(true);
  });

  it('moves the current unit forward as scenarios complete', () => {
    const firstUnit = UNITS[0];
    const progress = buildUnitProgress({ completedIds: firstUnit.scenarioIds, level: 'A1' });
    expect(progress[0].finished).toBe(true);
    expect(progress[0].current).toBe(false);
    expect(progress[1].current).toBe(true);
    expect(progress[1].locked).toBe(false);
  });

  it('finishes the path without locking the last unit when everything is done', () => {
    const progress = buildUnitProgress({ completedIds: servedIds, level: 'A1' });
    expect(progress.every((entry) => entry.finished)).toBe(true);
    expect(progress.every((entry) => !entry.locked)).toBe(true);
  });

  it('maps an existing learner onto the units without resetting level or progress', () => {
    // A returning learner's sessions already name scenario ids. Those ids are
    // the whole migration: completed units stay done and the measured level
    // still decides where the open unit is.
    const done = [...UNITS[0].scenarioIds, ...UNITS[1].scenarioIds];
    const progress = buildUnitProgress({ completedIds: done, level: 'A2' });
    expect(progress[0].done).toBe(UNITS[0].scenarioIds.length);
    expect(progress[1].done).toBe(UNITS[1].scenarioIds.length);
    expect(progress[0].finished).toBe(true);
    expect(progress[1].finished).toBe(true);
    const current = progress.find((entry) => entry.current);
    expect(current?.unit.level).toBe('A2');
    expect(current?.done).toBe(0);
  });
});

describe('the conversation offers topics, never a level', () => {
  const SCREEN = readFileSync('src/features/conversation/LiveConversationScreen.tsx', 'utf8');

  it('keeps the level out of the main flow and offers unit topics instead', () => {
    expect(SCREEN).not.toMatch(/nudge-difficulty|change-level|level-selector/i);
    expect(SCREEN).toMatch(/data-testid="topic-choices"/);
    expect(SCREEN).toMatch(/فاجئني/);
  });
});
