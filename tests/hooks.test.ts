import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOOK_FILES, HOOKS_DIR, decide } from '../scripts/install-hooks.mjs';
import { E2E_STEP, FAST_STEPS, GUARD_FILTERS, CI_ONLY_STEPS, STEPS, plan } from '../scripts/verify.mjs';

/**
 * A gate with no trigger is a document — and this file is what keeps the trigger real.
 *
 * WHY THIS EXISTS
 * `npm run verify` was built on 2026-10-15 and **nothing called it**: there was no hook at all (only
 * the sample files git ships in `.git/hooks`) and CI ran its own hand-written steps, which
 * syntax-checked 1 file where the gate checks 45. So a commit could carry a broken `scripts/*.mjs` and
 * nothing noticed until a deploy. Documenting "run the gate" changes nothing; a hook that runs it, and
 * a test that fails when the hook stops running it, does.
 *
 * The three claims checked here:
 *   1. the hooks exist, are runnable, and run the right *profile* (fast on commit, whole gate on push);
 *   2. the profiles are the same plan data `verify.mjs` executes — not a second copy of the command;
 *   3. this clone actually has them installed (`git config core.hooksPath`), so the wiring is not just
 *      committed files nobody activated.
 */

const root = join(__dirname, '..');
const hookPath = (name: string) => join(root, HOOKS_DIR, name);
const hook = (name: string) => readFileSync(hookPath(name), 'utf8');
/** Shell lines only: the hooks explain themselves in comments that name commands they do not run. */
const commands = (source: string) =>
  source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };

describe('the gate has a trigger', () => {
  it('ships a pre-commit and a pre-push hook, both non-empty and runnable', () => {
    for (const name of HOOK_FILES) {
      expect(existsSync(hookPath(name)), `${HOOKS_DIR}/${name} is missing`).toBe(true);
      expect(statSync(hookPath(name)).size, `${HOOKS_DIR}/${name} is empty`).toBeGreaterThan(200);
      const source = hook(name);
      expect(source.startsWith('#!/bin/sh'), `${name} needs a POSIX shebang`).toBe(true);
      expect(source, `${name} must stop on the first failure`).toMatch(/^set -e$/m);
      expect(source, `${name} must enter the repo root first`).toMatch(/git rev-parse --show-toplevel/);
      if (process.platform !== 'win32') {
        expect(statSync(hookPath(name)).mode & 0o111, `${name} is not executable`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps CRLF out of the hooks: a CR in the shebang is a bad interpreter everywhere but Git for Windows', () => {
    for (const name of HOOK_FILES) {
      expect(hook(name).includes('\r'), `${HOOKS_DIR}/${name} has CRLF line endings`).toBe(false);
    }
    expect(readFileSync(join(root, '.gitattributes'), 'utf8')).toMatch(new RegExp(`\\${HOOKS_DIR}/\\* text eol=lf`));
  });

  it('never swallows a failure in a hook — a hook that cannot go red is decoration', () => {
    for (const name of HOOK_FILES) {
      const lines = commands(hook(name));
      expect(lines.filter((line) => /\|\|\s*true|exit 0|--no-verify/.test(line)), `${name} swallows a failure`).toEqual([]);
    }
  });

  it('runs the fast profile on commit and the whole gate on push', () => {
    expect(commands(hook('pre-commit')).join('\n')).toMatch(/npm run --silent verify -- --fast/);
    const push = commands(hook('pre-push')).join('\n');
    expect(push).toMatch(/npm run --silent verify -- --cost/);
    // The slow suite must not be in either hook's critical path, or the hook gets bypassed by habit.
    for (const name of HOOK_FILES) {
      expect(commands(hook(name)).join('\n'), `${name} runs the browser suite`).not.toMatch(/playwright/);
    }
  });

  it('this clone is actually wired, not just carrying the files', () => {
    // CI gets a throwaway checkout where hooks are meaningless; a working clone must be wired.
    if (process.env.CI) return;
    let configured = '';
    try {
      configured = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8' }).trim();
    } catch {
      configured = '';
    }
    expect(
      configured,
      'the hooks are committed but not installed in this clone — the gate has no trigger here. Run `npm run hooks:install`.',
    ).toBe(HOOKS_DIR);
  });
});

describe('the profiles are the same plan the gate executes', () => {
  it('is wired up as npm scripts that resolve to files on disk', () => {
    for (const [script, file] of [
      ['verify', 'scripts/verify.mjs'],
      ['verify:ci', 'scripts/verify.mjs'],
      ['cost:report', 'scripts/verify-cost.mjs'],
      ['hooks:install', 'scripts/install-hooks.mjs'],
      ['prepare', 'scripts/install-hooks.mjs'],
    ]) {
      expect(pkg.scripts?.[script], `package.json lost the ${script} script`).toContain(file);
      expect(existsSync(join(root, file)), `${file} does not exist`).toBe(true);
    }
  });

  it('installs itself on `npm install` so a fresh clone is never unwired', () => {
    expect(pkg.scripts?.prepare).toContain('install-hooks');
  });

  it('names guard files that exist, one file per filter', () => {
    const files = readdirSync(join(root, 'tests')).filter((name) => name.endsWith('.test.ts'));
    for (const filter of GUARD_FILTERS) {
      const matches = files.filter((name) => name.includes(filter));
      expect(matches.length, `the fast profile filter "${filter}" matches ${matches.length} test files (expected 1)`).toBe(1);
    }
  });

  it('keeps --fast cheaper than the local gate, and --ci a superset of it', () => {
    const fast = plan(['--fast']);
    const local = plan([]);
    const ci = plan(['--ci']);

    expect(fast.steps).toEqual(FAST_STEPS);
    expect(local.steps).toEqual(STEPS);
    expect(ci.steps).toEqual([...STEPS, ...CI_ONLY_STEPS]);
    expect(ci.steps.length).toBeGreaterThan(local.steps.length);
    // The fast profile is a different, cheaper list — not a prefix of the gate. What makes it safe is
    // that its guards also run inside `npm test`, which is the local gate's own step.
    expect(local.steps.map((step) => step.name)).toContain('unit suite + guards');
    expect(fast.steps.map((step) => step.name)).not.toContain('unit suite + guards');
    expect(fast.steps.flatMap((step) => step.args).join(' '), 'the fast profile must not typecheck').not.toMatch(/tsc/);
  });

  it('adds the browser suite only where it is asked for, and says what it skipped', () => {
    expect(plan([]).steps).not.toContain(E2E_STEP);
    expect(plan(['--ci']).steps).not.toContain(E2E_STEP);
    expect(plan(['--e2e']).steps).toContain(E2E_STEP);
    // `--fast` is the pre-commit profile: adding a five-minute suite to it is what makes hooks get skipped.
    expect(plan(['--fast', '--e2e']).steps).not.toContain(E2E_STEP);
    expect(plan(['--fast', '--e2e']).notRun).toMatch(/--e2e was ignored/);

    // Every profile but the full one admits what it did not run, so a report cannot imply coverage.
    expect(plan([]).notRun).toMatch(/browser suite/);
    expect(plan(['--fast']).notRun).toMatch(/unit suite/);
    expect(plan(['--e2e']).notRun).not.toMatch(/browser suite/);
    // Only the two flags together cover everything this script knows how to run.
    expect(plan(['--ci', '--e2e']).notRun).toBe('nothing');
  });
});

describe('install-hooks decides without guessing', () => {
  const base = { gitRepo: true, ci: false, hooksPath: '', hooksDirExists: true };

  it('sets a repo-local hooksPath when there is none', () => {
    const decision = decide(base);
    expect(decision.action).toBe('set');
    expect(decision.message).toMatch(/core\.hooksPath/);
    expect(decision.message).toMatch(/git config --unset core\.hooksPath/);
  });

  it('is idempotent', () => {
    expect(decide({ ...base, hooksPath: HOOKS_DIR }).action).toBe('already');
  });

  it('refuses to overwrite another tool\u2019s hooks', () => {
    const decision = decide({ ...base, hooksPath: '.husky' });
    expect(decision.action).toBe('conflict');
    expect(decision.message).toMatch(/\.husky/);
  });

  it('does nothing outside a repo, in CI, or when the hooks directory is absent', () => {
    expect(decide({ ...base, gitRepo: false }).action).toBe('skip');
    expect(decide({ ...base, ci: true }).action).toBe('skip');
    expect(decide({ ...base, hooksDirExists: false }).action).toBe('fail');
  });
});
