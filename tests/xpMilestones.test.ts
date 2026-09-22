import { describe, expect, it } from 'vitest';
import { getXpRank, XP_MILESTONES } from '../src/lib/utils/xpMilestones';

describe('XP milestone ladder', () => {
  it('orders milestones strictly by minXp', () => {
    for (let i = 1; i < XP_MILESTONES.length; i++) {
      expect(XP_MILESTONES[i].minXp).toBeGreaterThan(XP_MILESTONES[i - 1].minXp);
    }
  });

  it('starts everyone at the first badge with 0 XP', () => {
    const rank = getXpRank(0);
    expect(rank.milestone.id).toBe('sprout');
    expect(rank.next?.id).toBe('meow');
    expect(rank.progressPercent).toBe(0);
    expect(rank.xpToNext).toBe(250);
  });

  it('respects boundaries exactly', () => {
    expect(getXpRank(249).milestone.id).toBe('sprout');
    expect(getXpRank(250).milestone.id).toBe('meow');
    expect(getXpRank(6000).milestone.id).toBe('legend');
  });

  it('computes progress toward the next milestone and never overflows', () => {
    const rank = getXpRank(500); // halfway between 250 and 750
    expect(rank.milestone.id).toBe('meow');
    expect(rank.progressPercent).toBe(50);
    expect(rank.xpToNext).toBe(250);

    expect(getXpRank(100000).progressPercent).toBeLessThanOrEqual(100);
    expect(getXpRank(-50).progressPercent).toBe(0);
  });

  it('handles the completed ladder', () => {
    const rank = getXpRank(6000);
    expect(rank.next).toBeNull();
    expect(rank.progressPercent).toBe(100);
    expect(rank.xpToNext).toBe(0);
  });

  it('handles non-integer and negative input without crashing', () => {
    expect(getXpRank(12.7).milestone.id).toBe('sprout');
    expect(getXpRank(-100).milestone.id).toBe('sprout');
  });
});
