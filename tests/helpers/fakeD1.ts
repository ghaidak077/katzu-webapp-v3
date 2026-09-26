/**
 * A small in-memory stand-in for D1.
 *
 * WHY IT EXISTS
 * The Content Studio's routes emit a handful of precise statement shapes
 * (parameterised inserts with `ON CONFLICT … DO UPDATE`, rowid-keyed updates,
 * `IN (…)` deletes, `COUNT(*)`, paginated `ORDER BY … LIMIT … OFFSET`). A stub
 * that silently ignores the parts it does not understand would pass tests the real
 * database would fail, so this one parses every statement it is handed and throws
 * on anything it cannot model — a loud failure instead of a false green.
 *
 * It models exactly what the curriculum tables need: an implicit integer `rowid`
 * per table and plain column values. No types, no constraints, no joins — the
 * point is the route logic, not SQLite.
 */

export type Row = Record<string, unknown>;

interface Stored {
  rowid: number;
  data: Row;
}

export interface FakeResult {
  results: Row[];
  changes: number;
}

/** Splits on a separator that is not inside parentheses. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(") depth++;
    else if (char === ")") depth--;
    if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(current);
      current = "";
      i += separator.length - 1;
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** Strips `ORDER BY …` / `LIMIT …` off the end, leaving `table [WHERE …]`. */
function splitTail(text: string): { body: string; order: string | null; limit: number | null; offset: number } {
  let body = text;
  let limit: number | null = null;
  let offset = 0;
  const limitIndex = body.indexOf(" LIMIT ");
  if (limitIndex !== -1) {
    const clause = body.slice(limitIndex + " LIMIT ".length);
    body = body.slice(0, limitIndex);
    const [limitPart, offsetPart] = clause.split(" OFFSET ");
    limit = Number(limitPart);
    offset = offsetPart === undefined ? 0 : Number(offsetPart);
  }
  let order: string | null = null;
  const orderIndex = body.indexOf(" ORDER BY ");
  if (orderIndex !== -1) {
    order = body.slice(orderIndex + " ORDER BY ".length);
    body = body.slice(0, orderIndex);
  }
  return { body, order, limit, offset };
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a === b) return 0;
  return String(a ?? "") < String(b ?? "") ? -1 : 1;
}

export class FakeD1 {
  private tables: Record<string, Stored[]> = {};
  private counters: Record<string, number> = {};
  /** Every statement this fake was asked to run, for "was it batched?" assertions. */
  readonly log: string[] = [];

  seed(table: string, rows: Row[]): void {
    this.tables[table] = rows.map((data, index) => ({ rowid: index + 1, data: { ...data } }));
    this.counters[table] = rows.length;
  }

  /** Rows as a route would see them, with the implicit rowid exposed as `id`. */
  snapshot(table: string): Row[] {
    return (this.tables[table] ?? []).map((entry) => ({ id: entry.rowid, ...entry.data }));
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql, []);
  }

  batch(statements: FakeStatement[]): Promise<FakeResult[]> {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  // -- internals ------------------------------------------------------------

  private table(name: string): Stored[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  private nextRowId(name: string): number {
    this.counters[name] = (this.counters[name] ?? 0) + 1;
    return this.counters[name];
  }

  private project(projection: string, entry: Stored): Row {
    const normalized = projection.replace(/\s+/g, " ").trim();
    if (normalized === "*") return { ...entry.data };
    if (normalized === "rowid AS id, *") return { id: entry.rowid, ...entry.data };
    if (normalized === "rowid AS id") return { id: entry.rowid };
    if (normalized === "id" || normalized === "id AS id") return { id: entry.data.id ?? entry.rowid };
    throw new Error(`FakeD1: unsupported projection "${projection}"`);
  }

  execute(sql: string, args: unknown[]): FakeResult {
    const statement = sql.replace(/\s+/g, " ").trim();
    this.log.push(statement);
    if (/^(CREATE|PRAGMA|ALTER|DROP)\b/i.test(statement)) return { results: [], changes: 0 };
    if (/^INSERT INTO /i.test(statement)) return this.insert(statement, args);
    if (/^UPDATE /i.test(statement)) return this.update(statement, args);
    if (/^DELETE FROM /i.test(statement)) return this.remove(statement, args);
    if (/^SELECT /i.test(statement)) return this.select(statement, args);
    throw new Error(`FakeD1: unsupported statement "${statement.slice(0, 140)}"`);
  }

  private insert(statement: string, args: unknown[]): FakeResult {
    const match = statement.match(
      /^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]*)\)(?: ON CONFLICT\((\w+)\) DO UPDATE SET (.+))?$/,
    );
    if (!match) throw new Error(`FakeD1: unsupported insert "${statement.slice(0, 160)}"`);
    const [, name, columnList, values, conflictColumn, assignments] = match;
    const columns = columnList.split(",").map((column) => column.trim());
    const bound = values.split(",").map((_, index) => args[index]);
    const target = this.table(name);

    if (conflictColumn) {
      const existing = target.find((entry) => entry.data[conflictColumn] === bound[columns.indexOf(conflictColumn)]);
      if (existing) {
        for (const assignment of splitTopLevel(assignments, ",")) {
          const [left, right] = assignment.split("=").map((part) => part.trim());
          if (!right.startsWith("excluded.")) throw new Error(`FakeD1: unsupported assignment "${assignment}"`);
          existing.data[left] = bound[columns.indexOf(right.slice("excluded.".length))];
        }
        return { results: [], changes: 1 };
      }
    }

    const data: Row = {};
    columns.forEach((column, index) => {
      data[column] = bound[index];
    });
    target.push({ rowid: this.nextRowId(name), data });
    return { results: [], changes: 1 };
  }

  private update(statement: string, args: unknown[]): FakeResult {
    const match = statement.match(/^UPDATE (\w+) SET (.+?) WHERE (\w+) = \?$/);
    if (!match) throw new Error(`FakeD1: unsupported update "${statement.slice(0, 160)}"`);
    const [, name, assignments, whereColumn] = match;
    const sets = splitTopLevel(assignments, ",");
    const wanted = String(args[args.length - 1]);
    let changes = 0;
    for (const entry of this.table(name)) {
      const current = whereColumn === "rowid" ? entry.rowid : entry.data[whereColumn];
      if (String(current) !== wanted) continue;
      sets.forEach((assignment, index) => {
        const [left] = assignment.split("=").map((part) => part.trim());
        entry.data[left] = args[index];
      });
      changes++;
    }
    return { results: [], changes };
  }

  private remove(statement: string, args: unknown[]): FakeResult {
    const match = statement.match(/^DELETE FROM (\w+) WHERE (\w+) IN \(([^)]*)\)$/);
    if (!match) throw new Error(`FakeD1: unsupported delete "${statement.slice(0, 160)}"`);
    const [, name, whereColumn] = match;
    const wanted = new Set(args.map((value) => String(value)));
    const target = this.table(name);
    const kept = target.filter((entry) => {
      const current = whereColumn === "rowid" ? entry.rowid : entry.data[whereColumn];
      return !wanted.has(String(current));
    });
    const changes = target.length - kept.length;
    this.tables[name] = kept;
    return { results: [], changes };
  }

  private select(statement: string, args: unknown[]): FakeResult {
    const afterSelect = statement.slice("SELECT ".length);
    const fromIndex = afterSelect.indexOf(" FROM ");
    if (fromIndex === -1) throw new Error(`FakeD1: unsupported select "${statement.slice(0, 160)}"`);
    const projection = afterSelect.slice(0, fromIndex).trim();

    const { body, order, limit, offset } = splitTail(afterSelect.slice(fromIndex + " FROM ".length));
    const whereIndex = body.indexOf(" WHERE ");
    const name = (whereIndex === -1 ? body : body.slice(0, whereIndex)).trim();
    const where = whereIndex === -1 ? null : body.slice(whereIndex + " WHERE ".length);

    let entries = [...this.table(name)];
    if (where) entries = this.filter(entries, where, args);

    if (projection === "COUNT(*) AS total") return { results: [{ total: entries.length }], changes: 0 };

    if (order) {
      const keys = splitTopLevel(order, ",").map((clause) => {
        const [column, direction] = clause.split(/\s+/);
        return { column, sign: direction === "DESC" ? -1 : 1 };
      });
      entries.sort((left, right) => {
        for (const key of keys) {
          const a = key.column === "rowid" ? left.rowid : left.data[key.column];
          const b = key.column === "rowid" ? right.rowid : right.data[key.column];
          const result = compare(a, b);
          if (result !== 0) return result * key.sign;
        }
        return 0;
      });
    }

    const windowed = limit === null ? entries : entries.slice(offset, offset + limit);
    return { results: windowed.map((entry) => this.project(projection, entry)), changes: 0 };
  }

  private filter(entries: Stored[], where: string, args: unknown[]): Stored[] {
    let cursor = 0;
    let current = entries;
    for (const condition of splitTopLevel(where, " AND ")) {
      const group = condition.match(/^\((.+)\)$/);
      if (group) {
        const tests = group[1].split(/\s+OR\s+/).map((alternative) => {
          const like = alternative.trim().match(/^(\w+) LIKE \?$/);
          if (!like) throw new Error(`FakeD1: unsupported OR branch "${alternative}"`);
          const needle = String(args[cursor++]).replace(/%/g, "");
          return (entry: Stored) => String(entry.data[like[1]] ?? "").includes(needle);
        });
        current = current.filter((entry) => tests.some((test) => test(entry)));
        continue;
      }

      const inList = condition.match(/^(\w+) IN \(([^)]*)\)$/);
      if (inList) {
        const count = inList[2].split(",").length;
        const wanted = new Set(args.slice(cursor, cursor + count).map((value) => String(value)));
        cursor += count;
        const column = inList[1];
        current = current.filter((entry) => wanted.has(String(column === "rowid" ? entry.rowid : entry.data[column])));
        continue;
      }

      const like = condition.match(/^(\w+) LIKE \?$/);
      if (like) {
        const needle = String(args[cursor++]).replace(/%/g, "");
        current = current.filter((entry) => String(entry.data[like[1]] ?? "").includes(needle));
        continue;
      }

      const equal = condition.match(/^(\w+) = \?$/);
      if (equal) {
        const value = String(args[cursor++]);
        const column = equal[1];
        current = current.filter((entry) => String(column === "rowid" ? entry.rowid : entry.data[column]) === value);
        continue;
      }

      throw new Error(`FakeD1: unsupported condition "${condition}"`);
    }
    return current;
  }
}

export class FakeStatement {
  constructor(private db: FakeD1, private sql: string, private args: unknown[]) {}

  bind(...args: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, args);
  }

  async run(): Promise<FakeResult> {
    return this.db.execute(this.sql, this.args);
  }

  async all(): Promise<{ results: Row[]; success: boolean }> {
    return { results: this.db.execute(this.sql, this.args).results, success: true };
  }

  async first(): Promise<Row | null> {
    return this.db.execute(this.sql, this.args).results[0] ?? null;
  }
}
