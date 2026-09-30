import { describe, expect, it } from 'vitest';
import {
  normalizedPartOfSpeech,
  scenarioToVocabTopic,
  safetyDisclaimerFor,
  SCENARIO_CATEGORY_TO_TOPIC,
  vocabularyWithinLevelRadius,
} from '@/lib/utils/scenarioVocab';

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
    // Live D1 topics at time of writing, plus the six V23 categories that map
    // 1:1 to topics their modules will ship (basics, exam, study, visa,
    // services, trades — they are additive, content arrives with the modules).
    const liveTopics = [
      'food', 'documents', 'health', 'housing', 'work', 'travel',
      'basics', 'exam', 'study', 'visa', 'services', 'trades',
    ];
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

describe('vocabularyWithinLevelRadius (master plan D5)', () => {
  const rows = (levels: string[]) => levels.map((level, i) => ({ id: i + 1, level }));

  it('keeps only the learner level ±1 when rows exist inside the window', () => {
    const pool = rows(['A1', 'A2', 'B1', 'B2']);
    expect(vocabularyWithinLevelRadius(pool, 'A1').map((r) => r.level)).toEqual(['A1', 'A2']);
    expect(vocabularyWithinLevelRadius(pool, 'B1').map((r) => r.level)).toEqual(['A2', 'B1', 'B2']);
    expect(vocabularyWithinLevelRadius(pool, 'A0').map((r) => r.level)).toEqual(['A1']);
  });

  it('falls back to the FULL pool when no row is inside the window (never-empty)', () => {
    const farPool = rows(['B1', 'B2']);
    expect(vocabularyWithinLevelRadius(farPool, 'A0')).toBe(farPool);
    const a2Only = rows(['A2']);
    expect(vocabularyWithinLevelRadius(a2Only, 'B2')).toBe(a2Only);
  });

  it('treats rows with unknown levels as outside the window but keeps them in the fallback', () => {
    const mixed = [{ id: 1, level: 'A1' }, { id: 2, level: null }, { id: 3, level: 'weird' }];
    expect(vocabularyWithinLevelRadius(mixed, 'A1').map((r) => r.id)).toEqual([1]);
    expect(vocabularyWithinLevelRadius(mixed, 'B2')).toBe(mixed);
  });

  it('handles A0 learners and empty pools without crashing', () => {
    const pool = rows(['A0', 'A1']);
    expect(vocabularyWithinLevelRadius(pool, 'A0').map((r) => r.level)).toEqual(['A0', 'A1']);
    expect(vocabularyWithinLevelRadius([], 'A1')).toEqual([]);
  });

  it('returns the pool untouched when the learner level is unknown', () => {
    const pool = rows(['A2', 'B1']);
    expect(vocabularyWithinLevelRadius(pool, undefined)).toBe(pool);
    expect(vocabularyWithinLevelRadius(pool, 'Z9')).toBe(pool);
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
