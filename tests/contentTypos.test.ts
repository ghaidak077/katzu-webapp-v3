import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Regression for the two content typos the audit found in Pass 0/Type 1.
 *
 * `einpaken` was not a German word at all — the verb is *einpacken* — and it was
 * the headword a learner would be taught. The `der Geschmack` row carried a
 * nonsense Arabic word ("تبليبي") as its example translation and the invented
 * plural "die Geschmacker". Both files reach the app through the content load,
 * so these strings are learner-facing text, not notes.
 */

const AUSBILDUNG_PATH = 'docs/content/curriculum-ausbildung-exams.json';
const COVERAGE_PATH = 'docs/content/curriculum-coverage-fix.json';

interface VocabRow {
  german: string;
  plural?: string;
  example_de?: string;
  example_ar?: string;
}

function load(path: string): { vocabulary: VocabRow[]; starter_phrases: Array<{ german: string }> } {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('einpacken is spelled with its c', () => {
  it('has no trace of the non-word einpaken anywhere in the file', () => {
    const raw = readFileSync(AUSBILDUNG_PATH, 'utf8');
    expect(raw).not.toContain('einpaken');
    expect(raw).toContain('einpacken');
  });

  it('keeps the phrase that used the typo as a real German sentence', () => {
    const phrase = load(AUSBILDUNG_PATH).starter_phrases.find((p) =>
      p.german.includes('Brötchen mit Wurst'),
    );
    expect(phrase?.german).toBe('Meine Mutter will mir jeden Tag Brötchen mit Wurst einpacken.');
  });

  it('names the verb in the headword a learner is taught', () => {
    const row = load(AUSBILDUNG_PATH).vocabulary.find((v) => v.german === 'einpacken');
    expect(row?.german).toBe('einpacken');
  });
});

describe('the der Geschmack vocabulary row', () => {
  it('gives the standard plural, not an invented one', () => {
    const row = load(COVERAGE_PATH).vocabulary.find((v) => v.german === 'der Geschmack');
    expect(row?.plural).toBe('die Geschmäcker');
  });

  it('keeps the Arabic example free of stray non-Arabic words', () => {
    const row = load(COVERAGE_PATH).vocabulary.find((v) => v.german === 'der Geschmack');
    const arabic = row?.example_ar ?? '';
    expect(arabic.length).toBeGreaterThan(5);
    // Arabic script, spaces and punctuation only: the old text carried a
    // nonsense word (تبليبي) that no Arabic reader would recognise.
    expect(arabic).toMatch(/^[\u0600-\u06FF\s.,،!?؟؛:—–-]+$/);
    expect(arabic).not.toContain('تبليبي');
  });
});
