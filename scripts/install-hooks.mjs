#!/usr/bin/env node
/**
 * Point this clone's hooks at `.githooks/` — the trigger the gate never had.
 *
 * WHY THIS EXISTS
 * `npm run verify` was built on 2026-10-15 and **nothing called it**. There was no hook at all (no
 * `.husky`, no non-sample `.git/hooks`) and CI ran its own hand-written steps, which syntax-checked
 * 1 file where the gate checks 45. A rule with no trigger is a document; the gate had become one.
 *
 * WHAT IT DOES
 * `git config core.hooksPath .githooks` — repository-local, reversible with `git config --unset
 * core.hooksPath`, no global state touched. It runs from `npm install`/`npm ci` (`prepare`) and can be
 * run by hand as `npm run hooks:install`. It refuses to overwrite a `core.hooksPath` that already
 * points somewhere else: another tool's hooks are not this script's to discard.
 *
 * WHY NOT `.husky`
 * That would be a second tool for a job git already does, and `AGENTS.md` §3 forbids a new runtime
 * dependency for something the stack can do.
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const HOOKS_DIR = '.githooks';
export const HOOK_FILES = ['pre-commit', 'pre-push'];

/**
 * Pure decision, so the branches are testable without touching a real repository — the four ways this
 * can go (set it, it is already set, someone else owns it, there is nothing to install into) are the
 * whole behavior, and a script whose behavior is only exercised by running it is a script nobody tests.
 */
export function decide({ gitRepo, ci, hooksPath, hooksDirExists }) {
  if (!gitRepo) return { action: 'skip', message: 'not inside a git repository — nothing to install into' };
  if (ci) return { action: 'skip', message: 'CI=true — a throwaway checkout has no use for hooks' };
  if (!hooksDirExists) {
    return { action: 'fail', message: `${HOOKS_DIR}/ does not exist in this checkout — the hooks cannot be installed` };
  }
  if (hooksPath === HOOKS_DIR) return { action: 'already', message: `core.hooksPath is already ${HOOKS_DIR}` };
  if (hooksPath) {
    return {
      action: 'conflict',
      message: `core.hooksPath is already set to "${hooksPath}"; leaving it alone. Run \`git config core.hooksPath ${HOOKS_DIR}\` to move it here (this script will not overwrite another tool's hooks).`,
    };
  }
  return { action: 'set', message: `core.hooksPath → ${HOOKS_DIR} (repo-local; undo with \`git config --unset core.hooksPath\`)` };
}

function gitConfig(key) {
  try {
    return execFileSync('git', ['config', '--get', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function isGitRepo() {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

export function main() {
  const root = process.cwd();
  const hooksPath = gitConfig('core.hooksPath');
  const decision = decide({
    gitRepo: isGitRepo(),
    ci: Boolean(process.env.CI),
    hooksPath,
    hooksDirExists: existsSync(join(root, HOOKS_DIR)),
  });

  if (decision.action === 'fail') {
    console.error(`hooks:install — ${decision.message}`);
    return 1;
  }
  if (decision.action !== 'set') {
    console.log(`hooks:install — ${decision.message}`);
    return 0;
  }

  execFileSync('git', ['config', 'core.hooksPath', HOOKS_DIR], { cwd: root });
  // On POSIX the executable bit is what makes a hook runnable; Git for Windows honors the shebang and
  // the mode is ignored there, so this is best-effort and never a failure.
  for (const file of HOOK_FILES) {
    const path = join(root, HOOKS_DIR, file);
    if (!existsSync(path) || !statSync(path).isFile()) {
      console.error(`hooks:install — ${HOOKS_DIR}/${file} is missing; core.hooksPath points at an incomplete hook set`);
      return 1;
    }
    try {
      chmodSync(path, 0o755);
    } catch {
      /* Windows: mode is cosmetic, git runs the hook from its shebang line. */
    }
  }
  console.log(`hooks:install — ${decision.message}`);
  console.log('  pre-commit: the fast guards (`npm run verify -- --fast`); pre-push: the whole gate.');
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) process.exit(main());
