/**
 * Step 5 — the day-0 finish-line rule, pure and total.
 *
 * The gate decides whether a report may celebrate at all, and the copy functions
 * supply exactly the brief's Arabic. Both are tested exhaustively here because a
 * rule that changes what a brand-new learner reads on their very first screen is
 * a rule three surfaces could disagree about if left to browser tests alone:
 *  - the gate (guided ∧ live ∧ exactly-one-session, decided only once loaded)
 *  - the «جمل» agreement for the sentence line (1 as a word, 2–10 plural, 11+ singular)
 *  - the sentence selection (zero → only the honest zero line; N=0 with M≥1 →
 *    «مع مساعدة»; N≥1 → «بنفسك»)
 *  - the corrections teaser (hidden when k=0)
 */

import { describe, expect, it } from 'vitest';
import {
  arSentenceCount,
  dayZeroCelebration,
  dayZeroCorrectionsLine,
  isDayZeroFinish,
} from '@/features/report/dayZeroFinish';

describe('isDayZeroFinish — the gate', () => {
  const base = { guided: true, sessionsCount: 1, fromRecovered: false };

  it('is day-0 only when the flag is on, the count loaded as exactly 1, and live', () => {
    expect(isDayZeroFinish(base)).toBe(true);
  });

  it('flag OFF: never day-0, whatever the count', () => {
    expect(isDayZeroFinish({ ...base, guided: false })).toBe(false);
    expect(isDayZeroFinish({ guided: false, sessionsCount: 1, fromRecovered: false })).toBe(false);
    expect(isDayZeroFinish({ guided: false, sessionsCount: undefined, fromRecovered: false })).toBe(false);
  });

  it('while the count is still loading (undefined/null), it is "no" — never a flash', () => {
    // A returning learner's count is undefined for a moment; that must not render
    // a celebration and then un-render it. The gate treats loading as "no".
    expect(isDayZeroFinish({ ...base, sessionsCount: undefined })).toBe(false);
    expect(isDayZeroFinish({ ...base, sessionsCount: null })).toBe(false);
  });

  it('a recovered rebuild is never day-0, even with one session', () => {
    expect(isDayZeroFinish({ ...base, fromRecovered: true })).toBe(false);
  });

  it('a returning learner (more than one session) is never day-0', () => {
    expect(isDayZeroFinish({ ...base, sessionsCount: 2 })).toBe(false);
    expect(isDayZeroFinish({ ...base, sessionsCount: 3 })).toBe(false);
  });

  it('zero sessions is not the first *finished* conversation', () => {
    expect(isDayZeroFinish({ ...base, sessionsCount: 0 })).toBe(false);
  });
});

describe('arSentenceCount — the «جمل» agreement', () => {
  it('writes 1 as a word, never "1 جمل"', () => {
    expect(arSentenceCount(1)).toBe('جملة واحدة');
    expect(arSentenceCount(1)).not.toMatch(/\d/);
  });

  it('uses the plural for 2–10', () => {
    expect(arSentenceCount(2)).toBe('2 جمل');
    expect(arSentenceCount(10)).toBe('10 جمل');
  });

  it('returns to the singular from 11', () => {
    expect(arSentenceCount(11)).toBe('11 جملة');
    expect(arSentenceCount(50)).toBe('50 جملة');
  });

  it('clamps negatives and nonsense without throwing', () => {
    expect(arSentenceCount(-3)).toBe('0 جملة');
    expect(arSentenceCount(Number.NaN)).toBe('0 جملة');
  });
});

describe('dayZeroCelebration — the sentence selection', () => {
  it('completed: chooses the completed headline', () => {
    const out = dayZeroCelebration({ completedNaturally: true, sentencesSpoken: 5, independentSentences: 5 });
    expect(out.headlineAr).toBe('أنجزت محادثتك الأولى!');
  });

  it('ended early: chooses the early headline, never "completed"', () => {
    const out = dayZeroCelebration({ completedNaturally: false, sentencesSpoken: 5, independentSentences: 5 });
    expect(out.headlineAr).toBe('بدأتَ رحلتك — هذه أول محادثة لك.');
  });

  it('N=1 → the word form', () => {
    const out = dayZeroCelebration({ completedNaturally: true, sentencesSpoken: 1, independentSentences: 1 });
    expect(out.sentenceAr).toBe('أنجزتَ جملة واحدة بنفسك — وهذه بدايتك.');
  });

  it('N=2 and N=10 → the plural', () => {
    expect(
      dayZeroCelebration({ completedNaturally: true, sentencesSpoken: 2, independentSentences: 2 }).sentenceAr,
    ).toBe('أنجزتَ 2 جمل بنفسك — وهذه بدايتك.');
    expect(
      dayZeroCelebration({ completedNaturally: true, sentencesSpoken: 10, independentSentences: 10 }).sentenceAr,
    ).toBe('أنجزتَ 10 جمل بنفسك — وهذه بدايتك.');
  });

  it('N=11 → back to the singular', () => {
    expect(
      dayZeroCelebration({ completedNaturally: true, sentencesSpoken: 11, independentSentences: 11 }).sentenceAr,
    ).toBe('أنجزتَ 11 جملة بنفسك — وهذه بدايتك.');
  });

  it('spoken with N=0 → every sentence took help («مع مساعدة»), counting M right', () => {
    const m1 = dayZeroCelebration({ completedNaturally: false, sentencesSpoken: 1, independentSentences: 0 });
    expect(m1.sentenceAr).toBe('قلتَ جملة واحدة مع مساعدة — وهذه بدايتك.');
    const m3 = dayZeroCelebration({ completedNaturally: false, sentencesSpoken: 3, independentSentences: 0 });
    expect(m3.sentenceAr).toBe('قلتَ 3 جمل مع مساعدة — وهذه بدايتك.');
  });

  it('zero spoken → no celebration sentence, only the honest zero line', () => {
    const out = dayZeroCelebration({ completedNaturally: false, sentencesSpoken: 0, independentSentences: 0 });
    expect(out.sentenceAr).toBeNull();
    expect(out.zeroLineAr).toBe('لم تُسجَّل أي جملة في هذه المحادثة — لا مشكلة، التدرّب كله ما زال في مكانه.');
  });
});

describe('dayZeroCorrectionsLine — the first-view teaser', () => {
  it('k=0 → empty (the line is not rendered at all)', () => {
    expect(dayZeroCorrectionsLine(0)).toBe('');
  });

  it('k=1 → singular', () => {
    expect(dayZeroCorrectionsLine(1)).toBe('تصحيح واحد من هذه الجلسة — ستجدها في تفاصيل الجلسة');
  });

  it('k=2 and k=10 → plural', () => {
    expect(dayZeroCorrectionsLine(2)).toBe('2 تصحيحات من هذه الجلسة — ستجدها في تفاصيل الجلسة');
    expect(dayZeroCorrectionsLine(10)).toBe('10 تصحيحات من هذه الجلسة — ستجدها في تفاصيل الجلسة');
  });

  it('k=11 → back to the singular form', () => {
    expect(dayZeroCorrectionsLine(11)).toBe('11 تصحيح من هذه الجلسة — ستجدها في تفاصيل الجلسة');
  });
});