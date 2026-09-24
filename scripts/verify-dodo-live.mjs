#!/usr/bin/env node
/**
 * Live verification of the Katzu + Dodo Payments billing pipeline.
 *
 * WHAT THIS PROVES (against the deployed worker, not a mock):
 *   1. GET  /billing/health reports whether the deploy can take money.
 *   2. An unsigned / tampered webhook is rejected with 401.
 *   3. A correctly signed `subscription.active` webhook updates a real user's
 *      plan to Pro (read back through the admin API — the same D1 + KV stores
 *      the app's /check-status uses).
 *   4. Replaying the same event id does not extend access twice.
 *   5. `subscription.expired` ends the entitlement again.
 *
 * USAGE
 *   DODO_WEBHOOK_SECRET='whsec_...' ADMIN_SECRET='...' node scripts/verify-dodo-live.mjs
 *   # or:  node scripts/verify-dodo-live.mjs --secret=whsec_... --admin=...
 *   # optionally target another worker:  --url=https://katzu-test.ghidakalosh008.workers.dev
 *
 * The admin secret is optional; without it the plan read-back (step 3) is
 * reported as SKIP and the script still exits 0 when the rest passes.
 *
 * It writes ONE clearly-marked test account (sub `dodo-selftest-<ts>`,
 * email `dodo-selftest+<ts>@katzu.test`) and revokes it at the end when
 * ADMIN_SECRET is available. It never touches a real learner's entitlement.
 *
 * Exit code 0 = every executed check passed.
 */

import { createHmac } from 'node:crypto';

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};

const WORKER_URL =
  arg('url') || process.env.WORKER_URL || 'https://katzu-test.ghaidakalosh008.workers.dev';
const WEBHOOK_SECRET = arg('secret') || process.env.DODO_WEBHOOK_SECRET || '';
const ADMIN_SECRET = arg('admin') || process.env.ADMIN_SECRET || '';

let failures = 0;
let skips = 0;
const pass = (name, detail = '') => console.log(`PASS  ${name}${detail ? ` :: ${detail}` : ''}`);
const fail = (name, detail = '') => {
  failures += 1;
  console.log(`FAIL  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const skip = (name, detail = '') => {
  skips += 1;
  console.log(`SKIP  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const info = (msg) => console.log(`      ${msg}`);

/** Dodo hands out `whsec_<base64>`; the HMAC key is the decoded remainder. */
function webhookKey(secret) {
  if (secret.startsWith('whsec_')) return Buffer.from(secret.slice('whsec_'.length), 'base64');
  return Buffer.from(secret, 'utf8');
}

function signedHeaders(body, key, { id, timestamp = Math.floor(Date.now() / 1000) }) {
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return {
    'Content-Type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signature}`,
  };
}

const stamp = Date.now();
const TEST_SUB = `dodo-selftest-${stamp}`;
// Unique per run: `users.email` is UNIQUE, so reusing one address would make a
// second run fail to register and the read-back would resolve the earlier row.
const TEST_EMAIL = `dodo-selftest+${stamp}@katzu.test`;

function subscriptionEvent(type, extra = {}) {
  return {
    business_id: 'biz_selftest',
    timestamp: new Date().toISOString(),
    type,
    data: {
      subscription_id: `sub_selftest_${stamp}`,
      product_id: 'pdt_selftest',
      status: 'active',
      next_billing_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      customer: { customer_id: 'cus_selftest', email: TEST_EMAIL },
      metadata: { user_sub: TEST_SUB, user_email: TEST_EMAIL },
      ...extra,
    },
  };
}

const postWebhook = (body, headers) =>
  fetch(`${WORKER_URL}/billing/webhook`, { method: 'POST', headers, body });

async function admin(path, payload) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_SECRET}` },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  console.log(`Target: ${WORKER_URL}`);
  console.log(`Test account: ${TEST_SUB} <${TEST_EMAIL}>\n`);

  if (!WEBHOOK_SECRET) {
    console.error(
      'Missing webhook secret.\n' +
        "  Run with DODO_WEBHOOK_SECRET='whsec_...' (Dodo dashboard -> Developer -> Webhooks -> your endpoint -> signing secret).\n" +
        '  The secret must be the SAME value configured on the worker (npx wrangler secret put DODO_WEBHOOK_SECRET).'
    );
    process.exit(2);
  }

  // ---- 1. Configuration state -------------------------------------------
  const health = await fetch(`${WORKER_URL}/billing/health`).then((r) => r.json()).catch(() => null);
  if (health && typeof health === 'object') {
    pass('GET /billing/health', `env=${health.environment} ready=${health.ready}`);
    info(
      `apiKey=${health.apiKeyConfigured} webhookSecret=${health.webhookSecretConfigured} ` +
        `monthlyProduct=${health.monthlyProductConfigured} returnOrigin=${health.returnOrigin}`
    );
    if (!health.webhookSecretConfigured) {
      fail('worker has a webhook secret configured', 'the deploy reports webhookSecretConfigured=false');
    }
    if (!health.apiKeyConfigured || !health.monthlyProductConfigured) {
      info('NOTE: DODO_API_KEY / DODO_PRODUCT_ID_MONTHLY are not set yet — card checkout will 503 (webhooks still work).');
    }
  } else {
    fail('GET /billing/health', 'no JSON response');
  }

  // ---- 2. Unsigned and tampered requests are rejected -------------------
  const activeBody = JSON.stringify(subscriptionEvent('subscription.active'));

  const unsigned = await postWebhook(activeBody, { 'Content-Type': 'application/json' });
  if (unsigned.status === 401) pass('unsigned webhook rejected', '401');
  else fail('unsigned webhook rejected', `status=${unsigned.status}`);

  const wrongKey = signedHeaders(activeBody, Buffer.from('not-the-right-key'), { id: `evt_wrong_${stamp}` });
  const tampered = await postWebhook(activeBody.replace('"active"', '"expired"'), wrongKey);
  if (tampered.status === 401) pass('tampered/wrongly-signed webhook rejected', '401');
  else fail('tampered/wrongly-signed webhook rejected', `status=${tampered.status}`);

  // ---- 3. A correctly signed payment grants Pro ------------------------
  const key = webhookKey(WEBHOOK_SECRET);
  const eventId = `evt_active_${stamp}`;
  const granted = await postWebhook(activeBody, signedHeaders(activeBody, key, { id: eventId }));
  const grantedBody = await granted.json().catch(() => ({}));
  if (granted.status === 200 && grantedBody.active === true) {
    pass('signed subscription.active granted Pro', `expiresAt=${grantedBody.expiresAt}`);
  } else {
    fail('signed subscription.active granted Pro', `status=${granted.status} ${JSON.stringify(grantedBody).slice(0, 160)}`);
  }

  if (ADMIN_SECRET) {
    const lookup = await admin('/admin/lookup', { email: TEST_EMAIL });
    if (lookup.status === 200 && lookup.body.found === true && lookup.body.plan === 'pro') {
      pass('plan read-back through the admin API', `plan=${lookup.body.plan} expiresAt=${lookup.body.expiresAt}`);
    } else {
      fail('plan read-back through the admin API', `status=${lookup.status} ${JSON.stringify(lookup.body).slice(0, 160)}`);
    }
  } else {
    skip('plan read-back through the admin API', 'no ADMIN_SECRET supplied');
  }

  // ---- 4. Replay is idempotent ----------------------------------------
  const replay = await postWebhook(activeBody, signedHeaders(activeBody, key, { id: eventId }));
  const replayBody = await replay.json().catch(() => ({}));
  if (replay.status === 200 && replayBody.duplicate === true) {
    pass('replayed event id is acknowledged without re-granting', 'duplicate=true');
  } else {
    fail('replayed event id is acknowledged without re-granting', `status=${replay.status} ${JSON.stringify(replayBody).slice(0, 160)}`);
  }

  // ---- 5. A terminal event ends the entitlement ------------------------
  const expiredBody = JSON.stringify(
    subscriptionEvent('subscription.expired', { status: 'expired', next_billing_date: null })
  );
  const ended = await postWebhook(expiredBody, signedHeaders(expiredBody, key, { id: `evt_expired_${stamp}` }));
  const endedBody = await ended.json().catch(() => ({}));
  if (ended.status === 200 && endedBody.action === 'end' && endedBody.active === false) {
    pass('subscription.expired ended the entitlement', `preserved=${!!endedBody.preserved}`);
  } else {
    fail('subscription.expired ended the entitlement', `status=${ended.status} ${JSON.stringify(endedBody).slice(0, 160)}`);
  }

  // ---- Cleanup ---------------------------------------------------------
  if (ADMIN_SECRET) {
    const revoke = await admin('/admin/revoke', { email: TEST_EMAIL });
    if (revoke.status === 200 && revoke.body.success) pass('test account revoked', 'left as a free registry row');
    else info(`cleanup: /admin/revoke returned ${revoke.status}`);
  } else {
    info(`cleanup skipped — revoke manually if desired: /admin/revoke { email: "${TEST_EMAIL}" }`);
  }

  console.log(
    failures
      ? `\n${failures} check(s) FAILED${skips ? `, ${skips} skipped` : ''}.`
      : `\nAll checks passed${skips ? ` (${skips} skipped)` : ''}.`
  );
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(`verification failed: ${String(e?.message || e)}`);
  process.exit(1);
});
