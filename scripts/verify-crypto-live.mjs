#!/usr/bin/env node
/**
 * Live verification of the Katzu crypto sales pipeline (NOWPayments).
 *
 * WHAT THIS PROVES (against the deployed worker, not a mock):
 *   1. GET  /crypto/health reports whether the deploy can take money, and never
 *      echoes a key.
 *   2. An unsigned / tampered / wrongly-signed IPN is rejected with 401.
 *   3. POST /crypto/checkout creates a real provider invoice and returns only the
 *      hosted checkout URL plus this buyer's claim token.
 *   4. A signature-verified `finished` notification mints an activation code.
 *   5. The buyer reads that code back with their claim token, and only with it.
 *   6. Re-delivering the same notification does not mint a second code.
 *
 * USAGE
 *   NOWPAYMENTS_IPN_SECRET='<ipn secret>' node scripts/verify-crypto-live.mjs
 *   # or: node scripts/verify-crypto-live.mjs --ipn=<secret> [--url=...] [--origin=...]
 *
 * OPTIONS
 *   --poll=<seconds>   After creating the invoice, print the checkout URL and wait
 *                      for the REAL payment to be completed in the provider's
 *                      sandbox UI (and its real IPN to arrive) before falling back
 *                      to a script-signed notification.
 *   --no-simulate      Never send a script-signed notification. With --poll this is
 *                      the pure "real sandbox payment" end-to-end run.
 *
 * WHY THE SCRIPT SIGNS AN IPN ITSELF: the signature algorithm is the provider's
 * documented one (HMAC-SHA512 over the key-sorted JSON body, hex, compared with
 * the `x-nowpayments-sig` header). Signing here with the IPN secret proves the
 * worker's verification, fulfillment, and delivery path end to end at any time,
 * without waiting on a blockchain. The live sandbox payment (--poll) is the same
 * path with the provider generating the notification instead.
 *
 * The minted code is a REAL, redeemable code. Redeem it in the app once (that is
 * the final human check), or leave it; it is worth exactly one test month.
 *
 * Exit code 0 = every executed check passed.
 */

import { createHmac } from 'node:crypto';

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};
const flag = (name) => process.argv.includes(`--${name}`);

const WORKER_URL =
  arg('url') || process.env.WORKER_URL || 'https://katzu-test.ghaidakalosh008.workers.dev';
const IPN_SECRET = arg('ipn') || process.env.NOWPAYMENTS_IPN_SECRET || '';
const SALES_ORIGIN =
  arg('origin') || process.env.SALES_ORIGIN || 'https://katzu-sales.pages.dev';
const POLL_SECONDS = Number(arg('poll') || 0);
const SIMULATE = !flag('no-simulate');

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

/** NOWPayments signs the key-sorted JSON body with HMAC-SHA512, hex-encoded. */
function signIpn(payload, secret) {
  const sorted = {};
  for (const key of Object.keys(payload).sort()) sorted[key] = payload[key];
  return createHmac('sha512', secret).update(JSON.stringify(sorted)).digest('hex');
}

const jsonPost = (path, body, origin = null) =>
  fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  });

const sendIpn = (payload, origin = null) =>
  fetch(`${WORKER_URL}/crypto/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { Origin: origin } : {}),
      'x-nowpayments-sig': signIpn(payload, IPN_SECRET),
    },
    body: JSON.stringify(payload),
  });

const readOrder = (orderId, token) =>
  fetch(`${WORKER_URL}/crypto/order?id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`, {
    headers: { Origin: SALES_ORIGIN },
  });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`Target: ${WORKER_URL}`);
  console.log(`Sales origin: ${SALES_ORIGIN}\n`);

  // ---- 1. Configuration -----------------------------------------------------
  const healthRes = await fetch(`${WORKER_URL}/crypto/health`, { headers: { Origin: SALES_ORIGIN } });
  const health = await healthRes.json().catch(() => ({}));
  console.log(`health = ${JSON.stringify(health)}`);
  if (healthRes.status === 200 && health?.provider === 'nowpayments') {
    pass('GET /crypto/health', `environment=${health.environment} ready=${health.ready}`);
    if (health.environment !== 'test_mode') {
      info('WARNING: this deploy is in live_mode — the invoice created below is a REAL invoice.');
    }
  } else {
    fail('GET /crypto/health', `status=${healthRes.status}`);
  }
  if (JSON.stringify(health).includes('nowpayments_') || JSON.stringify(health).includes('x-api-key')) {
    fail('health response leaks a credential');
  } else {
    pass('health response carries no credential');
  }

  // ---- 2. Webhook authentication -------------------------------------------
  if (!IPN_SECRET) {
    skip('webhook signature checks', 'no IPN secret supplied');
  } else {
    const probe = { payment_id: 1, payment_status: 'waiting', order_id: 'kz_probe', price_amount: 5, price_currency: 'usd' };
    const unsigned = await jsonPost('/crypto/webhook', probe);
    if (unsigned.status === 401) pass('unsigned webhook rejected', '401');
    else fail('unsigned webhook rejected', `status=${unsigned.status}`);

    const body = JSON.stringify(probe);
    const tampered = await fetch(`${WORKER_URL}/crypto/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nowpayments-sig': signIpn({ ...probe, price_amount: 0.01 }, IPN_SECRET) },
      body,
    });
    if (tampered.status === 401) pass('tampered webhook rejected', '401');
    else fail('tampered webhook rejected', `status=${tampered.status}`);
  }

  // ---- 3. Checkout ----------------------------------------------------------
  if (!health?.ready) {
    skip('POST /crypto/checkout', 'the deploy is not ready (missing key, IPN secret, or sales origin)');
    console.log(failures ? `\n${failures} check(s) FAILED.` : `\nAll executed checks passed (${skips} skipped).`);
    process.exit(failures ? 1 : 0);
  }

  const checkoutRes = await jsonPost('/crypto/checkout', {}, SALES_ORIGIN);
  const checkout = await checkoutRes.json().catch(() => ({}));
  if (checkoutRes.status === 200 && checkout.checkout_url) {
    pass('POST /crypto/checkout', `order=${checkout.order_id} price=${checkout.price_usd}${checkout.currency} months=${checkout.months}`);
    info(`checkout URL: ${checkout.checkout_url}`);
  } else {
    fail('POST /crypto/checkout', `status=${checkoutRes.status} body=${JSON.stringify(checkout).slice(0, 200)}`);
    console.log(failures ? `\n${failures} check(s) FAILED.` : '\nNo further checks possible.');
    process.exit(failures ? 1 : 0);
  }

  // ---- 4. Before payment: no code is readable --------------------------------
  const beforeRes = await readOrder(checkout.order_id, checkout.claim_token);
  const before = await beforeRes.json();
  if (beforeRes.status === 200 && before.delivered === false && before.code === null) {
    pass('order is unpaid before settlement', `status=${before.status}`);
  } else {
    fail('order is unpaid before settlement', JSON.stringify(before).slice(0, 200));
  }

  const wrongToken = await readOrder(checkout.order_id, 'f'.repeat(64));
  if (wrongToken.status === 404) pass('order is unreadable without the claim token', '404');
  else fail('order is unreadable without the claim token', `status=${wrongToken.status}`);

  // ---- 5. Either a real sandbox payment, or a script-signed notification -----
  let delivered = null;
  if (POLL_SECONDS > 0) {
    info(`Waiting up to ${POLL_SECONDS}s for the REAL sandbox payment and its provider IPN…`);
    const deadline = Date.now() + POLL_SECONDS * 1000;
    while (Date.now() < deadline) {
      await wait(5000);
      const res = await readOrder(checkout.order_id, checkout.claim_token);
      const current = await res.json().catch(() => ({}));
      if (current.delivered && current.code) {
        delivered = current.code;
        break;
      }
      info(`  still ${current.status || 'unknown'}…`);
    }
    if (delivered) pass('provider IPN fulfilled a real sandbox payment');
    else skip('provider IPN fulfilled a real sandbox payment', 'no payment completed within the wait window');
  }

  if (!delivered && SIMULATE && IPN_SECRET) {
    const payload = {
      payment_id: 900000000 + Math.floor(Math.random() * 99999999),
      payment_status: 'finished',
      pay_address: 'bc1qselftest000000000000000000000000000',
      price_amount: Number(health.priceUsd ?? 5),
      price_currency: 'usd',
      pay_amount: 0.000084,
      actually_paid: 0.000084,
      pay_currency: 'btc',
      order_id: checkout.order_id,
      order_description: `Katzu Pro activation code (${checkout.months} month)`,
      purchase_id: String(Date.now()),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const webhookRes = await sendIpn(payload);
    const webhookBody = await webhookRes.json().catch(() => ({}));
    console.log(`webhook = ${webhookRes.status} ${JSON.stringify(webhookBody)}`);
    if (webhookRes.status === 200 && webhookBody.delivered === true) {
      pass('signed `finished` notification delivered a code');
    } else {
      fail('signed `finished` notification delivered a code', JSON.stringify(webhookBody).slice(0, 200));
    }

    const replay = await sendIpn(payload);
    const replayBody = await replay.json().catch(() => ({}));
    if (replay.status === 200 && replayBody.duplicate === true) {
      pass('re-delivered notification is a no-op', 'duplicate=true');
    } else {
      fail('re-delivered notification is a no-op', JSON.stringify(replayBody).slice(0, 200));
    }

    const afterRes = await readOrder(checkout.order_id, checkout.claim_token);
    const after = await afterRes.json();
    if (after.delivered && after.code) delivered = after.code;
  }

  // ---- 6. The buyer's code ---------------------------------------------------
  if (delivered) {
    const wellFormed = /^DE-\d+M-[0-9A-F]{8}-[0-9A-F]{16}$/.test(delivered);
    pass('buyer received an activation code', delivered);
    if (wellFormed) pass('code has the signed format the app redeems', 'DE-<months>M-<nonce>-<sig>');
    else fail('code has the signed format the app redeems', delivered);
    info('FINAL HUMAN CHECK: paste that code into the app once');
    info('(شاشة الاشتراك ← تفعيل الكود) and confirm Pro activates.');
  } else {
    skip('buyer received an activation code', 'nothing was delivered yet');
  }

  console.log(failures ? `\n${failures} check(s) FAILED.` : `\nAll executed checks passed (${skips} skipped).`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(`verification failed: ${String(e?.message || e)}`);
  process.exit(1);
});
