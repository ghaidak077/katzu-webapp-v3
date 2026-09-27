import { describe, expect, it } from 'vitest';
import {
  buildGrammarEntries,
  buildVocabularyEntries,
  GRAMMAR_STATE_LABEL_AR,
  VOCABULARY_STATE_LABEL_AR,
} from '../src/lib/progress/collections';
import { reviewRefId } from '../src/lib/srs/engine';
import type { GrammarEntity, MistakeEntity, ScenarioEntity, VocabularyEntity } from '../src/types/models';

function word(overrides: Partial<VocabularyEntity> = {}): VocabularyEntity {
  return {
    id: 1,
    german: 'Termin',
    article: 'der',
    part_of_speech: 'Noun',
    translation_ar: 'موعد',
    translation_en: 'appointment',
    example_de: 'Ich habe morgen einen Termin.',
    example_ar: 'لدي موعد غداً.',
    example_en: '',
    level: 'A1',
    topic: 'food',
    ...overrides,
  } as VocabularyEntity;
}

function scenario(overrides: Partial<ScenarioEntity> = {}): Pick<ScenarioEntity, 'id' | 'title_ar' | 'category'> {
  return { id: 'cafe_order', title_ar: 'الطلب في المقهى', category: 'daily_life', ...overrides };
}

function rule(overrides: Partial<GrammarEntity> = {}): GrammarEntity {
  return {
    id: 'akkusativ_articles',
    title_ar: 'حالات الإعراب (Akkusativ / Dativ)',
    rule_de: 'Akkusativ nach möchte',
    level: 'A1',
    explanation_ar: '',
    example_de: '',
    example_ar: '',
    ...overrides,
  } as GrammarEntity;
}

function mistake(overrides: Partial<MistakeEntity> = {}): Pick<
  MistakeEntity,
  'grammarRule' | 'original' | 'corrected' | 'scenarioId' | 'timestamp' | 'isMastered'
> {
  return {
    grammarRule: 'Akkusativ: einen Kaffee',
    original: 'ein Kaffee',
    corrected: 'einen Kaffee',
    scenarioId: 'cafe_order',
    timestamp: 1_800_000_000_000,
    isMastered: false,
    ...overrides,
  };
}

describe('buildVocabularyEntries', () => {
  it('reads the memory state from the review queue, not from a guess', () => {
    const entries = buildVocabularyEntries({
      vocabulary: [word({ id: 1 }), word({ id: 2, german: 'Kaffee' }), word({ id: 3, german: 'Milch' })],
      reviewItems: [
        { refId: reviewRefId('vocab', 2), reps: 1, dueAt: 1 },
        { refId: reviewRefId('vocab', 3), reps: 3, dueAt: 2 },
      ],
      savedWords: [],
      scenarios: [scenario()],
    });

    expect(entries.map((entry) => entry.state)).toEqual(['learning', 'retained', 'unseen']);
    expect(entries.map((entry) => entry.stateLabelAr)).toContain(VOCABULARY_STATE_LABEL_AR.unseen);
    // The label for "retained" is tied to the engine's own threshold.
    expect(entries.find((entry) => entry.state === 'retained')?.stateLabelAr).toBe(
      VOCABULARY_STATE_LABEL_AR.retained,
    );
  });

  it('names the scenario a word came from, through the topic join', () => {
    const entries = buildVocabularyEntries({
      vocabulary: [word({ topic: 'documents' })],
      reviewItems: [],
      savedWords: [],
      scenarios: [scenario(), scenario({ id: 'embassy_appointment', title_ar: 'موعد في السفارة', category: 'official' })],
    });
    expect(entries[0].scenarioId).toBe('embassy_appointment');
    expect(entries[0].scenarioTitleAr).toBe('موعد في السفارة');
  });

  it('leaves the origin absent rather than inventing one', () => {
    const entries = buildVocabularyEntries({
      vocabulary: [word({ topic: 'technology' })],
      reviewItems: [],
      savedWords: [],
      scenarios: [scenario()],
    });
    expect(entries[0].scenarioId).toBeUndefined();
    expect(entries[0].scenarioTitleAr).toBeUndefined();
  });

  it('leads with the words the learner chose themselves, then the ones in review', () => {
    const entries = buildVocabularyEntries({
      vocabulary: [word({ id: 1 }), word({ id: 2, german: 'Kaffee' }), word({ id: 3, german: 'Milch' })],
      reviewItems: [{ refId: reviewRefId('vocab', 2), reps: 1, dueAt: 5 }],
      savedWords: [{ wordId: 1 }],
      scenarios: [scenario()],
    });
    expect(entries.map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(entries[0].isSaved).toBe(true);
  });

  it('keeps the article with the noun and drops rows with no usable content', () => {
    const entries = buildVocabularyEntries({
      vocabulary: [word({ article: 'die', german: 'Wohnung' }), word({ id: 9, german: '   ' })],
      reviewItems: [],
      savedWords: [],
      scenarios: [scenario()],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].de).toBe('die Wohnung');
  });
});

describe('buildGrammarEntries', () => {
  it('attributes recorded mistakes to the rule that describes them', () => {
    const entries = buildGrammarEntries({
      grammar: [rule()],
      mistakes: [mistake(), mistake({ timestamp: 1_800_000_500_000, scenarioId: 'job_interview' })],
      scenarios: [
        { id: 'cafe_order', title_ar: 'الطلب في المقهى' },
        { id: 'job_interview', title_ar: 'مقابلة عمل' },
      ],
    });
    expect(entries[0].state).toBe('repeating');
    expect(entries[0].mistakeCount).toBe(2);
    // The origin is where it happened most recently, not the first occurrence.
    expect(entries[0].scenarioTitleAr).toBe('مقابلة عمل');
    expect(entries[0].stateLabelAr).toBe(GRAMMAR_STATE_LABEL_AR.repeating);
  });

  it('calls a single mistake a correction, not a pattern', () => {
    const entries = buildGrammarEntries({ grammar: [rule()], mistakes: [mistake()], scenarios: [] });
    expect(entries[0].state).toBe('correcting');
    expect(entries[0].mistakeCount).toBe(1);
  });

  it('does not count mastered mistakes against the learner', () => {
    const entries = buildGrammarEntries({
      grammar: [rule()],
      mistakes: [mistake({ isMastered: true }), mistake({ isMastered: true })],
      scenarios: [],
    });
    expect(entries[0].state).toBe('not_met');
    expect(entries[0].mistakeCount).toBe(0);
  });

  it('leaves a rule it cannot classify neutral, without a made-up count', () => {
    const entries = buildGrammarEntries({
      grammar: [rule({ id: 'unmatched', title_ar: 'قاعدة بلا كلمات مفتاحية', rule_de: 'Sonderfall' })],
      mistakes: [mistake()],
      scenarios: [],
    });
    expect(entries[0].state).toBe('not_met');
    expect(entries[0].mistakeCount).toBe(0);
    expect(entries[0].stateLabelAr).toBe(GRAMMAR_STATE_LABEL_AR.not_met);
  });

  it('leads with the rules the learner is actually struggling with', () => {
    const entries = buildGrammarEntries({
      grammar: [
        rule({ id: 'articles', title_ar: 'أدوات التعريف (der / die / das)', rule_de: 'Artikel' }),
        rule(),
      ],
      mistakes: [mistake(), mistake({ timestamp: 1_900_000_000_000 })],
      scenarios: [],
    });
    expect(entries[0].id).toBe('akkusativ_articles');
    expect(entries[1].state).toBe('not_met');
  });
});
