/**
 * Katzu operational telemetry and conversation logging.
 *
 * The rules this module exists to keep:
 *   1. Telemetry never blocks or breaks a learner request. Every writer is
 *      scheduled with `ctx.waitUntil` and swallows its own failure.
 *   2. Only IDs and counts are stored by default. Learner TEXT is stored only
 *      when the owner's master switch (`CONVERSATION_LOGGING`) is on AND the
 *      learner has not opted out, and then only redacted and for 90 days.
 *   3. No key value, session token, email or IP is ever written here. The only
 *      key identifier is the non-reversible fingerprint the router already uses.
 *   4. No DDL on the hot path: writers assume the tables exist (the deploy
 *      applies `migrations/0004_admin_telemetry.sql`); `ensureTelemetryTables`
 *      is called by the read/export/cleanup paths only, so a fresh database
 *      self-heals without a write per request.
 *
 * This file imports nothing on purpose: it is used by the main worker and by
 * the internal admin API module, and both sit in import cycles otherwise.
 */

import { keyFingerprint } from "./cloudflare-ai-router.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Idempotent DDL, kept identical to `migrations/0004_admin_telemetry.sql`.
 * `tests/adminTelemetry.test.ts` asserts the two lists agree, because a drift
 * between them is a column the panel reads and the deploy never created.
 */
export const TELEMETRY_DDL = [
  `CREATE TABLE IF NOT EXISTS ai_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    route TEXT,
    provider TEXT,
    model TEXT,
    key_id TEXT,
    kind TEXT,
    status INTEGER,
    latency_ms INTEGER,
    fallback INTEGER DEFAULT 0,
    scenario TEXT,
    level TEXT,
    user_id TEXT,
    release TEXT,
    turn_id TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_events_ts ON ai_events (ts)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_events_kind ON ai_events (kind, ts)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_events_route ON ai_events (route, ts)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_events_turn ON ai_events (turn_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_events_key ON ai_events (key_id, ts)`,
  `CREATE TABLE IF NOT EXISTS route_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    route TEXT,
    method TEXT,
    status INTEGER,
    kind TEXT,
    latency_ms INTEGER,
    user_id TEXT,
    release TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_route_events_ts ON route_events (ts)`,
  `CREATE INDEX IF NOT EXISTS idx_route_events_route ON route_events (route, ts)`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    turn_id TEXT UNIQUE,
    session_id TEXT,
    turn_no INTEGER,
    ts INTEGER NOT NULL,
    ts_local TEXT,
    user_id TEXT,
    plan TEXT,
    scenario TEXT,
    level TEXT,
    opener_id TEXT,
    learner_text TEXT,
    reply_text TEXT,
    hints TEXT,
    corrections TEXT,
    word_cards TEXT,
    device TEXT,
    os TEXT,
    browser TEXT,
    app_version TEXT,
    locale TEXT,
    country TEXT,
    outcome TEXT,
    guard TEXT,
    latency_ms INTEGER,
    provider TEXT,
    model TEXT,
    flagged INTEGER DEFAULT 0,
    note TEXT,
    redacted INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_ts ON conversations (ts)`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id, ts)`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_scenario ON conversations (scenario, ts)`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations (session_id, turn_no)`,
  `CREATE TABLE IF NOT EXISTS conversation_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    turn_id TEXT,
    ts INTEGER NOT NULL,
    provider TEXT,
    model TEXT,
    key_id TEXT,
    kind TEXT,
    status INTEGER,
    latency_ms INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_attempts_turn ON conversation_attempts (turn_id)` ,
  `CREATE TABLE IF NOT EXISTS admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    actor TEXT,
    action TEXT,
    target TEXT,
    meta TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_admin_audit_ts ON admin_audit (ts)`,
];

let tablesReady = null;

/** Create the telemetry tables once per isolate. Read paths call this; writers never do. */
export async function ensureTelemetryTables(env) {
  if (!env?.DB?.prepare) return false;
  if (tablesReady) return tablesReady;
  tablesReady = (async () => {
    try {
      await env.DB.batch(TELEMETRY_DDL.map((sql) => env.DB.prepare(sql)));
      return true;
    } catch (e) {
      tablesReady = null;
      console.error("[telemetry] ensure tables failed:", String(e?.message || e).slice(0, 120));
      return false;
    }
  })();
  return tablesReady;
}

/** Test hook: forget that this isolate already ran the DDL. */
export function resetTelemetryTablesCache() {
  tablesReady = null;
}

// ---------------------------------------------------------------------------
// Writing without ever blocking a response
// ---------------------------------------------------------------------------

function schedule(ctx, promise) {
  // Telemetry is attached to the request's lifetime, not run beside it. Without
  // `waitUntil` (unit tests, an older call site) there is no lifetime to attach
  // to, so the row is skipped: a logging write must never become a second,
  // unmanaged query on a request whose response is already decided.
  if (!ctx || typeof ctx.waitUntil !== "function") return;
  const safe = Promise.resolve(promise).catch(() => {});
  try {
    ctx.waitUntil(safe);
  } catch {
    /* a broken ctx must not break the request */
  }
}

export function releaseOf(env) {
  const raw = typeof env?.RELEASE === "string" ? env.RELEASE.trim() : "";
  return raw ? raw.slice(0, 40) : "unknown";
}

/** Only paths that are API surface get a route row. Static/asset noise is excluded. */
const ROUTE_EVENT_PREFIXES = [
  "/ai/",
  "/turn",
  "/translate",
  "/lexeme",
  "/hints",
  "/auth/",
  "/progress/",
  "/review/",
  "/user/",
  "/referral/",
  "/affiliate/",
  "/mock/",
  "/verify",
  "/check-status",
  "/client-error",
  "/pricing",
  "/admin",
  "/internal/",
];

export function isTelemetryRoute(pathname) {
  if (!pathname) return false;
  return ROUTE_EVENT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/**
 * One row per API request. IDs and a status only — never a body, never a query
 * string (a query string can carry a token or a code).
 */
export function recordRouteEvent(env, request, response, startedAt, ctx) {
  try {
    if (!env?.DB?.prepare) return;
    if (!ctx || typeof ctx.waitUntil !== "function") return;
    // Preflight is not a request for data; one row per browser preflight would be
    // noise the panel cannot act on.
    if (request.method === "OPTIONS") return;
    const url = new URL(request.url);
    if (!isTelemetryRoute(url.pathname)) return;
    const status = Number(response?.status) || 0;
    const latency = Math.max(0, Date.now() - startedAt);
    const userId = request.headers.get("x-katzu-user")?.slice(0, 80) || null;
    schedule(
      ctx,
      env.DB.prepare(
        `INSERT INTO route_events (ts, route, method, status, kind, latency_ms, user_id, release)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          Date.now(),
          url.pathname.slice(0, 120),
          request.method,
          status,
          status < 400 ? "ok" : status === 429 ? "limited" : status >= 500 ? "error" : "client",
          latency,
          userId,
          releaseOf(env),
        )
        .run(),
    );
  } catch {
    /* telemetry must never fail a request */
  }
}

/**
 * The per-request AI collector. Created by the main worker for each AI route,
 * handed to the router (which reports every provider attempt) and to the
 * telemetry wrapper (which writes the row after the response exists).
 */
export function createAiTelemetry() {
  return {
    attempts: [],
    /** Called by `callAiRouter` through its `onAttempt` hook. Never throws. */
    attempt(entry) {
      try {
        if (!entry || typeof entry !== "object") return;
        if (this.attempts.length >= 12) return;
        this.attempts.push({
          provider: str(entry.provider, 40),
          model: str(entry.model, 80),
          key_id: str(entry.keyId, 20),
          kind: str(entry.kind, 20) || "other",
          status: Number.isFinite(entry.status) ? entry.status : null,
          latency_ms: Number.isFinite(entry.latencyMs) ? Math.max(0, Math.round(entry.latencyMs)) : null,
        });
      } catch {
        /* an observation must never disturb the router */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Redaction — the only path learner text takes before it is stored
// ---------------------------------------------------------------------------

const REDACTIONS = [
  // Email addresses.
  [/\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g, "[email]"],
  // URLs that carry a token, code or signature in the query or path.
  [/\bhttps?:\/\/\S*[?&](?:token|code|key|sig|signature|auth|session|access_token)=[^\s&]+/gi, "[link]"],
  [/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, "[token]"],
  // Worker session tokens, JWTs, provider keys.
  [/\bsess_[A-Za-z0-9._-]{6,}/g, "[token]"],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[token]"],
  [/\bAIza[A-Za-z0-9_-]{10,}/g, "[key]"],
  [/\b(?:sk|pk|rk|nvapi)-[A-Za-z0-9_-]{10,}/g, "[key]"],
  // Long opaque runs: API keys, hashes, base64 blobs.
  [/\b[A-Za-z0-9_-]{40,}\b/g, "[id]"],
  // Phone numbers (international and local shapes) before the digit rule.
  [/(?:\+|00)\d[\d\s().-]{7,}\d/g, "[phone]"],
  [/\b0\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g, "[phone]"],
  // Long digit strings: card-like, ID-like, OTP-like.
  [/\b\d{9,}\b/g, "[number]"],
];

/** Escape-free, bounded, credential-free text. `null` when nothing is left. */
export function redactText(value, maxLength = 4000) {
  if (value === null || value === undefined) return null;
  let text = typeof value === "string" ? value : String(value);
  // Control characters become spaces: a stored newline is fine, a NUL is not.
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement);
  // A control character became a space, which can leave a double gap. Collapse
  // runs of plain spaces so the stored line is what the learner would read.
  text = text.replace(/[ \t]{2,}/g, " ").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// Request context (device, OS, browser, locale, coarse country)
// ---------------------------------------------------------------------------

function str(value, maxLength) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

export function parseUserAgent(ua, chMobile) {
  const raw = typeof ua === "string" ? ua : "";
  const mobileHint = chMobile === "?1";
  const device = /iPad|Tablet/i.test(raw)
    ? "tablet"
    : /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(raw) || (mobileHint && /Android/i.test(raw))
      ? "phone"
      : "desktop";
  let os = "unknown";
  if (/Windows NT/i.test(raw)) os = "windows";
  else if (/Android/i.test(raw)) os = "android";
  else if (/iPhone|iPad|iPod/i.test(raw)) os = "ios";
  else if (/Mac OS X|Macintosh/i.test(raw)) os = "macos";
  else if (/CrOS/i.test(raw)) os = "chromeos";
  else if (/Linux/i.test(raw)) os = "linux";
  let browser = "unknown";
  if (/Edg\//i.test(raw)) browser = "edge";
  else if (/OPR\/|Opera/i.test(raw)) browser = "opera";
  else if (/Firefox\//i.test(raw)) browser = "firefox";
  else if (/Chrome\/|CriOS/i.test(raw)) browser = "chrome";
  else if (/Safari\//i.test(raw)) browser = "safari";
  return { device, os, browser };
}

export function parseClientContext(request) {
  try {
    const headers = request?.headers;
    const ua = headers?.get("User-Agent") || "";
    const { device, os, browser } = parseUserAgent(ua, headers?.get("Sec-CH-UA-Mobile"));
    const cf = request?.cf || {};
    const lang = String(headers?.get("Accept-Language") || "")
      .split(",")[0]
      .trim()
      .slice(0, 20);
    return {
      device,
      os,
      browser,
      locale: lang || null,
      country: str(cf.country, 2) ? String(cf.country).toUpperCase().slice(0, 2) : null,
      timezone: str(cf.timezone, 60),
      app_version: str(headers?.get("X-App-Version"), 24),
    };
  } catch {
    return { device: "unknown", os: "unknown", browser: "unknown", locale: null, country: null, timezone: null, app_version: null };
  }
}

/** Local wall-clock for a timestamp, or null when the timezone is unusable. */
export function localTimeString(ms, timezone) {
  if (!timezone) return null;
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .format(new Date(ms))
      .replace(" ", "T");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Outcome classification
// ---------------------------------------------------------------------------

/** The one vocabulary the panel, the filters and the alerts all speak. */
export function classifyOutcome({ status, payload, attempts = [] }) {
  const code = String(payload?.code || payload?.error || "");
  if (status === 200 || status === 201) {
    if (code === "ai_empty_reply" || code === "AI_EMPTY_REPLY") return "empty";
    return "ok";
  }
  if (status === 429) {
    return /quota|trial|paywall/i.test(code) ? "day" : "minute";
  }
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 408 || /timeout/i.test(code)) return "timeout";
  const kinds = attempts.map((a) => a.kind);
  if (kinds.includes("invalid_key")) return "invalid_key";
  if (kinds.includes("day")) return "day";
  if (kinds.includes("minute")) return "minute";
  if (kinds.includes("timeout")) return "timeout";
  if (code === "ai_unavailable") return "empty";
  return "other";
}

// ---------------------------------------------------------------------------
// AI call row + conversation row
// ---------------------------------------------------------------------------

/**
 * Write one AI call row and, for `/ai/turn`, the conversation row when logging
 * is enabled. `payload` is the parsed response body (or null), `body` the parsed
 * request body (or null). Both are already bounded by their handlers.
 */
export function recordAiCall(env, ctx, details) {
  try {
    if (!env?.DB?.prepare) return;
    if (!ctx || typeof ctx.waitUntil !== "function") return;
    const {
      route,
      status,
      startedAt,
      collector,
      user = {},
      payload = null,
      body = null,
      conversation = null,
    } = details || {};
    const now = Date.now();
    const latency = Math.max(0, now - (Number(startedAt) || now));
    const attempts = Array.isArray(collector?.attempts) ? collector.attempts : [];
    const provider = str(payload?.provider, 40) || attempts[attempts.length - 1]?.provider || null;
    const model = attempts[attempts.length - 1]?.model || null;
    const keyId = attempts[attempts.length - 1]?.key_id || null;
    const kind = classifyOutcome({ status, payload, attempts });
    const scenario = str(body?.scenario_id, 80) || null;
    const level = str(body?.cefr_level, 4) || null;
    const turnId = str(conversation?.turn_id, 64) || null;

    const writes = [
      env.DB.prepare(
        `INSERT INTO ai_events (ts, route, provider, model, key_id, kind, status, latency_ms, fallback, scenario, level, user_id, release, turn_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          now,
          str(route, 40),
          provider,
          model,
          keyId,
          kind,
          Number.isFinite(status) ? status : null,
          latency,
          provider === "workers-ai" ? 1 : 0,
          scenario,
          level,
          str(user.sub, 80),
          releaseOf(env),
          turnId,
        )
        .run(),
    ];

    if (conversation && conversation.logging) {
      const row = conversation.row;
      writes.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO conversations
            (turn_id, session_id, turn_no, ts, ts_local, user_id, plan, scenario, level, opener_id,
             learner_text, reply_text, hints, corrections, word_cards, device, os, browser,
             app_version, locale, country, outcome, guard, latency_ms, provider, model)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            row.turn_id,
            row.session_id,
            row.turn_no,
            row.ts,
            row.ts_local,
            row.user_id,
            row.plan,
            row.scenario,
            row.level,
            row.opener_id,
            row.learner_text,
            row.reply_text,
            row.hints,
            row.corrections,
            row.word_cards,
            row.device,
            row.os,
            row.browser,
            row.app_version,
            row.locale,
            row.country,
            row.outcome,
            row.guard,
            row.latency_ms,
            row.provider,
            row.model,
          )
          .run(),
      );
      for (const attempt of attempts.slice(0, 12)) {
        writes.push(
          env.DB.prepare(
            `INSERT INTO conversation_attempts (turn_id, ts, provider, model, key_id, kind, status, latency_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(row.turn_id, now, attempt.provider, attempt.model, attempt.key_id, attempt.kind, attempt.status, attempt.latency_ms)
            .run(),
        );
      }
    }

    schedule(ctx, Promise.all(writes.map((p) => Promise.resolve(p).catch(() => null))));
  } catch {
    /* telemetry must never fail a request */
  }
}

/**
 * Build the conversation row from what actually crossed the wire. Text is
 * redacted here and nowhere else; `null` means "not stored", never "".
 */
export function buildConversationRow({ request, body, payload, user, latencyMs, turnId, outcome, guard }) {
  const ctx = parseClientContext(request);
  const now = Date.now();
  const evaluation = payload?.evaluation || {};
  const hints = Array.isArray(payload?.hints) ? payload.hints.slice(0, 4) : [];
  const corrections = {
    is_correct: typeof evaluation.is_correct === "boolean" ? evaluation.is_correct : null,
    original_mistake: redactText(evaluation.original_mistake, 400),
    corrected_german: redactText(evaluation.corrected_german, 400),
    grammar_id: str(evaluation.grammar_id, 80),
  };
  const wordCards = Array.isArray(body?.word_cards_opened)
    ? body.word_cards_opened.slice(0, 20).map((w) => str(w, 80)).filter(Boolean)
    : [];
  return {
    turn_id: turnId,
    session_id: str(body?.session_id, 80),
    turn_no: Number.isFinite(Number(body?.turn_index)) ? Math.max(0, Math.min(500, Math.floor(Number(body.turn_index)))) : null,
    ts: now,
    ts_local: localTimeString(now, ctx.timezone),
    user_id: str(user?.sub, 80),
    plan: str(user?.plan, 20),
    scenario: str(body?.scenario_id, 80),
    level: str(body?.cefr_level, 4),
    opener_id: str(body?.opener_id, 80),
    learner_text: redactText(body?.user_message, 2000),
    reply_text: redactText(payload?.reply_de, 2000),
    hints: hints.length ? redactText(JSON.stringify(hints), 1200) : null,
    corrections: JSON.stringify(corrections).slice(0, 1200),
    word_cards: wordCards.length ? JSON.stringify(wordCards) : null,
    device: ctx.device,
    os: ctx.os,
    browser: ctx.browser,
    app_version: ctx.app_version,
    locale: ctx.locale,
    country: ctx.country,
    outcome: outcome || null,
    guard: guard || null,
    latency_ms: Number.isFinite(latencyMs) ? Math.round(latencyMs) : null,
    provider: str(payload?.provider, 40),
    model: null,
  };
}

// ---------------------------------------------------------------------------
// Consent + retention
// ---------------------------------------------------------------------------

export const CONVERSATION_RETENTION_DAYS = 90;
export const EVENT_RETENTION_DAYS = 365;

/** The master switch, read exactly the way the operator writes it. */
export function conversationLoggingEnabled(env) {
  const raw = String(env?.CONVERSATION_LOGGING ?? "").toLowerCase().trim();
  return raw === "on" || raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Consent is explicit: the key holds `1`/`true` only after the learner granted
 * it, and an absent key means "no". That is why this is not an opt-out check —
 * silence is not consent, and an anonymous request (no `sub`) can never carry a
 * grant. The operator switch (`CONVERSATION_LOGGING`) is a second, independent
 * gate; both must be on.
 */
export function consentKey(sub) {
  return `consent:logging:${String(sub || "").slice(0, 80)}`;
}

/** A KV read, but only when logging is on: off means zero extra latency. */
export async function hasLoggingConsent(env, sub) {
  if (!sub || !env?.USER_PROGRESS?.get) return false;
  try {
    const value = await env.USER_PROGRESS.get(consentKey(sub));
    return value === "1" || value === "true" || value === "granted";
  } catch {
    // Fail closed on the READ: if consent cannot be checked, no text is stored.
    return false;
  }
}

/**
 * Retention: full text lives 90 days, then the row keeps its metrics and loses
 * every text column. Rows are never deleted by age, because "how many turns did
 * learners take in March" must outlive the text. Explicit per-user delete is a
 * hard delete and lives in the admin API.
 */
export async function sweepConversationText(env, now = Date.now()) {
  if (!env?.DB?.prepare) return { skipped: "db_unbound" };
  const cutoff = now - CONVERSATION_RETENTION_DAYS * 86400000;
  const eventCutoff = now - EVENT_RETENTION_DAYS * 86400000;
  const out = {};
  try {
    const res = await env.DB.prepare(
      `UPDATE conversations
          SET learner_text = NULL, reply_text = NULL, hints = NULL, corrections = NULL,
              word_cards = NULL, note = CASE WHEN flagged = 1 THEN note ELSE NULL END,
              redacted = 1
        WHERE ts < ? AND redacted = 0`,
    )
      .bind(cutoff)
      .run();
    out.conversations_scrubbed = Number(res?.meta?.changes ?? 0);
  } catch {
    out.conversations_scrubbed = -1;
  }
  try {
    const res = await env.DB.prepare(`DELETE FROM conversation_attempts WHERE ts < ?`).bind(cutoff).run();
    out.conversation_attempts = Number(res?.meta?.changes ?? 0);
  } catch {
    out.conversation_attempts = -1;
  }
  try {
    const res = await env.DB.prepare(`DELETE FROM ai_events WHERE ts < ?`).bind(eventCutoff).run();
    out.ai_events = Number(res?.meta?.changes ?? 0);
  } catch {
    out.ai_events = -1;
  }
  try {
    const res = await env.DB.prepare(`DELETE FROM route_events WHERE ts < ?`).bind(eventCutoff).run();
    out.route_events = Number(res?.meta?.changes ?? 0);
  } catch {
    out.route_events = -1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Router hook
// ---------------------------------------------------------------------------

/**
 * The observer `callAiRouter` calls once per provider attempt. It only pushes
 * onto a per-request collector — no I/O, no await, no throw — so rotation,
 * cooldown and failover behave exactly as they did before it existed.
 */
export function makeAttemptHook(collector) {
  return function onAttempt(info) {
    if (!collector) return;
    try {
      const entry = info || {};
      collector.attempt({
        provider: entry.provider,
        model: entry.model,
        keyId: entry.keyId ?? entry.key_id,
        kind: entry.kind,
        status: entry.status,
        latencyMs: entry.latencyMs ?? entry.latency_ms,
      });
    } catch {
      /* never disturb the router */
    }
  };
}

/** Exposed for the key-disable feature: the same fingerprint the router stores. */
export { keyFingerprint };
