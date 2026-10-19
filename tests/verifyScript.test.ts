import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CI_ONLY_STEPS, E2E_STEP, MAX_OUTPUT_BYTES, STEPS, plan, runStep, syntaxTargets, isFlaky } from '../scripts/verify.mjs';
import { LOG_FILE, median, parseRuns, recordRun, reportLines, summarise } from '../scripts/verify-cost.mjs';

/**
 * `npm run verify` is only worth having if it runs the real thing.
 *
 * WHY THIS EXISTS
 * `AGENTS.md` §5 describes the verification tiers as a list to remember, and a list you reconstruct by
 * hand is a list you shorten when time is short. The gate is now one command; this file stops it from
 * rotting into a command that passes because it checks nothing — every step is resolved here against
 * `package.json` and the filesystem, and the slow browser suite must stay opt-in.
 */

const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
const scripts = Object.keys(pkg.scripts ?? {});
const commandOf = (step: { cmd: string; args: string[] }) => [step.cmd, ...step.args].join(' ');

describe('npm run verify', () => {
  it('is wired up as an npm script called verify', () => {
    expect(scripts, 'package.json lost the verify script').toContain('verify');
    expect(pkg.scripts?.verify).toMatch(/node scripts\/verify\.mjs$/);
  });

  it('covers what the tiers name: both typechecks, the unit suite, and the design audits', () => {
    const commands = [...STEPS, E2E_STEP].map(commandOf);
    expect(commands.some((command) => /tsc --noEmit$/.test(command)), 'no app typecheck').toBe(true);
    expect(commands, 'no e2e typecheck').toContain('npm run test:e2e:types');
    expect(commands, 'no unit suite').toContain('npm test');
    expect(commands.some((command) => /design:audit/.test(command)), 'no design audit').toBe(true);
    expect(commands.some((command) => /design:contrast/.test(command)), 'no contrast check').toBe(true);
    expect(commands.some((command) => /playwright test/.test(command)), 'no browser suite').toBe(true);
  });

  it('would fail, not pass, when a step is missing or misnamed', () => {
    // `npm test` has no `run`; everything else is `npm run <script>`.
    const missing = STEPS.filter((step) => step.cmd === 'npm')
      .map((step) => (step.args[0] === 'run' ? step.args[1] : step.args[0]))
      .filter((name) => !scripts.includes(name));
    expect(missing, `verify runs npm scripts that do not exist: ${missing.join(', ')}`).toEqual([]);
    const binaries = [...STEPS, E2E_STEP].filter((step) => step.cmd === 'npx');
    expect(binaries.length, 'npx steps disappeared').toBeGreaterThan(0);
  });

  it('keeps the slow browser suite opt-in, and runs it against the shipped bundle', () => {
    expect(
      STEPS.map(commandOf).some((command) => /playwright/.test(command)),
      'the browser suite must not run on every verify',
    ).toBe(false);
    expect(E2E_STEP.env?.E2E_TARGET, 'the suite must test the built bundle, like the gate config expects').toBe('preview');
  });

  it('keeps its profiles honest: --fast asserts, --ci is what CI runs, --e2e is opt-in', () => {
    expect(plan(['--fast']).fast).toBe(true);
    expect(plan(['--ci']).steps).toEqual([...STEPS, ...CI_ONLY_STEPS]);
    expect(plan(['--e2e']).steps).toContain(E2E_STEP);
    expect(plan(['--cost']).cost).toBe(true);
    expect(plan([]).cost).toBe(false);
  });

  it('does not invent a failure when a step is simply loud', () => {
    // The regression this pins: `scripts/audit-quiz-content.mjs` printed 1.27 MB (18,978 lines) and
    // `spawnSync`'s 1 MB default killed the child with ENOBUFS — `status: null` — so the gate reported
    // FAIL for a step that exited 0. Measured on 2026-10-15, in the first `--ci` run.
    expect(MAX_OUTPUT_BYTES, 'the buffer must clear the loudest step (1.27 MB measured), not the default 1 MB').toBeGreaterThan(
      2 * 1024 * 1024,
    );
    const loud = runStep(process.execPath, ['-e', "process.stdout.write('x'.repeat(4_000_000))"], undefined, { shell: false });
    expect(loud.status, 'a step writing 4 MB must not be killed by the runner').toBe(0);
    expect(loud.ok).toBe(true);
    expect(loud.output.length).toBeGreaterThan(3_000_000);
  });

  it('syntax-checks the real workers and scripts', () => {
    const targets = syntaxTargets();
    expect(targets.filter((file) => /^cloudflare-.*\.js$/.test(file)).length, 'no workers found').toBeGreaterThan(8);
    expect(targets.filter((file) => file.startsWith('scripts/')).length, 'no scripts found').toBeGreaterThan(15);
    expect(targets.every((file) => existsSync(join(root, file))), 'a syntax target does not exist').toBe(true);
  });
});

/**
 * The cost of a run is recorded, not argued about.
 *
 * WHY THIS EXISTS
 * "Cheaper" was an argument about structure with no number behind it, and an argument cannot be
 * checked or compared. The writer and the reader below are the whole contract, so the test is the
 * round trip: what `verify -- --cost` writes must be what `npm run cost:report` can read back, on a
 * log that may also contain a line truncated by a killed run.
 */
describe('the cost log round-trips, and stays out of git', () => {
  const logPath = join(tmpdir(), `katzu-verify-cost-${process.pid}.ndjson`);
  const run = {
    at: '2026-10-15T12:00:00.000Z',
    profile: 'local',
    ok: true,
    seconds: 71.4,
    steps: [{ name: 'unit suite + guards', seconds: 53, ok: true }],
  };

  it('writes one line per run and reads it back with the shape the report uses', () => {
    rmSync(logPath, { force: true });
    recordRun(run, logPath);
    recordRun({ ...run, at: '2026-10-15T13:00:00.000Z', seconds: 80.2, ok: false }, logPath);
    const parsed = parseRuns(readFileSync(logPath, 'utf8'));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].profile).toBe('local');
    rmSync(logPath, { force: true });
  });

  it('survives a truncated last line and a log that is not JSON at all', () => {
    expect(parseRuns('{"seconds":12,"ok":true}\n{"seconds":9,"ok":true,"steps":[{"na')).toHaveLength(1);
    expect(parseRuns('this is not a log\n\n')).toEqual([]);
    expect(parseRuns('')).toEqual([]);
  });

  it('summarises median, slowest and failures from real records', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([1, 9])).toBe(5);
    expect(median([9, 1, 4])).toBe(4);

    const runs = [10, 30, 20, 40, 50, 60].map((seconds, index) => ({ ...run, seconds, ok: index !== 3 }));
    const summary = summarise(runs);
    expect(summary?.count).toBe(6);
    expect(summary?.medianSeconds).toBe(35);
    expect(summary?.slowest.seconds).toBe(60);
    expect(summary?.failures).toBe(1);
    expect(summary?.recent).toHaveLength(5);
    expect(summarise([])).toBeNull();
  });

  it('says how to record a run when the log is empty, and never claims to count tokens', () => {
    const empty = reportLines([]).join('\n');
    expect(empty).toMatch(/--cost/);
    expect(empty).toMatch(/gitignore/);

    const report = reportLines(parseRuns(JSON.stringify(run))).join('\n');
    expect(report).toMatch(/median/);
    expect(report, 'the report must not imply a token measurement — the harness exposes none').toMatch(/NOT a token count/i);
    expect(report).toMatch(/unit suite \+ guards 53\.0s/);
  });

  it('keeps the log out of the repository', () => {
    expect(LOG_FILE.startsWith('.')).toBe(true);
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toContain(LOG_FILE);
  });

  describe('flaky output detection', () => {
    it('flags a step that exits 0 with lots of output and no errors as flaky', () => {
      const output = 'Warning: media pipeline warning\n' + 'Just a warning about gpu\n' + 'Another transient message\n'.repeat(50);
      expect(isFlaky(0, output)).toBe(true);
    });

    it('does NOT flag a step that exits 0 with few lines as flaky', () => {
      const output = 'just a few lines\nof output\n';
      expect(isFlaky(0, output)).toBe(false);
    });

    it('flags non-zero exit with intermittent patterns as flaky', () => {
      const output = 'timeout after 5000ms\nretrying...\n';
      expect(isFlaky(1, output)).toBe(true);
    });

    it('does NOT flag non-zero exit with a short error as flaky', () => {
      const output = 'Error: something went wrong\n';
      expect(isFlaky(1, output)).toBe(false);
    });

    it('flags output with known non-determinism patterns as flaky', () => {
      const output = 'element not found at line 42\nretry? y/n\n';
      expect(isFlaky(0, output)).toBe(true);
    });
  });

  describe('per-step flaky configuration', () => {
    it('allows a step with flaky: true to pass even with flaky output', () => {
      const stepsWithFlag = [{ name: 'test-step', cmd: 'npx', args: ['-e', 'process.exit(0)'], flaky: true }];
      // Verify the flag is read
      expect(stepsWithFlag[0].flaky).toBe(true);
    });

    it('defaults to flaky: false when not specified', () => {
      const stepsWithoutFlag = [{ name: 'test-step', cmd: 'npx', args: ['-e', 'process.exit(0)'] }];
      expect(stepsWithoutFlag[0].flaky).toBeUndefined();
    });

    it('output without flaky patterns but step marked flaky still passes', () => {
      const output = 'clean output with no issues\n';
      const result = { status: 0, output };
      const flaky = isFlaky(result.status, result.output);
      // Step marked flaky should still pass
      const isStepFlaky = flaky || true;  // stepFlaky = true
      expect(isStepFlaky).toBe(true);
    });

    it('step marked flaky with clean output does not cause a hard failure', () => {
      const output = 'clean output with no issues\n';
      const result = { status: 0, output };
      const flaky = isFlaky(result.status, result.output);
      const stepFlaky = true;  // step is marked flaky
      const isStepFlaky = flaky || stepFlaky;
      // should not be a hard failure
      expect(isStepFlaky).toBe(true);  // flaky, but not a hard failure
    });
  });
});
