import { describe, expect, it } from 'vitest';
import {
  CATEGORY_COPY,
  MISTAKE_CATEGORIES,
  classifyMistake,
  isSpellingOnly,
} from '@/lib/coach/taxonomy';
import { buildMistakeProfile, drillForCategory } from '@/lib/coach/profile';
import type { MistakeEntity } from '@/types/models';

let nextId = 1;
function mistake(overrides: Partial<MistakeEntity> = {}): MistakeEntity {
  return {
    id: nextId++,
    userId: 'current_user',
    scenarioId: 'cafe_order',
    original: 'Ich möchte ein Kaffee',
    corrected: 'Ich möchte einen Kaffee',
    grammarRule: 'Akkusativ',
    timestamp: 1_700_000_000_000,
    wasHintUsed: false,
    ...overrides,
  };
}

function times(count: number, overrides: Partial<MistakeEntity> = {}): MistakeEntity[] {
  return Array.from({ length: count }, () => mistake(overrides));
}

describe('mistake classification', () => {
  it('recognises a German case rule', () => {
    expect(classifyMistake('Akkusativ')).toBe('case');
    expect(classifyMistake('Dativ')).toBe('case');
  });

  it('recognises an Arabic explanation of the same thing', () => {
    expect(classifyMistake('حالة الإعراب بعد حرف الجر')).toBe('case');
  });

  it('prefers word order when the rule names both a verb and its position', () => {
    // "الفعل في المركز الثاني" mentions a verb *and* word order. Word order is the
    // actionable answer: the learner must move the verb, not conjugate it again.
    expect(classifyMistake('الفعل في المركز الثاني')).toBe('word_order');
    expect(classifyMistake('Verbposition im Nebensatz')).toBe('word_order');
  });

  it('recognises verb forms and tenses', () => {
    expect(classifyMistake('تصريف الفعل مع Perfekt')).toBe('verb_forms');
    expect(classifyMistake('Partizip Perfekt mit sein')).toBe('verb_forms');
  });

  it('recognises articles, including the Arabic wording', () => {
    expect(classifyMistake('أدوات التعريف der/die/das')).toBe('articles');
    expect(classifyMistake('Artikel und Genus')).toBe('articles');
  });

  it('recognises prepositions and vocabulary choice', () => {
    expect(classifyMistake('حرف الجر في المكان')).toBe('prepositions');
    expect(classifyMistake('اختيار المفردات')).toBe('vocabulary');
  });

  it('returns other rather than guessing when the rule text says nothing useful', () => {
    expect(classifyMistake('')).toBe('other');
    expect(classifyMistake('   ')).toBe('other');
  });

  it('always returns a category the profile knows how to render', () => {
    for (const rule of ['Akkusativ', 'حرف الجر', '', 'something unknown']) {
      expect(MISTAKE_CATEGORIES).toContain(classifyMistake(rule));
    }
    for (const category of MISTAKE_CATEGORIES) {
      expect(CATEGORY_COPY[category].labelAr.length).toBeGreaterThan(0);
      expect(CATEGORY_COPY[category].adviceAr.length).toBeGreaterThan(0);
    }
  });

  it('treats a capitalisation or umlaut slip as spelling, whatever the rule says', () => {
    // The learner knew the word; sending them to a grammar drill wastes their time.
    expect(classifyMistake('Akkusativ', 'Ich habe einen termin', 'Ich habe einen Termin')).toBe('spelling');
    expect(classifyMistake('', 'fur', 'für')).toBe('spelling');
    expect(isSpellingOnly('der Termin', 'Der Termin')).toBe(true);
  });

  it('does not call a real word change a spelling mistake', () => {
    expect(isSpellingOnly('ein Kaffee', 'einen Kaffee')).toBe(false);
    expect(classifyMistake('Akkusativ', 'ein Kaffee', 'einen Kaffee')).toBe('case');
    expect(isSpellingOnly('', '')).toBe(false);
  });
});

describe('error profile', () => {
  it('claims nothing when there is no evidence', () => {
    const profile = buildMistakeProfile([]);
    expect(profile.total).toBe(0);
    expect(profile.hasEnoughEvidence).toBe(false);
    expect(profile.headlineAr).toContain('لا توجد');
    expect(profile.top).toEqual([]);
  });

  it('refuses to name a pattern from one or two mistakes', () => {
    const profile = buildMistakeProfile(times(2, { grammarRule: 'Akkusativ' }));
    expect(profile.total).toBe(2);
    expect(profile.hasEnoughEvidence).toBe(false);
    expect(profile.detailAr).toContain('تحدث أكثر');
  });

  it('names the dominant category and how much of the total it is', () => {
    const profile = buildMistakeProfile([
      ...times(6, { grammarRule: 'Akkusativ' }),
      ...times(2, { grammarRule: 'الفعل في المركز الثاني' }),
    ]);
    expect(profile.hasEnoughEvidence).toBe(true);
    expect(profile.top[0].category).toBe('case');
    expect(profile.top[0].count).toBe(6);
    expect(profile.top[0].sharePercent).toBe(75);
    expect(profile.headlineAr).toContain(CATEGORY_COPY.case.labelAr);
    expect(profile.detailAr).toContain('75%');
  });

  it('never reports a mastered mistake as an open weakness', () => {
    const profile = buildMistakeProfile([
      ...times(3, { grammarRule: 'Akkusativ' }),
      ...times(2, { grammarRule: 'Akkusativ', isMastered: true }),
    ]);
    expect(profile.total).toBe(5);
    expect(profile.mastered).toBe(2);
    expect(profile.open).toBe(3);
    expect(profile.top[0].open).toBe(3);
    expect(profile.detailAr).toContain('أتقنت');
  });

  it('orders categories by frequency and breaks ties deterministically', () => {
    const build = () =>
      buildMistakeProfile([
        ...times(2, { grammarRule: 'حرف الجر' }),
        ...times(2, { grammarRule: 'Akkusativ' }),
        ...times(1, { grammarRule: 'Partizip Perfekt' }),
      ]).categories.map((stat) => stat.category);
    expect(build()).toEqual(build());
    expect(build()[0]).toBe('case');
  });

  it('sums shares to 100 across the whole set of mistakes', () => {
    const profile = buildMistakeProfile([
      ...times(3, { grammarRule: 'Akkusativ' }),
      ...times(1, { grammarRule: 'حرف الجر' }),
    ]);
    const total = profile.categories.reduce((sum, stat) => sum + stat.count, 0);
    expect(total).toBe(profile.total);
  });
});

describe('targeted drill', () => {
  it('drills only the chosen category, open mistakes first', () => {
    const mistakes = [
      mistake({ grammarRule: 'Akkusativ', isMastered: true }),
      mistake({ grammarRule: 'Akkusativ' }),
      mistake({ grammarRule: 'حرف الجر' }),
    ];
    const drill = drillForCategory(mistakes, 'case');
    expect(drill).toHaveLength(2);
    expect(drill.every((item) => classifyMistake(item.grammarRule!) === 'case')).toBe(true);
    expect(drill[0].isMastered).toBeFalsy();
  });

  it('returns nothing for a category the learner has never got wrong', () => {
    expect(drillForCategory([mistake({ grammarRule: 'Akkusativ' })], 'word_order')).toEqual([]);
  });

  it('respects the limit so a drill always ends', () => {
    const many = times(25, { grammarRule: 'Akkusativ' });
    expect(drillForCategory(many, 'case', 4)).toHaveLength(4);
  });

  it('handles an empty mistake bank without throwing', () => {
    expect(drillForCategory([], 'case')).toEqual([]);
    expect(buildMistakeProfile([]).categories).toEqual([]);
  });
});
