import { describe, expect, it } from 'vitest';
import { buildExamCard, firstNameOf, MOCK_NOTICE_AR } from '../src/lib/debrief/examCard';
import { SHARE_NOTICE_AR } from '../src/lib/debrief/examShareImage';
import type { SessionDebrief } from '../src/lib/debrief/debrief';

/**
 * V24 Phase 5 — the mock-exam result card.
 *
 * The card is deterministic (same session data in, same card out), costs no AI
 * call, and is bounded by three honesty rules that are pinned here:
 *   1. it always carries the محاكاة notice;
 *   2. it never claims an official score, pass/fail, or exam-body affiliation;
 *   3. it only ever shows numbers the session itself produced.
 */

function debriefOf(overrides: Partial<SessionDebrief> = {}): SessionDebrief {
  return {
    headlineAr: 'أنتجت 4 جُمل في موقف «اختبار».',
    didWellAr: ['أنتجت 2 جملة من دماغك مباشرة بلا تلميح — أكثر ما يهم.'],
    topMistakesAr: [],
    keepPhrases: [],
    canNowAr: 'الآن تستطيع أن تُدير حديثاً كاملاً بالألمانية.',
    ...overrides,
  };
}

const baseInput = {
  scenarioTitle: 'Gemeinsam planen',
  sentencesSpoken: 4,
  independentSentences: 2,
  accuracyPercent: 80,
  mistakes: [
    { original: 'Ich gehen morgen', corrected: 'Ich gehe morgen', grammarRule: 'تصريف الفعل' },
    { original: 'Wir kann das machen', corrected: 'Wir können das machen', grammarRule: 'النموذجية' },
    { original: 'Danke fur dich', corrected: 'Danke für dich', grammarRule: 'الأمرة' },
  ],
  debrief: debriefOf(),
};

describe('examCard — the honesty contract (V24 Phase 5)', () => {
  it('always carries the محاكاة notice — on the card and on the share image', () => {
    const card = buildExamCard(baseInput);
    expect(card.noticeAr).toBe(MOCK_NOTICE_AR);
    expect(card.noticeAr).toContain('محاكاة');
    expect(card.noticeAr).toContain('ليست الامتحان الرسمي');
    expect(SHARE_NOTICE_AR).toContain('محاكاة');
    expect(SHARE_NOTICE_AR).toContain('ليست الامتحان الرسمي');
  });

  it('never claims a score, pass/fail, or exam-body affiliation', () => {
    const card = buildExamCard({ ...baseInput, accuracyPercent: 100, sentencesSpoken: 12 });
    // The notice is excluded: its whole job is to DENY an official score, so
    // the scan must not punish the negation itself.
    const allText = [card.taskDoneAr, ...card.fluencyAr, card.nextStepAr].join(' ');
    for (const banned of ['ناجح', 'راسب', 'درجة', 'درجتك', 'مقبول', 'معدل', 'Goethe', 'ÖSD', 'telc', 'DTZ', 'نقطة معتمدة']) {
      expect(allText).not.toContain(banned);
    }
    // The notice denies affiliation and contains no provider name either.
    expect(card.noticeAr).not.toMatch(/Goethe|ÖSD|telc|DTZ/);
    // Percentages appear only as the session's own independent-sentence accuracy.
    expect(card.fluencyAr.join(' ')).toContain('100%');
  });

  it('is deterministic — identical input, identical output', () => {
    expect(buildExamCard(baseInput)).toEqual(buildExamCard(baseInput));
  });

  it('names at most two corrections, in debrief (most important) order', () => {
    const card = buildExamCard(baseInput);
    expect(card.topCorrections).toHaveLength(2);
    expect(card.topCorrections[0]).toEqual({ original: 'Ich gehen morgen', corrected: 'Ich gehe morgen' });
  });

  it('uses only session-produced numbers in the fluency lines', () => {
    const card = buildExamCard(baseInput);
    const joined = card.fluencyAr.join(' ');
    expect(joined).toContain('4');
    expect(joined).toContain('2');
    expect(joined).not.toContain('3'); // nothing invented between 2 and 4
  });

  it('handles the empty session honestly — no invented achievement', () => {
    const card = buildExamCard({
      ...baseInput,
      sentencesSpoken: 0,
      independentSentences: 0,
      accuracyPercent: null,
      mistakes: [],
    });
    expect(card.taskDoneAr).toContain('لم تكتمل');
    expect(card.nextStepAr).toContain('أعد المحاكاة');
    expect(card.topCorrections).toHaveLength(0);
  });
});

describe('firstNameOf — the share image never carries a full name', () => {
  it('keeps only the first token', () => {
    expect(firstNameOf('أحمد محمد علي')).toBe('أحمد');
    expect(firstNameOf('Sara Lena Weber')).toBe('Sara');
  });

  it('strips nothing but whitespace/titles and survives junk safely', () => {
    expect(firstNameOf('  منى  ')).toBe('منى');
    expect(firstNameOf('')).toBe('');
    expect(firstNameOf(null)).toBe('');
    expect(firstNameOf(undefined)).toBe('');
    // A very long first token is truncated, never fatal.
    expect(firstNameOf('x'.repeat(60))).toHaveLength(24);
  });
});
