import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CONTENT_COLUMNS,
  LOADABLE_TYPES,
  auditCurriculum,
  type AuditReport,
} from '@/lib/content/curriculumAudit';
import { scenarioToVocabTopic } from '@/lib/utils/scenarioVocab';

const DRAFT_PATH = fileURLToPath(new URL('../docs/content/curriculum-30day-module1.json', import.meta.url));

function loadShippedDraft(): any {
  return JSON.parse(readFileSync(DRAFT_PATH, 'utf8'));
}

function audit(draft: unknown): AuditReport {
  return auditCurriculum(draft, scenarioToVocabTopic);
}

function errorPaths(report: AuditReport): string[] {
  return report.errors.map((issue) => issue.path);
}

/**
 * A minimal draft that satisfies every rule, generated rather than pasted so a
 * change to the standard updates the fixture with it.
 */
function baseDraft(): any {
  const vocabulary = Array.from({ length: 15 }, (_, index) => {
    const n = index + 1;
    return {
      german: `Wort${n}`,
      article: '',
      plural: null,
      part_of_speech: 'Verb',
      translation_ar: `كلمة رقم ${n}`,
      translation_en: `word number ${n}`,
      example_de: `Das ist Wort${n}.`,
      example_ar: `هذه كلمة رقم ${n}.`,
      example_en: `This is word number ${n}.`,
      level: 'A1',
      topic: 'documents',
    };
  });

  return {
    _note: 'fixture',
    meta: {
      track: 'مسار تجريبي',
      moduleTitleAr: 'وحدة تجريبية',
      primaryLevel: 'A1',
      version: '0.0.0',
      designedFor: 'test fixture',
    },
    review: { status: 'pending', reviewedBy: null, reviewedAt: null, checklist: ['reviewed by a human'] },
    scenarios: [
      {
        id: 'test_scenario',
        title_de: 'Test',
        title_ar: 'اختبار',
        ai_persona: 'Test katze',
        category: 'official',
        icon: 'stamp',
        initial_message_a1: 'Hallo!',
        initial_message_a2: 'Guten Tag!',
        initial_message_b1: 'Guten Tag, wie geht es Ihnen?',
        initial_message_b2: 'Guten Tag, darf ich Ihnen behilflich sein?',
      },
    ],
    vocabulary,
    starter_phrases: Array.from({ length: 6 }, (_, index) => ({
      scenario_id: 'test_scenario',
      level: 'A1',
      german: `Satz ${index + 1}`,
      translation_en: `sentence ${index + 1}`,
      translation_ar: `جملة رقم ${index + 1}`,
      sort_order: index + 1,
    })),
    grammar: [
      {
        id: 'g_test_one',
        title_ar: 'قاعدة أولى',
        rule_de: 'Erste Regel.',
        rule_ar: 'القاعدة الأولى.',
        level: 'A1',
        explanation_ar: 'شرح القاعدة الأولى.',
        example_de: 'Ein Beispiel.',
        example_ar: 'مثال.',
      },
      {
        id: 'g_test_two',
        title_ar: 'قاعدة ثانية',
        rule_de: 'Zweite Regel.',
        rule_ar: 'القاعدة الثانية.',
        level: 'A1',
        explanation_ar: 'شرح القاعدة الثانية.',
        example_de: 'Noch ein Beispiel.',
        example_ar: 'مثال آخر.',
      },
    ],
  };
}

describe('audit fixture', () => {
  it('accepts a draft that meets every rule', () => {
    const report = audit(baseDraft());
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('rejects a scenario whose category resolves to no vocabulary topic', () => {
    // This is the real defect class: StudyScreen filters vocabulary by the
    // resolved topic, so an unmapped category renders an empty word list.
    const draft = baseDraft();
    draft.scenarios[0].category = 'career';
    draft.scenarios[0].id = 'unmapped_scenario';
    draft.vocabulary.forEach((row: any) => (row.topic = 'documents'));
    const report = audit(draft);
    expect(errorPaths(report)).toContain('$.scenarios[0].category');
    expect(report.errors.some((issue) => issue.message.includes('no vocabulary topic'))).toBe(true);
  });

  it('rejects a misspelled top-level table, which a loader would silently ignore', () => {
    const draft = baseDraft();
    draft.vocabularies = draft.vocabulary;
    delete draft.vocabulary;
    const report = audit(draft);
    expect(errorPaths(report)).toContain('$.vocabularies');
    expect(errorPaths(report)).toContain('$.vocabulary');
  });

  it('rejects a duplicate headword in the same topic and level', () => {
    // `vocabulary` has no unique key in D1, so this would insert twice and hand
    // the quiz two identical prompts.
    const draft = baseDraft();
    draft.vocabulary[1] = { ...draft.vocabulary[0] };
    expect(audit(draft).errors.some((issue) => issue.message.includes('duplicate headword'))).toBe(true);
  });

  it('rejects a noun without an article', () => {
    const draft = baseDraft();
    draft.vocabulary[0] = { ...draft.vocabulary[0], part_of_speech: 'Noun', article: '' };
    expect(errorPaths(audit(draft))).toContain('$.vocabulary[0].article');
  });

  it('rejects an article that is not der/die/das', () => {
    const draft = baseDraft();
    draft.vocabulary[0] = { ...draft.vocabulary[0], part_of_speech: 'Noun', article: 'the' };
    expect(errorPaths(audit(draft))).toContain('$.vocabulary[0].article');
  });

  it('rejects a vocabulary column that does not exist in D1', () => {
    const draft = baseDraft();
    draft.vocabulary[0].pronunciation = '/vɔrt/';
    expect(audit(draft).errors.some((issue) => issue.message.includes('not a column'))).toBe(true);
  });

  it('rejects a vocabulary topic no scenario reads', () => {
    const draft = baseDraft();
    draft.vocabulary[0].topic = 'orphan_topic';
    expect(audit(draft).errors.some((issue) => issue.message.includes('unreachable'))).toBe(true);
  });

  it('rejects a topic pool below the per-scenario standard', () => {
    const draft = baseDraft();
    draft.vocabulary = draft.vocabulary.slice(0, 14);
    expect(audit(draft).errors.some((issue) => issue.message.includes('at least 15'))).toBe(true);
  });

  it('rejects non-Arabic glosses', () => {
    const draft = baseDraft();
    draft.vocabulary[0].translation_ar = 'word';
    draft.starter_phrases[0].translation_ar = 'sentence';
    const report = audit(draft);
    expect(errorPaths(report)).toContain('$.vocabulary[0].translation_ar');
    expect(errorPaths(report)).toContain('$.starter_phrases[0].translation_ar');
  });

  it('rejects a sort_order gap', () => {
    const draft = baseDraft();
    draft.starter_phrases[3].sort_order = 9;
    expect(audit(draft).errors.some((issue) => issue.message.includes('contiguous'))).toBe(true);
  });

  it('rejects too few starter phrases for a scenario', () => {
    const draft = baseDraft();
    draft.starter_phrases = draft.starter_phrases.slice(0, 5);
    expect(audit(draft).errors.some((issue) => issue.message.includes('the standard is 6'))).toBe(true);
  });

  it('rejects phrases pointing at a scenario that is not in the draft', () => {
    const draft = baseDraft();
    draft.starter_phrases[0].scenario_id = 'ghost_scenario';
    expect(audit(draft).errors.some((issue) => issue.message.includes('would be invisible'))).toBe(true);
  });

  it('rejects an approved review block without an attributable reviewer', () => {
    const draft = baseDraft();
    draft.review.status = 'approved';
    const report = audit(draft);
    expect(errorPaths(report)).toContain('$.review.reviewedBy');
    expect(errorPaths(report)).toContain('$.review.reviewedAt');
  });

  it('rejects loadable tables hidden under deferred', () => {
    const draft = baseDraft();
    draft.deferred = { requiresSchema: ['reading_texts'], vocabulary: draft.vocabulary };
    expect(audit(draft).errors.some((issue) => issue.message.includes('loadable D1 table'))).toBe(true);
  });
});

describe('shipped curriculum draft', () => {
  const draft = loadShippedDraft();
  const report = audit(draft);

  it('passes the content audit with zero errors', () => {
    expect(report.errors).toEqual([]);
  });

  it('declares itself unreviewed so it cannot be loaded by accident', () => {
    expect(report.stats.reviewStatus).toBe('pending');
    expect(draft.review.reviewedBy).toBeNull();
    expect(draft.review.checklist.length).toBeGreaterThan(0);
  });

  it('resolves every scenario to a topic with enough words to study', () => {
    for (const scenario of draft.scenarios) {
      const topic = scenarioToVocabTopic(scenario);
      expect(topic, `scenario ${scenario.id} resolves to no topic`).toBeTruthy();
      expect(report.stats.topics[topic], `topic ${topic} pool`).toBeGreaterThanOrEqual(15);
    }
  });

  it('gives every scenario the full per-scenario profile', () => {
    const scenarioIds = draft.scenarios.map((s: any) => s.id);
    for (const id of scenarioIds) {
      const phrases = draft.starter_phrases.filter((p: any) => p.scenario_id === id);
      expect(phrases.length, `phrases for ${id}`).toBeGreaterThanOrEqual(6);
      expect(phrases.length, `phrases for ${id}`).toBeLessThanOrEqual(10);
    }
    // Grammar is global (no scenario_id in D1), so the standard is per level.
    const levelsTaught = new Set(draft.vocabulary.map((v: any) => v.level));
    for (const level of levelsTaught) {
      const count = draft.grammar.filter((g: any) => g.level === level).length;
      expect(count, `grammar points at ${level}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps every loadable row inside the D1 column contract', () => {
    for (const type of LOADABLE_TYPES) {
      const expected = [...CONTENT_COLUMNS[type]].sort();
      for (const row of draft[type]) {
        expect(Object.keys(row).sort(), `${type} row`).toEqual(expected);
      }
    }
  });

  it('keeps four-skill content out of the loadable tables until its schema exists', () => {
    // Reading, writing and exam tasks have no D1 table yet, so they must not
    // appear as loadable arrays — a loader would otherwise try to write them.
    for (const type of ['reading_texts', 'writing_tasks', 'exam_tasks']) {
      expect(draft[type], `${type} must not be loadable yet`).toBeUndefined();
    }
    expect(draft.deferred.requiresSchema).toEqual(
      expect.arrayContaining(['reading_texts', 'writing_tasks', 'exam_tasks']),
    );
    expect(draft.deferred.reading_texts.length).toBe(draft.scenarios.length);
    expect(draft.deferred.writing_tasks.length).toBe(draft.scenarios.length);
    expect(draft.deferred.exam_tasks.length).toBe(draft.scenarios.length);
  });

  it('ships a reading text with comprehension questions for every scenario', () => {
    for (const text of draft.deferred.reading_texts) {
      expect(text.body_de.split(/\s+/).length, `words in ${text.title_de}`).toBeGreaterThanOrEqual(25);
      expect(text.translation_ar.length).toBeGreaterThan(20);
      expect(text.questions_json.length).toBeGreaterThanOrEqual(2);
      for (const question of text.questions_json) {
        expect(question.options_ar.length).toBeGreaterThanOrEqual(3);
        expect(question.answer_index).toBeGreaterThanOrEqual(0);
        expect(question.answer_index).toBeLessThan(question.options_ar.length);
      }
    }
  });
});
