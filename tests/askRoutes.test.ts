import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';
import {
  ASK_QUOTA_DEFAULTS,
  MAX_ASK_CHARS,
  MAX_ASK_EXAMPLES,
  MAX_ASK_PRACTICE,
  askInputProblem,
  askQuotaFor,
  buildAskPrompt,
  buildAskResponseSchema,
  classifyAskIntent,
  handleAskRoute,
  isLegalGermanQuestion,
  normalizeAskAnswer,
} from '../cloudflare-ask.js';

/**
 * Ask Katzu is a German-only assistant with its own quota. The things that would
 * make it dishonest, pinned here: answering something that is not a German
 * question, showing an answer with no practice (so "understanding" is never
 * confirmed), reading an English refusal as a refusal, and spending the wrong
 * daily cap.
 */

const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2'];

const json = (obj: unknown, status: number, cors: Record<string, string> = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });

const modelReply = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    in_scope: true,
    refusal_ar: '',
    intent: 'grammar',
    explanation_ar: 'الأكوزاتيف حالة النصب: الاسم المذكر يتغيّر فيه der إلى den.',
    examples: [{ de: 'Ich kaufe den Kaffee.', ar: 'أشتري القهوة.' }],
    practice: [
      { type: 'translate', prompt_ar: 'أشتري التفاحة.', prompt_de: '', answer_de: 'Ich kaufe den Apfel.' },
      { type: 'fill', prompt_ar: 'املأ الفراغ.', prompt_de: 'Ich sehe ___ Mann.', answer_de: 'den' },
      { type: 'reorder', prompt_ar: 'رتّب.', prompt_de: 'Kaffee / Ich / den / kaufe', answer_de: 'Ich kaufe den Kaffee' },
    ],
    ...overrides,
  });

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    authenticateAiRequest: async () => ({ account: { sub: 'asker' } }),
    hasUsableProvider: () => true,
    callAiRouter: async () => modelReply(),
    cleanJson: (raw: string) => JSON.parse(raw),
    json,
    validLevels: new Set(LEVELS),
    checkGlobalRateLimit: async () => ({ allowed: true }),
    checkUserEntitlement: async () => ({ allowed: true, isSubscribed: false }),
    ...overrides,
  } as any;
}

function askRequest(body: unknown) {
  return new Request('https://worker.test/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { question: 'اشرح لي حالة الأكوزاتيف.', cefr_level: 'A1' };

describe('the ask input gate (deterministic)', () => {
  it('rejects empty, letterless and over-long input before any model call', () => {
    expect(askInputProblem('')).toBe('too_short');
    expect(askInputProblem('a')).toBe('too_short');
    expect(askInputProblem('123 ...')).toBe('no_letters');
    expect(askInputProblem('ا'.repeat(MAX_ASK_CHARS + 1))).toBe('too_long');
    expect(askInputProblem('اشرح لي الأكوزاتيف')).toBeNull();
  });

  it('flags official/legal German in both languages, and only then', () => {
    expect(isLegalGermanQuestion('اشرح لي هذا الـ Bescheid')).toBe(true);
    expect(isLegalGermanQuestion('ما معنى Kündigung؟')).toBe(true);
    expect(isLegalGermanQuestion('هذا نص قانوني رسمي')).toBe(true);
    expect(isLegalGermanQuestion('اشرح لي حالة الأكوزاتيف')).toBe(false);
  });

  it('labels the likely task without blocking any answer', () => {
    expect(classifyAskIntent('ترجم هذه الجملة إلى الألمانية')).toBe('translate');
    expect(classifyAskIntent('صحّح جملتي: Ich habe gegangen')).toBe('check_sentence');
    expect(classifyAskIntent('ما معنى كلمة Termin؟')).toBe('word');
    expect(classifyAskIntent('اشرح معنى هذا Bescheid')).toBe('official');
    expect(classifyAskIntent('اشرح لي الفرق بين Dativ و Akkusativ')).toBe('grammar');
  });
});

describe('the ask quota is worker config', () => {
  it('uses the defaults when env is absent', () => {
    expect(askQuotaFor({}, false)).toEqual({ perMinute: ASK_QUOTA_DEFAULTS.perMinute, perDay: ASK_QUOTA_DEFAULTS.freePerDay });
    expect(askQuotaFor({}, true)).toEqual({ perMinute: ASK_QUOTA_DEFAULTS.perMinute, perDay: ASK_QUOTA_DEFAULTS.proPerDay });
  });

  it('reads the configured numbers, free and Pro separately', () => {
    const env = { ASK_FREE_PER_DAY: '3', ASK_PRO_PER_DAY: '99', ASK_RATE_PER_MINUTE: '2' };
    expect(askQuotaFor(env, false)).toEqual({ perMinute: 2, perDay: 3 });
    expect(askQuotaFor(env, true)).toEqual({ perMinute: 2, perDay: 99 });
    // A non-numeric or non-positive override falls back rather than removing the cap.
    expect(askQuotaFor({ ASK_FREE_PER_DAY: 'lots' }, false).perDay).toBe(ASK_QUOTA_DEFAULTS.freePerDay);
    expect(askQuotaFor({ ASK_FREE_PER_DAY: '0' }, false).perDay).toBe(ASK_QUOTA_DEFAULTS.freePerDay);
  });
});

describe('normalizing the model answer', () => {
  it('accepts a real answer with examples and practice', () => {
    const answer = normalizeAskAnswer(JSON.parse(modelReply()));
    expect(answer?.inScope).toBe(true);
    expect(answer?.practice).toHaveLength(3);
    expect(answer?.explanationAr).toContain('الأكوزاتيف');
  });

  it('caps examples and practice rather than forwarding whatever came back', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      type: 'translate',
      prompt_ar: `جملة ${i}`,
      answer_de: `Satz ${i}`,
    }));
    const examples = Array.from({ length: 9 }, (_, i) => ({ de: `Satz ${i}`, ar: `جملة ${i}` }));
    const answer = normalizeAskAnswer(JSON.parse(modelReply({ practice: many, examples })));
    expect(answer?.practice).toHaveLength(MAX_ASK_PRACTICE);
    expect(answer?.examples).toHaveLength(MAX_ASK_EXAMPLES);
  });

  it('refuses to show an answer with no gradable practice', () => {
    expect(normalizeAskAnswer(JSON.parse(modelReply({ practice: [] })))).toBeNull();
    // A practice item without an answer is not gradable either.
    expect(normalizeAskAnswer(JSON.parse(modelReply({ practice: [{ type: 'translate', prompt_ar: 'جملة' }] })))).toBeNull();
  });

  it('requires the explanation to actually be Arabic', () => {
    expect(normalizeAskAnswer(JSON.parse(modelReply({ explanation_ar: 'This is fine.' })))).toBeNull();
  });

  it('turns an off-topic refusal into a refusal, not an answer', () => {
    const refusal = normalizeAskAnswer(
      JSON.parse(modelReply({ in_scope: false, refusal_ar: 'كَاتْزُو هنا لتعليم الألمانية فقط.', explanation_ar: '', practice: [], examples: [] })),
    );
    expect(refusal?.inScope).toBe(false);
    expect(refusal?.refusalAr).toContain('الألمانية');
    expect(refusal?.practice).toEqual([]);
    // An English "refusal" is not one.
    expect(normalizeAskAnswer(JSON.parse(modelReply({ in_scope: false, refusal_ar: 'Please ask about German.' })))).toBeNull();
  });

  it('marks official German as legal, and never leaves that to the model alone', () => {
    const flagged = normalizeAskAnswer(JSON.parse(modelReply()), { legal: true });
    expect(flagged?.legal).toBe(true);
    expect(normalizeAskAnswer(JSON.parse(modelReply()))?.legal).toBe(false);
  });

  it('ships a prompt that fences the learner text and a schema the normalizer reads', () => {
    const prompt = buildAskPrompt({ question: 'اشرح', level: 'A2', legal: false, intentHint: 'grammar' });
    expect(prompt).toContain('"""');
    expect(prompt).toContain('DATA');
    expect(prompt).toContain('CEFR A2');
    expect(Object.keys(buildAskResponseSchema().properties)).toContain('practice');
    expect(buildAskResponseSchema().properties.practice.items.properties.type.enum).toEqual(['fill', 'reorder', 'translate']);
  });
});

describe('the /ai/ask handler', () => {
  it('rejects input before spending a model call', async () => {
    const res = await handleAskRoute(askRequest({ question: '...' }), {}, {}, makeDeps());
    expect(res.status).toBe(400);
    expect((await res.json() as any).code).toBe('ASK_INVALID_INPUT');
  });

  it('rejects over-long input with a 413', async () => {
    const res = await handleAskRoute(askRequest({ question: 'ا'.repeat(MAX_ASK_CHARS + 5) }), {}, {}, makeDeps());
    expect(res.status).toBe(413);
  });

  it('applies the free daily cap under its own scope and says the limit', async () => {
    let captured: any = null;
    const deps = makeDeps({
      checkGlobalRateLimit: async (_sub: string, _env: object, scope: any) => {
        captured = scope;
        return { allowed: true };
      },
    });
    const res = await handleAskRoute(askRequest(VALID_BODY), {}, {}, deps);
    expect(res.status).toBe(200);
    expect(captured).toEqual({ scope: 'ask', perMinute: ASK_QUOTA_DEFAULTS.perMinute, perDay: ASK_QUOTA_DEFAULTS.freePerDay });
    expect((await res.json() as any).quota.daily_limit).toBe(ASK_QUOTA_DEFAULTS.freePerDay);
  });

  it('gives a Pro learner the larger cap', async () => {
    let captured: any = null;
    const deps = makeDeps({
      checkUserEntitlement: async () => ({ allowed: true, isSubscribed: true }),
      checkGlobalRateLimit: async (_sub: string, _env: object, scope: any) => {
        captured = scope;
        return { allowed: true };
      },
    });
    const res = await handleAskRoute(askRequest(VALID_BODY), { ASK_PRO_PER_DAY: '99' }, {}, deps);
    expect(captured.perDay).toBe(99);
    expect((await res.json() as any).quota.is_pro).toBe(true);
  });

  it('returns a 429 with an Arabic message once the daily cap is spent', async () => {
    const deps = makeDeps({ checkGlobalRateLimit: async () => ({ allowed: false, retryAfter: 120, reason: 'day_limit' }) });
    const res = await handleAskRoute(askRequest(VALID_BODY), {}, {}, deps);
    expect(res.status).toBe(429);
    const body = await res.json() as any;
    expect(body.code).toBe('ASK_QUOTA_EXCEEDED');
    expect(body.message).toMatch(/[\u0600-\u06FF]/);
    expect(body.daily_limit).toBe(ASK_QUOTA_DEFAULTS.freePerDay);
  });

  it('passes an auth refusal straight through', async () => {
    const unauth = json({ error: 'unauthenticated', code: 'UNAUTHENTICATED' }, 401, {});
    const res = await handleAskRoute(askRequest(VALID_BODY), {}, {}, makeDeps({ authenticateAiRequest: async () => ({ response: unauth }) }));
    expect(res.status).toBe(401);
  });

  it('returns 503 without a usable provider instead of a fake explanation', async () => {
    const res = await handleAskRoute(askRequest(VALID_BODY), {}, {}, makeDeps({ hasUsableProvider: () => false }));
    expect(res.status).toBe(503);
  });

  it('keeps the question and asks for a retry when the model fails', async () => {
    const deps = makeDeps({ callAiRouter: async () => { throw new Error('pool down'); } });
    const res = await handleAskRoute(askRequest(VALID_BODY), {}, {}, deps);
    expect(res.status).toBe(502);
    expect((await res.json() as any).message).toMatch(/[\u0600-\u06FF]/);
  });

  it('is unusable when the model returns no gradable practice', async () => {
    const deps = makeDeps({ callAiRouter: async () => modelReply({ practice: [] }) });
    const res = await handleAskRoute(askRequest(VALID_BODY), {}, {}, deps);
    expect(res.status).toBe(502);
    expect((await res.json() as any).code).toBe('ASK_UNUSABLE');
  });

  it('serves a validated answer on success', async () => {
    const res = await handleAskRoute(askRequest(VALID_BODY), {}, {}, makeDeps());
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.answer.inScope).toBe(true);
    expect(body.answer.practice).toHaveLength(3);
    expect(body.quota.daily_limit).toBe(ASK_QUOTA_DEFAULTS.freePerDay);
  });
});

describe('route wiring', () => {
  class MemoryKv {
    values = new Map<string, string>();
    async get(key: string) { return this.values.get(key) || null; }
    async put(key: string, value: string) { this.values.set(key, value); }
    async delete(key: string) { this.values.delete(key); }
  }

  it('requires a session before any answer', async () => {
    const env: any = { USER_PROGRESS: new MemoryKv() };
    const res = await worker.fetch(askRequest(VALID_BODY), env);
    expect(res.status).toBe(401);
    expect((await res.json() as any).code).toBe('UNAUTHENTICATED');
  });
});
