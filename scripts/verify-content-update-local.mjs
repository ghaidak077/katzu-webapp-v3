#!/usr/bin/env node
/**
 * Proves `scripts/load-content-updates.mjs` end to end against a real worker and a
 * real D1 — not FakeD1. Fakes prove a code path; they cannot prove that a draft
 * survives publish, that the audit uid really undoes the exact row, or that a
 * publish-all did not touch a neighbour.
 *
 * What it does, every run, on a fresh local database:
 *   1. applies the pre-content-v2 production dump (`backups/pre-content-v2/content.sql`)
 *      — the real 49-row before-state — and lets the studio create its own tables;
 *   2. boots `wrangler dev` with a **throwaway** key (never the production secret);
 *   3. runs the loader's dry run and asserts the live table is byte-identical after it;
 *   4. plants an unrelated draft and asserts `--commit` refuses and writes nothing;
 *   5. runs `--commit`, then checks every one of the 49 rows against the catalogue,
 *      that the 12 new scenes were not created, and that `/scenarios` serves them;
 *   6. runs the dry run again and expects "nothing to update";
 *   7. runs `--undo` and asserts every field is back to the seeded before-state.
 *
 *   node scripts/verify-content-update-local.mjs            # ~2 min
 *   node scripts/verify-content-update-local.mjs --keep     # leaves the worker up
 *
 * Exit 0 = every check passed. Exit 1 = a check failed. Exit 2 = could not start.
 */

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import {
  SCENARIO_COLUMNS,
  liveIdMap,
  manifestMismatches,
  pickScenarioColumns,
  scenarioPayload,
  scenarioRows,
} from './load-content-updates.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ARG = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const KEEP = process.argv.includes('--keep');
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const DB_NAME = 'katzu-content';
const ENTRY_MODULE = 'cloudflare-unified-worker.js';
const LOADER = join(ROOT, 'scripts', 'load-content-updates.mjs');
const SEED_SQL = join(ROOT, 'backups', 'pre-content-v2', 'content.sql');
const CATALOGUE = join(ROOT, 'docs', 'content', 'catalogue', 'scenarios-catalogue.json');
const KEY = `local-${randomBytes(12).toString('hex')}`;
const HMAC_KEY = randomBytes(24).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
  return Boolean(ok);
}
function info(message) {
  console.log(`      ${message}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function d1(stateDir, args) {
  return spawnSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', DB_NAME, '--local', '--persist-to', stateDir, ...args, '--config', 'wrangler.toml'],
    { cwd: ROOT, encoding: 'utf8' },
  );
}

/** A real-row comparator: every writable column, empty and null as one value. */
const value = (input) => (input === null || input === undefined ? '' : String(input));
function rowDifferences(expected, actual) {
  const problems = [];
  for (const column of SCENARIO_COLUMNS) {
    if (value(expected?.[column]) !== value(actual?.[column])) {
      problems.push(`${column}: ${JSON.stringify(actual?.[column] ?? null)} ≠ ${JSON.stringify(expected?.[column] ?? null)}`);
    }
  }
  return problems;
}

async function main() {
  if (!existsSync(SEED_SQL)) {
    console.error(`The pre-content-v2 dump is missing: ${SEED_SQL}\nSee docs/BACKUP.md — this harness needs a real before-state.`);
    process.exit(2);
  }
  const catalogueRows = scenarioRows(JSON.parse(readFileSync(CATALOGUE, 'utf8')));
  const catalogueById = new Map(catalogueRows.map((row) => [String(row.id), row]));

  const port = Number(ARG('port')) || (await freePort());
  const stateDir = join(ROOT, '.wrangler', `content-update-${port}`);
  const base = `http://127.0.0.1:${port}`;
  const logPath = join(stateDir, 'wrangler.log');
  const outDir = join(stateDir, 'load');
  let child = null;

  const stopWorker = () => {
    if (!child || child.exitCode !== null) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  };
  const cleanup = () => {
    stopWorker();
    if (!KEEP) rmSync(stateDir, { recursive: true, force: true });
  };
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('uncaughtException', (error) => {
    console.error(`\nHARNESS ERROR  ${error?.stack || error}`);
    cleanup();
    process.exit(2);
  });

  console.log(
    `Scenario update loader, local end-to-end — ${base}\n` +
      `throwaway key (not the production secret), fresh database at .wrangler/content-update-${port}\n`,
  );

  // ---- 1. The real before-state + the studio's tables -----------------------
  rmSync(stateDir, { recursive: true, force: true });
  mkdirSync(stateDir, { recursive: true });
  // The studio's own tables (drafts, audit, backups, trash) are created lazily by
  // `ensureContentAdminTables` on the first studio request, so the dump plus a
  // booted worker is the whole schema this run needs.
  const seed = d1(stateDir, ['--file', SEED_SQL]);
  if (seed.status !== 0) {
    console.error(`The pre-v2 dump did not apply.\n${seed.stdout || ''}${seed.stderr || ''}${seed.error || ''}`);
    cleanup();
    process.exit(2);
  }

  // ---- 2. Boot the worker with a throwaway key ------------------------------
  const entryPath = join(stateDir, 'entry.mjs');
  writeFileSync(entryPath, `import worker from '../../${ENTRY_MODULE}';\nexport default worker;\n`);
  const logFd = openSync(logPath, 'a');
  const childEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ADMIN|HMAC)_SECRET$/.test(k)));
  child = spawn(
    process.execPath,
    [
      WRANGLER, 'dev', entryPath,
      '--config', 'wrangler.toml',
      '--ip', '127.0.0.1',
      '--port', String(port),
      '--persist-to', stateDir,
      '--var', 'ENVIRONMENT:local',
      '--var', 'ALLOW_OPEN_CORS:1',
      '--var', `ADMIN_SECRET:${KEY}`,
      '--var', `HMAC_SECRET:${HMAC_KEY}`,
    ],
    { cwd: ROOT, env: childEnv, detached: process.platform !== 'win32', stdio: ['ignore', logFd, logFd] },
  );
  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
    await sleep(400);
  }
  closeSync(logFd);
  if (!ready) {
    let tail = '';
    try {
      tail = readFileSync(logPath, 'utf8').trim().split('\n').slice(-25).join('\n');
    } catch {}
    console.error(`\nThe worker never answered /health on ${base}.\n\n${tail}`);
    cleanup();
    process.exit(2);
  }
  info(`worker up (pid ${child.pid}), log: ${logPath}`);

  const admin = (path, init = {}) =>
    fetch(base + path, {
      ...init,
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  const adminJson = async (path, init) => {
    const res = await admin(path, init);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const adminPost = (path, payload) =>
    adminJson(path, { method: 'POST', body: JSON.stringify(payload ?? {}) });

  const readLive = async () => {
    const res = await adminJson(`/admin/api/content-list?type=scenarios&limit=200&offset=0`);
    if (res.status !== 200 || !Array.isArray(res.body?.rows)) {
      throw new Error(`content-list failed: HTTP ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.rows;
  };
  const draftCount = async () => {
    const res = await adminJson('/admin/api/content-studio/scenarios?status=draft&limit=1');
    return Number(res.body?.counts?.drafts ?? -1);
  };

  const runLoader = (args) => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ADMIN|HMAC)_SECRET$/.test(k)));
    env.ADMIN_SECRET = KEY;
    const started = Date.now();
    const run = spawnSync(process.execPath, [LOADER, `--url=${base}`, `--catalogue=${CATALOGUE}`, ...args], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      timeout: 120_000,
    });
    const output = `${run.stdout || ''}${run.stderr || ''}`;
    info(`loader ${args.join(' ') || '(dry run)'} → exit ${run.status} in ${Math.round((Date.now() - started) / 1000)}s`);
    // A failing run's own words are the diagnosis; without this the harness only
    // reported "exit 1" and threw the reason away.
    if (run.status !== 0 || process.argv.includes('--verbose-runs')) {
      for (const line of output.trim().split('\n')) console.log(`      | ${line}`);
    }
    return { status: run.status, output };
  };

  // ---- 3. The seeded before-state -----------------------------------------
  const seeded = await readLive();
  check('the local database carries the real 49 scenarios', seeded.length === 49, `rows=${seeded.length}`);
  check('every seeded row is a known catalogue scene', seeded.every((row) => catalogueById.has(String(row.id))));
  const notLive = catalogueRows.filter((row) => !liveIdMap(seeded).has(String(row.id))).map((row) => String(row.id));
  check('exactly 12 catalogue scenes are not live', notLive.length === 12, notLive.join(','));
  const beforeById = new Map(seeded.map((row) => [String(row.id), pickScenarioColumns(row)]));

  // ---- 4. The dry run writes nothing --------------------------------------
  const dry = runLoader([]);
  const rowsToChange = Number((/rows to change: (\d+)/.exec(dry.output) || [])[1] ?? -1);
  const fieldsToChange = Number((/fields to change: (\d+)/.exec(dry.output) || [])[1] ?? -1);
  check('the dry run succeeds', dry.status === 0);
  check('the dry run finds every live scene', rowsToChange === 49, `rows=${rowsToChange}, fields=${fieldsToChange}`);
  check('the dry run lists the 12 scenes it will not create', dry.output.includes('WILL NOT be created'));
  const afterDry = await readLive();
  const dryCollateral = afterDry.filter((row) => {
    const before = beforeById.get(String(row.id));
    return !before || rowDifferences(before, row).length > 0;
  });
  check('the dry run changed no live field', dryCollateral.length === 0, `${dryCollateral.length} row(s) differ`);
  check('the dry run created no draft', (await draftCount()) === 0);

  // ---- 5. An unrelated draft stops the commit ------------------------------
  const guardId = String(seeded[0].id);
  const guardRow = catalogueById.get(guardId);
  const planted = await adminPost('/admin/api/content-studio/scenarios/draft', {
    key: guardId,
    row: scenarioPayload(guardRow, beforeById.get(guardId)),
    note: 'harness: unrelated draft',
  });
  check('the harness can plant an unrelated draft', planted.status === 200, `HTTP ${planted.status}`);
  const blocked = runLoader(['--commit']);
  check('the commit refuses while another draft exists', blocked.status === 1);
  check('the refusal names the draft reason', /draft\(s\) already exist/.test(blocked.output));
  const afterBlocked = await readLive();
  const blockedCollateral = afterBlocked.filter((row) => {
    const before = beforeById.get(String(row.id));
    return !before || rowDifferences(before, row).length > 0;
  });
  check('the refused commit wrote nothing', blockedCollateral.length === 0, `${blockedCollateral.length} row(s) differ`);
  const discarded = await adminPost('/admin/api/content-studio/scenarios/discard', { key: guardId });
  check('the planted draft is discarded', discarded.status === 200 && (await draftCount()) === 0);

  // ---- 6. The commit ------------------------------------------------------
  const commit = runLoader(['--commit', `--out=${outDir.slice(ROOT.length + 1)}`]);
  check('the commit succeeds', commit.status === 0);
  const manifestPath = join(outDir, 'manifest.json');
  check('the commit wrote a manifest', existsSync(manifestPath), manifestPath.slice(ROOT.length + 1));
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {}
  check('the manifest records one audit uid per row', manifest?.audit_uids?.length === 49, `${manifest?.audit_uids?.length ?? 0}`);
  check('the manifest carries the studio backup and bookmark', Boolean(manifest?.backup_id), `backup=${manifest?.backup_id}`);

  const published = await readLive();
  check('the live table still has 49 rows', published.length === 49, `rows=${published.length}`);
  const publishedById = liveIdMap(published);
  const missing = [...beforeById.keys()].filter((id) => !publishedById.has(id));
  check('every seeded scene survives the publish', missing.length === 0, missing.slice(0, 5).join(','));
  const created = published.filter((row) => !beforeById.has(String(row.id))).map((row) => String(row.id));
  check('the commit created no row', created.length === 0, created.slice(0, 5).join(','));

  const wrongRows = [];
  for (const [id] of beforeById) {
    const expected = scenarioPayload(catalogueById.get(id), beforeById.get(id));
    const actual = pickScenarioColumns(publishedById.get(id));
    const differences = rowDifferences(expected, actual);
    if (differences.length > 0) wrongRows.push(`${id}: ${differences.slice(0, 2).join('; ')}`);
  }
  check('every published row matches the catalogue, column for column', wrongRows.length === 0, wrongRows.slice(0, 3).join(' | '));

  const stillAbsent = notLive.filter((id) => publishedById.has(id));
  check('the 12 unapproved scenes are still not live', stillAbsent.length === 0, stillAbsent.join(','));
  check('no drafts are left behind', (await draftCount()) === 0);

  const publicRows = await fetch(`${base}/scenarios`).then((res) => res.json()).catch(() => null);
  const publicById = liveIdMap(Array.isArray(publicRows) ? publicRows : []);
  const publicWrong = [...beforeById.keys()].filter((id) => {
    const row = publicById.get(id);
    return !row || rowDifferences(scenarioPayload(catalogueById.get(id), beforeById.get(id)), row).length > 0;
  });
  check('/scenarios serves the corrected rows', Array.isArray(publicRows) && publicWrong.length === 0, `${publicWrong.length} row(s) differ`);

  // ---- 7. A second run is a no-op ----------------------------------------
  const settled = runLoader([]);
  check('a second dry run finds nothing to update', settled.status === 0 && /Nothing to update/.test(settled.output));

  // ---- 8. Undo restores the exact before-state ---------------------------
  const undo = runLoader([`--undo=${manifestPath.slice(ROOT.length + 1)}`]);
  check('the undo succeeds', undo.status === 0);
  const restored = await readLive();
  const restoreProblems = manifestMismatches(
    { ids: [...beforeById.keys()], before: Object.fromEntries(beforeById) },
    restored,
    'before',
  );
  if (restoreProblems.length > 0) info(`undo left ${restoreProblems.length} field(s) at the published value`);
  check('every field is back to the seeded value', restoreProblems.length === 0, restoreProblems.slice(0, 3).join(' | '));
  check('the undo left no draft behind', (await draftCount()) === 0);

  // ---- Report -------------------------------------------------------------
  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log(`failed: ${failed.map((entry) => entry.name).join(' | ')}`);
    cleanup();
    process.exit(1);
  }
  if (KEEP) console.log(`\nkept: ${base} · key in the log dir ${stateDir}`);
  cleanup();
  process.exit(0);
}

await main();
