import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';

/**
 * Phase 2/3/4 worker tests: concurrency-safe redemption + referral payouts,
 * complete account deletion, and privacy-safe data export.
 * A minimal D1 stub emulates PRIMARY KEY semantics: a duplicate INSERT throws
 * exactly like real D1/SQLite, so Promise.all races settle deterministically.
 */
class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) || null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

class FakeD1 {
  tables: Record<string, Map<string, Record<string, unknown>>>;
  constructor() { this.tables = {}; }
  private table(name: string) {
    if (!this.tables[name]) this.tables[name] = new Map();
    return this.tables[name];
  }
  prepare(sql: string) {
    const norm = sql.replace(/\s+/g, ' ').trim();
    const insertInto = norm.match(/^INSERT INTO (\w+)/i);
    const selectCount = norm.match(/^SELECT COUNT\(\*\) AS n FROM (\w+) WHERE (\w+) = \?$/i);
    const del = norm.match(/^DELETE FROM (\w+)/i);
    const update = norm.match(/^UPDATE (\w+)/i);
    const run = async (...args: unknown[]) => {
      if (insertInto) {
        const t = this.table(insertInto[1]);
        // Emulate SQLite PRIMARY KEY uniqueness across concurrent inserts.
        const pk = String(args[0]);
        if (t.has(pk)) throw new Error('UNIQUE constraint failed');
        t.set(pk, { _args: args });
        return { success: true };
      }
      if (del) {
        const t = this.table(del[1]);
        const before = t.size;
        if (norm.includes('WHERE')) {
          // Single-bind equality deletes used by deletion: match either column.
          for (const [k, row] of [...t.entries()]) {
            const a = row._args as unknown[];
            if (a.includes(args[0])) t.delete(k);
          }
        } else {
          t.clear();
        }
        void before;
        return { success: true };
      }
      if (update) {
        const t = this.table(update[1]);
        for (const [k, row] of [...t.entries()]) {
          const a = row._args as unknown[];
          if (a.includes(args[0])) (row as Record<string, unknown>).account_id = 'deleted-account';
        }
        return { success: true };
      }
      return { success: true };
    };
    void selectCount;
    return {
      bind: (...args: unknown[]) => ({
        run: () => run(...args),
        first: async () => {
          if (selectCount) {
            const t = this.table(selectCount[1]);
            let n = 0;
            for (const row of t.values()) {
              const a = row._args as unknown[];
              if (a[0] === args[0]) n++;
            }
            return { n };
          }
          return null;
        },
      }),
    };
  }
  batch(stmts: unknown[]) { return Promise.all(stmts); }
}

function token(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const validPayload = (sub: string, email?: string) => ({
  sub,
  aud: 'client-id',
  iss: 'https://accounts.google.com',
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...(email ? { email } : {}),
});

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    TEST_MODE: true,
    GOOGLE_CLIENT_ID: 'client-id',
    HMAC_SECRET: 'test-hmac-secret',
    REDEEMED_CODES: new MemoryKv(),
    USER_PROGRESS: new MemoryKv(),
    DB: new FakeD1(),
    ...overrides,
  };
}

const post = (path: string, body: unknown, env: unknown, sub = 'user-a', email = 'a@test.dev') =>
  worker.fetch(new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(validPayload(sub, email))}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env as never);

// Deterministic activation code (HMAC-signed format DE-<months>M-<nonce>.<sig>)
// — signed inside the test against the same HMAC secret the worker uses.
async function makeCode(months: number, secret: string): Promise<string> {
  const nonce = Math.random().toString(36).slice(2, 10).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(`DE-${months}M-${nonce}`));
  const sig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 16);
  return `DE-${months}M-${nonce}-${sig}`;
}

describe('Pro redemption with session tokens (regression: env passed to verify)', () => {
  it('redeems a Pro code and checks status using ONLY an opaque session token', async () => {
    const env = makeEnv();
    const sub = 'user-pro', email = 'pro@test.dev';

    // Sign in: exchange a Google ID token for an opaque session token.
    const sess = await worker.fetch(new Request('https://worker.test/auth/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token(validPayload(sub, email))}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }), env as never);
    const { session_token: sessionToken } = await sess.json() as { session_token: string };
    expect(sessionToken).toMatch(/^sess_/);

    // Redeem a Pro code authenticated ONLY by the session token (header transport).
    const code = await makeCode(6, 'test-hmac-secret');
    const redeemRes = await worker.fetch(new Request('https://worker.test/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }), env as never);
    expect(redeemRes.status).toBe(200);
    const redeem = await redeemRes.json() as { valid: boolean; months: number };
    expect(redeem.valid).toBe(true);
    expect(redeem.months).toBe(6);

    // Subscription status must also resolve through the session token.
    const statusRes = await worker.fetch(new Request('https://worker.test/check-status', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }), env as never);
    const status = await statusRes.json() as { active: boolean; days_remaining: number };
    expect(status.active).toBe(true);
    expect(status.days_remaining).toBeGreaterThanOrEqual(180);

    // Progress sync/get must resolve session tokens too (same class of bug).
    const syncRes = await worker.fetch(new Request('https://worker.test/progress/sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ stats: { level: 'A1', total_points: 10 } }),
    }), env as never);
    expect(((await syncRes.json()) as { success: boolean }).success).toBe(true);
    const getRes = await worker.fetch(new Request('https://worker.test/progress/get', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }), env as never);
    expect(((await getRes.json()) as { stats: { total_points: number } }).stats.total_points).toBe(10);
  });
});

describe('Phase 2: concurrency-safe redemption and referral payouts', () => {
  it('redeems a valid code exactly once — concurrent double-spend gets already_redeemed', async () => {
    const env = makeEnv();
    const code = await makeCode(3, 'test-hmac-secret');
    const [r1, r2, r3] = await Promise.all([
      post('/verify', { code }, env, 'user-a', 'a@test.dev'),
      post('/verify', { code }, env, 'user-a', 'a@test.dev'),
      post('/verify', { code }, env, 'user-a', 'a@test.dev'),
    ]);
    const bodies = await Promise.all([r1.json(), r2.json(), r3.json()]);
    const wins = bodies.filter((b: { valid?: boolean }) => b.valid === true);
    const losses = bodies.filter((b: { reason?: string }) => b.reason === 'already_redeemed');
    expect(wins.length).toBe(1);
    expect(losses.length).toBe(2);
    expect((wins[0] as { months: number }).months).toBe(3);
  });

  it('a second account cannot redeem the same code', async () => {
    const env = makeEnv();
    const code = await makeCode(2, 'test-hmac-secret');
    const first = await post('/verify', { code }, env, 'user-a', 'a@test.dev');
    const second = await post('/verify', { code }, env, 'user-b', 'b@test.dev');
    expect(((await first.json()) as { valid: boolean }).valid).toBe(true);
    expect(((await second.json()) as { reason: string }).reason).toBe('already_redeemed');
  });

  it('rejects tampered (bad-signature) codes and preserves the email index for valid ones', async () => {
    const env = makeEnv();
    const bad = await makeCode(6, 'wrong-secret');
    const badRes = await post('/verify', { code: bad }, env, 'user-a', 'a@test.dev');
    expect(((await badRes.json()) as { reason: string }).reason).toBe('invalid_signature');

    const good = await makeCode(6, 'test-hmac-secret');
    await post('/verify', { code: good }, env, 'user-a', 'a@test.dev');
    expect(await (env.REDEEMED_CODES as MemoryKv).get('email_index:a@test.dev')).toBe('user-a');
  });

  it('referral payout is idempotent: the referrer is paid exactly once across racing redemptions', async () => {
    const env = makeEnv();
    // Inviter publishes their referral code (stable per account).
    await post('/referral/info', {}, env, 'user-inviter', 'inviter@test.dev');
    // Invitee claims it while still a new account.
    const referralCode = (await (await post('/referral/info', {}, env, 'user-inviter', 'inviter@test.dev')).json() as { referral_code: string }).referral_code;
    const claim = await post('/referral/claim', { referral_code: referralCode }, env, 'user-invitee', 'invitee@test.dev');
    expect(((await claim.json()) as { success: boolean }).success).toBe(true);

    const code1 = await makeCode(3, 'test-hmac-secret');
    const code2 = await makeCode(3, 'test-hmac-secret');
    await Promise.all([
      post('/verify', { code: code1 }, env, 'user-invitee', 'invitee@test.dev'),
      post('/verify', { code: code2 }, env, 'user-invitee', 'invitee@test.dev'),
    ]);

    // The referrer's KV expiry must reflect exactly ONE reward month even
    // though both invitee codes were "first redemptions" in the KV race window.
    const referrer = JSON.parse(await (env.REDEEMED_CODES as MemoryKv).get('account:user-inviter') as string);
    const invitee = JSON.parse(await (env.REDEEMED_CODES as MemoryKv).get('account:user-invitee') as string);
    const referrerGainDays = (new Date(referrer.expiresAt).getTime() - Date.now()) / 86400000;
    const inviteeGainDays = (new Date(invitee.expiresAt).getTime() - Date.now()) / 86400000;
    expect(referrerGainDays).toBeGreaterThanOrEqual(29);
    expect(referrerGainDays).toBeLessThan(32);
    expect(inviteeGainDays).toBeGreaterThanOrEqual(29);
    // Both codes were distinct and valid, so the invitee legitimately holds ~6 months.
    // The invariant under test is the referrer's SINGLE payout above (< 32 days).
    expect(inviteeGainDays).toBeGreaterThanOrEqual(59);
    expect(inviteeGainDays).toBeLessThan(185);
  });
});

describe('Phase 3: complete account deletion', () => {
  it('deletes progress, quota, sessions, referral records, and email index; result is structured', async () => {
    const env = makeEnv();
    const sub = 'user-gone', email = 'gone@test.dev';
    await (env.USER_PROGRESS as MemoryKv).put(`progress:${sub}`, JSON.stringify({ stats: { level: 'A1' } }));
    await (env.USER_PROGRESS as MemoryKv).put('ai-quota:user-gone', JSON.stringify({ used: 1 }));
    const sess = await worker.fetch(new Request('https://worker.test/auth/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token(validPayload(sub, email))}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }), env as never);
    const { session_token: sessionToken } = await sess.json() as { session_token: string };
    expect(sessionToken).toBeTruthy();

    await (env.REDEEMED_CODES as MemoryKv).put(`referred-by:${sub}`, JSON.stringify({ referrer_sub: 'user-inviter', status: 'pending' }));
    await (env.REDEEMED_CODES as MemoryKv).put('email_index:gone@test.dev', sub);

    const res = await post('/user/delete', {}, env, sub, email);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; deleted_steps: string[] };
    expect(body.success).toBe(true);
    for (const step of ['progress', 'ai_quota', 'sessions', 'referral_claim', 'email_index']) {
      expect(body.deleted_steps).toContain(step);
    }

    const up = env.USER_PROGRESS as MemoryKv;
    expect(await up.get(`progress:${sub}`)).toBeNull();
    expect(await up.get('ai-quota:user-gone')).toBeNull();
    // Session revoked: the old token no longer authenticates.
    const after = await worker.fetch(new Request('https://worker.test/check-status', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }), env as never);
    const afterBody = await after.json() as { reason?: string; active: boolean };
    expect(afterBody.active).toBe(false);
    expect(await (env.REDEEMED_CODES as MemoryKv).get('email_index:gone@test.dev')).toBeNull();
  });

  it('returns DELETE_INCOMPLETE with failed steps when a deletion step throws', async () => {
    const env = makeEnv();
    (env.USER_PROGRESS as MemoryKv).delete = async () => { throw new Error('KV unavailable'); };
    const res = await post('/user/delete', {}, env, 'user-x', 'x@test.dev');
    expect(res.status).toBe(500);
    const body = await res.json() as { success: boolean; code: string; failed_steps: string[] };
    expect(body.success).toBe(false);
    expect(body.code).toBe('DELETE_INCOMPLETE');
    expect(body.failed_steps).toContain('progress');
  });

  it('rejects unauthenticated deletion requests', async () => {
    const env = makeEnv();
    const res = await worker.fetch(new Request('https://worker.test/user/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }), env as never);
    expect(res.status).toBe(401);
  });
});

describe('Phase 4: data export', () => {
  it('exports the authenticated account\u2019s progress, subscription, and referral data', async () => {
    const env = makeEnv();
    const sub = 'user-export', email = 'export@test.dev';
    await (env.USER_PROGRESS as MemoryKv).put(`progress:${sub}`, JSON.stringify({
      stats: { level: 'B1', streak_days: 4, total_points: 120 },
      mistakes: [{ id: 1, text: 'Ich bin gegangen' }],
    }));
    await (env.REDEEMED_CODES as MemoryKv).put(`account:${sub}`, JSON.stringify({
      email, expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
    }));

    const res = await post('/user/export', {}, env, sub, email);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      profile: { account_id: string; email: string };
      progress: { stats: { level: string } } | null;
      subscription: { active: boolean };
      referral: { history: unknown[] };
    };
    expect(body.profile.account_id).toBe(sub);
    expect(body.profile.email).toBe(email);
    expect(body.progress?.stats.level).toBe('B1');
    expect(body.subscription.active).toBe(true);
    expect(Array.isArray(body.referral.history)).toBe(true);
  });

  it('never exports tokens, secrets, or other users\u2019 data', async () => {
    const env = makeEnv();
    const sub = 'user-export2', email = 'export2@test.dev';
    await (env.USER_PROGRESS as MemoryKv).put(`progress:${sub}`, JSON.stringify({
      stats: { level: 'A1' },
      idToken: 'eyJhbGciOiJSUzI1NiJ9.legacy.raw.token',
      session_token: 'sess_shouldneverappear',
    }));
    await (env.USER_PROGRESS as MemoryKv).put('progress:user-OTHER', JSON.stringify({ stats: { level: 'B2' } }));
    await (env.USER_PROGRESS as MemoryKv).put('session:sess_live_of_other', JSON.stringify({ sub: 'user-OTHER' }));

    const raw = await (await post('/user/export', {}, env, sub, email)).text();

    expect(raw).not.toContain('eyJhbGciOiJSUzI1NiJ9');
    expect(raw).not.toContain('sess_shouldneverappear');
    expect(raw).not.toContain('sess_live_of_other');
    expect(raw).not.toContain('user-OTHER');
    expect(raw).not.toContain('test-hmac-secret');
    expect(raw).not.toContain('sessionToken');
    expect(raw).not.toContain('id_token');
    expect(raw).not.toContain('idToken');
  });

  it('requires authentication and returns attachment headers for download', async () => {
    const env = makeEnv();
    const unauth = await worker.fetch(new Request('https://worker.test/user/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }), env as never);
    expect(unauth.status).toBe(401);

    const authed = await post('/user/export', {}, env, 'user-export3', 'e3@test.dev');
    expect(authed.headers.get('Content-Disposition')).toContain('attachment');
    expect(authed.headers.get('Content-Disposition')).toContain('katzu-data-export.json');
  });
});
