import { describe, expect, it } from 'vitest';
import {
  MIN_TREND_EVIDENCE,
  buildCategoryTrends,
  buildWeeklyCoachSummary,
  nextReviewAtForCategory,
} from '../src/lib/coach/profile';
import type { MistakeEntity } from '../src/types/models';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 8, 26).getTime();

function mistake(overrides: Partial<MistakeEntity> = {}): MistakeEntity {
  return {
    id: overrides.id ?? Math.floor(Math.random() * 100000),
    userId: 'current_user',
    scenarioId: 'doctor_visit',
    original: 'Ich habe 25 Jahre.',
    corrected: 'Ich bin 25 Jahre alt.',
    grammarRule: 'sein mit Alter',
    timestamp: now - DAY,
    wasHintUsed: false,
    ...overrides,
  };
}

describe('coach category trends', () => {
  it('refuses to claim a pattern from a single mistake', () => {
    const trends = buildCategoryTrends([mistake()], [], now);
    expect(trends).toHaveLength(1);
    expect(trends[0].trend).toBe('insufficient');
  });

  it('reports improving when the last week has fewer mistakes than the one before', () => {
    const rows = [
      mistake({ timestamp: now - 10 * DAY }),
      mistake({ timestamp: now - 12 * DAY }),
      mistake({ timestamp: now - 2 * DAY }),
    ];
    const [trend] = buildCategoryTrends(rows, [], now);
    expect(trend.count).toBeGreaterThanOrEqual(MIN_TREND_EVIDENCE);
    expect(trend.trend).toBe('improving');
    expect(trend.recentCount).toBe(1);
    expect(trend.earlierCount).toBe(2);
  });

  it('reports worsening when mistakes cluster in the last week', () => {
    const rows = [
      mistake({ timestamp: now - 8 * DAY }),
      mistake({ timestamp: now - 1 * DAY }),
      mistake({ timestamp: now - 2 * DAY }),
      mistake({ timestamp: now - 3 * DAY }),
    ];
    const [trend] = buildCategoryTrends(rows, [], now);
    expect(trend.trend).toBe('worsening');
  });

  it('keeps mastered mistakes out of the open count and uses real examples', () => {
    const rows = [
      mistake({ id: 1, isMastered: true, original: 'Ich habe 25 Jahre.' }),
      mistake({ id: 2, isMastered: false, original: 'Ich habe 26 Jahre.' }),
      mistake({ id: 3, isMastered: false, original: 'Ich habe 27 Jahre.' }),
    ];
    const [trend] = buildCategoryTrends(rows, [], now);
    expect(trend.open).toBe(2);
    expect(trend.mastered).toBe(1);
    expect(trend.examples.every((example) => example.original.startsWith('Ich habe'))).toBe(true);
  });

  it('finds the next scheduled review for the category through the mistake identity', () => {
    // 'sein mit Alter' classifies as `other`, which is the category the
    // schedule lookup must then match on.
    const rows = [mistake({ id: 7, syncId: 'user:doctor:1:Ich habe 25 Jahre.' })];
    expect(buildCategoryTrends(rows, [], now)[0].category).toBe('other');

    const dueAt = now + 3 * DAY;
    expect(
      nextReviewAtForCategory(rows, [{ kind: 'mistake', refId: 'mistake:user:doctor:1:Ich habe 25 Jahre.', dueAt }], 'other', now),
    ).toBe(dueAt);
    expect(
      nextReviewAtForCategory(rows, [{ kind: 'mistake', refId: 'mistake:unknown', dueAt }], 'other', now),
    ).toBeNull();
  });
});

describe('weekly coach summary', () => {
  it('says plainly that there is not enough data yet', () => {
    const summary = buildWeeklyCoachSummary({ mistakes: [], sessions: [] }, now);
    expect(summary.hasData).toBe(false);
    expect(summary.nextAr).toContain('لأخبرك');
  });

  it('reports improvement, repetition and the next action from recorded evidence', () => {
    const rows = [
      mistake({ timestamp: now - 10 * DAY }),
      mistake({ timestamp: now - 11 * DAY }),
      mistake({ timestamp: now - 1 * DAY, id: 30 }),
      mistake({ timestamp: now - 2 * DAY, id: 31 }),
      mistake({ timestamp: now - 3 * DAY, id: 32 }),
    ];
    const summary = buildWeeklyCoachSummary(
      { mistakes: rows, sessions: [{ timestamp: now - DAY, accuracyPercent: 80, independentSentences: 5 }], dueReviewCount: 4 },
      now,
    );
    expect(summary.hasData).toBe(true);
    expect(summary.repeatedAr).toContain('يتكرر');
    expect(summary.nextAr).toContain('4');
  });

  it('never fabricates a trend when only sessions exist', () => {
    const summary = buildWeeklyCoachSummary(
      { mistakes: [mistake(), mistake({ id: 99 })], sessions: [{ timestamp: now - DAY, accuracyPercent: 90, independentSentences: 6 }] },
      now,
    );
    expect(summary.hasData).toBe(true);
    expect(summary.improvedAr).toBeTruthy();
  });
});
