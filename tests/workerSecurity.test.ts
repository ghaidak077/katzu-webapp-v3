import { describe, expect, it } from 'vitest';
import worker, { checkRateLimit, getCorsHeaders, verifyGoogleIdToken } from '../cloudflare-unified-worker';

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

  it('limits requests per user', () => {
    const user = `rate-test-${Date.now()}`;
    const env = { AI_RATE_LIMIT_PER_MINUTE: '1', AI_RATE_LIMIT_PER_DAY: '10' };
    expect(checkRateLimit(user, env).allowed).toBe(true);
    expect(checkRateLimit(user, env)).toMatchObject({
      allowed: false,
      reason: 'minute_limit',
    });
  });
});
