import type { SessionDebrief } from '@/lib/debrief/debrief';

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
export const MOCK_NOTICE_AR = 'هذه محاكاة بأسلوب الامتحان — ليست الامتحان الرسمي ولا تمنح درجة معتمدة.';

export interface ExamCardInput {
  scenarioTitle: string;
  sentencesSpoken: number;
  independentSentences: number;
  accuracyPercent: number | null;
  mistakes: Array<{ original: string; corrected: string; grammarRule: string }>;
  debrief: SessionDebrief;
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

  // Fluency indicators reuse what the session computed — no new measurement,
  // no invented percentages. Independence ratio is the honest fluency proxy:
  // how much of what the learner said came without a hint.
  const fluencyAr: string[] = [];
  if (sentencesSpoken > 0) {
    fluencyAr.push(`أنتجت ${sentencesSpoken} ${sentencesSpoken === 1 ? 'جملة' : 'جُمل'} في المحاكاة.`);
    if (independentSentences > 0) {
      fluencyAr.push(`${independentSentences} منها بلا تلميح — هذه نسبة الاستقلال الحقيقية.`);
    } else {
      fluencyAr.push('كل الجُمل كانت بتلميح — الطبيعي في أول محاكاة، والهدف جملة واحدة مستقلة.');
    }
    if (accuracyPercent !== null) {
      fluencyAr.push(`دقة الجُمل المستقلة ${accuracyPercent}%.`);
    }
  } else {
    fluencyAr.push('لم تُنتج جملة في هذه المحاكاة — افتح السيناريو مجدداً واستخدم الافتتاحية المحفوظة.');
  }

  // Next step = the debrief's own "what you can now do" line, already level- and
  // mode-aware — one voice across the whole report.
  const nextStepAr =
    sentencesSpoken === 0
      ? 'أعد المحاكاة واستخدم جملة افتتاحية واحدة على الأقل.'
      : debrief.canNowAr;

  return {
    noticeAr: MOCK_NOTICE_AR,
    taskDoneAr:
      sentencesSpoken > 0
        ? `أنجزت المهمة الحوارية في «${scenarioTitle}».`
        : `المهمة الحوارية في «${scenarioTitle}» لم تكتمل بعد.`,
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
