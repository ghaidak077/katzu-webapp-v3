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

export interface StreakState {
  streakDays: number;
  lastActiveDate: string | null; // local YYYY-MM-DD
}

export function toLocalDateKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Whole calendar days between two YYYY-MM-DD keys; UTC math keeps DST out of it.
function dayDiff(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function updateStreak(prev: StreakState, todayLocal: string): StreakState & { lastActiveDate: string } {
  if (!prev.lastActiveDate) return { streakDays: 1, lastActiveDate: todayLocal };
  const diff = dayDiff(prev.lastActiveDate, todayLocal);
  if (diff < 0) return { streakDays: prev.streakDays, lastActiveDate: prev.lastActiveDate }; // clock moved backwards: never reset progress
  if (diff === 0) return { streakDays: Math.max(prev.streakDays, 1), lastActiveDate: todayLocal };
  if (diff === 1) return { streakDays: prev.streakDays + 1, lastActiveDate: todayLocal };
  return { streakDays: 1, lastActiveDate: todayLocal };
}

// A missed day ends the streak on screen even before the next activity is recorded.
export function getDisplayStreak(state: StreakState, todayLocal: string): number {
  if (!state.lastActiveDate) return 0;
  return dayDiff(state.lastActiveDate, todayLocal) <= 1 ? state.streakDays : 0;
}

const normalizeGerman = (text: string): string =>
  ` ${text.toLowerCase().replace(/[^a-zäöüß]+/g, ' ').trim()} `;

// Distinct scenario words (or their plural) the learner actually wrote; inflected verbs are not matched.
export function countUsedVocabulary(
  sentences: string[],
  vocabulary: { german: string; plural?: string | null }[],
): number {
  const text = normalizeGerman(sentences.join(' . '));
  const used = new Set<string>();
  for (const word of vocabulary) {
    const forms = [word.german, word.plural].filter((f): f is string => !!f);
    if (forms.some((form) => text.includes(normalizeGerman(form)))) {
      used.add(normalizeGerman(word.german));
    }
  }
  return used.size;
}

export type AccessSummary = { kind: 'trial'; daysLeft: number } | { kind: 'free'; left: number } | null;

// What the header shows. Display only: the Worker enforces access. Counters from another UTC day count as unused.
export function getAccessSummary(
  user: { tier?: string; trialEndsAt?: string | null; sessionsUsedToday?: number; sessionsLimitToday?: number | null; quotaDay?: string } | undefined,
  nowMs: number = Date.now(),
): AccessSummary {
  if (!user) return null;
  if (user.tier === 'trial' && user.trialEndsAt) {
    const msLeft = Date.parse(user.trialEndsAt) - nowMs;
    return msLeft > 0 ? { kind: 'trial', daysLeft: Math.ceil(msLeft / 86_400_000) } : null;
  }
  if (user.tier === 'free' && typeof user.sessionsLimitToday === 'number') {
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const used = user.quotaDay === today ? user.sessionsUsedToday ?? 0 : 0;
    return { kind: 'free', left: Math.max(0, user.sessionsLimitToday - used) };
  }
  return null;
}
