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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A learner's name appears at most once per persona turn. «Freut mich, Leo!
 * Woher kommst du, Leo?» says the name twice in one bubble and reads like a
 * database greeting; the second mention is dropped, never the first.
 */
export function keepNameOnce(text: string, name?: string): string {
  const clean = (name ?? '').trim();
  if (clean.length < 2) return text;
  const matches = [...text.matchAll(new RegExp(escapeRegExp(clean), 'gi'))];
  if (matches.length <= 1) return text;
  let out = text;
  for (let index = matches.length - 1; index >= 1; index -= 1) {
    const match = matches[index];
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before = out.slice(0, start).replace(/[،,]\s*$/, '').replace(/\s+$/, '');
    const after = out.slice(end);
    out = `${before}${after}`
      .replace(/\s+([,.!?،؛])/g, (_all, mark: string) => mark)
      .replace(/[،,]\s*([.!?])/g, (_all, mark: string) => mark)
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return out;
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

/** A place answer may carry the word «Stadt» or a city suffix; keep the name. */
function cleanPlace(value: string): string {
  return titleCase(
    value
      .replace(/\b(stadt|city)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/** Letters only, up to three words: the shape of a bare fragment answer. */
function barePhrase(text: string): boolean {
  return /^[a-zäöüß][a-zäöüß\s-]{0,30}$/.test(text) && text.split(/\s+/).length <= 3;
}

function numberValue(text: string): string | null {
  const digits = text.match(/\b(\d{1,3})\b/);
  if (digits) return digits[1];
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return String(value);
  }
  return null;
}

/**
 * One answer against one step's slot. Fragments and any casing count: «in
 * berlin», «Berlin», «berlin», «berlin Stadt» all fill the city slot. A value
 * that already belongs to ANOTHER slot is rejected by `matchAnswer` below, so
 * repeating «aus Syrien» at the city question never fills it.
 */
function matchAnswerOnce(step: ScriptStep, raw: string): MatchResult {
  const text = normalize(raw);
  if (!text) return { matched: false };
  const match: AnswerMatch = step.match;

  switch (match.type) {
    case 'name': {
      const explicit = text.match(/(?:ich hei(?:ße|sse|se)|mein name ist)\s+([a-zäöüß][a-zäöüß-]{1,23})/);
      if (explicit) return { matched: true, value: titleCase(explicit[1]) };
      const stated = text.match(/ich bin\s+([a-zäöüß][a-zäöüß-]{1,23})/);
      if (stated && !NOT_A_NAME.has(stated[1])) return { matched: true, value: titleCase(stated[1]) };
      const bare = text.match(/^([a-zäöüß][a-zäöüß-]{1,23})$/);
      if (bare && !NOT_A_NAME.has(bare[1])) return { matched: true, value: titleCase(bare[1]) };
      return { matched: false };
    }
    case 'origin': {
      if (/^(in|nach|wohne|ich wohne|ich lebe|ich bin in)\b/.test(text)) return { matched: false };
      const stated = text.match(/(?:ich komme aus|komme aus|ich bin aus|aus|von)\s+([a-zäöüß][a-zäöüß\s-]{1,30})/);
      if (stated) return { matched: true, value: titleCase(stated[1].trim()) };
      if (barePhrase(text)) return { matched: true, value: titleCase(text) };
      return { matched: false };
    }
    case 'city': {
      // «aus London» is an origin answer, never a city — otherwise the city
      // question would be filled by the slot the learner just answered.
      if (/^(aus|von)\b/.test(text)) return { matched: false };
      const stated = text.match(/\b(?:ich wohne in|wohne in|ich lebe in|lebe in|ich bin in|bin in|wohne|nach|in)\s+([a-zäöüß][a-zäöüß\s-]{1,30})/);
      if (stated) return { matched: true, value: cleanPlace(stated[1]) };
      if (barePhrase(text)) return { matched: true, value: cleanPlace(text) };
      return { matched: false };
    }
    case 'age': {
      const value = numberValue(text);
      return value ? { matched: true, value } : { matched: false };
    }
    case 'job': {
      const stated = text.match(/(?:ich bin|ich arbeite als|arbeite als|ich arbeite bei|von beruf)\s+([a-zäöüß][a-zäöüß\s-]{1,30})/);
      if (stated) return { matched: true, value: titleCase(stated[1].trim()) };
      if (/^(ich bin|ich arbeite)\b/.test(text)) return { matched: false };
      if (barePhrase(text)) return { matched: true, value: titleCase(text) };
      return { matched: false };
    }
    case 'yesno': {
      const yesno = text.match(/^(ja|nein|doch|gern|gerne|klar|natürlich|bitte)\b/);
      if (yesno) return { matched: true, value: yesno[1] };
      // A full sentence that starts with a polite formula still answers.
      if (wordCount(text) >= 3 && hasLatinWords(text)) return { matched: true, value: 'ja' };
      return { matched: false };
    }
    case 'number': {
      const value = numberValue(text);
      return value ? { matched: true, value } : { matched: false };
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
 * The public matcher: the slot answer above, minus a value that already belongs
 * to another slot. «in London» at the city question after «aus London» must not
 * fill the city — it is the learner repeating what they already told us.
 */
export function matchAnswer(step: ScriptStep, raw: string, slots?: Record<string, string>): MatchResult {
  const result = matchAnswerOnce(step, raw);
  if (!result.matched || !result.value || !slots || !step.slot) return result;
  const candidate = normalize(result.value);
  if (!candidate) return result;
  for (const [slot, value] of Object.entries(slots)) {
    if (slot === step.slot || !value) continue;
    if (normalize(value) === candidate) return { matched: false };
  }
  return result;
}

/**
 * Whether the local matcher is sure enough to overrule the model when the model
 * says "this did not answer the question".
 *
 * Fragments count: a bare «Berlin» or «Leo» is a real answer, and re-asking a
 * question the learner just answered is the worse failure. The model may still
 * reject a weak keyword fallback or a free sentence it read as off-topic.
 */
function strongLocalMatch(step: ScriptStep, raw: string): boolean {
  const text = normalize(raw);
  switch (step.match.type) {
    case 'keyword':
      return step.match.keywords.some((keyword) => text.includes(keyword.toLowerCase()));
    case 'anything':
      return false;
    default:
      return matchAnswerOnce(step, raw).matched;
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
  slots?: Record<string, string>,
): MatchResult {
  const local = matchAnswer(step, raw, slots);
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
  // The name the learner JUST gave wins over the profile's display name: the
  // dedupe must search the name that is actually inside the sentence.
  const name = slots.name || input.learnerName;
  const reply: ScriptLine = {
    de: keepNameOnce(`${reaction.de} ${picked.line.de}`.replace(/\s+/g, ' ').trim(), name),
    ar: keepNameOnce(`${reaction.ar} ${picked.line.ar}`.replace(/\s+/g, ' ').trim(), name),
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
  const filled = fillLine(line, state.slots, input.learnerName);
  return {
    de: keepNameOnce(filled.de, state.slots.name || input.learnerName),
    ar: keepNameOnce(filled.ar, state.slots.name || input.learnerName),
  };
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

  const match = understandAnswer(step, input.text, input.aiUnderstanding, state.slots);
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

  // After TWO unclear turns the script moves on with a gentle line — never a
  // silent skip and never «Kein Problem, wir machen weiter».
  if (offTopic >= 2) {
    const bridge: ScriptLine = {
      de: 'Alles gut. Wir schauen uns die nächste Frage an.',
      ar: 'لا بأس. ننتقل إلى السؤال التالي بهدوء.',
    };
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
        de: keepNameOnce(`${bridge.de} ${picked.line.de}`.replace(/\s+/g, ' ').trim(), baseState.slots.name || input.learnerName),
        ar: keepNameOnce(`${bridge.ar} ${picked.line.ar}`.replace(/\s+/g, ' ').trim(), baseState.slots.name || input.learnerName),
      },
      asksQuestion: !nextStep.farewell && countQuestions(picked.line.de) === 1,
    };
  }

  const picked = pickReask(script, { ...baseState, offTopic }, state.stepIndex, input.learnerName);
  // The model's reaction acknowledges what the learner actually said, then the
  // script rephrases its own question. With no model line the persona says the
  // simplest human thing — «Wie bitte?» — while the hint dock offers the model
  // answer, so the learner can retry without losing the thread.
  const reply: ScriptLine = input.aiReaction
    ? (() => {
        const reaction = fillLine(input.aiReaction, baseState.slots, input.learnerName);
        return {
          de: keepNameOnce(`${reaction.de} ${picked.line.de}`.replace(/\s+/g, ' ').trim(), baseState.slots.name || input.learnerName),
          ar: keepNameOnce(`${reaction.ar} ${picked.line.ar}`.replace(/\s+/g, ' ').trim(), baseState.slots.name || input.learnerName),
        };
      })()
    : { de: 'Wie bitte?', ar: 'عذراً؟' };
  return {
    state: {
      ...picked.state,
      offTopic,
      // The hint dock offers the model answer for THIS question: the AI's repair
      // when it wrote one, otherwise the script's authored sentence.
      hintOverride: input.aiHint ?? step.hints[0] ?? null,
      hintStepIndex: state.stepIndex,
    },
    outcome: looksGerman ? 'offtopic' : 'unclear',
    matched: false,
    reply,
    asksQuestion: countQuestions(reply.de) === 1,
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

/**
 * The header's «N من M» denominator: the script's own step count, never the
 * level's generic turn cap. An A1 script with five beats must say «من 5».
 */
export function scriptTurnTarget(script: ScenarioScript): number {
  return script.steps.length;
}
