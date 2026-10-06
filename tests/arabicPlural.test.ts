/**
 * Arabic number agreement, across the whole grid rather than one number.
 *
 * The defect this module exists to prevent is systematic and easy to miss on
 * review: a hard-coded noun after a count looks fine in the one case you
 * happened to test. Arabic changes the form four times — singular, dual, 3–10
 * plural, then singular again from 11 — so every form is pinned here, including
 * the ones above 100 that a `% 10` implementation gets wrong.
 */

import { describe, expect, it } from 'vitest';
import { arCount, arNoun, arabicCountForm } from '@/lib/i18n/arabicCount';

const ITEM = {
  one: 'عنصر واحد',
  two: 'عنصران',
  few: 'عناصر',
  many: 'عنصراً',
} as const;

describe('arabicCountForm', () => {
  it('picks the singular for exactly one', () => {
    expect(arabicCountForm(1)).toBe('one');
  });

  it('picks the dual for exactly two — its own form, not "2 عنصر"', () => {
    expect(arabicCountForm(2)).toBe('two');
  });

  it('picks the plural across 3–10', () => {
    for (const n of [3, 4, 5, 8, 9, 10]) expect(arabicCountForm(n)).toBe('few');
  });

  it('returns to the singular from 11', () => {
    for (const n of [11, 15, 20, 99]) expect(arabicCountForm(n)).toBe('many');
  });

  it('treats zero as the many/singular form, never as "no items" silently', () => {
    // Callers decide what zero MEANS; the helper only supplies the shape.
    expect(arabicCountForm(0)).toBe('many');
  });

  it('reads the last two digits, not the last one, above ten', () => {
    // 103 is "103 عناصر" exactly as 3 is; 111 is "111 عنصراً" exactly as 11 is.
    // A `% 10` implementation gets both of these backwards.
    expect(arabicCountForm(103)).toBe('few');
    expect(arabicCountForm(111)).toBe('many');
    expect(arabicCountForm(100)).toBe('many');
  });

  it('keeps the hundred-and-one cases in the plain singular, as Arabic writes them', () => {
    // The classical grammar rule ("a number ending in 1 counts as one") would
    // give 101 = "101 عنصر واحد" and 102 = "102 عنصران". Neither is what a native
    // writer produces: they write "101 عنصر". Between a defensible rule and a
    // natural one, this app takes the natural one — and says so here rather than
    // shipping an option nobody would have chosen out loud.
    expect(arabicCountForm(101)).toBe('many');
    expect(arabicCountForm(102)).toBe('many');
    expect(arNoun(101, ITEM)).toBe('عنصراً');
  });

  it('survives negatives and nonsense without throwing', () => {
    expect(() => arabicCountForm(-3)).not.toThrow();
    expect(arabicCountForm(-3)).toBe('few');
    expect(arabicCountForm(Number.NaN)).toBe('many');
  });
});

describe('arNoun / arCount', () => {
  it('agrees with the number in the composed string', () => {
    expect(arNoun(1, ITEM)).toBe('عنصر واحد');
    expect(arNoun(2, ITEM)).toBe('عنصران');
    expect(arNoun(3, ITEM)).toBe('عناصر');
    expect(arNoun(11, ITEM)).toBe('عنصراً');
  });

  it('composes "count + agreeing noun"', () => {
    // One and the dual are written as WORDS: "2 عنصران" is not Arabic.
    expect(arCount(1, ITEM)).toBe('عنصر واحد');
    expect(arCount(2, ITEM)).toBe('عنصران');
    // From three up the numeral is used.
    expect(arCount(3, ITEM)).toBe('3 عناصر');
    expect(arCount(5, ITEM)).toBe('5 عناصر');
    expect(arCount(11, ITEM)).toBe('11 عنصراً');
  });

  it('never puts a digit in front of the one or the dual', () => {
    // This is the rule a naive `${n} ${noun}` gets wrong and a native speaker
    // reads instantly: 1 and 2 are words in Arabic, never digits.
    expect(arCount(1, ITEM)).not.toMatch(/\d/);
    expect(arCount(2, ITEM)).not.toMatch(/\d/);
    expect(arCount(1, ITEM)).not.toBe('1 عنصر واحد');
    expect(arCount(2, ITEM)).not.toBe('2 عنصران');
  });

  it('clamps a negative count to zero rather than printing it', () => {
    expect(arCount(-2, ITEM)).toBe('0 عنصراً');
    // How zero should READ is the caller's copy, not this module's: a paywall
    // says "انتهت جلساتك" rather than "0 جلسة". See `freeSessionsCopy`.
    expect(arNoun(0, ITEM)).toBe(ITEM.many);
    // `arNoun` works on magnitude, so it never clamps: a caller that forgot to
    // guard a negative still gets a real form rather than a NaN.
    expect(arNoun(-2, ITEM)).toBe(ITEM.two);
  });

  it('writes the numeral as a Western digit, the launch numeral rule', () => {
    // L12: every user-facing count is Western — «3 عناصر», never «٣ عناصر». The
    // digit shape has no option any more, so there is no second numeral helper
    // to pass in; `tests/westernNumerals.test.ts` guards the surfaces.
    expect(arCount(3, ITEM)).toBe('3 عناصر');
    expect(arCount(11, ITEM)).toBe('11 عنصراً');
    // and the dual is still a word, never a digit
    expect(arCount(2, ITEM)).toBe('عنصران');
  });
});

describe('the defects this replaced', () => {
  it('would have shipped "راجع 3 عنصراً الآن" — the exact measured string', () => {
    // Arabic takes the plural for 3–10. This is the line a learner read.
    expect(arCount(3, ITEM)).not.toBe('3 عنصراً');
  });

  it('would have shipped "2 أخطاء" where Arabic requires the dual', () => {
    expect(arNoun(2, ITEM)).not.toBe('أخطاء');
  });

  it('would have shipped "11 عناصر" where Arabic returns to the singular', () => {
    expect(arNoun(11, ITEM)).not.toBe('عناصر');
  });
});