import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A rotation runbook is only worth the paper it is written on if every step ends in a check.
 *
 * WHY THIS EXISTS
 * Two rotations failed quietly in this repo. `ADMIN_SECRET` was pasted 66 characters long with
 * literal angle brackets, passed `[ -n "$ADMIN_SECRET" ]`, and died on `HTTP 401` from the loader.
 * A Worker secret was "rotated" without a deploy, so `wrangler versions list` still ended at the
 * old version and the old value still worked. Both are documented in `docs/agent/SECRET-ROTATION.md`
 * and both are the reason each section must carry a **Prove.** block with a command, not an adjective.
 */

const root = join(__dirname, '..');
const path = join(root, 'docs/agent/SECRET-ROTATION.md');
const text = readFileSync(path, 'utf8');

describe('secret rotation runbook', () => {
  it('stays small enough to read in one sitting', () => {
    expect(statSync(path).size).toBeLessThan(12 * 1024);
  });

  it('covers every secret this repo actually rotates', () => {
    for (const name of ['ADMIN_SECRET', 'GROQ_API_KEY', 'GROQ_API_KEYS']) {
      expect(text, `${name} must have a rotation path`).toContain(name);
    }
  });

  it('gives every section a proof command', () => {
    const sections = text.split(/^## \d+\. /m).slice(1);
    expect(sections.length).toBeGreaterThanOrEqual(3);
    const missing = sections
      .filter((body) => !body.includes('**Prove.**'))
      .map((body) => body.split('\n')[0].trim());
    expect(missing, 'a rotation step without a proof command is a claim').toEqual([]);
  });

  it('carries no secret-shaped literal', () => {
    // 32 bytes of lowercase hex is the shape this repo's secret generator emits.
    expect(text).not.toMatch(/\b[0-9a-f]{64}\b/);
  });

  it('says out loud that an agent never runs it', () => {
    expect(text).toMatch(/Owner-only/);
  });
});
