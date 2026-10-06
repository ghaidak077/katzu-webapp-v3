import type { CEFRLevel, LearnerGoal, TargetDateKind } from '@/types/models';
import { countdownLineAr, shouldFeatureCountdown } from '@/lib/mission/examCountdown';
import { dayIndexFor } from '@/lib/utils/dailyMission';
import { goalMatchScore } from '@/lib/onboarding/preferences';
import { arCount } from '@/lib/i18n/arabicCount';

/** V31: agreement for the review mission's CTA. See `arabicCount`. */
const REVIEW_ITEM_ACC_FORMS = { one: 'عنصراً', two: 'عنصرين', few: 'عناصر', many: 'عنصراً' } as const;

/**
 * "What do I do today?" — one deterministic answer, in priority order.
 *
 * The home card used to be a day-rotated scenario chosen with a hardcoded A1
 * pool, so a B1 learner preparing for a job interview was still sent to the
 * bakery, and someone with six overdue review items was offered a new scenario
 * instead of the six things they were about to forget.
 *
 * Priority (fixed by the product rules, tested):
 *   1. review due today
 *   2. continue an unfinished scenario
 *   3. practise the learner's weakest measured skill
 *   4. the story opening (the arrival scene), once, before any rotation
 *   5. today's scheduled scenario mission
 *   6. start a new scenario
 *
 * Everything is pure: same learner state + same date = same plan, on every
 * device and in every test. The screen only renders what this decides.
 */

export interface MissionScenario {
  id: string;
  title_de: string;
  title_ar: string;
  category: string;
}

export interface MissionTrainingRecord {
  scenarioId: string;
  studiedAt: number | null;
  quizAttempted: boolean;
  lastScore: number;
  updatedAt?: number;
}

export interface MissionReviewItem {
  dueAt: number;
  kind: string;
  scenarioId?: string;
}

/** CEFR levels at which each scenario actually has content (phrases/vocabulary). */
export type ScenarioLevelIndex = Record<string, CEFRLevel[]>;

export interface WeakSkillHint {
  skill: 'speaking' | 'listening' | 'writing';
  /** Arabic label for the skill, e.g. "الاستماع". */
  labelAr: string;
  /** Arabic explanation of what to practise. */
  actionAr: string;
}

export interface MissionInput {
  /** The learner's placement level (or the unmeasured default). */
  level: CEFRLevel;
  goal?: LearnerGoal | null;
  scenarios: MissionScenario[];
  training: MissionTrainingRecord[];
  reviewItems?: MissionReviewItem[];
  /** Levels per scenario, derived from real content rows. */
  scenarioLevels?: ScenarioLevelIndex;
  /** Present only when a skill has actually been measured and is the weakest. */
  weakestSkill?: WeakSkillHint | null;
  dailyMinutes?: number;
  /**
   * The learner's own date and what kind of day it is.
   *
   * Only used to attach the countdown line to the plan; it never changes which
   * scenario is chosen. A missing or past date changes nothing at all.
   */
  targetDate?: number | null;
  targetDateKind?: TargetDateKind | null;
  now?: number;
}

export type MissionKind = 'review' | 'continue' | 'weak_skill' | 'daily' | 'new' | 'no_content';

/**
 * The scenario the story opens with.
 *
 * The product's first episode is the arrival itself — the learner lands, and the
 * first German they ever produce is spoken at the airport. This constant is the
 * single place that decision lives: mission selection, chapter ordering and the
 * "why today" line all read it, so the opening can be re-pointed at a different
 * scenario by a content decision rather than a code hunt. When the id is absent
 * from the content (it is not in D1 yet, or the cache is empty), every branch
 * that uses it simply falls through to the normal behaviour.
 */
export const INTRO_SCENARIO_ID = 'airport_arrival';

export interface DailyMissionPlan {
  kind: MissionKind;
  /** Absent for `review` (it opens the review queue) and `no_content`. */
  scenarioId?: string;
  titleDe?: string;
  titleAr?: string;
  /** Arabic one-liner under the title: why this is today's action. */
  subtitleAr: string;
  /** Days-left line, present only inside the last month of an exam. */
  countdownAr?: string;
  /** Arabic label of the single primary button. */
  ctaAr: string;
  /** Honest estimate for the chosen action, in minutes. */
  estimatedMinutes: number;
  dueCount?: number;
}

const READY_SCORE = 80;

/** A scenario is "unfinished" while its quiz never passed. */
function isUnfinished(record: MissionTrainingRecord | undefined): boolean {
  if (!record) return false;
  if (record.studiedAt && !record.quizAttempted) return true;
  return record.quizAttempted && (record.lastScore || 0) < READY_SCORE;
}

const LEVEL_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];

/** Content the learner can actually be taught from at their measured level. */
function levelsAvailable(scenarioId: string, index: ScenarioLevelIndex | undefined): CEFRLevel[] {
  const levels = index?.[scenarioId];
  return Array.isArray(levels) ? levels.filter((level) => LEVEL_ORDER.includes(level)) : [];
}

function hasContent(scenarioId: string, index: ScenarioLevelIndex | undefined): boolean {
  return levelsAvailable(scenarioId, index).length > 0;
}

/**
 * Candidates the learner's level can actually use: exactly their level first;
 * below their level only when nothing at their level exists (a beginner is not
 * given A2 material, but someone with nothing at their level is not stranded).
 */
function levelCandidates(
  scenarios: MissionScenario[],
  index: ScenarioLevelIndex | undefined,
  level: CEFRLevel,
): { exact: MissionScenario[]; lower: MissionScenario[]; any: MissionScenario[] } {
  const any = scenarios.filter((scenario) => hasContent(scenario.id, index));
  const exact = any.filter((scenario) => levelsAvailable(scenario.id, index).includes(level));
  const levelRank = LEVEL_ORDER.indexOf(level);
  const lower = any.filter((scenario) =>
    levelsAvailable(scenario.id, index).some((candidate) => LEVEL_ORDER.indexOf(candidate) < levelRank),
  );
  return { exact, lower, any };
}

/** Goal-matched subset when it is non-empty; otherwise the pool untouched. */
function preferGoal(pool: MissionScenario[], goal: LearnerGoal | null | undefined): MissionScenario[] {
  if (pool.length === 0) return pool;
  const scored = pool
    .map((scenario) => ({ scenario, score: goalMatchScore(scenario.category, goal) }))
    .filter((entry) => entry.score > 0);
  if (scored.length === 0) return pool;
  scored.sort((a, b) => b.score - a.score || a.scenario.id.localeCompare(b.scenario.id));
  return scored.map((entry) => entry.scenario);
}

/** The deterministic rotation index: same date and pool size = same slot. */
function rotationIndex(dayIndex: number, poolSize: number): number {
  return ((dayIndex % poolSize) + poolSize) % poolSize;
}

function minutesForPlan(dailyMinutes: number | undefined, totalItems: number): number {
  if (totalItems > 0 && totalItems * 1.5 < (dailyMinutes || 10)) return Math.max(2, Math.round(totalItems * 1.5));
  if (dailyMinutes === 5) return 5;
  if (dailyMinutes === 20) return 15;
  return 10;
}

/**
 * The one action for today. Never throws on empty content: a learner on a train
 * with an empty cache gets an honest Arabic empty state, not a blank card.
 */
/**
 * The plan, plus the countdown when there is one worth showing.
 *
 * The countdown is attached here rather than inside each branch: a mission is
 * chosen by what the learner should DO today, and the date is a second fact about
 * today, not a reason to change the choice. Wrapping also means one place decides
 * whether the number is shouted (inside the last month, exam only).
 */
export function selectDailyMission(input: MissionInput): DailyMissionPlan {
  const plan = selectMissionAction(input);
  const countdown = countdownLineAr(input?.targetDate, input?.targetDateKind ?? 'exam', input?.now ?? Date.now());
  return shouldFeatureCountdown(input?.targetDate, input?.targetDateKind ?? 'exam', input?.now ?? Date.now())
    ? { ...plan, countdownAr: countdown ?? undefined }
    : plan;
}

function selectMissionAction(input: MissionInput): DailyMissionPlan {
  const {
    level,
    goal,
    scenarios = [],
    training = [],
    reviewItems = [],
    scenarioLevels,
    weakestSkill = null,
    dailyMinutes,
    now = Date.now(),
  } = input || ({} as MissionInput);

  const safeScenarios = Array.isArray(scenarios) ? scenarios : [];
  const safeTraining = Array.isArray(training) ? training : [];

  const dueCount = (Array.isArray(reviewItems) ? reviewItems : []).filter(
    (item) => (Number(item?.dueAt) || 0) <= now,
  ).length;

  // 1. Memory first. Review is the only action whose value decays by ignoring it.
  if (dueCount > 0) {
    return {
      kind: 'review',
      // The count lives in the caller's title («8 عناصر للمراجعة») and the CTA
      // («راجع 8 عناصر الآن»); repeating it in the subtitle said the same thing
      // three times on one card. المراجعة is feminine, so the pronoun is ها.
      subtitleAr: 'حان وقت تثبيتها',
      // V31: this used to read "راجع 3 الآن" — a count with no noun at all,
      // which asks the learner to review three of something unspecified.
      ctaAr: `راجع ${arCount(dueCount, REVIEW_ITEM_ACC_FORMS)} الآن`,
      estimatedMinutes: minutesForPlan(dailyMinutes, dueCount),
      dueCount,
    };
  }

  const trainingByScenario = new Map(safeTraining.map((record) => [record.scenarioId, record]));

  // 2. Continue what is already open: abandoning a half-finished scenario for a
  //    new one is how a trail becomes a museum of started lessons.
  const unfinished = safeScenarios
    .filter((scenario) => isUnfinished(trainingByScenario.get(scenario.id)))
    .map((scenario) => ({
      scenario,
      goalScore: goalMatchScore(scenario.category, goal),
      updatedAt: trainingByScenario.get(scenario.id)?.updatedAt || 0,
    }))
    .sort(
      (a, b) =>
        b.goalScore - a.goalScore || b.updatedAt - a.updatedAt || a.scenario.id.localeCompare(b.scenario.id),
    );
  const nextUnfinished = unfinished[0]?.scenario;
  if (nextUnfinished) {
    const record = trainingByScenario.get(nextUnfinished.id);
    return {
      kind: 'continue',
      scenarioId: nextUnfinished.id,
      titleDe: nextUnfinished.title_de,
      titleAr: nextUnfinished.title_ar,
      subtitleAr: record?.quizAttempted
        ? 'لم تصل بعد إلى حد الإتقان في هذا المشهد — أكمل ما بقي منه.'
        : 'بدأت هذا المشهد ولم تُكمل تدريبه بعد.',
      ctaAr: 'أكمل من حيث توقفت',
      estimatedMinutes: minutesForPlan(dailyMinutes, 0),
    };
  }

  // 3. The weakest measured skill — only if the app has actually measured one.
  if (weakestSkill) {
    return {
      kind: 'weak_skill',
      subtitleAr: `${weakestSkill.labelAr} هو أضعف ما قِسناه عندك حتى الآن.`,
      ctaAr: weakestSkill.actionAr,
      estimatedMinutes: minutesForPlan(dailyMinutes, 0),
    };
  }

  // 4. The story opening. A learner who has never started the arrival scene is
  //    given it before the rotating daily pool, so the first thing they ever
  //    practise is walking into Germany rather than a random day's café. It is
  //    offered once: as soon as the scene has a training record, this branch
  //    stops matching and the normal rotation takes over.
  if (!trainingByScenario.has(INTRO_SCENARIO_ID)) {
    const opening = safeScenarios.find(
      (scenario) => scenario.id === INTRO_SCENARIO_ID && hasContent(scenario.id, scenarioLevels),
    );
    if (opening) {
      return {
        kind: 'daily',
        scenarioId: opening.id,
        titleDe: opening.title_de,
        titleAr: opening.title_ar,
        subtitleAr: 'هذه بداية القصة — أول موقف تخوضه بعد وصولك.',
        ctaAr: 'ابدأ من لحظة الوصول',
        estimatedMinutes: minutesForPlan(dailyMinutes, 0),
      };
    }
  }

  // 5. Today's scenario mission, from the learner's level and goal.
  const { exact, lower, any } = levelCandidates(safeScenarios, scenarioLevels, level);
  const missionPool = preferGoal(exact.length > 0 ? exact : lower.length > 0 ? lower : any, goal);
  if (missionPool.length > 0) {
    const dayIndex = dayIndexFor(new Date(now));
    const scenario = missionPool[rotationIndex(dayIndex, missionPool.length)];
    return {
      kind: 'daily',
      scenarioId: scenario.id,
      titleDe: scenario.title_de,
      titleAr: scenario.title_ar,
      subtitleAr:
        minutesForPlan(dailyMinutes, 0) <= 5
          ? 'مهمة اليوم القصيرة — خمس دقائق تكفي للحفاظ على العادة.'
          : 'مهمة اليوم مختارة من مستواك وهدفك.',
      ctaAr: `ابدأ مهمة اليوم (${minutesForPlan(dailyMinutes, 0)} د)`,
      estimatedMinutes: minutesForPlan(dailyMinutes, 0),
    };
  }

  // 6. A scenario with no content at the learner's level but content elsewhere.
  const notStarted = safeScenarios
    .filter((scenario) => !trainingByScenario.has(scenario.id))
    .sort((a, b) => goalMatchScore(b.category, goal) - goalMatchScore(a.category, goal) || a.id.localeCompare(b.id))[0];
  if (notStarted) {
    return {
      kind: 'new',
      scenarioId: notStarted.id,
      titleDe: notStarted.title_de,
      titleAr: notStarted.title_ar,
      subtitleAr: 'ابدأ مشهداً جديداً — سنكيّف المحتوى مع مستواك أثناء التدريب.',
      ctaAr: 'ابدأ مشهداً جديداً',
      estimatedMinutes: minutesForPlan(dailyMinutes, 0),
    };
  }

  // Nothing usable offline or with an empty cache: say so plainly.
  return {
    kind: 'no_content',
    subtitleAr: 'لا يوجد محتوى متاح على هذا الجهاز بعد. اتصل بالإنترنت مرة واحدة ونزّل المحتوى، ثم عُد.',
    ctaAr: 'تحديث عندما يعود الاتصال',
    estimatedMinutes: 0,
  };
}

/**
 * The mission's own status line, derived from the same evidence the mission was
 * chosen from — used by the scenario card so the learner sees *why* today's
 * choice is today's choice.
 */
export function missionStatusAr(kind: MissionKind): string {
  switch (kind) {
    case 'review':
      return 'مراجعة اليوم';
    case 'continue':
      return 'أكمل مشهداً مفتوحاً';
    case 'weak_skill':
      return 'تدريب على أضعف مهارة';
    case 'daily':
      return 'مهمة اليوم';
    case 'new':
      return 'مشهد جديد';
    default:
      return 'بانتظار المحتوى';
  }
}
