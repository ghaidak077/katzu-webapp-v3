import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import catalogue from '../docs/content/catalogue/scenarios-catalogue.json';
import snapshot from '../scripts/language-data/content-snapshot.json';
import corpus from '../scripts/language-data/opener-translations.json';
import glossFile from '../scripts/language-data/word-glosses.json';
import { englishTells } from '../src/lib/content/curriculumAudit';
import { LEVEL_LADDER, LEVEL_SPECS } from '../src/lib/levels/levelSpec';
import { SCENARIO_CATEGORY_TO_TOPIC } from '../src/lib/utils/scenarioVocab';
import { OPENER_GLOSSES as BUNDLED_GLOSSES } from '../src/lib/conversation/openerGlosses.generated';
// @ts-expect-error — the worker is plain ESM JavaScript, not a TS module.
import { OPENER_GLOSSES as WORKER_GLOSSES } from '../cloudflare-opener-glosses.generated.js';

/**
 * The scenario catalogue is the single authoring source for conversation
 * content (`docs/content/catalogue/scenarios-catalogue.json`). `scripts/apply-content-
 * catalogue.mjs` derives the shipped `content-snapshot.json` and the positional
 * Arabic corpus from it, so every learner-facing opener passes through these
 * assertions.
 *
 * These tests fail on the pre-v2 data on purpose: 20 scenarios had no A0
 * opener, 165 openers broke the level caps, five personas did not end in
 * `katze`, five icons were emoji, and every `sequence_order` was 0.
 */

const LEVELS = ['a0', 'a1', 'a2', 'b1', 'b2'] as const;
type Level = (typeof LEVELS)[number];

const ARABIC = /[\u0600-\u06FF]/;

/**
 * The authoring caps from the owner brief: total words per opener. The
 * per-sentence caps come from the shipped level spec, so the catalogue and the
 * turn guard cannot disagree about what a level may read.
 */
const MAX_TOTAL_WORDS: Record<Level, number> = { a0: 6, a1: 10, a2: 18, b1: 30, b2: 45 };
/** Sentence ceiling per level, from the same brief. */
const MAX_SENTENCES: Record<Level, number> = { a0: 2, a1: 3, a2: 2, b1: 3, b2: 3 };

const NEW_SCENARIOS = [
  'nahverkehr_ticket',
  'paket_abholen',
  'sprachcafe',
  'handyvertrag',
  'polizei_fundbuero',
  'jobcenter_termin',
  'integrationskurs_anmelden',
  'apotheke',
  'zahnarzt',
  'arzttermin_telefon',
  'notruf_112',
  'kita_elterngespraech',
];

interface Scenario {
  id: string;
  title_de: string;
  title_ar: string;
  ai_persona: string;
  category: string;
  icon: string;
  sequence_order: number;
  review?: string;
  needs_review?: boolean;
  openers: Record<Level, [string, string]>;
}

const scenarios = (catalogue as unknown as { scenarios: Scenario[] }).scenarios;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const germanSentences = (text: string) => text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
const arabicSentences = (text: string) => text.trim().split(/(?<=[.!?؟])\s+/).filter(Boolean);
/** Latin is allowed only inside parentheses (a German hint beside the Arabic). */
const latinOutsideParens = (value: string) => String(value).replace(/\([^)]*\)/g, '').match(/[A-Za-z]/);

const LUCIDE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

describe('scenario catalogue shape', () => {
  it('holds the full journey: 49 existing situations plus 12 new ones', () => {
    expect(scenarios).toHaveLength(61);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(61);
  });

  it('gives every scenario the fields the app and the loader require', () => {
    for (const s of scenarios) {
      expect(s.id, s.id).toMatch(/^[a-z0-9_]+$/);
      expect(s.title_de.trim().length, `${s.id} title_de`).toBeGreaterThan(0);
      expect(s.title_ar, `${s.id} title_ar`).toMatch(ARABIC);
      expect(s.ai_persona.trim().length, `${s.id} persona`).toBeGreaterThan(0);
      expect(s.category, `${s.id} category`).toBeTruthy();
      expect(s.icon, `${s.id} icon`).toBeTruthy();
      expect(Number.isInteger(s.sequence_order), `${s.id} sequence_order`).toBe(true);
    }
  });

  it('numbers the sequence 1..61 with no gaps or collisions', () => {
    expect(scenarios.map((s) => s.sequence_order).sort((a, b) => a - b)).toEqual(
      Array.from({ length: scenarios.length }, (_, i) => i + 1),
    );
  });

  it('ends every persona in «katze» so the app can address it in Arabic', () => {
    for (const s of scenarios) expect(s.ai_persona, s.id).toMatch(/katze$/);
  });

  it('uses one icon system: kebab-case lucide keys, never emoji', () => {
    for (const s of scenarios) {
      expect(s.icon, s.id).toMatch(LUCIDE);
      expect(s.icon, s.id).not.toMatch(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u);
    }
  });

  it('files every scenario under a category the vocabulary join knows', () => {
    const known = new Set(Object.keys(SCENARIO_CATEGORY_TO_TOPIC));
    for (const s of scenarios) expect(known.has(s.category), `${s.id}: ${s.category}`).toBe(true);
  });

  it('carries no HTML in learner-facing text', () => {
    for (const s of scenarios) {
      const fields = [s.title_de, s.title_ar, s.ai_persona];
      for (const level of LEVELS) fields.push(s.openers[level][0], s.openers[level][1]);
      for (const field of fields) expect(field, s.id).not.toMatch(/<[a-z!/][^>]*>/i);
    }
  });
});

describe('every level has a usable opener', () => {
  it('authors A0–B2 for all 61 scenarios — the A0 gap is closed', () => {
    for (const s of scenarios) {
      for (const level of LEVELS) {
        const [de, ar] = s.openers[level];
        expect(typeof de, `${s.id}/${level} German`).toBe('string');
        expect(de.trim().length, `${s.id}/${level} German`).toBeGreaterThan(0);
        expect(ar, `${s.id}/${level} Arabic`).toMatch(ARABIC);
      }
    }
  });

  it('keeps German inside the level caps: total words and per-sentence words', () => {
    for (const s of scenarios) {
      for (const level of LEVELS) {
        const de = s.openers[level][0];
        const label = `${s.id}/${level}`;
        expect(words(de), label).toBeLessThanOrEqual(MAX_TOTAL_WORDS[level]);
        const sentences = germanSentences(de);
        expect(sentences.length, label).toBeLessThanOrEqual(MAX_SENTENCES[level]);
        const perSentence = LEVEL_SPECS[level.toUpperCase() as 'A0'].maxWordsPerSentence;
        for (const sentence of sentences) {
          expect(words(sentence), `${label}: ${sentence}`).toBeLessThanOrEqual(perSentence);
        }
      }
    }
  });

  it('asks exactly one question per opener, as the LAST sentence', () => {
    for (const s of scenarios) {
      for (const level of LEVELS) {
        const de = s.openers[level][0];
        const label = `${s.id}/${level}`;
        expect((de.match(/\?/g) ?? []).length, label).toBe(1);
        const sentences = germanSentences(de);
        expect(sentences[sentences.length - 1].endsWith('?'), `${label}: ${de}`).toBe(true);
      }
    }
  });

  it('keeps the Arabic sentence-for-sentence with the German and ends on the question', () => {
    for (const s of scenarios) {
      for (const level of LEVELS) {
        const [de, ar] = s.openers[level];
        const label = `${s.id}/${level}`;
        expect(arabicSentences(ar).length, label).toBe(germanSentences(de).length);
        const last = arabicSentences(ar).slice(-1)[0];
        expect(last, label).toMatch(/[؟?]$/);
      }
    }
  });

  it('keeps Latin out of Arabic unless it sits inside parentheses', () => {
    for (const s of scenarios) {
      expect(latinOutsideParens(s.title_ar), `${s.id} title_ar`).toBeNull();
      for (const level of LEVELS) {
        expect(latinOutsideParens(s.openers[level][1]), `${s.id}/${level}`).toBeNull();
      }
    }
  });

  it('uses no English function word in German titles or openers', () => {
    for (const s of scenarios) {
      expect(englishTells(s.title_de), `${s.id} title_de`).toEqual([]);
      for (const level of LEVELS) {
        expect(englishTells(s.openers[level][0]), `${s.id}/${level}`).toEqual([]);
      }
    }
  });
});

describe('the 12 new situations are marked for native review', () => {
  it('has all twelve, each flagged needs_review', () => {
    for (const id of NEW_SCENARIOS) {
      const scenario = scenarios.find((s) => s.id === id);
      expect(scenario, id).toBeTruthy();
      expect(scenario?.needs_review, id).toBe(true);
    }
    expect(scenarios.filter((s) => s.needs_review).map((s) => s.id).sort()).toEqual([...NEW_SCENARIOS].sort());
  });

  it('flags the glosses authored for this batch, and only glosses that exist', () => {
    const review = (glossFile as unknown as { needsReview?: string[] }).needsReview ?? [];
    const glosses = (glossFile as unknown as { glosses: Record<string, unknown> }).glosses;
    expect(review.length).toBeGreaterThan(0);
    for (const token of review) expect(glosses[token], token).toBeTruthy();
  });
});

describe('the shipped language data is derived from the catalogue', () => {
  it('ships the same scenarios in the same order with the same categories', () => {
    const rows = (snapshot as unknown as { scenarios: Array<Record<string, string>> }).scenarios;
    expect(rows.map((row) => row.id)).toEqual(scenarios.map((s) => s.id));
    expect(rows.map((row) => row.category)).toEqual(scenarios.map((s) => s.category));
  });

  it('ships every opener exactly as authored', () => {
    const rows = (snapshot as unknown as { scenarios: Array<Record<string, string>> }).scenarios;
    for (const [index, s] of scenarios.entries()) {
      for (const level of LEVELS) {
        expect(rows[index][`initial_message_${level}`], `${s.id}/${level}`).toBe(s.openers[level][0]);
      }
    }
  });

  it('ships the Arabic corpus positionally, matched to the shipped German', () => {
    const rows = (snapshot as unknown as { scenarios: Array<Record<string, string>> }).scenarios;
    const translations = (corpus as unknown as { translations: string[] }).translations;
    const seen = new Set<string>();
    let index = 0;
    for (const row of rows) {
      for (const level of LEVELS) {
        const german = String(row[`initial_message_${level}`] ?? '').trim();
        if (!german || seen.has(german)) continue;
        seen.add(german);
        expect(translations[index], `${row.id}/${level}`).toMatch(ARABIC);
        index += 1;
      }
    }
    expect(index).toBe(translations.length);
  });

  it('ships one gloss per opener token, from the glossary or the content vocabulary', () => {
    const rows = (snapshot as unknown as { scenarios: Array<Record<string, string>> }).scenarios;
    const glosses = (glossFile as unknown as { glosses: Record<string, unknown> }).glosses;
    const vocabulary = (snapshot as unknown as {
      vocabulary: Array<{ german: string; translation_ar?: string }>;
    }).vocabulary;
    // The build falls back to the content vocabulary for a token the glossary
    // does not carry (e.g. «Hallo», a vocabulary row already taught in Study).
    const fromVocab = new Set<string>();
    for (const row of vocabulary) {
      if (!row.translation_ar) continue;
      const key = String(row.german || '').trim().replace(/^(der|die|das)\s+/i, '').toLowerCase();
      if (key) fromVocab.add(key);
    }
    const used = new Set<string>();
    for (const row of rows) {
      for (const level of LEVELS) {
        const text = String(row[`initial_message_${level}`] ?? '').toLowerCase();
        for (const token of text.replace(/[^a-zäöüß\-\s]/g, ' ').split(/\s+/)) {
          if (token.length > 1) used.add(token);
        }
      }
    }
    for (const token of used) {
      expect(Boolean(glosses[token]) || fromVocab.has(token), `missing: ${token}`).toBe(true);
    }
    for (const token of Object.keys(glosses)) expect(used.has(token), `unused: ${token}`).toBe(true);
  });
});

describe('the bundled and worker opener maps agree with the catalogue', () => {
  const keys = (map: Record<string, string>) => Object.keys(map).sort();

  it('ships the same opener set in the bundle and in the worker', () => {
    expect(keys(WORKER_GLOSSES)).toEqual(keys(BUNDLED_GLOSSES));
  });

  it('translates every shipped opener identically in both copies', () => {
    // Unchanged German keeps the Arabic that already shipped (the corpus is
    // zipped by exact text), so the source of truth here is the shipped corpus,
    // not the catalogue's Arabic column.
    const rows = (snapshot as unknown as { scenarios: Array<Record<string, string>> }).scenarios;
    const translations = (corpus as unknown as { translations: string[] }).translations;
    const shipped = new Map<string, string>();
    let index = 0;
    for (const row of rows) {
      for (const level of LEVELS) {
        const german = String(row[`initial_message_${level}`] ?? '').trim();
        if (!german || shipped.has(german)) continue;
        shipped.set(german, translations[index]);
        index += 1;
      }
    }
    expect(shipped.size).toBe(keys(BUNDLED_GLOSSES).length);
    for (const [german, arabic] of shipped) {
      expect(BUNDLED_GLOSSES[german], `bundle ${german}`).toBe(arabic);
      expect(WORKER_GLOSSES[german], `worker ${german}`).toBe(arabic);
    }
  });

  it('has no stale opener in either copy', () => {
    const authored = new Set(scenarios.flatMap((s) => LEVELS.map((level) => s.openers[level][0])));
    for (const german of keys(BUNDLED_GLOSSES)) expect(authored.has(german), german).toBe(true);
    for (const german of keys(WORKER_GLOSSES)) expect(authored.has(german), german).toBe(true);
  });
});

describe('the level ladder the catalogue is written against is the shipped one', () => {  it('matches the five levels and the per-sentence caps', () => {
    expect(LEVEL_LADDER).toEqual(['A0', 'A1', 'A2', 'B1', 'B2']);
    expect(LEVEL_LADDER.map((level) => LEVEL_SPECS[level].maxWordsPerSentence)).toEqual([6, 8, 10, 12, 15]);
  });
});

describe('the catalogue file on disk is the one these tests read', () => {
  it('parses as JSON and carries its own metadata', () => {
    const raw = JSON.parse(readFileSync('docs/content/catalogue/scenarios-catalogue.json', 'utf8'));
    expect(raw.source).toBeTruthy();
    expect(raw.scenarios).toHaveLength(61);
  });
});
