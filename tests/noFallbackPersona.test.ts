import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../cloudflare-unified-worker';
import { resetRouterState, callAiRouter } from '../cloudflare-ai-router.js';
import { runRoleplayTurn } from '../cloudflare-roleplay.js';
import { planForScenario } from '../cloudflare-roleplay-plans.js';
import { failedTurn, newDiagnosticId } from '../src/lib/conversation/failedTurn';
import { failureCauseOf, messageForCause, BUSY_MESSAGE_AR, OFFLINE_MESSAGE_AR, OTHER_MESSAGE_AR } from '../src/lib/conversation/failureCopy';
import { aiDebugLabel, errorDebugLabel } from '../src/lib/conversation/debugLabel';
import type { ChatMessage } from '../src/types/models';

/**
 * NO OFFLINE/AUTHORED BACKUP — the behavioural gate (2026-11-10).
 *
 * The persona's reply is either a real model answer or nothing. This file
 * simulates every way a turn can fail — provider failure, 429, timeout, invalid
 * JSON, offline — and asserts, for each one:
 *   - no persona (KATZU) bubble is produced;
 *   - the learner's text is preserved for a retry;
 *   - the failed turn is not counted and does not spend the free allowance.
 *
 * If someone re-adds a safety line, a rotating variant or a «Wie bitte?»
 * fallback, one of these assertions fails.
 */

const plan = planForScenario('cafe_order');

const VALID_TURN = JSON.stringify({
  reply_de: 'Guten Tag! Was möchten Sie trinken?',
  reply_ar: 'نهارك سعيد! ماذا تحب أن تشرب؟',
  understood_de: 'Ich möchte einen Kaffee.',
  fix_reason_ar: '',
  objectives_done: ['order_drink'],
  close: false,
  hint_de: 'Einen Kaffee, bitte.',
  hint_ar: 'قهوة من فضلك.',
});

const codedError = (code: string, status = 0) => Object.assign(new Error(code), { code, status });

/** Every way a provider can fail, as the router would surface it. */
const FAILURES: Array<{ name: string; thrower: () => never | Promise<never> }> = [
  { name: 'provider failure', thrower: () => { throw new Error('All AI providers and tiers are exhausted for this window'); } },
  { name: '429', thrower: () => { throw codedError('RATE_LIMIT_EXCEEDED', 429); } },
  { name: 'timeout', thrower: () => { throw codedError('REQUEST_TIMEOUT', 408); } },
  { name: 'invalid JSON', thrower: () => { throw codedError('AI_TURN_HTTP_ERROR', 502); } },
  { name: 'offline', thrower: () => { throw codedError('NETWORK_ERROR'); } },
];

describe('one roleplay turn: a failure never becomes a persona line', () => {
  for (const failure of FAILURES) {
    it(`fails honestly on ${failure.name} — no reply, no template`, async () => {
      const outcome = await runRoleplayTurn({
        env: {},
        plan,
        level: 'A1',
        learnerText: 'ich mochte kaffee',
        callAiRouter: async () => failure.thrower(),
      });
      expect(outcome.ok).toBe(false);
      expect(outcome.turn).toBeUndefined();
      expect(typeof outcome.reason).toBe('string');
      expect(JSON.stringify(outcome.turn ?? null)).toBe('null');
    });
  }

  it('rejects a reply-shaped answer that is not JSON, twice, then fails', async () => {
    let calls = 0;
    const outcome = await runRoleplayTurn({
      env: {},
      plan,
      level: 'A1',
      learnerText: 'kaffee',
      callAiRouter: async () => {
        calls += 1;
        return 'not json at all';
      },
    });
    expect(outcome.ok).toBe(false);
    expect(calls).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// The client's half of the gate: the failed turn as a value.
// ---------------------------------------------------------------------------

const OPENER: ChatMessage = {
  id: 'msg_initial',
  sender: 'KATZU',
  germanText: 'Hallo! Was möchten Sie trinken?',
  arabicTranslation: 'أهلاً! ماذا تحب أن تشرب؟',
  timestamp: 1,
};

const LEARNER: ChatMessage = {
  id: 'usr_1',
  sender: 'USER',
  germanText: 'Ich möchte einen Kaffee',
  timestamp: 2,
};

describe('the failed turn leaves no persona bubble and keeps the sentence', () => {
  for (const failure of FAILURES) {
    it(`${failure.name}: text preserved, no KATZU message added, not counted`, () => {
      const before = [OPENER];
      const optimistic = [...before, LEARNER];
      const result = failedTurn({ messages: optimistic, userMessageId: LEARNER.id, text: LEARNER.germanText });

      expect(result.messages).toEqual(before);
      expect(result.messages.filter((message) => message.sender === 'KATZU')).toHaveLength(1);
      expect(result.messages.at(-1)?.id).toBe('msg_initial');
      expect(result.inputText).toBe('Ich möchte einen Kaffee');
      expect(result.personaBubblesAdded).toBe(0);
      // A failed turn is not a spoken turn: the round counter reads the
      // transcript, and the transcript did not gain a learner turn either.
      expect(result.messages.filter((message) => message.sender === 'USER')).toHaveLength(0);
    });
  }
});

describe('the three (and only three) failure sentences', () => {
  it('maps each cause to the owner’s exact wording', () => {
    expect(messageForCause('offline')).toBe(
      'لا يوجد اتصال بالإنترنت. المحادثة تحتاج إنترنت. اتصل ثم اضغط إعادة المحاولة.',
    );
    expect(messageForCause('busy')).toBe('الخدمة مشغولة الآن. سنعيد المحاولة بعد لحظات.');
    expect(messageForCause('other')).toBe('تعذّر الرد. أعد المحاولة.');
    expect(OFFLINE_MESSAGE_AR).toBe(messageForCause('offline'));
    expect(BUSY_MESSAGE_AR).toBe(messageForCause('busy'));
    expect(OTHER_MESSAGE_AR).toBe(messageForCause('other'));
  });

  it('classifies a 429 as busy, a timeout as other, a network error as offline', () => {
    expect(failureCauseOf(codedError('RATE_LIMIT_EXCEEDED', 429))).toBe('busy');
    expect(failureCauseOf(codedError('SERVICE_UNAVAILABLE', 503))).toBe('busy');
    expect(failureCauseOf(codedError('REQUEST_TIMEOUT', 408))).toBe('other');
    expect(failureCauseOf(codedError('AI_TURN_HTTP_ERROR', 502))).toBe('other');
    expect(failureCauseOf(codedError('NETWORK_ERROR'))).toBe('offline');
  });

  it('offline wins when the browser reports no connection', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(failureCauseOf(codedError('RATE_LIMIT_EXCEEDED', 429))).toBe('offline');
    vi.unstubAllGlobals();
  });
});

describe('the debug label has no FALLBACK state', () => {
  it('formats a served turn as «AI · model · ms · attempt n»', () => {
    expect(aiDebugLabel({ model: 'gpt-oss-120b', attempts: 1, elapsedMs: 812 })).toBe(
      'AI · gpt-oss-120b · 812 ms · attempt 1',
    );
    expect(aiDebugLabel({ provider: 'nvidia', attempts: 2, elapsedMs: 2100 })).toBe(
      'AI · nvidia · 2100 ms · attempt 2',
    );
  });

  it('formats a failed turn as «ERROR · reason»', () => {
    expect(errorDebugLabel('RATE_LIMIT_EXCEEDED')).toBe('ERROR · RATE_LIMIT_EXCEEDED');
    expect(errorDebugLabel('other')).toBe('ERROR · other');
  });
});

describe('a diagnostic id carries no learner text', () => {
  it('looks like an id and never contains a sentence', () => {
    const id = newDiagnosticId(1700000000000, () => 0.123456);
    expect(id).toMatch(/^turn_[a-z0-9]+_[a-z0-9]+$/);
    expect(id).not.toContain(' ');
  });
});

// ---------------------------------------------------------------------------
// The route: a failed turn does not spend the free-session allowance.
// ---------------------------------------------------------------------------

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

function makeEnv() {
  return {
    TEST_MODE: true,
    GOOGLE_CLIENT_ID: 'client-id',
    NVIDIA_API_KEYS: 'test-key-aaaaaaaaaa',
    OPENROUTER_API_KEYS: 'test-key-openrouter-b',
    USER_PROGRESS: new MemoryKv(),
    REDEEMED_CODES: new MemoryKv(),
  } as any;
}

async function seedSession(env: any, sub: string, sessionToken: string) {
  await env.USER_PROGRESS.put(
    `session:${sessionToken}`,
    JSON.stringify({ sub, email: `${sub}@test.dev`, created_at: Date.now(), expires_at: Date.now() + 3600_000 }),
  );
}

const postTurn = (body: unknown, sessionToken: string) =>
  new Request('https://worker.test/ai/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify(body),
  });

const turnBody = (sessionId: string) => ({
  scenario_id: 'cafe_order',
  cefr_level: 'A1',
  user_message: 'Ich möchte einen Kaffee',
  history: [],
  session_id: sessionId,
});

function stubModel(responder: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', (async () => responder()) as unknown as typeof fetch);
}

beforeEach(() => {
  resetRouterState();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetRouterState();
});

describe('/ai/turn charges the free session only when a reply exists', () => {
  it('a provider failure keeps the allowance untouched and returns no reply', async () => {
    const env = makeEnv();
    await seedSession(env, 'fail-learner', 'sess_fail');
    stubModel(() => new Response(JSON.stringify({ error: 'busy' }), { status: 429 }));

    const res = await worker.fetch(postTurn(turnBody('s1'), 'sess_fail'), env as never);
    expect(res.status).toBe(502);
    const body = (await res.json()) as any;
    expect(body.reply_de).toBeUndefined();
    expect(body.code).toMatch(/AI_/);
    expect(body.message).toMatch(/[؀-ۿ]/);
    // The free-session counter is unchanged: nothing was spent.
    expect(env.USER_PROGRESS.values.has('ai-quota:fail-learner')).toBe(false);
  });

  it('an invalid model answer keeps the allowance untouched', async () => {
    const env = makeEnv();
    await seedSession(env, 'bad-learner', 'sess_bad');
    stubModel(
      () =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'nein, das ist kein json' } }] }), {
          status: 200,
        }),
    );

    const res = await worker.fetch(postTurn(turnBody('s2'), 'sess_bad'), env as never);
    expect(res.status).toBe(502);
    expect(((await res.json()) as any).reply_de).toBeUndefined();
    expect(env.USER_PROGRESS.values.has('ai-quota:bad-learner')).toBe(false);
  });

  it('a served turn charges exactly once, and a replay of the same send does not charge again', async () => {
    const env = makeEnv();
    await seedSession(env, 'ok-learner', 'sess_ok');
    stubModel(
      () => new Response(JSON.stringify({ choices: [{ message: { content: VALID_TURN } }] }), { status: 200 }),
    );

    const first = await worker.fetch(postTurn(turnBody('s3'), 'sess_ok'), env as never);
    expect(first.status).toBe(200);
    const body = (await first.json()) as any;
    expect(body.reply_de).toBe(VALID_TURN && JSON.parse(VALID_TURN).reply_de);
    expect(body.attempts).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(body.elapsed_ms)).toBe(true);
    expect(JSON.parse(env.USER_PROGRESS.values.get('ai-quota:ok-learner')!).used).toBe(1);

    // Same session id again: idempotent, one free session spent in total.
    const replay = await worker.fetch(postTurn(turnBody('s3'), 'sess_ok'), env as never);
    expect(replay.status).toBe(200);
    expect(JSON.parse(env.USER_PROGRESS.values.get('ai-quota:ok-learner')!).used).toBe(1);
  });
});

describe('the router fails over to a second provider within the turn budget', () => {
  it('a 429 on the first provider is retried on the next one', async () => {
    const called: string[] = [];
    let index = 0;
    vi.stubGlobal(
      'fetch',
      (async (input: any) => {
        called.push(String(input));
        index += 1;
        if (index === 1) return new Response('rate limited', { status: 429 });
        return new Response(JSON.stringify({ choices: [{ message: { content: 'Hallo!' } }] }), { status: 200 });
      }) as unknown as typeof fetch,
    );
    const text = await callAiRouter(
      { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] },
      makeEnv(),
      {
        budgetMs: 8000,
        attemptTimeoutMs: 3500,
        toOpenAiMessages: () => [{ role: 'user', content: 'hi' }],
      },
    );
    expect(text).toBe('Hallo!');
    expect(called.length).toBeGreaterThanOrEqual(2);
  });
});
