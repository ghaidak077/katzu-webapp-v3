import type {
  CapabilityState,
  MistakeEntity,
  ReviewItemEntity,
  ScenarioEntity,
  ScenarioTrainingEntity,
  SessionEntity,
  SkillPracticeEntity,
} from '@/types/models';

/**
 * "What can I actually do now?" — answered from recorded evidence only.
 *
 * WHY THIS EXISTS
 * The old trail marked a scenario MASTERED as soon as the learner opened it and
 * answered enough quiz questions, and the session report led with XP. That is
 * the one claim a learning app cannot afford to fake: a learner who is told
 * they have mastered the doctor's office, walks into a Praxis and freezes has
 * lost their trust in every other number the app shows.
 *
 * So the states here are a ladder of *evidence*, not of activity:
 *
 *   NOT_STARTED  nothing recorded
 *   INTRODUCED   the learner studied the scenario (met the material)
 *   PRACTISING   quiz or conversation practice happened, or mistakes are open
 *   INDEPENDENT  a real production session without hints, above threshold
 *   RETAINED     that success held up later, after the schedule brought it back
 *
 * Opening a page, reading a translation, using hints and answering a
 * multiple-choice question can never reach INDEPENDENT. Those are inputs, not
 * outcomes, and the tests pin that rule.
 *
 * Pure by design: the Progress screen, the Trail card, the session report and
 * the mission selector all render what this returns, so "independent" can only
 * ever mean one thing.
 */

/** Turns a session needs before it can count as independent production. */
export const MIN_INDEPENDENT_TURNS = 4;
/** Independent accuracy that counts as handling the situation. */
export const INDEPENDENT_ACCURACY = 75;
/** Days between two independent sessions for the second to prove retention. */
export const RETENTION_GAP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const CAPABILITY_LABEL_AR: Record<CapabilityState, string> = {
  NOT_STARTED: 'لم يبدأ',
  INTRODUCED: 'تعرّفت عليه',
  PRACTISING: 'قيد التدريب',
  INDEPENDENT: 'مستقل',
  RETAINED: 'ثابت في الذاكرة',
};

export const CAPABILITY_DESCRIPTION_AR: Record<CapabilityState, string> = {
  NOT_STARTED: 'لم تفتح هذا المشهد بعد.',
  INTRODUCED: 'درست المفردات والعبارات، لكن لم تُنتج جملة بعد.',
  PRACTISING: 'تدرّبت عليه (اختبار أو محادثة) وما زال يحتاج تثبيتاً.',
  INDEPENDENT: 'أتممت محادثة كاملة بدون تلميحات وبأداء جيد.',
  RETAINED: 'نجحت فيه مرة أخرى بعد مراجعة مجدولة — المعرفة بقيت.',
};

export interface CapabilityInput {
  scenario: Pick<ScenarioEntity, 'id' | 'title_de' | 'title_ar' | 'category'>;
  training?: Pick<ScenarioTrainingEntity, 'studiedAt' | 'quizAttempted' | 'lastScore'> | null;
  sessions?: Array<Pick<SessionEntity, 'accuracyPercent' | 'independentSentences' | 'hintAssistedSentences' | 'timestamp'>>;
  mistakes?: Array<Pick<MistakeEntity, 'isMastered' | 'timestamp' | 'grammarRule'>>;
  reviewItems?: Array<Pick<ReviewItemEntity, 'kind' | 'scenarioId' | 'reps' | 'lastReviewedAt'>>;
}

export interface ScenarioCapability {
  scenarioId: string;
  state: CapabilityState;
  /** Sessions that met the independent bar. */
  independentSessions: number;
  /** Best accuracy among independent sessions, or null when none exist. */
  bestIndependentAccuracy: number | null;
  /** Newest recorded activity for this scenario. */
  lastActivityAt: number | null;
  /** Open (uncorrected) mistakes recorded in this scenario. */
  openMistakes: number;
  /** Review items for this scenario that have reached the mastery rep count. */
  retainedReviewItems: number;
}

function isIndependentSession(
  session: Pick<SessionEntity, 'accuracyPercent' | 'independentSentences' | 'hintAssistedSentences'>,
): boolean {
  return (
    (Number(session.independentSentences) || 0) >= MIN_INDEPENDENT_TURNS &&
    typeof session.accuracyPercent === 'number' &&
    Number.isFinite(session.accuracyPercent) &&
    session.accuracyPercent >= INDEPENDENT_ACCURACY
  );
}

export function scenarioCapability(input: CapabilityInput): ScenarioCapability {
  const sessions = [...(input.sessions || [])].sort((a, b) => a.timestamp - b.timestamp);
  const mistakes = input.mistakes || [];
  const reviewItems = input.reviewItems || [];
  const training = input.training || null;

  const independentSessions = sessions.filter(isIndependentSession);
  const openMistakes = mistakes.filter((mistake) => !mistake.isMastered).length;
  const retainedReviewItems = reviewItems.filter(
    (item) => item.kind === 'mistake' && (Number(item.reps) || 0) >= 3 && !!item.lastReviewedAt,
  ).length;

  const lastActivityCandidates = [
    training?.studiedAt || 0,
    ...sessions.map((session) => session.timestamp),
    ...mistakes.map((mistake) => mistake.timestamp),
  ].filter((value) => value > 0);
  const lastActivityAt = lastActivityCandidates.length ? Math.max(...lastActivityCandidates) : null;

  let state: CapabilityState = 'NOT_STARTED';
  const introduced = !!training?.studiedAt || sessions.length > 0;

  if (introduced) {
    state = 'INTRODUCED';
    const practised = !!training?.quizAttempted || sessions.length > 0 || mistakes.length > 0;
    if (practised) state = 'PRACTISING';

    if (independentSessions.length > 0) {
      state = 'INDEPENDENT';
      const firstIndependentAt = independentSessions[0].timestamp;
      const laterIndependent = independentSessions.some(
        (session) => session.timestamp >= firstIndependentAt + RETENTION_GAP_DAYS * DAY_MS,
      );
      const reviewedAfter = reviewItems.some(
        (item) =>
          item.kind === 'mistake' &&
          (Number(item.reps) || 0) >= 3 &&
          (Number(item.lastReviewedAt) || 0) >= firstIndependentAt,
      );
      if (laterIndependent || reviewedAfter) state = 'RETAINED';
    }
  }

  return {
    scenarioId: input.scenario?.id || '',
    state,
    independentSessions: independentSessions.length,
    bestIndependentAccuracy: independentSessions.length
      ? Math.max(...independentSessions.map((session) => session.accuracyPercent as number))
      : null,
    lastActivityAt,
    openMistakes,
    retainedReviewItems,
  };
}

export interface CapabilityModelInput {
  scenarios: Array<Pick<ScenarioEntity, 'id' | 'title_de' | 'title_ar' | 'category'>>;
  training: Array<Pick<ScenarioTrainingEntity, 'scenarioId' | 'studiedAt' | 'quizAttempted' | 'lastScore'>>;
  sessions: Array<Pick<SessionEntity, 'scenarioId' | 'accuracyPercent' | 'independentSentences' | 'hintAssistedSentences' | 'timestamp'>>;
  mistakes: Array<Pick<MistakeEntity, 'scenarioId' | 'isMastered' | 'timestamp' | 'grammarRule'>>;
  reviewItems: Array<Pick<ReviewItemEntity, 'kind' | 'scenarioId' | 'reps' | 'lastReviewedAt'>>;
}

export interface CanDoStatement {
  scenarioId: string;
  titleAr: string;
  titleDe: string;
  state: CapabilityState;
  /** Arabic "you can now…" sentence, only for INDEPENDENT and RETAINED. */
  statementAr: string;
}

export interface CapabilityModel {
  byScenario: Record<string, ScenarioCapability>;
  /** Scenarios the learner can handle unaided (INDEPENDENT or RETAINED). */
  canDo: CanDoStatement[];
  independentCount: number;
  retainedCount: number;
  practisingCount: number;
}

/**
 * The "you can now…" sentence names the real-world situation, not the exercise:
 * the whole point of the capability model is that it speaks about the world
 * outside the app.
 */
export function canDoStatementAr(
  scenario: Pick<ScenarioEntity, 'title_de' | 'title_ar'>,
  state: CapabilityState,
): string {
  const title = scenario.title_ar || scenario.title_de;
  if (state === 'RETAINED') return `تستطيع التعامل مع «${title}» بثقة، وقد ثبّتناها بالمراجعة.`;
  if (state === 'INDEPENDENT') return `تستطيع التعامل مع «${title}» بالألمانية بدون مساعدة.`;
  if (state === 'PRACTISING') return `تتدرّب الآن على «${title}» — لم تصبح مستقلة فيه بعد.`;
  if (state === 'INTRODUCED') return `تعرّفت على «${title}» وما زلت في البداية.`;
  return `لم تبدأ «${title}» بعد.`;
}

export function buildCapabilityModel(input: CapabilityModelInput): CapabilityModel {
  const byScenario: Record<string, ScenarioCapability> = {};
  const canDo: CanDoStatement[] = [];
  let independentCount = 0;
  let retainedCount = 0;
  let practisingCount = 0;

  for (const scenario of input.scenarios || []) {
    const capability = scenarioCapability({
      scenario,
      training: (input.training || []).find((record) => record.scenarioId === scenario.id) || null,
      sessions: (input.sessions || []).filter((session) => session.scenarioId === scenario.id),
      mistakes: (input.mistakes || []).filter((mistake) => mistake.scenarioId === scenario.id),
      reviewItems: (input.reviewItems || []).filter((item) => item.scenarioId === scenario.id),
    });
    byScenario[scenario.id] = capability;

    if (capability.state === 'INDEPENDENT') independentCount += 1;
    if (capability.state === 'RETAINED') {
      retainedCount += 1;
      independentCount += 1; // retained implies independent; never count it twice downward
    }
    if (capability.state === 'PRACTISING') practisingCount += 1;

    if (capability.state === 'INDEPENDENT' || capability.state === 'RETAINED') {
      canDo.push({
        scenarioId: scenario.id,
        titleAr: scenario.title_ar,
        titleDe: scenario.title_de,
        state: capability.state,
        statementAr: canDoStatementAr(scenario, capability.state),
      });
    }
  }

  // Newest achievement first: progress a learner cannot see is progress they
  // do not believe.
  canDo.sort((a, b) => {
    const aAt = byScenario[a.scenarioId]?.lastActivityAt || 0;
    const bAt = byScenario[b.scenarioId]?.lastActivityAt || 0;
    return bAt - aAt;
  });

  return { byScenario, canDo, independentCount, retainedCount, practisingCount };
}

/**
 * One session's contribution to a scenario, for the session report. Uses the
 * same thresholds as the model so the report cannot congratulate a learner into
 * a state the Progress screen refuses to show.
 */
export function capabilityFromSession(session: {
  accuracyPercent: number | null;
  independentSentences: number;
  assistedSentences?: number;
}): CapabilityState {
  if (isIndependentSession({
    accuracyPercent: session.accuracyPercent,
    independentSentences: session.independentSentences,
    hintAssistedSentences: session.assistedSentences || 0,
  })) {
    return 'INDEPENDENT';
  }
  if ((session.independentSentences || 0) > 0 || (session.assistedSentences || 0) > 0) return 'PRACTISING';
  return 'INTRODUCED';
}

/**
 * The weakest *measured* skill, for the mission selector. Returns null when no
 * skill has been measured — "we don't know yet" is a valid answer and must
 * never become "0%".
 */
export function weakestMeasuredSkill(input: {
  sessions: Array<Pick<SessionEntity, 'accuracyPercent' | 'independentSentences'>>;
  practice: Array<Pick<SkillPracticeEntity, 'skill' | 'score'>>;
}): { skill: 'speaking' | 'listening' | 'writing'; labelAr: string; actionAr: string; score: number } | null {
  const speaking = (input.sessions || [])
    .filter((session) => (session.independentSentences || 0) >= 1 && typeof session.accuracyPercent === 'number')
    .map((session) => session.accuracyPercent as number);
  const listening = (input.practice || []).filter((row) => row.skill === 'listening').map((row) => row.score);
  const writing = (input.practice || []).filter((row) => row.skill === 'writing').map((row) => row.score);

  const average = (values: number[]) =>
    values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : null;

  const measured: Array<{
    skill: 'speaking' | 'listening' | 'writing';
    labelAr: string;
    actionAr: string;
    score: number;
  }> = [
    { skill: 'speaking', labelAr: 'التحدث', actionAr: 'تدرّب على محادثة قصيرة', score: average(speaking) ?? Infinity },
    { skill: 'listening', labelAr: 'الاستماع', actionAr: 'ابدأ تدريب الاستماع', score: average(listening) ?? Infinity },
    { skill: 'writing', labelAr: 'الكتابة', actionAr: 'اكتب رسالة قصيرة', score: average(writing) ?? Infinity },
  ];
  const candidates = measured.filter((candidate) => Number.isFinite(candidate.score));

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.score - b.score || a.skill.localeCompare(b.skill));
  // A skill at the bar is not "the weakest problem": only push practice at a
  // measured skill when it is actually below the independent threshold.
  return candidates[0].score < INDEPENDENT_ACCURACY ? candidates[0] : null;
}
