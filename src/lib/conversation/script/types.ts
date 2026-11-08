import type { CEFRLevel } from '@/types/models';

/**
 * A scenario as a SHORT SCRIPT, not a prompt.
 *
 * The app — not the model — knows which step the conversation is on, what the
 * learner has already answered, and which question comes next. The model may add
 * a reaction, but it never decides the next question. That is what stops the
 * «Wie heißt du?» asked twice and the host asking «Wie viel kostet das?».
 */

/** Who the persona is, and therefore which questions are in character. */
export type PersonaRole =
  | 'host'
  | 'friend'
  | 'clerk'
  | 'cashier'
  | 'barista'
  | 'baker'
  | 'waiter'
  | 'official'
  | 'conductor'
  | 'guard'
  | 'doctor'
  | 'interviewer';

export interface ScriptLine {
  de: string;
  ar: string;
}

/** How a learner answer is recognised, and what it fills. */
export type AnswerMatch =
  | { type: 'name' | 'origin' | 'city' }
  | { type: 'yesno' }
  | { type: 'number' }
  /** At least one keyword present, or a short free sentence (≥3 words). */
  | { type: 'keyword'; keywords: string[] }
  /** Any German-looking answer: used for open questions no rule can parse. */
  | { type: 'anything' };

export interface ScriptStep {
  /** Stable id for tests and analytics. */
  id: string;
  /** Personal-fact slot this step fills (`name`, `origin`, …). */
  slot?: string;
  /** 3 ways to ask; exactly one question each. Index 0 is what the opener says. */
  asks: ScriptLine[];
  /** 2 ways to ask again when the answer was unclear. Never repeats an ask. */
  reasks: ScriptLine[];
  /** Recognising the answer. */
  match: AnswerMatch;
  /** Keys the learner can use; also the vocabulary the guard accepts. */
  keywords?: string[];
  /** One short reaction per answer, `{slot}` filled from the answer. */
  reactions: ScriptLine[];
  /** The dock's sentence, with blanks for personal facts. */
  hints: ScriptLine[];
  /**
   * Final beat: a statement, never a question. The learner answers it with a
   * goodbye and only then does the session complete.
   */
  farewell?: boolean;
}

export interface ScenarioScript {
  scenarioId: string;
  level: CEFRLevel;
  persona: { name: string; role: PersonaRole; personality: string };
  /** One labelled goal in Arabic — what finishing actually means. */
  goalAr: string;
  steps: ScriptStep[];
}

export interface ScriptState {
  scenarioId: string;
  /** Index of the step whose question is on screen. */
  stepIndex: number;
  slots: Record<string, string>;
  /**
   * A hint written for THIS attempt (repairing the learner's own sentence or
   * pointing at the next question). It is cleared as soon as the step advances,
   * so a fixed per-step sentence never hangs around after it stopped fitting.
   */
  hintOverride?: ScriptLine | null;
  /** The step index `hintOverride` was written for; guards against stale hints. */
  hintStepIndex?: number;
  /** Per step: how many ask / reask variants have been shown. */
  askCursor: number[];
  reaskCursor: number[];
  turns: number;
  hintTurns: number;
  /** Consecutive unclear / off-topic turns on the current step. */
  offTopic: number;
  /** The farewell line has been said; waiting for the learner's goodbye. */
  awaitingFarewell: boolean;
  done: boolean;
  /** Safety stop was hit rather than the scenario's own ending. */
  endedByCap?: boolean;
}

/**
 * What the AI understood the learner's answer to be.
 *
 * The script still owns the slot and the next question. This only says whether
 * the line on screen was answered, and with which value — it lets the AI reject
 * a local false positive («Ich bin müde» is not a name) or rescue a phrasing the
 * local matcher missed, without letting it invent a topic.
 */
export interface ScriptUnderstanding {
  matched: boolean;
  /** The slot the model believed it filled. Ignored unless it is this step's slot. */
  slot?: string;
  /** The learner's value, already extracted from their own words. */
  value?: string;
}

export interface AdvanceInput {
  text: string;
  hintUsed: boolean;
  /** A validated in-character line from the AI call, if one ran. */
  aiReaction?: ScriptLine | null;
  /** A validated hint for the learner's next attempt. */
  aiHint?: ScriptLine | null;
  /** The AI's reading of the learner's answer, when it returned one. */
  aiUnderstanding?: ScriptUnderstanding | null;
  /** The learner's display name, for reactions that need it. */
  learnerName?: string;
}

export type TurnOutcome =
  | 'answered'
  | 'unclear'
  | 'offtopic'
  | 'farewell'
  | 'done'
  | 'max-turns';

export interface AdvanceResult {
  state: ScriptState;
  outcome: TurnOutcome;
  matched: boolean;
  filledSlot?: string;
  reply: ScriptLine | null;
  /** Whether `reply` ends with a question (the farewell never does). */
  asksQuestion: boolean;
}

/** A hard ceiling so no script bug can loop forever. */
export const MAX_SCRIPT_TURNS = 20;
