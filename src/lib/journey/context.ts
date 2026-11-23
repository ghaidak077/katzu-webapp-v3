import type { ArrivalStatus, CEFRLevel, LearnerGoal } from '@/types/models';
import { INTRO_SCENARIO_ID, type DailyMissionPlan, type MissionScenario } from '@/lib/mission/selectMission';
import { arCount } from '@/lib/i18n/arabicCount';
import { REVIEW_ITEM_NOM } from '@/lib/i18n/countForms';
import type { UiLanguage } from '@/lib/i18n/languages';
import { translate, type UiStringKey } from '@/lib/i18n/strings';
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

/**
 * The five chapters the path is cut into, as dictionary keys.
 *
 * Keys rather than strings because the same chapter title is read by an
 * English, Indonesian and Arabic screen, and a list of Arabic literals here is
 * exactly the kind of copy that stays Arabic after the UI switch — the title is
 * the largest text on the home screen.
 */
const CHAPTER_TITLE_KEYS: UiStringKey[] = [
  'journey.chapter.steps',
  'journey.chapter.daily',
  'journey.chapter.work',
  'journey.chapter.study',
  'journey.chapter.independent',
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
  /** The chapter title in the language the caller asked for. */
  chapterTitle: string;
  /** The Arabic title, kept for the surfaces that still render Arabic only. */
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
export function situationAr(
  input: Pick<JourneyInput, 'goal' | 'arrivalStatus'>,
  language: UiLanguage = 'ar',
): string {
  if (input.arrivalStatus === 'living_in_germany') return translate(language, 'journey.situation.livingInGermany');
  if (input.arrivalStatus === 'recently_arrived') return translate(language, 'journey.situation.arrived');
  if (input.goal === 'exam') return translate(language, 'journey.situation.exam');
  if (input.goal === 'work') return translate(language, 'journey.situation.work');
  if (input.goal === 'university') return translate(language, 'journey.situation.university');
  return translate(language, 'journey.situation.travelling');
}

export function buildJourneyContext(input: JourneyInput, language: UiLanguage = 'ar'): JourneyContext {
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

  // A scenario's own title is Arabic content until the content layer is
  // localised (plan 010 §11), so the chapter key wins whenever the chapter has
  // one; only a chapter past the five named ones falls back to the scene title.
  const chapterKey = CHAPTER_TITLE_KEYS[chapterIndex - 1];
  const chapterTitle = chapterKey
    ? translate(language, chapterKey)
    : chapterScenarios[0]?.title_ar ||
      translate(language, CHAPTER_TITLE_KEYS[CHAPTER_TITLE_KEYS.length - 1]);
  const chapterTitleAr = chapterScenarios[0]?.title_ar
    ? chapterKey
      ? translate('ar', chapterKey)
      : chapterScenarios[0].title_ar
    : translate('ar', CHAPTER_TITLE_KEYS[CHAPTER_TITLE_KEYS.length - 1]);

  return {
    dayNumber,
    daysSinceLastSession,
    chapterIndex,
    chapterCount,
    chapterTitle,
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
function categoryReality(
  category: string | null | undefined,
  goal: LearnerGoal | null | undefined,
  language: UiLanguage,
): string {
  const value = String(category || '').toLowerCase();
  if (value.includes('health') || value.includes('doctor')) return translate(language, 'journey.reality.health');
  if (value.includes('housing') || value.includes('apartment')) return translate(language, 'journey.reality.housing');
  if (value.includes('work') || value.includes('career') || value.includes('job'))
    return translate(language, goal === 'exam' ? 'journey.reality.workExam' : 'journey.reality.work');
  if (value.includes('travel') || value.includes('transport')) return translate(language, 'journey.reality.travel');
  if (value.includes('official') || value.includes('document')) return translate(language, 'journey.reality.official');
  if (value.includes('food') || value.includes('cafe') || value.includes('daily'))
    return translate(language, 'journey.reality.daily');
  // V23: the new module categories get their own honest "why" lines.
  if (value.includes('exam')) return translate(language, 'journey.reality.exam');
  if (value.includes('study')) return translate(language, 'journey.reality.study');
  if (value.includes('visa')) return translate(language, 'journey.reality.visa');
  if (value.includes('services')) return translate(language, 'journey.reality.services');
  if (value.includes('trades')) return translate(language, 'journey.reality.trades');
  if (value.includes('basics')) return translate(language, 'journey.reality.basics');
  return translate(language, 'journey.reality.other');
}

/**
 * "3 items" in the language being read.
 *
 * Arabic needs its four agreement forms (`arCount`); English needs only a
 * singular/plural switch; Indonesian does not inflect the noun at all. Doing it
 * here, once, is what lets one sentence template serve all three.
 */
function countItems(language: UiLanguage, count: number): string {
  if (language === 'ar') return arCount(count, REVIEW_ITEM_NOM);
  return `${count} ${language === 'en' && count !== 1 ? 'items' : 'item'}`;
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
  language: UiLanguage = 'ar',
): string {
  // The opening scene gets its own reason: it is not "a daily situation", it is
  // the first thing the learner's story asks of them.
  if (plan.kind !== 'review' && plan.kind !== 'continue' && scenario?.id === INTRO_SCENARIO_ID) {
    return translate(language, 'journey.reason.intro');
  }
  switch (plan.kind) {
    case 'review': {
      const count = plan.dueCount || 0;
      return translate(
        language,
        count === 1 ? 'journey.reason.reviewOne' : 'journey.reason.reviewMany',
        { items: countItems(language, count), count },
      );
    }
    case 'continue':
      return translate(language, 'journey.reason.continue');
    case 'weak_skill':
      return translate(language, 'journey.reason.weakSkill');
    case 'daily':
      return categoryReality(scenario?.category, context.goal, language);
    case 'new':
      return translate(language, 'journey.reason.new');
    default:
      return translate(language, 'journey.reason.noContent');
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
export function katzuJourneyLineAr(
  input: KatzuLineInput,
  language: UiLanguage = 'ar',
): string | null {
  const { context, plan, offline, cachedMission } = input;

  if (offline && cachedMission) {
    return translate(language, 'journey.katzu.offlineCached');
  }
  if (offline && !cachedMission) {
    return translate(language, 'journey.katzu.offlineNoMission');
  }
  if (context.isFirstRun) {
    return translate(language, 'journey.katzu.firstRun');
  }
  if (context.daysSinceLastSession >= 3) {
    return translate(language, 'journey.katzu.afterBreak', { days: context.daysSinceLastSession });
  }
  if (context.isAllCaughtUp) {
    return translate(language, 'journey.katzu.allCaughtUp');
  }
  if (plan.kind === 'review') {
    return translate(language, 'journey.katzu.review');
  }
  if (plan.kind === 'continue') {
    return translate(language, 'journey.katzu.continue');
  }
  return null;
}
