/**
 * A strict in-memory D1 double for the affiliate ledger.
 *
 * WHY IT IS SEPARATE FROM `fakeD1.ts`
 * The affiliate module speaks a small, specific SQL dialect: `SELECT *` with a
 * one-column `WHERE`, `INSERT … ON CONFLICT(col) DO NOTHING` on two different
 * conflict columns, `UPDATE … SET col = 'literal', col = ? WHERE id = ?`, and
 * autoincrement ids in both `affiliates` and `commissions`. `fakeD1.ts` models
 * the curriculum tables and silently answers shapes it does not understand,
 * which is exactly how a green fake-only suite hides a broken route. This one
 * throws on every statement it cannot model, so a test can only pass through a
 * path the real database would also accept.
 *
 * WHAT IT IS NOT
 * It is not SQLite. No types, constraints or joins. `ON CONFLICT(col) DO
 * NOTHING` is modelled (that is the "first valid ref wins" and "one commission
 * per order_ref" guarantee); the partial unique index is not, because the route
 * checks for an existing original commission in JS before it inserts.
 */

export type Row = Record<string, unknown>;

const ID_TABLES = new Set(['affiliates', 'commissions']);

/** Splits a SQL list on top-level commas; quoted strings survive intact. */
function splitList(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "'") {
      quote = !quote;
      current += char;
      continue;
    }
    if (char === ',' && !quote) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

class AffiliateStatement {
  constructor(
    private readonly db: AffiliateD1,
    private readonly sql: string,
    private readonly args: unknown[],
  ) {}

  bind(...args: unknown[]): AffiliateStatement {
    return new AffiliateStatement(this.db, this.sql, args);
  }

  async run(): Promise<{ success: true; results: Row[]; changes: number }> {
    const result = this.db.execute(this.sql, this.args);
    return { success: true, ...result };
  }

  async all(): Promise<{ success: true; results: Row[] }> {
    return { success: true, results: this.db.execute(this.sql, this.args).results };
  }

  async first(): Promise<Row | null> {
    return this.db.execute(this.sql, this.args).results[0] ?? null;
  }
}

export class AffiliateD1 {
  private readonly tables = new Map<string, Row[]>();
  private readonly counters = new Map<string, number>();
  private readonly created = new Set<string>();
  private readonly columns = new Map<string, string[]>();
  /** Every statement executed, in order — for "was it even asked?" asserts. */
  readonly log: string[] = [];

  prepare(sql: string): AffiliateStatement {
    return new AffiliateStatement(this, sql.replace(/\s+/g, ' ').trim(), []);
  }

  batch(statements: AffiliateStatement[]): Promise<unknown[]> {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  /** Every row of one table, in insertion order. */
  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])].map((row) => ({ ...row }));
  }

  /** Runs the module's own DDL, so a broken CREATE would still be executed. */
  createAffiliateTables(ddl: string[]): void {
    for (const statement of ddl) this.execute(statement.replace(/\s+/g, ' ').trim(), []);
  }

  /** Seeds a row the way an operator would: through an INSERT, ids included. */
  seed(table: string, row: Row): void {
    this.require(table).push(this.complete(table, { ...row }));
  }

  // -- internals -------------------------------------------------------------

  private require(table: string): Row[] {
    if (!this.created.has(table)) throw new Error(`D1_ERROR: no such table: ${table}`);
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  /**
   * Applies the two things a real table does that a plain object does not: an
   * autoincrement `id` for a row that omits it, and `NULL` for every column the
   * INSERT did not name (SQLite does not return `undefined`).
   */
  private complete(table: string, row: Row): Row {
    if (!ID_TABLES.has(table) || row.id === undefined) {
      const next = (this.counters.get(table) ?? 0) + 1;
      this.counters.set(table, next);
      if (ID_TABLES.has(table)) row = { id: next, ...row };
    } else {
      this.counters.set(table, Math.max(this.counters.get(table) ?? 0, Number(row.id)));
    }
    for (const column of this.columns.get(table) ?? []) {
      if (!(column in row)) row[column] = null;
    }
    return row;
  }

  private value(token: string, args: unknown[], cursor: { i: number }): unknown {
    const trimmed = token.trim();
    if (trimmed === '?') return args[cursor.i++];
    if (/^null$/i.test(trimmed)) return null;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (/^'.*'$/.test(trimmed)) return trimmed.slice(1, -1).replace(/''/g, "'");
    throw new Error(`AffiliateD1: unsupported value token "${trimmed}"`);
  }

  private matches(where: string, row: Row, args: unknown[], cursor: { i: number }): boolean {
    return where.split(/\s+AND\s+/i).every((group) =>
      group.split(/\s+OR\s+/i).some((condition) => {
        const eq = condition.trim().match(/^(\w+)\s*=\s*(\?|'.*')$/);
        if (!eq) throw new Error(`AffiliateD1: unsupported condition "${condition}"`);
        const value = this.value(eq[2], args, cursor);
        return String(row[eq[1]] ?? '') === String(value ?? '');
      }),
    );
  }

  execute(sql: string, args: unknown[]): { results: Row[]; changes: number } {
    this.log.push(sql);

    const created = sql.match(/^CREATE TABLE IF NOT EXISTS (\w+)/i);
    if (created) {
      this.created.add(created[1]);
      if (!this.tables.has(created[1])) this.tables.set(created[1], []);
      const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
      this.columns.set(
        created[1],
        splitList(body)
          .map((definition) => definition.split(/\s+/)[0])
          .filter((name) => !/^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)$/i.test(name)),
      );
      return { results: [], changes: 0 };
    }
    if (/^(CREATE (UNIQUE )?INDEX|PRAGMA|ALTER|DROP|BEGIN|COMMIT)/i.test(sql)) {
      return { results: [], changes: 0 };
    }

    const insert = sql.match(
      /^INSERT INTO (\w+) \(([^)]+)\) VALUES \((.+)\)(?: ON CONFLICT\((\w+)\) (DO NOTHING))?$/i,
    );
    if (insert) {
      const [, table, columns, values, conflictColumn] = insert;
      const rows = this.require(table);
      const names = columns.split(',').map((name) => name.trim());
      const tokens = splitList(values);
      if (tokens.length !== names.length) {
        throw new Error(`AffiliateD1: ${names.length} columns but ${tokens.length} values`);
      }
      const cursor = { i: 0 };
      const row: Row = {};
      names.forEach((name, index) => {
        row[name] = this.value(tokens[index], args, cursor);
      });
      if (conflictColumn) {
        const clash = rows.some(
          (existing) => String(existing[conflictColumn]) === String(row[conflictColumn]),
        );
        if (clash) return { results: [], changes: 0 };
      }
      rows.push(this.complete(table, row));
      return { results: [], changes: 1 };
    }

    const update = sql.match(/^UPDATE (\w+) SET (.+?) WHERE (.+)$/i);
    if (update) {
      const [, table, assignments, where] = update;
      const rows = this.require(table);
      let changes = 0;
      for (const row of rows) {
        const cursor = { i: 0 };
        const parsed = splitList(assignments).map((assignment) => {
          const pair = assignment.match(/^(\w+)\s*=\s*(\?|'.*')$/);
          if (!pair) throw new Error(`AffiliateD1: unsupported assignment "${assignment}"`);
          return { column: pair[1], value: this.value(pair[2], args, cursor) };
        });
        if (!this.matches(where, row, args, cursor)) continue;
        for (const change of parsed) row[change.column] = change.value;
        changes += 1;
      }
      return { results: [], changes };
    }

    const remove = sql.match(/^DELETE FROM (\w+)(?: WHERE (.+))?$/i);
    if (remove) {
      const [, table, where] = remove;
      const rows = this.require(table);
      const keep = where ? rows.filter((row) => !this.matches(where, row, args, { i: 0 })) : [];
      const changes = rows.length - keep.length;
      this.tables.set(table, keep);
      return { results: [], changes };
    }

    const select = sql.match(/^SELECT (.+?) FROM (\w+)(?: WHERE (.+))?$/i);
    if (select) {
      const [, projection, table, where] = select;
      const rows = this.require(table);
      const matched = where ? rows.filter((row) => this.matches(where, row, args, { i: 0 })) : rows;
      if (projection.trim() === '*') return { results: matched.map((row) => ({ ...row })), changes: 0 };
      const columns = projection.split(',').map((column) => column.trim());
      return {
        results: matched.map((row) => {
          const picked: Row = {};
          for (const column of columns) picked[column] = row[column] ?? null;
          return picked;
        }),
        changes: 0,
      };
    }

    throw new Error(`AffiliateD1: unsupported statement "${sql.slice(0, 140)}"`);
  }
}
