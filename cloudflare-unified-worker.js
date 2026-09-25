/**
 * Unified Cloudflare Worker: Auth, D1 Content CMS, Glassmorphic Admin Dashboard & 6+ Gemini AI Engine
 * 
 * Bindings required / supported:
 * - REDEEMED_CODES (KV)
 * - USER_PROGRESS (KV) (also stores authoritative AI trial quota records)
 * - DB (D1 Database)
 * - ADMIN_SECRET (Secret)
 * - HMAC_SECRET (Secret)
 * - GOOGLE_CLIENT_ID (Secret)
 * - GEMINI_API_KEYS (Secret: comma-separated list of 6+ keys)
 *   OR GEMINI_API_KEY, GEMINI_API_KEY_1..6 (Individual secrets)
 *
 * The admin control plane (user registry, telemetry, dashboard) lives in
 * ./cloudflare-admin.js. Measured: the edit tooling applied diffs to this file
 * reliably up to ~48 KB of byte offset (16329, 18106, 37419, 48404 all fine)
 * but failed with "old string not found" on grep-verified unique anchors at
 * 63195, 77597 and 82988 — which is exactly where the admin handlers sat.
 * Wrangler bundles the import below into the single deployed worker.
 */

import { handleHintsRoute } from "./cloudflare-hints.js";
import {
  ensureRegistryTables,
  upsertUserFromAccount,
  markUserPro,
  recordActivity,
  recordError,
  purgeUserRegistry,
  handleAdminRoutes,
  withVerifyRegistry,
  withAiTelemetry,
} from "./cloudflare-admin.js";

// Dodo Payments (merchant of record): hosted checkout + signature-verified
// webhook that grants Pro entitlements. Same extraction rationale as the admin
// module above — this handlers' code would otherwise sit past the edit tooling's
// reliable byte range.
import { handleBillingRoutes } from "./cloudflare-dodo.js";
import { handleCryptoRoutes } from "./cloudflare-crypto.js";

// ============================================================================
// AI ROUTER CONFIGURATION & STATE (HIGH-PERFORMANCE & RELIABILITY ENGINE)
// ============================================================================

// Gemini Flash chain ordered for CONVERSATION latency (per current Gemini
// model docs): the lite/balanced Flash models are the documented
// "fastest, most cost-effective" tier and answer short A1–B2 JSON in 1–2s.
// The heavyweight 3.8 reasoning model sits mid-chain as a quality fallback —
// leading with it burned the attempt timeout on thinking and produced ~19s
// replies. First success pins primaryWorkingModel, so this order only matters
// on cold starts. 2.5 models are access-restricted deep fallback; 2.0/1.5 are
// shut down and must NOT appear here.
const DEFAULT_MODEL_CHAIN = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash"
];

let primaryWorkingModel = null;
let requestCounter = 0;
const keyCooldownMap = new Map(); // key -> cooldownExpiryTimestamp
const keyConsecutiveFails = new Map(); // key -> consecutive fail count
const translationCache = new Map(); // text.toLowerCase() -> translation_ar (LRU max 1000)
const hintsCache = new Map(); // key -> hints array (LRU max 500)
const MAX_FREE_AI_SESSIONS = 3;
const quotaLocks = new Map();

function isKeyCoolingDown(key) {
  const expiry = keyCooldownMap.get(key);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    keyCooldownMap.delete(key);
    return false;
  }
  return true;
}

function markKeyCooldown(key, status = 429) {
  const fails = (keyConsecutiveFails.get(key) || 0) + 1;
  keyConsecutiveFails.set(key, fails);

  // Progressive backoff:
  // 403 (revoked/bad): 1 hour
  // 429: 25s for 1st fail, 60s for 2nd, 120s for 3rd+
  let durationMs = 25000;
  if (status === 403) {
    durationMs = 3600000;
  } else if (fails === 2) {
    durationMs = 60000;
  } else if (fails >= 3) {
    durationMs = 120000;
  }

  keyCooldownMap.set(key, Date.now() + durationMs);
}

function markKeySuccess(key) {
  keyConsecutiveFails.delete(key);
  keyCooldownMap.delete(key);
}

function getCache(map, key) {
  if (!map.has(key)) return null;
  const val = map.get(key);
  map.delete(key);
  map.set(key, val); // Move to recent (LRU)
  return val;
}

function setCache(map, key, val, maxSize = 1000) {
  if (map.size >= maxSize) {
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
  }
  map.set(key, val);
}

function inspectGeminiKeys(env) {
  const rawList = [];

  // 1. Dynamic inspection of all env variables / secrets
  if (env && typeof env === "object") {
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === "string" && v.trim().length > 0) {
        if (k === "GEMINI_API_KEYS") {
          v.split(/[,;\n]+/).forEach(s => {
            const trimmed = s.trim().replace(/^["']|["']$/g, "");
            if (trimmed) rawList.push({ key: trimmed, source: k });
          });
        } else if (k === "GEMINI_API_KEY" || /^GEMINI_API_KEY_\d+$/i.test(k) || /^GEMINI_KEY_\d+$/i.test(k)) {
          const trimmed = v.trim().replace(/^["']|["']$/g, "");
          if (trimmed) rawList.push({ key: trimmed, source: k });
        }
      }
    }
  }

  // 2. Explicit checks up to 30 keys in case CF secrets aren't enumerable via Object.entries
  if (rawList.length === 0) {
    if (env.GEMINI_API_KEYS && typeof env.GEMINI_API_KEYS === "string") {
      env.GEMINI_API_KEYS.split(/[,;\n]+/).forEach(s => {
        const trimmed = s.trim().replace(/^["']|["']$/g, "");
        if (trimmed) rawList.push({ key: trimmed, source: "GEMINI_API_KEYS" });
      });
    }
    for (let i = 1; i <= 30; i++) {
      if (env[`GEMINI_API_KEY_${i}`]) {
        const trimmed = String(env[`GEMINI_API_KEY_${i}`]).trim().replace(/^["']|["']$/g, "");
        if (trimmed) rawList.push({ key: trimmed, source: `GEMINI_API_KEY_${i}` });
      }
      if (env[`GEMINI_KEY_${i}`]) {
        const trimmed = String(env[`GEMINI_KEY_${i}`]).trim().replace(/^["']|["']$/g, "");
        if (trimmed) rawList.push({ key: trimmed, source: `GEMINI_KEY_${i}` });
      }
    }
    if (env.GEMINI_API_KEY) {
      const trimmed = String(env.GEMINI_API_KEY).trim().replace(/^["']|["']$/g, "");
      if (trimmed) rawList.push({ key: trimmed, source: "GEMINI_API_KEY" });
    }
  }

  const validEntries = rawList.filter(e => e.key && e.key.length > 5);

  // Count frequencies to find duplicates
  const counts = new Map();
  for (const entry of validEntries) {
    counts.set(entry.key, (counts.get(entry.key) || 0) + 1);
  }

  const duplicates = [];
  for (const [key, count] of counts.entries()) {
    if (count > 1) {
      // Report a duplicate by the env-var name(s) it came from, never by any
      // part of the key: even a truncated key is a credential fragment, and
      // this value can reach a public endpoint.
      const sources = validEntries.filter(e => e.key === key).map(e => e.source).join(" + ");
      duplicates.push(`${sources || "configured secret"} (same value repeated ${count} times)`);
    }
  }

  const uniqueKeys = [...new Set(validEntries.map(e => e.key))];

  return {
    uniqueKeys,
    rawCount: validEntries.length,
    uniqueCount: uniqueKeys.length,
    hasDuplicates: duplicates.length > 0,
    duplicates,
    // Deliberately empty: no key preview is ever produced here, because this
    // object feeds a public endpoint. See handlePublicHealth.
    previews: []
  };
}

function getGeminiApiKeys(env) {
  return inspectGeminiKeys(env).uniqueKeys;
}

// ============================================================================
// CORS & SECURITY CONFIGURATION
// ============================================================================

// Single source of truth for "is this a production deploy": keeps the CORS
// allowlist strict and disables test-only auth shortcuts (see fetch below).
function isProductionEnv(env = {}) {
  return ["production", "prod"].includes(
    String(env?.ENVIRONMENT || env?.NODE_ENV || "").toLowerCase()
  );
}

function getCorsHeaders(request, env = {}) {
  const origin = request.headers.get("Origin") || "";
  const configuredOrigins = typeof env?.ALLOWED_ORIGINS === "string"
    ? env.ALLOWED_ORIGINS
    : "";
  const allowed = configuredOrigins
    .split(",")
    .map(s => s.trim().replace(/\/+$/, "")) // strip trailing slashes: browsers send Origin without one
    .filter(Boolean);
  const production = isProductionEnv(env);
  const validOrigin = (value) => {
    try {
      const parsed = new URL(value);
      return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  };
  const validConfiguration = allowed.length > 0 && allowed.every(validOrigin);
  // Open access ONLY when a valid origin allowlist is configured as absent AND the
  // deploy explicitly opts in with ALLOW_OPEN_CORS="1" (local dev convenience).
  // Production is always strict: missing/malformed config => cross-origin rejected (fail closed).
  const openMode = !validConfiguration && !production && String(env?.ALLOW_OPEN_CORS || "") === "1";
  const originAllowed = openMode || !origin || (validConfiguration && allowed.includes(origin));
  const allowOrigin = openMode && origin ? origin : (origin && originAllowed ? origin : "");

  const headers = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    // Diagnostic headers: when a request is blocked by the origin allowlist,
    // these tell the developer exactly why (visible in browser devtools).
    ...(production && !validConfiguration ? { "X-Cors-Configuration": "invalid" } : {}),
    ...(!originAllowed ? { "X-Cors-Rejection": validConfiguration ? "origin_not_in_allowlist" : "allowlist_not_configured" } : {}),
    ...(openMode ? { "X-Cors-Mode": "open_dev_mode_set_ALLOWED_ORIGINS_in_prod" } : {}),
  };
  Object.defineProperty(headers, "_corsAllowed", {
    value: originAllowed,
    enumerable: false,
  });
  return headers;
}

function extractIdToken(request, body) {
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  if (body && typeof body.id_token === "string" && body.id_token.trim()) {
    return body.id_token.trim();
  }
  return null;
}

// ----------------------------------------------------------------------------
// SESSION TOKENS (/auth/session)
// Google ID tokens expire after ~1h, so the app exchanges them for a longer-lived
// opaque session token stored in USER_PROGRESS KV. Tokens are prefixed with
// "sess_" so verifyGoogleIdToken can distinguish them from Google JWTs.
// ----------------------------------------------------------------------------

const SESSION_TOKEN_TTL_MS = 30 * 86400 * 1000; // 30 days

function isSessionToken(token) {
  return typeof token === "string" && token.startsWith("sess_");
}

async function createSessionToken(account, env) {
  const token = `sess_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
  await env.USER_PROGRESS.put(`session:${token}`, JSON.stringify({
    sub: account.sub,
    email: account.email || "",
    created_at: Date.now(),
    expires_at: Date.now() + SESSION_TOKEN_TTL_MS,
  }), { expirationTtl: Math.floor(SESSION_TOKEN_TTL_MS / 1000) });
  // Per-user session index so sign-out-all / account deletion can enumerate and
  // revoke every live session (KV has no prefix listing; bounded to 20 sessions).
  try {
    const idxKey = `sessions_by_sub:${account.sub}`;
    const raw = await env.USER_PROGRESS.get(idxKey);
    const tokens = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(tokens) ? tokens.filter(t => typeof t === "string") : [];
    next.unshift(token);
    await env.USER_PROGRESS.put(idxKey, JSON.stringify(next.slice(0, 20)), { expirationTtl: Math.floor(SESSION_TOKEN_TTL_MS / 1000) });
  } catch {}
  return token;
}

async function revokeSessionToken(token, env) {
  if (!env.USER_PROGRESS || typeof token !== "string") return false;
  await env.USER_PROGRESS.delete(`session:${token}`);
  return true;
}

async function handleAuthSignout(request, env, cors) {
  const body = await request.json().catch(() => null);
  const token = extractIdToken(request, body); // same transport: Bearer header or id_token body field
  if (!token || !isSessionToken(token)) {
    return json({ error: "missing_session_token", code: "UNAUTHENTICATED" }, 401, cors);
  }
  const session = await resolveSessionToken(token, env);
  if (!session) {
    // Already expired/revoked — treat as idempotent success so sign-out never blocks the user.
    return json({ success: true, revoked: false }, 200, cors);
  }
  await revokeSessionToken(token, env);
  // Remove from the user's session index (best-effort).
  try {
    const idxKey = `sessions_by_sub:${session.sub}`;
    const raw = await env.USER_PROGRESS.get(idxKey);
    if (raw) {
      const tokens = JSON.parse(raw);
      if (Array.isArray(tokens)) {
        await env.USER_PROGRESS.put(idxKey, JSON.stringify(tokens.filter(t => t !== token)));
      }
    }
  } catch {}
  return json({ success: true, revoked: true }, 200, cors);
}

async function resolveSessionToken(token, env) {
  if (!env.USER_PROGRESS) return null;
  const raw = await env.USER_PROGRESS.get(`session:${token}`);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    if (!record?.sub || Date.now() > record.expires_at) return null;
    return { sub: record.sub, email: record.email || "" };
  } catch {
    return null;
  }
}

async function handleAuthSession(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = extractIdToken(request, body);
  if (!idToken || typeof idToken !== "string") {
    return json({ error: "missing_id_token" }, 400, cors);
  }
  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ error: "invalid_id_token" }, 401, cors);
  }
  if (!env.USER_PROGRESS) {
    // KV unbound: no session can be issued. The client holds no raw-token fallback
    // (token hygiene 1.1b), so it must surface this as a retryable error.
    return json({ error: "session_storage_unavailable" }, 503, cors);
  }
  const sessionToken = await createSessionToken(account, env);

  // Registry write-through: every sign-in registers or refreshes the canonical
  // user row, so a free user who never redeems a code is still known to admins.
  await upsertUserFromAccount(account, request, env);
  await recordActivity(env, account.sub, "session_created", { via: "auth_session" });

  return json({ session_token: sessionToken, expires_in: SESSION_TOKEN_TTL_MS / 1000 }, 200, cors);
}

// In-memory rate limiting per user (sub)
const userRateLimits = new Map();

function checkRateLimit(userId, env = {}) {
  const limitPerMinute = parseInt(env?.AI_RATE_LIMIT_PER_MINUTE || "20", 10);
  const limitPerDay = parseInt(env?.AI_RATE_LIMIT_PER_DAY || "150", 10);
  const now = Date.now();
  const currentMinute = Math.floor(now / 60000);
  const currentDay = Math.floor(now / 86400000);

  let record = userRateLimits.get(userId);
  if (!record) {
    record = { minute: currentMinute, minuteCount: 0, day: currentDay, dayCount: 0 };
    userRateLimits.set(userId, record);
  }

  if (record.minute !== currentMinute) {
    record.minute = currentMinute;
    record.minuteCount = 0;
  }
  if (record.day !== currentDay) {
    record.day = currentDay;
    record.dayCount = 0;
  }

  if (record.minuteCount >= limitPerMinute) {
    return { allowed: false, reason: "minute_limit", retryAfter: 60 };
  }
  if (record.dayCount >= limitPerDay) {
    return { allowed: false, reason: "day_limit", retryAfter: 3600 };
  }

  record.minuteCount += 1;
  record.dayCount += 1;
  return { allowed: true };
}

async function checkUserEntitlement(account, cefrLevel, env = {}, options = {}) {
  // 1. Active subscription in REDEEMED_CODES KV
  if (env?.REDEEMED_CODES) {
    const subRaw = await env.REDEEMED_CODES.get(`account:${account.sub}`);
    if (subRaw) {
      try {
        const sub = JSON.parse(subRaw);
        if (sub.expiresAt && new Date(sub.expiresAt).getTime() > Date.now()) {
          return { allowed: true, isSubscribed: true };
        }
      } catch {}
    }
  }

  // 2. Trial access: restricted to A1 level with a server-side quota.
  const level = (cefrLevel || "A1").toUpperCase();
  if (level !== "A1") {
    return {
      allowed: false,
      code: "PAYWALL_REQUIRED",
      message: "المستويات المتقدمة (A2, B1, B2) تتطلب اشتراك Katzu Pro نشط أو كود تفعيل."
    };
  }

  // Quota-exempt callers (contextual hints) skip the free-session counter:
  // hints must never be blocked, only conversation turns consume quota.
  if (options.skipQuota) {
    return { allowed: true, isSubscribed: false };
  }
  const quota = await readTrialQuota(account.sub, env);
  if (!quota.available) {
    return {
      allowed: false,
      code: "QUOTA_UNAVAILABLE",
      message: "تعذر التحقق من الرصيد المجاني على الخادم. يرجى المحاولة لاحقاً."
    };
  }

  if (quota.used >= MAX_FREE_AI_SESSIONS) {
    return {
      allowed: false,
      code: "FREE_QUOTA_EXHAUSTED",
      message: "انتهت الجلسات التجريبية المجانية (3 جلسات). يرجى الاشتراك في Katzu Pro لمتابعة التعلم."
    };
  }

  return { allowed: true, isSubscribed: false, trialSessionsRemaining: MAX_FREE_AI_SESSIONS - quota.used };
}

function quotaKey(accountId) {
  return `ai-quota:${accountId}`;
}

// ----------------------------------------------------------------------------
// DURABLE CONCURRENCY SAFETY (Phase 2)
// KV is eventually consistent and has no compare-and-swap, so anything that must
// happen "exactly once" uses a D1 table with a PRIMARY KEY: INSERT is atomic per
// row across all isolates — a duplicate insert throws and is treated as "already
// done". Tables are created lazily (additive; existing data untouched).
// ----------------------------------------------------------------------------

async function ensureLedgerTables(env) {
  if (!env.DB) return false;
  try {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS redeemed_codes_ledger (
        code TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        months INTEGER NOT NULL,
        redeemed_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS trial_quota_ledger (
        account_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        consumed_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, session_id)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_payouts (
        invited_account_id TEXT PRIMARY KEY,
        inviter_account_id TEXT NOT NULL,
        awarded_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS rate_limit_counters (
        counter_id TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL
      )`),
    ]);
    // Additive user registry + activity/error telemetry tables (SaaS admin).
    await ensureRegistryTables(env);
    return true;
  } catch (e) {
    console.error("[ledger] ensure tables failed:", String(e?.message || e).slice(0, 120));
    return false;
  }
}

/** Per-user/per-window global rate limiting. Returns { allowed, retryAfter }.
 * Best-effort: if D1 is unavailable, falls back to the in-isolate limiter. */
async function checkGlobalRateLimit(accountId, env) {
  if (!env.DB) return checkRateLimit(accountId, env); // fallback: in-isolate
  const limitPerMinute = parseInt(env?.AI_RATE_LIMIT_PER_MINUTE || "20", 10);
  const limitPerDay = parseInt(env?.AI_RATE_LIMIT_PER_DAY || "150", 10);
  const now = Date.now();
  const minuteWindow = Math.floor(now / 60000);
  const dayWindow = Math.floor(now / 86400000);
  try {
    // One INSERT per window: the PRIMARY KEY makes it atomic; if the row exists
    // we read+update (two writes, tiny race window acceptable for abuse control).
    const inc = async (counterId, windowStart, limit) => {
      try {
        await env.DB.prepare(
          "INSERT INTO rate_limit_counters (counter_id, window_start, count) VALUES (?, ?, 1)"
        ).bind(counterId, windowStart).run();
        return { allowed: true, count: 1 };
      } catch (e) {
        const row = await env.DB.prepare(
          "SELECT window_start, count FROM rate_limit_counters WHERE counter_id = ?"
        ).bind(counterId).first();
        if (!row) return { allowed: true, count: 1 };
        if (row.window_start !== windowStart) {
          await env.DB.prepare(
            "UPDATE rate_limit_counters SET window_start = ?, count = 1 WHERE counter_id = ?"
          ).bind(windowStart, counterId).run();
          return { allowed: true, count: 1 };
        }
        const next = Number(row.count) + 1;
        await env.DB.prepare(
          "UPDATE rate_limit_counters SET count = ? WHERE counter_id = ?"
        ).bind(next, counterId).run();
        return { allowed: next <= limit, count: next };
      }
    };
    const minute = await inc(`m:${accountId}`, minuteWindow, limitPerMinute);
    if (!minute.allowed) return { allowed: false, retryAfter: 60 - Math.floor((now % 60000) / 1000), reason: "minute_limit" };
    const day = await inc(`d:${accountId}`, dayWindow, limitPerDay);
    if (!day.allowed) return { allowed: false, retryAfter: 86400 - Math.floor((now % 86400000) / 1000), reason: "day_limit" };
    return { allowed: true };
  } catch {
    return checkRateLimit(accountId, env); // D1 hiccup: degrade to in-isolate
  }
}

function trialSessionKey(accountId, sessionId) {
  // Sanitize: session_id comes from the client, keep keys bounded and readable.
  const safe = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return `ai-trial-session:${accountId}:${safe || "default"}`;
}

async function isTrialSessionConsumed(accountId, sessionId, env = {}) {
  if (!env?.USER_PROGRESS || typeof env.USER_PROGRESS.get !== "function") return false;
  try {
    const raw = await env.USER_PROGRESS.get(trialSessionKey(accountId, sessionId));
    return Boolean(raw);
  } catch {
    return false;
  }
}

async function readTrialQuota(accountId, env = {}) {
  if (!env?.USER_PROGRESS || typeof env.USER_PROGRESS.get !== "function") {
    return { available: false, used: 0 };
  }
  const raw = await env.USER_PROGRESS.get(quotaKey(accountId));
  if (!raw) return { available: true, used: 0 };
  try {
    const parsed = JSON.parse(raw);
    const used = Number.isFinite(parsed?.used) ? parsed.used : Number(parsed?.sessionsUsed);
    return { available: true, used: Math.max(0, Number.isFinite(used) ? Math.floor(used) : 0) };
  } catch {
    return { available: false, used: 0 };
  }
}

async function consumeTrialQuota(accountId, env = {}, sessionId = null) {
  // Phase 2: with a sessionId, consumption is claimed atomically in D1 — a
  // duplicate insert means the session was already consumed (idempotent replay
  // protection across isolates). Without D1, falls back to KV+in-isolate lock.
  if (sessionId && env.DB) {
    const ready = await ensureLedgerTables(env);
    if (ready) {
      try {
        await env.DB.prepare(
          "INSERT INTO trial_quota_ledger (account_id, session_id, consumed_at) VALUES (?, ?, ?)"
        ).bind(accountId, String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64), Date.now()).run();
      } catch {
        return { allowed: false, replay: true, code: "SESSION_ALREADY_CONSUMED" }; // atomic duplicate = replay
      }
      const used = await countConsumedSessions(accountId, env);
      try {
        await env.USER_PROGRESS.put(quotaKey(accountId), JSON.stringify({ used, updated_at: Date.now() }));
      } catch {}
      if (used > MAX_FREE_AI_SESSIONS) {
        return { allowed: false, code: "FREE_QUOTA_EXHAUSTED", message: "انتهت الجلسات التجريبية المجانية (3 جلسات). يرجى الاشتراك في Katzu Pro لمتابعة التعلم." };
      }
      return { allowed: true, used, remaining: MAX_FREE_AI_SESSIONS - used };
    }
  }
  // Fallback path (no D1 / no sessionId): in-isolate lock + KV read-modify-write.
  const previous = quotaLocks.get(accountId) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  quotaLocks.set(accountId, current);
  await previous;
  try {
    const quota = await readTrialQuota(accountId, env);
    if (!quota.available) {
      return { allowed: false, code: "QUOTA_UNAVAILABLE", message: "تعذر التحقق من الرصيد المجاني على الخادم. يرجى المحاولة لاحقاً." };
    }
    if (quota.used >= MAX_FREE_AI_SESSIONS) {
      return { allowed: false, code: "FREE_QUOTA_EXHAUSTED", message: "انتهت الجلسات التجريبية المجانية (3 جلسات). يرجى الاشتراك في Katzu Pro لمتابعة التعلم." };
    }
    const used = quota.used + 1;
    try {
      await env.USER_PROGRESS.put(quotaKey(accountId), JSON.stringify({ used, updated_at: Date.now() }));
    } catch {
      return { allowed: false, code: "QUOTA_UNAVAILABLE", message: "تعذر حفظ الرصيد المجاني على الخادم. يرجى المحاولة لاحقاً." };
    }
    return { allowed: true, used, remaining: MAX_FREE_AI_SESSIONS - used };
  } finally {
    release();
    if (quotaLocks.get(accountId) === current) quotaLocks.delete(accountId);
  }
}

async function countConsumedSessions(accountId, env) {
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM trial_quota_ledger WHERE account_id = ?"
    ).bind(accountId).first();
    return Math.max(0, Number(row?.n) || 0);
  } catch {
    return 0;
  }
}

async function authenticateAiRequest(request, body, env, cors, {
  level = null,
  requireEntitlement = false,
  rateLimit = true,
  quotaExempt = false,
} = {}) {
  const idToken = extractIdToken(request, body);
  if (!idToken) {
    return { response: json({ error: "unauthenticated", code: "UNAUTHENTICATED" }, 401, cors) };
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return { response: json({ error: "invalid_id_token", code: "UNAUTHENTICATED" }, 401, cors) };
  }

  if (rateLimit) {
    const rate = await checkGlobalRateLimit(account.sub, env);
    if (!rate.allowed) {
      return {
        response: json({
          error: "rate_limit_exceeded",
          code: "RATE_LIMIT_EXCEEDED",
          retry_after: rate.retryAfter
        }, 429, cors)
      };
    }
  }

  if (requireEntitlement) {
    const entitlement = await checkUserEntitlement(account, level || "A1", env, { skipQuota: quotaExempt });
    if (!entitlement.allowed) {
      const quotaFailure = ["FREE_QUOTA_EXHAUSTED", "QUOTA_UNAVAILABLE"].includes(entitlement.code);
      return {
        response: json({
          error: quotaFailure ? "free_quota_error" : "subscription_required",
          code: entitlement.code || "PAYWALL_REQUIRED",
          message: entitlement.message
        }, entitlement.code === "QUOTA_UNAVAILABLE" ? 503 : 402, cors)
      };
    }
  }

  return { account };
}

async function handleDeleteUser(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = extractIdToken(request, body);
  if (!idToken) {
    return json({ error: "missing_id_token", code: "UNAUTHENTICATED" }, 401, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ error: "invalid_id_token", code: "UNAUTHENTICATED" }, 401, cors);
  }
  if (!env.USER_PROGRESS) {
    return json({ error: "storage_unavailable", code: "QUOTA_UNAVAILABLE", message: "تعذر حذف الحساب حالياً. يرجى المحاولة لاحقاً." }, 503, cors);
  }

  // Phase 3: structured result — the client shows success only if every
  // required deletion succeeded; any failure is retryable.
  const deleted = {};
  const failed = [];
  const tryStep = async (name, fn) => {
    try { await fn(); deleted[name] = true; }
    catch (e) { console.error(`[DeleteAccount] ${name} failed:`, String(e?.message || e).slice(0, 120)); failed.push(name); }
  };

  await tryStep("progress", () => env.USER_PROGRESS.delete(`progress:${account.sub}`));
  await tryStep("ai_quota", () => env.USER_PROGRESS.delete(quotaKey(account.sub)));

  // Revoke ALL live sessions (KV has no prefix listing — use the per-user index).
  try {
    const idxRaw = await env.USER_PROGRESS.get(`sessions_by_sub:${account.sub}`);
    const tokens = idxRaw ? JSON.parse(idxRaw) : [];
    if (Array.isArray(tokens)) {
      await Promise.all(tokens.filter(t => typeof t === "string").map(t => env.USER_PROGRESS.delete(`session:${t}`)));
    }
    await env.USER_PROGRESS.delete(`sessions_by_sub:${account.sub}`);
    deleted.sessions = true;
  } catch (e) {
    console.error("[DeleteAccount] sessions failed:", String(e?.message || e).slice(0, 120));
    failed.push("sessions");
  }

  // Trial-session consumption markers (per-session KV keys).
  try {
    const consumedRaw = await env.USER_PROGRESS.get(`ai-trial-sessions:${account.sub}`);
    const consumed = consumedRaw ? JSON.parse(consumedRaw) : [];
    if (Array.isArray(consumed)) {
      await Promise.all(consumed.map(s => env.USER_PROGRESS.delete(trialSessionKey(account.sub, s))));
    }
    await env.USER_PROGRESS.delete(`ai-trial-sessions:${account.sub}`);
  } catch {}
  deleted.trial_sessions = !failed.includes("sessions");

  if (env.REDEEMED_CODES) {
    await tryStep("subscription", () => env.REDEEMED_CODES.delete(`account:${account.sub}`));
    await tryStep("referral_claim", () => env.REDEEMED_CODES.delete(`referred-by:${account.sub}`));
    await tryStep("referral_history", () => env.REDEEMED_CODES.delete(`referrals:${account.sub}`));
    await tryStep("referral_code", () => env.REDEEMED_CODES.delete(`refcode:${generateReferralCode(account.sub)}`));
    if (account.email) {
      await tryStep("email_index", () => env.REDEEMED_CODES.delete(`email_index:${account.email.toLowerCase().trim()}`));
    }
  }

  if (env.DB) {
    const ready = await ensureLedgerTables(env);
    if (ready) {
      // Ledger rows are retained (anonymization is impossible for PRIMARY KEY
      // activation codes): we only sever the account link so no personal data
      // remains attached. Documented retention: code integrity / fraud
      // prevention; account_id values are opaque Google sub ids of deleted
      // accounts and are not linked to any profile after this deletion.
      await tryStep("subscription_ledger", () => env.DB.prepare(
        "UPDATE redeemed_codes_ledger SET account_id = 'deleted-account' WHERE account_id = ?"
      ).bind(account.sub).run());
      await tryStep("quota_ledger", () => env.DB.prepare(
        "DELETE FROM trial_quota_ledger WHERE account_id = ?"
      ).bind(account.sub).run());
      await tryStep("referral_payouts", () => env.DB.prepare(
        "DELETE FROM referral_payouts WHERE invited_account_id = ? OR inviter_account_id = ?"
      ).bind(account.sub, account.sub).run());
    }
    try {
      await env.DB.prepare("DELETE FROM user_progress WHERE user_id = ?").bind(account.sub).run();
      deleted.d1_progress = true;
    } catch (e) {
      console.error("[DeleteAccount] d1_progress failed:", String(e?.message || e).slice(0, 120));
      failed.push("d1_progress");
    }
  }

  if (failed.length > 0) {
    return json({
      success: false,
      code: "DELETE_INCOMPLETE",
      failed_steps: failed,
      deleted_steps: Object.keys(deleted),
      message: "تعذر إكمال حذف بعض البيانات. يرجى إعادة المحاولة.",
    }, 500, cors);
  }

  // Registry + telemetry cleanup on a fully successful deletion: drop the
  // account's email/IP registry row and its per-user telemetry, leaving only an
  // anonymized deletion event (no user id) for the audit trail.
  await purgeUserRegistry(env, account.sub);
  await recordActivity(env, null, "account_deleted", { via: "user_request" });

  return json({
    success: true,
    deleted_steps: Object.keys(deleted),
    message: "تم حذف الحساب وجميع البيانات السحابية بنجاح.",
  }, 200, cors);
}

// ---------------------------------------------------------------------------
// Phase 4: DATA EXPORT (GDPR/PPR Art. 20 style portability)
// Returns every record the server holds about THIS authenticated account as
// readable JSON. Contains no tokens, no secrets, no AI prompts, and no other
// user's data — the query scope is the verified account id only.
// ---------------------------------------------------------------------------
// Defense-in-depth for exports: recursively drop any credential-shaped fields.
// Current clients never store these, but legacy rows or future regressions must
// never leak tokens through an export.
const CREDENTIAL_FIELD_PATTERN = /(token|id_token|secret|password|credential|api_key|apikey)/i;

function stripCredentials(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => stripCredentials(v, depth + 1));
  const clean = {};
  for (const [k, v] of Object.entries(value)) {
    if (CREDENTIAL_FIELD_PATTERN.test(k)) continue;
    clean[k] = stripCredentials(v, depth + 1);
  }
  return clean;
}

async function handleUserExport(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const idToken = extractIdToken(request, body);
  if (!idToken) {
    return json({ error: "missing_id_token", code: "UNAUTHENTICATED" }, 401, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ error: "invalid_id_token", code: "UNAUTHENTICATED" }, 401, cors);
  }

  const exportData = {
    exported_at: new Date().toISOString(),
    profile: {
      account_id: account.sub,
      email: account.email || "",
    },
    learning_level: null,
    progress: null,
    subscription: { active: false, expires_at: null },
    referral: { code: generateReferralCode(account.sub), history: [] },
  };

  if (env.USER_PROGRESS) {
    const progressRaw = await env.USER_PROGRESS.get(`progress:${account.sub}`).catch(() => null);
    if (progressRaw) {
      try { exportData.progress = stripCredentials(JSON.parse(progressRaw)); } catch {}
    }
    const quotaRaw = await env.USER_PROGRESS.get(quotaKey(account.sub)).catch(() => null);
    if (quotaRaw) {
      try { exportData.trial_quota = JSON.parse(quotaRaw); } catch {}
    }
  }

  if (exportData.progress?.stats?.level) {
    exportData.learning_level = exportData.progress.stats.level;
  }

  if (env.REDEEMED_CODES) {
    const subRaw = await env.REDEEMED_CODES.get(`account:${account.sub}`).catch(() => null);
    if (subRaw) {
      try {
        const sub = JSON.parse(subRaw);
        exportData.subscription = { active: !!(sub.expiresAt && new Date(sub.expiresAt).getTime() > Date.now()), expires_at: sub.expiresAt || null };
      } catch {}
    }
    const historyRaw = await env.REDEEMED_CODES.get(`referrals:${account.sub}`).catch(() => null);
    if (historyRaw) {
      try {
        const history = JSON.parse(historyRaw);
        if (Array.isArray(history)) {
          exportData.referral.history = history.map((r) => ({
            invited_email_masked: maskEmail(r.invited_email),
            status: r.status,
            awarded_at: r.awarded_at || null,
          }));
        }
      } catch {}
    }
  }

  await recordActivity(env, account.sub, "data_exported", { sections: Object.keys(exportData).length });

  return json(exportData, 200, {
    ...cors,
    "Content-Disposition": 'attachment; filename="katzu-data-export.json"',
  });
}

// ----------------------------------------------------------------------------
// PUBLIC HEALTH PROJECTION (unauthenticated endpoint)
//
// handleAiHealth() reports diagnostics meant for us, not the public internet:
// masked Gemini key fragments ("Key #1: AQ.Ab8RN...U3xA") and the number of
// configured keys. /health is unauthenticated, so exposing either is an
// information disclosure (it fingerprints the secret set and confirms which
// fragments of a key are real). The projection below is an explicit ALLOWLIST:
// a field that is not listed here never leaves the worker, so a future field
// added to the internal handler cannot leak by accident. It reports the health
// of the system without any key material and without any key count.
//
// The endpoint is what uptime checks hit, so a failure inside the internal
// inspection degrades to a still-200 minimal report instead of a 5xx.
// ----------------------------------------------------------------------------
async function handlePublicHealth(env, cors) {
  let internal = {};
  try {
    const response = await handleAiHealth(env, cors);
    internal = await response.json();
  } catch (err) {
    console.error("[health] internal inspection failed:", String(err?.message || err).slice(0, 120));
    internal = {};
  }

  const fallback = internal?.aiFallback || {};

  return json({
    status: internal?.status || "healthy",
    service: internal?.service || "Katzu Unified Worker + Multi-Key AI Engine",
    // A boolean only: never how many keys exist, only whether the AI engine can
    // serve at all (Gemini keys present or the Workers AI binding attached).
    ready: internal?.ready === true,
    primaryWorkingModel: internal?.primaryWorkingModel || "auto-pinning on first call",
    cachedTranslationsCount: internal?.cachedTranslationsCount ?? 0,
    cachedHintsCount: internal?.cachedHintsCount ?? 0,
    strategy: "single-prompt fusion + round-robin key failover + edge memory cache + Workers AI fallback",
    aiFallback: {
      enabled: fallback.enabled === true,
      bindingPresent: fallback.bindingPresent === true,
      model: fallback.model || null,
      requests: fallback.requests ?? 0,
      served: fallback.served ?? 0,
      failures: fallback.failures ?? 0,
      lastUsedAt: fallback.lastUsedAt ?? null,
      lastProvider: fallback.lastProvider ?? null,
      countersSource: fallback.countersSource || "in-memory",
    },
  }, 200, cors);
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export default {
  async fetch(request, env) {
    // Security: TEST_MODE short-circuits Google JWT verification in
    // verifyGoogleIdToken, so a stale var left in a production deploy would let
    // anyone mint a session for any account. Neutralize it before any handler
    // runs (env is a local parameter, so the bypass branch can no longer see it).
    if (env?.TEST_MODE && isProductionEnv(env)) {
      console.error("[security] TEST_MODE ignored: the token-verification bypass is disabled in production");
      env = { ...env, TEST_MODE: undefined };
    }

    const url = new URL(request.url);
    const cors = getCorsHeaders(request, env);

    if (!cors._corsAllowed) {
      const headers = { ...cors };
      delete headers._corsAllowed;
      return json({ error: "origin_not_allowed" }, 403, headers);
    }
    if (request.method === "OPTIONS") {
      const headers = { ...cors };
      delete headers._corsAllowed;
      return new Response(null, { headers });
    }

    // Enforce request size limit (64 KB)
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > 65536) {
      return json({ error: "payload_too_large", message: "Request payload exceeds 64KB limit." }, 413, cors);
    }

    try {
      // --- AI Engine Endpoints (6+ Keys, Cooldown Tracking & Failover) ---
      if (url.pathname === "/auth/session" && request.method === "POST") {
        return await handleAuthSession(request, env, cors);
      }
      if (url.pathname === "/auth/signout" && request.method === "POST") {
        return await handleAuthSignout(request, env, cors);
      }
      if ((url.pathname === "/ai/turn" || url.pathname === "/turn") && request.method === "POST") {
        return await withAiTelemetry(() => handleAiConversationTurn(request, env, cors), request, env, "ai_turn");
      }
      if ((url.pathname === "/ai/translate" || url.pathname === "/translate") && request.method === "POST") {
        return await withAiTelemetry(() => handleAiTranslation(request, env, cors), request, env, "ai_translate");
      }
      if ((url.pathname === "/ai/hints" || url.pathname === "/hints") && request.method === "POST") {
        // Multi-move hints (2-4 distinct conversational intents) live in
        // ./cloudflare-hints.js — the legacy single-hint handler below this file's
        // header boundary now sits past the ~63 KB line the edit tooling cannot
        // reach, so the worker-scoped internals it needs are injected here.
        return await withAiTelemetry(
          () =>
            handleHintsRoute(request, env, cors, {
              authenticateAiRequest,
              boundedHistory,
              getGeminiApiKeys,
              getCache,
              setCache,
              hintsCache,
              callGeminiWithFailover,
              cleanJson,
              json,
            }),
          request,
          env,
          "ai_hints"
        );
      }
      if ((url.pathname === "/ai/health" || url.pathname === "/health") && request.method === "GET") {
        // Security: /health is public, and the internal AI health report carries
        // masked Gemini key fragments and the number of configured keys. The
        // public projection below exposes neither (allowlist built in
        // handlePublicHealth), while still reporting system health.
        return await handlePublicHealth(env, cors);
      }

      // --- User & Account Operations ---
      if (url.pathname === "/user/delete" && request.method === "POST") {
        return await handleDeleteUser(request, env, cors);
      }
      if (url.pathname === "/user/export" && request.method === "POST") {
        return await handleUserExport(request, env, cors);
      }

      // --- Referral Program ---
      if (url.pathname === "/referral/info" && request.method === "POST") {
        return await handleReferralInfo(request, env, cors);
      }
      if (url.pathname === "/referral/claim" && request.method === "POST") {
        return await handleReferralClaim(request, env, cors);
      }

      // --- Admin Control Plane (registry, telemetry, SaaS dashboard) ---
      // Delegates /admin, /admin/api/* and the admin lookup/edit/revoke/progress
      // actions. Returns null for routes it does not own (content CRUD, upload,
      // generate) so those continue through the legacy handlers below.
      const adminResponse = await handleAdminRoutes(url, request, env, cors);
      if (adminResponse) return adminResponse;

      // --- Billing (Dodo Payments): /billing/checkout, /billing/webhook,
      //     /billing/status, /billing/health ---
      // The webhook is authenticated by its HMAC signature (not by CORS or IP),
      // so it must be reachable before any origin-specific handling below.
      const billingResponse = await handleBillingRoutes(url, request, env, cors);
      if (billingResponse) return billingResponse;

      // --- Crypto sales (NOWPayments): /crypto/checkout, /crypto/webhook,
      //     /crypto/order, /crypto/health ---
      // Sold on the separate sales site (katzu-sales); the app itself never calls
      // these — it only ever redeems a code through /verify below. The webhook is
      // authenticated by its HMAC signature (not by CORS or IP), so it must be
      // reachable before any origin-specific handling.
      // `mintCode` reuses the existing activation-code generator (handleAdminGenerate,
      // the same function POST /admin/generate serves) instead of re-implementing
      // the HMAC-signed code format in a second place.
      const cryptoResponse = await handleCryptoRoutes(url, request, env, cors, {
        mintCode: async (months) => {
          const internal = new Request("https://internal/admin/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.ADMIN_SECRET}`,
            },
            body: JSON.stringify({ months }),
          });
          const minted = await handleAdminGenerate(internal, env, cors);
          const data = await minted.json().catch(() => null);
          if (!minted.ok || !data?.code) {
            throw new Error(`admin_generate_${minted.status}${data?.error ? `:${data.error}` : ""}`);
          }
          return data.code;
        },
      });
      if (cryptoResponse) return cryptoResponse;

      // --- Worker 1 Core Auth & Progress Endpoints ---
      if (url.pathname === "/verify" && request.method === "POST") {
        return await withVerifyRegistry(() => handleVerify(request, env, cors), env);
      }
      if (url.pathname === "/check-status" && request.method === "POST") {
        return await handleCheckStatus(request, env, cors);
      }
      if (url.pathname === "/admin/generate" && request.method === "POST") {
        return await handleAdminGenerate(request, env, cors);
      }
      if (url.pathname === "/progress/sync" && request.method === "POST") {
        return await handleProgressSync(request, env, cors);
      }
      if (url.pathname === "/progress/get" && request.method === "POST") {
        return await handleProgressGet(request, env, cors);
      }

      // --- Worker 2 D1 Content Read Endpoints ---
      if (url.pathname === "/scenarios" && request.method === "GET") {
        return await handleGetScenarios(request, env, cors);
      }
      if (url.pathname.startsWith("/scenarios/") && request.method === "GET") {
        const id = url.pathname.slice("/scenarios/".length).trim();
        return await handleGetScenarioById(id, request, env, cors);
      }
      if (url.pathname === "/vocabulary" && request.method === "GET") {
        return await handleGetVocabulary(url, request, env, cors);
      }
      if (url.pathname === "/grammar" && request.method === "GET") {
        return await handleGetGrammar(url, request, env, cors);
      }
      if (url.pathname === "/admin/upload" && request.method === "POST") {
        return await handleAdminUpload(request, env, cors);
      }

      // --- Admin Subscription & Progress Telemetry Endpoints ---
      if (url.pathname === "/admin/lookup" && request.method === "POST") {
        return await handleAdminLookup(request, env, cors);
      }
      if (url.pathname === "/admin/edit" && request.method === "POST") {
        return await handleAdminEdit(request, env, cors);
      }
      if (url.pathname === "/admin/revoke" && request.method === "POST") {
        return await handleAdminRevoke(request, env, cors);
      }
      if (url.pathname === "/admin/progress-lookup" && request.method === "POST") {
        return await handleAdminProgressLookup(request, env, cors);
      }
      if (url.pathname === "/admin/progress-edit" && request.method === "POST") {
        return await handleAdminProgressEdit(request, env, cors);
      }

      // --- Single-Row Content CRUD for scenarios, vocabulary, grammar, starter_phrases ---
      const crudMatch = url.pathname.match(/^\/admin\/(scenarios|vocabulary|grammar|starter_phrases)(?:\/([^\/]+))?$/);
      if (crudMatch) {
        const type = crudMatch[1];
        const id = crudMatch[2];
        if (request.method === "GET") {
          return id
            ? await handleAdminGetSingleContent(type, id, request, env, cors)
            : await handleAdminListContent(type, request, env, cors);
        }
        if (request.method === "POST" && !id) {
          return await handleAdminCreateContent(type, request, env, cors);
        }
        if (request.method === "PUT" && id) {
          return await handleAdminUpdateContent(type, id, request, env, cors);
        }
        if (request.method === "DELETE" && id) {
          return await handleAdminDeleteContent(type, id, request, env, cors);
        }
      }

      return json({ error: "not_found" }, 404, cors);
    } catch (err) {
      console.error("[Worker Error]", err);
      // Telemetry: any unhandled 5xx path is recorded so it shows up in the
      // admin error feed instead of only in tail logs.
      await recordError(env, null, "server_error", url.pathname, err);
      return json({ error: "server_error" }, 500, cors);
    }
  },
};

// ============================================================================
// AI ROUTER ENGINE (14+ KEYS, ROUND-ROBIN, STICKY MODEL & FAST FAILOVER)
// ============================================================================

// ---------------------------------------------------------------------------
// WORKERS AI FALLBACK — sanctions-proof secondary provider.
// When every Gemini key/model fails (429 quota, parked keys, chain miss), the
// request is served by the Workers AI binding baked into this same Worker —
// no new account, no new billing relationship. Validated live against the
// exact Katzu turn: @cf/qwen/qwen3-30b-a3b-fp8 produced valid structured JSON
// (reply_de/reply_ar/next_hint/followup) at ~2.1-2.3s.
// ---------------------------------------------------------------------------
const WORKERS_AI_FALLBACK_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const aiFallbackMetrics = {
  requests: 0,
  served: 0,
  failures: 0,
  lastUsedAt: null,
};
let lastAiProvider = "gemini";

// Cumulative counters are persisted to KV because Workers isolate memory is
// per-isolate: an in-memory counter on the isolate that served the fallback is
// invisible to the isolate answering /health. Best-effort — a failed write
// never breaks the learner's response; /health falls back to in-memory values.
const AI_FALLBACK_METRICS_KEY = "metrics:ai-fallback";

async function bumpAiFallbackMetrics(env, field) {
  if (!env?.USER_PROGRESS || typeof env.USER_PROGRESS.get !== "function") return null;
  try {
    const raw = await env.USER_PROGRESS.get(AI_FALLBACK_METRICS_KEY);
    let metrics = { requests: 0, served: 0, failures: 0 };
    if (raw) {
      try { metrics = { ...metrics, ...JSON.parse(raw) }; } catch {}
    }
    metrics[field] = (metrics[field] || 0) + 1;
    await env.USER_PROGRESS.put(AI_FALLBACK_METRICS_KEY, JSON.stringify(metrics));
    return metrics;
  } catch {
    return null;
  }
}

async function readAiFallbackMetrics(env) {
  if (!env?.USER_PROGRESS || typeof env.USER_PROGRESS.get !== "function") return null;
  try {
    const raw = await env.USER_PROGRESS.get(AI_FALLBACK_METRICS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      requests: Number(parsed.requests) || 0,
      served: Number(parsed.served) || 0,
      failures: Number(parsed.failures) || 0,
    };
  } catch {
    return null;
  }
}

function getAiFallbackMetrics() {
  return { ...aiFallbackMetrics };
}

function isFallbackKillSwitchOff(env) {
  const value = String(env?.AI_FALLBACK_ENABLED ?? "1").trim().toLowerCase();
  return value === "0" || value === "false" || value === "off";
}

function canUseWorkersAiFallback(env) {
  return !!env?.AI && !isFallbackKillSwitchOff(env);
}

// Convert a Gemini generateContent payload into Workers AI chat `messages`.
function convertGeminiPayloadToMessages(payload) {
  const messages = [];
  const sys = payload?.systemInstruction?.parts?.map((p) => p?.text || "").join("")
    ?? payload?.system_instruction?.parts?.map((p) => p?.text || "").join("");
  if (sys) messages.push({ role: "system", content: sys });
  for (const c of Array.isArray(payload?.contents) ? payload.contents : []) {
    const content = (c?.parts || []).map((p) => p?.text || "").join("");
    if (content) messages.push({ role: c.role === "model" ? "assistant" : "user", content });
  }
  return messages;
}

async function runWorkersAiFallback(payload, env) {
  if (!env?.AI) throw new Error("Workers AI binding unavailable");
  const messages = convertGeminiPayloadToMessages(payload);
  if (messages.length === 0) throw new Error("Workers AI fallback: empty message list");
  const gen = payload?.generationConfig || {};
  const options = {
    messages,
    max_tokens: Math.min(Number(gen.maxOutputTokens) || 700, 700),
    temperature: typeof gen.temperature === "number" ? gen.temperature : 0.3,
  };
  if (gen.responseMimeType === "application/json") {
    options.response_format = { type: "json_object" };
  }
  aiFallbackMetrics.requests += 1;
  void bumpAiFallbackMetrics(env, "requests");
  const result = await env.AI.run(WORKERS_AI_FALLBACK_MODEL, options);
  let text = typeof result === "string" ? result : "";
  if (!text && result && typeof result === "object") {
    const r = result.response ?? result.text ?? result.result ?? result;
    text = typeof r === "string" ? r : JSON.stringify(r);
  }
  // qwen3 reasoning models may emit <think>…</think> blocks before the JSON.
  text = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!text) throw new Error("Workers AI fallback returned no text");
  aiFallbackMetrics.served += 1;
  aiFallbackMetrics.lastUsedAt = new Date().toISOString();
  lastAiProvider = "workers-ai";
  void bumpAiFallbackMetrics(env, "served");
  return text;
}

async function callGeminiWithFailover(apiKeys, payload, env) {
  lastAiProvider = "gemini";
  let lastError = null;
  const numKeys = apiKeys.length;

  // Round-robin start index distributes requests across all 14+ keys
  const startIndex = numKeys > 0 ? (requestCounter++) % numKeys : 0;
  const orderedIndices = [];

  for (let i = 0; i < numKeys; i++) {
    orderedIndices.push((startIndex + i) % numKeys);
  }

  // Non-cooling-down keys come first
  orderedIndices.sort((a, b) => {
    const aCool = isKeyCoolingDown(apiKeys[a]) ? 1 : 0;
    const bCool = isKeyCoolingDown(apiKeys[b]) ? 1 : 0;
    return aCool - bCool;
  });

  // Prioritize primary working model first to eliminate 404 latency round-trips
  const models = primaryWorkingModel
    ? [primaryWorkingModel, ...DEFAULT_MODEL_CHAIN.filter(m => m !== primaryWorkingModel)]
    : DEFAULT_MODEL_CHAIN;

  for (const keyIdx of orderedIndices) {
    const key = apiKeys[keyIdx];

    for (const model of models) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        
        // 6s adaptive timeout per attempt: long enough for a 3.x Flash JSON
        // response, short enough that a full-chain miss stays well under the
        // client's 30s request timeout.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          // Read the body EXACTLY ONCE — a second .text() on a consumed body
          // throws and used to swallow the real model error forever.
          const data = await resp.json().catch(() => null);
          const cand = data?.candidates?.[0];
          const candidate = cand?.content?.parts?.map(p => p?.text || "").join("") || "";
          const finishReason = cand?.finishReason;
          if (candidate && candidate.trim()) {
            primaryWorkingModel = model; // Pin fastest working model
            markKeySuccess(key);
            return candidate;
          }
          // HTTP 200 but no usable text: MAX_TOKENS truncation, safety block,
          // or an empty candidates array. Log it and walk to the next model —
          // never silently loop on the same dead outcome.
          console.warn(`[AI Failover] ${model} returned 200 but no text (finishReason=${finishReason || "none"}, candidates=${Array.isArray(data?.candidates) ? data.candidates.length : 0}). Trying next model...`);
          lastError = new Error(`${model} empty text (finishReason=${finishReason || "none"})`);
          continue;
        }

        const respText = await resp.text().catch(() => "");

        // Invalid/unauthorized API key (400 API_KEY_INVALID or 401): park the
        // key in a long cooldown instead of re-trying it every request —
        // otherwise one bad key poisons a third of every turn's latency.
        if (resp.status === 400 && respText.includes("API_KEY_INVALID")) {
          console.warn(`[AI Failover] Key #${keyIdx + 1} is INVALID (API_KEY_INVALID). Parking it for 1 hour.`);
          markKeyCooldown(key, 403);
          lastError = new Error(`Key #${keyIdx + 1} invalid (API_KEY_INVALID)`);
          break; // rotate to next key immediately
        }

        // If rate limited (429), quota exhausted, or permission denied (403)
        if (resp.status === 429 || resp.status === 403 || respText.includes("RESOURCE_EXHAUSTED")) {
          if (respText.includes("per_model") || respText.includes("per_day")) {
            console.warn(`[AI Failover] Model ${model} daily quota hit on Key #${keyIdx + 1}. Trying next model...`);
            lastError = new Error(`Model ${model} daily quota exhausted`);
            continue; // try other models in chain for this key
          }
          console.warn(`[AI Failover] Key #${keyIdx + 1} exhausted (${resp.status}). Progressive cooldown & rotating...`);
          markKeyCooldown(key, resp.status);
          lastError = new Error(`Key #${keyIdx + 1} throttled (${resp.status})`);
          break; // break model loop immediately to rotate to next key
        } else if (resp.status === 404) {
          // Model not found in this region/tier, try next model without penalizing key
          lastError = new Error(`Model ${model} not available (404)`);
        } else {
          lastError = new Error(`Key #${keyIdx + 1} model ${model} HTTP ${resp.status}: ${respText.slice(0, 100)}`);
        }
      } catch (e) {
        lastError = e;
      }
    }
  }

  // All Gemini keys/models failed (or none configured) — try the Workers AI
  // fallback before giving the learner an error.
  if (canUseWorkersAiFallback(env)) {
    try {
      console.warn("[AI Failover] All Gemini keys/models failed — serving via Workers AI fallback.");
      const served = await runWorkersAiFallback(payload, env);
      return served;
    } catch (fallbackErr) {
      aiFallbackMetrics.failures += 1;
      void bumpAiFallbackMetrics(env, "failures");
      console.error("[AI Failover] Workers AI fallback also failed:", fallbackErr);
    }
  }

  throw lastError || new Error("All configured Gemini API keys and models failed");
}

// Surface which keys/models were actually tried so a 502 in the app can be
// matched against /health and the Cloudflare logs without guesswork.
function summarizeFailoverState(apiKeys) {
  try {
    const keyStates = apiKeys.map((k, i) => {
      const mask = k.length > 10 ? `${k.slice(0, 6)}…${k.slice(-4)}` : "key";
      return isKeyCoolingDown(k) ? `${mask}:cooldown` : `${mask}:active`;
    });
    return JSON.stringify({ keys: keyStates, pinnedModel: primaryWorkingModel || "none" });
  } catch {
    return "unavailable";
  }
}

function cleanJson(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;

  let text = String(raw).trim();
  // Strip markdown code fences
  text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

  // 1. Direct parse attempt
  try {
    return JSON.parse(text);
  } catch (_) {}

  // 2. Extract between first '{' and last '}'
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const candidate = text.substring(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {
      try {
        // Fix trailing commas or raw control characters
        const sanitized = candidate
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/[\u0000-\u001F]+/g, (m) => (m === "\n" || m === "\r" ? " " : ""));
        return JSON.parse(sanitized);
      } catch (_) {}
    }

  }

  // 3. Fallback regex field extraction so an error is NEVER thrown to user
  const replyDeMatch = text.match(/"reply_de"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const replyArMatch = text.match(/"reply_ar"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const correctedMatch = text.match(/"corrected_german"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const ruleMatch = text.match(/"grammar_rule"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const explMatch = text.match(/"explanation_ar"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const roastMatch = text.match(/"roast_comment"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const noteMatch = text.match(/"positive_note_ar"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);

  if (replyDeMatch || replyArMatch) {
    return {
      reply_de: replyDeMatch ? replyDeMatch[1].replace(/\\"/g, '"') : "Sehr gerne!",
      reply_ar: replyArMatch ? replyArMatch[1].replace(/\\"/g, '"') : "بكل سرور!",
      evaluation: {
        is_correct: !text.includes('"is_correct": false') && !text.includes('"is_correct":false'),
        original_mistake: "",
        corrected_german: correctedMatch ? correctedMatch[1].replace(/\\"/g, '"') : "",
        grammar_rule: ruleMatch ? ruleMatch[1].replace(/\\"/g, '"') : "Kommunikation",
        explanation_ar: explMatch ? explMatch[1].replace(/\\"/g, '"') : "جملتك مفهومة ومناسبة للمحادثة.",
        roast_comment: roastMatch ? roastMatch[1].replace(/\\"/g, '"') : "",
        user_message_translation_ar: "",
        positive_note_ar: noteMatch ? noteMatch[1].replace(/\\"/g, '"') : "أحسنت! واصل التحدث بثقة."
      }
    };
  }

  // 4. Ultimate fallback if plain text was returned
  return {
    reply_de: text.slice(0, 180).replace(/["{}]/g, ""),
    reply_ar: "",
    evaluation: {
      is_correct: true,
      original_mistake: "",
      corrected_german: "",
      grammar_rule: "Allgemein",
      explanation_ar: "استجابة طبيعية.",
      user_message_translation_ar: "",
      positive_note_ar: "أحسنت في المتابعة!"
    }
  };
}

function boundedHistory(history, mode = "roleplay") {
  const limit = mode === "extended" ? 10 : mode === "hints" ? 4 : 6;
  return (Array.isArray(history) ? history : []).slice(-limit);
}

// ----------------------------------------------------------------------------
// AI INPUT VALIDATION (Phase 1 — security gate)
// All learner-controlled fields are strictly bounded and type-checked BEFORE any
// prompt assembly. Scenario identity is server-authoritative: titles/personas
// come from D1 (or a safe allowlist), never from the request body.
// ----------------------------------------------------------------------------

const AI_LIMITS = {
  USER_MESSAGE: 500,
  SCENARIO_TITLE: 120,
  PERSONA: 300,
  HISTORY_ENTRIES: 20,      // pre-bounding; boundedHistory trims to 6/4/10 after
  HISTORY_TEXT: 500,
  SCENARIO_ID: 64,
  SESSION_ID: 64,
  LEARNER_MEMORY_ITEMS: 10,
  LEARNER_MEMORY_RULE: 200,
  LEARNER_MEMORY_EXAMPLE: 200,
};

const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2"]);

/** Returns { ok, value } or { ok: false, reason } for a bounded string field. */
function boundString(value, maxLen, { required = false, fallback = "" } = {}) {
  if (value === undefined || value === null || value === "") {
    return required ? { ok: false, reason: "missing" } : { ok: true, value: fallback };
  }
  if (typeof value !== "string") return { ok: false, reason: "wrong_type" };
  if (value.length > maxLen) return { ok: false, reason: "too_long" };
  return { ok: true, value };
}

/** Validates and normalizes every learner-controlled AI field. Throws a 400-shaped
 * object via return; never mutates the request. */
function validateAiTurnBody(body) {
  const errors = [];
  const clean = {};

  const msg = boundString(body.user_message, AI_LIMITS.USER_MESSAGE, { required: true });
  if (!msg.ok) errors.push(`user_message:${msg.reason}`); else clean.user_message = msg.value.trim();

  const sid = boundString(body.scenario_id, AI_LIMITS.SCENARIO_ID, { required: true });
  if (!sid.ok) errors.push(`scenario_id:${sid.reason}`); else clean.scenario_id = sid.value.trim();

  const levelRaw = String(body.cefr_level || "A1").toUpperCase().trim();
  if (!CEFR_LEVELS.has(levelRaw)) errors.push("cefr_level:invalid"); else clean.cefr_level = levelRaw;

  const sess = boundString(body.session_id, AI_LIMITS.SESSION_ID);
  if (!sess.ok) errors.push(`session_id:${sess.reason}`); else clean.session_id = sess.value ? sess.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, AI_LIMITS.SESSION_ID) : "";

  const sarc = Number(body.sarcasm_level);
  clean.sarcasm_level = Number.isFinite(sarc) ? Math.min(5, Math.max(1, Math.round(sarc))) : 2;

  if (body.mode !== undefined && !["roleplay", "extended", "hints"].includes(body.mode)) errors.push("mode:invalid");
  clean.mode = ["roleplay", "extended", "hints"].includes(body.mode) ? body.mode : "roleplay";

  if (body.history === undefined || body.history === null) {
    clean.history = []; // first turn — no history yet
  } else if (!Array.isArray(body.history) || body.history.length > AI_LIMITS.HISTORY_ENTRIES) {
    errors.push("history:invalid_or_too_long");
  } else {
    clean.history = [];
    for (const h of body.history) {
      if (!h || typeof h !== "object") { errors.push("history:entry_shape"); break; }
      const t = boundString(h.text, AI_LIMITS.HISTORY_TEXT);
      if (!t.ok) { errors.push(`history:text_${t.reason}`); break; }
      const role = h.role === "user" || h.sender?.toLowerCase() === "user" ? "user" : "model";
      clean.history.push({ role, text: t.value });
    }
  }

  if (body.learner_memory !== undefined && body.learner_memory !== null) {
    if (!Array.isArray(body.learner_memory) || body.learner_memory.length > AI_LIMITS.LEARNER_MEMORY_ITEMS) {
      errors.push("learner_memory:invalid_or_too_long");
    } else {
      clean.learner_memory = [];
      for (const m of body.learner_memory) {
        if (!m || typeof m !== "object") { errors.push("learner_memory:entry_shape"); break; }
        const rule = boundString(m.rule, AI_LIMITS.LEARNER_MEMORY_RULE, { required: true });
        if (!rule.ok) { errors.push(`learner_memory:rule_${rule.reason}`); break; }
        const ex = boundString(m.example, AI_LIMITS.LEARNER_MEMORY_EXAMPLE);
        if (!ex.ok) { errors.push(`learner_memory:example_${ex.reason}`); break; }
        clean.learner_memory.push({ rule: rule.value, example: ex.value || undefined });
      }
    }
  }

  return { ok: errors.length === 0, errors, clean };
}

/** Resolves the scenario's server-authoritative identity. D1 first; fall back to a
 * tiny built-in allowlist (same ids) so the engine works even if D1 hiccups.
 * Returns null for unknown scenario ids — the client is never trusted. */
async function resolveScenarioIdentity(env, scenarioId) {
  const FALLBACK_SCENARIOS = {
    cafe_order: { title_de: "Im Café", persona: "friendly café server in Germany" },
    apartment_viewing: { title_de: "Wohnungsbesichtigung", persona: "German landlord during a viewing" },
    doctor_visit: { title_de: "Beim Arzt", persona: "receptionist at a German medical practice" },
    job_interview: { title_de: "Vorstellungsgespräch", persona: "German hiring manager in an interview" },
    embassy_appointment: { title_de: "Botschaftstermin", persona: "embassy appointment clerk" },
  };
  try {
    const row = await env.DB.prepare("SELECT title_de, ai_persona FROM scenarios WHERE id = ?").bind(scenarioId).first();
    if (row && row.title_de) {
      return { title_de: String(row.title_de).slice(0, AI_LIMITS.SCENARIO_TITLE), persona: String(row.ai_persona || "").slice(0, AI_LIMITS.PERSONA) || "friendly conversational partner" };
    }
  } catch {}
  if (FALLBACK_SCENARIOS[scenarioId]) return FALLBACK_SCENARIOS[scenarioId];
  return null;
}

// Models occasionally echo a JSON schema label ("reply_de: ...") into the value
// itself. Strip any leading "<field>:/-" prefix so labels never reach the UI.
function sanitizeFieldLabel(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/^\s*(reply_de|reply_ar|german|translation_ar|followup_question_ar|explanation_ar|positive_note_ar|roast_comment)\s*[:：\-]\s*/i, "")
    .trim();
}

// ----------------------------------------------------------------------------
// SEPARATE ROLEPLAY AND PEDAGOGICAL EVALUATION
// ----------------------------------------------------------------------------

async function handleAiConversationTurn(request, env, cors) {
  const apiKeys = getGeminiApiKeys(env);
  if (apiKeys.length === 0) return json({ error: "ai_unavailable" }, 503, cors);

  const body = await request.json().catch(() => null);
  if (!body || !body.user_message) return json({ error: "user_message required" }, 400, cors);

  const idToken = extractIdToken(request, body);
  if (!idToken) return json({ error: "unauthenticated", code: "UNAUTHENTICATED", message: "يرجى تسجيل الدخول بحساب Google أولاً لمتابعة المحادثة." }, 401, cors);
  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) return json({ error: "invalid_id_token", code: "UNAUTHENTICATED", message: "جلسة الدخول غير صالحة أو منتهية. يرجى تسجيل الدخول مجدداً." }, 401, cors);

  const rate = await checkGlobalRateLimit(account.sub, env);
  if (!rate.allowed) return json({ error: "rate_limit_exceeded", code: "RATE_LIMIT_EXCEEDED", message: "تم تجاوز الحد الأقصى للمحادثات مؤقتاً. يرجى الانتظار دقيقة.", retry_after: rate.retryAfter }, 429, cors);

  // Phase 1 security gate: strict validation + server-authoritative scenario identity.
  const validation = validateAiTurnBody(body);
  if (!validation.ok) {
    return json({ error: "invalid_request", code: "INVALID_AI_INPUT", details: validation.errors, message: "حدث خطأ في بيانات الطلب. يرجى إعادة المحاولة." }, 400, cors);
  }
  const v = validation.clean;
  const scenarioIdentity = await resolveScenarioIdentity(env, v.scenario_id);
  if (!scenarioIdentity) {
    return json({ error: "unknown_scenario", code: "UNKNOWN_SCENARIO", message: "هذا الموقف التدريبي غير متاح حالياً." }, 400, cors);
  }
  const scenario_id = v.scenario_id;
  const scenario_title = scenarioIdentity.title_de;   // server-authoritative (client value ignored)
  const persona = scenarioIdentity.persona;           // server-authoritative (client value ignored)
  const cefr_level = v.cefr_level;
  const user_message = v.user_message;
  const history = v.history;
  const mode = v.mode;
  const session_id = v.session_id;
  const sarcasm_level = v.sarcasm_level;
  const is_final_turn = body.is_final_turn === true;
  const level = cefr_level;
  const entitlement = await checkUserEntitlement(account, level, env);
  if (!entitlement.allowed) {
    const quotaFailure = ["FREE_QUOTA_EXHAUSTED", "QUOTA_UNAVAILABLE"].includes(entitlement.code);
    return json({
      error: quotaFailure ? "free_quota_error" : "subscription_required",
      code: entitlement.code || "PAYWALL_REQUIRED",
      message: entitlement.message
    }, entitlement.code === "QUOTA_UNAVAILABLE" ? 503 : 402, cors);
  }
  // Consume the free quota once per conversation session (tracked via session_id),
  // NOT per individual message. Signed-in subscribers skip this entirely.
  if (!entitlement.isSubscribed) {
    // Phase 2: with D1 the ledger claim inside consumeTrialQuota is the atomic
    // idempotency mark (replays return SESSION_ALREADY_CONSUMED and proceed at
    // zero quota cost). The KV trial-session key remains as a fast-path check.
    const sessionConsumed = session_id ? await isTrialSessionConsumed(account.sub, session_id, env) : false;
    if (!sessionConsumed) {
      const quota = await consumeTrialQuota(account.sub, env, session_id || null);
      if (!quota.allowed && quota.code !== "SESSION_ALREADY_CONSUMED") {
        const status = quota.code === "QUOTA_UNAVAILABLE" ? 503 : 402;
        return json({ error: "free_quota_unavailable", code: quota.code, message: quota.message }, status, cors);
      }
      if (session_id && env.USER_PROGRESS) {
        try {
          await env.USER_PROGRESS.put(
            trialSessionKey(account.sub, session_id),
            JSON.stringify({ consumed_at: Date.now() }),
            { expirationTtl: 6 * 3600 }
          );
        } catch {}
      }
    }
  }

  const wrapUpInstruction = is_final_turn
    ? "This is the final exchange. Give a warm realistic farewell and do not ask a new question."
    : `Continue naturally at CEFR level ${level}.`;
  const roleplayInstruction = `You are the in-character native German roleplay counterpart in '${scenario_title || scenario_id}'.
Persona: ${persona || "friendly conversational partner"}. Target learner CEFR level: ${level}.
${wrapUpInstruction}
CONVERSATION RULES:
- react to what the learner ACTUALLY just said — answer their question, comment on their statement, build on it. Never reply with a generic pleasance.
- Keep reply_de to 1-2 short sentences that feel like real spoken German.
Return:
- reply_de: your natural German reply, in character, at CEFR level ${level}. Plain sentence only — never prefix it with field labels.
- reply_ar: its accurate, idiomatic Modern Standard Arabic translation. Never translate secular German greetings as السلام عليكم.
- next_hint: ONE short German sentence (with its Arabic translation_ar) that the LEARNER could realistically say next in this conversation at their level — a suggestion, not your own line.
- followup_question_ar: ONE short, inviting Arabic question that encourages the learner to keep chatting (about the scenario, e.g. about rent, appointment, order).
Respond strictly as JSON with keys: reply_de, reply_ar, next_hint { german, translation_ar }, followup_question_ar`;
  const evaluationInstruction = `You are Katzu, a witty, warm Arabic-speaking German grammar coach who roasts German grammar (not the learner).
Evaluate ONLY the learner's latest German sentence against CEFR level ${level}. Do not use conversation history, scenario context, or the roleplay persona.
Sarcasm level for roast_comment (1-5, default 2): ${Math.min(5, Math.max(1, Number(sarcasm_level) || 2))}. 1 = gentle, 3 = playfully sarcastic, 5 = maximum sass about how absurd German grammar is — never mocking the learner.
roast_comment must be in Arabic targeting German grammar absurdity (articles, cases, word order), staying encouraging.
Respond strictly as JSON: {"is_correct":boolean,"original_mistake":"string","corrected_german":"string","grammar_rule":"string","explanation_ar":"string","roast_comment":"string","user_message_translation_ar":"string","positive_note_ar":"string"}`;

  const conversationPayload = {
    systemInstruction: { parts: [{ text: roleplayInstruction }] },
    contents: [
      ...boundedHistory(history, mode).map(h => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.text || "" }]
      })),
      { role: "user", parts: [{ text: user_message }] }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          reply_de: { type: "STRING" },
          reply_ar: { type: "STRING" },
          next_hint: {
            type: "OBJECT",
            properties: {
              german: { type: "STRING" },
              translation_ar: { type: "STRING" }
            },
            required: ["german", "translation_ar"]
          },
          followup_question_ar: { type: "STRING" }
        },
        required: ["reply_de", "reply_ar", "next_hint", "followup_question_ar"],
        propertyOrdering: ["reply_de", "reply_ar", "next_hint", "followup_question_ar"]
      },
    // Generous output budget: reasoning models spend tokens on thoughts before
    // the JSON answer — a tight cap truncates the payload and produces empty
    // fields that used to surface as fake fallback replies.
      temperature: 0.3,
      maxOutputTokens: 700
    }
  };
  const evaluationPayload = {
    systemInstruction: { parts: [{ text: evaluationInstruction }] },
    contents: [{ role: "user", parts: [{ text: user_message }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          is_correct: { type: "BOOLEAN" },
          original_mistake: { type: "STRING" },
          corrected_german: { type: "STRING" },
          grammar_rule: { type: "STRING" },
          explanation_ar: { type: "STRING" },
          roast_comment: { type: "STRING" },
          user_message_translation_ar: { type: "STRING" },
          positive_note_ar: { type: "STRING" }
        },
        required: ["is_correct", "explanation_ar", "positive_note_ar"],
        propertyOrdering: ["is_correct", "original_mistake", "corrected_german", "grammar_rule", "explanation_ar", "roast_comment", "user_message_translation_ar", "positive_note_ar"]
      },
      temperature: 0.2,
      maxOutputTokens: 350
    }
  };

  try {
    // These calls intentionally have separate prompts/personas and independent inputs.
    const [roleplayRaw, evaluationRaw] = await Promise.all([
      callGeminiWithFailover(apiKeys, conversationPayload, env),
      callGeminiWithFailover(apiKeys, evaluationPayload, env)
    ]);
    const roleplay = cleanJson(roleplayRaw);
    const evaluationParsed = cleanJson(evaluationRaw);
    const evaluation = evaluationParsed.evaluation || evaluationParsed;
    // Sanitize every string field — a model echoing schema labels ("reply_de: ...")
    // must never reach the learner's chat bubbles.
    const replyDe = sanitizeFieldLabel(roleplay.reply_de) || "";
    const replyAr = sanitizeFieldLabel(roleplay.reply_ar) || "";
    // An empty German reply means the model output was unusable. Fail honestly
    // (client shows the retry card) instead of fabricating a templated answer
    // that ignores what the learner just said.
    if (!replyDe) {
      console.error("[ai/turn] empty reply_de after parse — raw:", String(roleplayRaw).slice(0, 200));
      return json({
        error: "ai_empty_reply",
        code: "AI_EMPTY_REPLY",
        message: "تعذر توليد رد واضح. حاول إعادة الإرسال."
      }, 502, cors);
    }
    const nextHint = roleplay.next_hint && typeof roleplay.next_hint === "object"
      ? {
          german: sanitizeFieldLabel(roleplay.next_hint.german) || "",
          translation_ar: sanitizeFieldLabel(roleplay.next_hint.translation_ar) || ""
        }
      : null;
    const hints = nextHint && nextHint.german ? [nextHint] : [];
    const followupAr = sanitizeFieldLabel(roleplay.followup_question_ar) || "";
    return json({
      reply_de: replyDe,
      reply_ar: replyAr,
      evaluation: evaluation && typeof evaluation === "object" ? evaluation : {},
      hints,
      followup_ar: followupAr,
      provider: lastAiProvider
    }, 200, cors);
  } catch (err) {
    console.error("[Separated Turn Error]", err, "| failover state:", summarizeFailoverState(apiKeys));
    const detail = String(err?.message || "").slice(0, 180);
    return json({ error: "ai_error", code: "AI_TURN_FAILED", message: "تعذر إكمال دور المحادثة والتقييم. حاول إعادة الإرسال.", detail }, 502, cors);
  }
}

// ----------------------------------------------------------------------------
// EDGE CACHED TRANSLATION (<5ms for repeated phrases)
// ----------------------------------------------------------------------------

async function handleAiTranslation(request, env, cors) {
  const body = await request.json().catch(() => null);
  // Translation is intentionally available to every authenticated learner (including
  // trial users) because it supports core comprehension; it remains rate-limited.
  const auth = await authenticateAiRequest(request, body, env, cors);
  if (auth.response) return auth.response;

  const text = (body?.text || "").trim();
  if (!text) return json({ translation_ar: "" }, 200, cors);
  const apiKeys = getGeminiApiKeys(env);
  if (apiKeys.length === 0) {
    return json({ error: "ai_unavailable" }, 503, cors);
  }

  // 1. Check in-memory Edge Cache (0ms latency, zero quota used)
  const cacheKey = text.toLowerCase();
  const cached = getCache(translationCache, cacheKey);
  if (cached) {
    return json({ translation_ar: cached, cached: true }, 200, cors);
  }

  const prompt = `Translate this German sentence into accurate, natural, idiomatic Modern Standard Arabic.
German: "${text}"
Rules:
- Translate meaning, not word-by-word. Rephrase into the way a native Arabic speaker would naturally say it.
- Never transliterate German words into Arabic letters (e.g. write المحاسبة for Buchhaltung, not بوخهالتونج) — use the established Arabic equivalent term.
- Never use "السلام عليكم" for "Guten Tag"/"Hallo"; use "مرحباً" or "صباح الخير"/"مساء الخير".
- Keep it natural for a learner app: concise, clear MSA, correct grammar and gender.
Respond strictly in JSON:
{ "translation_ar": "string" }`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 120
    }
  };

  const raw = await callGeminiWithFailover(apiKeys, payload, env);
  const parsed = cleanJson(raw);
  const translation = parsed.translation_ar || "";

  if (translation) {
    setCache(translationCache, cacheKey, translation, 1000);
  }

  return json({ translation_ar: translation }, 200, cors);
}

// ----------------------------------------------------------------------------
// EDGE CACHED CONVERSATION HINTS
// ----------------------------------------------------------------------------

async function handleAiHints(request, env, cors) {
  const body = await request.json().catch(() => null);
  const { scenario_title, cefr_level, last_ai_reply, history } = body || {};
  const auth = await authenticateAiRequest(request, body, env, cors, {
    level: cefr_level || "A1",
    quotaExempt: true,
    requireEntitlement: true,
  });
  if (auth.response) return auth.response;

  const reply = (last_ai_reply || "").trim();
  const recentHistory = boundedHistory(history, "hints");
  const apiKeys = getGeminiApiKeys(env);
  if (apiKeys.length === 0) {
    return json({ error: "ai_unavailable" }, 503, cors);
  }

  // 1. Check in-memory Edge Cache
  const cacheKey = `${cefr_level || "A1"}:${scenario_title || ""}:${reply}:${JSON.stringify(recentHistory)}`.toLowerCase();
  const cached = getCache(hintsCache, cacheKey);
  if (cached) {
    return json({ hints: cached, cached: true }, 200, cors);
  }

  const prompt = `Generate exactly ONE practical German response option for an Arabic-speaking learner to reply to: "${reply}".
Level: ${cefr_level || "A1"}. Scenario: ${scenario_title || ""}.
Use only this bounded recent conversation context (at most the last four messages): ${JSON.stringify(recentHistory)}.
The option must be a complete, natural sentence exactly at CEFR level ${cefr_level || "A1"} — not a fragment, not a grammar exercise.
translation_ar must convey the meaning naturally in Modern Standard Arabic (not word-by-word transliteration).
Never use religious greeting substitutions.
Respond strictly in JSON:
{ "hints": [ { "german": "string", "translation_ar": "string" } ] }`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          hints: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                german: { type: "STRING" },
                translation_ar: { type: "STRING" }
              },
              required: ["german", "translation_ar"]
            }
          }
        },
        required: ["hints"]
      },
      temperature: 0.3,
      maxOutputTokens: 120
    }
  };

  const raw = await callGeminiWithFailover(apiKeys, payload, env);
  const parsed = cleanJson(raw);
  let hints = Array.isArray(parsed.hints) ? parsed.hints : [];

  if (hints.length === 0 && typeof raw === "string") {
    const germanMatches = [...raw.matchAll(/"german"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map(m => m[1]);
    const arMatches = [...raw.matchAll(/"translation_ar"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map(m => m[1]);
    for (let i = 0; i < germanMatches.length; i++) {
      hints.push({
        german: germanMatches[i].replace(/\\"/g, '"'),
        translation_ar: arMatches[i] ? arMatches[i].replace(/\\"/g, '"') : ""
      });
    }
  }

  if (hints.length > 0) {
    setCache(hintsCache, cacheKey, hints, 500);
  }

  return json({ hints }, 200, cors);
}

// ----------------------------------------------------------------------------
// DIAGNOSTIC HEALTH & ROUTER TELEMETRY
// ----------------------------------------------------------------------------

async function handleAiHealth(env, cors) {
  const inspection = inspectGeminiKeys(env);
  const apiKeys = inspection.uniqueKeys;
  const coolingDownCount = apiKeys.filter(k => isKeyCoolingDown(k)).length;
  const healthyCount = apiKeys.length - coolingDownCount;

  // Durable cumulative counters from KV take precedence over this isolate's
  // in-memory view (Workers isolate memory is per-isolate).
  const kvMetrics = await readAiFallbackMetrics(env);
  const fallbackRequests = Math.max(aiFallbackMetrics.requests, kvMetrics?.requests || 0);
  const fallbackServed = Math.max(aiFallbackMetrics.served, kvMetrics?.served || 0);
  const fallbackFailures = Math.max(aiFallbackMetrics.failures, kvMetrics?.failures || 0);

  return json({
    status: "healthy",
    service: "Katzu Unified Worker + Multi-Key AI Engine",
    keysConfigured: inspection.uniqueCount,
    rawKeysFound: inspection.rawCount,
    hasDuplicateKeys: inspection.hasDuplicates,
    duplicateWarning: inspection.hasDuplicates 
      ? `One or more keys are duplicated: ${inspection.duplicates.join(", ")}`
      : null,
    healthyKeys: healthyCount,
    coolingDownKeys: coolingDownCount,
    primaryWorkingModel: primaryWorkingModel || "auto-pinning on first call",
    cachedTranslationsCount: translationCache.size,
    cachedHintsCount: hintsCache.size,
    ready: apiKeys.length > 0 || !!env.AI,
    strategy: "single-prompt fusion + round-robin 14-key load balancing + edge memory cache + Workers AI fallback",
    registeredKeysMasked: inspection.previews,
    aiFallback: {
      enabled: !isFallbackKillSwitchOff(env),
      bindingPresent: !!env.AI,
      model: WORKERS_AI_FALLBACK_MODEL,
      requests: fallbackRequests,
      served: fallbackServed,
      failures: fallbackFailures,
      lastUsedAt: aiFallbackMetrics.lastUsedAt,
      lastProvider: lastAiProvider,
      countersSource: kvMetrics ? "kv" : "in-memory",
    }
  }, 200, cors);
}

// ============================================================================
// WORKER 1 IMPLEMENTATION (AUTH, SUBSCRIPTIONS & PROGRESS)
// ============================================================================

async function handleVerify(request, env, cors) {
  const body = await request.json().catch(() => null);
  const code = body?.code;
  const idToken = extractIdToken(request, body);

  if (!code || typeof code !== "string") {
    return json({ valid: false, reason: "malformed" }, 400, cors);
  }
  if (!idToken || typeof idToken !== "string") {
    return json({ valid: false, reason: "missing_id_token" }, 400, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ valid: false, reason: "invalid_id_token" }, 200, cors);
  }

  const parsed = parseCode(code);
  if (!parsed) {
    return json({ valid: false, reason: "malformed" }, 400, cors);
  }

  const { months, nonce, signature } = parsed;
  const expectedSig = await sign(`DE-${months}M-${nonce}`, env.HMAC_SECRET);
  if (expectedSig !== signature) {
    return json({ valid: false, reason: "invalid_signature" }, 200, cors);
  }

  // Phase 2: the redemption claim is atomic. With D1, the PRIMARY KEY insert
  // settles concurrent double-spend across isolates: exactly one request wins,
  // every loser gets "already_redeemed". Without D1, falls back to KV read-check.
  const ledgerReady = await ensureLedgerTables(env);
  if (ledgerReady) {
    try {
      await env.DB.prepare(
        "INSERT INTO redeemed_codes_ledger (code, account_id, months, redeemed_at) VALUES (?, ?, ?, ?)"
      ).bind(code, account.sub, months, new Date().toISOString()).run();
    } catch {
      return json({ valid: false, reason: "already_redeemed" }, 200, cors);
    }
  } else {
    const codeKey = `code:${code}`;
    const existingCode = await env.REDEEMED_CODES.get(codeKey);
    if (existingCode) {
      return json({ valid: false, reason: "already_redeemed" }, 200, cors);
    }
  }

  const accountKey = `account:${account.sub}`;
  const existingAccountRaw = await env.REDEEMED_CODES.get(accountKey);

  // First-ever redemption on this account closes any pending referral claim:
  // the invited friend's purchase is what makes the referral "verified paid".
  const isFirstRedemption = !existingAccountRaw;
  const existingExpiresAt = existingAccountRaw
    ? JSON.parse(existingAccountRaw).expiresAt
    : null;

  const newExpiresAt = addMonthsIso(existingExpiresAt, months);

  await env.REDEEMED_CODES.put(`code:${code}`, JSON.stringify({
    redeemedAt: new Date().toISOString(),
    account: account.sub,
  }));
  await env.REDEEMED_CODES.put(accountKey, JSON.stringify({
    email: account.email,
    expiresAt: newExpiresAt,
    updatedAt: new Date().toISOString(),
  }));

  if (account.email) {
    await env.REDEEMED_CODES.put(`email_index:${account.email.toLowerCase().trim()}`, account.sub);
  }

  if (isFirstRedemption) {
    await awardVerifiedReferral(account, env);
  }

  return json({
    valid: true,
    months,
    expiresAt: newExpiresAt,
    email: account.email,
  }, 200, cors);
}

async function handleCheckStatus(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = extractIdToken(request, body);
  const now = new Date();

  if (!idToken || typeof idToken !== "string") {
    return json({ active: false, days_remaining: 0, server_time: now.toISOString(), reason: "missing_id_token" }, 400, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ active: false, days_remaining: 0, server_time: now.toISOString(), reason: "invalid_id_token" }, 200, cors);
  }

  const accountKey = `account:${account.sub}`;
  const raw = await env.REDEEMED_CODES.get(accountKey);
  if (!raw) {
    return json({ active: false, days_remaining: 0, server_time: now.toISOString(), expiresAt: null }, 200, cors);
  }

  const record = JSON.parse(raw);
  const expiry = new Date(record.expiresAt);
  const diffMs = expiry.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const active = diffMs > 0;

  return json({
    active,
    days_remaining: daysRemaining,
    server_time: now.toISOString(),
    expiresAt: record.expiresAt,
  }, 200, cors);
}

// ----------------------------------------------------------------------------
// VERIFIED REFERRAL SYSTEM
// Every signed-in user has a stable personal referral code (REF-XXXXXXXX).
// A referral pays out ONLY when the invited friend redeems their first
// activation code on a brand-new account ("verified paid referral").
// Payout: 1 month of Katzu Pro, stacked onto the referrer's expiry.
// ----------------------------------------------------------------------------

const REFERRAL_REWARD_MONTHS = 1;
const REFERRAL_CODE_PREFIX = "REF-";

function generateReferralCode(accountId) {
  // Stable, collision-checked code derived from the account id.
  // 8 chars from a 32-char alphabet => ~1 in 1.09B per-pair collision odds.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = (hash * 31 + accountId.charCodeAt(i)) >>> 0;
  }
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[hash % 32];
    hash = (hash * 1103515245 + 12345) >>> 0;
  }
  return REFERRAL_CODE_PREFIX + code;
}

async function resolveReferralCode(code, env) {
  // Referral codes map to account ids through REDEEMED_CODES KV: "refcode:<CODE>" -> sub
  if (!env.REDEEMED_CODES || typeof code !== "string" || code.trim().length < 6) return null;
  const raw = await env.REDEEMED_CODES.get(`refcode:${code.trim().toUpperCase()}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.sub ? parsed : null;
  } catch {
    return null;
  }
}

async function handleReferralInfo(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = extractIdToken(request, body);
  if (!idToken || typeof idToken !== "string") {
    return json({ error: "missing_id_token", code: "UNAUTHENTICATED" }, 401, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ error: "invalid_id_token", code: "UNAUTHENTICATED" }, 401, cors);
  }

  let envRecords = [];
  if (env.REDEEMED_CODES) {
    const stored = await env.REDEEMED_CODES.get(`referrals:${account.sub}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) envRecords = parsed;
      } catch {}
    }
  }

  // Publish this user's personal code so /referral/claim can resolve it.
  // Stable per account id, so re-writing the same mapping is idempotent.
  const referralCode = generateReferralCode(account.sub);
  if (env.REDEEMED_CODES) {
    await env.REDEEMED_CODES.put(`refcode:${referralCode}`, JSON.stringify({ sub: account.sub }));
  }

  return json({
    referral_code: referralCode,
    reward_months: REFERRAL_REWARD_MONTHS,
    verified_referrals: envRecords.filter(r => r?.status === "verified").length,
    pending_referrals: envRecords.filter(r => r?.status === "pending").length,
    total_reward_months: envRecords.filter(r => r?.status === "verified").length * REFERRAL_REWARD_MONTHS,
    referrals: envRecords.map((r) => ({
      invited_email_masked: maskEmail(r.invited_email),
      status: r.status,
      awarded_at: r.awarded_at || null,
    })),
  }, 200, cors);
}

async function handleReferralClaim(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = extractIdToken(request, body);
  const referralCode = body?.referral_code;

  if (!idToken || typeof idToken !== "string") {
    return json({ error: "missing_id_token", code: "UNAUTHENTICATED" }, 401, cors);
  }
  if (!referralCode || typeof referralCode !== "string") {
    return json({ error: "missing_referral_code", code: "MALFORMED" }, 400, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ error: "invalid_id_token", code: "UNAUTHENTICATED" }, 401, cors);
  }

  if (!env.REDEEMED_CODES || !env.USER_PROGRESS) {
    return json({ error: "storage_unavailable", code: "QUOTA_UNAVAILABLE" }, 503, cors);
  }

  const referrer = await resolveReferralCode(referralCode, env);
  if (!referrer) {
    return json({ error: "invalid_referral_code", code: "INVALID_REFERRAL" }, 200, cors);
  }
  if (referrer.sub === account.sub) {
    return json({ error: "cannot_refer_yourself", code: "SELF_REFERRAL" }, 200, cors);
  }

  // A referral claim is permanent: one account can only ever be referred once.
  const claimKey = `referred-by:${account.sub}`;
  const existingClaim = await env.REDEEMED_CODES.get(claimKey);
  if (existingClaim) {
    try {
      const claim = JSON.parse(existingClaim);
      if (claim?.referrer_sub) {
        return json({ error: "already_referred", code: "ALREADY_REFERRED" }, 200, cors);
      }
    } catch {}
  }

  const inviteeKey = `account:${account.sub}`;
  const inviteeRaw = await env.REDEEMED_CODES.get(inviteeKey);
  if (inviteeRaw) {
    try {
      const invitee = JSON.parse(inviteeRaw);
      if (invitee?.expiresAt && new Date(invitee.expiresAt).getTime() > Date.now()) {
        return json({ error: "only_for_new_accounts", code: "ONLY_FOR_NEW_ACCOUNTS" }, 200, cors);
      }
    } catch {}
  }

  await env.REDEEMED_CODES.put(claimKey, JSON.stringify({
    referrer_sub: referrer.sub,
    referrer_code: referralCode.trim().toUpperCase(),
    claimed_at: new Date().toISOString(),
    status: "pending",
  }));

  return json({ success: true, status: "pending" }, 200, cors);
}

async function awardVerifiedReferral(inviteeAccount, env) {
  // Called after a first successful activation-code redemption on this account.
  // Phase 2: the payout is claimed atomically in the referral_payouts D1 ledger
  // (PRIMARY KEY = invited account) — concurrent first redemptions can only ever
  // pay the referrer once. KV claim status remains as the fast-path check.
  try {
    const claimKey = `referred-by:${inviteeAccount.sub}`;
    const claimRaw = await env.REDEEMED_CODES?.get(claimKey);
    if (!claimRaw) return;
    let claim = null;
    try { claim = JSON.parse(claimRaw); } catch { return; }
    if (!claim?.referrer_sub || claim.status === "verified") return;
    if (env.DB && await ensureLedgerTables(env)) {
      try {
        await env.DB.prepare(
          "INSERT INTO referral_payouts (invited_account_id, inviter_account_id, awarded_at) VALUES (?, ?, ?)"
        ).bind(inviteeAccount.sub, claim.referrer_sub, new Date().toISOString()).run();
      } catch {
        return; // duplicate insert = payout already granted; never double-pay
      }
    }

    const referrerKey = `account:${claim.referrer_sub}`;
    const referrerRaw = await env.REDEEMED_CODES.get(referrerKey);
    const referrerExpiresAt = referrerRaw ? JSON.parse(referrerRaw).expiresAt : null;
    const newExpiresAt = addMonthsIso(referrerExpiresAt, REFERRAL_REWARD_MONTHS);

    await env.REDEEMED_CODES.put(referrerKey, JSON.stringify({
      email: referrerRaw ? JSON.parse(referrerRaw).email : "",
      expiresAt: newExpiresAt,
      updatedAt: new Date().toISOString(),
    }));

    claim.status = "verified";
    claim.verified_at = new Date().toISOString();
    claim.reward_months = REFERRAL_REWARD_MONTHS;
    await env.REDEEMED_CODES.put(claimKey, JSON.stringify(claim));

    // Record in referrer's referral history.
    const historyKey = `referrals:${claim.referrer_sub}`;
    let history = [];
    const historyRaw = await env.REDEEMED_CODES.get(historyKey);
    if (historyRaw) {
      try {
        const parsed = JSON.parse(historyRaw);
        if (Array.isArray(parsed)) history = parsed;
      } catch {}
    }
    history.push({
      invited_sub: inviteeAccount.sub,
      invited_email: inviteeAccount.email || "",
      status: "verified",
      awarded_at: new Date().toISOString(),
      reward_months: REFERRAL_REWARD_MONTHS,
    });
    await env.REDEEMED_CODES.put(historyKey, JSON.stringify(history));
  } catch (e) {
    console.error("[Referral] Award failed:", e);
  }
}

function maskEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) return "****";
  const [local, domain] = email.split("@");
  const maskedLocal = local.length <= 2
    ? local[0] + "*"
    : local.slice(0, 2) + "***";
  return `${maskedLocal}@${domain}`;
}

async function handleAdminGenerate(request, env, cors) {
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${env.ADMIN_SECRET}`) {
    return json({ error: "unauthorized" }, 401, cors);
  }

  const body = await request.json().catch(() => null);
  const months = body?.months;
  if (!months || months < 1 || months > 12) {
    return json({ error: "months must be 1-12" }, 400, cors);
  }

  const nonce = crypto.randomUUID().split("-")[0].toUpperCase();
  const unsigned = `DE-${months}M-${nonce}`;
  const signature = await sign(unsigned, env.HMAC_SECRET);
  const code = `${unsigned}-${signature}`;

  return json({ code }, 200, cors);
}

async function handleProgressSync(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = extractIdToken(request, body);
  const incomingStats = body?.stats;
  const incomingTrainings = body?.trainings;
  const incomingSavedWordIds = body?.saved_word_ids;
  const incomingMistakes = body?.mistakes;
  const incomingSessionSummaries = body?.session_summaries;

  if (!idToken || typeof idToken !== "string") {
    return json({ error: "missing_id_token" }, 400, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ error: "invalid_id_token" }, 200, cors);
  }

  const key = `progress:${account.sub}`;
  const existingRaw = await env.USER_PROGRESS.get(key);
  const existing = existingRaw ? JSON.parse(existingRaw) : null;

  const now = Date.now();
  let merged;

  if (!existing) {
    merged = {
      stats: incomingStats || {},
      trainings: incomingTrainings || [],
      saved_word_ids: incomingSavedWordIds || [],
      mistakes: incomingMistakes || [],
      session_summaries: incomingSessionSummaries || [],
      updated_at: now,
    };
  } else {
    merged = {
      stats: mergeStats(existing.stats, incomingStats),
      trainings: mergeTrainings(existing.trainings, incomingTrainings),
      saved_word_ids: mergeSavedWordIds(existing.saved_word_ids, incomingSavedWordIds),
      mistakes: mergeMistakes(existing.mistakes, incomingMistakes),
      session_summaries: mergeSessionSummaries(existing.session_summaries, incomingSessionSummaries),
      updated_at: now,
    };
  }

  await env.USER_PROGRESS.put(key, JSON.stringify(merged));

  return json({ success: true, updated_at: now }, 200, cors);
}

async function handleProgressGet(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = extractIdToken(request, body);

  if (!idToken || typeof idToken !== "string") {
    return json({ error: "missing_id_token" }, 400, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ error: "invalid_id_token" }, 200, cors);
  }

  const key = `progress:${account.sub}`;
  const raw = await env.USER_PROGRESS.get(key);

  if (!raw) {
    return json({
      updated_at: null,
      stats: { level: "A1", streak_days: 0, total_points: 0, last_active_date: null },
      trainings: [],
      saved_word_ids: [],
      mistakes: [],
      session_summaries: [],
    }, 200, cors);
  }

  return json(JSON.parse(raw), 200, cors);
}

function mergeStats(existingStats, incomingStats) {
  if (!existingStats) return incomingStats || {};
  if (!incomingStats) return existingStats;
  const levelRank = { A1: 1, A2: 2, B1: 3, B2: 4 };
  const latest = (incomingStats.updated_at || 0) >= (existingStats.updated_at || 0)
    ? incomingStats
    : existingStats;
  return {
    ...existingStats,
    ...latest,
    total_points: Math.max(existingStats.total_points || 0, incomingStats.total_points || 0),
    streak_days: Math.max(existingStats.streak_days || 0, incomingStats.streak_days || 0),
    level: (levelRank[incomingStats.level] || 0) >= (levelRank[existingStats.level] || 0)
      ? (incomingStats.level || existingStats.level)
      : existingStats.level,
  };
}

function mergeTrainings(existingTrainings, incomingTrainings) {
  if (!existingTrainings || !Array.isArray(existingTrainings)) existingTrainings = [];
  if (!incomingTrainings || !Array.isArray(incomingTrainings)) incomingTrainings = [];
  const map = new Map();
  for (const t of existingTrainings) {
    if (t && t.scenario_id != null) map.set(t.scenario_id, { ...t });
  }
  for (const inc of incomingTrainings) {
    if (!inc || inc.scenario_id == null) continue;
    const ex = map.get(inc.scenario_id);
    if (!ex) {
      map.set(inc.scenario_id, { ...inc });
      continue;
    }
    map.set(inc.scenario_id, mergeTrainingEntry(ex, inc));
  }
  return [...map.values()];
}

function mergeTrainingEntry(existing, incoming) {
  const merged = { ...existing };
  for (const key of Object.keys(incoming)) {
    if (key === "scenario_id") {
      merged.scenario_id = incoming.scenario_id;
      continue;
    }
    const ev = existing[key];
    const iv = incoming[key];
    if (typeof ev === "boolean" || typeof iv === "boolean") {
      merged[key] = ev === true || iv === true;
    } else if (key === "effective_level") {
      if (iv == null) merged[key] = ev;
      else if (ev == null) merged[key] = iv;
      else merged[key] = iv > ev ? iv : ev;
    } else {
      merged[key] = iv != null ? iv : ev;
    }
  }
  return merged;
}

function mergeSavedWordIds(existingIds, incomingIds) {
  if (!existingIds || !Array.isArray(existingIds)) existingIds = [];
  if (!incomingIds || !Array.isArray(incomingIds)) incomingIds = [];
  const set = new Set([...existingIds, ...incomingIds]);
  return [...set];
}

function mergeMistakes(existingMistakes, incomingMistakes) {
  const map = new Map();
  for (const mistake of [...(existingMistakes || []), ...(incomingMistakes || [])]) {
    if (!mistake) continue;
    const id = mistake.sync_id || mistake.syncId || mistake.id ||
      `${mistake.user_id || mistake.userId || ""}:${mistake.scenario_id || mistake.scenarioId || ""}:${mistake.timestamp || ""}:${mistake.original || ""}`;
    if (!id) continue;
    const previous = map.get(id);
    const latest = !previous || (mistake.updated_at || mistake.updatedAt || 0) >= (previous.updated_at || previous.updatedAt || 0)
      ? { ...(previous || {}), ...mistake }
      : { ...mistake, ...previous };
    latest.is_mastered = Boolean(previous?.is_mastered || previous?.isMastered || mistake.is_mastered || mistake.isMastered);
    map.set(id, latest);
  }
  return [...map.values()];
}

function mergeSessionSummaries(existingSessions, incomingSessions) {
  const map = new Map();
  for (const session of [...(existingSessions || []), ...(incomingSessions || [])]) {
    if (!session || session.id == null) continue;
    const previous = map.get(session.id);
    map.set(session.id, !previous || (session.updated_at || session.updatedAt || 0) >= (previous.updated_at || previous.updatedAt || 0)
      ? { ...(previous || {}), ...session }
      : { ...session, ...previous });
  }
  return [...map.values()];
}

function parseCode(code) {
  const match = code.trim().match(/^DE-(\d{1,2})M-([A-Z0-9]+)-([A-F0-9]+)$/i);
  if (!match) return null;
  const months = parseInt(match[1], 10);
  if (months < 1 || months > 12) return null;
  return { months, nonce: match[2], signature: match[3].toUpperCase() };
}

async function sign(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase().slice(0, 16);
}

async function verifyGoogleIdToken(idToken, expectedClientId, env = {}) {
  if (!idToken || typeof idToken !== "string") return null;

  // Opaque worker session tokens (issued by /auth/session) resolve via KV.
  if (isSessionToken(idToken)) {
    return resolveSessionToken(idToken, env);
  }

  // 1. Verify basic 3-part JWT structure
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;

  let payload = null;
  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = atob(base64);
    payload = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  if (!payload || typeof payload.sub !== "string" || !payload.sub) return null;

  // 2. Check expiration (exp in epoch seconds)
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    return null;
  }

  // 3. Check audience
  if (expectedClientId && payload.aud !== expectedClientId) {
    return null;
  }

  // 4. Check issuer
  const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
  if (!validIssuers.includes(payload.iss)) {
    return null;
  }

  // 5. Check for unsigned / none algorithm
  try {
    const headerStr = atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"));
    const header = JSON.parse(headerStr);
    if (header.alg !== "RS256") {
      return null;
    }
  } catch {
    return null;
  }

  // In test mode or local test runner
  if (env?.TEST_MODE || (typeof process !== "undefined" && process.env?.NODE_ENV === "test")) {
    return { sub: payload.sub, email: payload.email || "" };
  }

  // 6. Cryptographic tokeninfo verification via Google OAuth2 endpoint
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (expectedClientId && data.aud !== expectedClientId) return null;
    if (!data.sub) return null;
    if (data.exp && parseInt(data.exp, 10) < nowSec) return null;
    if (data.iss && !validIssuers.includes(data.iss)) return null;
    if (!data.iss || !validIssuers.includes(data.iss)) return null;
    return { sub: data.sub, email: data.email || "" };
  } catch {
    return null;
  }
}

function addMonthsIso(existingIso, months) {
  const now = new Date();
  let base = now;
  if (existingIso) {
    const existing = new Date(existingIso);
    if (!isNaN(existing.getTime()) && existing.getTime() > now.getTime()) base = existing;
  }
  const result = new Date(base);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result.toISOString();
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}

export {
  checkRateLimit,
  checkUserEntitlement,
  consumeTrialQuota,
  handleUserExport,
  getCorsHeaders,
  isTrialSessionConsumed,
  readTrialQuota,
  trialSessionKey,
  verifyGoogleIdToken,
  canUseWorkersAiFallback,
  convertGeminiPayloadToMessages,
  getAiFallbackMetrics,
  isFallbackKillSwitchOff,
  runWorkersAiFallback,
  WORKERS_AI_FALLBACK_MODEL,
};

// ============================================================================
// WORKER 2 IMPLEMENTATION (D1 CONTENT DATABASE CMS)
// ============================================================================

const VALID_LEVELS = new Set(["A1", "A2", "B1", "B2"]);

function checkAdminAuth(request, env) {
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${env.ADMIN_SECRET}`;
}

async function handleGetScenarios(request, env, cors) {
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);
  const { results } = await env.DB.prepare("SELECT * FROM scenarios").all();
  return json(results || [], 200, cors);
}

async function handleGetScenarioById(id, request, env, cors) {
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);
  const scenario = await env.DB.prepare("SELECT * FROM scenarios WHERE id = ?").bind(id).first();
  if (!scenario) {
    return json({ error: "scenario_not_found" }, 404, cors);
  }
  const { results: phrases } = await env.DB.prepare(
    "SELECT * FROM starter_phrases WHERE scenario_id = ? ORDER BY level ASC, sort_order ASC"
  ).bind(id).all();

  return json({ ...scenario, starter_phrases: phrases || [] }, 200, cors);
}

async function handleGetVocabulary(url, request, env, cors) {
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);
  const level = url.searchParams.get("level");
  const topic = url.searchParams.get("topic");

  let query = "SELECT rowid AS id, * FROM vocabulary WHERE 1=1";
  const params = [];
  if (level) {
    query += " AND level = ?";
    params.push(level);
  }
  if (topic) {
    query += " AND topic = ?";
    params.push(topic);
  }

  const stmt = env.DB.prepare(query);
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all();
  return json(results || [], 200, cors);
}

async function handleGetGrammar(url, request, env, cors) {
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);
  const level = url.searchParams.get("level");

  let query = "SELECT * FROM grammar WHERE 1=1";
  const params = [];
  if (level) {
    query += " AND level = ?";
    params.push(level);
  }

  const stmt = env.DB.prepare(query);
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all();
  return json(results || [], 200, cors);
}

async function handleAdminUpload(request, env, cors) {
  if (!checkAdminAuth(request, env)) {
    return json({ error: "unauthorized" }, 401, cors);
  }
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const body = await request.json().catch(() => null);
  const contentType = body?.contentType;
  const rows = body?.rows;

  if (!contentType || !Array.isArray(rows) || rows.length === 0) {
    return json({ error: "invalid_body", detail: "contentType and non-empty rows array required" }, 400, cors);
  }

  const validTypes = ["scenarios", "starter_phrases", "vocabulary", "grammar"];
  if (!validTypes.includes(contentType)) {
    return json({ error: "invalid_contentType", allowed: validTypes }, 400, cors);
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.level && !VALID_LEVELS.has(String(row.level).trim())) {
      return json({
        error: "invalid_level",
        detail: `Row index ${i} has invalid level '${row.level}'. Must be one of A1, A2, B1, B2.`,
      }, 400, cors);
    }
  }

  try {
    const stmts = [];

    for (const row of rows) {
      const keys = Object.keys(row).filter((k) => k !== "rowid");
      if (keys.length === 0) continue;

      const placeholders = keys.map(() => "?").join(", ");
      const columns = keys.join(", ");
      const values = keys.map((k) => row[k]);

      if (contentType === "scenarios" || contentType === "grammar") {
        if (!row.id) {
          return json({ error: "missing_id", detail: `Rows for ${contentType} require an 'id' property` }, 400, cors);
        }
        const updateAssignments = keys
          .filter((k) => k !== "id")
          .map((k) => `${k} = excluded.${k}`)
          .join(", ");

        const sql = `INSERT INTO ${contentType} (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateAssignments}`;
        stmts.push(env.DB.prepare(sql).bind(...values));
      } else {
        const sql = `INSERT INTO ${contentType} (${columns}) VALUES (${placeholders})`;
        stmts.push(env.DB.prepare(sql).bind(...values));
      }
    }

    if (stmts.length > 0) {
      await env.DB.batch(stmts);
    }

    return json({ success: true, count: stmts.length, contentType }, 200, cors);
  } catch (err) {
    return json({ error: "upload_failed", detail: String(err) }, 500, cors);
  }
}

// ============================================================================
// ADMIN SUBSCRIPTION & PROGRESS MANAGEMENT
// ============================================================================

async function handleAdminLookup(request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  const body = await request.json().catch(() => null);
  const email = body?.email ? String(body.email).toLowerCase().trim() : null;
  if (!email) return json({ error: "missing_email" }, 400, cors);

  const sub = await env.REDEEMED_CODES.get(`email_index:${email}`);
  if (!sub) {
    return json({ found: false }, 200, cors);
  }

  const raw = await env.REDEEMED_CODES.get(`account:${sub}`);
  if (!raw) {
    return json({ found: false }, 200, cors);
  }

  const record = JSON.parse(raw);
  const expiresAt = record.expiresAt || null;
  const active = Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());

  return json({
    found: true,
    sub,
    email: record.email || email,
    expiresAt,
    active,
    updatedAt: record.updatedAt || null,
  }, 200, cors);
}

async function handleAdminEdit(request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  const body = await request.json().catch(() => null);
  const email = body?.email ? String(body.email).toLowerCase().trim() : null;
  if (!email) return json({ error: "missing_email" }, 400, cors);

  const sub = await env.REDEEMED_CODES.get(`email_index:${email}`);
  if (!sub) return json({ error: "user_not_found" }, 404, cors);

  const accountKey = `account:${sub}`;
  const raw = await env.REDEEMED_CODES.get(accountKey);
  const record = raw ? JSON.parse(raw) : { email, expiresAt: null };

  let newExpiresAt;
  if (body.set_expiresAt !== undefined) {
    newExpiresAt = body.set_expiresAt ? new Date(body.set_expiresAt).toISOString() : null;
  } else if (body.add_months !== undefined) {
    const months = Number(body.add_months);
    if (isNaN(months)) return json({ error: "invalid_add_months" }, 400, cors);

    const now = new Date();
    let base = now;
    if (record.expiresAt) {
      const existing = new Date(record.expiresAt);
      if (!isNaN(existing.getTime())) base = existing;
    }
    const target = new Date(base);
    target.setUTCMonth(target.getUTCMonth() + months);
    newExpiresAt = target.toISOString();
  } else {
    return json({ error: "must_provide_set_expiresAt_or_add_months" }, 400, cors);
  }

  record.expiresAt = newExpiresAt;
  record.updatedAt = new Date().toISOString();
  await env.REDEEMED_CODES.put(accountKey, JSON.stringify(record));

  return json({ success: true, new_expiresAt: newExpiresAt }, 200, cors);
}

async function handleAdminRevoke(request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  const body = await request.json().catch(() => null);
  const email = body?.email ? String(body.email).toLowerCase().trim() : null;
  if (!email) return json({ error: "missing_email" }, 400, cors);

  const sub = await env.REDEEMED_CODES.get(`email_index:${email}`);
  if (!sub) return json({ error: "user_not_found" }, 404, cors);

  const accountKey = `account:${sub}`;
  const raw = await env.REDEEMED_CODES.get(accountKey);
  const record = raw ? JSON.parse(raw) : { email };

  record.expiresAt = new Date().toISOString();
  record.updatedAt = new Date().toISOString();
  await env.REDEEMED_CODES.put(accountKey, JSON.stringify(record));

  return json({ success: true, revoked_at: record.expiresAt }, 200, cors);
}

async function handleAdminProgressLookup(request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  const body = await request.json().catch(() => null);
  const email = body?.email ? String(body.email).toLowerCase().trim() : null;
  if (!email) return json({ error: "missing_email" }, 400, cors);

  const sub = await env.REDEEMED_CODES.get(`email_index:${email}`);
  if (!sub) return json({ error: "user_not_found" }, 404, cors);

  const raw = await env.USER_PROGRESS.get(`progress:${sub}`);
  if (!raw) {
    return json({
      updated_at: null,
      stats: { level: "A1", streak_days: 0, total_points: 0, last_active_date: null },
      trainings: [],
      saved_word_ids: [],
    }, 200, cors);
  }

  return json(JSON.parse(raw), 200, cors);
}

async function handleAdminProgressEdit(request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  const body = await request.json().catch(() => null);
  const email = body?.email ? String(body.email).toLowerCase().trim() : null;
  const progress = body?.progress;

  if (!email) return json({ error: "missing_email" }, 400, cors);
  if (!progress || typeof progress !== "object") {
    return json({ error: "missing_or_invalid_progress_object" }, 400, cors);
  }

  const sub = await env.REDEEMED_CODES.get(`email_index:${email}`);
  if (!sub) return json({ error: "user_not_found" }, 404, cors);

  const updatedProgress = {
    ...progress,
    updated_at: Date.now(),
  };

  await env.USER_PROGRESS.put(`progress:${sub}`, JSON.stringify(updatedProgress));
  return json({ success: true, updated_at: updatedProgress.updated_at }, 200, cors);
}

// ============================================================================
// SINGLE-ROW D1 CONTENT CRUD
// ============================================================================

function isRowIdTable(type) {
  return type === "vocabulary" || type === "starter_phrases";
}

async function handleAdminListContent(type, request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const sql = isRowIdTable(type)
    ? `SELECT rowid AS id, * FROM ${type} ORDER BY rowid DESC LIMIT 300`
    : `SELECT * FROM ${type} ORDER BY id DESC LIMIT 300`;

  const { results } = await env.DB.prepare(sql).all();
  return json(results || [], 200, cors);
}

async function handleAdminGetSingleContent(type, id, request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const sql = isRowIdTable(type)
    ? `SELECT rowid AS id, * FROM ${type} WHERE rowid = ?`
    : `SELECT * FROM ${type} WHERE id = ?`;

  const row = await env.DB.prepare(sql).bind(id).first();
  if (!row) return json({ error: "not_found" }, 404, cors);

  return json(row, 200, cors);
}

async function handleAdminCreateContent(type, request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "invalid_json_body" }, 400, cors);
  }

  if (body.level && !VALID_LEVELS.has(String(body.level).trim())) {
    return json({ error: "invalid_level", detail: "Level must be A1, A2, B1, or B2" }, 400, cors);
  }

  const keys = Object.keys(body).filter((k) => k !== "rowid" && (isRowIdTable(type) ? k !== "id" : true));
  if (keys.length === 0) return json({ error: "no_fields_to_insert" }, 400, cors);

  const columns = keys.join(", ");
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((k) => body[k]);

  if (!isRowIdTable(type)) {
    if (!body.id) return json({ error: "id_required_for_" + type }, 400, cors);
    const updateClauses = keys.filter((k) => k !== "id").map((k) => `${k} = excluded.${k}`).join(", ");
    const sql = `INSERT INTO ${type} (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateClauses}`;
    await env.DB.prepare(sql).bind(...values).run();
    return json({ success: true, id: body.id }, 201, cors);
  } else {
    const sql = `INSERT INTO ${type} (${columns}) VALUES (${placeholders})`;
    const result = await env.DB.prepare(sql).bind(...values).run();
    return json({ success: true, id: result.meta?.last_row_id }, 201, cors);
  }
}

async function handleAdminUpdateContent(type, id, request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "invalid_json_body" }, 400, cors);
  }

  if (body.level && !VALID_LEVELS.has(String(body.level).trim())) {
    return json({ error: "invalid_level", detail: "Level must be A1, A2, B1, or B2" }, 400, cors);
  }

  const keys = Object.keys(body).filter((k) => k !== "id" && k !== "rowid");
  if (keys.length === 0) return json({ error: "no_fields_to_update" }, 400, cors);

  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => body[k]);
  values.push(id);

  const whereClause = isRowIdTable(type) ? "WHERE rowid = ?" : "WHERE id = ?";
  const sql = `UPDATE ${type} SET ${setClause} ${whereClause}`;

  const result = await env.DB.prepare(sql).bind(...values).run();
  if (result.meta?.changes === 0) {
    return json({ error: "not_found_or_no_change" }, 404, cors);
  }

  return json({ success: true, id }, 200, cors);
}

async function handleAdminDeleteContent(type, id, request, env, cors) {
  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const whereClause = isRowIdTable(type) ? "WHERE rowid = ?" : "WHERE id = ?";
  const sql = `DELETE FROM ${type} ${whereClause}`;

  const result = await env.DB.prepare(sql).bind(id).run();
  if (result.meta?.changes === 0) {
    return json({ error: "not_found" }, 404, cors);
  }

  return json({ success: true, deleted_id: id }, 200, cors);
}

// ============================================================================
// AESTHETIC DARK GLASSMORPHIC DASHBOARD (GET /admin) + AI STATUS CARD
// ============================================================================

function renderAdminDashboardHtml(env) {
  const apiKeys = getGeminiApiKeys(env);
  const keysCount = apiKeys.length;
  const coolingCount = apiKeys.filter(k => isKeyCoolingDown(k)).length;

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Katzu Admin Suite • Edge Control Plane</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          },
          colors: {
            surface: '#090d18',
            panel: 'rgba(16, 24, 43, 0.72)',
            card: 'rgba(19, 30, 56, 0.58)',
            accent: '#38bdf8',
            brand: '#2563eb',
            warning: '#f59e0b',
            success: '#10b981',
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #060912;
      background-image: 
        radial-gradient(circle at 85% 35%, rgba(249, 115, 22, 0.12) 0%, transparent 42%),
        radial-gradient(circle at 25% 15%, rgba(56, 189, 248, 0.14) 0%, transparent 40%),
        radial-gradient(circle at 60% 85%, rgba(99, 102, 241, 0.10) 0%, transparent 45%),
        linear-gradient(180deg, #060913 0%, #090e1c 100%);
      background-attachment: fixed;
      color: #e2e8f0;
      min-height: 100vh;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }

    .glass-card {
      background: rgba(15, 23, 42, 0.68);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      border-radius: 26px;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .glass-card:hover {
      border-color: rgba(56, 189, 248, 0.22);
    }

    .glass-nav-pill {
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 28px;
    }

    .glow-cyan {
      box-shadow: 0 0 24px rgba(56, 189, 248, 0.35);
    }
    .glow-blue {
      box-shadow: 0 0 24px rgba(37, 99, 235, 0.45);
    }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: rgba(10, 15, 28, 0.5); }
    ::-webkit-scrollbar-thumb { background: rgba(56, 189, 248, 0.25); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(56, 189, 248, 0.45); }
  </style>
</head>
<body class="p-3 sm:p-6 lg:p-8 flex flex-col items-center">

  <!-- Toast Container -->
  <div id="toast-container" class="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none"></div>

  <!-- Outer Max-Width Container -->
  <div class="w-full max-w-[1400px] flex flex-col md:flex-row gap-6">

    <!-- LEFT FLOATING PILL SIDEBAR -->
    <aside class="w-full md:w-20 flex md:flex-col items-center justify-between p-3.5 glass-nav-pill self-start md:sticky md:top-6 z-40 shrink-0">
      <div class="flex md:flex-col items-center gap-4 w-full">
        <button id="nav-home-btn" onclick="switchTab('subscriptions')" title="Dashboard Overview" class="w-12 h-12 rounded-2xl flex items-center justify-center text-white bg-blue-600 glow-blue transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
        </button>

        <button id="nav-subscriptions-btn" onclick="switchTab('subscriptions')" title="Subscriptions & License Codes" class="w-12 h-12 rounded-2xl flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
          </svg>
        </button>

        <button id="nav-content-btn" onclick="switchTab('content')" title="Content Studio (D1 CMS)" class="w-12 h-12 rounded-2xl flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
          </svg>
        </button>

        <button id="nav-progress-btn" onclick="switchTab('progress')" title="User Progress & Stats" class="w-12 h-12 rounded-2xl flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
          </svg>
        </button>
      </div>

      <div class="flex md:flex-col items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-amber-400 text-sm">
          ✦
        </div>
        <div class="text-[10px] font-semibold tracking-wider text-slate-400 uppercase hidden md:block">
          Admin ›
        </div>
      </div>
    </aside>

    <!-- MAIN WORKSPACE -->
    <main class="flex-1 flex flex-col gap-6">

      <!-- TOP BAR: Authentication & Live Session -->
      <header class="glass-card p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div class="flex items-center gap-3.5">
          <div class="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-cyan-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-lg font-bold text-white tracking-tight">Katzu Unified Control Plane</h1>
              <span id="session-badge" class="px-2 py-0.5 text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">Secret Required</span>
            </div>
            <p class="text-xs text-slate-400">KV Auth • D1 Content DB • Progress Telemetry • 14+ Gemini Multi-Key Engine</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <div class="relative flex-1 sm:w-72">
            <input id="admin-secret-input" type="password" placeholder="Enter ADMIN_SECRET..." autocomplete="off" class="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs font-mono text-cyan-300 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors">
            <button onclick="toggleSecretVisibility()" class="absolute right-3 top-2.5 text-slate-400 hover:text-white" title="Toggle Secret Visibility">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            </button>
          </div>
          <button onclick="applyAdminSecret()" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-xl text-xs font-semibold tracking-wide transition-all shadow-lg shadow-blue-500/20 active:scale-95">
            Authorize
          </button>
        </div>
      </header>

      <!-- HERO WIDGETS ROW -->
      <section class="grid grid-cols-1 md:grid-cols-12 gap-5">
        <div class="md:col-span-8 glass-card p-6 flex flex-col justify-between relative overflow-hidden group">
          <div class="flex items-start justify-between">
            <div>
              <span class="text-xs font-medium text-slate-400 tracking-wide uppercase">Unified Edge & AI Engine</span>
              <h2 class="text-2xl sm:text-3xl font-bold text-white mt-0.5 tracking-tight">Welcome, Administrator</h2>
              <p class="text-xs text-slate-400 mt-1">KV, D1 database, and 14+ Gemini AI round-robin router are live.</p>
            </div>
            <div class="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/80 text-xs font-mono text-cyan-300 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span id="live-clock">--:--:-- UTC</span>
            </div>
          </div>

          <div class="mt-8 pt-4 border-t border-slate-800/80 flex items-center justify-between relative">
            <svg class="w-full h-16 text-cyan-400" viewBox="0 0 500 80" fill="none" preserveAspectRatio="none">
              <defs>
                <linearGradient id="waveGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#2563eb" stop-opacity="0.3"/>
                  <stop offset="50%" stop-color="#38bdf8" stop-opacity="1"/>
                  <stop offset="100%" stop-color="#818cf8" stop-opacity="0.8"/>
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur"/>
                  <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <path d="M 0 55 C 80 55, 120 20, 180 35 C 240 50, 300 10, 360 30 C 420 50, 460 25, 500 40" stroke="url(#waveGlow)" stroke-width="3.5" filter="url(#glow)"/>
              <circle cx="180" cy="35" r="4" fill="#38bdf8" class="animate-ping" style="animation-duration: 3s;"/>
              <circle cx="180" cy="35" r="3" fill="#ffffff"/>
              <circle cx="360" cy="30" r="4" fill="#60a5fa"/>
            </svg>
          </div>
        </div>

        <div class="md:col-span-4 glass-card p-6 flex flex-col justify-between">
          <div class="flex items-start justify-between">
            <div>
              <div id="calendar-date" class="text-sm font-semibold text-white">Gemini Router Status</div>
              <div class="text-xs text-slate-400">Multi-Key Load Balancer</div>
            </div>
            <div class="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
              🤖
            </div>
          </div>

          <div class="my-4">
            <div class="flex items-center gap-3">
              <div class="text-3xl font-extrabold text-white tracking-tight">${keysCount} Keys</div>
              <div class="text-xs ${keysCount > 0 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20'} border px-2 py-0.5 rounded-lg">
                ${keysCount > 0 ? 'Active' : 'No Keys Set'}
              </div>
            </div>
            <div class="text-[11px] text-slate-400 mt-1">
              Cooling Down: <span class="text-amber-300 font-mono">${coolingCount}</span> keys
            </div>
          </div>

          <div class="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Route: <strong class="text-cyan-300">/ai/turn</strong></span>
            <span>Timeout: <strong class="text-slate-200">8s Fallback</strong></span>
          </div>
        </div>
      </section>

      <!-- TAB NAVIGATION BAR -->
      <nav class="flex items-center gap-2 p-1.5 glass-card self-start max-w-full overflow-x-auto">
        <button id="tab-btn-subscriptions" onclick="switchTab('subscriptions')" class="px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 bg-blue-600 text-white shadow-lg shadow-blue-600/30">
          <span>Subscriptions & Codes</span>
        </button>
        <button id="tab-btn-content" onclick="switchTab('content')" class="px-5 py-2.5 rounded-2xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all flex items-center gap-2">
          <span>Content Studio (D1 CMS)</span>
        </button>
        <button id="tab-btn-progress" onclick="switchTab('progress')" class="px-5 py-2.5 rounded-2xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all flex items-center gap-2">
          <span>User Progress Telemetry</span>
        </button>
      </nav>

      <!-- TAB 1: SUBSCRIPTIONS & LICENSE GENERATION -->
      <section id="tab-view-subscriptions" class="space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-7 glass-card p-6 flex flex-col gap-5">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-bold text-white">Subscription Directory</h3>
                <p class="text-xs text-slate-400">Search by user email to inspect expiration or modify status.</p>
              </div>
              <span class="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-800 text-cyan-300">KV: email_index</span>
            </div>

            <div class="flex items-center gap-2">
              <input id="sub-lookup-email" type="email" placeholder="student@example.com" class="flex-1 bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400">
              <button onclick="lookupSubscription()" class="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold transition-all">
                Lookup User
              </button>
            </div>

            <div id="sub-result-card" class="hidden p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <span id="sub-display-email" class="text-sm font-bold text-white"></span>
                  <div id="sub-display-sub" class="text-[11px] font-mono text-slate-400 mt-0.5"></div>
                </div>
                <span id="sub-display-status-pill" class="px-3 py-1 rounded-full text-xs font-bold"></span>
              </div>

              <div class="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800/80 text-xs">
                <div>
                  <span class="text-slate-400">Expires At:</span>
                  <div id="sub-display-expires" class="font-mono text-slate-200 mt-0.5">-</div>
                </div>
                <div>
                  <span class="text-slate-400">Active Access:</span>
                  <div id="sub-display-active" class="font-semibold text-slate-200 mt-0.5">-</div>
                </div>
              </div>

              <div class="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                <button onclick="revokeSubscription()" class="px-3.5 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl text-xs font-semibold transition-all">
                  Revoke Immediately
                </button>

                <div class="flex items-center gap-2">
                  <button onclick="quickAddMonths(1)" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg text-slate-200">+1 Mo</button>
                  <button onclick="quickAddMonths(3)" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg text-slate-200">+3 Mo</button>
                  <button onclick="quickAddMonths(12)" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg text-slate-200">+1 Yr</button>
                </div>
              </div>

              <div class="pt-3 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-[11px] text-slate-400 mb-1">Set Exact ISO Expiration</label>
                  <div class="flex gap-1.5">
                    <input id="sub-edit-exact-date" type="datetime-local" class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200">
                    <button onclick="saveExactExpiry()" class="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold text-white">Set</button>
                  </div>
                </div>
                <div>
                  <label class="block text-[11px] text-slate-400 mb-1">Add / Subtract Months</label>
                  <div class="flex gap-1.5">
                    <input id="sub-edit-delta-months" type="number" placeholder="e.g. 6 or -2" class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200">
                    <button onclick="saveDeltaMonths()" class="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold text-white">Apply</button>
                  </div>
                </div>
              </div>
            </div>
            <div id="sub-empty-state" class="py-12 text-center text-xs text-slate-500">
              Search a user email above to review active subscription terms.
            </div>
          </div>

          <div class="lg:col-span-5 glass-card p-6 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-base font-bold text-white">License Key Forge</h3>
                  <p class="text-xs text-slate-400">Generates HMAC-signed <code class="text-cyan-300">DE-[X]M-NONCE-SIG</code></p>
                </div>
                <div class="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 text-xs">
                  HMAC
                </div>
              </div>

              <div class="my-6 flex flex-col items-center justify-center">
                <div class="relative w-44 h-44 flex items-center justify-center">
                  <svg class="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.06)" stroke-width="6" fill="transparent"/>
                    <circle id="generator-ring" cx="50" cy="50" r="42" stroke="url(#timerGrad)" stroke-width="6" stroke-dasharray="264" stroke-dashoffset="66" stroke-linecap="round" fill="transparent"/>
                    <defs>
                      <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#f59e0b"/>
                        <stop offset="50%" stop-color="#ef4444"/>
                        <stop offset="100%" stop-color="#8b5cf6"/>
                      </linearGradient>
                    </defs>
                  </svg>
                  <div class="absolute flex flex-col items-center">
                    <span id="generator-months-display" class="text-3xl font-extrabold text-white">6</span>
                    <span class="text-[11px] uppercase tracking-wider text-slate-400">Months</span>
                  </div>
                </div>

                <div class="w-full mt-4 px-4">
                  <input id="generator-months-slider" type="range" min="1" max="12" value="6" oninput="updateGeneratorSlider(this.value)" class="w-full accent-cyan-400 cursor-pointer">
                  <div class="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>1M</span>
                    <span>3M</span>
                    <span>6M</span>
                    <span>12M</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <button onclick="generateAdminCode()" class="w-full py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:opacity-95 text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-lg shadow-indigo-500/25 active:scale-98 flex items-center justify-center gap-2">
                <span>⚡ Generate Signed Code</span>
              </button>

              <div id="generated-code-box" class="hidden p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span id="generated-code-text" class="text-xs font-mono text-cyan-300 select-all font-semibold"></span>
                <button onclick="copyGeneratedCode()" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded text-slate-300 transition-colors">
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- TAB 2: CONTENT STUDIO (D1 CMS) -->
      <section id="tab-view-content" class="hidden space-y-6">
        <div class="glass-card p-6 space-y-6">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="flex p-1 rounded-xl bg-slate-900 border border-slate-800">
                <button onclick="selectContentType('scenarios')" id="type-btn-scenarios" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white transition-all">Scenarios</button>
                <button onclick="selectContentType('vocabulary')" id="type-btn-vocabulary" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all">Vocabulary</button>
                <button onclick="selectContentType('grammar')" id="type-btn-grammar" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all">Grammar</button>
                <button onclick="selectContentType('starter_phrases')" id="type-btn-starter_phrases" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all">Phrases</button>
              </div>
              <span id="content-row-count" class="text-xs font-mono text-slate-400">0 rows</span>
            </div>

            <div class="flex items-center gap-2">
              <button onclick="openContentCreateModal()" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all">
                <span>+ Add Row</span>
              </button>
              <button onclick="openBulkUploadModal()" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all">
                Bulk Upload JSON
              </button>
            </div>
          </div>

          <div class="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950/60">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[10px] font-mono border-b border-slate-800">
                <tr id="content-table-head">
                  <th class="py-3 px-4">ID</th>
                  <th class="py-3 px-4">Details</th>
                  <th class="py-3 px-4">Level</th>
                  <th class="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="content-table-body" class="divide-y divide-slate-900/80 text-slate-300">
                <tr>
                  <td colspan="4" class="py-12 text-center text-slate-500">Loading catalog from D1 database...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 3: USER PROGRESS TELEMETRY -->
      <section id="tab-view-progress" class="hidden space-y-6">
        <div class="glass-card p-6 space-y-6">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div>
              <h3 class="text-base font-bold text-white">Learner Progress Dashboard</h3>
              <p class="text-xs text-slate-400">Inspect and update points, streaks, level status, and training records.</p>
            </div>
            <div class="flex items-center gap-2">
              <input id="progress-lookup-email" type="email" placeholder="student@example.com" class="w-64 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400">
              <button onclick="lookupUserProgress()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all">
                Inspect
              </button>
            </div>
          </div>

          <div id="progress-display-container" class="hidden space-y-6">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span class="text-[11px] text-slate-400 uppercase tracking-wider">CEFR Level</span>
                <div id="prog-stat-level" class="text-2xl font-bold text-cyan-400 mt-1">A1</div>
              </div>
              <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span class="text-[11px] text-slate-400 uppercase tracking-wider">Streak</span>
                <div id="prog-stat-streak" class="text-2xl font-bold text-amber-400 mt-1">0 Days</div>
              </div>
              <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span class="text-[11px] text-slate-400 uppercase tracking-wider">Total Points</span>
                <div id="prog-stat-points" class="text-2xl font-bold text-indigo-400 mt-1">0</div>
              </div>
              <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span class="text-[11px] text-slate-400 uppercase tracking-wider">Last Active</span>
                <div id="prog-stat-last-active" class="text-sm font-semibold text-slate-300 mt-2 truncate">-</div>
              </div>
            </div>

            <div class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-300">Raw Progress Object (Editable)</span>
                <button onclick="saveEditedProgress()" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-all">
                  Save Progress Changes
                </button>
              </div>
              <textarea id="progress-json-editor" rows="9" class="w-full bg-slate-950 font-mono text-xs text-cyan-300 p-3.5 rounded-xl border border-slate-800 focus:outline-none focus:border-cyan-400"></textarea>
            </div>
          </div>

          <div id="progress-empty-state" class="py-12 text-center text-xs text-slate-500">
            Enter learner email above to view and adjust their synced progress telemetry.
          </div>
        </div>
      </section>
    </main>
  </div>

  <!-- MODAL: CREATE / EDIT CONTENT ROW -->
  <div id="content-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
    <div class="w-full max-w-lg glass-card p-6 space-y-4 border border-slate-700">
      <div class="flex items-center justify-between">
        <h4 id="content-modal-title" class="text-base font-bold text-white">Edit Record</h4>
        <button onclick="closeContentModal()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <div class="space-y-3">
        <label class="block text-xs text-slate-400">JSON Fields</label>
        <textarea id="content-modal-json" rows="10" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-400"></textarea>
      </div>
      <div class="flex items-center justify-end gap-2 pt-2">
        <button onclick="closeContentModal()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs">Cancel</button>
        <button onclick="submitContentModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold">Save Record</button>
      </div>
    </div>
  </div>

  <!-- MODAL: BULK UPLOAD JSON -->
  <div id="bulk-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4">
    <div class="w-full max-w-xl glass-card p-6 space-y-4 border border-slate-700">
      <div class="flex items-center justify-between">
        <h4 class="text-base font-bold text-white">Bulk Upload Content (/admin/upload)</h4>
        <button onclick="closeBulkModal()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <p class="text-xs text-slate-400">Paste an array of row objects. Scenarios and grammar upsert by ID; vocabulary and starter_phrases perform plain insert.</p>
      <textarea id="bulk-json-input" rows="10" placeholder='[{"id":"scenario_1","title_de":"Im Cafe","title_ar":"في المقهى"}]' class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-400"></textarea>
      <div class="flex items-center justify-end gap-2 pt-2">
        <button onclick="closeBulkModal()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs">Cancel</button>
        <button onclick="submitBulkUpload()" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold">Upload Batch</button>
      </div>
    </div>
  </div>

  <!-- CLIENT INTERACTION SCRIPT -->
  <script>
    var inMemoryAdminSecret = "";
    var currentActiveTab = "subscriptions";
    var currentContentType = "scenarios";
    var editingRowId = null;
    var currentLoadedSubData = null;
    var currentLoadedProgressEmail = null;

    function showToast(message, type) {
      var container = document.getElementById("toast-container");
      if (!container) return;
      var toast = document.createElement("div");
      var isError = type === "error";
      var isSuccess = type === "success";
      var bgClass = isError ? "bg-red-500/90 border-red-400" : (isSuccess ? "bg-emerald-500/90 border-emerald-400" : "bg-slate-900/95 border-cyan-500/50");
      toast.className = "px-4 py-3 rounded-2xl text-xs font-medium text-white shadow-2xl border backdrop-blur-md pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0 " + bgClass;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(function() {
        toast.classList.remove("translate-y-2", "opacity-0");
      }, 10);
      setTimeout(function() {
        toast.classList.add("opacity-0", "-translate-y-2");
        setTimeout(function() {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
      }, 3500);
    }

    function updateClock() {
      var d = new Date();
      var el = document.getElementById("live-clock");
      if (el) el.textContent = d.toUTCString().slice(17, 25) + " UTC";
      var cal = document.getElementById("calendar-date");
      if (cal) cal.textContent = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    setInterval(updateClock, 1000);
    updateClock();

    function toggleSecretVisibility() {
      var inp = document.getElementById("admin-secret-input");
      inp.type = inp.type === "password" ? "text" : "password";
    }

    function applyAdminSecret() {
      var val = document.getElementById("admin-secret-input").value.trim();
      if (!val) {
        showToast("Please enter the ADMIN_SECRET", "error");
        return;
      }
      inMemoryAdminSecret = val;
      var b = document.getElementById("session-badge");
      b.textContent = "Authorized Session";
      b.className = "px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full";
      showToast("Session authorized successfully", "success");
      if (currentActiveTab === "content") {
        loadContentCatalog();
      }
    }

    function getAuthHeaders() {
      var h = { "Content-Type": "application/json" };
      if (inMemoryAdminSecret) {
        h["Authorization"] = "Bearer " + inMemoryAdminSecret;
      }
      return h;
    }

    function switchTab(tabId) {
      currentActiveTab = tabId;
      var tabs = ["subscriptions", "content", "progress"];
      for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i];
        var view = document.getElementById("tab-view-" + t);
        var btn = document.getElementById("tab-btn-" + t);
        var navBtn = document.getElementById("nav-" + t + "-btn");

        if (t === tabId) {
          if (view) view.classList.remove("hidden");
          if (btn) {
            btn.className = "px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 bg-blue-600 text-white shadow-lg shadow-blue-600/30";
          }
          if (navBtn) {
            navBtn.className = "w-12 h-12 rounded-2xl flex items-center justify-center text-cyan-400 bg-slate-800/80 border border-cyan-500/30 glow-cyan transition-all";
          }
        } else {
          if (view) view.classList.add("hidden");
          if (btn) {
            btn.className = "px-5 py-2.5 rounded-2xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all flex items-center gap-2";
          }
          if (navBtn) {
            navBtn.className = "w-12 h-12 rounded-2xl flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 transition-all";
          }
        }
      }
      if (tabId === "content") {
        loadContentCatalog();
      }
    }

    async function lookupSubscription() {
      var email = document.getElementById("sub-lookup-email").value.trim();
      if (!email) {
        showToast("Enter email to search", "error");
        return;
      }
      try {
        var res = await fetch("/admin/lookup", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: email })
        });
        var data = await res.json();
        if (res.status === 401) {
          showToast("Unauthorized: check ADMIN_SECRET", "error");
          return;
        }
        if (!data.found) {
          showToast("User not found or has not redeemed a license yet.", "error");
          document.getElementById("sub-result-card").classList.add("hidden");
          document.getElementById("sub-empty-state").classList.remove("hidden");
          return;
        }
        currentLoadedSubData = data;
        document.getElementById("sub-empty-state").classList.add("hidden");
        var c = document.getElementById("sub-result-card");
        c.classList.remove("hidden");

        document.getElementById("sub-display-email").textContent = data.email;
        document.getElementById("sub-display-sub").textContent = "Account Sub: " + data.sub;
        document.getElementById("sub-display-expires").textContent = data.expiresAt || "Never";
        document.getElementById("sub-display-active").textContent = data.active ? "True (Active)" : "False (Expired)";

        var pill = document.getElementById("sub-display-status-pill");
        if (data.active) {
          pill.textContent = "ACTIVE";
          pill.className = "px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
        } else {
          pill.textContent = "EXPIRED";
          pill.className = "px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30";
        }
        showToast("Found user record", "success");
      } catch (e) {
        showToast("Lookup failed: " + e, "error");
      }
    }

    async function revokeSubscription() {
      if (!currentLoadedSubData) return;
      try {
        var res = await fetch("/admin/revoke", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: currentLoadedSubData.email })
        });
        var data = await res.json();
        if (data.success) {
          showToast("Access revoked immediately", "success");
          lookupSubscription();
        } else {
          showToast("Revocation failed: " + JSON.stringify(data), "error");
        }
      } catch (e) {
        showToast("Error: " + e, "error");
      }
    }

    async function quickAddMonths(m) {
      if (!currentLoadedSubData) return;
      try {
        var res = await fetch("/admin/edit", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: currentLoadedSubData.email, add_months: m })
        });
        var data = await res.json();
        if (data.success) {
          showToast("Extended by " + m + " months", "success");
          lookupSubscription();
        } else {
          showToast("Extension failed", "error");
        }
      } catch (e) {
        showToast("Error: " + e, "error");
      }
    }

    async function saveExactExpiry() {
      if (!currentLoadedSubData) return;
      var val = document.getElementById("sub-edit-exact-date").value;
      if (!val) {
        showToast("Select date/time", "error");
        return;
      }
      var iso = new Date(val).toISOString();
      try {
        var res = await fetch("/admin/edit", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: currentLoadedSubData.email, set_expiresAt: iso })
        });
        var data = await res.json();
        if (data.success) {
          showToast("Expiration updated", "success");
          lookupSubscription();
        } else {
          showToast("Update failed", "error");
        }
      } catch (e) {
        showToast("Error: " + e, "error");
      }
    }

    async function saveDeltaMonths() {
      if (!currentLoadedSubData) return;
      var val = parseInt(document.getElementById("sub-edit-delta-months").value, 10);
      if (isNaN(val)) {
        showToast("Enter valid integer", "error");
        return;
      }
      quickAddMonths(val);
    }

    function updateGeneratorSlider(val) {
      document.getElementById("generator-months-display").textContent = val;
      var ring = document.getElementById("generator-ring");
      var pct = (parseInt(val, 10) / 12);
      var offset = 264 - (264 * pct);
      ring.style.strokeDashoffset = offset;
    }

    async function generateAdminCode() {
      var months = parseInt(document.getElementById("generator-months-slider").value, 10);
      try {
        var res = await fetch("/admin/generate", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ months: months })
        });
        var data = await res.json();
        if (res.status === 401) {
          showToast("Unauthorized: check ADMIN_SECRET", "error");
          return;
        }
        if (data.code) {
          document.getElementById("generated-code-box").classList.remove("hidden");
          document.getElementById("generated-code-text").textContent = data.code;
          showToast("Generated code: " + data.code, "success");
        } else {
          showToast("Generation failed", "error");
        }
      } catch (e) {
        showToast("Error: " + e, "error");
      }
    }

    function copyGeneratedCode() {
      var code = document.getElementById("generated-code-text").textContent;
      if (!code) return;
      var t = document.createElement("textarea");
      t.value = code;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
      showToast("Copied: " + code, "success");
    }

    function selectContentType(type) {
      currentContentType = type;
      var types = ["scenarios", "vocabulary", "grammar", "starter_phrases"];
      for (var i = 0; i < types.length; i++) {
        var b = document.getElementById("type-btn-" + types[i]);
        if (types[i] === type) {
          b.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white transition-all";
        } else {
          b.className = "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all";
        }
      }
      loadContentCatalog();
    }

    async function loadContentCatalog() {
      var tbody = document.getElementById("content-table-body");
      tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-500">Querying D1 ' + currentContentType + '...</td></tr>';
      try {
        var res = await fetch("/admin/" + currentContentType, {
          method: "GET",
          headers: getAuthHeaders()
        });
        if (res.status === 401) {
          tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-amber-400">Please enter and authorize ADMIN_SECRET above</td></tr>';
          return;
        }
        var rows = await res.json();
        document.getElementById("content-row-count").textContent = rows.length + " rows";
        if (!Array.isArray(rows) || rows.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-500">No records found in table ' + currentContentType + '</td></tr>';
          return;
        }

        var quote = String.fromCharCode(39);
        var html = "";
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var idVal = r.id;

          var details = "";
          if (currentContentType === "scenarios") {
            details = r.title_de;
          } else if (currentContentType === "vocabulary") {
            details = r.german;
          } else if (currentContentType === "grammar") {
            details = r.title_en || r.title_ar;
          } else if (currentContentType === "starter_phrases") {
            details = r.german;
          }
          if (!details) {
            details = JSON.stringify(r).slice(0, 45);
          }

          var levelVal = r.level || "-";
          var badgeColor = "bg-slate-800 text-slate-300";
          if (levelVal === "A1") badgeColor = "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
          if (levelVal === "A2") badgeColor = "bg-blue-500/20 text-blue-300 border border-blue-500/30";
          if (levelVal === "B1") badgeColor = "bg-amber-500/20 text-amber-300 border border-amber-500/30";
          if (levelVal === "B2") badgeColor = "bg-purple-500/20 text-purple-300 border border-purple-500/30";

          html += '<tr class="hover:bg-slate-900/60 transition-colors">';
          html += '<td class="py-3 px-4 font-mono text-cyan-400">' + idVal + '</td>';
          html += '<td class="py-3 px-4 text-slate-200 font-medium">' + details + '</td>';
          html += '<td class="py-3 px-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold ' + badgeColor + '">' + levelVal + '</span></td>';
          html += '<td class="py-3 px-4 text-right space-x-2">';
          html += '<button onclick="openContentEditModal(' + quote + idVal + quote + ')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs">Edit</button>';
          html += '<button onclick="deleteContentRow(' + quote + idVal + quote + ')" class="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-xs">Delete</button>';
          html += '</td>';
          html += '</tr>';
        }
        tbody.innerHTML = html;
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-red-400">Failed to load: ' + e + '</td></tr>';
      }
    }

    async function openContentEditModal(id) {
      editingRowId = id;
      document.getElementById("content-modal-title").textContent = "Edit " + currentContentType + " #" + id;
      try {
        var res = await fetch("/admin/" + currentContentType + "/" + id, {
          method: "GET",
          headers: getAuthHeaders()
        });
        var row = await res.json();
        document.getElementById("content-modal-json").value = JSON.stringify(row, null, 2);
        document.getElementById("content-modal").classList.remove("hidden");
      } catch (e) {
        showToast("Error fetching row: " + e, "error");
      }
    }

    function openContentCreateModal() {
      editingRowId = null;
      document.getElementById("content-modal-title").textContent = "Add New " + currentContentType;
      var template;
      if (currentContentType === "scenarios") {
        template = {
          id: "scenario_" + Date.now(),
          title_de: "",
          title_ar: "",
          ai_persona: "",
          category: "",
          icon: "",
          initial_message_a1: "",
          initial_message_a2: "",
          initial_message_b1: "",
          initial_message_b2: ""
        };
      } else if (currentContentType === "vocabulary") {
        template = {
          german: "",
          article: "",
          plural: "",
          part_of_speech: "",
          translation_ar: "",
          translation_en: "",
          example_de: "",
          example_ar: "",
          example_en: "",
          level: "A1",
          topic: ""
        };
      } else if (currentContentType === "grammar") {
        template = {
          id: "rule_" + Date.now(),
          level: "A1",
          title_ar: "",
          title_en: "",
          explanation_ar: "",
          explanation_en: "",
          example_de: ""
        };
      } else {
        template = {
          scenario_id: "",
          level: "A1",
          german: "",
          translation_en: "",
          translation_ar: "",
          sort_order: 1
        };
      }

      document.getElementById("content-modal-json").value = JSON.stringify(template, null, 2);
      document.getElementById("content-modal").classList.remove("hidden");
    }

    function closeContentModal() {
      document.getElementById("content-modal").classList.add("hidden");
    }

    async function submitContentModal() {
      var raw = document.getElementById("content-modal-json").value;
      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        showToast("Invalid JSON format", "error");
        return;
      }

      try {
        var url = editingRowId 
          ? "/admin/" + currentContentType + "/" + editingRowId
          : "/admin/" + currentContentType;
        var method = editingRowId ? "PUT" : "POST";

        var res = await fetch(url, {
          method: method,
          headers: getAuthHeaders(),
          body: JSON.stringify(parsed)
        });
        var data = await res.json();
        if (res.ok) {
          closeContentModal();
          showToast("Record saved successfully", "success");
          loadContentCatalog();
        } else {
          showToast("Error: " + JSON.stringify(data), "error");
        }
      } catch (e) {
        showToast("Save failed: " + e, "error");
      }
    }

    async function deleteContentRow(id) {
      try {
        var res = await fetch("/admin/" + currentContentType + "/" + id, {
          method: "DELETE",
          headers: getAuthHeaders()
        });
        if (res.ok) {
          showToast("Record deleted", "success");
          loadContentCatalog();
        } else {
          showToast("Delete failed", "error");
        }
      } catch (e) {
        showToast("Error: " + e, "error");
      }
    }

    function openBulkModal() {
      document.getElementById("bulk-modal").classList.remove("hidden");
    }
    function closeBulkModal() {
      document.getElementById("bulk-modal").classList.add("hidden");
    }
    async function submitBulkUpload() {
      var raw = document.getElementById("bulk-json-input").value;
      var rows;
      try {
        rows = JSON.parse(raw);
      } catch (e) {
        showToast("Invalid JSON. Must be an array of objects.", "error");
        return;
      }
      try {
        var res = await fetch("/admin/upload", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ contentType: currentContentType, rows: rows })
        });
        var data = await res.json();
        if (data.success) {
          showToast("Uploaded " + data.count + " rows", "success");
          closeBulkModal();
          loadContentCatalog();
        } else {
          showToast("Upload error: " + JSON.stringify(data), "error");
        }
      } catch (e) {
        showToast("Upload error: " + e, "error");
      }
    }

    async function lookupUserProgress() {
      var email = document.getElementById("progress-lookup-email").value.trim();
      if (!email) {
        showToast("Enter learner email", "error");
        return;
      }
      try {
        var res = await fetch("/admin/progress-lookup", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: email })
        });
        var data = await res.json();
        if (res.status === 401) {
          showToast("Unauthorized: check ADMIN_SECRET", "error");
          return;
        }
        if (data.error) {
          showToast("User error: " + data.error, "error");
          return;
        }

        currentLoadedProgressEmail = email;
        document.getElementById("progress-empty-state").classList.add("hidden");
        document.getElementById("progress-display-container").classList.remove("hidden");

        var stats = data.stats || {};
        document.getElementById("prog-stat-level").textContent = stats.level || "A1";
        document.getElementById("prog-stat-streak").textContent = (stats.streak_days || 0) + " Days";
        document.getElementById("prog-stat-points").textContent = stats.total_points || 0;
        document.getElementById("prog-stat-last-active").textContent = stats.last_active_date || "Never";

        document.getElementById("progress-json-editor").value = JSON.stringify(data, null, 2);
        showToast("Loaded learner progress", "success");
      } catch (e) {
        showToast("Lookup failed: " + e, "error");
      }
    }

    async function saveEditedProgress() {
      if (!currentLoadedProgressEmail) return;
      var raw = document.getElementById("progress-json-editor").value;
      var obj;
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        showToast("Invalid JSON in editor", "error");
        return;
      }
      try {
        var res = await fetch("/admin/progress-edit", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: currentLoadedProgressEmail, progress: obj })
        });
        var data = await res.json();
        if (data.success) {
          showToast("Progress saved successfully", "success");
          lookupUserProgress();
        } else {
          showToast("Save error: " + JSON.stringify(data), "error");
        }
      } catch (e) {
        showToast("Error saving progress: " + e, "error");
      }
    }

    window.switchTab = switchTab;
    window.toggleSecretVisibility = toggleSecretVisibility;
    window.applyAdminSecret = applyAdminSecret;
    window.lookupSubscription = lookupSubscription;
    window.revokeSubscription = revokeSubscription;
    window.quickAddMonths = quickAddMonths;
    window.saveExactExpiry = saveExactExpiry;
    window.saveDeltaMonths = saveDeltaMonths;
    window.updateGeneratorSlider = updateGeneratorSlider;
    window.generateAdminCode = generateAdminCode;
    window.copyGeneratedCode = copyGeneratedCode;
    window.selectContentType = selectContentType;
    window.loadContentCatalog = loadContentCatalog;
    window.openContentEditModal = openContentEditModal;
    window.openContentCreateModal = openContentCreateModal;
    window.closeContentModal = closeContentModal;
    window.submitContentModal = submitContentModal;
    window.deleteContentRow = deleteContentRow;
    window.openBulkModal = openBulkModal;
    window.closeBulkModal = closeBulkModal;
    window.submitBulkUpload = submitBulkUpload;
    window.lookupUserProgress = lookupUserProgress;
    window.saveEditedProgress = saveEditedProgress;
    window.showToast = showToast;
  </script>
</body>
</html>`;
}
