/**
 * The internal admin API: the only data surface the separate admin Worker can
 * reach, over a Service Binding, at `/internal/admin/*`.
 *
 * Rules this module exists to keep:
 *   1. Deny by default. Every path needs the internal bearer token; there is no
 *      public, unauthenticated or "local only" branch. An unknown path under the
 *      prefix answers 401 before it answers 404, so the surface cannot be mapped
 *      by an unauthenticated caller.
 *   2. The token is never a key value. It is a random 256-bit internal secret
 *      stored in the existing KV namespace (`internal:admin-token`) or supplied
 *      as `ADMIN_INTERNAL_TOKEN` when the owner adds it. Only its presence is
 *      ever reported.
 *   3. Read-only by default. The three mutations (flag, delete, provider
 *      disable) are audited in `admin_audit`.
 *   4. No SQL string is built from a query parameter. Every value is bound.
 *   5. Learner text is returned as stored (already redacted at write time) and
 *      is JSON-encoded, never rendered. The panel escapes at the edge.
 *
 * This module imports only the telemetry data layer, never the router or the
 * worker, so it cannot create an import cycle.
 */

import {
  ensureTelemetryTables,
  conversationLoggingEnabled,
  sweepConversationText,
  CONVERSATION_RETENTION_DAYS,
  EVENT_RETENTION_DAYS,
} from "./cloudflare-telemetry.js";
import {
  ensureContentAdminTables,
  handleContentAdminRequest,
} from "./cloudflare-content-admin.js";

export const INTERNAL_ADMIN_PREFIX = "/internal/admin";
export const INTERNAL_TOKEN_KV_KEY = "internal:admin-token";
export const INTERNAL_TOKEN_MIN_LENGTH = 24;
/** 120 requests a minute per caller, per isolate. The panel is one operator. */
export const INTERNAL_RATE_LIMIT = 120;

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function generateInternalToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = "ika_";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** The configured token, if any. A bound secret always wins over the KV copy. */
export function boundInternalToken(env) {
  const bound = typeof env?.ADMIN_INTERNAL_TOKEN === "string" ? env.ADMIN_INTERNAL_TOKEN.trim() : "";
  return bound.length >= INTERNAL_TOKEN_MIN_LENGTH ? bound : "";
}

export async function readInternalToken(env) {
  const bound = boundInternalToken(env);
  if (bound) return bound;
  try {
    const stored = await env?.USER_PROGRESS?.get(INTERNAL_TOKEN_KV_KEY);
    return typeof stored === "string" && stored.length >= INTERNAL_TOKEN_MIN_LENGTH ? stored : "";
  } catch {
    return "";
  }
}

/**
 * Used by the admin Worker at boot: return the shared token, creating it once if
 * this is the first run. The re-read after `put` settles the race where another
 * isolate created a different token at the same moment.
 */
export async function getOrCreateInternalToken(env) {
  const existing = await readInternalToken(env);
  if (existing) return existing;
  const bound = boundInternalToken(env);
  if (bound) return bound;
  if (!env?.USER_PROGRESS?.put) return "";
  const token = generateInternalToken();
  try {
    await env.USER_PROGRESS.put(INTERNAL_TOKEN_KV_KEY, token);
  } catch {
    return "";
  }
  return (await readInternalToken(env)) || "";
}

async function isInternalAuthorized(request, env) {
  const expected = await readInternalToken(env);
  if (!expected) return false; // fail closed: no token configured, no access
  const auth = request.headers.get("Authorization") || "";
  const header = `Bearer ${expected}`;
  const candidate = auth.length === header.length ? auth : header.replace(/./g, " ");
  return timingSafeEqual(candidate, header);
}

// ---------------------------------------------------------------------------
// Rate limit (per isolate, per caller)
// ---------------------------------------------------------------------------

const rateBuckets = new Map();

/** Test hook: the limiter is isolate state, so tests must be able to reset it. */
export function resetInternalRateLimit() {
  rateBuckets.clear();
}

function callerKey(request) {
  try {
    return request.headers.get("CF-Connecting-IP") || request.headers.get("x-admin-caller") || "internal";
  } catch {
    return "internal";
  }
}

function withinRateLimit(request, now = Date.now()) {
  const key = callerKey(request);
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60000 });
    if (rateBuckets.size > 500) {
      for (const [k, v] of rateBuckets) if (now >= v.resetAt) rateBuckets.delete(k);
    }
    return { ok: true, remaining: INTERNAL_RATE_LIMIT - 1, resetAt: now + 60000 };
  }
  if (bucket.count >= INTERNAL_RATE_LIMIT) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { ok: true, remaining: INTERNAL_RATE_LIMIT - bucket.count, resetAt: bucket.resetAt };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

/** A number from a query string, clamped. Never NaN, never unbounded. */
function num(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function text(value, max) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

async function all(env, sql, binds = []) {
  try {
    const result = await env.DB.prepare(sql).bind(...binds).all();
    return Array.isArray(result?.results) ? result.results : [];
  } catch {
    return [];
  }
}

async function first(env, sql, binds = []) {
  try {
    return (await env.DB.prepare(sql).bind(...binds).first()) || null;
  } catch {
    return null;
  }
}

function audit(env, { actor, action, target, meta }) {
  try {
    if (!env?.DB?.prepare) return;
    const row = env.DB.prepare(
      `INSERT INTO admin_audit (ts, actor, action, target, meta) VALUES (?, ?, ?, ?, ?)`,
    ).bind(Date.now(), text(actor, 120) || "panel", text(action, 40), text(target, 120), text(meta, 500) || null);
    const pending = Promise.resolve(row.run()).catch(() => null);
    // The caller passes ctx into the handler; if it did not, the write is still
    // fire-and-forget and can never fail the request.
    return pending;
  } catch {
    return null;
  }
}

function windowStart(hours) {
  return Date.now() - hours * 3600000;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleOverview(env, url) {
  await ensureTelemetryTables(env);
  const hours = num(url.searchParams.get("hours"), 24, 1, 720);
  const since = windowStart(hours);
  const [byKind, byRoute, byProvider, routeTotal, routeErrors, conversations, latency] = await Promise.all([
    all(env, `SELECT kind, COUNT(*) AS n FROM ai_events WHERE ts >= ? GROUP BY kind ORDER BY n DESC`, [since]),
    all(env, `SELECT route, COUNT(*) AS n FROM ai_events WHERE ts >= ? GROUP BY route ORDER BY n DESC LIMIT 20`, [since]),
    all(env, `SELECT provider, COUNT(*) AS n FROM ai_events WHERE ts >= ? AND provider IS NOT NULL GROUP BY provider ORDER BY n DESC`, [since]),
    first(env, `SELECT COUNT(*) AS n FROM route_events WHERE ts >= ?`, [since]),
    first(env, `SELECT COUNT(*) AS n FROM route_events WHERE ts >= ? AND status >= 400`, [since]),
    first(env, `SELECT COUNT(*) AS n FROM conversations WHERE ts >= ? AND deleted = 0`, [since]),
    first(env, `SELECT AVG(latency_ms) AS avg, MAX(latency_ms) AS max FROM ai_events WHERE ts >= ?`, [since]),
  ]);
  const aiTotal = byKind.reduce((sum, row) => sum + Number(row.n || 0), 0);
  const ok = Number(byKind.find((row) => row.kind === "ok")?.n || 0);
  return {
    window_hours: hours,
    generated_at: Date.now(),
    release: typeof env?.RELEASE === "string" ? env.RELEASE : "unknown",
    logging_enabled: conversationLoggingEnabled(env),
    ai: {
      total: aiTotal,
      ok,
      success_rate: aiTotal ? Number((ok / aiTotal).toFixed(4)) : null,
      avg_latency_ms: latency?.avg === null || latency?.avg === undefined ? null : Math.round(Number(latency.avg)),
      max_latency_ms: latency?.max === null || latency?.max === undefined ? null : Math.round(Number(latency.max)),
      by_kind: byKind,
      by_route: byRoute,
      by_provider: byProvider,
    },
    routes: {
      total: Number(routeTotal?.n || 0),
      errors: Number(routeErrors?.n || 0),
      error_rate: Number(routeTotal?.n || 0)
        ? Number((Number(routeErrors?.n || 0) / Number(routeTotal.n)).toFixed(4))
        : null,
    },
    conversations: { turns: Number(conversations?.n || 0) },
  };
}

async function handleHealth(env) {
  await ensureTelemetryTables(env);
  const hourAgo = windowStart(1);
  const [aiRecent, routeErrors, probe] = await Promise.all([
    first(env, `SELECT COUNT(*) AS n FROM ai_events WHERE ts >= ?`, [hourAgo]),
    first(env, `SELECT COUNT(*) AS n FROM route_events WHERE ts >= ? AND status >= 500`, [hourAgo]),
    first(env, `SELECT 1 AS ok`),
  ]);
  return {
    ok: Boolean(probe?.ok),
    now: Date.now(),
    release: typeof env?.RELEASE === "string" ? env.RELEASE : "unknown",
    db: probe?.ok ? "ok" : "unavailable",
    logging_enabled: conversationLoggingEnabled(env),
    retention_days: { conversations: CONVERSATION_RETENTION_DAYS, events: EVENT_RETENTION_DAYS },
    last_hour: {
      ai_calls: Number(aiRecent?.n || 0),
      route_errors: Number(routeErrors?.n || 0),
    },
    token_source: boundInternalToken(env) ? "binding" : "kv",
  };
}

async function handleErrors(env, url) {
  await ensureTelemetryTables(env);
  const hours = num(url.searchParams.get("hours"), 24, 1, 720);
  const limit = num(url.searchParams.get("limit"), 50, 1, 200);
  const since = windowStart(hours);
  const [ai, routes, reports] = await Promise.all([
    all(
      env,
      `SELECT ts, route, provider, model, kind, status, latency_ms, release, turn_id
         FROM ai_events
        WHERE ts >= ? AND (status >= 500 OR kind IN ('invalid_key','day','minute','timeout','empty','other'))
        ORDER BY ts DESC LIMIT ?`,
      [since, limit],
    ),
    all(
      env,
      `SELECT ts, route, method, status, kind, latency_ms, release
         FROM route_events
        WHERE ts >= ? AND status >= 500
        ORDER BY ts DESC LIMIT ?`,
      [since, limit],
    ),
    all(
      env,
      `SELECT created_at, error_type, endpoint, message
         FROM error_reports WHERE created_at >= ?
        ORDER BY created_at DESC LIMIT ?`,
      [since, limit],
    ),
  ]);
  return { window_hours: hours, ai, routes, reports };
}

async function handleConversations(env, url) {
  await ensureTelemetryTables(env);
  const limit = num(url.searchParams.get("limit"), 50, 1, 200);
  const hours = num(url.searchParams.get("hours"), 720, 1, 8760);
  const since = windowStart(hours);
  const user = text(url.searchParams.get("user"), 80);
  const scenario = text(url.searchParams.get("scenario"), 80);
  const before = num(url.searchParams.get("before"), Date.now(), 0, Number.MAX_SAFE_INTEGER);
  const clauses = ["deleted = 0", "ts >= ?", "ts < ?"];
  const binds = [since, before];
  if (user) {
    clauses.push("user_id = ?");
    binds.push(user);
  }
  if (scenario) {
    clauses.push("scenario = ?");
    binds.push(scenario);
  }
  const rows = await all(
    env,
    `SELECT id, turn_id, session_id, turn_no, ts, ts_local, user_id, plan, scenario, level, outcome, guard,
            latency_ms, provider, model, flagged, redacted,
            substr(COALESCE(learner_text, ''), 1, 200) AS learner_preview
       FROM conversations
      WHERE ${clauses.join(" AND ")}
      ORDER BY ts DESC LIMIT ?`,
    [...binds, limit],
  );
  return { logging_enabled: conversationLoggingEnabled(env), rows };
}

async function handleConversationDetail(env, turnId) {
  await ensureTelemetryTables(env);
  const row = await first(env, `SELECT * FROM conversations WHERE turn_id = ?`, [turnId]);
  if (!row) return null;
  const attempts = await all(
    env,
    `SELECT ts, provider, model, key_id, kind, status, latency_ms FROM conversation_attempts WHERE turn_id = ? ORDER BY ts ASC`,
    [turnId],
  );
  return { conversation: row, attempts };
}

async function handleFlagConversation(env, turnId, request, ctx) {
  await ensureTelemetryTables(env);
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const flagged = body?.flagged === true || body?.flagged === 1 ? 1 : 0;
  const note = text(body?.note, 500) || null;
  try {
    const result = await env.DB.prepare(`UPDATE conversations SET flagged = ?, note = ? WHERE turn_id = ?`)
      .bind(flagged, note, turnId)
      .run();
    const changed = Number(result?.meta?.changes || 0);
    if (changed && ctx) ctx.waitUntil(audit(env, { action: "conversation_flag", target: turnId, meta: flagged ? "flagged" : "cleared" }));
    return { ok: true, changed };
  } catch {
    return { ok: false, changed: 0 };
  }
}

async function handleDeleteConversation(env, turnId, ctx) {
  await ensureTelemetryTables(env);
  try {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM conversation_attempts WHERE turn_id = ?`).bind(turnId),
      env.DB.prepare(`DELETE FROM conversations WHERE turn_id = ?`).bind(turnId),
    ]);
    if (ctx) ctx.waitUntil(audit(env, { action: "conversation_delete", target: turnId }));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function handleDeleteUserConversations(env, userId, ctx) {
  await ensureTelemetryTables(env);
  try {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM conversation_attempts WHERE turn_id IN (SELECT turn_id FROM conversations WHERE user_id = ?)`).bind(userId),
      env.DB.prepare(`DELETE FROM conversations WHERE user_id = ?`).bind(userId),
    ]);
    if (ctx) ctx.waitUntil(audit(env, { action: "user_conversations_delete", target: userId }));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function handleUsers(env, url) {
  const limit = num(url.searchParams.get("limit"), 50, 1, 200);
  const query = text(url.searchParams.get("q"), 80);
  const rows = query
    ? await all(
        env,
        `SELECT id, email, plan, plan_expires_at, created_at, last_seen_at, platform, src
           FROM users WHERE email LIKE ? OR id LIKE ?
          ORDER BY last_seen_at DESC LIMIT ?`,
        [`%${query}%`, `%${query}%`, limit],
      )
    : await all(
        env,
        `SELECT id, email, plan, plan_expires_at, created_at, last_seen_at, platform, src
           FROM users ORDER BY last_seen_at DESC LIMIT ?`,
        [limit],
      );
  const [total, pro] = await Promise.all([
    first(env, `SELECT COUNT(*) AS n FROM users`),
    first(env, `SELECT COUNT(*) AS n FROM users WHERE plan = 'pro'`),
  ]);
  return { total: Number(total?.n || 0), pro: Number(pro?.n || 0), rows };
}

const CONTENT_TABLES = ["scenarios", "vocabulary", "grammar", "starter_phrases", "curriculum_lessons"];

async function handleContent(env) {
  const counts = {};
  for (const table of CONTENT_TABLES) {
    const row = await first(env, `SELECT COUNT(*) AS n FROM ${table}`);
    counts[table] = row ? Number(row.n || 0) : null;
  }
  const recent = await all(
    env,
    `SELECT event_type, COUNT(*) AS n FROM activity_log
      WHERE created_at >= ? AND event_type LIKE 'content%'
      GROUP BY event_type ORDER BY n DESC LIMIT 20`,
    [windowStart(168)],
  );
  return { counts, recent_activity: recent };
}

/**
 * Alert rules, evaluated on demand. They are deliberately simple, explainable
 * thresholds — an operator must be able to read why a card is red.
 */
async function handleAlerts(env) {
  await ensureTelemetryTables(env);
  const since = windowStart(1);
  const [aiTotal, aiBad, routeTotal, routeErrors, invalidKeys, dayQuota, timeout, slow] = await Promise.all([
    first(env, `SELECT COUNT(*) AS n FROM ai_events WHERE ts >= ?`, [since]),
    first(env, `SELECT COUNT(*) AS n FROM ai_events WHERE ts >= ? AND kind NOT IN ('ok')`, [since]),
    first(env, `SELECT COUNT(*) AS n FROM route_events WHERE ts >= ?`, [since]),
    first(env, `SELECT COUNT(*) AS n FROM route_events WHERE ts >= ? AND status >= 500`, [since]),
    first(env, `SELECT COUNT(*) AS n FROM ai_events WHERE ts >= ? AND kind = 'invalid_key'`, [since]),
    first(env, `SELECT COUNT(*) AS n FROM ai_events WHERE ts >= ? AND kind = 'day'`, [since]),
    first(env, `SELECT COUNT(*) AS n FROM ai_events WHERE ts >= ? AND kind = 'timeout'`, [since]),
    first(env, `SELECT AVG(latency_ms) AS avg FROM ai_events WHERE ts >= ?`, [since]),
  ]);
  const num_ = (row) => Number(row?.n || 0);
  const alerts = [];
  if (num_(invalidKeys) > 0) {
    alerts.push({ level: "critical", code: "invalid_key", value: num_(invalidKeys), message: "A provider rejected its key. Turn that entry off and replace the key." });
  }
  const total = num_(routeTotal);
  const errors = num_(routeErrors);
  if (total >= 20 && errors / total > 0.02) {
    alerts.push({ level: "critical", code: "route_error_rate", value: Number((errors / total).toFixed(4)), message: "More than 2% of API requests failed in the last hour." });
  }
  if (num_(dayQuota) > 0) {
    alerts.push({ level: "warn", code: "day_quota", value: num_(dayQuota), message: "A provider hit its daily quota. Traffic failed over to the next tier." });
  }
  if (num_(timeout) >= 3) {
    alerts.push({ level: "warn", code: "timeouts", value: num_(timeout), message: "Timeouts are rising; check provider latency." });
  }
  const avg = slow?.avg === null || slow?.avg === undefined ? null : Math.round(Number(slow.avg));
  if (avg !== null && avg > 8000) {
    alerts.push({ level: "warn", code: "slow_ai", value: avg, message: "Average AI latency is above 8 seconds." });
  }
  const aiFailedRate = num_(aiTotal) ? num_(aiBad) / num_(aiTotal) : 0;
  if (num_(aiTotal) >= 20 && aiFailedRate > 0.25) {
    alerts.push({ level: "warn", code: "ai_failure_rate", value: Number(aiFailedRate.toFixed(4)), message: "More than a quarter of AI calls did not succeed in the last hour." });
  }
  return {
    generated_at: Date.now(),
    window_hours: 1,
    alerts,
    counts: {
      ai_calls: num_(aiTotal), ai_not_ok: num_(aiBad), route_requests: total, route_errors: errors,
    },
  };
}

async function handleAudit(env, url) {
  await ensureTelemetryTables(env);
  const limit = num(url.searchParams.get("limit"), 100, 1, 500);
  const rows = await all(env, `SELECT ts, actor, action, target, meta FROM admin_audit ORDER BY ts DESC LIMIT ?`, [limit]);
  return { rows };
}

async function handleExport(env, request) {
  await ensureTelemetryTables(env);
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const hours = num(body?.hours, 720, 1, 8760);
  const userId = text(body?.user_id, 80);
  const since = windowStart(hours);
  const clauses = ["ts >= ?"];
  const binds = [since];
  if (userId) {
    clauses.push("user_id = ?");
    binds.push(userId);
  }
  const rows = await all(
    env,
    `SELECT turn_id, session_id, turn_no, ts, ts_local, user_id, plan, scenario, level,
            learner_text, reply_text, hints, corrections, word_cards, outcome, guard,
            latency_ms, provider, model, flagged, note, redacted
       FROM conversations WHERE ${clauses.join(" AND ")} ORDER BY ts ASC LIMIT 5000`,
    binds,
  );
  return {
    generated_at: Date.now(),
    window_hours: hours,
    user_id: userId || null,
    logging_enabled: conversationLoggingEnabled(env),
    turns: rows,
  };
}

async function handleRetentionSweep(env, ctx) {
  const result = await sweepConversationText(env);
  if (ctx) ctx.waitUntil(audit(env, { action: "retention_sweep", target: "conversations", meta: JSON.stringify(result).slice(0, 400) }));
  return { ok: true, ...result };
}

/**
 * Disable (or re-enable) one provider entry through the existing owner config.
 * This is the safe shape of "disable a key": the router's rotation is untouched,
 * and the owner can reverse it from the same panel. Key values are never read,
 * written or shown — only the entry name and, for information, the fingerprint
 * the telemetry rows already carry.
 */
async function handleProviderState(env, request, ctx, deps) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const provider = text(body?.provider, 40);
  const enabled = body?.enabled === true;
  if (!provider) return { status: 400, body: { error: "provider_required" } };
  const setter = deps?.setDefaultProviderState;
  if (typeof setter !== "function") return { status: 503, body: { error: "provider_config_unavailable" } };
  const result = await setter(env, provider, enabled);
  const status = Number(result?.status) || 200;
  if (status >= 200 && status < 300) {
    if (ctx) ctx.waitUntil(audit(env, { action: enabled ? "provider_enable" : "provider_disable", target: provider }));
  }
  return { status, body: result?.body || {} };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<Response|null>} a response for `/internal/*`, or null when
 * the path is not ours so the worker router continues untouched.
 */
export async function handleInternalAdminRoutes(url, request, env, cors, ctx, deps = {}) {
  const pathname = url?.pathname || "";
  if (pathname !== INTERNAL_ADMIN_PREFIX && !pathname.startsWith(INTERNAL_ADMIN_PREFIX + "/")) return null;

  const limited = withinRateLimit(request);
  if (!limited.ok) {
    return json({ error: "rate_limited", retry_after_ms: Math.max(0, limited.resetAt - Date.now()) }, 429, {
      "Retry-After": String(Math.max(1, Math.ceil((limited.resetAt - Date.now()) / 1000))),
    });
  }

  // Deny before route matching: an unauthenticated caller learns nothing about
  // which internal paths exist.
  if (!(await isInternalAuthorized(request, env))) {
    return json({ error: "unauthorized" }, 401);
  }

  const rest = pathname.slice(INTERNAL_ADMIN_PREFIX.length).replace(/^\/+/, "");
  const segments = rest ? rest.split("/") : [];
  const method = String(request.method || "GET").toUpperCase();

  try {
    if (segments.length === 0) return json({ error: "not_found" }, 404);

    if (segments[0] === "health" && segments.length === 1) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return json(await handleHealth(env), 200);
    }
    if (segments[0] === "overview" && segments.length === 1) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return json(await handleOverview(env, url), 200);
    }
    if (segments[0] === "errors" && segments.length === 1) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return json(await handleErrors(env, url), 200);
    }
    if (segments[0] === "alerts" && segments.length === 1) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return json(await handleAlerts(env), 200);
    }
    if (segments[0] === "audit" && segments.length === 1) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return json(await handleAudit(env, url), 200);
    }
    if (segments[0] === "users" && segments.length === 1) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return json(await handleUsers(env, url), 200);
    }
    if (segments[0] === "users" && segments.length === 3 && segments[2] === "conversations") {
      if (method !== "DELETE") return json({ error: "method_not_allowed" }, 405);
      const userId = decodeURIComponent(segments[1] || "").slice(0, 80);
      if (!userId) return json({ error: "user_required" }, 400);
      return json(await handleDeleteUserConversations(env, userId, ctx), 200);
    }
    if (segments[0] === "content" && segments.length === 1) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return json(await handleContent(env), 200);
    }
    if (segments[0] === "content" && segments.length >= 2) {
      const actor = String(request.headers.get("x-admin-actor") || "").trim().slice(0, 120);
      const response = await handleContentAdminRequest(segments.slice(1), {
        method,
        url,
        request,
        env,
        ctx,
        actor,
      });
      return response || json({ error: "not_found" }, 404);
    }
    if (segments[0] === "conversations" && segments.length === 1) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return json(await handleConversations(env, url), 200);
    }
    if (segments[0] === "conversations" && segments.length === 2) {
      const turnId = decodeURIComponent(segments[1] || "").slice(0, 64);
      if (!turnId) return json({ error: "turn_required" }, 400);
      if (method === "GET") {
        const detail = await handleConversationDetail(env, turnId);
        return detail ? json(detail, 200) : json({ error: "not_found" }, 404);
      }
      if (method === "DELETE") return json(await handleDeleteConversation(env, turnId, ctx), 200);
      return json({ error: "method_not_allowed" }, 405);
    }
    if (segments[0] === "conversations" && segments.length === 3 && segments[2] === "flag") {
      if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const turnId = decodeURIComponent(segments[1] || "").slice(0, 64);
      if (!turnId) return json({ error: "turn_required" }, 400);
      return json(await handleFlagConversation(env, turnId, request, ctx), 200);
    }
    if (segments[0] === "export") {
      if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const payload = await handleExport(env, request);
      ctx?.waitUntil?.(audit(env, { action: "conversation_export", target: payload.user_id || "all", meta: `hours=${payload.window_hours}` }));
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="katzu-conversations-${Date.now()}.json"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (segments[0] === "retention" && segments[1] === "sweep") {
      if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return json(await handleRetentionSweep(env, ctx), 200);
    }
    if (segments[0] === "providers" && segments[1] === "state") {
      if (method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const result = await handleProviderState(env, request, ctx, deps);
      return json(result.body, result.status);
    }
    // Useful to the panel footer: the retention vocabulary the panel displays is
    // the same one the sweep uses. No key material is ever accepted here — the
    // panel has no endpoint that would take a key value.
    if (segments[0] === "retention" && segments.length === 1 && method === "GET") {
      return json(
        {
          conversations_days: CONVERSATION_RETENTION_DAYS,
          events_days: EVENT_RETENTION_DAYS,
          logging_enabled: conversationLoggingEnabled(env),
        },
        200,
      );
    }

    return json({ error: "not_found" }, 404);
  } catch {
    return json({ error: "internal_error" }, 500);
  }
}
