/**
 * Katzu Billing — Dodo Payments (merchant of record) integration.
 *
 * WHY THIS FILE EXISTS (same reason as cloudflare-admin.js):
 * cloudflare-unified-worker.js is ~174 KB. Measured in this repo, the edit
 * tooling applies diffs reliably up to ~48 KB of byte offset and fails past
 * ~63 KB, which is where the auth/subscription handlers live. This module is
 * small and editable, and the main worker imports it (see wrangler.toml -> main).
 *
 * WHAT IT DOES
 * - POST /billing/checkout : session-authenticated; creates a hosted Dodo
 *   checkout session and returns `checkout_url` for the browser to redirect to.
 * - POST /billing/webhook  : the ONLY way entitlements are granted. Verifies the
 *   Standard Webhooks HMAC signature, then writes the entitlement to the same
 *   stores `/check-status` already reads (KV `account:<sub>` + the `users`
 *   registry row), so Pro status becomes visible immediately.
 * - POST /billing/status   : what the app polls after returning from checkout.
 * - GET  /billing/health   : configuration booleans only — never secret values.
 *
 * SECURITY POSTURE
 * - The webhook is authenticated by signature, never by IP allowlist (Dodo's
 *   docs explicitly say their source IP pool changes and is not an auth
 *   mechanism). Unsigned, tampered, or stale (>5 min) requests get 401.
 * - A webhook event id is recorded once and re-deliveries are acknowledged
 *   without re-granting, because Dodo retries up to 8 times.
 * - A failed/expired subscription only truncates an entitlement that came from
 *   Dodo (`source: "dodo"`). An activation-code purchase is never destroyed by a
 *   billing event.
 *
 * The client NEVER sees the API key: the key stays in the Worker and only the
 * hosted `checkout_url` is returned.
 */

import {
  markUserPro,
  recordActivity,
  recordError,
  resolveSessionSubFromRequest,
  resolveUserRecord,
  setUserPlanBySub,
} from "./cloudflare-admin.js";

// ============================================================================
// 1. SCHEMA (additive only — mirrors ensureLedgerTables/ensureRegistryTables)
// ============================================================================

export async function ensureBillingTables(env) {
  if (!env?.DB) return false;
  try {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS billing_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT,
        account_id TEXT,
        subscription_id TEXT,
        received_at INTEGER
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS subscriptions (
        subscription_id TEXT PRIMARY KEY,
        account_id TEXT,
        product_id TEXT,
        status TEXT,
        current_period_end INTEGER,
        cancel_at_period_end INTEGER DEFAULT 0,
        customer_id TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_subs_account ON subscriptions (account_id)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions (status, current_period_end)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_billing_events_account ON billing_events (account_id, received_at)`),
    ]);
    return true;
  } catch (e) {
    console.error("[billing] ensure tables failed:", String(e?.message || e).slice(0, 160));
    return false;
  }
}

// ============================================================================
// 2. CONFIGURATION
// ============================================================================

// Dodo documents two hosts: test.dodopayments.com and live.dodopayments.com.
// Default to test so a half-configured deploy can never take real money.
const DODO_HOSTS = {
  test_mode: "https://test.dodopayments.com",
  live_mode: "https://live.dodopayments.com",
};

export function getDodoEnvironment(env = {}) {
  const raw = String(env?.DODO_ENVIRONMENT || "test_mode").toLowerCase();
  return raw === "live" || raw === "live_mode" ? "live_mode" : "test_mode";
}

function getDodoBaseUrl(env) {
  return DODO_HOSTS[getDodoEnvironment(env)];
}

/** Products are configured as vars (non-secret IDs), one per billing period. */
function getProductId(env, plan) {
  const normalize = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  if (plan === "annual") {
    return normalize(env?.DODO_PRODUCT_ID_ANNUAL) || normalize(env?.DODO_PRODUCT_ID);
  }
  return normalize(env?.DODO_PRODUCT_ID_MONTHLY) || normalize(env?.DODO_PRODUCT_ID);
}

/**
 * Where Dodo sends the customer back to after paying.
 *
 * Order: an explicit CHECKOUT_RETURN_ORIGIN, then the first allowed origin that
 * is NOT this worker's own host, then any allowed origin, then the caller Origin.
 *
 * Skipping the worker's own host matters: ALLOWED_ORIGINS legitimately lists it
 * first (the admin dashboard is served from there), and returning a paying
 * customer to the API host instead of the app would strand them on a JSON 404.
 */
export function resolveAppOrigin(env = {}, request) {
  const strip = (value) => String(value || "").trim().replace(/\/+$/, "");

  const explicit = strip(env?.CHECKOUT_RETURN_ORIGIN);
  if (explicit) return explicit;

  const allowed = String(env?.ALLOWED_ORIGINS || "")
    .split(",")
    .map(strip)
    .filter(Boolean);

  let selfHost = "";
  try {
    selfHost = new URL(request?.url || "").host;
  } catch {
    selfHost = "";
  }

  const appOrigin = allowed.find((candidate) => {
    try {
      return new URL(candidate).host !== selfHost;
    } catch {
      return false;
    }
  });
  if (appOrigin) return appOrigin;
  if (allowed[0]) return allowed[0];

  return strip(request?.headers?.get?.("Origin"));
}

// ============================================================================
// 3. STANDARD WEBHOOKS SIGNATURE VERIFICATION
// https://docs.dodopayments.com/developer-resources/webhooks
//   signed content = `${webhook-id}.${webhook-timestamp}.${raw body}`
//   HMAC-SHA256, base64, in the `webhook-signature` header as `v1,<sig>`
// ============================================================================

export const WEBHOOK_TOLERANCE_SECONDS = 300;

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The dashboard secret is shown as `whsec_<base64>`; the HMAC key is the decoded
 * remainder. A raw (non-prefixed) secret is used verbatim as UTF-8 bytes so a
 * self-hosted or manually-set secret still works.
 */
function decodeWebhookKey(secret) {
  const raw = String(secret || "");
  if (!raw) return null;
  if (raw.startsWith("whsec_")) {
    try {
      return base64ToBytes(raw.slice("whsec_".length));
    } catch {
      return new TextEncoder().encode(raw);
    }
  }
  return new TextEncoder().encode(raw);
}

/** Constant-time comparison via Web Crypto's own HMAC verify. */
async function hmacMatches(keyBytes, messageBytes, signatureBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, signatureBytes, messageBytes);
}

/**
 * Returns { ok: true, eventId, eventType } or { ok: false, reason }.
 * `reason` is safe to log; it never contains the signature or the secret.
 */
export async function verifyDodoSignature(rawBody, headers, secret, options = {}) {
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const tolerance = options.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;

  const get = (name) => {
    if (!headers) return "";
    if (typeof headers.get === "function") return headers.get(name) || "";
    return headers[name] || headers[name.toLowerCase()] || "";
  };

  const eventId = get("webhook-id");
  const timestamp = get("webhook-timestamp");
  const signatureHeader = get("webhook-signature");

  if (!secret) return { ok: false, reason: "secret_not_configured" };
  if (!eventId) return { ok: false, reason: "missing_webhook_id" };
  if (!timestamp) return { ok: false, reason: "missing_webhook_timestamp" };
  if (!signatureHeader) return { ok: false, reason: "missing_webhook_signature" };
  if (!/^\d+$/.test(timestamp.trim())) return { ok: false, reason: "malformed_webhook_timestamp" };

  const age = Math.abs(nowSeconds - Number(timestamp.trim()));
  if (age > tolerance) return { ok: false, reason: "timestamp_out_of_tolerance" };

  const keyBytes = decodeWebhookKey(secret);
  if (!keyBytes) return { ok: false, reason: "secret_not_configured" };

  const signedContent = `${eventId}.${timestamp.trim()}.${rawBody}`;
  const messageBytes = new TextEncoder().encode(signedContent);

  // The header may carry several space-separated candidates ("v1,<b64> v1,<b64>").
  const candidates = String(signatureHeader).trim().split(/\s+/).filter(Boolean);
  for (const candidate of candidates) {
    const comma = candidate.indexOf(",");
    const version = comma === -1 ? "v1" : candidate.slice(0, comma);
    const value = comma === -1 ? candidate : candidate.slice(comma + 1);
    if (version !== "v1" || !value) continue;
    let signatureBytes;
    try {
      signatureBytes = base64ToBytes(value);
    } catch {
      continue;
    }
    if (await hmacMatches(keyBytes, messageBytes, signatureBytes)) {
      return { ok: true, eventId, eventType: null };
    }
  }
  return { ok: false, reason: "invalid_signature" };
}

// ============================================================================
// 4. EVENT INTERPRETATION
// ============================================================================

/**
 * Decision table derived from Dodo's subscription lifecycle docs:
 * - grant  : money was taken — extend access to `next_billing_date`
 *   (subscription.active, subscription.renewed, payment.succeeded,
 *    subscription.plan_changed, subscription.unpaused)
 * - keep   : access continues but the period does not extend
 *   (subscription.on_hold, subscription.past_due — recoverable, do not punish)
 * - cancel : stop renewing; keep access until the period already paid for
 *   (subscription.cancelled)
 * - end    : reached the end of its term; entitlement stops (subscription.expired)
 * - deny   : ack and record, but never grant AND never revoke
 *   (subscription.failed). Dodo documents this as a failure to create the mandate
 *   at subscription creation — there is no paid period to take back, so revoking
 *   an existing entitlement here would punish the wrong thing.
 * - ignore : everything else (e.g. subscription.update_payment_method)
 */
export function classifyDodoEvent(eventType, data = {}) {
  const status = typeof data.status === "string" ? data.status.toLowerCase() : "";
  switch (String(eventType || "")) {
    case "subscription.active":
    case "subscription.renewed":
    case "subscription.plan_changed":
    case "subscription.unpaused":
      return "grant";
    case "payment.succeeded":
      // Only a subscription payment grants; a one-off payment must not.
      return data.subscription_id ? "grant" : "ignore";
    case "subscription.updated":
      // Fires on ANY field change, including cancel-at-period-end. Only treat it
      // as a grant while the subscription is genuinely active.
      return status === "active" ? "grant" : "keep";
    case "subscription.on_hold":
    case "subscription.past_due":
      return "keep";
    case "subscription.cancelled":
      return "cancel";
    case "subscription.expired":
      return "end";
    case "subscription.failed":
      // Terminal for the *new* subscription only: never granted, never revoked.
      return "deny";
    default:
      return "ignore";
  }
}

/** Best-effort end-of-period, in ms. Returns null when Dodo sent nothing usable. */
export function resolvePeriodEndMs(data = {}, now = Date.now()) {
  const candidates = [data.next_billing_date, data.expires_at, data.current_period_end];
  for (const value of candidates) {
    if (!value) continue;
    const ms = typeof value === "number" ? value : Date.parse(String(value));
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Which user does this event belong to?
 * 1. metadata.user_sub  — set by /billing/checkout, the reliable path
 * 2. metadata.user_email / customer.email — resolved through the registry
 * Returns { sub, email } or null.
 */
export async function resolveAccountFromEvent(env, data = {}) {
  const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
  const email = String(metadata.user_email || data?.customer?.email || "").toLowerCase().trim() || null;
  const explicitSub = typeof metadata.user_sub === "string" && metadata.user_sub.trim()
    ? metadata.user_sub.trim()
    : null;

  if (explicitSub) return { sub: explicitSub, email, matchedBy: "metadata" };
  if (email) {
    const record = await resolveUserRecord(env, { email });
    if (record?.sub) return { sub: record.sub, email: record.email || email, matchedBy: "email" };
  }
  return null;
}

// ============================================================================
// 5. ENTITLEMENT WRITES
// ============================================================================

const ACCOUNT_KEY = (sub) => `account:${sub}`;
const EVENT_MARKER_KEY = (eventId) => `dodo_event:${eventId}`;
const EVENT_MARKER_TTL_SECONDS = 60 * 60 * 24 * 30;

async function readAccountRecord(env, sub) {
  try {
    const raw = await env?.REDEEMED_CODES?.get(ACCOUNT_KEY(sub));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Write the entitlement to BOTH stores `/check-status` and the admin dashboard
 * read.
 *
 * mode "grant"/"cancel" take max(existing, new), so a re-delivered or
 * out-of-order event can never shorten access that was already paid for.
 *
 * mode "end" (subscription.failed / .expired) truncates to now, but ONLY when the
 * access currently on file is attributable to that subscription (its expiry is
 * inside the subscription's period). Activation codes write the same
 * `account:<sub>` record without a marker of their own, so the safe default here
 * is to preserve: a failed card must never revoke a code-purchased entitlement.
 */
async function writeEntitlement(env, { sub, email, expiresAtMs, mode = "grant", attributionMs = null }) {
  const existing = await readAccountRecord(env, sub);
  const existingMs = existing?.expiresAt ? Date.parse(existing.expiresAt) : NaN;
  const now = Date.now();

  let targetMs;
  if (mode === "end") {
    const attributable =
      attributionMs !== null && (!Number.isFinite(existingMs) || existingMs <= attributionMs + 60000);
    if (!attributable) return { preserved: true, reason: "manual_entitlement_preserved" };
    targetMs = now;
  } else {
    targetMs = Number.isFinite(existingMs) ? Math.max(existingMs, expiresAtMs) : expiresAtMs;
  }

  const expiresAtIso = new Date(targetMs).toISOString();
  const record = {
    email: email || existing?.email || null,
    expiresAt: expiresAtIso,
    source: mode === "end" ? existing?.source || null : "dodo",
    updatedAt: new Date().toISOString(),
  };
  await env?.REDEEMED_CODES?.put(ACCOUNT_KEY(sub), JSON.stringify(record));
  if (record.email) {
    await env?.REDEEMED_CODES?.put(`email_index:${String(record.email).toLowerCase()}`, sub);
  }

  const active = targetMs > now;
  await setUserPlanBySub(env, sub, active ? "pro" : "free", targetMs);
  if (active) await markUserPro({ sub, email: record.email }, expiresAtIso, env);
  return { expiresAt: expiresAtIso, active };
}

/** The period end currently on file for a user's newest subscription, if any. */
async function readSubscriptionPeriodEndMs(env, sub) {
  if (!env?.DB || !sub) return null;
  try {
    const row = await env.DB.prepare(
      "SELECT current_period_end FROM subscriptions WHERE account_id = ? ORDER BY updated_at DESC LIMIT 1"
    )
      .bind(sub)
      .first();
    return Number.isFinite(row?.current_period_end) ? row.current_period_end : null;
  } catch {
    return null;
  }
}

async function upsertSubscription(env, data, account, now = Date.now()) {
  if (!env?.DB) return false;
  const subscriptionId = data?.subscription_id;
  if (!subscriptionId) return false;
  const periodEnd = resolvePeriodEndMs(data, now);
  try {
    await env.DB.prepare(
      `INSERT INTO subscriptions
         (subscription_id, account_id, product_id, status, current_period_end, cancel_at_period_end, customer_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(subscription_id) DO UPDATE SET
         account_id = COALESCE(excluded.account_id, subscriptions.account_id),
         product_id = COALESCE(excluded.product_id, subscriptions.product_id),
         status = excluded.status,
         -- Never let an event that omits the period end (e.g. subscription.failed
         -- sends next_billing_date: null) erase the period we already recorded:
         -- losing it would break attribution for a later terminal event.
         current_period_end = COALESCE(excluded.current_period_end, subscriptions.current_period_end),
         cancel_at_period_end = excluded.cancel_at_period_end,
         customer_id = COALESCE(excluded.customer_id, subscriptions.customer_id),
         updated_at = excluded.updated_at`
    )
      .bind(
        subscriptionId,
        account?.sub || null,
        data?.product_id || null,
        String(data?.status || "").slice(0, 32) || null,
        periodEnd,
        data?.cancel_at_next_billing_date ? 1 : 0,
        data?.customer?.customer_id || null,
        now,
        now
      )
      .run();
    return true;
  } catch (e) {
    console.error("[billing] subscription upsert failed:", String(e?.message || e).slice(0, 160));
    return false;
  }
}

/**
 * Record the event id exactly once. A PRIMARY KEY conflict means Dodo re-delivered
 * an event we already processed — the caller must acknowledge without re-granting.
 * Returns true when this delivery is new.
 */
async function claimEvent(env, { eventId, eventType, sub, subscriptionId, now }) {
  // Cheap guard first so a KV-only deploy still dedupes.
  if (env?.USER_PROGRESS) {
    try {
      if (await env.USER_PROGRESS.get(EVENT_MARKER_KEY(eventId))) return false;
    } catch {
      /* fall through to the authoritative D1 guard */
    }
  }
  if (env?.DB) {
    try {
      await env.DB.prepare(
        "INSERT INTO billing_events (event_id, event_type, account_id, subscription_id, received_at) VALUES (?, ?, ?, ?, ?)"
      )
        .bind(eventId, String(eventType || "").slice(0, 64), sub || null, subscriptionId || null, now)
        .run();
    } catch {
      return false; // PK violation => already processed
    }
  }
  if (env?.USER_PROGRESS) {
    try {
      await env.USER_PROGRESS.put(EVENT_MARKER_KEY(eventId), "1", { expirationTtl: EVENT_MARKER_TTL_SECONDS });
    } catch {
      /* marker is an optimization only */
    }
  }
  return true;
}

/**
 * Apply one verified webhook event. Exported so tests can drive it directly, and
 * so /billing/webhook stays a thin transport wrapper.
 */
export async function applyDodoEvent(env, { eventId, event }, now = Date.now()) {
  const type = event?.type;
  const data = event?.data && typeof event.data === "object" ? event.data : {};
  let action = classifyDodoEvent(type, data);

  const account = await resolveAccountFromEvent(env, data);
  if (!account) {
    await recordActivity(env, null, "billing_unmatched", { type });
    await recordError(env, null, "billing_unmatched", "/billing/webhook", `event ${type} had no resolvable account`);
    return { handled: false, reason: "unmatched_account", action };
  }

  const fresh = await claimEvent(env, {
    eventId,
    eventType: type,
    sub: account.sub,
    subscriptionId: data.subscription_id,
    now,
  });
  if (!fresh) return { handled: true, duplicate: true, action };

  const periodEndMs = resolvePeriodEndMs(data, now);
  let result = { handled: true, action };

  if (action === "grant") {
    // No usable period end => grant a conservative 30 days rather than nothing,
    // and log it so the gap is visible instead of silently dropping a paying user.
    const target = periodEndMs ?? now + 30 * 86400000;
    if (periodEndMs === null) {
      await recordError(env, account.sub, "billing_missing_period_end", "/billing/webhook", type);
    }
    result = { ...result, ...(await writeEntitlement(env, { sub: account.sub, email: account.email, expiresAtMs: target })) };
    await recordActivity(env, account.sub, "subscription_activated", { type, matched_by: account.matchedBy });
  } else if (action === "cancel") {
    // Stop renewing, but keep the period already paid for (never shorter than
    // what the learner already holds).
    const target = periodEndMs ?? (await readSubscriptionPeriodEndMs(env, account.sub)) ?? now;
    result = { ...result, ...(await writeEntitlement(env, { sub: account.sub, email: account.email, expiresAtMs: target })) };
    await recordActivity(env, account.sub, "subscription_cancelled", { type });
  } else if (action === "deny") {
    // Creation failed, so nothing was paid for and nothing is taken away.
    await recordActivity(env, account.sub, "subscription_creation_failed", { type });
    await recordError(env, account.sub, "subscription_failed", "/billing/webhook", String(type));
  } else if (action === "end") {
    const attributionMs = periodEndMs ?? (await readSubscriptionPeriodEndMs(env, account.sub));
    result = {
      ...result,
      ...(await writeEntitlement(env, {
        sub: account.sub,
        email: account.email,
        expiresAtMs: now,
        mode: "end",
        attributionMs,
      })),
    };
    await recordActivity(env, account.sub, "subscription_ended", { type });
    if (!result.preserved) {
      await recordError(env, account.sub, "subscription_ended", "/billing/webhook", String(type));
    }
  } else {
    // "keep" and "ignore": acknowledge, never touch the entitlement.
    await recordActivity(env, account.sub, "subscription_event_" + action, { type });
  }

  await upsertSubscription(env, data, account, now);
  return result;
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

const PLAN_LABELS = { monthly: "monthly", annual: "annual" };

/**
 * POST /billing/checkout — session-authenticated. Creates a hosted checkout
 * session and returns the URL only; the API key never leaves the Worker.
 */
export async function handleCheckout(request, env, cors) {
  if (!env?.DODO_API_KEY) {
    return json(
      { error: "billing_not_configured", message: "بوابة الدفع غير مهيأة على الخادم بعد." },
      503,
      cors
    );
  }

  // The caller must be a signed-in user: the checkout is bound to their account.
  const session = await resolveSessionSubFromRequest(request, env);
  if (!session?.sub) {
    return json({ error: "unauthorized", message: "يرجى تسجيل الدخول أولاً لإتمام الاشتراك." }, 401, cors);
  }

  const body = await request.json().catch(() => null);
  const plan = PLAN_LABELS[body?.plan] || "monthly";
  const productId = getProductId(env, plan);
  if (!productId) {
    return json(
      { error: "billing_not_configured", message: "منتج الاشتراك غير مهيأ على الخادم." },
      503,
      cors
    );
  }

  const origin = resolveAppOrigin(env, request);
  const payload = {
    product_cart: [{ product_id: productId, quantity: 1 }],
    // Metadata is echoed back on every subscription/payment webhook — this is how
    // a payment is tied to a Katzu account without trusting the client.
    metadata: {
      user_sub: session.sub,
      user_email: session.email || "",
      plan,
    },
  };
  if (session.email) payload.customer = { email: session.email };
  if (origin) {
    payload.return_url = `${origin}/app/profile?checkout=success`;
    payload.cancel_url = `${origin}/subscription?checkout=cancelled`;
  }

  let upstream;
  try {
    upstream = await fetch(`${getDodoBaseUrl(env)}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DODO_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    await recordError(env, session.sub, "billing_checkout_error", "/billing/checkout", e);
    return json({ error: "billing_unreachable", message: "تعذر الوصول إلى بوابة الدفع. حاول لاحقاً." }, 502, cors);
  }

  const text = await upstream.text().catch(() => "");
  if (!upstream.ok) {
    // Keep Dodo's diagnostic detail server-side; the client gets a clean message.
    console.error("[billing] checkout failed", upstream.status, text.slice(0, 300));
    await recordError(env, session.sub, "billing_checkout_failed", "/billing/checkout", `HTTP ${upstream.status}`);
    return json(
      { error: "checkout_failed", message: "تعذر بدء عملية الدفع. حاول مرة أخرى.", status: upstream.status },
      502,
      cors
    );
  }

  let session_response;
  try {
    session_response = JSON.parse(text);
  } catch {
    return json({ error: "checkout_failed", message: "رد غير متوقع من بوابة الدفع." }, 502, cors);
  }

  if (!session_response?.checkout_url) {
    return json({ error: "checkout_failed", message: "رد غير متوقع من بوابة الدفع." }, 502, cors);
  }

  await recordActivity(env, session.sub, "checkout_started", { plan, environment: getDodoEnvironment(env) });
  return json(
    {
      checkout_url: session_response.checkout_url,
      session_id: session_response.session_id || null,
      environment: getDodoEnvironment(env),
    },
    200,
    cors
  );
}

/**
 * POST /billing/webhook — the entitlement authority.
 * Always answers 2xx once the signature is valid, even for events we ignore:
 * a non-2xx makes Dodo retry the same event up to 8 times.
 */
export async function handleDodoWebhook(request, env, cors) {
  if (!env?.DODO_WEBHOOK_SECRET) {
    return json({ error: "billing_not_configured" }, 503, cors);
  }

  const rawBody = await request.text();
  if (!rawBody) return json({ error: "empty_body" }, 400, cors);

  await ensureBillingTables(env);

  const verified = await verifyDodoSignature(rawBody, request.headers, env.DODO_WEBHOOK_SECRET);
  if (!verified.ok) {
    console.error("[billing] webhook signature rejected:", verified.reason);
    return json({ error: "invalid_signature", reason: verified.reason }, 401, cors);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "malformed_json" }, 400, cors);
  }

  const result = await applyDodoEvent(env, { eventId: verified.eventId, event });
  return json({ received: true, ...result }, 200, cors);
}

/** POST /billing/status — what the app polls after returning from checkout. */
export async function handleBillingStatus(request, env, cors) {
  const session = await resolveSessionSubFromRequest(request, env);
  if (!session?.sub) return json({ error: "unauthorized" }, 401, cors);

  const record = await readAccountRecord(env, session.sub);
  const expiresAtMs = record?.expiresAt ? Date.parse(record.expiresAt) : NaN;
  const active = Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();

  let subscription = null;
  if (env?.DB) {
    try {
      subscription = await env.DB.prepare(
        "SELECT status, current_period_end, cancel_at_period_end FROM subscriptions WHERE account_id = ? ORDER BY updated_at DESC LIMIT 1"
      )
        .bind(session.sub)
        .first();
    } catch {
      /* the KV record above is enough to answer */
    }
  }

  return json(
    {
      active,
      plan: active ? "pro" : "free",
      expiresAt: record?.expiresAt || null,
      source: record?.source || null,
      subscription: subscription
        ? {
            status: subscription.status,
            current_period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end).toISOString()
              : null,
            cancel_at_period_end: !!subscription.cancel_at_period_end,
          }
        : null,
      provider: "dodo",
      environment: getDodoEnvironment(env),
    },
    200,
    cors
  );
}

/**
 * GET /billing/health — configuration booleans, never values. Lets an operator
 * confirm in one request whether the deploy can actually take money.
 */
export async function handleBillingHealth(request, env, cors) {
  let subscriptionCount = null;
  let lastEventType = null;
  if (env?.DB) {
    try {
      const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM subscriptions").first();
      subscriptionCount = row?.c ?? 0;
      const last = await env.DB.prepare(
        "SELECT event_type FROM billing_events ORDER BY received_at DESC LIMIT 1"
      ).first();
      lastEventType = last?.event_type || null;
    } catch {
      /* tables may not exist yet — leave nulls */
    }
  }
  return json(
    {
      provider: "dodo",
      environment: getDodoEnvironment(env),
      apiKeyConfigured: Boolean(env?.DODO_API_KEY),
      webhookSecretConfigured: Boolean(env?.DODO_WEBHOOK_SECRET),
      monthlyProductConfigured: Boolean(getProductId(env, "monthly")),
      annualProductConfigured: Boolean(getProductId(env, "annual")),
      returnOrigin: resolveAppOrigin(env, request) || null,
      subscriptions: subscriptionCount,
      lastWebhookEventType: lastEventType,
      ready: Boolean(env?.DODO_API_KEY && env?.DODO_WEBHOOK_SECRET && getProductId(env, "monthly")),
    },
    200,
    cors
  );
}

/**
 * Router hook, mirroring handleAdminRoutes: returns a Response for the routes it
 * owns or null so the main worker's router continues untouched.
 */
export async function handleBillingRoutes(url, request, env, cors) {
  const path = url.pathname;
  if (!path.startsWith("/billing")) return null;

  if (path === "/billing/webhook" && request.method === "POST") {
    return await handleDodoWebhook(request, env, cors);
  }
  if (path === "/billing/checkout" && request.method === "POST") {
    return await handleCheckout(request, env, cors);
  }
  if (path === "/billing/status" && request.method === "POST") {
    return await handleBillingStatus(request, env, cors);
  }
  if (path === "/billing/health" && request.method === "GET") {
    return await handleBillingHealth(request, env, cors);
  }
  return json({ error: "not_found" }, 404, cors);
}
