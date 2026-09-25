import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * The upgrade path real learners actually take: a browser holding a v3 database
 * from the previously deployed bundle, then opening the new bundle. This is the
 * one test whose failure mode is silent data loss, so it builds a genuine v3
 * database first and only then imports the app's database module.
 */

const DB_NAME = 'KatzuWebDB';

/** The schema exactly as the previously deployed version declared it. */
async function createLegacyV3Database() {
  const legacy = new Dexie(DB_NAME);
  legacy.version(3).stores({
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
  });
  await legacy.open();

  await legacy.table('users').put({
    id: 'current_user',
    email: 'learner@example.com',
    displayName: 'مستكشف كَاتْزُو',
    isLoggedIn: true,
    sessionToken: 'sess_existing',
    subscriptionExpiresAt: null,
    isSubscriptionActive: false,
    lastCheckedAt: 1,
    updatedAt: 1,
    cefrLevel: 'A2',
    streakDays: 12,
    lastActiveDate: '2026-09-24',
    totalXp: 4321,
    speechSpeed: 1,
    sarcasmLevel: 'SASSY',
    freeSessionsRemaining: 0,
    dailyGoalMinutes: 15,
    weeklyGoalDays: 5,
  });
  await legacy.table('mistakes').put({
    userId: 'current_user',
    scenarioId: 'cafe_order',
    original: 'Ich möchte ein Kaffee',
    corrected: 'Ich möchte einen Kaffee',
    grammarRule: 'Akkusativ',
    timestamp: 1_700_000_000_000,
    wasHintUsed: false,
  });
  await legacy.table('scenario_training').put({
    scenarioId: 'cafe_order',
    userId: 'current_user',
    studiedAt: 1_700_000_000_000,
    quizAttempted: true,
    lastScore: 90,
    effectiveLevel: 'A2',
    updatedAt: 1_700_000_000_000,
  });

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

describe('v3 → v4 upgrade', () => {
  it('keeps every existing row and adds the review queue', async () => {
    await createLegacyV3Database();

    // Imported only now, so the module opens against the legacy database.
    const { db, initializeDatabaseSeed } = await import('@/lib/db/katzuDb');
    await db.open();

    expect(db.tables.map((table) => table.name)).toContain('review_items');

    const user = await db.users.get('current_user');
    expect(user?.totalXp).toBe(4321);
    expect(user?.streakDays).toBe(12);
    expect(user?.cefrLevel).toBe('A2');
    expect(user?.sessionToken).toBe('sess_existing');

    const mistakes = await db.mistakes.toArray();
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0].corrected).toBe('Ich möchte einen Kaffee');

    const training = await db.scenario_training.get('cafe_order');
    expect(training?.lastScore).toBe(90);

    expect(await db.review_items.count()).toBe(0);
  });

  it('does not re-seed over an existing learner when the app boots', async () => {
    await createLegacyV3Database();

    const { db, initializeDatabaseSeed } = await import('@/lib/db/katzuDb');
    await initializeDatabaseSeed();

    // The seed must recognise an existing account and leave its progress alone.
    const user = await db.users.get('current_user');
    expect(user?.totalXp).toBe(4321);
    expect(user?.displayName).toBe('مستكشف كَاتْزُو');
    expect(user?.isLoggedIn).toBe(true);
  });
});
