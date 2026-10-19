import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A tool nobody can reach is a tool nobody uses — and the one an agent rebuilds by accident.
 *
 * WHY THIS EXISTS
 * On 2026-10-15 an agent needed screenshots, found no *script* named for them, and wrote a new one while
 * four rigs sat in `e2e/shots/` (see `docs/agent/AUDIT-AGENT-BLOAT-2026-10-15.md`). `ENV-FACTS.md` §C now
 * indexes the job → command, and this test is what keeps that index complete, so the fix cannot quietly
 * decay back into the state it was written for.
 *
 * A script is REACHABLE when at least one of these holds:
 *   - an `npm run` script in package.json names it;
 *   - `docs/agent/ENV-FACTS.md` names it (the task index an agent reads before choosing a tool);
 *   - `ALLOWLIST` below names it with the reason it is deliberately not agent-facing.
 * Anything else is either dead or undocumented; both are traps for the next run.
 */

const root = join(__dirname, '..');
const env = readFileSync(join(root, 'docs/agent/ENV-FACTS.md'), 'utf8');
const gateConfig = readFileSync(join(root, 'playwright.config.ts'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
const npmText = Object.values(pkg.scripts ?? {}).join('\n');

/**
 * Deliberately not in the agent-facing index, because running them is not an agent's call: two are
 * one-off tools with side effects, three need a real provider secret (`AGENTS.md` §3 forbids an agent
 * using one). Each keeps its reason here, and the second test fails if an entry goes stale.
 */
const ALLOWLIST: Record<string, string> = {
  'scripts/fix-quiz-content.mjs': 'one-off content fixer that rewrites quiz rows; run by hand, reviewed before use',
  'scripts/backfill-user-registry.mjs': 'one-off migration that writes production D1; owner present, never in a loop',
  'scripts/verify-admin-live.mjs': 'live admin check that needs ADMIN_SECRET — §3 forbids an agent running it',
  'scripts/verify-crypto-live.mjs': 'live payment-provider check that needs a real key — owner-only (§3)',
  'scripts/verify-stt-live.mjs': 'live speech-provider check that needs a real key — owner-only (§3)',
};

const scriptFiles = readdirSync(join(root, 'scripts'))
  .filter((name) => /\.(mjs|cjs)$/.test(name))
  .map((name) => `scripts/${name}`)
  .sort();

const walk = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  );

/**
 * Every Playwright config, wherever it lives: the rigs sit next to `e2e/`, the perf probe has its own
 * directory, and one is named `playwright.perf.config.ts` — not `*.playwright.config.ts`. Missing one is
 * how a spec ends up looking unreachable when it is not (found by this test on 2026-10-15: five configs,
 * one of them for a spec nobody had mentioned).
 */
const specFiles = walk('e2e').filter((file) => file.endsWith('.spec.ts')).sort();
const configText = walk('e2e')
  .filter((file) => /config\.ts$/.test(file))
  .map((file) => readFileSync(join(root, file), 'utf8'))
  .join('\n');

describe('every tool is reachable', () => {
  it('no script is orphaned: it is runnable, indexed, or allowlisted with a reason', () => {
    const orphans = scriptFiles.filter(
      (file) => !npmText.includes(file) && !env.includes(file) && !(file in ALLOWLIST),
    );
    expect(
      orphans,
      `these scripts are reachable from nowhere. Register each in the ENV-FACTS §C index (the job → command table), or allowlist it with a reason:\n${orphans.join('\n')}`,
    ).toEqual([]);
  });

  it('every allowlist entry still exists and still explains itself', () => {
    for (const [file, reason] of Object.entries(ALLOWLIST)) {
      expect(statSync(join(root, file)).isFile(), `${file} is allowlisted but no longer exists`).toBe(true);
      expect(reason.length, `${file} needs a reason, not a placeholder`).toBeGreaterThan(20);
    }
  });

  it('no browser spec is orphaned either: the gate runs it, or a rig config names it', () => {
    const orphans = specFiles.filter((file) => {
      const name = file.split('/').pop() ?? file;
      const stem = name.replace(/\.spec\.ts$/, '');
      // playwright.config.ts has testDir './e2e', so a spec directly in e2e/ runs in the gate.
      const inGate = /^e2e\/[^/]+\.spec\.ts$/.test(file);
      // Configs write `testMatch: /name\.spec\.ts/`, so compare the stem: the escaped dot would never
      // match the filename as a literal string.
      const named = configText.includes(stem) || gateConfig.includes(stem) || env.includes(stem);
      return !inGate && !named;
    });
    expect(
      orphans,
      `these specs live in a subdirectory no config collects and nothing names — they would never run. Give each a rig config (see e2e/uiPolishShots.playwright.config.ts) or name it in ENV-FACTS §C:\n${orphans.join('\n')}`,
    ).toEqual([]);
  });
});
