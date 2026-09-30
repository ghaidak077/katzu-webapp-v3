import { describe, expect, it } from 'vitest';
import { normalizedPartOfSpeech, scenarioToVocabTopic, safetyDisclaimerFor, SCENARIO_CATEGORY_TO_TOPIC } from '@/lib/utils/scenarioVocab';

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

  it('maps travel content to its own topic instead of no topic at all', () => {
    // Before this, a `travel` scenario resolved to '' — its vocabulary was
    // unreachable from Study, Quiz and Guided Practice.
    expect(scenarioToVocabTopic({ id: 'airport_arrival', category: 'travel' })).toBe('travel');
    expect(scenarioToVocabTopic({ id: 'train_station', category: 'travel' })).toBe('travel');
  });

  it('keeps every mapping value a real live topic', () => {
    const liveTopics = ['food', 'documents', 'health', 'housing', 'work', 'travel'];
    for (const topic of Object.values(SCENARIO_CATEGORY_TO_TOPIC)) {
      expect(liveTopics).toContain(topic);
    }
  });
});

describe('safetyDisclaimerFor (Gate 6)', () => {
  it('gives medical, legal/official and housing scenarios a disclaimer', () => {
    expect(safetyDisclaimerFor({ id: 'doctor_visit', category: 'health' })).toContain('ليس استشارة طبية');
    expect(safetyDisclaimerFor({ id: 'embassy_appointment', category: 'official' })).toContain('استشارة قانونية أو هجرة');
    expect(safetyDisclaimerFor({ id: 'apartment_viewing', category: 'housing' })).toContain('ليس استشارة قانونية');
  });

  it('gives no disclaimer to everyday scenarios (café, travel, work)', () => {
    expect(safetyDisclaimerFor({ id: 'cafe_order', category: 'daily_life' })).toBe('');
    expect(safetyDisclaimerFor({ id: 'airport_arrival', category: 'travel' })).toBe('');
    expect(safetyDisclaimerFor({ id: 'job_interview', category: 'work' })).toBe('');
  });

  it('falls back to the scenario id when the CMS category is missing', () => {
    expect(safetyDisclaimerFor({ id: 'doctor_visit', category: '' })).toContain('ليس استشارة طبية');
    expect(safetyDisclaimerFor({ id: 'burgeramt_appointment', category: '' })).toContain('الجهات المختصة');
    expect(safetyDisclaimerFor(null)).toBe('');
  });
});

describe('normalizedPartOfSpeech (master plan §3.3)', () => {
  it('merges the casing split measured in live D1 into one canonical form', () => {
    expect(normalizedPartOfSpeech('noun')).toBe('Noun');
    expect(normalizedPartOfSpeech('Noun')).toBe('Noun');
    expect(normalizedPartOfSpeech('NOUN')).toBe('Noun');
    expect(normalizedPartOfSpeech('verb')).toBe('Verb');
    expect(normalizedPartOfSpeech('adjective')).toBe('Adjective');
    expect(normalizedPartOfSpeech('Adverb')).toBe('Adverb');
  });

  it('treats absent or junk values as empty (the sheet then shows the generic label)', () => {
    expect(normalizedPartOfSpeech(null)).toBe('');
    expect(normalizedPartOfSpeech(undefined)).toBe('');
    expect(normalizedPartOfSpeech('   ')).toBe('');
  });
});
