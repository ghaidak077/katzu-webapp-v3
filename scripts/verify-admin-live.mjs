#!/usr/bin/env node
/**
 * Live verification of the Katzu admin control plane against the deployed worker.
 *
 * WHY THIS SCRIPT EXISTS
 * The agent that wrote this could not finish the live check autonomously:
 * `ADMIN_SECRET` is write-only in Cloudflare, is not in the repo, and the
 * sandbox blocks reading process.env — so the authenticated admin endpoints
 * could not be called. Run this yourself (it reads the secret from YOUR shell
 * environment and never prints it):
 *
 *   ADMIN_SECRET='<your admin secret>' node scripts/verify-admin-live.mjs
 *
 * Optional: WORKER_URL to target another deployment (default = staging).
 *
 * Exit code 0 = every check passed. Non-zero = at least one check failed.
 */

// The secret is accepted as an argument too, because some sandboxes block
// reading process.env outright. It is never logged or echoed.
const ARG_SECRET = (process.argv.find((a) => a.startsWith('--secret=')) || '').slice('--secret='.length);
const WORKER_URL =
  (process.argv.find((a) => a.startsWith('--url=')) || '').slice('--url='.length) ||
  process.env.WORKER_URL ||
  'https://katzu-test.ghaidakalosh008.workers.dev';
const SECRET = ARG_SECRET || process.env.ADMIN_SECRET;

let failures = 0;
const pass = (name, detail = '') => console.log(`PASS  ${name}${detail ? ` :: ${detail}` : ''}`);
const fail = (name, detail = '') => {
  failures += 1;
  console.log(`FAIL  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const info = (msg) => console.log(`      ${msg}`);

async function main() {
  console.log(`Target: ${WORKER_URL}\n`);

  // ---- 1. Dashboard shell is public and serves the NEW dashboard -----------
  const dash = await fetch(`${WORKER_URL}/admin`);
  const html = await dash.text();
  const newMarkers = ['/admin/api/overview', "showTab('users')", 'nav-activity', 'nav-errors'];
  const missing = newMarkers.filter((m) => !html.includes(m));
  if (dash.status === 200 && !missing.length) {
    pass('GET /admin serves the new dashboard', `${html.length} bytes`);
  } else {
    fail('GET /admin serves the new dashboard', `status=${dash.status} missing=${missing.join(',')}`);
  }
  if (!html.includes('Katzu Unified Control Plane')) {
    pass('old dashboard is no longer served');
  } else {
    fail('old dashboard is no longer served', 'legacy markup still present');
  }

  // ---- 2. Admin gate is closed without a secret ---------------------------
  const unauth = await fetch(`${WORKER_URL}/admin/api/users`);
  if (unauth.status === 401) pass('admin API rejects unauthenticated requests', '401');
  else fail('admin API rejects unauthenticated requests', `status=${unauth.status}`);

  if (!SECRET) {
    console.log(
      '\nNo admin secret supplied — skipping the authenticated checks.\n' +
        "Re-run as:  ADMIN_SECRET='<secret>' node scripts/verify-admin-live.mjs\n" +
        '        or:  node scripts/verify-admin-live.mjs --secret=<secret>\n'
    );
    process.exit(failures ? 1 : 3);
  }
  console.log('Using supplied admin secret (value never printed).\n');

  const api = (path, opts = {}) =>
    fetch(`${WORKER_URL}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });

  // ---- 3. Aggregate stats (registry is queryable) --------------------------
  const overviewRes = await api('/admin/api/overview');
  const overview = await overviewRes.json();
  if (overviewRes.status === 200 && overview?.stats?.available === true) {
    pass('GET /admin/api/overview', 'registry available');
    const s = overview.stats;
    info(`total=${s.total_users} free=${s.free_users} pro=${s.pro_users} active24h=${s.active_24h}`);
    info(`new 24h/7d/30d = ${s.new_24h}/${s.new_7d}/${s.new_30d} · errors24h=${s.errors_24h}`);
  } else {
    fail('GET /admin/api/overview', `status=${overviewRes.status} available=${overview?.stats?.available}`);
  }

  // ---- 4. THE FIX: a free user who never redeemed is findable --------------
  const usersRes = await api('/admin/api/users?limit=200&offset=0');
  const usersBody = await usersRes.json();
  const users = usersBody.users || [];
  info(`registry contains ${usersBody.total} user(s)`);

  const freeUsers = users.filter((u) => u.plan === 'free');
  if (!freeUsers.length) {
    fail(
      'a free (never-redeemed) user is found via admin lookup',
      'no free user in the registry yet — sign in to the app once, then re-run'
    );
  } else {
    pass('registry lists free users', `${freeUsers.length} of ${users.length}`);
    let checked = 0;
    for (const u of freeUsers.slice(0, 5)) {
      const res = await api('/admin/lookup', { method: 'POST', body: JSON.stringify({ email: u.email }) });
      const body = await res.json();
      // `source: "users"` proves the registry resolved it, NOT the legacy KV fallback.
      const ok = body.found === true && body.plan === 'free' && body.source === 'users';
      if (ok) {
        checked += 1;
        pass(`lookup ${u.email}`, `plan=free source=users registered=${body.registered}`);
      } else {
        fail(`lookup ${u.email}`, JSON.stringify(body).slice(0, 160));
      }
    }
    if (checked) info(`${checked} free user(s) resolved through the users registry (not email_index)`);
  }

  // ---- 5. A pre-migration redeemer still resolves (legacy fallback) --------
  const proUsers = users.filter((u) => u.plan === 'pro');
  if (proUsers.length) {
    const u = proUsers[0];
    const res = await api('/admin/lookup', { method: 'POST', body: JSON.stringify({ email: u.email }) });
    const body = await res.json();
    if (body.found === true) pass(`pro user lookup ${u.email}`, `plan=${body.plan} source=${body.source}`);
    else fail(`pro user lookup ${u.email}`, JSON.stringify(body).slice(0, 160));
  }

  console.log(failures ? `\n${failures} check(s) FAILED.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(`verification failed: ${String(e?.message || e)}`);
  process.exit(1);
});
