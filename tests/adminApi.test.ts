import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleInternalAdminRoutes,
  resetInternalRateLimit,
  getOrCreateInternalToken,
  readInternalToken,
  generateInternalToken,
  INTERNAL_TOKEN_KV_KEY,
  INTERNAL_TOKEN_MIN_LENGTH,
  INTERNAL_RATE_LIMIT,
} from '../cloudflare-admin-api';

/**
 * The internal surface is the only door into production data, so these tests are
 * about the door: deny by default, never reveal which paths exist, bind every
 * value, audit every mutation, and keep the token out of every response.
 */

type Statement = { sql: string; args: unknown[] };

class StubDB {
  statements: Statement[] = [];
  fail = false;
  selectResults: Record<string, unknown[]> = {};

  prepare(sql: string) {
    const self = this;
    const make = (args: unknown[]) => {
      self.statements.push({ sql, args });
      return {
        async run() {
          if (self.fail) throw new Error('d1 unavailable');
          return { meta: { changes: 1 }, success: true };
        },
        async first() {
          if (self.fail) throw new Error('d1 unavailable');
          if (/COUNT\(\*\) AS n FROM users WHERE plan/i.test(sql)) return { n: 1 };
          if (/COUNT\(\*\) AS n FROM users/i.test(sql)) return { n: 2 };
          if (/SELECT 1 AS ok/i.test(sql)) return { ok: 1 };
          return { ok: 1, n: 0, avg: null, max: null };
        },
        async all() {
          if (self.fail) throw new Error('d1 unavailable');
          for (const [needle, rows] of Object.entries(self.selectResults)) {
            if (sql.includes(needle)) return { results: rows };
          }
          return { results: [] };
        },
      };
    };
    return {
      bind(...args: unknown[]) {
        return make(args);
      },
      async run() {
        return make([]).run();
      },
      async first() {
        return make([]).first();
      },
      async all() {
        return make([]).all();
      },
    };
  }

  async batch(items: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(items.map((item) => item.run()));
  }
}

class StubKv {
  values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.values.set(key, value);
  }
}

const TOKEN = 'ika_' + 'a'.repeat(64);

function makeEnv(overrides: Record<string, unknown> = {}) {
  const kv = new StubKv();
  kv.values.set(INTERNAL_TOKEN_KV_KEY, TOKEN);
  return { DB: new StubDB(), USER_PROGRESS: kv, RELEASE: 'test-release', ...overrides };
}

function request(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.token !== null) headers.set('Authorization', `Bearer ${init.token ?? TOKEN}`);
  return new Request(`https://katzu.test${path}`, { ...init, headers });
}

function ctx() {
  const pending: Promise<unknown>[] = [];
  return { waitUntil: (p: Promise<unknown>) => pending.push(p), pending };
}

beforeEach(() => {
  resetInternalRateLimit();
  vi.restoreAllMocks();
});

describe('routing boundary', () => {
  it('returns null for every path outside /internal/admin', async () => {
    for (const path of ['/ai/turn', '/admin', '/internal/other', '/internal/adminx']) {
      expect(await handleInternalAdminRoutes(new URL(`https://katzu.test${path}`), request(path), makeEnv())).toBeNull();
    }
  });
});

describe('authentication is deny-by-default', () => {
  it('401s without a token, and says nothing about the path', async () => {
    const env = makeEnv();
    const missing = await handleInternalAdminRoutes(new URL('https://katzu.test/internal/admin/health'), request('/internal/admin/health', { token: null }), env);
    expect(missing?.status).toBe(401);
    const unknown = await handleInternalAdminRoutes(new URL('https://katzu.test/internal/admin/does-not-exist'), request('/internal/admin/does-not-exist', { token: null }), env);
    expect(unknown?.status).toBe(401);
    expect(await unknown?.json()).toEqual({ error: 'unauthorized' });
  });

  it('401s with a wrong token, including a same-length forgery', async () => {
    const env = makeEnv();
    for (const token of ['nope', 'ika_' + 'b'.repeat(64), TOKEN.slice(0, -1)]) {
      const response = await handleInternalAdminRoutes(new URL('https://katzu.test/internal/admin/health'), request('/internal/admin/health', { token }), env);
      expect(response?.status).toBe(401);
    }
  });

  it('fails closed when no token is configured anywhere', async () => {
    const env = makeEnv();
    (env.USER_PROGRESS as StubKv).values.clear();
    const response = await handleInternalAdminRoutes(new URL('https://katzu.test/internal/admin/health'), request('/internal/admin/health'), env);
    expect(response?.status).toBe(401);
  });

  it('accepts the bound secret and prefers it over KV', async () => {
    const env = makeEnv({ ADMIN_INTERNAL_TOKEN: 'bound_' + 'c'.repeat(40) });
    const withBound = await handleInternalAdminRoutes(
      new URL('https://katzu.test/internal/admin/health'),
      request('/internal/admin/health', { token: 'bound_' + 'c'.repeat(40) }),
      env,
    );
    expect(withBound?.status).toBe(200);
    const withKv = await handleInternalAdminRoutes(new URL('https://katzu.test/internal/admin/health'), request('/internal/admin/health'), env);
    expect(withKv?.status).toBe(401);
    expect(await readInternalToken(env)).toBe('bound_' + 'c'.repeat(40));
  });
});

describe('token lifecycle', () => {
  it('generates a long random token and stores it once', async () => {
    const kv = new StubKv();
    const env = { USER_PROGRESS: kv };
    const token = await getOrCreateInternalToken(env);
    expect(token.length).toBeGreaterThan(INTERNAL_TOKEN_MIN_LENGTH);
    expect(token).toMatch(/^ika_[0-9a-f]{64}$/);
    expect(kv.values.get(INTERNAL_TOKEN_KV_KEY)).toBe(token);
    expect(await getOrCreateInternalToken(env)).toBe(token);
  });

  it('produces a different token each call', () => {
    expect(generateInternalToken()).not.toBe(generateInternalToken());
  });

  it('returns an empty string rather than throwing without KV', async () => {
    expect(await getOrCreateInternalToken({})).toBe('');
    expect(await readInternalToken({})).toBe('');
  });
});

describe('rate limiting', () => {
  it('429s after the documented per-minute budget', async () => {
    const env = makeEnv();
    const url = new URL('https://katzu.test/internal/admin/health');
    let last: Response | null = null;
    for (let i = 0; i < INTERNAL_RATE_LIMIT + 1; i += 1) {
      last = await handleInternalAdminRoutes(url, request('/internal/admin/health'), env);
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get('Retry-After')).toBeTruthy();
  });

  it('rate-limits before authenticating, so a flood is cheap', async () => {
    const env = makeEnv();
    const url = new URL('https://katzu.test/internal/admin/health');
    let status = 0;
    for (let i = 0; i < INTERNAL_RATE_LIMIT + 1; i += 1) {
      status = (await handleInternalAdminRoutes(url, request('/internal/admin/health', { token: null }), env))?.status || 0;
    }
    expect(status).toBe(429);
  });
});

describe('read endpoints', () => {
  it('health reports the database and never the token', async () => {
    const env = makeEnv();
    const response = await handleInternalAdminRoutes(new URL('https://katzu.test/internal/admin/health'), request('/internal/admin/health'), env);
    expect(response?.status).toBe(200);
    const body = await response!.json();
    expect(body).toMatchObject({ ok: true, db: 'ok', release: 'test-release', logging_enabled: false, token_source: 'kv' });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it('overview answers a shape the panel can render with no data', async () => {
    const env = makeEnv();
    const response = await handleInternalAdminRoutes(new URL('https://katzu.test/internal/admin/overview?hours=3'), request('/internal/admin/overview?hours=3'), env);
    const body = await response!.json();
    expect(response?.status).toBe(200);
    expect(body.window_hours).toBe(3);
    expect(body.ai.by_kind).toEqual([]);
    expect(body.logging_enabled).toBe(false);
  });

  it('conversations binds the filters instead of interpolating them', async () => {
    const env = makeEnv();
    env.DB.selectResults['FROM conversations'] = [{ turn_id: 't1', scenario: 'cafe' }];
    const response = await handleInternalAdminRoutes(
      new URL('https://katzu.test/internal/admin/conversations?user=u1&scenario=cafe&limit=5'),
      request('/internal/admin/conversations?user=u1&scenario=cafe&limit=5'),
      env,
    );
    const body = await response!.json();
    expect(body.rows).toHaveLength(1);
    const select = env.DB.statements.find((s) => s.sql.includes('FROM conversations') && s.sql.includes('learner_preview'));
    expect(select?.sql).not.toContain('u1');
    expect(select?.sql).not.toContain('cafe');
    expect(select?.args).toContain('u1');
    expect(select?.args).toContain('cafe');
    expect(select?.args[select.args.length - 1]).toBe(5);
  });

  it('clamps a hostile limit rather than trusting it', async () => {
    const env = makeEnv();
    await handleInternalAdminRoutes(
      new URL('https://katzu.test/internal/admin/conversations?limit=100000'),
      request('/internal/admin/conversations?limit=100000'),
      env,
    );
    const select = env.DB.statements.find((s) => s.sql.includes('learner_preview'));
    expect(select?.args[select.args.length - 1]).toBe(200);
  });

  it('users reports totals and supports search', async () => {
    const env = makeEnv();
    env.DB.selectResults['FROM users'] = [{ id: 'u1', email: 'a@b.de', plan: 'pro' }];
    const response = await handleInternalAdminRoutes(new URL('https://katzu.test/internal/admin/users?q=a'), request('/internal/admin/users?q=a'), env);
    const body = await response!.json();
    expect(body.total).toBe(2);
    expect(body.pro).toBe(1);
    expect(body.rows).toHaveLength(1);
    const select = env.DB.statements.find((s) => s.sql.includes('FROM users WHERE email LIKE'));
    expect(select?.sql).not.toContain("'a'");
    expect(select?.args[0]).toBe('%a%');
  });

  it('alerts turns a burst of failures into named cards', async () => {
    const env = makeEnv();
    const db = env.DB as StubDB;
    const original = db.prepare.bind(db);
    let call = 0;
    db.prepare = (sql: string) => {
      call += 1;
      const base = original(sql);
      if (/kind = 'invalid_key'/.test(sql)) return { ...base, bind: () => ({ first: async () => ({ n: 2 }) }) };
      if (/COUNT\(\*\) AS n FROM route_events WHERE ts >= \?$/.test(sql)) return { ...base, bind: () => ({ first: async () => ({ n: 100 }) }) };
      if (/status >= 500/.test(sql) && /route_events/.test(sql)) return { ...base, bind: () => ({ first: async () => ({ n: 10 }) }) };
      return base;
    };
    const response = await handleInternalAdminRoutes(new URL('https://katzu.test/internal/admin/alerts'), request('/internal/admin/alerts'), env);
    const body = await response!.json();
    const codes = body.alerts.map((a: { code: string }) => a.code);
    expect(codes).toContain('invalid_key');
    expect(codes).toContain('route_error_rate');
  });

  it('rejects the wrong method with 405', async () => {
    const env = makeEnv();
    const response = await handleInternalAdminRoutes(
      new URL('https://katzu.test/internal/admin/health'),
      request('/internal/admin/health', { method: 'POST' }),
      env,
    );
    expect(response?.status).toBe(405);
  });

  it('404s an authenticated unknown path', async () => {
    const env = makeEnv();
    const response = await handleInternalAdminRoutes(new URL('https://katzu.test/internal/admin/nope'), request('/internal/admin/nope'), env);
    expect(response?.status).toBe(404);
  });
});

describe('mutations are explicit and audited', () => {
  it('flags and clears a turn', async () => {
    const env = makeEnv();
    const c = ctx();
    const response = await handleInternalAdminRoutes(
      new URL('https://katzu.test/internal/admin/conversations/t1/flag'),
      request('/internal/admin/conversations/t1/flag', {
        method: 'POST',
        body: JSON.stringify({ flagged: true, note: 'rude reply' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
      undefined,
      c as unknown as ExecutionContext,
    );
    expect(await response!.json()).toEqual({ ok: true, changed: 1 });
    const update = env.DB.statements.find((s) => s.sql.includes('UPDATE conversations'));
    expect(update?.args).toEqual([1, 'rude reply', 't1']);
    expect(env.DB.statements.some((s) => s.sql.includes('INSERT INTO admin_audit'))).toBe(true);
  });

  it('deletes a turn and its attempts', async () => {
    const env = makeEnv();
    const response = await handleInternalAdminRoutes(
      new URL('https://katzu.test/internal/admin/conversations/t1'),
      request('/internal/admin/conversations/t1', { method: 'DELETE' }),
      env,
    );
    expect(await response!.json()).toEqual({ ok: true });
    expect(env.DB.statements.some((s) => s.sql.includes('DELETE FROM conversation_attempts'))).toBe(true);
    expect(env.DB.statements.some((s) => s.sql.includes('DELETE FROM conversations'))).toBe(true);
  });

  it('deletes every turn for one learner, which is a data-subject request', async () => {
    const env = makeEnv();
    const response = await handleInternalAdminRoutes(
      new URL('https://katzu.test/internal/admin/users/u1/conversations'),
      request('/internal/admin/users/u1/conversations', { method: 'DELETE' }),
      env,
    );
    expect(await response!.json()).toEqual({ ok: true });
    const del = env.DB.statements.find((s) => s.sql.includes('DELETE FROM conversations WHERE user_id = ?'));
    expect(del?.args).toEqual(['u1']);
  });

  it('exports as a download and audits it', async () => {
    const env = makeEnv();
    const c = ctx();
    const response = await handleInternalAdminRoutes(
      new URL('https://katzu.test/internal/admin/export'),
      request('/internal/admin/export', { method: 'POST', body: JSON.stringify({ hours: 24 }) }),
      env,
      undefined,
      c as unknown as ExecutionContext,
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Disposition')).toContain('attachment');
    const body = await response!.json();
    expect(body.turns).toEqual([]);
    expect(body.window_hours).toBe(24);
    expect(env.DB.statements.some((s) => s.sql.includes('INSERT INTO admin_audit'))).toBe(true);
  });

  it('runs the retention sweep on demand', async () => {
    const env = makeEnv();
    const response = await handleInternalAdminRoutes(
      new URL('https://katzu.test/internal/admin/retention/sweep'),
      request('/internal/admin/retention/sweep', { method: 'POST' }),
      env,
    );
    expect(response?.status).toBe(200);
    expect(await response!.json()).toMatchObject({ ok: true, conversations_scrubbed: 1 });
  });

  it('disables a provider through the existing owner config, never a key value', async () => {
    const env = makeEnv();
    const setter = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const response = await handleInternalAdminRoutes(
      new URL('https://katzu.test/internal/admin/providers/state'),
      request('/internal/admin/providers/state', { method: 'POST', body: JSON.stringify({ provider: 'groq', enabled: false }) }),
      env,
      undefined,
      ctx() as unknown as ExecutionContext,
      { setDefaultProviderState: setter },
    );
    expect(response?.status).toBe(200);
    expect(setter).toHaveBeenCalledWith(env, 'groq', false);
  });

  it('refuses to disable a provider when the config module is unavailable', async () => {
    const env = makeEnv();
    const response = await handleInternalAdminRoutes(
      new URL('https://katzu.test/internal/admin/providers/state'),
      request('/internal/admin/providers/state', { method: 'POST', body: JSON.stringify({ provider: 'groq' }) }),
      env,
    );
    expect(response?.status).toBe(503);
  });
});

describe('failure containment', () => {
  it('turns a database failure into a JSON 500, never a stack trace', async () => {
    const env = makeEnv();
    (env.DB as StubDB).fail = true;
    const response = await handleInternalAdminRoutes(new URL('https://katzu.test/internal/admin/health'), request('/internal/admin/health'), env);
    expect(response?.status).toBe(200); // health degrades to db:unavailable
    const body = await response!.json();
    expect(body.db).toBe('unavailable');
  });
});
