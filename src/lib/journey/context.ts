import type { ArrivalStatus, CEFRLevel, LearnerGoal } from '@/types/models';
import { INTRO_SCENARIO_ID, type DailyMissionPlan, type MissionScenario } from '@/lib/mission/selectMission';
import { goalMatchScore } from '@/lib/onboarding/preferences';

/**
 * Journey Home's context: where the learner is, and why today's mission is
 * today's.
 *
 * Deliberately pure and separate from the screen. The home screen's job is to
 * render one mission and one status line; every number it shows — the day, the
 * chapter, the segments — is derived here from recorded evidence so the same
 * learner state always produces the same page, in tests as well as on a phone.
 */

/** Scenarios per chapter. Small on purpose: a learner must be able to finish one. */
export const CHAPTER_SIZE = 3;

const CHAPTER_TITLES_AR = [
  'الخطوات الأولى في ألمانيا',
  'الحياة اليومية والمواصلات',
  'العمل والمكتب',
  'الجامعة والجهات الرسمية',
  'الاستقلال باللغة',
];

const DAY_MS = 86_400_000;

export interface JourneyTrainingRecord {
  scenarioId: string;
  studiedAt: number | null;
  quizAttempted: boolean;
  lastScore: number;
  updatedAt?: number;
}

export interface JourneyInput {
  scenarios: MissionScenario[];
  training: JourneyTrainingRecord[];
  sessions: Array<{ timestamp: number }>;
  reviewDueCount: number;
  /** Scenario ids whose capability reached INDEPENDENT or RETAINED. */
  independentScenarioIds: string[];
  goal?: LearnerGoal | null;
  arrivalStatus?: ArrivalStatus | null;
  level: CEFRLevel;
  now?: number;
}

export interface JourneyContext {
  /** 1-based day count since the first recorded session. */
  dayNumber: number;
  /** Days with no recorded session; 0 = today already counted. */
  daysSinceLastSession: number;
  chapterIndex: number;
  chapterCount: number;
  chapterTitleAr: string;
  chapterSegments: number;
  chapterSegmentsDone: number;
  /** Index (0-based) of the segment in progress, or undefined when complete. */
  activeSegment?: number;
  /** Nothing recorded yet — the first-run state. */
  isFirstRun: boolean;
  /** Every scenario the learner has is independent/retained and no review is due. */
  isAllCaughtUp: boolean;
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Scenarios ordered the way they are taught: the arrival scene opens the story,
 * then goal match, then a stable id.
 *
 * Pinning the opening is what makes chapter 1 *the arrival* for a learner
 * preparing for a job as well as one going to university. Without it the goal
 * weighting would put the interview or the university office in segment 1, and
 * the story would no longer start where the learner's life in Germany starts.
 * The pin is a no-op when the content does not carry that scenario.
 */
function orderedScenarios(input: JourneyInput): MissionScenario[] {
  const sorted = [...(input.scenarios || [])].sort(
    (a, b) =>
      goalMatchScore(b.category, input.goal) - goalMatchScore(a.category, input.goal) ||
      a.id.localeCompare(b.id),
  );
  const openingIndex = sorted.findIndex((scenario) => scenario.id === INTRO_SCENARIO_ID);
  if (openingIndex > 0) {
    const [opening] = sorted.splice(openingIndex, 1);
    sorted.unshift(opening);
  }
  return sorted;
}

/** The learner's situation, used to explain why a scene matters to *them*. */
export function situationAr(input: Pick<JourneyInput, 'goal' | 'arrivalStatus'>): string {
  if (input.arrivalStatus === 'living_in_germany') return 'أنت في ألمانيا بالفعل';
  if (input.arrivalStatus === 'recently_arrived') return 'وصلت حديثاً';
  if (input.goal === 'exam') return 'لديك امتحان قادم';
  if (input.goal === 'work') return 'تستعد للعمل أو Ausbildung';
  if (input.goal === 'university') return 'تستعد للدراسة';
  return 'أنت في طريقك إلى ألمانيا';
}

export function buildJourneyContext(input: JourneyInput): JourneyContext {
  const now = input.now ?? Date.now();
  const sessions = (input.sessions || []).filter((session) => Number(session?.timestamp) > 0);
  const ordered = orderedScenarios(input);
  const independent = new Set(input.independentScenarioIds || []);

  const firstSessionAt = sessions.length ? Math.min(...sessions.map((s) => s.timestamp)) : 0;
  const lastSessionAt = sessions.length ? Math.max(...sessions.map((s) => s.timestamp)) : 0;

  // Days are counted in calendar days, not 24-hour windows: a learner who
  // practises at 23:00 and again at 08:00 has practised on two days.
  const dayNumber = firstSessionAt ? Math.floor((startOfDay(now) - startOfDay(firstSessionAt)) / DAY_MS) + 1 : 1;
  const daysSinceLastSession = lastSessionAt
    ? Math.max(0, Math.floor((startOfDay(now) - startOfDay(lastSessionAt)) / DAY_MS))
    : 0;

  const chapterCount = Math.max(1, Math.ceil(ordered.length / CHAPTER_SIZE));
  // The chapter is the one containing the first scenario that is not yet
  // independent, so finishing a chapter genuinely moves the learner forward.
  const firstOpenIndex = ordered.findIndex((scenario) => !independent.has(scenario.id));
  const openIndex = firstOpenIndex === -1 ? Math.max(0, ordered.length - 1) : firstOpenIndex;
  const chapterIndex = ordered.length === 0 ? 1 : Math.floor(openIndex / CHAPTER_SIZE) + 1;
  const chapterScenarios = ordered.slice((chapterIndex - 1) * CHAPTER_SIZE, chapterIndex * CHAPTER_SIZE);

  const chapterSegments = chapterScenarios.length;
  const chapterSegmentsDone = chapterScenarios.filter((scenario) => independent.has(scenario.id)).length;
  const activeSegment = chapterSegmentsDone < chapterSegments ? chapterSegmentsDone : undefined;

  const chapterTitleAr =
    CHAPTER_TITLES_AR[chapterIndex - 1] ||
    chapterScenarios[0]?.title_ar ||
    CHAPTER_TITLES_AR[CHAPTER_TITLES_AR.length - 1];

  return {
    dayNumber,
    daysSinceLastSession,
    chapterIndex,
    chapterCount,
    chapterTitleAr,
    chapterSegments,
    chapterSegmentsDone,
    activeSegment,
    isFirstRun: sessions.length === 0 && (input.training || []).length === 0,
    isAllCaughtUp:
      ordered.length > 0 && independent.size >= ordered.length && (input.reviewDueCount || 0) === 0,
  };
}

/** Category → the real situation the scene trains, used for the "why" line. */
function categoryRealityAr(category: string | null | undefined, goal: LearnerGoal | null | undefined): string {
  const value = String(category || '').toLowerCase();
  if (value.includes('health') || value.includes('doctor')) return 'ستحتاج هذه الجُمل في العيادة أو الصيدلية';
  if (value.includes('housing') || value.includes('apartment')) return 'هذه هي نفس الأسئلة التي سيسألها المالك';
  if (value.includes('work') || value.includes('career') || value.includes('job'))
    return goal === 'exam'
      ? 'صيغة قريبة مما يظهر في امتحان العمل'
      : 'هذه محادثة حقيقية في العمل أو المقابلة';
  if (value.includes('travel') || value.includes('transport')) return 'ستستخدمها في المحطة عندما تحتاج مساعدة';
  if (value.includes('official') || value.includes('document')) return 'هذه هي اللغة التي تسمعها في الدوائر الرسمية';
  if (value.includes('food') || value.includes('cafe') || value.includes('daily'))
    return 'موقف يومي تتكرر فيه هذه الجُمل';
  // V23: the new module categories get their own honest "why" lines.
  if (value.includes('exam')) return 'تدريب بأسلوب الامتحان — ليس الامتحان الرسمي، لكنه يقيس الشيء نفسه';
  if (value.includes('study')) return 'لغة الدرس والجامعة التي ستحتاجها في أول أسبوع';
  if (value.includes('visa')) return 'أسئلة التأشيرة والإقامة بالجمل التي تسمعها فعلاً في السفارة';
  if (value.includes('services')) return 'مكالمة موفّر خدمة — بالضبط ما ستحتاجه لتصفير موعد';
  if (value.includes('trades')) return 'لغة الورشة والصيانة التي تصلح كل موقف فني في بيتك';
  if (value.includes('basics')) return 'الأساسيات التي يتكرر عليها كل يوم';
  return 'موقف حقيقي ستخوضه بالألمانية';
}

/**
 * Why today's mission matters — one line, tied to the mission that was actually
 * chosen. Never generic encouragement: if the mission is review, the reason is
 * memory decay; if it is a scene, the reason is the real situation.
 */
export function missionReasonAr(
  plan: DailyMissionPlan,
  context: Pick<JourneyInput, 'goal' | 'arrivalStatus'>,
  scenario?: { id?: string; category?: string | null } | null,
): string {
  // The opening scene gets its own reason: it is not "a daily situation", it is
  // the first thing the learner's story asks of them.
  if (plan.kind !== 'review' && plan.kind !== 'continue' && scenario?.id === INTRO_SCENARIO_ID) {
    return 'أول موقف في القصة — قاعة القدوم في المطار، حيث تبدأ رحلة كل متعلّم.';
  }
  switch (plan.kind) {
    case 'review': {
      const count = plan.dueCount || 0;
      return count === 1
        ? 'عنصر واحد على وشك أن يُنسى — تثبيته الآن يوفّر عليك إعادة تعلّمه.'
        : `${count} عناصر على وشك أن تُنسى — تثبيتها الآن أرخص من إعادة تعلّمها.`;
    }
    case 'continue':
      return 'بدأت هذا المشهد ولم تُكمله — إكماله اليوم هو ما يثبّت ما تعلّمته فيه.';
    case 'weak_skill':
      return 'هذه أضعف مهارة قِسناها عندك — دقائق عليها الآن تغيّر نتيجتك القادمة.';
    case 'daily':
      return categoryRealityAr(scenario?.category, context.goal);
    case 'new':
      return 'أول مرة تخوض هذا الموقف — أسهل مما يبدو، ولن تُترك وحدك فيه.';
    default:
      return 'المحتوى غير محفوظ على هذا الجهاز بعد — نحتاج اتصالاً واحداً لتنزيله.';
  }
}

export interface KatzuLineInput {
  context: JourneyContext;
  plan: DailyMissionPlan;
  /** True when the browser reports no connection. */
  offline: boolean;
  /** True when a cached mission is available and usable offline. */
  cachedMission: boolean;
}

/**
 * Katzu's one contextual line on Journey Home.
 *
 * State-aware, in the mascot's own voice, and never filler: each branch says
 * something the learner can act on or verify. If none of the specific states
 * apply, Katzu says nothing rather than padding the screen with motivation.
 */
export function katzuJourneyLineAr(input: KatzuLineInput): string | null {
  const { context, plan, offline, cachedMission } = input;

  if (offline && cachedMission) {
    return 'بدون اتصال الآن — المهمة محفوظة على جهازك وستعمل كما هي.';
  }
  if (offline && !cachedMission) {
    return 'بدون اتصال، ولا توجد مهمة محفوظة بعد. المراجعة المحفوظة تعمل في كل الأحوال.';
  }
  if (context.isFirstRun) {
    return 'هذه أول مهمة لك. لنبدأ بشيء تخوضه فعلاً في ألمانيا.';
  }
  if (context.daysSinceLastSession >= 3) {
    return `مرّ ${context.daysSinceLastSession} أيام. لنبدأ من شيء تعرفه — بلا ضغط وبلا مقارنة.`;
  }
  if (context.isAllCaughtUp) {
    return 'لا شيء ينتظرك اليوم: أنهيت ما لديك ومراجعتك نظيفة.';
  }
  if (plan.kind === 'review') {
    return 'قبل أي شيء جديد: عندك ما يستحق التثبيت أولاً.';
  }
  if (plan.kind === 'continue') {
    return 'المشهد المفتوح نصفه جاهز — النصف الثاني أسرع مما تتوقع.';
  }
  return null;
}
