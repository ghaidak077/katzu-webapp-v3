import { describe, expect, it } from 'vitest';
import { RANKS, RANK_COUNT, TOP_RANK_XP, rankFor } from '../src/lib/progress/ranks';
import {
  DAILY_XP_CAP,
  creditXp,
  isSameLocalDay,
  xpEarnedToday,
} from '../src/lib/progress/dailyXp';
import { XP_MILESTONES } from '../src/lib/utils/xpMilestones';

describe('rank ladder', () => {
  it('exposes the same single ladder the milestone table defines', () => {
    expect(RANKS).toHaveLength(XP_MILESTONES.length);
    expect(RANK_COUNT).toBe(XP_MILESTONES.length);
    RANKS.forEach((rank, index) => {
      expect(rank.index).toBe(index);
      expect(rank.nameAr).toBe(XP_MILESTONES[index].nameAr);
    });
    expect(TOP_RANK_XP).toBe(XP_MILESTONES[XP_MILESTONES.length - 1].minXp);
  });

  it('orders the ladder strictly and numbers ranks 1..N', () => {
    expect(rankFor(0).rankNumber).toBe(1);
    expect(rankFor(0).totalRanks).toBe(RANK_COUNT);
    for (let i = 1; i < RANKS.length; i += 1) {
      expect(RANKS[i].minXp).toBeGreaterThan(RANKS[i - 1].minXp);
    }
  });

  it('respects boundaries exactly', () => {
    expect(rankFor(249).rank.id).toBe('sprout');
    expect(rankFor(250).rank.id).toBe('meow');
    expect(rankFor(250).rankNumber).toBe(2);
    expect(rankFor(-100).rank.id).toBe('sprout');
  });

  it('reports distance and percent to the next rank, capped at the top', () => {
    const mid = rankFor(500);
    expect(mid.rank.id).toBe('meow');
    expect(mid.progressPercent).toBe(50);
    expect(mid.xpToNext).toBe(250);

    const top = rankFor(TOP_RANK_XP + 5000);
    expect(top.next).toBeNull();
    expect(top.progressPercent).toBe(100);
    expect(top.xpToNext).toBe(0);
    expect(top.rankNumber).toBe(RANK_COUNT);
  });
});

describe('daily XP cap (anti-farming)', () => {
  it('recognises the same local day', () => {
    const morning = new Date(2026, 9, 2, 8, 0).getTime();
    const night = new Date(2026, 9, 2, 23, 30).getTime();
    const tomorrow = new Date(2026, 9, 3, 0, 5).getTime();
    expect(isSameLocalDay(morning, night)).toBe(true);
    expect(isSameLocalDay(night, tomorrow)).toBe(false);
  });

  it('sums only today\u2019s measured sessions', () => {
    const now = new Date(2026, 9, 2, 20, 0).getTime();
    const today = new Date(2026, 9, 2, 9, 0).getTime();
    const yesterday = new Date(2026, 9, 1, 9, 0).getTime();
    const earned = xpEarnedToday(
      [
        { timestamp: today, accuracyPercent: 100, hintAssistedSentences: 0, mode: 'practice' },
        { timestamp: today, accuracyPercent: 100, hintAssistedSentences: 0, mode: 'real' },
        { timestamp: yesterday, accuracyPercent: 100, hintAssistedSentences: 0, mode: 'practice' },
      ],
      now,
    );
    // practice: round(100*1.5)+50 = 200; real: 200*1.5 = 300; yesterday excluded.
    expect(earned).toBe(500);
  });

  it('awards the measured amount while the day has room', () => {
    const result = creditXp({ totalXp: 1000, earnedToday: 0, amount: 200 });
    expect(result).toEqual({ totalXp: 1200, awarded: 200, cappedTo: null });
  });

  it('refuses XP past the daily cap and reports the refused amount', () => {
    const result = creditXp({ totalXp: 1000, earnedToday: 500, amount: 200 });
    expect(result.totalXp).toBe(1100);
    expect(result.awarded).toBe(100);
    expect(result.cappedTo).toBe(100);
  });

  it('awards nothing once the cap is reached', () => {
    const result = creditXp({ totalXp: 1000, earnedToday: DAILY_XP_CAP, amount: 400 });
    expect(result).toEqual({ totalXp: 1000, awarded: 0, cappedTo: 400 });
  });

  it('never lets XP go backwards and sanitises bad input', () => {
    expect(creditXp({ totalXp: -50, earnedToday: 0, amount: 100 }).totalXp).toBe(100);
    expect(creditXp({ totalXp: 10, earnedToday: 0, amount: -5 })).toEqual({
      totalXp: 10,
      awarded: 0,
      cappedTo: null,
    });
    expect(creditXp({ totalXp: 0, earnedToday: 0, amount: 9999, cap: 100 }).awarded).toBe(100);
  });
});
