import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';
import { CONSENT_PATH, REPORT_PATH, handleConsentRoute } from '../cloudflare-consent';
import { consentKey, resetTelemetryTablesCache } from '../cloudflare-telemetry';

/**
 * The learner's half of the conversation-logging gate.
 *
 * The telemetry suite already proves the writer stores nothing without a grant.
 * These tests are about the only thing that can create one: it belongs to the
 * account in the session, it cannot be granted while the operator switch is off,
 * and withdrawing it deletes that learner's stored turns and nobody else's.
 */

type Statement = { sql: string; args: unknown[] };

class MemoryKv {
  values = new Map<string, string>();
  throwOnPut = false;
  async get(key: string) {
    return this.values.get(key) ?? null;
  }
  async put(key: string, value: string) {
    if (this.throwOnPut) throw new Error('kv down');
    this.values.set(key, value);
  }
  async delete(key: string) {
    this.values.delete(key);
  }
}

class StubDb {
  statements: Statement[] = [];
  fail = false;

  prepare(sql: string) {
    const self = this;
    const record = (args: unknown[]) => {
      self.statements.push({ sql, args });
      if (self.fail) throw new Error('d1 unavailable');
    };
    const done = () => ({
      meta: { changes: sql.startsWith('DELETE FROM conversations WHERE') ? 2 : 1 },
      success: true,
    });
    return {
      bind(...args: unknown[]) {
        return {
          async run() {
            record(args);
            return done();
          },
          async first() {
            record(args);
            return { ok: 1 };
          },
          async all() {
            record(args);
            return { results: [] };
          },
        };
      },
      async run() {
        record([]);
        return done();
      },
      async first() {
        record([]);
        return { ok: 1 };
      },
      async all() {
        record([]);
        return { results: [] };
      },
    };
  }

  async batch(items: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(items.map((item) => item.run()));
  }
}

function token(sub: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = {
    sub,
    email: `${sub}@example.test`,
    aud: 'client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    ENVIRONMENT: 'test',
    TEST_MODE: true,
    GOOGLE_CLIENT_ID: 'client-id',
    CONVERSATION_LOGGING: 'on',
    USER_PROGRESS: new MemoryKv(),
    DB: new StubDb(),
    ...overrides,
  } as Record<string, any>;
}

async function call(
  env: Record<string, any>,
  method: 'GET' | 'POST',
  options: { sub?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.sub) headers.Authorization = `Bearer ${token(options.sub)}`;
  const request = new Request(`https://worker.test${CONSENT_PATH}`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
  });
  const response = await worker.fetch(request, env);
  return { status: response.status, body: await response.json() };
}

async function callReport(
  env: Record<string, any>,
  options: { sub?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.sub) headers.Authorization = `Bearer ${token(options.sub)}`;
  const request = new Request(`https://worker.test${REPORT_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options.body ?? {}),
  });
  const response = await worker.fetch(request, env);
  return { status: response.status, body: await response.json() };
}

describe('conversation consent route', () => {
  beforeEach(() => resetTelemetryTablesCache());

  it('claims only its own path', async () => {
    const request = new Request('https://worker.test/consent/other', { method: 'GET' });
    expect(await handleConsentRoute(new URL(request.url), request, makeEnv(), {}, {})).toBeNull();
  });

  it('requires the account in the session, never an id from the client', async () => {
    const env = makeEnv();
    const anonGet = await call(env, 'GET');
    const anonPost = await call(env, 'POST', { body: { granted: true } });
    expect(anonGet.status).toBe(401);
    expect(anonPost.status).toBe(401);
    expect(env.USER_PROGRESS.values.size).toBe(0);

    const spoofed = await call(env, 'POST', {
      sub: 'learner-a',
      body: { granted: true, sub: 'learner-b', user_id: 'learner-b' },
    });
    expect(spoofed.status).toBe(200);
    expect(env.USER_PROGRESS.values.has(consentKey('learner-a'))).toBe(true);
    expect(env.USER_PROGRESS.values.has(consentKey('learner-b'))).toBe(false);
  });

  it('reports the operator switch and this account’s own grant', async () => {
    const env = makeEnv();
    expect((await call(env, 'GET', { sub: 'learner-a' })).body).toMatchObject({
      ok: true,
      available: true,
      granted: false,
    });

    await call(env, 'POST', { sub: 'learner-a', body: { granted: true } });

    expect((await call(env, 'GET', { sub: 'learner-a' })).body).toMatchObject({ granted: true });
    // Another learner's screen must not inherit a grant they never gave.
    expect((await call(env, 'GET', { sub: 'learner-b' })).body).toMatchObject({ granted: false });

    const off = makeEnv({ CONVERSATION_LOGGING: 'off' });
    expect((await call(off, 'GET', { sub: 'learner-a' })).body).toMatchObject({
      available: false,
      granted: false,
    });
  });

  it('refuses a grant while the master switch is off instead of storing a dead one', async () => {
    const env = makeEnv({ CONVERSATION_LOGGING: 'off' });
    const result = await call(env, 'POST', { sub: 'learner-a', body: { granted: true } });
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ ok: false, error: 'logging_unavailable' });
    expect(env.USER_PROGRESS.values.size).toBe(0);
  });

  it('writes exactly one namespaced key per learner', async () => {
    const env = makeEnv();
    await call(env, 'POST', { sub: 'learner-a', body: { granted: true } });
    expect([...env.USER_PROGRESS.values.keys()]).toEqual(['consent:logging:learner-a']);
    expect(env.USER_PROGRESS.values.get('consent:logging:learner-a')).toBe('1');
  });

  it('withdrawing deletes the grant and this learner’s stored turns, and nobody else’s', async () => {
    const env = makeEnv();
    env.USER_PROGRESS.values.set(consentKey('learner-a'), '1');
    env.USER_PROGRESS.values.set(consentKey('learner-b'), '1');

    const result = await call(env, 'POST', { sub: 'learner-a', body: { granted: false } });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, granted: false, deleted_turns: 2 });

    expect(env.USER_PROGRESS.values.has(consentKey('learner-a'))).toBe(false);
    expect(env.USER_PROGRESS.values.has(consentKey('learner-b'))).toBe(true);

    const attempts = env.DB.statements.find((s) => s.sql.includes('DELETE FROM conversation_attempts'));
    expect(attempts?.sql).toContain('SELECT turn_id FROM conversations WHERE user_id = ?');
    expect(attempts?.args).toEqual(['learner-a']);
    const turns = env.DB.statements.find((s) => s.sql.startsWith('DELETE FROM conversations WHERE'));
    expect(turns?.args).toEqual(['learner-a']);
    expect(env.DB.statements.every((s) => !s.args.includes('learner-b'))).toBe(true);
  });

  it('allows withdrawal while the switch is off', async () => {
    const env = makeEnv({ CONVERSATION_LOGGING: 'off' });
    env.USER_PROGRESS.values.set(consentKey('learner-a'), '1');
    const result = await call(env, 'POST', { sub: 'learner-a', body: { granted: false } });
    expect(result.status).toBe(200);
    expect(env.USER_PROGRESS.values.has(consentKey('learner-a'))).toBe(false);
  });

  it('rejects a body that is not an explicit boolean', async () => {
    const env = makeEnv();
    for (const body of [{}, { granted: 'yes' }, { granted: 1 }, null]) {
      const result = await call(env, 'POST', { sub: 'learner-a', body });
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ ok: false, error: 'malformed_body' });
    }
    expect(env.USER_PROGRESS.values.size).toBe(0);
  });

  it('says so when the delete failed, and never claims a consent it revoked', async () => {
    const env = makeEnv();
    env.USER_PROGRESS.values.set(consentKey('learner-a'), '1');
    env.DB.fail = true;

    const result = await call(env, 'POST', { sub: 'learner-a', body: { granted: false } });
    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({ ok: false, error: 'delete_incomplete', granted: false });
    // The grant is gone even though the delete failed: nothing new can be stored.
    expect(env.USER_PROGRESS.values.has(consentKey('learner-a'))).toBe(false);

    env.DB.fail = false;
    expect((await call(env, 'POST', { sub: 'learner-a', body: { granted: false } })).status).toBe(200);
  });

  it('reports storage_unavailable rather than throwing when KV cannot be written', async () => {
    const env = makeEnv();
    env.USER_PROGRESS.throwOnPut = true;
    const result = await call(env, 'POST', { sub: 'learner-a', body: { granted: true } });
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ ok: false, error: 'storage_unavailable' });
  });
});

/**
 * The learner-triggered report is a second, narrower consent verb: one tapped
 * exchange may be stored even while the Settings review toggle is off. These
 * tests pin that it stores exactly one redacted row, for the account in the
 * session, and that the operator switch still gates it.
 */
describe('conversation report route', () => {
  beforeEach(() => resetTelemetryTablesCache());

  const reportBody = {
    learner_text: 'Ruf mich an: 0176 1234567 oder schreib an omar@example.com',
    reply_text: 'Gern, hier ist der Link: https://example.com/x?token=abc123',
    scenario_id: 'arzt',
    cefr_level: 'A1',
    turn_index: 2,
    // Values a client must never be able to choose:
    user_id: 'learner-b',
    turn_id: 'forged-turn',
  };

  it('requires the account in the session', async () => {
    const env = makeEnv();
    const result = await callReport(env, { body: reportBody });
    expect(result.status).toBe(401);
    expect(
      env.DB.statements.filter((s) => s.sql.includes('INSERT OR IGNORE INTO conversations')),
    ).toHaveLength(0);
  });

  it('stores exactly one redacted row, owned by the session account', async () => {
    const env = makeEnv();
    const result = await callReport(env, { sub: 'learner-a', body: reportBody });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, stored: true, retention_days: 90 });

    const inserts = env.DB.statements.filter((s) => s.sql.includes('INSERT OR IGNORE INTO conversations'));
    expect(inserts).toHaveLength(1);
    const insert = inserts[0];
    expect(insert.sql).toContain("flagged, note, redacted");
    expect(insert.sql).toContain("1, 'learner_report', 0");
    expect(insert.sql).toContain('outcome');
    // turn_id (0), user_id (5), learner_text (10), reply_text (11), outcome (21), guard (22).
    expect(String(insert.args[0])).toMatch(/^report_/);
    expect(insert.args[0]).not.toBe('forged-turn');
    expect(insert.args[5]).toBe('learner-a');
    expect(String(insert.args[10])).toContain('[phone]');
    expect(String(insert.args[10])).toContain('[email]');
    expect(String(insert.args[10])).not.toContain('0176 1234567');
    expect(String(insert.args[10])).not.toContain('omar@example.com');
    expect(String(insert.args[11])).toContain('[link]');
    expect(insert.args[21]).toBe('reported');
    expect(insert.args[22]).toBe('learner_report');
  });

  it('works without the Settings grant but writes no grant of its own', async () => {
    const env = makeEnv();
    expect(env.USER_PROGRESS.values.has(consentKey('learner-a'))).toBe(false);

    const result = await callReport(env, { sub: 'learner-a', body: reportBody });

    expect(result.status).toBe(200);
    expect(env.USER_PROGRESS.values.size).toBe(0);
  });

  it('refuses while the operator switch is off, storing nothing', async () => {
    const env = makeEnv({ CONVERSATION_LOGGING: 'off' });
    const result = await callReport(env, { sub: 'learner-a', body: reportBody });

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ ok: false, error: 'logging_unavailable' });
    expect(
      env.DB.statements.filter((s) => s.sql.includes('INSERT OR IGNORE INTO conversations')),
    ).toHaveLength(0);
  });

  it('rejects missing or empty exchanges instead of storing a partial row', async () => {
    const env = makeEnv();
    for (const body of [
      {},
      { learner_text: 'Hallo' },
      { reply_text: 'Hi' },
      { learner_text: '   ', reply_text: 'Hi' },
      { learner_text: 'Hallo', reply_text: '   ' },
      { learner_text: 42, reply_text: 'Hi' },
    ]) {
      const result = await callReport(env, { sub: 'learner-a', body });
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ ok: false, error: 'malformed_body' });
    }
    expect(
      env.DB.statements.filter((s) => s.sql.includes('INSERT OR IGNORE INTO conversations')),
    ).toHaveLength(0);
  });

  it('says storage_unavailable rather than claiming the report was kept', async () => {
    const env = makeEnv();
    env.DB.fail = true;
    const result = await callReport(env, { sub: 'learner-a', body: reportBody });
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ ok: false, error: 'storage_unavailable' });
  });

  it('withdrawal deletes reported exchanges too, with no flagged exception', async () => {
    const env = makeEnv();
    await callReport(env, { sub: 'learner-a', body: reportBody });
    env.DB.statements = [];

    const result = await call(env, 'POST', { sub: 'learner-a', body: { granted: false } });
    expect(result.status).toBe(200);

    const deletes = env.DB.statements.filter((s) => s.sql.startsWith('DELETE FROM conversations WHERE'));
    expect(deletes).toHaveLength(1);
    expect(deletes[0].args).toEqual(['learner-a']);
    expect(deletes[0].sql).not.toContain('flagged');
    expect(deletes[0].sql).not.toContain('learner_report');
  });
});
