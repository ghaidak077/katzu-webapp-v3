import { describe, expect, it } from 'vitest';
import worker from '../cloudflare-unified-worker';

/**
 * The memory engine's schedule is the one thing the app cannot rebuild if it is
 * lost: IndexedDB is per-browser, so a device change or cleared storage used to
 * start the learner's memory from zero — silently, and exactly when the app
 * claimed to remember them. These tests pin the guarantees of the sync route
 * that fixes it: the merge rule, per-account isolation, and the fact that client
 * rows are validated rather than trusted.
 */

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) || null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

const USER_A = { sub: 'review-user-a', email: 'a@test.dev' };
const USER_B = { sub: 'review-user-b', email: 'b@test.dev' };

/** Seeds the KV session records /auth/session would create, so no D1 is needed. */
async function makeEnv(accounts: Array<{ sub: string; email: string }> = []) {
  const env: any = { USER_PROGRESS: new MemoryKv(), REDEEMED_CODES: new MemoryKv() };
  for (const account of accounts) {
    await env.USER_PROGRESS.put(`session:sess_${account.sub}`, JSON.stringify({
      sub: account.sub,
      email: account.email,
      created_at: Date.now(),
      expires_at: Date.now() + 3600_000,
    }));
  }
  return env;
}

function reviewItem(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    kind: 'vocab',
    refId: 'vocab:1',
    promptAr: 'قهوة',
    answerDe: 'der Kaffee',
    dueAt: now + 86_400_000,
    intervalDays: 1,
    ease: 2.5,
    reps: 1,
    lapses: 0,
    reviews: 1,
    createdAt: now,
    ...overrides,
  };
}

function sync(body: unknown, env: any, token?: string) {
  return worker.fetch(new Request('https://worker.test/review/sync', {
    method: 'POST',
    headers: token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env as never);
}

describe('review queue sync (/review/sync)', () => {
  it('refuses a request with no credential', async () => {
    const res = await sync({ items: [reviewItem()] }, await makeEnv());
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('missing_id_token');
  });

  it('refuses a revoked or unknown session instead of writing to it', async () => {
    const env = await makeEnv([USER_A]);
    const res = await sync({ items: [reviewItem()] }, env, 'sess_never_issued');
    expect((await res.json() as { error: string }).error).toBe('invalid_id_token');
    expect(await env.USER_PROGRESS.get(`review:${USER_A.sub}`)).toBeNull();
  });

  it('stores the learner queue and returns the merged result', async () => {
    const env = await makeEnv([USER_A]);
    const res = await sync({ items: [reviewItem()] }, env, `sess_${USER_A.sub}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; updated_at: number; items: any[] };
    expect(body.success).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].refId).toBe('vocab:1');

    const stored = JSON.parse(await env.USER_PROGRESS.get(`review:${USER_A.sub}`) as string);
    expect(stored.items[0].answerDe).toBe('der Kaffee');
    expect(stored.updated_at).toBeGreaterThan(0);
  });

  it('drops rows the scheduler could never have produced', async () => {
    const env = await makeEnv([USER_A]);
    const res = await sync({
      items: [
        reviewItem({ kind: 'listening' }), // not a kind the client model has
        reviewItem({ answerDe: '   ' }), // nothing to answer
        reviewItem({ promptAr: '' }), // nothing to ask
        null,
        'not-an-object',
      ],
    }, env, `sess_${USER_A.sub}`);
    const body = await res.json() as { items: any[] };
    expect(body.items).toEqual([]);
  });

  it('keeps the more advanced copy when a second device uploads a stale one', async () => {
    const env = await makeEnv([USER_A]);
    const graded = reviewItem({ dueAt: Date.now() + 7 * 86_400_000, intervalDays: 7, reps: 2, reviews: 2, lastReviewedAt: Date.now() });
    await sync({ items: [graded] }, env, `sess_${USER_A.sub}`);

    // The other device never graded it: uploading its copy must not undo the schedule.
    const stale = reviewItem();
    const res = await sync({ items: [stale] }, env, `sess_${USER_A.sub}`);
    const merged = await res.json() as { items: any[] };
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].intervalDays).toBe(7);
    expect(merged.items[0].reviews).toBe(2);
  });

  it('gives a device that has never synced the stored queue back', async () => {
    const env = await makeEnv([USER_A]);
    await sync({ items: [reviewItem({ refId: 'vocab:9' }), reviewItem({ refId: 'vocab:8' })] }, env, `sess_${USER_A.sub}`);

    // A fresh phone: an empty local queue still returns everything on the server.
    const res = await sync({ items: [] }, env, `sess_${USER_A.sub}`);
    const body = await res.json() as { items: any[] };
    expect(body.items.map((i) => i.refId).sort()).toEqual(['vocab:8', 'vocab:9']);
  });

  it('never mixes two learners, and cannot be pointed at another account', async () => {
    const env = await makeEnv([USER_A, USER_B]);
    await sync({ items: [reviewItem({ refId: 'vocab:a' })] }, env, `sess_${USER_A.sub}`);

    const res = await sync({ items: [], userId: USER_A.sub }, env, `sess_${USER_B.sub}`);
    const body = await res.json() as { items: any[] };
    expect(body.items).toEqual([]);
    const storedA = JSON.parse(await env.USER_PROGRESS.get(`review:${USER_A.sub}`) as string);
    expect(storedA.items[0].refId).toBe('vocab:a');
  });

  it('bounds what it accepts and what it stores', async () => {
    const env = await makeEnv([USER_A]);
    const many = Array.from({ length: 600 }, (_, i) => reviewItem({ refId: `vocab:${i}` }));
    const res = await sync({ items: many }, env, `sess_${USER_A.sub}`);
    const body = await res.json() as { items: any[] };
    expect(body.items.length).toBe(500);

    const long = await sync({ items: [reviewItem({ refId: 'vocab:long', answerDe: 'x'.repeat(600) })] }, env, `sess_${USER_A.sub}`);
    const capped = await long.json() as { items: any[] };
    const stored = capped.items.find((i) => i.refId === 'vocab:long');
    expect(stored.answerDe.length).toBe(300);
  });

  it('does not let a corrupt stored value block the learner', async () => {
    const env = await makeEnv([USER_A]);
    await env.USER_PROGRESS.put(`review:${USER_A.sub}`, '{not json');

    const res = await sync({ items: [reviewItem()] }, env, `sess_${USER_A.sub}`);
    expect(res.status).toBe(200);
    expect((await res.json() as { items: any[] }).items).toHaveLength(1);
  });
});
