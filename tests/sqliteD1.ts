import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Real SQLite (built into Node >= 22.13) behind the D1 calls the Worker uses, loaded from the real migrations,
// so quota tests exercise the actual SQL instead of a hand-written imitation of it.
let DatabaseSync: (new (path: string) => any) | undefined;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  throw new Error('tests need Node >= 22.13 (node:sqlite). Run `node -v` and upgrade Node.');
}

export function createSqliteD1() {
  const raw = new DatabaseSync!(':memory:');
  for (const file of ['001_quota.sql', '002_trial.sql']) {
    raw.exec(readFileSync(join(process.cwd(), 'migrations', file), 'utf8'));
  }
  return {
    raw,
    prepare(sql: string) {
      const statement = raw.prepare(sql);
      return {
        bind: (...args: unknown[]) => ({
          run: async () => ({ meta: { changes: Number(statement.run(...args).changes) } }),
          first: async () => statement.get(...args) ?? null,
        }),
      };
    },
  };
}
