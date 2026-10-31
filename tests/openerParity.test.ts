import { describe, expect, it } from 'vitest';
// @ts-expect-error — the worker is plain JS (no types), imported the way the turn route imports it.
import { openerForLevel as workerOpenerForLevel } from '../cloudflare-turn-guard.js';
import { openerForLevel as appOpenerForLevel } from '../src/lib/conversation/opener';
import type { CEFRLevel } from '../src/types/models';

/**
 * The bare-greeting guard now re-asks the scenario's STORED opener selected by
 * scenario id + level. The ladder that picks it lives twice: `opener.ts` in the
 * app (which renders the first bubble) and `cloudflare-turn-guard.js` in the
 * worker (which re-asks). If the two disagree, the learner sees one question
 * open the scene and a different one pushed at them later. This pins them equal.
 */
const LEVELS: CEFRLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2'];

/** The worker receives `resolveScenarioIdentity().openers` — the same row, short keys. */
const shortKeys = (scenario: Record<string, unknown>) => ({
  a0: scenario.initial_message_a0,
  a1: scenario.initial_message_a1,
  a2: scenario.initial_message_a2,
  b1: scenario.initial_message_b1,
  b2: scenario.initial_message_b2,
});

const FULL = {
  initial_message_a0: '',
  initial_message_a1: 'Guten Tag. Fehlt Ihr Gepäck?',
  initial_message_a2: 'Guten Tag. Willkommen am Flughafen. Fehlt Ihr Gepäck?',
  initial_message_b1: 'Guten Tag. Haben Sie Ihren Pass dabei?',
  initial_message_b2: 'Guten Tag. Beschreiben Sie mir bitte kurz Ihren Koffer.',
};

const A0_ONLY = {
  initial_message_a0: 'Hallo! Ich heiße Anna.',
  initial_message_a1: 'Guten Tag. Fehlt Ihr Gepäck?',
  initial_message_a2: '',
  initial_message_b1: '',
  initial_message_b2: '',
};

describe('the worker opener ladder matches the app ladder', () => {
  it.each([FULL, A0_ONLY, {}])('picks the same opener for every level', (scenario) => {
    for (const level of LEVELS) {
      expect(workerOpenerForLevel(shortKeys(scenario as any), level)).toBe(appOpenerForLevel(scenario as any, level));
    }
  });

  it('falls back from an empty A0 to the A1 line', () => {
    expect(workerOpenerForLevel(shortKeys(FULL), 'A0')).toBe(FULL.initial_message_a1);
  });

  it('returns an empty string when nothing is stored', () => {
    expect(workerOpenerForLevel({}, 'A1')).toBe('');
    expect(workerOpenerForLevel(null, 'A1')).toBe('');
  });
});
