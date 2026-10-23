import { isProEffective } from '@/lib/utils/subscription';

/**
 * The one fact three surfaces read: has this learner finished their first
 * conversation?
 *
 * The Practice tab's lock, the Progress tab's lock and «المزيد»'s skill rows
 * all ask the same question, and a learner who can get two different answers
 * from two surfaces of the same app has learned to distrust the app. So the
 * answer lives in ONE function, and the surfaces pass it the same evidence.
 *
 * The evidence, in the order it is believed:
 *
 *  1. **A finished conversation.** One `sessions` row IS one completed episode
 *     (the row is written by `useLiveConversation` when the conversation ends),
 *     so the count is the fact — not a client-side counter that could disagree
 *     with the Worker's ledger.
 *  2. **A Pro account.** A paying learner has already been through the product;
 *     asking them to prove it with a conversation is a wall, not an onboarding.
 *  3. **An exhausted free allowance.** A learner whose free conversations are
 *     spent has been here before, whatever this device's rows say.
 *
 * Clauses 2 and 3 are only believed while the guided refinement is on: with the
 * switch off the function answers exactly what it answered before this file
 * existed (`sessions > 0`), so the DOM that shipped is the DOM that renders.
 *
 * Pure on purpose. A rule three screens must agree on is a rule nobody should
 * have to test through a browser.
 */

/** The learner's row, as far as this decision cares about it. */
export interface FirstSessionLearner {
  isSubscriptionActive?: boolean;
  subscriptionExpiresAt?: string | null;
  freeSessionsRemaining?: number;
}

export interface FirstSessionInput {
  /** `db.sessions.count()` — one row per finished conversation. */
  sessionCount: number;
  /** The learner's stored row, when it is known. */
  user?: FirstSessionLearner | null;
  /** Is the guided refinement on? */
  guided: boolean;
}

/** Has any conversation been finished on this device? */
export function hasFinishedAConversation(sessionCount: number | null | undefined): boolean {
  return (sessionCount ?? 0) > 0;
}

/**
 * The shared answer: true when the learner is past their first conversation.
 *
 * `guided` decides whether the two extra clauses are even looked at. With the
 * switch off this is the old rule and nothing else.
 */
export function isFirstSessionDone(input: FirstSessionInput): boolean {
  if (hasFinishedAConversation(input.sessionCount)) return true;
  if (!input.guided) return false;
  return isProEffective(input.user) || input.user?.freeSessionsRemaining === 0;
}

export interface DayZeroOpeningInput {
  /** Is the guided refinement on? */
  guided: boolean;
  /** `db.sessions.count()` — `undefined` while the count is still loading. */
  sessionCount: number | null | undefined;
  /** The learner's stored row, when it is known. */
  user?: FirstSessionLearner | null;
}

/**
 * Is this a learner's very first episode-opening (day 0), for the Story Setup
 * CTA? Only a GUIDED leaner with a KNOWN, still-zero count and a free allowance
 * left is "new":
 *
 *  - flag off → always false. The guided refinement introduced this copy; with
 *    the switch off the episode opening must render byte-for-byte the old hint.
 *  - count still loading (`undefined`/`null`) → always false. A returning learner
 *    must never flash the day-0 line just because the read has not settled, so
 *    the screen must pass the raw value and let THIS decide, never coerce to 0.
 *  - otherwise it is the inverse of `isFirstSessionDone`, so the episode opening
 *    and the home hero / Practice / Progress locks can never disagree.
 */
export function isDayZeroOpening(input: DayZeroOpeningInput): boolean {
  if (!input.guided) return false;
  if (input.sessionCount == null) return false; // count not loaded yet
  return !isFirstSessionDone({
    guided: input.guided,
    sessionCount: input.sessionCount,
    user: input.user,
  });
}
