/**
 * The practice estimate — the only number this app may show after a mock.
 *
 * WHY IT IS COMPUTED HERE AND NOT BY THE MODEL
 * Every input is something the session already measured: how many sentences the
 * learner produced, how many without a hint, the accuracy the grammar grader
 * reported, and how long the part took. A deterministic function of those numbers
 * can be read, argued with and tested. A model asked to "score the learner" would
 * invent a number that looks like an official grade and is not — which is exactly
 * the claim this product must never make.
 *
 * THE HONESTY RULES, pinned in `tests/mockExamScore.test.ts`
 *  - the result is called a practice estimate (تقدير تدريبي) everywhere;
 *  - no pass/fail, no threshold, no "you would have passed";
 *  - `null` score means "not enough was said to estimate anything", never 0;
 *  - the notice that this is not the official exam is part of the returned
 *    object, so a screen cannot render the number without it.
 */

/** What one part of the mock produced. Exactly what the live engine measured. */
export interface MockPartResult {
  /** 1-based part number, matching the server's part list. */
  partIndex: number;
  sentencesSpoken: number;
  /** Sentences the learner produced without accepting a hint. */
  independentSentences: number;
  /** Accuracy the grader reported for this part, or null if nothing was graded. */
  accuracyPercent: number | null;
  durationSeconds: number;
  mistakes: Array<{ original: string; corrected: string; grammarRule: string }>;
}

/** The band is a description of today's session, never a verdict about the learner. */
export type EstimateBand = 'steady' | 'getting_there' | 'needs_more';

export interface PracticeEstimate {
  /** 0-100, or null when too little was said to say anything. */
  score: number | null;
  band: EstimateBand | null;
  headlineAr: string;
  /** The four inputs, so the number can be argued with. */
  components: {
    /** Share of sentences produced without a hint, 0-100. */
    independence: number | null;
    /** Accuracy the grader reported, 0-100. */
    accuracy: number | null;
    /** How much of the three parts were actually attempted, 0-100. */
    coverage: number;
    /** How close the speaking time ran to the part budget, 0-100. */
    pacing: number | null;
  };
  totals: { sentences: number; independent: number; mistakes: number; seconds: number };
  noticeAr: string;
  unproven: true;
}

/** The one sentence that must travel with the number. */
export const PRACTICE_ESTIMATE_NOTICE_AR =
  'هذا تقدير تدريبي من تدريبك داخل التطبيق فقط — ليس درجة رسمية ولا يتبع نتيجة الامتحان.';

/** Below this many sentences the app says nothing rather than inventing a number. */
const MIN_SENTENCES_FOR_ESTIMATE = 3;

/** How many parts a full mock has. */
const TOTAL_PARTS = 3;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

const BAND: Record<Exclude<EstimateBand, null>, { min: number; ar: string }> = {
  steady: { min: 70, ar: 'أداء ثابت في هذه الجلسة. كرّرها بعد يومين وستقارنها بنفسك.' },
  getting_there: { min: 45, ar: 'أنت في منتصف الطريق —继续保持، والجزء الثالث هو الأضعف عادةً.' },
  needs_more: { min: 0, ar: 'ابدأ بالجزء الأول فقط هذه المرة؛ الاستقلال أهم من الطول الآن.' },
};

/**
 * The estimate for a whole mock.
 *
 * Weighted equally, and every component is measured from the session:
 * independence (did they do it alone), accuracy (was it right), coverage (did
 * they reach all three parts), pacing (did they use the time without running on).
 *
 * `budgetSeconds` is the per-part budget the server sent; it is passed in rather
 * than hard-coded so the app follows the server's timing and cannot drift from it.
 */
export function estimatePracticeScore(
  parts: MockPartResult[],
  budgetSeconds = 300,
): PracticeEstimate {
  const rows = Array.isArray(parts) ? parts.filter((row) => row && Number.isFinite(row.partIndex)) : [];
  const sentences = rows.reduce((sum, row) => sum + Math.max(0, row.sentencesSpoken || 0), 0);
  const independent = rows.reduce((sum, row) => sum + Math.max(0, row.independentSentences || 0), 0);
  const mistakes = rows.reduce((sum, row) => sum + (row.mistakes?.length || 0), 0);
  const seconds = rows.reduce((sum, row) => sum + Math.max(0, row.durationSeconds || 0), 0);

  const accuracyRows = rows
    .map((row) => row.accuracyPercent)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const accuracy = accuracyRows.length
    ? clampPercent(accuracyRows.reduce((sum, value) => sum + value, 0) / accuracyRows.length)
    : null;
  const independence = sentences > 0 ? clampPercent((independent / sentences) * 100) : null;
  const coverage = clampPercent((rows.length / TOTAL_PARTS) * 100);
  const pacing = seconds > 0 && budgetSeconds > 0
    ? clampPercent((seconds / (budgetSeconds * Math.max(1, rows.length))) * 100)
    : null;

  const base: PracticeEstimate = {
    score: null,
    band: null,
    headlineAr: 'لم تقل شيئاً يكفي لنقدّر أداءك بعد. ابدأ من جديد واذكر جملة على الأقل.',
    components: { independence, accuracy, coverage, pacing },
    totals: { sentences, independent, mistakes, seconds },
    noticeAr: PRACTICE_ESTIMATE_NOTICE_AR,
    unproven: true,
  };

  // Too little speech to estimate anything is its own answer, and it is not zero.
  if (sentences < MIN_SENTENCES_FOR_ESTIMATE) return base;

  const weights: Array<[number | null, number]> = [
    [independence, 0.35],
    [accuracy, 0.35],
    [coverage, 0.15],
    // Pacing below half the budget means they were cut short, above twice it
    // means they overran; both are 100 here and the sentence counts carry the rest.
    [pacing === null ? null : pacing >= 40 && pacing <= 220 ? 100 : Math.min(pacing ?? 0, 100), 0.15],
  ];
  const usable = weights.filter(([value]) => typeof value === 'number') as Array<[number, number]>;
  const totalWeight = usable.reduce((sum, [, weight]) => sum + weight, 0);
  const score = clampPercent(
    usable.reduce((sum, [value, weight]) => sum + value * weight, 0) / (totalWeight || 1),
  );
  const band = (Object.keys(BAND) as Exclude<EstimateBand, null>[]).find((key) => score >= BAND[key].min) ?? 'needs_more';

  return {
    ...base,
    score,
    band,
    headlineAr: BAND[band].ar,
  };
}

/**
 * What the debrief may show, from the server's own answer.
 *
 * The server decided (`debrief.fullDebrief`), so the client cannot widen its own
 * gate by re-reading a local flag; `visibleCorrections` is the number of
 * corrections to render, computed from the server's answer and the actual list.
 */
export function debriefView(
  allMistakes: Array<{ original: string; corrected: string }>,
  debrief: { fullDebrief?: boolean } | null | undefined,
): { visible: Array<{ original: string; corrected: string }>; lockedCount: number; full: boolean } {
  const rows = Array.isArray(allMistakes) ? allMistakes : [];
  const full = debrief?.fullDebrief === true;
  if (full) return { visible: rows, lockedCount: 0, full: true };
  return { visible: rows.slice(0, 2), lockedCount: Math.max(0, rows.length - 2), full: false };
}

/** Arabic clock for the part timer: 4:59, never 05:00. */
export function formatPartClock(secondsLeft: number): string {
  const total = Number.isFinite(secondsLeft) ? Math.max(0, Math.floor(secondsLeft)) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}