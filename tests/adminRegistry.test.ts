import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';
import { ensureRegistryTables, sanitizeLogMessage } from '../cloudflare-admin';

/**
 * SaaS admin control plane tests.
 *
 * Covers the root cause of "user not found" in the admin dashboard: before this
 * change, a user only existed to the admin surface if they had redeemed an
 * activation code (the sole writer of `email_index:<email>`). Now `users` is a
 * canonical registry written on every session creation.
 *
 * The D1 stub below is deliberately more faithful than the one in
 * accountOps.test.ts: it parses column lists, VALUES tokens and
 * `ON CONFLICT ... DO UPDATE SET` clauses so the upsert semantics under test are
 * actually exercised (INSERT ... ON CONFLICT is the whole mechanism here).
 */

type Row = Record<string, unknown>;

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

/** Splits a SQL fragment on top-level commas (no nested parens in our SQL). */
function splitTop(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

class RegistryD1 {
  tables: Record<string, Row[]> = {};
  createdTables: string[] = [];
  createdIndexes: string[] = [];
  statements: string[] = [];

  table(name: string): Row[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  prepare(sql: string) {
    const norm = sql.replace(/\s+/g, ' ').trim();
    this.statements.push(norm);
    const self = this;
    const exec = (args: unknown[]) => self.execSql(norm, args);
    return {
      _batch: () => exec([]),
      run: () => exec([]),
      bind: (...args: unknown[]) => ({
        run: () => exec(args),
        first: () => self.firstSql(norm, args),
        // Real D1 `.all()` resolves to { results }, not a bare array.
        all: async () => ({ results: self.allSql(norm, args), success: true }),
      }),
    };
  }

  batch(stmts: Array<{ _batch?: () => unknown }>) {
    return Promise.all(stmts.map((s) => (s && s._batch ? s._batch() : s)));
  }

  /** Build a row from a parsed column list + VALUES token list + bind args. */
  private buildRow(cols: string[], valueTokens: string[], args: unknown[]): Row {
    const row: Row = {};
    let cursor = 0;
    cols.forEach((col, i) => {
      const token = valueTokens[i];
      if (token === '?') {
        row[col] = args[cursor++];
      } else if (/^null$/i.test(token)) {
        row[col] = null;
      } else {
        row[col] = token.replace(/^'/, '').replace(/'$/, '');
      }
    });
    return row;
  }

  /**
   * Applies a real `ON CONFLICT (id) DO UPDATE SET ...` clause.
   * NOTE: assignments must be scanned with a single regex, not split on commas —
   * `COALESCE(excluded.email, users.email)` contains a comma of its own.
   */
  private applyConflictSet(existing: Row, incoming: Row, setClause: string): Row {
    const merged: Row = { ...existing };
    const re = /(\w+)\s*=\s*(COALESCE\(\s*excluded\.(\w+)\s*,\s*users\.(\w+)\s*\)|excluded\.(\w+)|'[^']*')/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(setClause))) {
      const col = m[1];
      if (m[3] !== undefined) {
        merged[col] = incoming[m[3]] ?? existing[m[4]];
      } else if (m[5] !== undefined) {
        merged[col] = incoming[m[5]];
      } else {
        merged[col] = m[2].replace(/'/g, '');
      }
    }
    merged.created_at = existing.created_at; // never reset on upsert
    return merged;
  }

  execSql(norm: string, args: unknown[]) {
    let m: RegExpMatchArray | null;

    if ((m = norm.match(/^CREATE TABLE IF NOT EXISTS (\w+)/i))) {
      this.createdTables.push(m[1]);
      this.table(m[1]);
      return { success: true };
    }
    if ((m = norm.match(/^CREATE INDEX IF NOT EXISTS (\w+)/i))) {
      this.createdIndexes.push(m[1]);
      return { success: true };
    }
    if ((m = norm.match(/^INSERT INTO (\w+)/i))) {
      const tableName = m[1];
      const colsMatch = norm.match(/INSERT INTO \w+ \(([^)]+)\)/i);
      const valsMatch = norm.match(/VALUES \(([^)]+)\)/i);
      if (!colsMatch || !valsMatch) return { success: true };
      const cols = colsMatch[1].split(',').map((s) => s.trim());
      const tokens = splitTop(valsMatch[1]);
      const incoming = this.buildRow(cols, tokens, args);

      // Tables with an autoincrement surrogate key just append.
      if (tableName === 'activity_log' || tableName === 'error_reports') {
        const rows = this.table(tableName);
        incoming.id = rows.length + 1;
        rows.push(incoming);
        return { success: true };
      }

      const pk = Object.keys(incoming)[0];
      const rows = this.table(tableName);
      const conflict = norm.match(/ON CONFLICT\((\w+)\) DO UPDATE SET (.*)$/i);
      const existing = rows.find((r) => r[pk] === incoming[pk]);
      if (existing) {
        if (conflict) {
          const merged = this.applyConflictSet(existing, incoming, conflict[2]);
          Object.assign(existing, merged);
          return { success: true };
        }
        throw new Error('UNIQUE constraint failed');
      }
      rows.push(incoming);
      return { success: true };
    }
    if ((m = norm.match(/^UPDATE (\w+)/i))) {
      const rows = this.table(m[1]);
      const setPart = norm.match(/SET (.*?) WHERE/i);
      const idValue = args[args.length - 1];
      for (const row of rows) {
        if (row.id !== idValue) continue;
        if (setPart) {
          const cols = setPart[1].split(',').map((s) => s.trim().split(/\s*=\s*/)[0]);
          cols.forEach((col, i) => {
            if (col === 'last_seen_at' && /last_seen_at\s*=\s*last_seen_at/i.test(setPart[1])) return;
            row[col] = args[i];
          });
        }
      }
      return { success: true };
    }
    if ((m = norm.match(/^DELETE FROM (\w+)/i))) {
      const rows = this.table(m[1]);
      const colMatch = norm.match(/WHERE (\w+) = \?/i);
      if (!colMatch) {
        rows.length = 0;
        return { success: true };
      }
      const col = colMatch[1];
      const keep = rows.filter((r) => r[col] !== args[0]);
      this.tables[m[1]] = keep;
      return { success: true };
    }
    return { success: true };
  }

  firstSql(norm: string, args: unknown[]) {
    let m: RegExpMatchArray | null;

    if ((m = norm.match(/^SELECT \* FROM users WHERE id = \?/i))) {
      return this.table('users').find((r) => r.id === args[0]) ?? null;
    }
    if ((m = norm.match(/^SELECT \* FROM users WHERE lower\(email\) = \?/i))) {
      return this.table('users').find((r) => String(r.email ?? '').toLowerCase() === args[0]) ?? null;
    }
    if ((m = norm.match(/^SELECT COUNT\(\*\) AS c FROM (\w+)(?: WHERE (\w+) = \?)?/i))) {
      const rows = this.table(m[1]);
      const col = m[2];
      return { c: col ? rows.filter((r) => r[col] === args[0]).length : rows.length };
    }
    // Aggregate used by the overview dashboard.
    if (norm.includes('SUM(CASE WHEN plan')) {
      const now = Number(args[0]);
      const day24 = Number(args[1]);
      const day7 = Number(args[2]);
      const day30 = Number(args[3]);
      const users = this.table('users');
      const num = (v: unknown) => (typeof v === 'number' ? v : 0);
      return {
        total: users.length,
        pro: users.filter((r) => r.plan === 'pro' && num(r.plan_expires_at) > now).length,
        expired: users.filter((r) => r.plan === 'pro' && !(num(r.plan_expires_at) > now)).length,
        new24: users.filter((r) => num(r.created_at) > day24).length,
        new7: users.filter((r) => num(r.created_at) > day7).length,
        new30: users.filter((r) => num(r.created_at) > day30).length,
        active24: users.filter((r) => num(r.last_seen_at) > day24).length,
        active7: users.filter((r) => num(r.last_seen_at) > day7).length,
      };
    }
    return null;
  }

  allSql(norm: string, args: unknown[]) {
    const m = norm.match(/^SELECT \* FROM (\w+)/i);
    if (!m) return [];
    let rows = [...this.table(m[1])];
    const where = norm.match(/WHERE (\w+) = \?/i);
    if (where) rows = rows.filter((r) => r[where[1]] === args[0]);
    const order = norm.match(/ORDER BY (\w+) (ASC|DESC)/i);
    if (order) {
      const key = order[1];
      const dir = order[2].toUpperCase() === 'DESC' ? -1 : 1;
      rows.sort((a, b) => (Number(a[key]) - Number(b[key])) * dir);
    }
    if (/LIMIT \?/i.test(norm)) {
      const hasOffset = /OFFSET \?/i.test(norm);
      const limit = Number(hasOffset ? args[args.length - 2] : args[args.length - 1]);
      const offset = hasOffset ? Number(args[args.length - 1]) : 0;
      rows = rows.slice(offset, offset + limit);
    }
    return rows;
  }
}

function token(payload: Row) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const jwt = (sub: string, email: string) => token({
  sub,
  email,
  aud: 'client-id',
  iss: 'https://accounts.google.com',
  exp: Math.floor(Date.now() / 1000) + 3600,
});

function makeEnv(overrides: Row = {}) {
  return {
    TEST_MODE: true,
    GOOGLE_CLIENT_ID: 'client-id',
    HMAC_SECRET: 'test-hmac-secret',
    ADMIN_SECRET: 'admin-secret',
    REDEEMED_CODES: new MemoryKv(),
    USER_PROGRESS: new MemoryKv(),
    DB: new RegistryD1(),
    ...overrides,
  };
}

type Env = ReturnType<typeof makeEnv> & { DB: RegistryD1 };

const request = (path: string, opts: { method?: string; body?: unknown; auth?: string } = {}) =>
  new Request(`https://worker.test${path}`, {
    method: opts.method ?? 'POST',
    headers: {
      Authorization: `Bearer ${opts.auth ?? ''}`,
      'Content-Type': 'application/json',
    },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });

const adminGet = (path: string, env: Env) =>
  worker.fetch(request(path, { method: 'GET', auth: 'admin-secret' }), env as never);

const adminPost = (path: string, body: unknown, env: Env) =>
  worker.fetch(request(path, { auth: 'admin-secret', body }), env as never);

/** Sign in via Google JWT and return the opaque session token. */
async function signIn(env: Env, sub: string, email: string): Promise<string> {
  const res = await worker.fetch(
    request('/auth/session', { auth: jwt(sub, email), body: {} }),
    env as never,
  );
  const data = (await res.json()) as { session_token?: string };
  expect(data.session_token).toMatch(/^sess_/);
  return data.session_token as string;
}

async function makeCode(months: number, secret: string): Promise<string> {
  const nonce = Math.random().toString(36).slice(2, 10).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(`DE-${months}M-${nonce}`));
  const sig = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 16);
  return `DE-${months}M-${nonce}-${sig}`;
}

// ============================================================================

describe('Step 2: additive user registry schema', () => {
  it('creates users/activity_log/error_reports and issues no destructive DDL', async () => {
    const env = makeEnv();
    const ok = await ensureRegistryTables(env as never);
    expect(ok).toBe(true);

    expect(env.DB.createdTables).toEqual(
      expect.arrayContaining(['users', 'activity_log', 'error_reports']),
    );
    expect(env.DB.createdIndexes.length).toBeGreaterThan(0);

    // Additive only: nothing may drop, rename or alter an existing table.
    const destructive = env.DB.statements.filter((s) => /\b(DROP|ALTER|RENAME)\b/i.test(s));
    expect(destructive).toEqual([]);
    for (const stmt of env.DB.statements) {
      expect(stmt).toMatch(/^CREATE (TABLE|INDEX) IF NOT EXISTS/i);
    }
  });

  it('is wired into ensureLedgerTables so redemption creates ledger AND registry tables', async () => {
    const env = makeEnv();
    // Must be a validly signed code — handleVerify rejects malformed codes
    // before it ever reaches the ledger/registry table creation.
    const code = await makeCode(1, 'test-hmac-secret');
    await worker.fetch(request('/verify', { auth: jwt('u1', 'u1@test.dev'), body: { code } }), env as never);
    expect(env.DB.createdTables).toEqual(
      expect.arrayContaining([
        'redeemed_codes_ledger',
        'trial_quota_ledger',
        'users',
        'activity_log',
        'error_reports',
      ]),
    );
  });
});

describe('Step 3a + Step 4: the "user not found" root cause', () => {
  it('registers a Google-sign-in-only user with plan free, and admin lookup finds them', async () => {
    const env = makeEnv() as Env;
    await signIn(env, 'free-sub-1', 'free1@test.dev');

    const row = env.DB.table('users').find((r) => r.id === 'free-sub-1');
    expect(row).toBeDefined();
    expect(row?.email).toBe('free1@test.dev');
    expect(row?.plan).toBe('free');
    expect(row?.last_seen_at).toBeGreaterThan(0);

    // The bug: this user never redeemed a code, so email_index was never
    // written. The registry must still resolve them.
    expect(env.REDEEMED_CODES.values.has('email_index:free1@test.dev')).toBe(false);

    const res = await adminPost('/admin/lookup', { email: 'free1@test.dev' }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { found: boolean; plan: string; registered: boolean; sub: string };
    expect(body.found).toBe(true);
    expect(body.plan).toBe('free');
    expect(body.registered).toBe(true);
    expect(body.sub).toBe('free-sub-1');
  });

  it('finds a session-only user via progress-lookup instead of 404 user_not_found', async () => {
    const env = makeEnv() as Env;
    await signIn(env, 'free-sub-2', 'free2@test.dev');

    const res = await adminPost('/admin/progress-lookup', { email: 'free2@test.dev' }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stats?: { level: string } };
    expect(body.stats?.level).toBe('A1');
  });

  it('updates last_seen_at on a subsequent sign-in without resetting plan or created_at', async () => {
    const env = makeEnv() as Env;
    await signIn(env, 'repeat-sub', 'repeat@test.dev');
    const first = env.DB.table('users').find((r) => r.id === 'repeat-sub');
    const createdAt = first?.created_at;
    const expires = Date.now() - 1_000_000;
    first!.plan = 'pro';
    first!.plan_expires_at = Date.now() + 1_000_000;

    await signIn(env, 'repeat-sub', 'repeat@test.dev');
    const after = env.DB.table('users').find((r) => r.id === 'repeat-sub');
    expect(env.DB.table('users').length).toBe(1); // upsert, not a second row
    expect(after?.created_at).toBe(createdAt);
    expect(after?.plan).toBe('pro');
    expect(after?.plan_expires_at).toBeGreaterThan(expires);
  });

  it('still resolves pre-migration redeemers through the legacy email_index fallback', async () => {
    const env = makeEnv() as Env;
    // Simulate a user registered before this migration: KV only, no users row.
    await env.REDEEMED_CODES.put('email_index:legacy@test.dev', 'legacy-sub');
    await env.REDEEMED_CODES.put('account:legacy-sub', JSON.stringify({
      email: 'legacy@test.dev',
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
    }));

    const res = await adminPost('/admin/lookup', { email: 'legacy@test.dev' }, env);
    const body = (await res.json()) as { found: boolean; sub: string; plan: string; registered: boolean };
    expect(body.found).toBe(true);
    expect(body.sub).toBe('legacy-sub');
    expect(body.plan).toBe('pro');
    expect(body.registered).toBe(false); // honest: not in the registry yet
  });
});

describe('Step 3b: redemption flips the registry row to pro', () => {
  it('sets plan=pro with an expiry and logs code_redeemed', async () => {
    const env = makeEnv() as Env;
    const sessionToken = await signIn(env, 'pro-sub', 'pro@test.dev');

    const code = await makeCode(6, 'test-hmac-secret');
    const res = await worker.fetch(
      request('/verify', { auth: sessionToken, body: { code } }),
      env as never,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { valid: boolean }).valid).toBe(true);

    const row = env.DB.table('users').find((r) => r.id === 'pro-sub');
    expect(row?.plan).toBe('pro');
    expect(Number(row?.plan_expires_at)).toBeGreaterThan(Date.now());

    const events = env.DB.table('activity_log').map((r) => r.event_type);
    expect(events).toContain('session_created');
    expect(events).toContain('code_redeemed');
  });

  it('creates the registry row even if the user somehow never had a session row', async () => {
    const env = makeEnv() as Env;
    const code = await makeCode(1, 'test-hmac-secret');
    await worker.fetch(request('/verify', { auth: jwt('orphan-sub', 'orphan@test.dev'), body: { code } }), env as never);

    const row = env.DB.table('users').find((r) => r.id === 'orphan-sub');
    expect(row?.plan).toBe('pro');
    expect(row?.email).toBe('orphan@test.dev');
  });
});

describe('Step 3c/3d: activity and error telemetry', () => {
  it('logs data_exported when a learner exports their data', async () => {
    const env = makeEnv() as Env;
    const sessionToken = await signIn(env, 'export-sub', 'export@test.dev');
    const res = await worker.fetch(request('/user/export', { auth: sessionToken, body: {} }), env as never);
    expect(res.status).toBe(200);

    const events = env.DB.table('activity_log').filter((r) => r.user_id === 'export-sub');
    expect(events.map((r) => r.event_type)).toContain('data_exported');
  });

  it('logs ai_turn_failed + an error report when the AI providers are unavailable', async () => {
    const env = makeEnv() as Env; // no AI bindings -> 503 ai_unavailable
    const sessionToken = await signIn(env, 'ai-sub', 'ai@test.dev');
    const res = await worker.fetch(
      request('/ai/turn', { auth: sessionToken, body: { user_message: 'Hallo' } }),
      env as never,
    );
    expect(res.status).toBeGreaterThanOrEqual(500);

    const events = env.DB.table('activity_log').filter((r) => r.user_id === 'ai-sub');
    expect(events.map((r) => r.event_type)).toContain('ai_turn_failed');

    const reports = env.DB.table('error_reports').filter((r) => r.user_id === 'ai-sub');
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0].endpoint).toBe('/ai/turn');
    expect(reports[0].error_type).toBe('ai_turn_error');
  });

  it('logs ai_turn_completed on a successful AI response (no error report)', async () => {
    const env = makeEnv() as Env;
    const sessionToken = await signIn(env, 'ai-ok', 'ai-ok@test.dev');
    const { withAiTelemetry } = await import('../cloudflare-admin');
    const req = request('/ai/turn', { auth: sessionToken, body: { user_message: 'Hallo' } });

    const res = await withAiTelemetry(
      async () => new Response(JSON.stringify({ reply_de: 'Hallo!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      req,
      env as never,
      'ai_turn',
    );
    expect(res.status).toBe(200);

    const events = env.DB.table('activity_log').filter((r) => r.user_id === 'ai-ok');
    expect(events.map((r) => r.event_type)).toContain('ai_turn_completed');
    expect(env.DB.table('error_reports')).toEqual([]);
  });

  it('logs account_deleted anonymously and purges the registry row + telemetry', async () => {
    const env = makeEnv() as Env;
    const sessionToken = await signIn(env, 'del-sub', 'del@test.dev');
    await worker.fetch(request('/user/export', { auth: sessionToken, body: {} }), env as never);
    expect(env.DB.table('users').some((r) => r.id === 'del-sub')).toBe(true);

    const res = await worker.fetch(request('/user/delete', { auth: sessionToken, body: {} }), env as never);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { success: boolean }).success).toBe(true);

    // Registry row (email/IP) and per-user telemetry are gone.
    expect(env.DB.table('users').some((r) => r.id === 'del-sub')).toBe(false);
    expect(env.DB.table('activity_log').some((r) => r.user_id === 'del-sub')).toBe(false);
    expect(env.DB.table('error_reports').some((r) => r.user_id === 'del-sub')).toBe(false);

    // The deletion itself is still recorded, with no user identifier.
    const deletions = env.DB.table('activity_log').filter((r) => r.event_type === 'account_deleted');
    expect(deletions.length).toBe(1);
    expect(deletions[0].user_id).toBeNull();
  });
});

describe('Admin dashboard aggregation API', () => {
  it('splits free vs pro and exposes activity/error counts', async () => {
    const env = makeEnv() as Env;
    await signIn(env, 'dash-free', 'dashfree@test.dev');
    const proToken = await signIn(env, 'dash-pro', 'dashpro@test.dev');
    const code = await makeCode(3, 'test-hmac-secret');
    await worker.fetch(request('/verify', { auth: proToken, body: { code } }), env as never);

    const res = await adminGet('/admin/api/overview', env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stats: { available: boolean; total_users: number; free_users: number; pro_users: number; conversion_rate: number };
      recent_activity: unknown[];
    };
    expect(body.stats.available).toBe(true);
    expect(body.stats.total_users).toBe(2);
    expect(body.stats.pro_users).toBe(1);
    expect(body.stats.free_users).toBe(1);
    expect(body.stats.conversion_rate).toBe(50);
    expect(body.recent_activity.length).toBeGreaterThan(0);
  });

  it('lists all registered users including free ones', async () => {
    const env = makeEnv() as Env;
    await signIn(env, 'list-a', 'lista@test.dev');
    await signIn(env, 'list-b', 'listb@test.dev');

    const res = await adminGet('/admin/api/users?limit=10&offset=0', env);
    const body = (await res.json()) as { total: number; users: Array<{ id: string; plan: string }> };
    expect(body.total).toBe(2);
    expect(body.users.map((u) => u.id).sort()).toEqual(['list-a', 'list-b']);
    expect(body.users.every((u) => u.plan === 'free')).toBe(true);
  });

  it('returns a per-user detail view with activity, errors and redemption count', async () => {
    const env = makeEnv() as Env;
    const sessionToken = await signIn(env, 'detail-sub', 'detail@test.dev');
    const code = await makeCode(2, 'test-hmac-secret');
    await worker.fetch(request('/verify', { auth: sessionToken, body: { code } }), env as never);

    const res = await adminGet('/admin/api/user?id=detail-sub', env);
    const body = (await res.json()) as {
      found: boolean;
      user: { plan: string; email: string };
      activity: Array<{ event_type: string }>;
      redemptions: number;
    };
    expect(body.found).toBe(true);
    expect(body.user.email).toBe('detail@test.dev');
    expect(body.user.plan).toBe('pro');
    expect(body.activity.map((a) => a.event_type)).toContain('code_redeemed');
    expect(body.redemptions).toBe(1);
  });

  // Regression: on a FRESH deploy nothing has called ensureLedgerTables yet, so
  // the registry tables do not exist. listUsers then threw, the dashboard showed
  // "registry unavailable", and a free user's lookup fell back to KV and wrongly
  // reported "not found" — the very bug being fixed. Loading the dashboard (or
  // any admin API call) must create the schema.
  it('GET /admin creates the registry schema on a fresh deploy', async () => {
    const env = makeEnv() as Env;
    expect(env.DB.createdTables).toEqual([]);

    const res = await worker.fetch(request('/admin', { method: 'GET' }), env as never);
    expect(res.status).toBe(200);
    expect(env.DB.createdTables).toEqual(
      expect.arrayContaining(['users', 'activity_log', 'error_reports']),
    );
  });

  it('an authenticated admin API call also creates the registry schema', async () => {
    const env = makeEnv() as Env;
    const res = await adminGet('/admin/api/users?limit=5', env);
    expect(res.status).toBe(200);
    expect(env.DB.createdTables).toEqual(expect.arrayContaining(['users']));
    // And the DDL is still additive-only.
    expect(env.DB.statements.filter((s) => /\b(DROP|ALTER|RENAME)\b/i.test(s))).toEqual([]);
  });

  it('a free user is findable on a fresh deploy without any prior AI/verify traffic', async () => {
    const env = makeEnv() as Env;
    // Wipe the registry to model a freshly deployed worker with an empty DB,
    // then let only the dashboard path touch it.
    env.DB.tables = {};
    await worker.fetch(request('/admin', { method: 'GET' }), env as never);

    await signIn(env, 'fresh-free', 'fresh@test.dev');
    const res = await adminPost('/admin/lookup', { email: 'fresh@test.dev' }, env);
    const body = (await res.json()) as { found: boolean; plan: string; registered: boolean };
    expect(body.found).toBe(true);
    expect(body.plan).toBe('free');
    expect(body.registered).toBe(true);
  });
});

describe('Admin auth gate is unchanged', () => {
  it('rejects registry API calls without the admin secret', async () => {
    const env = makeEnv() as Env;
    for (const path of ['/admin/api/overview', '/admin/api/users', '/admin/api/user?id=x']) {
      const res = await worker.fetch(request(path, { method: 'GET', auth: 'wrong-secret' }), env as never);
      expect(res.status).toBe(401);
    }
    const noAuth = await worker.fetch(request('/admin/api/users', { method: 'GET' }), env as never);
    expect(noAuth.status).toBe(401);
  });

  it('still gates the legacy admin actions', async () => {
    const env = makeEnv() as Env;
    for (const path of ['/admin/lookup', '/admin/edit', '/admin/revoke', '/admin/progress-lookup', '/admin/progress-edit']) {
      const res = await worker.fetch(request(path, { body: { email: 'x@test.dev' } }), env as never);
      expect(res.status).toBe(401);
    }
  });

  it('serves the dashboard shell for GET /admin', async () => {
    const env = makeEnv() as Env;
    const res = await worker.fetch(request('/admin', { method: 'GET' }), env as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Katzu');
    expect(html).toContain('/admin/api/overview');
  });
});

describe('Credential sanitizer', () => {
  it('strips session tokens, JWTs, API keys and bearer headers', () => {
    const dirty = [
      'failed for token sess_abcdef1234567890',
      'jwt eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop',
      'key AIzaSyD-1234567890abcdefg',
      'header Bearer sess_zzzzzzzzzzzzzzzz',
    ].join(' | ');
    const clean = sanitizeLogMessage(dirty) as string;
    expect(clean).not.toContain('sess_abcdef');
    expect(clean).not.toContain('AIzaSyD-1234567890abcdefg');
    expect(clean).not.toContain('Bearer sess_zzz');
    expect(clean).toContain('[redacted]');
  });

  it('never stores tokens in activity metadata or error messages', async () => {
    const env = makeEnv() as Env;
    const sessionToken = await signIn(env, 'sanitize-sub', 'san@test.dev');
    const res = await worker.fetch(
      request('/ai/turn', { auth: sessionToken, body: { user_message: 'Hallo' } }),
      env as never,
    );
    await res.json();

    const serialized = JSON.stringify(env.DB.table('error_reports')) + JSON.stringify(env.DB.table('activity_log'));
    expect(serialized).not.toContain('sess_');
    expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{5,}\./);
  });

  it('truncates and nulls unsafe values', () => {
    expect(sanitizeLogMessage(null)).toBeNull();
    expect(sanitizeLogMessage(undefined)).toBeNull();
    const long = 'x'.repeat(5000);
    expect((sanitizeLogMessage(long) as string).length).toBeLessThanOrEqual(400);
  });
});
