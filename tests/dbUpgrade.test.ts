import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * The v5 → v6 upgrade path (V21 Phase 3): a browser holding the v5 database
 * from the previously deployed bundle, then opening the new bundle. The one
 * rule is additive-ness — every existing row survives untouched, and the only
 * visible change is the new, EMPTY memory table. A real IndexedDB is built at
 * v5 first; the app's database module is imported only afterwards.
 */

const DB_NAME = 'KatzuWebDB';

/** The schema exactly as the currently deployed version (v5) declared it. */
async function createLegacyV5Database() {
  const legacy = new Dexie(DB_NAME);
  legacy.version(5).stores({
    scenarios: 'id, category',
    starter_phrases: 'id, scenario_id, level, sort_order',
    vocabulary: 'id, level, topic, part_of_speech',
    grammar: 'id, level',
    saved_words: 'wordId, savedAt',
    users: 'id, email',
    redeemed_codes: 'code, redeemedAt',
    sessions: 'id, scenarioId, cefrLevel, timestamp, updatedAt',
    scenario_training: 'scenarioId, userId, updatedAt',
    mistakes: '++id, userId, scenarioId, syncId, timestamp, wasHintUsed, updatedAt',
    sync_queue: '++id, createdAt, nextRetryAt',
    review_items: '++id, userId, dueAt, kind, refId, [kind+refId]',
    skill_practice: '++id, userId, skill, at',
  });
  await legacy.open();

  await legacy.table('users').put({
    id: 'current_user',
    email: 'learner@example.com',
    displayName: 'متعثرة كَاتْزُو',
    isLoggedIn: true,
    sessionToken: 'sess_existing',
    subscriptionExpiresAt: null,
    isSubscriptionActive: false,
    lastCheckedAt: 1,
    updatedAt: 1,
    cefrLevel: 'A0',
    streakDays: 6,
    lastActiveDate: '2026-09-29',
    totalXp: 890,
    speechSpeed: 0.85,
    sarcasmLevel: 'GENTLE',
    freeSessionsRemaining: 0,
    dailyGoalMinutes: 15,
    weeklyGoalDays: 5,
    primaryGoal: 'work',
  });
  await legacy.table('mistakes').bulkPut([
    {
      userId: 'current_user',
      scenarioId: 'cafe_order',
      original: 'Ich möchte ein Kaffee',
      corrected: 'Ich möchte einen Kaffee',
      grammarRule: 'Akkusativ',
      timestamp: 1_700_000_000_000,
      wasHintUsed: false,
      syncId: 'current_user:cafe_order:1700000000000:Ich möchte ein Kaffee',
      updatedAt: 1_700_000_000_000,
    },
    {
      userId: 'current_user',
      scenarioId: 'airport_arrival',
      original: 'Wo ist die Koffer',
      corrected: 'Wo ist mein Koffer',
      grammarRule: 'Possessiv',
      timestamp: 1_700_000_500_000,
      wasHintUsed: true,
      syncId: 'current_user:airport_arrival:1700000500000:Wo ist die Koffer',
      updatedAt: 1_700_000_500_000,
    },
  ]);
  await legacy.table('sessions').put({
    id: 'sess_upgrade_probe',
    scenarioId: 'cafe_order',
    scenarioTitle: 'في المقهى',
    cefrLevel: 'A0',
    sentencesSpoken: 4,
    wordsLearned: 16,
    accuracyPercent: 75,
    durationSeconds: 320,
    timestamp: 1_700_000_600_000,
  });
  await legacy.table('review_items').bulkPut([
    {
      userId: 'current_user',
      kind: 'mistake',
      refId: 'mistake:1',
      promptAr: 'أكمل',
      answerDe: 'Ich möchte einen Kaffee',
      dueAt: 1_700_100_000_000,
      intervalDays: 1,
      ease: 2.5,
      reps: 1,
      lapses: 0,
      reviews: 1,
      createdAt: 1_700_000_000_000,
    },
  ]);

  legacy.close();
}

beforeEach(async () => {
  // A fresh browser profile for every case.
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
});

describe('v5 → v6 upgrade (long memory, additive)', () => {
  it('keeps every existing row and adds the empty memory table', async () => {
    await createLegacyV5Database();

    // Imported only now, so the module opens against the legacy database.
    const { db } = await import('@/lib/db/katzuDb');
    await db.open();

    expect(db.tables.map((table) => table.name)).toContain('memory_patterns');
    expect(await db.memory_patterns.count()).toBe(0);

    const user = await db.users.get('current_user');
    expect(user?.totalXp).toBe(890);
    expect(user?.streakDays).toBe(6);
    expect(user?.cefrLevel).toBe('A0');
    expect(user?.primaryGoal).toBe('work');
    expect(user?.sessionToken).toBe('sess_existing');

    const mistakes = await db.mistakes.toArray();
    expect(mistakes).toHaveLength(2);
    expect(mistakes.map((mistake) => mistake.grammarRule).sort()).toEqual(['Akkusativ', 'Possessiv']);

    const session = await db.sessions.get('sess_upgrade_probe');
    expect(session?.accuracyPercent).toBe(75);
    expect(session?.sentencesSpoken).toBe(4);

    const reviewItems = await db.review_items.toArray();
    expect(reviewItems).toHaveLength(1);

    // A v6-era preference is optional: old rows lack it and keep working.
    expect(user?.profession).toBeUndefined();
  });

  it('lets the derived memory rebuild from the preserved sources after the upgrade', async () => {
    await createLegacyV5Database();

    const { db } = await import('@/lib/db/katzuDb');
    await db.open();

    const { rebuildMemoryPatterns } = await import('@/lib/memory/patterns');
    await rebuildMemoryPatterns();

    const patterns = await db.memory_patterns.toArray();
    expect(patterns.length).toBeGreaterThanOrEqual(2);
    expect(patterns.map((pattern) => pattern.kind).sort()).toEqual(['mistake', 'mistake']);
    const akkusativ = patterns.find((pattern) => pattern.german === 'Ich möchte einen Kaffee');
    expect(akkusativ?.count).toBe(1);
    expect(akkusativ?.lastSeenAt).toBe(1_700_000_000_000);
  });
});
