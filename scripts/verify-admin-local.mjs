#!/usr/bin/env node
/**
 * The admin dashboard, exercised with a key against a seeded local database.
 *
 * `/admin` is served by a worker whose data paths all need `ADMIN_SECRET`, which
 * AGENTS.md §3 forbids an agent reading — so the checks possible were "the page parses"
 * and "unauth returns 401", both true of a dashboard whose panels are empty and whose
 * writes fail silently. The 2026-10-22 run of this harness found four defects no curl had
 * seen; it is that run, kept. It never reads the production secret: throwaway key + HMAC
 * secret, a fresh `--persist-to` dir (every run IS a fresh database), `migrations/0001`,
 * the registry created through the real route, three seeded users, then every endpoint
 * with the key and the served page in Chromium — eight tabs, drawer, plan extend, codes,
 * providers — failing on any console error or a page that misses its last line.
 *
 *   npm run verify:admin:local                   # 37 checks, ~2 min
 *   npm run verify:admin:local -- --no-browser    # API only, no Chromium
 *   npm run verify:admin:local -- --keep          # leave it up; prints URL + key
 * Exit 0 = passed. Exit 1 = a check failed. Exit 2 = the harness could not start.
 */

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ARG = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const KEEP = process.argv.includes('--keep');
const BROWSER = !process.argv.includes('--no-browser');
// Run wrangler through node, not `npx`: on Windows Node refuses to spawn a .cmd
// without a shell (CVE-2024-27980), and a shell would re-split these paths.
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const DB_NAME = 'katzu-content';
const ENTRY_MODULE = 'cloudflare-unified-worker.js';
const ADMIN_KEY = `local-${randomBytes(12).toString('hex')}`;
const HMAC_KEY = randomBytes(24).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
/** A check either passes, fails, or is skipped with a reason. Never silently green. */
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
  return Boolean(ok);
}
function skip(name, why) {
  results.push({ name, ok: true, skipped: true });
  console.log(`SKIP  ${name} :: ${why}`);
}
function info(msg) {
  console.log(`      ${msg}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function main() {
  const port = Number(ARG('port')) || (await freePort());
  const stateDir = join(ROOT, '.wrangler', `admin-local-${port}`);
  const base = `http://127.0.0.1:${port}`;
  const logPath = join(stateDir, 'wrangler.log');
  let child = null;
  let browser = null;

  const stopServer = () => {
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
  /** Stops the worker and waits for the port to stop answering, so the next boot owns it. */
  const stopAndWait = async () => {
    stopServer();
    const until = Date.now() + 15_000;
    while (Date.now() < until) {
      try {
        await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
      } catch {
        return;
      }
      await sleep(250);
    }
  };
  const cleanup = () => {
    try {
      browser?.close();
    } catch {}
    stopServer();
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
    `Admin dashboard, local run — http://127.0.0.1:${port}/admin\n` +
      `throwaway key (not the production secret), fresh database at .wrangler/admin-local-${port}\n`,
  );

  // ---- 0. A fresh state directory and the content DDL it needs --------------
  rmSync(stateDir, { recursive: true, force: true });
  mkdirSync(stateDir, { recursive: true });
  // `wrangler dev` cannot take the shipped entry directly — it exports test helpers
  // beside the handler and workerd rejects a string entrypoint export — so this
  // two-line module re-exports only the default and leaves the shipped file intact.
  const entryPath = join(stateDir, 'entry.mjs');
  writeFileSync(entryPath, `import worker from '../../${ENTRY_MODULE}';\nexport default worker;\n`);

  // The worker manages only its own ledger tables; the content tables are created
  // out-of-band in production, so a local run must too or content routes 500.
  // Section 1 of this file is the deployed DDL verbatim.
  const ddl = spawnSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', DB_NAME, '--local', '--persist-to', stateDir,
      '--file', join('migrations', '0001_content_tables.sql'), '--config', 'wrangler.toml'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (ddl.status !== 0) {
    console.error(`The content DDL did not apply.\n${ddl.stdout || ''}${ddl.stderr || ''}${ddl.error || ''}`);
    cleanup();
    process.exit(2);
  }

  const logTail = (lines = 25) => {
    try {
      return readFileSync(logPath, 'utf8').trim().split('\n').slice(-lines).join('\n');
    } catch {
      return '(no log)';
    }
  };

  // ---- 1. Boot the worker --------------------------------------------------
  // Called twice: once to create the registry (the state under test), then — after the
  // seeding below — again for everything that reads it. `wrangler dev` watches its
  // persist directory, so writing seed rows into it while live both reloads the worker
  // mid-request (`TypeError: fetch failed` on 2026-10-22, twice in a row, after the
  // server had answered eight requests) and makes a second `d1 execute` compete with
  // the running Miniflare for the same SQLite file, which on Windows can hang instead
  // of failing. Seeding with the server stopped removes both.
  const boot = async () => {
    const logFd = openSync(logPath, 'a');
    // Never inherit a real ADMIN_SECRET/HMAC_SECRET from the caller's shell (§3).
    const childEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ADMIN|HMAC)_SECRET$/.test(k)));
    child = spawn(
      process.execPath,
      [
        WRANGLER, 'dev', entryPath,
        '--config', 'wrangler.toml',
        '--ip', '127.0.0.1',
        '--port', String(port),
        '--persist-to', stateDir,
        // ENVIRONMENT=local makes ALLOW_OPEN_CORS meaningful; production ignores it and refuses these writes.
        '--var', 'ENVIRONMENT:local',
        '--var', 'ALLOW_OPEN_CORS:1',
        '--var', `ADMIN_SECRET:${ADMIN_KEY}`,
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
      console.error(`\nThe worker never answered /health on ${base}.\n\n${logTail()}`);
      cleanup();
      process.exit(2);
    }
    info(`worker up (pid ${child.pid}), log: ${logPath}`);
  };

  await boot();
  console.log();

  // ---- 2. The endpoints, with the throwaway key ----------------------------
  const call = (path, init = {}) =>
    fetch(base + path, {
      ...init,
      headers: {
        ...(init.auth === false ? {} : { Authorization: `Bearer ${ADMIN_KEY}` }),
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
  const body = async (path, init) => {
    const res = await call(path, init);
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  };
  const post = (path, payload) => body(path, { method: 'POST', body: JSON.stringify(payload) });

  const health = await fetch(`${base}/health`).then((r) => r.json());
  check('/health answers', health?.status === 'healthy', `ready=${health?.ready}`);

  for (const path of ['/admin/api/users', '/admin/api/overview', '/admin/api/ai-providers', '/admin/codes/report']) {
    const res = await call(path, { auth: false });
    check(`${path} rejects an unauthenticated request`, res.status === 401, `status=${res.status}`);
  }

  // The dashboard shell creates the registry. Before the 2026-10-22 fix this was
  // the request that answered "registry unavailable" on a database with no tables.
  const shell = await fetch(`${base}/admin`);
  check('GET /admin serves the dashboard shell', shell.status === 200, `${(await shell.text()).length} bytes`);
  const overview = await body('/admin/api/overview');
  check(
    'a fresh database bootstraps its own registry',
    overview.json?.stats?.available === true,
    `available=${overview.json?.stats?.available}`,
  );

  // ---- 3. Seed it, the way real traffic would have -------------------------
  // Server down: see the note on `boot` above. The registry the previous request just
  // created is on disk, so these rows land in the real schema, not a hand-written one.
  await stopAndWait();
  const now = Date.now();
  const day = 86_400_000;
  const expires = now + 20 * day;
  const seedSql = `
INSERT INTO users (id, email, created_at, last_seen_at, plan, plan_expires_at, last_ip, platform, src) VALUES
  ('u-local-alpha', 'alpha@harness.test', ${now - 30 * day}, ${now - 3_600_000}, 'pro', ${expires}, '127.0.0.1', 'android', 'local-harness'),
  ('u-local-beta',  'beta@harness.test',  ${now - 9 * day},  ${now - 86_400_000}, 'free', NULL, '127.0.0.1', 'ios', 'local-harness'),
  ('u-local-gamma', 'gamma@harness.test', ${now - 2 * day},  ${now - 600_000}, 'free', NULL, '127.0.0.1', 'web', 'local-harness');
INSERT INTO activity_log (user_id, event_type, metadata, created_at) VALUES
  ('u-local-alpha', 'session_start', '{"platform":"android"}', ${now - 3_600_000});
INSERT INTO error_reports (user_id, error_type, endpoint, message, created_at) VALUES
  ('u-local-alpha', 'TypeError', '/ai/chat', 'Cannot read properties of undefined', ${now - 300_000});
`;
  const seedPath = join(stateDir, 'seed.sql');
  writeFileSync(seedPath, seedSql);
  const seed = spawnSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', DB_NAME, '--local', '--persist-to', stateDir,
      '--file', seedPath, '--config', 'wrangler.toml'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (seed.status !== 0) {
    console.error(`Seeding the local database failed.\n${seed.stdout || ''}${seed.stderr || ''}`);
    cleanup();
    process.exit(2);
  }
  await boot();
  console.log();

  const users = await body('/admin/api/users');
  const userRows = users.json?.users || [];
  check('GET /admin/api/users returns the seeded users', userRows.length >= 3, `${userRows.length} rows`);

  const detail = await body('/admin/api/user?id=u-local-alpha');
  check(
    'GET /admin/api/user returns the record with its activity',
    detail.json?.found === true && (detail.json?.activity || []).length >= 1,
    `${(detail.json?.activity || []).length} activity rows, ${(detail.json?.errors || []).length} errors`,
  );

  const activity = await body('/admin/api/activity');
  check(
    'GET /admin/api/activity includes the seeded event',
    (activity.json?.activity || []).some((row) => row.event_type === 'session_start'),
  );

  const errors = await body('/admin/api/errors');
  check(
    'GET /admin/api/errors includes the seeded report',
    (errors.json?.errors || []).some((row) => row.error_type === 'TypeError'),
  );

  const providers = await body('/admin/api/ai-providers');
  check(
    'GET /admin/api/ai-providers returns the built-in pool and its walk order',
    (providers.json?.defaults || []).length > 0 && (providers.json?.pool_order || []).length > 0,
    `${(providers.json?.defaults || []).length} defaults · ${(providers.json?.pool_order || []).length} in order`,
  );

  const saved = await post('/admin/api/ai-provider-save', { id: 'nvidia', keys: ['local-key-one', 'local-key-two'] });
  check('POST /admin/api/ai-provider-save stores keys on a built-in entry', saved.json?.keyCount === 2, `keyCount=${saved.json?.keyCount}`);

  const afterSave = await body('/admin/api/ai-providers');
  const nvidia = (afterSave.json?.defaults || []).find((row) => row.id === 'nvidia');
  // The 2026-10-22 defect: the save stored the keys and routing served them, but
  // this list rebuilt the row from PROVIDER_POOL and dropped the override.
  check(
    'the provider list reads those keys back (not "0 · env")',
    nvidia?.keyCount === 2 && nvidia?.keySource === 'dashboard',
    `${nvidia?.keyCount} · ${nvidia?.keySource}`,
  );

  const generated = await post('/admin/generate', { months: 3, count: 3, label: 'local-harness' });
  const minted = generated.json?.codes || [];
  check('POST /admin/generate mints a labelled batch', generated.status === 200 && minted.length === 3, `${minted.length} codes`);

  const report = await body('/admin/codes/report');
  const label = (report.json?.labels || []).find((row) => row.label === 'local-harness');
  check(
    'GET /admin/codes/report counts the minted batch',
    label?.created === 3,
    `created=${label?.created}, activated=${label?.activated}`,
  );

  // alpha already carries an expiry, so this proves a real month step (day preserved).
  const before = await post('/admin/lookup', { email: 'alpha@harness.test' });
  const extended = await post('/admin/edit', { email: 'alpha@harness.test', add_months: 1 });
  const from = before.json?.expiresAt ? new Date(before.json.expiresAt) : null;
  const to = extended.json?.new_expires_at ? new Date(extended.json.new_expires_at) : null;
  const monthStep = from && to ? (to.getUTCMonth() - from.getUTCMonth() + 12) % 12 : null;
  check(
    'POST /admin/edit extends a plan by exactly one month',
    extended.status === 200 && monthStep === 1 && from.getUTCDate() === to.getUTCDate(),
    `${before.json?.expiresAt || 'no expiry'} → ${extended.json?.new_expires_at || 'none'}`,
  );

  const revoked = await post('/admin/revoke', { email: 'beta@harness.test' });
  const afterRevoke = await post('/admin/lookup', { email: 'beta@harness.test' });
  check(
    'POST /admin/revoke clears the plan and the lookup agrees',
    revoked.status === 200 && afterRevoke.json?.active !== true,
    `active=${afterRevoke.json?.active}`,
  );

  const content = await body('/admin/api/content-list?type=vocabulary&limit=1');
  check('GET /admin/api/content-list reaches the content tables', content.status === 200, `status=${content.status}`);

  // A refused write must be refused, not silently accepted: the server half of the
  // false-success defect, where `api()` only threw on 401 and a 404 read as data.
  const refused = await post('/admin/edit', { email: 'nobody@harness.test', add_months: 1 });
  check('a write for an unknown user is refused', refused.status === 404, `status=${refused.status}`);

  // ---- 4. The real page, in Chromium --------------------------------------
  console.log();
  if (!BROWSER) {
    skip('browser checks', '--no-browser');
  } else {
    let chromium = null;
    try {
      ({ chromium } = await import('playwright-core'));
    } catch {
      skip('browser checks', 'playwright-core is not installed (npm ci)');
    }
    if (chromium) {
      const consoleErrors = [];
      let connected = false;
      try {
        browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
        const page = await browser.newPage({ viewport: { width: 1500, height: 1150 } });
        page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
        page.on('console', (msg) => {
          if (connected && msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
        });

        await page.goto(`${base}/admin`, { waitUntil: 'load', timeout: 45_000 });
        await page.waitForFunction(() => window.__katzuAdminBoot === true, null, { timeout: 20_000 });
        check('the served page reaches the last line of its script', true);

        await page.waitForTimeout(3400); // past the 3 s boot watchdog
        const watchdog = await page.locator('[role="alert"]').count();
        check('no boot-watchdog banner appears', watchdog === 0, `${watchdog} alerts`);

        await page.fill('#admin-key', ADMIN_KEY);
        await page.click('#save-key-btn');
        await page.waitForFunction(
          () => (document.getElementById('key-state')?.textContent || '').includes('key loaded'),
          null,
          { timeout: 15_000 },
        );
        connected = true;
        check('Connect accepts the key and the key bar reports it', true);

        const tabs = ['overview', 'users', 'activity', 'errors', 'licenses', 'ai', 'content', 'schema'];
        for (const tab of tabs) {
          await page.click(`#nav-${tab}`);
          const visible = await page.isVisible(`#view-${tab}`);
          const heading = (await page.textContent('#page-title'))?.trim();
          check(`tab "${tab}" opens`, visible && Boolean(heading), heading);
        }

        await page.click('#nav-users');
        await page.waitForSelector('#users-body tr', { timeout: 15_000 });
        const rowCount = await page.locator('#users-body tr').count();
        check('the Users table renders the seeded rows', rowCount >= 3, `${rowCount} rows`);
        await page.locator('#users-body tr').first().click();
        await page.waitForSelector('#drawer-host .drawer', { timeout: 15_000 });
        const drawerText = (await page.textContent('#drawer-host')) || '';
        check('the user drawer opens with that user\'s timeline', drawerText.includes('@harness.test'), drawerText.slice(0, 60).replace(/\s+/g, ' '));
        await page.locator('#drawer-host button', { hasText: 'Close' }).first().click();

        await page.click('#nav-licenses');
        await page.fill('#gen-count', '2');
        await page.fill('#gen-label', 'ui-harness');
        await page.click('#gen-codes-btn');
        await page.waitForFunction(
          () => (document.getElementById('gen-result')?.textContent || '').includes('DE-'),
          null,
          { timeout: 20_000 },
        );
        check('Generate prints signed activation codes', true);
        await page.click('#codes-report-btn');
        await page.waitForFunction(
          () => (document.getElementById('codes-report')?.textContent || '').includes('ui-harness'),
          null,
          { timeout: 20_000 },
        );
        const reportText = (await page.textContent('#codes-report')) || '';
        check('the codes report renders the new label as DOM text', reportText.includes('ui-harness'), reportText.slice(0, 60).replace(/\s+/g, ' '));

        await page.click('#nav-ai');
        await page.waitForSelector('#aip-defaults tr', { timeout: 20_000 });
        const nvidiaKeys = (text) =>
          page.waitForFunction(
            (want) => [...document.querySelectorAll('#aip-defaults tr')].some((tr) => tr.textContent?.includes('nvidia') && tr.textContent.includes(want)),
            text,
            { timeout: 20_000 },
          );
        const keysButton = () => page.locator('#aip-defaults tr', { hasText: 'nvidia' }).first().locator('button', { hasText: 'Keys' }).first();
        // Clear first, so the count asserted below does not depend on the API phase above.
        await keysButton().click();
        await page.click('#aip-clear-keys-btn');
        await page.click('#aip-save-btn');
        await nvidiaKeys('0 (env secret)');
        await keysButton().click();
        await page.fill('#aip-keys', 'ui-key-one, ui-key-two');
        await page.click('#aip-save-btn');
        // The 2026-10-22 defect: the list rebuilt built-in rows without their stored
        // override, so this row read "0 keys · env" while routing served the keys.
        await nvidiaKeys('2 (dashboard)');
        check('Clear keys empties a built-in entry, and keys saved through the form read back as "2 (dashboard)"', true);

        const problems = consoleErrors.filter((line) => !/Failed to load resource/.test(line));
        check('the page logs no script errors while connected', problems.length === 0, problems.slice(0, 3).join(' | '));
      } catch (error) {
        // Name the step it died on: "Timeout" alone says nothing about which wait.
        const last = results.filter((r) => r.ok).pop()?.name || 'page load';
        check('browser checks completed', false, `${String(error?.message || error).slice(0, 120)} (after: ${last})`);
      } finally {
        try {
          await browser?.close();
        } catch {}
        browser = null;
      }
    }
  }

  // ---- 5. Verdict ---------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped).length;
  console.log();
  if (failed.length) {
    console.log(`ADMIN LOCAL FAIL — ${results.length - failed.length} passed, ${failed.length} failed, ${skipped} skipped`);
    for (const f of failed) console.log(`  FAILED: ${f.name}`);
    if (KEEP) console.log(`\nServer left running at ${base}/admin — key: ${ADMIN_KEY}`);
    cleanup();
    process.exit(1);
  }
  console.log(`ADMIN LOCAL OK — ${results.length - skipped} passed, ${skipped} skipped`);
  if (KEEP) {
    console.log(`\nServer left running at ${base}/admin`);
    console.log(`Admin key (throwaway, this run only): ${ADMIN_KEY}`);
    console.log(`Stop it with: ${process.platform === 'win32' ? `taskkill /PID ${child.pid} /T /F` : `kill ${child.pid}`}`);
    console.log(`State: ${stateDir}`);
    child.unref(); // this process must not wait for the server it was told to leave up
    return;
  }
  cleanup();
  process.exit(0);
}

await main();
