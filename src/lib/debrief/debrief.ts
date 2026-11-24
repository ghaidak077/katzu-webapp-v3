import type { CEFRLevel, SessionMode } from '@/types/models';
import { translate, type UiStringKey } from '@/lib/i18n/strings';
import type { UiLanguage } from '@/lib/i18n/languages';

/**
 * The end-of-session debrief (V21 Phase 2) — deterministic.
 *
 * Built ONLY from data the episode already produced (the same values
 * `finishSession` computed for the session record): no extra AI call, no
 * second model round-trip, and identical input gives identical output —
 * unit-pinned in tests/debrief.test.ts. The AI's per-turn corrections are the
 * source of truth; this module is the narrator, not a grader.
 *
 * The `*Ar` field names are historical: the debrief shipped Arabic-first and
 * every caller reads these names. The text inside them follows the learner's UI
 * language (`input.language`, Arabic by default), so no call site had to change
 * name to gain a second language.
 */

export interface SessionDebriefInput {
  scenarioTitle: string;
  level: CEFRLevel;
  mode: SessionMode;
  sentencesSpoken: number;
  independentSentences: number;
  assistedSentences: number;
  accuracyPercent: number | null;
  mistakes: Array<{ original: string; corrected: string; grammarRule: string }>;
  /**
   * Corrections from the last time the learner did this same scenario, when one
   * was recorded with a mistake count (V28 Stage 1D). Absent/null when there is
   * no honest comparison to make, and the line is then simply not rendered.
   */
  previousMistakeCount?: number | null;
  /** The UI language the narration is written in. Arabic when omitted. */
  language?: UiLanguage;
}

export interface SessionDebrief {
  headlineAr: string;
  didWellAr: string[];
  topMistakesAr: Array<{ original: string; corrected: string; grammarRule: string; noteAr: string }>;
  keepPhrases: Array<{ german: string; arabic: string }>;
  canNowAr: string;
  /** How this attempt's corrections compare with the previous one, or null. */
  compareToLastAr: string | null;
}

/** The two mistakes the debrief names, always the episode's own, most important first. */
const TOP_MISTAKES = 2;

/** Phrases kept per debrief — the capsule rule the report screen renders. */
export const DEBRIEF_PHRASE_LIMIT = 3;

/** "3 sentences" / "جملة واحدة" — the same agreement rule the day-0 line uses. */
function sentencePhrase(count: number, language: UiLanguage): string {
  const n = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
  if (n === 1) return translate(language, 'day0.sentencesOne');
  return translate(language, n >= 2 && n <= 10 ? 'day0.sentencesFew' : 'day0.sentencesMany', { n });
}

export function buildSessionDebrief(input: SessionDebriefInput): SessionDebrief {
  const {
    scenarioTitle,
    level,
    mode,
    sentencesSpoken,
    independentSentences,
    assistedSentences,
    accuracyPercent,
    mistakes,
    previousMistakeCount,
  } = input;
  const language = input.language ?? 'ar';

  const topMistakes = topMistakesAr(mistakes, level, language);
  return {
    headlineAr: headlineAr(scenarioTitle, mode, sentencesSpoken, language),
    didWellAr: didWellAr(
      { sentencesSpoken, independentSentences, assistedSentences, accuracyPercent, mistakes },
      language,
    ),
    topMistakesAr: topMistakes,
    // The capsule takes what the top-mistakes list did NOT name: one
    // correction is shown at most once across the whole debrief.
    keepPhrases: keepPhrases(mistakes, topMistakes.length),
    canNowAr: canNowAr(scenarioTitle, mode, language),
    compareToLastAr: compareToLastAr(mistakes.length, previousMistakeCount, language),
  };
}

/**
 * The "versus your last attempt" line. Honest by construction: it only exists
 * when a previous attempt recorded a count, and it never frames an increase as
 * failure — a harder attempt that surfaces more corrections is progress too.
 */
function compareToLastAr(
  mistakeCount: number,
  previousMistakeCount: number | null | undefined,
  language: UiLanguage,
): string | null {
  if (typeof previousMistakeCount !== 'number' || !Number.isFinite(previousMistakeCount)) return null;
  const previous = Math.max(0, Math.floor(previousMistakeCount));
  if (mistakeCount < previous) {
    return translate(language, 'debrief.compareFewer', { count: mistakeCount, previous });
  }
  if (mistakeCount === previous) {
    return translate(language, 'debrief.compareSame', { previous });
  }
  return translate(language, 'debrief.compareMore', { count: mistakeCount, previous });
}

function headlineAr(
  scenarioTitle: string,
  mode: SessionMode,
  sentencesSpoken: number,
  language: UiLanguage,
): string {
  if (sentencesSpoken === 0) {
    return translate(language, 'debrief.headlineZero', { title: scenarioTitle });
  }
  if (mode === 'real') {
    return translate(language, 'debrief.headlineReal', { title: scenarioTitle });
  }
  return translate(language, 'debrief.headlineProduced', {
    count: sentencePhrase(sentencesSpoken, language),
    title: scenarioTitle,
  });
}

function didWellAr(
  input: Pick<
    SessionDebriefInput,
    'sentencesSpoken' | 'independentSentences' | 'assistedSentences' | 'accuracyPercent' | 'mistakes'
  >,
  language: UiLanguage,
): string[] {
  const notes: string[] = [];
  const { sentencesSpoken, independentSentences, assistedSentences, accuracyPercent, mistakes } = input;

  if (sentencesSpoken > 0) {
    notes.push(
      independentSentences > 0 && independentSentences === sentencesSpoken
        ? translate(language, 'debrief.didAllIndependent')
        : independentSentences > 0
          ? translate(language, 'debrief.didIndependent', {
              count: sentencePhrase(independentSentences, language),
            })
          : translate(language, 'debrief.didAssisted'),
    );
  }
  if (accuracyPercent !== null) {
    if (accuracyPercent >= 75) {
      notes.push(translate(language, 'debrief.didAccuracyHigh', { accuracy: accuracyPercent }));
    } else if (mistakes.length > 0) {
      notes.push(translate(language, 'debrief.didAccuracyLift'));
    }
  }
  if (mistakes.length === 0 && sentencesSpoken >= 3) {
    notes.push(translate(language, 'debrief.didClean'));
  }
  return notes;
}

function topMistakesAr(
  mistakes: SessionDebriefInput['mistakes'],
  level: CEFRLevel,
  language: UiLanguage,
): SessionDebrief['topMistakesAr'] {
  if (mistakes.length === 0) return [];
  return mistakes.slice(0, TOP_MISTAKES).map((mistake) => ({
    ...mistake,
    noteAr: mistakeNoteAr(level, language),
  }));
}

function mistakeNoteAr(level: CEFRLevel, language: UiLanguage): string {
  // Level-aware framing: a from-zero learner is told to copy the shape, a
  // higher learner is told to produce it themselves — the same correction,
  // two honest ladders.
  const key: UiStringKey =
    level === 'A0' ? 'debrief.noteA0' : level === 'A1' ? 'debrief.noteA1' : 'debrief.noteHigher';
  return translate(language, key);
}

function keepPhrases(
  mistakes: SessionDebriefInput['mistakes'],
  skipCount: number,
): SessionDebrief['keepPhrases'] {
  // The corrected German IS the phrase worth keeping — no second source, no
  // invented content, and every phrase already appeared in a real correction
  // the learner saw. Corrections already named in the top-mistakes list are
  // skipped so the same sentence never renders twice on one report.
  return mistakes
    .slice(skipCount, skipCount + DEBRIEF_PHRASE_LIMIT)
    .map((mistake) => ({ german: mistake.corrected, arabic: mistake.grammarRule }));
}

function canNowAr(scenarioTitle: string, mode: SessionMode, language: UiLanguage): string {
  // The "what can I now do in real German" line: honest to what the episode
  // actually was (a guided practice chat vs an unaided real conversation).
  return translate(language, mode === 'real' ? 'debrief.canReal' : 'debrief.canPractice', {
    title: scenarioTitle,
  });
}
