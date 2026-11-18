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
const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
// Coarena exposes one free, OpenAI-compatible gateway in front of several model
// families (owner request, 2026-11-17). It speaks the OpenAI chat shape, so it
// needs no new transport — only this base URL and the env name below.
const COARENA_BASE_URL = "https://coarena.ai/api/v1";

/**
 * The ids Coarena's free tier will actually answer, in fallback order (owner
 * direction, 2026-11-18): Gemini 3.8 Flash first, then GPT-6 Luna, then
 * DeepSeek V4.1 Flash. Every other id on that gateway answers 402
 * `payment_required`, so a paid id in this list would be a bug, not a choice.
 * Order matters: the first entry is the primary, the rest are the failover the
 * moment the primary reports `model_missing` (404), a 5xx, a timeout, or a
 * quota answer. See `expandModelFallbacks`.
 */
export const COARENA_FREE_MODELS = Object.freeze([
  "gemini-3-8-flash",
  "gpt-6-luna",
  "deepseek-v4-1-flash-1017",
]);

// ---------------------------------------------------------------------------
// SAME MODEL FIRST (owner direction, 2026-11-16)
//
// The learner's experience must not change because a provider ran out: the same
// model that passed the quality gate is what every available provider serves,
// and a different model is only ever reached after IT has passed the same gate.
// So the walk is ordered by model first, then by provider quality — never by
// tier, never by who happens to be cheapest this minute.
//
// ONE KEY PER PROVIDER ORGANIZATION. Provider acceptable-use policies prohibit
// spreading one organization's limits across several keys, and Groq's limits are
// per organization, so a provider contributes exactly one key to the walk. A
// second configured key is a configuration error, surfaced in `/health`, not
// extra capacity.
// ---------------------------------------------------------------------------

export const PREFERRED_MODEL = "openai/gpt-oss-120b";

/**
 * Provider order for the preferred model: cheapest-and-fastest first, on the
 * published latency of gpt-oss-120b at each host. A provider absent from this
 * list keeps its configured position behind every ranked one.
 */
export const PROVIDER_QUALITY_ORDER = ["groq", "cerebras", "openrouter", "nvidia", "gemini", "coarena"];

/**
 * Which `provider:model` pairs have passed the 46-case quality gate. A model is
 * never served to a learner before it is in here; adding a provider to the pool
 * therefore cannot silently downgrade the chat. The owner's KV config may extend
 * this list (`qualityGatePasses`) once a pair has been measured.
 */
export const DEFAULT_QUALITY_GATE_PASSES = Object.freeze([
  `groq:${PREFERRED_MODEL}`,
  `cerebras:${PREFERRED_MODEL}`,
]);

export function qualityGateKey(provider, model) {
  return `${String(provider || "").toLowerCase()}:${String(model || "").trim()}`;
}

/** Has this provider+model pair earned the right to answer a learner? */
export function passesQualityGate(entry, allowed = DEFAULT_QUALITY_GATE_PASSES) {
  const list = Array.isArray(allowed) && allowed.length ? allowed : DEFAULT_QUALITY_GATE_PASSES;
  return list.includes(qualityGateKey(entry?.provider, entry?.model));
}

function providerRank(provider, order = PROVIDER_QUALITY_ORDER) {
  const at = order.indexOf(String(provider || "").toLowerCase());
  return at === -1 ? order.length : at;
}

/**
 * The walk for a learner turn: preferred model on every gate-passed provider in
 * quality order, then any other gate-passed pair behind it. Pure, so the order
 * can be asserted without a network call.
 */
export function orderPoolForChat(pool, allowed = DEFAULT_QUALITY_GATE_PASSES) {
  const usable = (Array.isArray(pool) ? pool : []).filter((entry) => isEntryConfigured(entry));
  const preferred = usable
    .filter((entry) => entry.model === PREFERRED_MODEL && passesQualityGate(entry, allowed))
    .sort((a, b) => providerRank(a.provider) - providerRank(b.provider));
  const rest = usable
    .filter((entry) => entry.model !== PREFERRED_MODEL && passesQualityGate(entry, allowed))
    .sort((a, b) => providerRank(a.provider) - providerRank(b.provider));
  return [...preferred, ...rest];
}

/**
 * Secret name per provider. Same comma/semicolon/newline list format for all.
 *
 * The DEFAULT pool below is OpenRouter + NVIDIA only (owner direction,
 * 2026-10-18): a request is served by a provider outside those two only when
 * the owner deliberately adds such an entry from the admin dashboard, either as
 * a custom entry carrying its own keys or as a preset that reads one of the env
 * names here. `gemini` / `groq` stay as convention names so a re-added preset
 * needs no code change; nothing in the default pool reads them.
 */
export const PROVIDER_ENV_VARS = {
  gemini: "GEMINI_API_KEYS",
  groq: "GROQ_API_KEYS",
  cerebras: "CEREBRAS_API_KEYS",
  openrouter: "OPENROUTER_API_KEYS",
  nvidia: "NVIDIA_API_KEYS",
  coarena: "COARENA_API_KEYS",
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

/**
 * Indicative list price per 1M tokens, by tier. **UNPROVEN.**
 *
 * These are planning numbers, not a billing fact: they were written from
 * published free/paid tier sheets without a confirmed provider invoice, and the
 * pool mixes paid keys with free-tier keys, so a real blended rate depends on
 * which keys are set. The owner must confirm these against an actual invoice
 * before the daily spend cap derived from them means anything.
 *
 * `0` means "free tier as configured today", which is why `lite` prices at zero
 * for the Groq and OpenRouter entries.
 */
export const AI_TIER_PRICES_USD_PER_MTOK = {
  flagship: { input: 0.30, output: 2.50 },
  mid: { input: 0.15, output: 1.25 },
  lite: { input: 0.075, output: 0.30 },
};

/** Typical completion for a learner turn, used only by the cost report. */
export const ASSUMED_COMPLETION_TOKENS = 90;

/**
 * Cost of one turn in USD. Pure so the report and its test agree by construction.
 * Returns 0 for an unknown tier rather than guessing a price.
 */
export function estimateTurnCostUsd({ tier, inputTokens, outputTokens = ASSUMED_COMPLETION_TOKENS }) {
  const price = AI_TIER_PRICES_USD_PER_MTOK[tier];
  if (!price) return 0;
  const inTok = Math.max(0, Number(inputTokens) || 0);
  const outTok = Math.max(0, Number(outputTokens) || 0);
  return (inTok / 1e6) * price.input + (outTok / 1e6) * price.output;
}

/** Learner turns at or below this length are short enough to cheap-route. */
export const EASY_TURN_MAX_CHARS = 60;

/**
 * Is this turn cheap enough to serve on a smaller model?
 *
 * Deliberately conservative, because a wrong "easy" is a learner getting a worse
 * partner and never finding out why. It says yes only when all three hold:
 * the level is beginner, the learner actually typed something short, and the
 * turn is NOT the one that gets graded. An empty utterance is never easy — there
 * is nothing to cheap-route, and treating it as easy would skip the flagship on a
 * turn that may be the opener.
 */
export function isEasyTurn({ level, learnerTextLength, isFinalTurn }) {
  if (isFinalTurn) return false;
  const upper = String(level || '').toUpperCase();
  if (upper !== 'A0' && upper !== 'A1') return false;
  const len = Number(learnerTextLength);
  if (!Number.isFinite(len) || len <= 0 || len > EASY_TURN_MAX_CHARS) return false;
  return true;
}

/**
 * The tier order the pool walk follows.
 *
 * An easy turn starts at `mid` and still reaches `flagship` — the walk is the
 * failover mechanism, so reordering it does not remove the flagship, it only
 * stops paying for it first. A hard turn is unchanged.
 */
export function tierWalkFor(easyTurn) {
  return easyTurn ? ['mid', 'lite', 'flagship'] : PROVIDER_TIERS.slice();
}

export const PROVIDER_POOL = [
  // SAME MODEL FIRST: two organizations, one key each, both serving
  // gpt-oss-120b. Order is provider quality, and the learner never notices which
  // one answered — the failover is on 429, quota, timeout or 5xx.
  { provider: "groq", model: PREFERRED_MODEL, format: "openai", baseUrl: GROQ_BASE_URL, tier: "flagship", rpd: 1000 },
  // Cerebras free tier is request-rich but context-poor: the 8K window is
  // enforced below (`contextCap`), so a long turn skips it instead of 400ing.
  { provider: "cerebras", model: PREFERRED_MODEL, format: "openai", baseUrl: CEREBRAS_BASE_URL, tier: "flagship", rpd: 14400, contextCap: 8192 },
  // flagship — NVIDIA has no published per-model daily ceiling, so `rpd: null`
  // is deliberate, not a gap: there is no number to pre-check against. Its
  // limits are the account-wide NIM credit allowance, which the response body
  // never names — hence the provider override in classifyFailure that parks
  // this unit on a rate-limit answer instead of treating it as a 25s blip.
  { provider: "nvidia", model: "openai/gpt-oss-20b", format: "openai", baseUrl: NVIDIA_BASE_URL, tier: "flagship", rpd: null },
  // mid / overflow — OpenRouter's free cap is account-wide (`sharedAccountCap`),
  // so the ledger scopes it to the account, not to the key.
  { provider: "openrouter", model: "thinkingmachines/inkling-small:free", format: "openai", baseUrl: OPENROUTER_BASE_URL, tier: "mid", rpd: 50, sharedAccountCap: true },
  // Coarena (owner request, 2026-11-17; free-model failover 2026-11-18): free,
  // OpenAI-compatible, one key. The free tier serves exactly the three ids in
  // COARENA_FREE_MODELS; every other id answers 402. The row names the primary
  // (Gemini 3.8 Flash) and `modelFallbacks` carries the rest, which
  // `expandModelFallbacks` turns into separate walk units sharing this provider
  // row — so the admin table still shows one row per provider while routing
  // fails over between free models. The primary's model is NOT the preferred
  // one, so `orderPoolForChat` leaves Coarena out of the learner turn until a
  // Coarena pair passes a measured replay — the same rule as any other pair. It
  // serves the routes that walk by tier (translate, lexeme, hints, ask, writing)
  // and is skipped everywhere the gate applies.
  {
    provider: "coarena",
    model: COARENA_FREE_MODELS[0],
    modelFallbacks: COARENA_FREE_MODELS.slice(1),
    format: "openai",
    baseUrl: COARENA_BASE_URL,
    tier: "mid",
    rpd: null,
  },
  // The old Gemini/Groq defaults are gone (owner direction 2026-10-18): a
  // request never reaches them unless the owner deliberately adds such an
  // entry from the admin dashboard — custom base URL, own keys. The OpenAI-
  // and Gemini-format transports below stay, because the owner's presets and
  // custom gateways speak them.
];

/**
 * Free-model failover inside ONE provider.
 *
 * A gateway can serve several model ids under a single key and a single provider
 * row (Coarena's free tier is three). The dashboard keys toggles, stored keys and
 * its table by PROVIDER, so the pool must stay one row per provider; the walk,
 * however, needs one unit per (provider, model) so that the ledger parks only the
 * model that failed and the next free model answers the same turn.
 *
 * Pure and order-preserving: the entry itself stays first, then its
 * `modelFallbacks` in the configured order. Entries without the field are
 * returned untouched, so custom providers and injected test pools are unchanged.
 */
export function expandModelFallbacks(pool) {
  const out = [];
  for (const entry of Array.isArray(pool) ? pool : []) {
    out.push(entry);
    const fallbacks = Array.isArray(entry?.modelFallbacks) ? entry.modelFallbacks : [];
    for (const model of fallbacks) {
      const id = typeof model === "string" ? model.trim() : "";
      if (!id || id === entry.model) continue;
      out.push({ ...entry, model: id });
    }
  }
  return out;
}

/**
 * The pool a request actually walks: the defaults above, minus whatever the
 * owner disabled, plus every owner-managed custom entry (admin dashboard).
 * Lives in ./cloudflare-ai-providers.js — importing it here would create the
 * cycle it exists to avoid (it needs callProvider for the owner's test
 * button), so the router accepts a pool through deps.pool and the worker's
 * single injection point (aiRouteDeps) supplies the resolved one.
 */

/** Longest a single pool attempt may take, and the ceiling for a whole walk. */
const ATTEMPT_TIMEOUT_MS = 8000;
const ROUTER_BUDGET_MS = 24000;
/** Reserve for the Workers AI last resort so a full pool miss still answers. */
const FALLBACK_RESERVE_MS = 3000;
/** Practical ceiling for one OpenAI-compatible completion. */
// Ceiling for OpenAI-compatible providers, not a target: a call's own
// `generationConfig.maxOutputTokens` still decides the cap. It sits above the
// fused turn's 1600 so the answer is never clipped by this constant alone.
const OPENAI_MAX_TOKENS = 2048;

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

/**
 * Keys for one pool entry. Owner-managed entries carry their key list on the
 * entry itself (stored server-side by the admin module, never logged); default
 * entries read their provider's env var list. A stored non-empty list takes
 * precedence so the owner can override an env list from the dashboard without
 * a redeploy.
 */
export function entryKeysFor(entry, env) {
  const own = Array.isArray(entry?.keys)
    ? entry.keys.filter((k) => typeof k === "string" && k.trim()).map((k) => k.trim())
    : [];
  const list = own.length ? own : providerKeyList(env, entry?.provider);
  // ONE KEY PER PROVIDER ORGANIZATION (owner rule, 2026-11-16).
  //
  // Rotating two keys of the same organization to multiply its limits is what
  // the providers' acceptable-use policies forbid (Groq's limits are per
  // organization, not per key). A provider therefore contributes exactly one
  // credential; extra keys are reported as a configuration error, not used.
  return list.slice(0, 1);
}

/** Configured key counts per provider — used to flag a second key as a misconfiguration. */
export function providerKeyCounts(env, pool = PROVIDER_POOL) {
  const counts = new Map();
  for (const entry of pool) {
    if (!entry?.provider || counts.has(entry.provider)) continue;
    const own = Array.isArray(entry.keys) ? entry.keys.filter((k) => typeof k === "string" && k.trim()) : [];
    counts.set(entry.provider, own.length || providerKeyList(env, entry.provider).length);
  }
  return [...counts.entries()].map(([provider, configured]) => ({ provider, configured }));
}

/** True when at least one pool entry can actually be called right now. */
export function hasUsableProvider(env, pool = PROVIDER_POOL) {
  return pool.some((entry) => isEntryConfigured(entry) && entryKeysFor(entry, env).length > 0);
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
 * Measured end-to-end latency per pool unit (provider+model), as an exponential
 * moving average.
 *
 * A provider that answers in 900ms and one that answers in four seconds are
 * interchangeable to a batch job and a four-second wait to a learner sitting in
 * a conversation. So interactive routes order their walk by what the pool has
 * actually been doing, not by a constant someone guessed — a provider that
 * degrades moves itself to the back with no code change, and one that recovers
 * moves back up. It rides the existing `ai-pool-ledger` KV blob, so learning
 * this costs no extra round trip.
 */
const latencyEwma = new Map(); // "provider:model" -> { ms, samples }
const LATENCY_ALPHA = 0.4;
/** Below this many samples a measurement is noise, not evidence. */
const LATENCY_MIN_SAMPLES = 3;
const LATENCY_PERSIST_MS = 60000;
let latencyPersistedAt = 0;

const latencyId = (entry) => `${entry.provider}:${entry.model}`;

/** One observed round trip folded into the running average for that unit. */
export function recordLatency(entry, ms) {
  if (!entry || !Number.isFinite(ms) || ms <= 0) return;
  const id = latencyId(entry);
  const prev = latencyEwma.get(id);
  latencyEwma.set(
    id,
    prev
      ? { ms: prev.ms * (1 - LATENCY_ALPHA) + ms * LATENCY_ALPHA, samples: prev.samples + 1 }
      : { ms, samples: 1 },
  );
}

/** Public-safe view of the measurements (no key material, no prompts). */
export function latencySnapshot() {
  return [...latencyEwma.entries()].map(([id, value]) => ({
    id,
    avg_ms: Math.round(value.ms),
    samples: value.samples,
  }));
}

/**
 * Tier walk order. Without measurements (or when a route does not ask for this)
 * it is exactly the rotation it always was. With them, units that have been
 * answering fastest come first and unmeasured units keep their rotation position
 * behind them — the order changes, the set of attempts does not.
 */
function orderTierEntries(entries, start, preferFast) {
  const rotated = entries.map((_, i) => entries[(start + i) % entries.length]);
  if (!preferFast) return rotated;
  const measured = [];
  const unmeasured = [];
  for (const entry of rotated) {
    const stats = latencyEwma.get(latencyId(entry));
    if (stats && stats.samples >= LATENCY_MIN_SAMPLES) measured.push({ entry, ms: stats.ms });
    else unmeasured.push(entry);
  }
  measured.sort((a, b) => a.ms - b.ms);
  return [...measured.map((m) => m.entry), ...unmeasured];
}

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
  latencyEwma.clear();
  latencyPersistedAt = 0;
  routerCounters.attempts = 0;
  routerCounters.served = 0;
  routerCounters.byProvider = {};
  providerBudgets.clear();
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
      // Measurements only, never counters: a fresh isolate has no observe history
      // of its own, and the fleet's average is a better prior than nothing. A
      // local measurement always wins — it describes this instant.
      const latency = parsed?.latency || {};
      for (const [id, value] of Object.entries(latency)) {
        const ms = Number(value?.ms);
        if (!Number.isFinite(ms) || ms <= 0) continue;
        if (latencyEwma.has(id)) continue;
        latencyEwma.set(id, { ms, samples: Math.max(1, Number(value?.samples) || 1) });
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
    const latency = {};
    for (const [id, value] of latencyEwma) {
      latency[id] = { ms: Math.round(value.ms), samples: value.samples };
    }
    // Fire-and-forget, same idiom as the existing KV metrics: a lost write only
    // costs one duplicate attempt after this isolate dies.
    void env.USER_PROGRESS
      .put(LEDGER_KV_KEY, JSON.stringify({ updated_at: Date.now(), entries, latency }), { expirationTtl: 3 * 86400 })
      .catch(() => {});
  } catch {
    /* persistence is best-effort */
  }
}

/**
 * Latency is learned continuously, so it cannot persist on every call — one KV
 * write per AI request would be a cost with no benefit. Parked units still write
 * immediately, because a park that is lost costs real attempts.
 */
function persistLatency(env) {
  if (Date.now() - latencyPersistedAt < LATENCY_PERSIST_MS) return;
  latencyPersistedAt = Date.now();
  persistLedger(env);
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
  constructor(entry, status, bodyText, kind, { retryAfterMs = null } = {}) {
    super(`${entry.provider}/${entry.model} HTTP ${status}: ${String(bodyText || "").slice(0, 320)}`);
    this.name = "ProviderCallError";
    this.entry = entry;
    this.status = status;
    this.bodyText = String(bodyText || "");
    this.kind = kind || classifyFailure(status, bodyText, entry);
    /** The provider's own `Retry-After`, when it names one. */
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Every provider is out of budget and no authored line may stand in. Distinct
 * from a generic failure so the route can answer honestly (503 + the Arabic
 * "daily limit" message) and charge nothing.
 */
export class AiCapacityExhaustedError extends Error {
  constructor(message = "every configured provider is out of budget for this window") {
    super(message);
    this.name = "AiCapacityExhaustedError";
    this.code = "AI_CAPACITY_EXHAUSTED";
  }
}

// ---------------------------------------------------------------------------
// Provider budgets, read from the response headers the provider already sends
//
// Groq, Cerebras and OpenRouter all publish `x-ratelimit-*` headers. They are
// the only trustworthy statement about what is left, so they are recorded per
// provider+model and surfaced in the admin view — the router itself only skips
// a unit that reports zero remaining requests or tokens.
// ---------------------------------------------------------------------------

const providerBudgets = new Map(); // "provider:model" -> budget snapshot

/**
 * Rough token count of a Gemini-shaped payload: 4 characters per token is the
 * approximation the cost log already uses, and it only has to be good enough to
 * keep a request out of a provider's hard context wall.
 */
export function estimatePayloadTokens(payload) {
  const sys = payload?.systemInstruction?.parts?.map((p) => p?.text || "").join("") || "";
  const body = (Array.isArray(payload?.contents) ? payload.contents : [])
    .map((c) => (c?.parts || []).map((p) => p?.text || "").join(""))
    .join("\n");
  return Math.ceil((sys.length + body.length) / 4);
}

/** True when a provider's hard context cap would reject this request. */
export function exceedsContextCap(entry, payload) {
  const cap = Number(entry?.contextCap);
  if (!Number.isFinite(cap) || cap <= 0) return false;
  return estimatePayloadTokens(payload) > cap;
}

function headerNumber(headers, name) {
  if (!headers || typeof headers.get !== "function") return null;
  const raw = headers.get(name);
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** `Retry-After` is either seconds or an HTTP date; both become a millisecond wait. */
export function retryAfterMsFrom(headers, now = Date.now()) {
  if (!headers || typeof headers.get !== "function") return null;
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 24 * 3600 * 1000);
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.max(0, Math.min(at - now, 24 * 3600 * 1000));
  return null;
}

/**
 * Record what a provider said about its own limits. `unitReset` distinguishes a
 * per-minute window from the daily one: the daily numbers are what the admin
 * panel shows and what the <20% alert reads.
 */
export function recordProviderBudget(entry, headers) {
  if (!entry) return null;
  const id = `${entry.provider}:${entry.model}`;
  const remainingRequests = headerNumber(headers, "x-ratelimit-remaining-requests");
  const limitRequests = headerNumber(headers, "x-ratelimit-limit-requests");
  const remainingTokens = headerNumber(headers, "x-ratelimit-remaining-tokens");
  const limitTokens = headerNumber(headers, "x-ratelimit-limit-tokens");
  const reset = headers && typeof headers.get === "function" ? headers.get("x-ratelimit-reset-requests") : null;
  if (remainingRequests === null && remainingTokens === null && limitRequests === null && limitTokens === null) return null;
  const snapshot = {
    provider: entry.provider,
    model: entry.model,
    remainingRequests,
    limitRequests,
    remainingTokens,
    limitTokens,
    reset,
    seenAt: Date.now(),
  };
  providerBudgets.set(id, snapshot);
  return snapshot;
}

/** Public-safe budget rows (no keys, no prompts). */
export function providerBudgetSnapshot() {
  return [...providerBudgets.values()].map((row) => ({ ...row }));
}

/**
 * True when the last header snapshot says this unit has nothing left for the
 * current window. A zero-remaining answer is treated as a skip, not an attempt:
 * spending a call to be told 429 is exactly the waste this replaces.
 */
export function isBudgetSpent(entry, now = Date.now()) {
  const row = providerBudgets.get(`${entry?.provider}:${entry?.model}`);
  if (!row) return false;
  // A minute-window snapshot older than two minutes says nothing about now.
  if (now - row.seenAt > 120000) return false;
  const reqsSpent = row.remainingRequests !== null && row.remainingRequests <= 0;
  const tokensSpent = row.remainingTokens !== null && row.remainingTokens <= 0;
  return reqsSpent || tokensSpent;
}

/** qwen3-family models can emit reasoning blocks before the answer. */
function stripReasoningArtifacts(text) {
  return String(text || "").replace(/<think[\s\S]*?<\/think>/gi, "").trim();
}

function buildOpenAiBody(entry, payload, { jsonMode = true, reasoningEffort = true } = {}, toMessages) {
  const gen = payload?.generationConfig || {};
  const body = {
    model: entry.model,
    messages: toMessages(payload),
    temperature: typeof gen.temperature === "number" ? gen.temperature : 0.3,
    max_tokens: Math.min(Number(gen.maxOutputTokens) || 700, OPENAI_MAX_TOKENS),
  };
  if (jsonMode && gen.responseMimeType === "application/json") {
    // Best-effort: Groq and NIM honour json_object, OpenRouter forwards it to
    // whichever backend it routes to (and is retried without it on a rejection).
    body.response_format = { type: "json_object" };
  }
  // Interactive routes ask for low reasoning effort: the reasoning tokens a
  // gpt-oss/qwen model spends before its answer are latency the learner pays for
  // and never sees. Only sent when the payload asks, and dropped again on a 400
  // (see callProvider) because not every routed backend accepts the field.
  if (reasoningEffort && typeof gen.reasoningEffort === "string") {
    body.reasoning_effort = gen.reasoningEffort;
  }
  return body;
}

/**
 * Gemini rejects generationConfig fields it does not know, so the OpenAI-only
 * knobs the shared payload carries are stripped before a Gemini request goes
 * out. Everything else passes through untouched.
 */
function geminiBody(payload) {
  const gen = payload?.generationConfig;
  if (!gen || gen.reasoningEffort === undefined) return payload;
  const { reasoningEffort, ...rest } = gen;
  void reasoningEffort;
  return { ...payload, generationConfig: rest };
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
  let timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // A retry inside this call gets its own attempt window instead of inheriting
  // whatever is left of the first one.
  const restartTimeout = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  };
  try {
    if (entry.format === "gemini") {
      const res = await doFetch(`${GEMINI_BASE_URL}/models/${entry.model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody(payload)),
        signal: controller.signal,
      });
      recordProviderBudget(entry, res.headers);
      const bodyText = await res.text().catch(() => "");
      if (!res.ok) {
        throw new ProviderCallError(entry, res.status, bodyText, undefined, {
          retryAfterMs: retryAfterMsFrom(res.headers),
        });
      }
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
    const send = (features) =>
      doFetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(buildOpenAiBody(entry, payload, features, toMessages)),
        signal: controller.signal,
      });

    const features = { jsonMode: true, reasoningEffort: true };
    let res = await send(features);
    if (res.status === 400) {
      // A 400 that names an optional field means the backend does not support it;
      // the same call without that one field is still usable (the handlers parse
      // defensively). Two independent knobs, each dropped at most once.
      const firstBody = await res.text().catch(() => "");
      let dropped = false;
      if (features.jsonMode && /response_format|json_object|json mode/i.test(firstBody)) {
        features.jsonMode = false;
        dropped = true;
      }
      if (features.reasoningEffort && /reasoning[_ ]?effort/i.test(firstBody)) {
        features.reasoningEffort = false;
        dropped = true;
      }
      // Groq's structured-output validator fails the whole generation
      // (`json_validate_failed`) when the model emits JSON it cannot validate —
      // intermittently, on perfectly ordinary input. The identifier it names is
      // not the field, so the branch above misses it and the identical retry
      // fails identically: the learner loses the turn to an error card. Dropping
      // the enforced format and letting the route's own tolerant parser read the
      // reply is strictly better than no reply at all.
      if (features.jsonMode && /json_validate_failed|failed to validate json/i.test(firstBody)) {
        features.jsonMode = false;
        dropped = true;
      }
      if (!dropped) throw new ProviderCallError(entry, 400, firstBody);
      restartTimeout();
      res = await send(features);
    }

    // The provider's own limits, before anything else can throw: a 429 body is
    // the least reliable statement about what is left, the headers are exact.
    recordProviderBudget(entry, res.headers);
    const bodyText = await res.text().catch(() => "");
    if (!res.ok) {
      throw new ProviderCallError(entry, res.status, bodyText, undefined, {
        retryAfterMs: retryAfterMsFrom(res.headers),
      });
    }
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
 *                          `onAttempt` (a non-throwing observer told about every
 *                          provider attempt — telemetry only, never consulted),
 *                          `preferFast` (set it for anything a learner is
 *                          waiting on: the tier walk is then ordered by measured
 *                          latency instead of round-robin), plus test-only
 *                          overrides (pool, budgetMs, attemptTimeoutMs,
 *                          fetchImpl).
 * @returns {Promise<string>} the model's text
 */
export async function callAiRouter(payload, env, deps = {}) {
  // Expanded AFTER the admin pool is resolved (see expandModelFallbacks): the
  // dashboard keeps one row per provider, while the walk gets one unit per free
  // model so a dead id fails over to the next instead of ending the turn.
  const pool = expandModelFallbacks(Array.isArray(deps.pool) ? deps.pool : PROVIDER_POOL);
  const budgetMs = Number(deps.budgetMs) || ROUTER_BUDGET_MS;
  const attemptTimeoutMs = Number(deps.attemptTimeoutMs) || ATTEMPT_TIMEOUT_MS;
  const reserveMs = Number(deps.reserveMs ?? FALLBACK_RESERVE_MS);
  const deadline = Date.now() + budgetMs;
  const toMessages = deps.toOpenAiMessages;
  // Observer only. `onAttempt` is told about each provider attempt so the admin
  // panel can count what actually multiplied (attempts, not HTTP requests). It
  // never returns anything, never throws, and is never consulted for a decision:
  // rotation, cooldown, parking and failover below are byte-for-byte unchanged.
  const notifyAttempt = (entry, key, kind, status, latencyMs) => {
    const observer = deps.onAttempt;
    if (typeof observer !== "function") return;
    try {
      observer({
        provider: entry.provider,
        model: entry.model,
        keyId: key ? keyFingerprint(key) : null,
        kind,
        status: Number.isFinite(status) ? status : null,
        latencyMs,
      });
    } catch {
      /* an observation must never disturb the router */
    }
  };

  await hydrateLedger(env);

  let lastError = null;
  // Did every attempt fail for a quota/throttle reason? Only then may the route
  // claim the daily limit is what stopped the turn.
  let attemptedAny = false;
  let quotaOnly = true;

  // A learner turn (deps.modelFirst) walks by MODEL, not by tier: the preferred
  // model on every gate-passed provider in quality order, then any other pair
  // that has passed the same gate. Every other route keeps the tier walk, which
  // is what its tests and its latency preference were designed around.
  // The gate protects the PRODUCTION pool. An explicitly injected pool (tests,
  // an operator's diagnostic) is a decision the caller already made, so it is
  // walked as given.
  const enforceGate = deps.modelFirst === true && !Array.isArray(deps.pool);
  const allowedPairs = Array.isArray(deps.qualityGatePasses) && deps.qualityGatePasses.length
    ? deps.qualityGatePasses
    : enforceGate
      ? DEFAULT_QUALITY_GATE_PASSES
      : null;
  const keyedEntries = (entries) => entries.filter((entry) => entryKeysFor(entry, env).length > 0);
  const groups = deps.modelFirst === true
    ? [keyedEntries(allowedPairs ? orderPoolForChat(pool, allowedPairs) : pool.filter(isEntryConfigured))]
    : tierWalkFor(deps.easyTurn === true).map((tier) => {
        const tierEntries = keyedEntries(
          pool.filter((entry) => entry.tier === tier && isEntryConfigured(entry)),
        );
        if (!tierEntries.length) return [];
        const start = nextRotation(tierRotations, `tier:${tier}`, tierEntries.length);
        const ordered = orderTierEntries(tierEntries, start, deps.preferFast === true);
        // A route may name the model it wants (the roleplay turn reads
        // ROLEPLAY_MODEL): the named entry moves to the front of its tier, and
        // every other usable entry stays behind it, so a dead model still fails
        // over exactly as before. No silent model swap, no second pool.
        return typeof deps.preferModel === "string" && deps.preferModel
          ? [
              ...ordered.filter((entry) => entry.model === deps.preferModel),
              ...ordered.filter((entry) => entry.model !== deps.preferModel),
            ]
          : ordered;
      });

  poolWalk: for (const walk of groups) {
    if (!walk.length) continue;

    for (const entry of walk) {
      // One key per provider organization (owner rule, 2026-11-16): a provider
      // contributes exactly one credential to the walk. Extra keys are a
      // configuration error reported in /health, never extra capacity.
      const keys = entryKeysFor(entry, env);
      const keyStart = nextRotation(keyRotations, `keys:${entry.provider}:${entry.model}`, keys.length);

      for (let k = 0; k < keys.length; k++) {
        const key = keys[(keyStart + k) % keys.length];
        // Terminal skip: a unit inside its exhausted window is not called at all.
        if (isDayExhausted(entry, key)) continue;
        if (deps.isKeyCoolingDown?.(key)) continue;
        // The provider itself said nothing is left this window: do not spend a
        // call to be told 429.
        if (isBudgetSpent(entry)) continue;
        // A hard context wall (Cerebras free: 8K) is respected, never bumped into.
        if (exceedsContextCap(entry, payload)) continue;

        const remaining = deadline - Date.now();
        if (remaining < reserveMs) break poolWalk;

        countAttempt(entry.provider);
        attemptedAny = true;
        const startedAt = Date.now();
        try {
          const text = await callProvider(entry, payload, key, {
            timeoutMs: Math.min(attemptTimeoutMs, Math.max(1000, remaining)),
            fetchImpl: deps.fetchImpl,
            toMessages,
          });
          recordLatency(entry, Date.now() - startedAt);
          persistLatency(env);
          notifyAttempt(entry, key, "ok", 200, Date.now() - startedAt);
          deps.markKeySuccess?.(key);
          deps.onProvider?.(entry.provider);
          deps.onModel?.(entry.model);
          routerCounters.served += 1;
          routerCounters.lastProvider = entry.provider;
          return text;
        } catch (err) {
          lastError = err;
          const kind = err instanceof ProviderCallError ? err.kind : classifyFailure(0, String(err?.message || err));
          // A quota/throttle answer is the limit; anything else is a failure.
          if (kind !== "day" && kind !== "minute" && kind !== "invalid_key" && kind !== "model_missing") {
            quotaOnly = false;
          }
          notifyAttempt(entry, key, kind, err?.status ?? null, Date.now() - startedAt);

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
            // The provider's own `Retry-After` wins over our guess: it is the
            // only statement about when this window actually reopens.
            deps.markKeyCooldown?.(key, err?.status || 429, err?.retryAfterMs ?? null);
            continue;
          }
          // Transient (network, 5xx, empty completion): try the next entry
          // without parking anything — a bad minute must not cost the day.
        }
      }
    }
  }

  // A learner's conversation is never served from the weak Workers AI fallback:
  // a worse partner the learner cannot tell apart from a better one is a silent
  // downgrade (owner direction, 2026-11-16). Interactive roleplay passes
  // `allowWeakFallback: false` and gets an honest capacity error instead.
  if (deps.allowWeakFallback === false) {
    // "Capacity exhausted" is a claim about the limit, so it is only made when
    // the limit is what stopped us: every attempted unit was parked, throttled
    // or dead. A 5xx or a timeout is a failure, not a quota, and keeps the
    // generic error so the learner sees the retry card instead of a message
    // that says to come back tomorrow.
    if (quotaOnly) throw new AiCapacityExhaustedError(attemptedAny ? undefined : "no provider can serve this route");
    throw lastError || new Error("All AI providers are unavailable");
  }

  if (deps.canUseWorkersAiFallback?.(env)) {
    const fallbackStartedAt = Date.now();
    try {
      console.warn("[ai-router] pool exhausted for this window — serving via Workers AI fallback.");
      const text = await deps.runWorkersAiFallback(payload, env);
      notifyAttempt({ provider: "workers-ai", model: null }, null, "ok", 200, Date.now() - fallbackStartedAt);
      routerCounters.served += 1;
      routerCounters.lastProvider = "workers-ai";
      return text;
    } catch (fallbackErr) {
      notifyAttempt({ provider: "workers-ai", model: null }, null, "fallback_failed", null, Date.now() - fallbackStartedAt);
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
  // Report the units the walk can actually call: one per (provider, model), so
  // a free-model gateway shows each id and a parked primary is not hidden behind
  // the row that still has a fallback. `providerKeyCounts` stays on the raw pool
  // — the one-key rule is per organization, not per model id.
  const units = expandModelFallbacks(pool);
  const active = [];
  const idle = [];
  for (const entry of units) {
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

  // The chat pool: what a LEARNER turn would walk. Separate from `active`
  // because a configured provider whose pair has not passed the quality gate
  // must never be counted as able to answer a learner.
  const chat = units
    .filter((entry) => isEntryConfigured(entry) && entryKeysFor(entry, env).length > 0 && passesQualityGate(entry))
    .map((entry) => ({ provider: entry.provider, model: entry.model }));

  // A second key on the same organization is a policy violation, not capacity.
  const configErrors = providerKeyCounts(env, pool)
    .filter((row) => row.configured > 1)
    .map((row) => ({ provider: row.provider, configured: row.configured, error: "one_key_per_provider" }));

  return {
    entries: pool.length,
    tiers: PROVIDER_TIERS,
    active,
    idle,
    exhausted,
    attempts: routerCountersSnapshot(),
    cache: cacheStats(),
    chat: { ready: chat.length > 0, preferred_model: PREFERRED_MODEL, entries: chat },
    quality_gate: { passes: [...DEFAULT_QUALITY_GATE_PASSES] },
    budgets: providerBudgetSnapshot(),
    config_errors: configErrors,
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
