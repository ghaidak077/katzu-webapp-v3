import { describe, expect, it } from 'vitest';
import {
  INTRO_SCENARIO_ID,
  selectDailyMission,
  type MissionInput,
  type ScenarioLevelIndex,
} from '../src/lib/mission/selectMission';

const scenarios = [
  { id: 'bakery_shopping', title_de: 'Beim Bäcker', title_ar: 'عند الخباز', category: 'daily_life' },
  { id: 'doctor_visit', title_de: 'Beim Arzt', title_ar: 'عند الطبيب', category: 'health' },
  { id: 'job_interview', title_de: 'Vorstellungsgespräch', title_ar: 'مقابلة عمل', category: 'work' },
  { id: 'uni_enrollment', title_de: 'Immatrikulation', title_ar: 'التسجيل الجامعي', category: 'university' },
];

const a1Only: ScenarioLevelIndex = { bakery_shopping: ['A1'], doctor_visit: ['A1'], job_interview: ['A1'] };
const mixed: ScenarioLevelIndex = {
  bakery_shopping: ['A1'],
  doctor_visit: ['A1', 'A2'],
  job_interview: ['A2', 'B1'],
  uni_enrollment: ['B1', 'B2'],
};

function base(overrides: Partial<MissionInput>): MissionInput {
  return {
    level: 'A1',
    goal: null,
    scenarios,
    training: [],
    reviewItems: [],
    scenarioLevels: a1Only,
    dailyMinutes: 10,
    now: new Date(2026, 8, 26).getTime(),
    ...overrides,
  };
}

/** The same catalogue plus the story's opening scene. */
const withOpening = [
  { id: INTRO_SCENARIO_ID, title_de: 'Am Flughafen ankommen', title_ar: 'الوصول إلى المطار', category: 'travel' },
  ...scenarios,
];
const levelsWithOpening: ScenarioLevelIndex = { ...a1Only, [INTRO_SCENARIO_ID]: ['A1'] };

describe('daily mission selection', () => {
  it('review-due items take priority over any new mission', () => {
    const plan = selectDailyMission(
      base({
        reviewItems: [
          { dueAt: new Date(2026, 8, 25).getTime(), kind: 'vocab' },
          { dueAt: new Date(2026, 8, 26).getTime(), kind: 'mistake' },
        ],
      }),
    );
    expect(plan.kind).toBe('review');
    expect(plan.dueCount).toBe(2);
    expect(plan.scenarioId).toBeUndefined();
  });

  // V31: the CTA used to read "راجع 2 الآن" — a bare digit with no noun, asking
  // the learner to review two of something unspecified. It now names the item in
  // the dual ("راجع عنصرين"), so these assert the requirement (the CTA says WHAT
  // and agrees with the count) rather than the old string's shape.
  it('the review CTA names the item and agrees with the count of two', () => {
    const plan = selectDailyMission(
      base({
        reviewItems: [
          { dueAt: new Date(2026, 8, 25).getTime(), kind: 'vocab' },
          { dueAt: new Date(2026, 8, 26).getTime(), kind: 'mistake' },
        ],
      }),
    );
    expect(plan.ctaAr).toBe('راجع عنصرين الآن');
    expect(plan.ctaAr).not.toMatch(/\d/);
  });

  it('the review CTA uses the agreeing plural from three up', () => {
    const plan = selectDailyMission(
      base({
        reviewItems: [
          { dueAt: new Date(2026, 8, 25).getTime(), kind: 'vocab' },
          { dueAt: new Date(2026, 8, 26).getTime(), kind: 'mistake' },
          { dueAt: new Date(2026, 8, 25).getTime(), kind: 'phrase' },
        ],
      }),
    );
    expect(plan.dueCount).toBe(3);
    expect(plan.ctaAr).toBe('راجع 3 عناصر الآن');
    expect(plan.subtitleAr).toContain('3 عناصر');
  });

  it('the review CTA uses the singular for exactly one', () => {
    const plan = selectDailyMission(
      base({ reviewItems: [{ dueAt: new Date(2026, 8, 25).getTime(), kind: 'vocab' }] }),
    );
    expect(plan.ctaAr).toBe('راجع عنصراً الآن');
  });

  it('ignores review items that are not due yet', () => {
    const plan = selectDailyMission(
      base({ reviewItems: [{ dueAt: new Date(2027, 0, 1).getTime(), kind: 'vocab' }] }),
    );
    expect(plan.kind).not.toBe('review');
  });

  it('gives an A1 learner A1 content', () => {
    const plan = selectDailyMission(base({}));
    expect(plan.kind).toBe('daily');
    expect(a1Only[plan.scenarioId as keyof typeof a1Only]).toContain('A1');
  });

  it('does not send an A2 learner to an A1-only scenario when A2 content exists', () => {
    const plan = selectDailyMission(base({ level: 'A2', scenarioLevels: mixed, goal: null }));
    const levels = mixed[plan.scenarioId as keyof typeof mixed] || [];
    expect(levels).toContain('A2');
  });

  it('prioritises work-related scenarios for a work goal', () => {
    const plan = selectDailyMission(base({ level: 'A2', scenarioLevels: mixed, goal: 'work' }));
    expect(plan.scenarioId).toBe('job_interview');
  });

  it('prioritises the learner\'s goal among daily candidates', () => {
    const plan = selectDailyMission(base({ goal: 'exam' }));
    // Exam preparation accepts every real-life topic; the rotation stays inside
    // the goal-matched set, so the choice must be one of the known scenarios.
    expect(plan.kind).toBe('daily');
    expect(scenarios.some((scenario) => scenario.id === plan.scenarioId)).toBe(true);
  });

  it('continues an unfinished scenario before starting anything new', () => {
    const plan = selectDailyMission(
      base({
        training: [
          { scenarioId: 'doctor_visit', studiedAt: 1_700_000_000_000, quizAttempted: false, lastScore: 0 },
        ],
      }),
    );
    expect(plan.kind).toBe('continue');
    expect(plan.scenarioId).toBe('doctor_visit');
    expect(plan.ctaAr).toBe('أكمل من حيث توقفت');
  });

  it('treats a failed quiz as unfinished work', () => {
    const plan = selectDailyMission(
      base({
        training: [
          { scenarioId: 'bakery_shopping', studiedAt: 1_700_000_000_000, quizAttempted: true, lastScore: 40 },
        ],
      }),
    );
    expect(plan.kind).toBe('continue');
    expect(plan.scenarioId).toBe('bakery_shopping');
  });

  it('moves on once a scenario is passed', () => {
    const plan = selectDailyMission(
      base({
        training: [
          { scenarioId: 'bakery_shopping', studiedAt: 1_700_000_000_000, quizAttempted: true, lastScore: 90 },
        ],
      }),
    );
    expect(plan.kind).toBe('daily');
  });

  it('uses the weakest measured skill only when one was supplied', () => {
    const plan = selectDailyMission(
      base({
        weakestSkill: { skill: 'listening', labelAr: 'الاستماع', actionAr: 'ابدأ تدريب الاستماع' },
      }),
    );
    expect(plan.kind).toBe('weak_skill');
    expect(plan.ctaAr).toBe('ابدأ تدريب الاستماع');
  });

  it('opens the story at the arrival scene, before any rotation', () => {
    // A work goal is the harder case: the goal weighting would prefer the
    // interview, and the first episode must still be the arrival.
    const plan = selectDailyMission(
      base({ scenarios: withOpening, scenarioLevels: levelsWithOpening, goal: 'work' }),
    );
    expect(plan.kind).toBe('daily');
    expect(plan.scenarioId).toBe(INTRO_SCENARIO_ID);
    expect(plan.ctaAr).toContain('الوصول');
    expect(plan.titleAr).toBe('الوصول إلى المطار');
  });

  it('offers the opening only until it has been started', () => {
    const plan = selectDailyMission(
      base({
        scenarios: withOpening,
        scenarioLevels: levelsWithOpening,
        goal: 'work',
        training: [
          { scenarioId: INTRO_SCENARIO_ID, studiedAt: 1_700_000_000_000, quizAttempted: true, lastScore: 90 },
        ],
      }),
    );
    expect(plan.kind).toBe('daily');
    expect(plan.scenarioId).not.toBe(INTRO_SCENARIO_ID);
  });

  it('falls through to the normal rotation when the opening is not in the content', () => {
    // Offline, or a deployment whose D1 does not carry the scene yet.
    const plan = selectDailyMission(base({}));
    expect(plan.kind).toBe('daily');
    expect(scenarios.some((scenario) => scenario.id === plan.scenarioId)).toBe(true);
  });

  it('returns an honest empty state instead of crashing on empty content', () => {
    const plan = selectDailyMission(base({ scenarios: [], scenarioLevels: {} }));
    expect(plan.kind).toBe('no_content');
    expect(plan.subtitleAr).toContain('المحتوى');
    expect(plan.scenarioId).toBeUndefined();
  });

  it('produces a valid plan offline, when only cached scenarios exist', () => {
    // Offline means: no fresh content fetch, but the Dexie cache is present.
    const plan = selectDailyMission(base({ scenarios: scenarios.slice(0, 2), scenarioLevels: a1Only }));
    expect(plan.kind).toBe('daily');
    expect(plan.scenarioId).toBeTruthy();
  });

  it('is deterministic for the same learner state and date', () => {
    const input = base({ goal: 'daily_life' });
    const first = selectDailyMission(input);
    const second = selectDailyMission(input);
    expect(second).toEqual(first);
  });

  it('respects the learner\'s daily time in the estimate', () => {
    const shortPlan = selectDailyMission(base({ dailyMinutes: 5 }));
    const longPlan = selectDailyMission(base({ dailyMinutes: 20 }));
    expect(shortPlan.estimatedMinutes).toBe(5);
    expect(longPlan.estimatedMinutes).toBe(15);
  });

  it('makes due-review estimates honest for a small queue', () => {
    const plan = selectDailyMission(
      base({
        dailyMinutes: 20,
        reviewItems: [{ dueAt: 0, kind: 'vocab' }, { dueAt: 0, kind: 'phrase' }],
      }),
    );
    expect(plan.kind).toBe('review');
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(5);
  });
});
