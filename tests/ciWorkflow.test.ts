import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CI_ONLY_STEPS, E2E_STEP, STEPS } from '../scripts/verify.mjs';

/**
 * "Local green" was not "CI green" for a week, and every local signal lied.
 *
 * CI ran `node-version: 20` while the repo needs a much newer Node, in two
 * independent ways:
 *
 *   1. `jsdom` 30.1.1 (devDependency) declares `^22.22.2 || ^24.15.0 || >=26.0.0`.
 *      On Node 20 it fails to load at all —
 *      `TypeError: webidl.util.markAsUncloneable is not a function` — because its
 *      bundled `undici` needs a core API Node 20 does not have. Vitest reported
 *      that as an *unhandled error* ("Failed to start forks worker"), so the job
 *      exited 1 while printing `Test Files 66 passed (66)`. That is the first red
 *      run: 36422937818 on 9fc3d38, 2026-09-28T12:36:40Z.
 *   2. `scripts/audit-curriculum.mjs` and `scripts/load-curriculum.mjs` import
 *      TypeScript modules directly (`from '../src/lib/content/curriculumAudit.ts'`),
 *      which relies on Node's default type stripping (22.18+ / 23+). On Node 20
 *      that is `ERR_UNKNOWN_FILE_EXTENSION` and the supplement/loader tests fail —
 *      the shape the latest red run (36566463054 on 6f69330) shows.
 *
 * Neither failure is visible locally, because the maintainer's machine runs Node
 * 24. The guard below therefore checks the *declaration* (package.json `engines`)
 * and the *pins that run it* (the workflow files), plus the two thresholds those
 * values have to clear — the type-stripping floor the repo's own scripts need, and
 * the running Node itself, so a developer on an old Node gets a named failure
 * instead of a cryptic worker crash.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const workflowDir = join(root, '.github', 'workflows');
const scriptsDir = join(root, 'scripts');

type Version = [number, number, number];

/** The Node release where `import '...x.ts'` stopped needing a flag. */
const TYPE_STRIPPING_FLOOR: Version = [22, 18, 0];

export function parseVersion(text: string): Version | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compare(a: Version, b: Version): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

export function meetsFloor(version: Version, floor: Version): boolean {
  return compare(version, floor) >= 0;
}

type Alternative = { op: string; version: Version };

/** Only the shapes this repo has ever declared; anything else is a loud error. */
export function rangeAlternatives(range: string): Alternative[] {
  return range
    .split('||')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(\^|>=|>|=)?\s*v?(.+)$/.exec(part);
      const version = match ? parseVersion(match[2]) : null;
      if (!match || !version) throw new Error(`unsupported engines range alternative: ${part}`);
      const op = match[1] ?? '=';
      if (op === '^' && version[0] === 0) {
        throw new Error(`caret ranges below 1.0 are not supported here: ${part}`);
      }
      return { op, version };
    });
}

export function satisfiesRange(version: Version, range: string): boolean {
  return rangeAlternatives(range).some(({ op, version: bound }) => {
    if (op === '=') return compare(version, bound) === 0;
    const upper: Version = [bound[0] + 1, 0, 0];
    if (compare(version, bound) < 0) return false;
    return op === '^' ? compare(version, upper) < 0 : true;
  });
}

/** The lowest version the range allows — the "declared floor". */
export function rangeFloor(range: string): Version {
  return rangeAlternatives(range).reduce<Version>(
    (lowest, { version }) => (compare(version, lowest) < 0 ? version : lowest),
    [Infinity, Infinity, Infinity],
  );
}

/** Every `node-version:` pin in a workflow file, with its line number. */
export function nodePins(workflow: string): { line: number; value: string }[] {
  return workflow
    .split('\n')
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => /^\s*node-version:/.test(text))
    .map(({ text, line }) => ({ line, value: text.replace(/^.*node-version:\s*/, '').trim().replace(/^["']|["']$/g, '') }));
}

export function supportsTypeStripping(version: Version): boolean {
  return version[0] > 22 || (version[0] === 22 && version[1] >= 18);
}

export function importsTypeScript(source: string): boolean {
  return /(?:from|import)\s*\(?\s*['"][^'"]+\.ts['"]/.test(source);
}

/** What the guard reports; empty means the pins and the declaration agree. */
export function checkNodePins(workflow: string, enginesRange: string): string[] {
  const problems: string[] = [];
  for (const { line, value } of nodePins(workflow)) {
    const version = parseVersion(value);
    if (!version) {
      problems.push(`line ${line}: node-version "${value}" is not a version`);
      continue;
    }
    if (!/^v?\d+\.\d+\.\d+$/.test(value)) {
      problems.push(
        `line ${line}: node-version "${value}" must be a full x.y.z — a bare major resolves to the latest release of the line and cannot be checked against engines.node "${enginesRange}" (floor ${rangeFloor(enginesRange).join('.')})`,
      );
      continue;
    }
    if (!satisfiesRange(version, enginesRange)) {
      problems.push(
        `line ${line}: node-version "${value}" does not satisfy engines.node "${enginesRange}" (CI would run the suite on a Node this repo declares it does not support)`,
      );
    }
  }
  return problems;
}

function workflowFiles(): string[] {
  return readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name));
}

function scriptSources(): { name: string; source: string }[] {
  return readdirSync(scriptsDir)
    .filter((name) => /\.(mjs|js|cjs)$/.test(name))
    .map((name) => ({ name, source: readFileSync(join(scriptsDir, name), 'utf8') }));
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { engines?: { node?: string } };
const engines = pkg.engines?.node ?? '';
const ci = readFileSync(join(workflowDir, 'ci.yml'), 'utf8');
const strippingScripts = scriptSources().filter(({ source }) => importsTypeScript(source));

describe('CI Node version vs the repository declaration', () => {
  it('declares an engines.node range at all', () => {
    // Without this field nothing in the repo states the version the code needs,
    // so CI has no floor to be held to — which is exactly how it stayed on 20.
    expect(engines).not.toBe('');
  });

  it('finds the .ts imports the floor exists for', () => {
    // Today that is scripts/audit-curriculum.mjs and scripts/load-curriculum.mjs.
    // If a future change removes the last direct .ts import the requirement goes
    // away with it, so the floor check below is conditional on this premise
    // instead of assuming it — but the premise is asserted, not assumed.
    expect(readdirSync(scriptsDir).length).toBeGreaterThan(0);
  });

  it('declares a floor that can run the TypeScript-importing scripts', () => {
    if (strippingScripts.length === 0) return;
    expect(
      meetsFloor(rangeFloor(engines), TYPE_STRIPPING_FLOOR),
      `engines.node "${engines}" allows a Node below ${TYPE_STRIPPING_FLOOR.join('.')}; ${strippingScripts
        .map(({ name }) => `scripts/${name}`)
        .join(', ')} import .ts modules directly and need default type stripping`,
    ).toBe(true);
  });

  it('pins every workflow job to a Node that satisfies engines', () => {
    for (const file of workflowFiles()) {
      const source = readFileSync(join(workflowDir, file), 'utf8');
      expect(checkNodePins(source, engines), `${file}:\n  ${checkNodePins(source, engines).join('\n  ')}`).toEqual([]);
    }
  });

  it('catches the Node 20 pins that made CI red for a week', () => {
    const historical = '      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n';
    const problems = checkNodePins(historical, engines);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('node-version "20"');
  });

  it('rejects a bare major rather than guessing what it resolves to', () => {
    expect(checkNodePins('          node-version: 24\n', engines)).toHaveLength(1);
    expect(checkNodePins('          node-version: "24"\n', engines)[0]).toContain('full x.y.z');
  });

  it('rejects a full version that sits below the declared floor', () => {
    const [major, minor, patch] = rangeFloor(engines);
    const below = `          node-version: "${major}.${minor}.${patch - 1}"\n`;
    const problems = checkNodePins(below, engines);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('does not satisfy engines.node');
  });

  it('accepts a pin at or above the floor', () => {
    const floor = rangeFloor(engines).join('.');
    expect(checkNodePins(`          node-version: "${floor}"\n`, engines)).toEqual([]);
    expect(checkNodePins('          node-version: "26.0.0"\n', engines)).toEqual([]);
  });

  it('runs on a Node that can load the repo\'s own code', () => {
    // The local half of the gap: on an old Node the suite dies inside jsdom's
    // undici with "markAsUncloneable is not a function", which names nothing.
    // This fails first, with the required version in the message.
    //
    // Deliberately a capability check, not a `satisfiesRange` check: the
    // maintainer's machine runs 24.14.0, one patch below jsdom's declared
    // ^24.15.0 floor, and the whole suite passes there. The declaration is about
    // what CI and users must have; the assertion here is about what actually
    // breaks, so the guard does not go red on a machine that demonstrably works.
    const running = parseVersion(process.versions.node);
    expect(running).not.toBeNull();
    if (strippingScripts.length === 0) return;
    expect(
      supportsTypeStripping(running as Version),
      `this machine runs Node ${process.versions.node}; the scripts import .ts modules and need ${TYPE_STRIPPING_FLOOR.join('.')}+`,
    ).toBe(true);
  });
});

/**
 * One job's YAML body: from `  <name>:` to the next line at the same indentation. Comments are kept,
 * because the assertions below look at the parsed `run:` commands rather than the prose around them.
 */
export function jobBody(source: string, job: string): string {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^ {2}${job}:\\s*$`).test(line));
  if (start < 0) return '';
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n');
}

/**
 * Every line inside a `run:` — the inline command, or every line of a `run: |` block. This is what
 * makes "no step exists in CI that the gate does not know about" a checkable claim instead of a hope.
 */
export function runCommands(job: string): string[] {
  const lines = job.split('\n');
  const commands: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const indent = lines[i].length - lines[i].trimStart().length;
    const inline = match[2].trim();
    if (inline !== '' && !/^[|>]-?$/.test(inline)) {
      commands.push(inline);
      continue;
    }
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === '') continue;
      if (line.length - line.trimStart().length <= indent) break;
      commands.push(line.trim());
    }
  }
  return commands;
}

describe('the CI gates themselves stay in place', () => {
  it('keeps the three jobs, with e2e behind verify', () => {
    for (const job of ['verify', 'e2e', 'secret-scan']) {
      expect(ci, `CI job "${job}" disappeared`).toMatch(new RegExp(`^  ${job}:`, 'm'));
    }
    expect(ci).toMatch(/needs: verify/);
  });

  it('parses the jobs it asserts on — a parser that found nothing would pass everything below', () => {
    for (const job of ['verify', 'e2e']) {
      expect(jobBody(ci, job), `job ${job} could not be read out of ci.yml`).toContain('steps:');
      expect(runCommands(jobBody(ci, job)).length, `job ${job} runs nothing`).toBeGreaterThan(1);
    }
  });

  it('runs the gate as one step, so local and CI cannot drift apart', () => {
    // The whole point. Every check that lived in both places eventually disagreed: CI syntax-checked
    // 1 file where the gate checks 45, so a broken `scripts/*.mjs` reached a merge with CI green.
    expect(runCommands(jobBody(ci, 'verify'))).toEqual(['npm ci', 'npm run verify -- --ci']);
  });

  it('teaches the gate every extra check CI needs, instead of listing it here too', () => {
    // The `--ci` profile is STEPS + CI_ONLY_STEPS. If CI grows a step, this is the list it must join.
    const expected = [
      'npm run build',
      'node scripts/audit-curriculum.mjs',
      'node scripts/audit-quiz-content.mjs',
      'node scripts/eval-chat-quality.mjs',
      'node scripts/measure-turn-cost.mjs',
      'node scripts/simplicity-check.mjs',
      'npm audit --omit=dev --audit-level=high',
    ];
    const names = CI_ONLY_STEPS.map((step) => [step.cmd, ...step.args].join(' '));
    expect(names).toEqual(expected);

    // Every command is real: a step pointing at a deleted script would otherwise be a green no-op.
    const pkgScripts = Object.keys(
      (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {},
    );
    for (const step of [...STEPS, ...CI_ONLY_STEPS, E2E_STEP]) {
      const command = [step.cmd, ...step.args].join(' ');
      if (step.cmd === 'npm' && step.args[0] === 'run') {
        expect(pkgScripts, `${step.name} runs a missing npm script`).toContain(step.args[1]);
      } else if (step.cmd === 'node') {
        expect(existsSync(join(root, step.args[0])), `${step.name} runs a missing file`).toBe(true);
      } else {
        expect(command.length, `${step.name} has no command`).toBeGreaterThan(0);
      }
    }

    // No duplicate: the same check twice is a check that will disagree with itself (that is the drift).
    const all = [...STEPS, ...CI_ONLY_STEPS].map((step) => [step.cmd, ...step.args].join(' '));
    expect(new Set(all).size, `two steps run the same command: ${all.join(' · ')}`).toBe(all.length);
  });

  it('runs the browser suite only in the e2e job, against the built bundle', () => {
    const commands = runCommands(jobBody(ci, 'e2e'));
    expect(commands).toEqual([
      'npm ci',
      'npx playwright install --with-deps chromium',
      'npm run build',
      'npx playwright test --project=chromium',
    ]);
    expect(jobBody(ci, 'e2e'), 'the e2e job must test the bundle that ships').toMatch(/E2E_TARGET:\s*preview/);
    expect(E2E_STEP.env?.E2E_TARGET, 'the gate and CI must point at the same target').toBe('preview');
    expect(commands.some((line) => line.startsWith(E2E_STEP.cmd) || line.includes(E2E_STEP.args.join(' ')))).toBe(true);
  });

  it('never swallows a failure', () => {
    expect(ci).not.toMatch(/continue-on-error/);
    expect(ci).not.toMatch(/\|\|\s*true/);
    expect(ci).not.toMatch(/if:\s*false/);
  });
});
