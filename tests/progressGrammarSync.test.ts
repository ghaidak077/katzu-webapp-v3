import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/katzuDb';
import { WorkerClient } from '@/lib/api/workerClient';

const grammarReference = {
  id: 'g_articles_a1',
  titleAr: 'أدوات التعريف',
  ruleAr: 'يتغير شكل الأداة.',
  ruleDe: 'Der Artikel ändert sich.',
  exampleDe: 'Ich möchte einen Kaffee.',
};

function progressFixture() {
  return {
    id: 1,
    syncId: 'mistake-1',
    userId: 'current_user',
    scenarioId: 'cafe_order',
    original: 'Ich möchte ein Kaffee',
    corrected: 'Ich möchte einen Kaffee',
    grammarRule: 'Akkusativ',
    grammarId: 'g_articles_a1',
    grammarReference,
    timestamp: 1_700_000_000_000,
    wasHintUsed: false,
  };
}

function minimalUser() {
  return {
    id: 'current_user',
    email: '',
    displayName: 'مستكشف كَاتْزُو',
    isLoggedIn: true,
    subscriptionExpiresAt: null,
    isSubscriptionActive: false,
    lastCheckedAt: Date.now(),
    updatedAt: Date.now(),
    cefrLevel: 'A1' as const,
    streakDays: 0,
    lastActiveDate: '',
    totalXp: 0,
    speechSpeed: 1,
    sarcasmLevel: 'SASSY' as const,
    freeSessionsRemaining: 3,
    dailyGoalMinutes: 15,
    weeklyGoalDays: 5,
    sessionToken: 'sess_progress_test',
  };
}

describe('grammar reference progress sync', () => {
  beforeEach(async () => {
    await db.open();
    await db.users.clear();
    await db.mistakes.clear();
    await db.scenario_training.clear();
    await db.saved_words.clear();
    await db.sessions.clear();
    await db.users.put(minimalUser());
    vi.spyOn(await import('@/lib/db/katzuDb'), 'db', 'get').mockReturnValue(db);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uploads a linked mistake and restores its reference from a server response', async () => {
    await db.mistakes.put(progressFixture());
    let uploaded: any;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      uploaded = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }));

    const client = new WorkerClient('https://worker.test');
    expect(await client.syncProgress('sess_progress_test')).toBe(true);
    expect(uploaded.mistakes[0].grammar_id).toBe('g_articles_a1');
    expect(uploaded.mistakes[0].grammar_reference.title_ar).toBe('أدوات التعريف');

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      stats: { level: 'A1', streak_days: 0, total_points: 0, updated_at: Date.now() },
      trainings: [],
      saved_word_ids: [],
      mistakes: [{
        sync_id: 'mistake-1',
        user_id: 'current_user',
        scenario_id: 'cafe_order',
        original: 'Ich möchte ein Kaffee',
        corrected: 'Ich möchte einen Kaffee',
        grammar_rule: 'Akkusativ',
        grammar_id: 'g_articles_a1',
        grammar_reference: {
          id: 'g_articles_a1',
          title_ar: 'أدوات التعريف',
          rule_ar: 'يتغير شكل الأداة.',
          rule_de: 'Der Artikel ändert sich.',
          example_de: 'Ich möchte einen Kaffee.',
        },
        timestamp: 1_700_000_000_000,
        updated_at: Date.now(),
      }],
      session_summaries: [],
    }), { status: 200 })));
    expect(await client.restoreProgress('sess_progress_test')).toBe(true);
    const restored = await db.mistakes.get(1);
    expect(restored?.grammarId).toBe('g_articles_a1');
    expect(restored?.grammarReference?.titleAr).toBe('أدوات التعريف');
  });

  it('keeps older mistakes without a grammar reference valid and unlinked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      stats: { level: 'A1', streak_days: 0, total_points: 0, updated_at: Date.now() },
      trainings: [],
      saved_word_ids: [],
      mistakes: [{ sync_id: 'legacy-1', scenario_id: 'cafe_order', original: 'x', corrected: 'y', timestamp: 1 }],
      session_summaries: [],
    }), { status: 200 })));

    const client = new WorkerClient('https://worker.test');
    expect(await client.restoreProgress('sess_progress_test')).toBe(true);
    const restored = await db.mistakes.where('syncId').equals('legacy-1').first();
    expect(restored?.grammarId).toBeUndefined();
    expect(restored?.grammarReference).toBeUndefined();
  });
});
