import type { SessionDebrief } from '@/lib/debrief/debrief';
import { arCount } from '@/lib/i18n/arabicCount';
import { SENTENCE_NOM } from '@/lib/i18n/countForms';
import { UI_STRINGS, translate } from '@/lib/i18n/strings';
import type { UiLanguage } from '@/lib/i18n/languages';

/**
 * The mock-exam result card (V24 Phase 5) — deterministic, Arabic, honest.
 *
 * Shown at the end of an exam-speaking scenario (category `exam`). Built ONLY
 * from data the session already produced — the same values `buildSessionDebrief`
 * narrates — so it costs no AI call and identical input gives identical output.
 *
 * Hard rules, pinned in tests:
 *  - the card always says محاكاة (practice in the style of an exam) and never
 *    claims an official score, pass/fail, or exam-body affiliation;
 *  - every number on it was computed by the session itself;
 *  - the share image carries the first name only (never a full name or handle)
 *    plus numbers already computed, and nothing else personal.
 */

/** The one phrase the card may never omit. */
export const MOCK_NOTICE_AR = UI_STRINGS.ar['exam.notice'];

export interface ExamCardInput {
  scenarioTitle: string;
  sentencesSpoken: number;
  independentSentences: number;
  accuracyPercent: number | null;
  mistakes: Array<{ original: string; corrected: string; grammarRule: string }>;
  debrief: SessionDebrief;
  /** The UI language the card is written in. Arabic when omitted. */
  language?: UiLanguage;
}

export interface ExamCard {
  noticeAr: string;
  taskDoneAr: string;
  fluencyAr: string[];
  topCorrections: Array<{ original: string; corrected: string }>;
  nextStepAr: string;
}

/** The two corrections the card names, most important first (debrief order). */
const TOP_CORRECTIONS = 2;

export function buildExamCard(input: ExamCardInput): ExamCard {
  const { scenarioTitle, sentencesSpoken, independentSentences, accuracyPercent, mistakes, debrief } = input;
  const language = input.language ?? 'ar';
  const sentences =
    language === 'ar'
      ? arCount(sentencesSpoken, SENTENCE_NOM)
      : translate(language, sentencesSpoken === 1 ? 'day0.sentencesOne' : sentencesSpoken >= 2 && sentencesSpoken <= 10 ? 'day0.sentencesFew' : 'day0.sentencesMany', { n: sentencesSpoken });

  // Fluency indicators reuse what the session computed — no new measurement,
  // no invented percentages. Independence ratio is the honest fluency proxy:
  // how much of what the learner said came without a hint.
  const fluencyAr: string[] = [];
  if (sentencesSpoken > 0) {
    fluencyAr.push(translate(language, 'exam.fluencyProduced', { count: sentences }));
    if (independentSentences > 0) {
      fluencyAr.push(translate(language, 'exam.fluencyIndependent', { count: independentSentences }));
    } else {
      fluencyAr.push(translate(language, 'exam.fluencyAllAssisted'));
    }
    if (accuracyPercent !== null) {
      fluencyAr.push(translate(language, 'exam.fluencyAccuracy', { accuracy: accuracyPercent }));
    }
  } else {
    fluencyAr.push(translate(language, 'exam.fluencyNone'));
  }

  // Next step = the debrief's own "what you can now do" line, already level- and
  // mode-aware — one voice across the whole report.
  const nextStepAr =
    sentencesSpoken === 0
      ? translate(language, 'exam.nextRetry')
      : debrief.canNowAr;

  return {
    noticeAr: translate(language, 'exam.notice'),
    taskDoneAr:
      sentencesSpoken > 0
        ? translate(language, 'exam.taskDone', { title: scenarioTitle })
        : translate(language, 'exam.taskUnfinished', { title: scenarioTitle }),
    fluencyAr,
    topCorrections: mistakes.slice(0, TOP_CORRECTIONS).map((m) => ({
      original: m.original,
      corrected: m.corrected,
    })),
    nextStepAr,
  };
}

/** First name only: first whitespace-separated token. A Latin "Mr." title is stripped; Arabic letters are never touched. */
export function firstNameOf(displayName: string | null | undefined): string {
  const name = String(displayName || '').trim();
  if (!name) return '';
  const tokens = name.split(/\s+/);
  const first = tokens.length > 1 && /^Mr\.?$/i.test(tokens[0]) ? tokens[1] : tokens[0];
  return first.length <= 24 ? first : first.slice(0, 24);
}
