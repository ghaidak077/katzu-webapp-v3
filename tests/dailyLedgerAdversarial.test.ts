import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';
import {
  DAILY_XP_CAP,
  MAX_EVENTS_PER_SYNC,
  MAX_SEEN_EVENT_IDS,
  SEED_MAX_STREAK,
  SEED_MAX_TOTAL,
  applyDailyEvents,
  emptyDailyState,
  processDailySync,
  serverDayKey,
  shiftDayKey,
} from '../cloudflare-daily';

/**
 * ADVERSARIAL PROBE of the server-authoritative daily ledger (V29-4).
 *
 * The owner asked which of these attacks actually land:
 *   (a) replaying events, (b) lying about accuracy, (c) racing two devices, and
 *   (d) omitting the `daily` payload.
 *
 * These tests are written to FAIL LOUDLY if a bound ever widens, so the numbers
 * asserted below are the current, measured bounds — several of them are known
 * limitations, not victories. Each `it(...)` states in its name whether the
 * attack is BLOCKED or LANDS (and how far it gets). The prose report lives in
 * the reply; this file is the reproducible evidence.
 *
 * Threat model note: the SHIPPED client always sends `daily`
 * (`src/lib/api/workerClient.ts` builds it on every sync), so "omit `daily`" is a
 * hostile-client vector, not something an honest clock change produces. The V29-4
 * requirement — a device CLOCK/TIMEZONE change cannot grant a fresh day — is
 * satisfied for the shipped client; a modified client is a separate threat.
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

const USER = { sub: 'adv-user', email: 'adv@test.dev' };

async function makeEnv() {
  const env: any = { USER_PROGRESS: new MemoryKv(), REDEEMED_CODES: new MemoryKv() };
  await env.USER_PROGRESS.put(
    `session:sess_${USER.sub}`,
    JSON.stringify({ sub: USER.sub, email: USER.email, created_at: Date.now(), expires_at: Date.now() + 3600_000 }),
  );
  return env;
}

function post(path: string, body: unknown, env: any) {
  return worker.fetch(
    new Request(`https://worker.test${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer sess_${USER.sub}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  );
}

const sync = (env: any, body: unknown) => post('/progress/sync', body, env);
const get = (env: any) => post('/progress/get', {}, env);

// One perfect, unaided, REAL session = 300 XP.
const strongSession = (id: string) => ({ id, type: 'session', accuracyPercent: 100, assistedSentences: 0, mode: 'real' });
const task = (kind: 'scenario' | 'grammar' | 'review', id = `task:${kind}`) => ({ id, type: 'task', kind });

// ============================================================================
// (a) REPLAY
// ============================================================================
describe('attack: replaying events', () => {
  it('BLOCKED — replaying the same event id credits exactly once', async () => {
    const env = await makeEnv();
    const daily = { offsetMinutes: 0, totalXp: 0, events: [strongSession('sess:same')] };
    await sync(env, { stats: { level: 'A1', total_points: 0 }, daily });
    const replay = await (await sync(env, { stats: { level: 'A1', total_points: 0 }, daily })).json();
    expect(replay.daily.totalXp).toBe(300);
    expect(replay.daily.awarded).toBe(0);
  });

  it('LANDS (bounded) — minting a FRESH id for the same session is indistinguishable, so it replays up to the 600/day cap', async () => {
    const env = await makeEnv();
    await sync(env, { stats: { level: 'A1', total_points: 0 }, daily: { offsetMinutes: 0, totalXp: 0, events: [] } });
    // 10 "replays" of the same session, each with a new id (the client controls ids).
    for (let i = 0; i < 10; i += 1) {
      await sync(env, {
        stats: { level: 'A1', total_points: 0 },
        daily: { offsetMinutes: 0, totalXp: 0, events: [strongSession(`sess:fake-${i}`)] },
      });
    }
    const got = await (await get(env)).json();
    // It lands — but the server's daily cap is the ceiling, not the attacker's intent.
    expect(got.daily.xpToday).toBe(600);
    expect(got.daily.totalXp).toBe(600);
    expect(got.stats.total_points).toBe(600);
  });

  it('BLOCKED for realistic bursts — re-crediting an evicted id now needs more than MAX_SEEN_EVENT_IDS filler events', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv() };
    const now = Date.UTC(2026, 9, 3, 12, 0);
    // A cheap, unaided practice session = 50 XP.
    const cheap = { id: 'sess:evict-me', type: 'session', accuracyPercent: 0, assistedSentences: 0, mode: 'practice' };
    const first = await processDailySync(env, 'evict-user', { offsetMinutes: 0, totalXp: 0, events: [cheap] }, now);
    expect(first.totalXp).toBe(50);

    // The window is MAX_SEEN_EVENT_IDS; eviction now takes that many distinct ids.
    const batches = Math.ceil(MAX_SEEN_EVENT_IDS / MAX_EVENTS_PER_SYNC);
    for (let batch = 0; batch < batches; batch += 1) {
      const events = Array.from({ length: MAX_EVENTS_PER_SYNC }, (_, i) => ({
        id: `filler:${batch}:${i}`,
        type: 'task',
        kind: 'scenario',
      }));
      await processDailySync(env, 'evict-user', { offsetMinutes: 0, totalXp: 0, events }, now);
    }

    const replayed = await processDailySync(env, 'evict-user', { offsetMinutes: 0, totalXp: 0, events: [cheap] }, now);
    // Only after > MAX_SEEN_EVENT_IDS distinct ids is the original evicted; even
    // then the re-credit is bounded by the daily cap.
    expect(replayed.totalXp).toBe(100);
  });
});

// ============================================================================
// (b) LYING ABOUT ACCURACY
// ============================================================================
describe('attack: lying about accuracy', () => {
  it('LANDS (capped) — an absurd accuracy cannot exceed the daily cap', async () => {
    const env = await makeEnv();
    const res = await (
      await sync(env, {
        stats: { level: 'A1', total_points: 0 },
        daily: {
          offsetMinutes: 0,
          totalXp: 0,
          events: [{ id: 'sess:lie', type: 'session', accuracyPercent: 100000, assistedSentences: 0, mode: 'real' }],
        },
      })
    ).json();
    // sessionXpFor(100000%) = ~2325, clamped by the server to the day's remaining 600.
    expect(res.daily.xpToday).toBe(600);
    expect(res.daily.totalXp).toBe(600);
    expect(res.daily.cappedTo).toBeGreaterThan(0);
  });

  it('LANDS (capped) — a whole batch of perfect sessions is still capped at 600/day', async () => {
    const env = await makeEnv();
    const events = Array.from({ length: 50 }, (_, i) => strongSession(`sess:batch-${i}`));
    const res = await (
      await sync(env, { stats: { level: 'A1', total_points: 0 }, daily: { offsetMinutes: 0, totalXp: 0, events } })
    ).json();
    expect(res.daily.xpToday).toBe(600);
    expect(res.daily.totalXp).toBe(600);
  });

  it('BLOCKED — accuracy cannot push LIFETIME XP past one capped day per day (cap is per day, not per account)', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv() };
    const day1 = Date.UTC(2026, 9, 3, 12, 0);
    const day2 = Date.UTC(2026, 9, 4, 12, 0);
    const dayOne = [strongSession('sess:d1'), strongSession('sess:d2'), strongSession('sess:d3')];
    const one = await processDailySync(env, 'cap-user', { offsetMinutes: 0, totalXp: 0, events: dayOne }, day1);
    expect(one.totalXp).toBe(600);
    // NOTE: replaying the SAME ids on day 2 credits nothing (dedupe survives the
    // rollover) — the cap only refunds for genuinely new events.
    const replayNextDay = await processDailySync(env, 'cap-user', { offsetMinutes: 0, totalXp: 0, events: dayOne }, day2);
    expect(replayNextDay.xpToday).toBe(0);
    expect(replayNextDay.totalXp).toBe(600);
    // Fresh ids on the new server day refund the cap — 600 more, never unbounded within a day.
    const dayTwo = [strongSession('sess:e1'), strongSession('sess:e2'), strongSession('sess:e3')];
    const two = await processDailySync(env, 'cap-user', { offsetMinutes: 0, totalXp: 0, events: dayTwo }, day2);
    expect(two.totalXp).toBe(1200);
    expect(two.xpToday).toBe(600);
  });
});

// ============================================================================
// (c) RACING TWO DEVICES
// ============================================================================
describe('attack: racing two devices', () => {
  it('BLOCKED — two concurrent first syncs of the SAME event do not double-credit', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv() };
    const now = Date.UTC(2026, 9, 3, 12, 0);
    const payload = { offsetMinutes: 0, totalXp: 0, events: [strongSession('sess:race')] };
    await Promise.all([
      processDailySync(env, 'race-user', payload, now),
      processDailySync(env, 'race-user', payload, now),
    ]);
    const state = JSON.parse(await env.USER_PROGRESS.get('daily:race-user'));
    expect(state.totalXp).toBe(300); // last-write-wins, but never 600
  });

  it('BLOCKED (in-isolate) — concurrent DISTINCT events are serialized, so neither is lost', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv() };
    const now = Date.UTC(2026, 9, 3, 12, 0);
    await Promise.all([
      processDailySync(env, 'race-user', { offsetMinutes: 0, totalXp: 0, events: [strongSession('sess:devA')] }, now),
      processDailySync(env, 'race-user', { offsetMinutes: 0, totalXp: 0, events: [strongSession('sess:devB')] }, now),
    ]);
    const state = JSON.parse(await env.USER_PROGRESS.get('daily:race-user'));
    // Both sessions survive: the per-account lock serializes the read-modify-write
    // so a later write can no longer drop an earlier one's events.
    expect(state.totalXp).toBe(600);
  });

  it('BLOCKED — racing cannot widen the cap: repeated concurrent batches still stop at 600/day', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv() };
    const now = Date.UTC(2026, 9, 3, 12, 0);
    const batch = (tag: string) => ({
      offsetMinutes: 0,
      totalXp: 0,        events: [strongSession(`sess:${tag}-1`), strongSession(`sess:${tag}-2`), strongSession(`sess:${tag}-3`)],
    });
    await Promise.all([
      processDailySync(env, 'race-user', batch('A'), now),
      processDailySync(env, 'race-user', batch('B'), now),
      processDailySync(env, 'race-user', batch('C'), now),
    ]);
    const state = JSON.parse(await env.USER_PROGRESS.get('daily:race-user'));
    expect(state.xpToday).toBeLessThanOrEqual(600);
    expect(state.totalXp).toBeLessThanOrEqual(600);
  });

  it('BLOCKED — a later, different timezone cannot move the locked offset (the clock/timezone requirement)', async () => {
    const env = await makeEnv();
    const first = await (
      await sync(env, {
        stats: { level: 'A1', total_points: 0 },
        daily: { offsetMinutes: 180, totalXp: 0, events: [strongSession('sess:tz')] },
      })
    ).json();
    expect(first.daily.dayKey).toBe(serverDayKey(Date.now(), 180));
    const moved = await (
      await sync(env, {
        stats: { level: 'A1', total_points: 0 },
        daily: { offsetMinutes: -480, totalXp: 0, events: [] },
      })
    ).json();
    expect(moved.daily.offsetMinutes).toBe(180);
    expect(moved.daily.dayKey).toBe(first.daily.dayKey);
  });
});

// ============================================================================
// (d) OMITTING THE `daily` PAYLOAD
// ============================================================================
describe('attack: omitting the daily payload', () => {
  it('BLOCKED — a sync with NO daily payload now CREATES the ledger, so the streak is server-owned and the total is capped', async () => {
    const env = await makeEnv();
    await sync(env, { stats: { level: 'A1', total_points: 5_000_000, streak_days: 999, updated_at: Date.now() } });
    const got = await (await get(env)).json();
    // A ledger now exists (the client can no longer opt out), so the claim is not
    // trusted verbatim.
    expect(got.daily).not.toBeNull();
    // The streak is server-owned: no earned day was reported, so it is 0.
    expect(got.stats.streak_days).toBe(0);
    expect(got.daily.streakDays).toBe(0);
    // The lifetime total is seeded once and clamped, never the raw claim.
    expect(got.daily.totalXp).toBe(SEED_MAX_TOTAL + DAILY_XP_CAP);
    expect(got.stats.total_points).toBe(SEED_MAX_TOTAL + DAILY_XP_CAP);
  });

  it('CLAMPED — once a ledger exists, a stats-only sync can raise the total only by the plausible daily cap, never the streak', async () => {
    const env = await makeEnv();
    // First sync creates the ledger with a modest total.
    await sync(env, {
      stats: { level: 'A1', total_points: 10, updated_at: Date.now() },
      daily: { offsetMinutes: 0, totalXp: 10, events: [] },
    });
    // Then a stats-only sync tries to inflate.
    await sync(env, { stats: { level: 'A1', total_points: 999999, streak_days: 999, updated_at: Date.now() } });
    const got = await (await get(env)).json();
    // One elapsed day of plausible growth (10 + 600), not 999999.
    expect(got.stats.total_points).toBe(10 + DAILY_XP_CAP);
    expect(got.stats.streak_days).toBe(0);
  });
});

// ============================================================================
// (e) FIRST-SYNC TRUST: the one-time seed
// ============================================================================
describe('attack: abusing the one-time first-sync seed', () => {
  it('BLOCKED (bounded) — the lifetime seed is clamped, so a hostile first sync cannot mint an arbitrary total', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv() };
    const now = Date.UTC(2026, 9, 3, 12, 0);
    const res = await processDailySync(env, 'seed-user', { offsetMinutes: 0, totalXp: 1_000_000_000, events: [] }, now);
    // Clamped to SEED_MAX_TOTAL, then at most one plausible day is reconciled on top.
    expect(res.totalXp).toBe(SEED_MAX_TOTAL + DAILY_XP_CAP);
  });

  it('LANDS (bounded) — a fabricated completed-day history mints a streak, but never past SEED_MAX_STREAK', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv() };
    const now = Date.UTC(2026, 9, 3, 12, 0);
    const today = serverDayKey(now, 0);
    // 30 consecutive completed days ending yesterday — a brand-new account with a 30-day streak.
    const history = Array.from({ length: 30 }, (_, i) => shiftDayKey(today, -(i + 1)));
    const res = await processDailySync(env, 'seed-user', { offsetMinutes: 0, totalXp: 0, history, events: [] }, now);
    expect(res.streakDays).toBe(30);

    // Two fabricated years are trimmed to SEED_MAX_STREAK.
    const env2: any = { USER_PROGRESS: new MemoryKv() };
    const longHistory = Array.from({ length: 730 }, (_, i) => shiftDayKey(today, -(i + 1)));
    const capped = await processDailySync(env2, 'seed-user', { offsetMinutes: 0, totalXp: 0, history: longHistory, events: [] }, now);
    expect(capped.streakDays).toBe(SEED_MAX_STREAK);
  });

  it('BLOCKED — a future day key is rejected from the seed history', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv() };
    const now = Date.UTC(2026, 9, 3, 12, 0);
    const res = await processDailySync(
      env,
      'seed-user',
      { offsetMinutes: 0, totalXp: 0, history: ['2999-01-01', '2026-09-01'], events: [] },
      now,
    );
    expect(res.streakDays).toBe(0);
  });
});

// ============================================================================
// (f) FAKE TASK COMPLETION (no work done)
// ============================================================================
describe('attack: asserting task completion without doing the work', () => {
  it('LANDS (bounded to 1/day) — claiming all three tasks earns the day and seeds the streak', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv() };
    const now = Date.UTC(2026, 9, 3, 12, 0);
    const res = await processDailySync(
      env,
      'task-user',
      { offsetMinutes: 0, totalXp: 0, events: [task('scenario', 'task:s1'), task('grammar', 'task:s2'), task('review', 'task:s3')] },
      now,
    );
    expect(res.earnedToday).toBe(true);
    expect(res.streakDays).toBe(1);
    // Only one day can be earned per server day, so the streak grows at most 1/day.
  });
});

// ============================================================================
// (g) PURE RULE EDGES
// ============================================================================
describe('rule edges an attacker might probe', () => {
  it('BLOCKED — the offset is clamped to the real inhabited range', () => {
    expect(serverDayKey(Date.UTC(2026, 9, 3, 12, 0), 99999)).toBe(serverDayKey(Date.UTC(2026, 9, 3, 12, 0), 840));
    expect(serverDayKey(Date.UTC(2026, 9, 3, 12, 0), -99999)).toBe(serverDayKey(Date.UTC(2026, 9, 3, 12, 0), -720));
  });

  it('BLOCKED — a malformed / short event id is dropped instead of credited', () => {
    const now = Date.UTC(2026, 9, 3, 12, 0);
    const { state } = applyDailyEvents(
      emptyDailyState(now, 0),
      [strongSession('ab'), strongSession(''), { id: 123, type: 'session' } as any],
      now,
    );
    expect(state.totalXp).toBe(0);
  });

  it('BLOCKED — an unknown event type is ignored (no XP, no task)', () => {
    const now = Date.UTC(2026, 9, 3, 12, 0);
    const { state } = applyDailyEvents(
      emptyDailyState(now, 0),
      [{ id: 'x:1', type: 'setTotal', totalXp: 999999 } as any],
      now,
    );
    expect(state.totalXp).toBe(0);
    expect(state.xpToday).toBe(0);
  });
});
