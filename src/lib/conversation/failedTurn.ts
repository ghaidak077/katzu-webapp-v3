/**
 * The failed turn, as a value.
 *
 * THE GATE THIS MODULE EXISTS FOR (2026-11-10)
 * A turn that did not get a model answer must leave the conversation exactly as
 * it was: no persona bubble, no counted round, no duplicate copy of the
 * learner's sentence. The learner's text goes back into the composer, where they
 * can retry it, and a clear Arabic notice says what happened.
 *
 * The screen could not prove that about itself, so the rule lives here as a pure
 * function and `tests/noFallbackPersona.test.ts` runs it against every failure
 * it can simulate — provider failure, 429, timeout, invalid JSON, offline — then
 * asserts that no KATZU (persona) message was added. There is no branch of this
 * module that can produce one.
 */

import type { ChatMessage } from '@/types/models';

export interface FailedTurnInput {
  /** The transcript before the failed send (without the failed bubble). */
  messages: ChatMessage[];
  /** The id of the user bubble the optimistic send added. */
  userMessageId: string;
  /** The learner's sentence, exactly as they sent it. */
  text: string;
}

export interface FailedTurnResult {
  /** The unchanged transcript: the optimistic bubble is removed. */
  messages: ChatMessage[];
  /** The composer gets the sentence back, unchanged. */
  inputText: string;
  /** There is never a persona reply for a turn the model did not answer. */
  personaBubblesAdded: 0;
}

export function failedTurn({ messages, userMessageId, text }: FailedTurnInput): FailedTurnResult {
  return {
    messages: messages.filter((message) => message.id !== userMessageId),
    inputText: text,
    personaBubblesAdded: 0,
  };
}

/** A diagnostic id alone — never learner text — for the «أبلغ عن المشكلة» button. */
export function newDiagnosticId(now: number = Date.now(), random: () => number = Math.random): string {
  return `turn_${now.toString(36)}_${random().toString(36).slice(2, 8)}`;
}
