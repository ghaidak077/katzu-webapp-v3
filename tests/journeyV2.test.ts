import { describe, expect, it } from 'vitest';
import {
  CHAPTER_SIZE,
  buildJourneyContext,
  katzuJourneyLineAr,
  missionReasonAr,
  situationAr,
  type JourneyInput,
} from '../src/lib/journey/context';
import { PERSONA_ROLES, buildStorySetup, learnerName, openingFor } from '../src/lib/journey/story';
import { buildGuidedPractice, gradeRepeat, gradeTypedProduction, selectGrammarRule } from '../src/lib/journey/practice';
import { SESSION_MODE_COPY, sessionTurnCap } from '../src/lib/conversation/turnPlan';
import { INTRO_SCENARIO_ID, type DailyMissionPlan } from '../src/lib/mission/selectMission';
import type { GrammarEntity, ScenarioEntity, StarterPhraseEntity, VocabularyEntity } from '../src/types/models';

const now = new Date('2026-09-27T10:00:00').getTime();
const DAY = 86_400_000;
/** Day 0 of the mission epoch — an even rotation index, so pool order is observable. */
const dayZero = new Date(2026, 0, 1).getTime();

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

function rule(overrides: Partial<GrammarEntity> = {}): GrammarEntity {
  return {
    id: 'g_articles_a1',
    title_ar: 'أدوات التعريف (der, die, das)',
    rule_de: 'Bestimmte Artikel: der (maskulin), die (feminin), das (neutral).',
    rule_ar: 'لكل اسم جنس يجب حفظه مع الكلمة.',
    level: 'A1',
    explanation_ar: 'الأداة جزء من الكلمة، ليست تفصيلاً.',
    example_de: 'Der Kaffee ist lecker.',
    example_ar: 'القهوة لذيذة.',
    ...overrides,
  } as GrammarEntity;
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

  it('opens chapter 1 with the arrival scene even when the goal points elsewhere', () => {
    // Four scenarios, three of them work-related. Without the opening pinned to
    // the front, the goal weighting fills all of chapter 1 with work scenes and
    // pushes the arrival into chapter 2 — the story would no longer begin where
    // the learner's life in Germany begins.
    const scenarios = [
      scenario({ id: 'job_interview', category: 'work' }),
      scenario({ id: 'job_second', category: 'work' }),
      scenario({ id: 'job_third', category: 'work' }),
      scenario({ id: INTRO_SCENARIO_ID, category: 'travel' }),
    ];
    const context = buildJourneyContext(
      journeyInput({ scenarios, goal: 'work', independentScenarioIds: [INTRO_SCENARIO_ID] }),
    );
    expect(context.chapterIndex).toBe(1);
    expect(context.chapterSegments).toBe(3);
    // The arrival is segment 1, so it is already finished inside chapter 1.
    expect(context.chapterSegmentsDone).toBe(1);
    expect(context.activeSegment).toBe(1);
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

  it('names the arrival scene as the start of the story, not a daily situation', () => {
    const reason = missionReasonAr(
      plan({ scenarioId: INTRO_SCENARIO_ID }),
      { arrivalStatus: 'recently_arrived' },
      { id: INTRO_SCENARIO_ID, category: 'travel' },
    );
    expect(reason).toContain('المطار');
    expect(reason).not.toContain('ستستخدمها في المحطة');
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

  it('is empty, not fabricated, when the device has no usable content at all', () => {
    const practice = buildGuidedPractice({ phrases: [], vocabulary: [], level: 'A1' });
    expect(practice).toEqual({ cards: [], vocabularyContext: [], retrieval: null, listening: null, grammar: null, empty: true });
  });

  it('keeps a grammar rule useful on a device whose vocabulary is missing', () => {
    // No cards, but a real rule: a screen with nothing to drill would be a dead
    // end, and the rule is content the app actually holds.
    const practice = buildGuidedPractice({
      phrases: [],
      vocabulary: [],
      grammar: [rule()],
      level: 'A1',
      now: dayZero,
    });
    expect(practice.empty).toBe(false);
    expect(practice.cards).toHaveLength(0);
    expect(practice.grammar?.id).toBe('g_articles_a1');
  });

  it('carries today\'s rule on the deck it builds from real content', () => {
    const practice = buildGuidedPractice({
      phrases: [phrase()],
      vocabulary: [],
      grammar: [rule({ example_de: 'Ein anderer Satz.' })],
      level: 'A1',
      now: dayZero,
    });
    expect(practice.empty).toBe(false);
    expect(practice.grammar?.exampleDe).toBe('Ein anderer Satz.');
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

  it('passes a bounded, deduplicated vocabulary pool from real scenario content', () => {
    const vocabulary = Array.from({ length: 15 }, (_, index) => word({ id: index + 1, german: `Wort ${index}` }));
    vocabulary.push(word({ id: 16, german: 'Wort 0' }));
    vocabulary.push(word({ id: 17, german: 'x'.repeat(100) }));

    const practice = buildGuidedPractice({ phrases: [], vocabulary, level: 'A1' });

    expect(practice.vocabularyContext).toHaveLength(12);
    expect(practice.vocabularyContext[0]).toBe('Wort 0');
    expect(new Set(practice.vocabularyContext).size).toBe(12);
    expect(practice.vocabularyContext.every((term) => term.length <= 80)).toBe(true);
  });

  it('teaches a word as a usable sentence when the content carries an example', () => {
    const practice = buildGuidedPractice({ phrases: [], vocabulary: [word()], level: 'A1' });
    expect(practice.cards[0].de).toBe('Ich habe morgen einen Termin.');
    expect(practice.cards[0].noteAr).toContain('der Termin');
  });
});

describe('selectGrammarRule', () => {
  it('picks the rule nearest the learner\'s own level', () => {
    const rows = [rule({ id: 'g_a1', level: 'A1' }), rule({ id: 'g_b1', level: 'B1' })];
    expect(selectGrammarRule(rows, 'A1', { now: dayZero })?.id).toBe('g_a1');
    expect(selectGrammarRule(rows, 'B1', { now: dayZero })?.id).toBe('g_b1');
  });

  it('skips a rule whose example is already on the deck', () => {
    // Teaching the same sentence twice is padding, not reinforcement. Both
    // fallback rows stay at the learner's level — the level cap (next test)
    // must not change this behaviour.
    const rows = [
      rule({ id: 'g_a1', level: 'A1', example_de: 'Ich möchte einen Kaffee.' }),
      rule({ id: 'g_a2', level: 'A1', title_ar: 'قاعدة بديلة' }),
    ];
    const picked = selectGrammarRule(rows, 'A1', {
      now: dayZero,
      excludeGerman: ['ich moechte einen Kaffee'],
    });
    expect(picked?.id).toBe('g_a2');
  });

  it('never serves a rule ABOVE the learner level while at-or-below rules exist', () => {
    // Launch polish (Screen 2.3): a B1 rule (sich freuen auf) appeared inside
    // an A1 scenario to an A1 learner. The app's own rule is "never harder
    // than the level", so the pool is capped: the B1 row is unreachable while
    // any A1 row exists — regardless of the day rotation.
    const rows = [rule({ id: 'g_b1', level: 'B1' }), rule({ id: 'g_a1a', level: 'A1' }), rule({ id: 'g_a1b', level: 'A1' })];
    for (let day = 0; day < 7; day += 1) {
      const picked = selectGrammarRule(rows, 'A1', { now: dayZero + day * 86_400_000 });
      expect(picked?.level).toBe('A1');
    }
    // And the fallback the cap allows: with ONLY harder rows present, the beat
    // still teaches something rather than nothing.
    expect(selectGrammarRule([rule({ id: 'g_b1', level: 'B1' })], 'A1', { now: dayZero })?.level).toBe('B1');
  });

  it('returns null rather than inventing a rule the device does not have', () => {
    expect(selectGrammarRule([], 'A1', { now: dayZero })).toBeNull();
    expect(selectGrammarRule([rule({ title_ar: '   ' })], 'A1', { now: dayZero })).toBeNull();
    expect(selectGrammarRule([rule({ example_de: '' })], 'A1', { now: dayZero })).toBeNull();
  });

  it('never serves an off-scenario rule while a relevant one exists', () => {
    // Measured defect: airport-luggage practice taught "trennbare Verben" with
    // "Ich richte den Zugang ein" — a rule whose sentence shares no word with the
    // episode. Relevance now beats the day rotation.
    const rows = [
      rule({ id: 'g_off', level: 'A1', example_de: 'Ich richte den Zugang ein.' }),
      rule({ id: 'g_on', level: 'A1', example_de: 'Wo ist mein Koffer?' }),
    ];
    for (const day of [0, 1, 2, 3]) {
      const picked = selectGrammarRule(rows, 'A1', { now: dayZero + day * DAY, scenarioVocabulary: ['Koffer'] });
      expect(picked?.id).toBe('g_on');
    }
  });

  it('falls back to the full pool when no rule shares the episode vocabulary', () => {
    const rows = [rule({ id: 'g_off', level: 'A1', example_de: 'Ich richte den Zugang ein.' })];
    const picked = selectGrammarRule(rows, 'A1', { now: dayZero, scenarioVocabulary: ['Koffer'] });
    expect(picked?.id).toBe('g_off');
  });

  it('rotates by calendar day, and is stable within one day', () => {
    const rows = [
      rule({ id: 'g_a1', level: 'A1' }),
      rule({ id: 'g_a2', level: 'A1' }),
      rule({ id: 'g_a3', level: 'A1' }),
    ];
    const today = selectGrammarRule(rows, 'A1', { now: dayZero });
    expect(selectGrammarRule(rows, 'A1', { now: dayZero })?.id).toBe(today?.id);
    expect(selectGrammarRule(rows, 'A1', { now: dayZero + DAY })?.id).not.toBe(today?.id);
  });
});

describe('learnerName', () => {
  it('keeps only the first name, so the app never reads like a form', () => {
    expect(learnerName('Yasmin Al-Sayed')).toBe('Yasmin');
    expect(learnerName('  سارة  ')).toBe('سارة');
  });

  it('refuses the seeded placeholder and anything email-shaped', () => {
    expect(learnerName('مستكشف كَاتْزُو')).toBeNull();
    expect(learnerName('someone@example.com')).toBeNull();
    expect(learnerName('')).toBeNull();
    expect(learnerName(undefined)).toBeNull();
    expect(learnerName(null)).toBeNull();
  });
});

describe('buildStorySetup — the learner is the main character', () => {
  const base = { scenario: scenario(), level: 'A1' as const, locationAr: 'مطار برلين', whyAr: 'سبب' };

  it('addresses the learner by name and hands the name to the screen', () => {
    const setup = buildStorySetup({ ...base, displayName: 'Yasmin Al-Sayed' });
    expect(setup.learnerName).toBe('Yasmin');
    expect(setup.situationAr).toContain('Yasmin');
    // Katzu is the friend at their side, and says so by name.
    expect(setup.katzuAr).toContain('Yasmin');
    expect(setup.katzuAr).toContain('كَاتْزُو');
  });

  it('never greets the seeded placeholder, and leaves no stray comma behind', () => {
    const setup = buildStorySetup({ ...base, displayName: 'مستكشف كَاتْزُو' });
    expect(setup.learnerName).toBeNull();
    expect(setup.katzuAr).not.toContain('مستكشف');
    expect(setup.situationAr.startsWith('،')).toBe(false);
  });

  it('says something different depending on where the learner is in the move', () => {
    const preparing = buildStorySetup({ ...base, arrivalStatus: 'preparing' }).katzuAr;
    const arrived = buildStorySetup({ ...base, arrivalStatus: 'recently_arrived' }).katzuAr;
    expect(preparing).not.toBe(arrived);
    expect(preparing).toContain('قبل أن تقف فيه');
    expect(arrived).toContain('وصلت حديثاً');
  });

  it('keeps the return line unchanged — a known episode needs no introduction', () => {
    const setup = buildStorySetup({ ...base, displayName: 'Yasmin', returning: true });
    expect(setup.katzuAr).toBe('لا نحتاج أن نتذكر كل شيء — سنستمع أولاً، ثم تتحدث أنت.');
    expect(setup.situationAr).toContain('من حيث توقفت');
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

describe('session length and the two modes', () => {
  it('gives from-zero the shortest conversation and B2 the longest', () => {
    expect(sessionTurnCap('A0')).toBe(3);
    expect(sessionTurnCap('A1')).toBe(4);
    expect(sessionTurnCap('B2')).toBe(12);
  });

  it('is monotonic: a harder level never gets a shorter conversation', () => {
    const ladder = ['A0', 'A1', 'A2', 'B1', 'B2'] as const;
    for (let i = 1; i < ladder.length; i += 1) {
      expect(sessionTurnCap(ladder[i])).toBeGreaterThanOrEqual(sessionTurnCap(ladder[i - 1]));
    }
  });

  it('names the two modes of the same conversation, each with Arabic help text', () => {
    expect(SESSION_MODE_COPY.practice.labelAr).toContain('تدريب');
    expect(SESSION_MODE_COPY.real.labelAr).toContain('حقيقية');
    for (const mode of ['practice', 'real'] as const) {
      expect(SESSION_MODE_COPY[mode].descriptionAr.length).toBeGreaterThan(0);
    }
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
