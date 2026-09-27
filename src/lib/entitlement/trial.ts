import type { CEFRLevel, SessionEntity } from '@/types/models';

/**
 * When the app is allowed to ask for money.
 *
 * The rule is one sentence: **after a real episode, never before it.** A learner
 * who has not yet finished a single conversation has been told nothing about what
 * Katzu is worth, and a wall there is not a paywall — it is a refund request.
 *
 * Two things this module deliberately does *not* do:
 *
 *  - it does not count or enforce free sessions. The Worker owns the trial ledger
 *    and answers `402 PAYWALL_REQUIRED` when it is spent; a second client-side
 *    counter would be a number that can disagree with the server, which is exactly
 *    how a learner gets told they have "1 session left" twice.
 *  - it does not gate progress. Review, the mistake bank and everything already
 *    learned stay free forever, so the offer can never take something back.
 */

/** A conversation counts as an episode once the learner actually spoke in it. */
export const MIN_EPISODE_TURNS = 1;

/** Recorded conversations the learner finished with at least one turn. */
export function completedEpisodeCount(sessions: Array<Pick<SessionEntity, 'sentencesSpoken'>>): number {
  return (sessions || []).filter((session) => (Number(session?.sentencesSpoken) || 0) >= MIN_EPISODE_TURNS)
    .length;
}

export interface ProOfferInput {
  isPro: boolean;
  /** From `completedEpisodeCount` — recorded evidence, never a guess. */
  completedEpisodes: number;
}

/**
 * Whether the Pro offer may be shown at all.
 *
 * `hasCompletedAnEpisode` is the whole condition, and it is the same one on every
 * surface: Journey Home, the Debrief, the library. A brand-new learner never sees
 * it before their first conversation, at any level.
 */
export function shouldOfferPro({ isPro, completedEpisodes }: ProOfferInput): boolean {
  if (isPro) return false;
  return completedEpisodes >= MIN_EPISODE_TURNS;
}

/**
 * The one level the Worker's free trial serves — see `checkUserEntitlement`.
 *
 * It is mirrored here rather than chosen here: the server is the ledger, and a
 * client that believed a different boundary would offer a conversation the
 * server rejects.
 */
export const FREE_LEVEL: CEFRLevel = 'A1';

/**
 * The level the server will actually serve this learner.
 *
 * Every AI path goes through `checkUserEntitlement`, which serves A1 and refuses
 * every other level without an active subscription — so this is the level a
 * mission, a conversation and a writing task must all be built at. A free learner
 * above A1 is deliberately given A1 rather than their measured level: a B1 episode
 * for a free learner ends in a 402 half-way through their first conversation — a
 * wall inside the one experience that is supposed to prove the product works. The
 * level the placement measured is what Pro unlocks, and the Debrief says so, after
 * the win.
 */
export function servedLevel(learnerLevel: CEFRLevel | undefined, isPro: boolean): CEFRLevel {
  if (isPro) return learnerLevel || FREE_LEVEL;
  return FREE_LEVEL;
}

/**
 * Whether a library level is open without Pro.
 *
 * Free covers the A1 course — the same boundary the Worker enforces on
 * `/ai/turn`. Study, review, the mistake bank and the vocabulary list are not
 * level-gated at all, so nothing already learned is ever taken back.
 *
 * The learner's *own* measured level gets no exemption here, and that is the
 * point. The level on an AI request is client-supplied, so "my measured level is
 * free" would be an entitlement the client could grant itself while the Worker
 * refused the turn anyway — mid-episode, after the learner had already invested
 * the story and the practice. `servedLevel` is what keeps the promise instead:
 * a free learner is handed an episode at the level the server actually serves.
 */
export function isLevelFree(level: CEFRLevel, isPro: boolean): boolean {
  return isPro || level === FREE_LEVEL;
}
