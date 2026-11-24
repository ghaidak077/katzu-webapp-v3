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
 *
 * Every line follows the learner's UI language (`language`, Arabic by default).
 * The `*Ar` names are historical — the finish line shipped Arabic-first and the
 * report reads these fields by name.
 */

import { UI_STRINGS, translate } from '@/lib/i18n/strings';
import type { UiLanguage } from '@/lib/i18n/languages';

export const DAY_ZERO_COMPLETED_LINE_AR = UI_STRINGS.ar['day0.completed'];
export const DAY_ZERO_EARLY_LINE_AR = UI_STRINGS.ar['day0.early'];
export const DAY_ZERO_STREAK_LINE_AR = UI_STRINGS.ar['day0.streak'];
export const DAY_ZERO_ZERO_SENTENCES_LINE_AR = UI_STRINGS.ar['day0.zero'];

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
 * English and Indonesian take the same two shapes: one, or a counted plural. The
 * name is historical (`arSentenceCount`), the language is a parameter.
 */
export function arSentenceCount(count: number, language: UiLanguage = 'ar'): string {
  const n = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
  if (n === 1) return translate(language, 'day0.sentencesOne');
  return translate(language, n >= 2 && n <= 10 ? 'day0.sentencesFew' : 'day0.sentencesMany', { n });
}

export interface DayZeroCelebrationInput {
  /**
   * The conversation hit its full turn target (vs the learner ending it early).
   * Omitted/`undefined` means the completion is UNKNOWN — an older stored
   * summary written before this field existed — and must read as "not
   * completed", never as a natural finish.
   */
  completedNaturally?: boolean;
  /** Accepted spoken sentences this session — `M` in the copy. */
  sentencesSpoken: number;
  /** Of those, the ones produced without help — `N` in the copy. */
  independentSentences: number;
  /** The UI language the celebration is written in. Arabic when omitted. */
  language?: UiLanguage;
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
 * both are unfinished-of-moment milestones, never "mastered". An ABSENT flag is
 * unknown completion, so it takes the early line — the only one that is true
 * whether the learner stopped early or the summary predates the field.
 */
export function dayZeroCelebration(input: DayZeroCelebrationInput): DayZeroCelebrationOutput {
  const language = input.language ?? 'ar';
  // `=== true` on purpose: an old stored summary has no `completedNaturally`,
  // and unknown completion must show the honest «بدأتَ رحلتك» line rather than
  // claim the learner finished the conversation.
  const headlineAr = translate(language, input.completedNaturally === true ? 'day0.completed' : 'day0.early');
  const spoken = Math.max(0, Math.trunc(Number.isFinite(input.sentencesSpoken) ? input.sentencesSpoken : 0));
  if (spoken <= 0) {
    return { headlineAr, sentenceAr: null, zeroLineAr: translate(language, 'day0.zero') };
  }
  if ((Number(input.independentSentences) || 0) <= 0) {
    return {
      headlineAr,
      sentenceAr: translate(language, 'day0.sentenceAssisted', {
        count: arSentenceCount(spoken, language),
      }),
      zeroLineAr: '',
    };
  }
  return {
    headlineAr,
    sentenceAr: translate(language, 'day0.sentenceIndependent', {
      count: arSentenceCount(input.independentSentences, language),
    }),
    zeroLineAr: '',
  };
}

/**
 * The one-line corrections teaser on the day-0 first view. Empty when there is
 * nothing to say (k = 0), so the line is not rendered at all.
 */
export function dayZeroCorrectionsLine(count: number, language: UiLanguage = 'ar'): string {
  const n = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
  if (n === 0) return '';
  const noun =
    n === 1
      ? translate(language, 'day0.correctionsOne')
      : translate(language, n >= 2 && n <= 10 ? 'day0.correctionsFew' : 'day0.correctionsMany', { n });
  return translate(language, 'day0.corrections', { noun });
}
