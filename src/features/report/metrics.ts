import type { CEFRLevel } from '@/types/models';

export interface IndependentTurn {
  hasError: boolean;
}

export interface PromotionSession {
  cefrLevel: CEFRLevel;
  independentSentences: number;
  accuracyPercent: number | null;
  timestamp: number;
}

export function calculateIndependentAccuracy(turns: IndependentTurn[]): number | null {
  if (turns.length === 0) return null;

  const errors = turns.filter((turn) => turn.hasError).length;
  return Math.round(((turns.length - errors) / turns.length) * 100);
}

export function getNextPromotionLevel(level: CEFRLevel): CEFRLevel | null {
  if (level === 'A1') return 'A2';
  if (level === 'A2') return 'B1';
  if (level === 'B1') return 'B2';
  return null;
}

export function isEligibleForPromotion(
  level: CEFRLevel,
  sessions: PromotionSession[],
): boolean {
  if (level === 'B2') return false;

  const latestSessions = sessions
    .filter((session) => session.cefrLevel === level)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);

  if (
    latestSessions.length < 3 ||
    latestSessions.some(
      (session) =>
        session.independentSentences < 4 || session.accuracyPercent === null,
    )
  ) {
    return false;
  }

  const averageAccuracy =
    latestSessions.reduce(
      (total, session) => total + (session.accuracyPercent as number),
      0,
    ) / latestSessions.length;

  return averageAccuracy >= 75;
}
