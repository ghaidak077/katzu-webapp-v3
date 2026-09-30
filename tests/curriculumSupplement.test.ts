import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { auditGrammarSupplement, CONTENT_COLUMNS } from '@/lib/content/curriculumAudit';

/**
 * The supplement shape added in V15.
 *
 * Why it exists: the four `g_*` rows the five original scenarios point at had no
 * home the gate could accept — `auditCurriculum` demands 5–8 scenarios, 15+
 * vocabulary per topic pool and 6–10 phrases per scenario, and the loader refuses
 * any draft the audit rejects. Rather than loosen the module rules, supplements
 * (`docs/content/supplements/*.json`) get their own validator, which keeps the
 * same column contract and adds the Arabic/German checks in both directions.
 *
 * These tests run the real file plus one injected defect per rule, so a rule that
 * stops firing is visible rather than covered by a green suite.
 */

const SUPPLEMENT_PATH = 'docs/content/supplements/grammar-basics.json';

function loadSupplement(): Record<string, unknown> {
  return JSON.parse(readFileSync(SUPPLEMENT_PATH, 'utf8'));
}

/** A deep copy with one mutation, so the pristine file is never touched. */
function withDefect(mutate: (draft: Record<string, any>) => void): Record<string, any> {
  const draft = structuredClone(loadSupplement()) as Record<string, any>;
  mutate(draft);
  return draft;
}

function errorPaths(draft: unknown): string[] {
  return auditGrammarSupplement(draft).errors.map((issue) => issue.path);
}

describe('grammar supplement — the shipped file', () => {
  it('passes the supplement audit with nothing to fix', () => {
    const report = auditGrammarSupplement(loadSupplement());
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.stats.grammar).toBe(4);
    expect(report.stats.reviewStatus).toBe('approved');
  });

  it('is discovered and validated by the CLI as a supplement (not silently skipped)', () => {
    const script = fileURLToPath(new URL('../scripts/audit-curriculum.mjs', import.meta.url));
    const output = execFileSync(process.execPath, [script], { encoding: 'utf8', cwd: process.cwd() }).replace(/\\/g, '/');
    expect(output).toContain('supplements/grammar-basics.json');
    expect(output).toContain('kind: supplement');
    // V23: the D4 patch supplement and the exam module joined the roster (8 modules, 3 supplements).
    expect(output).toContain('11 file(s) checked (8 module(s), 3 supplement(s))');
    expect(output).toContain('PASSED');
  });

  it('keeps the module rule intact: the supplement is still not a module', () => {
    // The module validator must keep rejecting it, which is exactly why this
    // shape exists instead of an exemption inside auditCurriculum.
    expect(loadSupplement()).not.toHaveProperty('scenarios');
  });
});

describe('grammar supplement — every rule fires', () => {
  it('rejects a German-scoped field that reads as English (the V14 defect)', () => {
    const draft = withDefect((d) => {
      d.grammar[0].rule_de = 'Können Sie ...? is a polite question; the infinitive stands at the end.';
    });
    const report = auditGrammarSupplement(draft);
    expect(report.ok).toBe(false);
    expect(report.errors[0].path).toBe('$.grammar[0].rule_de');
    expect(report.errors[0].message).toContain('English');
  });

  it('does not fire on German that merely resembles English', () => {
    // "Das finite Verb steht im Aussagesatz immer an Position 2" is German, and
    // the German word `was` must never be treated as the English one.
    const clean = auditGrammarSupplement(loadSupplement());
    expect(clean.errors).toEqual([]);
    expect(errorPaths(withDefect((d) => { d.grammar[2].rule_de = 'Was steht am Ende? Das finite Verb.'; }))).toEqual([]);
  });

  it('rejects Arabic in a German field, and Latin in example_ar', () => {
    expect(errorPaths(withDefect((d) => { d.grammar[0].example_de = 'Können Sie mir helfen؟'; }))).toEqual([
      '$.grammar[0].example_de',
    ]);
    // Arabic *and* Latin, so only the "Arabic only" rule can fire — a value with
    // no Arabic at all would legitimately trip both rules on the same path.
    expect(errorPaths(withDefect((d) => { d.grammar[0].example_ar = 'اليوم أشرب شاياً. Heute trinke ich einen Tee.'; }))).toEqual([
      '$.grammar[0].example_ar',
    ]);
    expect(errorPaths(withDefect((d) => { d.grammar[0].example_ar = 'Heute trinke ich einen Tee.'; }))).toEqual([
      '$.grammar[0].example_ar',
      '$.grammar[0].example_ar',
    ]);
  });

  it('allows German inline in explanation_ar, the way the approved modules do', () => {
    // 12 of the 14 approved module rows quote German inside explanation_ar, and
    // none of their example_ar fields do — the repo's rule, matched here.
    expect(errorPaths(withDefect((d) => { d.grammar[1].explanation_ar = 'مثال: Der Kaffee ist lecker.'; }))).toEqual([]);
  });

  it('rejects a missing column, an extra column, an empty value and a bad level', () => {
    expect(errorPaths(withDefect((d) => { delete d.grammar[0].rule_ar; }))).toEqual(['$.grammar[0].rule_ar']);
    expect(errorPaths(withDefect((d) => { d.grammar[0].rule_de = '   '; }))).toEqual(['$.grammar[0].rule_de']);
    expect(errorPaths(withDefect((d) => { d.grammar[0].surprise = 'nope'; }))).toEqual(['$.grammar[0].surprise']);
    expect(errorPaths(withDefect((d) => { d.grammar[0].level = 'C1'; }))).toEqual(['$.grammar[0].level']);
  });

  it('rejects a missing column in the contract even when the value looks fine', () => {
    const draft = withDefect((d) => {
      const { example_ar: _dropped, ...rest } = d.grammar[3];
      d.grammar[3] = rest;
    });
    expect(errorPaths(draft)).toEqual(['$.grammar[3].example_ar']);
    expect(CONTENT_COLUMNS.grammar).toContain('example_ar');
  });

  it('rejects a non-g_ id, a duplicate id and a supplement pretending to be a module', () => {
    expect(errorPaths(withDefect((d) => { d.grammar[0].id = 'polite_requests_a1'; }))).toEqual(['$.grammar[0].id']);
    expect(errorPaths(withDefect((d) => { d.grammar[1].id = d.grammar[0].id; }))).toEqual(['$.grammar[1].id']);
    expect(errorPaths(withDefect((d) => { d.scenarios = []; }))).toEqual(['$.scenarios']);
  });

  it('requires meta, review and a checklist like a module does', () => {
    expect(errorPaths(withDefect((d) => { delete d.meta; }))).toEqual(['$.meta']);
    expect(errorPaths(withDefect((d) => { delete d.review; }))).toEqual(['$.review']);
    expect(errorPaths(withDefect((d) => { d.review.checklist = []; }))).toEqual(['$.review.checklist']);
    expect(errorPaths(withDefect((d) => { d.review.status = 'approved'; delete d.review.reviewedBy; }))).toEqual([
      '$.review.reviewedBy',
    ]);
  });

  it('rejects an empty grammar array and a non-object draft', () => {
    expect(errorPaths(withDefect((d) => { d.grammar = []; }))).toEqual(['$.grammar']);
    expect(errorPaths(null)).toEqual(['$']);
  });

  it('flags mojibake and ASCII-umlaut spellings', () => {
    expect(errorPaths(withDefect((d) => { d.grammar[0].rule_de = 'KÃ¶nnen Sie fragen?'; }))).toEqual(['$.grammar[0].rule_de']);
    expect(errorPaths(withDefect((d) => { d.grammar[0].rule_de = 'Ich moechte bezahlen.'; }))).toEqual(['$.grammar[0].rule_de']);
  });
});
