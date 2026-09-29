import { describe, expect, it, beforeEach } from 'vitest';
import { handleAdminRoutes } from '../cloudflare-admin';
import { FakeD1 } from './helpers/fakeD1';

/**
 * The rowid-keyed content edit path.
 *
 * Why it exists: `/admin/upload` only INSERTs into `vocabulary` /
 * `starter_phrases` (neither has a unique key, so there is no ON CONFLICT clause
 * to fall back on). Re-uploading a corrected row therefore duplicated the
 * headword and handed the quiz two identical options. `/admin/api/content-update`
 * is the missing edit path: keyed by the row's identity, column-allowlisted from
 * DB_SCHEMA, admin-authenticated, no schema change. The studio's own suite covers
 * bulk upload and sync mode; this file pins the single-row edit.
 */

// ≥24 chars: the admin gate now fails closed on too-short secrets (S9 hardening).
const SECRET = 'test-admin-secret-0123456789';

function adminRequest(path: string, init: RequestInit = {}) {
  return new Request(`https://katzu.test${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}`, ...(init.headers || {}) },
  });
}

async function callRoute(env: { DB: FakeD1; ADMIN_SECRET: string }, path: string, init?: RequestInit) {
  const url = new URL(`https://katzu.test${path}`);
  const res = await handleAdminRoutes(url, adminRequest(path, init), env as never, {});
  if (!res) throw new Error(`route not handled: ${path}`);
  return { status: res.status, body: await res.json() };
}

function seedVocab(db: FakeD1) {
  db.seed('vocabulary', [
    { german: 'einreichen', article: null, translation_ar: 'يقدّم', level: 'B1', topic: 'documents' },
    { german: 'vorlegen', article: null, translation_ar: 'يُبرز / يقدّم', level: 'B2', topic: 'documents' },
    { german: 'Termin', article: 'der', translation_ar: 'موعد', level: 'A1', topic: 'documents' },
  ]);
}

describe('admin content edit route', () => {
  let db: FakeD1;
  let env: { DB: FakeD1; ADMIN_SECRET: string };

  beforeEach(() => {
    db = new FakeD1();
    seedVocab(db);
    env = { DB: db, ADMIN_SECRET: SECRET };
  });

  it('lists rows with their rowid and filters by topic and text', async () => {
    const all = await callRoute(env, '/admin/api/content-list?type=vocabulary');
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(3);
    // Default order is level → topic → rowid, so the A1 row leads.
    expect(all.body.rows[0].id).toBe(3);

    const filtered = await callRoute(env, '/admin/api/content-list?type=vocabulary&topic=documents&q=vorlegen');
    expect(filtered.body.count).toBe(1);
    expect(filtered.body.rows[0].german).toBe('vorlegen');
  });

  it('rejects an unknown content type and missing auth', async () => {
    const bad = await callRoute(env, '/admin/api/content-list?type=users');
    expect(bad.status).toBe(400);
    expect(bad.body.allowed).toEqual(['scenarios', 'vocabulary', 'grammar', 'starter_phrases']);

    const url = new URL('https://katzu.test/admin/api/content-list?type=vocabulary');
    const unauth = await handleAdminRoutes(url, new Request(url.toString()), env as never, {});
    expect(unauth?.status).toBe(401);
  });

  it('updates a gloss by rowid and returns the re-read row', async () => {
    const res = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({ type: 'vocabulary', updates: [{ id: 1, fields: { translation_ar: 'يقدّم طلباً' } }] }),
    });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(res.body.rows[0]).toMatchObject({ id: 1, german: 'einreichen', translation_ar: 'يقدّم طلباً' });
    // and it is really persisted
    expect(db.snapshot('vocabulary')[0].translation_ar).toBe('يقدّم طلباً');
  });

  it('refuses unknown columns, bad ids and invalid levels without writing', async () => {
    const column = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({ type: 'vocabulary', updates: [{ id: 1, fields: { german: 'x', bogus: 'y' } }] }),
    });
    expect(column.status).toBe(400);
    expect(column.body.error).toBe('invalid_columns');

    const id = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({ type: 'vocabulary', updates: [{ id: 0, fields: { translation_ar: 'x' } }] }),
    });
    expect(id.status).toBe(400);
    expect(id.body.error).toBe('invalid_id');

    const level = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({ type: 'vocabulary', updates: [{ id: 1, fields: { level: 'C1' } }] }),
    });
    expect(level.status).toBe(400);
    expect(level.body.error).toBe('invalid_level');

    const empty = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({ type: 'vocabulary', updates: [] }),
    });
    expect(empty.status).toBe(400);

    expect(db.snapshot('vocabulary')[0].translation_ar).toBe('يقدّم');
  });

  it('edits starter phrases too (level validation shared)', async () => {
    db.seed('starter_phrases', [
      { scenario_id: 'cafe_order', german: 'Ich möchte einen Kaffee, bitte.', translation_ar: 'أريد قهوة من فضلك.', level: 'A1', sort_order: 1 },
    ]);
    const res = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({
        type: 'starter_phrases',
        updates: [{ id: 1, fields: { translation_ar: 'أريد قهوة لو سمحت.' } }],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.body.rows[0].translation_ar).toBe('أريد قهوة لو سمحت.');
    // vocabulary columns are not valid on starter_phrases
    const wrong = await callRoute(env, '/admin/api/content-update', {
      method: 'POST',
      body: JSON.stringify({ type: 'starter_phrases', updates: [{ id: 1, fields: { topic: 'food' } }] }),
    });
    expect(wrong.status).toBe(400);
  });
});

/**
 * V9-2 — the admin gate must record its failures.
 *
 * `cloudflare-admin.js` keeps its own copy of the bearer-secret gate because a
 * back-import of the worker's would be a module cycle (it imports from
 * cloudflare-crypto.js, which imports back from here). That copy never called the
 * worker's `recordAdminAuthFailure`, so `/admin/api/*` answered 401 forever with
 * no counter written and the per-IP lockout (5 failures / 15 min) could never
 * engage — the dashboard's data endpoints were the one unthrottled /admin*
 * surface. The worker now injects the recorder; these tests pin the contract.
 */
describe('admin gate records failures through the injected recorder', () => {
  let env: { DB: FakeD1; ADMIN_SECRET: string };

  beforeEach(() => {
    env = { DB: new FakeD1(), ADMIN_SECRET: SECRET };
  });

  it('records a failure on a wrong secret and still answers 401', async () => {
    const url = new URL('https://katzu.test/admin/api/content-list?type=vocabulary');
    const calls: unknown[] = [];
    const res = await handleAdminRoutes(
      url,
      // A length-mismatched header as well: the gate normalizes lengths before
      // comparing, so this must take the same "wrong secret" path, not bail early.
      new Request(url, { headers: { Authorization: 'Bearer short' } }),
      env as never,
      {},
      {
        recordAdminAuthFailure: async (...args: unknown[]) => {
          calls.push(args);
        },
      },
    );
    expect(res?.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it('does not record anything on a successful auth', async () => {
    const url = new URL('https://katzu.test/admin/api/content-list?type=vocabulary');
    const calls: unknown[] = [];
    const res = await handleAdminRoutes(url, adminRequest('/admin/api/content-list?type=vocabulary'), env as never, {}, {
      recordAdminAuthFailure: async () => {
        calls.push(1);
      },
    });
    expect(res?.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it('uses the injected full-ledger ensure instead of the registry-only default', async () => {
    const url = new URL('https://katzu.test/admin/api/content-list?type=vocabulary');
    const ensured: string[] = [];
    const res = await handleAdminRoutes(url, adminRequest('/admin/api/content-list?type=vocabulary'), env as never, {}, {
      ensureTables: async () => {
        ensured.push('ledger');
        return true;
      },
    });
    expect(res?.status).toBe(200);
    expect(ensured).toEqual(['ledger']);
  });
});
