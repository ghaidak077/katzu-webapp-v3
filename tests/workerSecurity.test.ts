import { describe, expect, it, vi } from 'vitest';
import { createSign, generateKeyPairSync } from 'node:crypto';
import worker, {
  checkRateLimit,
  consumeTrialSession,
  getCorsHeaders,
  resolveAccount,
  verifyGoogleIdToken,
} from '../cloudflare-unified-worker';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as Record<string, string>;
const keyId = 'security-test-key';
function token(payload: Record<string, unknown>, header = { alg: 'RS256', typ: 'JWT', kid: keyId }) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  return `${unsigned}.${signer.sign(privateKey).toString('base64url')}`;
}

const validPayload = (overrides: Record<string, unknown> = {}) => ({
  sub: 'security-test-user',
  aud: 'client-id',
  iss: 'https://accounts.google.com',
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...overrides,
});

describe('Worker security controls', () => {
  const authEnv = () => ({
    GOOGLE_CLIENT_ID: 'client-id',
    GEMINI_API_KEY: 'test-key',
    SESSION_SECRET: 'session-secret',
  });

  const issueSession = async (env: Record<string, unknown>) => {
    const response = await worker.fetch(new Request('https://worker.test/auth/session', {
      method: 'POST',
      body: JSON.stringify({ id_token: token(validPayload()) }),
    }), env);
    expect(response.status).toBe(200);
    return (await response.json() as { session_token: string }).session_token;
  };

  class MemoryD1 {
    sessions = new Map<string, number>();
    prepare(sql: string) {
      return {
        bind: (...args: string[]) => ({
          run: async () => {
            if (!sql.includes('INSERT INTO trial_sessions')) return { meta: { changes: 0 } };
            const [userId, sessionId] = args;
            const key = `${userId}:${sessionId}`;
            const current = this.sessions.get(key);
            if (current !== undefined) {
              if (current >= 12) return { meta: { changes: 0 } };
              this.sessions.set(key, current + 1);
              return { meta: { changes: 1 } };
            }
            const count = [...this.sessions.keys()].filter((entry) => entry.startsWith(`${userId}:`)).length;
            if (count >= 3) return { meta: { changes: 0 } };
            this.sessions.set(key, 1);
            return { meta: { changes: 1 } };
          },
          first: async () => {
            const value = this.sessions.get(`${args[0]}:${args[1]}`);
            return value === undefined ? null : { turns: value };
          },
        }),
      };
    }
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
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: keyId, alg: 'RS256', use: 'sig' }] }), {
      headers: { 'Cache-Control': 'max-age=3600' },
    }));
    expect(await verifyGoogleIdToken(token(validPayload({ aud: 'wrong' })), 'client-id')).toBeNull();
    expect(await verifyGoogleIdToken(token(validPayload({ exp: 1 })), 'client-id')).toBeNull();
    expect(await verifyGoogleIdToken(
      `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT', kid: keyId })).toString('base64url')}.${Buffer.from(JSON.stringify(validPayload())).toString('base64url')}.signature`,
      'client-id',
    )).toBeNull();
    expect(await verifyGoogleIdToken(token(validPayload()), '')).toBeNull();
    expect(await verifyGoogleIdToken(token(validPayload({ exp: 'never' })), 'client-id')).toBeNull();
    expect(await verifyGoogleIdToken(token(validPayload({ iss: 'accounts.google.com' })), 'client-id')).not.toBeNull();
  });

  it('rejects forged signatures, wrong issuers, unknown keys, and missing tokens', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      keys: [{ ...jwk, kid: keyId, alg: 'RS256', use: 'sig' }],
    }), { headers: { 'Cache-Control': 'max-age=0' } }));
    const valid = token(validPayload());
    const forged = `${valid.slice(0, valid.lastIndexOf('.') + 1)}${Buffer.from('forged').toString('base64url')}`;
    expect(await verifyGoogleIdToken(forged, 'client-id')).toBeNull();
    expect(await verifyGoogleIdToken(token(validPayload({ iss: 'https://evil.example' })), 'client-id')).toBeNull();
    expect(await verifyGoogleIdToken(token(validPayload(), { alg: 'RS256', typ: 'JWT', kid: 'missing-key' }), 'client-id')).toBeNull();
    expect(await verifyGoogleIdToken('', 'client-id')).toBeNull();
  });

  it('rejects a session token signed with the wrong secret', async () => {
    const env = authEnv();
    const sessionToken = await issueSession(env);
    expect(await resolveAccount(
      new Request('https://worker.test/ai/turn', { headers: { Authorization: `Bearer ${sessionToken}` } }),
      null,
      { SESSION_SECRET: 'wrong-secret' },
    )).toBeNull();
  });

  it('requires authentication on hints and translation', async () => {
    const env = { GOOGLE_CLIENT_ID: 'client-id', GEMINI_API_KEY: 'test-key' };
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
    const env = authEnv();
    const sessionToken = await issueSession(env);
    const response = await worker.fetch(new Request('https://worker.test/ai/hints', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
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

  it('atomically caps free sessions and repeated turns', async () => {
    const db = new MemoryD1();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) => consumeTrialSession('parallel-user', `session-${index}`, { DB: db })),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(3);

    const turns = await Promise.all(
      Array.from({ length: 14 }, () => consumeTrialSession('parallel-user', 'session-0', { DB: db })),
    );
    expect(turns.filter((result) => result.allowed)).toHaveLength(11);
    expect(turns.at(-1)?.code).toBe('SESSION_TURN_CAP');
  });
});
