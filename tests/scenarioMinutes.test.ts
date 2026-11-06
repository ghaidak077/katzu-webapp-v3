import { describe, expect, it } from 'vitest';
import {
  REVIEW_SESSION_CAP,
  reviewBacklog,
  reviewMinutes,
  scenarioMinutes,
} from '../src/lib/mission/scenarioMinutes';
import { absoluteXpProgress, rankFor, TOP_RANK_XP } from '../src/lib/progress/ranks';

describe('scenario and review duration estimates', () => {
  it('grows with the level and never returns zero for a scenario', () => {
    expect(scenarioMinutes('A0')).toBeLessThan(scenarioMinutes('A1'));
    expect(scenarioMinutes('A1')).toBeLessThan(scenarioMinutes('A2'));
    expect(scenarioMinutes('A2')).toBeLessThan(scenarioMinutes('B1'));
    expect(scenarioMinutes('B1')).toBeLessThan(scenarioMinutes('B2'));
    expect(scenarioMinutes(undefined)).toBe(scenarioMinutes('A1'));
  });

  it('caps a review sitting at ten items and three minutes', () => {
    expect(REVIEW_SESSION_CAP).toBe(10);
    expect(reviewMinutes(10)).toBe(3);
    expect(reviewMinutes(11)).toBe(3);
    expect(reviewMinutes(130)).toBe(3);
    expect(reviewMinutes(0)).toBe(0);
    // Any real sitting is at least two minutes.
    expect(reviewMinutes(1)).toBe(2);
  });

  it('reports the backlog left out of the button, never a negative count', () => {
    expect(reviewBacklog(10)).toBe(0);
    expect(reviewBacklog(11)).toBe(1);
    expect(reviewBacklog(130)).toBe(120);
    expect(reviewBacklog(0)).toBe(0);
  });
});

describe('absolute XP progress', () => {
  it('measures the bar and the text against the same target', () => {
    const progress = absoluteXpProgress(900);
    expect(progress.xp).toBe(900);
    expect(progress.target).toBe(1500);
    expect(progress.percent).toBe(60);
    expect(progress.percent).toBe(Math.round((progress.xp / progress.target) * 100));
  });

  it('uses the next rank threshold, not the within-rank remaining XP', () => {
    const progress = absoluteXpProgress(800);
    expect(progress.target).toBe(rankFor(800).next?.minXp);
    expect(progress.percent).toBe(53);
  });

  it('floors negatives and tops out at 100 percent', () => {
    expect(absoluteXpProgress(-50)).toEqual({ xp: 0, target: 250, percent: 0 });
    expect(absoluteXpProgress(TOP_RANK_XP + 500).percent).toBe(100);
  });
});
