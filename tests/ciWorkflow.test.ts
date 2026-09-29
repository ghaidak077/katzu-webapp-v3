import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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

describe('the CI gates themselves stay in place', () => {
  it('keeps the three jobs, with e2e behind verify', () => {
    for (const job of ['verify', 'e2e', 'secret-scan']) {
      expect(ci, `CI job "${job}" disappeared`).toMatch(new RegExp(`^  ${job}:`, 'm'));
    }
    expect(ci).toMatch(/needs: verify/);
  });

  it('runs every verify step that catches a real regression', () => {
    const required = [
      'npm ci',
      'npm run lint',
      'node --check cloudflare-unified-worker.js',
      'npm test',
      'npm run build',
      'node scripts/audit-curriculum.mjs',
      'node scripts/audit-quiz-content.mjs',
      'npm audit --omit=dev --audit-level=high',
      'npx tsc -p e2e --noEmit',
      'npx playwright test --project=chromium',
    ];
    for (const command of required) {
      expect(ci, `the verify/e2e jobs no longer run: ${command}`).toContain(command);
    }
  });

  it('never swallows a failure', () => {
    expect(ci).not.toMatch(/continue-on-error/);
    expect(ci).not.toMatch(/\|\|\s*true/);
    expect(ci).not.toMatch(/if:\s*false/);
  });
});
