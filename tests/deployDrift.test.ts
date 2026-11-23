import { describe, expect, it } from 'vitest';
import { driftMessage, promptDrift } from '../scripts/check-deploy-drift.mjs';

/**
 * `scripts/check-deploy-drift.mjs` exists because a committed prompt fix that is
 * not deployed still reaches learners (v11 sat on main while production served
 * v10). The comparison is small, so the interesting assertions are the awkward
 * cases: a worker too old to publish the field, and a tree that is BEHIND
 * production. Both are drift, and neither may read as success.
 */
describe('prompt drift', () => {
  it('is a match only when the numbers are equal', () => {
    expect(promptDrift(11, 11)).toMatchObject({ verdict: 'match', ok: true });
    expect(promptDrift('11', '11').ok).toBe(true);
  });

  it('names the direction instead of a boolean', () => {
    expect(promptDrift(11, 10)).toMatchObject({ verdict: 'behind', ok: false });
    expect(promptDrift(11, 12)).toMatchObject({ verdict: 'ahead', ok: false });
  });

  it('treats a worker that publishes no version as drift, not as "fine"', () => {
    for (const missing of [undefined, null, '', 'n/a']) {
      const result = promptDrift(11, missing);
      expect(result.verdict, String(missing)).toBe('unknown');
      expect(result.ok).toBe(false);
    }
  });

  it('always states the repo and deployed numbers a report can quote', () => {
    expect(driftMessage(promptDrift(11, 11))).toContain('v11 is live');
    expect(driftMessage(promptDrift(11, 10))).toContain('committed, not live');
    expect(driftMessage(promptDrift(11, 12))).toContain('behind production');
    expect(driftMessage(promptDrift(11, undefined))).toContain('predates v11');
  });
});
