/**
 * Katzu Sales — crypto payments (NOWPayments) for the SEPARATE sales site.
 *
 * WHY THIS FILE EXISTS (same reason as cloudflare-admin.js and cloudflare-dodo.js):
 * cloudflare-unified-worker.js is ~175 KB. Measured in this repo, the edit tooling
 * applies diffs reliably up to ~48 KB of byte offset and fails past ~63 KB, which is
 * where the auth/subscription handlers live. This module is small and editable, and
 * the main worker imports it.
 *
 * IMPORTANT ARCHITECTURE NOTE
 * This is NOT an in-app purchase flow. The Katzu webapp only redeems activation
 * codes via its existing `POST /verify` endpoint — nothing here is ever called by
 * the app. A customer buys on the sales site (katzu-sales), pays in crypto, and
 * receives an HMAC-signed activation code that they type into the app. This module
 * is only the "sell a code" half; redemption is untouched.
 *
 * WHAT IT DOES
 * - POST /crypto/checkout : creates a NOWPayments invoice server-side and returns
 *   only `checkout_url`. The API key never leaves the Worker.
 * - POST /crypto/webhook  : the ONLY place a purchase is fulfilled. Verifies the
 *   `x-nowpayments-sig` HMAC-SHA512 signature, dedupes deliveries through a ledger
 *   table, and — on `finished` — mints an activation code through the EXISTING
 *   generator (`handleAdminGenerate`, injected as `deps.mintCode`) and stores it
 *   against the order.
 * - GET  /crypto/order    : what the success page polls with the buyer's claim
 *   token to display the code. The token is returned exactly once, at checkout.
 * - GET  /crypto/health   : configuration booleans only — never secret values.
 *
 * SECURITY POSTURE
 * - The webhook is authenticated by its signature, not by IP: unsigned, tampered
 *   or unparseable bodies get 401 and grant nothing.
 * - Signature scheme (NOWPayments API docs, "Instant Payments Notifications"):
 *   sort the JSON keys of the raw POST body, stringify, HMAC-SHA512 with the IPN
 *   secret key, hex-encode, and compare with the `x-nowpayments-sig` header.
 * - Deliveries are deduped by `payment_id:payment_status`. NOWPayments re-sends
 *   recurring notifications until the endpoint answers 2xx, so a re-delivery must
 *   never mint a second code.
 * - Crypto sales are one-off purchases of an N-month code — NOT a subscription.
 *   Nothing here touches the subscription/period-end stores that /check-status
 *   reads, so a crypto purchase can never silently shorten or extend a
 *   subscription that came from somewhere else.
 * - A code is minted only after the order row transitions `created -> paid`, and
 *   the minted value is written with a conditional UPDATE (`status = 'paid'`), so
 *   two concurrent webhooks cannot both deliver.
 */

import { recordActivity, recordError } from "./cloudflare-admin.js";

// ============================================================================
// 1. SCHEMA (additive only — mirrors ensureLedgerTables/ensureRegistryTables)
// ============================================================================

export async function ensureCryptoTables(env) {
  if (!env?.DB) return false;
  try {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS crypto_orders (
        order_id TEXT PRIMARY KEY,
        claim_token TEXT NOT NULL,
        months INTEGER NOT NULL,
        price_usd REAL NOT NULL,
        status TEXT NOT NULL,
        provider TEXT,
        payment_id TEXT,
        pay_currency TEXT,
        pay_amount REAL,
        invoice_url TEXT,
        code TEXT,
        created_at TEXT NOT NULL,
        paid_at TEXT,
        delivered_at TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS crypto_events (
        event_key TEXT PRIMARY KEY,
        payment_id TEXT,
        payment_status TEXT,
        order_id TEXT,
        received_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_crypto_orders_status ON crypto_orders (status, created_at)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_crypto_events_order ON crypto_events (order_id, received_at)`),
    ]);
    return true;
  } catch (e) {
    console.error("[crypto] ensure tables failed:", String(e?.message || e).slice(0, 160));
    return false;
  }
}

// ============================================================================
// 2. CONFIGURATION (non-secret; secrets are NOWPAYMENTS_API_KEY and
//    NOWPAYMENTS_IPN_SECRET, set with `wrangler secret put`)
// ============================================================================

// NOWPayments documents two hosts. Default to the sandbox so a half-configured
// deploy can never take real money.
const NOWPAYMENTS_HOSTS = {
  test_mode: "https://api-sandbox.nowpayments.io",
  live_mode: "https://api.nowpayments.io",
};

export function getCryptoEnvironment(env = {}) {
  const raw = String(env?.NOWPAYMENTS_ENVIRONMENT || "test_mode").toLowerCase();
  return raw === "live" || raw === "live_mode" ? "live_mode" : "test_mode";
}

export function getCryptoBaseUrl(env = {}) {
  const explicit = String(env?.NOWPAYMENTS_BASE_URL || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  return NOWPAYMENTS_HOSTS[getCryptoEnvironment(env)];
}

/** Price and code duration are vars so they can change without touching code. */
export function getCryptoPlan(env = {}) {
  const price = Number(env?.CRYPTO_PRICE_USD ?? 5);
  const months = Number(env?.CRYPTO_MONTHS ?? 1);
  return {
    priceUsd: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : 5,
    months: Number.isFinite(months) ? Math.min(12, Math.max(1, Math.trunc(months))) : 1,
  };
}

const stripSlash = (value) => String(value || "").trim().replace(/\/+$/, "");

/**
 * Where the paying customer is returned to: the SALES site, never the app and
 * never this Worker's own host. An explicit SALES_ORIGIN wins; otherwise fall
 * back to the first allowlisted origin that is not the worker itself, then to
 * the caller's Origin (which the CORS gate already validated).
 */
export function resolveSalesOrigin(env = {}, request) {
  const explicit = stripSlash(env?.SALES_ORIGIN);
  if (explicit) return explicit;

  let selfHost = "";
  try {
    selfHost = new URL(request?.url || "").host;
  } catch {
    selfHost = "";
  }

  const allowed = String(env?.ALLOWED_ORIGINS || "")
    .split(",")
    .map(stripSlash)
    .filter(Boolean);

  const notSelf = allowed.find((candidate) => {
    try {
      return new URL(candidate).host !== selfHost;
    } catch {
      return false;
    }
  });
  if (notSelf) return notSelf;

  return stripSlash(request?.headers?.get?.("Origin"));
}

// ============================================================================
// 3. IPN SIGNATURE VERIFICATION
// https://nowpayments.io/help/what-is/what-is-ipn  (secret key in Store Settings)
// https://documenter.getpostman.com/view/7907941/S1a32n38  (algorithm + reference code)
//   "Sort all the parameters in alphabetical order... Convert them to string using
//    JSON.stringify(params, Object.keys(params).sort())... Sign a string with an
//    IPN-secret key with HMAC and sha-512... Compare with x-nowpayments-sig"
// ============================================================================

const encoder = new TextEncoder();

/**
 * Canonical string NOWPayments signs: the top-level keys sorted alphabetically,
 * JSON-stringified. A shallow sort with a plain stringify matches their reference
 * implementation for the flat, ASCII payloads their IPN sends (their PHP sample
 * uses ksort + json_encode, which differs from JS only on non-ASCII text — hence
 * the signed payload is kept ASCII by this module: the only free text it sends is
 * the order description).
 */
export function canonicalIpnPayload(rawBody) {
  const parsed = JSON.parse(rawBody);
  const sorted = {};
  for (const key of Object.keys(parsed).sort()) sorted[key] = parsed[key];
  return JSON.stringify(sorted);
}

function bytesToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

/** Constant-time comparison for equal-length hex digests. */
function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSha512Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToHex(signature);
}

/**
 * @returns {Promise<{ok: boolean, reason?: string, body?: object}>}
 */
export async function verifyNowPaymentsSignature(rawBody, headers, secret) {
  const received = String(headers?.get?.("x-nowpayments-sig") || "").trim().toLowerCase();
  if (!received) return { ok: false, reason: "missing_signature" };
  if (!secret) return { ok: false, reason: "missing_secret" };

  let canonical;
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
    canonical = canonicalIpnPayload(rawBody);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "invalid_json" };

  let expected;
  try {
    expected = await hmacSha512Hex(secret, canonical);
  } catch {
    return { ok: false, reason: "sign_failed" };
  }
  if (!timingSafeEqualHex(expected, received)) return { ok: false, reason: "signature_mismatch" };
  return { ok: true, body: parsed };
}

// ============================================================================
// 4. PAYMENT STATUS SEMANTICS
// NOWPayments sends a notification for every status change of a payment, and
// re-sends while the endpoint errors. `finished` is the only status where the
// funds are settled and credited, so it is the only one that delivers a code.
// ============================================================================

export const NOWPAYMENTS_GRANT_STATUS = "finished";
export const NOWPAYMENTS_PENDING_STATUSES = ["waiting", "confirming", "confirmed", "sending", "partially_paid"];
export const NOWPAYMENTS_FAILURE_STATUSES = ["failed", "refunded", "expired"];

/** @returns {"grant" | "pending" | "fail" | "unknown"} */
export function classifyNowPaymentsStatus(status) {
  const value = String(status || "").toLowerCase().trim();
  if (value === NOWPAYMENTS_GRANT_STATUS) return "grant";
  if (NOWPAYMENTS_PENDING_STATUSES.includes(value)) return "pending";
  if (NOWPAYMENTS_FAILURE_STATUSES.includes(value)) return "fail";
  return "unknown";
}

// ============================================================================
// 5. ORDER LIFECYCLE
//   created  -> invoice issued, nothing paid
//   paid     -> settled, code not stored yet (a crash here is recoverable)
//   delivered-> code stored and readable by the buyer
//   failed   -> invoice expired / payment failed / amount mismatch
// ============================================================================

/** Best-effort statement: a failed bookkeeping write must never fail a webhook. */
async function safeRun(stmt) {
  try {
    return await stmt;
  } catch (e) {
    console.error("[crypto] statement failed:", String(e?.message || e).slice(0, 160));
    return null;
  }
}

function randomHex(bytes = 16) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return bytesToHex(buffer);
}

async function readOrder(env, orderId) {
  try {
    return await env.DB.prepare(
      "SELECT order_id, claim_token, months, price_usd, status, code, created_at, paid_at, delivered_at FROM crypto_orders WHERE order_id = ?"
    )
      .bind(orderId)
      .first();
  } catch {
    return null;
  }
}

/**
 * Fulfils a settled order exactly once.
 * @returns {Promise<{delivered: boolean, duplicate: boolean, code?: string, reason?: string}>}
 */
export async function fulfillCryptOrder(env, order, payment, deps = {}, now = new Date()) {
  const iso = now.toISOString();

  // 1. Claim the order for fulfillment. Only the created -> paid transition
  //    proceeds; anything already paid/delivered is a re-delivery.
  const claim = await env.DB.prepare(
    "UPDATE crypto_orders SET status = 'paid', payment_id = ?, pay_currency = ?, pay_amount = ?, paid_at = ? WHERE order_id = ? AND status = 'created'"
  )
    .bind(
      String(payment?.payment_id ?? ""),
      String(payment?.pay_currency ?? ""),
      Number(payment?.actually_paid ?? payment?.pay_amount ?? 0),
      iso,
      order.order_id
    )
    .run();

  const claimed = claim?.meta?.changes ?? 0;
  if (claimed !== 1) {
    const current = await readOrder(env, order.order_id);
    if (current?.status === "delivered" && current.code) {
      return { delivered: false, duplicate: true, code: current.code };
    }
    // `paid` but not delivered: a previous attempt died between the two writes.
    // Fall through and finish the job.
    if (current?.status !== "paid") return { delivered: false, duplicate: true, reason: "not_claimable" };
  }

  // 2. Mint through the EXISTING generator — never a re-implementation.
  if (typeof deps.mintCode !== "function") {
    return { delivered: false, duplicate: false, reason: "mint_unavailable" };
  }
  let code;
  try {
    code = await deps.mintCode(order.months);
  } catch (e) {
    return { delivered: false, duplicate: false, reason: `mint_failed:${String(e?.message || e).slice(0, 80)}` };
  }
  if (!code || typeof code !== "string") {
    return { delivered: false, duplicate: false, reason: "mint_empty" };
  }

  // 3. Store it under the same conditional guard, so a concurrent webhook that
  //    also minted cannot overwrite the delivered code.
  const store = await env.DB.prepare(
    "UPDATE crypto_orders SET status = 'delivered', code = ?, delivered_at = ? WHERE order_id = ? AND status = 'paid'"
  )
    .bind(code, new Date().toISOString(), order.order_id)
    .run();

  const applied = store?.meta?.changes;
  if (applied === 1) return { delivered: true, duplicate: false, code };

  // Some D1 clients omit `meta`; fall back to reading back what actually landed.
  const current = await readOrder(env, order.order_id);
  if (current?.status === "delivered" && current.code) {
    return current.code === code
      ? { delivered: true, duplicate: false, code }
      : { delivered: false, duplicate: true, code: current.code };
  }
  return { delivered: false, duplicate: false, reason: "store_failed" };
}

// ============================================================================
// 6. ROUTES
// ============================================================================

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

/**
 * POST /crypto/checkout — creates a hosted invoice for a one-off code purchase.
 * No account, no login: the buyer may be buying for someone else. The order is
 * identified by an unguessable order id plus a claim token that is returned here
 * exactly once and is required to read the delivered code.
 */
export async function handleCryptoCheckout(request, env, cors) {
  if (!env?.NOWPAYMENTS_API_KEY) {
    return json({ error: "crypto_not_configured", message: "بوابة الدفع بالعملات الرقمية غير مهيأة على الخادم بعد." }, 503, cors);
  }

  const salesOrigin = resolveSalesOrigin(env, request);
  if (!salesOrigin) {
    return json({ error: "sales_origin_missing", message: "عنوان موقع البيع غير مهيأ على الخادم." }, 503, cors);
  }

  await ensureCryptoTables(env);
  if (!env?.DB) {
    return json({ error: "storage_unavailable", message: "تعذر تجهيز الطلب حالياً. حاول لاحقاً." }, 503, cors);
  }

  const { priceUsd, months } = getCryptoPlan(env);
  const orderId = `kz_${Date.now().toString(36)}${randomHex(4)}`;
  const claimToken = randomHex(32);

  let workerOrigin = "";
  try {
    workerOrigin = new URL(request.url).origin;
  } catch {
    workerOrigin = "";
  }

  // ASCII-only free text: the IPN signature is computed over JSON.stringify, and
  // NOWPayments' own reference implementation is PHP's json_encode (which escapes
  // non-ASCII). Keeping this string ASCII keeps the signed bytes identical.
  const orderDescription = `Katzu Pro activation code (${months} month${months > 1 ? "s" : ""})`;

  const payload = {
    price_amount: priceUsd,
    price_currency: "usd",
    order_id: orderId,
    order_description: orderDescription,
    ipn_callback_url: `${workerOrigin}/crypto/webhook`,
    success_url: `${salesOrigin}/success.html?order=${orderId}&token=${claimToken}`,
    cancel_url: `${salesOrigin}/?checkout=cancelled`,
    is_fixed_rate: true,
  };

  let upstream;
  try {
    upstream = await fetch(`${getCryptoBaseUrl(env)}/v1/invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.NOWPAYMENTS_API_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    await recordError(env, null, "crypto_checkout_error", "/crypto/checkout", e);
    return json({ error: "crypto_unreachable", message: "تعذر الوصول إلى بوابة الدفع. حاول لاحقاً." }, 502, cors);
  }

  const text = await upstream.text().catch(() => "");
  if (!upstream.ok) {
    // Keep the provider's diagnostic detail server-side; the buyer gets a clean message.
    console.error("[crypto] invoice failed", upstream.status, text.slice(0, 300));
    await recordError(env, null, "crypto_checkout_failed", "/crypto/checkout", `HTTP ${upstream.status}`);
    return json({ error: "checkout_failed", message: "تعذر بدء عملية الدفع. حاول مرة أخرى.", status: upstream.status }, 502, cors);
  }

  let invoice;
  try {
    invoice = JSON.parse(text);
  } catch {
    return json({ error: "checkout_failed", message: "رد غير متوقع من بوابة الدفع." }, 502, cors);
  }

  const checkoutUrl = invoice?.invoice_url || invoice?.url || "";
  if (!checkoutUrl) {
    await recordError(env, null, "crypto_checkout_no_url", "/crypto/checkout", JSON.stringify(invoice).slice(0, 200));
    return json({ error: "checkout_failed", message: "رد غير متوقع من بوابة الدفع." }, 502, cors);
  }

  try {
    await env.DB.prepare(
      "INSERT INTO crypto_orders (order_id, claim_token, months, price_usd, status, provider, invoice_url, created_at) VALUES (?, ?, ?, ?, 'created', 'nowpayments', ?, ?)"
    )
      .bind(orderId, claimToken, months, priceUsd, checkoutUrl, new Date().toISOString())
      .run();
  } catch (e) {
    await recordError(env, null, "crypto_order_store_failed", "/crypto/checkout", e);
    return json({ error: "storage_unavailable", message: "تعذر تجهيز الطلب حالياً. حاول لاحقاً." }, 503, cors);
  }

  await recordActivity(env, null, "crypto_checkout_created", {
    order_id: orderId,
    price_usd: priceUsd,
    months,
    environment: getCryptoEnvironment(env),
  });

  return json(
    {
      ok: true,
      order_id: orderId,
      claim_token: claimToken,
      checkout_url: checkoutUrl,
      invoice_id: invoice?.id ?? null,
      price_usd: priceUsd,
      months,
      currency: "usd",
      environment: getCryptoEnvironment(env),
    },
    200,
    cors
  );
}

/**
 * POST /crypto/webhook — the fulfillment authority. Always answers 2xx once the
 * signature is valid (even for statuses we ignore), because NOWPayments keeps
 * re-sending while the endpoint errors.
 */
export async function handleCryptoWebhook(request, env, cors, deps = {}) {
  const rawBody = await request.text();
  if (!rawBody) return json({ error: "empty_body" }, 400, cors);

  // Authentication comes before configuration so the endpoint answers the same
  // way to an unauthenticated caller whether or not the deploy is configured: an
  // unsigned notification is Unauthorized, full stop.
  const presented = String(request.headers.get("x-nowpayments-sig") || "").trim();
  if (!presented) {
    await recordError(env, null, "crypto_webhook_rejected", "/crypto/webhook", "missing_signature");
    return json({ error: "invalid_signature", reason: "missing_signature" }, 401, cors);
  }

  await ensureCryptoTables(env);

  // Verification needs the IPN secret. Without it no signature can ever be valid,
  // so the endpoint stays unauthorized rather than describing its own config gap
  // (health reports that for ops).
  const verified = await verifyNowPaymentsSignature(rawBody, request.headers, env?.NOWPAYMENTS_IPN_SECRET || "");
  if (!verified.ok) {
    if (verified.reason === "missing_secret") {
      console.error("[crypto] webhook received but NOWPAYMENTS_IPN_SECRET is not configured");
    }
    console.error("[crypto] webhook signature rejected:", verified.reason);
    await recordError(env, null, "crypto_webhook_rejected", "/crypto/webhook", verified.reason);
    return json({ error: "invalid_signature", reason: verified.reason }, 401, cors);
  }

  const payment = verified.body || {};
  const paymentId = payment.payment_id ? String(payment.payment_id) : "";
  const status = String(payment.payment_status || "").toLowerCase();
  const orderId = payment.order_id ? String(payment.order_id) : "";

  if (!paymentId || !status) {
    return json({ error: "malformed_notification" }, 400, cors);
  }

  // Delivery-level dedupe: re-notifications of the same status must not re-mint.
  const eventKey = `${paymentId}:${status}`;
  try {
    await env.DB.prepare(
      "INSERT INTO crypto_events (event_key, payment_id, payment_status, order_id, received_at) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(eventKey, paymentId, status, orderId || null, new Date().toISOString())
      .run();
  } catch {
    return json({ ok: true, duplicate: true, delivered: false, status }, 200, cors);
  }

  const classification = classifyNowPaymentsStatus(status);

  if (classification !== "grant") {
    if (classification === "fail" && orderId) {
      // Only an order that never paid is marked failed; a delivered purchase is
      // never clawed back here (refunds are a human decision).
      await safeRun(
        env.DB.prepare("UPDATE crypto_orders SET status = 'failed' WHERE order_id = ? AND status = 'created'")
          .bind(orderId)
          .run()
      );
    }
    return json({ ok: true, status, classification, delivered: false }, 200, cors);
  }

  if (!orderId) {
    await recordError(env, null, "crypto_unmatched", "/crypto/webhook", `payment ${paymentId} had no order_id`);
    return json({ ok: true, delivered: false, reason: "no_order_id" }, 200, cors);
  }

  const order = await readOrder(env, orderId);
  if (!order) {
    // A real payment we have no record of (manual invoice, another environment,
    // or a wiped table). Alert; never silently mint an unbacked code.
    await recordError(env, null, "crypto_unknown_order", "/crypto/webhook", `order ${orderId} / payment ${paymentId}`);
    return json({ ok: true, delivered: false, reason: "unknown_order" }, 200, cors);
  }

  // Defense in depth: the signed price must match the order we quoted.
  const paidUsd = Number(payment.price_amount);
  if (Number.isFinite(paidUsd) && Math.abs(paidUsd - Number(order.price_usd)) > 0.01) {
    await recordError(env, null, "crypto_price_mismatch", "/crypto/webhook", `${orderId}: ${paidUsd} != ${order.price_usd}`);
    await safeRun(
      env.DB.prepare("UPDATE crypto_orders SET status = 'failed' WHERE order_id = ? AND status = 'created'")
        .bind(orderId)
        .run()
    );
    return json({ ok: true, delivered: false, reason: "price_mismatch" }, 200, cors);
  }

  const result = await fulfillCryptOrder(env, order, payment, deps);
  if (result.delivered || result.duplicate) {
    if (result.delivered) {
      await recordActivity(env, null, "crypto_code_delivered", {
        order_id: orderId,
        months: order.months,
        price_usd: order.price_usd,
        environment: getCryptoEnvironment(env),
      });
    }
    return json({ ok: true, delivered: result.delivered, duplicate: result.duplicate, status }, 200, cors);
  }

  // Could not fulfill (e.g. the code generator was unavailable). Answer 5xx so
  // NOWPayments retries: the order stays in `paid`, which the next delivery (or
  // the operator) can finish. Never a silent charge with no code.
  //
  // The event claim is released first, otherwise the provider's own retry would be
  // deduped as a duplicate and the order would sit unfulfilled forever.
  await safeRun(env.DB.prepare("DELETE FROM crypto_events WHERE event_key = ?").bind(eventKey).run());
  await recordError(env, null, "crypto_fulfill_failed", "/crypto/webhook", `${orderId}: ${result.reason}`);
  return json({ error: "fulfillment_failed", reason: result.reason, retry: true }, 500, cors);
}

/**
 * GET /crypto/order?id=&token= — what the success page polls. The claim token is
 * the only credential; without it the response is indistinguishable from a
 * non-existent order.
 */
export async function handleCryptoOrder(request, env, cors, url) {
  await ensureCryptoTables(env);
  const orderId = String(url.searchParams.get("id") || "").trim();
  const token = String(url.searchParams.get("token") || "").trim();
  if (!orderId || !token) {
    return json({ error: "missing_parameters" }, 400, cors);
  }

  let row = null;
  try {
    row = await env.DB.prepare(
      "SELECT order_id, claim_token, months, price_usd, status, code, created_at, paid_at, delivered_at FROM crypto_orders WHERE order_id = ? AND claim_token = ?"
    )
      .bind(orderId, token)
      .first();
  } catch {
    return json({ error: "storage_unavailable" }, 503, cors);
  }

  if (!row) return json({ error: "not_found" }, 404, cors);

  const delivered = row.status === "delivered" && !!row.code;
  return json(
    {
      ok: true,
      order_id: row.order_id,
      status: row.status,
      months: row.months,
      price_usd: row.price_usd,
      delivered,
      // The code is exposed only after fulfillment, and only to the holder of
      // the claim token that was handed to this buyer at checkout.
      code: delivered ? row.code : null,
      created_at: row.created_at,
      paid_at: row.paid_at || null,
      delivered_at: row.delivered_at || null,
    },
    200,
    cors
  );
}

/** GET /crypto/health — booleans only; never echoes a key or secret. */
export function handleCryptoHealth(env, cors) {
  const { priceUsd, months } = getCryptoPlan(env);
  const salesOrigin = resolveSalesOrigin(env, null);
  const apiKeyConfigured = !!env?.NOWPAYMENTS_API_KEY;
  const ipnSecretConfigured = !!env?.NOWPAYMENTS_IPN_SECRET;
  return json(
    {
      ok: true,
      provider: "nowpayments",
      environment: getCryptoEnvironment(env),
      baseUrlHost: (() => {
        try {
          return new URL(getCryptoBaseUrl(env)).host;
        } catch {
          return "invalid";
        }
      })(),
      apiKeyConfigured,
      ipnSecretConfigured,
      salesOrigin: salesOrigin || null,
      priceUsd,
      months,
      ready: apiKeyConfigured && ipnSecretConfigured && !!salesOrigin,
    },
    200,
    cors
  );
}

/**
 * Router. Returns null for routes it does not own.
 * @param {object} deps - `{ mintCode(months) }`, supplied by the worker so this
 *   module reuses the existing activation-code generator instead of copying it.
 */
export async function handleCryptoRoutes(url, request, env, cors, deps = {}) {
  const path = url.pathname;
  if (!path.startsWith("/crypto")) return null;

  if (path === "/crypto/checkout" && request.method === "POST") {
    return await handleCryptoCheckout(request, env, cors);
  }
  if (path === "/crypto/webhook" && request.method === "POST") {
    return await handleCryptoWebhook(request, env, cors, deps);
  }
  if (path === "/crypto/order" && request.method === "GET") {
    return await handleCryptoOrder(request, env, cors, url);
  }
  if (path === "/crypto/health" && request.method === "GET") {
    return handleCryptoHealth(env, cors);
  }
  return json({ error: "not_found" }, 404, cors);
}
