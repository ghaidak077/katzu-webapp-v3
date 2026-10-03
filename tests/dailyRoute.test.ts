import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';

/**
 * The server-authoritative daily ledger, exercised through the real routes.
 *
 * The point of the whole feature is that the SERVER decides the day, so these
 * tests drive `/progress/sync` and `/progress/get` and assert the returned
 * authority: the daily cap, the seeded total, offset locking, and the fact that a
 * client reporting an inflated `total_points` cannot make it stick. No D1 is
 * configured, so the KV merge path runs — the same guarantee the D1 path overlays.
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

const USER = { sub: 'daily-user-a', email: 'a@test.dev' };

/** Seeds the KV session record `/auth/session` would create, so no D1 is needed. */
async function makeEnv() {
  const env: any = { USER_PROGRESS: new MemoryKv(), REDEEMED_CODES: new MemoryKv() };
  await env.USER_PROGRESS.put(
    `session:sess_${USER.sub}`,
    JSON.stringify({ sub: USER.sub, email: USER.email, created_at: Date.now(), expires_at: Date.now() + 3600_000 }),
  );
  return env;
}

function post(path: string, body: unknown, env: any, token = `sess_${USER.sub}`) {
  return worker.fetch(
    new Request(`https://worker.test${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  );
}

const SESSION = { id: 'sess:one', type: 'session', accuracyPercent: 100, assistedSentences: 0, mode: 'real' };
const TASKS = [
  { id: 'task:scenario', type: 'task', kind: 'scenario' },
  { id: 'task:grammar', type: 'task', kind: 'grammar' },
  { id: 'task:review', type: 'task', kind: 'review' },
];

describe('server-authoritative daily XP and streak (/progress/sync + /progress/get)', () => {
  it('seeds from the client total, awards the capped session XP, and reports the streak', async () => {
    const env = await makeEnv();
    const res = await post(
      '/progress/sync',
      {
        stats: { level: 'A1', total_points: 100, streak_days: 7, updated_at: Date.now() },
        daily: { offsetMinutes: 120, totalXp: 100, events: [SESSION, ...TASKS] },
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // 100 seeded + one 100%-unaided real session (300) = 400, never reset to 0.
    expect(body.daily.totalXp).toBe(400);
    expect(body.daily.xpToday).toBe(300);
    expect(body.daily.offsetMinutes).toBe(120);
    expect(body.daily.earnedToday).toBe(true);
    expect(body.daily.streakDays).toBe(1);
    // The merged stats carry the authoritative values, not the client's 100.
    expect(body.daily.cap).toBe(600);
  });

  it('is idempotent: replaying the same event ids does not double-credit', async () => {
    const env = await makeEnv();
    const payload = {
      stats: { level: 'A1', total_points: 0, updated_at: Date.now() },
      daily: { offsetMinutes: 0, totalXp: 0, events: [SESSION, ...TASKS] },
    };
    const first = await (await post('/progress/sync', payload, env)).json();
    expect(first.daily.totalXp).toBe(300);
    const second = await (await post('/progress/sync', payload, env)).json();
    expect(second.daily.totalXp).toBe(300);
  });

  it('clamps a client that inflates total_points to the plausible daily growth', async () => {
    const env = await makeEnv();
    await post(
      '/progress/sync',
      {
        stats: { level: 'A1', total_points: 0, updated_at: Date.now() },
        daily: { offsetMinutes: 0, totalXp: 0, events: [SESSION, ...TASKS] },
      },
      env,
    );
    // A follow-up sync claiming an absurd total must not raise the server's.
    await post(
      '/progress/sync',
      { stats: { level: 'A1', total_points: 999999, updated_at: Date.now() }, daily: { offsetMinutes: 0, totalXp: 999999, events: [] } },
      env,
    );
    const got = await (await post('/progress/get', {}, env)).json();
    // The server total is authoritative: the absurd 999999 is clamped to the one
    // elapsed day of plausible growth (300 + 600), not accepted (V29-4 hardening).
    expect(got.daily.totalXp).toBe(900);
    expect(got.stats.total_points).toBe(900);
  });

  it('locks the day offset on the first sync and ignores a later change', async () => {
    const env = await makeEnv();
    const first = await (
      await post(
        '/progress/sync',
        {
          stats: { level: 'A1', total_points: 0, updated_at: Date.now() },
          daily: { offsetMinutes: 180, totalXp: 0, events: [SESSION] },
        },
        env,
      )
    ).json();
    expect(first.daily.offsetMinutes).toBe(180);

    // The learner "moves timezone" — the server keeps the locked offset, so the
    // day boundary cannot be moved to grant a fresh day.
    const moved = await (
      await post(
        '/progress/sync',
        {
          stats: { level: 'A1', total_points: 0, updated_at: Date.now() },
          daily: { offsetMinutes: -300, totalXp: 0, events: [] },
        },
        env,
      )
    ).json();
    expect(moved.daily.offsetMinutes).toBe(180);
    expect(moved.daily.totalXp).toBe(300);
  });
});
