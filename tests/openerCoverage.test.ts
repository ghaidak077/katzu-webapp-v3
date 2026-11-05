import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import liveFixture from './fixtures/live-scenarios.json';
import { auditOpeners, describeMissing, keyOf, scenariosFrom } from '../scripts/audit-opener-coverage.mjs';
import { CI_ONLY_STEPS } from '../scripts/verify.mjs';

/**
 * The gate that compares the shipped Arabic map with the worker's real `/scenarios`.
 *
 * WHY THIS EXISTS
 * `firstMessageTranslation.test.ts` proves the committed fixture is fully translated.
 * That was already true on the day V47 shipped while 221 live openers rendered bare,
 * because the fixture was not the content the worker served. This file owns the other
 * half: the audit must notice a served first message with no gloss, and CI must run it
 * against the live worker rather than a snapshot someone remembered to refresh.
 */

const ARABIC = /[\u0600-\u06FF]/;

describe('served opener coverage audit', () => {
  it('passes when every served first message resolves to Arabic', () => {
    const payload = {
      scenarios: [
        { id: 'a', initial_message_a0: '', initial_message_a1: 'Hallo!', initial_message_a2: 'Guten Tag.' },
        { id: 'b', initial_message_b1: 'Wie geht es Ihnen?', initial_message_b2: '' },
      ],
    };
    const glosses = { 'Hallo!': 'مرحبا!', 'Guten Tag.': 'نهارك سعيد.', 'Wie geht es Ihnen?': 'كيف حالك؟' };
    const result = auditOpeners(payload, glosses);
    expect(result).toMatchObject({ scenarios: 2, openers: 3, covered: 3, missing: [] });
  });

  it('reports the scenario and level of every served opener with no gloss', () => {
    const payload = [
      { id: 'embassy_appointment', initial_message_a1: 'Guten Tag. Wie kann ich Ihnen helfen?' },
      { id: 'first_greetings', initial_message_a1: 'Hallo! Ich bin Frau Meier.' },
    ];
    const result = auditOpeners(payload, { 'Guten Tag. Wie kann ich Ihnen helfen?': 'نهارك سعيد. كيف يمكنني مساعدتك؟' });
    expect(result.openers).toBe(2);
    expect(result.covered).toBe(1);
    expect(result.missing).toEqual([
      { scenario: 'first_greetings', level: 'A1', text: 'Hallo! Ich bin Frau Meier.', reason: 'no gloss' },
    ]);
    expect(describeMissing(result.missing)[0]).toContain('first_greetings A1');
  });

  it('treats an empty or non-Arabic gloss as missing, not as covered', () => {
    const payload = [
      { id: 'blank', initial_message_a1: 'Eins' },
      { id: 'latin', initial_message_a1: 'Zwei' },
      { id: 'ok', initial_message_a1: 'Drei' },
    ];
    const result = auditOpeners(payload, { Eins: '   ', Zwei: 'two', Drei: 'ثلاثة' });
    expect(result.missing.map((miss) => [miss.scenario, miss.reason])).toEqual([
      ['blank', 'no gloss'],
      ['latin', 'gloss has no Arabic'],
    ]);
  });

  it('uses the same whitespace normalisation as the app lookup', () => {
    // A line break or a double space in a served message must still find its gloss;
    // otherwise the gate would report a false miss the learner never sees.
    const payload = [{ id: 'x', initial_message_b1: '  Guten   Tag.\nWie geht es?  ' }];
    const result = auditOpeners(payload, { 'Guten Tag. Wie geht es?': 'نهارك سعيد. كيف حالك؟' });
    expect(result.missing).toEqual([]);
    expect(keyOf('  Guten   Tag.\nWie geht es?  ')).toBe('Guten Tag. Wie geht es?');
  });

  it('accepts both payload shapes and rejects an unreadable one instead of auditing zero', () => {
    expect(scenariosFrom([{ id: 'a' }])).toHaveLength(1);
    expect(scenariosFrom({ scenarios: [{ id: 'a' }, { id: 'b' }] })).toHaveLength(2);
    expect(() => scenariosFrom({ error: 'db_unbound' })).toThrow(/neither an array/);
  });

  it('the committed live fixture is fully covered by the shipped map', () => {
    const result = auditOpeners(liveFixture);
    expect(result.scenarios).toBe(49);
    expect(result.missing, describeMissing(result.missing).join('\n')).toEqual([]);
    expect(result.openers).toBeGreaterThan(200);
  });

  it('CI runs the audit against the worker, not only the fixture', () => {
    const step = CI_ONLY_STEPS.find((entry) => entry.args?.includes('scripts/audit-opener-coverage.mjs'));
    expect(step, 'the served-opener gate left CI_ONLY_STEPS').toBeTruthy();
    expect(step?.cmd).toBe('node');
    // No `--offline`/`--fixture`: the point of the gate is the content the worker serves now.
    expect(step?.args).toEqual(['scripts/audit-opener-coverage.mjs']);
  });

  it('every committed gloss in the review corpus contains Arabic', () => {
    const extra = JSON.parse(
      readFileSync('scripts/language-data/opener-ar-extra.json', 'utf8'),
    ) as { openers: Record<string, string> };
    const bad = Object.entries(extra.openers).filter(([, arabic]) => !ARABIC.test(String(arabic)));
    expect(bad.map(([german]) => german)).toEqual([]);
  });
});
