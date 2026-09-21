import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../cloudflare-unified-worker';
import { createSqliteD1 } from './sqliteD1';

class FakeKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) || null; }
}

const DAY = 86_400_000;
const START = Date.parse('2026-09-21T10:00:00Z');

describe('Worker access tiers and quota through HTTP handlers', () => {
  const sessionSecret = 'quota-test-session-secret';
  let mode: 'success' | 'failure' = 'success';
  let d1: ReturnType<typeof createSqliteD1>;
  let kv: FakeKv;
  let env: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    d1 = createSqliteD1();
    kv = new FakeKv();
    mode = 'success';
    env = {
      GOOGLE_CLIENT_ID: 'client-id',
      SESSION_SECRET: sessionSecret,
      GEMINI_API_KEY: 'test-key',
      AI_RATE_LIMIT_PER_MINUTE: '1000',
      AI_RATE_LIMIT_PER_DAY: '1000',
      DB: d1,
      REDEEMED_CODES: kv,
    };
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        if (mode === 'failure') return new Response('failed', { status: 500 });
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"reply_de":"Hallo","reply_ar":"مرحباً","is_correct":true}' }] } }],
        }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function sessionFor(sub = 'quota-user') {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode({ sub, email: `${sub}@example.com`, aud: 'katzu', exp: Math.floor(Date.now() / 1000) + 3600 });
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(sessionSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`));
    return `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`;
  }

  const call = async (path: string, body: Record<string, unknown>, token?: string) => worker.fetch(new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? await sessionFor()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env);

  const turn = (sessionId: string, overrides: Record<string, unknown> = {}, token?: string) => call('/ai/turn', {
    user_message: 'Hallo', scenario_id: 'test', scenario_title: 'Test', cefr_level: 'A1', session_id: sessionId, ...overrides,
  }, token);

  const status = async () => (await call('/check-status', {})).json();
  const rows = (sql: string, ...args: unknown[]) => d1.raw.prepare(sql).all(...args) as Record<string, unknown>[];
  const startOf = () => Number(rows('SELECT trial_started_at AS t FROM accounts')[0]?.t);
  const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}-${index}-session`);
  const successes = (responses: Response[]) => responses.filter((r) => r.status === 200).length;

  it('starts the trial once and never restarts it', async () => {
    const first = await status();
    expect(first).toMatchObject({ tier: 'trial', sessions_limit_today: 5, allowed_levels: ['A1', 'A2', 'B1', 'B2'] });
    const started = startOf();
    expect(started).toBe(START);
    vi.setSystemTime(START + 2 * DAY);
    await status();
    await turn('later-session');
    expect(startOf()).toBe(started);
    expect(rows('SELECT COUNT(*) AS n FROM accounts')[0].n).toBe(1);
  });

  it('gives trial users exactly TRIAL_DAILY_SESSIONS fresh sessions per day at any level, then resets next day', async () => {
    const responses = await Promise.all(ids('trial', 20).map((id) => turn(id, { cefr_level: 'B1' })));
    expect(successes(responses)).toBe(5);
    const blocked = responses.filter((r) => r.status === 402);
    expect(blocked).toHaveLength(15);
    expect((await blocked[0].json()).code).toBe('DAILY_FREE_LIMIT');
    expect(rows('SELECT COUNT(*) AS n FROM trial_sessions')[0].n).toBe(5);

    vi.setSystemTime(START + DAY);
    expect((await turn('next-day-session', { cefr_level: 'B2' })).status).toBe(200);
  });

  it('turns a user into free after TRIAL_DAYS: locked levels, one A1 session per day', async () => {
    await status();
    vi.setSystemTime(START + 8 * DAY);
    const after = await status();
    expect(after).toMatchObject({ tier: 'free', trial_ends_at: null, sessions_limit_today: 1, allowed_levels: ['A1'] });

    const locked = await turn('locked-level-session', { cefr_level: 'B1' });
    expect(locked.status).toBe(402);
    expect((await locked.json()).code).toBe('LEVEL_LOCKED');
    expect(rows('SELECT COUNT(*) AS n FROM trial_sessions')[0].n).toBe(0);

    const responses = await Promise.all(ids('free', 20).map((id) => turn(id)));
    expect(successes(responses)).toBe(1);
    expect(rows('SELECT COUNT(*) AS n FROM trial_sessions')[0].n).toBe(1);

    vi.setSystemTime(START + 9 * DAY);
    expect((await turn('free-next-day-session')).status).toBe(200);
  });

  it('allows exactly MAX_SESSION_TURNS parallel turns in one session and uses one session', async () => {
    const responses = await Promise.all(Array.from({ length: 20 }, () => turn('single-session-id')));
    expect(successes(responses)).toBe(12);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(8);
    expect(rows('SELECT turns FROM trial_sessions')).toEqual([{ turns: 12 }]);
  });

  it('keeps a session that started before midnight on its original day', async () => {
    vi.setSystemTime(Date.parse('2026-09-21T23:59:50Z'));
    expect((await turn('midnight-session')).status).toBe(200);
    vi.setSystemTime(Date.parse('2026-09-22T00:00:10Z'));
    expect((await turn('midnight-session')).status).toBe(200);
    expect(rows('SELECT day, turns FROM trial_sessions')).toEqual([{ day: '2026-09-21', turns: 2 }]);
    expect((await status()).sessions_used_today).toBe(0);
  });

  it('never creates session rows for pro users and limits them only by the daily cap', async () => {
    kv.values.set('account:quota-user', JSON.stringify({ expiresAt: new Date(START + 30 * DAY).toISOString() }));
    env.AI_DAILY_TURN_CAP = '2';
    const responses = await Promise.all(ids('pro', 5).map((id) => turn(id, { cefr_level: 'B2' })));
    expect(successes(responses)).toBe(2);
    expect(rows('SELECT COUNT(*) AS n FROM trial_sessions')[0].n).toBe(0);
    expect(rows('SELECT turns FROM usage')).toEqual([{ turns: 2 }]);
    expect(await status()).toMatchObject({ tier: 'pro', sessions_limit_today: null });
  });

  it('a lapsed subscriber does not get a fresh trial', async () => {
    kv.values.set('account:quota-user', JSON.stringify({ expiresAt: new Date(START + DAY).toISOString() }));
    await turn('pro-session-one', { cefr_level: 'B1' });
    vi.setSystemTime(START + 20 * DAY);
    expect((await status()).tier).toBe('free');
  });

  it('does not count translation or hints as usage or session turns, but hints respect level locks', async () => {
    await status();
    const snapshot = () => JSON.stringify([rows('SELECT * FROM usage'), rows('SELECT * FROM trial_sessions')]);
    const before = snapshot();
    await call('/ai/translate', { text: 'Hallo' });
    await call('/ai/hints', { last_ai_reply: 'Hallo', cefr_level: 'A1' });
    expect(snapshot()).toBe(before);

    vi.setSystemTime(START + 8 * DAY);
    const locked = await call('/ai/hints', { last_ai_reply: 'Hallo', cefr_level: 'B2' });
    expect(locked.status).toBe(402);
    expect((await locked.json()).code).toBe('LEVEL_LOCKED');
  });

  it('rejects a missing or malformed session_id', async () => {
    expect((await turn('short')).status).toBe(400);
    expect((await call('/ai/turn', { user_message: 'Hallo', cefr_level: 'A1' })).status).toBe(400);
    expect(rows('SELECT COUNT(*) AS n FROM trial_sessions')[0].n).toBe(0);
  });

  it('refunds the first session turn and daily usage after Gemini fails', async () => {
    mode = 'failure';
    expect((await turn('failed-first-session')).status).toBe(502);
    expect(rows('SELECT COUNT(*) AS n FROM trial_sessions')[0].n).toBe(0);
    expect(rows('SELECT turns FROM usage')).toEqual([{ turns: 0 }]);
    mode = 'success';
    expect((await turn('after-failure-session')).status).toBe(200);
  });

  it('fails closed when D1 is missing', async () => {
    env.DB = undefined;
    expect((await turn('missing-db-session')).status).toBe(503);
  });
});
