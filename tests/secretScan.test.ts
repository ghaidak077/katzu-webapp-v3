import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The secret scan, as a test.
 *
 * The properties worth defending are behavioural, not textual: the tool must
 * print file, line and the secret's NAME but never the value, must keep looking
 * past the working tree into history, must treat test fixtures and the one
 * documented public identifier as what they are, and must still exit non-zero if
 * a real secret ever appears.
 */
function run(args: string[] = ['--tree']) {
  const out = execFileSync(process.execPath, ['scripts/scan-secrets.mjs', ...args], { encoding: 'utf8' });
  return out;
}

describe('the secret scan', () => {
  // Each case here spawns node plus one `git grep` per pattern, so it is bounded
  // by machine load rather than by the work it does: the scan takes ~2s alone
  // but the file runs beside 127 other Vitest workers, where the 5s default
  // timed out for load and nothing else. Same reasoning as the bounded history
  // walk below, and the assertions are unchanged.
  const SPAWN_TIMEOUT = 120_000;

  it('reports file, line and NAME — and no value', () => {
    const out = run();
    expect(out).toMatch(/\[secret-scan\] real findings: 0/);
    // The one shape that looks like a secret is reported by name and line only.
    expect(out).toMatch(/wrangler\.toml:\d+: GOOGLE_CLIENT_ID — public OAuth client id/);
    // No long opaque token may appear anywhere in the report.
    expect(out).not.toMatch(/[A-Za-z0-9_-]{32,}/);
  }, SPAWN_TIMEOUT);

  it('walks the history, not only the working tree', () => {
    // The unbounded walk over 199 commits takes minutes, so the test bounds it
    // with `--max-revs`: it still executes the history code path (and fails if
    // that path is deleted), while CI runs the full walk in the secret-scan job.
    const out = run(['--max-revs=25']);
    expect(out).toMatch(/scope: working tree \+ full history/);
    expect(out).toMatch(/real findings: 0/);
  }, 120_000);

  it('separates test fixtures from real findings', () => {
    const out = run();
    expect(out).toMatch(/ignored test fixtures \(shape-matched by design\)/);
    // A fixture is named, not hidden — a reviewer can still see it exists.
    expect(out).toMatch(/tests\/healthPrivacy\.test\.ts:\d+: GEMINI_API_KEYS/);
  }, SPAWN_TIMEOUT);

  it('prints the rotation commands, and never suggests one for a plain var', () => {
    const out = run();
    expect(out).toMatch(/npx wrangler secret put ADMIN_SECRET/);
    expect(out).toMatch(/npx wrangler secret put HMAC_SECRET/);
    // The spend cap is a plain env var, not a credential.
    expect(out).not.toMatch(/secret put AI_DAILY_SPEND_CAP/);
  }, SPAWN_TIMEOUT);

  it('leaves history untouched — a read-only tool by construction', () => {
    const out = run();
    expect(out).toMatch(/rewriting history is the owner's decision/);
    // The script must contain no history-rewriting command at all. Read from disk,
    // not from git: this test runs before the script is ever committed.
    const source = readFileSync('scripts/scan-secrets.mjs', 'utf8');
    for (const forbidden of ['filter-branch', 'filter-repo', 'rebase', 'commit --amend', 'push --force', 'reset --hard']) {
      expect(source).not.toMatch(new RegExp(forbidden.replace(/[-[\]{}()*+?.\\^$|]/g, '\\$&')));
    }
  });
});
