import { describe, expect, it, beforeEach } from 'vitest';
import { handleAdminRoutes } from '../cloudflare-admin';

/**
 * Content edit path for `vocabulary` / `starter_phrases`.
 *
 * Why it exists: `/admin/upload` only INSERTs into these two tables (neither has
 * a unique key, so there is no ON CONFLICT clause), so a corrected row cannot be
 * re-uploaded without duplicating the headword and handing the quiz two
 * identical rows. These tests pin the rowid-keyed, column-allowlisted update and
 * the read-back that proves the write.
 */

type Row = Record<string, unknown>;

/** Minimal D1 stub that understands exactly the statements this route emits. */
class ContentD1 {
  private tables: Record<string, Row[]> = {};

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows.map((r, i) => ({ __rowid: i + 1, ...r }));
  }

  private table(name: string): Row[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  private select(name: string, sql: string, args: unknown[]): Row[] {
    let rows = [...this.table(name)];
    const where = sql.match(/WHERE (.+?) ORDER BY/s);
    if (where) {
      const clause = where[1];
      let cursor = 0;
      // `rowid IN (?, ?)` first — it consumes a variable number of args.
      const inMatch = clause.match(/rowid IN \(([^)]+)\)/);
      const inArgs: number[] = [];
      if (inMatch) {
        for (let i = 0; i < inMatch[1].split(',').length; i++) inArgs.push(Number(args[cursor++]));
        rows = rows.filter((r) => inArgs.includes(Number(r.__rowid)));
      }
      for (const cond of clause.split(' AND ')) {
        const eq = cond.match(/^(\w+) = \?$/);
        if (eq && cond !== 'rowid IN (?)') {
          const value = args[cursor++];
          rows = rows.filter((r) => r[eq[1]] === value);
          continue;
        }
        const like = cond.match(/^(\w+) LIKE \?$/);
        if (like) {
          const value = String(args[cursor++]).replace(/%/g, '');
          rows = rows.filter((r) => String(r[like[1]] ?? '').includes(value));
          continue;
        }
        const rowidEq = cond.match(/^rowid = \?$/);
        if (rowidEq) {
          const value = Number(args[cursor++]);
          rows = rows.filter((r) => Number(r.__rowid) === value);
        }
      }
    }
    return rows.map((r) => ({ id: r.__rowid, ...r, __rowid: undefined }));
  }

  prepare(sql: string) {
    const norm = sql.replace(/\s+/g, ' ').trim();
    const self = this;
    const tableName = norm.match(/FROM (\w+)|UPDATE (\w+)/)?.[1] ?? norm.match(/UPDATE (\w+)/)?.[1] ?? '';

    const runUpdate = (args: unknown[]) => {
      const name = norm.match(/UPDATE (\w+)/)![1];
      const assignments = norm
        .match(/SET (.+?) WHERE rowid = \?/)![1]
        .split(',')
        .map((s) => s.trim().replace(/ = \?$/, ''));
      const rowid = Number(args[args.length - 1]);
      const row = self.table(name).find((r) => Number(r.__rowid) === rowid);
      if (!row) return { success: false, changes: 0 };
      assignments.forEach((col, i) => {
        row[col] = args[i];
      });
      return { success: true, changes: 1 };
    };

    const run = (args: unknown[]) => {
      if (/^UPDATE/.test(norm)) return runUpdate(args);
      const table = norm.match(/FROM (\w+)/)![1];
      return self.select(table, norm, args);
    };

    // DDL (the registry schema ensured on every admin call) is accepted and
    // ignored — this stub only models the content tables under test.
    if (/^(CREATE|DROP|PRAGMA)/i.test(norm)) {
      const noop = async () => ({ success: true, results: [] });
      return { _exec: noop, run: noop, all: noop, first: noop, bind: () => ({ _exec: noop, run: noop, all: noop, first: noop }) };
    }

    const bound = {
      _exec: async () => run([]),
      run: async () => run([]),
      all: async () => ({ results: run([]), success: true }),
    };
    void tableName;
    return {
      ...bound,
      bind: (...args: unknown[]) => ({
        _exec: async () => runUpdate(args),
        run: async () => runUpdate(args),
        all: async () => ({ results: run(args), success: true }),
      }),
    };
  }

  batch(stmts: Array<{ _exec?: () => unknown }>) {
    return Promise.all(stmts.map((s) => (s && s._exec ? s._exec() : s)));
  }

  snapshot(table: string) {
    return this.table(table).map((r) => ({ ...r }));
  }
}

const SECRET = 'test-admin-secret';

function adminRequest(path: string, init: RequestInit = {}) {
  return new Request(`https://katzu.test${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}`, ...(init.headers || {}) },
  });
}

async function callRoute(env: { DB: ContentD1; ADMIN_SECRET: string }, path: string, init?: RequestInit) {
  const url = new URL(`https://katzu.test${path}`);
  const res = await handleAdminRoutes(url, adminRequest(path, init), env as never, {});
  if (!res) throw new Error(`route not handled: ${path}`);
  return { status: res.status, body: await res.json() };
}

function seedVocab(db: ContentD1) {
  db.seed('vocabulary', [
    { german: 'einreichen', article: null, translation_ar: 'يقدّم', level: 'B1', topic: 'documents' },
    { german: 'vorlegen', article: null, translation_ar: 'يُبرز / يقدّم', level: 'B2', topic: 'documents' },
    { german: 'Termin', article: 'der', translation_ar: 'موعد', level: 'A1', topic: 'documents' },
  ]);
}

describe('admin content edit route', () => {
  let db: ContentD1;
  let env: { DB: ContentD1; ADMIN_SECRET: string };

  beforeEach(() => {
    db = new ContentD1();
    seedVocab(db);
    env = { DB: db, ADMIN_SECRET: SECRET };
  });

  it('lists rows with their rowid and filters by topic and text', async () => {
    const all = await callRoute(env, '/admin/api/content-list?type=vocabulary');
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(3);
    expect(all.body.rows[0].id).toBe(1);

    const filtered = await callRoute(env, '/admin/api/content-list?type=vocabulary&topic=documents&q=vorlegen');
    expect(filtered.body.count).toBe(1);
    expect(filtered.body.rows[0].german).toBe('vorlegen');
  });

  it('rejects an unknown content type and missing auth', async () => {
    const bad = await callRoute(env, '/admin/api/content-list?type=users');
    expect(bad.status).toBe(400);
    expect(bad.body.allowed).toEqual(['vocabulary', 'starter_phrases']);

    const url = new URL('https://katzu.test/admin/api/content-list?type=vocabulary');
    const unauth = await handleAdminRoutes(url, new Request(url.toString()), env as never, {});
    expect(unauth?.status).toBe(401);
  });

  it('updates a gloss by rowid and returns the re-read row', async () => {
    const res = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({ type: 'vocabulary', updates: [{ id: 1, fields: { translation_ar: 'يقدّم طلباً' } }] }),
    });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(res.body.rows[0]).toMatchObject({ id: 1, german: 'einreichen', translation_ar: 'يقدّم طلباً' });
    // and it is really persisted
    expect(db.snapshot('vocabulary')[0].translation_ar).toBe('يقدّم طلباً');
  });

  it('refuses unknown columns, bad ids and invalid levels without writing', async () => {
    const column = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({ type: 'vocabulary', updates: [{ id: 1, fields: { german: 'x', bogus: 'y' } }] }),
    });
    expect(column.status).toBe(400);
    expect(column.body.error).toBe('invalid_columns');

    const id = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({ type: 'vocabulary', updates: [{ id: 0, fields: { translation_ar: 'x' } }] }),
    });
    expect(id.status).toBe(400);
    expect(id.body.error).toBe('invalid_id');

    const level = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({ type: 'vocabulary', updates: [{ id: 1, fields: { level: 'C1' } }] }),
    });
    expect(level.status).toBe(400);
    expect(level.body.error).toBe('invalid_level');

    const empty = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({ type: 'vocabulary', updates: [] }),
    });
    expect(empty.status).toBe(400);

    expect(db.snapshot('vocabulary')[0].translation_ar).toBe('يقدّم');
  });

  it('edits starter phrases too (level validation shared)', async () => {
    db.seed('starter_phrases', [
      { scenario_id: 'cafe_order', german: 'Ich möchte einen Kaffee, bitte.', translation_ar: 'أريد قهوة من فضلك.', level: 'A1', sort_order: 1 },
    ]);
    const res = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({
        type: 'starter_phrases',
        updates: [{ id: 1, fields: { translation_ar: 'أريد قهوة لو سمحت.' } }],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.body.rows[0].translation_ar).toBe('أريد قهوة لو سمحت.');
    // vocabulary columns are not valid on starter_phrases
    const wrong = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({ type: 'starter_phrases', updates: [{ id: 1, fields: { topic: 'food' } }] }),
    });
    expect(wrong.status).toBe(400);
  });
});
