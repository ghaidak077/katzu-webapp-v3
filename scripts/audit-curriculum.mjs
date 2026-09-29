#!/usr/bin/env node
/**
 * Curriculum draft audit — the content half of CI.
 *
 * Validates authored drafts against the D1 content contract and per-scenario
 * learning standard. This is read-only: it never touches D1, the Worker, or a secret.
 * The policy for module size and approval attribution lives in docs/agent/CONTENT-GATE.md.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditCurriculum, auditGrammarSupplement } from '../src/lib/content/curriculumAudit.ts';
import { scenarioToVocabTopic } from '../src/lib/utils/scenarioVocab.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const args = process.argv.slice(2);
const fileArg = args.find((arg) => arg.startsWith('--file='));
const asJson = args.includes('--json');
const contentDir = join(repoRoot, 'docs', 'content');
const supplementDir = join(contentDir, 'supplements');

/**
 * Two shapes, two validators.
 *
 * `docs/content/*.json` are modules (5–8 scenarios, vocabulary, phrases, grammar)
 * and are validated by `auditCurriculum`. `docs/content/supplements/*.json` are
 * grammar-only files — content that belongs in D1 but is not a module, e.g. the
 * rows `SCENARIO_GRAMMAR_IDS` points at for scenarios that shipped before the
 * drafted modules — and are validated by `auditGrammarSupplement`, which applies
 * the same column contract and the Arabic/German language checks in both
 * directions. The module rules are untouched: the 5–8 scenario rule stays for
 * modules, and a supplement may not declare module tables (V15).
 */
const kindOf = (file) => (file.replace(/\\/g, '/').includes('/supplements/') ? 'supplement' : 'module');

function listDir(dir) {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => join(dir, name));
  } catch {
    // No supplements directory yet is not a failure: it is an empty set.
    return [];
  }
}

const files = fileArg
  ? [resolve(fileArg.slice('--file='.length))]
  : [...listDir(contentDir), ...listDir(supplementDir)];

if (files.length === 0) {
  console.error(`No curriculum drafts found in ${contentDir}`);
  process.exit(1);
}

const reports = [];
let failed = false;
for (const file of files) {
  let draft;
  try {
    draft = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    reports.push({ file, ok: false, parseError: String(error), errors: [], warnings: [], stats: null });
    failed = true;
    continue;
  }
  const kind = kindOf(file);
  const report = kind === 'supplement' ? auditGrammarSupplement(draft) : auditCurriculum(draft, scenarioToVocabTopic);
  reports.push({ file, kind, ...report });
  if (!report.ok) failed = true;
}

if (asJson) {
  console.log(JSON.stringify({ ok: !failed, reports }, null, 1));
  process.exit(failed ? 1 : 0);
}

for (const report of reports) {
  const label = report.file.replace(`${repoRoot}/`, '');
  console.log(`\n=== ${label} ===`);
  if (report.parseError) {
    console.log(`  ✘ not valid JSON: ${report.parseError}`);
    continue;
  }
  const { stats } = report;
  if (report.kind === 'supplement') {
    console.log(`  kind: supplement · grammar ${stats.grammar} · review "${stats.reviewStatus}"`);
  } else {
    console.log(`  scenarios ${stats.scenarios} · vocabulary ${stats.vocabulary} · phrases ${stats.phrases} · grammar ${stats.grammar} · review "${stats.reviewStatus}"`);
    const topics = Object.entries(stats.topics);
    if (topics.length > 0) console.log(`  topics: ${topics.map(([topic, count]) => `${topic} (${count})`).join(', ')}`);
  }
  if (report.errors.length === 0) {
    console.log('  ✔ no errors');
  } else {
    console.log(`  ✘ ${report.errors.length} error(s)`);
    for (const issue of report.errors) console.log(`      ${issue.path}: ${issue.message}`);
  }
  if (report.warnings.length > 0) {
    console.log(`  ${report.warnings.length} warning(s)`);
    for (const issue of report.warnings) console.log(`      ${issue.path}: ${issue.message}`);
  }
}
const moduleCount = reports.filter((report) => report.kind !== 'supplement').length;
const supplementCount = reports.length - moduleCount;
console.log(
  `\n${failed ? 'FAILED' : 'PASSED'} — ${reports.length} file(s) checked (${moduleCount} module(s), ${supplementCount} supplement(s))`,
);
process.exit(failed ? 1 : 0);
