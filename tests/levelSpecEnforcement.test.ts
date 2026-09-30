import { describe, expect, it } from 'vitest';
import {
  FALLBACK_LINES,
  TENSE_MARKERS,
  correctionBudgetFor,
  levelFallbackLine,
  validateGermanAgainstLevel,
} from '../cloudflare-level-spec';

/**
 * The worker's deterministic gate between the model's German and the learner.
 * These are the two failure directions that matter: it must catch what the
 * prompt forbids (so the learner never reads off-spec German), and it must not
 * catch legal sentences (so a valid turn is never replaced by a fallback line).
 */
describe('validateGermanAgainstLevel', () => {
  describe('sentence-length cap', () => {
    it('blocks a sentence past the level cap', () => {
      // 8 words — legal at A1, over the A0 cap.
      const eightWords = 'Ich habe heute einen sehr langen Tag gearbeitet';
      expect(eightWords.trim().split(/\s+/)).toHaveLength(8);
      expect(validateGermanAgainstLevel(eightWords, 'A0').ok).toBe(false);
      expect(validateGermanAgainstLevel(eightWords, 'A1').ok).toBe(true);
    });

    it('accepts a sentence exactly at the cap', () => {
      const sixWords = 'Ich verstehe das Problem nicht ganz';
      expect(sixWords.trim().split(/\s+/)).toHaveLength(6);
      expect(validateGermanAgainstLevel(sixWords, 'A0').ok).toBe(true);
    });

    it('measures per sentence, not per reply', () => {
      const twoShort = 'Ich bin müde. Aber ich lerne weiter.';
      expect(validateGermanAgainstLevel(twoShort, 'A0').ok).toBe(true);
      const secondTooLong = 'Ok. Ich habe heute mit meiner neuen Kollegin gesprochen';
      expect(validateGermanAgainstLevel(secondTooLong, 'A0').ok).toBe(false);
    });

    it('rejects an empty reply', () => {
      expect(validateGermanAgainstLevel('', 'A1').ok).toBe(false);
      expect(validateGermanAgainstLevel('   ', 'A1').ok).toBe(false);
    });
  });

  describe('tense caps', () => {
    it('blocks the Perfekt at A0, where only Präsens is allowed', () => {
      expect(validateGermanAgainstLevel('Ich habe gegessen', 'A0').ok).toBe(false);
      // "habe" alone is present-tense auxiliary and must NOT be flagged.
      expect(validateGermanAgainstLevel('Ich habe Hunger', 'A0').ok).toBe(true);
    });

    it('catches the Perfekt by participle shape, not by auxiliary', () => {
      for (const marker of ['gemacht', 'gesagt', 'gewesen', 'gekommen']) {
        const withSein = marker === 'gewesen' || marker === 'gekommen';
        const reply = withSein ? `Ich bin ${marker}` : `Ich habe ${marker}`;
        expect(validateGermanAgainstLevel(reply, 'A0').ok).toBe(false);
        // The same participle is legal from A1 up.
        expect(validateGermanAgainstLevel(reply, 'A1').ok).toBe(true);
      }
    });

    it('allows möchte at every level (polite Präsens, not Konjunktiv II)', () => {
      expect(validateGermanAgainstLevel('Ich möchte einen Kaffee', 'A0').ok).toBe(true);
      expect(validateGermanAgainstLevel('Ich möchte einen Termin', 'A1').ok).toBe(true);
      expect(validateGermanAgainstLevel('Ich möchte einen Termin', 'A2').ok).toBe(true);
    });

    it('allows könnte wherever Präteritum is allowed, blocks it below', () => {
      // Ambiguous between Präteritum and Konjunktiv II: the ambiguity is
      // resolved in favour of the lower level — allowed with Präteritum.
      expect(validateGermanAgainstLevel('Könnten Sie das wiederholen', 'A1').ok).toBe(false);
      expect(validateGermanAgainstLevel('Könnten Sie das wiederholen', 'A2').ok).toBe(true);
      expect(validateGermanAgainstLevel('Könnten Sie das wiederholen', 'B1').ok).toBe(true);
    });

    it('blocks Präteritum markers at A0/A1 and allows them from A2', () => {
      for (const marker of TENSE_MARKERS.praeteritum) {
        expect(validateGermanAgainstLevel(`Ich ${marker} zu Hause`, 'A0').ok).toBe(false);
        expect(validateGermanAgainstLevel(`Ich ${marker} zu Hause`, 'A1').ok).toBe(false);
        expect(validateGermanAgainstLevel(`Ich ${marker} zu Hause`, 'A2').ok).toBe(true);
      }
    });

    it('blocks Konjunktiv II markers at A0–A2 and allows them at B1', () => {
      for (const marker of TENSE_MARKERS.konjunktiv_ii) {
        // könnte/könnten stay legal wherever Präteritum is (their own test above).
        if (marker === 'könnte' || marker === 'könnten') continue;
        expect(validateGermanAgainstLevel(`Ich ${marker} froh`, 'A2').ok).toBe(false);
        expect(validateGermanAgainstLevel(`Ich ${marker} froh`, 'B1').ok).toBe(true);
      }
    });

    it('needs an infinitive neighbour to call Futur, so Präsens werden is safe', () => {
      expect(validateGermanAgainstLevel('Ich werde kommen', 'A0').ok).toBe(false);
      expect(validateGermanAgainstLevel('Das wird teuer', 'A0').ok).toBe(true);
      expect(validateGermanAgainstLevel('Ich werde kommen', 'B1').ok).toBe(true);
    });
  });

  describe('connector caps', () => {
    it('blocks weil and dass at A0/A1, allows them from A2', () => {
      expect(validateGermanAgainstLevel('Ich lerne, weil ich arbeiten will', 'A0').ok).toBe(false);
      expect(validateGermanAgainstLevel('Ich lerne, weil ich arbeiten will', 'A1').ok).toBe(false);
      expect(validateGermanAgainstLevel('Ich lerne, weil ich arbeiten will', 'A2').ok).toBe(true);
      expect(validateGermanAgainstLevel('Ich sage, dass es spät ist', 'A1').ok).toBe(false);
      expect(validateGermanAgainstLevel('Ich sage, dass es spät ist', 'A2').ok).toBe(true);
    });

    it('matches connectors only as whole words', () => {
      // A word merely containing the letters must not trigger the gate.
      expect(validateGermanAgainstLevel('Wir üben weiter', 'A0').ok).toBe(true);
      expect(validateGermanAgainstLevel('Das Steuer ist kaputt', 'A0').ok).toBe(true);
    });

    it('allows every connector at B2', () => {
      expect(validateGermanAgainstLevel('Obwohl es spät ist, lerne ich weiter', 'B2').ok).toBe(true);
      expect(validateGermanAgainstLevel('Ich lerne, damit ich bestehe', 'B2').ok).toBe(true);
    });
  });

  describe('deterministic fallbacks', () => {
    it('keeps every fallback line inside its own level caps', () => {
      for (const [level, line] of Object.entries(FALLBACK_LINES) as Array<[keyof typeof FALLBACK_LINES, { de: string; ar: string }]>) {
        const result = validateGermanAgainstLevel(line.de, level);
        expect(result.ok, `${level} fallback: ${result.ok ? '' : (result as { reason: string }).reason}`).toBe(true);
      }
    });

    it('serves the A1 fallback for an unknown level rather than failing', () => {
      expect(levelFallbackLine('C1' as never)).toBe(FALLBACK_LINES.A1);
    });

    it('carries Arabic so the learner never sees an untranslated placeholder', () => {
      for (const line of Object.values(FALLBACK_LINES)) {
        expect(line.ar.length).toBeGreaterThan(0);
      }
    });
  });

  describe('correction budget', () => {
    it('follows the spec: 1 / 1 / 2 / 3 / 3 across A0–B2', () => {
      expect(correctionBudgetFor('A0')).toBe(1);
      expect(correctionBudgetFor('A1')).toBe(1);
      expect(correctionBudgetFor('A2')).toBe(2);
      expect(correctionBudgetFor('B1')).toBe(3);
      expect(correctionBudgetFor('B2')).toBe(3);
    });
  });
});
