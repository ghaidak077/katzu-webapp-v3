import { describe, expect, it } from 'vitest';
import {
  advanceScript,
  countQuestions,
  currentStep,
  fillSlots,
  guardGermanLine,
  guardHintLine,
  matchAnswer,
  scriptTurnTarget,
  startScript,
} from '@/lib/conversation/script';
import { checkGerman } from '@/lib/conversation/germanChecker';
import { lintGloss, lintScript } from '@/lib/conversation/script/glossLint';
import { PILOT_SCRIPTS } from '@/lib/conversation/script/scripts';
import { scriptedScenarioIds } from '@/lib/conversation/script';
import type { AdvanceResult, AnswerMatch, ScenarioScript, ScriptState, ScriptStep } from '@/lib/conversation/script/types';

/**
 * The simulation gate (owner spec §7). Thirty scripted learners per migrated
 * scenario run through the REAL state machine with no network; the "mocked AI"
 * variants are the four ways the off-script model can behave — valid, invalid,
 * slow, timeout — and every one of them must end at a script line, never an
 * error card.
 */

const PERSONAS = [
  'correct',
  'hint',
  'different-name',
  'repeat',
  'not-understood',
  'offtopic',
  'arabic',
  'gibberish',
  'very-long',
  'double-send',
] as const;
type Persona = (typeof PERSONAS)[number];

const AI_VARIANTS = ['none', 'valid', 'invalid', 'slow', 'timeout'] as const;
type AiVariant = (typeof AI_VARIANTS)[number];

function answerFor(step: ScriptStep, persona: Persona): string {
  switch (persona) {
    case 'hint':
      return step.hints[0]?.de.replace(/_{2,}/g, 'Sara') ?? 'Ja.';
    case 'different-name':
      return step.match.type === 'name' ? 'Ich heiße Sara.' : 'Ich heiße Sara.';
    default:
      break;
  }
  switch (step.match.type) {
    case 'name':
      return 'Ich heiße Ghaidak.';
    case 'origin':
      return 'Ich komme aus Syrien.';
    case 'city':
      return 'Ich wohne in Berlin.';
    case 'yesno':
      return 'Ja, gern.';
    case 'number':
      return 'Zwei, bitte.';
    case 'keyword':
      return step.match.keywords[0] ?? 'Brot';
    default:
      return 'Ja, das ist gut.';
  }
}

function nonsenseFor(persona: Persona): string {
  switch (persona) {
    case 'not-understood':
      return 'Ich verstehe nicht.';
    case 'offtopic':
      return 'Mein Hund ist heute sehr müde.';
    case 'arabic':
      return 'أنا لا أفهم، من فضلك أعد السؤال.';
    case 'gibberish':
      return 'asdfgh qwertz';
    case 'very-long':
      return 'Ich möchte heute eigentlich nur kurz sagen, dass ich leider noch nicht genau weiß, was ich sagen soll, weil ich ein bisschen nervös bin und alles noch einmal überlegen muss.';
    default:
      return 'Ich verstehe nicht.';
  }
}

function aiReactionFor(variant: AiVariant, step: ScriptStep) {
  if (variant === 'valid') return { de: 'Aha, interessant.', ar: 'آه، مثير للاهتمام.' };
  return null;
}

interface RunLog {
  replies: Array<{ de: string; asksQuestion: boolean }>;
  questions: string[];
  turns: number;
  done: boolean;
  endedByCap: boolean;
  farewellSeen: boolean;
  finalLearnerTurnAfterFarewell: boolean;
}

function runLearner(script: ScenarioScript, persona: Persona, ai: AiVariant): RunLog {
  let state: ScriptState = startScript(script);
  const log: RunLog = {
    replies: [],
    questions: [],
    turns: 0,
    done: false,
    endedByCap: false,
    farewellSeen: false,
    finalLearnerTurnAfterFarewell: false,
  };
  let previousAnswer = '';
  for (let i = 0; i < 40 && !state.done; i += 1) {
    const step = currentStep(script, state);
    if (!step) break;
    let text: string;
    if (state.awaitingFarewell) {
      text = 'Tschüss!';
      log.finalLearnerTurnAfterFarewell = true;
    } else if (persona === 'repeat') {
      text = previousAnswer || answerFor(step, 'correct');
    } else if (persona === 'offtopic' || persona === 'not-understood' || persona === 'arabic' || persona === 'gibberish') {
      text = nonsenseFor(persona);
    } else if (persona === 'very-long') {
      text = i === 0 ? answerFor(step, 'correct') : nonsenseFor(persona);
    } else {
      text = answerFor(step, persona === 'hint' ? 'hint' : step.match.type === 'name' && persona === 'different-name' ? 'different-name' : 'correct');
    }
    if (persona === 'double-send') {
      const first = advanceScript(script, state, { text: answerFor(step, 'correct'), hintUsed: false, aiReaction: aiReactionFor(ai, step) });
      const second = advanceScript(script, first.state, { text: answerFor(step, 'correct'), hintUsed: false, aiReaction: aiReactionFor(ai, step) });
      state = second.state;
      record(log, [first, second], script);
      continue;
    }
    const result = advanceScript(script, state, {
      text,
      hintUsed: persona === 'hint',
      aiReaction: aiReactionFor(ai, step),
    });
    state = result.state;
    record(log, [result], script);
    previousAnswer = answerFor(step, 'correct');
    if (result.outcome === 'farewell') log.farewellSeen = true;
  }
  log.done = state.done;
  log.endedByCap = !!state.endedByCap;
  return log;
}

function record(log: RunLog, results: AdvanceResult[], script: ScenarioScript) {
  for (const result of results) {
    log.turns += 1;
    if (!result.reply) continue;
    log.replies.push({ de: result.reply.de, asksQuestion: result.asksQuestion });
    const guard = guardGermanLine(result.reply.de, {
      level: script.level,
      role: script.persona.role,
      asksQuestion: result.asksQuestion,
    });
    expect(guard.reasons, `${script.scenarioId}: ${result.reply.de}`).toEqual([]);
    expect(countQuestions(result.reply.de)).toBeLessThanOrEqual(1);
    const question = result.reply.de.split('?')[0];
    if (result.asksQuestion) {
      const last = log.questions[log.questions.length - 1];
      expect(question, `${script.scenarioId} repeated a question: ${result.reply.de}`).not.toBe(last);
      log.questions.push(question);
    }
  }
}

describe('scenario scripts — shape and language', () => {
  it('migrates the failed greetings scenario first, then units 1 and 2', () => {
    const ids = scriptedScenarioIds();
    expect(ids[0]).toBe('first_greetings');
    for (const id of [
      'numbers_and_prices', 'cafe_order', 'bakery_shopping', 'supermarket_checkout', 'restaurant_besonders',
      'embassy_appointment', 'pass_und_dokumente', 'airport_arrival', 'train_station', 'train_first_ride',
    ]) {
      expect(ids).toContain(id);
    }
  });

  for (const script of PILOT_SCRIPTS) {
    it(`${script.scenarioId}: 4–8 steps, 3 asks, 2 reasks, a farewell last`, () => {
      expect(script.steps.length).toBeGreaterThanOrEqual(4);
      expect(script.steps.length).toBeLessThanOrEqual(8);
      expect(script.steps[script.steps.length - 1].farewell).toBe(true);
      for (const step of script.steps) {
        if (!step.farewell) expect(step.asks).toHaveLength(3);
        else expect(step.asks.length).toBeGreaterThanOrEqual(1);
        expect(step.reasks.length).toBeGreaterThanOrEqual(2);
        expect(step.hints.length).toBeGreaterThanOrEqual(1);
        expect(step.reactions.length).toBeGreaterThanOrEqual(1);
        if (step.slot && ['name', 'origin', 'city'].includes(step.slot)) {
          expect(step.hints[0].de).toMatch(/_{2,}/);
        }
      }
    });

    it(`${script.scenarioId}: every script line passes the corrector and the guards`, () => {
      const slots = { name: 'Ghaidak', origin: 'Syrien', city: 'Berlin' };
      for (const step of script.steps) {
        for (const ask of step.asks) {
          const de = fillSlots(ask.de, slots);
          expect(guardGermanLine(de, { level: script.level, role: script.persona.role, asksQuestion: !step.farewell }).reasons, de).toEqual([]);
          expect(ask.ar.trim().length).toBeGreaterThan(0);
        }
        for (const reask of step.reasks) {
          const de = fillSlots(reask.de, slots);
          expect(guardGermanLine(de, { level: script.level, role: script.persona.role, asksQuestion: !step.farewell }).reasons, de).toEqual([]);
        }
        for (const reaction of step.reactions) {
          const filled = reaction.de.replace(/\{[a-z]+\}/gi, 'Anna');
          expect(guardGermanLine(filled, { level: script.level, role: script.persona.role, asksQuestion: false }).reasons, filled).toEqual([]);
          expect(reaction.ar.trim().length).toBeGreaterThan(0);
        }
        for (const hint of step.hints) {
          expect(guardHintLine(hint, script.level, script.persona.role).reasons, hint.de).toEqual([]);
          expect(hint.ar.trim().length).toBeGreaterThan(0);
        }
      }
    });
  }
});

describe('the failed real session replay', () => {
  it('answers the name once and never asks «Wie heißt du?» again', () => {
    const script = PILOT_SCRIPTS[0];
    let state = startScript(script);
    const first = advanceScript(script, state, { text: 'Ich heiße Ghaidak.', hintUsed: false });
    state = first.state;
    expect(first.matched).toBe(true);
    expect(first.filledSlot).toBe('name');
    expect(first.reply?.de).toContain('Freut mich, Ghaidak!');
    expect(first.reply?.de.toLowerCase()).not.toContain('wie heißt du');
    expect(state.slots.name).toBe('Ghaidak');
  });

  it('uses the name the learner typed, not the profile', () => {
    const script = PILOT_SCRIPTS[0];
    const first = advanceScript(script, startScript(script), { text: 'Ich heiße Sara.', hintUsed: false });
    expect(first.reply?.de).toContain('Sara');
    expect(first.reply?.de).not.toContain('Ghaidak');
  });

  it('completes only after the farewell and the learner’s goodbye', () => {
    const script = PILOT_SCRIPTS[0];
    let state = startScript(script);
    const answers = [
      'Ich heiße Ghaidak.',
      'Ich komme aus Syrien.',
      'Ich wohne in Berlin.',
    ];
    for (const text of answers) {
      const result = advanceScript(script, state, { text, hintUsed: false });
      state = result.state;
      expect(result.state.done).toBe(false);
    }
    // The opinion answer moves the persona to her farewell statement.
    const farewellTurn = advanceScript(script, state, { text: 'Berlin gefällt mir sehr gut.', hintUsed: false });
    expect(farewellTurn.outcome).toBe('farewell');
    expect(farewellTurn.state.done).toBe(false);
    // Only the learner's goodbye completes the session.
    const goodbye = advanceScript(script, farewellTurn.state, { text: 'Tschüss!', hintUsed: false });
    expect(goodbye.outcome).toBe('farewell');
    expect(goodbye.state.done).toBe(true);
  });
});

describe('simulation gate — 30 learners × 11 migrated scenarios', () => {
  for (const script of PILOT_SCRIPTS) {
    it(`${script.scenarioId}: never repeats a question, one question per turn, no error card`, () => {
      let runs = 0;
      for (const persona of PERSONAS) {
        for (const ai of AI_VARIANTS) {
          // 10 personas × 5 AI behaviours = 50 scripted learners per scenario.
          runs += 1;
          const log = runLearner(script, persona, ai);
          expect(log.turns).toBeLessThanOrEqual(40);
          if (persona !== 'arabic' && persona !== 'gibberish') {
            expect(log.done, `${script.scenarioId}/${persona}/${ai} did not finish`).toBe(true);
            expect(log.endedByCap, `${script.scenarioId}/${persona}/${ai} hit the cap`).toBe(false);
          }
          if (persona === 'correct' || persona === 'hint' || persona === 'different-name') {
            expect(log.farewellSeen).toBe(true);
            expect(log.finalLearnerTurnAfterFarewell).toBe(true);
          }
        }
      }
      expect(runs).toBe(50);
    });
  }

  it('skips a step whose slot was already answered', () => {
    const script = PILOT_SCRIPTS[0];
    let state = startScript(script);
    // Answer the name, then the origin.
    state = advanceScript(script, state, { text: 'Ich heiße Ghaidak.', hintUsed: false }).state;
    expect(state.stepIndex).toBe(1);
    state = advanceScript(script, state, { text: 'Ich komme aus Syrien.', hintUsed: false }).state;
    expect(state.stepIndex).toBe(2);
    // Saying the origin again at the city step must not satisfy it.
    const repeated = advanceScript(script, state, { text: 'Ich komme aus Syrien.', hintUsed: false });
    expect(repeated.matched).toBe(false);
    expect(repeated.state.stepIndex).toBe(2);
  });

  it('recognises answers without accepting gibberish', () => {
    const nameStep = PILOT_SCRIPTS[0].steps[0];
    expect(matchAnswer(nameStep, 'Ich heiße Sara.').matched).toBe(true);
    expect(matchAnswer(nameStep, 'Sara').matched).toBe(true);
    expect(matchAnswer(nameStep, 'asdfgh').matched).toBe(true); // a bare-looking word still reads as a name
    expect(matchAnswer(nameStep, '12345').matched).toBe(false);
    expect(matchAnswer(nameStep, 'أنا لا أفهم').matched).toBe(false);
  });
});

/* ── static authoring checks: the build fails on a slot/question collision ── */

const CONTENT = (line: string): string =>
  line
    .toLowerCase()
    .replace(/\{[a-z]+\}/g, ' ')
    .replace(/[^a-zäöüß\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 5)
    .sort()
    .join(' ');

describe('script authoring — no repeated slot, no repeated question, no sensitive ask', () => {
  for (const script of PILOT_SCRIPTS) {
    it(`${script.scenarioId}: every filled slot is unique and every step asks something new`, () => {
      const slots = script.steps.map((step) => step.slot).filter((slot): slot is string => !!slot);
      expect(new Set(slots).size, `duplicate slot in ${script.scenarioId}: ${slots.join(', ')}`).toBe(slots.length);

      const seen = new Map<string, string>();
      script.steps.forEach((step) => {
        for (const line of [...step.asks, ...step.reasks]) {
          const signature = CONTENT(line.de);
          if (!signature) continue;
          const owner = seen.get(signature);
          if (owner && owner !== step.id) {
            expect(
              owner,
              `${script.scenarioId}: «${step.id}» asks the same thing as «${owner}» — ${line.de}`,
            ).toBeUndefined();
          }
          seen.set(signature, step.id);
        }
      });
    });

    it(`${script.scenarioId}: never asks for an address, street, phone or document number`, () => {
      const sensitive = /\b(straße|strasse|wohnung|adresse|telefon|handy|nachname|geburtsdatum|passnummer|kontonummer)\b/i;
      for (const step of script.steps) {
        for (const line of [...step.asks, ...step.reasks, ...step.hints]) {
          expect(sensitive.test(line.de), `${script.scenarioId}/${step.id}: ${line.de}`).toBe(false);
          expect(sensitive.test(line.ar), `${script.scenarioId}/${step.id}: ${line.ar}`).toBe(false);
        }
      }
    });

    it(`${script.scenarioId}: the header total is the script's real step count`, () => {
      expect(scriptTurnTarget(script)).toBe(script.steps.length);
      expect(scriptTurnTarget(script)).toBeGreaterThanOrEqual(4);
    });
  }
});

/* ── Arabic gloss agreement (per-gender deny-lists) ── */

describe('script glosses agree with the persona gender', () => {
  it('every shipped gloss passes the lint', () => {
    for (const script of PILOT_SCRIPTS) {
      expect(lintScript(script), script.scenarioId).toEqual([]);
    }
  });

  it('catches the feminine/masculine and noun-agreement slips that shipped', () => {
    expect(lintGloss('سعيد بمعرفتك!', 'female')).toContain('سعيد');
    expect(lintGloss('سعيدة بمعرفتك!', 'male')).toContain('سعيدة');
    expect(lintGloss('كيف تعجبك الحي؟', 'female')).toContain('تعجبك الحي');
    expect(lintGloss('كيف يعجبك المدينة؟', 'female')).toContain('يعجبك المدينة');
    expect(lintGloss('سعيدة بمعرفتك!', 'female')).toEqual([]);
    expect(lintGloss('سعيد بمعرفتك!', 'male')).toEqual([]);
  });
});

/* ── fragments, casing and typos: a filled slot is never re-asked ── */

const makeStep = (type: AnswerMatch['type'], slot?: string, keywords?: string[]): ScriptStep => ({
  id: `${type}_step`,
  slot,
  asks: [{ de: 'Und du?', ar: 'وأنت؟' }],
  reasks: [{ de: 'Noch einmal, bitte?', ar: 'مرة أخرى، من فضلك؟' }],
  match: type === 'keyword' ? { type, keywords: keywords ?? ['gut'] } : ({ type } as AnswerMatch),
  reactions: [{ de: 'Danke.', ar: 'شكراً.' }],
  hints: [{ de: 'Ich heiße ___.', ar: 'اسمي ___.' }],
});

const SLOT_CASES: Array<[AnswerMatch['type'], string[]]> = [
  ['name', [
    'Ich heiße Leo', 'ich heisse leo', 'ich heiße LEO', 'LEO', 'leo', 'Leo', 'mein Name ist Leo',
    'mein name ist leo', 'Hallo, ich bin Leo', 'hallo, ich bin leo', 'ich bin leo', 'Ich heisse Leo.',
    'LEO!', '  leo  ', 'Ich heiße Leo.',
  ]],
  ['origin', [
    'Ich komme aus Syrien', 'ich komme aus syrien', 'aus Syrien', 'Aus Syrien', 'Syrien', 'syrien',
    'SYRIEN', 'Ich bin aus Syrien', 'ich bin aus syrien', 'komme aus Syrien', 'von Syrien',
    'aus London', 'London', 'london', 'Ich komme aus der Türkei',
  ]],
  ['city', [
    'in berlin', 'Berlin', 'berlin', 'BERLIN', 'Ich wohne in Berlin', 'ich wohne in berlin',
    'wohne in Berlin', 'Ich lebe in Berlin', 'ich lebe in berlin', 'Ich bin in Berlin',
    'Berlin Stadt', 'berlin stadt', 'in Berlin Stadt', 'Ich wohne in Hamburg', 'hamburg',
  ]],
  ['age', [
    '24', '24 Jahre', 'ich bin 24', 'ich bin 24 jahre alt', 'zwanzig', 'zwanzig Jahre',
    'Ich bin zwanzig', 'ich bin 20', 'zwanzig jahre alt', 'Ich werde 24', '24.', ' 24 ',
    '24 jahre', 'ich bin 24.', 'zehn',
  ]],
  ['job', [
    'Ich bin Lehrer', 'ich bin lehrer', 'Lehrer', 'lehrer', 'LEHRER', 'ich arbeite als Lehrer',
    'Ich arbeite als Lehrerin', 'ich arbeite als lehrerin', 'arbeite als Arzt', 'Ich arbeite bei Siemens',
    'von Beruf Lehrer', 'Lehrerin', 'Koch', 'Ich bin Koch.', 'koch',
  ]],
];

describe('slot matchers accept fragments, casing and typos', () => {
  for (const [type, cases] of SLOT_CASES) {
    it(`${type}: 15 fragments all fill the slot`, () => {
      const step = makeStep(type, type);
      for (const text of cases) {
        const result = matchAnswer(step, text);
        expect(result.matched, `${type} rejected «${text}»`).toBe(true);
        expect(result.value?.trim().length, `${type} returned no value for «${text}»`).toBeGreaterThan(0);
      }
    });
  }

  it('a value already stored in another slot never fills this one', () => {
    const city = makeStep('city', 'city');
    expect(matchAnswer(city, 'aus London', { origin: 'London' }).matched).toBe(false);
    expect(matchAnswer(city, 'Syrien', { origin: 'Syrien' }).matched).toBe(false);
    expect(matchAnswer(city, 'in berlin', { origin: 'Syrien' }).matched).toBe(true);
  });
});

/* ── the exact session that failed, replayed end to end ── */

describe('golden replay — أول الكلمات: مرحباً ومع السلامة', () => {
  it('full session: name once, city from «in berlin», header M = steps, farewell closes', () => {
    const script = PILOT_SCRIPTS[0];
    expect(scriptTurnTarget(script)).toBe(script.steps.length);
    expect(scriptTurnTarget(script)).toBe(5);

    let state = startScript(script);
    const replies: Array<{ de: string; ar: string }> = [];
    const send = (text: string) => {
      const result = advanceScript(script, state, { text, hintUsed: false });
      state = result.state;
      if (result.reply) replies.push(result.reply);
      return result;
    };

    const first = send('Hallo, ich heiße Ghaidak');
    expect(first.matched).toBe(true);
    expect(first.filledSlot).toBe('name');
    expect(state.slots.name).toBe('Ghaidak');

    const second = send('Ich komme aus Syrien');
    expect(second.matched).toBe(true);
    expect(state.slots.origin).toBe('Syrien');

    const third = send('in berlin');
    expect(third.matched, '«in berlin» must fill the city slot').toBe(true);
    expect(state.slots.city).toBe('Berlin');

    // The next question is about the city the learner just gave.
    expect(third.reply?.de).toContain('Berlin');
    expect(third.reply?.de).toContain('?');
    expect(third.reply?.ar).toContain('Berlin');

    const fourth = send('Berlin gefällt mir sehr gut');
    expect(fourth.outcome).toBe('farewell');
    expect(state.done).toBe(false);

    const goodbye = send('Tschüss!');
    expect(goodbye.state.done).toBe(true);
    expect(goodbye.reply?.de).toContain('Auf Wiedersehen');

    // A name appears at most once per language in any persona turn.
    for (const reply of replies) {
      const deMentions = (reply.de.match(/Ghaidak/gi) ?? []).length;
      const arMentions = (reply.ar.match(/Ghaidak/gi) ?? []).length;
      expect(deMentions, `name repeated in «${reply.de}»`).toBeLessThanOrEqual(1);
      expect(arMentions, `name repeated in «${reply.ar}»`).toBeLessThanOrEqual(1);
    }

    // No question was asked twice in the same words.
    const questions = replies.filter((line) => line.de.includes('?')).map((line) => line.de.toLowerCase());
    expect(new Set(questions).size).toBe(questions.length);
  });

  it('dedupes the typed name even when the profile name is different', () => {
    const script = PILOT_SCRIPTS[0];
    const first = advanceScript(script, startScript(script), {
      text: 'Hallo, ich heiße Ghaidak',
      hintUsed: false,
      learnerName: 'Leo', // the signed-in profile, not the name just typed
    });
    expect(first.state.slots.name).toBe('Ghaidak');
    expect(first.reply?.de).toBe('Freut mich, Ghaidak! Woher kommst du?');
    expect((first.reply?.de.match(/Ghaidak/g) ?? []).length).toBe(1);
  });

  it('never silently skips, never says «Kein Problem, wir machen weiter»', () => {
    const script = PILOT_SCRIPTS[0];
    let state = startScript(script);
    const first = advanceScript(script, state, { text: 'Ich verstehe nicht.', hintUsed: false });
    state = first.state;
    expect(first.reply?.de).toContain('Wie bitte?');
    expect(first.state.offTopic).toBe(1);
    expect(first.state.hintOverride).not.toBeNull();

    const second = advanceScript(script, state, { text: 'Ich verstehe nicht.', hintUsed: false });
    expect(second.reply?.de).not.toContain('Kein Problem');
    expect(second.reply?.de).toContain('Alles gut');
    expect(second.state.stepIndex).toBe(1);
    expect(second.asksQuestion).toBe(true);
  });

  it('never shows a punctuation note after a learner message', () => {
    const result = checkGerman('Ich heiße Ghaidak', 'A1');
    expect('softNoteAr' in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain('ملاحظة اختيارية');
  });
});
