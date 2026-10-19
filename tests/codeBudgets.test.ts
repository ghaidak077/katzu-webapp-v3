import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Size budgets for the code itself, the way `tests/agentDocs.test.ts` has them for the docs.
 *
 * WHY THIS EXISTS
 * The orientation documents were unbounded and grew until no run could read them (a 444 KB ledger on
 * 2026-10-15) — the docs now have caps. Source files fail the same way, only slower and with tests
 * attached: every long file is a place where a cheaper model edits the wrong branch of a 60-line
 * conditional. These limits are the ceiling that is real today (measured when they were added), so growth
 * becomes a stated decision in a commit rather than drift.
 *
 * WHEN A BUDGET IS HIT, SPLIT — do not raise it. The biggest offender when these were written is
 * `src/lib/api/workerClient.ts` at ~1,777 lines; it already has seams (transport + retry, auth/session,
 * entitlements, sync) and each is a candidate module. Raising a number here without doing that work is
 * exactly the failure this file exists to prevent.
 */
const root = join(__dirname, '..');

const walk = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  );

const lineCount = (file: string): number => readFileSync(join(root, file), 'utf8').split('\n').length;

const BUDGETS: Array<{ name: string; match: (file: string) => boolean; limit: number; files: string[] }> = [
  { name: 'app source (src/**)', match: (file) => /^src\/.*\.tsx?$/.test(file), limit: 1900, files: walk('src') },
  { name: 'unit tests (tests/**)', match: (file) => /^tests\/.*\.ts$/.test(file), limit: 1000, files: walk('tests') },
  { name: 'browser specs (e2e/**)', match: (file) => /^e2e\/.*\.spec\.ts$/.test(file), limit: 500, files: walk('e2e') },
  { name: 'scripts (scripts/*)', match: (file) => /^scripts\/.*\.(mjs|cjs)$/.test(file), limit: 500, files: walk('scripts') },
];

describe('source files stay within a readable size', () => {
  for (const budget of BUDGETS) {
    it(`${budget.name} stays under ${budget.limit} lines`, () => {
      const measured = budget.files
        .filter(budget.match)
        .map((file) => ({ file, lines: lineCount(file) }))
        .sort((a, b) => b.lines - a.lines);
      expect(measured.length, `no files matched ${budget.name} — the pattern is stale`).toBeGreaterThan(0);
      const over = measured.filter((entry) => entry.lines > budget.limit);
      const biggest = measured.slice(0, 3).map((entry) => `${entry.file} ${entry.lines}`).join(' · ');
      expect(
        over.map((entry) => `${entry.file} is ${entry.lines} lines`),
        `${budget.name} crossed ${budget.limit} lines. Split the file rather than raising the budget (largest now: ${biggest}).`,
      ).toEqual([]);
    });
  }
});
