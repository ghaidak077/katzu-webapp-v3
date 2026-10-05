import { describe, expect, it } from 'vitest';
import { countdownLineAr, daysUntilTarget, shouldFeatureCountdown } from '@/lib/mission/examCountdown';
import { buildExamReminderIcs, reminderFileName } from '@/lib/reminder/ics';
import { buildShareLink, buildShareText } from '@/lib/offers/share';
import { selectDailyMission } from '@/lib/mission/selectMission';
import { teacherRewardSummary } from '../cloudflare-unified-worker';

/**
 * The launch day, as tests: the countdown, the calendar file, the share, and the
 * one rule a teacher reward must never break.
 *
 * The countdown and the reminder are the two places where a wrong number is
 * emotionally expensive — "in 900 days" after the exam has passed, or a calendar
 * entry on the wrong day. Both are pinned here rather than reasoned about.
 */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const inDays = (days: number) => NOW + days * DAY;

describe('the countdown to the learner\'s own date', () => {
  it('counts calendar days, and reads today as today', () => {
    expect(daysUntilTarget(inDays(0), NOW)).toBe(0);
    expect(daysUntilTarget(inDays(1), NOW)).toBe(1);
    expect(daysUntilTarget(inDays(10), NOW)).toBe(10);
  });

  it('never counts toward a date that has passed', () => {
    expect(daysUntilTarget(inDays(-1), NOW)).toBe(-1);
    expect(countdownLineAr(inDays(-1), 'exam', NOW)).toBeNull();
    expect(countdownLineAr(inDays(-400), 'exam', NOW)).toBeNull();
  });

  it('says nothing at all when no date was ever given', () => {
    expect(daysUntilTarget(null)).toBeNull();
    expect(daysUntilTarget(undefined)).toBeNull();
    expect(daysUntilTarget(Number.NaN)).toBeNull();
    expect(daysUntilTarget(0)).toBeNull();
    expect(countdownLineAr(null, 'exam', NOW)).toBeNull();
  });

  it('names the day in Arabic and never implies the learner is ready', () => {
    const line = countdownLineAr(inDays(0), 'exam', NOW) ?? '';
    expect(line).toMatch(/اليوم/);
    expect(line).toMatch(/امتحانك/);
    const long = countdownLineAr(inDays(45), 'exam', NOW) ?? '';
    expect(long).toMatch(/امتحانك/);
    expect(long).not.toMatch(/جاهز|ناجح|بالتوفيق/);
  });

  it('shouts only for an exam inside the last month', () => {
    expect(shouldFeatureCountdown(inDays(3), 'exam', NOW)).toBe(true);
    expect(shouldFeatureCountdown(inDays(30), 'exam', NOW)).toBe(true);
    expect(shouldFeatureCountdown(inDays(31), 'exam', NOW)).toBe(false);
    expect(shouldFeatureCountdown(inDays(3), 'move', NOW)).toBe(false);
    expect(shouldFeatureCountdown(null, 'exam', NOW)).toBe(false);
  });
});

describe('the mission and the countdown', () => {
  const base = {
    level: 'B1' as const,
    scenarios: [{ id: 's1', title_de: 'Im Café', title_ar: 'في المقهى', category: 'daily_life' }],
    training: [],
  };

  it('attaches the countdown without changing the mission it chose', () => {
    const withoutDate = selectDailyMission({ ...base, now: NOW });
    const withDate = selectDailyMission({ ...base, targetDate: inDays(5), targetDateKind: 'exam', now: NOW });
    expect(withDate.scenarioId).toBe(withoutDate.scenarioId);
    expect(withDate.kind).toBe(withoutDate.kind);
    expect(withDate.countdownAr).toMatch(/بقي/);
  });

  it('adds no line without a date, and none for a passed date', () => {
    expect(selectDailyMission({ ...base, now: NOW }).countdownAr).toBeUndefined();
    expect(
      selectDailyMission({ ...base, targetDate: inDays(-2), targetDateKind: 'exam', now: NOW }).countdownAr,
    ).toBeUndefined();
  });

  it('stays quiet 90 days out, when a countdown is noise', () => {
    expect(
      selectDailyMission({ ...base, targetDate: inDays(90), targetDateKind: 'exam', now: NOW }).countdownAr,
    ).toBeUndefined();
  });
});

describe('the calendar reminder', () => {
  // 20 November 2026, 09:00 UTC (month index 10 = November).
  const target = Date.UTC(2026, 10, 20, 9, 0, 0);

  it('writes a valid VCALENDAR that ends with CRLF', () => {
    const ics = buildExamReminderIcs({ targetDate: target, titleAr: 'امتحانك — كَاتْزُو' }) ?? '';
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.includes('\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });

  it('fires the day BEFORE the date, at the learner own time and never in UTC', () => {
    const timed = buildExamReminderIcs({ targetDate: target, titleAr: 'امتحانك', reminderTime: '18:30' }) ?? '';
    // The target is 2026-11-20 09:00 UTC; the entry must be the day before, at
    // 18:30 LOCAL — an exam is somewhere, not an instant in UTC.
    expect(timed).toMatch(/DTSTART:\d{8}T183000/);
    expect(timed).not.toMatch(/DTSTART[^:]*:\d{8}T\d{6}Z/);
    // Without a chosen time the entry is a whole day, one day before.
    const allDay = buildExamReminderIcs({ targetDate: target, titleAr: 'امتحانك' }) ?? '';
    const day = allDay.match(/DTSTART;VALUE=DATE:(\d{8})/)?.[1];
    expect(day).toBeDefined();
    expect(day).toBe('20261119');
  });

  it('ignores a nonsense reminder time instead of writing a broken event', () => {
    const bad = buildExamReminderIcs({ targetDate: target, titleAr: 'x', reminderTime: 'half past six' }) ?? '';
    const good = buildExamReminderIcs({ targetDate: target, titleAr: 'x' }) ?? '';
    expect(bad).toBe(good);
  });

  it('refuses to schedule anything without a date', () => {
    expect(buildExamReminderIcs({ targetDate: 0, titleAr: 'x' })).toBeNull();
    expect(buildExamReminderIcs({ targetDate: Number.NaN, titleAr: 'x' })).toBeNull();
  });

  it('keeps a long Arabic title on valid calendar lines', () => {
    const long = 'تذكير طويل جداً '.repeat(12);
    const ics = buildExamReminderIcs({ targetDate: target, titleAr: long }) ?? '';
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('names a file that replaces the previous download', () => {
    expect(reminderFileName(NOW)).toMatch(/^katzu-reminder-\d{8}\.ics$/);
    expect(reminderFileName(NOW)).toBe(reminderFileName(NOW + 60_000));
  });
});

describe('the share', () => {
  const appUrl = 'https://katzu-webapp-v3.pages.dev/';

  it('puts the referral code in the link and nothing else', () => {
    expect(buildShareLink({ appUrl, referralCode: 'ref-abcdefgh' })).toBe(
      `${appUrl.replace(/\/$/, '')}/mock?ref=REF-ABCDEFGH`,
    );
  });

  it('drops a code that does not look like one rather than putting it in a URL', () => {
    expect(buildShareLink({ appUrl, referralCode: '../../evil' })).toBe(`${appUrl.replace(/\/$/, '')}/mock`);
    expect(buildShareLink({ appUrl, referralCode: 'javascript:alert(1)' })).toBe(
      `${appUrl.replace(/\/$/, '')}/mock`,
    );
    expect(buildShareLink({ appUrl, referralCode: null })).toBe(`${appUrl.replace(/\/$/, '')}/mock`);
  });

  it('shares the number as a practice estimate, in the same words the card uses', () => {
    const text = buildShareText({ appUrl, estimate: 64, level: 'B1' });
    expect(text).toContain('64');
    expect(text).toMatch(/تقدير تدريبي/);
    expect(text).toMatch(/ليس درجة رسمية/);
    expect(text).not.toMatch(/goethe|telc|معتمد/i);
  });

  it('still shares something honest when there was no estimate to share', () => {
    const text = buildShareText({ appUrl, estimate: null });
    expect(text).toMatch(/[؀-ۿ]/);
    expect(text).not.toMatch(/\d+ من 100/);
  });
});

describe('the teacher reward', () => {
  it('counts redemptions, never codes printed', () => {
    const summary = teacherRewardSummary([
      { label: 'Mr Schmidt', created: 50, activated: 2 },
      { label: null, created: 10, activated: 0 },
    ]);
    expect(summary.rows[0]).toMatchObject({ created: 50, activated: 2, outstanding: 48, rewardMonths: 2 });
    expect(summary.rows[1]).toMatchObject({ activated: 0, rewardMonths: 0, outstanding: 10 });
    expect(summary.totalRewardMonths).toBe(2);
    expect(summary.totalOutstanding).toBe(58);
    expect(summary.unproven).toBe(true);
  });

  it('never rewards a redemption twice, or a negative count', () => {
    const summary = teacherRewardSummary([
      { label: 'A', created: 3, activated: 3 },
      { label: 'B', created: 1, activated: -5 },
    ]);
    expect(summary.totalRewardMonths).toBe(3);
    expect(summary.rows[1].rewardMonths).toBe(0);
  });

  it('answers for no labels at all', () => {
    const summary = teacherRewardSummary([]);
    expect(summary.rows).toEqual([]);
    expect(summary.totalRewardMonths).toBe(0);
  });
});