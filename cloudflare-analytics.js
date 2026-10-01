/**
 * First-party product analytics ingest (`POST /analytics/events`).
 *
 * A module of its own because the route dispatch it needs sits past the ~48 KB
 * byte offset the edit tooling cannot reach. It is therefore delegated from
 * `handleAdminRoutes` in cloudflare-admin.js — the nearest reachable dispatch
 * point — which passes its `json` helper in; nothing else is injected. Rate
 * limiting is isolate-local (the same trade-off the worker's other abuse
 * controls document), and the handler is body-capped and allowlist-validated.
 *
 * WHAT THIS ROUTE IS FOR
 * Answering a short, fixed list of product questions — where visitors quit, do
 * they finish a first lesson, do they speak, do they come back to review, which
 * paywall appears before a purchase, which goals/levels retain. Nothing else.
 *
 * WHAT IT EXPLICITLY REFUSES
 * The allowlist below is closed. Unknown event names, unknown property keys,
 * events older than a week, or ids that are not random installation ids are
 * rejected per event rather than stored — the client enforces the same rules,
 * and a test pins the two lists together so the contract cannot drift.
 *
 * STORAGE
 * Each accepted batch is one KV record under `analytics:evt:<day>:<random>`
 * with a 30-day TTL. Append-only records avoid the read-modify-write race a
 * shared daily counter would have across isolates, and the day prefix makes the
 * funnel reconstructable per day. No PII is stored: no email, no IP (the IP is
 * used for rate limiting and then discarded), no learner text.
 *
 * The route is unauthenticated by necessity — the landing page and the public
 * demo have no account — so it is IP rate-limited and body-capped at 32 KB.
 */

export const MAX_EVENTS_PER_BATCH = 20;
export const MAX_BODY_BYTES = 32 * 1024;
/** Events older than this are refused: a stale queue is not worth replaying. */
export const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const ANALYTICS_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Kept in lockstep with ANALYTICS_EVENTS in src/lib/analytics/events.ts. */
export const EVENT_NAMES = [
  "landing_viewed",
  "demo_started",
  "demo_completed",
  "signup_started",
  "signup_completed",
  "onboarding_started",
  "onboarding_completed",
  "placement_started",
  "placement_completed",
  "scenario_started",
  "scenario_studied",
  "scenario_completed",
  "quiz_completed",
  "conversation_started",
  "first_independent_turn",
  "conversation_completed",
  "return_day1",
  "return_day7",
  "review_started",
  "review_completed",
  "coach_viewed",
  "writing_completed",
  "listening_completed",
  "paywall_viewed",
  "purchase_clicked",
  "code_redeemed",
  "app_error",
];

/** Kept in lockstep with ALLOWED_PROP_KEYS in src/lib/analytics/events.ts. */
export const PROP_KEYS = [
  "scenarioId",
  "skill",
  "category",
  "source",
  "kind",
  "state",
  "reason",
  "count",
];

const LEVELS = new Set(["A1", "A2", "B1", "B2"]);
const GOALS = new Set(["daily_life", "work", "university", "exam"]);

/** Abuse control only. Isolate-local, so it throttles rather than guarantees. */
export const ANALYTICS_RATE_LIMITS = { perMinute: 30, perDay: 600 };

const rateBuckets = new Map();

/**
 * Minimal per-key window counter. The worker's shared limiter lives past the
 * edit boundary, and injecting it would have meant another unreachable edit;
 * this is deliberately small and only needs to stop a runaway client.
 */
function checkLocalRateLimit(key, limits, now = Date.now()) {
  const bucket = rateBuckets.get(key) || { minuteStart: now, minuteCount: 0, dayStart: now, dayCount: 0 };
  if (now - bucket.minuteStart >= 60_000) {
    bucket.minuteStart = now;
    bucket.minuteCount = 0;
  }
  if (now - bucket.dayStart >= 24 * 60 * 60 * 1000) {
    bucket.dayStart = now;
    bucket.dayCount = 0;
  }
  bucket.minuteCount += 1;
  bucket.dayCount += 1;
  rateBuckets.set(key, bucket);
  return {
    allowed: bucket.minuteCount <= limits.perMinute && bucket.dayCount <= limits.perDay,
  };
}

function clean(value, max) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/**
 * Same contract as the client validator. Returns `{ ok, event }` or
 * `{ ok: false, reason }`; the reason is counted, never stored.
 */
export function validateAnalyticsEvent(input, now = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "not_object" };
  if (typeof input.name !== "string" || !EVENT_NAMES.includes(input.name)) return { ok: false, reason: "unknown_event" };
  const ts = Number(input.ts);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_EVENT_AGE_MS) return { ok: false, reason: "bad_timestamp" };

  // An installation id is random, not derived: 8-64 characters, no '@' (an
  // email-shaped value means a client bug that must not become stored data).
  const installId = clean(input.installId, 64);
  if (!installId || installId.length < 8 || installId.includes("@")) {
    return { ok: false, reason: "bad_install_id" };
  }

  const event = {
    name: input.name,
    ts: Math.round(ts),
    installId,
    appVersion: clean(input.appVersion, 32) || "unknown",
    route: clean(input.route, 200) || "/",
  };

  const userId = clean(input.userId, 64);
  if (userId && userId.startsWith("acct_")) event.userId = userId;
  const level = clean(input.level, 4);
  if (level && LEVELS.has(level)) event.level = level;
  const goal = clean(input.goal, 24);
  if (goal && GOALS.has(goal)) event.goal = goal;

  if (input.props && typeof input.props === "object" && !Array.isArray(input.props)) {
    const props = {};
    for (const key of PROP_KEYS) {
      const value = input.props[key];
      if (typeof value === "number" && Number.isFinite(value)) props[key] = Math.round(value * 100) / 100;
      else if (typeof value === "string" && value.trim()) props[key] = value.trim().slice(0, 64);
    }
    if (Object.keys(props).length > 0) event.props = props;
  }

  return { ok: true, event };
}

/**
 * Handles `/analytics/events`; returns null for every other path so the worker's
 * own routing continues. `deps` carries `json` and `checkRateLimit` from the
 * worker so this module owns no duplicated infrastructure.
 */
export async function handleAnalyticsRoute(url, request, env, cors, deps) {
  if (!url || url.pathname !== "/analytics/events") return null;
  const { json, checkRateLimit } = deps || {};
  if (typeof json !== "function") return null;

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: "payload_too_large", message: "Analytics batch exceeds 32KB." }, 413, cors);
  }

  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const incoming = Array.isArray(body?.events) ? body.events : null;
  if (!incoming || incoming.length === 0 || incoming.length > MAX_EVENTS_PER_BATCH) {
    return json({ error: "invalid_batch", message: `events must be an array of 1-${MAX_EVENTS_PER_BATCH}.` }, 400, cors);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  // Prefer the worker's shared limiter when a caller can inject it; otherwise
  // fall back to the local window counter above.
  const limiter =
    typeof checkRateLimit === "function"
      ? checkRateLimit(`analytics:${ip}`, { AI_RATE_LIMIT_PER_MINUTE: "30", AI_RATE_LIMIT_PER_DAY: "600" })
      : checkLocalRateLimit(`analytics:${ip}`, ANALYTICS_RATE_LIMITS);
  if (!limiter.allowed) {
    return json({ success: false, error: "rate_limited" }, 429, cors);
  }

  const now = Date.now();
  const accepted = [];
  let rejected = 0;
  for (const candidate of incoming) {
    const result = validateAnalyticsEvent(candidate, now);
    if (result.ok) accepted.push(result.event);
    else rejected += 1;
  }

  // Storage is best-effort by design: analytics must never fail a learner's
  // request, and a lost batch of counters is not worth an error path.
  if (accepted.length > 0 && env?.USER_PROGRESS?.put) {
    try {
      const day = new Date(now).toISOString().slice(0, 10);
      const suffix =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${now}_${Math.random().toString(36).slice(2, 10)}`;
      await env.USER_PROGRESS.put(
        `analytics:evt:${day}:${suffix}`,
        JSON.stringify({ receivedAt: now, events: accepted }),
        { expirationTtl: ANALYTICS_TTL_SECONDS }
      );
    } catch (error) {
      console.error("[analytics] store failed:", String(error?.message || error).slice(0, 160));
    }
  }

  return json({ success: true, accepted: accepted.length, rejected }, 200, cors);
}
