/**
 * Unified Cloudflare Worker: auth, D1 content CMS, admin dashboard, and the
 * multi-provider AI engine (Gemini · Groq · OpenRouter · NVIDIA NIM, with Workers
 * AI as the last resort).
 * 
 * Bindings required / supported (authoritative list and comments: wrangler.toml):
 * - REDEEMED_CODES (KV): activation codes, accounts, email index
 * - USER_PROGRESS (KV): progress, authoritative AI trial quota, AI pool ledger,
 *   shared AI cache
 * - DB (D1 Database): content CMS + user registry
 * - AI: Workers AI binding, the fallback once the whole pool is parked
 * - ADMIN_SECRET, HMAC_SECRET (Secrets)
 * - GOOGLE_CLIENT_ID (a var, not a secret: it ships to every browser anyway, and
 *   living in git is what makes the `aud` enforcement reviewable)
 * - AI PROVIDER KEY LISTS (Secrets, read by ./cloudflare-ai-router.js, which owns
 *   the pool, the terminal day-quota ledger and the tier rotation). Same
 *   comma/semicolon/newline-separated key list for all four:
 *     GEMINI_API_KEYS     (also accepts GEMINI_API_KEY / GEMINI_API_KEY_n, plus
 *                          the legacy GEMINI_KEY / GEMINI_KEY_n names)
 *     GROQ_API_KEYS · OPENROUTER_API_KEYS · NVIDIA_API_KEYS
 *   An unset or empty list is skipped and reported as `no_keys` in /health — never
 *   an error, never a failed learner request.
 * - NOWPAYMENTS_API_KEY + NOWPAYMENTS_IPN_SECRET (crypto sales on the separate
 *   sales site). There is no card-billing provider: Dodo was closed for this
 *   account (docs/LAUNCH-CHECKLIST.md §2.1) and its module, routes and
 *   configuration were removed, so an activation code is bought with crypto or
 *   minted in the admin dashboard after a local payment.
 *
 * The admin control plane (user registry, telemetry, dashboard) lives in
 * ./cloudflare-admin.js. Measured: the edit tooling applied diffs to this file
 * reliably up to ~48 KB of byte offset (16329, 18106, 37419, 48404 all fine)
 * but failed with "old string not found" on grep-verified unique anchors at
 * 63195, 77597 and 82988 — which is exactly where the admin handlers sat.
 * Re-measured 2026-09-26: anchors at 62186 bytes (the legacy walker's head) and
 * 60178 bytes (a helper body) both failed too, so treat ~48 KB as the real
 * boundary and put new logic in a sibling module instead of retrying.
 * Wrangler bundles the imports below into the single deployed worker.
 */

// AI surface: chat turn + translation (cloudflare-ai-chat.js), hints
// (cloudflare-hints.js), writing (cloudflare-writing.js). Routing between
// providers lives in cloudflare-ai-router.js — see its header for why the
// Gemini-only walker below is no longer reached by any route.
import { handleHintsRoute } from "./cloudflare-hints.js";
import { handleWritingRoute } from "./cloudflare-writing.js";
import { handleAskRoute } from "./cloudflare-ask.js";
import { handleChatTurnRoute, handleTranslateRoute } from "./cloudflare-ai-chat.js";
import { validateGermanAgainstLevel, levelFallbackLine, levelConstraintLine, correctionBudgetFor } from "./cloudflare-level-spec.js";
import { handleTranscribeRoute } from "./cloudflare-stt.js";
import { deriveConversationBeats } from "./cloudflare-conversation-beats.js";
import {
  PROVIDER_POOL,
  callAiRouter,
  getPoolHealth,
  hasUsableProvider,
  inspectProviderKeys,
  latencySnapshot,
  readAiCache,
  routerCountersSnapshot,
  writeAiCache,
} from "./cloudflare-ai-router.js";
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

// Crypto sales (NOWPayments): the separate sales site's checkout plus its
// signature-verified IPN. Nothing here is called by the app — a buyer redeems
// their code in-app through /verify, which is what keeps one payment path (and one
// secret) out of the PWA entirely.
import { handleCryptoRoutes, timingSafeEqualHex } from "./cloudflare-crypto.js";
import { ensureContentColumns } from "./cloudflare-content-schema.js";
import { mockExamBrief, mockExamInstructionForPart } from "./cloudflare-mock-exam.js";
import { decideMockAccess, mockDebriefAccess, catalogueFor, experimentBucket, isRegionMismatch, regionGroupFromRequest, PASS_CELLS } from "./cloudflare-pricing.js";
import { dailyKey, processDailySync, readAuthoritativeDaily, overlayStatsWithDaily } from "./cloudflare-daily.js";

// ============================================================================
// AI ROUTER CONFIGURATION & STATE (HIGH-PERFORMANCE & RELIABILITY ENGINE)
// ============================================================================

// LEGACY-ONLY STATE. Every AI route now goes through the provider pool
// (cloudflare-ai-router.js), so what follows survives for one reason only: the old
// Gemini walker's body and the old translation/hints handlers still reference it,
// and those bodies sit at byte ~62–67 KB — past the edit boundary this file's
// header documents — so they could not be deleted in the same change. No live path
// reads them, and nothing new may start to.
//
// `DEFAULT_MODEL_CHAIN` is a *projection* of PROVIDER_POOL, never a hand-written
// list: the pool is the single source of truth, so a model removed from the pool
// disappears from the chain with it. The pool no longer contains
// gemini-flash-latest (not a published endpoint) or the access-restricted
// gemini-2.5-* models, so no path can call them again.
const DEFAULT_MODEL_CHAIN = PROVIDER_POOL
  .filter((entry) => entry.provider === "gemini")
  .map((entry) => entry.model);

let primaryWorkingModel = null; // pinned by the router's onModel hook, read by /health
let requestCounter = 0; // LEGACY: the old walker's key rotation only
const keyCooldownMap = new Map(); // key -> cooldownExpiryTimestamp (router deps)
const keyConsecutiveFails = new Map(); // key -> consecutive fail count
const translationCache = new Map(); // LEGACY: the live cache is KV-backed
const hintsCache = new Map(); // LEGACY: the live cache is KV-backed
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

/**
 * Gemini key inspection. The generalized parser lives in ./cloudflare-ai-router.js
 * and is shared by all four providers; this is its Gemini projection, kept so the
 * internal health report and the legacy admin dashboard keep working. The legacy
 * GEMINI_KEY_n aliases are the only Gemini-specific part.
 */
function inspectGeminiKeys(env) {
  return inspectProviderKeys(env, "GEMINI_API_KEYS", { extraPatterns: [/^GEMINI_KEY$/i, /^GEMINI_KEY_\d+$/i] });
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
  // `users` and `activity_log` are part of the same lazily-created batch, and both
  // writers below swallow their own failures on purpose (telemetry must never
  // break a sign-in) — so without this a brand-new account's registry row was
  // lost silently on a fresh database.
  await ensureLedgerTablesOnce(env);
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

  // 2. Trial access: restricted to the beginner floor (A0/A1) with a server-side quota.
  // A0 is free by V21 Phase 1: a learner the placement measured at A0 gets A0
  // conversations — serving them A1 they were measured below would defeat the check.
  // `skipLevelGate` is the B1 mock: its grant is minted by `/mock/start` and is
  // metered by the MOCK entitlement (one free mock, then a credit or a
  // subscription), not by this level floor. It is never client-set.
  const level = (cefrLevel || "A1").toUpperCase();
  if (!options.skipLevelGate && level !== "A1" && level !== "A0") {
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
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_lesson_payouts (
        invited_account_id TEXT PRIMARY KEY,
        inviter_account_id TEXT NOT NULL,
        awarded_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS rate_limit_counters (
        counter_id TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL
      )`),
      // Progress-sync concurrency guard (launch-gate 1.5): one monotonic
      // revision AND the authoritative merged payload per user. KV has no
      // compare-and-swap, so a KV-only read-merge-write lets racing devices
      // drop each other's writes. Here the merged payload is committed in the
      // same D1 statement that advances the revision — D1's conditional update
      // is the atomic commit gate, and KV is only a read cache.
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS sync_revisions (
        user_id TEXT PRIMARY KEY,
        rev INTEGER NOT NULL,
        payload TEXT
      )`),
      // V24 Phase 6: teacher/cohort code tracking. One row per minted code with
      // its optional label; activation comes from redeemed_codes_ledger, so
      // "created vs activated per label" is one read-only join.
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS generated_codes (
        code TEXT PRIMARY KEY,
        months INTEGER NOT NULL,
        label TEXT,
        created_at TEXT NOT NULL
      )`),
      // B3: the free B1 mock. ONE row per account, claimed by inserting it —
      // the same exactly-once trick the code ledger uses, so two devices racing
      // the first mock cannot both get it free. `sessions` records every mock
      // start (free, credit or subscription) keyed by the client session id, so
      // a retry after a dropped connection replays the same decision instead of
      // spending a second credit.
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS mock_free_claims (
        account_id TEXT PRIMARY KEY,
        claimed_at INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS mock_sessions (
        account_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        source TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, session_id)
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

/**
 * `ensureLedgerTables` once per isolate, for routes that must be able to create
 * their own tables before their first statement (V8-F0 / V9-1).
 *
 * WHY IT EXISTS
 * The lazy tables (`sync_revisions`, `rate_limit_counters`, `users`,
 * `activity_log`, `error_reports`, …) used to be created only as a side effect of
 * redeeming an activation code, so any other route against a fresh database hit a
 * table that did not exist. The sync path was the visible one: its conditional
 * UPDATE threw `no such table: sync_revisions`, which the Worker reported as a
 * bare 500 — and the failure could not even be recorded, because `error_reports`
 * did not exist either.
 *
 * Creating them is idempotent but not free (five CREATE TABLE IF NOT EXISTS
 * statements plus the registry batch) and some callers are hot (every AI turn runs
 * a rate-limit check), so the SUCCESS is memoized. A failed attempt is deliberately
 * not memoized: the next request retries instead of spending the isolate's whole
 * life with no tables.
 *
 * The memo is keyed on the D1 binding itself rather than a module-level boolean,
 * so "the tables exist" can never be carried across two different databases — the
 * boolean version made a second, still-empty database look ready simply because an
 * earlier request had used a different one.
 */
const ledgerTablesReady = new WeakMap();
function ensureLedgerTablesOnce(env) {
  const db = env?.DB;
  if (!db) return Promise.resolve(false);
  const memo = ledgerTablesReady.get(db);
  if (memo) return memo;
  const attempt = ensureLedgerTables(env).catch(() => false);
  ledgerTablesReady.set(db, attempt);
  attempt.then((ready) => {
    if (!ready && ledgerTablesReady.get(db) === attempt) ledgerTablesReady.delete(db);
  });
  return attempt;
}

/** Per-user/per-window global rate limiting. Returns { allowed, retryAfter }.
 * Best-effort: if D1 is unavailable, falls back to the in-isolate limiter. */
async function checkGlobalRateLimit(accountId, env, scope = {}) {
  // A route may own its own budget (see /ai/transcribe: speaking is not a turn,
  // and a learner who repeats a sentence three times must not lose three turns
  // of their daily allowance to the microphone). The counter id is namespaced so
  // scoped budgets can never be spent by — or counted against — the AI routes.
  if (!env.DB) return checkRateLimit(accountId, env); // fallback: in-isolate
  // The counters live in a lazily-created table. Without this the INSERT, the
  // SELECT and the UPDATE all fail on a fresh database and the outer catch
  // silently degrades abuse control to the per-isolate limiter — a durable limit
  // that never engages looks identical to one that is working.
  if (!(await ensureLedgerTablesOnce(env))) return checkRateLimit(accountId, env);
  const prefix = scope.scope ? String(scope.scope) + ":" : "";
  const limitPerMinute = scope.perMinute ?? parseInt(env?.AI_RATE_LIMIT_PER_MINUTE || "20", 10);
  const limitPerDay = scope.perDay ?? parseInt(env?.AI_RATE_LIMIT_PER_DAY || "150", 10);
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
    const minute = await inc(`${prefix}m:${accountId}`, minuteWindow, limitPerMinute);
    if (!minute.allowed) return { allowed: false, retryAfter: 60 - Math.floor((now % 60000) / 1000), reason: "minute_limit" };
    const day = await inc(`${prefix}d:${accountId}`, dayWindow, limitPerDay);
    if (!day.allowed) return { allowed: false, retryAfter: 86400 - Math.floor((now % 86400000) / 1000), reason: "day_limit" };
    return { allowed: true };
  } catch {
    return checkRateLimit(accountId, env); // D1 hiccup: degrade to in-isolate
  }
}

/**
 * Global daily AI spend cap (Batch 1).
 *
 * The per-account limits above bound one learner; this bounds the bill. It is a
 * deliberately blunt proxy — a count of AI calls across all accounts — because a
 * true currency cap needs per-model prices that only the owner can confirm, and
 * a wrong price is worse than a rough ceiling.
 *
 * Semantics: ABSENT means unlimited. Any value present, including 0, is enforced,
 * so `AI_DAILY_SPEND_CAP = "0"` stops all AI traffic — which is exactly how the
 * operator stops spend without a deploy, and how the test proves it engages.
 */
const DAILY_SPEND_CAP_MESSAGE =
  "أوقفنا المحادثات مع Katzu مؤقتاً حتى تبقى الخدمة مستقرة وتتمتع بمخصصك. " +
  "تقدّمك محفوظ تماماً — جرّب بعد قليل، أو راجع كلماتك في هذه الأثناء.";

async function checkDailySpendCap(env) {
  const raw = env?.AI_DAILY_SPEND_CAP;
  if (raw === undefined || raw === null || String(raw).trim() === "") return { allowed: true, cap: null };
  const cap = Number(raw);
  // A non-numeric or negative cap is a config mistake, not an outage: fail OPEN and
  // let the per-account limits keep doing their job rather than freezing every learner.
  if (!Number.isFinite(cap) || cap < 0) return { allowed: true, cap: null };
  if (!env.DB) return { allowed: true, cap }; // no durable store: per-account limits only
  // A cap of 0 is a stop, and a stop must not depend on a database being healthy:
  // it blocks before touching storage, so the emergency path cannot be taken out
  // by the same outage that stopped the bill.
  if (cap === 0) return { allowed: false, cap, count: 0 };
  try {
    const dayWindow = Math.floor(Date.now() / 86400000);
    const counterId = "global-ai-spend";
    // `count` is the number of AI calls admitted TODAY. Every call increments
    // before the check, so the cap admits exactly `cap` calls and blocks the
    // next one — an off-by-one here would silently overspend by one call a day.
    try {
      await env.DB.prepare(
        "INSERT INTO rate_limit_counters (counter_id, window_start, count) VALUES (?, ?, 0)"
      ).bind(counterId, dayWindow).run();
    } catch {
      // Row already exists: fall through and roll the window forward.
      await env.DB.prepare(
        "UPDATE rate_limit_counters SET window_start = ?, count = 0 WHERE counter_id = ? AND window_start != ?"
      ).bind(dayWindow, counterId, dayWindow).run();
    }
    await env.DB.prepare(
      "UPDATE rate_limit_counters SET count = count + 1 WHERE counter_id = ?"
    ).bind(counterId).run();
    const row = await env.DB.prepare(
      "SELECT count FROM rate_limit_counters WHERE counter_id = ?"
    ).bind(counterId).first();
    const count = Number(row?.count ?? 0);
    if (count > cap) return { allowed: false, cap, count };
    return { allowed: true, cap, count };
  } catch {
    return { allowed: true, cap }; // D1 hiccup: never freeze learners on an accounting error
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
    const spend = await checkDailySpendCap(env);
    if (!spend.allowed) {
      return {
        response: json({
          error: "daily_spend_cap",
          code: "DAILY_SPEND_CAP",
          message: DAILY_SPEND_CAP_MESSAGE,
          retry_after: 3600
        }, 503, cors)
      };
    }
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
  // The server-authoritative daily ledger (V29) is per-account data too: it
  // carries the earned-day history and the seen-event ids. Deletion must clear
  // it like `progress:` — before V29 existed there was nothing else to clear, so
  // it is easy to miss and it is exactly the kind of record a data-rights
  // request is about.
  await tryStep("daily_ledger", () => env.USER_PROGRESS.delete(dailyKey(account.sub)));
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
      await tryStep("referral_lesson_payouts", () => env.DB.prepare(
        "DELETE FROM referral_lesson_payouts WHERE invited_account_id = ? OR inviter_account_id = ?"
      ).bind(account.sub, account.sub).run());
    }
    // The authoritative D1 copy of a learner's progress is the `sync_revisions`
    // row (P2 made it the commit gate; KV is only a mirror) — and it was never
    // deleted here, so a deleted learner could sign in again and have the whole
    // merged payload restored from D1. `user_progress` is a legacy table that no
    // code creates any more (`CREATE TABLE user_progress` exists nowhere), and its
    // DELETE was the route's only unguarded statement: it always threw "no such
    // table", which pushed `d1_progress` into `failed`, so EVERY deletion answered
    // 500 DELETE_INCOMPLETE and the registry purge after this block never ran.
    // Deleting the real row is required; the legacy cleanup is best-effort.
    await tryStep("d1_progress", () => env.DB.prepare(
      "DELETE FROM sync_revisions WHERE user_id = ?"
    ).bind(account.sub).run());
    try {
      await env.DB.prepare("DELETE FROM user_progress WHERE user_id = ?").bind(account.sub).run();
    } catch { /* legacy table: absent on any database created after P2 */ }
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
    // Portability (GDPR Art. 20): the daily ledger is this account's data too.
    const dailyRaw = await env.USER_PROGRESS.get(dailyKey(account.sub)).catch(() => null);
    if (dailyRaw) {
      try { exportData.daily_ledger = stripCredentials(JSON.parse(dailyRaw)); } catch {}
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
// ----------------------------------------------------------------------------
// REVIEW QUEUE SYNC (/review/sync)
// The memory engine's schedule lives in IndexedDB, which is per-browser: a
// learner who changes phone or clears site data lost everything the app had
// learned about what they were about to forget. Progress sync could not carry
// it (its payload is a fixed whitelist of five fields), so the queue has its own
// key and its own route.
//
// The worker is the merge authority on purpose: "which copy of this item is
// current" is one rule, implemented once, and the client simply adopts what
// comes back. Two merges that drift would silently corrupt a learner's schedule,
// and a schedule that is wrong is invisible — it just wastes their time.
// ----------------------------------------------------------------------------

/** Only these three exist in the client model; anything else is dropped, not stored. */
const REVIEW_KINDS = new Set(["vocab", "phrase", "mistake"]);

/** Above this a queue is not a queue — bound the KV value and the merge cost. */
const MAX_REVIEW_ITEMS = 500;

/** Scheduling further out than this is not a schedule; it is a bad client. */
const MAX_REVIEW_HORIZON_MS = 400 * 86400 * 1000;
const MAX_REVIEW_TEXT = 300;
const REVIEW_GRAMMAR_ID = /^[a-z0-9_]{1,80}$/i;

function normalizeGrammarReference(raw, grammarId) {
  if (!raw || typeof raw !== "object" || typeof grammarId !== "string" || !REVIEW_GRAMMAR_ID.test(grammarId) || raw.id !== grammarId) return undefined;
  const bounded = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
  return {
    id: grammarId,
    titleAr: bounded(raw.title_ar ?? raw.titleAr, 160),
    ruleAr: bounded(raw.rule_ar ?? raw.ruleAr, 320),
    ruleDe: bounded(raw.rule_de ?? raw.ruleDe, 320),
    exampleDe: bounded(raw.example_de ?? raw.exampleDe, 240),
  };
}

function clampReviewNumber(value, fallback, min, max) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Client rows are untrusted input. An item that cannot be asked or answered is
 * dropped rather than stored: an unanswerable card in the learner's queue is a
 * dead end they cannot clear.
 */
function normalizeReviewItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = typeof raw.kind === "string" ? raw.kind.trim() : "";
  if (!REVIEW_KINDS.has(kind)) return null;
  const refId = typeof raw.refId === "string" ? raw.refId.trim().slice(0, 120) : "";
  const promptAr = typeof raw.promptAr === "string" ? raw.promptAr.trim().slice(0, MAX_REVIEW_TEXT) : "";
  const answerDe = typeof raw.answerDe === "string" ? raw.answerDe.trim().slice(0, MAX_REVIEW_TEXT) : "";
  if (!refId || !promptAr || !answerDe) return null;

  const text = (value) => (typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_REVIEW_TEXT) : undefined);
  const now = Date.now();
  const lastReviewedAt = clampReviewNumber(raw.lastReviewedAt, 0, 0, now + MAX_REVIEW_HORIZON_MS);
  const grammarId = typeof (raw.grammarId || raw.grammar_id) === "string" && REVIEW_GRAMMAR_ID.test(raw.grammarId || raw.grammar_id)
    ? (raw.grammarId || raw.grammar_id)
    : undefined;

  const item = {
    kind,
    refId,
    promptAr,
    answerDe,
    contextDe: text(raw.contextDe),
    explanationAr: text(raw.explanationAr),
    grammarId,
    grammarReference: normalizeGrammarReference(raw.grammarReference || raw.grammar_reference, grammarId),
    scenarioId: typeof raw.scenarioId === "string" ? raw.scenarioId.trim().slice(0, 64) || undefined : undefined,
    level: VALID_LEVELS.has(String(raw.level || "").trim()) ? String(raw.level).trim() : undefined,
    sourceId: Number.isFinite(raw.sourceId) ? Math.floor(raw.sourceId) : undefined,
    dueAt: clampReviewNumber(raw.dueAt, now, 0, now + MAX_REVIEW_HORIZON_MS),
    intervalDays: clampReviewNumber(raw.intervalDays, 1, 0, 400),
    ease: clampReviewNumber(raw.ease, 2.5, 1.3, 2.8),
    reps: Math.floor(clampReviewNumber(raw.reps, 0, 0, 1000)),
    lapses: Math.floor(clampReviewNumber(raw.lapses, 0, 0, 1000)),
    reviews: Math.floor(clampReviewNumber(raw.reviews, 0, 0, 1000)),
    createdAt: clampReviewNumber(raw.createdAt, now, 0, now + MAX_REVIEW_HORIZON_MS),
  };
  if (lastReviewedAt > 0) item.lastReviewedAt = lastReviewedAt;
  return item;
}

/** Later activity wins; reviews break the tie so a second device cannot erase progress. */
function reviewItemIsNewer(candidate, current) {
  const a = candidate.lastReviewedAt || 0;
  const b = current.lastReviewedAt || 0;
  if (a !== b) return a > b;
  return (candidate.reviews || 0) > (current.reviews || 0);
}

async function mergeReviewQueue(sub, incoming, env) {
  const key = `review:${sub}`;
  const existingRaw = await env.USER_PROGRESS.get(key);
  const byRef = new Map();
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw);
      for (const item of Array.isArray(existing?.items) ? existing.items : []) {
        if (item?.refId && item?.kind) byRef.set(`${item.kind}:${item.refId}`, item);
      }
    } catch {
      // A corrupt value must not block the learner's queue from being saved.
    }
  }

  for (const item of incoming) {
    const id = `${item.kind}:${item.refId}`;
    const current = byRef.get(id);
    const selected = !current || reviewItemIsNewer(item, current) ? { ...(current || {}), ...item } : { ...item, ...current };
    selected.grammarId = selected.grammarId || item.grammarId || current?.grammarId;
    selected.grammarReference = normalizeGrammarReference(
      selected.grammarReference || item.grammarReference || current?.grammarReference,
      selected.grammarId,
    );
    byRef.set(id, selected);
  }

  // Keep the most recently touched items when trimming: the oldest untouched
  // ones are the least likely to still matter to this learner.
  const items = [...byRef.values()]
    .sort((a, b) => (b.lastReviewedAt || b.createdAt || 0) - (a.lastReviewedAt || a.createdAt || 0))
    .slice(0, MAX_REVIEW_ITEMS);
  const updated_at = Date.now();
  await env.USER_PROGRESS.put(key, JSON.stringify({ updated_at, items }));
  return { updated_at, items };
}

async function handleReviewSync(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = extractIdToken(request, body);
  if (!idToken || typeof idToken !== "string") {
    return json({ error: "missing_id_token" }, 400, cors);
  }
  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ error: "invalid_id_token" }, 200, cors);
  }
  if (!env.USER_PROGRESS) {
    return json({ error: "storage_unavailable" }, 503, cors);
  }

  const incoming = (Array.isArray(body?.items) ? body.items : [])
    .map(normalizeReviewItem)
    .filter(Boolean)
    .slice(0, MAX_REVIEW_ITEMS);
  const merged = await mergeReviewQueue(account.sub, incoming, env);
  return json({ success: true, ...merged }, 200, cors);
}

// ----------------------------------------------------------------------------
// CLIENT ERROR REPORTS (/client-error)
// A crash in the browser was invisible: the diagnostics buffer only exists on
// the learner's own device, which is the device nobody can inspect after a
// launch. Uncaught errors land in the error_reports table the admin dashboard
// already reads, so the failure shows up where we can act on it.
//
// The route is unauthenticated by necessity — the app can crash before sign-in
// — so it is IP rate-limited, body-capped, and the message goes through the
// existing sanitizer (which strips session tokens, JWTs and key-shaped
// strings). The client never sends learner text.
// ----------------------------------------------------------------------------

/** Abuse control only; reuses the one rate-limit implementation with our own ceiling. */
const CLIENT_ERROR_RATE_LIMITS = { AI_RATE_LIMIT_PER_MINUTE: "8", AI_RATE_LIMIT_PER_DAY: "60" };

async function handleClientError(request, env, cors) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const limit = checkRateLimit(`client-error:${ip}`, CLIENT_ERROR_RATE_LIMITS);
  if (!limit.allowed) {
    return json({ success: false, error: "rate_limited" }, 429, cors);
  }

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return json({ error: "message_required" }, 400, cors);
  }

  const scope = typeof body?.scope === "string" ? body.scope.replace(/[^a-z0-9_]/gi, "").slice(0, 40) || "client" : "client";
  const page = typeof body?.page === "string" ? body.page.slice(0, 120) : "unknown";
  // `error_reports` is lazily created and `recordError` swallows its own failures,
  // so a crash report would be dropped without notice on a fresh database —
  // exactly when a crash report is worth the most.
  await ensureLedgerTablesOnce(env);
  const recorded = await recordError(env, null, `client_${scope}`, page, message);
  return json({ success: recorded }, 200, cors);
}

async function handlePublicHealth(env, cors) {
  let internal = {};
  try {
    const response = await handleAiHealth(env, cors);
    internal = await response.json();
  } catch (err) {
    console.error("[health] internal inspection failed:", String(err?.message || err).slice(0, 120));
    internal = {};
  }

  const poolHealth = getPoolHealth({ env });

  // Public projection: status only. Which providers exist, how many pool entries
  // there are, which model is pinned, cache counts and latency figures are
  // operator information — they stay in the internal report behind the admin
  // routes. An unauthenticated endpoint answers "is it up", and describes the
  // private key pool in no way at all, not even its size.
  return json(
    {
      status: internal?.status || "healthy",
      service: "Katzu Unified Worker",
      // A boolean only: never how many keys exist, only whether the AI engine can
      // serve at all (a usable pool entry, or the Workers AI binding attached).
      ready: internal?.ready === true || poolHealth.active.length > 0,
      // Operational state a monitoring check should be able to see.
      maintenance: isMaintenanceMode(env),
    },
    200,
    cors,
  );
}

// ----------------------------------------------------------------------------
// AI DEPENDENCY WIRING
//
// The AI modules (router, chat, hints, writing) receive the worker-scoped
// internals they need as an injected object instead of importing them, so each
// one owns only its own logic and stays testable in isolation. One factory wires
// every AI route: a route that needs a narrower set simply ignores the rest.
// ----------------------------------------------------------------------------

/** What the pool needs back from this worker: cooldowns, fallback, provider state. */
function aiRouterDeps() {
  return {
    isKeyCoolingDown,
    markKeyCooldown,
    markKeySuccess,
    canUseWorkersAiFallback,
    runWorkersAiFallback,
    // The pool's OpenAI-compatible transports (Groq, OpenRouter, NIM) need the
    // same Gemini→chat conversion the Workers AI fallback uses. It is injected
    // rather than copied: its body sits past the byte wall this file's header
    // documents, so a second copy in the router could never be kept in sync.
    toOpenAiMessages: convertGeminiPayloadToMessages,
    onProvider: (provider) => { lastAiProvider = provider; },
    onModel: (model) => { primaryWorkingModel = model; },
  };
}

async function resolvePracticeGrammar(env, grammarId) {
  if (!grammarId || !env?.DB?.prepare) return null;
  try {
    const row = await env.DB.prepare(
      "SELECT id, title_ar, rule_de, rule_ar, explanation_ar, example_de, example_ar, level FROM grammar WHERE id = ?",
    ).bind(grammarId).first();
    return row?.id === grammarId ? row : null;
  } catch {
    return null;
  }
}

function aiRouteDeps() {
  return {
    json,
    hasUsableProvider,
    authenticateAiRequest,
    extractIdToken,
    verifyGoogleIdToken,
    checkGlobalRateLimit,
    validateAiTurnBody,
    resolveScenarioIdentity,
    resolvePracticeGrammar,
    checkUserEntitlement,
    verifyMockGrant,
    mockExamInstructionForPart,
    isTrialSessionConsumed,
    consumeTrialQuota,
    trialSessionKey,
    boundedHistory,
    sanitizeFieldLabel,
    cleanJson,
    readAiCache,
    writeAiCache,
    validLevels: VALID_LEVELS,
    validateGermanAgainstLevel,
    levelFallbackLine,
    levelConstraintLine,
    correctionBudgetFor,
    // `opts` lets a handler ask for router behaviour it can justify for its own
    // route (the turn and translate routes set `preferFast`), without a second
    // router or a per-route copy of the deps object.
    callAiRouter: (payload, callEnv, opts) =>
      callAiRouter(payload, callEnv, opts ? { ...aiRouterDeps(), ...opts } : aiRouterDeps()),
    routerCounters: routerCountersSnapshot,
    getProvider: () => lastAiProvider,
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * `/progress/sync`, `/progress/get` and `/review/sync` are legacy handlers (two
 * of them sit past the ~48 KB byte offset this tooling cannot edit) that answer
 * an invalid or expired session with **HTTP 200** and `{ error:
 * "invalid_id_token" }`. Measured live 2026-09-26: a forged `sess_` token on all
 * three returned 200.
 *
 * That is not a cosmetic status bug. The client reads `res.ok`, so it counted the
 * sync as completed, dropped the payload from its offline retry queue
 * (`flushPendingSync` deletes what it believes was stored) and the learner's
 * progress was gone — silently, on the one path where "your data was saved" and
 * "your data was discarded" look identical. An auth failure has to look like an
 * auth failure.
 */
async function withHonestSessionStatus(pending, cors) {
  const response = await pending;
  if (response.status !== 200) return response;
  let payload;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }
  if (!payload || payload.error !== "invalid_id_token") return response;
  return json(
    {
      error: "invalid_id_token",
      code: "UNAUTHENTICATED",
      message: "انتهت جلسة الدخول. يرجى تسجيل الدخول مرة أخرى لمزامنة تقدمك — بياناتك محفوظة على هذا الجهاز.",
    },
    401,
    cors
  );
}

/**
 * Operator kill switch. `MAINTENANCE_MODE` freezes every learner write at the
 * edge while reads (health, content, a learner's own library) keep working, so
 * the app degrades to read-only instead of failing at random. It is a Worker
 * variable on purpose: stopping writes must never depend on shipping a new
 * client build, and no request has to reach a handler to be refused.
 */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isMaintenanceMode(env) {
  const flag = String(env?.MAINTENANCE_MODE ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "on" || flag === "yes";
}

/** Retention windows for the tables D1 cannot expire by itself. */
export const RATE_LIMIT_RETENTION_MS = 24 * 3600 * 1000;
export const ERROR_REPORT_RETENTION_MS = 30 * 24 * 3600 * 1000;

/**
 * D1 has no TTL, so two append-only tables grow forever: rate-limit windows that
 * can never matter again, and error reports nobody will read after a month.
 * Rows go in bounded statements, and a failing table is reported as a failure
 * instead of thrown — a cleanup that can 500 the Worker is worse than a table
 * that is a little too big. The window starts at the age of the row, not at the
 * size of the table, so a quiet deploy never deletes anything young.
 */
export async function sweepExpiredRows(env, now = Date.now()) {
  if (!env?.DB) return { skipped: "db_unbound" };
  const jobs = [
    ["rate_limit_counters", "DELETE FROM rate_limit_counters WHERE window_start < ?", now - RATE_LIMIT_RETENTION_MS],
    ["error_reports", "DELETE FROM error_reports WHERE created_at < ?", now - ERROR_REPORT_RETENTION_MS],
  ];
  const removed = {};
  for (const [table, sql, cutoff] of jobs) {
    try {
      const result = await env.DB.prepare(sql).bind(cutoff).run();
      removed[table] = Number(result?.meta?.changes ?? 0);
    } catch {
      // Deliberately no message: a D1 error can name tables and columns, and
      // this value is returned over the admin API.
      removed[table] = -1;
    }
  }
  return removed;
}

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

    // Enforce request size limit. 64 KB is the ceiling for every JSON route, and
    // it stays that way; the one exception is a speech recording, which is audio
    // rather than a payload and is bounded by its own (still finite) limit. A
    // truncated recording is a learner who cannot be heard at all.
    const isAudioUpload = url.pathname === "/ai/transcribe";
    const maxBodyBytes = isAudioUpload ? 400000 : 65536;
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > maxBodyBytes) {
      return json(
        {
          error: "payload_too_large",
          code: isAudioUpload ? "AUDIO_TOO_LARGE" : undefined,
          message: isAudioUpload
            ? "التسجيل أطول من المسموح. سجّل جملة واحدة قصيرة."
            : "Request payload exceeds 64KB limit.",
        },
        413,
        cors
      );
    }

    // Kill switch before any handler: while MAINTENANCE_MODE is on, no learner
    // write runs — no AI spend, no sync commit, no code redemption. Reads still
    // work, so the app stays readable rather than appearing broken. /admin/* is
    // exempt so an operator can still sweep, revoke or export during an incident.
    if (
      isMaintenanceMode(env) &&
      WRITE_METHODS.has(request.method) &&
      !url.pathname.startsWith("/admin")
    ) {
      return json(
        {
          error: "maintenance",
          code: "MAINTENANCE_MODE",
          message:
            "Katzu في وضع الصيانة الآن. ما تعلّمته محفوظ على جهازك، ويمكنك القراءة والمراجعة، أما الحفظ والمحادثة فمعطّلان مؤقتاً. جرّب بعد قليل.",
        },
        503,
        { ...cors, "Retry-After": "300" },
      );
    }

    try {
      // Additive content columns (a scenario's 16:9 banner is the first) are
      // reconciled once per isolate before any content route reads or writes a
      // table. Additive only — see the policy in ./cloudflare-content-schema.js.
      await ensureContentColumns(env);

      // --- AI Engine Endpoints (6+ Keys, Cooldown Tracking & Failover) ---
      if (url.pathname === "/auth/session" && request.method === "POST") {
        return await handleAuthSession(request, env, cors);
      }
      if (url.pathname === "/auth/signout" && request.method === "POST") {
        return await handleAuthSignout(request, env, cors);
      }
      // Turn + translation live in ./cloudflare-ai-chat.js: both handlers sat past
      // the ~63 KB byte offset this file's header documents, and moving them let
      // the multi-provider router replace the Gemini-only walker everywhere.
      if ((url.pathname === "/ai/turn" || url.pathname === "/turn") && request.method === "POST") {
        return await withAiTelemetry(() => handleChatTurnRoute(request, env, cors, aiRouteDeps()), request, env, "ai_turn");
      }
      if ((url.pathname === "/ai/translate" || url.pathname === "/translate") && request.method === "POST") {
        return await withAiTelemetry(() => handleTranslateRoute(request, env, cors, aiRouteDeps()), request, env, "ai_translate");
      }
      if ((url.pathname === "/ai/hints" || url.pathname === "/hints") && request.method === "POST") {
        // Multi-move hints (2-4 distinct conversational intents) live in
        // ./cloudflare-hints.js — the legacy single-hint handler below this file's
        // header boundary now sits past the ~63 KB line the edit tooling cannot
        // reach, so the worker-scoped internals it needs are injected here.
        return await withAiTelemetry(
          () =>
            handleHintsRoute(request, env, cors, aiRouteDeps()),
          request,
          env,
          "ai_hints"
        );
      }
      if (url.pathname === "/ai/transcribe" && request.method === "POST") {
        // Speech-to-text lives in ./cloudflare-stt.js: Workers AI Whisper replaces
        // the browser's Web Speech API, which recorded nothing on Android, played
        // an OS beep this app can never mute, and does not exist in Firefox.
        return await withAiTelemetry(
          () => handleTranscribeRoute(request, env, cors, aiRouteDeps()),
          request,
          env,
          "ai_transcribe"
        );
      }
      if (url.pathname === "/ai/check-writing" && request.method === "POST") {
        return await withAiTelemetry(
          () =>
            handleWritingRoute(request, env, cors, aiRouteDeps()),
          request,
          env,
          "ai_writing"
        );
      }
      // Ask Katzu — the German-only learning assistant (V28 Stage 2A). Its own
      // daily quota and rate limit live in ./cloudflare-ask.js.
      if (url.pathname === "/ai/ask" && request.method === "POST") {
        return await withAiTelemetry(
          () =>
            handleAskRoute(request, env, cors, aiRouteDeps()),
          request,
          env,
          "ai_ask"
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
      // Every /admin* request passes the durable per-IP failure throttle before
      // any handler (or the shell) runs — brute-forcing the bearer secret cannot
      // get past 5 failures per 15 minutes per IP (see isAdminAuthorized).
      if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
        const throttle = await isAdminThrottled(request, env);
        if (throttle.throttled) {
          return adminJson(
            { error: "too_many_attempts" },
            429,
            cors,
            { "Retry-After": String(throttle.retryAfter) },
          );
        }
      }
      // Operator sweep: D1 has no TTL, so the retention windows are enforced on
      // demand here, and from the scheduled handler once a cron trigger exists.
      if (url.pathname === "/admin/sweep" && request.method === "POST") {
        const throttle = await isAdminThrottled(request, env);
        if (throttle.throttled) {
          return adminJson(
            { error: "too_many_attempts" },
            429,
            cors,
            { "Retry-After": String(throttle.retryAfter) },
          );
        }
        if (!(await isAdminAuthorized(request, env))) {
          return adminJson({ error: "unauthorized" }, 401, cors);
        }
        return adminJson({ swept: await sweepExpiredRows(env) }, 200, cors);
      }

      // Hand the admin module the durable per-IP failure recorder. Its gate is a
      // deliberate copy (a back-import would be a cycle through
      // cloudflare-crypto.js), and without this the /admin/api/* endpoints
      // answered 401 without ever writing the counter the throttle above reads —
      // so they were the one /admin* surface with no lockout.
      const adminResponse = await handleAdminRoutes(url, request, env, cors, {
        recordAdminAuthFailure,
        // The admin module cannot import the ledger bootstrap (that would be a
        // cycle), and it reads `redeemed_codes_ledger` for its counters — so hand
        // it the same memoized full-batch ensure the worker's own routes use.
        ensureTables: ensureLedgerTablesOnce,
      });
      if (adminResponse) return adminResponse;

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
      // B3: claim a mock. One free B1 mock per account, then a mock credit or an
      // active subscription. Returns the server-minted brief (parts, timings,
      // topic) and a signed grant the turn route verifies.
      if (url.pathname === "/mock/start" && request.method === "POST") {
        return await handleMockStart(request, env, cors);
      }
      // B4: the price table. Region comes from the Cloudflare country header and
      // the experiment cell from a hash of the account, so a client cannot price
      // itself. Public on purpose — an unauthenticated visitor can see a price,
      // which is what stops the paywall from being a surprise at the last step.
      if (url.pathname === "/pricing" && request.method === "GET") {
        return await handlePricing(request, env, cors);
      }
      if (url.pathname === "/check-status" && request.method === "POST") {
        return await handleCheckStatus(request, env, cors);
      }
      if (url.pathname === "/admin/generate" && request.method === "POST") {
        const throttle = await isAdminThrottled(request, env);
        if (throttle.throttled) {
          return adminJson(
            { error: "too_many_attempts" },
            429,
            cors,
            { "Retry-After": String(throttle.retryAfter) },
          );
        }
        return await handleAdminGenerate(request, env, cors);
      }
      // V24 Phase 6: read-only teacher/cohort code report (same admin gate + throttle).
      if (url.pathname === "/admin/codes/report" && request.method === "GET") {
        const throttle = await isAdminThrottled(request, env);
        if (throttle.throttled) {
          return adminJson(
            { error: "too_many_attempts" },
            429,
            cors,
            { "Retry-After": String(throttle.retryAfter) },
          );
        }
        return await handleAdminCodeReport(request, env, cors);
      }
      // V21 Phase 7: mint signed student-discount codes (same admin gate + throttle).
      if (url.pathname === "/admin/discount-code" && request.method === "POST") {
        const throttle = await isAdminThrottled(request, env);
        if (throttle.throttled) {
          return adminJson(
            { error: "too_many_attempts" },
            429,
            cors,
            { "Retry-After": String(throttle.retryAfter) },
          );
        }
        return await handleAdminDiscountCode(request, env, cors);
      }
      if (url.pathname === "/progress/sync" && request.method === "POST") {
        return await withHonestSessionStatus(handleProgressSync(request, env, cors), cors);
      }
      if (url.pathname === "/progress/get" && request.method === "POST") {
        return await withHonestSessionStatus(handleProgressGet(request, env, cors), cors);
      }
      if (url.pathname === "/review/sync" && request.method === "POST") {
        return await withHonestSessionStatus(handleReviewSync(request, env, cors), cors);
      }
      if (url.pathname === "/client-error" && request.method === "POST") {
        return await handleClientError(request, env, cors);
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

  /**
   * Retention sweep. Inert until a cron trigger is configured for this Worker;
   * until then POST /admin/sweep does the same job on demand.
   */
  async scheduled(_event, env) {
    const swept = await sweepExpiredRows(env);
    console.log("[sweep]", JSON.stringify(swept));
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

const CEFR_LEVELS = new Set(["A0", "A1", "A2", "B1", "B2"]);

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

  // Which turn of the episode this is (0-based). The roleplay prompt uses it to
  // rotate one live-conversation behaviour per turn, so a bounded integer is
  // enough; anything missing or malformed is simply the first turn.
  const turnIdx = Number(body.turn_index);
  clean.turn_index = Number.isFinite(turnIdx) ? Math.max(0, Math.min(500, Math.floor(turnIdx))) : 0;

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

/**
 * The scenario's deterministic conversation beats (V28 Stage 1), derived from its
 * starter phrases — the one place the intended arc of the conversation is written
 * down. Scenario content is static, so the result is cached per isolate: the first
 * turn of a scenario pays one extra small D1 read, and every later turn pays none.
 * Never throws — a D1 hiccup means "no beats", which degrades to the old prompt.
 */
const scenarioBeatsCache = new Map();
const SCENARIO_BEATS_CACHE_MAX = 200;

/** Test-only: isolates must not leak beats between cases. */
export function resetScenarioBeatsCache() {
  scenarioBeatsCache.clear();
}

async function resolveScenarioBeats(env, scenarioId) {
  const id = String(scenarioId || "");
  if (!id) return [];
  if (scenarioBeatsCache.has(id)) return scenarioBeatsCache.get(id);
  let beats = [];
  try {
    if (env?.DB) {
      const { results } = await env.DB.prepare(
        "SELECT german, level, sort_order FROM starter_phrases WHERE scenario_id = ? ORDER BY level ASC, sort_order ASC"
      ).bind(id).all();
      beats = deriveConversationBeats(results || []);
    }
  } catch { beats = []; }
  if (scenarioBeatsCache.size >= SCENARIO_BEATS_CACHE_MAX) scenarioBeatsCache.clear();
  scenarioBeatsCache.set(id, beats);
  return beats;
}

/** Resolves the scenario's server-authoritative identity. D1 first; fall back to a
 * tiny built-in allowlist (same ids) so the engine works even if D1 hiccups.
 * Returns null for unknown scenario ids — the client is never trusted. */
async function resolveScenarioIdentity(env, scenarioId) {
  const FALLBACK_SCENARIOS = {
    cafe_order: { title_de: "Im Café", persona: "friendly café server in Germany", category: "daily_life" },
    apartment_viewing: { title_de: "Wohnungsbesichtigung", persona: "German landlord during a viewing", category: "housing" },
    doctor_visit: { title_de: "Beim Arzt", persona: "receptionist at a German medical practice", category: "health" },
    job_interview: { title_de: "Vorstellungsgespräch", persona: "German hiring manager in an interview", category: "work" },
    embassy_appointment: { title_de: "Botschaftstermin", persona: "embassy appointment clerk", category: "official" },
  };
  // Both reads in parallel: on a beats cache miss the first turn of a scenario
  // pays one concurrent pair of small D1 reads, and every later turn pays only the
  // identity read. A failed phrases read degrades to no beats, never to an error.
  const identityLookup = env?.DB
    ? env.DB.prepare("SELECT title_de, ai_persona, category FROM scenarios WHERE id = ?")
        .bind(scenarioId)
        .first()
        .catch(() => null)
    : Promise.resolve(null);
  const [beats, row] = await Promise.all([resolveScenarioBeats(env, scenarioId), identityLookup]);
  if (row && row.title_de) {
    return {
      title_de: String(row.title_de).slice(0, AI_LIMITS.SCENARIO_TITLE),
      persona: String(row.ai_persona || "").slice(0, AI_LIMITS.PERSONA) || "friendly conversational partner",
      category: typeof row.category === "string" ? row.category.slice(0, 40) : "",
      beats,
    };
  }
  if (FALLBACK_SCENARIOS[scenarioId]) return { ...FALLBACK_SCENARIOS[scenarioId], beats };
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

/** How long a mock grant stays usable. One sitting, not one month. */
const MOCK_GRANT_TTL_MS = 45 * 60 * 1000;

/**
 * The grant token `/mock/start` mints and `/ai/turn` verifies.
 *
 * WHY A SIGNED TOKEN
 * The exam instruction is the one prompt in the app that changes how the AI
 * talks (examiner instead of partner). Letting a client switch that with a body
 * field would let anyone ask for a free "exam" mode, so the token binds the
 * account, proves a mock was actually claimed, and expires. It carries no
 * secret and no price — the signature is over the account and the expiry only.
 */
async function mintMockGrant(accountId, env, now = Date.now()) {
  const expiresAt = now + MOCK_GRANT_TTL_MS;
  const signature = await sign(`MOCK|${accountId}|${expiresAt}`, env.HMAC_SECRET);
  return { token: `MOCK1.${expiresAt}.${signature}`, expiresAt };
}

/**
 * Verify a mock grant for THIS account. Returns null for anything wrong — a
 * malformed token, a signature from another account, a stale token, or a
 * deployment without an HMAC secret. Null always degrades to an ordinary
 * conversation: it never throws and never grants.
 */
async function verifyMockGrant({ token, accountId, env, now = Date.now() } = {}) {
  if (!token || typeof token !== "string" || !accountId || !env?.HMAC_SECRET) return null;
  const match = token.match(/^MOCK1\.(\d{10,16})\.([0-9A-Fa-f]{16})$/);
  if (!match) return null;
  const expiresAt = Number(match[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  const expected = await sign(`MOCK|${accountId}|${expiresAt}`, env.HMAC_SECRET);
  if (expected !== match[2].toUpperCase()) return null;
  return { expiresAt };
}

function mockStateKey(accountId) {
  return `mock-state:${accountId}`;
}

async function readMockState(accountId, env) {
  if (!env?.REDEEMED_CODES || typeof env.REDEEMED_CODES.get !== "function") {
    return { available: false, freeUsed: 0, credits: 0, subscribed: false };
  }
  try {
    const raw = await env.REDEEMED_CODES.get(mockStateKey(accountId));
    if (!raw) return { available: true, freeUsed: 0, credits: 0, subscribed: false };
    const parsed = JSON.parse(raw);
    return {
      available: true,
      freeUsed: Number.isFinite(parsed?.freeUsed) ? Math.max(0, Math.floor(parsed.freeUsed)) : 0,
      credits: Number.isFinite(parsed?.credits) ? Math.max(0, Math.floor(parsed.credits)) : 0,
      subscribed: false,
    };
  } catch {
    return { available: false, freeUsed: 0, credits: 0, subscribed: false };
  }
}

async function writeMockState(accountId, state, env) {
  if (!env?.REDEEMED_CODES || typeof env.REDEEMED_CODES.put !== "function") return;
  await env.REDEEMED_CODES.put(mockStateKey(accountId), JSON.stringify(state));
}

/** Live subscription state, read the same way `/verify` writes it. */
async function hasLiveSubscription(accountId, env) {
  if (!env?.REDEEMED_CODES || typeof env.REDEEMED_CODES.get !== "function") return false;
  try {
    const raw = await env.REDEEMED_CODES.get(`account:${accountId}`);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed?.expiresAt && new Date(parsed.expiresAt).getTime() > Date.now()) return true;
  } catch {}
  return false;
}

/**
 * `POST /mock/start` — claim the free B1 mock, or a paid one.
 *
 * THE PROMISE, and why it is enforced here rather than on the device
 * "One free B1 mock per account" is the whole front door of the paid product, so
 * it is decided server-side from a counter no client can edit. With D1 the free
 * claim is an INSERT against a PRIMARY KEY: the first insert wins, a racing
 * device loses and is told to pay. Without D1 it falls back to a KV
 * read-check-write, which is weaker but never grants more than one free mock in
 * normal use.
 *
 * The response also decides what the debrief may show (free tier: the estimate
 * and the two most useful corrections), so the client never has to guess.
 */
async function handleMockStart(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = extractIdToken(request, body);
  const sessionId = typeof body?.session_id === "string"
    ? body.session_id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
    : "";

  if (!idToken || typeof idToken !== "string") {
    return json({ allowed: false, code: "UNAUTHENTICATED", message: "يرجى تسجيل الدخول بحساب Google أولا، أو جرب المحاذاة." }, 401, cors);
  }
  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ allowed: false, code: "UNAUTHENTICATED", message: "جلسة الدخول غير صالحة. يرجى تسجيل الدخول مرة أخرى." }, 401, cors);
  }
  if (!sessionId) {
    return json({ allowed: false, code: "INVALID_MOCK_SESSION", message: "تعّذر محاذاة المحاظاة." }, 400, cors);
  }

  const state = await readMockState(account.sub, env);
  if (!state.available) {
    return json({ allowed: false, code: "MOCK_STATE_UNAVAILABLE", message: "تعذّر التحقق من رصيد المحاكاة. يرجى المحاولة لاحقاً." }, 503, cors);
  }
  const subscribed = await hasLiveSubscription(account.sub, env);

  // A retry after a dropped connection replays the decision it already got, and
  // the check comes BEFORE the decision: a learner who started the one free mock
  // must never be told to pay for a session they are already in. The session id
  // is the idempotency key in both stores.
  const priorSource = await readMockSessionSource(account.sub, sessionId, env);
  if (priorSource) {
    return mockStartResponse({
      account,
      env,
      cors,
      source: priorSource,
      freeUsed: state.freeUsed,
      creditsRemaining: state.credits,
    });
  }

  const access = decideMockAccess({ freeUsed: state.freeUsed, credits: state.credits, subscribed });
  if (!access.allowed) {
    return mockCreditRequired(cors, state.freeUsed, access);
  }

  let source = access.source;
  let freeUsed = state.freeUsed;
  let creditsRemaining = state.credits;

  if (source === "free") {
    const won = await claimFreeMock(account.sub, env);
    if (!won) {
      // Another device claimed the free mock first. Re-read and price THIS one
      // honestly rather than handing out a second free attempt.
      const fresh = await readMockState(account.sub, env);
      const retry = decideMockAccess({ ...fresh, subscribed });
      if (!retry.allowed) return mockCreditRequired(cors, fresh.freeUsed, retry);
      source = retry.source;
      freeUsed = fresh.freeUsed;
      creditsRemaining = retry.consumeCredit ? retry.creditsRemaining : fresh.credits;
      await writeMockState(account.sub, { freeUsed, credits: creditsRemaining }, env);
    } else {
      freeUsed = state.freeUsed + 1;
      await writeMockState(account.sub, { freeUsed, credits: state.credits }, env);
    }
  } else if (access.consumeCredit) {
    creditsRemaining = access.creditsRemaining;
    await writeMockState(account.sub, { freeUsed, credits: creditsRemaining }, env);
  }

  await recordMockSession(account.sub, sessionId, source, env);
  return mockStartResponse({ account, env, cors, source, freeUsed, creditsRemaining });
}

/**
 * `GET /pricing` — what this learner pays, decided server-side.
 *
 * Region is read from `CF-IPCountry` and the Exam Pass cell from a stable hash of
 * the account id, so the same learner sees the same price on every device and no
 * client can pick the cheaper group. Unauthenticated callers get the standard
 * group and no cell: showing a price is public information, and inventing a bucket
 * for an anonymous visitor would make the first price they see a different one
 * from the price they are asked to pay.
 *
 * The payload carries `unproven: true` because the table is a planning guess; the
 * client is expected to render the numbers as they are, not to soften them.
 */
async function handlePricing(request, env, cors) {
  const group = regionGroupFromRequest(request);
  const idToken = extractIdToken(request, null);
  let accountId = "";
  if (idToken) {
    const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
    if (account?.sub) accountId = account.sub;
  }
  const cell = accountId ? experimentBucket(accountId, PASS_CELLS[group].length) : null;
  const catalogue = catalogueFor({ group, cell });
  return json({ ...catalogue, experimentEnabled: cell !== null, unproven: true }, 200, cors);
}

/**
 * The price group a code was minted for, or null when it records none.
 *
 * Today no code does — the signed format is `DE-<months>M-<nonce>.<sig>` and
 * carries no region. The lookup is kept honest rather than guessed: a mismatch
 * metric built on an assumed group would look like data and be fiction.
 */
async function codeRegionGroup(env, code) {
  if (!env?.DB) return null;
  try {
    const row = await env.DB.prepare("SELECT region_group FROM generated_codes WHERE code = ?")
      .bind(String(code || ""))
      .first();
    const group = row?.region_group;
    return group === "standard" || group === "special" ? group : null;
  } catch {
    // No such column yet: the metric reads zero rather than failing a redemption.
    return null;
  }
}

/** The one answer for "you have used the free mock", in the Arabic a learner reads. */
function mockCreditRequired(cors, freeUsed, access) {
  return json({
    allowed: false,
    code: "MOCK_CREDIT_REQUIRED",
    reason: "mock_credit_required",
    freeUsed: Number(freeUsed || 0),
    creditsRemaining: 0,
    debrief: mockDebriefAccess({ access }),
    message: "انتهت المحاكاة المجانية الواحدة، والمحاكاة التالية تحتاج إلى اشتراك أو رصيد محاكاة."
  }, 402, cors);
}

/**
 * The reply for a claimed (or replayed) mock: the brief the app renders, the
 * grant the turn route verifies, and exactly what the debrief may show.
 */
async function mockStartResponse({ account, env, cors, source, freeUsed, creditsRemaining }) {
  const { token, expiresAt } = await mintMockGrant(account.sub, env);
  const debrief = mockDebriefAccess({ access: { source } });
  return json({
    allowed: true,
    source,
    freeUsed: Number(freeUsed || 0),
    creditsRemaining: Number(creditsRemaining || 0),
    grant: token,
    grantExpiresAt: expiresAt,
    debrief,
    brief: mockExamBrief({ accountId: account.sub }),
  }, 200, cors);
}

/** Claim the single free mock for an account. True when THIS call won. */
async function claimFreeMock(accountId, env) {
  if (env?.DB) {
    const ready = await ensureLedgerTables(env);
    if (ready) {
      try {
        await env.DB.prepare(
          "INSERT INTO mock_free_claims (account_id, claimed_at) VALUES (?, ?)"
        ).bind(accountId, Date.now()).run();
        return true;
      } catch {
        return false;
      }
    }
  }
  // No D1: KV read-check-write. Weaker (no atomic claim), never grants more than
  // the one free mock in ordinary use \u2014 and it is the same fallback the trial
  // quota has used since Phase 2.
  if (!env?.REDEEMED_CODES || typeof env.REDEEMED_CODES.get !== "function") return false;
  const key = `mock-free:${accountId}`;
  const existing = await env.REDEEMED_CODES.get(key).catch(() => null);
  if (existing) return false;
  await env.REDEEMED_CODES.put(key, String(Date.now())).catch(() => {});
  return true;
}

async function readMockSessionSource(accountId, sessionId, env) {
  if (env?.DB) {
    const ready = await ensureLedgerTables(env);
    if (ready) {
      try {
        const row = await env.DB.prepare(
          "SELECT source FROM mock_sessions WHERE account_id = ? AND session_id = ?"
        ).bind(accountId, sessionId).first();
        if (row?.source) return String(row.source);
      } catch {
        return null;
      }
    }
  }
  if (!env?.REDEEMED_CODES || typeof env.REDEEMED_CODES.get !== "function") return null;
  return env.REDEEMED_CODES.get(`mock-session:${accountId}:${sessionId}`).catch(() => null);
}

async function recordMockSession(accountId, sessionId, source, env) {
  if (env?.DB) {
    const ready = await ensureLedgerTables(env);
    if (ready) {
      try {
        await env.DB.prepare(
          "INSERT INTO mock_sessions (account_id, session_id, source, started_at) VALUES (?, ?, ?, ?)"
        ).bind(accountId, sessionId, source, Date.now()).run();
        return;
      } catch {
        return;
      }
    }
  }
  if (env?.REDEEMED_CODES && typeof env.REDEEMED_CODES.put === "function") {
    await env.REDEEMED_CODES.put(`mock-session:${accountId}:${sessionId}`, source, { expirationTtl: 6 * 3600 }).catch(() => {});
  }
}

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

  // B5: a durable funnel row for what was redeemed, carrying the learner's price
  // group so the dashboard can cut conversion by region.
  //
  // `region_mismatch` is LOGGED, never enforced — a code is a code, and a learner
  // who moved must keep what they paid for. The row is only written when the code
  // itself records a region group; today's codes record none (`DE-<months>M-…`),
  // so this counts ZERO rather than inventing a comparison the data cannot
  // support. It starts counting the day codes carry a group — an owner decision,
  // on the OWNER LIST.
  const learnerGroup = regionGroupFromRequest(request);
  await recordActivity(env, account.sub, "code_redeemed", { months, region: learnerGroup });
  const codeGroup = await codeRegionGroup(env, code);
  if (codeGroup && isRegionMismatch(codeGroup, learnerGroup)) {
    await recordActivity(env, account.sub, "region_mismatch", { region: learnerGroup, code_group: codeGroup });
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

  // V31: the paywall states how many free conversations are left, so the number
  // has to come from the ledger that owns it. The client used to print its own
  // locally-seeded value (always 3), which meant a learner who had spent all
  // three was told they still had three — on the screen where trust is bought.
  // `null` means the ledger could not be read, which is different from zero and
  // must never be rendered as "0 جلسات متبقية".
  const quota = await readTrialQuota(account.sub, env);
  const freeSessionsRemaining = quota.available
    ? Math.max(0, MAX_FREE_AI_SESSIONS - quota.used)
    : null;

  const accountKey = `account:${account.sub}`;
  const raw = await env.REDEEMED_CODES.get(accountKey);
  if (!raw) {
    return json({
      active: false,
      days_remaining: 0,
      free_sessions_remaining: freeSessionsRemaining,
      max_free_sessions: MAX_FREE_AI_SESSIONS,
      server_time: now.toISOString(),
      expiresAt: null,
    }, 200, cors);
  }

  const record = JSON.parse(raw);
  const expiry = new Date(record.expiresAt);
  const diffMs = expiry.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const active = diffMs > 0;

  return json({
    active,
    days_remaining: daysRemaining,
    free_sessions_remaining: freeSessionsRemaining,
    max_free_sessions: MAX_FREE_AI_SESSIONS,
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
// V21 Phase 6: the FIRST-LESSON reward. When a referred account completes its
// first lesson (first progress sync carrying at least one session summary),
// BOTH sides get access-days — the invitee needs no purchase, so the reward
// is days, not months: small, honest, and costless for never-activating
// accounts. The verified-purchase reward below is unchanged and stacks on top.
const REFERRAL_LESSON_REWARD_DAYS = 3;
const REFERRAL_LESSON_PAYOUT_TABLE = "referral_lesson_payouts";

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
    // V21 Phase 6: the first-lesson rule, so the client renders the real terms.
    lesson_reward_days: REFERRAL_LESSON_REWARD_DAYS,
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

// V21 Phase 6: first-lesson reward — both sides get access-days when the
// referred account completes its first lesson. Called from the progress-sync
// commit path. The D1 ledger's PRIMARY KEY is claimed FIRST (INSERT before any
// KV write): a concurrent first-lesson sync loses the INSERT and exits, so the
// additive expiry extension can only ever run once. With no D1, the claim
// record itself is the (best-effort, last-writer-wins) gate — the same posture
// the verified-purchase award has always had in its degraded path.
async function awardReferralLessonPayout(inviteeAccount, env) {
  try {
    const claimKey = `referred-by:${inviteeAccount.sub}`;
    const claimRaw = await env.REDEEMED_CODES?.get(claimKey);
    if (!claimRaw) return; // never claimed a referral code — nothing to pay
    let claim = null;
    try { claim = JSON.parse(claimRaw); } catch { return; }
    if (!claim?.referrer_sub || claim.referrer_sub === inviteeAccount.sub) return;
    if (claim.lesson_rewarded_at) return; // already paid once

    let ledgerWon = false;
    if (env.DB && await ensureLedgerTables(env)) {
      try {
        await env.DB.prepare(
          `INSERT INTO ${REFERRAL_LESSON_PAYOUT_TABLE} (invited_account_id, inviter_account_id, awarded_at) VALUES (?, ?, ?)`
        ).bind(inviteeAccount.sub, claim.referrer_sub, new Date().toISOString()).run();
        ledgerWon = true;
      } catch {
        return; // row exists → another sync already paid; never double-pay
      }
    }
    if (!env.DB && !claim.lesson_rewarded_at) {
      // Degraded no-D1 gate: mark best-effort before writing expiries. Two
      // racing syncs could both pass here; accepted in the degraded path only.
      ledgerWon = true;
    }
    if (!ledgerWon) return;

    const referrerKey = `account:${claim.referrer_sub}`;
    const referrerRaw = await env.REDEEMED_CODES.get(referrerKey);
    const referrerRecord = referrerRaw ? JSON.parse(referrerRaw) : null;

    // The invitee earns days on their own account record (which may not exist
    // yet — a free learner with no purchase still gets a record with an expiry).
    const inviteeKey = `account:${inviteeAccount.sub}`;
    const inviteeRaw = await env.REDEEMED_CODES.get(inviteeKey);
    const inviteeRecord = inviteeRaw ? JSON.parse(inviteeRaw) : null;
    const newInviteeExpiry = addDaysIso(inviteeRecord?.expiresAt || null, REFERRAL_LESSON_REWARD_DAYS);
    await env.REDEEMED_CODES.put(inviteeKey, JSON.stringify({
      email: inviteeAccount.email || inviteeRecord?.email || "",
      expiresAt: newInviteeExpiry,
      updatedAt: new Date().toISOString(),
    }));

    const newReferrerExpiry = addDaysIso(referrerRecord?.expiresAt || null, REFERRAL_LESSON_REWARD_DAYS);
    await env.REDEEMED_CODES.put(referrerKey, JSON.stringify({
      email: referrerRecord?.email || "",
      expiresAt: newReferrerExpiry,
      updatedAt: new Date().toISOString(),
    }));

    claim.lesson_reward_days = REFERRAL_LESSON_REWARD_DAYS;
    claim.lesson_rewarded_at = new Date().toISOString();
    await env.REDEEMED_CODES.put(claimKey, JSON.stringify(claim));
  } catch (e) {
    console.error("[Referral] Lesson-payout failed:", e);
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
  if (!(await isAdminAuthorized(request, env))) {
    return adminJson({ error: "unauthorized" }, 401, cors);
  }

  const body = await request.json().catch(() => null);
  const months = body?.months;
  if (!months || months < 1 || months > 12) {
    return json({ error: "months must be 1-12" }, 400, cors);
  }

  // V24 Phase 6: optional teacher/cohort label and batch count. The label is a
  // free-text tag (max 64 chars, trimmed — it is metadata, never entitlement);
  // count mints that many codes in one response. Both are backward-compatible:
  // an old dashboard sends neither and gets exactly what it got before.
  const rawLabel = typeof body?.label === "string" ? body.label.trim().slice(0, 64) : "";
  const label = rawLabel || null;
  const count = Number.isFinite(Number(body?.count)) ? Math.min(50, Math.max(1, Math.trunc(Number(body.count)))) : 1;

  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const nonce = crypto.randomUUID().split("-")[0].toUpperCase();
    const unsigned = `DE-${months}M-${nonce}`;
    const signature = await sign(unsigned, env.HMAC_SECRET);
    codes.push(`${unsigned}-${signature}`);
  }

  // Ledger the batch best-effort: the codes are valid whether or not the
  // tracking table exists (it does once ensureLedgerTables has run), and a
  // tracking outage must never block the owner from minting.
  if (env.DB && codes.length > 0) {
    try {
      await ensureLedgerTables(env);
      const now = new Date().toISOString();
      await env.DB.batch(
        codes.map((code) =>
          env.DB.prepare(
            "INSERT INTO generated_codes (code, months, label, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO NOTHING"
          ).bind(code, months, label, now),
        ),
      );
    } catch (e) {
      console.error("[generate] code ledger failed:", String(e?.message || e).slice(0, 120));
    }
  }

  return count === 1 ? json({ code: codes[0] }, 200, cors) : json({ codes }, 200, cors);
}

// V24 Phase 6: read-only per-label tracking — codes created vs activated.
// Activation is whatever redeemed_codes_ledger actually holds, so the report
// reflects real redemptions, not the ledger's own optimism.
/**
 * What a teacher/cohort label is owed.
 *
 * THE ONE RULE: a reward counts REDEMPTIONS, never codes printed. `created` is
 * what a teacher handed out; `activated` is what a learner actually paid for and
 * redeemed on their own account, which is the join above (a code only appears in
 * `redeemed_codes_ledger` once `handleVerify` has claimed it exactly once). A
 * teacher who prints fifty codes and sells two earns for two.
 *
 * The month rate is a **planning assumption, not a paid rate** (UNPROVEN, and
 * flagged in the payload itself): nothing has been settled with a teacher yet, so
 * the number is what a reward WOULD be if the owner paid it out this month. The
 * owner sets it; it is one constant, not a policy in the dashboard.
 */
const TEACHER_REWARD_MONTHS_PER_ACTIVATION = 1;

/**
 * One line per label, plus the month total. Pure, so the rule is unit-testable
 * without a database and cannot drift from the handler.
 */
export function teacherRewardSummary(
  labels,
  monthsPerActivation = TEACHER_REWARD_MONTHS_PER_ACTIVATION,
) {
  const rows = (Array.isArray(labels) ? labels : []).map((label) => {
    const activated = Math.max(0, Number(label?.activated) || 0);
    const created = Math.max(0, Number(label?.created) || 0);
    return {
      label: label?.label ?? null,
      created,
      activated,
      // Printed but unredeemed codes: visible, and worth zero.
      outstanding: Math.max(0, created - activated),
      rewardMonths: activated * monthsPerActivation,
    };
  });
  return {
    monthsPerActivation,
    rows,
    totalRewardMonths: rows.reduce((sum, row) => sum + row.rewardMonths, 0),
    totalOutstanding: rows.reduce((sum, row) => sum + row.outstanding, 0),
    unproven: true,
  };
}

async function handleAdminCodeReport(request, env, cors) {
  if (!(await isAdminAuthorized(request, env))) {
    return adminJson({ error: "unauthorized" }, 401, cors);
  }

  if (!env.DB) {
    return adminJson({ error: "ledger_unavailable" }, 503, cors);
  }
  if (!(await ensureLedgerTables(env))) {
    return adminJson({ error: "ledger_unavailable" }, 503, cors);
  }

  const { results } = await env.DB.prepare(
    `SELECT
       COALESCE(gc.label, '') AS label,
       COUNT(DISTINCT gc.code) AS created,
       COUNT(DISTINCT r.code) AS activated,
       MIN(gc.created_at) AS first_created_at,
       MAX(gc.created_at) AS last_created_at
     FROM generated_codes gc
     LEFT JOIN redeemed_codes_ledger r ON r.code = gc.code
     GROUP BY COALESCE(gc.label, '')
     ORDER BY MAX(gc.created_at) DESC`
  ).all();

  const labels = (results || []).map((row) => ({
    label: row.label === "" ? null : row.label,
    created: row.created,
    activated: row.activated,
    firstCreatedAt: row.first_created_at || null,
    lastCreatedAt: row.last_created_at || null,
  }));

  return adminJson(
    {
      labels,
      totals: {
        created: labels.reduce((sum, l) => sum + l.created, 0),
        activated: labels.reduce((sum, l) => sum + l.activated, 0),
      },
      teacher_reward: teacherRewardSummary(labels),
    },
    200,
    cors,
  );
}

// V21 Phase 7: mint a signed student-discount code (STD-{pct}-{nonce}-{sig}).
// Same HMAC trust as the activation codes; the checkout validates the signature
// and re-prices server-side, so only the owner can create real discounts.
async function handleAdminDiscountCode(request, env, cors) {
  if (!(await isAdminAuthorized(request, env))) {
    return adminJson({ error: "unauthorized" }, 401, cors);
  }

  const body = await request.json().catch(() => null);
  const percent = Number(body?.percent ?? 50);
  if (!Number.isFinite(percent) || percent < 10 || percent > 90) {
    return json({ error: "percent must be 10-90" }, 400, cors);
  }

  const nonce = crypto.randomUUID().split("-")[0].toUpperCase();
  const pct = String(Math.trunc(percent)).padStart(2, "0");
  const unsigned = `STD-${pct}-${nonce}`;
  const signature = await sign(unsigned, env.HMAC_SECRET);
  const code = `${unsigned}-${signature}`;

  return json({ code, percent: Math.trunc(percent) }, 200, cors);
}

async function handleProgressSync(request, env, cors) {
  const body = await request.json().catch(() => null);
  const idToken = extractIdToken(request, body);
  const incomingStats = body?.stats;
  const incomingTrainings = body?.trainings;
  const incomingSavedWordIds = body?.saved_word_ids;
  const incomingMistakes = body?.mistakes;
  const incomingSessionSummaries = body?.session_summaries;
  const incomingDaily = body?.daily;

  if (!idToken || typeof idToken !== "string") {
    return json({ error: "missing_id_token" }, 400, cors);
  }

  const account = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env);
  if (!account) {
    return json({ error: "invalid_id_token" }, 200, cors);
  }

  const key = `progress:${account.sub}`;

  // ------------------------------------------------------------------------
  // Revision-guarded merge-and-commit (launch-gate 1.5).
  //
  // KV has no compare-and-swap, so the old get → merge → put here let two
  // devices race: both read the same server state, both merged, and whichever
  // wrote last silently dropped the other's sessions/XP.
  //
  // The authoritative state therefore lives in D1 next to the revision: one
  // conditional UPDATE both advances the rev AND stores the merged payload, so
  // "state changed" and "rev advanced" are the same atomic event. Each pass:
  // read (rev, payload), merge with the incoming payload (commutative +
  // idempotent, see the merge* functions), then commit only if the rev is
  // still the value we read. On conflict, re-read and re-merge — up to 3
  // attempts — then answer 409 sync_conflict; the client refetches, re-merges
  // and retries once rather than losing data. The merged result is mirrored to
  // KV after a successful commit so the existing /progress/get cache path and
  // exports keep working.
  //
  // base_rev compatibility: old clients send no rev and are treated as an
  // UNCONDITIONAL merge — the server state is always merged with theirs before
  // every write, so no incoming field can be lost; they simply never get the
  // conflict path. A matching baseRev makes the merge idempotent for retries.
  // ------------------------------------------------------------------------
  // Create the ledger tables before the first statement touches them (V8-F0). If
  // they cannot be created there is no commit gate to use, so the route degrades
  // to the KV merge below instead of 500ing on a conditional UPDATE against a
  // table that does not exist.
  const syncTablesReady = env.DB ? await ensureLedgerTablesOnce(env) : false;
  if (!env.DB || !env.USER_PROGRESS || !syncTablesReady) {
    // No D1 → no commit gate possible; degrade to the merged best-effort write
    // (still strictly better than overwriting: merge never decreases counters).
    const existingRaw = await env.USER_PROGRESS?.get?.(key);
    const existing = existingRaw ? JSON.parse(existingRaw) : null;
    const now = Date.now();
    const merged = existing
      ? mergeProgress(existing, {
          stats: incomingStats, trainings: incomingTrainings, saved_word_ids: incomingSavedWordIds,
          mistakes: incomingMistakes, session_summaries: incomingSessionSummaries,
        }, now)
      : freshProgress(incomingStats, incomingTrainings, incomingSavedWordIds, incomingMistakes, incomingSessionSummaries, now);
    // Server-authoritative day (V29): process the daily payload, then overlay the
    // authoritative XP/streak so a client clock/timezone cannot widen a day or its
    // cap. Seeded from the best-known server total so XP is never reset.
    //
    // A sync is under daily authority whether or not it carries a `daily`
    // payload: a missing one is treated as empty, so the ledger is always created
    // and the server always owns the day/cap/streak. A stats-only client cannot
    // opt out — it can only reconcile the lifetime total upward, bounded inside
    // processDailySync to the daily cap times the elapsed days.
    const seedTotal = Math.max(
      Number(incomingStats?.total_points) || 0,
      Number(existing?.stats?.total_points) || 0,
      Number(incomingDaily?.totalXp) || 0,
    );
    const daily = await processDailySync(env, account.sub, { ...(incomingDaily || {}), totalXp: seedTotal }, now);
    merged.stats = overlayStatsWithDaily(merged.stats, daily);
    await env.USER_PROGRESS.put(key, JSON.stringify(merged));
    // V21 Phase 6: first lesson just landed (see the D1 path below).
    if (firstLessonLanded(existing, merged)) {
      await awardReferralLessonPayout(account, env);
    }
    return json({ success: true, updated_at: now, daily }, 200, cors);
  }

  const MAX_MERGE_ATTEMPTS = 3;
  let lastRev = 0;
  const baseRev = Number.isFinite(Number(body?.base_rev)) && body?.base_rev != null
    ? Number(body.base_rev)
    : null;

  // A request we are about to reject must not advance the ledger: check the
  // revision first so a stale sync cannot reconcile XP or mark a task before it
  // gets its 409. The merge loop still re-checks under the read for the race it
  // can win, but the common stale case returns before any shared state moves.
  if (baseRev !== null) {
    let preRev = 0;
    try {
      const preRow = await env.DB.prepare(
        "SELECT rev FROM sync_revisions WHERE user_id = ?"
      ).bind(account.sub).first();
      preRev = Number(preRow?.rev) || 0;
    } catch { /* D1 hiccup: fall through to the merge loop's own check */ }
    if (preRev !== baseRev) {
      return json({ error: "sync_conflict", code: "SYNC_CONFLICT", rev: preRev }, 409, cors);
    }
  }

  // Server-authoritative daily ledger (V29), processed ONCE before the merge
  // loop so a conflict retry can never credit the same event twice. Seeded from
  // the best-known server total (the KV mirror tracks D1 after each commit) so a
  // first-ever ledger never resets the learner's XP.
  //
  // As in the KV-degrade path: the ledger is created on every sync, a missing
  // `daily` payload included, so no client can opt out of authority. The lifetime
  // total is seeded from the best-known value and reconciled upward only inside
  // processDailySync's plausible-growth bound.
  let seedTotalPoints = Number(incomingStats?.total_points) || 0;
  try {
    const seedRaw = await env.USER_PROGRESS.get(key);
    const seedPrev = seedRaw ? JSON.parse(seedRaw) : null;
    const prevTotal = Number(seedPrev?.stats?.total_points) || 0;
    if (prevTotal > seedTotalPoints) seedTotalPoints = prevTotal;
  } catch { /* KV miss: the client's total is the best estimate */ }
  if (Number(incomingDaily?.totalXp) > seedTotalPoints) seedTotalPoints = Number(incomingDaily.totalXp);
  const daily = await processDailySync(env, account.sub, { ...(incomingDaily || {}), totalXp: seedTotalPoints }, Date.now());

  for (let attempt = 0; attempt < MAX_MERGE_ATTEMPTS; attempt++) {
    // Authoritative state read: rev + payload from the same D1 row.
    let currentRev = 0;
    let existing = null;
    try {
      const row = await env.DB.prepare(
        "SELECT rev, payload FROM sync_revisions WHERE user_id = ?"
      ).bind(account.sub).first();
      if (row) {
        currentRev = Number(row.rev) || 0;
        existing = row.payload ? JSON.parse(row.payload) : null;
      }
    } catch {
      // D1 hiccup mid-sync: fall through with rev 0 / no state; the unconditional
      // legacy path below still merges over whatever KV holds.
    }
    lastRev = currentRev;

    // Old clients (no rev field) merge unconditionally but still merge — the
    // merge with current server state happens either way, so nothing is lost.
    // (`baseRev` was computed before the ledger was touched; reuse it here.)
    if (baseRev !== null && baseRev !== currentRev) {
      // Stale view: hand the client the current state + rev so it can re-merge.
      return json({ error: "sync_conflict", code: "SYNC_CONFLICT", rev: currentRev }, 409, cors);
    }

    const now = Date.now();
    const incoming = {
      stats: incomingStats, trainings: incomingTrainings, saved_word_ids: incomingSavedWordIds,
      mistakes: incomingMistakes, session_summaries: incomingSessionSummaries,
    };
    const merged = existing
      ? mergeProgress(existing, incoming, now)
      : freshProgress(incomingStats, incomingTrainings, incomingSavedWordIds, incomingMistakes, incomingSessionSummaries, now);
    // The server's day owns XP and the streak: overlay its values so a client
    // clock/timezone can never make a larger total or streak stick in D1.
    merged.stats = overlayStatsWithDaily(merged.stats, daily);

    // Atomic commit: the conditional UPDATE both verifies the rev and stores
    // the merged payload. meta.changes === 0 means another device committed
    // first — re-read, re-merge, retry.
    if (baseRev !== null) {
      const result = await env.DB.prepare(
        "UPDATE sync_revisions SET rev = rev + 1, payload = ? WHERE user_id = ? AND rev = ?"
      ).bind(JSON.stringify(merged), account.sub, currentRev).run();
      if (Number(result?.meta?.changes) === 0) continue; // lost the race → retry
    } else {
      // Legacy client (no base_rev): no conflict signalling possible, but the
      // commit is still guarded by the rev we merged against — an INSERT that
      // loses to a concurrent first commit, or an UPDATE that loses to any
      // newer rev, returns changes:0 and forces a re-merge instead of a blind
      // last-write-wins overwrite.
      if (currentRev === 0) {
        const result = await env.DB.prepare(
          "INSERT INTO sync_revisions (user_id, rev, payload) VALUES (?, 1, ?) ON CONFLICT(user_id) DO NOTHING"
        ).bind(account.sub, JSON.stringify(merged)).run();
        if (Number(result?.meta?.changes) === 0) continue;
      } else {
        const result = await env.DB.prepare(
          "UPDATE sync_revisions SET rev = rev + 1, payload = ? WHERE user_id = ? AND rev = ?"
        ).bind(JSON.stringify(merged), account.sub, currentRev).run();
        if (Number(result?.meta?.changes) === 0) continue;
      }
    }

    // Mirror to KV after the commit: /progress/get and exports read this cache;
    // a torn cache write is repaired by the next successful sync.
    await env.USER_PROGRESS.put(key, JSON.stringify(merged));
    // V21 Phase 6: the referral first-lesson reward fires when this account's
    // progress first carries a completed lesson. firstLessonLanded compares the
    // pre-merge state with the merged one, so it is once-per-account by
    // construction — later syncs see a lesson already on both sides and no-op.
    if (firstLessonLanded(existing, merged)) {
      await awardReferralLessonPayout(account, env);
    }
    return json({ success: true, updated_at: now, rev: currentRev + 1, daily }, 200, cors);
  }

  return json({ error: "sync_conflict", code: "SYNC_CONFLICT", rev: lastRev }, 409, cors);
}

function freshProgress(stats, trainings, savedWordIds, mistakes, sessionSummaries, now) {
  return {      stats: stats || {},
      trainings: trainings || [],
      saved_word_ids: savedWordIds || [],
      mistakes: mistakes || [],
      session_summaries: sessionSummaries || [],
      updated_at: now,
  };
}

// V21 Phase 6: true exactly when the merged state carries at least one
// completed lesson (a session summary) and the pre-merge state carried none.
// A completed lesson = a session summary row — finishSession only ever writes
// one after a real session completed, and every surface that records lessons
// funnels into session_summaries on sync.
function firstLessonLanded(existing, merged) {
  const had = Array.isArray(existing?.session_summaries) && existing.session_summaries.length > 0;
  const has = Array.isArray(merged?.session_summaries) && merged.session_summaries.length > 0;
  return !had && has;
}

function mergeProgress(existing, incoming, now) {
  return {
    stats: mergeStats(existing.stats, incoming.stats),
    trainings: mergeTrainings(existing.trainings, incoming.trainings),
    saved_word_ids: mergeSavedWordIds(existing.saved_word_ids, incoming.saved_word_ids),
    mistakes: mergeMistakes(existing.mistakes, incoming.mistakes),
    session_summaries: boundSessionSummaries(mergeSessionSummaries(existing.session_summaries, incoming.session_summaries)),
    updated_at: now,
  };
}

// The stored session history is bounded: the summary list exists so the Trail,
// Progress and Coach screens can show recent activity, not as an archive. The
// newest records are always kept (the habit/activity views read recent days),
// and the merge still unions first, so two devices each carrying 200 older
// records still surface all of their union — the cap only bounds growth.
const MAX_SESSION_SUMMARIES = 200;

function boundSessionSummaries(sessions) {
  if (!Array.isArray(sessions) || sessions.length <= MAX_SESSION_SUMMARIES) return sessions;
  return sessions
    .sort((a, b) => (b.updated_at || b.updatedAt || b.timestamp || 0) - (a.updated_at || a.updatedAt || a.timestamp || 0))
    .slice(0, MAX_SESSION_SUMMARIES);
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

  // The authoritative progress state lives in the sync_revisions D1 row (see
  // handleProgressSync); KV is a cache. The revision rides along on every read
  // so sync-aware clients can send it back as base_rev and get real conflict
  // signalling. A missing row means rev 0 — nothing has synced yet.
  let rev = 0;
  let payload = null;
  if (env.DB) {
    try {
      const row = await env.DB.prepare(
        "SELECT rev, payload FROM sync_revisions WHERE user_id = ?"
      ).bind(account.sub).first();
      if (row) {
        rev = Number(row.rev) || 0;
        payload = row.payload ? JSON.parse(row.payload) : null;
      }
    } catch { /* D1 hiccup: fall back to the KV cache below */ }
  }

  if (!payload) {
    const raw = await env.USER_PROGRESS.get(key);
    payload = raw ? JSON.parse(raw) : null;
  }

  // Server-authoritative day (V29): the ledger owns XP and the streak, so the
  // read overlays its values. Null on an account that has never synced a ledger.
  const daily = await readAuthoritativeDaily(env, account.sub);

  if (!payload) {
    return json({
      updated_at: null,
      rev,
      stats: overlayStatsWithDaily({ level: "A1", streak_days: 0, total_points: 0, last_active_date: null }, daily),
      daily,
      trainings: [],
      saved_word_ids: [],
      mistakes: [],
      session_summaries: [],
    }, 200, cors);
  }

  return json({ ...payload, stats: overlayStatsWithDaily(payload.stats, daily), daily, rev }, 200, cors);
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
    latest.grammar_id = latest.grammar_id || latest.grammarId || mistake.grammar_id || mistake.grammarId || previous?.grammar_id || previous?.grammarId || "";
    latest.grammar_reference = normalizeGrammarReference(
      latest.grammar_reference || latest.grammarReference || mistake.grammar_reference || mistake.grammarReference || previous?.grammar_reference || previous?.grammarReference,
      latest.grammar_id,
    );
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

function addDaysIso(existingIso, days) {
  const now = new Date();
  let base = now;
  if (existingIso) {
    const existing = new Date(existingIso);
    if (!isNaN(existing.getTime()) && existing.getTime() > now.getTime()) base = existing;
  }
  const result = new Date(base);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString();
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}

// Admin JSON with a guaranteed no-store: a cached admin response carrying user
// rows or a freshly minted activation code is a data leak. cors already carries
// no-store for the normal paths; this makes the guarantee local and explicit.
function adminJson(obj, status, cors, extraHeaders = {}) {
  const response = json(obj, status, cors);
  response.headers.set("Cache-Control", "no-store");
  for (const [name, value] of Object.entries(extraHeaders)) response.headers.set(name, value);
  return response;
}

export {
  checkDailySpendCap,
  DAILY_SPEND_CAP_MESSAGE,
  checkRateLimit,
  checkUserEntitlement,
  verifyMockGrant,
  handlePricing,
  mintMockGrant,
  handleMockStart,
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

const VALID_LEVELS = new Set(["A0", "A1", "A2", "B1", "B2"]);

// ----------------------------------------------------------------------------
// Admin auth gate (security-gaps S9/S10 follow-up).
//
// Three properties the old direct string comparison lacked:
// 1. Fail-closed on a missing/short secret — with no ADMIN_SECRET set the old
//    template string became "Bearer undefined", so that exact string was a
//    valid admin credential.
// 2. Constant-time comparison (timingSafeEqualHex, reused from
//    cloudflare-crypto.js — not duplicated) so response timing cannot leak the
//    secret byte by byte.
// 3. A durable per-IP failure throttle (rate_limit_counters, the same D1
//    mechanism the AI routes use) so an attacker can grind the comparison
//    forever: after 5 failures in 15 minutes the IP is locked out with 429.
//    Successful auths do not touch the counter — they neither reset other
//    IPs' counts nor leak a timing signal on the success path.
// ----------------------------------------------------------------------------
const ADMIN_SECRET_MIN_LENGTH = 24;
const ADMIN_FAIL_LIMIT = 5;
const ADMIN_FAIL_WINDOW_MS = 15 * 60 * 1000;

async function isAdminAuthorized(request, env) {
  const secret = typeof env?.ADMIN_SECRET === "string" ? env.ADMIN_SECRET : "";
  // Fail closed: unset, non-string or too-short-to-be-real secrets authorize nothing.
  if (secret.length < ADMIN_SECRET_MIN_LENGTH) return false;
  const auth = request.headers.get("Authorization") || "";
  const expected = `Bearer ${secret}`;
  // Normalize lengths to the constant-time comparison: an early return on
  // length mismatch would leak the secret length, so compare against a fixed
  // dummy of the expected length instead.
  const candidate = auth.length === expected.length ? auth : expected.replace(/./g, (c, i) => (i === 6 ? "x" : " "));
  const match = timingSafeEqualHex(
    Array.from(expected).map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(""),
    Array.from(candidate).map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(""),
  );
  if (!match) {
    await recordAdminAuthFailure(request, env);
    return false;
  }
  return true;
}

async function recordAdminAuthFailure(request, env) {
  if (!env?.DB) return;
  // The per-IP failure counter is the only thing standing between an exposed
  // `/admin` and an unlimited brute force, and it lives in the same lazily-created
  // table as the rest of the ledger: without this the counter row is never written
  // on a fresh database and the lockout can never trigger.
  if (!(await ensureLedgerTablesOnce(env))) return;
  const ip = (request.headers.get("CF-Connecting-IP") || "unknown").replace(/[^a-fA-F0-9:.]/g, "").slice(0, 45);
  const windowStart = Math.floor(Date.now() / ADMIN_FAIL_WINDOW_MS);
  const counterId = `admin-auth-fail:${ip}:${windowStart}`;
  try {
    await env.DB.prepare(
      "INSERT INTO rate_limit_counters (counter_id, window_start, count) VALUES (?, ?, 1)"
    ).bind(counterId, windowStart).run();
    return;
  } catch {}
  try {
    // Row already exists (or raced the INSERT): increment within this window.
    const row = await env.DB.prepare(
      "SELECT count FROM rate_limit_counters WHERE counter_id = ?"
    ).bind(counterId).first();
    const next = (Number(row?.count) || 0) + 1;
    if (row) {
      await env.DB.prepare(
        "UPDATE rate_limit_counters SET count = ? WHERE counter_id = ?"
      ).bind(next, counterId).run();
    }
  } catch {}
}

async function isAdminThrottled(request, env) {
  if (!env?.DB) return { throttled: false };
  const ip = (request.headers.get("CF-Connecting-IP") || "unknown").replace(/[^a-fA-F0-9:.]/g, "").slice(0, 45);
  const windowStart = Math.floor(Date.now() / ADMIN_FAIL_WINDOW_MS);
  try {
    const row = await env.DB.prepare(
      "SELECT count FROM rate_limit_counters WHERE counter_id = ?"
    ).bind(`admin-auth-fail:${ip}:${windowStart}`).first();
    const count = Number(row?.count) || 0;
    if (count >= ADMIN_FAIL_LIMIT) {
      const secondsIntoWindow = (Date.now() % ADMIN_FAIL_WINDOW_MS) / 1000;
      return { throttled: true, retryAfter: Math.ceil(ADMIN_FAIL_WINDOW_MS / 1000 - secondsIntoWindow) };
    }
  } catch {}
  return { throttled: false };
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
  if (!(await isAdminAuthorized(request, env))) {
    return adminJson({ error: "unauthorized" }, 401, cors);
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
        detail: `Row index ${i} has invalid level '${row.level}'. Must be one of A0, A1, A2, B1, B2.`,
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
  if (!(await isAdminAuthorized(request, env))) return adminJson({ error: "unauthorized" }, 401, cors);
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
  if (!(await isAdminAuthorized(request, env))) return adminJson({ error: "unauthorized" }, 401, cors);
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
  if (!(await isAdminAuthorized(request, env))) return adminJson({ error: "unauthorized" }, 401, cors);
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
  if (!(await isAdminAuthorized(request, env))) return adminJson({ error: "unauthorized" }, 401, cors);
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
  if (!(await isAdminAuthorized(request, env))) return adminJson({ error: "unauthorized" }, 401, cors);
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
  if (!(await isAdminAuthorized(request, env))) return adminJson({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const sql = isRowIdTable(type)
    ? `SELECT rowid AS id, * FROM ${type} ORDER BY rowid DESC LIMIT 300`
    : `SELECT * FROM ${type} ORDER BY id DESC LIMIT 300`;

  const { results } = await env.DB.prepare(sql).all();
  return json(results || [], 200, cors);
}

async function handleAdminGetSingleContent(type, id, request, env, cors) {
  if (!(await isAdminAuthorized(request, env))) return adminJson({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const sql = isRowIdTable(type)
    ? `SELECT rowid AS id, * FROM ${type} WHERE rowid = ?`
    : `SELECT * FROM ${type} WHERE id = ?`;

  const row = await env.DB.prepare(sql).bind(id).first();
  if (!row) return json({ error: "not_found" }, 404, cors);

  return json(row, 200, cors);
}

async function handleAdminCreateContent(type, request, env, cors) {
  if (!(await isAdminAuthorized(request, env))) return adminJson({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "invalid_json_body" }, 400, cors);
  }

  if (body.level && !VALID_LEVELS.has(String(body.level).trim())) {
    return json({ error: "invalid_level", detail: "Level must be A0, A1, A2, B1, or B2" }, 400, cors);
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
  if (!(await isAdminAuthorized(request, env))) return adminJson({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "invalid_json_body" }, 400, cors);
  }

  if (body.level && !VALID_LEVELS.has(String(body.level).trim())) {
    return json({ error: "invalid_level", detail: "Level must be A0, A1, A2, B1, or B2" }, 400, cors);
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
  if (!(await isAdminAuthorized(request, env))) return adminJson({ error: "unauthorized" }, 401, cors);
  if (!env.DB) return json({ error: "db_unbound" }, 500, cors);

  const whereClause = isRowIdTable(type) ? "WHERE rowid = ?" : "WHERE id = ?";
  const sql = `DELETE FROM ${type} ${whereClause}`;

  const result = await env.DB.prepare(sql).bind(id).run();
  if (result.meta?.changes === 0) {
    return json({ error: "not_found" }, 404, cors);
  }

  return json({ success: true, deleted_id: id }, 200, cors);
}

