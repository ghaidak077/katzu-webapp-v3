import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { WorkerClient } from '../src/lib/api/workerClient';

/**
 * B5 — offline audit of the /app/* routes, as unit evidence.
 *
 * The audit traced every authenticated route's data path and pinned the
 * offline contract each one must keep:
 *
 *  | route | data source | offline behaviour |
 *  |---|---|---|
 *  | /app/trail | Dexie (scenarios, training, review) | mission computed locally; `no_content` mission names review as the way forward |
 *  | /app/library | Dexie | local rows only |
 *  | /app/review | Dexie review_items | graded locally; cloud sync failure swallowed, queue stays local |
 *  | /app/listen | Dexie + best-effort detail fetch | per-scenario fetch `.catch(() => null)`, drill built from cache |
 *  | /app/write | worker check-writing | network failure returns `{ ok:false, code:'NETWORK_ERROR', error: Arabic }`, text preserved |
 *  | /app/coach | Dexie (mistakes, review, sessions) | local rows only |
 *  | scenario/live | worker /ai/turn | state machine: Arabic retryable error, sentence kept, typed path open (see networkDropRecording.test.ts) |
 *  | /session-report | local summary + Dexie | session summary persisted in sessionStorage before navigation |
 *
 * These tests exercise the two paths the DOM cannot prove: a failing network
 * must never throw past the client boundary, and a failed progress sync must
 * land in the durable queue and flush on a later success.
 */

const mockBaseUrl = 'https://mock-worker.test';

async function seedUser(token = 'sess_testtoken'): Promise<void> {
  const { db } = await import('../src/lib/db/katzuDb');
  await db.users.put({
    id: 'current_user',
    email: 'learner@test.example',
    displayName: 'Learner',
    sessionToken: token,
    isLoggedIn: true,
    subscriptionExpiresAt: null,
    isSubscriptionActive: false,
    lastCheckedAt: Date.now(),
    cefrLevel: 'A1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as never);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await seedUser();
});

afterEach(async () => {
  const { db } = await import('../src/lib/db/katzuDb');
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('offline /app/* routes: the network can fail without breaking any of them', () => {
  it('check-writing (the /app/write path) fails soft with an Arabic message and no throw', async () => {
    const client = new WorkerClient(mockBaseUrl);
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await client.checkWriting({
      text: 'Ich möchte einen Termin vereinbaren.',
      taskType: 'short_message',
      cefrLevel: 'A1',
      scenarioTitle: 'Arztbesuch',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NETWORK_ERROR');
      expect(result.error).toMatch(/[\u0600-\u06FF]/);
      expect(result.error).toContain('محفوظ'); // the text is not lost
    }
  });

  it('a failed progress sync queues durably and flushes on the next success', async () => {
    const { db } = await import('../src/lib/db/katzuDb');
    const client = new WorkerClient(mockBaseUrl);

    // Network down: sync fails, payload is queued, no throw.
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      client.syncProgress('sess_testtoken'),
    ).resolves.toBe(false);
    const queued = await db.sync_queue.toArray();
    expect(queued.length).toBe(1);
    expect(queued[0].attempts).toBe(0);

    // Network back: a fresh sync succeeds and flushes the queue.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    await expect(client.syncProgress('sess_testtoken')).resolves.toBe(true);
    expect(await db.sync_queue.toArray()).toHaveLength(0);
  });

  it('a failed review-queue sync returns false without throwing (queue stays local)', async () => {
    const client = new WorkerClient(mockBaseUrl);
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(client.syncReviewQueue('sess_testtoken')).resolves.toBe(false);
  });

  it('restoreProgress does not throw when the network is down', async () => {
    const client = new WorkerClient(mockBaseUrl);
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(client.restoreProgress('sess_testtoken')).resolves.toBe(false);
  });

  it('repeated failures keep queueing and nothing is lost; one success flushes everything', async () => {
    const { db } = await import('../src/lib/db/katzuDb');
    const client = new WorkerClient(mockBaseUrl);
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await client.syncProgress('sess_testtoken');
    await client.syncProgress('sess_testtoken');
    // Each failed sync enqueues its payload; the server-side merge is idempotent
    // (sync_id dedupe, tests/sync.test.ts), so duplicates are safe. The learner's
    // data is what must never be lost.
    const queued = await db.sync_queue.toArray();
    expect(queued.length).toBe(2);
    // Payloads carry a fresh updated_at each attempt; equality is structural.
    expect(queued[1].payload.scenario_trainings).toEqual(queued[0].payload.scenario_trainings);
    expect(queued[1].payload.mistakes).toEqual(queued[0].payload.mistakes);
    expect(queued[1].payload.session_summaries).toEqual(queued[0].payload.session_summaries);

    // One successful sync flushes every pending entry.
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await expect(client.syncProgress('sess_testtoken')).resolves.toBe(true);
    expect(await db.sync_queue.toArray()).toHaveLength(0);
  });
});
