import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CONTENT_COLUMNS,
  OPTIONAL_COLUMNS,
  LOADABLE_TYPES,
  auditCurriculum,
  MODULE_SCENARIO_LIMITS,
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
  const scenarios = Array.from({ length: MODULE_SCENARIO_LIMITS.min }, (_, scenarioIndex) => ({
    id: `test_scenario_${scenarioIndex + 1}`,
    title_de: `Test ${scenarioIndex + 1}`,
    title_ar: `اختبار ${scenarioIndex + 1}`,
    ai_persona: 'Test katze',
    category: 'official',
    icon: 'stamp',
    initial_message_a1: 'Hallo!',
    initial_message_a2: 'Guten Tag!',
    initial_message_b1: 'Guten Tag, wie geht es Ihnen?',
    initial_message_b2: 'Guten Tag, darf ich Ihnen behilflich sein?',
  }));
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
    scenarios,
    vocabulary,
    starter_phrases: scenarios.flatMap((scenario) =>
      Array.from({ length: 6 }, (_, index) => ({
        scenario_id: scenario.id,
        level: 'A1',
        german: `${scenario.id} Satz ${index + 1}`,
        translation_en: `sentence ${index + 1}`,
        translation_ar: `جملة رقم ${index + 1}`,
        sort_order: index + 1,
      })),
    ),
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
  it('accepts a draft at the minimum 5-scenario module size', () => {
    const report = audit(baseDraft());
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('accepts the maximum 8-scenario module size', () => {
    const draft = baseDraft();
    draft.scenarios = Array.from({ length: MODULE_SCENARIO_LIMITS.max }, (_, index) => ({
      ...draft.scenarios[0],
      id: `test_scenario_${index + 1}`,
    }));
    draft.starter_phrases = draft.scenarios.flatMap((scenario: { id: string }) =>
      Array.from({ length: 6 }, (_, index) => ({
        scenario_id: scenario.id,
        level: 'A1',
        german: `${scenario.id} Satz ${index + 1}`,
        translation_en: `sentence ${index + 1}`,
        translation_ar: `جملة رقم ${index + 1}`,
        sort_order: index + 1,
      })),
    );
    const report = audit(draft);
    expect(report.errors).toEqual([]);
    expect(report.stats.scenarios).toBe(8);
  });

  it.each([4, 9])('rejects a module with %i scenarios', (count) => {
    const draft = baseDraft();
    draft.scenarios = Array.from({ length: count }, (_, index) => ({
      ...draft.scenarios[0],
      id: `test_scenario_${index + 1}`,
    }));
    const report = audit(draft);
    expect(report.errors.some((issue) => issue.path === '$.scenarios' && issue.message.includes('5–8'))).toBe(true);
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

  it('carries an honest AI self-review attribution, never a human name', () => {
    // This draft used to declare itself unreviewed so it could not be loaded by
    // accident. It is approved now (docs/content/review-30day-module1.md), so the
    // guard moves from "pending" to "the attribution is honest and dated": the
    // gate's own format, which a human name must never be able to satisfy.
    expect(report.stats.reviewStatus).toBe('approved');
    expect(String(draft.review.reviewedBy)).toMatch(/^AI self-review — .+, no human review$/);
    expect(Number.isNaN(Date.parse(String(draft.review.reviewedAt)))).toBe(false);
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
      // Columns the contract marks optional may be absent — `banner_url` is filled
      // in later from the content editor. Every other column is required, and no
      // row may carry a key the contract does not know.
      const optional = OPTIONAL_COLUMNS[type] ?? [];
      const required = CONTENT_COLUMNS[type].filter((column) => !optional.includes(column));
      for (const row of draft[type]) {
        const keys = Object.keys(row);
        for (const column of required) expect(keys, `${type} row lacks ${column}`).toContain(column);
        for (const key of keys) expect(CONTENT_COLUMNS[type], `${type} row has unknown ${key}`).toContain(key);
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

/**
 * Content hygiene — the defects a translator or a bad copy-paste leaves behind:
 * mojibake in Arabic, Latin letters where only Arabic belongs, Arabic leaking
 * into a German field, and German umlauts or ß written as ASCII digraphs
 * ("fuer", "strasse"). The structural audits cannot see any of it.
 *
 * Checks the two shipped drafts and the offline fixture catalogue, because the
 * fixture is what a learner with no network actually reads.
 */
describe('content hygiene (RC-3)', () => {
  /**
   * Fields whose whole content must be learner-facing Arabic. Deliberately
   * excludes `title_ar` and `rule_ar` on grammar rows: those name the German
   * form they teach ("الأفعال المنفصلة (anmelden, ausfüllen)"), which is the
   * point of the row. Every field here has its German in a sibling field, so
   * Latin letters in one mean the wrong text landed in the wrong column.
   */
  const ARABIC_ONLY = /^(example_ar|task_ar|prompt_ar|q_ar|translation_ar|headword_ar|options_ar)$/;
  /** Fields whose whole content is German. */
  const GERMAN_TEXT = /^(title_de|rule_de|prompt_de|body_de|example_de|german|headword|initial_message_a1|initial_message_a2)$/;
  const MOJIBAKE = /[\uFFFD\u00C3\u00C2]/;
  const UMLAUT_AS_ASCII =
    /\b(fuer|ueber|koennen|koennte|moechte|moechten|haette|waere|gruen|gruesse|tschues|strasse|gross|heisst|weiss|muesste|waehrend|moeglich|zurueck|spaeter|hoeren|fuehren|naturlich)\b/i;

  const entries: Array<{ key: string; value: string; where: string }> = [];

  const collect = (key: string, value: unknown, where: string) => {
    if (typeof value === 'string') {
      entries.push({ key, value, where });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collect(key, item, where));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) collect(childKey, child, where);
    }
  };

  for (const draft of ['curriculum-30day-module1.json', 'curriculum-arrival-module2.json']) {
    const path = fileURLToPath(new URL(`../docs/content/${draft}`, import.meta.url));
    collect('', JSON.parse(readFileSync(path, 'utf8')), draft);
  }

  const fixtureSource = readFileSync(fileURLToPath(new URL('../src/lib/db/katzuDb.ts', import.meta.url)), 'utf8');
  for (const match of fixtureSource.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*):\s*'([^'\n]*)'/g)) {
    entries.push({ key: match[1], value: match[2], where: 'katzuDb.ts' });
  }

  const report = (rows: Array<{ key: string; value: string; where: string }>) =>
    rows.map((row) => `${row.where} → ${row.key}: ${row.value}`);

  it('reads enough content for a clean result to mean something', () => {
    expect(entries.length).toBeGreaterThan(100);
    expect(entries.some((entry) => ARABIC_ONLY.test(entry.key))).toBe(true);
    expect(entries.some((entry) => GERMAN_TEXT.test(entry.key))).toBe(true);
  });

  it('carries no mojibake anywhere', () => {
    expect(report(entries.filter((entry) => MOJIBAKE.test(entry.value)))).toEqual([]);
  });

  it('keeps learner-facing Arabic free of stray Latin letters', () => {
    const offenders = entries.filter((entry) => ARABIC_ONLY.test(entry.key) && /[A-Za-z]/.test(entry.value));
    expect(report(offenders)).toEqual([]);
  });

  it('keeps Arabic out of German fields', () => {
    const offenders = entries.filter((entry) => GERMAN_TEXT.test(entry.key) && /[\u0600-\u06FF]/.test(entry.value));
    expect(report(offenders)).toEqual([]);
  });

  it('writes ä ö ü ß as ä ö ü ß, never as ae/oe/ue/ss', () => {
    const offenders = entries.filter(
      (entry) => GERMAN_TEXT.test(entry.key) && UMLAUT_AS_ASCII.test(entry.value),
    );
    expect(report(offenders)).toEqual([]);
  });
});
