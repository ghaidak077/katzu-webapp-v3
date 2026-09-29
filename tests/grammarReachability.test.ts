import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SCENARIO_GRAMMAR_IDS } from '@/lib/content/scenarioGrammar';
import { CONTENT_COLUMNS, CONTENT_LEVELS } from '@/lib/content/curriculumAudit';

/**
 * Grammar reachability — the defect class V10-3 found in module1.
 *
 * `grammar` has no `scenario_id` in D1, so the scenario→grammar link lives in
 * `SCENARIO_GRAMMAR_IDS` (src/lib/content/scenarioGrammar.ts). Content that is
 * loaded but named by no scenario is taught to nobody — the same class as a
 * vocabulary topic no scenario resolves to. `tests/arrivalRoster.test.ts` asserts
 * the scenario→grammar direction for the two module drafts; this file asserts the
 * grammar→scenario direction for *every* shipped source, and that the two copies
 * of the four original rows (production-facing supplement + offline fixture)
 * cannot drift apart.
 */

const DRAFT_FILES = [
  'docs/content/curriculum-30day-module1.json',
  'docs/content/curriculum-arrival-module2.json',
];
const SUPPLEMENT_FILE = 'docs/content/supplements/grammar-basics.json';

const GRAMMAR_COLUMNS = CONTENT_COLUMNS.grammar;

interface GrammarRow {
  id: string;
  title_ar: string;
  rule_de: string;
  rule_ar: string;
  level: string;
  explanation_ar: string;
  example_de: string;
  example_ar: string;
}

function loadJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.resolve(relative), 'utf8'));
}

function grammarOf(draft: Record<string, unknown>): GrammarRow[] {
  return Array.isArray(draft.grammar) ? (draft.grammar as GrammarRow[]) : [];
}

/** Ids named by at least one scenario — what Guided Practice can actually reach. */
const referencedIds = new Set(Object.values(SCENARIO_GRAMMAR_IDS).flat());

/** Grammar rows that ship but that no scenario points at. */
function orphanRows(sources: Record<string, GrammarRow[]>, referenced: Set<string>): string[] {
  const orphans: string[] = [];
  for (const [label, rows] of Object.entries(sources)) {
    for (const row of rows) {
      if (!referenced.has(row.id)) orphans.push(`${label}:${row.id}`);
    }
  }
  return orphans.sort();
}

/** Ids the map names that exist in no source — links that resolve to nothing. */
function deadLinks(referenced: Set<string>, sources: Record<string, GrammarRow[]>): string[] {
  const known = new Set(Object.values(sources).flat().map((row) => row.id));
  return [...referenced].filter((id) => !known.has(id)).sort();
}

const supplement = loadJson(SUPPLEMENT_FILE);
const drafts: Record<string, GrammarRow[]> = Object.fromEntries(
  DRAFT_FILES.map((file) => [file.replace('docs/content/', ''), grammarOf(loadJson(file))]),
);

let fixture: GrammarRow[] = [];
let fixtureScenarioIds: string[] = [];

beforeAll(async () => {
  const { db, initializeDatabaseSeed } = await import('@/lib/db/katzuDb');
  await initializeDatabaseSeed();
  fixture = (await db.grammar.toArray()) as unknown as GrammarRow[];
  fixtureScenarioIds = (await db.scenarios.toArray()).map((row) => String(row.id));
});

describe('grammar reachability — shipped rows', () => {
  it('every grammar row in the drafts and the supplement is pointed at by a scenario', () => {
    const orphans = orphanRows({ ...drafts, supplement: grammarOf(supplement) }, referencedIds);
    expect(orphans).toEqual([]);
  });

  it('every grammar row in the offline fixture is pointed at by a scenario', () => {
    expect(orphanRows({ fixture }, referencedIds)).toEqual([]);
  });

  it('every grammar id the map names exists in at least one shipped source', () => {
    const links = deadLinks(referencedIds, { ...drafts, supplement: grammarOf(supplement), fixture });
    expect(links).toEqual([]);
  });

  it('every scenario in the offline fixture has at least one grammar point to teach', () => {
    const uncovered = fixtureScenarioIds.filter((id) => (SCENARIO_GRAMMAR_IDS[id] ?? []).length === 0);
    expect(uncovered).toEqual([]);
  });

  it('covers mission-relevant scenarios explicitly (module1, module2, the original five)', () => {
    const expected = [
      'anmeldung_buergeramt',
      'termin_online_buchen',
      'krankenkasse_anmelden',
      'mietvertrag_uebergabe',
      'erster_arbeitstag',
      'airport_arrival',
      'train_station',
      'bakery_shopping',
      'landlord_followup',
      'friend_catchup',
      'apartment_viewing',
      'cafe_order',
      'doctor_visit',
      'embassy_appointment',
      'job_interview',
    ];
    expect(expected.filter((id) => (SCENARIO_GRAMMAR_IDS[id] ?? []).length === 0)).toEqual([]);
  });
});

describe('grammar reachability — the rules are not vacuous', () => {
  it('flags a row nothing points at', () => {
    const orphan: GrammarRow = { ...supplement.grammar[0], id: 'g_nobody_points_at_me' };
    expect(orphanRows({ probe: [orphan] }, referencedIds)).toEqual(['probe:g_nobody_points_at_me']);
  });

  it('flags an id the map names that exists in no source', () => {
    expect(deadLinks(new Set(['g_missing_from_every_source']), { probe: [] })).toEqual([
      'g_missing_from_every_source',
    ]);
  });

  it('reproduces the module1 shape it was written for: ten unreachable rows', () => {
    // The real ids that were unreachable before V10-3 added module1's five
    // scenarios to the map. With today's map they are all reachable; with an
    // empty map the same algorithm returns all ten, which is what proves the
    // assertion above measures reachability rather than counting rows.
    const module1Rows = drafts['curriculum-30day-module1.json'];
    expect(module1Rows).toHaveLength(10);
    expect(orphanRows({ module1: module1Rows }, new Set())).toHaveLength(10);
    expect(orphanRows({ module1: module1Rows }, referencedIds)).toEqual([]);
  });
});

describe('grammar supplement — contract and the two copies cannot drift', () => {
  it('carries every D1 grammar column with non-empty, level-correct values', () => {
    const problems: string[] = [];
    for (const row of grammarOf(supplement) as GrammarRow[]) {
      for (const column of GRAMMAR_COLUMNS) {
        const value = (row as unknown as Record<string, unknown>)[column];
        if (typeof value !== 'string' || value.trim() === '') problems.push(`${row.id}.${column}`);
      }
      if (!CONTENT_LEVELS.includes(row.level as (typeof CONTENT_LEVELS)[number])) problems.push(`${row.id}.level=${row.level}`);
      if (!row.id.startsWith('g_')) problems.push(`${row.id} (id must use the g_ prefix)`);
    }
    expect(problems).toEqual([]);
  });

  it('is byte-identical to the offline fixture for every shared id', () => {
    const byId = new Map(fixture.map((row) => [row.id, row]));
    const differences: string[] = [];
    for (const row of grammarOf(supplement) as GrammarRow[]) {
      const local = byId.get(row.id);
      if (!local) {
        differences.push(`${row.id}: missing from the fixture`);
        continue;
      }
      for (const column of GRAMMAR_COLUMNS) {
        if ((row as unknown as Record<string, unknown>)[column] !== (local as unknown as Record<string, unknown>)[column]) {
          differences.push(`${row.id}.${column}`);
        }
      }
    }
    expect(differences).toEqual([]);
  });

  it('declares a review that the gate format accepts', () => {
    const review = supplement.review as Record<string, unknown>;
    expect(review.status).toBe('approved');
    expect(String(review.reviewedBy)).toMatch(/self-review/i);
    expect(String(review.reviewedAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Array.isArray(review.checklist) && (review.checklist as unknown[]).length > 0).toBe(true);
  });
});
