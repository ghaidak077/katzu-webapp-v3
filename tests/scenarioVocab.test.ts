import { describe, expect, it } from 'vitest';
import { scenarioToVocabTopic, SCENARIO_CATEGORY_TO_TOPIC } from '@/lib/utils/scenarioVocab';

describe('scenarioToVocabTopic', () => {
  it('maps each live D1 category to its vocabulary topic', () => {
    // Grounded in the live worker: embassy_appointment→official,
    // cafe_order→daily_life, job_interview→work, doctor_visit→health,
    // apartment_viewing→housing; topics: documents, food, work, health, housing.
    expect(scenarioToVocabTopic({ id: 'cafe_order', category: 'daily_life' })).toBe('food');
    expect(scenarioToVocabTopic({ id: 'embassy_appointment', category: 'official' })).toBe('documents');
    expect(scenarioToVocabTopic({ id: 'job_interview', category: 'work' })).toBe('work');
    expect(scenarioToVocabTopic({ id: 'doctor_visit', category: 'health' })).toBe('health');
    expect(scenarioToVocabTopic({ id: 'apartment_viewing', category: 'housing' })).toBe('housing');
  });

  it('prefers category over id heuristics', () => {
    expect(
      scenarioToVocabTopic({ id: 'job_interview', category: 'daily_life' })
    ).toBe('food');
  });

  it('falls back to id heuristics when category is missing or unknown', () => {
    expect(scenarioToVocabTopic({ id: 'cafe_order', category: '' })).toBe('food');
    expect(scenarioToVocabTopic({ id: 'embassy_appointment', category: 'unknown_category' })).toBe('documents');
    expect(scenarioToVocabTopic({ id: 'arzttermin', category: null as unknown as string })).toBe('health');
  });

  it('returns empty string for unknown scenarios and null input', () => {
    expect(scenarioToVocabTopic({ id: 'totally_new_scenario', category: '' })).toBe('');
    expect(scenarioToVocabTopic(null)).toBe('');
    expect(scenarioToVocabTopic(undefined)).toBe('');
  });

  it('keeps every mapping value a real live topic', () => {
    const liveTopics = ['food', 'documents', 'health', 'housing', 'work'];
    for (const topic of Object.values(SCENARIO_CATEGORY_TO_TOPIC)) {
      expect(liveTopics).toContain(topic);
    }
  });
});
