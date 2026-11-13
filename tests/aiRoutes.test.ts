import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../cloudflare-unified-worker';
import { translateCacheKey } from '../cloudflare-ai-chat.js';
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
  grammarRows = new Map<string, Record<string, string>>();
  starterPhrases = new Map<string, Array<{ german: string; level: string; sort_order: number }>>();

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
      if (/FROM grammar/i.test(text)) return self.grammarRows.get(String(args[0])) || null;
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

    const all = async (args: readonly unknown[] = []) => {
      if (/FROM starter_phrases/i.test(text)) {
        return { results: self.starterPhrases.get(String(args[0])) || [] };
      }
      return { results: [] };
    };
    return {
      run: () => run([]),
      first: () => first([]),
      all,
      // D1 binds are spread positional arguments, not an array.
      bind: (...args: unknown[]) => ({ run: () => run(args), first: () => first(args), all: () => all(args) }),
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
    // The pool's two defaults each get a key: easy turns walk the 'mid' tier
    // (OpenRouter) and graded turns the 'flagship' (NVIDIA), so both cheap
    // routing and tier order stay exercised by the route tests.
    NVIDIA_API_KEYS: 'test-key-aaaaaaaaaa',
    OPENROUTER_API_KEYS: 'test-key-openrouter-b',
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

/** A openai-compatible (NVIDIA/OpenRouter) 200: the route reads `choices[0].message.content`. */
const providerText = (text: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });

/** One fused answer: the reply and the evaluation come back from a single call. */
const FUSED_REPLY = JSON.stringify({
  evaluation: { is_correct: true, explanation_ar: 'جملة صحيحة.', positive_note_ar: 'أحسنت!' },
  reply_de: 'Guten Tag! Möchten Sie einen Kaffee?',
  reply_ar: 'نهارك سعيد! هل ترغب بقهوة؟',
  next_hint: { german: 'Ja, gerne.', translation_ar: 'نعم، بكل سرور.' },
  followup_question_ar: 'ماذا تحب أن تطلب؟',
});

/** Eight words plus a participle: legal at A1, over the A0 word cap. */
const OFF_LEVEL_REPLY = JSON.stringify({
  evaluation: { is_correct: true, explanation_ar: 'جملة صحيحة.', positive_note_ar: 'أحسنت!' },
  reply_de: 'Ich habe gestern lange mit der Kollegin gemacht',
  reply_ar: 'عملت طويلاً مع الزميلة أمس.',
  next_hint: { german: 'Danke dir!', translation_ar: 'شكراً لك!' },
  followup_question_ar: '',
});

beforeEach(() => {
  resetRouterState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/ai/transcribe obeys the operator brake', () => {
  /** What the app sends: a short base64 clip with the mime the recorder produces. */
  const clip = { audio: 'AAAA', mime: 'audio/webm' };

  it('does not bill Whisper while the daily spend cap reads zero', async () => {
    // The route that calls `env.AI.run` directly used to skip the cap entirely, so
    // the documented "stops all AI traffic" emergency brake left the most
    // expensive call in the product running. It answers exactly like the routes
    // that go through `authenticateAiRequest`: same code, same sentence, 503.
    const env = makeEnv({ AI_DAILY_SPEND_CAP: '0' });
    await seedSession(env, 'stt-braked', 'sess_stt_braked');
    const run = vi.fn();
    env.AI = { run };

    const res = await worker.fetch(
      post('/ai/transcribe', clip, { Authorization: 'Bearer sess_stt_braked' }),
      env as never,
    );

    expect(res.status).toBe(503);
    const body = (await res.json()) as any;
    expect(body.code).toBe('DAILY_SPEND_CAP');
    expect(body.message).toMatch(/[؀-ۿ]/);
    expect(run).not.toHaveBeenCalled();
  });

  it('transcribes when the cap admits the call, and never echoes the provider error', async () => {
    const env = makeEnv(); // no cap configured = unlimited, as before
    await seedSession(env, 'stt-ok', 'sess_stt_ok');
    env.AI = { run: async () => ({ text: 'Guten Tag', word_count: 2 }) };

    const ok = await worker.fetch(
      post('/ai/transcribe', clip, { Authorization: 'Bearer sess_stt_ok' }),
      env as never,
    );
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).text).toBe('Guten Tag');

    env.AI = {
      run: async () => {
        throw new Error('AiError: upstream model unavailable at provider-node-xyz');
      },
    };
    const failed = await worker.fetch(
      post('/ai/transcribe', clip, { Authorization: 'Bearer sess_stt_ok' }),
      env as never,
    );
    expect(failed.status).toBe(502);
    const body = (await failed.json()) as any;
    expect(body.message).toMatch(/[؀-ۿ]/);
    expect(body.detail).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('provider-node-xyz');
  });
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
        return providerText(JSON.stringify({ translation_ar: 'نهارك سعيد' }));
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

describe('translateCacheKey', () => {
  it('is stable for the same sentence and target language', async () => {
    expect(await translateCacheKey('Guten Tag', 'ar')).toBe(await translateCacheKey('Guten Tag', 'ar'));
  });

  it('ignores case and surrounding whitespace, which are the same request', async () => {
    expect(await translateCacheKey('  Guten Tag  ', 'ar')).toBe(await translateCacheKey('guten tag', 'ar'));
  });

  it('separates target languages, so a second language cannot collide', async () => {
    expect(await translateCacheKey('Guten Tag', 'ar')).not.toBe(await translateCacheKey('Guten Tag', 'en'));
  });

  it('produces a key inside the 512-byte KV limit for a very long sentence', async () => {
    // The old key was the raw text, so a long sentence could not be written at all.
    const long = 'Ich moechte bitte einen Kaffee und ein Stueck Kuchen '.repeat(40);
    expect((await translateCacheKey(long, 'ar')).length).toBeLessThan(512);
    expect(long.length).toBeGreaterThan(512);
  });

  it('distinguishes different sentences', async () => {
    expect(await translateCacheKey('Guten Tag', 'ar')).not.toBe(await translateCacheKey('Guten Morgen', 'ar'));
  });
});
