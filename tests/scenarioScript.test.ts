import { describe, expect, it } from 'vitest';
import {
  advanceScript,
  countQuestions,
  currentStep,
  fillSlots,
  guardGermanLine,
  guardHintLine,
  matchAnswer,
  startScript,
} from '@/lib/conversation/script';
import { PILOT_SCRIPTS } from '@/lib/conversation/script/scripts';
import { scriptedScenarioIds } from '@/lib/conversation/script';
import type { AdvanceResult, ScenarioScript, ScriptState, ScriptStep } from '@/lib/conversation/script/types';

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
    const answers = ['Ich heiße Ghaidak.', 'Ich komme aus Syrien.', 'Ich wohne in Berlin.'];
    for (const text of answers) {
      const result = advanceScript(script, state, { text, hintUsed: false });
      state = result.state;
      expect(result.state.done).toBe(false);
    }
    // The neighbourhood answer moves the persona to her farewell statement.
    const farewellTurn = advanceScript(script, state, { text: 'Es gefällt mir hier gut.', hintUsed: false });
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
