import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, {
  INTERNAL_TOKEN_KV_KEY,
  generateInternalToken,
  getOrCreateInternalToken,
  proxyToApi,
  readInternalToken,
} from '../admin-worker/src/worker';
import { resetAccessCerts } from '../admin-worker/src/access';

/**
 * The panel Worker is three doors: configured, authenticated, proxied. These
 * tests drive the real `fetch` handler with real signed tokens and a fake
 * Service Binding, so a regression in any door reddens here rather than in
 * production.
 */

const TEAM = 'katzu-test.cloudflareaccess.com';
const AUD = 'aud-' + 'b'.repeat(32);
const ISS = `https://${TEAM}`;
const KID = 'panel-key-1';

function b64url(bytes: Uint8Array | string): string {
  const buffer = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let binary = '';
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let privateKey: CryptoKey;
let publicJwk: JsonWebKey;

async function makeKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
}

async function accessToken(overrides: Record<string, unknown> = {}) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iss: ISS, aud: AUD, exp: now + 300, iat: now - 5, ...overrides }));
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(new Uint8Array(signature))}`;
}

function accessEnv(extra: Record<string, unknown> = {}) {
  return { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ...extra };
}

function stubCerts(keys: JsonWebKey[]) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })));
}

/** Minimal KV standing in for the shared USER_PROGRESS namespace. */
function fakeKv(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
  };
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://panel.test${path}`, init);
}

beforeEach(async () => {
  resetAccessCerts();
  if (!privateKey) await makeKeys();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('liveness', () => {
  it('answers, without configuration or identity, and carries security headers', async () => {
    const res = await worker.fetch(request('/healthz'), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'katzu-admin' });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});

describe('door 1: configuration', () => {
  it('ships disabled for every page and API call until Access is configured', async () => {
    const api = vi.fn();
    for (const env of [{}, { ACCESS_TEAM_DOMAIN: TEAM }, { ACCESS_AUD: AUD }, { ACCESS_TEAM_DOMAIN: ' ', ACCESS_AUD: AUD }]) {
      for (const path of ['/', '/api/overview']) {
        const res = await worker.fetch(request(path), { ...env, KATZU_API: { fetch: api } });
        expect(res.status).toBe(503);
        expect(await res.text()).toContain('Panel disabled');
        expect(res.headers.get('cache-control')).toBe('no-store');
      }
    }
    expect(api).not.toHaveBeenCalled();
  });
});

describe('door 2: identity', () => {
  it('rejects a missing or invalid assertion before touching the API', async () => {
    stubCerts([{ ...publicJwk, kid: KID }]);
    const api = vi.fn();
    const env = { ...accessEnv(), KATZU_API: { fetch: api }, USER_PROGRESS: fakeKv() };

    const missing = await worker.fetch(request('/api/overview'), env);
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toBe('Bearer');
    expect(await missing.json()).toEqual({ error: 'unauthorized' });

    const malformed = await worker.fetch(
      request('/api/overview', { headers: { 'cf-access-jwt-assertion': 'a.b.c' } }),
      env,
    );
    expect(malformed.status).toBe(401);

    const expired = await worker.fetch(
      request('/', { headers: { 'cf-access-jwt-assertion': await accessToken({ exp: 1 }) } }),
      env,
    );
    expect(expired.status).toBe(401);
    expect(api).not.toHaveBeenCalled();
  });

  it('does not reveal whether configuration or the token was the problem', async () => {
    stubCerts([{ ...publicJwk, kid: KID }]);
    const res = await worker.fetch(request('/api/overview'), accessEnv());
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['error']);
    expect(JSON.stringify(body)).not.toMatch(/configured|audience|reason/i);
  });

  it('serves the panel only to a valid assertion', async () => {
    stubCerts([{ ...publicJwk, kid: KID }]);
    const assets = { fetch: vi.fn(async () => new Response('<html>panel</html>', { headers: { 'content-type': 'text/html' } })) };
    const res = await worker.fetch(
      request('/', { headers: { 'cf-access-jwt-assertion': await accessToken() } }),
      { ...accessEnv(), ASSETS: assets },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('panel');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('answers 503 when assets are not bound rather than serving an error page', async () => {
    stubCerts([{ ...publicJwk, kid: KID }]);
    const res = await worker.fetch(
      request('/', { headers: { cookie: `CF_Authorization=${await accessToken()}` } }),
      accessEnv(),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'assets_unavailable' });
  });
});

describe('door 3: proxy', () => {
  async function authedEnv(api: (req: Request) => Promise<Response>, kv = fakeKv()) {
    return {
      env: { ...accessEnv(), KATZU_API: { fetch: api }, USER_PROGRESS: kv },
      kv,
      headers: { 'cf-access-jwt-assertion': await accessToken() },
    };
  }

  it('rewrites /api to the internal route and never leaks the token to the browser', async () => {
    stubCerts([{ ...publicJwk, kid: KID }]);
    const seen: Request[] = [];
    const { env, kv, headers } = await authedEnv(async (req) => {
      seen.push(req);
      return new Response(JSON.stringify({ ok: true, private: 'internal' }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-internal-only': 'secret' },
      });
    });

    const res = await worker.fetch(request('/api/overview?days=7', { headers }), env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, private: 'internal' });
    expect(seen).toHaveLength(1);
    const forwarded = new URL(seen[0].url);
    expect(forwarded.pathname).toBe('/internal/admin/overview');
    expect(forwarded.search).toBe('?days=7');

    const token = kv.store.get(INTERNAL_TOKEN_KV_KEY)!;
    expect(token.startsWith('ika_')).toBe(true);
    expect(seen[0].headers.get('authorization')).toBe(`Bearer ${token}`);
    // The browser response must not carry the internal token or internal headers.
    expect(res.headers.get('authorization')).toBeNull();
    expect(res.headers.get('x-internal-only')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('forwards method, body and content-type for writes', async () => {
    stubCerts([{ ...publicJwk, kid: KID }]);
    const seen: Request[] = [];
    const { env, headers } = await authedEnv(async (req) => {
      seen.push(req);
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const res = await worker.fetch(
      request('/api/conversations/conv_1/flag', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ flagged: true }),
      }),
      env,
    );

    expect(res.status).toBe(200);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].headers.get('content-type')).toBe('application/json');
    expect(await seen[0].text()).toBe('{"flagged":true}');
  });

  it('re-reads the token once when the product Worker answers 401', async () => {
    stubCerts([{ ...publicJwk, kid: KID }]);
    const kv = fakeKv({ [INTERNAL_TOKEN_KV_KEY]: 'ika_stale' });
    const bearers: string[] = [];
    const { env, headers } = await authedEnv(async (req) => {
      const bearer = req.headers.get('authorization') || '';
      bearers.push(bearer);
      if (bearer === 'Bearer ika_stale') {
        kv.store.set(INTERNAL_TOKEN_KV_KEY, 'ika_rotated');
        return new Response('{"error":"unauthorized"}', { status: 401 });
      }
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    }, kv);

    const res = await worker.fetch(request('/api/health', { headers }), env);
    expect(res.status).toBe(200);
    expect(bearers).toEqual(['Bearer ika_stale', 'Bearer ika_rotated']);
  });

  it('passes a second 401 through as a real refusal', async () => {
    stubCerts([{ ...publicJwk, kid: KID }]);
    const api = vi.fn(async () => new Response('{"error":"unauthorized"}', { status: 401 }));
    const { env, headers } = await authedEnv(api);
    const res = await worker.fetch(request('/api/health', { headers }), env);
    expect(res.status).toBe(401);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('answers 502 when the Service Binding throws and 503 when no token can exist', async () => {
    stubCerts([{ ...publicJwk, kid: KID }]);
    const down = await authedEnv(async () => { throw new Error('binding_down'); });
    const downRes = await worker.fetch(request('/api/health', { headers: down.headers }), down.env);
    expect(downRes.status).toBe(502);
    expect(await downRes.json()).toEqual({ error: 'api_unreachable' });

    const brokenKv = { get: vi.fn(async () => { throw new Error('kv_down'); }), put: vi.fn(async () => { throw new Error('kv_down'); }) };
    const { env, headers } = await authedEnv(async () => new Response('{}'), brokenKv as never);
    const noToken = await worker.fetch(request('/api/health', { headers }), env);
    expect(noToken.status).toBe(503);
    expect(await noToken.json()).toEqual({ error: 'internal_token_unavailable' });
  });
});

describe('internal token', () => {
  it('is random, prefixed and created exactly once', async () => {
    const a = generateInternalToken();
    const b = generateInternalToken();
    expect(a).toMatch(/^ika_[0-9a-f]{64}$/);
    expect(a).not.toBe(b);

    const kv = fakeKv();
    const first = await getOrCreateInternalToken({ USER_PROGRESS: kv });
    expect(first).toBe(kv.store.get(INTERNAL_TOKEN_KV_KEY));
    const second = await getOrCreateInternalToken({ USER_PROGRESS: kv });
    expect(second).toBe(first);
    expect(kv.put).toHaveBeenCalledTimes(1);
  });

  it('reads empty rather than throwing when KV is unavailable', async () => {
    expect(await readInternalToken({})).toBe('');
    expect(await readInternalToken({ USER_PROGRESS: { get: async () => { throw new Error('x'); } } })).toBe('');
    expect(await getOrCreateInternalToken({})).toBe('');
  });

  it('does not call the API when there is no token to send', async () => {
    const api = vi.fn();
    const res = await proxyToApi(
      request('/api/overview'),
      { KATZU_API: { fetch: api } },
      new URL('https://panel.test/api/overview'),
    );
    expect(res.status).toBe(503);
    expect(api).not.toHaveBeenCalled();
  });
});
