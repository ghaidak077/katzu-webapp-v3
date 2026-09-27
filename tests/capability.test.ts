import { describe, expect, it } from 'vitest';
import {
  buildCapabilityModel,
  capabilityFromSession,
  scenarioCapability,
  weakestMeasuredSkill,
} from '../src/lib/capability/model';

const scenario = { id: 'doctor_visit', title_de: 'Beim Arzt', title_ar: 'عند الطبيب', category: 'health' };

describe('capability states', () => {
  it('is NOT_STARTED with no recorded evidence', () => {
    expect(scenarioCapability({ scenario }).state).toBe('NOT_STARTED');
  });

  it('is INTRODUCED after studying, before any practice', () => {
    const state = scenarioCapability({
      scenario,
      training: { studiedAt: 1_700_000_000_000, quizAttempted: false, lastScore: 0 },
    });
    expect(state.state).toBe('INTRODUCED');
  });

  it('is PRACTISING after a quiz, even a failed one', () => {
    const state = scenarioCapability({
      scenario,
      training: { studiedAt: 1_700_000_000_000, quizAttempted: true, lastScore: 20 },
    });
    expect(state.state).toBe('PRACTISING');
  });

  it('never reaches INDEPENDENT from a quiz or a hint-assisted session', () => {
    const state = scenarioCapability({
      scenario,
      training: { studiedAt: 1_700_000_000_000, quizAttempted: true, lastScore: 100 },
      sessions: [
        { accuracyPercent: 100, independentSentences: 3, hintAssistedSentences: 4, timestamp: 1_700_000_100_000 },
      ],
    });
    expect(state.state).toBe('PRACTISING');
  });

  it('reaches INDEPENDENT only after a full unaided session above the bar', () => {
    const state = scenarioCapability({
      scenario,
      training: { studiedAt: 1_700_000_000_000, quizAttempted: true, lastScore: 80 },
      sessions: [
        { accuracyPercent: 80, independentSentences: 4, hintAssistedSentences: 0, timestamp: 1_700_000_100_000 },
      ],
    });
    expect(state.state).toBe('INDEPENDENT');
    expect(state.bestIndependentAccuracy).toBe(80);
  });

  it('reaches RETAINED after a later successful scheduled review', () => {
    const independentAt = 1_700_000_000_000;
    const state = scenarioCapability({
      scenario,
      sessions: [
        { accuracyPercent: 90, independentSentences: 5, hintAssistedSentences: 0, timestamp: independentAt },
      ],
      reviewItems: [
        { kind: 'mistake', scenarioId: 'doctor_visit', reps: 3, lastReviewedAt: independentAt + 86_400_000 },
      ],
    });
    expect(state.state).toBe('RETAINED');
  });

  it('does not call a schedule with too few reps retained', () => {
    const independentAt = 1_700_000_000_000;
    const state = scenarioCapability({
      scenario,
      sessions: [
        { accuracyPercent: 90, independentSentences: 5, hintAssistedSentences: 0, timestamp: independentAt },
      ],
      reviewItems: [
        { kind: 'mistake', scenarioId: 'doctor_visit', reps: 1, lastReviewedAt: independentAt + 86_400_000 },
      ],
    });
    expect(state.state).toBe('INDEPENDENT');
  });

  it('counts open mistakes and keeps mastered ones out of that count', () => {
    const state = scenarioCapability({
      scenario,
      training: { studiedAt: 1, quizAttempted: true, lastScore: 50 },
      mistakes: [
        { isMastered: false, timestamp: 1_700_000_000_000, grammarRule: 'Akkusativ' },
        { isMastered: true, timestamp: 1_700_000_000_001, grammarRule: 'Dativ' },
      ],
    });
    expect(state.openMistakes).toBe(1);
    expect(state.state).toBe('PRACTISING');
  });

  it('builds can-do statements from real achievements only', () => {
    const model = buildCapabilityModel({
      scenarios: [
        scenario,
        { id: 'cafe_order', title_de: 'Im Café', title_ar: 'في المقهى', category: 'daily_life' },
      ],
      training: [{ scenarioId: 'cafe_order', studiedAt: 1, quizAttempted: false, lastScore: 0 }],
      sessions: [
        {
          scenarioId: 'doctor_visit',
          accuracyPercent: 85,
          independentSentences: 5,
          hintAssistedSentences: 0,
          timestamp: 1_700_000_000_000,
        },
      ],
      mistakes: [],
      reviewItems: [],
    });
    expect(model.independentCount).toBe(1);
    expect(model.canDo).toHaveLength(1);
    expect(model.canDo[0].statementAr).toContain('بدون مساعدة');
    expect(model.byScenario.cafe_order.state).toBe('INTRODUCED');
  });

  it('maps a single session to the same states the model would show', () => {
    expect(capabilityFromSession({ accuracyPercent: 90, independentSentences: 5, assistedSentences: 0 })).toBe(
      'INDEPENDENT',
    );
    expect(capabilityFromSession({ accuracyPercent: 40, independentSentences: 2, assistedSentences: 0 })).toBe(
      'PRACTISING',
    );
    expect(capabilityFromSession({ accuracyPercent: null, independentSentences: 0, assistedSentences: 0 })).toBe(
      'INTRODUCED',
    );
  });

  it('reports the weakest measured skill, or null when nothing was measured', () => {
    expect(weakestMeasuredSkill({ sessions: [], practice: [] })).toBeNull();
    const weakest = weakestMeasuredSkill({
      sessions: [{ accuracyPercent: 88, independentSentences: 5 }],
      practice: [{ skill: 'listening', score: 40 }],
    });
    expect(weakest?.skill).toBe('listening');
  });

  it('does not invent a weakness when every measured skill is above the bar', () => {
    const result = weakestMeasuredSkill({
      sessions: [{ accuracyPercent: 90, independentSentences: 5 }],
      practice: [{ skill: 'writing', score: 85 }],
    });
    expect(result).toBeNull();
  });
});
