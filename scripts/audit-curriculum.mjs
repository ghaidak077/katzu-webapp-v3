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
import { auditCurriculum } from '../src/lib/content/curriculumAudit.ts';
import { scenarioToVocabTopic } from '../src/lib/utils/scenarioVocab.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const args = process.argv.slice(2);
const fileArg = args.find((arg) => arg.startsWith('--file='));
const asJson = args.includes('--json');
const contentDir = join(repoRoot, 'docs', 'content');
const files = fileArg
  ? [resolve(fileArg.slice('--file='.length))]
  : readdirSync(contentDir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => join(contentDir, name));

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
  const report = auditCurriculum(draft, scenarioToVocabTopic);
  reports.push({ file, ...report });
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
  console.log(`  scenarios ${stats.scenarios} · vocabulary ${stats.vocabulary} · phrases ${stats.phrases} · grammar ${stats.grammar} · review "${stats.reviewStatus}"`);
  const topics = Object.entries(stats.topics);
  if (topics.length > 0) console.log(`  topics: ${topics.map(([topic, count]) => `${topic} (${count})`).join(', ')}`);
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
console.log(`\n${failed ? 'FAILED' : 'PASSED'} — ${reports.length} draft(s) checked`);
process.exit(failed ? 1 : 0);
