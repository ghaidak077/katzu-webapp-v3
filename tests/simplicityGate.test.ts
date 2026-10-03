/**
 * The simplicity gate must stay honest, and it must stay switched on.
 *
 * A gate that nobody runs is decoration. Two things are therefore pinned here:
 * the CI workflow actually invokes it, and the rule set stays small enough that
 * every rule can be defended — because the first version of the
 * "how many controls look primary" rule failed twelve healthy screens at once,
 * and a gate that invents defects is a gate people delete.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const gate = readFileSync('scripts/simplicity-check.mjs', 'utf8');

describe('the simplicity gate', () => {
  it('runs in CI, or it is decoration', () => {
    expect(workflow).toContain('node scripts/simplicity-check.mjs');
  });

  it('passes on the tree as it stands', () => {
    // The gate exits 1 on any finding, so a non-zero status here is the failure.
    const output = execFileSync(process.execPath, ['scripts/simplicity-check.mjs'], {
      encoding: 'utf8',
    });
    expect(output).toContain('Within budget.');
  });

  it('counts h2 and h3 as nameable headings, not only h1', () => {
    // Regression guard for the twelve false reports: a screen titled by an <h2>
    // is perfectly nameable.
    expect(gate).toContain('<h[123]');
    expect(gate).not.toContain('return /<h1\\b/.test(source) ||');
  });

  it('keeps the primary-action rule out of the source gate', () => {
    // It cannot see behind a condition or inside a modal, so it belongs in the
    // browser spec where the number is actually observed.
    expect(gate).not.toContain('primary-budget');
    const spec = readFileSync('e2e/simplicity.spec.ts', 'utf8');
    expect(spec.length).toBeGreaterThan(0);
  });

  it('says what each rule is for, so a future edit cannot quietly weaken it', () => {
    expect(gate).toContain('control-budget');
    expect(gate).toContain('unnamed-heading');
    expect(gate).toMatch(/WHAT IS DELIBERATELY NOT HERE|Every screen can be named/);
  });
});