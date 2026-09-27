import { describe, expect, it } from 'vitest';
import {
  CHAPTER_SIZE,
  buildJourneyContext,
  katzuJourneyLineAr,
  missionReasonAr,
  situationAr,
  type JourneyInput,
} from '../src/lib/journey/context';
import { PERSONA_ROLES, buildStorySetup, openingFor } from '../src/lib/journey/story';
import { buildGuidedPractice, gradeRepeat, gradeTypedProduction } from '../src/lib/journey/practice';
import { TURNS_BY_MODE, planTurns, turnPlanForLevel } from '../src/lib/conversation/turnPlan';
import type { DailyMissionPlan } from '../src/lib/mission/selectMission';
import type { ScenarioEntity, StarterPhraseEntity, VocabularyEntity } from '../src/types/models';

const now = new Date('2026-09-27T10:00:00').getTime();
const DAY = 86_400_000;

function scenario(overrides: Partial<ScenarioEntity> = {}): ScenarioEntity {
  return {
    id: 'cafe_order',
    title_de: 'Im Café bestellen',
    title_ar: 'الطلب في المقهى',
    ai_persona: 'Barista katze',
    category: 'food',
    icon: 'coffee',
    initial_message_a1: 'Guten Tag! Was möchten Sie trinken?',
    initial_message_a2: 'Guten Tag! Was darf ich Ihnen bringen?',
    initial_message_b1: 'Guten Tag, was darf es für Sie sein?',
    initial_message_b2: '',
    ...overrides,
  } as ScenarioEntity;
}

function phrase(overrides: Partial<StarterPhraseEntity> = {}): StarterPhraseEntity {
  return {
    id: 1,
    scenario_id: 'cafe_order',
    level: 'A1',
    german: 'Ich möchte einen Kaffee, bitte.',
    translation_en: 'I would like a coffee, please.',
    translation_ar: 'أريد قهوة، من فضلك.',
    sort_order: 1,
    ...overrides,
  } as StarterPhraseEntity;
}

function word(overrides: Partial<VocabularyEntity> = {}): VocabularyEntity {
  return {
    id: 1,
    german: 'Termin',
    article: 'der',
    part_of_speech: 'Noun',
    translation_ar: 'موعد',
    translation_en: 'appointment',
    example_de: 'Ich habe morgen einen Termin.',
    example_ar: 'لدي موعد غداً.',
    example_en: 'I have an appointment tomorrow.',
    level: 'A1',
    topic: 'food',
    ...overrides,
  } as VocabularyEntity;
}

function plan(overrides: Partial<DailyMissionPlan> = {}): DailyMissionPlan {
  return {
    kind: 'daily',
    scenarioId: 'cafe_order',
    titleDe: 'Im Café bestellen',
    titleAr: 'الطلب في المقهى',
    subtitleAr: '',
    ctaAr: 'ابدأ',
    estimatedMinutes: 7,
    ...overrides,
  };
}

function journeyInput(overrides: Partial<JourneyInput> = {}): JourneyInput {
  return {
    scenarios: [scenario()],
    training: [],
    sessions: [],
    reviewDueCount: 0,
    independentScenarioIds: [],
    level: 'A1',
    now,
    ...overrides,
  };
}

describe('buildJourneyContext', () => {
  it('counts days in calendar days, not 24-hour windows', () => {
    // 23:30 yesterday → 08:00 today is two calendar days, one of them "ago".
    const late = new Date('2026-09-26T23:30:00').getTime();
    const context = buildJourneyContext(journeyInput({ sessions: [{ timestamp: late }] }));
    expect(context.dayNumber).toBe(2);
    expect(context.daysSinceLastSession).toBe(1);
  });

  it('reports the first run honestly when nothing was ever recorded', () => {
    const context = buildJourneyContext(journeyInput());
    expect(context.isFirstRun).toBe(true);
    expect(context.dayNumber).toBe(1);
    expect(context.daysSinceLastSession).toBe(0);
    expect(context.isAllCaughtUp).toBe(false);
  });

  it('opens a chapter on the first scenario that is not yet independent', () => {
    const scenarios = ['a', 'b', 'c', 'd'].map((id) => scenario({ id, category: 'food' }));
    const context = buildJourneyContext(
      journeyInput({ scenarios, independentScenarioIds: ['a', 'b', 'c'] }),
    );
    // Four scenarios, three independent: chapter 1 is full, chapter 2 holds `d`.
    expect(CHAPTER_SIZE).toBe(3);
    expect(context.chapterIndex).toBe(2);
    expect(context.chapterSegments).toBe(1);
    expect(context.chapterSegmentsDone).toBe(0);
    expect(context.activeSegment).toBe(0);
    expect(context.isAllCaughtUp).toBe(false);
  });

  it('marks the chapter complete when every segment in it is independent', () => {
    const scenarios = ['a', 'b', 'c'].map((id) => scenario({ id, category: 'food' }));
    const context = buildJourneyContext(
      journeyInput({ scenarios, independentScenarioIds: ['a', 'b', 'c'] }),
    );
    expect(context.chapterSegmentsDone).toBe(CHAPTER_SIZE);
    expect(context.activeSegment).toBeUndefined();
    expect(context.isAllCaughtUp).toBe(true);
  });

  it('never claims "all caught up" while review is still due', () => {
    const scenarios = ['a'].map((id) => scenario({ id, category: 'food' }));
    const context = buildJourneyContext(
      journeyInput({ scenarios, independentScenarioIds: ['a'], reviewDueCount: 4 }),
    );
    expect(context.isAllCaughtUp).toBe(false);
  });
});

describe('missionReasonAr', () => {
  it('explains a review mission with the real number of items', () => {
    const reason = missionReasonAr(plan({ kind: 'review', dueCount: 1 }), {});
    expect(reason).toContain('عنصر واحد');
    expect(missionReasonAr(plan({ kind: 'review', dueCount: 6 }), {})).toContain('6');
  });

  it('ties a daily mission to the situation the scenario actually trains', () => {
    expect(missionReasonAr(plan(), {}, { category: 'health' })).toContain('العيادة');
    expect(missionReasonAr(plan(), {}, { category: 'housing' })).toContain('الأسئلة');
    // No category → a real situation, never generic praise.
    expect(missionReasonAr(plan(), {}, null)).toContain('موقف حقيقي');
  });

  it('tells the learner to go online when no content is cached', () => {
    expect(missionReasonAr(plan({ kind: 'no_content' }), {})).toContain('اتصال');
  });
});

describe('katzuJourneyLineAr', () => {
  const firstRun = buildJourneyContext(journeyInput());
  // Active learner: practised yesterday, one scenario still open, review clean.
  const active = buildJourneyContext(
    journeyInput({ sessions: [{ timestamp: now - DAY }] }),
  );

  it('says nothing when no state actually applies', () => {
    expect(
      katzuJourneyLineAr({ context: active, plan: plan({ kind: 'new' }), offline: false, cachedMission: false }),
    ).toBeNull();
  });

  it('distinguishes offline-with-cache from offline-with-nothing', () => {
    expect(katzuJourneyLineAr({ context: firstRun, plan: plan(), offline: true, cachedMission: true })).toContain('محفوظة');
    expect(katzuJourneyLineAr({ context: firstRun, plan: plan(), offline: true, cachedMission: false })).toContain('لا توجد مهمة');
  });

  it('marks the very first mission as such', () => {
    expect(
      katzuJourneyLineAr({ context: firstRun, plan: plan(), offline: false, cachedMission: false }),
    ).toContain('أول مهمة');
  });

  it('greets a returning learner with the real number of days away', () => {
    const returning = buildJourneyContext(
      journeyInput({ sessions: [{ timestamp: now - 4 * DAY }] }),
    );
    expect(
      katzuJourneyLineAr({ context: returning, plan: plan(), offline: false, cachedMission: false }),
    ).toContain('4');
  });
});

describe('openingFor', () => {
  it('uses the learner\'s own level when the content has it', () => {
    expect(openingFor(scenario(), 'B1')).toEqual({
      text: 'Guten Tag, was darf es für Sie sein?',
      level: 'B1',
    });
  });

  it('falls back below the learner\'s level rather than starting the episode empty', () => {
    expect(openingFor(scenario(), 'B2')).toEqual({
      text: 'Guten Tag, was darf es für Sie sein?',
      level: 'B1',
    });
  });

  it('reports the level it actually used when only an easier opener exists', () => {
    const onlyA1 = scenario({ initial_message_a2: '', initial_message_b1: '' });
    expect(openingFor(onlyA1, 'B2')).toEqual({
      text: 'Guten Tag! Was möchten Sie trinken?',
      level: 'A1',
    });
  });
});

describe('buildStorySetup', () => {
  it('names the person the learner will actually talk to', () => {
    const setup = buildStorySetup({
      scenario: scenario(),
      level: 'A1',
      locationAr: 'مقهى في برلين',
      whyAr: 'موقف يومي',
    });
    expect(setup.whoAr).toBe('عامل المقهى');
    expect(setup.locationAr).toBe('مقهى في برلين');
    expect(setup.openingDe).toContain('trinken');
    expect(setup.whyAr).toBe('موقف يومي');
  });

  it('falls back to a generic role instead of inventing a persona', () => {
    const setup = buildStorySetup({
      scenario: scenario({ ai_persona: 'unbekannt katze' }),
      level: 'A1',
      locationAr: 'برلين',
      whyAr: 'موقف',
    });
    expect(setup.whoAr).toBe('شخص ألماني في هذا الموقف');
  });

  it('says something different when the learner returns to an open episode', () => {
    const base = { scenario: scenario(), level: 'A1' as const, locationAr: 'المقهى', whyAr: 'سبب' };
    expect(buildStorySetup(base).situationAr).toContain('يقترب منك');
    expect(buildStorySetup({ ...base, returning: true }).situationAr).toContain('من حيث توقفت');
  });

  it('maps every known persona to a role, not to filler', () => {
    for (const persona of PERSONA_ROLES) {
      // Personas are authored as "<Rolle> katze" (see the content schema).
      const setup = buildStorySetup({
        scenario: scenario({ ai_persona: `${persona.keywords[0]} katze` }),
        level: 'A1',
        locationAr: 'مكان',
        whyAr: 'سبب',
      });
      expect(setup.whoAr).toBe(persona.roleAr);
    }
  });
});

describe('buildGuidedPractice', () => {
  it('caps the deck at three cards so the screen stays short', () => {
    const phrases = [1, 2, 3, 4, 5].map((id) => phrase({ id, german: `Satz Nummer ${id}` }));
    const practice = buildGuidedPractice({ phrases, vocabulary: [], level: 'A1' });
    expect(practice.cards).toHaveLength(3);
    expect(practice.empty).toBe(false);
  });

  it('drops duplicate German lines instead of padding the deck', () => {
    const practice = buildGuidedPractice({
      phrases: [phrase({ id: 1 }), phrase({ id: 2, sort_order: 2 })],
      vocabulary: [],
      level: 'A1',
    });
    expect(practice.cards).toHaveLength(1);
  });

  it('is empty, not fabricated, when the device has no usable content', () => {
    const practice = buildGuidedPractice({ phrases: [], vocabulary: [], level: 'A1' });
    expect(practice).toEqual({ cards: [], retrieval: null, listening: null, empty: true });
  });

  it('tests retrieval on the card the learner just read, and listens to the longest line', () => {
    const practice = buildGuidedPractice({
      phrases: [
        phrase({ id: 1, german: 'Ja.', translation_ar: 'نعم.', sort_order: 1 }),
        phrase({
          id: 2,
          german: 'Ich möchte einen Kaffee mit Milch, bitte.',
          translation_ar: 'أريد قهوة بالحليب، من فضلك.',
          sort_order: 2,
        }),
      ],
      vocabulary: [],
      level: 'A1',
    });
    expect(practice.retrieval?.answerDe).toBe('Ja.');
    expect(practice.listening?.de).toBe('Ich möchte einen Kaffee mit Milch, bitte.');
  });

  it('prefers the learner\'s own level and never leaves them with nothing', () => {
    const practice = buildGuidedPractice({
      phrases: [
        phrase({ id: 1, level: 'B1', german: 'B1 Satz', sort_order: 1 }),
        phrase({ id: 2, level: 'A1', german: 'A1 Satz', sort_order: 2 }),
      ],
      vocabulary: [],
      level: 'A1',
    });
    expect(practice.cards[0].level).toBe('A1');
    expect(practice.cards).toHaveLength(2);
  });

  it('teaches a word as a usable sentence when the content carries an example', () => {
    const practice = buildGuidedPractice({ phrases: [], vocabulary: [word()], level: 'A1' });
    expect(practice.cards[0].de).toBe('Ich habe morgen einen Termin.');
    expect(practice.cards[0].noteAr).toContain('der Termin');
  });
});

describe('graders', () => {
  it('grades a typed production through the review engine, not local string logic', () => {
    expect(gradeTypedProduction('Ich möchte einen Kaffee.', 'ich moechte einen kaffee').verdict).toBe('correct');
    expect(gradeTypedProduction('der Termin', 'Termin').verdict).toBe('close');
  });

  it('reports word coverage for a repeat, never pronunciation quality', () => {
    const result = gradeRepeat('Ich möchte einen Kaffee bitte', 'ich möchte einen kaffee');
    expect(result.matched).toBeLessThan(result.total);
    expect(result.messageAr).toContain(`${result.matched} من ${result.total}`);
    // A perfect repeat says what was heard, not how well it was pronounced.
    expect(gradeRepeat('Ja', 'ja').messageAr).toContain('كل الكلمات');
  });
});

describe('turnPlan', () => {
  it('gives A1 the shortest conversation and B2 the longest, per mode', () => {
    expect(planTurns('quick', 'A1')).toBe(3);
    expect(planTurns('quick', 'B2')).toBe(6);
    expect(planTurns('immersion', 'A1')).toBe(8);
    expect(planTurns('immersion', 'B2')).toBe(10);
  });

  it('is monotonic: a harder level never gets fewer turns', () => {
    for (const mode of ['quick', 'immersion'] as const) {
      const levels = Object.keys(TURNS_BY_MODE[mode]) as Array<keyof (typeof TURNS_BY_MODE)['quick']>;
      for (let i = 1; i < levels.length; i += 1) {
        expect(planTurns(mode, levels[i])).toBeGreaterThanOrEqual(planTurns(mode, levels[i - 1]));
      }
    }
  });

  it('offers both modes for the chooser, shortest first', () => {
    const options = turnPlanForLevel('A1');
    expect(options[0]).toEqual({ mode: 'quick', turns: 3 });
    expect(options[1]).toEqual({ mode: 'immersion', turns: 8 });
  });
});

describe('situationAr', () => {
  it('describes where the learner actually is, or what they are preparing for', () => {
    expect(situationAr({ arrivalStatus: 'living_in_germany' })).toBe('أنت في ألمانيا بالفعل');
    expect(situationAr({ arrivalStatus: 'recently_arrived' })).toBe('وصلت حديثاً');
    expect(situationAr({ goal: 'exam' })).toBe('لديك امتحان قادم');
    expect(situationAr({})).toBe('أنت في طريقك إلى ألمانيا');
  });
});
