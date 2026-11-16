import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INTRO_SCENARIO_ID } from '@/lib/mission/selectMission';

/**
 * The first-episode hop is asserted in shipped browser specs as a URL
 * (`/scenario/<id>/story`). Those literals and `INTRO_SCENARIO_ID` are one fact
 * in five files: on 2026-11-16 pointing the constant at `first_greetings` — the
 * first scenario of unit 1 — broke `aiEconomy`, `firstSessionChain`, `journey`
 * and `tabLock` with four unrelated-looking timeouts, so the change was reverted
 * and the mismatch reported instead.
 *
 * This guard is the missing piece: flip the constant and you now get ONE failure
 * that names the specs to change with it, instead of a 17-minute browser run that
 * says "timed out".
 */
const e2eDir = join(process.cwd(), 'e2e');

function firstEpisodeIds(): Array<{ file: string; id: string }> {
  const found: Array<{ file: string; id: string }> = [];
  for (const file of readdirSync(e2eDir).filter((name) => name.endsWith('.spec.ts'))) {
    const text = readFileSync(join(e2eDir, file), 'utf8');
    // Only assertions about the URL a flow lands on: `page.goto('/scenario/x/story')`
    // elsewhere is a deliberate visit to that scene, not the first-episode claim.
    for (const line of text.split(/\r?\n/)) {
      if (!line.includes('toHaveURL')) continue;
      // The spec source writes the URL as a regex literal, so `\/scenario\/...`.
      const flat = line.replace(/\\/g, '');
      for (const match of flat.matchAll(/\/scenario\/([a-z0-9_]+)\/story/g)) {
        found.push({ file, id: match[1] });
      }
    }
  }
  return found;
}

describe('the intro scenario is one fact, not five', () => {
  it('every spec that asserts the first episode names INTRO_SCENARIO_ID', () => {
    const assertions = firstEpisodeIds();
    // A guard that matches nothing is not a guard: the specs do assert this hop.
    expect(assertions.length).toBeGreaterThanOrEqual(2);
    const strays = assertions.filter((entry) => entry.id !== INTRO_SCENARIO_ID);
    expect(
      strays.map((entry) => `${entry.file} -> ${entry.id}`),
      `e2e specs hard-code another first episode than INTRO_SCENARIO_ID (${INTRO_SCENARIO_ID}). ` +
        'Change them in the same commit as the constant, or the browser suite times out for no visible reason.',
    ).toEqual([]);
  });

  it('the day-0 intro is deliberately the airport, not unit 1\'s first scenario', () => {
    // Product state on 2026-11-16: unit 1 opens with `first_greetings`, while the
    // first-run mission opens `airport_arrival` because that is the episode the
    // onboarding path, the shipped opener and four specs are built around.
    // Recorded here so the difference is a decision with a date, not drift.
    expect(INTRO_SCENARIO_ID).toBe('airport_arrival');
  });
});
