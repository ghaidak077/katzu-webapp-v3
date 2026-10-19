#!/usr/bin/env node
/**
 * The whole pre-report gate in one command. `npm run verify`.
 *
 * WHY THIS EXISTS
 * `AGENTS.md` §5 lists the tiers (T0 after an edit, T1 after an item, T2 before "done") as a description
 * of what to run — which meant every run had to remember a list, choose a subset, and report a verdict it
 * assembled by hand. A list you reconstruct is a list you shorten when the clock is short. This is the
 * list as code: one command, real exit statuses, and a summary that says what actually ran.
 *
 * WHO TRIGGERS IT (a gate nobody runs is a document — the whole reason this file exists)
 *   .githooks/pre-commit   → `--fast`  (structural guards + syntax; seconds)
 *   .githooks/pre-push     → default  (the gate below, with `--cost`)
 *   CI `.github/workflows/ci.yml` → `--ci` (this list + the extras CI needs)
 *   docs/agent/DEPLOY.md   → `--e2e`   (before a deploy, which is when the suite matters most)
 *
 * WHAT IT RUNS (in this order, by default)
 *   types: app        npx tsc --noEmit
 *   types: e2e        npm run test:e2e:types
 *   unit + guards     npm test            (includes the doc budgets, index and registration guards)
 *   syntax            node --check on every cloudflare-*.js and scripts/*.mjs|*.cjs
 *   design audit      npm run design:audit
 *   contrast          npm run design:contrast
 * `--ci` appends `CI_ONLY_STEPS`: the production build, the content audits and the dependency audit.
 * Those were hand-written CI steps, which is how CI came to syntax-check 1 file where this script
 * checks 45; CI now runs *this command*, so a step added here cannot be forgotten there.
 *
 * NOT RUN BY DEFAULT: the Playwright suite. It is the slowest step and needs a built bundle, so it is
 * explicit — `npm run verify -- --e2e` (builds `dist` and runs the suite against it, which is what the
 * shipped artifact actually is). Nothing here deploys, writes production data, or needs a secret.
 * `--cost` records the run's seconds to the gitignored `.verify-runs.ndjson` (`npm run cost:report`).
 *
 * USAGE
 *   npm run verify            # ~1-2 min: everything a local change must pass
 *   npm run verify -- --fast  # seconds: the structural guards only (what pre-commit runs)
 *   npm run verify -- --ci    # what CI runs: the local gate + build + content + dependency audits
 *   npm run verify -- --e2e   # + the browser suite against the production bundle
 *   npm run verify -- --cost  # any of the above, recorded for `npm run cost:report`
 */

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { recordRun } from './verify-cost.mjs';

const ROOT = process.cwd();

/** The steps, as data: `tests/verifyScript.test.ts` resolves every one of them, so a rename cannot rot. */
export const STEPS = [
  { name: 'types: app', cmd: 'npx', args: ['tsc', '--noEmit'] },
  { name: 'types: e2e specs', cmd: 'npm', args: ['run', 'test:e2e:types'] },
  { name: 'unit suite + guards', cmd: 'npm', args: ['test'] },
  { name: 'design audit', cmd: 'npm', args: ['run', 'design:audit'] },
  { name: 'contrast', cmd: 'npm', args: ['run', 'design:contrast'] },
];

/** The optional, slow step: the suite that runs against the bundle the learner actually gets. */
export const E2E_STEP = {
  name: 'browser suite (shipped bundle)',
  cmd: 'npx',
  args: ['playwright', 'test', '--reporter=line'],
  env: { E2E_TARGET: 'preview' },
};

/**
 * The `--fast` profile: the structural guards, by name, plus the syntax pass.
 *
 * Stems rather than paths on purpose — vitest takes positional *filters*, and a full path is a
 * substring match that breaks on Windows separators. `tests/hooks.test.ts` proves each stem still
 * matches exactly one file, so a rename cannot silently make this profile run nothing.
 */
export const GUARD_FILTERS = ['agentDocs', 'codeBudgets', 'registrations', 'verifyScript', 'ciWorkflow', 'hooks'];

export const FAST_STEPS = [
  { name: 'structural guards', cmd: 'npx', args: ['vitest', 'run', '--reporter=dot', ...GUARD_FILTERS] },
];

/**
 * What CI needs beyond the local core. Until 2026-10-15 these were six hand-written `ci.yml` steps and
 * this script did not know they existed; now CI runs `npm run verify -- --ci`, so the list is here, in
 * one place, and a local run can reproduce CI exactly (`npm run verify -- --ci`).
 */
export const CI_ONLY_STEPS = [
  { name: 'production build', cmd: 'npm', args: ['run', 'build'] },
  { name: 'curriculum audit', cmd: 'node', args: ['scripts/audit-curriculum.mjs'] },
  { name: 'quiz content audit', cmd: 'node', args: ['scripts/audit-quiz-content.mjs'] },
  { name: 'chat quality eval', cmd: 'node', args: ['scripts/eval-chat-quality.mjs'] },
  { name: 'turn cost probe', cmd: 'node', args: ['scripts/measure-turn-cost.mjs'] },
  { name: 'simplicity budget', cmd: 'node', args: ['scripts/simplicity-check.mjs'] },
  { name: 'dependency audit', cmd: 'npm', args: ['audit', '--omit=dev', '--audit-level=high'] },
];

/**
 * The plan as data, so `tests/verifyScript.test.ts` can assert what each profile does *without running
 * it* — including the honest part: what it did not run.
 */
export function plan(argv = []) {
  const fast = argv.includes('--fast');
  const ci = argv.includes('--ci');
  const e2eRequested = argv.includes('--e2e');
  // `--fast` is the pre-commit profile: nothing slow may join it, or the hook gets bypassed by habit.
  const e2e = e2eRequested && !fast;
  const cost = argv.includes('--cost');

  const steps = fast ? [...FAST_STEPS] : ci ? [...STEPS, ...CI_ONLY_STEPS] : [...STEPS];
  if (e2e) steps.push(E2E_STEP);

  const notRun = [];
  if (fast) notRun.push('typechecks, unit suite (the guards above are part of it), design audit, contrast');
  if (!ci && !fast) notRun.push('production build + content audits + dependency audit (CI: `npm run verify -- --ci`)');
  if (fast && e2eRequested) notRun.push('--e2e was ignored: --fast is the pre-commit profile');
  else if (!e2e) notRun.push('browser suite (`npm run verify -- --e2e`, required by docs/agent/DEPLOY.md)');

  return { label: fast ? 'fast' : ci ? 'ci' : 'local', fast, ci, e2e, cost, steps, notRun: notRun.join(' · ') || 'nothing' };
}

/** Worker modules and scripts, so a syntax error cannot reach a deploy or a run. */
export function syntaxTargets() {
  const workers = readdirSync(ROOT).filter((name) => /^cloudflare-.*\.js$/.test(name));
  const scripts = readdirSync(join(ROOT, 'scripts'))
    .filter((name) => /\.(mjs|cjs)$/.test(name))
    .map((name) => `scripts/${name}`);
  return [...workers, ...scripts].sort();
}

/**
 * How much output a step may produce before the runner itself kills it.
 *
 * NOT the 1 MB `spawnSync` default. `scripts/audit-quiz-content.mjs` printed **1,270,067 bytes** (18,978
 * lines) on the 2026-10-15 tree, so at the default the child died with `ENOBUFS` — `status: null`, no
 * exit code — and the gate reported a step FAIL that in fact exited 0. Measured in the first `--ci` run;
 * a gate that invents failures is a gate people stop reading.
 */
export const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export const runStep = (cmd, args, env, { shell = process.platform === 'win32' } = {}) => {
  const started = Date.now();
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    // `npm` and `npx` are `.cmd` shims on Windows, so those steps need a shell. `process.execPath` does
    // NOT: with a shell, Node's own path (`C:\Program Files\nodejs\node.exe`) is split on the space and
    // every `--check` answers "'C:\Program' is not recognized" — measured 2026-10-15, which is why the
    // syntax step passes `shell: false` explicitly.
    shell,
  });
  // A `result.error` is the runner's problem, not the step's (ENOBUFS, ENOENT, a killed child). It is
  // printed with its code so the next reader diagnoses the runner instead of the product.
  const runnerError = result.error ? `[runner] ${result.error.code ?? 'error'}: ${result.error.message}\n` : '';
  return {
    ok: result.status === 0,
    status: result.status,
    seconds: (Date.now() - started) / 1000,
    output: `${runnerError}${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
};

const tail = (text, lines = 40) =>
  text.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-lines).join('\n');

/**
 * Heuristic: classify a step's output as potentially flaky.
 * A step that exits 0 but has noisy output without a clear error
 * pattern is flagged as flaky — it may pass on re-run.
 * A step that exits non-zero with a short error is a hard failure.
 */
export function isFlaky(status, output) {
  // If the step exited non-zero, check for flaky patterns first
  if (status !== 0) {
    const lines = (output || '').split(/\r?\n/).filter((l) => l.trim());
    // Check for known non-determinism patterns even on non-zero exits
    const flakyPatterns = [/element.*not.*found/i, /timed out/i, /timeout/i, /retry/i, /intermittent/i];
    if (flakyPatterns.some((p) => (output || '').match(p))) return true;
    // Short error with no flaky patterns → hard failure
    if (lines.length <= 5 && /Error|fail|fail/i.test(output)) {
      return false; // hard failure
    }
    // Non-zero exit with lots of output could still be flaky if it's a timeout / resource issue
    if (lines.length > 20) return true;
    return false; // other non-zero is a hard failure
  }
  // If the step exited 0, check for flaky patterns:
  // 1. Lots of output but no clear error → likely noisy but passing
  const lines = (output || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length > 50) {
    // Check if there are any real errors mixed in
    const hasRealError = lines.some((l) => /^Error:/m.test(l) || /Exception:/m.test(l));
    if (!hasRealError) return true; // noisy pass → flaky
  }
  // 2. Contains known non-determinism patterns
  const flakyPatterns = [/element.*not.*found/i, /timed out/i, /timeout/i, /retry/i, /intermittent/i];
  if (flakyPatterns.some((p) => (output || '').match(p))) return true;
  return false;
}

export function main(argv = process.argv.slice(2)) {
  const planned = plan(argv);
  const { steps } = planned;
  const started = Date.now();

  console.log(`KATZU VERIFY — profile ${planned.label.toUpperCase()} — ${steps.length + 1} steps`);
  console.log(`  not run: ${planned.notRun}`);
  console.log('  never: deploy, production writes, secrets\n');

  const failures = [];
  const results = [];

  for (const step of steps) {
    const result = runStep(step.cmd, step.args, step.env);
    const stepFlaky = step.flaky ?? false;
    const flaky = isFlaky(result.status, result.output);
    const isStepFlaky = flaky || stepFlaky;
    const statusLabel = result.ok
      ? (isStepFlaky ? 'FLAKY' : 'PASS')
      : (isStepFlaky ? 'FLAKY (hard fail)' : 'FAIL');
    console.log(`${statusLabel}  ${step.name} — ${result.seconds.toFixed(1)}s`);
    results.push({ name: step.name, seconds: Number(result.seconds.toFixed(1)), ok: result.ok, flaky: isStepFlaky });
    if (!result.ok && !isStepFlaky) {
      failures.push(step.name);
      console.log(tail(result.output).split('\n').map((line) => `      ${line}`).join('\n'));
    } else if (isStepFlaky && !flaky && stepFlaky) {
      // Step was marked flaky but output didn't trigger the heuristic
      console.log(`  → step marked flaky (${stepFlaky}) but output was clean`);
    } else if (isStepFlaky) {
      const lineCount = result.output.split(/\r?\n/).length;
      if (result.ok) {
        // Exit 0 is a pass. Noisy output alone must not fail the gate, so flag it and move on.
        console.log(`  → noisy output (${lineCount} lines) with exit 0: not a failure`);
      } else {
        // A non-zero exit that looks intermittent is still a failed step; say so, and say it may pass on re-run.
        console.log(`  → flaky output (${lineCount} lines) may pass on re-run`);
        failures.push(`${step.name} (flaky)`);
      }
    }
  }

  // One syntax pass over every worker module and script, in process, so the list can never be stale.
  const targets = syntaxTargets();
  const syntaxStarted = Date.now();
  const bad = targets.filter((file) => !runStep(process.execPath, ['--check', file], undefined, { shell: false }).ok);
  const syntaxSeconds = Number(((Date.now() - syntaxStarted) / 1000).toFixed(1));
  console.log(`${bad.length === 0 ? 'PASS' : 'FAIL'}  syntax: workers + scripts — ${targets.length} files`);
  results.push({ name: `syntax (${targets.length} files)`, seconds: syntaxSeconds, ok: bad.length === 0 });
  if (bad.length > 0) {
    failures.push('syntax');
    console.log(bad.map((file) => `      ${file} failed node --check`).join('\n'));
  }

  const seconds = Number(((Date.now() - started) / 1000).toFixed(1));
  const ok = failures.length === 0;

  if (planned.cost) {
    try {
      recordRun({ at: new Date().toISOString(), profile: planned.label, ok, seconds, steps: results });
      console.log(`\n  recorded: ${seconds}s for profile ${planned.label} → \`npm run cost:report\``);
    } catch (error) {
      // A cost log that cannot be written must never turn a green gate red.
      console.log(`\n  cost log not written (${error instanceof Error ? error.message : error})`);
    }
  }

  console.log('');
  if (ok) {
    console.log(`VERIFY OK — ${steps.length + 1}/${steps.length + 1} steps passed in ${seconds}s`);
    console.log('  red is red: a red suite is not permission to report "done" (AGENTS.md §5).');
    return 0;
  }
  console.log(`VERIFY FAILED — ${failures.length} step(s): ${failures.join(', ')}`);
  return 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) process.exit(main());
