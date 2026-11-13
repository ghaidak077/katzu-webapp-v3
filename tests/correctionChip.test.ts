import { describe, expect, it } from 'vitest';
import { chipCorrectionFor, editDistance, maxChipDistance, normalizeForChip } from '../src/lib/conversation/correctionChip';

describe('the correction chip', () => {
  it('shows the learner sentence fixed, with the model reason', () => {
    const chip = chipCorrectionFor('ich mochte ein kaffee', 'Ich möchte einen Kaffee', 'بعد möchte يأتي الاسم في حالة النصب.');
    expect(chip).toEqual({
      original: 'ich mochte ein kaffee',
      corrected: 'Ich möchte einen Kaffee',
      reasonAr: 'بعد möchte يأتي الاسم في حالة النصب.',
    });
  });

  it('stays closed when only case or punctuation differs', () => {
    expect(chipCorrectionFor('hallo', 'Hallo!')).toBeNull();
    expect(chipCorrectionFor('guten tag', 'Guten Tag.')).toBeNull();
  });

  it('stays closed for a paraphrase, so it never teaches a sentence the learner did not write', () => {
    expect(chipCorrectionFor('kaffee', 'Ich hätte gern einen Kaffee mit Milch, bitte.')).toBeNull();
  });

  it('stays closed when the model repeats the uncorrected text', () => {
    expect(chipCorrectionFor('mit kart bitte', 'mit kart bitte', 'Karte hat ein e')).toBeNull();
  });

  it('needs both sides', () => {
    expect(chipCorrectionFor('', 'Hallo')).toBeNull();
    expect(chipCorrectionFor('Hallo', '')).toBeNull();
  });

  it('counts edits on letters only, so a comma is free', () => {
    expect(normalizeForChip('  Guten, Tag! ')).toBe('guten tag');
    expect(editDistance('kaffee', 'kafee')).toBe(1);
    expect(maxChipDistance(9)).toBe(2);
    expect(maxChipDistance(40)).toBe(8);
  });
});
