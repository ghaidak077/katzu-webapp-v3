import { describe, expect, it } from 'vitest';
import {
  CODE_ATTEMPT_THRESHOLD,
  CODE_LOCKOUT_BASE_MS,
  CODE_LOCKOUT_MAX_MS,
  decideCodeAttempt,
  isDuplicateCodeError,
  lockoutMsFor,
  noteCodeFailure,
  readCodeAttempts,
  resetCodeAttempts,
  CODE_LEDGER_UNAVAILABLE_MESSAGE,
  CODE_LOCKOUT_MESSAGE,
} from '../cloudflare-code-abuse';
import worker from '../cloudflare-unified-worker';
import { activationDelayMs } from '../cloudflare-crypto';
import {
  normaliseRegionGroup,
  paymentInstructionsFor,
  ACTIVATION_TIMING_AR,
} from '../src/lib/offers/paymentInstructions';

const hmacSecret = 'c3-test-hmac-secret-0123456789abcdef';

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

/**
 * D1 double for exactly two statements: the ledger claim and the table creates.
 * `ledgerError` models the C3 distinction — a constraint violation means spent, a
 * generic error means the database was unreachable.
 */
class LedgerD1 {
  redeemed = new Map<string, string>();
  ledgerError: Error | null = null;
  constructor() { this.ledgerError = null; }

  prepare(sql: string) {
    const norm = sql.replace(/\s+/g, ' ').trim();
    const self = this;
    return {
      async run() {
        if (norm.startsWith('CREATE TABLE') || norm.startsWith('CREATE INDEX')) {
          return { success: true, meta: { changes: 0 } };
        }
        if (norm.startsWith('INSERT INTO redeemed_codes_ledger')) {
          if (self.ledgerError) throw self.ledgerError;
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
      bind(...args: unknown[]) {
        return {
          async run() {
            if (norm.startsWith('INSERT INTO redeemed_codes_ledger')) {
              if (self.ledgerError) throw self.ledgerError;
              const code = String(args[0]);
              if (self.redeemed.has(code)) {
                throw new Error('UNIQUE constraint failed: redeemed_codes_ledger.code');
              }
              self.redeemed.set(code, String(args[1]));
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 0 } };
          },
        };
      },
      async first() { return null; },
      async all() { return { results: [] }; },
    };
  }
  async batch(statements: unknown[]) { return Promise.all(statements); }
}

function token(sub: string) {
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const payload = {
    sub,
    aud: 'client-id',
    iss: 'https://accounts.google.com',
    email: `${sub}@example.test`,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

async function sign(message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(hmacSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  // The worker's own forger upper-cases and truncates to 16 hex chars, and
  // parseCode only accepts [A-F0-9] — the test code has to look like a real one.
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 16);
}

function redeemEnv(db = new LedgerD1()) {
  return {
    TEST_MODE: true,
    GOOGLE_CLIENT_ID: 'client-id',
    HMAC_SECRET: hmacSecret,
    REDEEMED_CODES: new MemoryKv(),
    USER_PROGRESS: new MemoryKv(),
    DB: db,
    env: { REDEEMED_CODES: new MemoryKv() } as Record<string, unknown>,
  };
}

async function redeem(env: ReturnType<typeof redeemEnv>, code: string, sub = 'c3-user') {
  const response = await worker.fetch(
    new Request('https://worker.test/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, id_token: token(sub) }),
    }),
    env as never,
  );
  return { status: response.status, body: await response.json() };
}

describe('C3: exactly-once redemption', () => {
  it('tells a UNIQUE violation from an unreachable ledger', () => {
    expect(isDuplicateCodeError(new Error('UNIQUE constraint failed: redeemed_codes_ledger.code'))).toBe(true);
    expect(isDuplicateCodeError(new Error('D1_ERROR: Socket closed'))).toBe(false);
    expect(isDuplicateCodeError(new Error('no such table: redeemed_codes_ledger'))).toBe(false);
    expect(isDuplicateCodeError(new Error('D1_ERROR: timeout'))).toBe(false);
    expect(isDuplicateCodeError(null)).toBe(false);
  });

  it('reports a spent code once, and never lets a second attempt through', async () => {
    const db = new LedgerD1();
    const env = redeemEnv(db);
    const nonce = 'C3EXACT';
    const code = `DE-6M-${nonce}-${await sign(`DE-6M-${nonce}`)}`;

    const first = await redeem(env, code);
    expect(first.body).toMatchObject({ valid: true, months: 6 });

    // A second account presenting the same code is rejected, not silently honoured.
    const second = await redeem(env, code, 'c3-other');
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ valid: false, reason: 'already_redeemed' });
  });

  it('never tells a learner their code is spent when the database is down', async () => {
    const db = new LedgerD1();
    const env = redeemEnv(db);
    const nonce = 'C3OUTAGE';
    const code = `DE-6M-${nonce}-${await sign(`DE-6M-${nonce}`)}`;

    db.ledgerError = new Error('D1_ERROR: Socket closed');
    const failed = await redeem(env, code);
    expect(failed.status).toBe(503);
    expect(failed.body).toMatchObject({ valid: false, reason: 'ledger_unavailable' });
    expect(failed.body.message).toBe(CODE_LEDGER_UNAVAILABLE_MESSAGE);

    // The same code still works the moment the database is back.
    db.ledgerError = null;
    const retried = await redeem(env, code);
    expect(retried.body).toMatchObject({ valid: true, months: 6 });
  });
});

describe('C3: brute-force lockout', () => {
  it('escalates with the attempt count and stays bounded', () => {
    expect(lockoutMsFor(0)).toBe(0);
    expect(lockoutMsFor(CODE_ATTEMPT_THRESHOLD - 1)).toBe(0);
    expect(lockoutMsFor(CODE_ATTEMPT_THRESHOLD)).toBe(CODE_LOCKOUT_BASE_MS);
    expect(lockoutMsFor(CODE_ATTEMPT_THRESHOLD + 1)).toBe(CODE_LOCKOUT_BASE_MS * 2);
    expect(lockoutMsFor(CODE_ATTEMPT_THRESHOLD + 2)).toBe(CODE_LOCKOUT_BASE_MS * 4);
    // A flood of attempts must never produce Infinity or an absurd lockout.
    expect(lockoutMsFor(100_000)).toBe(CODE_LOCKOUT_MAX_MS);
    expect(Number.isFinite(lockoutMsFor(Number.MAX_SAFE_INTEGER))).toBe(true);
  });

  it('reports a retry window while locked, and unlocks once it passes', () => {
    const now = 1_000_000;
    const locked = decideCodeAttempt({ attempts: 5, lockedUntil: now + 30_000, now });
    expect(locked.allowed).toBe(false);
    expect(locked.reason).toBe('locked_out');
    expect(locked.retryAfterSeconds).toBe(30);

    const expired = decideCodeAttempt({ attempts: 5, lockedUntil: now - 1, now });
    expect(expired.allowed).toBe(true);
  });

  it('locks the account after repeated bad codes and spares it after a success', async () => {
    const env = redeemEnv();
    const bad = 'DE-6M-NOPE-deadbeef';

    for (let i = 0; i < CODE_ATTEMPT_THRESHOLD; i++) {
      const attempt = await redeem(env, bad);
      expect(attempt.body).toMatchObject({ valid: false, reason: 'invalid_signature' });
    }

    const locked = await redeem(env, bad);
    expect(locked.status).toBe(429);
    expect(locked.body).toMatchObject({ valid: false, reason: 'locked_out' });
    expect(locked.body.message).toBe(CODE_LOCKOUT_MESSAGE);
    expect(locked.body.retry_after).toBeGreaterThan(0);

    // A VALID code is refused while the lockout holds: the lock is on the account,
    // not on guessing, which is the point of escalating.
    const nonce = 'C3LOCK';
    const good = `DE-6M-${nonce}-${await sign(`DE-6M-${nonce}`)}`;
    const blocked = await redeem(env, good);
    expect(blocked.status).toBe(429);

    // Clearing the record (what a success does) restores access immediately.
    await resetCodeAttempts(env as never, 'c3-user');
    const afterReset = await redeem(env, good);
    expect(afterReset.body).toMatchObject({ valid: true, months: 6 });
  });

  it('reads as zero attempts when the record is missing or unreadable', async () => {
    const kv = new MemoryKv();
    expect(await readCodeAttempts({ REDEEMED_CODES: kv }, 'nobody')).toEqual({ attempts: 0, lockedUntil: 0 });
    await kv.put('codefail:x', 'not json');
    expect(await readCodeAttempts({ REDEEMED_CODES: kv }, 'x')).toEqual({ attempts: 0, lockedUntil: 0 });
    // No KV binding at all must never throw — abuse control is not correctness.
    expect(await readCodeAttempts({}, 'x')).toEqual({ attempts: 0, lockedUntil: 0 });
    await expect(noteCodeFailure({}, 'x', { nextAttempts: 9, lockoutMsOnFailure: 1000 })).resolves.toBeUndefined();
  });
});

describe('C3: Arabic per-region payment instructions', () => {
  it('resolves an unknown region to standard, the same way the prices fail', () => {
    expect(normaliseRegionGroup('special')).toBe('special');
    expect(normaliseRegionGroup('standard')).toBe('standard');
    for (const unknown of [null, undefined, '', 'SPECIAL', 'sy', 42, {}]) {
      expect(normaliseRegionGroup(unknown)).toBe('standard');
    }
  });

  it('tells a special-region buyer that an intermediary may hold the money', () => {
    const special = paymentInstructionsFor('special');
    const standard = paymentInstructionsFor('standard');
    expect(special.caveatAr).not.toBe(standard.caveatAr);
    expect(special.caveatAr).toMatch(/وسيط/);
    expect(ACTIVATION_TIMING_AR.special).toMatch(/يوم عمل/);
  });

  it('is Arabic, numbered, honest about what it cannot promise, and never sells an estimate', () => {
    for (const group of ['standard', 'special'] as const) {
      const instructions = paymentInstructionsFor(group);
      expect(instructions.stepsAr.length).toBeGreaterThanOrEqual(4);
      // Every step is one concrete thing to do, and none of them names a provider.
      for (const step of instructions.stepsAr) {
        expect(step).toMatch(/[؀-ۿ]/);
        expect(step).not.toMatch(/[A-Za-z]{4,}/);
      }
      expect(instructions.caveatAr).toMatch(/[؀-ۿ]/);
      // UNPROVEN timings must be labelled as such rather than stated as fact.
      expect(instructions.unproven).toBe(true);
    }
  });
});

describe('C3: transfer start to code activated', () => {
  it('measures the real gap, and refuses to invent one', () => {
    expect(activationDelayMs({ paid_at: '2026-10-05T10:00:00.000Z', delivered_at: '2026-10-05T10:00:42.000Z' })).toBe(42_000);
    // Missing timestamps are reported as unknown, never as "instant".
    expect(activationDelayMs({ paid_at: '2026-10-05T10:00:00.000Z', delivered_at: null })).toBeNull();
    expect(activationDelayMs({ paid_at: null, delivered_at: '2026-10-05T10:00:00.000Z' })).toBeNull();
    expect(activationDelayMs({})).toBeNull();
    // Clock skew between the provider and the isolate cannot yield a negative wait.
    expect(activationDelayMs({ paid_at: '2026-10-05T10:01:00.000Z', delivered_at: '2026-10-05T10:00:00.000Z' })).toBe(0);
  });
});