import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DB_SCHEMA } from '../cloudflare-content-schema.js';

/**
 * The invariant V12's failure proved was missing.
 *
 * `handleAdminUpload` builds `INSERT INTO <table> (…)` from the row's own keys, so
 * a column the deployment does not have fails that batch at write time. Every
 * column `DB_SCHEMA` advertises therefore has to be satisfiable in production by
 * one of exactly two things:
 *
 *   1. the DDL the table already has — section 1 of migrations/0001_content_tables.sql,
 *      kept verbatim from `sqlite_master.sql` on the deployed database; or
 *   2. `ADDITIVE_COLUMNS` in cloudflare-content-schema.js, which
 *      `ensureContentColumns` applies on the Worker's first request.
 *
 * On 2026-09-29 the grammar table had neither: section 1 lacked `rule_de`,
 * `rule_ar` and `example_ar`, and the additive list held only
 * `scenarios.banner_url`. The invariant below fails on that combination, which is
 * why it exists.
 */

const MIGRATION_FILE = new URL('../migrations/0001_content_tables.sql', import.meta.url);

/** Splits a column list on commas that are not inside parentheses or quotes. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (const char of list) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** The column names of one `CREATE TABLE <name> (…)` statement in the DDL file. */
function deployedColumns(ddl: string, table: string): string[] {
  const pattern = new RegExp(`CREATE TABLE ${table}\\s*\\(([^;]*)\\);`, 'i');
  const match = ddl.match(pattern);
  if (!match) throw new Error(`migrations/0001_content_tables.sql has no CREATE TABLE for ${table}`);
  return splitTopLevel(match[1])
    .filter((entry) => /^[a-z_][a-z0-9_]*[\s(]/i.test(entry))
    .filter((entry) => !/^(primary|foreign|unique|check|constraint)\b/i.test(entry))
    .map((entry) => entry.split(/[\s(]/)[0].toLowerCase());
}

/** Runs the real ensureContentColumns against a recording D1 and returns its SQL. */
async function recordAdditiveStatements(behaviour: (sql: string) => Error | null = () => null) {
  // A fresh module registry per call: `ensureContentColumns` memoises per isolate,
  // which is correct in a Worker and would hide the statements from a second test.
  vi.resetModules();
  const mod = await import('../cloudflare-content-schema.js');
  const statements: string[] = [];
  const env = {
    DB: {
      prepare(sql: string) {
        return {
          run: async () => {
            statements.push(sql);
            const failure = behaviour(sql);
            if (failure) throw failure;
            return {};
          },
        };
      },
    },
  };
  const ok = await mod.ensureContentColumns(env as never);
  return { ok, statements, mod };
}

const DDL = readFileSync(MIGRATION_FILE, 'utf8');

describe('content schema — every column the studio needs is reachable in production', () => {
  it('DB_SCHEMA is covered by the deployed DDL plus ADDITIVE_COLUMNS (this is the V12 invariant)', async () => {
    const { statements } = await recordAdditiveStatements();
    const additiveByTable: Record<string, string[]> = {};
    for (const sql of statements) {
      const parsed = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/i);
      if (!parsed) throw new Error(`unexpected additive statement: ${sql}`);
      additiveByTable[parsed[1].toLowerCase()] = [
        ...(additiveByTable[parsed[1].toLowerCase()] ?? []),
        parsed[2].toLowerCase(),
      ];
    }

    const uncovered: string[] = [];
    for (const [type, meta] of Object.entries(DB_SCHEMA)) {
      const deployed = new Set(deployedColumns(DDL, meta.table));
      const additive = new Set(additiveByTable[meta.table] ?? []);
      for (const column of meta.columns) {
        const name = column.name.toLowerCase();
        if (!deployed.has(name) && !additive.has(name)) uncovered.push(`${meta.table}.${name} (type ${type})`);
      }
    }

    expect(uncovered).toEqual([]);
  });

  it('names the three grammar columns V12 was missing, and only those', async () => {
    const { statements } = await recordAdditiveStatements();
    expect(statements).toContain('ALTER TABLE grammar ADD COLUMN rule_de TEXT');
    expect(statements).toContain('ALTER TABLE grammar ADD COLUMN rule_ar TEXT');
    expect(statements).toContain('ALTER TABLE grammar ADD COLUMN example_ar TEXT');

    const deployed = new Set(deployedColumns(DDL, 'grammar'));
    const needed = DB_SCHEMA.grammar.columns.map((column) => column.name.toLowerCase());
    expect(needed.filter((name) => !deployed.has(name)).sort()).toEqual(['example_ar', 'rule_ar', 'rule_de']);
  });

  it('reads the four content tables out of the DDL, legacy grammar columns included', () => {
    expect(deployedColumns(DDL, 'grammar')).toEqual([
      'id',
      'level',
      'title_ar',
      'title_en',
      'explanation_ar',
      'explanation_en',
      'example_de',
    ]);
    expect(deployedColumns(DDL, 'scenarios')).toContain('banner_url');
    expect(deployedColumns(DDL, 'starter_phrases')).toContain('scenario_id');
    expect(deployedColumns(DDL, 'vocabulary')).toContain('topic');
  });

  it('records the one deliberate overlap — banner_url is deployed and listed additively', async () => {
    const { statements } = await recordAdditiveStatements();
    // Keyed by table.column: `example_ar` exists on both `vocabulary` and
    // `grammar`, so a name-only set would report a false overlap.
    const additive = new Set(
      statements.map((sql) => {
        const parsed = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/i);
        return parsed ? `${parsed[1].toLowerCase()}.${parsed[2].toLowerCase()}` : null;
      }),
    );
    // An overlap is harmless: the additive statement is idempotent, because SQLite
    // answers "duplicate column name" for a column that already exists and the
    // ensure loop treats that as its steady state. A column in *neither* place is
    // the V12 bug, which the coverage test above owns. This asserts the known set
    // so a future edit has to notice it instead of inheriting it.
    const overlap: string[] = [];
    for (const [, meta] of Object.entries(DB_SCHEMA)) {
      const deployed = new Set(deployedColumns(DDL, meta.table));
      for (const column of meta.columns) {
        if (deployed.has(column.name.toLowerCase()) && additive.has(`${meta.table}.${column.name.toLowerCase()}`)) {
          overlap.push(`${meta.table}.${column.name}`);
        }
      }
    }
    expect(overlap).toEqual(['scenarios.banner_url']);
  });
});

describe('content schema — ensureContentColumns behaviour', () => {
  it('issues one ALTER per additive entry and reports success', async () => {
    const { ok, statements } = await recordAdditiveStatements();
    expect(ok).toBe(true);
    expect(statements).toEqual([
      'ALTER TABLE scenarios ADD COLUMN banner_url TEXT',
      'ALTER TABLE grammar ADD COLUMN rule_de TEXT',
      'ALTER TABLE grammar ADD COLUMN rule_ar TEXT',
      'ALTER TABLE grammar ADD COLUMN example_ar TEXT',
    ]);
  });

  it('treats "duplicate column name" as the steady state, not a failure', async () => {
    const { ok } = await recordAdditiveStatements(() => new Error('D1_ERROR: duplicate column name: rule_de'));
    expect(ok).toBe(true);
  });

  it('reports a genuine driver failure so a schema it cannot write is not silent', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ok, statements } = await recordAdditiveStatements((sql) =>
      sql.includes('grammar') ? new Error('D1_ERROR: database is locked') : null,
    );
    expect(ok).toBe(false);
    expect(statements).toHaveLength(4);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('does nothing without a D1 binding', async () => {
    vi.resetModules();
    const mod = await import('../cloudflare-content-schema.js');
    await expect(mod.ensureContentColumns({} as never)).resolves.toBe(false);
  });
});
