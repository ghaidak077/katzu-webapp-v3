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

  it('counts h2 as a nameable heading, not only h1', () => {
    // Regression guard for the twelve false reports: a screen titled by an <h2>
    // is perfectly nameable.
    expect(gate).toContain('<h[12]');
    expect(gate).not.toContain('return /<h1\\b/.test(source) ||');
  });

  it('refuses a screen whose only heading is an h3, because h3 is not a name', () => {
    // V36: the loose rule accepted `<h3>`, so Guided Practice passed on an
    // `<h3>` for a grammar title at line 304 and Quiz passed on an `<h3>` that
    // only rendered on the result screen. Neither screen could be named.
    // Running the strict rule over all 27 screens names exactly those two, so
    // the tightening costs two fixes rather than inventing a wall of defects.
    const h3Only = `
      export const ThingScreen: React.FC = () => (
        <div>
          <h3>قاعدة اليوم</h3>
        </div>
      );
    `;
    const named = `
      export const ThingScreen: React.FC = () => (
        <div>
          <h2>جلسة الدراسة</h2>
          <h3>قاعدة اليوم</h3>
        </div>
      );
    `;
    // The rule is lifted out of the gate source and evaluated as the real
    // function, so this test exercises the shipped expression rather than a
    // copy of it that could drift.
    const expr = gate.match(/function hasHeading\(source\) \{\s*return (.*);\s*\}/)?.[1];
    expect(expr, 'hasHeading must be a single return expression').toBeTruthy();
    const hasHeading = new Function('source', `return (${expr as unknown as string})`) as (
      source: string
    ) => boolean;
    expect(hasHeading(h3Only)).toBe(false);
    expect(hasHeading(named)).toBe(true);
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