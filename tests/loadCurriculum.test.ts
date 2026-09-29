import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, afterAll } from 'vitest';
import { auditCurriculum, auditGrammarSupplement } from '@/lib/content/curriculumAudit';
import { scenarioToVocabTopic } from '@/lib/utils/scenarioVocab';
// Importing this module is itself part of the assertion: scripts/load-curriculum.mjs
// only calls main() when it is the process entry point, so a test file can import
// the pure helpers without a load starting (no network, no secret, no writes). If
// that guard regresses, this import runs the script's dry-run path and the suite
// dies instead of passing.
import {
  draftKind,
  exitCode,
  failedBatches,
  loadableTypes,
  missingColumns,
  payloadColumns,
  summarizeBatches,
} from '../scripts/load-curriculum.mjs';

/**
 * The two contracts V12 proved were missing:
 *
 *  1. the payload's column names must exist in the live table *before* the first
 *     write (the loader sent `rule_de` to a `grammar` table that had no such
 *     column, after three of four batches had already been written);
 *  2. the exit code must be the conjunction of every batch (the same run printed
 *     "DONE — 89 row(s) written." and exited 0 with an HTTP 500 in its log).
 *
 * The live column list below is the real one read from production on 2026-09-29
 * (`SELECT GROUP_CONCAT(name) FROM pragma_table_info('grammar')`); the payload
 * shape is the real draft row from docs/content/curriculum-arrival-module2.json.
 */
const LIVE_GRAMMAR_COLUMNS = [
  'id',
  'level',
  'title_ar',
  'title_en',
  'explanation_ar',
  'explanation_en',
  'example_de',
];

const LIVE_GRAMMAR_COLUMNS_AFTER_MIGRATION = [...LIVE_GRAMMAR_COLUMNS, 'rule_de', 'rule_ar', 'example_ar'];

const DRAFT_GRAMMAR_ROWS = [
  {
    id: 'g_koennen_sie_bitte_a1',
    title_ar: 'سؤال مؤدب',
    rule_de: 'Können Sie … ? ist eine höfliche Frage.',
    rule_ar: 'صيغة مؤدبة للسؤال',
    level: 'A1',
    explanation_ar: 'شرح',
    example_de: 'Können Sie mir bitte helfen?',
    example_ar: 'هل يمكنك مساعدتي؟',
  },
];

/** The V12 result, exactly as it came back from the deployed Worker. */
const V12_RESULTS = {
  scenarios: { requested: 5, written: 5, batches: [200] },
  vocabulary: { requested: 42, written: 42, batches: [200] },
  starter_phrases: { requested: 42, written: 42, batches: [200] },
  grammar: { requested: 4, written: 0, batches: [500] },
};

describe('load-curriculum — live-schema preflight (V12: table grammar has no column named rule_de)', () => {
  it('names exactly the columns the deployed grammar table was missing', () => {
    expect(missingColumns(DRAFT_GRAMMAR_ROWS, LIVE_GRAMMAR_COLUMNS)).toEqual([
      'example_ar',
      'rule_ar',
      'rule_de',
    ]);
  });

  it('is clean once the three additive columns exist — extra legacy columns are fine', () => {
    expect(missingColumns(DRAFT_GRAMMAR_ROWS, LIVE_GRAMMAR_COLUMNS_AFTER_MIGRATION)).toEqual([]);
  });

  it('ignores the synthetic rowid that the admin list adds to rowid tables', () => {
    expect([...payloadColumns([{ rowid: 7, scenario_id: 'cafe_order', german: 'Kaffee' }])]).toEqual([
      'scenario_id',
      'german',
    ]);
  });

  it('unions the keys across the whole batch instead of trusting the first row', () => {
    const rows = [{ id: 'a', level: 'A1' }, { id: 'b', title_ar: 'قاعدة' }];
    expect([...payloadColumns(rows)].sort()).toEqual(['id', 'level', 'title_ar']);
    expect(missingColumns(rows, ['id', 'level'])).toEqual(['title_ar']);
  });

  it('reports nothing for an empty payload, so a skipped type cannot block a load', () => {
    expect(missingColumns([], LIVE_GRAMMAR_COLUMNS)).toEqual([]);
    expect(missingColumns(undefined, LIVE_GRAMMAR_COLUMNS)).toEqual([]);
  });
});

describe('load-curriculum — the two shapes (V16)', () => {
  const MODULE_FILE = 'docs/content/curriculum-30day-module1.json';
  const SUPPLEMENT_FILE = 'docs/content/supplements/grammar-basics.json';
  const load = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

  it('decides the validator by shape, not by filename', () => {
    expect(draftKind(load(MODULE_FILE))).toBe('module');
    expect(draftKind(load(SUPPLEMENT_FILE))).toBe('supplement');
    // A `--file=` path can point anywhere, so a filename is not a claim about shape.
    expect(draftKind({ grammar: [] })).toBe('supplement');
    expect(draftKind({ grammar: {} })).toBe('unknown');
    expect(draftKind({ scenarios: 'five' })).toBe('unknown');
    expect(draftKind({})).toBe('unknown');
    expect(draftKind(null)).toBe('unknown');
    expect(draftKind([])).toBe('unknown');
  });

  it('writes only what the shape declares', () => {
    expect(loadableTypes(load(SUPPLEMENT_FILE))).toEqual(['grammar']);
    expect(loadableTypes(load(MODULE_FILE))).toEqual(['scenarios', 'vocabulary', 'starter_phrases', 'grammar']);
    expect(loadableTypes({ grammar: [] })).toEqual(['grammar']);
    expect(loadableTypes({})).toEqual([]);
  });

  it('is the only reason the supplement loads at all: the module validator still refuses it', () => {
    // This is the branch that matters. Before V16 the loader always ran
    // auditCurriculum, which requires 5-8 scenarios — so the reviewed supplement
    // could not be loaded by any means (V14-2/V15-2).
    const supplement = load(SUPPLEMENT_FILE);
    expect(auditCurriculum(supplement, scenarioToVocabTopic).ok).toBe(false);
    expect(auditGrammarSupplement(supplement).ok).toBe(true);
  });

  it('dry-runs the real supplement with no secret and no network, and reports its kind', () => {
    const script = fileURLToPath(new URL('../scripts/load-curriculum.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [script, `--file=${SUPPLEMENT_FILE}`, '--dry-run'], {
      encoding: 'utf8',
      cwd: process.cwd(),
      // No ADMIN_SECRET in the child environment: --dry-run must not need one.
      env: { ...process.env, ADMIN_SECRET: '' },
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('kind: supplement · grammar 4');
    expect(run.stdout).toContain('DRY RUN');
    expect(run.stdout).toContain('grammar: 4 row(s)');
    // Nothing was read: a dry run prints no live counts.
    expect(run.stdout).not.toContain('live vocabulary rows seen');
  });

  it('dry-runs a module exactly as before — the module path did not change', () => {
    const script = fileURLToPath(new URL('../scripts/load-curriculum.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [script, `--file=${MODULE_FILE}`, '--dry-run'], {
      encoding: 'utf8',
      cwd: process.cwd(),
      env: { ...process.env, ADMIN_SECRET: '' },
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('5 scenarios · 74 vocabulary · 49 phrases · 10 grammar');
    expect(run.stdout).toContain('scenarios: 5 row(s)');
    expect(run.stdout).not.toContain('kind: supplement');
  });

  it('refuses a draft with no shape at all rather than guessing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'katzu-shape-'));
    try {
      const file = join(dir, 'neither.json');
      writeFileSync(file, JSON.stringify({ meta: { version: 1 }, grammar: {} }));
      const script = fileURLToPath(new URL('../scripts/load-curriculum.mjs', import.meta.url));
      const run = spawnSync(process.execPath, [script, `--file=${file}`, '--dry-run'], {
        encoding: 'utf8',
        cwd: process.cwd(),
        env: { ...process.env, ADMIN_SECRET: '' },
      });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('is neither a module');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('load-curriculum — the exit contract', () => {
  it('does not call the V12 run a success: three 200s and one 500 still fails', () => {
    expect(failedBatches(V12_RESULTS)).toEqual(['grammar batch 1 (HTTP 500)']);
    expect(exitCode({ verified: true, results: V12_RESULTS })).toBe(1);
  });

  it('exits 0 only when every batch answered 200 and verification passed', () => {
    const allOk = {
      scenarios: { requested: 5, written: 5, batches: [200] },
      grammar: { requested: 4, written: 4, batches: [200] },
    };
    expect(exitCode({ verified: true, results: allOk })).toBe(0);
  });

  it('fails when a public-endpoint verification did not pass, even with every batch at 200', () => {
    const allOk = { scenarios: { requested: 5, written: 5, batches: [200] } };
    expect(exitCode({ verified: false, results: allOk })).toBe(1);
  });

  it('names every failed batch, in type then batch order', () => {
    const results = {
      vocabulary: { requested: 250, written: 100, batches: [200, 500, 500] },
      grammar: { requested: 4, written: 0, batches: [500] },
    };
    expect(failedBatches(results)).toEqual([
      'vocabulary batch 2 (HTTP 500)',
      'vocabulary batch 3 (HTTP 500)',
      'grammar batch 1 (HTTP 500)',
    ]);
  });

  it('summarizes every batch status, and says so when a type had nothing to write', () => {
    expect(summarizeBatches({ ...V12_RESULTS, vocabulary: { requested: 0, written: 0, batches: [] } })).toEqual([
      'scenarios: batch 1 HTTP 200 — 5 row(s) written',
      'vocabulary: nothing to write — 0 row(s) written',
      'starter_phrases: batch 1 HTTP 200 — 42 row(s) written',
      'grammar: batch 1 HTTP 500 — 0 row(s) written',
    ]);
  });

  it('does not report a failure for a plan that never ran', () => {
    expect(failedBatches({})).toEqual([]);
    expect(exitCode({ verified: true, results: {} })).toBe(0);
    expect(summarizeBatches({})).toEqual([]);
  });
});
