import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkGerman } from '@/lib/conversation/germanChecker';
import { openerForLevel } from '@/lib/conversation/opener';
import type { CEFRLevel } from '@/types/models';

/**
 * The shipped-German-strings gate.
 *
 * WHY: every string in this file is content the learner can be shown as a model
 * sentence (a scenario opener, a starter phrase, or an answer-bank hint). If the
 * local corrector would change one of them, the product is teaching one form and
 * correcting it to another. That is worse than a missing hint. This gate fails on
 * ANY correction, so a new opener or curriculum phrase cannot ship unclean.
 */

interface ScenarioRow {
  initial_message_a0?: string;
  initial_message_a1?: string;
  initial_message_a2?: string;
  initial_message_b1?: string;
  initial_message_b2?: string;
}

const LEVELS: CEFRLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2'];

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function notClean(german: string): string | null {
  const result = checkGerman(german);
  return result.errors.length ? `${german} → ${result.corrected}` : null;
}

describe('shipped German strings survive the corrector unchanged', () => {
  it('every scenario opener is clean at every level', () => {
    const snapshot = readJson<{ scenarios?: ScenarioRow[] }>('scripts/language-data/content-snapshot.json');
    const bad: string[] = [];
    let count = 0;
    for (const scenario of snapshot.scenarios || []) {
      for (const level of LEVELS) {
        const text = String(openerForLevel(scenario, level) || '').trim();
        if (!text) continue;
        count += 1;
        const failure = notClean(text);
        if (failure) bad.push(`[${level}] ${failure}`);
      }
    }
    expect(count).toBeGreaterThan(100);
    expect(bad.slice(0, 20)).toEqual([]);
  });

  it('every starter phrase in the curriculum files is clean', () => {
    const dir = 'docs/content';
    const bad: string[] = [];
    let count = 0;
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      const data = readJson<{ starter_phrases?: Array<{ german?: string }> }>(join(dir, file));
      for (const row of data.starter_phrases || []) {
        const text = String(row.german || '').trim();
        if (!text) continue;
        count += 1;
        const failure = notClean(text);
        if (failure) bad.push(`${file}: ${failure}`);
      }
    }
    expect(count).toBeGreaterThan(300);
    expect(bad.slice(0, 20)).toEqual([]);
  });
});
