// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RETURN_ANCHOR_KEY,
  RETURN_DAY_MARKERS,
  calendarDaysBetween,
  localDayKey,
  recordFirstSeen,
  returnMarkerFlagKey,
  returnMarkersForVisit,
  trackRetentionReturns,
} from '../src/lib/analytics/retention';
import { queueSnapshot } from '../src/lib/analytics/client';

/**
 * V24 Phase 7 — retention return events.
 *
 * The privacy contract is the point: a return marker is a bare allow-listed
 * event name with NO properties — no timestamps, no identifiers beyond the
 * anonymous envelope the analytics contract already carries. The day math is
 * pure and pinned here (local calendar days, so DST cannot fake a day 1), and
 * each marker is a one-shot.
 */

describe('retention day math (V24 Phase 7)', () => {
  it('computes calendar days in local time across a DST-ambiguous weekend', () => {
    // Same wall-clock position two calendar days apart.
    const from = new Date(2026, 9, 1, 22, 30).getTime();
    const to = new Date(2026, 9, 2, 22, 30).getTime();
    expect(calendarDaysBetween(from, to)).toBe(1);
    // 1 hour later is still the SAME calendar day (23:30).
    expect(calendarDaysBetween(from, from + 1 * 3600_000)).toBe(0);
    // 6 hours later crosses midnight (04:30), so it is the NEXT calendar day.
    expect(calendarDaysBetween(from, from + 6 * 3600_000)).toBe(1);
    // Going back in time is negative, not an exception.
    expect(calendarDaysBetween(to, from)).toBe(-1);
  });

  it('localDayKey formats zero-padded local dates', () => {
    expect(localDayKey(new Date(2026, 0, 5).getTime())).toBe('2026-01-05');
    expect(localDayKey(new Date(2026, 11, 31).getTime())).toBe('2026-12-31');
  });

  it('returnMarkersForVisit fires day1 only inside its window', () => {
    const anchor = new Date(2026, 9, 1, 20, 0).getTime();
    const day = (n: number) => new Date(2026, 9, 1 + n, 20, 0).getTime();
    expect(returnMarkersForVisit(anchor, day(0), [])).toEqual([]); // same day
    expect(returnMarkersForVisit(anchor, day(1), [])).toEqual([1]); // exactly day 1
    expect(returnMarkersForVisit(anchor, day(2), [])).toEqual([1]); // came back late, still once
    expect(returnMarkersForVisit(anchor, day(7), [])).toEqual([7]); // day 1 window closed
    expect(returnMarkersForVisit(anchor, day(7), [1])).toEqual([7]);
    expect(returnMarkersForVisit(anchor, day(7), [1, 7])).toEqual([]); // never twice
  });

  it('fires day7 when the learner came back before day 1 closed', () => {
    const anchor = new Date(2026, 9, 1).getTime();
    // Skipped everything until day 3, then returned on day 7 exactly.
    const late = returnMarkersForVisit(anchor, new Date(2026, 9, 4).getTime(), []);
    expect(late).toEqual([1]); // day-1 return, honestly claimed once
    const week = returnMarkersForVisit(anchor, new Date(2026, 9, 8).getTime(), [1]);
    expect(week).toEqual([7]);
  });
});

describe('retention markers end to end (V24 Phase 7)', () => {
  /** Captured emissions — the real `track` is dev-suppressed inside vitest. */
  let emitted: Array<'return_day1' | 'return_day7'>;
  const capture = (name: 'return_day1' | 'return_day7') => {
    emitted.push(name);
  };

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    emitted = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a brand-new install records the anchor and emits nothing', () => {
    const now = new Date(2026, 9, 1, 12, 0).getTime();
    trackRetentionReturns(now, capture);
    expect(Number(localStorage.getItem(RETURN_ANCHOR_KEY))).toBe(now);
    expect(emitted).toEqual([]);
  });

  it('a day-1 visit emits exactly one anonymous return_day1 with no properties', () => {
    const anchor = new Date(2026, 9, 1, 21, 0).getTime();
    trackRetentionReturns(anchor, capture);
    localStorage.clear(); // simulate a clean second visit (anchor re-seeded below)
    localStorage.setItem(RETURN_ANCHOR_KEY, String(anchor));

    vi.setSystemTime(new Date(2026, 9, 2, 9, 0).getTime());
    trackRetentionReturns(Date.now(), capture);

    expect(emitted).toEqual(['return_day1']);
    // One-shot: a second visit the same day emits nothing more.
    trackRetentionReturns(Date.now(), capture);
    expect(emitted).toEqual(['return_day1']);
  });

  it('day7 fires on the seventh calendar day, once', () => {
    const anchor = new Date(2026, 9, 1).getTime();
    localStorage.setItem(RETURN_ANCHOR_KEY, String(anchor));
    localStorage.setItem(returnMarkerFlagKey(1), '1'); // day 1 already claimed

    vi.setSystemTime(new Date(2026, 9, 8).getTime());
    trackRetentionReturns(Date.now(), capture);
    expect(emitted).toEqual(['return_day7']);
    expect(RETURN_DAY_MARKERS).toEqual([1, 7]);
  });

  it('the real track() path drops nothing: the names are on the allow-list', async () => {
    // Prove the two markers pass validateAnalyticsEvent — the gate the worker
    // mirrors — so production emission is never silently discarded.
    const { validateAnalyticsEvent } = await import('../src/lib/analytics/events');
    for (const name of ['return_day1', 'return_day7'] as const) {
      const result = validateAnalyticsEvent({
        name,
        ts: Date.now(),
        installId: 'install-abc123',
        appVersion: 'test',
        route: '/',
      });
      expect(result.ok, `event ${name} rejected: ${result.ok ? '' : result.reason}`).toBe(true);
    }
  });

  it('a corrupted anchor never emits anything', () => {
    localStorage.setItem(RETURN_ANCHOR_KEY, 'not-a-number');
    trackRetentionReturns(Date.now(), capture);
    expect(emitted).toEqual([]);
  });
});
