import { XP_MILESTONES, type XpMilestone } from '@/lib/utils/xpMilestones';

/**
 * The Arabic rank ladder (V28 Stage 3).
 *
 * The thresholds are the ones the app already ships in `xpMilestones.ts` — there
 * is deliberately only ONE ladder, so the Trail badge, the Progress screen and
 * this module can never disagree about what rank a learner is in. What Stage 3
 * adds is the ladder as a first-class thing: a numbered rank, how many rungs
 * exist, and distance to the next one, all pure and unit-tested.
 *
 * "Earned only from measured XP" is enforced where the XP is written, not here:
 * `creditXp` (`src/lib/progress/dailyXp.ts`) is the only place `totalXp` moves,
 * it only ever sees XP a session actually measured, and it refuses anything past
 * the daily cap. A rank is therefore a claim about measured performance or it is
 * nothing.
 */

export interface Rank extends XpMilestone {
  /** 0-based position in the ladder. */
  index: number;
}

export const RANKS: readonly Rank[] = XP_MILESTONES.map((milestone, index) => ({
  ...milestone,
  index,
}));

export const RANK_COUNT = RANKS.length;

/** XP at which the ladder is complete (the last rung). */
export const TOP_RANK_XP = RANKS.length > 0 ? RANKS[RANKS.length - 1].minXp : 0;

export interface RankProgress {
  rank: Rank;
  next: Rank | null;
  /** 1-based rank number, for "الرتبة N من M". */
  rankNumber: number;
  totalRanks: number;
  /** 0-100 toward the next rank (100 at the top). */
  progressPercent: number;
  xpToNext: number;
}

function clampPercent(part: number, whole: number): number {
  if (whole <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}

/** The learner's rank for a measured XP total. Never throws; negatives floor at 0. */
export function rankFor(totalXp: number): RankProgress {
  const xp = Math.max(0, Math.floor(totalXp || 0));
  let rank = RANKS[0];
  for (const candidate of RANKS) {
    if (xp >= candidate.minXp) rank = candidate;
  }
  const next = rank.index < RANKS.length - 1 ? RANKS[rank.index + 1] : null;
  const rankNumber = rank.index + 1;

  if (!next) {
    return {
      rank,
      next: null,
      rankNumber,
      totalRanks: RANK_COUNT,
      progressPercent: 100,
      xpToNext: 0,
    };
  }
  const span = next.minXp - rank.minXp;
  return {
    rank,
    next,
    rankNumber,
    totalRanks: RANK_COUNT,
    progressPercent: clampPercent(xp - rank.minXp, span),
    xpToNext: Math.max(0, next.minXp - xp),
  };
}
