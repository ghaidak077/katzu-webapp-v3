import { describe, expect, it } from 'vitest';
import { scenarioToVocabTopic, safetyDisclaimerFor, SCENARIO_CATEGORY_TO_TOPIC } from '@/lib/utils/scenarioVocab';
import { vocabularyWithinLevelRadius } from '@/lib/utils/scenarioVocab';
import { goalMatchScore } from '@/lib/onboarding/preferences';
import { PERSONA_ROLES, buildStorySetup } from '@/lib/journey/story';
import { missionReasonAr } from '@/lib/journey/context';
import { sceneFor } from '@/lib/design/scenes';
import type { ScenarioEntity } from '@/types/models';

/**
 * The six silent-failure classes (docs/agent/LESSONS.md), asserted GENERICALLY
 * for every category in SCENARIO_CATEGORY_TO_TOPIC — including the six V23
 * additions (basics, exam, study, visa, services, trades). The point of the
 * generic shape: the next category added must satisfy the same six assertions
 * or the test fails, so a new module can never ship half-wired again.
 *
 *   1. empty Study screen        — category must map to a topic (vocab reachable)
 *  2. vocab with no phrase/opener — the mapped topic must be a real string the
 *     Study join can query (non-empty, stable)
 *  3. grammar with no scenario   — scenario renders with the topic; grammar is
 *     global, so the real assertion is that the scenario itself is usable
 *  4. persona with no role label — every persona keyword set must resolve; new
 *     categories ship persona keywords that resolve to a REAL role, not fallback
 *  5. category never prioritised for a goal — the exam goal must be able to see
 *     exam-category content (goalMatchScore > 0) for the categories that claim
 *     to serve a goal
 *  6. missing safety disclaimer  — sensitive categories (health/official/
 *     housing/visa/exam) must produce a non-empty disclaimer
 */

const ALL_CATEGORIES = Object.keys(SCENARIO_CATEGORY_TO_TOPIC);

const NEW_CATEGORIES = ['basics', 'exam', 'study', 'visa', 'services', 'trades'];

function scenarioOf(category: string, id: string): ScenarioEntity {
  return {
    id,
    title_de: `Test ${category}`,
    title_ar: `اختبار ${category}`,
    ai_persona: category === 'exam' ? 'Prüfungspartner katze' : 'Test katze',
    category,
    icon: 'message-square',
    initial_message_a1: 'Hallo!',
    initial_message_a2: 'Hallo!',
    initial_message_b1: 'Hallo!',
    initial_message_b2: 'Hallo!',
  };
}

describe('new categories are wired end to end (six silent-failure classes)', () => {
  it('covers exactly the six V23 categories in the map', () => {
    for (const category of NEW_CATEGORIES) {
      expect(ALL_CATEGORIES).toContain(category);
    }
  });

  it('class 1 — every category maps to a non-empty topic (no empty Study screen)', () => {
    for (const category of ALL_CATEGORIES) {
      expect(scenarioToVocabTopic(scenarioOf(category, `test_${category}`)), category).not.toBe('');
    }
  });

  it('class 2 — each mapping value is a real topic string the Study join can query', () => {
    for (const [category, topic] of Object.entries(SCENARIO_CATEGORY_TO_TOPIC)) {
      expect(topic, category).toBeTruthy();
      expect(topic, category).toMatch(/^[a-z_]+$/);
      expect(topic, category).toBe(SCENARIO_CATEGORY_TO_TOPIC[category]);
    }
  });

  it('class 3 — new-category scenarios produce a usable scene (grammar screens need a scenario)', () => {
    for (const category of NEW_CATEGORIES) {
      const scene = sceneFor({ id: `test_${category}`, category });
      expect(scene.locationAr, category).toBeTruthy();
      expect(scene.locationAr, category).not.toBe('');
    }
  });

  it('class 4 — exam/study/visa/trades personas resolve to real role labels, not the fallback', () => {
    const roleFor = (persona: string) => {
      const value = persona.toLowerCase();
      const match = PERSONA_ROLES.find((entry) => entry.keywords.some((k) => value.includes(k)));
      return match?.roleAr || '';
    };
    expect(roleFor('Prüfungspartner katze')).toContain('ممتحن');
    expect(roleFor('Dozent katze')).toContain('أستاذ');
    expect(roleFor('Visum katze')).toContain('التأشيرات');
    expect(roleFor('Handwerker katze')).toContain('حرفي');
    // The generic persona strings used by the other two categories still map.
    expect(roleFor('Beamter katze')).toBeTruthy();
    expect(roleFor('Barista katze')).toBeTruthy();
  });

  it('class 5 — new categories are reachable by at least one learner goal', () => {
    const goalPriorities: Array<Parameters<typeof goalMatchScore>[1]> = ['daily_life', 'work', 'university', 'exam'];
    for (const category of NEW_CATEGORIES) {
      const best = Math.max(...goalPriorities.map((goal) => goalMatchScore(category, goal)));
      expect(best, `${category} must match at least one goal`).toBeGreaterThan(0);
    }
    // The exam goal must prioritise dedicated exam content above generic content.
    expect(goalMatchScore('exam', 'exam')).toBeGreaterThan(goalMatchScore('food', 'exam'));
    // `visa` has its own keyword on the work and university goals — it must not
    // fall to generic order, and visa-adjacent ids keep matching (loose contains).
    expect(goalMatchScore('visa', 'work')).toBeGreaterThan(0);
    expect(goalMatchScore('visa_appointment', 'university')).toBeGreaterThan(0);
    expect(goalMatchScore('trades', 'work')).toBeGreaterThan(0);
    expect(goalMatchScore('services', 'daily_life')).toBeGreaterThan(0);
    expect(goalMatchScore('basics', 'daily_life')).toBeGreaterThan(0);
    expect(goalMatchScore('study', 'university')).toBeGreaterThan(0);
  });

  it('class 6 — sensitive categories always produce a safety disclaimer (UI + worker agree)', () => {
    const sensitive = ['health', 'official', 'housing', 'visa', 'exam'];
    for (const category of sensitive) {
      expect(safetyDisclaimerFor(scenarioOf(category, `test_${category}`)), category).not.toBe('');
    }
    // Visa keeps its own wording (immigration is the highest-stakes disclaimer).
    expect(safetyDisclaimerFor(scenarioOf('visa', 'botschaft_visum'))).toContain('تأشيرات');
    // Exam practice must disclaim that it is NOT the official exam.
    expect(safetyDisclaimerFor(scenarioOf('exam', 'dtz_sprechen'))).toContain('ليس الامتحان الرسمي');
    // Everyday categories stay disclaimer-free — a warning on a café scene is noise.
    for (const category of ['daily_life', 'travel', 'work', 'basics', 'study', 'services', 'trades']) {
      expect(safetyDisclaimerFor(scenarioOf(category, `test_${category}`)), category).toBe('');
    }
  });

  it('level window keeps new-topic vocabulary reachable (D5 interplay)', () => {
    const pool = [
      { id: 1, level: 'A1', topic: 'exam' },
      { id: 2, level: 'B2', topic: 'exam' },
    ];
    expect(vocabularyWithinLevelRadius(pool, 'A1').map((r) => r.id)).toEqual([1]);
  });

  it('story setup renders for a new-category scenario with a role label (persona class, end to end)', () => {
    const story = buildStorySetup({
      scenario: scenarioOf('exam', 'dtz_sprechen'),
      level: 'B1',
      locationAr: sceneFor({ id: 'dtz_sprechen', category: 'exam' }).locationAr,
      whyAr: missionReasonAr(
        { kind: 'daily' } as Parameters<typeof missionReasonAr>[0],
        { goal: 'exam' },
        { id: 'dtz_sprechen', category: 'exam' },
      ),
    });
    expect(story.whoAr).toBeTruthy();
    expect(story.whoAr).not.toBe('شخص ألماني في هذا الموقف');
    expect(story.whyAr).toContain('الامتحان');
  });
});
