/**
 * Katzu Admin Control Plane — user registry, telemetry, admin API and dashboard.
 *
 * WHY THIS FILE EXISTS (do not merge it back blindly):
 * cloudflare-unified-worker.js is ~171 KB. Measured in this repo, the edit
 * tooling applied diffs reliably up to ~48 KB of byte offset but failed with
 * "old string not found" on grep-verified unique anchors at ~63 KB and beyond —
 * which is exactly where handleAdminLookup and the dashboard renderer used to
 * live. Moving the admin surface here makes it editable again and keeps the
 * main worker as the single Wrangler entrypoint (see wrangler.toml -> main).
 *
 * THE BUG THIS FIXES:
 * Every admin lookup resolved a user via `REDEEMED_CODES.get("email_index:<email>")`,
 * which is written in exactly ONE place — inside handleVerify, at the moment a
 * code is redeemed. A user who signs in with Google but never redeems a code did
 * not exist to the admin system at all ("not found"). There was no canonical list
 * of users, so a SaaS-style dashboard was impossible.
 *
 * The `users` table below is that canonical registry: it is upserted on every
 * session creation, so every free user is now known, searchable, and countable.
 */

// ============================================================================
// 1. ADDITIVE D1 SCHEMA
// Lazy CREATE TABLE IF NOT EXISTS, matching the existing ensureLedgerTables
// pattern in the main worker. No drops, no alterations of existing tables.
// ============================================================================

export async function ensureRegistryTables(env) {
  if (!env?.DB) return false;
  try {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        created_at INTEGER,
        last_seen_at INTEGER,
        plan TEXT DEFAULT 'free',
        plan_expires_at INTEGER,
        last_ip TEXT,
        platform TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        event_type TEXT,
        metadata TEXT,
        created_at INTEGER
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS error_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        error_type TEXT,
        endpoint TEXT,
        message TEXT,
        created_at INTEGER
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen_at)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log (user_id, created_at)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log (event_type, created_at)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_errors_user ON error_reports (user_id, created_at)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_errors_type ON error_reports (error_type, created_at)`),
    ]);
    return true;
  } catch (e) {
    console.error("[registry] ensure tables failed:", String(e?.message || e).slice(0, 120));
    return false;
  }
}

// ============================================================================
// 2. SANITIZER — telemetry must never persist credentials
// Strips credential-shaped substrings (session tokens, Google JWTs, API keys,
// long opaque secrets) before anything is written to activity_log/error_reports.
// ============================================================================

const CREDENTIAL_PATTERNS = [
  /\bsess_[A-Za-z0-9._-]{8,}/g, // worker session tokens
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, // JWTs (any)
  /\bAIza[A-Za-z0-9_-]{10,}/g, // Google API keys
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._-]{8,}/gi,
  /"(?:id_token|session_token|access_token|refresh_token|api_key|authorization|client_secret|password)"\s*:\s*"[^"]*"/gi,
  /[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/g, // long opaque pairs
];

export function sanitizeLogMessage(value, maxLength = 400) {
  if (value === null || value === undefined) return null;
  let text = typeof value === "string" ? value : String(value?.message || value);
  for (const pattern of CREDENTIAL_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }
  text = text.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text.slice(0, maxLength);
}

/** Metadata objects are stored as JSON strings; only scalars survive, values are sanitized. */
function sanitizeMetadata(metadata, maxEntries = 12) {
  if (!metadata || typeof metadata !== "object") return null;
  const out = {};
  let count = 0;
  for (const [key, value] of Object.entries(metadata)) {
    if (count >= maxEntries) break;
    if (typeof key !== "string" || !/^[a-z0-9_]{1,40}$/i.test(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else {
      const clean = sanitizeLogMessage(value, 120);
      if (clean) out[key] = clean;
    }
    count += 1;
  }
  return Object.keys(out).length ? JSON.stringify(out).slice(0, 500) : null;
}

// ============================================================================
// 3. WRITERS — all best-effort. A telemetry failure must never break the
//    primary request, so every writer swallows its own errors after logging.
// ============================================================================

function derivePlatform(request) {
  const ua = (request?.headers?.get?.("User-Agent") || "").slice(0, 200);
  if (!ua) return "unknown";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows|Macintosh|Linux/i.test(ua)) return "web";
  return "other";
}

function deriveIp(request) {
  const ip = request?.headers?.get?.("CF-Connecting-IP") || "";
  return ip ? ip.slice(0, 64) : null;
}

/**
 * Upsert the canonical user row. Called on every session creation, so a user who
 * only signs in (never redeems) is registered and therefore findable by admins.
 * Preserves created_at and plan on subsequent sign-ins.
 */
export async function upsertUserFromAccount(account, request, env, extra = {}) {
  if (!env?.DB || !account?.sub) return false;
  try {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO users (id, email, created_at, last_seen_at, plan, plan_expires_at, last_ip, platform)
       VALUES (?, ?, ?, ?, 'free', NULL, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = COALESCE(excluded.email, users.email),
         last_seen_at = excluded.last_seen_at,
         last_ip = excluded.last_ip,
         platform = excluded.platform`
    )
      .bind(
        account.sub,
        (account.email || "").toLowerCase().trim() || null,
        now,
        now,
        deriveIp(request),
        derivePlatform(request)
      )
      .run();
    if (extra.plan === "pro") {
      await markUserPro(account, extra.planExpiresAt || null, env);
    }
    return true;
  } catch (e) {
    console.error("[registry] upsert user failed:", String(e?.message || e).slice(0, 120));
    return false;
  }
}

/** Flip a user to pro (activation-code redemption). Creates the row if absent. */
export async function markUserPro(account, expiresAtIso, env) {
  if (!env?.DB || !account?.sub) return false;
  try {
    const now = Date.now();
    const expiresAt = expiresAtIso ? new Date(expiresAtIso).getTime() : null;
    await env.DB.prepare(
      `INSERT INTO users (id, email, created_at, last_seen_at, plan, plan_expires_at)
       VALUES (?, ?, ?, ?, 'pro', ?)
       ON CONFLICT(id) DO UPDATE SET
         plan = 'pro',
         plan_expires_at = excluded.plan_expires_at,
         email = COALESCE(excluded.email, users.email),
         last_seen_at = excluded.last_seen_at`
    )
      .bind(account.sub, (account.email || "").toLowerCase().trim() || null, now, now, expiresAt)
      .run();
    return true;
  } catch (e) {
    console.error("[registry] mark pro failed:", String(e?.message || e).slice(0, 120));
    return false;
  }
}

/** Downgrade/expire a plan server-side (admin revoke). */
export async function setUserPlanBySub(env, sub, plan, expiresAtMs) {
  if (!env?.DB || !sub) return false;
  try {
    await env.DB.prepare(
      "UPDATE users SET plan = ?, plan_expires_at = ?, last_seen_at = last_seen_at WHERE id = ?"
    )
      .bind(plan, expiresAtMs === undefined ? null : expiresAtMs, sub)
      .run();
    return true;
  } catch (e) {
    console.error("[registry] set plan failed:", String(e?.message || e).slice(0, 120));
    return false;
  }
}

export async function recordActivity(env, userId, eventType, metadata) {
  if (!env?.DB || !eventType) return false;
  try {
    await env.DB.prepare(
      "INSERT INTO activity_log (user_id, event_type, metadata, created_at) VALUES (?, ?, ?, ?)"
    )
      .bind(userId || null, String(eventType).slice(0, 60), sanitizeMetadata(metadata), Date.now())
      .run();
    return true;
  } catch (e) {
    console.error("[registry] activity insert failed:", String(e?.message || e).slice(0, 120));
    return false;
  }
}

export async function recordError(env, userId, errorType, endpoint, message) {
  if (!env?.DB) return false;
  try {
    await env.DB.prepare(
      "INSERT INTO error_reports (user_id, error_type, endpoint, message, created_at) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(
        userId || null,
        sanitizeLogMessage(errorType, 80) || "unknown",
        sanitizeLogMessage(endpoint, 120),
        sanitizeLogMessage(message),
        Date.now()
      )
      .run();
    return true;
  } catch (e) {
    console.error("[registry] error insert failed:", String(e?.message || e).slice(0, 120));
    return false;
  }
}

/**
 * Account deletion cleanup. Removes the user's registry row (email, IP,
 * platform) and their per-user telemetry rows, so a "deleted" account leaves
 * no personal identifiers behind. The caller logs an anonymized
 * `account_deleted` activity row afterwards for the audit trail.
 */
export async function purgeUserRegistry(env, sub) {
  if (!env?.DB || !sub) return false;
  let ok = true;
  const steps = [
    ["users", "DELETE FROM users WHERE id = ?", [sub]],
    ["activity_log", "DELETE FROM activity_log WHERE user_id = ?", [sub]],
    ["error_reports", "DELETE FROM error_reports WHERE user_id = ?", [sub]],
  ];
  for (const [name, sql, binds] of steps) {
    try {
      await env.DB.prepare(sql).bind(...binds).run();
    } catch (e) {
      ok = false;
      console.error("[registry] purge " + name + " failed:", String(e?.message || e).slice(0, 120));
    }
  }
  return ok;
}

// ============================================================================
// 4. READERS
// ============================================================================

/** Canonical resolution: users table first, KV email_index only as a legacy fallback. */
export async function resolveUserRecord(env, { email, id } = {}) {
  const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
  let user = null;
  let source = null;

  if (env?.DB) {
    try {
      if (id) {
        user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
        if (user) source = "users";
      }
      if (!user && normalizedEmail) {
        user = await env.DB.prepare("SELECT * FROM users WHERE lower(email) = ?")
          .bind(normalizedEmail)
          .first();
        if (user) source = "users";
      }
    } catch (e) {
      console.error("[registry] user lookup failed:", String(e?.message || e).slice(0, 120));
    }
  }

  // Legacy fallback: users created before this migration (redeemers only).
  let sub = user?.id || id || null;
  let kvAccount = null;
  if (!user && env?.REDEEMED_CODES) {
    if (!sub && normalizedEmail) {
      sub = (await env.REDEEMED_CODES.get(`email_index:${normalizedEmail}`)) || null;
    }
    if (sub) {
      const raw = await env.REDEEMED_CODES.get(`account:${sub}`);
      if (raw) {
        try {
          kvAccount = JSON.parse(raw);
        } catch {}
        source = source || "email_index";
      }
    }
  } else if (sub && env?.REDEEMED_CODES) {
    const raw = await env.REDEEMED_CODES.get(`account:${sub}`);
    if (raw) {
      try {
        kvAccount = JSON.parse(raw);
      } catch {}
    }
  }

  if (!sub && !user) return null;

  // Subscription truth: prefer the KV account record (what /check-status reads),
  // fall back to the registry column for users whose KV record expired away.
  const kvExpiresAt = kvAccount?.expiresAt || null;
  const registryExpiresAt = user?.plan_expires_at ? new Date(user.plan_expires_at).toISOString() : null;
  const expiresAt = kvExpiresAt || registryExpiresAt || null;
  const active = Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());
  const plan = active ? "pro" : user?.plan === "pro" ? "pro_expired" : "free";

  return {
    sub,
    email: user?.email || kvAccount?.email || normalizedEmail || null,
    plan,
    active,
    expiresAt,
    createdAt: user?.created_at || null,
    lastSeenAt: user?.last_seen_at || null,
    lastIp: user?.last_ip || null,
    platform: user?.platform || null,
    registered: Boolean(user),
    registryOnly: Boolean(user) && !user?.plan_expires_at && plan === "free" ? false : false,
    source: source || null,
  };
}

export async function listUsers(env, { plan = null, q = null, limit = 50, offset = 0 } = {}) {
  if (!env?.DB) return { total: 0, users: [], limit, offset, available: false };
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  const where = [];
  const binds = [];
  const now = Date.now();

  if (plan === "pro") {
    where.push("plan = 'pro' AND plan_expires_at IS NOT NULL AND plan_expires_at > ?");
    binds.push(now);
  } else if (plan === "expired") {
    where.push("plan = 'pro' AND (plan_expires_at IS NULL OR plan_expires_at <= ?)");
    binds.push(now);
  } else if (plan === "free") {
    where.push("(plan IS NULL OR plan = 'free' OR plan_expires_at IS NULL OR plan_expires_at <= ?)");
    binds.push(now);
  }
  if (q) {
    where.push("(lower(email) LIKE ? OR id LIKE ?)");
    const like = `%${String(q).toLowerCase().trim()}%`;
    binds.push(like, `%${String(q).trim()}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users ${whereSql}`)
      .bind(...binds)
      .first();
    const { results } = await env.DB.prepare(
      `SELECT * FROM users ${whereSql} ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`
    )
      .bind(...binds, safeLimit, safeOffset)
      .all();
    const users = (results || []).map((row) => {
      const active = Boolean(row.plan_expires_at && row.plan_expires_at > now);
      return {
        id: row.id,
        email: row.email,
        plan: active ? "pro" : row.plan === "pro" ? "pro_expired" : "free",
        plan_expires_at: row.plan_expires_at || null,
        created_at: row.created_at || null,
        last_seen_at: row.last_seen_at || null,
        last_ip: row.last_ip || null,
        platform: row.platform || null,
      };
    });
    return { total: totalRow?.c || 0, users, limit: safeLimit, offset: safeOffset, available: true };
  } catch (e) {
    console.error("[registry] list users failed:", String(e?.message || e).slice(0, 120));
    return { total: 0, users: [], limit: safeLimit, offset: safeOffset, available: false };
  }
}

export async function getUserActivity(env, userId, limit = 50) {
  if (!env?.DB || !userId) return [];
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
    )
      .bind(userId, safeLimit)
      .all();
    return results || [];
  } catch {
    return [];
  }
}

export async function getUserErrors(env, userId, limit = 50) {
  if (!env?.DB || !userId) return [];
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM error_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
    )
      .bind(userId, safeLimit)
      .all();
    return results || [];
  } catch {
    return [];
  }
}

export async function listActivity(env, { eventType = null, limit = 100 } = {}) {
  if (!env?.DB) return [];
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300);
  try {
    const { results } = eventType
      ? await env.DB.prepare(
          "SELECT * FROM activity_log WHERE event_type = ? ORDER BY created_at DESC LIMIT ?"
        )
          .bind(String(eventType).slice(0, 60), safeLimit)
          .all()
      : await env.DB.prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?")
          .bind(safeLimit)
          .all();
    return results || [];
  } catch {
    return [];
  }
}

export async function listErrors(env, { errorType = null, limit = 100 } = {}) {
  if (!env?.DB) return [];
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300);
  try {
    const { results } = errorType
      ? await env.DB.prepare(
          "SELECT * FROM error_reports WHERE error_type = ? ORDER BY created_at DESC LIMIT ?"
        )
          .bind(String(errorType).slice(0, 80), safeLimit)
          .all()
      : await env.DB.prepare("SELECT * FROM error_reports ORDER BY created_at DESC LIMIT ?")
          .bind(safeLimit)
          .all();
    return results || [];
  } catch {
    return [];
  }
}

export async function getRegistryStats(env) {
  const empty = {
    available: false,
    total_users: 0,
    free_users: 0,
    pro_users: 0,
    expired_pro_users: 0,
    conversion_rate: 0,
    new_24h: 0,
    new_7d: 0,
    new_30d: 0,
    active_24h: 0,
    active_7d: 0,
    redemptions_total: 0,
    activity_24h: 0,
    errors_24h: 0,
    errors_7d: 0,
    error_rate_24h: 0,
    ai_turns_24h: 0,
    ai_failures_24h: 0,
    signups_by_day: [],
    top_events: [],
    top_errors: [],
  };
  if (!env?.DB) return empty;
  const now = Date.now();
  const day = 86400000;
  const count = async (sql, ...binds) => {
    try {
      const row = await env.DB.prepare(sql).bind(...binds).first();
      return row?.c || 0;
    } catch {
      return 0;
    }
  };

  try {
    const totals = await env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN plan = 'pro' AND plan_expires_at > ?1 THEN 1 ELSE 0 END) AS pro,
         SUM(CASE WHEN plan = 'pro' AND (plan_expires_at IS NULL OR plan_expires_at <= ?1) THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN created_at > ?2 THEN 1 ELSE 0 END) AS new24,
         SUM(CASE WHEN created_at > ?3 THEN 1 ELSE 0 END) AS new7,
         SUM(CASE WHEN created_at > ?4 THEN 1 ELSE 0 END) AS new30,
         SUM(CASE WHEN last_seen_at > ?2 THEN 1 ELSE 0 END) AS active24,
         SUM(CASE WHEN last_seen_at > ?3 THEN 1 ELSE 0 END) AS active7
       FROM users`
    )
      .bind(now, now - day, now - 7 * day, now - 30 * day)
      .first();

    const totalUsers = totals?.total || 0;
    const proUsers = totals?.pro || 0;
    const expiredPro = totals?.expired || 0;

    const errors24 = await count("SELECT COUNT(*) AS c FROM error_reports WHERE created_at > ?", now - day);
    const errors7 = await count("SELECT COUNT(*) AS c FROM error_reports WHERE created_at > ?", now - 7 * day);
    const activity24 = await count("SELECT COUNT(*) AS c FROM activity_log WHERE created_at > ?", now - day);
    const redemptions = await count("SELECT COUNT(*) AS c FROM redeemed_codes_ledger");

    let signupsByDay = [];
    let topEvents = [];
    let topErrors = [];
    try {
      const { results } = await env.DB.prepare(
        `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS c
         FROM users WHERE created_at > ?
         GROUP BY day ORDER BY day ASC LIMIT 30`
      )
        .bind(now - 30 * day)
        .all();
      signupsByDay = results || [];
    } catch {}
    try {
      const { results } = await env.DB.prepare(
        `SELECT event_type, COUNT(*) AS c FROM activity_log WHERE created_at > ?
         GROUP BY event_type ORDER BY c DESC LIMIT 12`
      )
        .bind(now - 7 * day)
        .all();
      topEvents = results || [];
    } catch {}
    try {
      const { results } = await env.DB.prepare(
        `SELECT error_type, COUNT(*) AS c FROM error_reports WHERE created_at > ?
         GROUP BY error_type ORDER BY c DESC LIMIT 12`
      )
        .bind(now - 7 * day)
        .all();
      topErrors = results || [];
    } catch {}

    const active24 = totals?.active24 || 0;
    return {
      available: true,
      total_users: totalUsers,
      free_users: Math.max(totalUsers - proUsers - expiredPro, 0),
      pro_users: proUsers,
      expired_pro_users: expiredPro,
      conversion_rate: totalUsers ? Math.round((proUsers / totalUsers) * 1000) / 10 : 0,
      new_24h: totals?.new24 || 0,
      new_7d: totals?.new7 || 0,
      new_30d: totals?.new30 || 0,
      active_24h: active24,
      active_7d: totals?.active7 || 0,
      redemptions_total: redemptions,
      activity_24h: activity24,
      errors_24h: errors24,
      errors_7d: errors7,
      // "Errors per 100 active users today" — the decision-useful error metric.
      error_rate_24h: active24 ? Math.round((errors24 / active24) * 1000) / 10 : 0,
      ai_turns_24h: 0,
      ai_failures_24h: 0,
      signups_by_day: signupsByDay,
      top_events: topEvents,
      top_errors: topErrors,
    };
  } catch (e) {
    console.error("[registry] stats failed:", String(e?.message || e).slice(0, 120));
    return empty;
  }
}

export async function getUserRedemptionCount(env, userId) {
  if (!env?.DB || !userId) return 0;
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM redeemed_codes_ledger WHERE account_id = ?"
    )
      .bind(userId)
      .first();
    return row?.c || 0;
  } catch {
    return 0;
  }
}

// ============================================================================
// 4b. ROUTER-LEVEL TELEMETRY HOOKS
//
// handleVerify (~83 KB into the main worker) and the AI turn handler sit past
// the edit tooling's reliable byte range, so their registry write-through is
// applied by WRAPPING the handler at the router instead of editing inside it.
// The wrapped handler logic is untouched, so its existing tests still hold.
// ============================================================================

/** Read-only mirror of the worker's session resolution (that helper is not
 *  exported and lives past the editable range). Never mutates KV. */
export async function resolveSessionSubFromRequest(request, env) {
  try {
    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || !token.startsWith("sess_") || !env?.USER_PROGRESS) return null;
    const raw = await env.USER_PROGRESS.get("session:" + token);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record?.sub || Date.now() > record.expires_at) return null;
    return { sub: record.sub, email: record.email || "" };
  } catch {
    return null;
  }
}

/**
 * After a successful /verify, flip the registry row to pro and log the event.
 * handleVerify itself is untouched; this reads its JSON result (which carries
 * email/months/expiresAt) and applies the registry write-through.
 */
export async function withVerifyRegistry(runHandler, env) {
  let response;
  try {
    response = await runHandler();
  } catch (e) {
    await recordError(env, null, "verify_error", "/verify", e);
    throw e;
  }
  try {
    const data = await response.clone().json();
    if (data && data.valid === true) {
      const record = await resolveUserRecord(env, { email: data.email });
      if (record?.sub) {
        await markUserPro({ sub: record.sub, email: record.email || data.email }, data.expiresAt || null, env);
        await recordActivity(env, record.sub, "code_redeemed", { months: data.months });
      }
    }
  } catch (e) {
    console.error("[registry] verify hook failed:", String(e?.message || e).slice(0, 120));
  }
  return response;
}

/**
 * Log every AI call outcome.
 * - activity: success, quota (429) and server failures (>=500) — the signals
 *   that actually inform product decisions, without flooding D1 on 400/401.
 * - error_reports: only 5xx provider/server failures, per the error taxonomy.
 */
export async function withAiTelemetry(runHandler, request, env, eventPrefix = "ai_turn") {
  let response;
  try {
    response = await runHandler();
  } catch (e) {
    const account = await resolveSessionSubFromRequest(request, env);
    await recordActivity(env, account?.sub || null, eventPrefix + "_failed", { code: "threw" });
    await recordError(env, account?.sub || null, eventPrefix + "_error", safePath(request), e);
    throw e;
  }
  try {
    const status = response.status;
    const account = await resolveSessionSubFromRequest(request, env);
    const ok = status < 300;
    const worthLogging = ok || status === 429 || status >= 500;
    if (worthLogging) {
      await recordActivity(env, account?.sub || null, eventPrefix + (ok ? "_completed" : "_failed"), { status });
    }
    if (status >= 500) {
      const data = await response.clone().json().catch(() => null);
      await recordError(
        env,
        account?.sub || null,
        eventPrefix + "_error",
        safePath(request),
        data?.message || data?.error || ("HTTP " + status)
      );
    }
  } catch (e) {
    console.error("[registry] ai telemetry failed:", String(e?.message || e).slice(0, 120));
  }
  return response;
}

function safePath(request) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

// ============================================================================
// 5. ADMIN ROUTES
// Returns a Response for routes it owns, or null so the main worker's router
// continues to its legacy handlers (content CRUD, upload, generate, ...).
// ============================================================================

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

/** Same gate as the main worker's checkAdminAuth — do not weaken. */
function checkAdminAuth(request, env) {
  const auth = request.headers.get("Authorization");
  return Boolean(env?.ADMIN_SECRET) && auth === `Bearer ${env.ADMIN_SECRET}`;
}

const ADMIN_API_PREFIX = "/admin/api/";

export async function handleAdminRoutes(url, request, env, cors) {
  const path = url.pathname;
  const method = request.method;
  const isApi = path.startsWith(ADMIN_API_PREFIX);
  const isLegacyAdminAction =
    path === "/admin/lookup" ||
    path === "/admin/edit" ||
    path === "/admin/revoke" ||
    path === "/admin/progress-lookup" ||
    path === "/admin/progress-edit";

  // Dashboard shell (same model as before: the shell is public, every data
  // endpoint below requires the admin bearer secret).
  if ((path === "/admin" || path === "/admin/") && method === "GET") {
    // The registry tables are otherwise created lazily by ensureLedgerTables,
    // which the AI / verify / referral paths reach — but a freshly deployed
    // worker that only serves dashboard traffic would have no `users` table, and
    // a free user's lookup would then fall back to KV and wrongly report
    // "not found". Ensure the schema at the dashboard entry point (idempotent).
    await ensureRegistryTables(env);
    return new Response(renderAdminDashboardHtml(env), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  if (!isApi && !isLegacyAdminAction) return null;
  if (method !== "POST" && !(isApi && method === "GET")) {
    if (!isApi) return null;
  }

  if (!checkAdminAuth(request, env)) return json({ error: "unauthorized" }, 401, cors);

  // Same guarantee for direct API/legacy calls that skip the dashboard shell.
  await ensureRegistryTables(env);

  const body = method === "POST" ? await request.json().catch(() => null) : null;

  try {
    // ---------------- Registry API (new) ----------------
    if (isApi) {
      const action = path.slice(ADMIN_API_PREFIX.length);

      if (action === "overview" && method === "GET") {
        const [stats, recentActivity, recentErrors] = await Promise.all([
          getRegistryStats(env),
          listActivity(env, { limit: 15 }),
          listErrors(env, { limit: 15 }),
        ]);
        return json({ stats, recent_activity: recentActivity, recent_errors: recentErrors }, 200, cors);
      }

      if (action === "users" && method === "GET") {
        const result = await listUsers(env, {
          plan: url.searchParams.get("plan"),
          q: url.searchParams.get("q"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        });
        return json(result, 200, cors);
      }

      if (action === "user" && method === "GET") {
        const userId = url.searchParams.get("id");
        const email = url.searchParams.get("email");
        const record = await resolveUserRecord(env, { id: userId, email });
        if (!record) return json({ found: false }, 200, cors);
        const [activity, errors, redemptions] = await Promise.all([
          getUserActivity(env, record.sub, 50),
          getUserErrors(env, record.sub, 50),
          getUserRedemptionCount(env, record.sub),
        ]);
        return json({ found: true, user: record, activity, errors, redemptions }, 200, cors);
      }

      if (action === "activity" && method === "GET") {
        return json(
          { activity: await listActivity(env, { eventType: url.searchParams.get("event_type"), limit: url.searchParams.get("limit") }) },
          200,
          cors
        );
      }

      if (action === "errors" && method === "GET") {
        return json(
          { errors: await listErrors(env, { errorType: url.searchParams.get("error_type"), limit: url.searchParams.get("limit") }) },
          200,
          cors
        );
      }

      if (action === "backfill-preview" && method === "GET") {
        // Read-only inventory of what a backfill could recover. Never writes.
        return json(await previewBackfill(env), 200, cors);
      }

      return json({ error: "unknown_admin_api_route", action }, 404, cors);
    }

    // ---------------- Legacy admin actions, now registry-first ----------------

    const email = body?.email ? String(body.email).toLowerCase().trim() : null;

    if (path === "/admin/lookup") {
      if (!email) return json({ error: "missing_email" }, 400, cors);
      const record = await resolveUserRecord(env, { email });
      if (!record) return json({ found: false }, 200, cors);
      return json({
        found: true,
        sub: record.sub,
        email: record.email,
        expiresAt: record.expiresAt,
        active: record.active,
        updatedAt: record.lastSeenAt ? new Date(record.lastSeenAt).toISOString() : null,
        plan: record.plan,
        registered: record.registered,
        createdAt: record.createdAt,
        lastSeenAt: record.lastSeenAt,
        platform: record.platform,
        lastIp: record.lastIp,
        source: record.source,
      }, 200, cors);
    }

    if (path === "/admin/edit") {
      if (!email) return json({ error: "missing_email" }, 400, cors);
      const record = await resolveUserRecord(env, { email });
      if (!record?.sub) return json({ error: "user_not_found" }, 404, cors);

      const accountKey = `account:${record.sub}`;
      const kvRaw = await env.REDEEMED_CODES.get(accountKey);
      const kvRecord = kvRaw ? JSON.parse(kvRaw) : { email: record.email, expiresAt: null };

      let newExpiresAt;
      if (body.set_expiresAt !== undefined) {
        newExpiresAt = body.set_expiresAt ? new Date(body.set_expiresAt).toISOString() : null;
      } else if (body.add_months !== undefined) {
        const months = Number(body.add_months);
        if (isNaN(months)) return json({ error: "invalid_add_months" }, 400, cors);
        const now = new Date();
        let base = now;
        if (kvRecord.expiresAt) {
          const existing = new Date(kvRecord.expiresAt);
          if (!isNaN(existing.getTime())) base = existing;
        }
        const target = new Date(base);
        target.setUTCMonth(target.getUTCMonth() + months);
        newExpiresAt = target.toISOString();
      } else {
        return json({ error: "must_provide_set_expiresAt_or_add_months" }, 400, cors);
      }

      kvRecord.expiresAt = newExpiresAt;
      kvRecord.email = kvRecord.email || record.email;
      kvRecord.updatedAt = new Date().toISOString();
      await env.REDEEMED_CODES.put(accountKey, JSON.stringify(kvRecord));
      if (record.email) {
        await env.REDEEMED_CODES.put(`email_index:${record.email}`, record.sub);
      }
      // Keep the registry in step so the dashboard and lookups agree with KV.
      const active = Boolean(newExpiresAt && new Date(newExpiresAt).getTime() > Date.now());
      await setUserPlanBySub(env, record.sub, active ? "pro" : "free", newExpiresAt ? new Date(newExpiresAt).getTime() : null);
      await recordActivity(env, record.sub, "plan_edited", { months: body.add_months ?? null, active });

      return json({ success: true, new_expires_at: newExpiresAt, sub: record.sub }, 200, cors);
    }

    if (path === "/admin/revoke") {
      if (!email) return json({ error: "missing_email" }, 400, cors);
      const record = await resolveUserRecord(env, { email });
      if (!record?.sub) return json({ error: "user_not_found" }, 404, cors);

      const accountKey = `account:${record.sub}`;
      const kvRaw = await env.REDEEMED_CODES.get(accountKey);
      const kvRecord = kvRaw ? JSON.parse(kvRaw) : { email: record.email };
      kvRecord.expiresAt = new Date().toISOString();
      kvRecord.updatedAt = kvRecord.expiresAt;
      await env.REDEEMED_CODES.put(accountKey, JSON.stringify(kvRecord));
      await setUserPlanBySub(env, record.sub, "free", null);
      await recordActivity(env, record.sub, "plan_revoked", { by: "admin" });

      return json({ success: true, revoked_at: kvRecord.expiresAt, sub: record.sub }, 200, cors);
    }

    if (path === "/admin/progress-lookup") {
      if (!email) return json({ error: "missing_email" }, 400, cors);
      const record = await resolveUserRecord(env, { email });
      if (!record?.sub) return json({ error: "user_not_found" }, 404, cors);

      const raw = await env.USER_PROGRESS.get(`progress:${record.sub}`);
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

    if (path === "/admin/progress-edit") {
      if (!email) return json({ error: "missing_email" }, 400, cors);
      const progress = body?.progress;
      if (!progress || typeof progress !== "object") {
        return json({ error: "missing_or_invalid_progress_object" }, 400, cors);
      }
      const record = await resolveUserRecord(env, { email });
      if (!record?.sub) return json({ error: "user_not_found" }, 404, cors);

      const updatedProgress = { ...progress, updated_at: Date.now() };
      await env.USER_PROGRESS.put(`progress:${record.sub}`, JSON.stringify(updatedProgress));
      await recordActivity(env, record.sub, "progress_edited", { by: "admin" });
      return json({ success: true, updated_at: updatedProgress.updated_at }, 200, cors);
    }

    return null;
  } catch (e) {
    console.error("[admin] route failed:", String(e?.message || e).slice(0, 200));
    return json({ error: "admin_route_failed", message: sanitizeLogMessage(e) }, 500, cors);
  }
}

/**
 * Step 6 helper — READ ONLY. Inventories legacy KV users that a backfill could
 * seed into `users`. Free users who never redeemed and never signed in have no
 * KV footprint and CANNOT be recovered retroactively; this is reported honestly
 * rather than fabricated.
 */
export async function previewBackfill(env, { emailIndexKeys = [] } = {}) {
  const result = {
    mode: "read_only_preview",
    kv_email_index_keys_scanned: 0,
    kv_accounts_found: 0,
    already_in_users_table: 0,
    would_insert: 0,
    candidates: [],
    unrecoverable: {
      note: "Free users who never redeemed a code have no KV footprint and cannot be backfilled.",
      count_estimated: 0,
    },
  };
  if (!env?.KV_BACKFILL_LIST && !emailIndexKeys.length) {
    result.note =
      "KV has no key listing API. Pass an explicit list of email_index:* keys (exported from the KV dashboard) to preview candidates.";
    return result;
  }
  const keys = emailIndexKeys.length ? emailIndexKeys : [];
  for (const raw of keys) {
    const email = String(raw).replace(/^email_index:/, "").toLowerCase().trim();
    if (!email) continue;
    result.kv_email_index_keys_scanned += 1;
    const sub = await env.REDEEMED_CODES.get(`email_index:${email}`);
    if (!sub) continue;
    result.kv_accounts_found += 1;
    let existing = null;
    if (env?.DB) {
      existing = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(sub).first();
    }
    const accountRaw = await env.REDEEMED_CODES.get(`account:${sub}`);
    let expiresAt = null;
    if (accountRaw) {
      try {
        expiresAt = JSON.parse(accountRaw).expiresAt || null;
      } catch {}
    }
    if (existing) {
      result.already_in_users_table += 1;
    } else {
      result.would_insert += 1;
      if (result.candidates.length < 50) {
        result.candidates.push({ id: sub, email, plan: "pro", plan_expires_at: expiresAt });
      }
    }
  }
  return result;
}

// ============================================================================
// 6. DASHBOARD
// Vanilla JS SPA served as a static shell. Every DB/user-controlled value is
// rendered via DOM construction + textContent — never string-interpolated
// into innerHTML (which is only used to clear a container).
// ============================================================================

export function renderAdminDashboardHtml(env) {
  const workerName = env?.WORKER_NAME || "katzu";
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Katzu Control Plane</title>
<style>
  * { box-sizing: border-box; }
  :root {
    --bg: #0b0d12; --panel: #141824; --panel-2: #1b2030; --line: #262c3d;
    --text: #e8ecf6; --muted: #8b93a8; --accent: #8b6fe8; --accent-2: #6d5bd0;
    --ok: #7fd9a8; --warn: #f0c674; --err: #e89b9b;
  }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  a { color: var(--accent); }
  .shell { display: flex; min-height: 100vh; }
  .nav { width: 232px; flex-shrink: 0; background: var(--panel); border-right: 1px solid var(--line);
    padding: 18px 12px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  .brand { font-weight: 800; letter-spacing: .2px; padding: 6px 10px 16px; font-size: 15px; }
  .brand span { color: var(--accent); }
  .nav button { display: block; width: 100%; text-align: left; background: transparent; border: 0;
    color: var(--muted); padding: 10px 12px; border-radius: 10px; cursor: pointer; font-size: 13px;
    font-weight: 600; margin-bottom: 2px; }
  .nav button:hover { background: var(--panel-2); color: var(--text); }
  .nav button.active { background: var(--accent); color: #fff; }
  .main { flex: 1; padding: 22px 26px 60px; min-width: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 26px 0 10px; }
  .sub { color: var(--muted); font-size: 12.5px; margin-bottom: 18px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px; }
  .grid { display: grid; gap: 14px; }
  .grid.cards { grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); }
  .grid.two { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  .stat .k { color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: .6px; }
  .stat .v { font-size: 26px; font-weight: 800; margin-top: 6px; }
  .stat .d { color: var(--muted); font-size: 11.5px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .6px; font-weight: 700; }
  tr.clickable { cursor: pointer; }
  tr.clickable:hover { background: var(--panel-2); }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .pill.pro { background: rgba(127,217,168,.14); color: var(--ok); }
  .pill.free { background: rgba(139,147,168,.16); color: var(--muted); }
  .pill.expired { background: rgba(240,198,116,.14); color: var(--warn); }
  .pill.err { background: rgba(232,155,155,.14); color: var(--err); }
  input, select, textarea, button.btn { background: var(--panel-2); border: 1px solid var(--line);
    color: var(--text); border-radius: 10px; padding: 9px 11px; font-size: 13px; font-family: inherit; }
  input:focus, select:focus, textarea:focus { outline: 1px solid var(--accent); }
  button.btn { cursor: pointer; font-weight: 600; }
  button.btn:hover { border-color: var(--accent); }
  button.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button.btn.primary:hover { background: var(--accent-2); }
  button.btn.danger { color: var(--err); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .spacer { flex: 1; }
  .muted { color: var(--muted); }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .bars { display: flex; align-items: flex-end; gap: 3px; height: 92px; margin-top: 8px; }
  .bars div { flex: 1; background: linear-gradient(180deg, var(--accent), var(--accent-2));
    border-radius: 3px 3px 0 0; min-height: 2px; }
  .feed { max-height: 340px; overflow-y: auto; }
  .feed-item { padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 12.5px; }
  .hidden { display: none !important; }
  .drawer { position: fixed; inset: 0 0 0 auto; width: min(620px, 96vw); background: var(--bg);
    border-left: 1px solid var(--line); padding: 20px; overflow-y: auto; z-index: 50;
    box-shadow: -24px 0 60px rgba(0,0,0,.5); }
  .toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
    background: var(--panel-2); border: 1px solid var(--line); padding: 11px 16px;
    border-radius: 11px; z-index: 100; font-size: 13px; }
  code { background: var(--panel-2); padding: 1px 5px; border-radius: 5px; }
  .kbar { display: flex; gap: 8px; align-items: center; }
  .kbar input { width: 300px; }
</style>
</head>
<body>
<div class="shell">
  <nav class="nav">
    <div class="brand">Katzu <span>Control Plane</span></div>
    <button id="nav-overview" onclick="showTab('overview')">Overview</button>
    <button id="nav-users" onclick="showTab('users')">Users</button>
    <button id="nav-activity" onclick="showTab('activity')">Activity</button>
    <button id="nav-errors" onclick="showTab('errors')">Errors</button>
    <button id="nav-licenses" onclick="showTab('licenses')">Licenses &amp; Plans</button>
    <button id="nav-content" onclick="showTab('content')">Content Studio</button>
    <div class="muted mono" style="padding:14px 12px;font-size:11px">worker: ${escapeHtml(workerName)}</div>
  </nav>

  <main class="main">
    <h1 id="page-title">Overview</h1>
    <div class="sub" id="page-sub">All users, free and pro, with live activity and error telemetry.</div>

    <div class="card" style="margin-bottom:18px">
      <div class="kbar">
        <input id="admin-key" type="password" placeholder="ADMIN_SECRET (Bearer token)" autocomplete="off">
        <button class="btn primary" onclick="saveKey()">Connect</button>
        <span id="key-state" class="muted" style="font-size:12px"></span>
      </div>
    </div>

    <!-- OVERVIEW -->
    <section id="view-overview">
      <div class="grid cards" id="overview-cards"></div>
      <div class="grid two" style="margin-top:18px">
        <div class="card">
          <h2 style="margin-top:0">Signups (last 30 days)</h2>
          <div class="bars" id="signup-bars"></div>
          <div class="muted" style="font-size:11.5px;margin-top:6px" id="signup-caption"></div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">Top errors (7 days)</h2>
          <div id="top-errors"></div>
          <h2>Event mix (7 days)</h2>
          <div id="top-events"></div>
        </div>
      </div>
      <div class="grid two" style="margin-top:18px">
        <div class="card">
          <h2 style="margin-top:0">Recent activity</h2>
          <div class="feed" id="recent-activity"></div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">Recent errors</h2>
          <div class="feed" id="recent-errors"></div>
        </div>
      </div>
      <div style="margin-top:18px">
        <button class="btn" onclick="loadBackfillPreview()">Preview legacy KV backfill (read-only)</button>
        <div id="backfill-out" class="mono muted" style="margin-top:10px;white-space:pre-wrap"></div>
      </div>
    </section>

    <!-- USERS -->
    <section id="view-users" class="hidden">
      <div class="card" style="margin-bottom:14px">
        <div class="row">
          <input id="user-q" placeholder="Search email or user id" style="min-width:260px">
          <select id="user-plan">
            <option value="">All plans</option>
            <option value="free">Free only</option>
            <option value="pro">Pro (active)</option>
            <option value="expired">Pro (expired)</option>
          </select>
          <button class="btn primary" onclick="loadUsers(0)">Search</button>
          <div class="spacer"></div>
          <span class="muted" id="users-count"></span>
        </div>
      </div>
      <div class="card">
        <table>
          <thead><tr>
            <th>Email</th><th>Plan</th><th>Registered</th><th>Last seen</th><th>Platform</th><th></th>
          </tr></thead>
          <tbody id="users-body"></tbody>
        </table>
        <div class="row" style="margin-top:12px">
          <button class="btn" onclick="pageUsers(-1)">Prev</button>
          <button class="btn" onclick="pageUsers(1)">Next</button>
          <span class="muted" id="users-page"></span>
        </div>
      </div>
    </section>

    <!-- ACTIVITY -->
    <section id="view-activity" class="hidden">
      <div class="card" style="margin-bottom:14px">
        <div class="row">
          <select id="activity-type">
            <option value="">All events</option>
            <option value="session_created">session_created</option>
            <option value="code_redeemed">code_redeemed</option>
            <option value="subscription_expired">subscription_expired</option>
            <option value="ai_turn_completed">ai_turn_completed</option>
            <option value="ai_turn_failed">ai_turn_failed</option>
            <option value="account_deleted">account_deleted</option>
            <option value="data_exported">data_exported</option>
            <option value="plan_edited">plan_edited</option>
            <option value="plan_revoked">plan_revoked</option>
          </select>
          <button class="btn primary" onclick="loadActivity()">Load</button>
        </div>
      </div>
      <div class="card"><div class="feed" id="activity-feed"></div></div>
    </section>

    <!-- ERRORS -->
    <section id="view-errors" class="hidden">
      <div class="card" style="margin-bottom:14px">
        <div class="row">
          <select id="error-type">
            <option value="">All error types</option>
            <option value="ai_provider_error">ai_provider_error</option>
            <option value="ai_turn_error">ai_turn_error</option>
            <option value="server_error">server_error</option>
            <option value="delete_incomplete">delete_incomplete</option>
            <option value="export_failed">export_failed</option>
          </select>
          <button class="btn primary" onclick="loadErrors()">Load</button>
        </div>
      </div>
      <div class="card"><div class="feed" id="errors-feed"></div></div>
    </section>

    <!-- LICENSES -->
    <section id="view-licenses" class="hidden">
      <div class="grid two">
        <div class="card">
          <h2 style="margin-top:0">Look up a user</h2>
          <div class="row">
            <input id="lic-email" placeholder="learner email" style="min-width:240px">
            <button class="btn primary" onclick="licLookup()">Look up</button>
          </div>
          <div id="lic-result" style="margin-top:12px"></div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">Generate activation codes</h2>
          <div class="row">
            <input id="gen-months" type="number" value="1" min="1" max="24" style="width:90px">
            <input id="gen-count" type="number" value="1" min="1" max="50" style="width:90px">
            <button class="btn primary" onclick="genCodes()">Generate</button>
          </div>
          <div class="muted" style="font-size:12px;margin-top:8px">Codes are signed HMAC licenses. Treat generated output as sensitive.</div>
          <div id="gen-result" class="mono" style="margin-top:12px;white-space:pre-wrap"></div>
        </div>
      </div>
    </section>

    <!-- CONTENT -->
    <section id="view-content" class="hidden">
      <div class="card" style="margin-bottom:14px">
        <div class="row">
          <select id="content-type" onchange="loadContent()">
            <option value="scenarios">scenarios</option>
            <option value="vocabulary">vocabulary</option>
            <option value="grammar">grammar</option>
            <option value="starter_phrases">starter_phrases</option>
          </select>
          <button class="btn" onclick="loadContent()">Refresh</button>
        </div>
      </div>
      <div class="card">
        <div class="muted" style="font-size:12px;margin-bottom:10px">Read-only view. Content edits still go through the existing CRUD endpoints and are not modified by this dashboard.</div>
        <div id="content-out" class="mono" style="white-space:pre-wrap;max-height:520px;overflow:auto"></div>
      </div>
    </section>
  </main>
</div>

<div id="drawer-host"></div>
<div id="toast-host"></div>

<script>
  var state = { tab: "overview", userOffset: 0, userLimit: 25, adminKey: "" };

  // SECURITY INVARIANT: every DB-sourced or user-controlled value below is
  // written with textContent via el()/appendChild — never string-interpolated
  // into innerHTML. innerHTML is only ever used to CLEAR a container ("").
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function toast(msg, isError) {
    var host = document.getElementById("toast-host");
    host.innerHTML = "";
    var t = el("div", "toast", msg);
    if (isError) t.style.color = "#e89b9b";
    host.appendChild(t);
    setTimeout(function () { host.innerHTML = ""; }, 4200);
  }

  function fmtTime(ms) {
    if (!ms) return "—";
    var d = new Date(Number(ms));
    if (isNaN(d.getTime())) return "—";
    return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
  }

  function relative(ms) {
    if (!ms) return "—";
    var diff = Date.now() - Number(ms);
    if (diff < 0) return fmtTime(ms);
    var m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }

  function saveKey() {
    var v = document.getElementById("admin-key").value.trim();
    if (!v) { toast("Enter the admin secret first", true); return; }
    state.adminKey = v;
    try { sessionStorage.setItem("katzu_admin_key", v); } catch (e) {}
    document.getElementById("key-state").textContent = "key loaded for this session";
    toast("Connected");
    refreshTab();
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers["Authorization"] = "Bearer " + state.adminKey;
    if (opts.body) opts.headers["Content-Type"] = "application/json";
    return fetch(path, opts).then(function (res) {
      if (res.status === 401) { toast("Unauthorized — check ADMIN_SECRET", true); throw new Error("unauthorized"); }
      return res.json().catch(function () { return {}; });
    });
  }

  function showTab(tab) {
    state.tab = tab;
    var ids = ["overview", "users", "activity", "errors", "licenses", "content"];
    ids.forEach(function (id) {
      var view = document.getElementById("view-" + id);
      var navBtn = document.getElementById("nav-" + id);
      if (view) view.className = id === tab ? "" : "hidden";
      if (navBtn) navBtn.className = id === tab ? "active" : "";
    });
    var titles = {
      overview: ["Overview", "All users, free and pro, with live activity and error telemetry."],
      users: ["Users", "Every registered account — including free users who never redeemed a code."],
      activity: ["Activity", "What learners are actually doing, event by event."],
      errors: ["Errors", "Failures to fix, grouped by type and linked to a user when known."],
      licenses: ["Licenses & Plans", "Lookup, extend or revoke a plan; generate activation codes."],
      content: ["Content Studio", "Inspect what is currently stored in D1."]
    };
    var t = titles[tab] || ["Overview", ""];
    document.getElementById("page-title").textContent = t[0];
    document.getElementById("page-sub").textContent = t[1];
    refreshTab();
  }

  function refreshTab() {
    if (!state.adminKey) return;
    if (state.tab === "overview") loadOverview();
    else if (state.tab === "users") loadUsers(0);
    else if (state.tab === "activity") loadActivity();
    else if (state.tab === "errors") loadErrors();
    else if (state.tab === "content") loadContent();
  }

  function statCard(label, value, detail) {
    var c = el("div", "card stat");
    c.appendChild(el("div", "k", label));
    c.appendChild(el("div", "v", value));
    if (detail) c.appendChild(el("div", "d", detail));
    return c;
  }

  function feedItem(bit) { return bit; }

  function renderFeed(hostId, items, primary, secondary, badge) {
    var host = document.getElementById(hostId);
    host.innerHTML = "";
    if (!items || !items.length) {
      host.appendChild(el("div", "muted", "No records yet."));
      return;
    }
    items.forEach(function (item) {
      var wrap = el("div", "feed-item");
      var top = el("div");
      top.appendChild(el("span", "mono", relative(item.created_at) + " · "));
      var b = el("span", "pill err", badge(item));
      top.appendChild(b);
      wrap.appendChild(top);
      wrap.appendChild(el("div", "", primary(item)));
      var sec = secondary(item);
      if (sec) wrap.appendChild(el("div", "muted", sec));
      host.appendChild(wrap);
    });
  }

  function loadOverview() {
    api("/admin/api/overview").then(function (data) {
      var s = data.stats || {};
      var cards = document.getElementById("overview-cards");
      cards.innerHTML = "";
      cards.appendChild(statCard("Total users", s.total_users, s.new_30d + " new in 30d"));
      cards.appendChild(statCard("Pro (active)", s.pro_users, s.conversion_rate + "% conversion"));
      cards.appendChild(statCard("Free", s.free_users, s.expired_pro_users + " expired pro"));
      cards.appendChild(statCard("Active today", s.active_24h, s.active_7d + " active this week"));
      cards.appendChild(statCard("Redemptions", s.redemptions_total, "all-time activation codes"));
      cards.appendChild(statCard("Errors 24h", s.errors_24h, s.error_rate_24h + " per 100 active"));
      cards.appendChild(statCard("Events 24h", s.activity_24h, "logged learner actions"));

      var bars = document.getElementById("signup-bars");
      bars.innerHTML = "";
      var days = s.signups_by_day || [];
      var max = 1;
      days.forEach(function (d) { if (d.c > max) max = d.c; });
      days.forEach(function (d) {
        var bar = el("div");
        bar.style.height = Math.max((d.c / max) * 100, 2) + "%";
        bar.title = d.day + ": " + d.c + " signups";
        bars.appendChild(bar);
      });
      document.getElementById("signup-caption").textContent = days.length
        ? days.length + " day(s) with signups · peak " + max
        : "No signups recorded yet.";

      renderTopList("top-errors", s.top_errors, "error_type");
      renderTopList("top-events", s.top_events, "event_type");

      renderFeed("recent-activity", data.recent_activity,
        function (i) { return i.event_type + (i.user_id ? " · " + i.user_id.slice(0, 14) : ""); },
        function (i) { return i.metadata || ""; },
        function (i) { return i.event_type; });

      renderFeed("recent-errors", data.recent_errors,
        function (i) { return i.message || i.error_type; },
        function (i) { return (i.endpoint || "") + (i.user_id ? " · " + i.user_id.slice(0, 14) : ""); },
        function (i) { return i.error_type; });
    }).catch(function () {});
  }

  function renderTopList(hostId, rows, labelKey) {
    var host = document.getElementById(hostId);
    host.innerHTML = "";
    if (!rows || !rows.length) { host.appendChild(el("div", "muted", "Nothing recorded.")); return; }
    rows.forEach(function (r) {
      var line = el("div", "row");
      line.style.padding = "5px 0";
      line.appendChild(el("span", "mono", r[labelKey]));
      var spacer = el("div", "spacer");
      line.appendChild(spacer);
      line.appendChild(el("span", "pill free", r.c));
      host.appendChild(line);
    });
  }

  function planPill(plan) {
    var cls = plan === "pro" ? "pill pro" : plan === "pro_expired" ? "pill expired" : "pill free";
    var label = plan === "pro" ? "PRO" : plan === "pro_expired" ? "PRO EXPIRED" : "FREE";
    return el("span", cls, label);
  }

  function loadUsers(offset) {
    if (offset === 0) state.userOffset = 0;
    var q = encodeURIComponent(document.getElementById("user-q").value.trim());
    var plan = encodeURIComponent(document.getElementById("user-plan").value);
    api("/admin/api/users?limit=" + state.userLimit + "&offset=" + state.userOffset + "&q=" + q + "&plan=" + plan)
      .then(function (data) {
        var body = document.getElementById("users-body");
        body.innerHTML = "";
        var users = data.users || [];
        if (!users.length) {
          var tr = el("tr");
          var td = el("td", "muted", data.available === false ? "D1 is not bound — registry unavailable." : "No users match this filter.");
          td.colSpan = 6;
          tr.appendChild(td);
          body.appendChild(tr);
        }
        users.forEach(function (u) {
          var tr = el("tr", "clickable");
          tr.onclick = function () { openUser(u.id); };
          var td1 = el("td");
          td1.appendChild(el("div", "", u.email || "(no email)"));
          td1.appendChild(el("div", "muted mono", (u.id || "").slice(0, 18)));
          tr.appendChild(td1);
          var td2 = el("td"); td2.appendChild(planPill(u.plan)); tr.appendChild(td2);
          tr.appendChild(el("td", "muted mono", u.created_at ? fmtTime(u.created_at).slice(0, 10) : "—"));
          tr.appendChild(el("td", "muted", relative(u.last_seen_at)));
          tr.appendChild(el("td", "muted", u.platform || "—"));
          var td6 = el("td");
          var btn = el("button", "btn", "Inspect");
          btn.onclick = function (ev) { ev.stopPropagation(); openUser(u.id); };
          td6.appendChild(btn);
          tr.appendChild(td6);
          body.appendChild(tr);
        });
        document.getElementById("users-count").textContent = (data.total || 0) + " total";
        document.getElementById("users-page").textContent =
          "Showing " + (users.length ? state.userOffset + 1 : 0) + "–" + (state.userOffset + users.length) + " of " + (data.total || 0);
      }).catch(function () {});
  }

  function pageUsers(delta) {
    state.userOffset = Math.max(0, state.userOffset + delta * state.userLimit);
    loadUsers();
  }

  function closeDrawer() {
    var host = document.getElementById("drawer-host");
    while (host.firstChild) host.removeChild(host.firstChild);
  }

  function openUser(userId) {
    api("/admin/api/user?id=" + encodeURIComponent(userId)).then(function (data) {
      var host = document.getElementById("drawer-host");
      while (host.firstChild) host.removeChild(host.firstChild);
      if (!data.found) { toast("User not found", true); return; }

      var drawer = el("div", "drawer");
      var u = data.user || {};

      var head = el("div", "row");
      var h = el("h1", "", u.email || "(no email)");
      head.appendChild(h);
      head.appendChild(el("div", "spacer"));
      var close = el("button", "btn", "Close");
      close.onclick = closeDrawer;
      head.appendChild(close);
      drawer.appendChild(head);

      var sub = el("div", "muted mono", u.sub || "");
      drawer.appendChild(sub);

      var info = el("div", "card");
      info.style.marginTop = "14px";
      function infoRow(k, v) {
        var r = el("div", "row");
        r.style.padding = "4px 0";
        r.appendChild(el("span", "muted", k));
        r.appendChild(el("div", "spacer"));
        r.appendChild(el("span", "mono", v));
        info.appendChild(r);
      }
      infoRow("Plan", u.plan);
      infoRow("Subscription active", u.active ? "yes" : "no");
      infoRow("Expires", u.expiresAt || "—");
      infoRow("Registered", u.registered ? fmtTime(u.createdAt) : "not in registry");
      infoRow("Last seen", relative(u.lastSeenAt));
      infoRow("Platform", u.platform || "—");
      infoRow("Last IP", u.lastIp || "—");
      infoRow("Redemptions", String(data.redemptions || 0));
      drawer.appendChild(info);

      var actions = el("div", "row");
      actions.style.marginTop = "14px";
      var extend = el("button", "btn primary", "+1 month");
      extend.onclick = function () { licAdjust(u.email, 1); closeDrawer(); };
      var extend3 = el("button", "btn", "+3 months");
      extend3.onclick = function () { licAdjust(u.email, 3); closeDrawer(); };
      var revoke = el("button", "btn danger", "Revoke plan");
      revoke.onclick = function () { licRevoke(u.email); closeDrawer(); };
      actions.appendChild(extend); actions.appendChild(extend3); actions.appendChild(revoke);
      drawer.appendChild(actions);

      var act = el("h2", "", "Activity timeline");
      drawer.appendChild(act);
      var actCard = el("div", "card feed");
      if (!(data.activity || []).length) actCard.appendChild(el("div", "muted", "No activity recorded for this user yet."));
      (data.activity || []).forEach(function (a) {
        var item = el("div", "feed-item");
        item.appendChild(el("div", "mono", relative(a.created_at) + " · " + (a.event_type || "")));
        if (a.metadata) item.appendChild(el("div", "muted", a.metadata));
        actCard.appendChild(item);
      });
      drawer.appendChild(actCard);

      var err = el("h2", "", "Error reports");
      drawer.appendChild(err);
      var errCard = el("div", "card feed");
      if (!(data.errors || []).length) errCard.appendChild(el("div", "muted", "No errors for this user."));
      (data.errors || []).forEach(function (e2) {
        var item = el("div", "feed-item");
        item.appendChild(el("div", "mono", relative(e2.created_at) + " · " + (e2.error_type || "")));
        item.appendChild(el("div", "", e2.message || ""));
        if (e2.endpoint) item.appendChild(el("div", "muted mono", e2.endpoint));
        errCard.appendChild(item);
      });
      drawer.appendChild(errCard);

      var prog = el("h2", "", "Progress");
      drawer.appendChild(prog);
      var progCard = el("div", "card mono");
      progCard.textContent = "Loading…";
      drawer.appendChild(progCard);
      api("/admin/progress-lookup", {
        method: "POST",
        body: JSON.stringify({ email: u.email })
      }).then(function (p) {
        progCard.textContent = JSON.stringify(p, null, 2);
      }).catch(function () { progCard.textContent = "Progress unavailable."; });

      host.appendChild(drawer);
    }).catch(function () {});
  }

  function loadActivity() {
    var type = encodeURIComponent(document.getElementById("activity-type").value);
    api("/admin/api/activity?event_type=" + type + "&limit=150").then(function (data) {
      renderFeed("activity-feed", data.activity,
        function (i) { return i.event_type + (i.user_id ? " · " + i.user_id.slice(0, 16) : ""); },
        function (i) { return i.metadata || ""; },
        function (i) { return i.event_type; });
    }).catch(function () {});
  }

  function loadErrors() {
    var type = encodeURIComponent(document.getElementById("error-type").value);
    api("/admin/api/errors?error_type=" + type + "&limit=150").then(function (data) {
      renderFeed("errors-feed", data.errors,
        function (i) { return i.message || i.error_type; },
        function (i) { return (i.endpoint || "") + (i.user_id ? " · " + i.user_id.slice(0, 16) : ""); },
        function (i) { return i.error_type; });
    }).catch(function () {});
  }

  function licLookup() {
    var email = document.getElementById("lic-email").value.trim();
    if (!email) { toast("Enter an email", true); return; }
    api("/admin/lookup", { method: "POST", body: JSON.stringify({ email: email }) })
      .then(function (data) {
        var host = document.getElementById("lic-result");
        host.innerHTML = "";
        if (!data.found) {
          host.appendChild(el("div", "muted", "Not found — no registered account and no legacy redemption record for this email."));
          return;
        }
        var card = el("div", "card");
        function row(k, v) {
          var r = el("div", "row");
          r.style.padding = "4px 0";
          r.appendChild(el("span", "muted", k));
          r.appendChild(el("div", "spacer"));
          r.appendChild(el("span", "mono", v));
          card.appendChild(r);
        }
        row("Email", data.email || "—");
        row("User id", data.sub || "—");
        row("Plan", data.plan || "—");
        row("Active", data.active ? "yes" : "no");
        row("Expires", data.expiresAt || "—");
        row("Registered", data.registered ? "yes" : "no (legacy redeemer)");
        row("Source", data.source || "—");
        host.appendChild(card);
      }).catch(function () {});
  }

  function licAdjust(email, months) {
    api("/admin/edit", { method: "POST", body: JSON.stringify({ email: email, add_months: months }) })
      .then(function () { toast("Plan extended"); refreshTab(); })
      .catch(function () {});
  }

  function licRevoke(email) {
    api("/admin/revoke", { method: "POST", body: JSON.stringify({ email: email }) })
      .then(function () { toast("Plan revoked"); refreshTab(); })
      .catch(function () {});
  }

  function genCodes() {
    var months = document.getElementById("gen-months").value;
    var countEl = document.getElementById("gen-count");
    var count = Math.max(1, Math.min(parseInt(countEl.value, 10) || 1, 50));
    var out = document.getElementById("gen-result");
    out.textContent = "Generating…";
    var done = 0;
    var codes = [];
    function one() {
      api("/admin/generate", { method: "POST", body: JSON.stringify({ months: Number(months) }) })
        .then(function (data) {
          codes.push(data.code || JSON.stringify(data));
          done += 1;
          if (done < count) { one(); } else { out.textContent = codes.join("\\n"); }
        })
        .catch(function () { out.textContent = "Generation failed."; });
    }
    one();
  }

  function loadContent() {
    var type = document.getElementById("content-type").value;
    var out = document.getElementById("content-out");
    out.textContent = "Loading…";
    api("/admin/" + encodeURIComponent(type))
      .then(function (data) {
        var rows = Array.isArray(data) ? data : [data];
        out.textContent = rows.length + " row(s)\\n\\n" + JSON.stringify(rows, null, 2).slice(0, 60000);
      })
      .catch(function () { out.textContent = "Content unavailable."; });
  }

  function loadBackfillPreview() {
    var out = document.getElementById("backfill-out");
    out.textContent = "Loading…";
    api("/admin/api/backfill-preview").then(function (data) {
      out.textContent = JSON.stringify(data, null, 2);
    }).catch(function () { out.textContent = "Preview unavailable."; });
  }

  try {
    var saved = sessionStorage.getItem("katzu_admin_key");
    if (saved) {
      state.adminKey = saved;
      document.getElementById("admin-key").value = saved;
      document.getElementById("key-state").textContent = "key loaded for this session";
    }
  } catch (e) {}

  window.showTab = showTab;
  window.saveKey = saveKey;
  window.loadUsers = loadUsers;
  window.pageUsers = pageUsers;
  window.loadActivity = loadActivity;
  window.loadErrors = loadErrors;
  window.licLookup = licLookup;
  window.genCodes = genCodes;
  window.loadContent = loadContent;
  window.loadBackfillPreview = loadBackfillPreview;
  window.closeDrawer = closeDrawer;
  window.openUser = openUser;

  showTab("overview");
</script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
