import { describe, expect, it } from 'vitest';
import { dayIndexFor, pickDailyMission } from '../src/lib/utils/dailyMission';

const pool = [
  { id: 'cafe_order', title_de: 'Im Café bestellen', title_ar: 'الطلب في المقهى', category: 'daily_life' },
  { id: 'bakery_shopping', title_de: 'Beim Bäcker einkaufen', title_ar: 'التسوق عند الخباز', category: 'daily_life' },
  { id: 'doctor_visit', title_de: 'Beim Arzt', title_ar: 'زيارة الطبيب', category: 'health' },
];

describe('daily mission rotation', () => {
  it('is deterministic for a given date', () => {
    const date = new Date(2026, 8, 22);
    const a = pickDailyMission(pool, 'A1', date);
    const b = pickDailyMission(pool, 'A1', date);
    expect(a).not.toBeNull();
    expect(a!.scenario.id).toBe(b!.scenario.id);
  });

  it('rotates to a different scenario the next day', () => {
    const day1 = pickDailyMission(pool, 'A1', new Date(2026, 8, 22))!;
    const day2 = pickDailyMission(pool, 'A1', new Date(2026, 8, 23))!;
    expect(day1.scenario.id).not.toBe(day2.scenario.id);
    expect(day2.position).toBe((day1.position % pool.length) + 1);
  });

  it('wraps around after completing the pool cycle', () => {
    const first = pickDailyMission(pool, 'A1', new Date(2026, 8, 22))!;
    const afterCycle = pickDailyMission(pool, 'A1', new Date(2026, 8, 22 + pool.length))!;
    expect(afterCycle.scenario.id).toBe(first.scenario.id);
    expect(afterCycle.position).toBe(first.position);
  });

  it('survives a negative day index (dates before epoch)', () => {
    const mission = pickDailyMission(pool, 'A1', new Date(2025, 11, 31));
    expect(mission).not.toBeNull();
    expect(mission!.position).toBeGreaterThanOrEqual(1);
    expect(mission!.position).toBeLessThanOrEqual(pool.length);
  });

  it('handles an empty scenario pool gracefully', () => {
    expect(pickDailyMission([], 'A1', new Date(2026, 8, 22))).toBeNull();
  });

  it('dayIndexFor is stable within a day and advances by 1 across midnight', () => {
    expect(dayIndexFor(new Date(2026, 8, 22, 0, 0, 0))).toBe(dayIndexFor(new Date(2026, 8, 22, 23, 59, 59)));
    expect(dayIndexFor(new Date(2026, 8, 23, 0, 0, 0))).toBe(dayIndexFor(new Date(2026, 8, 22, 12, 0, 0)) + 1);
  });
});
