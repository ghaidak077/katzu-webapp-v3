import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';

/**
 * ROUTES MUST CREATE THE TABLES THEY USE (V9-1 / V9-2).
 *
 * The Worker creates its D1 tables lazily (`CREATE TABLE IF NOT EXISTS`, no
 * migrations directory). That only works if every route that touches a table
 * creates it first — and for a long time only the redemption path did, because
 * `ensureLedgerTables` was called from `/verify`, the referral payout and the
 * delete route but not from `/progress/sync`. On a brand-new database the first
 * sync therefore threw `no such table: sync_revisions`, which the Worker reported
 * as a bare 500, and the failure could not even be recorded because
 * `error_reports` did not exist either.
 *
 * WHY THIS NEEDS ITS OWN D1 DOUBLE
 * Every other double in this repo either auto-creates a table on first use (the
 * local one in `accountOps.test.ts`) or answers success for statements it does not
 * model (`tests/helpers/fakeD1.ts`). Both reported that bug as green: the fake
 * *invented* the missing table, so the route looked correct and the fake-only
 * suite could never have caught it. This stub models what a real empty SQLite
 * database does instead — a statement against a table no `CREATE TABLE` has
 * created throws — and throws loudly on any statement shape it cannot model, so a
 * route that grows a new statement fails here rather than silently passing.
 */

class FreshD1 {
  private tables = new Map<string, Map<string, Record<string, unknown>>>();
  private created = new Set<string>();
  private counters = new Map<string, number>();

  constructor(private opts: { failCreate?: boolean } = {}) {}

  /** Table names a `CREATE TABLE IF NOT EXISTS` created, sorted for stable asserts. */
  tablesCreated(): string[] {
    return [...this.created].sort();
  }

  rows(table: string): Record<string, unknown>[] {
    return [...(this.tables.get(table)?.values() ?? [])];
  }

  prepare(sql: string): FreshStatement {
    return new FreshStatement(this, sql.replace(/\s+/g, ' ').trim(), []);
  }

  batch(statements: { run(): Promise<unknown> }[]): Promise<unknown[]> {
    if (this.opts.failCreate) return Promise.reject(new Error('D1_ERROR: database is locked'));
    return Promise.all(statements.map((statement) => statement.run()));
  }

  // -- internals -------------------------------------------------------------

  private require(table: string): Map<string, Record<string, unknown>> {
    if (!this.created.has(table)) {
      throw new Error(`D1_ERROR: no such table: ${table}: SQLITE_ERROR`);
    }
    if (!this.tables.has(table)) this.tables.set(table, new Map());
    return this.tables.get(table)!;
  }

  private keyFor(table: string, row: Record<string, unknown>): string {
    const next = (this.counters.get(table) ?? 0) + 1;
    this.counters.set(table, next);
    return String(row.__pk ?? next);
  }

  /** `(?, 1, ?)` against the bound args. */
  private bind(token: string, args: unknown[], cursor: { i: number }): unknown {
    const trimmed = token.trim();
    if (trimmed === '?') return args[cursor.i++];
    if (/^null$/i.test(trimmed)) return null;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (/^'.*'$/.test(trimmed)) return trimmed.slice(1, -1);
    throw new Error(`FreshD1: unsupported value token "${trimmed}"`);
  }

  private matches(where: string, row: Record<string, unknown>, args: unknown[], cursor: { i: number }): boolean {
    // `col = ? AND col = ?`, `col = ? OR col = ?` — enough for the ledger deletes.
    const groups = where.split(/\s+AND\s+/i);
    return groups.every((group) =>
      group.split(/\s+OR\s+/i).some((condition) => {
        const eq = condition.trim().match(/^(\w+)\s*=\s*(\?|'.*')$/);
        if (!eq) throw new Error(`FreshD1: unsupported condition "${condition}"`);
        const column = eq[1] === 'rowid' ? '__pk' : eq[1];
        const value = this.bind(eq[2], args, cursor);
        return String(row[column] ?? '') === String(value ?? '');
      }),
    );
  }

  execute(sql: string, args: unknown[]): { results: Record<string, unknown>[]; changes: number } {
    const created = sql.match(/^CREATE TABLE IF NOT EXISTS (\w+)/i);
    if (created) {
      if (this.opts.failCreate) throw new Error('D1_ERROR: database is locked');
      this.created.add(created[1]);
      return { results: [], changes: 0 };
    }
    if (/^CREATE INDEX/i.test(sql) || /^(PRAGMA|ALTER|DROP|BEGIN|COMMIT)/i.test(sql)) {
      return { results: [], changes: 0 };
    }

    const insert = sql.match(/^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]*)\)(?: ON CONFLICT\((\w+)\) (DO NOTHING|DO UPDATE SET .+))?$/i);
    if (insert) {
      const [, table, columns, values, conflictColumn, action] = insert;
      const rows = this.require(table);
      const names = columns.split(',').map((name) => name.trim());
      const cursor = { i: 0 };
      const row: Record<string, unknown> = {};
      values.split(',').forEach((token, index) => {
        row[names[index]] = this.bind(token, args, cursor);
      });
      if (conflictColumn) {
        if (!/DO NOTHING$/i.test(action ?? '')) {
          throw new Error(`FreshD1: unsupported conflict action "${action}"`);
        }
        const existing = [...rows.values()].some((entry) => String(entry[conflictColumn]) === String(row[conflictColumn]));
        if (existing) return { results: [], changes: 0 };
      }
      row.__pk = this.keyFor(table, row);
      rows.set(String(row.__pk), row);
      return { results: [], changes: 1 };
    }

    const update = sql.match(/^UPDATE (\w+) SET (.+?) WHERE (.+)$/i);
    if (update) {
      const [, table, assignments, where] = update;
      const rows = this.require(table);
      let changes = 0;
      for (const row of rows.values()) {
        const cursor = { i: 0 };
        const parsed = assignments.split(',').map((assignment) => {
          const [column, expression] = assignment.split('=').map((part) => part.trim());
          if (expression === '?') return { column, value: args[cursor.i++] };
          const increment = expression.match(/^(\w+)\s*\+\s*(\d+)$/);
          if (increment) return { column, increment: Number(increment[2]) };
          if (/^'.*'$/.test(expression)) return { column, value: expression.slice(1, -1) };
          throw new Error(`FreshD1: unsupported SET expression "${expression}"`);
        });
        const whereCursor = { i: cursor.i };
        if (!this.matches(where, row, args, whereCursor)) continue;
        for (const change of parsed) {
          row[change.column] = change.increment !== undefined
            ? Number(row[change.column] ?? 0) + change.increment
            : change.value;
        }
        changes += 1;
      }
      return { results: [], changes };
    }

    const remove = sql.match(/^DELETE FROM (\w+)(?: WHERE (.+))?$/i);
    if (remove) {
      const [, table, where] = remove;
      const rows = this.require(table);
      let changes = 0;
      for (const [key, row] of [...rows.entries()]) {
        if (where && !this.matches(where, row, args, { i: 0 })) continue;
        rows.delete(key);
        changes += 1;
      }
      return { results: [], changes };
    }

    const select = sql.match(/^SELECT (.+?) FROM (\w+)(?: WHERE (.+))?$/i);
    if (select) {
      const [, projection, table, where] = select;
      const rows = this.require(table);
      const columns = projection
        .split(',')
        .map((column) => column.replace(/\s+AS\s+\w+$/i, '').trim());
      const matched = [...rows.values()].filter((row) => !where || this.matches(where, row, args, { i: 0 }));
      if (/\bCOUNT\(\*\)/i.test(projection)) {
        const alias = projection.match(/AS\s+(\w+)/i)?.[1] ?? 'count';
        return { results: [{ [alias]: matched.length }], changes: 0 };
      }
      return {
        results: matched.map((row) => {
          if (projection.trim() === '*') return { ...row };
          const picked: Record<string, unknown> = {};
          for (const column of columns) picked[column] = row[column] ?? null;
          return picked;
        }),
        changes: 0,
      };
    }

    throw new Error(`FreshD1: unsupported statement "${sql.slice(0, 140)}"`);
  }
}

class FreshStatement {
  constructor(private db: FreshD1, private sql: string, private args: unknown[]) {}

  bind(...args: unknown[]): FreshStatement {
    return new FreshStatement(this.db, this.sql, args);
  }

  async run(): Promise<{ results: Record<string, unknown>[]; changes: number; success: boolean }> {
    const result = this.db.execute(this.sql, this.args);
    return { ...result, success: true };
  }

  async all(): Promise<{ results: Record<string, unknown>[]; success: boolean }> {
    return { results: this.db.execute(this.sql, this.args).results, success: true };
  }

  async first(): Promise<Record<string, unknown> | null> {
    return this.db.execute(this.sql, this.args).results[0] ?? null;
  }
}

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) || null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

const token = (sub: string) => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    sub,
    email: `${sub}@test.dev`,
    aud: 'client-id',
    iss: 'https://accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.signature`;
};

function makeEnv(db: FreshD1, overrides: Record<string, unknown> = {}) {
  return {
    TEST_MODE: true,
    GOOGLE_CLIENT_ID: 'client-id',
    HMAC_SECRET: 'test-hmac-secret',
    ADMIN_SECRET: 'a-long-enough-admin-secret-value',
    REDEEMED_CODES: new MemoryKv(),
    USER_PROGRESS: new MemoryKv(),
    DB: db,
    ...overrides,
  };
}

const sync = (env: unknown, body: Record<string, unknown>, sub = 'fresh-user') =>
  worker.fetch(new Request('https://worker.test/progress/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(sub)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env as never);

const getProgress = (env: unknown, sub = 'fresh-user') =>
  worker.fetch(new Request('https://worker.test/progress/get', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token(sub)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }), env as never);

describe('a route must create the tables it uses (fresh database)', () => {
  it('creates the ledger tables and commits the first sync instead of returning 500', async () => {
    const db = new FreshD1();
    const env = makeEnv(db);

    const response = await sync(env, { stats: { level: 'A1', total_points: 12, updated_at: 1 } });
    const body = await response.json() as { success?: boolean; rev?: number; error?: string };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.rev).toBe(1);

    // The whole lazy batch, not just the one table this route writes: the failure
    // was that only the redemption path created any of them.
    expect(db.tablesCreated()).toEqual(expect.arrayContaining([
      'sync_revisions',
      'redeemed_codes_ledger',
      'trial_quota_ledger',
      'referral_payouts',
      'rate_limit_counters',
      'users',
      'activity_log',
      'error_reports',
    ]));

    const rows = db.rows('sync_revisions');
    expect(rows).toHaveLength(1);
    expect(String(rows[0].payload)).toContain('"total_points":12');
    expect(rows[0].rev).toBe(1);
  });

  it('keeps the revision gate working once the tables exist', async () => {
    const db = new FreshD1();
    const env = makeEnv(db);

    const first = await sync(env, { stats: { total_points: 5, updated_at: 1 } });
    expect((await first.json() as { rev: number }).rev).toBe(1);

    const second = await sync(env, { base_rev: 1, stats: { total_points: 9, updated_at: 2 } });
    expect(second.status).toBe(200);
    expect((await second.json() as { rev: number }).rev).toBe(2);

    // A stale base_rev is still a conflict, not a lost write.
    const stale = await sync(env, { base_rev: 1, stats: { total_points: 99, updated_at: 3 } });
    expect(stale.status).toBe(409);
    expect(db.rows('sync_revisions')[0].rev).toBe(2);
  });

  it('degrades to the KV merge when the tables cannot be created, instead of 500ing', async () => {
    const db = new FreshD1({ failCreate: true });
    const env = makeEnv(db);

    const response = await sync(env, { stats: { level: 'A1', total_points: 7, updated_at: 1 } });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(db.rows('sync_revisions')).toHaveLength(0);
    // The merged payload still lands in the KV mirror, so nothing is lost.
    const cached = await (env.USER_PROGRESS as MemoryKv).get('progress:fresh-user');
    expect(String(cached)).toContain('"total_points":7');
  });

  it('reads progress from a fresh database without inventing a failure', async () => {
    const db = new FreshD1();
    const env = makeEnv(db);

    const response = await getProgress(env);
    const body = await response.json() as { rev: number; stats: { level: string }; session_summaries: unknown[] };

    expect(response.status).toBe(200);
    expect(body.rev).toBe(0);
    expect(body.stats.level).toBe('A1');
    expect(body.session_summaries).toEqual([]);
  });

  it('deletes the authoritative D1 progress row, so a deleted learner cannot restore it', async () => {
    const db = new FreshD1();
    const env = makeEnv(db);

    await sync(env, { stats: { level: 'A1', total_points: 30, updated_at: 1 } });
    expect(db.rows('sync_revisions')).toHaveLength(1);

    const response = await worker.fetch(new Request('https://worker.test/user/delete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token('fresh-user')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }), env as never);
    const body = await response.json() as { success?: boolean; code?: string; failed_steps?: string[] };

    // The route answers 500 DELETE_INCOMPLETE when any step fails, and
    // `d1_progress` used to fail on every database (it deleted a legacy table
    // nothing creates), which also skipped the registry purge.
    expect(body.code).not.toBe('DELETE_INCOMPLETE');
    expect(body.success).toBe(true);
    expect(db.rows('sync_revisions')).toHaveLength(0);
  });
});
