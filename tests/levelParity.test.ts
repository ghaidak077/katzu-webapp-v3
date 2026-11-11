import { describe, expect, it } from 'vitest';
import { LEVEL_LADDER, LEVEL_SPECS, levelConstraintLine } from '../src/lib/levels/levelSpec';
import {
  LEVEL_SPECS as WORKER_LEVEL_SPECS,
  FALLBACK_LINES,
  correctionBudgetFor,
  levelConstraintLine as workerLevelConstraintLine,
  levelFallbackLine,
} from '../cloudflare-level-spec';
import type { CEFRLevel } from '../src/types/models';

/**
 * The worker is plain JS and cannot import the TS module, so it keeps its own
 * copy of the spec table (`cloudflare-level-spec.js`). These tests are the
 * contract that the copies cannot drift: every shared field must be identical
 * on both sides (docs/agent/LEVEL-SPEC.md rule 1).
 */
const LADDER: CEFRLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2'];

describe('level spec parity (client TS <-> worker JS)', () => {
  it('covers the same five levels on both sides', () => {
    expect(LEVEL_LADDER).toEqual(LADDER);
    expect(Object.keys(LEVEL_SPECS)).toEqual(LADDER);
    expect(Object.keys(WORKER_LEVEL_SPECS)).toEqual(LADDER);
  });

  it('matches every shared field per level', () => {
    for (const level of LADDER) {
      const client = LEVEL_SPECS[level];
      const worker = WORKER_LEVEL_SPECS[level];
      expect(worker.maxWordsPerSentence, `${level} maxWordsPerSentence`).toBe(client.maxWordsPerSentence);
      expect(worker.tenseGroups, `${level} tenses`).toEqual(client.allowedTenses);
      expect(worker.allowedConnectors, `${level} connectors`).toEqual(client.allowedConnectors);
      expect(worker.maxCorrectionsPerTurn, `${level} corrections`).toBe(client.maxCorrectionsPerTurn);
    }
  });

  it('agrees on the correction budget for every level', () => {
    for (const level of LADDER) {
      expect(correctionBudgetFor(level)).toBe(LEVEL_SPECS[level].maxCorrectionsPerTurn);
    }
    // An unknown level must not throw and must not open a budget of its own.
    expect(correctionBudgetFor('C1' as CEFRLevel)).toBe(LEVEL_SPECS.A1.maxCorrectionsPerTurn);
  });

  it('agrees on the prompt caps wording for every level', () => {
    for (const level of LADDER) {
      const clientLine = levelConstraintLine(level);
      const workerLine = workerLevelConstraintLine(level);
      // The client line appends the correction sentence (the /ai/turn prompt
      // carries it as its own bullet); the caps prefix must be identical.
      const cutoff = clientLine.indexOf(' Correct at most');
      expect(cutoff).toBeGreaterThan(0);
      expect(workerLine).toBe(clientLine.slice(0, cutoff));
      expect(clientLine).toContain(`at most ${LEVEL_SPECS[level].maxWordsPerSentence} words per sentence`);
    }
  });

  it('has a deterministic fallback for every level on both sides', () => {
    for (const level of LADDER) {
      const line = levelFallbackLine(level);
      expect(FALLBACK_LINES[level]).toEqual(line);
      expect(line.de.trim().length).toBeGreaterThan(0);
      expect(line.ar.trim().length).toBeGreaterThan(0);
    }
    expect(levelFallbackLine('C1' as CEFRLevel)).toEqual(FALLBACK_LINES.A1);
  });
});
