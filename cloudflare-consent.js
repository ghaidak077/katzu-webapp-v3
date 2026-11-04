/**
 * Conversation-review consent — the learner's half of the text-logging gate.
 *
 * WHY THIS FILE EXISTS
 * `cloudflare-telemetry.js` stores conversation text only when BOTH gates are
 * on: the operator switch (`CONVERSATION_LOGGING`) and an explicit grant for
 * this account at KV `consent:logging:<sub>`. Until now nothing in the product
 * could write that grant, so the switch could be on and the panel would stay
 * empty forever. This module is the only writer of that key, and it belongs to
 * the learner: the app's Settings screen calls it, and no operator route can.
 *
 * THE TWO VERBS
 *   GET  /consent/conversation  → what the Settings toggle should show.
 *   POST /consent/conversation  → `{ granted: true }` records the grant;
 *                                 `{ granted: false }` withdraws it AND deletes
 *                                 the turns already stored for this account,
 *                                 which is what the privacy page promises.
 *
 * WHY WITHDRAWAL DELETES ROWS
 * The published text says consent can be withdrawn and the conversations
 * deleted at any time in Settings. A toggle that only stopped future writes
 * would leave the promise false for everything already collected, so the
 * withdrawal path is a hard delete of this account's `conversations` rows and
 * their `conversation_attempts`, scoped by the session's `sub` — never by a
 * value in the request body.
 *
 * WHAT IT NEVER DOES
 * It never accepts an account id, email or `turn_id` from the client, so one
 * learner cannot grant, revoke or delete another learner's rows. It stores no
 * text itself; the writers stay in `cloudflare-telemetry.js`.
 */

import {
  consentKey,
  conversationLoggingEnabled,
  hasLoggingConsent,
  ensureTelemetryTables,
  buildConversationRow,
  CONVERSATION_RETENTION_DAYS,
} from "./cloudflare-telemetry.js";

export const CONSENT_PATH = "/consent/conversation";
export const REPORT_PATH = "/consent/conversation/report";

/** One learner-triggered exchange, capped before it reaches the row builder. */
const REPORT_MAX_CHARS = 2000;

function reportTurnId(sub) {
  const raw =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const prefix = String(sub || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 16) || "learner";
  return `report_${prefix}_${String(raw).replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}`;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      // A per-account privacy state must never be served from a cache.
      "Cache-Control": "no-store",
      ...cors,
    },
  });
}

/** Status for the Settings toggle. Auth is required: consent is per account. */
async function handleConsentStatus(request, env, cors, deps) {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, cors);
  const account = await deps.authenticate(request);
  if (!account?.sub) return json({ ok: false, error: "unauthorized" }, 401, cors);
  const granted = await hasLoggingConsent(env, account.sub);
  return json(
    { ok: true, available: conversationLoggingEnabled(env), granted },
    200,
    cors,
  );
}

async function handleConsentWrite(request, env, cors, deps) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  const account = await deps.authenticate(request);
  if (!account?.sub) return json({ ok: false, error: "unauthorized" }, 401, cors);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.granted !== "boolean") {
    return json({ ok: false, error: "malformed_body" }, 400, cors);
  }
  if (!env?.USER_PROGRESS?.put || !env?.USER_PROGRESS?.delete) {
    return json({ ok: false, error: "storage_unavailable" }, 503, cors);
  }

  const available = conversationLoggingEnabled(env);
  const key = consentKey(account.sub);

  if (body.granted === true) {
    // Granting while the operator switch is off would record nothing and would
    // tell the learner their conversations are being reviewed when they are
    // not. Refuse instead of storing a grant the product cannot honour.
    if (!available) return json({ ok: false, error: "logging_unavailable" }, 409, cors);
    try {
      await env.USER_PROGRESS.put(key, "1");
    } catch {
      return json({ ok: false, error: "storage_unavailable" }, 503, cors);
    }
    return json({ ok: true, available, granted: true }, 200, cors);
  }

  // Withdrawal is allowed even while the switch is off: turning logging off
  // must never require the operator to turn it back on first.
  try {
    await env.USER_PROGRESS.delete(key);
  } catch {
    return json({ ok: false, error: "storage_unavailable" }, 503, cors);
  }

  let deletedTurns = 0;
  if (env?.DB?.prepare) {
    try {
      await ensureTelemetryTables(env);
      // Attempts first: they reference `turn_id`, and the subquery must still
      // see the conversations rows when it runs.
      await env.DB.prepare(
        `DELETE FROM conversation_attempts
          WHERE turn_id IN (SELECT turn_id FROM conversations WHERE user_id = ?)`,
      )
        .bind(account.sub)
        .run();
      const result = await env.DB.prepare(`DELETE FROM conversations WHERE user_id = ?`)
        .bind(account.sub)
        .run();
      deletedTurns = Number(result?.meta?.changes ?? 0);
    } catch {
      // The grant is already gone, so nothing new is written. A failed delete is
      // reported so the learner can retry rather than being told it worked.
      return json({ ok: false, error: "delete_incomplete", granted: false }, 500, cors);
    }
  }

  return json({ ok: true, available, granted: false, deleted_turns: deletedTurns }, 200, cors);
}

/**
 * `POST /consent/conversation/report` — one learner-reported exchange.
 *
 * This is the learner's second, narrower consent verb. It is intentionally NOT
 * gated on `consent:logging:<sub>`: the learner is reporting a reply they are
 * looking at right now, so that one exchange may be stored even while the
 * global review toggle is off. The operator switch still gates it — with
 * logging off there is nowhere honest to send the report.
 *
 * The endpoint accepts only the two visible strings (plus context for sorting).
 * It never accepts a user id, never trusts a turn id, and redacts through the
 * same `buildConversationRow` path as ordinary turns.
 */
async function handleReportWrite(request, env, cors, deps) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  const account = await deps.authenticate(request);
  if (!account?.sub) return json({ ok: false, error: "unauthorized" }, 401, cors);
  if (!conversationLoggingEnabled(env)) {
    return json({ ok: false, error: "logging_unavailable" }, 409, cors);
  }
  if (!env?.DB?.prepare) return json({ ok: false, error: "storage_unavailable" }, 503, cors);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.learner_text !== "string" || typeof body.reply_text !== "string") {
    return json({ ok: false, error: "malformed_body" }, 400, cors);
  }
  const learnerText = body.learner_text.trim().slice(0, REPORT_MAX_CHARS);
  const replyText = body.reply_text.trim().slice(0, REPORT_MAX_CHARS);
  if (!learnerText || !replyText) return json({ ok: false, error: "malformed_body" }, 400, cors);

  const row = buildConversationRow({
    request,
    body: {
      session_id: typeof body.session_id === "string" ? body.session_id.slice(0, 80) : undefined,
      turn_index: body.turn_index,
      scenario_id: typeof body.scenario_id === "string" ? body.scenario_id.slice(0, 80) : undefined,
      cefr_level: typeof body.cefr_level === "string" ? body.cefr_level.slice(0, 4) : undefined,
      user_message: learnerText,
    },
    payload: { reply_de: replyText },
    user: account,
    latencyMs: null,
    turnId: reportTurnId(account.sub),
    outcome: "reported",
    guard: "learner_report",
  });

  try {
    await ensureTelemetryTables(env);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO conversations
        (turn_id, session_id, turn_no, ts, ts_local, user_id, plan, scenario, level, opener_id,
         learner_text, reply_text, hints, corrections, word_cards, device, os, browser,
         app_version, locale, country, outcome, guard, latency_ms, provider, model,
         flagged, note, redacted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'learner_report', 0)`,
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
      .run();
  } catch {
    return json({ ok: false, error: "storage_unavailable" }, 503, cors);
  }

  return json(
    { ok: true, stored: true, retention_days: CONVERSATION_RETENTION_DAYS },
    200,
    cors,
  );
}

/**
 * Routes `/consent/conversation`. Returns null for any other path so the worker
 * can keep its dispatch chain flat.
 *
 * `deps.authenticate(request)` must resolve the session's own account (Google
 * ID token or `sess_` token) to `{ sub, email }`; it is injected because the
 * verifier lives in the worker and this module must not import it.
 */
export async function handleConsentRoute(url, request, env, cors, deps = {}) {
  const isReport = url.pathname === REPORT_PATH;
  if (url.pathname !== CONSENT_PATH && !isReport) return null;
  if (typeof deps.authenticate !== "function") {
    return json({ ok: false, error: "unauthorized" }, 401, cors);
  }
  try {
    if (isReport) return await handleReportWrite(request, env, cors, deps);
    if (request.method === "GET") return await handleConsentStatus(request, env, cors, deps);
    if (request.method === "POST") return await handleConsentWrite(request, env, cors, deps);
    return json({ error: "method_not_allowed" }, 405, cors);
  } catch {
    return json({ ok: false, error: "internal_error" }, 500, cors);
  }
}
