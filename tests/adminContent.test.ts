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

const SECRET = 'test-admin-secret';

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
