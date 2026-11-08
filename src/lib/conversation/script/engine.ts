import type { CEFRLevel } from '@/types/models';
import { checkGerman } from '@/lib/conversation/germanChecker';
import {
  MAX_SCRIPT_TURNS,
  type AdvanceInput,
  type AdvanceResult,
  type AnswerMatch,
  type PersonaRole,
  type ScenarioScript,
  type ScriptLine,
  type ScriptState,
  type ScriptStep,
  type ScriptUnderstanding,
} from './types';

/**
 * The scripted conversation core: pure, network-free, shared by the client and
 * the simulation gate. Every decision the old engine gave to the model is made
 * here, deterministically.
 */

const SAMPLE_SLOT: Record<string, string> = {
  name: 'Ghaidak',
  origin: 'Syrien',
  city: 'Berlin',
  age: '24',
  number: 'zwei',
  item: 'Brot',
  drink: 'Kaffee',
  time: 'acht Uhr',
  date: 'Montag',
  place: 'Bahnhof',
};

const PRICE_ASK = /\b(wie viel kostet|was kostet|der preis|den preis|preis)\b/i;

/** Roles that must never ask what something costs. */
const NO_PRICE_ROLES: ReadonlySet<PersonaRole> = new Set(['host', 'friend', 'doctor', 'interviewer']);

const LEVEL_CHAR_CAP: Record<CEFRLevel, number> = {
  A0: 100,
  A1: 110,
  A2: 130,
  B1: 170,
  B2: 200,
};

export function countQuestions(line: string): number {
  return (line.match(/\?/g) ?? []).length;
}

export function hasMarkdown(line: string): boolean {
  return /(\*\*|__|`|^\s*#|\[[^\]]+\]\([^)]+\))/.test(line);
}

export function fillSlots(line: string, slots: Record<string, string>, learnerName?: string): string {
  return line.replace(/\{([a-zA-Z]+)\}/g, (_all, key: string) => {
    if (key === 'name') return slots.name || learnerName || 'du';
    return slots[key] || SAMPLE_SLOT[key] || key;
  });
}

export interface LineGuardResult {
  ok: boolean;
  reasons: string[];
}

/**
 * The single gate every shown German line passes: AI or script, the same rules.
 * Returns the reasons rather than throwing so the simulation gate can count them.
 */
export function guardGermanLine(
  raw: string,
  opts: { level: CEFRLevel; role: PersonaRole; asksQuestion?: boolean },
): LineGuardResult {
  const reasons: string[] = [];
  const line = raw.trim();
  if (!line) reasons.push('empty');
  if (hasMarkdown(line)) reasons.push('markdown');
  if (countQuestions(line) > 1) reasons.push('multiple-questions');
  if (opts.asksQuestion === true && countQuestions(line) !== 1) reasons.push('missing-question');
  if (opts.asksQuestion === false && countQuestions(line) > 0) reasons.push('unexpected-question');
  if (line.length > LEVEL_CHAR_CAP[opts.level]) reasons.push('too-long');
  if (NO_PRICE_ROLES.has(opts.role) && PRICE_ASK.test(line)) reasons.push('role-violation');
  if (!/[A-Za-zÄÖÜäöüß]/.test(line)) reasons.push('not-german');
  const check = checkGerman(line, opts.level);
  if (check.errors.length > 0) reasons.push(`corrector:${check.errors[0]?.category ?? 'rule'}`);
  return { ok: reasons.length === 0, reasons };
}

/** Hints are checked with the blank removed, so «Ich heiße ___.» is judged fairly. */
export function guardHintLine(line: ScriptLine, level: CEFRLevel, role: PersonaRole): LineGuardResult {
  return guardGermanLine(line.de.replace(/_{2,}/g, 'Anna'), { level, role });
}

function normalize(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?,;:]+$/g, '')
    .toLowerCase();
}

const NUMBER_WORDS: Record<string, number> = {
  null: 0, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8,
  neun: 9, zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15,
  sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20,
};

function hasLatinWords(text: string): boolean {
  return /[A-Za-zÄÖÜäöüß]{2,}/.test(text);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => /[A-Za-zÄÖÜäöüß]/.test(word)).length;
}

export interface MatchResult {
  matched: boolean;
  value?: string;
}

/**
 * Words that follow «ich bin» without being a name. «Ich bin müde» used to be
 * read as the name «Müde» — and the persona then called the learner that. The
 * model already rejects it; this keeps the local fallback honest too.
 */
const NOT_A_NAME = new Set([
  'müde', 'muede', 'gut', 'schlecht', 'krank', 'froh', 'traurig', 'hungrig',
  'durstig', 'neu', 'hier', 'da', 'bereit', 'fertig', 'einverstanden', 'spät',
  'satt', 'dünn', 'dick', 'groß', 'klein', 'jung', 'alt', 'glücklich', 'böse',
  'student', 'studentin', 'lehrer', 'lehrerin', 'arzt', 'ärztin', 'arztin',
  'aus', 'in', 'zu', 'von', 'nicht', 'auch', 'noch', 'schon', 'sehr', 'so',
]);

export function matchAnswer(step: ScriptStep, raw: string): MatchResult {
  const text = normalize(raw);
  if (!text) return { matched: false };
  const match: AnswerMatch = step.match;

  switch (match.type) {
    case 'name': {
      const explicit = text.match(/(?:ich heiße|ich heisse|mein name ist)\s+([a-zäöüß][a-zäöüß-]{1,23})/);
      if (explicit) return { matched: true, value: titleCase(explicit[1]) };
      const stated = text.match(/ich bin\s+([a-zäöüß][a-zäöüß-]{1,23})/);
      if (stated && !NOT_A_NAME.has(stated[1])) return { matched: true, value: titleCase(stated[1]) };
      const bare = text.match(/^([a-zäöüß][a-zäöüß-]{1,23})$/);
      if (bare) return { matched: true, value: titleCase(bare[1]) };
      return { matched: false };
    }
    case 'origin': {
      const stated = text.match(/(?:ich komme aus|komme aus|ich bin aus|aus|von)\s+([a-zäöüß][a-zäöüß\s-]{1,30})/);
      return stated ? { matched: true, value: titleCase(stated[1].trim()) } : { matched: false };
    }
    case 'city': {
      const stated = text.match(/(?:ich wohne in|wohne in|ich lebe in|lebe in|ich bin in|bin in|nach)\s+([a-zäöüß][a-zäöüß\s-]{1,30})/);
      return stated ? { matched: true, value: titleCase(stated[1].trim()) } : { matched: false };
    }
    case 'yesno': {
      const yesno = text.match(/^(ja|nein|doch|gern|gerne|klar|natürlich|bitte)\b/);
      if (yesno) return { matched: true, value: yesno[1] };
      // A full sentence that starts with a polite formula still answers.
      if (wordCount(text) >= 3 && hasLatinWords(text)) return { matched: true, value: 'ja' };
      return { matched: false };
    }
    case 'number': {
      const digits = text.match(/\b(\d{1,3})\b/);
      if (digits) return { matched: true, value: digits[1] };
      for (const [word, value] of Object.entries(NUMBER_WORDS)) {
        if (new RegExp(`\\b${word}\\b`).test(text)) return { matched: true, value: String(value) };
      }
      return { matched: false };
    }
    case 'keyword': {
      const keywords = match.keywords.map((keyword) => keyword.toLowerCase());
      const hit = keywords.find((keyword) => text.includes(keyword));
      if (hit) return { matched: true, value: hit };
      if (wordCount(text) >= 3 && hasLatinWords(text)) return { matched: true, value: text.slice(0, 40) };
      return { matched: false };
    }
    case 'anything': {
      if (wordCount(text) >= 2 && hasLatinWords(text)) return { matched: true, value: text.slice(0, 40) };
      const keywords = (step.keywords ?? []).map((keyword) => keyword.toLowerCase());
      const hit = keywords.find((keyword) => text.includes(keyword));
      return hit ? { matched: true, value: hit } : { matched: false };
    }
    default:
      return { matched: false };
  }
}

/**
 * Whether the local matcher is sure enough to overrule the model when the model
 * says "this did not answer the question".
 *
 * Only explicit patterns count. The old fallbacks — a bare word as a name, a
 * three-word sentence as a yes/no, "Ich bin müde" as «Müde» — are exactly what
 * produced a persona calling the learner «Müde». The model may reject those; it
 * may never reject an explicit «Ich heiße Sara» or a stated number.
 */
function strongLocalMatch(step: ScriptStep, raw: string): boolean {
  const text = normalize(raw);
  switch (step.match.type) {
    case 'name':
      return /(?:ich heiße|ich heisse|mein name ist)\s+[a-zäöüß]/.test(text);
    case 'origin':
      return /(?:ich komme aus|komme aus|ich bin aus)\s+[a-zäöüß]/.test(text);
    case 'city':
      return /(?:ich wohne in|wohne in|ich lebe in|lebe in)\s+[a-zäöüß]/.test(text);
    case 'yesno':
      return /^(ja|nein|doch|gern|gerne|klar|natürlich|bitte)\b/.test(text);
    case 'number':
      return matchAnswer(step, raw).matched;
    case 'keyword':
      return step.match.keywords.some((keyword) => text.includes(keyword.toLowerCase()));
    case 'anything':
      return false;
    default:
      return false;
  }
}

function numericValue(value: string): number | null {
  const clean = normalize(value);
  if (/^\d{1,3}$/.test(clean)) return Number(clean);
  const word = NUMBER_WORDS[clean];
  return typeof word === 'number' ? word : null;
}

/**
 * The value must be the learner's own. A model that returns «Berlin» because the
 * scene mentions Berlin, when the learner said «Bali», is not understanding —
 * it is inventing, and that value must never enter the transcript or a reaction.
 */
function groundedInLearnerText(raw: string, value: string, step: ScriptStep): boolean {
  const text = normalize(raw);
  const candidate = normalize(value);
  if (!candidate) return false;
  if (text.includes(candidate)) return true;
  if (step.match.type === 'number') {
    const a = numericValue(value);
    const b = matchAnswer(step, raw).value;
    return a !== null && b !== undefined && a === numericValue(b);
  }
  return false;
}

/**
 * One answer decision, with the model as a second reader rather than the owner.
 *
 * Order matters:
 *  1. no usable model reading → the local matcher decides;
 *  2. model says «answered» → its value is accepted only when it is literally
 *     grounded in the learner's sentence;
 *  3. model says «not answered» → an explicit local match still wins, every
 *     weak fallback defers to the model.
 */
export function understandAnswer(
  step: ScriptStep,
  raw: string,
  ai?: ScriptUnderstanding | null,
): MatchResult {
  const local = matchAnswer(step, raw);
  if (!ai || typeof ai.matched !== 'boolean') return local;
  if (ai.slot && step.slot && ai.slot !== step.slot) return local;
  if (ai.matched) {
    const value = String(ai.value ?? '').trim().slice(0, 48);
    if (!value || !groundedInLearnerText(raw, value, step)) return local;
    return { matched: true, value: step.match.type === 'number' ? (local.value ?? value) : value };
  }
  return strongLocalMatch(step, raw) ? local : { matched: false };
}

function titleCase(value: string): string {
  if (!value) return value;
  return value
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function startScript(script: ScenarioScript): ScriptState {
  return {
    scenarioId: script.scenarioId,
    stepIndex: 0,
    slots: {},
    hintOverride: null,
    hintStepIndex: 0,
    // The opener has already shown the first ask of step 0.
    askCursor: script.steps.map((_step, index) => (index === 0 ? 1 : 0)),
    reaskCursor: script.steps.map(() => 0),
    turns: 0,
    hintTurns: 0,
    offTopic: 0,
    awaitingFarewell: false,
    done: false,
  };
}

export function currentStep(script: ScenarioScript, state: ScriptState): ScriptStep | null {
  return script.steps[state.stepIndex] ?? null;
}

export function currentHint(script: ScenarioScript, state: ScriptState): ScriptLine | null {
  const step = currentStep(script, state);
  if (!step) return null;
  // A hint written for this exact step and this learner's last attempt is
  // always better than the authored default; a stale one from an earlier step
  // is never shown.
  if (state.hintOverride && state.hintStepIndex === state.stepIndex) return state.hintOverride;
  return step.hints[0] ?? null;
}

function fillLine(line: ScriptLine, slots: Record<string, string>, learnerName?: string): ScriptLine {
  return {
    de: fillSlots(line.de, slots, learnerName),
    ar: line.ar.replace(/\{([a-zA-Z]+)\}/g, (_all, key: string) =>
      key === 'name' ? slots.name || learnerName || 'أنت' : slots[key] || SAMPLE_SLOT[key] || key,
    ),
  };
}

function pickAsk(
  script: ScenarioScript,
  state: ScriptState,
  stepIndex: number,
  learnerName?: string,
): { line: ScriptLine; state: ScriptState } {
  const step = script.steps[stepIndex];
  const cursor = state.askCursor[stepIndex] ?? 0;
  const raw = step.asks[cursor % step.asks.length];
  const line = fillLine(raw, state.slots, learnerName);
  const askCursor = [...state.askCursor];
  askCursor[stepIndex] = cursor + 1;
  return { line, state: { ...state, askCursor } };
}

function pickReask(
  script: ScenarioScript,
  state: ScriptState,
  stepIndex: number,
  learnerName?: string,
): { line: ScriptLine; state: ScriptState } {
  const step = script.steps[stepIndex];
  const cursor = state.reaskCursor[stepIndex] ?? 0;
  const raw = step.reasks[cursor % step.reasks.length];
  const line = fillLine(raw, state.slots, learnerName);
  const reaskCursor = [...state.reaskCursor];
  reaskCursor[stepIndex] = cursor + 1;
  return { line, state: { ...state, reaskCursor } };
}

/**
 * The first step at or after `index` whose slot is still empty. A farewell step
 * is never skipped, so the conversation always has an ending.
 */
function nextOpenStep(script: ScenarioScript, state: ScriptState, index: number): number {
  let next = index;
  while (next < script.steps.length - 1) {
    const step = script.steps[next];
    if (step.farewell) break;
    if (!step.slot || !state.slots[step.slot]) break;
    next += 1;
  }
  return Math.min(next, script.steps.length - 1);
}

function composeAnsweredReply(
  script: ScenarioScript,
  state: ScriptState,
  step: ScriptStep,
  value: string | undefined,
  input: AdvanceInput,
): { state: ScriptState; reply: ScriptLine; asksQuestion: boolean } {
  const slots = step.slot && value ? { ...state.slots, [step.slot]: value } : state.slots;
  let nextState: ScriptState = { ...state, slots, offTopic: 0 };
  const reaction: ScriptLine = input.aiReaction
    ? fillLine(input.aiReaction, slots, input.learnerName)
    : fillLine(step.reactions[0] ?? { de: 'Gut!', ar: 'جيد!' }, slots, input.learnerName);

  const nextIndex = nextOpenStep(script, nextState, nextState.stepIndex + 1);
  nextState = { ...nextState, stepIndex: nextIndex };
  const nextStep = script.steps[nextIndex];
  const picked = pickAsk(script, nextState, nextIndex, input.learnerName);
  nextState = picked.state;
  if (nextStep.farewell) nextState = { ...nextState, awaitingFarewell: true };
  // The AI hint was written for the question the learner JUST answered, so it
  // must not survive into the new question: that one starts from its own
  // authored hint. (Keeping it is how «Drei Gläser» ended up under «Wie viel
  // kostet das?».)
  nextState = { ...nextState, hintOverride: null, hintStepIndex: nextIndex };
  const asksQuestion = !nextStep.farewell && countQuestions(picked.line.de) === 1;
  const reply: ScriptLine = {
    de: `${reaction.de} ${picked.line.de}`.replace(/\s+/g, ' ').trim(),
    ar: `${reaction.ar} ${picked.line.ar}`.replace(/\s+/g, ' ').trim(),
  };
  return { state: nextState, reply, asksQuestion };
}

function composeClosingReply(
  script: ScenarioScript,
  state: ScriptState,
  input: AdvanceInput,
): ScriptLine {
  const farewell = script.steps[script.steps.length - 1];
  const line = input.aiReaction ?? farewell.reactions[0] ?? { de: 'Tschüss!', ar: 'إلى اللقاء!' };
  return fillLine(line, state.slots, input.learnerName);
}

/**
 * One learner turn, decided locally. This is the whole conversation engine:
 * no network, no model, no timers.
 */
export function advanceScript(script: ScenarioScript, state: ScriptState, input: AdvanceInput): AdvanceResult {
  if (state.done) {
    return { state, outcome: 'done', matched: false, reply: null, asksQuestion: false };
  }

  // The farewell was said; the learner's closing reply is the last thing needed.
  if (state.awaitingFarewell) {
    const reply = composeClosingReply(script, state, input);
    return {
      state: { ...state, turns: state.turns + 1, done: true },
      outcome: 'farewell',
      matched: true,
      reply,
      asksQuestion: false,
    };
  }

  if (state.turns >= MAX_SCRIPT_TURNS) {
    return {
      state: { ...state, done: true, endedByCap: true },
      outcome: 'max-turns',
      matched: false,
      reply: null,
      asksQuestion: false,
    };
  }

  const step = currentStep(script, state);
  if (!step) {
    return { state: { ...state, done: true }, outcome: 'done', matched: false, reply: null, asksQuestion: false };
  }

  const baseState: ScriptState = {
    ...state,
    turns: state.turns + 1,
    hintTurns: state.hintTurns + (input.hintUsed ? 1 : 0),
  };

  const match = understandAnswer(step, input.text, input.aiUnderstanding);
  if (match.matched) {
    const composed = composeAnsweredReply(script, baseState, step, match.value, input);
    const nextStep = script.steps[composed.state.stepIndex];
    return {
      state: composed.state,
      outcome: nextStep.farewell ? 'farewell' : 'answered',
      matched: true,
      filledSlot: step.slot,
      reply: composed.reply,
      asksQuestion: composed.asksQuestion,
    };
  }

  // Not an answer to the question on screen: reword the SAME question, never
  // move on and never repeat a variant already shown.
  const offTopic = baseState.offTopic + 1;
  const looksGerman = hasLatinWords(input.text);

  // Two unclear turns in a row is the ceiling the owner set: after that the
  // script moves to the next step instead of looping on the same question.
  if (offTopic > 2) {
    const bridge: ScriptLine = { de: 'Kein Problem, wir machen weiter.', ar: 'لا مشكلة، نكمل.' };
    const nextIndex = nextOpenStep(script, baseState, baseState.stepIndex + 1);
    let nextState: ScriptState = { ...baseState, stepIndex: nextIndex, offTopic: 0 };
    const nextStep = script.steps[nextIndex];
    const picked = pickAsk(script, nextState, nextIndex, input.learnerName);
    nextState = picked.state;
    if (nextStep.farewell) nextState = { ...nextState, awaitingFarewell: true };
    nextState = { ...nextState, hintOverride: null, hintStepIndex: nextIndex };
    return {
      state: nextState,
      outcome: nextStep.farewell ? 'farewell' : 'unclear',
      matched: false,
      reply: {
        de: `${bridge.de} ${picked.line.de}`.replace(/\s+/g, ' ').trim(),
        ar: `${bridge.ar} ${picked.line.ar}`.replace(/\s+/g, ' ').trim(),
      },
      asksQuestion: !nextStep.farewell && countQuestions(picked.line.de) === 1,
    };
  }

  const picked = pickReask(script, { ...baseState, offTopic }, state.stepIndex, input.learnerName);
  // The model's reaction acknowledges what the learner actually said ("Alles
  // klar." after «Ich bin müde.»), then the script re-asks its own question —
  // one question per turn, and never a sentence the learner did not prompt.
  const reply: ScriptLine = input.aiReaction
    ? {
        de: `${fillLine(input.aiReaction, baseState.slots, input.learnerName).de} ${picked.line.de}`
          .replace(/\s+/g, ' ')
          .trim(),
        ar: `${fillLine(input.aiReaction, baseState.slots, input.learnerName).ar} ${picked.line.ar}`
          .replace(/\s+/g, ' ')
          .trim(),
      }
    : picked.line;
  return {
    state: {
      ...picked.state,
      offTopic,
      // The repair hint answers the attempt that just failed, not the step's
      // authored default: «drie glasse» must offer «Drei Gläser», never
      // «Zwei Stück».
      hintOverride: input.aiHint ?? null,
      hintStepIndex: state.stepIndex,
    },
    outcome: looksGerman ? 'offtopic' : 'unclear',
    matched: false,
    reply,
    asksQuestion: countQuestions(picked.line.de) === 1,
  };
}

/** The question currently on screen, for the header and the hint dock. */
export function currentQuestionLine(script: ScenarioScript, state: ScriptState): ScriptLine | null {
  const step = currentStep(script, state);
  if (!step) return null;
  if (state.awaitingFarewell) return step.asks[0] ?? null;
  return step.asks[0] ?? null;
}

/** True when the farewell line has been spoken and only the goodbye is missing. */
export function isAwaitingGoodbye(state: ScriptState): boolean {
  return state.awaitingFarewell && !state.done;
}
