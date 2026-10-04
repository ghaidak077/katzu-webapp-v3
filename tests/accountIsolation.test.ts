import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, wipeUserScopedData } from '@/lib/db/katzuDb';
import { WorkerClient } from '@/lib/api/workerClient';
import type { UserEntity } from '@/types/models';

const client = new WorkerClient('https://worker.test');
const payload = { stats: {}, trainings: [], saved_word_ids: [], mistakes: [], session_summaries: [] };

async function signIn(account: string) {
  await db.users.put({
    id: 'current_user', accountId: account, email: `${account}@example.test`, displayName: account,
    sessionToken: `sess_${account}`, isLoggedIn: true, subscriptionExpiresAt: null,
    isSubscriptionActive: false, lastCheckedAt: 0, updatedAt: 0, cefrLevel: 'A1',
    streakDays: 0, lastActiveDate: '', totalXp: 0, speechSpeed: 1, sarcasmLevel: 'SASSY',
    freeSessionsRemaining: 3, dailyGoalMinutes: 15, weeklyGoalDays: 5,
  } as UserEntity);
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  await signIn('a');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('account-owned offline work', () => {
  it('never sends A’s queue or an unowned legacy payload using B’s token', async () => {
    await db.sync_queue.bulkAdd([
      { ownerAccountId: 'a', payload, createdAt: 0, attempts: 0, nextRetryAt: 0 },
      { payload, createdAt: 0, attempts: 0, nextRetryAt: 0 },
    ]);
    await wipeUserScopedData();
    await signIn('b');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await client.flushPendingSync();
    expect(fetch).not.toHaveBeenCalled();
    expect(await db.sync_queue.count()).toBe(2);
  });

  it('keeps A’s work recoverable and replays it only when A signs in again', async () => {
    await db.sync_queue.add({ ownerAccountId: 'a', payload, createdAt: 0, attempts: 0, nextRetryAt: 0 });
    await wipeUserScopedData();
    await signIn('a');
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ success: true, rev: 1 })));
    vi.stubGlobal('fetch', fetch);
    await client.flushPendingSync();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer sess_a' });
    expect(await db.sync_queue.count()).toBe(0);
  });

  it('replays a verified-email owner alias after subject-based sign-in', async () => {
    await db.sync_queue.add({ ownerAccountId: 'email:a@example.test', payload, createdAt: 0, attempts: 0, nextRetryAt: 0 });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    vi.stubGlobal('fetch', fetch);
    await client.flushPendingSync();
    expect(fetch).toHaveBeenCalledOnce();
    expect(await db.sync_queue.count()).toBe(0);
  });

  it('removes derived account memory with the rest of the active learner data', async () => {
    await db.memory_patterns.put({ patternId: 'a-pattern', kind: 'mistake', labelAr: 'اختبار', count: 1, lastSeenAt: 0, updatedAt: 0 });
    await wipeUserScopedData();
    expect(await db.memory_patterns.count()).toBe(0);
    expect((await db.users.get('current_user'))?.isLoggedIn).toBe(false);
  });

  it('does not adopt a delayed A restore after switching to B', async () => {
    let deliver!: (response: Response) => void;
    let started!: () => void;
    const requested = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => { started(); return new Promise<Response>((resolve) => { deliver = resolve; }); }));
    const restoring = client.restoreProgress('sess_a');
    await requested;
    await wipeUserScopedData();
    await signIn('b');
    deliver(new Response(JSON.stringify({ stats: { level: 'B2', total_points: 500, updated_at: 100 }, rev: 99 })));
    expect(await restoring).toBe(false);
    expect((await db.users.get('current_user'))?.cefrLevel).toBe('A1');
    expect((await db.users.get('current_user'))?.syncRev).toBeUndefined();
  });

  it('does not adopt or clear a delayed sync acknowledgement after account changes', async () => {
    await db.sync_queue.add({ ownerAccountId: 'a', payload, createdAt: 0, attempts: 0, nextRetryAt: 0 });
    let deliver!: (response: Response) => void;
    let started!: () => void;
    const requested = new Promise<void>((resolve) => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => { started(); return new Promise<Response>((resolve) => { deliver = resolve; }); }));
    const flushing = client.flushPendingSync('sess_a');
    await requested;
    await wipeUserScopedData();
    await signIn('b');
    deliver(new Response(JSON.stringify({ success: true, rev: 99, daily: { totalXp: 500 } })));
    await flushing;
    expect((await db.users.get('current_user'))?.totalXp).toBe(0);
    expect((await db.users.get('current_user'))?.syncRev).toBeUndefined();
    expect(await db.sync_queue.count()).toBe(1);
  });
});
