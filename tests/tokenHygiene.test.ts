import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Dexie layer: token-hygiene tests assert credential handling, not DB.
const mockUsersGet = vi.fn();
const mockUsersUpdate = vi.fn();
vi.mock('../src/lib/db/katzuDb', () => ({
  db: {
    users: {
      get: (...args: unknown[]) => mockUsersGet(...args),
      update: (...args: unknown[]) => mockUsersUpdate(...args),
    },
    scenarios: { bulkPut: vi.fn(), toArray: vi.fn(async () => []) },
    starter_phrases: { bulkPut: vi.fn(), toArray: vi.fn(async () => []) },
    vocabulary: { bulkPut: vi.fn(), toArray: vi.fn(async () => []) },
    grammar: { bulkPut: vi.fn(), toArray: vi.fn(async () => []) },
    scenario_training: { toArray: vi.fn(async () => []), bulkPut: vi.fn() },
    saved_words: { toArray: vi.fn(async () => []) },
    mistakes: { toArray: vi.fn(async () => []) },
    sessions: { toArray: vi.fn(async () => []) },
    sync_queue: { add: vi.fn(), where: vi.fn(), delete: vi.fn(), update: vi.fn() },
  },
  wipeUserScopedData: vi.fn(),
  initializeDatabaseSeed: vi.fn(),
}));

vi.mock('../src/utils/diagnostics', () => ({
  logEvent: vi.fn(),
  logError: vi.fn(),
  logNetwork: vi.fn(),
}));

import { WorkerClient } from '../src/lib/api/workerClient';
import worker from '../cloudflare-unified-worker';

const SESSION = 'sess_abc123def456';

describe('Token hygiene — client (Phase 1.1b)', () => {
  let client: WorkerClient;

  beforeEach(() => {
    client = new WorkerClient('https://mock-worker.test');
    vi.clearAllMocks();
  });

  it('never falls back to a raw Google ID token: stored idToken is ignored', async () => {
    mockUsersGet.mockResolvedValue({ sessionToken: undefined, idToken: 'RAW_GOOGLE_ID_TOKEN' });
    expect(await client.getEffectiveAuthToken()).toBe('');
  });

  it('returns the stored session token', async () => {
    mockUsersGet.mockResolvedValue({ sessionToken: SESSION });
    expect(await client.getEffectiveAuthToken()).toBe(SESSION);
  });

  it('refuses explicitly-injected raw Google ID tokens (session tokens only)', async () => {
    expect(await client.getEffectiveAuthToken('RAW_GOOGLE_ID_TOKEN')).toBe('');
    expect(await client.getEffectiveAuthToken(SESSION)).toBe(SESSION);
  });

  it('sends the session token in the Authorization header ONLY (no id_token in body)', async () => {
    mockUsersGet.mockResolvedValue({ sessionToken: SESSION });
    const captured: { url: string; headers: Record<string, string>; body: any }[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      captured.push({ url, headers: options.headers, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ hints: [] }) };
    });

    await client.fetchHints({ scenarioTitle: 'T', cefrLevel: 'A1', lastAiReply: 'Hallo' });
    await client.translateText('Danke');
    await client.checkSubscriptionStatus();
    await client.getReferralInfo();

    for (const c of captured) {
      expect(c.headers['Authorization']).toBe(`Bearer ${SESSION}`);
      expect(c.body.id_token).toBeUndefined();
    }
  });

  it('on 401 it invalidates the session and requires re-auth (no silent retry)', async () => {
    mockUsersGet.mockResolvedValue({ sessionToken: SESSION });
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_id_token', code: 'UNAUTHENTICATED' }),
    }));

    await expect(
      client.sendTurn({
        scenarioId: 's', scenarioTitle: 'T', userMessage: 'Hallo', history: [], cefrLevel: 'A1',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    const lastUpdate = mockUsersUpdate.mock.calls[mockUsersUpdate.mock.calls.length - 1];
    expect(lastUpdate).toEqual(['current_user', { sessionToken: undefined }]);
  });
});

describe('Token hygiene — worker accepts header-only session auth', () => {
  const env = {
    TEST_MODE: true,
    GOOGLE_CLIENT_ID: 'client-id',
    USER_PROGRESS: {
      store: new Map<string, string>(),
      async get(k: string) { return this.store.get(k) ?? null; },
      async put(k: string, v: string) { this.store.set(k, v); },
      async delete(k: string) { this.store.delete(k); },
    },
    REDEEMED_CODES: {
      store: new Map<string, string>(),
      async get(k: string) { return this.store.get(k) ?? null; },
      async put(k: string, v: string) { this.store.set(k, v); },
      async delete(k: string) { this.store.delete(k); },
    },
  };

  const jwt = (sub: string) => {
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    return `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ sub, aud: 'client-id', iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
  };

  it('issues a session via /auth/session, then serves /check-status with the session in the HEADER only', async () => {
    const sessionRes = await worker.fetch(new Request('https://w.test/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: jwt('hygiene-user') }),
    }), env);
    const { session_token: token } = await sessionRes.json() as { session_token: string };
    expect(token).toBeTruthy();

    // Header-only: no id_token anywhere in the body.
    const status = await worker.fetch(new Request('https://w.test/check-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    }), env);
    expect(status.status).toBe(200);
    const data = await status.json() as { active: boolean; reason?: string };
    expect(data).toMatchObject({ active: false }); // authenticated but no subscription record
  });

  it('rejects unauthenticated calls when no credential is presented', async () => {
    const res = await worker.fetch(new Request('https://w.test/check-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }), env);
    expect(res.status).toBe(400); // missing_id_token reason body
  });
});
