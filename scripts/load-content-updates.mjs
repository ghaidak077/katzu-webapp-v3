#!/usr/bin/env node
/**
 * Scenario update loader — the sanctioned path for correcting rows that are
 * ALREADY live in D1.
 *
 * `scripts/load-curriculum.mjs` is insert-only by rule and cannot change an
 * existing row. The 49 corrected scenario rows need exactly that, so this script
 * writes through the Content Studio's own draft → publish → audit → undo path
 * (`cloudflare-content-admin.js`, exposed at `/admin/api/content-studio/*`).
 * Nothing here issues a bare UPDATE, and nothing here deletes a row.
 *
 * Safety rules, in order:
 *   1. The catalogue is the source. `docs/content/catalogue/scenarios-catalogue.json`
 *      must author all five openers per row; a missing level would blank a live
 *      opener, so an incomplete row refuses the whole run.
 *   2. This script never creates rows. A catalogue id that is not live is
 *      reported as "will not be created" and skipped — which is how the 12 new
 *      scenes stay off production until the owner approves them.
 *   3. Only writable `scenarios` columns. Anything the catalogue does not author
 *      (`banner_url`) is carried over from the live row, because the studio
 *      writes every declared column and an absent value would erase artwork.
 *   4. Dry run by default, and the dry run writes nothing: it reads live rows
 *      through `content-list` (no audit row) and prints every field it would
 *      change. `--commit` is required to write.
 *   5. No unrelated drafts. `publish-all` publishes every draft of the type, so
 *      a commit aborts when any draft already exists.
 *   6. A snapshot and a D1 bookmark before the first write, plus an export of the
 *      live scenarios on disk. Both ids go into the manifest.
 *   7. The manifest records the before and after of every changed column and the
 *      audit uid of every publish. `--undo=<manifest>` replays those uids and
 *      refuses when the live rows no longer match the manifest's after-state.
 *   8. Verification is the public `/scenarios` response plus a comparison of
 *      every untouched row against the pre-write read. A mismatch rolls the run
 *      back automatically and exits non-zero.
 *
 * Usage:
 *   node scripts/load-content-updates.mjs [--url=...] [--catalogue=...] [--verbose]
 *   node scripts/load-content-updates.mjs --commit --url=... [--out=backups/<dir>]
 *   node scripts/load-content-updates.mjs --undo=backups/content-load-.../manifest.json
 *
 * `ADMIN_SECRET` is read from the process environment only. It is never printed,
 * echoed, written or passed as an argument. The dry run also uses it, because the
 * read-only checks go through the authenticated admin surface.
 *
 * All I/O lives in main(), which runs only when this file is the entry point, so
 * tests/loadContentUpdates.test.ts imports the pure helpers without a load.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  SCENARIO_TYPE,
  OPENER_LEVELS,
  SCENARIO_COLUMNS,
  scenarioRows,
  pickScenarioColumns,
  scenarioPayload,
  payloadIssues,
  liveIdMap,
  scenarioTargets,
  diffScenarios,
  summarizeChanges,
  scopeProblems,
  manifestMismatches,
  untouchedProblems,
  buildManifest,
} from './lib/content-updates.mjs';

// The pure helpers live in scripts/lib so each file stays inside the 500-line
// script budget. Re-exported here because tests and callers know this path.
export {
  SCENARIO_TYPE,
  OPENER_LEVELS,
  SCENARIO_COLUMNS,
  scenarioRows,
  pickScenarioColumns,
  scenarioPayload,
  payloadIssues,
  liveIdMap,
  scenarioTargets,
  diffScenarios,
  summarizeChanges,
  scopeProblems,
  manifestMismatches,
  untouchedProblems,
  buildManifest,
};

const DEFAULT_CATALOGUE = 'docs/content/catalogue/scenarios-catalogue.json';
const DEFAULT_WORKER_URL = 'https://katzu-test.ghaidakalosh008.workers.dev';

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

class RunError extends Error {}

/**
 * Thrown, never `process.exit()`: on this host an immediate exit right after a
 * write to a piped stdout aborts with `0xC0000409`, which masks the real status
 * and reports a completed load as a crash. `main()` returns a status instead and
 * the entry point below sets `process.exitCode`, letting Node flush the pipes.
 */
function fail(message) {
  throw new RunError(message);
}

function describeValue(value) {
  if (value === null || value === undefined || value === '') return '(empty)';
  const text = String(value);
  return text.length > 72 ? `${text.slice(0, 69)}…` : text;
}

async function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const arg = (name) => {
    const prefix = `--${name}=`;
    const found = args.find((entry) => entry.startsWith(prefix));
    return found ? found.slice(prefix.length) : null;
  };
  const commit = args.includes('--commit');
  const verbose = args.includes('--verbose');
  const undoFile = arg('undo');
  const dryRun = !commit && !undoFile;

  const catalogueFile = resolve(repoRoot, arg('catalogue') ?? DEFAULT_CATALOGUE);
  const BASE = (arg('url') ?? process.env.KATZU_WORKER_URL ?? DEFAULT_WORKER_URL).replace(/\/+$/, '');
  const isLocal = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(BASE);

  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    console.error('ADMIN_SECRET is not set. Add it to the environment and retry; it is never printed.');
    return 2;
  }
  const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };

  async function adminGet(path) {
    const res = await fetch(`${BASE}${path}`, { headers });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }
  async function adminPost(path, payload) {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload ?? {}),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }
  async function publicGet(path) {
    const res = await fetch(`${BASE}${path}`);
    return res.json().catch(() => null);
  }

  // The listing endpoint clamps `limit` to 200, so a single call would quietly
  // under-report once the table grows past that. Page until the reported total is
  // reached: the "is this id live?" and "did an untouched row change?" checks are
  // only sound over the whole table.
  async function readLiveScenarios() {
    const pageSize = 200;
    const rows = [];
    let offset = 0;
    let total = Infinity;
    while (rows.length < total) {
      const res = await adminGet(`/admin/api/content-list?type=${SCENARIO_TYPE}&limit=${pageSize}&offset=${offset}`);
      if (res.status !== 200 || !Array.isArray(res.body?.rows)) {
        fail(`could not read live scenarios (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
      }
      total = Number(res.body?.total ?? res.body.rows.length);
      rows.push(...res.body.rows);
      if (res.body.rows.length === 0) break;
      offset += res.body.rows.length;
    }
    return rows;
  }

  async function readDrafts() {
    const res = await adminGet(`/admin/api/content-studio/${SCENARIO_TYPE}?status=draft&limit=200`);
    if (res.status !== 200 || !res.body?.counts) {
      fail(`could not read pending drafts (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
    }
    return Number(res.body.counts.drafts ?? 0);
  }

  async function collectAuditUids(ids, since) {
    const res = await adminGet(`/admin/api/content-studio/${SCENARIO_TYPE}/history?limit=200`);
    if (res.status !== 200 || !Array.isArray(res.body?.rows)) {
      return null;
    }
    const wanted = new Set(ids);
    const newest = new Map();
    for (const row of res.body.rows) {
      if (row.action !== 'publish' || row.undone) continue;
      if (!wanted.has(String(row.key))) continue;
      if (Number(row.ts) < since - 5000) continue;
      const prior = newest.get(String(row.key));
      if (!prior || Number(row.ts) >= Number(prior.ts)) newest.set(String(row.key), row);
    }
    return [...newest.entries()].map(([id, row]) => ({ id, uid: row.uid }));
  }

  async function undoManifest(manifest) {
    const results = [];
    const entries = [...(manifest.audit_uids ?? [])].reverse();
    for (const entry of entries) {
      const res = await adminPost(`/admin/api/content-studio/${SCENARIO_TYPE}/undo`, { audit_uid: entry.uid });
      results.push({ ...entry, status: res.status, body: res.body });
      if (res.status !== 200) {
        console.error(`  ✘ undo ${entry.id}: HTTP ${res.status} ${JSON.stringify(res.body)}`);
      } else {
        console.log(`  ✔ undo ${entry.id}`);
      }
    }
    const live = await readLiveScenarios();
    const mismatches = manifestMismatches(manifest, live, 'before');
    return { results, mismatches };
  }

  // --- Undo mode ------------------------------------------------------------
  if (undoFile) {
    const manifestPath = resolve(repoRoot, undoFile);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      fail(`cannot read manifest ${manifestPath}: ${error}`);
    }
    if (manifest?.kind !== 'katzu-scenario-update' || !Array.isArray(manifest.audit_uids)) {
      fail(`${manifestPath} is not a scenario-update manifest — nothing was undone`);
    }
    if (!/^https:\/\//.test(BASE) && !isLocal) {
      fail(`refusing to undo against "${BASE}" — expected the worker that took the load`);
    }
    console.log(`Undo ${manifestPath.replace(`${repoRoot}/`, '')}`);
    console.log(`  load: ${manifest.created_at} · ${manifest.ids.length} row(s) · backup ${manifest.backup_id}`);

    const liveNow = await readLiveScenarios();
    const drift = manifestMismatches(manifest, liveNow, 'after');
    if (drift.length > 0) {
      for (const line of drift.slice(0, 10)) console.error(`  ${line}`);
      fail(
        `${drift.length} live field(s) no longer match the manifest's after-state. Someone edited these rows ` +
          'after the load; refusing to undo over newer work. Nothing was written.',
      );
    }

    const { results, mismatches } = await undoManifest(manifest);
    const failed = results.filter((entry) => entry.status !== 200);
    if (failed.length > 0 || mismatches.length > 0) {
      for (const line of mismatches.slice(0, 10)) console.error(`  ${line}`);
      console.error(
        `\nUNDO INCOMPLETE — ${failed.length} publish(es) could not be reverted, ` +
          `${mismatches.length} field(s) still differ from the pre-load values.`,
      );
      return 1;
    }
    console.log(`\nUNDONE — ${results.length} publish(es) reverted; every row matches the pre-load values.`);
    return 0;
  }

  // --- Read the catalogue and the live table --------------------------------
  let catalogue;
  try {
    catalogue = JSON.parse(readFileSync(catalogueFile, 'utf8'));
  } catch (error) {
    fail(`cannot read ${catalogueFile}: ${error}`);
  }
  const rows = scenarioRows(catalogue);
  if (rows.length === 0) fail(`${catalogueFile.replace(`${repoRoot}/`, '')} has no scenarios — nothing to do`);

  const issues = payloadIssues(rows);
  if (issues.length > 0) {
    for (const issue of issues.slice(0, 20)) console.error(`  ${issue}`);
    fail(`${issues.length} catalogue problem(s) — nothing was read or written`);
  }

  const liveRows = await readLiveScenarios();
  const { targets, notLive } = scenarioTargets(rows, liveRows);
  const diff = diffScenarios(targets, liveRows);
  const summary = summarizeChanges(diff);
  const changedFields = diff.reduce((sum, row) => sum + row.changes.length, 0);

  console.log(`Update scene rows against ${BASE}`);
  console.log(`  catalogue: ${rows.length} scenario(s) · live: ${liveRows.length} row(s)`);
  console.log(`  targets present live: ${targets.length}`);
  if (notLive.length > 0) {
    console.log(`  not live (WILL NOT be created): ${notLive.join(', ')}`);
  }
  console.log(`  rows to change: ${diff.length} · fields to change: ${changedFields}`);
  for (const [column, count] of Object.entries(summary)) {
    console.log(`    ${column}: ${count} row(s)`);
  }
  if (verbose) {
    for (const row of diff) {
      console.log(`  ${row.id}`);
      for (const change of row.changes) {
        console.log(`    ${change.column}: ${describeValue(change.before)} → ${describeValue(change.after)}`);
      }
    }
  }

  const problems = scopeProblems(targets, liveRows);
  if (problems.length > 0) {
    for (const problem of problems.slice(0, 20)) console.error(`  ${problem}`);
    fail(`${problems.length} scope problem(s) — nothing was written`);
  }

  if (diff.length === 0) {
    console.log('\nNothing to update — the live rows already match the catalogue.');
    return 0;
  }

  if (dryRun) {
    console.log('\nDRY RUN — nothing was written. Re-run with --commit to apply.');
    return 0;
  }

  // --- Commit guards -------------------------------------------------------
  if (!/^https:\/\//.test(BASE) && !isLocal) {
    fail(`refusing to write against "${BASE}" — expected an https worker URL`);
  }
  const pendingDrafts = await readDrafts();
  if (pendingDrafts > 0) {
    fail(
      `${pendingDrafts} draft(s) already exist for ${SCENARIO_TYPE}. publish-all would publish them too — ` +
        'review or discard them first. Nothing was written.',
    );
  }

  const changedIds = diff.map((row) => row.id);
  const payloadById = new Map(targets.map((target) => [target.id, target.payload]));
  const liveBefore = liveIdMap(liveRows);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
  const outArg = arg('out');
  const outDir = outArg ? resolve(repoRoot, outArg) : resolve(repoRoot, 'backups', `content-load-${stamp}`);
  mkdirSync(outDir, { recursive: true });

  console.log('\nSnapshot ...');
  const backup = await adminPost(`/admin/api/content-studio/backup`, {});
  if (backup.status !== 200 || !backup.body?.backup_id) {
    fail(`could not take the studio backup (HTTP ${backup.status}): ${JSON.stringify(backup.body)}`);
  }
  const exportRes = await adminGet(`/admin/api/content-studio/export?type=${SCENARIO_TYPE}`);
  if (exportRes.status !== 200 || !Array.isArray(exportRes.body?.rows)) {
    fail(`could not export live scenarios (HTTP ${exportRes.status}): ${JSON.stringify(exportRes.body)}`);
  }
  const exportPath = resolve(outDir, 'scenarios-before.json');
  writeFileSync(exportPath, `${JSON.stringify(exportRes.body, null, 2)}\n`);
  console.log(`  backup: ${backup.body.backup_id}`);
  console.log(`  bookmark: ${backup.body.bookmark || '(D1 did not return one)'}`);
  console.log(`  export: ${exportPath.replace(`${repoRoot}/`, '')} (${exportRes.body.rows.length} rows)`);

  const manifest = buildManifest({
    baseUrl: BASE,
    backupId: backup.body.backup_id,
    bookmark: backup.body.bookmark || null,
    ids: changedIds,
    diff,
    before: Object.fromEntries(changedIds.map((id) => [id, pickScenarioColumns(liveBefore.get(id))])),
    after: Object.fromEntries(changedIds.map((id) => [id, pickScenarioColumns(payloadById.get(id))])),
    auditUids: [],
  });
  const manifestPath = resolve(outDir, 'manifest.json');

  const since = Date.now();
  let published = false;

  try {
    // --- Import as drafts ---------------------------------------------------
    console.log('\nCreating drafts ...');
    const imported = await adminPost(`/admin/api/content-studio/import`, {
      type: SCENARIO_TYPE,
      content: changedIds.map((id) => payloadById.get(id)),
      apply: true,
    });
    if (imported.status !== 200 || imported.body?.applied !== true) {
      fail(`import failed (HTTP ${imported.status}): ${JSON.stringify(imported.body)}`);
    }
    if (Number(imported.body.drafts) !== changedIds.length) {
      fail(
        `import created ${imported.body.drafts} draft(s), expected ${changedIds.length}: ` +
          `${JSON.stringify(imported.body.errors ?? [])}`,
      );
    }
    const drafts = await readDrafts();
    if (drafts !== changedIds.length) {
      fail(`draft count is ${drafts}, expected ${changedIds.length} — refusing to publish a surprise`);
    }
    console.log(`  ✔ ${drafts} draft(s)`);

    // --- Publish ------------------------------------------------------------
    console.log('\nPublishing ...');
    const publish = await adminPost(`/admin/api/content-studio/${SCENARIO_TYPE}/publish-all`, {});
    if (publish.status !== 200 || Number(publish.body?.published) !== changedIds.length) {
      fail(`publish-all published ${publish.body?.published ?? '?'}, expected ${changedIds.length}`);
    }
    if ((publish.body?.failed ?? []).length > 0) {
      fail(`publish-all reported ${publish.body.failed.length} failure(s): ${JSON.stringify(publish.body.failed)}`);
    }
    published = true;
    console.log(`  ✔ ${publish.body.published} row(s) published`);

    // --- Audit uids + manifest ---------------------------------------------
    const auditUids = await collectAuditUids(changedIds, since);
    if (!auditUids || auditUids.length !== changedIds.length) {
      manifest.audit_uids = auditUids ?? [];
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      fail(
        `collected ${auditUids?.length ?? 0} audit uid(s) for ${changedIds.length} published row(s). ` +
          `The manifest is at ${manifestPath.replace(`${repoRoot}/`, '')} — inspect history before undoing.`,
      );
    }
    manifest.audit_uids = auditUids;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`  ✔ ${auditUids.length} audit uid(s) recorded`);

    // --- Verify -------------------------------------------------------------
    console.log('\nVerifying ...');
    const liveAfter = await readLiveScenarios();
    const afterMismatches = manifestMismatches(manifest, liveAfter, 'after');
    const collateral = untouchedProblems(liveRows, liveAfter, changedIds);
    const publicScenarios = await publicGet('/scenarios');
    const publicMismatches = [];
    if (!Array.isArray(publicScenarios)) {
      publicMismatches.push('could not read the public /scenarios endpoint');
    } else {
      const publicMap = liveIdMap(publicScenarios);
      for (const id of changedIds) {
        const row = publicMap.get(id);
        if (!row) {
          publicMismatches.push(`${id}: missing from /scenarios`);
          continue;
        }
        for (const column of SCENARIO_COLUMNS) {
          if (norm(row[column]) !== norm(manifest.after[id]?.[column])) {
            publicMismatches.push(`${id}.${column}: public ${JSON.stringify(row[column] ?? null)} ≠ expected`);
          }
        }
      }
    }
    const problemsAfter = [...afterMismatches, ...collateral, ...publicMismatches];
    if (problemsAfter.length > 0) {
      for (const line of problemsAfter.slice(0, 20)) console.error(`  ${line}`);
      throw new Error(`${problemsAfter.length} verification problem(s)`);
    }
    console.log(`  ✔ ${changedIds.length} changed row(s) match the manifest`);
    console.log(`  ✔ ${liveAfter.length - changedIds.length} untouched row(s) unchanged`);
    console.log(`  ✔ /scenarios serves every changed field`);

    console.log(`\nDONE — ${changedIds.length} scenario row(s), ${changedFields} field(s) updated.`);
    console.log(`  manifest: ${manifestPath.replace(`${repoRoot}/`, '')}`);
    console.log(`  undo: node scripts/load-content-updates.mjs --undo=${manifestPath.replace(`${repoRoot}/`, '')}`);
    console.log(`  backup: ${manifest.backup_id} · bookmark: ${manifest.bookmark || '(none)'}`);
    return 0;
  } catch (error) {
    console.error(`\n✘ ${error?.message || error}`);
    manifest.audit_uids = manifest.audit_uids ?? [];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (published && manifest.audit_uids.length > 0) {
      console.error('\nRolling back the publishes that landed ...');
      const { mismatches } = await undoManifest(manifest);
      if (mismatches.length === 0) {
        console.error(`  ✔ rollback complete; the manifest is at ${manifestPath.replace(`${repoRoot}/`, '')}`);
      } else {
        for (const line of mismatches.slice(0, 10)) console.error(`  ✘ ${line}`);
        console.error(`  Rollback incomplete. Restore from backup ${manifest.backup_id} and stop.`);
      }
    } else if (!published) {
      const drafts = await readDrafts().catch(() => null);
      console.error(`  Nothing published. Drafts left: ${drafts ?? 'unknown'} — discard them before retrying.`);
    }
    return 1;
  }
}

const isEntryPoint = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  try {
    process.exitCode = await main();
  } catch (error) {
    if (error instanceof RunError) console.error(`\n✘ ${error.message}`);
    else console.error(`\n✘ ${error?.stack || error}`);
    process.exitCode = 1;
  }
}
