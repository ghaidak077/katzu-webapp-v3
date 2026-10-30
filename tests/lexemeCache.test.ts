import { describe, expect, it, vi } from 'vitest';
import worker from '../cloudflare-unified-worker';
import { lexemeKey, lexemeStem } from '../cloudflare-ai-chat.js';

/**
 * `/ai/lexeme` — the LAST resort behind the shipped glossary (V30).
 *
 * The claim under test is a cost claim, so it is asserted in calls: the second
 * learner who asks for a word already answered pays nothing, and an inflected form
 * of that word pays nothing either, because the cache is keyed by STEM. It lives
 * in its own file (not `aiRoutes.test.ts`, which is at its line budget) with the
 * two helpers it needs.
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
    NVIDIA_API_KEYS: 'test-key-aaaaaaaaaa',
    OPENROUTER_API_KEYS: 'test-key-openrouter-b',
    USER_PROGRESS: new MemoryKv(),
    DB: {
      prepare: () => ({
        bind: () => ({ run: async () => ({ success: true }), all: async () => ({ results: [] }), first: async () => null }),
        run: async () => ({ success: true }),
        all: async () => ({ results: [] }),
        first: async () => null,
      }),
      batch: async () => [],
    },
    ...overrides,
  };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const providerText = (text: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('/ai/lexeme — one lookup per lemma, shared by the fleet', () => {
  it('refuses an unauthenticated learner without calling a model', async () => {
    const calls = vi.fn();
    vi.stubGlobal('fetch', calls);

    const res = await worker.fetch(post('/ai/lexeme', { word: 'Deutschlernen' }), makeEnv() as never);

    expect(res.status).toBe(401);
    expect(calls).not.toHaveBeenCalled();
  });

  it('answers the second learner of the same lemma from cache, spending one call', async () => {
    const env = makeEnv();
    await seedSession(env, 'a1-learner', 'sess_a1_learner');
    await seedSession(env, 'a2-learner', 'sess_a2_learner');

    const modelCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      (async (input: any) => {
        modelCalls.push(String(input));
        return providerText(
          JSON.stringify({ ar: 'تعلّم اللغة الألمانية', pos: 'noun', level: 'A1', lemma: 'Deutschlernen' }),
        );
      }) as unknown as typeof fetch,
    );

    const first = await worker.fetch(
      post('/ai/lexeme', { word: 'Deutschlernen' }, { Authorization: 'Bearer sess_a1_learner' }),
      env as never,
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as any;
    expect(firstBody.ar).toBe('تعلّم اللغة الألمانية');
    expect(firstBody.cached).toBe(false);
    const afterFirst = modelCalls.length;
    expect(afterFirst).toBeGreaterThan(0);

    // A DIFFERENT learner, the SAME stem: an inflected form must reuse the entry.
    const second = await worker.fetch(
      post('/ai/lexeme', { word: 'deutschlernens' }, { Authorization: 'Bearer sess_a2_learner' }),
      env as never,
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as any;
    expect(secondBody.cached).toBe(true);
    expect(secondBody.ar).toBe('تعلّم اللغة الألمانية');
    expect(modelCalls.length).toBe(afterFirst);
  });

  it('rejects a request with no word instead of guessing', async () => {
    const env = makeEnv();
    await seedSession(env, 'a1-learner', 'sess_a1_learner');
    const res = await worker.fetch(
      post('/ai/lexeme', { word: '   ' }, { Authorization: 'Bearer sess_a1_learner' }),
      env as never,
    );
    expect(res.status).toBe(400);
  });

  it('folds articles and endings into one stem, and keeps different words apart', () => {
    expect(lexemeKey('die Wohnung')).toBe('wohnung');
    expect(lexemeStem(lexemeKey('die Wohnung'))).toBe(lexemeStem(lexemeKey('Wohnungen')));
    expect(lexemeStem(lexemeKey('Deutschlernen'))).toBe(lexemeStem(lexemeKey('deutschlernens')));
    expect(lexemeStem(lexemeKey('lernen'))).not.toBe(lexemeStem(lexemeKey('wohnen')));
    expect(lexemeKey('')).toBe('');
  });
});
