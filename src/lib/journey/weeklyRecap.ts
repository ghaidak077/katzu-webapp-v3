import { arCount } from '@/lib/i18n/arabicCount';
import { MINUTE_NOM, SENTENCE_NOM } from '@/lib/i18n/countForms';

/**
 * The weekly recap (A4) — the one place the app looks backwards on purpose.
 *
 * Every other surface answers "what now?". Retention comes from the learner
 * seeing that the week *had* something in it, so this is a strictly
 * backward-looking summary of the last seven days: episodes, minutes, the
 * sentences produced without hints, and the scene they spent most time in.
 *
 * Rules it follows, all of them for the same reason — an inflated recap is
 * worse than none:
 *  - the window is the last 7 × 24 h, not "this calendar week", so the number
 *    never resets to zero on a Monday morning and accuse the learner of nothing;
 *  - sessions with `durationSeconds` missing contribute 0 minutes rather than an
 *    estimate (old rows and some mocks have none);
 *  - a week with no sessions says so plainly and points at the next scene
 *    instead of rendering an empty card.
 *
 * Pure and unit-tested; the screen only renders what this returns.
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeeklySessionInput {
  scenarioTitle: string;
  durationSeconds?: number | null;
  timestamp: number;
  sentencesSpoken?: number | null;
  independentSentences?: number | null;
}

export interface WeeklyRecap {
  /** Completed episodes inside the window. */
  episodes: number;
  /** Whole minutes of speaking time, from recorded durations only. */
  minutes: number;
  /** Sentences produced without hints across the window. */
  independentSentences: number;
  /** Distinct days with at least one episode, 0–7. */
  activeDays: number;
  /** The most-visited scene of the window, when there is one. */
  topScenarioTitle: string | null;
  /** One Arabic sentence summarising the week. */
  headlineAr: string;
}

export function buildWeeklyRecap(sessions: WeeklySessionInput[] | undefined | null, now = Date.now()): WeeklyRecap {
  const since = now - WEEK_MS;
  const recent = (sessions ?? []).filter((session) => Number(session?.timestamp) >= since);

  const minutes = Math.round(
    recent.reduce((total, session) => {
      const seconds = Number(session?.durationSeconds);
      return total + (Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
    }, 0) / 60,
  );
  const independentSentences = recent.reduce(
    (total, session) => total + Math.max(0, Math.trunc(Number(session?.independentSentences) || 0)),
    0,
  );
  const activeDays = new Set(recent.map((session) => new Date(Number(session.timestamp)).toDateString())).size;

  return {
    episodes: recent.length,
    minutes,
    independentSentences,
    activeDays,
    topScenarioTitle: topScenarioTitle(recent),
    headlineAr: recapLine(recent.length, minutes, independentSentences, activeDays),
  };
}

/**
 * Counting by visit, not by time: a scene visited three times in three-second
 * test sessions should not outrank one the learner actually worked through, so
 * the tie-break is total speaking time and then the title, which keeps the
 * answer stable for identical input.
 */
function topScenarioTitle(recent: WeeklySessionInput[]): string | null {
  const byTitle = new Map<string, { visits: number; seconds: number }>();
  for (const session of recent) {
    const title = String(session?.scenarioTitle || '').trim();
    if (!title) continue;
    const entry = byTitle.get(title) || { visits: 0, seconds: 0 };
    entry.visits += 1;
    const seconds = Number(session?.durationSeconds);
    entry.seconds += Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    byTitle.set(title, entry);
  }
  const ranked = [...byTitle.entries()].sort(
    (a, b) => b[1].visits - a[1].visits || b[1].seconds - a[1].seconds || a[0].localeCompare(b[0]),
  );
  return ranked[0]?.[0] ?? null;
}

function recapLine(episodes: number, minutes: number, independentSentences: number, activeDays: number): string {
  if (episodes === 0) {
    return 'لم نسجّل جلسة في آخر سبعة أيام — مشهد واحد اليوم يعيد تشغيل الأسبوع.';
  }
  const parts = [`${arCount(episodes, EPISODE_FORMS)} في آخر سبعة أيام`];
  if (minutes > 0) parts.push(`${arCount(minutes, MINUTE_NOM)} من الكلام بالألمانية`);
  if (independentSentences > 0) parts.push(`${arCount(independentSentences, SENTENCE_NOM)} بلا تلميحات`);
  parts.push(activeDays === 1 ? 'في يوم واحد' : `على ${activeDays} أيام`);
  return `${parts.join('، ')}.`;
}

/** «جلسة واحدة / جلستان / 3 جلسات / 11 جلسة» — this sentence's own agreement. */
const EPISODE_FORMS = {
  one: 'جلسة واحدة',
  two: 'جلستان',
  few: 'جلسات',
  many: 'جلسة',
} as const;
