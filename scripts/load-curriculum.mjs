#!/usr/bin/env node
/**
 * Curriculum loader — the only sanctioned path from an authored draft into D1.
 *
 * Why this exists instead of `wrangler d1 execute`: the project's Cloudflare API
 * token has no `D1:Edit` scope (wrangler returns code 7403), but the deployed
 * Worker already owns a D1 binding and exposes an admin-authenticated bulk
 * upsert at POST /admin/upload. This script writes through that binding.
 *
 * Safety rules, in order:
 *   1. The draft must pass scripts/audit-curriculum.mjs. No audit, no load.
 *   2. `review.status` must be `approved` with a `reviewedBy` — a human decides,
 *      because D1 has no `status` column that could hold a draft back.
 *   3. Dry run by default. Writing requires an explicit `--commit`.
 *   4. Idempotent. `vocabulary` and `starter_phrases` have no unique key, so
 *      re-uploading duplicates rows; existing rows are skipped by
 *      (level, german, topic) and (scenario_id, german) respectively.
 *   5. It verifies the write against the *public* content endpoints afterwards,
 *      so the report is the result, not a claim about it.
 *
 * Usage:
 *   node scripts/load-curriculum.mjs [--file=...] [--url=https://...] [--commit]
 *
 * ADMIN_SECRET must be set in the environment. It is never printed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const args = process.argv.slice(2);
const fileArg = args.find((a) => a.startsWith('--file='));
const urlArg = args.find((a) => a.startsWith('--url='));
const commit = args.includes('--commit');
const BATCH_SIZE = 100;

const FILE = resolve(fileArg ? fileArg.slice('--file='.length) : `${repoRoot}/docs/content/curriculum-30day-module1.json`);
const BASE = (
  urlArg
    ? urlArg.slice('--url='.length)
    : process.env.KATZU_WORKER_URL || 'https://katzu-test.ghaidakalosh008.workers.dev'
).replace(/\/+$/, '');

const { auditCurriculum } = await import('../src/lib/content/curriculumAudit.ts');
const { scenarioToVocabTopic } = await import('../src/lib/utils/scenarioVocab.ts');

const secret = process.env.ADMIN_SECRET;
if (!secret) {
  console.error('ADMIN_SECRET is not set. Add it to the environment (Settings -> Environment) and retry.');
  process.exit(2);
}
const authHeaders = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };

function fail(message) {
  console.error(`\n✘ ${message}`);
  process.exit(1);
}

async function adminGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function adminPost(path, payload) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// --- 1. Load + audit --------------------------------------------------------
let draft;
try {
  draft = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (err) {
  fail(`cannot read ${FILE}: ${err}`);
}

const report = auditCurriculum(draft, scenarioToVocabTopic);
console.log(`Draft: ${FILE.replace(`${repoRoot}/`, '')}`);
console.log(
  `  ${report.stats.scenarios} scenarios · ${report.stats.vocabulary} vocabulary · ${report.stats.phrases} phrases · ${report.stats.grammar} grammar`,
);
if (report.warnings.length > 0) console.log(`  ${report.warnings.length} warning(s) — run scripts/audit-curriculum.mjs for detail`);
if (!report.ok) {
  for (const issue of report.errors) console.error(`  ${issue.path}: ${issue.message}`);
  fail(`draft failed the content audit (${report.errors.length} error(s)) — nothing was written`);
}

const reviewStatus = report.stats.reviewStatus;
const reviewedBy = draft.review?.reviewedBy ?? null;
console.log(`  review: ${reviewStatus}${reviewedBy ? ` by ${reviewedBy}` : ''}`);

const loadable = ['scenarios', 'vocabulary', 'starter_phrases', 'grammar'].filter((type) => Array.isArray(draft[type]));

if (!commit) {
  console.log('\nDRY RUN — nothing was written.');
  if (reviewStatus !== 'approved') {
    console.log(`  A commit would be refused: review.status is "${reviewStatus}", not "approved".`);
    console.log('  Review docs/CURRICULUM-DRAFT.md, then set review.status/reviewedBy/reviewedAt in the draft.');
  }
  console.log(`  Would upload: ${loadable.map((type) => `${type} (${draft[type].length})`).join(', ')}`);
  console.log('  Re-run with --commit to write.');
  process.exit(0);
}

if (reviewStatus !== 'approved') {
  fail(`refusing to load unreviewed content: review.status is "${reviewStatus}"`);
}
if (!reviewedBy) fail('refusing to load: review.reviewedBy is empty');

// Guards a typo'd --url: silently posting a draft to the wrong host would look
// like a successful load.
if (!/^https:\/\//.test(BASE)) fail(`refusing to load against "${BASE}" — expected an https worker URL`);

// --- 2. Read what is already there (idempotency) ----------------------------
console.log(`\nReading existing content from ${BASE} ...`);
const existingVocab = await adminGet('/admin/api/content-list?type=vocabulary&limit=500');
if (existingVocab.status !== 200) fail(`could not list vocabulary (HTTP ${existingVocab.status}): ${JSON.stringify(existingVocab.body)}`);
const vocabKeys = new Set(
  (existingVocab.body?.rows ?? []).map((row) => `${row.level}|${row.german}|${row.topic}`.toLowerCase()),
);
console.log(`  live vocabulary rows seen: ${existingVocab.body?.rows?.length ?? 0}`);

const phraseKeys = new Set();
for (const scenario of draft.scenarios ?? []) {
  const res = await adminGet(`/admin/api/content-list?type=starter_phrases&scenario_id=${encodeURIComponent(scenario.id)}&limit=500`);
  if (res.status !== 200) fail(`could not list phrases for ${scenario.id} (HTTP ${res.status})`);
  for (const row of res.body?.rows ?? []) phraseKeys.add(`${row.scenario_id}|${row.german}`.toLowerCase());
}
console.log(`  live starter phrases seen: ${phraseKeys.size}`);

// --- 3. Decide what to write -------------------------------------------------
const plan = [];
for (const type of loadable) {
  if (type === 'vocabulary') {
    const rows = draft.vocabulary.filter(
      (row) => !vocabKeys.has(`${row.level}|${row.german}|${row.topic}`.toLowerCase()),
    );
    plan.push({ type, rows, skipped: draft.vocabulary.length - rows.length });
  } else if (type === 'starter_phrases') {
    const rows = draft.starter_phrases.filter((row) => !phraseKeys.has(`${row.scenario_id}|${row.german}`.toLowerCase()));
    plan.push({ type, rows, skipped: draft.starter_phrases.length - rows.length });
  } else {
    // Both are keyed by `id` and upserted by the Worker, so re-running is safe.
    plan.push({ type, rows: draft[type], skipped: 0 });
  }
}

for (const { type, rows, skipped } of plan) {
  console.log(`  ${type}: ${rows.length} to write${skipped ? `, ${skipped} already present (skipped)` : ''}`);
}

// --- 4. Write ----------------------------------------------------------------
console.log('\nWriting ...');
const results = {};
for (const { type, rows } of plan) {
  results[type] = { requested: rows.length, written: 0, batches: [] };
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const res = await adminPost('/admin/upload', { contentType: type, rows: batch });
    results[type].batches.push(res.status);
    if (res.status !== 200) {
      console.error(`  ✘ ${type} batch ${i / BATCH_SIZE + 1} failed (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
    } else {
      results[type].written += Number(res.body?.count ?? 0);
      console.log(`  ✔ ${type} batch ${i / BATCH_SIZE + 1}: HTTP ${res.status}, count ${res.body?.count}`);
    }
  }
}

// --- 5. Verify against the public endpoints the app itself reads -------------
console.log('\nVerifying against the public content endpoints ...');
const publicScenarios = await fetch(`${BASE}/scenarios`).then((r) => r.json()).catch(() => null);
const publicVocab = await fetch(`${BASE}/vocabulary`).then((r) => r.json()).catch(() => null);

let verified = true;
if (!Array.isArray(publicScenarios) || !Array.isArray(publicVocab)) {
  console.log('  ✘ could not read the public content endpoints — verify manually');
  verified = false;
} else {
  for (const scenario of draft.scenarios ?? []) {
    const found = publicScenarios.some((row) => row.id === scenario.id);
    console.log(`  ${found ? '✔' : '✘'} scenario ${scenario.id} ${found ? 'is live' : 'is MISSING'}`);
    if (!found) verified = false;
  }
  for (const topic of Object.keys(report.stats.topics)) {
    const count = publicVocab.filter((row) => row.topic === topic).length;
    const target = report.stats.topics[topic];
    const ok = count >= target;
    console.log(`  ${ok ? '✔' : '✘'} topic ${topic}: ${count} live rows (draft contributes ${target})`);
    if (!ok) verified = false;
  }
}

const written = Object.values(results).reduce((sum, entry) => sum + entry.written, 0);
console.log(`\n${verified ? 'DONE' : 'DONE WITH WARNINGS'} — ${written} row(s) written.`);
if (!verified) process.exit(1);
