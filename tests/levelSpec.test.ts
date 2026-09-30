import { describe, expect, it } from 'vitest';
import { LEVEL_LADDER, LEVEL_SPECS, levelConstraintLine, levelSpecFor } from '@/lib/levels/levelSpec';

/**
 * The client-side level spec (docs/agent/LEVEL-SPEC.md): pure data plus the
 * prompt-line builder. Parity with the worker's copy lives in
 * tests/levelParity.test.ts; this file pins the client module's own contract.
 */
describe('LEVEL_SPECS', () => {
  it('defines every level of the ladder, floor first', () => {
    expect(LEVEL_LADDER).toEqual(['A0', 'A1', 'A2', 'B1', 'B2']);
    expect(Object.keys(LEVEL_SPECS)).toEqual(LEVEL_LADDER);
  });

  it('keeps the mission caps: 1/1/2/3/3 corrections per turn', () => {
    expect(LEVEL_LADDER.map((level) => LEVEL_SPECS[level].maxCorrectionsPerTurn)).toEqual([1, 1, 2, 3, 3]);
  });

  it('grows sentence caps with the level: 6/8/10/12/15 words', () => {
    expect(LEVEL_LADDER.map((level) => LEVEL_SPECS[level].maxWordsPerSentence)).toEqual([6, 8, 10, 12, 15]);
  });

  it('fades Arabic support as the level rises: always → default → on-tap → hidden', () => {
    expect(LEVEL_SPECS.A0.arabicSupport).toBe('always');
    expect(LEVEL_SPECS.A1.arabicSupport).toBe('default');
    expect(LEVEL_SPECS.A2.arabicSupport).toBe('on-tap');
    expect(LEVEL_SPECS.B1.arabicSupport).toBe('hidden');
    expect(LEVEL_SPECS.B2.arabicSupport).toBe('hidden');
  });

  it('keeps A0 to the present tense and slows the voice down, B2 speaks slightly fast', () => {
    expect(LEVEL_SPECS.A0.allowedTenses).toEqual(['praesens']);
    expect(LEVEL_SPECS.A0.speakingSpeed).toBeLessThan(1);
    expect(LEVEL_SPECS.B2.speakingSpeed).toBeGreaterThan(1);
    for (const level of LEVEL_LADDER) {
      expect(LEVEL_SPECS[level].speakingSpeed).toBeGreaterThan(0);
      expect(LEVEL_SPECS[level].allowedConnectors.length).toBeGreaterThan(0);
    }
  });
});

describe('levelSpecFor', () => {
  it('falls back to A1 for missing or unknown levels instead of throwing', () => {
    expect(levelSpecFor(undefined)).toBe(LEVEL_SPECS.A1);
    expect(levelSpecFor(null)).toBe(LEVEL_SPECS.A1);
    expect(levelSpecFor('C1' as never)).toBe(LEVEL_SPECS.A1);
  });

  it('returns the level itself when it exists', () => {
    expect(levelSpecFor('A0')).toBe(LEVEL_SPECS.A0);
    expect(levelSpecFor('B2')).toBe(LEVEL_SPECS.B2);
  });
});

describe('levelConstraintLine', () => {
  it('states the level name, the word cap, the tense window and the connectors', () => {
    const a0 = levelConstraintLine('A0');
    expect(a0).toContain('CEFR A0');
    expect(a0).toContain('at most 6 words per sentence');
    expect(a0).toContain('present tense only');
    expect(a0).toContain('connectors limited to: und, oder, aber');

    const b1 = levelConstraintLine('B1');
    expect(b1).toContain('at most 12 words per sentence');
    expect(b1).toContain('any tense');
    expect(b1).toContain('connectors limited to:');

    expect(levelConstraintLine('B2')).toContain('any connectors');
  });

  it('carries the correction budget in the prompt line', () => {
    expect(levelConstraintLine('A0')).toContain('Correct at most 1 mistake per turn');
    expect(levelConstraintLine('A2')).toContain('Correct at most 2 mistakes per turn');
    expect(levelConstraintLine('B2')).toContain('Correct at most 3 mistakes per turn');
  });
});
