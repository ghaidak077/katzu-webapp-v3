import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_CUSTOM_PROVIDERS,
  deleteProviderEntry,
  emptyProviderConfig,
  listProviderConfig,
  maskProviderEntry,
  normalizeCustomEntry,
  readProviderConfig,
  resolveProviderPool,
  resetProviderConfigState,
  setDefaultProviderState,
  testProviderEntry,
  upsertProviderEntry,
} from '../cloudflare-ai-providers.js';
import { resetRouterState } from '../cloudflare-ai-router.js';

function MemoryKv() {
  const store = new Map();
  return {
    async get(key) { return store.get(key) ?? null; },
    async put(key, value) { store.set(key, value); },
    store,
  };
}

function makeEnv() {
  const kv = new MemoryKv();
  return {
    USER_PROGRESS: kv,
    // Two real-format OpenRouter keys through the standard env secret.
    OPENROUTER_API_KEYS: 'openrouter-live-key-aaaaaaaaaaaa,openrouter-live-key-bbbbbbbbbbbb',
  };
}

describe('resolveProviderPool', () => {
  beforeEach(() => {
    resetRouterState();
    resetProviderConfigState();
  });

  it('returns the two defaults (OpenRouter + NVIDIA) and no Gemini/Groq entry', async () => {
    const pool = await resolveProviderPool(makeEnv());
    expect(pool.map((e) => e.provider).sort()).toEqual(['nvidia', 'openrouter']);
    const gemini = pool.find((e) => e.provider === 'gemini');
    const groq = pool.find((e) => e.provider === 'groq');
    expect(gemini).toBeUndefined();
    expect(groq).toBeUndefined();
  });

  it('honors a disabled default', async () => {
    const env = makeEnv();
    await setDefaultProviderState(env, 'nvidia', false);
    const pool = await resolveProviderPool(env);
    expect(pool.map((e) => e.provider)).toEqual(['openrouter']);
    await setDefaultProviderState(env, 'nvidia', true);
    const restored = await resolveProviderPool(env);
    expect(restored.map((e) => e.provider).sort()).toEqual(['nvidia', 'openrouter']);
  });

  it('appends enabled custom entries after the defaults, in stored order', async () => {
    const env = makeEnv();
    await upsertProviderEntry(env, {
      provider: 'gateway-a', baseUrl: 'https://api.example-a.com/v1', model: 'm-a', keys: ['custom-key-aaaa1'],
    });
    await upsertProviderEntry(env, {
      provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', keys: ['custom-key-bbbb2'], enabled: false,
    });
    const pool = await resolveProviderPool(env);
    expect(pool.map((e) => e.provider)).toEqual(['nvidia', 'openrouter', 'gateway-a']);
  });

  it('a dashboard key override wins over the env key list', async () => {
    const env = makeEnv();
    await upsertProviderEntry(env, { id: 'openrouter', keys: ['dashboard-stored-key-1'] });
    const config = JSON.parse(env.USER_PROGRESS.store.get('ai-provider-config'));
    expect(config.defaultsKeys.openrouter).toEqual(['dashboard-stored-key-1']);
  });

  it('never touches defaults keys when a shape edit is attempted on one', async () => {
    const env = makeEnv();
    const attempt = await upsertProviderEntry(env, { id: 'nvidia', model: 'someone-new' });
    expect(attempt.status).toBe(400);
    expect(attempt.body.error).toBe('default_entry_not_shape_editable');
  });
});

describe('normalizeCustomEntry', () => {
  const good = { provider: 'mygateway', baseUrl: 'https://gw.example.com/v1', model: 'model-x' };

  it('rejects a non-https, non-loopback base URL', () => {
    expect(normalizeCustomEntry({ ...good, baseUrl: 'http://gw.example.com/v1' }).error).toBe('base_url_invalid');
  });

  it('accepts a loopback http base URL for local testing', () => {
    const result = normalizeCustomEntry({ ...good, baseUrl: 'http://localhost:8080/v1' });
    expect(result.entry.baseUrl).toBe('http://localhost:8080/v1');
  });

  it('rejects a short key and merges duplicates away (via upsert, the actual gate)', async () => {
    const env = makeEnv();
    const short = await upsertProviderEntry(env, {
      provider: 'gw', baseUrl: 'https://api.gw.test/v1', model: 'm', keys: ['short'],
    });
    expect(short.status).toBe(400);
    expect(short.body.error).toBe('key_length');
    const merged = await upsertProviderEntry(env, {
      provider: 'gw2', baseUrl: 'https://api.gw.test/v1', model: 'm',
      keys: ['valid-key-aaaaaaaaaa', 'valid-key-aaaaaaaaaa'],
    });
    expect(merged.status).toBe(201);
    expect(merged.body.keyCount).toBe(1);
  });

  it('slugs the provider name and refuses an empty one', () => {
    expect(normalizeCustomEntry({ ...good, provider: 'My Gateway Co' }).entry.provider).toBe('my-gateway-co');
    expect(normalizeCustomEntry({ provider: '', baseUrl: 'https://x.com', model: 'm' }).error).toBe('provider_invalid');
  });

  it('rejects a model longer than 80 chars or with newlines', () => {
    expect(normalizeCustomEntry({ ...good, model: 'a\nb' }).error).toBe('model_invalid');
    expect(normalizeCustomEntry({ ...good, model: 'x'.repeat(81) }).error).toBe('model_invalid');
  });

  it('defaults the format to openai and accepts gemini', () => {
    expect(normalizeCustomEntry(good).entry.format).toBe('openai');
    expect(normalizeCustomEntry({ ...good, format: 'gemini' }).entry.format).toBe('gemini');
    expect(normalizeCustomEntry({ ...good, format: 'http' }).entry.format).toBe('openai');
  });
});

describe('upsert via the owner op', () => {
  beforeEach(() => {
    resetRouterState();
    resetProviderConfigState();
  });

  it('merges keys by default and replaces them on replaceKeys', async () => {
    const env = makeEnv();
    const created = await upsertProviderEntry(env, {
      provider: 'gw', baseUrl: 'https://api.gw.test/v1', model: 'm', keys: ['first-key-aaaaaaaaa'],
    });
    expect(created.status).toBe(201);
    await upsertProviderEntry(env, { id: created.body.id, keys: ['second-key-bbbbbbbbb'] });
    let stored = JSON.parse(env.USER_PROGRESS.store.get('ai-provider-config'));
    expect(stored.custom[0].keys).toHaveLength(2);
    await upsertProviderEntry(env, { id: created.body.id, keys: ['third-key-ccccccccc'], replaceKeys: true });
    stored = JSON.parse(env.USER_PROGRESS.store.get('ai-provider-config'));
    expect(stored.custom[0].keys).toEqual(['third-key-ccccccccc']);
  });

  it('clearing keys on a custom entry yields an entry that is skipped by the guard', async () => {
    const env = makeEnv();
    const created = await upsertProviderEntry(env, {
      provider: 'gw', baseUrl: 'https://api.gw.test/v1', model: 'm', keys: ['first-key-aaaaaaaaa'],
    });
    await upsertProviderEntry(env, { id: created.body.id, clearKeys: true });
    const pool = await resolveProviderPool(env);
    expect(pool.length).toBe(2); // defaults only; the keyless custom entry never walks
  });

  it('caps the custom list and reports the cap', async () => {
    const env = makeEnv();
    for (let i = 0; i < MAX_CUSTOM_PROVIDERS; i++) {
      const res = await upsertProviderEntry(env, {
        provider: `gw${i}`, baseUrl: 'https://api.gw.test/v1', model: 'm', keys: ['key-aaaaaaaa-' + i],
      });
      expect(res.status).toBe(201);
    }
    const over = await upsertProviderEntry(env, { provider: 'gwX', baseUrl: 'https://api.gw.test/v1', model: 'm', keys: ['key-aaaaaaaa-X'] });
    expect(over.status).toBe(400);
    expect(over.body.error).toBe('too_many_custom_providers');
  });

  it('masks every read: counts and fingerprints, never key material', async () => {
    const env = makeEnv();
    const key = 'super-secret-gateway-key-value-long';
    await upsertProviderEntry(env, { provider: 'gw', baseUrl: 'https://api.gw.test/v1', model: 'm', keys: [key] });
    const data = await listProviderConfig(env);
    const flat = JSON.stringify(data);
    expect(flat).not.toContain(key);
    expect(data.custom[0].keyCount).toBe(1);
    expect(data.custom[0].keySource).toBe('dashboard');
    expect(data.custom[0].keyFingerprints).toHaveLength(1);
    expect(data.custom[0].keys).toBeUndefined();
    // The store itself carries the key (server-side only) — that is the design.
    expect(env.USER_PROGRESS.store.get('ai-provider-config')).toContain(key);
  });

  it('shows keys stored on a DEFAULT entry, and the list agrees with the save', async () => {
    const env = makeEnv();
    // The dashboard's own path for a built-in provider: paste keys, press Save.
    const saved = await upsertProviderEntry(env, {
      id: 'nvidia',
      keys: ['stored-key-aaaaaaaaaa', 'stored-key-bbbbbbbbbb'],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.keyCount).toBe(2);

    // The table reloads from listProviderConfig, and it used to rebuild every
    // default from PROVIDER_POOL without config.defaultsKeys — so the response
    // said "Stored keys for nvidia" and the row immediately read "0 keys · env".
    // The pool serves the stored keys either way (routing reads
    // resolveProviderPool); only the display disagreed, which is the version of
    // this bug an owner actually sees.
    const data = await listProviderConfig(env);
    const nvidia = data.defaults.find((entry) => entry.provider === 'nvidia');
    expect(nvidia.keySource).toBe('dashboard');
    expect(nvidia.keyCount).toBe(2);
    expect(nvidia.keyFingerprints).toHaveLength(2);
    // Still masked: the list never carries key material.
    expect(JSON.stringify(data)).not.toContain('stored-key-aaaaaaaaaa');
    // A provider with no override keeps reporting its env keys.
    const openrouter = data.defaults.find((entry) => entry.provider === 'openrouter');
    expect(openrouter.keySource).toBe('env');
    expect(openrouter.keyCount).toBe(2);
  });

  it('maskProviderEntry exposes env keys as fingerprints only', () => {
    const entry = { id: 'openrouter', origin: 'default', provider: 'openrouter', model: 'x', format: 'openai', tier: 'mid' };
    const env = { OPENROUTER_API_KEYS: 'env-key-aaaaaaaaaaaaaaaaaa' };
    const masked = maskProviderEntry(entry, env);
    expect(masked.keySource).toBe('env');
    expect(masked.keyCount).toBe(1);
    expect(JSON.stringify(masked)).not.toContain('env-key-aaaa');
  });

  it('delete removes only a custom entry; a default id answers 404', async () => {
    const env = makeEnv();
    const created = await upsertProviderEntry(env, { provider: 'gw', baseUrl: 'https://api.gw.test/v1', model: 'm', keys: ['first-key-aaaaaaaaa'] });
    expect((await deleteProviderEntry(env, 'nvidia')).status).toBe(404);
    expect((await deleteProviderEntry(env, created.body.id)).status).toBe(200);
    const data = await listProviderConfig(env);
    expect(data.custom).toHaveLength(0);
  });
});

describe('readProviderConfig durability', () => {
  beforeEach(() => {
    resetRouterState();
    resetProviderConfigState();
  });

  it('a corrupt stored value degrades to the empty config, not a throw', async () => {
    const env = makeEnv();
    env.USER_PROGRESS.store.set('ai-provider-config', 'not-json{{');
    const config = await readProviderConfig(env);
    expect(config).toEqual(emptyProviderConfig());
  });

  it('an unset KV and no binding both read as empty (defaults still work)', async () => {
    expect(await readProviderConfig(makeEnv())).toEqual(emptyProviderConfig());
    expect(await readProviderConfig({})).toEqual(emptyProviderConfig());
  });
});

describe('testProviderEntry (the dashboard Test button)', () => {
  beforeEach(() => {
    resetRouterState();
    resetProviderConfigState();
  });

  it('answers no_keys without attempting a call', async () => {
    const env = makeEnv();
    const result = await testProviderEntry(env, 'nvidia');
    expect(result.body.ok).toBe(false);
    expect(result.body.reason).toBe('no_keys');
  });

  it('calls the transport through the injectable fetch and reports ok + latency, never the key', async () => {
    const env = makeEnv();
    env.USER_PROGRESS.store.set('ai-provider-config', JSON.stringify({
      version: 1, updated_at: 1, disabledDefaults: ['openrouter'],
      defaultsKeys: {}, custom: [{
        id: 'stub', provider: 'stub', format: 'openai', tier: 'flagship',
        baseUrl: 'https://stub-gateway.test/v1', model: 'stub-model', keys: ['test-key-aaaaaaaaaa'],
      }],
    }));
    resetProviderConfigState();
    const calls = [];
    const impl = async (url, init) => {
      calls.push({ url: String(url), auth: init?.headers?.Authorization || '' });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
    };
    const result = await testProviderEntry(env, 'stub', { fetchImpl: impl });
    expect(result.body.ok).toBe(true);
    expect(result.body.sample).toBe('OK');
    expect(result.body.model).toBe('stub-model');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('https://stub-gateway.test/v1/chat/completions');
    expect(calls[0].auth).toBe('Bearer test-key-aaaaaaaaaa');
    expect(JSON.stringify(result.body)).not.toContain('test-key-aaaa');
  });

  it('a provider failure is reported with its kind, and the message never carries key material', async () => {
    const env = makeEnv();
    env.USER_PROGRESS.store.set('ai-provider-config', JSON.stringify({
      version: 1, updated_at: 1, disabledDefaults: [],
      defaultsKeys: {}, custom: [{
        id: 'bad', provider: 'bad', format: 'openai', tier: 'flagship',
        baseUrl: 'https://bad-gateway.test/v1', model: 'bad-model', keys: ['invalid-key-aaaaaaaaa'],
      }],
    }));
    resetProviderConfigState();
    const impl = async () => new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 });
    const result = await testProviderEntry(env, 'bad', { fetchImpl: impl });
    expect(result.body.ok).toBe(false);
    expect(result.body.kind).toBe('invalid_key');
    expect(String(result.body.message)).not.toContain('invalid-key-aaaa');
  });
});

