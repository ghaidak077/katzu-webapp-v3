#!/usr/bin/env node
/**
 * Curriculum loader — the only sanctioned path from an authored draft into D1.
 *
 * Why this exists instead of `wrangler d1 execute`: the project's Cloudflare API
 * token has no `D1:Edit` scope (wrangler returns code 7403), but the deployed
 * Worker already owns a D1 binding and exposes an admin-authenticated bulk
 * upsert at POST /admin/upload. This script writes through that binding.
 *
 * Two shapes, one write path (V16): a **module** (`docs/content/curriculum-*.json`:
 * 5-8 scenarios plus vocabulary, phrases and grammar) and a **supplement**
 * (`docs/content/supplements/*.json`: grammar only — content that belongs in D1
 * but is not a module, e.g. the rows `SCENARIO_GRAMMAR_IDS` points at for
 * scenarios that shipped before the drafted modules). The shape decides which
 * validator runs; nothing else about the load changes.
 *
 * Safety rules, in order:
 *   1. The draft must pass scripts/audit-curriculum.mjs. No audit, no load.
 *      A module is validated by `auditCurriculum`, a supplement by
 *      `auditGrammarSupplement` — the same column contract and the same
 *      Arabic/German checks the CLI reports, so the loader cannot accept
 *      something the gate would reject.
 *   2. `review.status` must be `approved` with a `reviewedBy` — a human decides,
 *      because D1 has no `status` column that could hold a draft back.
 *   3. Dry run by default. Writing requires an explicit `--commit`.
 *   4. Idempotent. `vocabulary` and `starter_phrases` have no unique key, so
 *      re-uploading duplicates rows; existing rows are skipped by
 *      (level, german, topic) and (scenario_id, german) respectively.
 *   5. The live columns are read and the payload's keys checked against them
 *      *before* the first write. `handleAdminUpload`
 *      (cloudflare-unified-worker.js) builds `INSERT INTO <table> (…)` from the
 *      row's own keys, so a field the deployment does not have is a 500 in the
 *      middle of a load — which is exactly V12: three of four batches written,
 *      then `table grammar has no column named rule_de` (docs/AGENT-STATE.md
 *      V12-2, migrations/0001_content_tables.sql). Note `/admin/schema` cannot
 *      be used for this check: it returns the studio's *declared* schema, and it
 *      listed `rule_de` while the live table had no such column. Only a real row
 *      read (`SELECT *` through /admin/api/content-list) shows what D1 has.
 *   6. Every batch must answer 200. A failed batch is named in the closing
 *      summary and makes the process exit non-zero; V12's loader printed
 *      "DONE — 89 row(s) written." and exited 0 with a 500 in its log.
 *   7. It verifies the write against the *public* content endpoints afterwards,
 *      so the report is the result, not a claim about it.
 *
 * Usage:
 *   node scripts/load-curriculum.mjs [--file=...] [--url=https://...] [--dry-run] [--commit]
 *
 * A module: `--file=docs/content/curriculum-30day-module1.json` (the default).
 * A supplement: `--file=docs/content/supplements/grammar-basics.json` — same flags,
 * same preflight, same exit contract; only `grammar` is written.
 *
 * `--dry-run` validates locally and prints row counts; it needs no secret and
 * writes nothing. A real (or remote dry-run) load requires ADMIN_SECRET. It is
 * never printed.
 *
 * All I/O lives in main(), which runs only when this file is the entry point, so
 * tests/loadCurriculum.test.ts imports the pure helpers below without starting a
 * load.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const BATCH_SIZE = 100;
/** One row is enough: every row of a table has the same columns. */
const SCHEMA_PROBE_LIMIT = 1;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in tests/loadCurriculum.test.ts)
// ---------------------------------------------------------------------------

/** The column names a batch of rows would turn into, ignoring SQLite's `rowid`. */
export function payloadColumns(rows) {
  const columns = new Set();
  for (const row of rows ?? []) {
    for (const key of Object.keys(row ?? {})) {
      if (key !== 'rowid') columns.add(key);
    }
  }
  return columns;
}

/** Columns the payload needs that the live table does not have, sorted. */
export function missingColumns(rows, liveColumns) {
  const live = liveColumns instanceof Set ? liveColumns : new Set(liveColumns ?? []);
  return [...payloadColumns(rows)].filter((column) => !live.has(column)).sort();
}

/** One line per content type: every batch's status in order, and rows written. */
export function summarizeBatches(results) {
  return Object.entries(results ?? {}).map(([type, entry]) => {
    const batches = entry?.batches ?? [];
    const statuses = batches.length
      ? batches.map((status, index) => `batch ${index + 1} HTTP ${status}`).join(', ')
      : 'nothing to write';
    return `${type}: ${statuses} — ${entry?.written ?? 0} row(s) written`;
  });
}

/** Every batch that did not answer 200, as `type batch N (HTTP …)`. */
export function failedBatches(results) {
  const failures = [];
  for (const [type, entry] of Object.entries(results ?? {})) {
    (entry?.batches ?? []).forEach((status, index) => {
      if (status !== 200) failures.push(`${type} batch ${index + 1} (HTTP ${status})`);
    });
  }
  return failures;
}

/** The exit code: 0 only when verification passed AND every batch answered 200. */
export function exitCode({ verified, results }) {
  if (!verified) return 1;
  return failedBatches(results).length > 0 ? 1 : 0;
}

/**
 * Which validator a draft needs, decided by shape rather than by filename so a
 * `--file=` path pointing anywhere still validates the way the audit would.
 *
 * `scenarios` is the module marker (`auditCurriculum` requires 5-8 of them), and
 * a supplement may not declare module tables at all, so `grammar` alone means
 * supplement. Anything else has no shape here and must be refused rather than
 * guessed at.
 */
export function draftKind(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return 'unknown';
  if (Array.isArray(draft.scenarios)) return 'module';
  if (Array.isArray(draft.grammar)) return 'supplement';
  return 'unknown';
}

/** The types a draft will write — what the audit calls loadable content. */
export function loadableTypes(draft) {
  return ['scenarios', 'vocabulary', 'starter_phrases', 'grammar'].filter((type) => Array.isArray(draft?.[type]));
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function fail(message) {
  console.error(`\n✘ ${message}`);
  process.exit(1);
}

async function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith('--file='));
  const urlArg = args.find((a) => a.startsWith('--url='));
  const commit = args.includes('--commit');
  // `--dry-run`: validate the draft and print row counts without touching the
  // network or the secret. Exists so CI and reviewers can check a draft without
  // ADMIN_SECRET being present at all — the secret check below is skipped in this
  // mode because nothing that requires auth ever runs.
  const dryRun = args.includes('--dry-run');

  const FILE = resolve(fileArg ? fileArg.slice('--file='.length) : `${repoRoot}/docs/content/curriculum-30day-module1.json`);
  const BASE = (
    urlArg
      ? urlArg.slice('--url='.length)
      : process.env.KATZU_WORKER_URL || 'https://katzu-test.ghaidakalosh008.workers.dev'
  ).replace(/\/+$/, '');

  const { auditCurriculum, auditGrammarSupplement } = await import('../src/lib/content/curriculumAudit.ts');
  const { scenarioToVocabTopic } = await import('../src/lib/utils/scenarioVocab.ts');

  const secret = process.env.ADMIN_SECRET;
  if (!secret && !dryRun) {
    console.error('ADMIN_SECRET is not set. Add it to the environment (Settings -> Environment) and retry.');
    process.exit(2);
  }
  const authHeaders = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };

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

  // --- 1. Load + audit ------------------------------------------------------
  let draft;
  try {
    draft = JSON.parse(readFileSync(FILE, 'utf8'));
  } catch (err) {
    fail(`cannot read ${FILE}: ${err}`);
  }

  const kind = draftKind(draft);
  if (kind === 'unknown') {
    fail(
      `${FILE.replace(`${repoRoot}/`, '')} is neither a module (a \`scenarios\` array) nor a supplement ` +
        '(a `grammar` array) — nothing was read or written',
    );
  }
  const report = kind === 'supplement' ? auditGrammarSupplement(draft) : auditCurriculum(draft, scenarioToVocabTopic);
  console.log(`Draft: ${FILE.replace(`${repoRoot}/`, '')}`);
  if (kind === 'supplement') {
    console.log(`  kind: supplement · grammar ${report.stats.grammar} (grammar-only; no scenarios or vocabulary)`);
  } else {
    console.log(
      `  ${report.stats.scenarios} scenarios · ${report.stats.vocabulary} vocabulary · ${report.stats.phrases} phrases · ${report.stats.grammar} grammar`,
    );
  }
  if (report.warnings.length > 0) console.log(`  ${report.warnings.length} warning(s) — run scripts/audit-curriculum.mjs for detail`);
  if (!report.ok) {
    for (const issue of report.errors) console.error(`  ${issue.path}: ${issue.message}`);
    fail(`draft failed the content audit (${report.errors.length} error(s)) — nothing was written`);
  }

  const reviewStatus = report.stats.reviewStatus;
  const reviewedBy = draft.review?.reviewedBy ?? null;
  console.log(`  review: ${reviewStatus}${reviewedBy ? ` by ${reviewedBy}` : ''}`);

  const loadable = loadableTypes(draft);
  if (loadable.length === 0) fail(`nothing loadable in ${FILE.replace(`${repoRoot}/`, '')} — nothing was written`);

  if (dryRun) {
    // Secretless mode: audit + counts only. No fetch, no write, exit 0 on a
    // passing audit so it can gate in CI.
    console.log('\nDRY RUN (local, no network, no secret needed) — nothing was read or written.');
    for (const type of loadable) {
      console.log(`  ${type}: ${draft[type].length} row(s)`);
    }
    const topics = Object.entries(report.stats.topics);
    if (topics.length > 0) console.log(`  topics: ${topics.map(([t, n]) => `${t} (${n})`).join(', ')}`);
    if (reviewStatus !== 'approved') {
      console.log(`  note: review.status is "${reviewStatus}" — a real load would be refused until it is approved.`);
    }
    process.exit(0);
  }

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

  // --- 2. Read what is already there (idempotency) --------------------------
  console.log(`\nReading existing content from ${BASE} ...`);
  // Only the tables this draft can collide with. A grammar-only supplement has no
  // reason to read vocabulary, and a read that cannot affect the write must not be
  // able to stop it.
  const vocabKeys = new Set();
  if (loadable.includes('vocabulary')) {
    const existingVocab = await adminGet('/admin/api/content-list?type=vocabulary&limit=500');
    if (existingVocab.status !== 200) fail(`could not list vocabulary (HTTP ${existingVocab.status}): ${JSON.stringify(existingVocab.body)}`);
    for (const row of existingVocab.body?.rows ?? []) vocabKeys.add(`${row.level}|${row.german}|${row.topic}`.toLowerCase());
    console.log(`  live vocabulary rows seen: ${vocabKeys.size}`);
  }

  const phraseKeys = new Set();
  for (const scenario of draft.scenarios ?? []) {
    const res = await adminGet(`/admin/api/content-list?type=starter_phrases&scenario_id=${encodeURIComponent(scenario.id)}&limit=500`);
    if (res.status !== 200) fail(`could not list phrases for ${scenario.id} (HTTP ${res.status})`);
    for (const row of res.body?.rows ?? []) phraseKeys.add(`${row.scenario_id}|${row.german}`.toLowerCase());
  }
  if (loadable.includes('starter_phrases')) console.log(`  live starter phrases seen: ${phraseKeys.size}`);
  if (loadable.includes('grammar')) console.log('  grammar rows are upserted by id — the live ones are not read here');

  // --- 3. Decide what to write ----------------------------------------------
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

  // --- 4. Preflight: the payload's columns must exist in the live table ------
  // See rule 5 in the header. Read-only, and it runs before the first write so a
  // drifted deployment fails with the counts still untouched.
  console.log('\nChecking the live schema against the payload ...');
  const schemaProblems = [];
  for (const { type, rows } of plan) {
    if (rows.length === 0) continue;
    const probe = await adminGet(`/admin/api/content-list?type=${encodeURIComponent(type)}&limit=${SCHEMA_PROBE_LIMIT}`);
    if (probe.status !== 200) {
      schemaProblems.push(`${type}: could not read the live schema (HTTP ${probe.status})`);
      continue;
    }
    const liveRows = probe.body?.rows ?? [];
    if (liveRows.length === 0) {
      console.log(`  ⚠ ${type}: the live table is empty, so its columns cannot be checked — writing unverified`);
      continue;
    }
    const live = new Set(liveRows.flatMap((row) => Object.keys(row ?? {})));
    const missing = missingColumns(rows, live);
    if (missing.length > 0) {
      schemaProblems.push(`${type}: the live table has no column(s) ${missing.join(', ')}`);
      console.log(`  ✘ ${type}: missing ${missing.join(', ')} — live columns are ${[...live].sort().join(', ')}`);
    } else {
      console.log(`  ✔ ${type}: all ${payloadColumns(rows).size} payload column(s) exist in the live table`);
    }
  }
  if (schemaProblems.length > 0) {
    fail(
      `live schema mismatch — nothing was written:\n  - ${schemaProblems.join('\n  - ')}\n` +
        '  The deployment and the draft disagree. Fix the schema (see migrations/0001_content_tables.sql) or the draft; ' +
        'an agent must not change either one silently.',
    );
  }

  // --- 5. Write ---------------------------------------------------------------
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

  // --- 6. Verify against the public endpoints the app itself reads -----------
  console.log('\nVerifying against the public content endpoints ...');
  const declaredScenarios = draft.scenarios ?? [];
  const declaredGrammar = draft.grammar ?? [];
  const topics = Object.keys(report.stats.topics);
  const getPublic = (path) => fetch(`${BASE}${path}`).then((r) => r.json()).catch(() => null);

  // Only the endpoints this draft can affect: a grammar-only supplement has no
  // scenarios to check, and asking it about them would be noise in its report.
  const publicScenarios = declaredScenarios.length > 0 ? await getPublic('/scenarios') : [];
  const publicVocab = topics.length > 0 ? await getPublic('/vocabulary') : [];
  const publicGrammar = declaredGrammar.length > 0 ? await getPublic('/grammar') : [];

  let verified = true;
  if (declaredScenarios.length > 0 && !Array.isArray(publicScenarios)) {
    console.log('  ✘ could not read /scenarios — verify manually');
    verified = false;
  }
  if (topics.length > 0 && !Array.isArray(publicVocab)) {
    console.log('  ✘ could not read /vocabulary — verify manually');
    verified = false;
  }
  if (Array.isArray(publicScenarios)) {
    for (const scenario of declaredScenarios) {
      const found = publicScenarios.some((row) => row.id === scenario.id);
      console.log(`  ${found ? '✔' : '✘'} scenario ${scenario.id} ${found ? 'is live' : 'is MISSING'}`);
      if (!found) verified = false;
    }
  }
  if (Array.isArray(publicVocab)) {
    for (const topic of topics) {
      const count = publicVocab.filter((row) => row.topic === topic).length;
      const target = report.stats.topics[topic];
      const ok = count >= target;
      console.log(`  ${ok ? '✔' : '✘'} topic ${topic}: ${count} live rows (draft contributes ${target})`);
      if (!ok) verified = false;
    }
  }
  // Grammar is upserted by id, so every declared row must be readable by the app
  // afterwards — the check V12's version of this script never made, which is how a
  // failed grammar batch could still print `DONE`.
  if (declaredGrammar.length > 0) {
    if (!Array.isArray(publicGrammar)) {
      console.log('  ✘ could not read /grammar — verify manually');
      verified = false;
    } else {
      for (const row of declaredGrammar) {
        const found = publicGrammar.some((live) => live.id === row.id);
        console.log(`  ${found ? '✔' : '✘'} grammar ${row.id} ${found ? 'is live' : 'is MISSING'}`);
        if (!found) verified = false;
      }
    }
  }

  // --- 7. Summary: every batch, not just the ones that worked ----------------
  console.log('\nBatches:');
  for (const line of summarizeBatches(results)) console.log(`  ${line}`);

  const failures = failedBatches(results);
  const written = Object.values(results).reduce((sum, entry) => sum + entry.written, 0);
  console.log(`\n${verified && failures.length === 0 ? 'DONE' : 'DONE WITH WARNINGS'} — ${written} row(s) written.`);
  if (failures.length > 0) {
    console.error(`  ${failures.length} batch(es) failed: ${failures.join(', ')} — the rows above were still written.`);
    console.error('  → docs/agent/CONTENT-LOAD.md: any mismatch means delete only the rows this run inserted, verify the');
    console.error('    pre-load counts, mark blocked and stop.');
  }
  process.exitCode = exitCode({ verified, results });
}

const isEntryPoint = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  await main();
}
