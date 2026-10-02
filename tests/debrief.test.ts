import { describe, expect, it } from 'vitest';
import { DEBRIEF_PHRASE_LIMIT, buildSessionDebrief, type SessionDebriefInput } from '../src/lib/debrief/debrief';

/**
 * The Phase-2 debrief is deterministic by contract: the same episode data must
 * always produce the same Arabic debrief, with no AI call behind it. These
 * tests pin both the determinism and the honest-content rules.
 */
const base: SessionDebriefInput = {
  scenarioTitle: 'في المطار',
  level: 'A1',
  mode: 'practice',
  sentencesSpoken: 4,
  independentSentences: 2,
  assistedSentences: 2,
  accuracyPercent: 50,
  mistakes: [
    { original: 'Ich gehe zu die Kasse', corrected: 'Ich gehe zur Kasse', grammarRule: 'حروف الجرعة: zu + der' },
    { original: 'Ich habe das Koffer', corrected: 'Ich habe den Koffer', grammarRule: 'الأدة: Koffer مذكّر' },
    { original: 'Ich bin ein Taxi genommen', corrected: 'Ich habe ein Taxi genommen', grammarRule: 'الماضي: haben مع لفق' },
  ],
};

describe('buildSessionDebrief', () => {
  it('is deterministic: identical input, identical output', () => {
    expect(buildSessionDebrief(base)).toEqual(buildSessionDebrief({ ...base }));
  });

  it('names what went well: independence first, then what to fix', () => {
    const debrief = buildSessionDebrief(base);
    expect(debrief.didWellAr[0]).toContain('بلا تلميح');
    // A weak accuracy number is never quoted back at the learner; the note
    // points at the lever (the most repeated mistake) instead.
    expect(debrief.didWellAr.some((line) => line.includes('الخطأ المتكرر'))).toBe(true);
    expect(debrief.didWellAr.join(' ')).not.toContain('50%');
  });

  it('caps the top mistakes at two, most important first', () => {
    const debrief = buildSessionDebrief(base);
    expect(debrief.topMistakesAr).toHaveLength(2);
    expect(debrief.topMistakesAr[0].corrected).toBe('Ich gehe zur Kasse');
    expect(debrief.topMistakesAr[0].noteAr.length).toBeGreaterThan(0);
  });

  it('partitions the corrections: top mistakes first, the capsule takes the rest, at most three kept', () => {
    const debrief = buildSessionDebrief(base);
    expect(debrief.keepPhrases).toHaveLength(1); // 3 corrections − 2 named as top mistakes
    for (const phrase of debrief.keepPhrases) {
      expect(base.mistakes.some((mistake) => mistake.corrected === phrase.german)).toBe(true);
      expect(phrase.arabic.length).toBeGreaterThan(0);
    }
    // No overlap: every kept phrase is one the top-mistakes list did NOT name.
    const topSet = new Set(debrief.topMistakesAr.map((mistake) => mistake.corrected));
    for (const phrase of debrief.keepPhrases) {
      expect(topSet.has(phrase.german)).toBe(false);
    }
  });

  it('ends with a "what you can now do" line that names the situation', () => {
    const debrief = buildSessionDebrief(base);
    expect(debrief.canNowAr).toContain('في المطار');
    expect(debrief.canNowAr).toContain('تستطيع');
  });

  it('stays honest on an empty session: no invented praise, no phrases', () => {
    const debrief = buildSessionDebrief({
      ...base,
      sentencesSpoken: 0,
      independentSentences: 0,
      assistedSentences: 0,
      accuracyPercent: null,
      mistakes: [],
    });
    expect(debrief.didWellAr).toEqual([]);
    expect(debrief.topMistakesAr).toEqual([]);
    expect(debrief.keepPhrases).toEqual([]);
    expect(debrief.headlineAr).toContain('دون جُمل');
  });

  it('celebrates a clean session without drifting into fake numbers', () => {
    const debrief = buildSessionDebrief({
      ...base,
      sentencesSpoken: 5,
      independentSentences: 5,
      assistedSentences: 0,
      accuracyPercent: 100,
      mistakes: [],
    });
    expect(debrief.topMistakesAr).toEqual([]);
    expect(debrief.didWellAr.join(' ')).toContain('100%');
    expect(debrief.didWellAr.join(' ')).toContain('أصعب');
  });

  it('frames the practice note by level: copy at A0, produce at B1', () => {
    const a0 = buildSessionDebrief({ ...base, level: 'A0' });
    const b1 = buildSessionDebrief({ ...base, level: 'B1' });
    expect(a0.topMistakesAr[0].noteAr).toContain('بصوت مسموع');
    expect(b1.topMistakesAr[0].noteAr).toContain('من عندك');
  });

  it('uses the unaided wording when the episode was a REAL (no-help) conversation', () => {
    const debrief = buildSessionDebrief({ ...base, mode: 'real' });
    expect(debrief.canNowAr).toContain('دون مساعدة');
    expect(debrief.headlineAr).toContain('من البداية إلى نهايته');
    expect(debrief.headlineAr).toContain('بلا مساعدة');
  });

  it('compares this attempt with the previous one only when a previous count exists', () => {
    // No previous attempt recorded -> no invented baseline.
    expect(buildSessionDebrief({ ...base, mistakes: base.mistakes.slice(0, 1) }).compareToLastAr).toBeNull();
    expect(buildSessionDebrief({ ...base, previousMistakeCount: null }).compareToLastAr).toBeNull();

    // Fewer corrections than last time is stated as improvement.
    const improved = buildSessionDebrief({ ...base, mistakes: base.mistakes.slice(0, 1), previousMistakeCount: 3 });
    expect(improved.compareToLastAr).toContain('تحسّنت');
    expect(improved.compareToLastAr).toContain('3');

    // More corrections is not framed as failure — the trial produced real items.
    const harder = buildSessionDebrief({ ...base, previousMistakeCount: 0 });
    expect(harder.compareToLastAr).toContain('جرّبت أكثر');
  });

  // V21 regression (Phase 11): the same correction must never appear twice in
  // the debrief — once as a keep-phrase and again as a top-mistake entry. The
  // top-mistakes list (with its coaching note) has priority; the capsule only
  // takes corrections the mistake list did not already name.
  it('never shows the same correction twice (top-mistake wins over keep-phrase)', () => {
    const debrief = buildSessionDebrief(base);
    const topSet = new Set(debrief.topMistakesAr.map((mistake) => mistake.corrected));
    for (const phrase of debrief.keepPhrases) {
      expect(topSet.has(phrase.german)).toBe(false);
    }

    // With exactly one mistake it is consumed entirely by the top-mistakes
    // list (which carries the actionable note): the capsule stays empty.
    const single = buildSessionDebrief({
      ...base,
      mistakes: [base.mistakes[0]],
    });
    expect(single.topMistakesAr.map((mistake) => mistake.corrected)).toContain('Ich gehe zur Kasse');
    expect(single.keepPhrases).toEqual([]);
  });
});
