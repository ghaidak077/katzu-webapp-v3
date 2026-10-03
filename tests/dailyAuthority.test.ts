import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, wipeUserScopedData } from '@/lib/db/katzuDb';
import { localDateKey } from '@/lib/utils/streak';
import { sessionXp } from '@/lib/progress/sessionXp';
import { dailyTaskStreak } from '@/lib/daily/tasks';
import {
  applyDailyEvents,
  clampOffset,
  dailyResponse,
  dailyStreak,
  emptyDailyState,
  overlayStatsWithDaily,
  processDailySync,
  serverDayKey,
  sessionXpFor,
} from '../cloudflare-daily';
import {
  adoptDailyAuthority,
  buildDailyPayload,
  clearDailyEvents,
  enqueueDailyEvent,
  readDailyEventQueue,
  sessionEventId,
} from '@/lib/progress/dailyAuthority';
import type { DailyAuthority } from '@/types/models';

/**
 * Server-authoritative daily XP + streak (V29).
 *
 * The owner requirement: a device clock or timezone change must no longer grant
 * a fresh day. That is enforced server-side, so these tests pin (a) the worker's
 * rules as exact twins of the client's, (b) the day/cap/streak arithmetic
 * against a fixed clock, and (c) the client's queue + adopt path.
 */

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key) || null;
  }
  async put(key: string, value: string) {
    this.values.set(key, value);
  }
  async delete(key: string) {
    this.values.delete(key);
  }
}

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
});

describe('worker rules are exact twins of the client rules', () => {
  it('sessionXpFor mirrors sessionXp for every mode and assist level', () => {
    const cases = [
      { accuracyPercent: 100, assistedSentences: 0, mode: 'real' as const },
      { accuracyPercent: 100, assistedSentences: 0, mode: 'practice' as const },
      { accuracyPercent: 80, assistedSentences: 0, mode: 'real' as const },
      { accuracyPercent: 65, assistedSentences: 2, mode: 'practice' as const },
      { accuracyPercent: null, assistedSentences: 1, mode: 'practice' as const },
      { accuracyPercent: 0, assistedSentences: 0, mode: 'real' as const },
    ];
    for (const c of cases) {
      expect(sessionXpFor(c)).toBe(
        sessionXp({ accuracyPercent: c.accuracyPercent, assistedSentences: c.assistedSentences, mode: c.mode }),
      );
    }
  });

  it('dailyStreak mirrors the client daily-task streak', () => {
    const cases = [
      { completedDateKeys: ['2026-10-01', '2026-10-02', '2026-10-03'], todayKey: '2026-10-03', completedToday: true },
      { completedDateKeys: ['2026-10-01', '2026-10-02'], todayKey: '2026-10-03', completedToday: false },
      { completedDateKeys: ['2026-10-01'], todayKey: '2026-10-03', completedToday: false },
      { completedDateKeys: [], todayKey: '2026-10-03', completedToday: false },
      { completedDateKeys: ['2026-09-20', '2026-10-01', '2026-10-02', '2026-10-03'], todayKey: '2026-10-03', completedToday: true },
    ];
    for (const c of cases) {
      expect(dailyStreak(c).streakDays).toBe(dailyTaskStreak(c).streakDays);
    }
  });
});

describe('the server day', () => {
  it('is derived from the server clock plus a clamped offset', () => {
    const t = Date.UTC(2026, 9, 3, 22, 30); // 2026-10-03 22:30 UTC
    expect(serverDayKey(t, 0)).toBe('2026-10-03');
    expect(serverDayKey(t, 120)).toBe('2026-10-04'); // +02:00 crosses midnight
    expect(serverDayKey(t, -120)).toBe('2026-10-03');
    expect(clampOffset(99999)).toBe(840);
    expect(clampOffset(-99999)).toBe(-720);
    expect(clampOffset('nonsense')).toBe(0);
  });

  it('caps the daily XP against the SERVER day', () => {
    const now = Date.UTC(2026, 9, 3, 12, 0);
    const session = (i: number) => ({ id: `sess:${i}`, type: 'session', accuracyPercent: 100, assistedSentences: 0, mode: 'real' });
    // One 100%-unaided session is 300 XP, so two hit the 600 cap and the rest are refused.
    const { state, cappedTo } = applyDailyEvents(emptyDailyState(now, 0), [session(1), session(2), session(3), session(4)], now);
    expect(state.xpToday).toBe(600);
    expect(state.totalXp).toBe(600);
    expect(cappedTo).toBe(600);
  });

  it('credits each event exactly once, however often it is retried', () => {
    const now = Date.UTC(2026, 9, 3, 12, 0);
    const session = { id: 'sess:once', type: 'session', accuracyPercent: 100, assistedSentences: 0, mode: 'real' };
    const first = applyDailyEvents(emptyDailyState(now, 0), [session], now);
    const replay = applyDailyEvents(first.state, [session], now);
    expect(first.state.totalXp).toBe(300);
    expect(replay.state.totalXp).toBe(300);
    expect(replay.awarded).toBe(0);
  });

  it('resets the cap only when the SERVER clock reaches a new day', () => {
    const day1 = Date.UTC(2026, 9, 3, 12, 0);
    const day2 = Date.UTC(2026, 9, 4, 12, 0);
    const session = (i: string) => ({ id: `sess:${i}`, type: 'session', accuracyPercent: 100, assistedSentences: 0, mode: 'real' });
    const one = applyDailyEvents(emptyDailyState(day1, 0), [session('a')], day1).state;
    expect(one.xpToday).toBe(300);
    const rolled = applyDailyEvents(one, [session('b')], day2).state;
    expect(rolled.dayKey).toBe('2026-10-04');
    expect(rolled.xpToday).toBe(300);
    expect(rolled.totalXp).toBe(600); // lifetime keeps accumulating
  });

  it('earns a day only when all three tasks complete', () => {
    const now = Date.UTC(2026, 9, 3, 9, 0);
    const events = [
      { id: 'task:scenario', type: 'task', kind: 'scenario' },
      { id: 'task:grammar', type: 'task', kind: 'grammar' },
    ];
    const partial = applyDailyEvents(emptyDailyState(now, 0), events, now).state;
    expect(dailyResponse(partial).earnedToday).toBe(false);
    expect(dailyResponse(partial).streakDays).toBe(0);

    const full = applyDailyEvents(partial, [{ id: 'task:review', type: 'task', kind: 'review' }], now).state;
    expect(dailyResponse(full).earnedToday).toBe(true);
    expect(full.earnedDayKeys).toContain('2026-10-03');
  });

  it('overlays the authoritative values so a client total cannot stick', () => {
    const out = overlayStatsWithDaily(
      { total_points: 99999, streak_days: 42, level: 'B1' },
      { totalXp: 300, streakDays: 1 },
    );
    expect(out.total_points).toBe(300);
    expect(out.streak_days).toBe(1);
    expect(out.level).toBe('B1');
  });

  it('seeds the ledger once, locks the offset, and clamps a bogus later total to plausible growth', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv() };
    const day1 = Date.UTC(2026, 9, 3, 12, 0);
    const first = await processDailySync(
      env,
      'user-1',
      { offsetMinutes: 120, totalXp: 500, history: ['2026-10-01', '2026-10-02'], events: [] },
      day1,
    );
    expect(first.totalXp).toBe(500); // not reset to 0
    expect(first.offsetMinutes).toBe(120);

    // A later sync claiming a different timezone and an absurd total is NOT
    // trusted: the offset is locked and the claimed 100000 is clamped to the
    // plausible growth (+600 for the one elapsed day), never a jump.
    const day1Later = Date.UTC(2026, 9, 3, 13, 0);
    const second = await processDailySync(
      env,
      'user-1',
      { offsetMinutes: -480, totalXp: 100000, history: ['2020-01-01'], events: [] },
      day1Later,
    );
    expect(second.offsetMinutes).toBe(120);
    expect(second.totalXp).toBe(1100);
  });
});

describe('the client ledger bridge', () => {
  beforeEach(async () => {
    await db.users.clear();
    await db.daily_tasks.clear();
  });

  it('queues session events durably and reports today\u2019s tasks in the payload', async () => {
    await db.users.put({ id: 'current_user', totalXp: 250 } as any);
    await db.daily_tasks.put({
      dateKey: localDateKey(),
      scenario: true,
      grammar: true,
      review: false,
      reviewReps: 3,
      updatedAt: Date.now(),
    });
    enqueueDailyEvent({ id: sessionEventId(111), type: 'session', accuracyPercent: 50, assistedSentences: 0, mode: 'practice' });
    expect(readDailyEventQueue()).toHaveLength(1);

    const payload = await buildDailyPayload();
    expect(payload.totalXp).toBe(250);
    expect(payload.offsetMinutes).toBeTypeOf('number');
    expect(payload.today?.scenario).toBe(true);
    expect(payload.events.some((event) => event.type === 'session')).toBe(true);
    expect(payload.events.some((event) => event.type === 'task' && event.kind === 'scenario')).toBe(true);
  });

  it('adopts the server authority onto the user row', async () => {
    await db.users.put({ id: 'current_user', totalXp: 9999, streakDays: 40 } as any);
    const daily: DailyAuthority = {
      dayKey: '2026-10-03',
      offsetMinutes: 120,
      xpToday: 300,
      totalXp: 300,
      streakDays: 2,
      cap: 600,
      earnedToday: true,
      tasks: { scenario: true, grammar: true, review: true },
      updatedAt: 1,
    };
    await adoptDailyAuthority(daily);
    const user = await db.users.get('current_user');
    expect(user?.totalXp).toBe(300);
    expect(user?.streakDays).toBe(2);
    expect(user?.dailyAuthority?.earnedToday).toBe(true);
  });

  it('clears only the session events the server accepted', () => {
    enqueueDailyEvent({ id: 'sess:keep', type: 'session', accuracyPercent: 1, assistedSentences: 0, mode: 'practice' });
    enqueueDailyEvent({ id: 'sess:drop', type: 'session', accuracyPercent: 1, assistedSentences: 0, mode: 'practice' });
    clearDailyEvents(['sess:drop']);
    expect(readDailyEventQueue().map((event) => event.id)).toEqual(['sess:keep']);
  });

  it('sign-out wipes the durable queue so one account\u2019s sessions cannot leak into the next', async () => {
    enqueueDailyEvent({ id: 'sess:leak', type: 'session', accuracyPercent: 90, assistedSentences: 0, mode: 'practice' });
    expect(readDailyEventQueue()).toHaveLength(1);
    await wipeUserScopedData();
    expect(readDailyEventQueue()).toHaveLength(0);
  });
});
