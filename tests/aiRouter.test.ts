import { beforeEach, describe, expect, it } from 'vitest';
import {
  PROVIDER_POOL,
  callAiRouter,
  callProvider,
  classifyFailure,
  classifyRateLimit,
  getPoolHealth,
  inspectProviderKeys,
  isDayExhausted,
  keyFingerprint,
  latencySnapshot,
  ledgerKey,
  markDayExhausted,
  recordLatency,
  nextMidnightPacific,
  nextResetTime,
  readAiCache,
  resetRouterState,
  unitLedgerKeys,
  writeAiCache,
} from '../cloudflare-ai-router.js';

/**
 * The multi-provider pool's quota ledger is the fix for the defect this module
 * was written for: a provider unit that has spent its DAILY window used to be
 * retried on every request, so one learner message could reach 8–48 provider
 * calls. These tests pin the two properties that make that impossible —
 * a parked unit is never called again inside its window, and the park survives
 * the death of the isolate that recorded it.
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

const geminiPayload = {
  contents: [{ role: 'user', parts: [{ text: 'Hallo' }] }],
  generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 200 },
};

const toOpenAiMessages = (payload: any) =>
  (payload?.contents || []).map((c: any) => ({ role: 'user', content: (c.parts || []).map((p: any) => p.text).join('') }));

/** Gemini's real 429 body for a per-day, per-model quota. */
const geminiDay429 = () =>
  new Response(
    JSON.stringify({
      error: {
        code: 429,
        message: 'Quota exceeded for quota metric Generate requests',
        status: 'RESOURCE_EXHAUSTED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
          },
        ],
      },
    }),
    { status: 429 },
  );

const geminiMinute429 = () =>
  new Response(
    JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }],
      },
    }),
    { status: 429 },
  );

const geminiOk = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

function fetchStub(handler: (url: string, body: any) => Response) {
  const calls: string[] = [];
  const bodies: any[] = [];
  const impl = (async (input: any, init: any) => {
    calls.push(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    bodies.push(body);
    return handler(String(input), body);
  }) as unknown as typeof fetch;
  return { impl, calls, bodies };
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    toOpenAiMessages,
    canUseWorkersAiFallback: () => false,
    isKeyCoolingDown: () => false,
    markKeyCooldown: () => {},
    markKeySuccess: () => {},
    ...overrides,
  } as any;
}

const geminiEnv = (value = 'test-key-aaaaaaaaaa') => ({ GEMINI_API_KEYS: value }) as any;

beforeEach(() => {
  resetRouterState();
});

describe('rate-limit classification', () => {
  it('reads Gemini CamelCase quota ids as a DAILY window (the original bug)', () => {
    // The pre-pool code tested `respText.includes("per_day")`, which never
    // matches "PerDay" — so day exhaustion was treated as a 25s blip and retried
    // on every message for the rest of the day.
    expect(classifyRateLimit(429, 'GenerateRequestsPerDayPerProjectPerModel-FreeTier')).toBe('day');
    expect(classifyRateLimit(429, 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier')).toBe('minute');
    expect(classifyRateLimit(429, 'Rate limit reached on requests per day (RPD): Limit 1000')).toBe('day');
    expect(classifyRateLimit(429, 'Rate limit reached on tokens per minute (TPM): Limit 8000')).toBe('minute');
  });

  it('never parks a unit for the day on an ambiguous rate limit', () => {
    // Guessing "day" here would cost a paying learner capacity until midnight.
    expect(classifyRateLimit(429, 'slow down')).toBe('minute');
    expect(classifyRateLimit(200, 'Fine')).toBe('none');
  });

  it('treats an NVIDIA rate limit as terminal, because its bodies name no window', () => {
    const nvidiaEntry = { provider: 'nvidia', model: 'openai/gpt-oss-20b', format: 'openai', tier: 'lite', rpd: null };
    expect(classifyFailure(429, '{"status":429,"title":"Too Many Requests"}', nvidiaEntry)).toBe('day');
    expect(classifyFailure(402, 'insufficient credits', nvidiaEntry)).toBe('day');
    // Scoped to NVIDIA: the same body stays a recoverable throttle everywhere else.
    expect(classifyFailure(429, '{"status":429,"title":"Too Many Requests"}')).toBe('minute');
  });

  it('separates key faults and dead models, which get different windows', () => {
    expect(classifyFailure(400, 'API key not valid. Please pass a valid API key.')).toBe('invalid_key');
    expect(classifyFailure(403, 'API_KEY_INVALID')).toBe('invalid_key');
    expect(classifyFailure(404, 'models/gemini-nope is not found for API version v1beta')).toBe('model_missing');
    expect(classifyFailure(500, 'internal')).toBe('other');
  });
});

describe('the day-quota ledger', () => {
  it('never calls a parked unit twice (acceptance: no retry inside the window)', async () => {
    const stub = fetchStub(() => geminiDay429());
    const env = geminiEnv();
    const pool = [{ provider: 'gemini', model: 'gemini-3.8-flash', format: 'gemini', tier: 'flagship', rpd: 20 }];
    const runtime = deps({ fetchImpl: stub.impl, pool });

    await expect(callAiRouter(geminiPayload, env, runtime)).rejects.toThrow();
    expect(stub.calls).toHaveLength(1);

    // A second learner message in the same isolate must not touch that unit.
    await expect(callAiRouter(geminiPayload, env, runtime)).rejects.toThrow();
    expect(stub.calls).toHaveLength(1);
  });

  it('survives the death of the isolate that recorded it (KV ledger)', async () => {
    const kv = new MemoryKv();
    const env = { ...geminiEnv(), USER_PROGRESS: kv } as any;
    const pool = [{ provider: 'gemini', model: 'gemini-3.8-flash', format: 'gemini', tier: 'flagship', rpd: 20 }];

    const first = fetchStub(() => geminiDay429());
    await expect(callAiRouter(geminiPayload, env, deps({ fetchImpl: first.impl, pool }))).rejects.toThrow();
    expect(first.calls).toHaveLength(1);

    // New isolate: in-memory state is gone, only KV remains.
    resetRouterState();
    const second = fetchStub(() => geminiOk('{"reply_de":"Hallo!"}'));
    await expect(callAiRouter(geminiPayload, env, deps({ fetchImpl: second.impl, pool }))).rejects.toThrow();
    expect(second.calls).toHaveLength(0);
  });

  it('parks an unavailable model for every key, not just the key that saw it', () => {
    const entry = { provider: 'gemini', model: 'gemini-nope', format: 'gemini', tier: 'flagship' };
    markDayExhausted(entry, 'key-one-aaaaaaaaaa', 'model_unavailable');
    const otherKey = 'key-two-bbbbbbbbbb';
    expect(isDayExhausted(entry, otherKey)).toBe(true);
    // …and for a different key than the one that was tried.
    expect(unitLedgerKeys(entry, otherKey)).toContain(ledgerKey(entry, otherKey, 'model'));
  });

  it('parks only the key for a day quota, leaving the other key usable', () => {
    const entry = { provider: 'gemini', model: 'gemini-3.8-flash', format: 'gemini', tier: 'flagship' };
    markDayExhausted(entry, 'key-one-aaaaaaaaaa', 'day_quota');
    expect(isDayExhausted(entry, 'key-one-aaaaaaaaaa')).toBe(true);
    expect(isDayExhausted(entry, 'key-two-bbbbbbbbbb')).toBe(false);
  });

  it('collapses an account-wide cap (OpenRouter) into one bucket', () => {
    const entry = { provider: 'openrouter', model: 'thinkingmachines/inkling-small:free', format: 'openai', tier: 'lite', sharedAccountCap: true };
    markDayExhausted(entry, 'or-key-aaaaaaaaaa', 'day_quota');
    expect(ledgerKey(entry, 'whatever-key', 'account')).toBe('openrouter:__account__:thinkingmachines/inkling-small:free');
    expect(isDayExhausted(entry, 'a-different-key-for-the-same-account')).toBe(true);
  });

  it('resets Gemini at Pacific midnight and Groq on its rolling window', () => {
    const now = Date.UTC(2026, 8, 26, 20, 30, 0); // 13:30 PT
    const geminiReset = nextResetTime('gemini', now);
    expect(geminiReset).toBeGreaterThan(now);
    expect(geminiReset - now).toBeLessThanOrEqual(24 * 3600 * 1000);
    expect(geminiReset).toBe(nextMidnightPacific(now));
    expect(nextResetTime('groq', now)).toBe(now + 60 * 1000);
  });

  it('reports parked units without exposing key material', () => {
    const entry = { provider: 'gemini', model: 'gemini-3.8-flash', format: 'gemini', tier: 'flagship' };
    const key = 'super-secret-provider-key-value';
    markDayExhausted(entry, key, 'day_quota');

    const publicShape = JSON.stringify(getPoolHealth({ env: geminiEnv(), pool: [entry] }));
    expect(publicShape).not.toContain('super-secret');
    expect(publicShape).not.toContain(keyFingerprint(key));
    expect(publicShape).toContain('day_quota');

    const diagnosticShape = JSON.stringify(getPoolHealth({ env: geminiEnv(), pool: [entry], includeKeyIds: true }));
    // The fingerprint identifies WHICH key parked, and is not reversible.
    expect(diagnosticShape).toContain(keyFingerprint(key));
    expect(diagnosticShape).not.toContain('super-secret');
  });
});

describe('pool order and tiers', () => {
  const pool = [
    { provider: 'gemini', model: 'flagship-a', format: 'gemini', tier: 'flagship' },
    { provider: 'gemini', model: 'flagship-b', format: 'gemini', tier: 'flagship' },
    { provider: 'gemini', model: 'mid-a', format: 'gemini', tier: 'mid' },
    { provider: 'gemini', model: 'lite-a', format: 'gemini', tier: 'lite' },
  ];

  it('tries every flagship entry before dropping to mid tier', async () => {
    const stub = fetchStub((url) =>
      url.includes('flagship-a')
        ? new Response('boom', { status: 500 }) // transient: must NOT park the entry
        : geminiOk('{"reply_de":"Guten Tag"}'),
    );
    const text = await callAiRouter(geminiPayload, geminiEnv(), deps({ fetchImpl: stub.impl, pool }));

    expect(text).toBe('{"reply_de":"Guten Tag"}');
    expect(stub.calls.map((u) => u.match(/models\/([^:]+)/)?.[1])).toEqual(['flagship-a', 'flagship-b']);
    expect(stub.calls.some((u) => u.includes('mid-a'))).toBe(false);
  });

  it('drops to the next tier only once the tier is out for the window', async () => {
    const stub = fetchStub((url) => (url.includes('mid-a') ? geminiOk('{"reply_de":"Hallo"}') : geminiDay429()));
    const text = await callAiRouter(geminiPayload, geminiEnv(), deps({ fetchImpl: stub.impl, pool }));

    expect(text).toBe('{"reply_de":"Hallo"}');
    const models = stub.calls.map((u) => u.match(/models\/([^:]+)/)?.[1]);
    expect(models).toEqual(['flagship-a', 'flagship-b', 'mid-a']);
    // 'lite-a' was never reached, and no unit was tried twice.
    expect(new Set(models).size).toBe(models.length);
  });

  it('rotates within a tier so one provider does not take every call', async () => {
    const twoKeys = { GEMINI_API_KEYS: 'key-one-aaaaaaaaaa,key-two-bbbbbbbbbb' } as any;
    const stub = fetchStub(() => geminiOk('{"reply_de":"Hallo"}'));
    const runtime = deps({ fetchImpl: stub.impl, pool });

    await callAiRouter(geminiPayload, twoKeys, runtime);
    await callAiRouter(geminiPayload, twoKeys, runtime);

    const models = stub.calls.map((u) => u.match(/models\/([^:]+)/)?.[1]);
    expect(models[0]).not.toBe(models[1]);
  });

  it('never calls an entry whose model is still a placeholder', async () => {
    // The guard is generic (any future entry added before its model is known),
    // so it is pinned with a synthetic entry rather than with the NVIDIA one.
    const stub = fetchStub(() => geminiOk('{"reply_de":"Hallo"}'));
    const placeholderEntry = { provider: 'nvidia', model: 'PLACEHOLDER-fill-in-from-account-dashboard', format: 'openai', tier: 'lite', rpd: null };

    await expect(
      callAiRouter(geminiPayload, { NVIDIA_API_KEYS: 'nvidia-key-aaaaaaaaaa' } as any, deps({ fetchImpl: stub.impl, pool: [placeholderEntry] })),
    ).rejects.toThrow();
    expect(stub.calls).toHaveLength(0);
  });

  it('calls the wired NVIDIA entry with a bearer key, and unwraps the completion', async () => {
    const entry = PROVIDER_POOL.find((e) => e.provider === 'nvidia')!;
    const key = 'nv-key-aaaaaaaaaa';
    const stub = fetchStub(() =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"reply_de":"Hallo"}' } }] }), { status: 200 }),
    );
    const text = await callAiRouter(geminiPayload, { NVIDIA_API_KEYS: key } as any, deps({ fetchImpl: stub.impl, pool: [entry] }));

    expect(text).toBe('{"reply_de":"Hallo"}');
    expect(stub.calls[0]).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(stub.bodies[0].model).toBe('openai/gpt-oss-20b');
    expect(stub.calls[0]).not.toContain(key);
  });

  it('parks the quota-untracked NVIDIA entry for the window on a 429', async () => {
    // `rpd: null` means there is no ceiling to pre-check, NOT that the unit is
    // allowed to be retried forever: NIM's bodies name no window, so the 429 has
    // to come out as the same terminal park every other entry uses.
    const entry = PROVIDER_POOL.find((e) => e.provider === 'nvidia')!;
    const key = 'nv-key-aaaaaaaaaa';
    const stub = fetchStub(() => new Response(JSON.stringify({ status: 429, title: 'Too Many Requests' }), { status: 429 }));
    const runtime = deps({ fetchImpl: stub.impl, pool: [entry] });

    await expect(callAiRouter(geminiPayload, { NVIDIA_API_KEYS: key } as any, runtime)).rejects.toThrow();
    expect(stub.calls).toHaveLength(1);
    expect(isDayExhausted(entry, key)).toBe(true);

    // A second learner message inside the window never touches the unit again.
    await expect(callAiRouter(geminiPayload, { NVIDIA_API_KEYS: key } as any, runtime)).rejects.toThrow();
    expect(stub.calls).toHaveLength(1);
  });
});

describe('transports', () => {
  const groqEntry = { provider: 'groq', model: 'openai/gpt-oss-120b', format: 'openai', baseUrl: 'https://api.groq.com/openai/v1', tier: 'flagship' };

  it('speaks chat/completions with a bearer key and unwraps choices[0].message.content', async () => {
    const stub = fetchStub(() =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"reply_de":"Hallo"}' } }] }), { status: 200 }),
    );
    const text = await callAiRouter(geminiPayload, { GROQ_API_KEYS: 'groq-key-aaaaaaaaaa' } as any, deps({ fetchImpl: stub.impl, pool: [groqEntry] }));

    expect(text).toBe('{"reply_de":"Hallo"}');
    expect(stub.calls[0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(stub.bodies[0].model).toBe('openai/gpt-oss-120b');
    expect(stub.bodies[0].response_format).toEqual({ type: 'json_object' });
    expect(stub.bodies[0].messages).toEqual([{ role: 'user', content: 'Hallo' }]);
  });

  it('strips a reasoning block before the JSON reaches a handler', async () => {
    // Built at runtime: the tag characters must survive every layer between this
    // file and the model transport, and a literal in the source is the one thing
    // that cannot be trusted to.
    const openTag = String.fromCharCode(60) + 'think' + String.fromCharCode(62);
    const closeTag = String.fromCharCode(60) + '/think' + String.fromCharCode(62);
    const stub = fetchStub(() =>
      new Response(JSON.stringify({ choices: [{ message: { content: `${openTag}weighing options${closeTag}{"reply_de":"Hallo"}` } }] }), { status: 200 }),
    );
    const text = await callAiRouter(geminiPayload, { GROQ_API_KEYS: 'groq-key-aaaaaaaaaa' } as any, deps({ fetchImpl: stub.impl, pool: [groqEntry] }));
    expect(text).toBe('{"reply_de":"Hallo"}');
  });

  it('retries once without json mode when a backend rejects response_format', async () => {
    let attempt = 0;
    const stub = fetchStub(() => {
      attempt += 1;
      if (attempt === 1) return new Response(JSON.stringify({ error: { message: 'response_format is not supported' } }), { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
    });
    const text = await callAiRouter(geminiPayload, { GROQ_API_KEYS: 'groq-key-aaaaaaaaaa' } as any, deps({ fetchImpl: stub.impl, pool: [groqEntry] }));

    expect(text).toBe('{"ok":true}');
    expect(stub.bodies[0].response_format).toBeTruthy();
    expect(stub.bodies[1].response_format).toBeUndefined();
  });

  it('treats an empty 200 as a failure so the next entry is tried', async () => {
    const entry = { ...groqEntry };
    await expect(
      callProvider(entry, geminiPayload, 'groq-key-aaaaaaaaaa', {
        fetchImpl: (async () => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 })) as unknown as typeof fetch,
        toMessages: toOpenAiMessages,
      }),
    ).rejects.toMatchObject({ kind: 'empty' });
  });

  it('needs no key material in the request URL for OpenAI-compatible providers', async () => {
    const stub = fetchStub(() => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }));
    await callAiRouter(geminiPayload, { GROQ_API_KEYS: 'groq-key-aaaaaaaaaa' } as any, deps({ fetchImpl: stub.impl, pool: [groqEntry] }));
    expect(stub.calls[0]).not.toContain('groq-key-aaaaaaaaaa');
  });

  it('forwards reasoning_effort only when the payload asks for it', async () => {
    const stub = fetchStub(() => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }));
    const asks = { ...geminiPayload, generationConfig: { ...geminiPayload.generationConfig, reasoningEffort: 'low' } };
    await callAiRouter(asks, { GROQ_API_KEYS: 'groq-key-aaaaaaaaaa' } as any, deps({ fetchImpl: stub.impl, pool: [groqEntry] }));
    expect(stub.bodies[0].reasoning_effort).toBe('low');

    await callAiRouter(geminiPayload, { GROQ_API_KEYS: 'groq-key-aaaaaaaaaa' } as any, deps({ fetchImpl: stub.impl, pool: [groqEntry] }));
    expect(stub.bodies[1].reasoning_effort).toBeUndefined();
  });

  it('retries without reasoning_effort when a backend does not know the field', async () => {
    let attempt = 0;
    const stub = fetchStub(() => {
      attempt += 1;
      if (attempt === 1) return new Response(JSON.stringify({ error: { message: 'unknown parameter: reasoning_effort' } }), { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
    });
    const asks = { ...geminiPayload, generationConfig: { ...geminiPayload.generationConfig, reasoningEffort: 'low' } };
    const text = await callAiRouter(asks, { GROQ_API_KEYS: 'groq-key-aaaaaaaaaa' } as any, deps({ fetchImpl: stub.impl, pool: [groqEntry] }));

    expect(text).toBe('{"ok":true}');
    expect(stub.bodies[0].reasoning_effort).toBe('low');
    expect(stub.bodies[1].reasoning_effort).toBeUndefined();
    // json mode is a separate knob: dropping one must not drop the other.
    expect(stub.bodies[1].response_format).toEqual({ type: 'json_object' });
  });

  it('never puts the OpenAI-only reasoning_effort in a Gemini request', async () => {
    // Gemini rejects generationConfig fields it does not know, so the shared
    // payload's OpenAI-only knobs have to be stripped at the transport.
    const stub = fetchStub(() => geminiOk('{}'));
    const asks = { ...geminiPayload, generationConfig: { ...geminiPayload.generationConfig, reasoningEffort: 'low' } };
    await callAiRouter(asks, geminiEnv(), deps({ fetchImpl: stub.impl, pool: [PROVIDER_POOL[0]] }));
    expect(stub.bodies[0].generationConfig.reasoningEffort).toBeUndefined();
    expect(stub.bodies[0].generationConfig.maxOutputTokens).toBe(200);
  });
});

/**
 * The turn and translate routes are ones a learner is staring at. A provider that
 * answers in 900ms and one that answers in four seconds cost the same quota and
 * feel nothing alike, so those routes order the tier walk by what the pool has
 * actually been doing — measured, never assumed.
 */
describe('interactive latency preference', () => {
  const fast = { provider: 'groq', model: 'fast-model', format: 'openai', baseUrl: 'https://fast.test/v1', tier: 'flagship' };
  const slow = { provider: 'nvidia', model: 'slow-model', format: 'openai', baseUrl: 'https://slow.test/v1', tier: 'flagship' };
  const env = { GROQ_API_KEYS: 'groq-key-aaaaaaaaaa', NVIDIA_API_KEYS: 'nv-key-aaaaaaaaaa' } as any;
  const okStub = () =>
    fetchStub(() => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }));

  const record = (entry: any, ms: number, times = 4) => {
    for (let i = 0; i < times; i++) recordLatency(entry, ms);
  };

  it('walks the fastest measured entry first', async () => {
    record(slow, 4000);
    record(fast, 600);
    const stub = okStub();

    await callAiRouter(geminiPayload, env, deps({ fetchImpl: stub.impl, pool: [slow, fast], preferFast: true }));

    expect(stub.calls[0]).toContain('fast.test');
    expect(stub.calls).toHaveLength(1);
    expect(latencySnapshot().find((l) => l.id === 'groq:fast-model')!.samples).toBeGreaterThan(0);
  });

  it('leaves a route that is not waiting on a learner on the plain rotation', async () => {
    record(slow, 4000);
    record(fast, 600);
    const stub = okStub();

    await callAiRouter(geminiPayload, env, deps({ fetchImpl: stub.impl, pool: [slow, fast] }));

    // Rotation order, unchanged by the measurements.
    expect(stub.calls[0]).toContain('slow.test');
  });

  it('does not trust a single sample of noise', async () => {
    record(slow, 9000, 1);
    record(fast, 100, 1);
    const stub = okStub();

    await callAiRouter(geminiPayload, env, deps({ fetchImpl: stub.impl, pool: [slow, fast], preferFast: true }));

    expect(stub.calls[0]).toContain('slow.test');
  });

  it('carries the measurements to the next isolate through the shared ledger', async () => {
    const kv = new MemoryKv();
    const envWithKv = { ...env, USER_PROGRESS: kv } as any;
    record(slow, 5000);
    record(fast, 500);

    const first = okStub();
    await callAiRouter(geminiPayload, envWithKv, deps({ fetchImpl: first.impl, pool: [slow, fast], preferFast: true }));
    expect(JSON.parse(kv.values.get('ai-pool-ledger')!).latency['groq:fast-model'].ms).toBe(500);

    resetRouterState(); // the isolate that measured them is gone
    const second = okStub();
    await callAiRouter(geminiPayload, envWithKv, deps({ fetchImpl: second.impl, pool: [slow, fast], preferFast: true }));
    expect(second.calls[0]).toContain('fast.test');
  });

  it('records a failure as no measurement at all', async () => {
    const stub = fetchStub(() => new Response('boom', { status: 500 }));
    await expect(
      callAiRouter(geminiPayload, env, deps({ fetchImpl: stub.impl, pool: [slow], preferFast: true })),
    ).rejects.toThrow();
    expect(latencySnapshot()).toEqual([]);
  });
});

describe('key parsing', () => {
  it('parses a list for any provider with the same permissive rules', () => {
    const env = {
      GROQ_API_KEYS: 'gsk-one, gsk-two;gsk-three\n"gsk-four"',
      OPENROUTER_API_KEYS: 'or-one',
      NVIDIA_API_KEYS: 'nv-one',
    } as any;
    expect(inspectProviderKeys(env, 'GROQ_API_KEYS').uniqueKeys).toEqual(['gsk-one', 'gsk-two', 'gsk-three', 'gsk-four']);
    expect(inspectProviderKeys(env, 'OPENROUTER_API_KEYS').uniqueKeys).toEqual(['or-one']);
    expect(inspectProviderKeys(env, 'NVIDIA_API_KEYS').uniqueKeys).toEqual(['nv-one']);
  });

  it('still accepts the individual Gemini secret names', () => {
    const env = { GEMINI_API_KEY_1: 'gem-one-one', GEMINI_KEY_2: 'gem-two', GEMINI_API_KEY: 'gem-three' } as any;
    expect(inspectProviderKeys(env, 'GEMINI_API_KEYS', { extraPatterns: [/^GEMINI_KEY$/i, /^GEMINI_KEY_\d+$/i] }).uniqueKeys.sort()).toEqual([
      'gem-one-one',
      'gem-three',
      'gem-two',
    ]);
  });

  it('reports a duplicate secret by env name, never by value', () => {
    const result = inspectProviderKeys({ GEMINI_API_KEYS: 'same-key-value,same-key-value' } as any, 'GEMINI_API_KEYS');
    expect(result.hasDuplicates).toBe(true);
    expect(result.duplicates.join(' ')).not.toContain('same-key-value');
    expect(result.previews).toEqual([]);
  });

  it('health shape reports what is callable, and never how many keys exist', () => {
    const health = getPoolHealth({ env: { GROQ_API_KEYS: 'groq-key-aaaaaaaaaa' } as any, pool: PROVIDER_POOL });
    expect([...new Set(health.active.map((e: any) => e.provider))]).toEqual(['groq']);
    expect(health.idle.map((e: any) => e.reason)).toContain('no_keys');
    // Every entry now resolves to a real model: a provider with no secret is idle
    // for the honest reason (`no_keys`), never because its model is a stub.
    expect(health.idle.some((e: any) => e.reason === 'model_unset')).toBe(false);
    expect(health.idle.find((e: any) => e.provider === 'nvidia')).toMatchObject({ model: 'openai/gpt-oss-20b', reason: 'no_keys' });
    expect(JSON.stringify(health)).not.toContain('groq-key-aaaaaaaaaa');
  });
});

describe('shared AI cache', () => {
  it('serves a hit after the isolate that wrote it is gone', async () => {
    const kv = new MemoryKv();
    const env = { USER_PROGRESS: kv } as any;
    await writeAiCache(env, 'tr', 'Hallo, wie geht es Ihnen?', 'مرحباً، كيف حالك؟');

    resetRouterState(); // new isolate: the in-memory layer is empty
    expect(await readAiCache(env, 'tr', 'Hallo, wie geht es Ihnen?')).toBe('مرحباً، كيف حالك؟');
  });

  it('keeps the raw text out of the KV key', async () => {
    const kv = new MemoryKv();
    await writeAiCache({ USER_PROGRESS: kv } as any, 'tr', 'Mein Gehalt ist zu niedrig', 'راتبي منخفض جداً');
    expect([...kv.values.keys()].join(' ')).not.toContain('Gehalt');
  });

  it('returns null rather than throwing when nothing is cached or the binding is absent', async () => {
    expect(await readAiCache({} as any, 'hints', 'missing')).toBeNull();
    expect(await readAiCache({ USER_PROGRESS: new MemoryKv() } as any, 'hints', 'missing')).toBeNull();
  });
});
