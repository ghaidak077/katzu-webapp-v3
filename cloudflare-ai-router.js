/**
 * Multi-provider AI router: pool, transports, and the terminal day-quota ledger.
 *
 * WHY THIS EXISTS
 * The first router (still visible as the legacy walker inside
 * cloudflare-unified-worker.js) walked every API key × every Gemini model on
 * every request, and treated a DAILY quota 429 as "try the next model" with no
 * memory of the failure. Two compounding defects followed from that:
 *
 *  1. Detection never fired. The branch tested `respText.includes("per_day")`,
 *     but Gemini reports `"quotaId": "GenerateRequestsPerDayPerProjectPerModel-
 *     FreeTier"` — CamelCase, no underscore — so a day-exhausted key was only
 *     given the 25s per-minute cooldown and was retried forever, all day.
 *  2. Cost is per attempt, not per request. One learner sentence is two calls
 *     (roleplay + evaluation), each walking keys × models, so a single message
 *     could reach 8–48 provider requests — fast, because a rejected request
 *     returns in milliseconds.
 *
 * WHAT THIS MODULE GUARANTEES
 * - A (provider, key, model) unit that has hit its DAILY window is never called
 *   again until its window resets (the ledger below), so a bad day costs one
 *   failed attempt per unit, not one per message.
 * - Nothing is called that cannot answer: a model that reports "not found" is
 *   parked for the day, and pool entries with an unset/placeholder model are
 *   skipped entirely.
 * - Total time is bounded (ROUTER_BUDGET_MS) so the client's 30s timeout cannot
 *   fire first and turn one failed turn into a retry storm.
 *
 * Secrets: this module never logs, returns, or persists a key. Ledger entries
 * and cache keys use a non-reversible fingerprint (`keyFingerprint`) so the KV
 * copy of the ledger carries no credential material.
 */

import { recordActivity } from "./cloudflare-admin.js";

// ---------------------------------------------------------------------------
// Provider endpoints
// ---------------------------------------------------------------------------

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Secret name per provider. Same comma/semicolon/newline list format for all. */
export const PROVIDER_ENV_VARS = {
  gemini: "GEMINI_API_KEYS",
  groq: "GROQ_API_KEYS",
  openrouter: "OPENROUTER_API_KEYS",
  nvidia: "NVIDIA_API_KEYS",
};

// Gemini additionally accepted these single/individual secret names before the
// pool existed; keeping them means an existing deploy keeps working unchanged.
const EXTRA_KEY_VAR_PATTERNS = {
  gemini: [/^GEMINI_KEY$/i, /^GEMINI_KEY_\d+$/i],
};

// ---------------------------------------------------------------------------
// The pool. Order inside a tier is rotation order, not preference: the router
// round-robins within a tier so load spreads across providers, and only drops to
// the next tier once every entry of the current tier is unavailable for the day.
//
// `rpd` / `tpm` are the published free-tier ceilings, recorded here so the
// health report can show what the pool is expected to deliver. They are
// documentation, not enforcement — the ledger enforces the operator's window.
// `rpd: null` means the provider publishes no per-model daily ceiling at all
// (NVIDIA's is an account-wide credit allowance, visible only on its dashboard),
// so there is nothing to check before calling: the entry is quota-untracked going
// in and terminal-for-the-window coming out, exactly like every other entry.
// ---------------------------------------------------------------------------

export const PROVIDER_TIERS = ["flagship", "mid", "lite"];

export const PROVIDER_POOL = [
  // flagship
  { provider: "gemini", model: "gemini-3.8-flash", format: "gemini", tier: "flagship", rpd: 20 },
  { provider: "groq", model: "openai/gpt-oss-120b", format: "openai", baseUrl: GROQ_BASE_URL, tier: "flagship", rpd: 1000, tpm: 8000 },
  { provider: "gemini", model: "gemini-3.7-flash", format: "gemini", tier: "flagship", rpd: 20 },
  // mid
  { provider: "gemini", model: "gemini-3.6-flash", format: "gemini", tier: "mid", rpd: 20 },
  { provider: "groq", model: "qwen/qwen3.8-27b", format: "openai", baseUrl: GROQ_BASE_URL, tier: "mid", rpd: 1000, tpm: 8000 },
  // lite / overflow
  { provider: "gemini", model: "gemini-3.5-flash-lite", format: "gemini", tier: "lite", rpd: 15 },
  { provider: "groq", model: "openai/gpt-oss-20b", format: "openai", baseUrl: GROQ_BASE_URL, tier: "lite", rpd: 1000, tpm: 8000 },
  { provider: "openrouter", model: "thinkingmachines/inkling-small:free", format: "openai", baseUrl: OPENROUTER_BASE_URL, tier: "lite", rpd: 50, sharedAccountCap: true },
  // No published per-model daily ceiling, so `rpd: null` is deliberate, not a gap:
  // there is no number to pre-check against. Its limits are the account-wide NIM
  // credit allowance, which the response body never names — hence the provider
  // override in classifyFailure that parks this unit on a rate-limit answer
  // instead of treating it as a 25s blip.
  { provider: "nvidia", model: "openai/gpt-oss-20b", format: "openai", baseUrl: NVIDIA_BASE_URL, tier: "lite", rpd: null },
];

/** Longest a single pool attempt may take, and the ceiling for a whole walk. */
const ATTEMPT_TIMEOUT_MS = 8000;
const ROUTER_BUDGET_MS = 24000;
/** Reserve for the Workers AI last resort so a full pool miss still answers. */
const FALLBACK_RESERVE_MS = 3000;
/** Practical ceiling for one OpenAI-compatible completion. */
const OPENAI_MAX_TOKENS = 1024;

// ---------------------------------------------------------------------------
// Key parsing
// ---------------------------------------------------------------------------

/**
 * Reads a comma/semicolon/newline separated key list plus its individual
 * `<STEM>` / `<STEM>_n` variants. Generalized from the original
 * `inspectGeminiKeys`, which hardcoded the GEMINI_API_* names — same permissive
 * splitting, same quote stripping, same duplicate reporting.
 *
 * Never returns key material in `duplicates`/`previews`: this object feeds a
 * public endpoint (see handlePublicHealth in the worker).
 */
export function inspectProviderKeys(env, envVarName, { extraPatterns = [] } = {}) {
  const rawList = [];
  const empty = { uniqueKeys: [], rawCount: 0, uniqueCount: 0, hasDuplicates: false, duplicates: [], previews: [] };
  if (!envVarName) return empty;

  const stem = envVarName.replace(/S$/, "");
  const patterns = [
    new RegExp(`^${stem}$`, "i"),
    new RegExp(`^${stem}_\\d+$`, "i"),
    ...extraPatterns,
  ];
  const push = (value, source) => {
    String(value)
      .split(/[,;\n]+/)
      .forEach((part) => {
        const trimmed = part.trim().replace(/^["']|["']$/g, "");
        if (trimmed) rawList.push({ key: trimmed, source });
      });
  };

  // 1. Dynamic inspection of the env/secrets the binding exposes.
  if (env && typeof env === "object") {
    for (const [k, v] of Object.entries(env)) {
      if (typeof v !== "string" || !v.trim()) continue;
      if (k === envVarName || patterns.some((p) => p.test(k))) push(v, k);
    }
  }

  // 2. Explicit lookups, in case Cloudflare secrets are not enumerable here.
  if (rawList.length === 0) {
    if (typeof env?.[envVarName] === "string") push(env[envVarName], envVarName);
    for (let i = 1; i <= 30; i++) {
      const name = `${stem}_${i}`;
      if (typeof env?.[name] === "string" && env[name].trim()) push(env[name], name);
    }
    if (typeof env?.[stem] === "string" && env[stem].trim()) push(env[stem], stem);
  }

  const validEntries = rawList.filter((e) => e.key && e.key.length > 5);

  const counts = new Map();
  for (const entry of validEntries) counts.set(entry.key, (counts.get(entry.key) || 0) + 1);
  const duplicates = [];
  for (const [key, count] of counts.entries()) {
    if (count > 1) {
      const sources = validEntries.filter((e) => e.key === key).map((e) => e.source).join(" + ");
      duplicates.push(`${sources || "configured secret"} (same value repeated ${count} times)`);
    }
  }

  const uniqueKeys = [...new Set(validEntries.map((e) => e.key))];
  return {
    uniqueKeys,
    rawCount: validEntries.length,
    uniqueCount: uniqueKeys.length,
    hasDuplicates: duplicates.length > 0,
    duplicates,
    previews: [],
  };
}

/** All usable keys for one provider (never logged, never persisted). */
export function providerKeyList(env, provider) {
  const envVarName = PROVIDER_ENV_VARS[provider];
  if (!envVarName) return [];
  return inspectProviderKeys(env, envVarName, {
    extraPatterns: EXTRA_KEY_VAR_PATTERNS[provider] || [],
  }).uniqueKeys;
}

/** True when at least one pool entry can actually be called right now. */
export function hasUsableProvider(env, pool = PROVIDER_POOL) {
  return pool.some((entry) => isEntryConfigured(entry) && providerKeyList(env, entry.provider).length > 0);
}

/** A pool entry with no model (or a placeholder) must never be called. */
export function isEntryConfigured(entry) {
  const model = String(entry?.model || "").trim();
  return Boolean(model) && !/^PLACEHOLDER/i.test(model) && Boolean(entry?.baseUrl || entry?.format === "gemini");
}

// ---------------------------------------------------------------------------
// Secret-safe identifiers
// ---------------------------------------------------------------------------

/**
 * FNV-1a fingerprint of a key. The ledger is persisted to KV, and a KV value
 * must never contain credential material — a stable, non-reversible 32-bit hash
 * is enough to tell two configured keys apart within one pool.
 */
export function keyFingerprint(key) {
  let hash = 0x811c9dc5;
  const text = String(key || "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return "k" + hash.toString(16).padStart(8, "0");
}

/** `key` = one key's window, `model` = the model is unavailable to everyone, `account` = shared cap. */
export const LEDGER_SCOPES = ["key", "model", "account"];

export function ledgerScopeFor(entry, reason) {
  if (reason === "model_unavailable") return "model";
  return entry?.sharedAccountCap ? "account" : "key";
}

export function ledgerKey(entry, key, scope = ledgerScopeFor(entry)) {
  const bucket = scope === "model" ? "__model__" : scope === "account" ? "__account__" : keyFingerprint(key);
  return `${entry.provider}:${bucket}:${entry.model}`;
}

/**
 * Every ledger entry that can park this unit: the key/account window, plus the
 * model-wide one. A model that is unavailable is unavailable to all keys, so the
 * skip check has to look at both. */
export function unitLedgerKeys(entry, key) {
  const ids = [ledgerKey(entry, key, ledgerScopeFor(entry))];
  const modelId = ledgerKey(entry, key, "model");
  if (!ids.includes(modelId)) ids.push(modelId);
  return ids;
}

// ---------------------------------------------------------------------------
// The ledger: a terminal, skip-ahead record of exhausted pool units
// ---------------------------------------------------------------------------

const dayExhausted = new Map(); // ledgerKey -> expiry ms
const ledgerDetails = new Map(); // ledgerKey -> { provider, model, scope, keyId, reason, until }
const LEDGER_KV_KEY = "ai-pool-ledger";
const LEDGER_HYDRATE_MS = 30000;
let ledgerHydratedAt = 0;
let ledgerHydrationPromise = null;

/**
 * Window end for an exhausted unit.
 * Gemini and OpenRouter reset on a calendar day (midnight Pacific for Gemini;
 * OpenRouter's daily free cap behaves the same way), Groq publishes rolling
 * windows and a retry-after header, so a conservative minute is used when we
 * have no header to trust. NVIDIA has no published window (account-wide credit
 * allowance), and falls through to the conservative hour: at worst one probe an
 * hour, versus the 25s retry loop that a per-minute cooldown would produce.
 */
export function nextResetTime(provider, now = Date.now()) {
  if (provider === "groq") return now + 60 * 1000;
  if (provider === "gemini" || provider === "openrouter") return nextMidnightPacific(now);
  return now + 60 * 60 * 1000;
}

/**
 * Epoch of the next midnight in America/Los_Angeles, DST-safe: the PT offset is
 * read from Intl for the current instant instead of being assumed. A DST change
 * inside the window moves the reset by at most an hour, which only ever means a
 * parked unit is retried a little early or late.
 */
export function nextMidnightPacific(now = Date.now()) {
  const offsetMinutes = pacificOffsetMinutes(now);
  const shifted = now + offsetMinutes * 60000;
  const nextMidnightShifted = (Math.floor(shifted / 86400000) + 1) * 86400000;
  return nextMidnightShifted - offsetMinutes * 60000;
}

function pacificOffsetMinutes(ms) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return Math.round((asUtc - ms) / 60000);
  } catch {
    return -480; // PST fallback if Intl is unavailable
  }
}

export function isDayExhausted(entry, key, ledger = dayExhausted) {
  const now = Date.now();
  for (const id of unitLedgerKeys(entry, key)) {
    const expiry = ledger.get(id);
    if (!expiry) continue;
    if (now >= expiry) {
      ledger.delete(id);
      ledgerDetails.delete(id);
      continue;
    }
    return true; // parked: never called until its window resets
  }
  return false;
}

export function markDayExhausted(entry, key, reason = "day_quota") {
  const scope = ledgerScopeFor(entry, reason);
  const id = ledgerKey(entry, key, scope);
  const until = nextResetTime(entry.provider);
  dayExhausted.set(id, until);
  ledgerDetails.set(id, {
    provider: entry.provider,
    model: entry.model,
    scope,
    keyId: scope === "key" ? keyFingerprint(key) : null,
    reason,
    until,
  });
  return until;
}

/** Ledger parks that are still in force (used by /health and the admin view). */
export function exhaustedUnits(now = Date.now()) {
  const out = [];
  for (const [id, detail] of ledgerDetails) {
    const until = dayExhausted.get(id) || 0;
    if (until > now) out.push({ ...detail, ledgerKey: id, until });
  }
  return out;
}

/** Test seam: module state is per isolate, and tests must start from empty. */
export function resetRouterState() {
  dayExhausted.clear();
  ledgerDetails.clear();
  tierRotations.clear();
  keyRotations.clear();
  ledgerHydratedAt = 0;
  ledgerHydrationPromise = null;
  routerCounters.attempts = 0;
  routerCounters.served = 0;
  routerCounters.byProvider = {};
  Object.keys(cacheL1).forEach((ns) => cacheL1[ns].clear());
}

/**
 * KV-backed so a park survives isolate recycling: an in-memory-only ledger
 * means every cold isolate re-walks the whole pool once. Best-effort in both
 * directions — a KV failure must never fail a learner's request.
 */
async function hydrateLedger(env) {
  if (!env?.USER_PROGRESS?.get) return;
  if (Date.now() - ledgerHydratedAt < LEDGER_HYDRATE_MS) return;
  if (ledgerHydrationPromise) return ledgerHydrationPromise;
  ledgerHydratedAt = Date.now();
  ledgerHydrationPromise = (async () => {
    try {
      const raw = await env.USER_PROGRESS.get(LEDGER_KV_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const entries = parsed?.entries || {};
      for (const [id, value] of Object.entries(entries)) {
        const until = Number(value?.until) || 0;
        if (until <= Date.now()) continue;
        dayExhausted.set(id, until);
        ledgerDetails.set(id, {
          provider: value.provider || null,
          model: value.model || null,
          scope: value.scope || "key",
          keyId: value.keyId || null,
          reason: value.reason || "day_quota",
          until,
        });
      }
    } catch {
      /* a corrupt or unreachable ledger is the same as an empty one */
    } finally {
      ledgerHydrationPromise = null;
    }
  })();
  return ledgerHydrationPromise;
}

function persistLedger(env) {
  if (!env?.USER_PROGRESS?.put) return;
  try {
    const entries = {};
    for (const [id, detail] of ledgerDetails) {
      const until = dayExhausted.get(id) || 0;
      if (until > Date.now()) entries[id] = { ...detail, until };
    }
    // Fire-and-forget, same idiom as the existing KV metrics: a lost write only
    // costs one duplicate attempt after this isolate dies.
    void env.USER_PROGRESS
      .put(LEDGER_KV_KEY, JSON.stringify({ updated_at: Date.now(), entries }), { expirationTtl: 3 * 86400 })
      .catch(() => {});
  } catch {
    /* persistence is best-effort */
  }
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

/**
 * Which cooldown a rate-limit response earns.
 *
 * Order matters: Gemini's per-day and per-minute quota ids are both
 * RESOURCE_EXHAUSTED and both carry a quotaId, so only explicit per-day tokens
 * park a unit for the day. Anything ambiguous stays a short, recoverable
 * cooldown — over-parking costs a paid learner capacity for hours.
 */
export function classifyRateLimit(status, bodyText = "") {
  if (status !== 429 && status !== 402 && status !== 403) return "none";
  const text = String(bodyText).toLowerCase();
  if (/per[_ ]?day|requests per day|\brpd\b|\btpd\b|daily (quota|limit)/.test(text)) return "day";
  if (/per[_ ]?minute|per[_ ]?hour|requests per minute|\brpm\b|\btpm\b|tokens per minute|rate_limit_exceeded/.test(text)) return "minute";
  return "minute";
}

/**
 * Terminal classifications decide the ledger; the rest only decide "next entry".
 *
 * `entry` is optional and consulted only for providers whose limits cannot be
 * read off the response — see the NVIDIA override below.
 */
export function classifyFailure(status, bodyText = "", entry = null) {
  const text = String(bodyText || "");
  const lower = text.toLowerCase();
  const rate = classifyRateLimit(status, text);

  // Key and model faults are checked before the rate-limit default: a bare 403
  // or an API_KEY_INVALID body carries no window information, and treating it as
  // a per-minute throttle would retry a revoked key every 25s all day.
  const keyFault =
    status === 401 || /api[_ ]?key[_ ]?(not valid|invalid)|invalid[_ ]?api[_ ]?key|incorrect api key|unauthenticated/.test(lower);
  const permissionFault = status === 403 && /permission|not authorized|forbidden|api[_ ]?key|credential|authenticat|disabled/.test(lower);
  if (keyFault || permissionFault) return "invalid_key";

  if (status === 404 || /model[_ ]?(not[_ ]?found|does not exist)|is not found for api version|unsupported model/.test(lower)) {
    return "model_missing";
  }

  // NVIDIA names no window in its 429 bodies, so the ambiguity rule above would
  // read them as per-minute and retry an exhausted account every 25 seconds for
  // the rest of the day (which is the defect this module exists to remove). Its
  // limits are account-wide and change on a dashboard, not in a body, so any
  // rate-limit answer is taken as terminal for the window.
  if (rate !== "none" && entry?.provider === "nvidia") return "day";

  if (rate === "day") return "day";
  if (rate === "minute") return "minute";
  if (status === 200) return "empty";
  return "other";
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

export class ProviderCallError extends Error {
  constructor(entry, status, bodyText, kind) {
    super(`${entry.provider}/${entry.model} HTTP ${status}: ${String(bodyText || "").slice(0, 140)}`);
    this.name = "ProviderCallError";
    this.entry = entry;
    this.status = status;
    this.bodyText = String(bodyText || "");
    this.kind = kind || classifyFailure(status, bodyText, entry);
  }
}

/** qwen3-family models can emit reasoning blocks before the answer. */
function stripReasoningArtifacts(text) {
  return String(text || "").replace(/<think[\s\S]*?<\/think>/gi, "").trim();
}

function buildOpenAiBody(entry, payload, useJsonMode, toMessages) {
  const gen = payload?.generationConfig || {};
  const body = {
    model: entry.model,
    messages: toMessages(payload),
    temperature: typeof gen.temperature === "number" ? gen.temperature : 0.3,
    max_tokens: Math.min(Number(gen.maxOutputTokens) || 700, OPENAI_MAX_TOKENS),
  };
  if (useJsonMode && gen.responseMimeType === "application/json") {
    // Best-effort: Groq and NIM honour json_object, OpenRouter forwards it to
    // whichever backend it routes to (and is retried without it on a rejection).
    body.response_format = { type: "json_object" };
  }
  return body;
}

/**
 * One call to one pool entry with one key. Returns the model's text, already
 * unwrapped from whichever envelope the provider used.
 */
export async function callProvider(entry, payload, key, { timeoutMs = ATTEMPT_TIMEOUT_MS, fetchImpl, toMessages } = {}) {
  const doFetch = fetchImpl || fetch;
  if (entry.format !== "gemini" && typeof toMessages !== "function") {
    throw new Error("callProvider: an OpenAI-compatible entry needs opts.toMessages");
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (entry.format === "gemini") {
      const res = await doFetch(`${GEMINI_BASE_URL}/models/${entry.model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const bodyText = await res.text().catch(() => "");
      if (!res.ok) throw new ProviderCallError(entry, res.status, bodyText);
      const data = safeJson(bodyText);
      if (data?.error) throw new ProviderCallError(entry, 200, JSON.stringify(data.error));
      const candidate = data?.candidates?.[0];
      const text = (candidate?.content?.parts || []).map((p) => p?.text || "").join("");
      if (!text.trim()) {
        throw new ProviderCallError(entry, 200, `empty text (finishReason=${candidate?.finishReason || "none"})`, "empty");
      }
      return text;
    }

    // OpenAI-compatible: Groq, OpenRouter, NVIDIA NIM.
    const base = String(entry.baseUrl || "").replace(/\/+$/, "");
    const send = (jsonMode) =>
      doFetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(buildOpenAiBody(entry, payload, jsonMode, toMessages)),
        signal: controller.signal,
      });

    let res = await send(true);
    if (res.status === 400) {
      const firstBody = await res.text().catch(() => "");
      if (/response_format|json_object|json mode/i.test(firstBody)) {
        // Some routed backends reject json mode outright; the same call without
        // it is still usable (the handlers parse defensively).
        res = await send(false);
      } else {
        throw new ProviderCallError(entry, 400, firstBody);
      }
    }

    const bodyText = await res.text().catch(() => "");
    if (!res.ok) throw new ProviderCallError(entry, res.status, bodyText);
    const data = safeJson(bodyText);
    if (data?.error) {
      const message = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
      throw new ProviderCallError(entry, res.status, message);
    }
    const text = stripReasoningArtifacts(data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "");
    if (!text) throw new ProviderCallError(entry, 200, "empty completion", "empty");
    return text;
  } catch (err) {
    if (err instanceof ProviderCallError) throw err;
    const aborted = err?.name === "AbortError";
    throw new ProviderCallError(entry, aborted ? 408 : 0, aborted ? "attempt timeout" : String(err?.message || err), "other");
  } finally {
    clearTimeout(timeoutId);
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rotation & counters
// ---------------------------------------------------------------------------

const tierRotations = new Map();
const keyRotations = new Map();
const routerCounters = { attempts: 0, served: 0, byProvider: {}, lastProvider: null };

function nextRotation(map, key, length) {
  if (length <= 1) return 0;
  const current = map.get(key) || 0;
  map.set(key, (current + 1) % length);
  return current % length;
}

function countAttempt(provider) {
  routerCounters.attempts += 1;
  routerCounters.byProvider[provider] = (routerCounters.byProvider[provider] || 0) + 1;
}

export function routerCountersSnapshot() {
  return { ...routerCounters, byProvider: { ...routerCounters.byProvider } };
}

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

/**
 * @param {object} payload  Gemini-shaped generateContent payload (the shape every
 *                          handler already builds).
 * @param {object} env      worker bindings; keys are read from it directly.
 * @param {object} deps     worker-scoped internals: isKeyCoolingDown,
 *                          markKeyCooldown, markKeySuccess,
 *                          canUseWorkersAiFallback, runWorkersAiFallback,
 *                          toOpenAiMessages (the worker's existing Gemini→chat
 *                          converter — injected instead of copied, because the
 *                          converter's own body sits past the byte wall that
 *                          forced this module to exist), onProvider, onModel,
 *                          plus test-only overrides (pool, budgetMs,
 *                          attemptTimeoutMs, fetchImpl).
 * @returns {Promise<string>} the model's text
 */
export async function callAiRouter(payload, env, deps = {}) {
  const pool = Array.isArray(deps.pool) ? deps.pool : PROVIDER_POOL;
  const budgetMs = Number(deps.budgetMs) || ROUTER_BUDGET_MS;
  const attemptTimeoutMs = Number(deps.attemptTimeoutMs) || ATTEMPT_TIMEOUT_MS;
  const reserveMs = Number(deps.reserveMs ?? FALLBACK_RESERVE_MS);
  const deadline = Date.now() + budgetMs;
  const toMessages = deps.toOpenAiMessages;
  const keysByProvider = new Map();
  const keysFor = (provider) => {
    if (!keysByProvider.has(provider)) keysByProvider.set(provider, providerKeyList(env, provider));
    return keysByProvider.get(provider);
  };

  await hydrateLedger(env);

  let lastError = null;

  poolWalk: for (const tier of PROVIDER_TIERS) {
    const tierEntries = pool.filter((entry) => entry.tier === tier && isEntryConfigured(entry) && keysFor(entry.provider).length > 0);
    if (!tierEntries.length) continue;
    const start = nextRotation(tierRotations, `tier:${tier}`, tierEntries.length);

    for (let i = 0; i < tierEntries.length; i++) {
      const entry = tierEntries[(start + i) % tierEntries.length];
      const keys = keysFor(entry.provider);
      const keyStart = nextRotation(keyRotations, `keys:${entry.provider}`, keys.length);

      for (let k = 0; k < keys.length; k++) {
        const key = keys[(keyStart + k) % keys.length];
        // Terminal skip: a unit inside its exhausted window is not called at all.
        if (isDayExhausted(entry, key)) continue;
        if (deps.isKeyCoolingDown?.(key)) continue;

        const remaining = deadline - Date.now();
        if (remaining < reserveMs) break poolWalk;

        countAttempt(entry.provider);
        try {
          const text = await callProvider(entry, payload, key, {
            timeoutMs: Math.min(attemptTimeoutMs, Math.max(1000, remaining)),
            fetchImpl: deps.fetchImpl,
            toMessages,
          });
          deps.markKeySuccess?.(key);
          deps.onProvider?.(entry.provider);
          deps.onModel?.(entry.model);
          routerCounters.served += 1;
          routerCounters.lastProvider = entry.provider;
          return text;
        } catch (err) {
          lastError = err;
          const kind = err instanceof ProviderCallError ? err.kind : classifyFailure(0, String(err?.message || err));

          if (kind === "day" || kind === "model_missing") {
            // The actual fix: record the window and never call this unit again
            // until it resets, plus leave a durable trace for the dashboard —
            // provider ATTEMPTS, not HTTP requests, are what multiply.
            const reason = kind === "model_missing" ? "model_unavailable" : "day_quota";
            const scope = ledgerScopeFor(entry, reason);
            const until = markDayExhausted(entry, key, reason);
            persistLedger(env);
            // Awaited: this is the durable trace the dashboard counts, and it
            // only fires when a unit is parked (a handful of rows a day).
            try {
              await recordActivity(env, null, "provider_attempt_exhausted", {
                provider: entry.provider,
                model: entry.model,
                reason,
                scope,
                key_id: scope === "key" ? keyFingerprint(key) : null,
                until,
                status: err?.status ?? null,
              });
            } catch {
              /* telemetry must never fail the learner's request */
            }
            continue;
          }

          if (kind === "invalid_key") {
            deps.markKeyCooldown?.(key, 403);
            continue;
          }
          if (kind === "minute") {
            deps.markKeyCooldown?.(key, err?.status || 429);
            continue;
          }
          // Transient (network, 5xx, empty completion): try the next entry
          // without parking anything — a bad minute must not cost the day.
        }
      }
    }
  }

  if (deps.canUseWorkersAiFallback?.(env)) {
    try {
      console.warn("[ai-router] pool exhausted for this window — serving via Workers AI fallback.");
      const text = await deps.runWorkersAiFallback(payload, env);
      routerCounters.served += 1;
      routerCounters.lastProvider = "workers-ai";
      return text;
    } catch (fallbackErr) {
      console.error("[ai-router] Workers AI fallback failed:", String(fallbackErr?.message || fallbackErr).slice(0, 140));
      lastError = fallbackErr;
    }
  }

  throw lastError || new Error("All AI providers and tiers are exhausted for this window");
}

/**
 * Public-safe pool report for /health: provider, model, tier and the fact that a
 * unit is parked — never a key, never a key count, never a key fragment.
 * `keyId` is the non-reversible fingerprint, exposed only to callers that ask
 * for it explicitly (admin/diagnostics), not to the public projection.
 */
export function getPoolHealth({ env = {}, pool = PROVIDER_POOL, includeKeyIds = false } = {}) {
  const active = [];
  const idle = [];
  for (const entry of pool) {
    const configured = isEntryConfigured(entry);
    const hasKeys = providerKeyList(env, entry.provider).length > 0;
    const shape = { provider: entry.provider, model: entry.model, tier: entry.tier };
    if (configured && hasKeys) active.push(shape);
    else idle.push({ ...shape, reason: configured ? "no_keys" : "model_unset" });
  }

  const exhausted = exhaustedUnits().map((unit) => ({
    provider: unit.provider,
    model: unit.model,
    scope: unit.scope,
    reason: unit.reason,
    until: unit.until,
    ...(includeKeyIds ? { keyId: unit.keyId } : {}),
  }));

  return {
    entries: pool.length,
    tiers: PROVIDER_TIERS,
    active,
    idle,
    exhausted,
    attempts: routerCountersSnapshot(),
    cache: cacheStats(),
  };
}

// ---------------------------------------------------------------------------
// AI cache (L1 in the isolate, L2 in KV)
//
// The previous caches were per-isolate Maps, so every recycled isolate re-missed
// them and re-paid for the same translation or hint set. KV makes a hit survive
// isolate churn; the isolate Map stays in front of it because it is free.
// ---------------------------------------------------------------------------

// Namespaces in use: "tr" (translations) and "hints" (hint sets).
const L1_MAX_ENTRIES = 500;
const cacheL1 = { tr: new Map(), hints: new Map() };

function l1Store(namespace) {
  if (!cacheL1[namespace]) cacheL1[namespace] = new Map();
  return cacheL1[namespace];
}

async function cacheHash(namespace, cacheKey) {
  const text = `${namespace}:${cacheKey}`;
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
  } catch {
    // No WebCrypto: fall back to the fingerprint of the same text. Still stable
    // and still non-reversible enough to key a cache.
    return keyFingerprint(text) + keyFingerprint(text.split("").reverse().join(""));
  }
}

function l1Get(namespace, cacheKey) {
  const store = l1Store(namespace);
  if (!store.has(cacheKey)) return null;
  const value = store.get(cacheKey);
  store.delete(cacheKey);
  store.set(cacheKey, value); // move to most-recent (LRU)
  return value;
}

function l1Set(namespace, cacheKey, value) {
  const store = l1Store(namespace);
  if (store.size >= L1_MAX_ENTRIES && !store.has(cacheKey)) {
    store.delete(store.keys().next().value);
  }
  store.set(cacheKey, value);
}

export function cacheStats() {
  return { translations: cacheL1.tr.size, hints: cacheL1.hints.size };
}

/** L1 then KV. Returns null on miss (never throws). */
export async function readAiCache(env, namespace, cacheKey) {
  const local = l1Get(namespace, cacheKey);
  if (local !== null && local !== undefined) return local;
  if (!env?.USER_PROGRESS?.get) return null;
  try {
    const raw = await env.USER_PROGRESS.get(`ai-cache:${namespace}:${await cacheHash(namespace, cacheKey)}`);
    if (!raw) return null;
    const value = JSON.parse(raw);
    l1Set(namespace, cacheKey, value);
    return value;
  } catch {
    return null;
  }
}

/**
 * L1 immediately, KV awaited. Awaited on purpose: a dropped write would make the
 * shared cache cosmetic, and one KV put (~10ms) is noise next to the model call
 * it is saving. KV is eventually consistent, which for a cache is exactly right.
 */
export async function writeAiCache(env, namespace, cacheKey, value, { ttlSeconds = 30 * 86400 } = {}) {
  if (value === null || value === undefined) return;
  l1Set(namespace, cacheKey, value);
  if (!env?.USER_PROGRESS?.put) return;
  try {
    const hash = await cacheHash(namespace, cacheKey);
    await env.USER_PROGRESS.put(`ai-cache:${namespace}:${hash}`, JSON.stringify(value), { expirationTtl: ttlSeconds });
  } catch {
    /* cache writes are best-effort by definition */
  }
}
