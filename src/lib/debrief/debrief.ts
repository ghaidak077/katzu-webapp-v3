import type { CEFRLevel, SessionMode } from '@/types/models';

/**
 * The end-of-session Arabic debrief (V21 Phase 2) — deterministic.
 *
 * Built ONLY from data the episode already produced (the same values
 * `finishSession` computed for the session record): no extra AI call, no
 * second model round-trip, and identical input gives identical output —
 * unit-pinned in tests/debrief.test.ts. The AI's per-turn corrections are the
 * source of truth; this module is the narrator, not a grader.
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
}

export interface SessionDebrief {
  headlineAr: string;
  didWellAr: string[];
  topMistakesAr: Array<{ original: string; corrected: string; grammarRule: string; noteAr: string }>;
  keepPhrases: Array<{ german: string; arabic: string }>;
  canNowAr: string;
}

/** The two mistakes the debrief names, always the episode's own, most important first. */
const TOP_MISTAKES = 2;

/** Phrases kept per debrief — the capsule rule the report screen renders. */
export const DEBRIEF_PHRASE_LIMIT = 3;

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
  } = input;

  const topMistakes = topMistakesAr(mistakes, level);
  return {
    headlineAr: headlineAr(scenarioTitle, mode, sentencesSpoken),
    didWellAr: didWellAr({ sentencesSpoken, independentSentences, assistedSentences, accuracyPercent, mistakes }),
    topMistakesAr: topMistakes,
    // The capsule takes what the top-mistakes list did NOT name: one
    // correction is shown at most once across the whole debrief.
    keepPhrases: keepPhrases(mistakes, topMistakes.length),
    canNowAr: canNowAr(scenarioTitle, mode),
  };
}

function headlineAr(scenarioTitle: string, mode: SessionMode, sentencesSpoken: number): string {
  if (sentencesSpoken === 0) {
    return `جلسة «${scenarioTitle}» انتهت دون جُمل منتجة — الجلسة القادمة نصنع الجملة الأولى.`;
  }
  if (mode === 'immersion') {
    return `أكملت موقف «${scenarioTitle}» من البداية إلى نهايته بالألمانية.`;
  }
  return `أنتجت ${sentencesSpoken} ${sentencesSpoken === 1 ? 'جملة' : 'جُمل'} في موقف «${scenarioTitle}».`;
}

function didWellAr(input: Pick<SessionDebriefInput, 'sentencesSpoken' | 'independentSentences' | 'assistedSentences' | 'accuracyPercent' | 'mistakes'>): string[] {
  const notes: string[] = [];
  const { sentencesSpoken, independentSentences, assistedSentences, accuracyPercent, mistakes } = input;

  if (sentencesSpoken > 0) {
    notes.push(
      independentSentences > 0 && independentSentences === sentencesSpoken
        ? 'أنتجت كل جُملك بلا تلميحات — هذه هي المهارة التي تحملك في الموقف الحقيقي.'
        : independentSentences > 0
          ? `أنتجت ${independentSentences} جملة من دماغك مباشرة بلا تلميح — أكثر ما يهم.`
          : 'أكملت الحديث باستخدام التلميحات — بداية مقبولة، والهدف القادم جملة واحدة بلا تلميح.',
    );
  }
  if (accuracyPercent !== null) {
    if (accuracyPercent >= 75) {
      notes.push(`دقة جُملك المستقلة ${accuracyPercent}% — قوية لهذا المستوى.`);
    } else if (mistakes.length > 0) {
      notes.push('دقتك ترتفع كلما تخلّصت من الخطأ المتكرر الأول — وليس من كل شيء معاً.');
    }
  }
  if (mistakes.length === 0 && sentencesSpoken >= 3) {
    notes.push('لم يصحّح لك شيء في هذه الجلسة — اختر موقفاً أصعب في المرة القادمة.');
  }
  return notes;
}

function topMistakesAr(
  mistakes: SessionDebriefInput['mistakes'],
  level: CEFRLevel,
): SessionDebrief['topMistakesAr'] {
  if (mistakes.length === 0) return [];
  return mistakes.slice(0, TOP_MISTAKES).map((mistake) => ({
    ...mistake,
    noteAr: mistakeNoteAr(level),
  }));
}

function mistakeNoteAr(level: CEFRLevel): string {
  // Level-aware framing: a from-zero learner is told to copy the shape, a
  // higher learner is told to produce it themselves — the same correction,
  // two honest ladders.
  if (level === 'A0') {
    return 'أعد الكتابة فوقها ثلاث مرات بصوت مسموع حتى تصبح شكلها مألوفاً.';
  }
  if (level === 'A1') {
    return 'أعد بناءها بنفسك مرتين، ثم استخدمها في حديثك القادم دون أن تنظر إليها.';
  }
  return 'استخدم الصيغة الصحيحة في جملتين من عندك قبل أن تنساها — التثبيت بالاستعمال.';
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

function canNowAr(scenarioTitle: string, mode: SessionMode): string {
  // The "what can I now do in real German" line: honest to what the episode
  // actually was (a guided quick chat vs a full immersion run-through).
  if (mode === 'immersion') {
    return `الآن تستطيع أن تُدير حديثاً كاملاً في موقف «${scenarioTitle}» من البداية إلى النهاية بالألمانية.`;
  }
  return `الآن تستطيع أن تبدأ حديثاً في موقف «${scenarioTitle}» وتجيب عن سؤال أو سؤالين بالألمانية.`;
}
