/**
 * Step 5 — the day-0 finish line.
 *
 * The FIRST completed conversation is the only finish line a brand-new learner
 * may be shown without it being a lie: it is the first real evidence the product
 * works, and the only moment the "streak started" claim can be honest. So the
 * rule lives here, pure and total, and every surface reads it — a rule three
 * surfaces could disagree about is a rule nobody should have to test through a
 * browser.
 *
 * What is deliberately NOT here:
 *  - mastery. Nothing in this module says "أتقنت" or scores the learner. One
 *    milestone line plus the measured number of sentences they actually produced.
 *  - the streak's *value*. The streak line may claim only that it STARTED, and
 *    only when the caller can additionally show `streakDays === 1`. The
 *    decision to grow it lives in `recalculateStreak` (streak.ts), not here.
 */

export const DAY_ZERO_COMPLETED_LINE_AR = 'أنجزت محادثتك الأولى!';
export const DAY_ZERO_EARLY_LINE_AR = 'بدأتَ رحلتك — هذه أول محادثة لك.';
export const DAY_ZERO_STREAK_LINE_AR = 'بدأت سلسلة تدريبك — يوم واحد.';
export const DAY_ZERO_ZERO_SENTENCES_LINE_AR =
  'لم تُسجَّل أي جملة في هذه المحادثة — لا مشكلة، التدرّب كله ما زال في مكانه.';

export interface DayZeroFinishGateInput {
  /** Is the guided refinement on? */
  guided: boolean;
  /** `db.sessions.count()` — `undefined` while the count is still loading. */
  sessionsCount: number | null | undefined;
  /** True when this report was rebuilt by recover.ts, not a live completion. */
  fromRecovered?: boolean;
}

/**
 * Is this report the finish line of a brand-new learner's first conversation?
 *
 * Four things must ALL be true: the guided refinement is on, the finished
 * session is live (never a rebuild), and the session count has actually loaded
 * AND equals exactly one. A still-loading count (`undefined`) is treated like
 * "no" so nothing can flash a celebration at a returning learner while the read
 * settles — the report simply keeps today's full screen until it knows.
 */
export function isDayZeroFinish(input: DayZeroFinishGateInput): boolean {
  if (!input.guided) return false;
  if (input.fromRecovered) return false;
  if (input.sessionsCount == null) return false; // still loading — never flash
  return input.sessionsCount === 1;
}

/**
 * The «جمل» agreement this finish line pins (the brief's own rule, Western
 * digits): 1 as a word, 2–10 as the plural, 11+ back to the singular form.
 */
export function arSentenceCount(count: number): string {
  const n = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
  if (n === 1) return 'جملة واحدة';
  if (n >= 2 && n <= 10) return `${n} جمل`;
  return `${n} جملة`;
}

export interface DayZeroCelebrationInput {
  /** The conversation hit its full turn target (vs the learner ending it early). */
  completedNaturally: boolean;
  /** Accepted spoken sentences this session — `M` in the copy. */
  sentencesSpoken: number;
  /** Of those, the ones produced without help — `N` in the copy. */
  independentSentences: number;
}

export interface DayZeroCelebrationOutput {
  /** The h1 finish line. */
  headlineAr: string;
  /** The honest sentence, or `null` when nothing was spoken → use `zeroLineAr`. */
  sentenceAr: string | null;
  zeroLineAr: string;
}

/**
 * Which celebration the first screen shows, exactly the brief's copy.
 *
 *  - spoken 0        → nothing spoken: no celebration, only the honest zero line.
 *  - spoken ≥1, N=0  → every sentence took help: «قلتَ … مع مساعدة — وهذه بدايتك.»
 *  - spoken ≥1, N≥1  → «أنجزتَ … بنفسك — وهذه بدايتك.»
 *
 * The headline (completed vs ended early) is chosen first and never overclaim:
 * both are unfinished-of-moment milestones, never "mastered".
 */
export function dayZeroCelebration(input: DayZeroCelebrationInput): DayZeroCelebrationOutput {
  const headlineAr = input.completedNaturally ? DAY_ZERO_COMPLETED_LINE_AR : DAY_ZERO_EARLY_LINE_AR;
  const spoken = Math.max(0, Math.trunc(Number.isFinite(input.sentencesSpoken) ? input.sentencesSpoken : 0));
  if (spoken <= 0) {
    return { headlineAr, sentenceAr: null, zeroLineAr: DAY_ZERO_ZERO_SENTENCES_LINE_AR };
  }
  if ((Number(input.independentSentences) || 0) <= 0) {
    return {
      headlineAr,
      sentenceAr: `قلتَ ${arSentenceCount(spoken)} مع مساعدة — وهذه بدايتك.`,
      zeroLineAr: '',
    };
  }
  return {
    headlineAr,
    sentenceAr: `أنجزتَ ${arSentenceCount(input.independentSentences)} بنفسك — وهذه بدايتك.`,
    zeroLineAr: '',
  };
}

/**
 * The one-line corrections teaser on the day-0 first view. Empty when there is
 * nothing to say (k = 0), so the line is not rendered at all.
 */
export function dayZeroCorrectionsLine(count: number): string {
  const n = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
  if (n === 0) return '';
  const noun = n === 1 ? 'تصحيح واحد' : n >= 2 && n <= 10 ? `${n} تصحيحات` : `${n} تصحيح`;
  return `${noun} من هذه الجلسة — ستجدها في تفاصيل الجلسة`;
}