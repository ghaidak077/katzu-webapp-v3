import { describe, expect, it, vi } from 'vitest';
import worker, {
  checkRateLimit,
  checkUserEntitlement,
  consumeTrialQuota,
  getCorsHeaders,
  verifyGoogleIdToken,
} from '../cloudflare-unified-worker';

function token(payload: Record<string, unknown>, header = { alg: 'RS256', typ: 'JWT' }) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.signature`;
}

const validPayload = (overrides: Record<string, unknown> = {}) => ({
  sub: 'security-test-user',
  aud: 'client-id',
  iss: 'https://accounts.google.com',
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...overrides,
});

describe('Worker security controls', () => {
  class MemoryKv {
    values = new Map<string, string>();
    async get(key: string) { return this.values.get(key) || null; }
    async put(key: string, value: string) { this.values.set(key, value); }
    async delete(key: string) { this.values.delete(key); }
  }

  it('fails closed for missing or invalid production CORS configuration', () => {
    const request = new Request('https://worker.test/ai/hints', {
      headers: { Origin: 'https://app.example' },
    });
    expect(getCorsHeaders(request, { ENVIRONMENT: 'production' })._corsAllowed).toBe(false);
    expect(getCorsHeaders(request, {
      ENVIRONMENT: 'production',
      ALLOWED_ORIGINS: 'not-an-origin',
    })._corsAllowed).toBe(false);
  });

  it('rejects a disallowed origin', async () => {
    const response = await worker.fetch(new Request('https://worker.test/ai/hints', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ last_ai_reply: 'Hallo' }),
    }), {
      ENVIRONMENT: 'production',
      ALLOWED_ORIGINS: 'https://app.example',
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'origin_not_allowed' });
  });

  it('rejects bad audience, expired, and unsigned tokens', async () => {
    const env = { TEST_MODE: true, GOOGLE_CLIENT_ID: 'client-id' };
    expect(await verifyGoogleIdToken(token(validPayload({ aud: 'wrong' })), 'client-id', env)).toBeNull();
    expect(await verifyGoogleIdToken(token(validPayload({ exp: 1 })), 'client-id', env)).toBeNull();
    expect(await verifyGoogleIdToken(
      token(validPayload(), { alg: 'none', typ: 'JWT' }),
      'client-id',
      env,
    )).toBeNull();
  });

  it('requires authentication on hints and translation', async () => {
    const env = { TEST_MODE: true, GOOGLE_CLIENT_ID: 'client-id', GEMINI_API_KEY: 'test-key' };
    for (const path of ['/ai/hints', '/ai/translate']) {
      const response = await worker.fetch(new Request(`https://worker.test${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(path.endsWith('hints')
          ? { last_ai_reply: 'Hallo', cefr_level: 'A1' }
          : { text: 'Hallo' }),
      }), env);
      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('UNAUTHENTICATED');
    }
  });

  it('serves hints to free users without consuming their trial quota', async () => {
    const progress = new MemoryKv();
    await progress.put('ai-quota:security-test-user', JSON.stringify({ used: 3 }));
    const env = {
      TEST_MODE: true,
      GOOGLE_CLIENT_ID: 'client-id',
      GEMINI_API_KEY: 'test-key',
      USER_PROGRESS: progress,
    };
    const geminiJson = JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"hints":[{"german":"Ich möchte einen Kaffee, bitte.","translation_ar":"أريد قهوة من فضلك."}]}' }] } }],
    });
    const fetchMock = vi.fn(async () => new Response(geminiJson, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await worker.fetch(new Request('https://worker.test/ai/hints', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token(validPayload())}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ last_ai_reply: 'Hallo!', cefr_level: 'A1' }),
      }), env);
      // Hints stay available at zero quota — only /ai/turn consumes sessions.
      expect(response.status).toBe(200);
      expect(Array.isArray((await response.json()).hints)).toBe(true);
      const quota = JSON.parse(await progress.get('ai-quota:security-test-user'));
      expect(quota.used).toBe(3); // untouched
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('enforces entitlement on hints before calling Gemini', async () => {
    const env = { TEST_MODE: true, GOOGLE_CLIENT_ID: 'client-id', GEMINI_API_KEY: 'test-key' };
    const response = await worker.fetch(new Request('https://worker.test/ai/hints', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token(validPayload())}` },
      body: JSON.stringify({ last_ai_reply: 'Hallo', cefr_level: 'B2' }),
    }), env);
    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe('PAYWALL_REQUIRED');
  });

  it('uses the server quota instead of client-provided freeSessionsRemaining', async () => {
    const progress = new MemoryKv();
    await progress.put('ai-quota:security-test-user', JSON.stringify({ used: 3 }));
    const env = {
      TEST_MODE: true,
      GOOGLE_CLIENT_ID: 'client-id',
      GEMINI_API_KEY: 'test-key',
      USER_PROGRESS: progress,
    };
    // Quota is consumed by conversation turns (/ai/turn); hints are
    // deliberately quota-exempt so suggestions never block the chat.
    const response = await worker.fetch(new Request('https://worker.test/ai/turn', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token(validPayload())}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scenario_id: 'cafe_order',
        scenario_title: 'Bestellung im Café',
        user_message: 'Ich möchte einen Kaffee.',
        cefr_level: 'A1',
        freeSessionsRemaining: 999,
      }),
    }), env);
    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe('FREE_QUOTA_EXHAUSTED');
  });

  it('increments only the authoritative server quota and floors it at the limit', async () => {
    const progress = new MemoryKv();
    const env = { USER_PROGRESS: progress };
    expect(await consumeTrialQuota('quota-user', env)).toMatchObject({ allowed: true, remaining: 2 });
    expect(await consumeTrialQuota('quota-user', env)).toMatchObject({ allowed: true, remaining: 1 });
    expect(await consumeTrialQuota('quota-user', env)).toMatchObject({ allowed: true, remaining: 0 });
    expect(await consumeTrialQuota('quota-user', env)).toMatchObject({ allowed: false, code: 'FREE_QUOTA_EXHAUSTED' });
    expect(await checkUserEntitlement({ sub: 'quota-user' }, 'A1', env)).toMatchObject({
      allowed: false,
      code: 'FREE_QUOTA_EXHAUSTED',
    });
  });

  it('limits requests per user', () => {
    const user = `rate-test-${Date.now()}`;
    const env = { AI_RATE_LIMIT_PER_MINUTE: '1', AI_RATE_LIMIT_PER_DAY: '10' };
    expect(checkRateLimit(user, env).allowed).toBe(true);
    expect(checkRateLimit(user, env)).toMatchObject({
      allowed: false,
      reason: 'minute_limit',
    });
  });

  describe('session revocation (Phase 1.1)', () => {
    const signIn = async (envOverrides: Record<string, unknown> = {}) => {
      const env = {
        TEST_MODE: true,
        GOOGLE_CLIENT_ID: 'client-id',
        USER_PROGRESS: new MemoryKv(),
        ...envOverrides,
      };
      const res = await worker.fetch(new Request('https://worker.test/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: token(validPayload()) }),
      }), env);
      const data = await res.json() as { session_token?: string };
      return { env, sessionToken: data.session_token as string };
    };

    it('revokes a live session on /auth/signout; subsequent use is rejected', async () => {
      const { env, sessionToken } = await signIn();

      const signout = await worker.fetch(new Request('https://worker.test/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: '{}',
      }), env);
      expect(signout.status).toBe(200);
      expect(await signout.json()).toMatchObject({ success: true, revoked: true });

      // The revoked token no longer resolves.
      const reuse = await worker.fetch(new Request('https://worker.test/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: '{}',
      }), env);
      expect(await reuse.json()).toMatchObject({ success: true, revoked: false });
    });

    it('is idempotent for unknown/expired tokens and rejects non-session tokens', async () => {
      const { env } = await signIn();

      const unknown = await worker.fetch(new Request('https://worker.test/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sess_doesnotexist' },
        body: '{}',
      }), env);
      expect(await unknown.json()).toMatchObject({ success: true, revoked: false });

      const notSession = await worker.fetch(new Request('https://worker.test/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(validPayload())}` },
        body: '{}',
      }), env);
      expect(notSession.status).toBe(401);
    });

    it('records sessions in a per-user index for future bulk revocation/deletion', async () => {
      const { env, sessionToken } = await signIn();
      const raw = await env.USER_PROGRESS.get(`session:${sessionToken}`);
      expect(raw).toBeTruthy();
      const record = JSON.parse(raw as string) as { sub: string };
      const idx = JSON.parse(await env.USER_PROGRESS.get(`sessions_by_sub:${record.sub}`) as string) as string[];
      expect(idx).toContain(sessionToken);
    });
  });

  describe('CORS matrix (Phase 1.4)', () => {
    const req = (origin?: string) => new Request('https://worker.test/health', {
      headers: origin ? { Origin: origin } : {},
    });

    it('allows an approved origin', () => {
      const env = { ALLOWED_ORIGINS: 'https://app.example' };
      expect(getCorsHeaders(req('https://app.example'), env)._corsAllowed).toBe(true);
    });

    it('rejects an unknown origin', () => {
      const env = { ALLOWED_ORIGINS: 'https://app.example' };
      expect(getCorsHeaders(req('https://evil.example'), env)._corsAllowed).toBe(false);
    });

    it('allows requests without an Origin header (same-origin / server-to-server)', () => {
      const env = { ALLOWED_ORIGINS: 'https://app.example' };
      expect(getCorsHeaders(req(), env)._corsAllowed).toBe(true);
    });

    it('fails closed in production when ALLOWED_ORIGINS is missing or malformed', () => {
      expect(getCorsHeaders(req('https://app.example'), { ENVIRONMENT: 'production' })._corsAllowed).toBe(false);
      expect(getCorsHeaders(req('https://app.example'), {
        ENVIRONMENT: 'production',
        ALLOWED_ORIGINS: 'not-an-origin,https://ok.example',
      })._corsAllowed).toBe(false);
    });

    it('fails closed in development without the explicit open-CORS dev flag (behavior change)', () => {
      expect(getCorsHeaders(req('https://app.example'), {})._corsAllowed).toBe(false);
      expect(getCorsHeaders(req('https://app.example'), { ENVIRONMENT: 'dev' })._corsAllowed).toBe(false);
    });

    it('opens only with the explicit ALLOW_OPEN_CORS=1 dev flag outside production', () => {
      const env = { ALLOW_OPEN_CORS: '1' };
      const headers = getCorsHeaders(req('https://localhost:5173'), env);
      expect(headers._corsAllowed).toBe(true);
      expect(headers['Access-Control-Allow-Origin']).toBe('https://localhost:5173');
      // The flag must never open production.
      expect(getCorsHeaders(req('https://app.example'), { ...env, ENVIRONMENT: 'production' })._corsAllowed).toBe(false);
    });
  });
});
