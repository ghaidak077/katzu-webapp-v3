import type { SessionMode } from '@/types/models';

/**
 * XP for one finished conversation (V28 Stage 1D).
 *
 * WHY IT IS ITS OWN PURE MODULE: the owner requirement is that a REAL
 * conversation (no hints, no translation, no live correction) "counts toward
 * progress with higher weight" than a practice run. That is a rule, so it lives
 * in one tested function rather than inline in `finishSession` where it could
 * drift from what the report and the Progress screen say.
 *
 * The base is unchanged from before Stage 1D: accuracy on the learner's
 * independent sentences, plus an independence bonus that is only paid when every
 * sentence was produced with no hint. REAL mode multiplies that base, because the
 * same turn is worth more when no help made it possible. The multiplier is a
 * constant here (not a hard-coded literal in the hook) so Stage 3 can read it
 * when the rank ladder and the daily caps land.
 */

/** XP multiplier for a helped (practice) conversation. */
export const PRACTICE_XP_MULTIPLIER = 1;
/** XP multiplier for the unaided REAL conversation — the performance we build. */
export const REAL_XP_MULTIPLIER = 1.5;

export interface SessionXpInput {
  /** Accuracy on the episode's independent sentences; null when unmeasured. */
  accuracyPercent: number | null;
  /** How many of the learner's sentences used a hint. */
  assistedSentences: number;
  mode: SessionMode;
}

export function sessionXp({ accuracyPercent, assistedSentences, mode }: SessionXpInput): number {
  const accuracyXp = Math.round((accuracyPercent ?? 0) * 1.5);
  const independenceBonus = assistedSentences === 0 ? 50 : 25;
  const multiplier = mode === 'real' ? REAL_XP_MULTIPLIER : PRACTICE_XP_MULTIPLIER;
  return Math.round((accuracyXp + independenceBonus) * multiplier);
}
