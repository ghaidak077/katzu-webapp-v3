import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../cloudflare-unified-worker';
import { getRegistryStats } from '../cloudflare-admin.js';
import { resetRouterState } from '../cloudflare-ai-router.js';

/**
 * Route-level guarantees for the AI pool.
 *
 * Two of these are fixes, not features:
 * - `/ai/translate` had NO entitlement check, which made it the one unmetered
 *   door into the provider pool. It is now gated like every other AI route.
 * - `ai_turns_24h` / `ai_failures_24h` on the admin overview were hardcoded
 *   zeros, so the dashboard could not show AI volume even in principle.
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

/** Minimal D1 stand-in that answers the queries these routes actually run. */
class SqlStub {
  activity: Array<{ user_id: string | null; event_type: string; created_at: number }> = [];

  batch(statements: unknown[]) {
    return Promise.all(statements.map((statement: any) => (typeof statement?.run === 'function' ? statement.run() : statement)));
  }

  prepare(sql: string) {
    const text = sql.replace(/\s+/g, ' ').trim();
    const self = this;

    const run = async (args: unknown[]) => {
      if (/^INSERT INTO activity_log/i.test(text)) {
        self.activity.push({ user_id: (args[0] as string) ?? null, event_type: String(args[1]), created_at: Number(args[3]) });
      }
      return { success: true };
    };

    const first = async (args: unknown[]) => {
      if (/FROM activity_log/i.test(text) && /COUNT\(\*\) AS c/i.test(text)) {
        const scopedToEvent = args.length > 1;
        const eventType = scopedToEvent ? String(args[0]) : null;
        const since = Number(args[args.length - 1]);
        return {
          c: self.activity.filter((row) => (!eventType || row.event_type === eventType) && row.created_at > since).length,
        };
      }
      return null;
    };

    const all = async () => ({ results: [] });
    return {
      run: () => run([]),
      first: () => first([]),
      all,
      // D1 binds are spread positional arguments, not an array.
      bind: (...args: unknown[]) => ({ run: () => run(args), first: () => first(args), all }),
    };
  }
}

const token = (payload: Record<string, unknown>) => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`;
};

async function seedSession(env: any, sub: string, sessionToken: string) {
  await env.USER_PROGRESS.put(
    `session:${sessionToken}`,
    JSON.stringify({ sub, email: `${sub}@test.dev`, created_at: Date.now(), expires_at: Date.now() + 3600_000 }),
  );
}

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    TEST_MODE: true,
    GOOGLE_CLIENT_ID: 'client-id',
    GEMINI_API_KEYS: 'test-key-aaaaaaaaaa',
    USER_PROGRESS: new MemoryKv(),
    REDEEMED_CODES: new MemoryKv(),
    DB: new SqlStub(),
    ...overrides,
  } as any;
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const geminiText = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

const ROLEPLAY_REPLY = JSON.stringify({
  reply_de: 'Guten Tag! Möchten Sie einen Kaffee?',
  reply_ar: 'نهارك سعيد! هل ترغب بقهوة؟',
  next_hint: { german: 'Ja, gerne.', translation_ar: 'نعم، بكل سرور.' },
  followup_question_ar: 'ماذا تحب أن تطلب؟',
});

const EVALUATION_REPLY = JSON.stringify({
  is_correct: true,
  explanation_ar: 'جملة صحيحة.',
  positive_note_ar: 'أحسنت!',
});

beforeEach(() => {
  resetRouterState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/ai/translate entitlement', () => {
  it('refuses an unauthenticated learner (401, no model call)', async () => {
    const calls = vi.fn();
    vi.stubGlobal('fetch', calls);

    const res = await worker.fetch(
      post('/ai/translate', { text: 'Guten Tag' }),
      makeEnv() as never,
    );

    expect(res.status).toBe(401);
    expect((await res.json() as any).code).toBe('UNAUTHENTICATED');
    expect(calls).not.toHaveBeenCalled();
  });

  it('serves a learner inside their trial and caches the answer for the fleet', async () => {
    const env = makeEnv();
    await seedSession(env, 'a1-learner', 'sess_a1_learner');

    const modelCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      (async (input: any) => {
        modelCalls.push(String(input));
        return geminiText(JSON.stringify({ translation_ar: 'نهارك سعيد' }));
      }) as unknown as typeof fetch,
    );

    const first = await worker.fetch(post('/ai/translate', { text: 'Guten Tag' }, { Authorization: 'Bearer sess_a1_learner' }), env as never);
    expect(first.status).toBe(200);
    expect((await first.json() as any).translation_ar).toBe('نهارك سعيد');
    expect(modelCalls).toHaveLength(1);

    const cached = await worker.fetch(post('/ai/translate', { text: 'Guten Tag' }, { Authorization: 'Bearer sess_a1_learner' }), env as never);
    expect((await cached.json() as any).cached).toBe(true);
    expect(modelCalls).toHaveLength(1);
    // The cache entry lives in KV, so a recycled isolate still hits it.
    expect([...env.USER_PROGRESS.values.keys()].some((key: string) => key.startsWith('ai-cache:tr:'))).toBe(true);
  });
});

describe('/ai/turn through the pool', () => {
  it('answers via the pool and records the turn the dashboard counts', async () => {
    const env = makeEnv();
    await seedSession(env, 'turn-learner', 'sess_turn_learner');

    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      (async (input: any, init: any) => {
        requested.push(String(input));
        const body = String(init?.body || '');
        return geminiText(body.includes('is_correct') ? EVALUATION_REPLY : ROLEPLAY_REPLY);
      }) as unknown as typeof fetch,
    );

    const res = await worker.fetch(
      post(
        '/ai/turn',
        {
          scenario_id: 'cafe_order',
          cefr_level: 'A1',
          user_message: 'Ich möchte einen Kaffee, bitte.',
          session_id: 'sess-round-1',
          history: [],
        },
        { Authorization: 'Bearer sess_turn_learner' },
      ),
      env as never,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.reply_de).toContain('Guten Tag');
    expect(body.evaluation.is_correct).toBe(true);
    expect(body.provider).toBe('gemini');
    expect(requested[0]).toContain('gemini-3.8-flash');

    // withAiTelemetry records the completed turn in activity_log, and the admin
    // stats now read it instead of reporting a hardcoded zero.
    expect(env.DB.activity.map((row: any) => row.event_type)).toContain('ai_turn_completed');
    const stats = await getRegistryStats(env);
    expect(stats.available).toBe(true);
    expect(stats.ai_turns_24h).toBeGreaterThan(0);
    expect(stats.ai_failures_24h).toBe(0);
    expect(stats.ai_turns_24h).toBe(
      env.DB.activity.filter((row: any) => row.event_type === 'ai_turn_completed').length,
    );
  });

  it('counts an exhausted provider unit for the dashboard, once', async () => {
    const env = makeEnv({ GEMINI_API_KEYS: 'test-key-aaaaaaaaaa' });
    await seedSession(env, 'park-learner', 'sess_park_learner');

    const attempted: string[] = [];
    vi.stubGlobal(
      'fetch',
      (async (input: any) => {
        attempted.push(String(input));
        // Gemini's per-day, per-model quota body — the shape the old code failed
        // to recognise, which is why it retried all day.
        return new Response(
          JSON.stringify({
            error: {
              code: 429,
              status: 'RESOURCE_EXHAUSTED',
              details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }],
            },
          }),
          { status: 429 },
        );
      }) as unknown as typeof fetch,
    );

    const turnRequest = () =>
      post(
        '/ai/turn',
        { scenario_id: 'cafe_order', cefr_level: 'A1', user_message: 'Hallo', session_id: 'sess-round-2', history: [] },
        { Authorization: 'Bearer sess_park_learner' },
      );

    const first = await worker.fetch(turnRequest(), env as never);
    expect(first.status).toBe(502);
    const afterFirst = attempted.length;
    expect(afterFirst).toBeGreaterThan(0);

    // Second message in the same isolate: every pool unit is parked, so nothing
    // is called again — the amplification this work exists to remove.
    const second = await worker.fetch(turnRequest(), env as never);
    expect(second.status).toBe(502);
    expect(attempted.length).toBe(afterFirst);

    const stats = await getRegistryStats(env);
    expect(stats.provider_attempts_exhausted_24h).toBeGreaterThan(0);
  });
});
