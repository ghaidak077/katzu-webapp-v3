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

// The Content Studio is a module of its own for the same reason this file is: the
// schema/contract, the routes and the dashboard code each stay small enough to
// edit, and the column contract lives in exactly one place.
import {
  contentCreate,
  contentDelete,
  contentExportAll,
  contentList,
  contentSchema,
  contentUpdate,
  contentUpload,
} from "./cloudflare-content-studio.js";
import {
  CONTENT_STUDIO_CSS,
  CONTENT_STUDIO_SECTIONS,
  CONTENT_STUDIO_UI_SCRIPT,
} from "./cloudflare-content-studio-ui.js";
import { CONTENT_STUDIO_TOOLS_SCRIPT } from "./cloudflare-content-studio-tools.js";
import { handleAnalyticsRoute } from "./cloudflare-analytics.js";
// Owner-managed AI provider pool (admin dashboard → AI Providers). Keys are
// written server-side only and every read is masked (counts + fingerprints).
import {
  deleteProviderEntry,
  listProviderConfig,
  setDefaultProviderState,
  testProviderEntry,
  upsertProviderEntry,
} from "./cloudflare-ai-providers.js";

// ============================================================================
// 1. ADDITIVE D1 SCHEMA
// Lazy CREATE TABLE IF NOT EXISTS, matching the existing ensureLedgerTables
// pattern in the main worker. No drops, no alterations of existing tables.
// ============================================================================

export async function ensureRegistryTables(env) {
  if (!env?.DB) return false;
  try {
    // L3: the channel tag (`?src=`) is an ADDITIVE column. It is added outside
    // the batch because a D1 batch is transactional: on a fresh database the
    // CREATE below already carries `source`, so an ALTER in the same batch would
    // fail with "duplicate column name" and roll the whole thing back. Here the
    // failure is isolated, and "already exists" is the expected steady state
    // rather than an error (the same rule `ensureContentColumns` follows).
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN src TEXT`).run();
    } catch (error) {
      if (!/duplicate column name/i.test(String(error?.message || error))) {
        throw error;
      }
    }
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        created_at INTEGER,
        last_seen_at INTEGER,
        plan TEXT DEFAULT 'free',
        plan_expires_at INTEGER,
        last_ip TEXT,
        platform TEXT,
        src TEXT
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
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_users_src ON users (src)`),
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

export function sanitizeLogMessage(value, maxLength = 400) {  if (value === null || value === undefined) return null;
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
/**
 * The channel tag (`?src=`), or nothing.
 *
 * The whole grammar: lowercase letters, digits, underscore and dash, 1–32 of
 * them. A full URL, an email, an Arabic sentence or anything longer is DROPPED
 * rather than trimmed — this value is rendered in the admin UI, so a hostile
 * link must not be able to store content there. Same rule as the client's
 * `sanitizeSource`, written twice on purpose: the client can be bypassed.
 *
 * Named `src` and not `source` throughout: `describeUser`'s `source` already
 * means which store a record was read from ("users" / "email_index"), and two
 * meanings of one name in the same response is a silent bug waiting to happen.
 */
export function sanitizeSrcTag(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(trimmed) ? trimmed : null;
}

export async function upsertUserFromAccount(account, request, env, extra = {}) {
  if (!env?.DB || !account?.sub) return false;
  try {
    const now = Date.now();
    // The channel tag, sanitised at the boundary. `null` means "nothing valid was
    // offered", which is different from "" and keeps the UPDATE from blanking a
    // tag an earlier sign-in already recorded.
    const src = sanitizeSrcTag(extra.src);
    await env.DB.prepare(
      `INSERT INTO users (id, email, created_at, last_seen_at, plan, plan_expires_at, last_ip, platform, src)
       VALUES (?, ?, ?, ?, 'free', NULL, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = COALESCE(excluded.email, users.email),
         last_seen_at = excluded.last_seen_at,
         last_ip = excluded.last_ip,
         platform = excluded.platform,
         src = COALESCE(excluded.src, users.src)`
    )
      .bind(
        account.sub,
        (account.email || "").toLowerCase().trim() || null,
        now,
        now,
        deriveIp(request),
        derivePlatform(request),
        src
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
    /** The channel tag from `?src=` — never PII, and `null` when none arrived. */
    src: user?.src ? sanitizeSrcTag(user.src) : null,
  };
}

/**
 * The delivery promise, in hours.
 *
 * D8 in the playbook: a paid code reaches the buyer within 12 hours, and the
 * whole point of showing elapsed time is to see that promise kept or broken. It
 * is a constant here rather than a number typed into the view, so the admin and
 * the copy cannot disagree about what was promised.
 */
export const CODE_DELIVERY_PROMISE_HOURS = 12;

/** What the buyer gets: the pass they bought, in words rather than a code. */
function passLabelFor(months) {
  const n = Number(months);
  if (!Number.isFinite(n) || n <= 0) return "unknown";
  if (n === 1) return "monthly";
  if (n === 3) return "pass90";
  return `${n}mo`;
}

/**
 * Orders, read-only, with the clock the owner promised to keep.
 *
 * WHY THIS VIEW EXISTS
 * The launch promise is «يصل الكود خلال ١٢ ساعة» (D8), and there was nowhere to
 * read whether it was being kept. `created_at` is the moment the order was made
 * and `paid_at` is the moment the money landed — the gap between those two is
 * the only measurement that answers the question, so both are returned raw and
 * the elapsed time is computed, never rounded away.
 *
 * IT READS AND IT DOES NOT WRITE
 * One `SELECT`, no INSERT/UPDATE/DELETE, no new table, and no new auth path: it
 * sits behind the same bearer gate as every other `/admin/api/*` route, and a
 * missing or wrong secret still answers 401 before this runs at all.
 *
 * `src` is resolved through the account the code was redeemed against, not
 * stored on the order — crypto check-out does not receive the channel tag, and
 * inventing a column for it would be a write. **UNPROVEN live**: the crypto
 * table is `test_mode`, so this may be empty in production until check-out goes
 * live; it is built to be correct when it is not.
 */
export async function listOrders(env, { status = null, limit = 50, offset = 0 } = {}) {
  if (!env?.DB) return { total: 0, orders: [], limit: 0, offset: 0, available: false };
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  const where = [];
  const binds = [];
  if (status && typeof status === "string" && /^[a-z_]{1,24}$/i.test(status)) {
    where.push("status = ?");
    binds.push(status);
  }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  try {
    const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS c FROM crypto_orders${whereSql}`).bind(...binds).first();
    const rows = await env.DB
      .prepare(
        `SELECT order_id, claim_token, months, price_usd, status, provider, payment_id,
                pay_currency, pay_amount, code, created_at, paid_at, delivered_at
         FROM crypto_orders${whereSql}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .bind(...binds, safeLimit, safeOffset)
      .all();
    const now = Date.now();
    return {
      total: Number(totalRow?.c ?? 0),
      orders: (rows?.results || []).map((row) => {
        const paidAt = row.paid_at ? Date.parse(row.paid_at) : null;
        const createdAt = Date.parse(row.created_at);
        // From PAID, not from created: the clock the buyer was promised starts
        // when their money landed. A pending order has no clock at all.
        const hoursSincePaid = paidAt && Number.isFinite(paidAt) ? (now - paidAt) / 3_600_000 : null;
        const deliveredAt = row.delivered_at ? Date.parse(row.delivered_at) : null;
        return {
          order_id: row.order_id,
          /** The claim token is the buyer's handle, not a secret. */
          alias: row.claim_token ? String(row.claim_token).slice(0, 12) : null,
          pass: passLabelFor(row.months),
          months: Number(row.months) || null,
          method: row.provider || null,
          price_usd: row.price_usd ?? null,
          pay_currency: row.pay_currency || null,
          pay_amount: row.pay_amount ?? null,
          status: row.status,
          /** Whether a code was minted, and whether the buyer has collected it. */
          codeMinted: Boolean(row.code),
          codeRedeemed: Boolean(deliveredAt),
          createdAt: row.created_at,
          paidAt: row.paid_at,
          deliveredAt: row.delivered_at,
          hoursSincePaid: hoursSincePaid === null ? null : Math.round(hoursSincePaid * 100) / 100,
          deliveryPromiseHours: CODE_DELIVERY_PROMISE_HOURS,
          /** `null` while there is no clock to judge — never a false "on time". */
          withinPromise: hoursSincePaid === null ? null : hoursSincePaid <= CODE_DELIVERY_PROMISE_HOURS,
        };
      }),
      limit: safeLimit,
      offset: safeOffset,
      available: true,
    };
  } catch (e) {
    console.error("[orders] list failed:", String(e?.message || e).slice(0, 120));
    return { total: 0, orders: [], limit: safeLimit, offset: safeOffset, available: false };
  }
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
    provider_attempts_exhausted_24h: 0,
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

    // AI volume, from the events withAiTelemetry and the provider router already
    // write. These were hardcoded zeros, so the dashboard could never show the
    // thing that actually multiplies: provider attempts, not HTTP requests.
    const aiTurns24 = await count(
      "SELECT COUNT(*) AS c FROM activity_log WHERE event_type = ? AND created_at > ?",
      "ai_turn_completed",
      now - day
    );
    const aiFailures24 = await count(
      "SELECT COUNT(*) AS c FROM activity_log WHERE event_type = ? AND created_at > ?",
      "ai_turn_failed",
      now - day
    );
    const providerExhaustions24 = await count(
      "SELECT COUNT(*) AS c FROM activity_log WHERE event_type = ? AND created_at > ?",
      "provider_attempt_exhausted",
      now - day
    );

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
    const funnel = await buildLaunchFunnel(env, now);
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
      ai_turns_24h: aiTurns24,
      ai_failures_24h: aiFailures24,
      provider_attempts_exhausted_24h: providerExhaustions24,
      signups_by_day: signupsByDay,
      top_events: topEvents,
      top_errors: topErrors,
      funnel,
    };
  } catch (e) {
    console.error("[registry] stats failed:", String(e?.message || e).slice(0, 120));
    return empty;
  }
}

/**
 * The launch funnel, aggregated from `activity_log`.
 *
 * WHICH NUMBERS THE OWNER NEEDS
 * Not totals — the sequence. Where do learners stop: after the free mock, before
 * the debrief, after seeing a price? And does the answer differ by price group or
 * by price cell? Those are the two questions that decide whether the Exam Pass
 * price is aimed correctly, and both need `metadata`, which is why these events
 * are written to D1 rather than only to KV.
 *
 * COUNTS, NOT RATES, WHERE THE DENOMINATOR IS UNKNOWN
 * Each step is a count of distinct accounts in the window. A conversion percentage
 * is only printed where the previous step is a real denominator (see
 * `stepConversionPercent`), so the dashboard never shows "50% of learners" of
 * something the dashboard counted once.
 *
 * WHAT IS NOT HERE: anything about a person. Region is a two-value price group and
 * a cell is a bucket index — both derived server-side — so the cut answers
 * "which price works" without storing where anybody lives.
 */
const FUNNEL_STEPS = [
  "onboarding_goal",
  "mock_start",
  "mock_finish",
  "debrief_view",
  "paywall_view",
  "upgrade_click",
  "code_redeemed",
];

/** 30 days: long enough to see a monthly cohort, short enough to act on. */
const FUNNEL_WINDOW_DAYS = 30;

/**
 * A count WITH its denominator, or `null` where no denominator exists.
 * "100% of nobody" is not a measurement — the same rule the step-to-step
 * conversion below already follows.
 */
function rateOf(accounts, denominator) {
  const numerator = Number(accounts) || 0;
  const base = Number(denominator) || 0;
  return {
    accounts: numerator,
    of: base,
    percent: base > 0 ? Math.round((numerator / base) * 1000) / 10 : null,
  };
}

/**
 * Distinct ACCOUNTS — not events — with activity since `since`, optionally of one
 * event type. The key is the same one the funnel steps use: a signed-in account
 * by its handle, an anonymous install by its metadata blob.
 */
async function countDistinctAccounts(env, eventType, since) {
  const row = eventType
    ? await env.DB.prepare(
        "SELECT COUNT(DISTINCT COALESCE(user_id, metadata)) AS c FROM activity_log WHERE event_type = ? AND created_at > ?"
      ).bind(eventType, since).first()
    : await env.DB.prepare(
        "SELECT COUNT(DISTINCT COALESCE(user_id, metadata)) AS c FROM activity_log WHERE created_at > ?"
      ).bind(since).first();
  return Number(row?.c || 0);
}

/** The return block, empty — one shape, whether or not a database answered. */
function emptyReturns() {
  return {
    window_days: FUNNEL_WINDOW_DAYS,
    accounts_active: 0,
    day1: rateOf(0, 0),
    day7: rateOf(0, 0),
  };
}

export async function buildLaunchFunnel(env, now = Date.now()) {
  const empty = {
    windowDays: FUNNEL_WINDOW_DAYS,
    steps: FUNNEL_STEPS.map((name) => ({ name, accounts: 0 })),
    conversion: [],
    by_region: [],
    by_cell: [],
    region_mismatches_30d: 0,
    returns: emptyReturns(),
    rates: { paywall_to_redeem: rateOf(0, 0) },
    signups_30d: 0,
    ai: { calls_today: 0, cap: null, utilization_percent: null, active_accounts_today: 0 },
    unproven: true,
  };
  if (!env?.DB) return empty;
  const day = 86_400_000;
  const since = now - FUNNEL_WINDOW_DAYS * day;
  try {
    const counts = new Map();
    for (const step of FUNNEL_STEPS) {
      const row = await env.DB.prepare(
        "SELECT COUNT(DISTINCT COALESCE(user_id, metadata)) AS c FROM activity_log WHERE event_type = ? AND created_at > ?"
      )
        .bind(step, since)
        .first();
      counts.set(step, Number(row?.c || 0));
    }
    const steps = FUNNEL_STEPS.map((name) => ({ name, accounts: counts.get(name) || 0 }));

    // Step-to-step conversion, only where the previous step has accounts.
    const conversion = [];
    for (let i = 1; i < steps.length; i += 1) {
      const previous = steps[i - 1].accounts;
      conversion.push({
        from: steps[i - 1].name,
        to: steps[i].name,
        accounts: steps[i].accounts,
        previous,
        percent: previous > 0 ? Math.round((steps[i].accounts / previous) * 1000) / 10 : null,
      });
    }

    // The two cuts the price experiment needs. `region` and `cell` are allowlisted
    // props, so this is a json_extract over stored metadata, never free text.
    // Each read is wrapped in its own try: a dashboard that loses one cut must
    // still answer the rest of the question.
    let byRegion = [];
    let byCell = [];
    try {
      const rows = await env.DB.prepare(
        `SELECT COALESCE(json_extract(metadata, '$.region'), 'unknown') AS region, COUNT(*) AS c
       FROM activity_log WHERE created_at > ? AND event_type IN ('paywall_view', 'upgrade_click', 'code_redeemed')
       GROUP BY region ORDER BY c DESC LIMIT 10`
      )
        .bind(since)
        .all();
      byRegion = rows?.results || [];
    } catch {}
    try {
      const rows = await env.DB.prepare(
        `SELECT COALESCE(json_extract(metadata, '$.cell'), 'none') AS cell,
              SUM(CASE WHEN event_type = 'paywall_view' THEN 1 ELSE 0 END) AS views,
              SUM(CASE WHEN event_type = 'upgrade_click' THEN 1 ELSE 0 END) AS clicks,
              SUM(CASE WHEN event_type = 'code_redeemed' THEN 1 ELSE 0 END) AS purchases
       FROM activity_log WHERE created_at > ? AND event_type IN ('paywall_view', 'upgrade_click', 'code_redeemed')
       GROUP BY cell ORDER BY views DESC LIMIT 10`
      )
        .bind(since)
        .all();
      byCell = rows?.results || [];
    } catch {}

    // Region mismatches are LOGGED, never blocked: a code is a code, and a learner
    // who moved must keep what they paid for. The count exists so the owner can
    // see whether the price table is aimed at the right countries.
    let mismatches = 0;
    try {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS c FROM activity_log WHERE event_type = 'region_mismatch' AND created_at > ?"
      )
        .bind(since)
        .first();
      mismatches = Number(row?.c || 0);
    } catch {}

    // Signups in the window: the one figure that was already here and was honest,
    // under a name that says what it counts. (It used to ship as `cohorts.d30`
    // beside a `d1` that held mock STARTS and a `d7` that held redemptions — two
    // retention-looking names carrying numbers that say nothing about retention,
    // which is worse than an empty field: an operator would read them.)
    let signedUp30d = 0;
    try {
      const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE created_at > ?")
        .bind(now - 30 * day)
        .first();
      signedUp30d = Number(row?.c || 0);
    } catch {}

    // Return: the two numbers a launch actually rests on, counted as distinct
    // accounts against the honest denominator — every account with any activity in
    // the window. No percentage without it.
    const activeAccounts = await countDistinctAccounts(env, null, since);
    const returnedDay1 = await countDistinctAccounts(env, "return_day1", since);
    const returnedDay7 = await countDistinctAccounts(env, "return_day7", since);

    // The AI spend brake's own counter: calls admitted TODAY against the operator's
    // cap. D1 stores the CALL count, because that is what the cap bounds; the
    // per-turn dollar estimate is a structured log line, not a row (see the
    // tracker's RC4.2 for why that stays an owner-side query).
    let aiCallsToday = 0;
    try {
      const row = await env.DB.prepare(
        "SELECT window_start, count FROM rate_limit_counters WHERE counter_id = ?"
      ).bind("global-ai-spend").first();
      // The counter's window is the day index. A row left over from yesterday is
      // yesterday's spend, not today's.
      const todayIndex = Math.floor(now / day);
      aiCallsToday = Number(row?.window_start) === todayIndex ? Number(row?.count || 0) : 0;
    } catch {}
    const activeToday = await countDistinctAccounts(env, null, Math.floor(now / day) * day);
    const rawCap = env?.AI_DAILY_SPEND_CAP;
    const cap = String(rawCap ?? "").trim() !== "" && Number.isFinite(Number(rawCap)) ? Number(rawCap) : null;

    return {
      windowDays: FUNNEL_WINDOW_DAYS,
      steps,
      conversion,
      by_region: byRegion,
      by_cell: byCell,
      region_mismatches_30d: mismatches,
      // The headline priced-funnel question, end to end: of the accounts that SAW a
      // paywall, how many ended up holding a redeemed code. The step-to-step rows
      // answer a different question (how many clicked "upgrade") and the two must not
      // be read as one number.
      rates: {
        paywall_to_redeem: rateOf(counts.get("code_redeemed") || 0, counts.get("paywall_view") || 0),
      },
      returns: {
        window_days: FUNNEL_WINDOW_DAYS,
        accounts_active: activeAccounts,
        day1: rateOf(returnedDay1, activeAccounts),
        day7: rateOf(returnedDay7, activeAccounts),
      },
      signups_30d: signedUp30d,
      ai: {
        calls_today: aiCallsToday,
        cap,
        // The number the "spend at 80% of cap" alert watches.
        utilization_percent: cap && cap > 0 ? Math.round((aiCallsToday / cap) * 1000) / 10 : null,
        active_accounts_today: activeToday,
      },
      unproven: true,
    };
  } catch (e) {
    console.error("[registry] funnel failed:", String(e?.message || e).slice(0, 120));
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
    // One structured line per redemption ATTEMPT, which is what an alert rule can
    // watch: only successes wrote a row (and only the lockout counter saw the
    // misses), so a spike in people failing to redeem their code — the support-load
    // signal of a launch day — was invisible. The CODE is not in this line and never
    // reaches it: the wrapper sees the handler's verdict, not its input.
    console.log(JSON.stringify({
      event: "code_redemption",
      outcome: data?.valid === true ? "success" : "failure",
      reason: data?.valid === true ? null : String(data?.reason || "unknown").slice(0, 40),
      locked_out: data?.reason === "locked_out",
    }));
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

/**
 * Same gate as the main worker's isAdminAuthorized — do not weaken.
 * Shared semantics, duplicated body: cloudflare-admin.js cannot import from the
 * unified worker (the worker imports FROM this module; a back-import would be a
 * cycle). Keep the two in sync — the adminRegistry tests pin both.
 */
const ADMIN_SECRET_MIN_LENGTH = 24;
const ADMIN_FAIL_LIMIT = 5;
const ADMIN_FAIL_WINDOW_MS = 15 * 60 * 1000;

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isAdminAuthorized(request, env, onFailure) {
  const secret = typeof env?.ADMIN_SECRET === "string" ? env.ADMIN_SECRET : "";
  // Fail closed: unset, non-string or too-short-to-be-real secrets authorize nothing.
  if (secret.length < ADMIN_SECRET_MIN_LENGTH) return false;
  const auth = request.headers.get("Authorization") || "";
  const expected = `Bearer ${secret}`;
  // Normalize the lengths before the constant-time compare. `timingSafeEqual`
  // bails early on a length mismatch, so testing the raw header would leak the
  // secret's length; substituting a same-length dummy keeps the loop's work
  // independent of how much of the secret an attacker guessed. Mirrors the main
  // worker's gate byte-for-byte (cloudflare-unified-worker.js ->
  // isAdminAuthorized) — the two copies must stay behaviourally identical.
  const candidate =
    auth.length === expected.length
      ? auth
      : expected.replace(/./g, (_, i) => (i === 6 ? "x" : " "));
  const match = timingSafeEqual(candidate, expected);
  if (!match) {
    // The per-IP failure counter is the ONLY thing bounding a brute force of the
    // bearer secret, and it lives in a lazily-created table that the main worker
    // owns (it injects `recordAdminAuthFailure`, which also ensures that table).
    // These endpoints used to answer 401 without ever writing the counter, so
    // `/admin/api/*` could be ground with unlimited attempts while every other
    // /admin* entry point was throttled after five.
    if (typeof onFailure === "function") {
      try {
        await onFailure(request, env);
      } catch {}
    }
    return false;
  }
  return true;
}

const ADMIN_API_PREFIX = "/admin/api/";

// The editable content types and their column allow-lists are NOT declared here.
// They come from DB_SCHEMA (cloudflare-content-schema.js), which is also what
// `/admin/schema` serves to the dashboard and what the test suite cross-checks
// against `CONTENT_COLUMNS` in src/lib/content/curriculumAudit.ts — so a column
// added in one place cannot silently go missing in the other.

export async function handleAdminRoutes(url, request, env, cors, deps = {}) {
  const path = url.pathname;
  const method = request.method;

  // The main worker owns the durable per-IP admin-failure counter — and the
  // lazily-created `rate_limit_counters` table it lives in — so it injects the
  // recorder rather than this module writing a second counter of its own. The
  // recorder also ensures the ledger tables, so the first failed attempt against
  // an empty database creates the table instead of throwing.
  const recordAdminAuthFailure =
    typeof deps.recordAdminAuthFailure === "function" ? deps.recordAdminAuthFailure : null;

  // The admin surface reads the whole ledger — `redeemed_codes_ledger` feeds the
  // redemption counters, `users`/`activity_log`/`error_reports` feed the rest — so
  // it needs the full lazy batch, not just the three registry tables. The worker
  // injects its memoized `ensureLedgerTablesOnce` (a superset that also calls
  // `ensureRegistryTables`); the default keeps this module runnable on its own.
  const ensureTables = typeof deps.ensureTables === "function" ? deps.ensureTables : ensureRegistryTables;

  // Product analytics ingest (`POST /analytics/events`) is not an admin route.
  // It is delegated from here because this call site is the only dispatch point
  // the edit tooling can reach: the worker's own routing table sits past the
  // ~48 KB byte offset its header documents. Returning null for every other
  // path keeps the admin router's contract unchanged.
  const analyticsResponse = await handleAnalyticsRoute(url, request, env, cors, { json, recordActivity });
  if (analyticsResponse) return analyticsResponse;

  const isApi = path.startsWith(ADMIN_API_PREFIX);
  // Content routes kept their pre-registry paths: `/admin/upload` is already the
  // endpoint scripts/load-curriculum.mjs writes through, and `/admin/schema` and
  // `/admin/export-all` are read-only companions to it.
  const isContentStudioPath =
    path === "/admin/schema" ||
    path === "/admin/export-all" ||
    path === "/admin/upload";
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
    await ensureTables(env);
    return new Response(renderAdminDashboardHtml(env), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        // This page holds a live admin bearer token in JS memory only (never
        // written to session or local storage), and every static handler is
        // attached via addEventListener — no inline handler attributes. The
        // shell was once served with no security headers at all; the policy
        // below lets it be framed by no one and gives an injected payload
        // nowhere to phone home: `default-src 'none'` blocks any external
        // script/style/font/image, and `connect-src 'self'` means a stolen
        // token cannot be exfiltrated from this origin. 'unsafe-inline' remains
        // for the two inline <script>/<style> blocks (the Content Studio
        // scripts still use inline handlers); dropping it needs those on
        // hash/nonce — tracked follow-up, not a regression.
        "Content-Security-Policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  }

  if (!isApi && !isLegacyAdminAction && !isContentStudioPath) return null;
  if (method !== "POST" && !(method === "GET" && (isApi || isContentStudioPath))) {
    if (!isApi) return null;
  }

  if (!(await isAdminAuthorized(request, env, recordAdminAuthFailure))) {
    return json({ error: "unauthorized" }, 401, cors);
  }

  // Same guarantee for direct API/legacy calls that skip the dashboard shell.
  await ensureTables(env);

  const body = method === "POST" ? await request.json().catch(() => null) : null;
  // Content mutations are logged so an edit shows up in the Activity tab.
  const studioDeps = { recordActivity, recordError };
  const asResponse = (result) => json(result.body, result.status, cors);

  try {
    // ---------------- Content Studio (cloudflare-content-studio.js) --------
    // Every studio handler returns { status, body } and this module owns the
    // CORS/https envelope, so there is exactly one place that shapes an admin
    // response.
    if (isContentStudioPath) {
      if (path === "/admin/schema" && method === "GET") return asResponse(await contentSchema(env));
      if (path === "/admin/export-all" && method === "GET") return asResponse(await contentExportAll(env));
      if (path === "/admin/upload" && method === "POST") return asResponse(await contentUpload(env, body, studioDeps));
      return json({ error: "method_not_allowed" }, 405, cors);
    }

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

      // A5: the launch funnel on its own endpoint. It was already computed for
      // `/admin/api/overview`, but only as one field of a payload the dashboard
      // never rendered — the owner could see totals and not the sequence, which
      // is the question the funnel exists to answer.
      if (action === "metrics" && method === "GET") {
        const funnel = await buildLaunchFunnel(env);
        return json({ funnel }, 200, cors);
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

      if (action === "orders" && method === "GET") {
        return json(await listOrders(env, {
          status: url.searchParams.get("status"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        }), 200, cors);
      }

      // ---------------- Owner-managed AI provider pool ----------------
      // Every mutation is audited to the Activity tab. No response ever
      // contains API key material — the module masks everything itself.
      if (action === "ai-providers" && method === "GET") {
        return json(await listProviderConfig(env), 200, cors);
      }
      if (action === "ai-provider-save" && method === "POST") {
        const result = await upsertProviderEntry(env, body || {});
        if (result.status < 300) {
          try {
            await recordActivity(env, null, "provider_config_updated", {
              id: body?.id || null,
              provider: result.body?.provider || null,
              model: result.body?.model || null,
              key_count: result.body?.keyCount ?? null,
            });
          } catch {}
        }
        return json(result.body, result.status, cors);
      }
      if (action === "ai-provider-delete" && method === "POST") {
        const result = await deleteProviderEntry(env, String(body?.id || ""));
        if (result.status === 200) {
          try {
            await recordActivity(env, null, "provider_config_deleted", { id: String(body?.id || "") });
          } catch {}
        }
        return json(result.body, result.status, cors);
      }
      if (action === "ai-provider-default" && method === "POST") {
        const result = await setDefaultProviderState(env, String(body?.id || ""), body?.enabled === true);
        if (result.status === 200) {
          try {
            await recordActivity(env, null, "provider_default_toggled", {
              id: String(body?.id || ""),
              enabled: body?.enabled === true,
            });
          } catch {}
        }
        return json(result.body, result.status, cors);
      }
      if (action === "ai-provider-test" && method === "POST") {
        const result = await testProviderEntry(env, String(body?.id || ""));
        return json(result.body, result.status, cors);
      }

      // ---------------- Content CRUD (all four curriculum tables) ----------
      // Delegated to cloudflare-content-studio.js. Extended from the original
      // vocabulary/starter_phrases-only pair to every table, plus create and
      // delete, and the column allow-lists now come from the one DB_SCHEMA.
      if (action === "content-list" && method === "GET") {
        return asResponse(await contentList(env, url));
      }

      if (action === "content-update" && method === "POST") {
        return asResponse(await contentUpdate(env, body, studioDeps));
      }

      if (action === "content-create" && method === "POST") {
        return asResponse(await contentCreate(env, body, studioDeps));
      }

      if (action === "content-delete" && method === "POST") {
        return asResponse(await contentDelete(env, body, studioDeps));
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

/**
 * The app's public origin, or `null` when the owner has not said what it is.
 *
 * A6: the admin's "copy message" helper needs to put a redeem link in front of a
 * learner, and the dashboard deliberately does NOT guess that host. It used to be
 * blocked on this value entirely; the honest middle is to accept it when the
 * owner supplies it and say so in the panel when they have not.
 *
 * `VITE_PUBLIC_APP_URL` is the name the app build already uses, so the same value
 * works in both places; `PUBLIC_APP_URL` is accepted as the clearer worker-side
 * spelling. Anything that is not an absolute http(s) URL, or is not https off
 * loopback, is rejected rather than pasted into a learner's message — a typo'd host in a
 * payment message is worse than no link at all.
 */
export function publicAppOrigin(env) {
  const raw = String(env?.PUBLIC_APP_URL || env?.VITE_PUBLIC_APP_URL || "").trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
  return url.origin;
}

/**
 * The message the owner sends a learner with a code.
 *
 * Arabic, because the person who receives it is the learner and every other
 * learner-facing string in this project is Arabic. `%CODE%` and `%CODE_URI%` are
 * placeholders the dashboard fills per code, so this text — the copy that could
 * promise the wrong thing — has exactly one owner and is testable without a
 * browser. It states where to redeem and nothing about duration, price or
 * refunds: those live in the offer, not in a message an admin pastes into a
 * chat.
 */
export function redeemMessageAr(code, appOrigin) {
  const safeCode = String(code || "").trim();
  const lines = ["مرحباً! هذا رمز تفعيل اشتراك كَاتْزُو:", "", safeCode, ""];
  if (appOrigin) {
    lines.push("فعّله مباشرة من هذا الرابط:", `${appOrigin}/subscription?code=%CODE_URI%`, "");
  }
  lines.push("في التطبيق: «تفعيل الاشتراك» ← الصق الرمز.");
  return lines.join("\n");
}

export function renderAdminDashboardHtml(env) {
  const workerName = env?.WORKER_NAME || "katzu";
  const appOrigin = publicAppOrigin(env);
  // The message travels to the browser as a template with the two placeholders
  // intact, so the code is substituted per generated code and the copy itself
  // stays in `redeemMessageAr` (one owner, unit-tested) rather than being
  // written a second time inside the inline script.
  const redeemTemplate = JSON.stringify(redeemMessageAr("%CODE%", appOrigin));
  const raw = `<!DOCTYPE html>
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
${CONTENT_STUDIO_CSS}
</style>
</head>
<body>
<!--
  BOOT WATCHDOG. Its own script block, so it survives a parse error further
  down the page. If the dashboard script never reaches its last line, every
  button on this page is dead and the page just sits there — which reads as
  "frozen" with no clue why. This turns that silence into a visible message.
  The shell script calls window.__katzuAdminBooted() when it finishes wiring.
-->
<script>
  (function () {
    var booted = false;
    // __katzuAdminBoot is public so tests/adminDashboardBoot.test.ts can assert the
    // shell reached its last line in a real DOM, not merely that it parses.
    window.__katzuAdminBoot = false;
    window.__katzuAdminBooted = function () { booted = true; window.__katzuAdminBoot = true; };
    setTimeout(function () {
      if (booted) return;
      var banner = document.createElement("div");
      banner.setAttribute("role", "alert");
      banner.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:9999;" +
        "padding:12px 16px;background:#3a1414;color:#ffd7d7;cursor:pointer;" +
        "font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;" +
        "border-bottom:1px solid #7a2b2b";
      banner.textContent = "The dashboard script did not start, so nothing on this page can respond. " +
        "Open the browser console for the parse error and reload. " +
        "If it comes back, the served page has a syntax error — tests/adminDashboardRendered.test.ts " +
        "renders the real page and parses every script to catch this before deploy. " +
        "(Click to dismiss.)";
      banner.addEventListener("click", function () { banner.remove(); });
      document.body.appendChild(banner);
    }, 3000);
  })();
</script>
<div class="shell">
  <nav class="nav">
    <div class="brand">Katzu <span>Control Plane</span></div>
    <button id="nav-overview" data-action="showTab" data-tab="overview">Overview</button>
    <button id="nav-users" data-action="showTab" data-tab="users">Users</button>
    <button id="nav-activity" data-action="showTab" data-tab="activity">Activity</button>
    <button id="nav-errors" data-action="showTab" data-tab="errors">Errors</button>
    <button id="nav-licenses" data-action="showTab" data-tab="licenses">Licenses &amp; Plans</button>
    <button id="nav-ai" data-action="showTab" data-tab="ai">AI Providers</button>
    <button id="nav-content" data-action="showTab" data-tab="content">Content Studio</button>
    <button id="nav-schema" data-action="showTab" data-tab="schema">Database Schema</button>
    <div class="muted mono" style="padding:14px 12px;font-size:11px">worker: ${escapeHtml(workerName)}</div>
  </nav>

  <main class="main">
    <h1 id="page-title">Overview</h1>
    <div class="sub" id="page-sub">All users, free and pro, with live activity and error telemetry.</div>

    <div class="card" style="margin-bottom:18px">
      <div class="kbar">
        <input id="admin-key" type="password" placeholder="ADMIN_SECRET (Bearer token)" autocomplete="off">
        <button class="btn primary" id="save-key-btn" type="button">Connect</button>
        <span id="key-state" class="muted" style="font-size:12px">not connected — paste ADMIN_SECRET and press Connect</span>
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
      <!-- The launch funnel: accounts per step, and the step-to-step rate only
           where the previous step is a real denominator. Reads its own endpoint
           so a slow funnel query cannot hold up the overview cards. -->
      <div class="card" style="margin-top:18px">
        <h2 style="margin-top:0">Launch funnel (30 days)</h2>
        <div class="muted" style="font-size:11.5px">Distinct accounts per step · no rate is printed without a denominator.</div>
        <div id="funnel-health" style="margin-top:8px"></div>
        <div id="funnel-steps" style="margin-top:8px"></div>
        <div id="funnel-conversion" class="mono muted" style="margin-top:10px;font-size:11.5px"></div>
        <div id="funnel-cuts" style="margin-top:10px"></div>
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
        <button class="btn" id="backfill-preview-btn" type="button">Preview legacy KV backfill (read-only)</button>
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
          <button class="btn primary" id="users-search-btn" type="button">Search</button>
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
          <button class="btn" id="users-prev-btn" type="button">Prev</button>
          <button class="btn" id="users-next-btn" type="button">Next</button>
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
          <button class="btn primary" id="activity-load-btn" type="button">Load</button>
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
          <button class="btn primary" id="errors-load-btn" type="button">Load</button>
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
            <button class="btn primary" id="lic-lookup-btn" type="button">Look up</button>
          </div>
          <div id="lic-result" style="margin-top:12px"></div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">Generate activation codes</h2>
          <div class="row">
            <input id="gen-months" type="number" value="1" min="1" max="24" style="width:90px">
            <input id="gen-count" type="number" value="1" min="1" max="50" style="width:90px">
            <input id="gen-label" placeholder="teacher or cohort label (optional)" style="min-width:220px">
            <button class="btn primary" id="gen-codes-btn" type="button">Generate</button>
          </div>
          <div class="muted" style="font-size:12px;margin-top:8px">Codes are signed HMAC licenses. Treat generated output as sensitive.</div>
          ${appOrigin
            ? `<div class="muted" style="font-size:12px;margin-top:4px">Redeem links in the copied message point at <code>${appOrigin}</code>.</div>`
            : `<div class="muted" style="font-size:12px;margin-top:4px">No app URL configured, so the copied message carries the code only. Set <code>PUBLIC_APP_URL</code> (or <code>VITE_PUBLIC_APP_URL</code>) as a worker variable to include a redeem link.</div>`}
          <div id="gen-result" class="mono" style="margin-top:12px;white-space:pre-wrap"></div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">Codes per label (created vs activated)</h2>
          <button class="btn" id="codes-report-btn" type="button">Refresh report</button>
          <div id="codes-report" style="margin-top:12px"></div>
        </div>
      </div>
    </section>

    <!-- AI PROVIDERS (owner-managed pool) -->
    <section id="view-ai" class="hidden">
      <div class="grid two" style="margin-top:14px">
        <div class="card">
          <h2 style="margin-top:0">Add / edit a provider</h2>
          <div class="row" style="margin-bottom:10px">
            <select id="aip-preset" style="min-width:250px"></select>
          </div>
          <div class="row" style="margin-bottom:10px">
            <input id="aip-id" placeholder="id (left blank = auto)" style="width:170px">
            <input id="aip-provider" placeholder="provider name" style="width:170px">
          </div>
          <div class="row" style="margin-bottom:10px">
            <input id="aip-baseurl" placeholder="gateway base URL (https://…)" style="flex:1;min-width:260px">
          </div>
          <div class="row" style="margin-bottom:10px">
            <input id="aip-model" placeholder="model id" style="flex:1;min-width:200px">
            <select id="aip-format">
              <option value="openai">OpenAI chat format</option>
              <option value="gemini">Gemini format</option>
            </select>
            <select id="aip-tier">
              <option value="flagship">flagship tier</option>
              <option value="mid">mid tier</option>
              <option value="lite">lite tier</option>
            </select>
          </div>
          <div class="row" style="margin-bottom:10px">
            <textarea id="aip-keys" rows="2" placeholder="API key(s) — comma or newline separated" style="flex:1;font-family:ui-monospace,monospace"></textarea>
          </div>
          <div class="row">
            <label class="muted" style="cursor:pointer"><input id="aip-enabled" type="checkbox" checked> enabled</label>
            <label class="muted" style="cursor:pointer"><input id="aip-replace" type="checkbox"> replace stored keys (otherwise merge)</label>
            <span class="spacer"></span>
            <button class="btn" id="aip-test-btn" type="button">Test</button>
            <button class="btn" id="aip-clear-keys-btn" type="button">Clear keys</button>
            <button class="btn danger" id="aip-delete-btn" type="button">Delete</button>
            <button class="btn primary" id="aip-save-btn" type="button">Save provider</button>
          </div>
          <div class="muted" style="font-size:12px;margin-top:8px">Keys are stored server-side and never shown again — only a masked fingerprint and a count. Editing a built-in entry changes its keys (or enables/disables it); its gateway/model shape is the app's own.</div>
          <div id="aip-form-msg" class="muted" style="font-size:12.5px;margin-top:8px"></div>
        </div>
        <div class="card">
          <h2 style="margin-top:0">Pool status</h2>
          <div id="aip-status" class="mono muted" style="font-size:12px;white-space:pre-wrap"></div>
          <h2>Connectivity test</h2>
          <div id="aip-test-out" class="mono" style="font-size:12px;white-space:pre-wrap"></div>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h2 style="margin-top:0">Built-in entries</h2>
        <div id="aip-defaults"></div>
        <h2>Owner custom gateways</h2>
        <div id="aip-custom"></div>
      </div>
    </section>

${CONTENT_STUDIO_SECTIONS}
  </main>
</div>

<div id="drawer-host"></div>
<div id="toast-host"></div>

${CONTENT_STUDIO_UI_SCRIPT}
${CONTENT_STUDIO_TOOLS_SCRIPT}

<script>
  var state = { tab: "overview", userOffset: 0, userLimit: 25, adminKey: "" };    // A6: built server-side by the exported redeemMessageAr() and inlined here as
    // a template, so the message a learner receives has one definition.
    // %CODE% is the code as issued, %CODE_URI% its URL-escaped form in the link.    // Filled in on the server: see the two .replace calls at the end of
    // renderAdminDashboardHtml. Sentinels rather than interpolations, because
    // tests/adminDashboardHtml.test.ts parses this script block straight out of
    // the source file with new Function() — the way a browser parses the served
    // copy — and an interpolation is only valid after rendering.
  var REDEEM_TEMPLATE = "%%REDEEM_TEMPLATE%%";
  var APP_ORIGIN = "%%APP_ORIGIN%%";

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
    // SECURITY: memory only. The key is deliberately NOT written to any
    // storage (session/local) — a stored bearer token outlives the tab and
    // survives XSS; a variable dies with the page.
    state.adminKey = v;
    document.getElementById("admin-key").value = "";
    document.getElementById("key-state").textContent = "key loaded (memory only, clears on reload)";
    toast("Connected");
    refreshTab();
  }

  // Every existing caller only wants the parsed body.
  function api(path, opts) {
    return rawApi(path, opts).then(function (result) { return result.body; });
  }

  // The Content Studio also needs the HTTP status (a 400 carries the per-row
  // validation report, a 409 means "already exists"), so the fetch lives here
  // once and api() is a thin wrapper over it rather than a second client.
  function rawApi(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers["Authorization"] = "Bearer " + state.adminKey;
    if (opts.body) opts.headers["Content-Type"] = "application/json";
    return fetch(path, opts).then(function (res) {
      if (res.status === 401) { toast("Unauthorized — check ADMIN_SECRET", true); throw new Error("unauthorized"); }
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { status: res.status, body: body };
      });
    });
  }

  function showTab(tab) {
    state.tab = tab;
    var ids = ["overview", "users", "activity", "errors", "licenses", "ai", "content", "schema"];
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
      ai: ["AI Providers", "The provider pool every AI call walks — built-ins, your own gateways, keys and connectivity."],
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
    else if (state.tab === "ai") loadAiProviders();
    else if (state.tab === "licenses") loadCodesReport();
  }

  // ---------------------------------------------------------------------------
  // AI Providers (owner-managed pool). Presets are prefill shortcuts — every
  // field stays editable, so a "famous provider" that moved its endpoint or
  // shipped a newer model is edited in place, never hard-coded here.
  // ---------------------------------------------------------------------------
  var AI_PRESETS = [
    { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "thinkingmachines/inkling-small:free", format: "openai" },
    { id: "nvidia", label: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", model: "openai/gpt-oss-20b", format: "openai" },
    { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", format: "openai" },
    { id: "google", label: "Google AI Studio (Gemini)", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-3.5-flash-lite", format: "gemini" },
    { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", format: "openai" },
    { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", format: "openai" },
    { id: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", format: "openai" },
    { id: "together", label: "Together AI", baseUrl: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", format: "openai" },
    { id: "fireworks", label: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1", model: "accounts/fireworks/models/llama-v3p3-70b-instruct", format: "openai" },
    { id: "cerebras", label: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", model: "llama-3.3-70b", format: "openai" },
    { id: "xai", label: "xAI (Grok)", baseUrl: "https://api.x.ai/v1", model: "grok-4-fast", format: "openai" },
    { id: "custom", label: "Custom…", baseUrl: "", model: "", format: "openai" }
  ];

  function aipMsg(text, isError) {
    var host = document.getElementById("aip-form-msg");
    host.textContent = text || "";
    host.style.color = isError ? "var(--err)" : "";
  }

  function aipSetFields(entry, editingDefault) {
    // editingDefault: a built-in entry — shape inputs go read-only (the server
    // refuses shape edits there anyway); keys and the enabled toggle stay live.
    document.getElementById("aip-id").value = entry && entry.id !== undefined ? entry.id : "";
    document.getElementById("aip-provider").value = entry?.provider || "";
    document.getElementById("aip-baseurl").value = entry?.baseUrl || "";
    document.getElementById("aip-model").value = entry?.model || "";
    document.getElementById("aip-format").value = entry?.format || "openai";
    document.getElementById("aip-tier").value = entry?.tier || "mid";
    document.getElementById("aip-enabled").checked = !entry || entry.enabled !== false;
    document.getElementById("aip-replace").checked = false;
    ["aip-id", "aip-provider", "aip-baseurl", "aip-model", "aip-format", "aip-tier"].forEach(function (fid) {
      document.getElementById(fid).disabled = !!editingDefault;
    });
    document.getElementById("aip-delete-btn").disabled = !!editingDefault;
    // A fresh form (Edit, preset fill, new entry) has no pending clear.
    aipResetPending();
  }

  function aipFillFromPreset(presetId) {
    var preset = AI_PRESETS.find(function (p) { return p.id === presetId; });
    if (!preset) return;
    if (preset.id === "custom") { aipSetFields(null, false); aipMsg("Custom gateway: fill the fields yourself."); return; }
    aipSetFields({ id: "", provider: preset.id, baseUrl: preset.baseUrl, model: preset.model, format: preset.format, tier: "mid" }, false);
    aipMsg("Preset prefilled — edit anything, paste key(s), then Save.");
  }

  function aipTable(rows, defaults) {
    var wrap = document.createElement("div");
    if (!rows || !rows.length) {
      var emptyNote = document.createElement("div");
      emptyNote.className = "muted";
      emptyNote.textContent = defaults ? "(nothing)" : "No custom gateways yet — pick a preset above and save one.";
      wrap.appendChild(emptyNote);
      return wrap;
    }
    var table = document.createElement("table");
    var thead = document.createElement("tr");
    ["Entry", "Model", "Tier", "Keys", "Enabled", ""].forEach(function (h) {
      var th = document.createElement("th");
      th.textContent = h;
      thead.appendChild(th);
    });
    var head = document.createElement("thead");
    head.appendChild(thead);
    table.appendChild(head);
    var body = document.createElement("tbody");
    rows.forEach(function (entry) {
      var tr = document.createElement("tr");
      var nameTd = document.createElement("td");
      var bold = document.createElement("strong");
      bold.textContent = entry.provider;
      nameTd.appendChild(bold);
      nameTd.appendChild(document.createElement("br"));
      var urlSpan = document.createElement("span");
      urlSpan.className = "mono muted";
      urlSpan.textContent = (entry.baseUrl || "(build-in URL)") + (entry.sharedAccountCap ? " · account-wide cap" : "");
      nameTd.appendChild(urlSpan);
      tr.appendChild(nameTd);
      var modelTd = document.createElement("td");
      modelTd.className = "mono";
      modelTd.textContent = entry.model;
      tr.appendChild(modelTd);
      var tierTd = document.createElement("td");
      tierTd.textContent = entry.tier + (entry.rpd ? " · ≤" + entry.rpd + "/day" : "");
      tr.appendChild(tierTd);
      var keyTd = document.createElement("td");
      keyTd.textContent = entry.keyCount + " (" + (entry.keySource === "env" ? "env secret" : "dashboard") + ")" +
        (entry.keyFingerprints && entry.keyFingerprints.length ? " · " + entry.keyFingerprints.join(", ") : "");
      tr.appendChild(keyTd);
      var stateTd = document.createElement("td");
      if (entry.enabled) { var on = document.createElement("span"); on.className = "pill pro"; on.textContent = "on"; stateTd.appendChild(on); }
      else { var off = document.createElement("span"); off.className = "pill expired"; off.textContent = "off"; stateTd.appendChild(off); }
      tr.appendChild(stateTd);
      var actTd = document.createElement("td");
      var isDefault = entry.origin === "default";
      var editBtn = document.createElement("button");
      editBtn.className = "btn";
      editBtn.type = "button";
      editBtn.textContent = isDefault ? "Keys" : "Edit";
      editBtn.addEventListener("click", function () {
        state.aipEditing = { id: entry.id, origin: entry.origin };
        aipSetFields(entry, isDefault);
        aipMsg(isDefault ? "Built-in entry: paste its key(s) and Save to store them on the server." : "Editing " + entry.id + ".");
      });
      actTd.appendChild(editBtn);
      if (isDefault) {
        var toggleBtn = document.createElement("button");
        toggleBtn.className = "btn";
        toggleBtn.type = "button";
        toggleBtn.textContent = entry.enabled ? "Disable" : "Enable";
        toggleBtn.style.marginLeft = "6px";
        toggleBtn.addEventListener("click", function () {
          api("/admin/api/ai-provider-default", { method: "POST", body: JSON.stringify({ id: entry.id, enabled: !entry.enabled }) })
            .then(function () { aipMsg("Built-in " + entry.id + " " + (!entry.enabled ? "enabled" : "disabled") + ". Changes reach serving within ~30s."); loadAiProviders(); })
            .catch(aipCatchError);
        });
        actTd.appendChild(toggleBtn);
      }
      var testBtn = document.createElement("button");
      testBtn.className = "btn";
      testBtn.type = "button";
      testBtn.textContent = "Test";
      testBtn.style.marginLeft = "6px";
      testBtn.addEventListener("click", function () { aipTest(entry.id); });
      actTd.appendChild(testBtn);
      if (!isDefault) {
        var delBtn = document.createElement("button");
        delBtn.className = "btn danger";
        delBtn.type = "button";
        delBtn.textContent = "Delete";
        delBtn.style.marginLeft = "6px";
        delBtn.addEventListener("click", function () {
          if (!window.confirm("Delete the custom provider " + entry.id + "?")) return;
          api("/admin/api/ai-provider-delete", { method: "POST", body: JSON.stringify({ id: entry.id }) })
            .then(function () { aipMsg(entry.id + " deleted."); if (state.aipEditing?.id === entry.id) state.aipEditing = null; loadAiProviders(); })
            .catch(aipCatchError);
        });
        actTd.appendChild(delBtn);
      }
      tr.appendChild(actTd);
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    return wrap;
  }

  function aipCatchError() { aipMsg("Request failed — see browser console.", true); }

  // Splits a pasted key list on commas, semicolons and line breaks.
  // This code lives inside the dashboard's template literal, so the regex
  // below is written with DOUBLED backslashes: the browser must receive a
  // pattern with escaped line breaks, never a real newline inside it (a real
  // newline is a parse error that kills the whole inline script, and the
  // dashboard goes static). Keep this comment free of backslashes too.
  function aipParseKeys(raw) {
    return String(raw || "").split(/[,;\\r\\n]+/).map(function (k) { return k.trim(); }).filter(Boolean);
  }

  function loadAiProviders() {
    api("/admin/api/ai-providers").then(function (data) {
      var preset = document.getElementById("aip-preset");
      if (!preset.dataset.filled) {
        AI_PRESETS.forEach(function (p) {
          var opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.label;
          preset.appendChild(opt);
        });
        preset.dataset.filled = "1";
        preset.addEventListener("change", function () { aipFillFromPreset(preset.value); });
      }
      var d = document.getElementById("aip-defaults");
      var c = document.getElementById("aip-custom");
      d.innerHTML = "";
      c.innerHTML = "";
      d.appendChild(aipTable(data.defaults, true));
      c.appendChild(aipTable(data.custom, false));
      var status = document.getElementById("aip-status");
      status.textContent = "Walk order (first = tried first):\\n" + (data.pool_order || []).join("\\n") +
        "\\n\\nLast config update: " + (data.updated_at ? new Date(data.updated_at).toISOString() : "(never saved)");
      document.getElementById("aip-test-out").textContent = "";
    }).catch(aipCatchError);
  }

  function aipCollectBody() {
    var body = {
      id: document.getElementById("aip-id").value.trim() || undefined,
      provider: document.getElementById("aip-provider").value.trim(),
      baseUrl: document.getElementById("aip-baseurl").value.trim(),
      model: document.getElementById("aip-model").value.trim(),
      format: document.getElementById("aip-format").value,
      tier: document.getElementById("aip-tier").value,
      enabled: document.getElementById("aip-enabled").checked,
    };
    var keysRaw = document.getElementById("aip-keys").value;
    if (document.getElementById("aip-replace").checked) body.replaceKeys = true;
    if (keysRaw.trim()) body.keys = aipParseKeys(keysRaw);
    return body;
  }

  function saveAiProvider() {
    var editing = state.aipEditing;
    if (editing && editing.origin === "default") {
      // Built-in: keys (+ clear) only; enabled goes through its own toggle.
      var bodyD = { id: editing.id };
      if (document.getElementById("aip-clear-keys-btn").dataset.pending === "1") bodyD.keys = null;
      else {
        var keysRaw = document.getElementById("aip-keys").value;
        if (!keysRaw.trim()) { aipMsg("Paste at least one key (or use Clear keys) before saving a built-in entry.", true); return; }
        bodyD.keys = aipParseKeys(keysRaw);
      }
      api("/admin/api/ai-provider-save", { method: "POST", body: JSON.stringify(bodyD) })
        .then(function (res) { state.aipEditing = null; aipSetFields(null, false); aipResetPending(); aipMsg("Stored keys for " + (res.id || editing.id) + " — serving picks them up within ~30s."); loadAiProviders(); })
        .catch(function () { aipResetPending(); aipCatchError(); });
      return;
    }
    var body = aipCollectBody();
    // "Clear keys" has to reach the server for a custom entry too, otherwise
    // the saved gateway keeps its old key list. The worker reads clearKeys as
    // "store an empty list"; keys is dropped so it cannot be sent along.
    if (document.getElementById("aip-clear-keys-btn").dataset.pending === "1") {
      body.clearKeys = true;
      delete body.keys;
    }
    if (!body.provider || !body.baseUrl || !body.model) {
      aipMsg("Provider, base URL and model are required.", true);
      return;
    }
    api("/admin/api/ai-provider-save", { method: "POST", body: JSON.stringify(body) })
      .then(function (res) {
        state.aipEditing = null;
        aipSetFields(null, false);
        aipResetPending();
        aipMsg("Saved " + (res.id || res.provider) + (res.status === 201 ? " (created)" : "") + ". Serving picks it up within ~30s.");
        loadAiProviders();
      })
      .catch(aipCatchError);
  }

  function aipClearKeys() {
    document.getElementById("aip-keys").value = "";
    document.getElementById("aip-clear-keys-btn").dataset.pending = "1";
    aipMsg("Keys field cleared. Saving a built-in entry now removes its stored key list (falls back to the worker secret); a custom entry saves with no new keys.");
  }

  function aipResetPending() {
    document.getElementById("aip-clear-keys-btn").dataset.pending = "";
  }

  function aipTest(id) {
    var out = document.getElementById("aip-test-out");
    out.textContent = "Testing " + id + "…";
    api("/admin/api/ai-provider-test", { method: "POST", body: JSON.stringify({ id: id }) }).then(function (r) {
      if (r.ok) {
        out.textContent = (r.id || id) + " — OK in " + r.latency_ms + " ms via " + r.provider + "/" + r.model +
          (r.testedKey ? " (key " + r.testedKey + ")" : "") + "\\nsample: " + (r.sample || "(empty)");
      } else if (r.reason === "no_keys") {
        out.textContent = (r.id || id) + " — no keys configured. Save a key list first (dashboard or worker secret).";
      } else {
        out.textContent = (r.id || id) + " — FAILED: " + (r.message || r.kind || "unknown") +
          (r.status ? " (HTTP " + r.status + ", kind=" + r.kind + ")" : "");
      }
    }).catch(aipCatchError);
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
    // Separate request on purpose: a heavy funnel query must not delay the cards.
    loadFunnel();
  }

  /**
   * The funnel panel. Steps as counts, then the step-to-step rate, then the two
   * price cuts — in that order, because "where do they stop" comes before "which
   * price did they see".
   */
  function renderFunnel(funnel) {
    funnel = funnel || {};
    var steps = (funnel.steps || []).map(function (s) { return { name: s.name, c: s.accounts }; });
    renderTopList("funnel-steps", steps, "name");

    var conv = document.getElementById("funnel-conversion");
    conv.innerHTML = "";
    var rows = funnel.conversion || [];
    if (!rows.length) {
      conv.appendChild(el("div", "muted", "No funnel activity in the window yet."));
    } else {
      rows.forEach(function (r) {
        var percent = r.percent === null || r.percent === undefined ? "—" : r.percent + "%";
        conv.appendChild(el("div", "", r.from + " → " + r.to + ": " + r.accounts + " of " + r.previous + " (" + percent + ")"));
      });
    }

    var cuts = document.getElementById("funnel-cuts");
    cuts.innerHTML = "";
    var byCell = funnel.by_cell || [];
    var byRegion = funnel.by_region || [];
    if (byRegion.length) {
      cuts.appendChild(el("div", "muted", "By price group: " + byRegion.map(function (r) { return r.region + " ×" + r.c; }).join(" · ")));
    }
    if (byCell.length) {
      cuts.appendChild(el("div", "muted", "By price cell: " + byCell.map(function (r) {
        return "cell " + r.cell + " " + r.views + "v/" + r.clicks + "c/" + r.purchases + "p";
      }).join(" · ")));
    }
    if (funnel.region_mismatches_30d) {
      cuts.appendChild(el("div", "muted", funnel.region_mismatches_30d + " region mismatch(es) in 30 days — logged, never blocked."));
    }

    // The numbers the launch is actually judged on, each with its denominator.
    var health = document.getElementById("funnel-health");
    if (health) {
      health.innerHTML = "";
      var pct = function (r) { return !r || r.percent === null || r.percent === undefined ? "—" : r.percent + "%"; };
      var of = function (r) { return r.accounts + " of " + r.of; };
      var ret = funnel.returns || {};
      health.appendChild(el("div", "", "Day 1 return: " + of(ret.day1 || { accounts: 0, of: 0 }) + " (" + pct(ret.day1) + ") · Day 7: " + of(ret.day7 || { accounts: 0, of: 0 }) + " (" + pct(ret.day7) + ")"));
      health.appendChild(el("div", "", "Paywall → redeemed: " + of((funnel.rates || {}).paywall_to_redeem || { accounts: 0, of: 0 }) + " (" + pct((funnel.rates || {}).paywall_to_redeem) + ")"));
      var ai = funnel.ai || {};
      var util = ai.utilization_percent === null || ai.utilization_percent === undefined ? "—" : ai.utilization_percent + "%";
      health.appendChild(el("div", "", "AI calls today: " + (ai.calls_today || 0) + (ai.cap === null || ai.cap === undefined ? " (no cap set)" : " of " + ai.cap + " — " + util) + " · " + (ai.active_accounts_today || 0) + " account(s) active today"));
      health.appendChild(el("div", "muted", "Signups in 30 days: " + (funnel.signups_30d || 0) + " · window " + (funnel.windowDays || 30) + " days"));
    }
  }

  function loadFunnel() {
    api("/admin/api/metrics").then(function (data) {
      renderFunnel(data.funnel);
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
    var label = (document.getElementById("gen-label") || {}).value || "";
    var out = document.getElementById("gen-result");
    out.textContent = "Generating…";
    api("/admin/generate", { method: "POST", body: JSON.stringify({ months: Number(months), count: count, label: label }) })
      .then(function (data) {
        var codes = data.codes || (data.code ? [data.code] : [JSON.stringify(data)]);
        out.textContent = "";
        for (var i = 0; i < codes.length; i++) {
          out.appendChild(codeRow(codes[i]));
        }
      })
      .catch(function () { out.textContent = "Generation failed."; });
  }

  /**
   * One generated code, with the two things the owner actually does next.
   *
   * "Copy message" is the A6 helper: the whole Arabic message, ready to paste into
   * a chat, with the redeem link when an app URL is configured. "Copy code" stays
   * because a code is sometimes all that is wanted (a printed card, a spreadsheet).
   */
  function codeRow(code) {
    var row = el("div", "row");
    row.style.margin = "6px 0";
    var value = el("span", "mono", code);
    value.style.flex = "1";
    value.style.minWidth = "220px";
    value.style.overflowWrap = "anywhere";
    row.appendChild(value);
    row.appendChild(codeButton("Copy message", code, true));
    row.appendChild(codeButton("Copy code", code, false));
    return row;
  }

  function codeButton(label, code, asMessage) {
    var btn = el("button", "btn", label);
    btn.type = "button";
    btn.onclick = function () {
      var text = asMessage
        ? REDEEM_TEMPLATE.split("%CODE_URI%").join(encodeURIComponent(code)).split("%CODE%").join(code)
        : code;
      copyText(text, asMessage ? "Message copied" : "Code copied");
    };
    return btn;
  }

  /**
   * Clipboard, with a fallback and an honest failure.
   *    * navigator.clipboard is undefined on the plain-http origin an admin sometimes
     * runs the worker on locally, and writeText rejects when the document is not
     * focused. Either way the owner must not be told "copied" when nothing was:
   * the fallback selects the text so a manual ⌘/Ctrl+C still works, and a real
   * failure says so.
   */
  function copyText(text, okMessage) {
    function done(ok) {
      if (ok) toast(okMessage);
      else toast("Could not copy — select the text and copy manually.", true);
    }
    function fallback() {
      try {
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "readonly");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(area);
        done(ok);
      } catch (err) {
        done(false);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
      return;
    }
    fallback();
  }

  function loadCodesReport() {
    var out = document.getElementById("codes-report");
    if (!out) return;
    out.textContent = "Loading…";
    api("/admin/codes/report")
      .then(function (data) {
        var labels = (data && data.labels) || [];
        out.textContent = "";
        if (!labels.length) { out.appendChild(el("div", "muted", "No codes recorded yet.")); return; }
        // Built with DOM nodes, not innerHTML. The old string-building version
        // called a server-only HTML escaper, so the browser threw a
        // ReferenceError and the panel always read "Report unavailable."
        // Building nodes also keeps a DB-sourced label out of an HTML parser.
        var table = el("table", "mono");
        table.style.borderCollapse = "collapse";
        var head = el("tr");
        var thLabel = el("th", "", "Label");
        thLabel.style.textAlign = "left";
        var thCreated = el("th", "", "Created");
        var thActivated = el("th", "", "Activated");
        [thLabel, thCreated, thActivated].forEach(function (th) { th.style.padding = "4px 12px"; });
        head.appendChild(thLabel);
        head.appendChild(thCreated);
        head.appendChild(thActivated);
        table.appendChild(head);
        labels.forEach(function (l) {
          var tr = el("tr");
          var tdLabel = el("td", "", l.label || "(unlabelled)");
          var tdCreated = el("td", "", l.created);
          var tdActivated = el("td", "", l.activated);
          tdLabel.style.padding = "4px 12px 4px 0";
          [tdCreated, tdActivated].forEach(function (td) {
            td.style.textAlign = "center";
            td.style.padding = "4px 12px";
          });
          tr.appendChild(tdLabel);
          tr.appendChild(tdCreated);
          tr.appendChild(tdActivated);
          table.appendChild(tr);
        });
        out.appendChild(table);
        if (data.totals) {
          var total = el("div", "muted", "Total: " + data.totals.created + " created · " + data.totals.activated + " activated");
          total.style.marginTop = "8px";
          out.appendChild(total);
        }
      })
      .catch(function () { out.textContent = "Report unavailable."; });
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

  // ------------------------------------------------------------------
  // Event wiring. Every static handler is attached here — the markup
  // carries data-action/data-tab attributes, never inline handler
  // attributes, so the page's script-src can drop 'unsafe-inline' once
  // the Content Studio scripts do the same. Rows rendered dynamically
  // keep their own addEventListener bindings (see loadUsers/openUser).
  // ------------------------------------------------------------------
  function on(id, fn) {
    var node = document.getElementById(id);
    if (node) node.addEventListener("click", fn);
  }

  document.querySelectorAll("[data-action='showTab']").forEach(function (btn) {
    btn.addEventListener("click", function () { showTab(btn.getAttribute("data-tab")); });
  });
  on("save-key-btn", saveKey);
  on("backfill-preview-btn", loadBackfillPreview);
  on("users-search-btn", function () { loadUsers(0); });
  on("users-prev-btn", function () { pageUsers(-1); });
  on("users-next-btn", function () { pageUsers(1); });
  on("activity-load-btn", loadActivity);
  on("errors-load-btn", loadErrors);
  on("lic-lookup-btn", licLookup);
  on("gen-codes-btn", genCodes);
  on("codes-report-btn", loadCodesReport);
  // No eager load here: on page load no admin key exists yet, so the request
  // would come back 401 and raise a bogus "Unauthorized" toast. The report
  // loads when the Licenses tab is opened (see refreshTab) or via its button.
  on("aip-save-btn", saveAiProvider);
  on("aip-test-btn", function () {
    var id = state.aipEditing?.id || document.getElementById("aip-id").value.trim();
    if (!id) { aipMsg("Type an id (or press Edit on a row) before testing.", true); return; }
    aipTest(id);
  });
  on("aip-clear-keys-btn", aipClearKeys);
  // Typing a key after "Clear keys" cancels the pending clear — otherwise the
  // next save would wipe the list the owner just pasted.
  var aipKeysInput = document.getElementById("aip-keys");
  if (aipKeysInput) aipKeysInput.addEventListener("input", function () { aipResetPending(); });
  on("aip-delete-btn", function () {
    var editing = state.aipEditing;
    if (!editing || editing.origin === "default") {
      aipMsg("Select a custom entry first (press Edit on it). Built-in entries are toggled off, never deleted.", true);
      return;
    }
    if (!window.confirm("Delete the custom provider " + editing.id + "?")) return;
    api("/admin/api/ai-provider-delete", { method: "POST", body: JSON.stringify({ id: editing.id }) })
      .then(function () { state.aipEditing = null; aipSetFields(null, false); aipMsg(editing.id + " deleted."); loadAiProviders(); })
      .catch(aipCatchError);
  });

  // Enter in the key field connects without a click.
  var keyInput = document.getElementById("admin-key");
  if (keyInput) keyInput.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); saveKey(); }
  });

  showTab("overview");

  // Everything above wired. Tell the boot watchdog in the page's first script
  // block that this page is alive, so it does not raise its banner.
  if (typeof window.__katzuAdminBooted === "function") window.__katzuAdminBooted();
</script>
</body>
</html>`;

  // The two server-owned constants, substituted as whole JSON literals (quotes
  // included) so the sentinels cannot survive into a served page. Kept at the end
  // of the function, next to the template they belong to.
  return raw
    .replace('"%%REDEEM_TEMPLATE%%"', () => redeemTemplate)
    .replace('"%%APP_ORIGIN%%"', () => JSON.stringify(appOrigin));
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
