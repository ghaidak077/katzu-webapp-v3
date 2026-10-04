import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/katzuDb';
import { WorkerClient } from '@/lib/api/workerClient';
import type { VocabularyEntity } from '@/types/models';

const client = new WorkerClient('https://worker.test');
beforeEach(async () => { await Promise.all(db.tables.map((table) => table.clear())); });
afterEach(() => vi.unstubAllGlobals());

describe('curriculum cache parity', () => {
  it('preserves A0 opener and scenario ordering on detail refresh', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'basics', title_de: 'Hallo', title_ar: 'مرحباً', initial_message_a0: 'Hallo!',
      initial_message_a1: 'Guten Tag!', sequence_order: 7, starter_phrases: [],
    }))));
    await client.fetchScenarioDetail('basics');
    expect(await db.scenarios.get('basics')).toMatchObject({ initial_message_a0: 'Hallo!', sequence_order: 7 });
  });

  it('honors topic-only filtering while offline', async () => {
    await db.vocabulary.bulkPut([
      { id: 1, german: 'Haus', level: 'A1', topic: 'housing' },
      { id: 2, german: 'Kaffee', level: 'A1', topic: 'food' },
    ] as VocabularyEntity[]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect((await client.fetchVocabulary(undefined, 'housing')).map((word) => word.id)).toEqual([1]);
    expect(await client.fetchVocabulary(undefined, 'missing')).toEqual([]);
  });
});
