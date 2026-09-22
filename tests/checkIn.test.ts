import { describe, expect, it } from 'vitest';
import { buildCheckInMessage } from '../src/lib/utils/checkIn';

describe('Katzu check-in', () => {
  const T = '2026-09-22';

  it('greets first-time users without assuming any history', () => {
    const msg = buildCheckInMessage({ lastActiveDate: '', streakDays: 0, todayKey: T });
    expect(msg.tone).toBe('first');
    expect(msg.headline).toContain('كَاتْزُو');
  });

  it('never shows a streak number for first-time users', () => {
    const msg = buildCheckInMessage({ lastActiveDate: null, streakDays: 0, todayKey: T });
    expect(msg.headline).not.toMatch(/\d+/);
  });

  it('encourages a same-day return without inflating the streak', () => {
    const msg = buildCheckInMessage({ lastActiveDate: T, streakDays: 4, todayKey: T });
    expect(msg.tone).toBe('returning');
    expect(msg.headline).not.toContain('4');
  });

  it('celebrates keeping the streak when returning the next day', () => {
    const msg = buildCheckInMessage({ lastActiveDate: '2026-09-21', streakDays: 5, todayKey: T });
    expect(msg.tone).toBe('streak-keep');
    expect(msg.headline).toContain('5');
  });

  it('welcomes back after a gap with zero guilt-tripping', () => {
    const msg = buildCheckInMessage({ lastActiveDate: '2026-09-10', streakDays: 0, todayKey: T });
    expect(msg.tone).toBe('welcome-back');
    expect(msg.headline).toMatch(/منور|اشتاقت/);
  });

  it('persona rule: never roasts the learner', () => {
    const tones = [
      buildCheckInMessage({ lastActiveDate: '', streakDays: 0, todayKey: T }),
      buildCheckInMessage({ lastActiveDate: T, streakDays: 4, todayKey: T }),
      buildCheckInMessage({ lastActiveDate: '2026-09-21', streakDays: 5, todayKey: T }),
      buildCheckInMessage({ lastActiveDate: '2026-01-01', streakDays: 0, todayKey: T }),
    ];
    for (const msg of tones) {
      for (const field of [msg.headline, msg.sub]) {
        expect(field).not.toMatch(/فاشل|كسول|تقصير|خسرت|ضيعت/);
      }
    }
  });
});
