import { describe, expect, it } from 'vitest';
import { mergeProgressPayloads, type ProgressPayload } from '@/lib/api/workerClient';

const payload = (overrides: Partial<ProgressPayload>): ProgressPayload => ({
  stats: { total_points: 1, updated_at: 1 },
  trainings: [],
  saved_word_ids: [],
  mistakes: [],
  session_summaries: [],
  ...overrides,
});

describe('deterministic progress sync merge', () => {
  it('restores a new device without dropping summaries or mistakes', () => {
    const merged = mergeProgressPayloads(
      payload({}),
      payload({
        mistakes: [{ sync_id: 'm1', original: 'Ich bin', is_mastered: true, updated_at: 4 }],
        session_summaries: [{ id: 's1', independent_sentences: 3, updated_at: 4 }],
      }),
    );

    expect(merged.mistakes).toHaveLength(1);
    expect(merged.mistakes[0].is_mastered).toBe(true);
    expect(merged.session_summaries[0].independent_sentences).toBe(3);
  });

  it('unions diverged devices, keeps mastered, and chooses latest scalar values', () => {
    const merged = mergeProgressPayloads(
      payload({
        stats: { total_points: 20, updated_at: 20 },
        saved_word_ids: [1, 2],
        mistakes: [{ sync_id: 'm1', is_mastered: false, corrected: 'alt', updated_at: 30 }],
        session_summaries: [{ id: 'same', accuracy_percent: 70, updated_at: 5 }],
      }),
      payload({
        stats: { total_points: 10, updated_at: 10 },
        saved_word_ids: [2, 3],
        mistakes: [
          { sync_id: 'm1', is_mastered: true, corrected: 'correct', updated_at: 1 },
          { sync_id: 'm2', is_mastered: false, updated_at: 2 },
        ],
        session_summaries: [{ id: 'same', accuracy_percent: 90, updated_at: 8 }],
      }),
    );

    expect(merged.stats.total_points).toBe(20);
    expect(merged.saved_word_ids).toEqual([1, 2, 3]);
    expect(merged.mistakes).toHaveLength(2);
    expect(merged.mistakes.find((m) => m.sync_id === 'm1')?.is_mastered).toBe(true);
    expect(merged.session_summaries[0].accuracy_percent).toBe(90);
  });
});
