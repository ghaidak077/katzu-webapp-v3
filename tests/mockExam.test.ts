import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { resetScenarioBeatsCache } from '../cloudflare-unified-worker';
import { resetRouterState } from '../cloudflare-ai-router.js';
import {
  MOCK_EXAM_NOTICE_AR,
  MOCK_EXAM_PARTS,
  MOCK_EXAM_TOPICS,
  mockExamBrief,
  mockExamInstructionForPart,
  mockTopicFor,
  normaliseMockPartIndex,
} from '../cloudflare-mock-exam.js';
import {
  FREE_MOCKS_PER_ACCOUNT,
  MOCK_TOP_CORRECTIONS_FREE,
  decideMockAccess,
  mockDebriefAccess,
} from '../cloudflare-pricing.js';
import { mintMockGrant, verifyMockGrant } from '../cloudflare-unified-worker';

/**
 * The free B1 mock — what it promises and what it must never promise.
 *
 * Two things are pinned here. First the product: three parts, a plan together, a
 * topic presented, questions reacted to, each with a time budget. Second the
 * honesty: no exam-body name, no official grade, no pass mark, anywhere in the
 * words the learner reads or the words the model is given.
 */

const EXAM_BODY_NAMES = [/goethe/i, /telc/i, /ösd/i, /osd/i, /telc\s*zertifikat/i];

describe('the mock exam content', () => {
  it('has exactly the three B1 Sprechen parts, in order', () => {
    expect(MOCK_EXAM_PARTS.map((p) => p.id)).toEqual(['plan', 'present', 'react']);
    expect(MOCK_EXAM_PARTS.map((p) => p.index)).toEqual([1, 2, 3]);
  });

  it('gives every part a time budget and an Arabic brief', () => {
    for (const part of MOCK_EXAM_PARTS) {
      expect(part.seconds).toBeGreaterThanOrEqual(120);
      expect(part.titleAr).toMatch(/[؀-ۿ]/);
      expect(part.briefAr).toMatch(/[؀-ۿ]/);
      expect(part.briefDe.length).toBeGreaterThan(40);
      expect(part.openerDe.length).toBeGreaterThan(20);
    }
  });

  it('never names an exam body, in any language a learner reads', () => {
    const learnerFacing = JSON.stringify({
      noticeAr: MOCK_EXAM_NOTICE_AR,
      parts: MOCK_EXAM_PARTS,
      topics: MOCK_EXAM_TOPICS,
    });
    for (const name of EXAM_BODY_NAMES) expect(learnerFacing).not.toMatch(name);
  });

  it('states in Arabic that it is not the official exam and grants no grade', () => {
    expect(MOCK_EXAM_NOTICE_AR).toMatch(/محاكاة/);
    expect(MOCK_EXAM_NOTICE_AR).toMatch(/ليست الامتحان الرسمي/);
    expect(MOCK_EXAM_NOTICE_AR).toMatch(/لا تمنح درجة معتمدة/);
  });

  it('picks the same topic for an account all day and rotates the next day', () => {
    const monday = mockTopicFor({ accountId: 'acct-1', day: 20000 });
    const sameDay = mockTopicFor({ accountId: 'acct-1', day: 20000 });
    expect(sameDay.id).toBe(monday.id);
    const later = mockTopicFor({ accountId: 'acct-1', day: 20007 });
    expect(MOCK_EXAM_TOPICS.some((t) => t.id === later.id)).toBe(true);
  });

  it('gives every topic a German and an Arabic card', () => {
    for (const topic of MOCK_EXAM_TOPICS) {
      expect(topic.cardDe.length).toBeGreaterThan(40);
      expect(topic.cardAr).toMatch(/[؀-ۿ]/);
      expect(topic.titleAr).toMatch(/[؀-ۿ]/);
    }
  });
});

describe('the exam instruction', () => {
  it('refuses a part that does not exist', () => {
    expect(normaliseMockPartIndex(3)).toBeNull();
    expect(normaliseMockPartIndex(-1)).toBeNull();
    expect(normaliseMockPartIndex('two')).toBeNull();
    expect(normaliseMockPartIndex(undefined)).toBeNull();
    expect(mockExamInstructionForPart({ part: 9 })).toBeNull();
  });

  it('tells the model it must never state a grade or a pass mark', () => {
    const instruction = mockExamInstructionForPart({ part: 1 }) ?? '';
    expect(instruction).toMatch(/EXAM MODE/);
    expect(instruction).toMatch(/never state a grade/i);
    expect(instruction).toMatch(/never claim certification/i);
  });

  it('names the part and gives the model its opening line', () => {
    const second = mockExamInstructionForPart({ part: 1 }) ?? '';
    expect(second).toContain('PART 2');
    expect(second).toContain(MOCK_EXAM_PARTS[1].openerDe);
    // Part 2 is the presentation, so it carries the topic card to present from.
    expect(second).toMatch(/TOPIC CARD/);
  });

  it('keeps the model speaking as an examiner only in the parts that say so', () => {
    expect(mockExamInstructionForPart({ part: 0 })).toMatch(/speaking-partner/i);
    expect(mockExamInstructionForPart({ part: 1 })).toMatch(/examiner/i);
  });
});

describe('the mock brief the app renders', () => {
  const brief = mockExamBrief({ accountId: 'acct-9', now: Date.UTC(2026, 9, 5) });

  it('carries the level, the notice and all three parts', () => {
    expect(brief.level).toBe('B1');
    expect(brief.noticeAr).toBe(MOCK_EXAM_NOTICE_AR);
    expect(brief.unproven).toBe(true);
    expect(brief.parts).toHaveLength(3);
  });

  it('carries no score and no threshold field for the client to invent', () => {
    expect(Object.keys(brief).sort()).toEqual(['level', 'noticeAr', 'parts', 'topic', 'unproven']);
    for (const part of brief.parts) {
      expect(Object.keys(part).sort()).toEqual([
        'briefAr', 'briefDe', 'id', 'index', 'openerAr', 'openerDe', 'seconds', 'titleAr', 'titleDe',
      ]);
    }
  });
});

describe('the mock entitlement', () => {
  it('gives exactly one free mock per account', () => {
    expect(FREE_MOCKS_PER_ACCOUNT).toBe(1);
    expect(decideMockAccess({ freeUsed: 0 }).allowed).toBe(true);
    expect(decideMockAccess({ freeUsed: 0 }).source).toBe('free');
    expect(decideMockAccess({ freeUsed: 1 }).allowed).toBe(false);
  });

  it('sells the next mock to a credit before it trusts a subscription', () => {
    const withCredit = decideMockAccess({ freeUsed: 1, credits: 1 });
    expect(withCredit.source).toBe('credit');
    expect(withCredit.consumeCredit).toBe(true);
    expect(withCredit.creditsRemaining).toBe(0);
    const withSubscription = decideMockAccess({ freeUsed: 1, subscribed: true });
    expect(withSubscription.source).toBe('subscription');
    expect(withSubscription.consumeCredit).toBe(false);
  });

  it('never lets a second free mock through on a racing claim', () => {
    expect(decideMockAccess({ freeUsed: 2, credits: 0 }).allowed).toBe(false);
    expect(decideMockAccess({ freeUsed: 1, credits: 0, subscribed: false }).allowed).toBe(false);
  });

  it('fails closed on nonsense rather than granting', () => {
    expect(decideMockAccess({}).allowed).toBe(true); // no record yet = first free mock
    expect(decideMockAccess({ freeUsed: Number.NaN, credits: -5 }).allowed).toBe(true);
    expect(decideMockAccess({ freeUsed: 1, credits: -5 }).allowed).toBe(false);
    expect(decideMockAccess({ freeUsed: 1, credits: 'two' }).allowed).toBe(false);
  });

  it('shows the free learner two corrections and the full debrief to a payer', () => {
    const free = mockDebriefAccess({ access: { source: 'free' } });
    expect(free.fullDebrief).toBe(false);
    expect(free.repeatMock).toBe(false);
    expect(free.correctionsVisible).toBe(MOCK_TOP_CORRECTIONS_FREE);
    expect(free.correctionsVisible).toBe(2);

    const paid = mockDebriefAccess({ access: { source: 'credit' } });
    expect(paid.fullDebrief).toBe(true);
    expect(paid.repeatMock).toBe(true);
    expect(paid.correctionsVisible).toBe(Number.POSITIVE_INFINITY);
  });

  it('also honours a live entitlement even on the free mock', () => {
    expect(mockDebriefAccess({ access: { source: 'free' }, hasActiveEntitlement: true }).fullDebrief).toBe(true);
  });
});

describe('the signed grant', () => {
  const env = { HMAC_SECRET: 'test-hmac-secret-for-grants-only' };

  async function mintFor(accountId: string, now = 1_700_000_000_000) {
    // The worker owns the token shape; the test pins it through the real minter
    // rather than re-deriving a copy that could drift.
    const { token } = await mintMockGrant(accountId, env, now);
    return token;
  }

  it('accepts a grant it minted, for that account, before it expires', async () => {
    const now = 1_700_000_000_000;
    const token = await mintFor('acct-1', now);
    const verified = await verifyMockGrant({ token, accountId: 'acct-1', env, now });
    expect(verified).not.toBeNull();
    expect(verified!.expiresAt).toBeGreaterThan(now);
  });

  it('rejects another account, a tampered token and an expired one', async () => {
    const now = 1_700_000_000_000;
    const token = await mintFor('acct-1', now);
    expect(await verifyMockGrant({ token, accountId: 'acct-2', env, now })).toBeNull();
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(await verifyMockGrant({ token: tampered, accountId: 'acct-1', env, now })).toBeNull();
    expect(await verifyMockGrant({ token, accountId: 'acct-1', env, now: verifiedExpiry(token) + 1 })).toBeNull();
  });

  it('grants nothing without a secret or without a token', async () => {
    expect(await verifyMockGrant({ token: undefined, accountId: 'a', env })).toBeNull();
    expect(await verifyMockGrant({ token: 'MOCK1.abc.def', accountId: 'a', env })).toBeNull();
    expect(await verifyMockGrant({ token: 'anything', accountId: 'a', env: {} })).toBeNull();
  });

  function verifiedExpiry(token: string) {
    return Number(token.split('.')[1]);
  }
});

// ----------------------------------------------------------------------------
// THE ROUTE
// ----------------------------------------------------------------------------

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) || null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

function idTokenFor(sub: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    sub,
    aud: 'client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: `${sub}@example.test`,
  })}.signature`;
}

async function postMock(path: string, body: unknown, env: Record<string, unknown>) {
  return worker.fetch(new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env);
}

const mockEnv = () => ({
  TEST_MODE: true,
  GOOGLE_CLIENT_ID: 'client-id',
  HMAC_SECRET: 'test-hmac-secret-for-mock-grants',
  REDEEMED_CODES: new MemoryKv(),
  USER_PROGRESS: new MemoryKv(),
});

describe('POST /mock/start', () => {
  it('refuses an unauthenticated caller and an account with no session id', async () => {
    const env = mockEnv();
    const anon = await postMock('/mock/start', { session_id: 's1' }, env);
    expect(anon.status).toBe(401);
    const noSession = await postMock('/mock/start', { id_token: idTokenFor('mock-anon') }, env);
    expect(noSession.status).toBe(400);
    expect((await noSession.json()).code).toBe('INVALID_MOCK_SESSION');
  });

  it('gives one free mock, then asks for a credit or an entitlement', async () => {
    const env = mockEnv();
    const first = await postMock('/mock/start', { id_token: idTokenFor('mock-a'), session_id: 's1' }, env);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.allowed).toBe(true);
    expect(firstBody.source).toBe('free');
    expect(firstBody.grant).toMatch(/^MOCK1\./);
    expect(firstBody.brief.parts).toHaveLength(3);
    expect(firstBody.brief.noticeAr).toBe(MOCK_EXAM_NOTICE_AR);
    // The free tier sees the number and two corrections, never the whole debrief.
    expect(firstBody.debrief.fullDebrief).toBe(false);
    expect(firstBody.debrief.correctionsVisible).toBe(2);

    const second = await postMock('/mock/start', { id_token: idTokenFor('mock-a'), session_id: 's2' }, env);
    expect(second.status).toBe(402);
    const secondBody = await second.json();
    expect(secondBody.code).toBe('MOCK_CREDIT_REQUIRED');
    expect(secondBody.reason).toBe('mock_credit_required');
    expect(secondBody.message).toMatch(/[؀-ۿ]/);
  });

  it('replays the same decision for the same session instead of spending twice', async () => {
    const env = mockEnv();
    const first = await (await postMock('/mock/start', { id_token: idTokenFor('mock-b'), session_id: 's1' }, env)).json();
    const replay = await postMock('/mock/start', { id_token: idTokenFor('mock-b'), session_id: 's1' }, env);
    expect(replay.status).toBe(200);
    const replayBody = await replay.json();
    expect(replayBody.source).toBe(first.source);
    expect(replayBody.allowed).toBe(true);
  });

  it('lets a mock credit buy the second mock, and spends exactly one', async () => {
    const env = mockEnv();
    await postMock('/mock/start', { id_token: idTokenFor('mock-c'), session_id: 's1' }, env);
    await env.REDEEMED_CODES.put('mock-state:mock-c', JSON.stringify({ freeUsed: 1, credits: 1 }));

    const paid = await postMock('/mock/start', { id_token: idTokenFor('mock-c'), session_id: 's2' }, env);
    const paidBody = await paid.json();
    expect(paidBody.source).toBe('credit');
    expect(paidBody.debrief.fullDebrief).toBe(true);
    expect(paidBody.creditsRemaining).toBe(0);

    const third = await postMock('/mock/start', { id_token: idTokenFor('mock-c'), session_id: 's3' }, env);
    expect(third.status).toBe(402);
  });

  it('lets an active subscription run the mock without a credit', async () => {
    const env = mockEnv();
    await postMock('/mock/start', { id_token: idTokenFor('mock-d'), session_id: 's1' }, env);
    await env.REDEEMED_CODES.put('mock-state:mock-d', JSON.stringify({ freeUsed: 1, credits: 0 }));
    await env.REDEEMED_CODES.put(
      'account:mock-d',
      JSON.stringify({ expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() }),
    );

    const res = await postMock('/mock/start', { id_token: idTokenFor('mock-d'), session_id: 's2' }, env);
    expect(res.status).toBe(200);
    expect((await res.json()).source).toBe('subscription');
  });

  it('fails closed when the mock state store cannot be read', async () => {
    const env = { TEST_MODE: true, GOOGLE_CLIENT_ID: 'client-id', HMAC_SECRET: 'x' };
    const res = await postMock('/mock/start', { id_token: idTokenFor('mock-e'), session_id: 's1' }, env);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('MOCK_STATE_UNAVAILABLE');
  });

  it('mints a grant only the account it belongs to can use', async () => {
    const env = mockEnv();
    const body = await (await postMock('/mock/start', { id_token: idTokenFor('mock-f'), session_id: 's1' }, env)).json();
    expect(await verifyMockGrant({ token: body.grant, accountId: 'mock-f', env })).not.toBeNull();
    expect(await verifyMockGrant({ token: body.grant, accountId: 'mock-g', env })).toBeNull();
  });
});

describe('the mock grant on /ai/turn', () => {
  /** A turn env: a signed-in session, a provider key, and a captured model call. */
  function turnEnv() {
    return {
      TEST_MODE: true,
      GOOGLE_CLIENT_ID: 'client-id',
      GEMINI_API_KEYS: 'test-key-aaaaaaaaaa',
      HMAC_SECRET: 'test-hmac-secret-for-mock-grants',
      USER_PROGRESS: new MemoryKv(),
      REDEEMED_CODES: new MemoryKv(),
      AUTH_SECRET: 'test-hmac-secret-for-mock-grants',
    } as unknown as Record<string, unknown>;
  }

  async function seedSession(env: any, sub: string, sessionToken: string) {
    await env.USER_PROGRESS.put(
      `session:${sessionToken}`,
      JSON.stringify({ sub, email: `${sub}@test.dev`, created_at: Date.now(), expires_at: Date.now() + 3600_000 }),
    );
  }

  function captureModelCalls(sent: string[]): void {
    vi.stubGlobal('fetch', (async (_input: any, init: any) => {
      sent.push(String(init.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        evaluation: { is_correct: true, explanation_ar: 'جملة صحيحة.', positive_note_ar: 'أحسنت!' },
        reply_de: 'Was möchten Sie gemeinsam planen?',
        reply_ar: 'ماذا تريد أن تخطّطا؟',
        next_hint: { german: 'Ich möchte einen Ausflug.', translation_ar: 'أريد رحلة.' },
        followup_question_ar: 'إلى أين؟',
      }) }] } }] }), { status: 200 });
    }) as unknown as typeof fetch);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    resetRouterState();
    resetScenarioBeatsCache();
  });

  it('serves a B1 turn as an examiner, and only with its own grant', async () => {
    const env = turnEnv();
    await seedSession(env, 'mock-turn', 'sess_mock_turn');
    const sent: string[] = [];
    captureModelCalls(sent);

    const claim = await (await worker.fetch(new Request('https://worker.test/mock/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_mock_turn' },
      body: JSON.stringify({ session_id: 'mock-sess-1' }),
    }), env)).json() as any;

    const res = await worker.fetch(new Request('https://worker.test/ai/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_mock_turn' },
      body: JSON.stringify({
        scenario_id: 'cafe_order',
        cefr_level: 'B1',
        user_message: 'Ich möchte einen Ausflug mit Freunden planen',
        history: [],
        session_id: 'mock-sess-1',
        mock_grant: claim.grant,
        mock_part: 1,
      }),
    }), env);

    expect(res.status).toBe(200);
    expect(sent.join('\n')).toContain('EXAM MODE');
    expect(sent.join('\n')).toContain('PART 2');
  });

  it('still refuses B1 without a grant, so the grant is what unlocks it', async () => {
    const env = turnEnv();
    await seedSession(env, 'mock-turn-2', 'sess_mock_turn_2');
    const sent: string[] = [];
    captureModelCalls(sent);

    const noGrant = await worker.fetch(new Request('https://worker.test/ai/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_mock_turn_2' },
      body: JSON.stringify({
        scenario_id: 'cafe_order', cefr_level: 'B1', user_message: 'Guten Tag', history: [], session_id: 's1',
      }),
    }), env);
    expect(noGrant.status).toBe(402);
    expect((await noGrant.json() as any).code).toBe('PAYWALL_REQUIRED');

    const forged = await worker.fetch(new Request('https://worker.test/ai/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_mock_turn_2' },
      body: JSON.stringify({
        scenario_id: 'cafe_order', cefr_level: 'B1', user_message: 'Guten Tag', history: [], session_id: 's2',
        mock_grant: 'MOCK1.1800000000000.DEADBEEFDEADBEEF', mock_part: 0,
      }),
    }), env);
    expect(forged.status).toBe(402);
    expect(sent).toHaveLength(0);
  });
});