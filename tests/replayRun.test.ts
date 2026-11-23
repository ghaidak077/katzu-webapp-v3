import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PACING_MS,
  mergeCaptures,
  planRemaining,
  readResults,
  recordResult,
  usableTurn,
} from '../scripts/replay/replay-run.mjs';

/**
 * The replay has to survive being interrupted. On 2026-11-16 the free tier answered 429 after 29
 * of 46 turns, and because the run could only be understood as one unit, the recall gate never got
 * a denominator. These are the rules that make a resumed run one run.
 */

const cases = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, input: `satz ${id}` }));

describe('replay scheduling and stored results', () => {
  it('counts a captured turn only when the route answered with a reply', () => {
    expect(usableTurn({ id: 'g01', status: 200, body: { reply_de: 'Hallo!' } })).toBe(true);
    expect(usableTurn({ id: 'g02', status: 429, body: {} })).toBe(false);
    expect(usableTurn({ id: 'g03', status: 200, body: {} })).toBe(false);
    expect(usableTurn({ id: 'g04', status: 502, body: { reply_de: 'x' } })).toBe(false);
  });

  it('merges partial captures by id, later files winning', () => {
    const merged = mergeCaptures([
      [{ id: 'g01', status: 200, body: { reply_de: 'first' } }],
      [
        { id: 'g01', status: 200, body: { reply_de: 'second' } },
        { id: 'g02', status: 200, body: { reply_de: 'new' } },
      ],
    ]);
    expect(merged.map((turn) => turn.id)).toEqual(['g01', 'g02']);
    expect(merged[0].body.reply_de).toBe('second');
  });

  it('plans only what is left, in batches that fit one sitting', () => {
    const plan = planRemaining({ cases, capturedIds: ['a', 'b'], batchSize: 2 });
    expect(plan).toMatchObject({ captured: 2, total: 5, remaining: 3, pacingMs: PACING_MS });
    expect(plan.batches).toEqual([['c', 'd'], ['e']]);
    // Three turns at the measured cadence: half a minute, which is what a person asks before starting.
    expect(plan.estimatedMinutes).toBe(0.5);
  });

  it('says nothing is left when every case is captured', () => {
    const plan = planRemaining({ cases, capturedIds: cases.map((item) => item.id) });
    expect(plan.remaining).toBe(0);
    expect(plan.batches).toEqual([]);
  });

  it('stores a run and reads it back in time order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'katzu-replay-'));
    try {
      recordResult(dir, { turns: 69, green: true });
      recordResult(dir, { turns: 23, green: false });
      writeFileSync(join(dir, 'broken.json'), '{not json');
      const runs = readResults(dir);
      expect(runs.map((run) => run.turns)).toEqual([69, 23]);
      expect(readResults(join(dir, 'missing'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
