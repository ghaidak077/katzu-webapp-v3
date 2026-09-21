import { describe, expect, it } from 'vitest';
import { getActivityDateKeys, getLastSevenDays } from '@/features/progress/ProgressScreen';

describe('progress activity data', () => {
  it('returns the seven calendar days ending on the reference date', () => {
    const days = getLastSevenDays(new Date(2026, 8, 21, 12));

    expect(days).toHaveLength(7);
    expect(days[0].dateKey).toBe('2026-09-15');
    expect(days[6].dateKey).toBe('2026-09-21');
  });

  it('marks only dates represented by stored sessions as active', () => {
    const sessions = [
      { timestamp: new Date(2026, 8, 20, 9).getTime() },
      { timestamp: new Date(2026, 8, 20, 18).getTime() },
    ];

    expect(getActivityDateKeys(sessions)).toEqual(new Set(['2026-09-20']));
  });
});
