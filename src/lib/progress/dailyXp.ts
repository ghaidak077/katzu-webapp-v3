import { sessionXp } from '@/lib/progress/sessionXp';
import { localDateKey } from '@/lib/utils/streak';
import type { SessionMode } from '@/types/models';

/**
 * Measured XP, capped per day (V28 Stage 3).
 *
 * Two product rules meet here:
 *  1. a rank must be earned only from XP the app actually *measured* — accuracy
 *     on the learner's own sentences — never from time spent or taps; and
 *  2. XP must not be farmable. A learner who grinds twenty conversations in an
 *     afternoon gets the same day's worth as one who did a few good ones.
 *
 * `creditXp` is the ONLY function that may move `totalXp`. It takes the XP the
 * session measured (via the frozen `sessionXp` rule), subtracts what today has
 * already paid out, and awards the remainder up to `DAILY_XP_CAP`. Anything the
 * cap refuses is reported (`cappedTo`), never silently dropped, so the report
 * can tell a very active learner the truth.
 */

/** The most XP a single local day can add to the ladder, whatever the grind. */
export const DAILY_XP_CAP = 600;

export interface XpSessionLike {
  timestamp: number;
  accuracyPercent: number | null;
  hintAssistedSentences?: number;
  mode?: SessionMode;
}

/** True when two epoch-ms values fall on the same LOCAL calendar day. */
export function isSameLocalDay(a: number, b: number): boolean {
  return localDateKey(new Date(a)) === localDateKey(new Date(b));
}

/** XP already earned today, recomputed from today's recorded sessions. */
export function xpEarnedToday(sessions: readonly XpSessionLike[], now: number = Date.now()): number {
  let total = 0;
  for (const session of sessions) {
    if (!session || !isSameLocalDay(session.timestamp, now)) continue;
    total += sessionXp({
      accuracyPercent: session.accuracyPercent ?? null,
      assistedSentences: session.hintAssistedSentences ?? 0,
      mode: session.mode ?? 'practice',
    });
  }
  return total;
}

export interface CreditXpInput {
  totalXp: number;
  /** Measured XP already credited today (from `xpEarnedToday`). */
  earnedToday: number;
  /** The XP this session measured and wants to credit. */
  amount: number;
  /** Override for tests; defaults to DAILY_XP_CAP. */
  cap?: number;
}

export interface CreditXpResult {
  /** The new lifetime total. */
  totalXp: number;
  /** What was actually added today. */
  awarded: number;
  /** XP the cap refused (null when nothing was refused). */
  cappedTo: number | null;
}

/** The one writer of `totalXp`. Pure, so the cap is testable without a clock. */
export function creditXp(input: CreditXpInput): CreditXpResult {
  const cap = Math.max(0, Math.floor(input.cap ?? DAILY_XP_CAP));
  const already = Math.max(0, Math.floor(input.earnedToday || 0));
  const amount = Math.max(0, Math.round(input.amount || 0));
  const remaining = Math.max(0, cap - already);
  const awarded = Math.min(amount, remaining);
  const base = Math.max(0, Math.floor(input.totalXp || 0));
  const refused = amount - awarded;
  return { totalXp: base + awarded, awarded, cappedTo: refused > 0 ? refused : null };
}
