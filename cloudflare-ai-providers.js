/**
 * Owner-managed AI provider configuration (admin dashboard → AI Providers tab).
 *
 * WHY THIS EXISTS
 * The default pool (PROVIDER_POOL in cloudflare-ai-router.js) is OpenRouter +
 * NVIDIA only, by owner direction 2026-10-18. The owner asked to edit the
 * provider set freely — add a custom gateway with its own base URL and API
 * key, disable a default, re-add a famous provider from a preset — without a
 * code change or a redeploy. This module is that configuration surface: it
 * stores the owner's decisions in KV (`ai-provider-config` on USER_PROGRESS)
 * and resolves the pool a request actually walks (`resolvePool`).
 *
 * SECURITY CONTRACT
 * - Provider keys are stored server-side only. A GET never returns a key: the
 *   dashboard sees a count, where the keys come from, and the non-reversible
 *   fingerprint (see keyFingerprint in the router) of each key. Nothing is
 *   logged. Every mutation path here is reached only through /admin/api,
 *   which is the bearer-secret gate in cloudflare-admin.js.
 * - The KV value carries keys by design: it lives in the worker's private
 *   namespace, reached by nothing except this worker's admin routes and the
 *   AI paths that dial providers. It is the same trust level as the worker's
 *   own secrets; the owner chooses which they prefer.
 *
 * Keys are never mixed into the pool entries of PRODUCERS: an entry's key list
 * comes `entryKeysFor` in the router — stored list first, env var fallback.
 */

import {
  PROVIDER_POOL,
  callProvider,
  entryKeysFor,
  isEntryConfigured,
  keyFingerprint,
} from "./cloudflare-ai-router.js";

const CONFIG_KV_KEY = "ai-provider-config";
/** A year, then the daily cron sweep of nothing in particular — this must outlive any outage. */
const CONFIG_TTL_SECONDS = 365 * 86400;
/** A serving isolate re-reads the owner's config at most this often. */
const CONFIG_CACHE_MS = 30000;

export const MAX_CUSTOM_PROVIDERS = 24;
export const MAX_KEYS_PER_ENTRY = 32;
export const TIER_NAMES = ["flagship", "mid", "lite"];
export const PROVIDER_FORMATS = ["openai", "gemini"];

/** Empty owner config: defaults from the router's PROVIDER_POOL, nothing custom. */
export function emptyProviderConfig() {
  return { version: 1, updated_at: 0, disabledDefaults: [], defaultsKeys: {}, custom: [] };
}

let configCache = { at: 0, value: null };
let configHydrationPromise = null;

/** Test seam: module state is per isolate, and tests must start from empty. */
export function resetProviderConfigState() {
  configCache = { at: 0, value: null };
  configHydrationPromise = null;
}

/**
 * The stored owner config, merged over the empty shape (a missing, partial or
 * corrupt value degrades to the defaults, never to a failed request). Memoized
 * like the ledger hydrate: a KV read every AI request would tax the turn it is
 * supposed to serve, and an owner edit lands within this much time.
 */
export async function readProviderConfig(env) {
  if (Date.now() - configCache.at < CONFIG_CACHE_MS && configCache.value) return configCache.value;
  if (configHydrationPromise) return configHydrationPromise;
  if (!env?.USER_PROGRESS?.get) return emptyProviderConfig();
  configHydrationPromise = (async () => {
    try {
      const raw = await env.USER_PROGRESS.get(CONFIG_KV_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const merged = { ...emptyProviderConfig(), ...(parsed && typeof parsed === "object" ? parsed : {}) };
      if (!Array.isArray(merged.disabledDefaults)) merged.disabledDefaults = [];
      merged.defaultsKeys = merged.defaultsKeys && typeof merged.defaultsKeys === "object" ? merged.defaultsKeys : {};
      if (!Array.isArray(merged.custom)) merged.custom = [];
      configCache = { at: Date.now(), value: merged };
      return merged;
    } catch {
      configCache = { at: Date.now(), value: emptyProviderConfig() };
      return configCache.value;
    } finally {
      configHydrationPromise = null;
    }
  })();
  return configHydrationPromise;
}

async function persistProviderConfig(env, config) {
  config.version = 1;
  config.updated_at = Date.now();
  if (env?.USER_PROGRESS?.put) {
    try {
      await env.USER_PROGRESS.put(CONFIG_KV_KEY, JSON.stringify(config), { expirationTtl: CONFIG_TTL_SECONDS });
    } catch {
      /* best-effort, same idiom as the ledger: a lost write costs one repeat edit */
    }
  }
}

function invalidateProviderConfigCache() {
  configCache = { at: 0, value: null };
  configHydrationPromise = null;
}

/**
 * The pool a request walks: default entries minus the owner-disabled set, plus
 * every custom entry that is enabled and shaped well enough to call. Custom
 * entries keep their own `keys`; defaults attach the owner-stored key override
 * (`defaultsKeys`) if the owner gave one through the dashboard, so an entry's
 * resolution is one shape everywhere.
 */
export async function resolveProviderPool(env) {
  const config = await readProviderConfig(env);
  const disabled = new Set(config.disabledDefaults);
  const defaults = [];
  for (const entry of PROVIDER_POOL) {
    if (disabled.has(entry.provider)) continue;
    const override = Array.isArray(config.defaultsKeys[entry.provider]) ? config.defaultsKeys[entry.provider] : null;
    defaults.push(override?.length ? { ...entry, keys: override, id: entry.provider, origin: "default" } : { ...entry, id: entry.provider, origin: "default" });
  }
  const custom = config.custom
    .filter((entry) => entry && entry.enabled !== false && isEntryConfigured(entry) && entryKeysFor(entry, env).length > 0)
    .map((entry) => ({ ...entry, origin: "custom" }));
  return [...defaults, ...custom];
}

/** What the admin list shows: never a key, only counts, source and fingerprints. */
export function maskProviderEntry(entry, env) {
  const storedKeys = Array.isArray(entry?.keys)
    ? entry.keys.filter((k) => typeof k === "string" && k.trim()).map((k) => k.trim())
    : [];
  const hasStored = storedKeys.length > 0;
  const envKeys = hasStored ? [] : entryKeysFor(entry, env);
  const resolvedKeys = hasStored ? storedKeys : envKeys;
  return {
    id: entry.id || entry.provider,
    origin: entry.origin || "custom",
    provider: entry.provider,
    model: entry.model,
    baseUrl: entry.baseUrl || null,
    format: entry.format || "openai",
    tier: entry.tier || "mid",
    rpd: entry.rpd ?? null,
    sharedAccountCap: !!entry.sharedAccountCap,
    enabled: entry.origin === "default" ? !entry.__disabled : entry.enabled !== false,
    configured: isEntryConfigured(entry),
    keySource: hasStored ? "dashboard" : "env",
    keyCount: resolvedKeys.length,
    /** Non-reversible; identifies WHICH key without carrying any of it. */
    keyFingerprints: resolvedKeys.map((k) => keyFingerprint(k)),
  };
}

// ---------------------------------------------------------------------------
// Validation (server-side; the dashboard form is convenience, not the gate)
// ---------------------------------------------------------------------------

const slug = (value) => String(value || "").toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

function validBaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value || value.length > 200) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  // Same rule as the app-origin validator: real gateways are https; http only
  // for a loopback nobody outside this machine can reach.
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
  if (url.username || url.password) return null;
  return { baseUrl: value.replace(/\/+$/, "") };
}

function normalizeKeyList(raw, existing = []) {
  const input = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;\n]+/) : [];
  const seen = new Set(existing);
  const keys = existing.filter((k) => typeof k === "string" && k.trim().length >= 8);
  let added = 0;
  for (const item of input) {
    const key = String(item || "").trim();
    if (!key) continue;
    if (key.length < 8 || key.length > 512) return { error: "key_length" };
    if (seen.has(key)) continue;
    if (keys.length >= MAX_KEYS_PER_ENTRY) return { error: "too_many_keys" };
    seen.add(key);
    keys.push(key);
    added += 1;
  }
  return { keys, added };
}

/**
 * One validated owner entry (everything except the key list — upsert owns
 * that, because keys merge or replace on a fairly different rule per entry
 * kind). The dashboard's fields are NOT the gate: anything that would produce
 * an uncalled or unsafe entry is rejected here with a named reason the
 * dashboard can print.
 */
export function normalizeCustomEntry(body, existing = null) {
  const provider = slug(body?.provider || existing?.provider);
  if (!provider || provider.length < 2) return { error: "provider_invalid" };
  const model = String(body?.model ?? existing?.model ?? "").trim();
  if (!model || model.length > 80 || /[\r\n]/.test(model)) return { error: "model_invalid" };
  const format = PROVIDER_FORMATS.includes(body?.format) ? body.format
    : PROVIDER_FORMATS.includes(existing?.format) ? existing.format : "openai";
  const tier = TIER_NAMES.includes(body?.tier) ? body.tier
    : TIER_NAMES.includes(existing?.tier) ? existing.tier : "mid";
  const base = validBaseUrl(body?.baseUrl ?? existing?.baseUrl);
  if (!base) return { error: "base_url_invalid" };
  let id = slug(body?.id) || slug(existing?.id) || slug(`${provider}-${model}`);
  if (!id || id.length < 2) return { error: "id_invalid" };
  const entry = {
    id,
    origin: "custom",
    provider,
    model,
    baseUrl: base.baseUrl,
    format,
    tier,
    keys: Array.isArray(existing?.keys) ? existing.keys.filter((k) => typeof k === "string" && k.trim().length >= 8) : [],
    enabled: body?.enabled === undefined ? (existing?.enabled !== false) : body.enabled === true,
    created_at: existing?.created_at || Date.now(),
  };
  return { entry };
}

// ---------------------------------------------------------------------------
// Owner operations (called only from the admin API surface)
// ---------------------------------------------------------------------------

// Sync on purpose: they are called in conditions where an un-awaited Promise
// would silently read as truthy/falsy and mis-route an upsert (caught by
// tests/aiProviderConfig.test.ts — keep them sync).
function findCustom(config, id) {
  return config.custom.find((entry) => entry.id === id) || null;
}

function findDefault(config, providerName) {
  const entry = PROVIDER_POOL.find((e) => e.provider === providerName);
  if (!entry) return null;
  const override = Array.isArray(config.defaultsKeys[providerName]) ? config.defaultsKeys[providerName] : null;
  return {
    ...entry,
    id: entry.provider,
    origin: "default",
    keys: override?.length ? override : undefined,
    __disabled: config.disabledDefaults.includes(providerName),
  };
}

/**
 * Upsert.
 * - `id` naming a DEFAULT entry: only its keys may change there (the shape is
 *   the code's concern; to run a different gateway the owner adds a custom
 *   entry). Keys given through the dashboard REPLACE the override set; `null`
 *   falls back to the env list.
 * - `id` naming a CUSTOM entry: every shape field may change; given keys MERGE
 *   into the stored list unless `replaceKeys` is true; `clearKeys` empties it.
 * - No `id` means create.
 */
export async function upsertProviderEntry(env, body = {}) {
  const config = await readProviderConfig(env);
  const id = slug(body?.id);
  const isDefault = id && !findCustom(config, id) && PROVIDER_POOL.some((e) => e.provider === id);

  if (isDefault) {
    if (body.model !== undefined && body.model !== null && String(body.model).trim() !== "") {
      return { status: 400, body: { error: "default_entry_not_shape_editable", id } };
    }
    if (body.clearKeys === true || body.keys === null) {
      delete config.defaultsKeys[id];
    } else if (body.keys !== undefined) {
      const parsed = normalizeKeyList(
        body.keys,
        body.replaceKeys === true ? [] : (Array.isArray(config.defaultsKeys[id]) ? config.defaultsKeys[id] : []),
      );
      if (parsed.error) return { status: 400, body: { error: parsed.error } };
      if (parsed.keys.length === 0 && !body.clear) {
        return { status: 400, body: { error: "keys_empty_use_null_to_clear" } };
      }
      if (parsed.keys.length === 0) delete config.defaultsKeys[id];
      else config.defaultsKeys[id] = parsed.keys;
    }
    await persistProviderConfig(env, config);
    invalidateProviderConfigCache();
    const entry = await findDefault(config, id);
    return { status: 200, body: maskProviderEntry({ ...entry, keys: Array.isArray(config.defaultsKeys[id]) ? config.defaultsKeys[id] : entry.keys, id }, env) };
  }

  const existing = id ? await findCustom(config, id) : null;
  if (!existing && config.custom.length >= MAX_CUSTOM_PROVIDERS) {
    return { status: 400, body: { error: "too_many_custom_providers", max: MAX_CUSTOM_PROVIDERS } };
  }
  const normalized = normalizeCustomEntry(body, existing);
  if (normalized.error) return { status: 400, body: { error: normalized.error } };
  const entry = normalized.entry;
  if (body.clearKeys === true) entry.keys = [];
  else if (body.keys !== undefined && body.keys !== null) {
    const parsed = normalizeKeyList(body.keys, body.replaceKeys === true ? [] : entry.keys);
    if (parsed.error) return { status: 400, body: { error: parsed.error } };
    entry.keys = parsed.keys;
  }
  const clash = config.custom.find((e) => e.id === entry.id && e !== existing);
  if (clash) return { status: 409, body: { error: "id_exists", id: clash.id } };
  if (existing) config.custom[config.custom.indexOf(existing)] = entry;
  else config.custom.push(entry);
  await persistProviderConfig(env, config);
  invalidateProviderConfigCache();
  return { status: existing ? 200 : 201, body: maskProviderEntry(entry, env) };
}

/** Delete a CUSTOM entry. Defaults are toggled off, never deleted. */
export async function deleteProviderEntry(env, id) {
  const config = await readProviderConfig(env);
  const entry = await findCustom(config, id);
  if (!entry) return { status: 404, body: { error: "custom_entry_not_found", id } };
  config.custom.splice(config.custom.indexOf(entry), 1);
  await persistProviderConfig(env, config);
  invalidateProviderConfigCache();
  return { status: 200, body: { deleted: id } };
}

/** Enable/disable a DEFAULT entry (a toggle, not a delete). */
export async function setDefaultProviderState(env, providerName, enabled) {
  const config = await readProviderConfig(env);
  const entry = PROVIDER_POOL.find((e) => e.provider === providerName);
  if (!entry) return { status: 404, body: { error: "default_entry_not_found", id: providerName } };
  const at = config.disabledDefaults.indexOf(providerName);
  if (enabled && at !== -1) config.disabledDefaults.splice(at, 1);
  if (!enabled && at === -1) config.disabledDefaults.push(providerName);
  await persistProviderConfig(env, config);
  invalidateProviderConfigCache();
  return { status: 200, body: maskProviderEntry({ ...entry, id: providerName, origin: "default", __disabled: !enabled }, env) };
}

/** Everything the dashboard needs, in owner-safe shape. */
export async function listProviderConfig(env) {
  const config = await readProviderConfig(env);
  const pool = await resolveProviderPool(env);
  const defaultsMasked = [];
  const customMasked = [];
  for (const entry of PROVIDER_POOL) {
    // Attach the owner's stored override, exactly as resolveProviderPool does.
    // Without it maskProviderEntry only saw the env keys, so a saved key list
    // read back as "0 keys · env" the moment the table reloaded — the save said
    // "Stored keys for nvidia", the row said nothing had been stored, and the
    // pool really was serving the keys (routing reads resolveProviderPool).
    const override = Array.isArray(config.defaultsKeys[entry.provider]) ? config.defaultsKeys[entry.provider] : null;
    defaultsMasked.push(maskProviderEntry({
      ...entry,
      ...(override && override.length ? { keys: override } : {}),
      id: entry.provider,
      origin: "default",
      __disabled: config.disabledDefaults.includes(entry.provider),
    }, env));
  }
  for (const entry of config.custom) {
    customMasked.push(maskProviderEntry({ ...entry, origin: "custom" }, env));
  }
  return {
    updated_at: config.updated_at,
    defaults: defaultsMasked,
    custom: customMasked,
    // The live walk order: what a learner's turn would actually try.
    pool_order: pool.map((entry) => `${entry.provider}:${entry.model}`),
    limits: { maxCustom: MAX_CUSTOM_PROVIDERS, maxKeys: MAX_KEYS_PER_ENTRY },
  };
}

// ---------------------------------------------------------------------------
// The owner's "Test" button: one tiny round trip, no key material in a response
// ---------------------------------------------------------------------------

/** Test-path only: the canonical converter lives in the worker (byte wall);
 *  a turn never takes this route, so a duplicate of its logic for `_test` is
 *  acceptable and documented rather than shared. */
function testToOpenAiMessages(payload) {
  const messages = [];
  const sys = payload?.systemInstruction?.parts?.map((p) => p?.text || "").join("");
  if (sys) messages.push({ role: "system", content: sys });
  for (const c of Array.isArray(payload?.contents) ? payload.contents : []) {
    const content = (c?.parts || []).map((p) => p?.text || "").join("");
    if (content) messages.push({ role: c.role === "model" ? "assistant" : "user", content });
  }
  return messages;
}

export async function testProviderEntry(env, id, { fetchImpl } = {}) {
  const config = await readProviderConfig(env);
  const entry = (await findDefault(config, id)) || (await findCustom(config, id));
  if (!entry) return { status: 404, body: { error: "entry_not_found", id } };
  const keys = entryKeysFor({ ...entry, id, origin: entry.origin || "custom" }, env);
  if (!keys.length) return { status: 200, body: { ok: false, reason: "no_keys", id } };
  const key = keys[0];
  const payload = {
    contents: [{ role: "user", parts: [{ text: "Reply with exactly: OK" }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 16 },
  };
  const started = Date.now();
  try {
    const text = await callProvider(
      { ...entry, id, origin: entry.origin || "custom" },
      payload,
      key,
      // A test round trip must never hang in the dashboard: 8 s, matching one
      // pool attempt. fetchImpl is a test seam, like the router's own.
      { timeoutMs: 8000, fetchImpl: fetchImpl || fetch, toMessages: testToOpenAiMessages },
    );
    return {
      status: 200,
      body: {
        ok: true,
        id,
        latency_ms: Date.now() - started,
        testedKey: keyFingerprint(key),
        model: entry.model,
        provider: entry.provider,
        sample: String(text || "").slice(0, 120),
      },
    };
  } catch (err) {
    return {
      status: 200,
      body: {
        ok: false,
        id,
        latency_ms: Date.now() - started,
        testedKey: keyFingerprint(key),
        model: entry.model,
        provider: entry.provider,
        status: err?.status ?? 0,
        kind: err?.kind || "other",
        message: String(err?.message || err).slice(0, 180),
      },
    };
  }
}
