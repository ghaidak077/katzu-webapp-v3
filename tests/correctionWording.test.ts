import { describe, expect, it } from 'vitest';
import {
  CAPITALISATION_LABEL,
  classifyCorrection,
  correctionCardCopy,
  correctionRuleLabel,
} from '@/lib/conversation/correctionWording';

/**
 * The correction label the learner reads.
 *
 * The defect this pins: `halo` → `hallo` was labelled "Groß- und
 * Kleinschreibung" because the model echoed a rule that does not match the
 * only difference. A label that names the wrong rule is worse than no label —
 * it teaches the wrong thing — so the three forms below are the contract.
 */

describe('correctionRuleLabel', () => {
  it('names the doubled letter for halo → hallo instead of a capitalisation rule', () => {
    expect(correctionRuleLabel('halo', 'hallo', CAPITALISATION_LABEL)).toBe('Schreibung: Doppel-l');
  });

  it('still names the doubled letter when the learner also mis-cased the word (Halo → hallo)', () => {
    expect(correctionRuleLabel('Halo', 'hallo', CAPITALISATION_LABEL)).toBe('Schreibung: Doppel-l');
  });

  it('derives the same doubled-letter rule when the capital is the corrected form (HALO → hallo)', () => {
    expect(correctionRuleLabel('HALO', 'hallo', CAPITALISATION_LABEL)).toBe('Schreibung: Doppel-l');
  });

  it('keeps the capitalisation label when case is the only difference', () => {
    expect(correctionRuleLabel('ich möchte einen Kaffee', 'Ich möchte einen Kaffee', 'x')).toBe(
      CAPITALISATION_LABEL,
    );
  });

  it('shows no rule at all when the word is already correct (hallo → hallo)', () => {
    expect(correctionRuleLabel('hallo', 'hallo', CAPITALISATION_LABEL)).toBe('');
    expect(classifyCorrection('hallo', 'hallo')).toEqual({ label: '', kind: 'none' });
  });

  it('names a single dropped letter that is not doubled', () => {
    expect(correctionRuleLabel('Kafee', 'Kaffee', 'x')).toBe('Schreibung: Doppel-f');
    expect(correctionRuleLabel('Haus', 'Hauss', 'x')).toBe('Schreibung: Doppel-s');
  });

  it('describes an extra letter the learner doubled', () => {
    expect(correctionRuleLabel('hallo', 'halo', 'x')).toBe('Schreibung: ein Buchstabe zu viel');
  });

  it('describes a one-letter substitution such as an umlaut', () => {
    expect(correctionRuleLabel('schon', 'schön', 'x')).toBe('Schreibung: ö statt o');
  });

  it('falls back to the model rule only for differences it cannot classify', () => {
    expect(correctionRuleLabel('Ich habe Hund', 'Ich habe einen Hund', 'أدوات التعريف')).toBe(
      'أدوات التعريف',
    );
    expect(correctionRuleLabel('Ich habe Hund', 'Ich habe einen Hund')).toBe('');
  });

  it('treats missing sentences as no correction rather than a rule', () => {
    expect(correctionRuleLabel(undefined, 'hallo', 'x')).toBe('');
    expect(correctionRuleLabel('halo', undefined, 'x')).toBe('');
  });
});

/**
 * Production bug this pins: the chip said «Schreibung: Doppel-l» while the
 * model's Arabic explanation said to capitalise the first letter — the two
 * halves of one card taught different rules. The chip and explanation now come
 * from the same classification.
 */
describe('correctionCardCopy — chip and explanation agree', () => {
  const cases = [
    ['halo', 'hallo'],
    ['Halo', 'hallo'],
    ['HALO', 'hallo'],
    ['HALO', 'Hallo'],
  ] as const;

  it.each(cases)('%s → %s: a doubled-letter chip is explained as a doubled letter', (from, to) => {
    const copy = correctionCardCopy(from, to, CAPITALISATION_LABEL, 'اكتب الحرف الأول كبيرًا فقط');
    expect(copy.label).toBe('Schreibung: Doppel-l');
    expect(copy.explanationAr).toContain('مضعّف');
    expect(copy.explanationAr).not.toContain('اكتب الحرف الأول كبيرًا فقط');
  });

  it('names both errors when HALO → Hallo also differs in case', () => {
    const copy = correctionCardCopy('HALO', 'Hallo', CAPITALISATION_LABEL);
    expect(copy.label).toBe('Schreibung: Doppel-l');
    expect(copy.explanationAr).toBe('حرف l مضعّف، واكتب الحرف الأول كبيرًا والباقي صغيرًا.');
  });

  it('does not invent a case error when only the letter differs (halo → hallo)', () => {
    expect(correctionCardCopy('halo', 'hallo', CAPITALISATION_LABEL).explanationAr).toBe(
      'حرف l مضعّف.',
    );
  });

  it('names the lower-case target for Halo → hallo', () => {
    expect(correctionCardCopy('Halo', 'hallo', CAPITALISATION_LABEL).explanationAr).toBe(
      'حرف l مضعّف، واكتب الكلمة بحروف صغيرة.',
    );
  });

  it('explains a case-only correction instead of echoing the model', () => {
    const copy = correctionCardCopy('hallo', 'Hallo', 'x', 'قول مختلف تمامًا');
    expect(copy.label).toBe(CAPITALISATION_LABEL);
    expect(copy.explanationAr).toBe('اكتب الحرف الأول كبيرًا والباقي صغيرًا.');
  });

  it('keeps the model wording only when the difference cannot be classified', () => {
    expect(
      correctionCardCopy('Ich habe Hund', 'Ich habe einen Hund', 'أدوات التعريف', 'ناقص أداة'),
    ).toEqual({ label: 'أدوات التعريف', explanationAr: 'ناقص أداة' });
  });

  for (const [from, to] of cases) {
    it(`${from} → ${to}: chip equals correctionRuleLabel`, () => {
      expect(correctionCardCopy(from, to, CAPITALISATION_LABEL).label).toBe(
        correctionRuleLabel(from, to, CAPITALISATION_LABEL),
      );
    });
  }
});
