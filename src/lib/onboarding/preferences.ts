import type {
  ArrivalStatus,
  CEFRLevel,
  DailyMinuteChoice,
  LearnerGoal,
  PreviousGerman,
  TargetDateKind,
  UserEntity,
} from '@/types/models';
import { DAILY_MINUTE_CHOICES } from '@/types/models';
import type { UiLanguage } from '@/lib/i18n/languages';
import { translate, type UiStringKey } from '@/lib/i18n/strings';

/**
 * Onboarding answers and how they become a persisted profile.
 *
 * Why this is pure: the same rules decide whether a brand-new learner sees the
 * questions, whether a returning learner is asked again, and what the home
 * mission then selects. A rule that lives inside a screen would be re-derived
 * per screen, and the first drift would show a learner questions they already
 * answered.
 *
 * The answers are deliberately few. Every extra question before the first
 * lesson is a reason to leave, and none of these four change what the app can
 * teach — only what it brings forward first.
 */

/** Every goal the app knows, current answers first and legacy ones after them. */
const GOAL_ORDER: LearnerGoal[] = [
  'family',
  'work',
  'study',
  'travel',
  'general',
  // Legacy stored answers, kept so old rows still render their choice.
  'daily_life',
  'university',
  'exam',
];

/** A goal's label and hint in the reader's language. */
export function goalCopy(
  goal: LearnerGoal,
  language: UiLanguage = 'ar',
): { labelAr: string; hintAr: string } {
  return {
    labelAr: translate(language, `onboarding.goal.${goal}.label` as UiStringKey),
    hintAr: translate(language, `onboarding.goal.${goal}.hint` as UiStringKey),
  };
}

export const GOAL_COPY: Record<LearnerGoal, { labelAr: string; hintAr: string }> = GOAL_ORDER.reduce(
  (acc, goal) => ({ ...acc, [goal]: goalCopy(goal) }),
  {} as Record<LearnerGoal, { labelAr: string; hintAr: string }>,
);

/**
 * The one signup question's answers, in order (Phase 4). Legacy values stay in
 * `GOAL_COPY` so old rows still render their stored choice, but they are not
 * offered to a new learner.
 */
export const SIGNUP_GOAL_ORDER: LearnerGoal[] = ['family', 'work', 'study', 'travel', 'general'];

const ARRIVAL_ORDER: ArrivalStatus[] = ['preparing', 'recently_arrived', 'living_in_germany'];

/** Where the learner is in the move, in their language. */
export function arrivalCopy(status: ArrivalStatus, language: UiLanguage = 'ar'): string {
  return translate(language, `onboarding.arrival.${status}` as UiStringKey);
}

export const ARRIVAL_COPY: Record<ArrivalStatus, string> = ARRIVAL_ORDER.reduce(
  (acc, status) => ({ ...acc, [status]: arrivalCopy(status) }),
  {} as Record<ArrivalStatus, string>,
);

const TARGET_DATE_ORDER: TargetDateKind[] = ['move', 'exam', 'job'];

/** The kind of deadline the learner is counting down to. */
export function targetDateCopy(kind: TargetDateKind, language: UiLanguage = 'ar'): string {
  return translate(language, `onboarding.targetDate.${kind}` as UiStringKey);
}

export const TARGET_DATE_COPY: Record<TargetDateKind, string> = TARGET_DATE_ORDER.reduce(
  (acc, kind) => ({ ...acc, [kind]: targetDateCopy(kind) }),
  {} as Record<TargetDateKind, string>,
);

/**
 * "What have you tried before?" — Katzu asking, not a form field.
 *
 * The answer decides one thing: whether the placement check is the recommended
 * first step or whether the learner can simply start. It never sets a level on
 * its own, because a self-report is not a measurement.
 */
const PREVIOUS_ORDER: PreviousGerman[] = ['first_time', 'some_basics', 'can_hold'];

/** "What have you tried before?" in the reader's language. */
export function previousGermanCopy(
  previous: PreviousGerman,
  language: UiLanguage = 'ar',
): { labelAr: string; hintAr: string } {
  return {
    labelAr: translate(language, `onboarding.previous.${previous}.label` as UiStringKey),
    hintAr: translate(language, `onboarding.previous.${previous}.hint` as UiStringKey),
  };
}

export const PREVIOUS_GERMAN_COPY: Record<PreviousGerman, { labelAr: string; hintAr: string }> =
  PREVIOUS_ORDER.reduce(
    (acc, previous) => ({ ...acc, [previous]: previousGermanCopy(previous) }),
    {} as Record<PreviousGerman, { labelAr: string; hintAr: string }>,
  );

/**
 * Which ending the placement question recommends, given what the learner said.
 *
 * A first-timer is offered the start of the course, with the check available but
 * not pushed; anyone who has studied before is offered the check first, because
 * starting a learner at A1 on their own say-so is exactly the guess that costs
 * them weeks. Skipping always remains possible — it is a recommendation, not a
 * gate.
 */
export function placementOffer(
  previous: PreviousGerman | null | undefined,
  language: UiLanguage = 'ar',
): {
  primary: 'start' | 'placement';
  recommendAr: string;
} {
  if (!previous || previous === 'first_time') {
    return {
      primary: 'start',
      recommendAr: translate(language, 'onboarding.recommend.start'),
    };
  }
  return {
    primary: 'placement',
    recommendAr: translate(
      language,
      previous === 'can_hold' ? 'onboarding.recommend.canHold' : 'onboarding.recommend.someBasics',
    ),
  };
}

export const DEFAULT_DAILY_MINUTES: DailyMinuteChoice = 10;
export const DEFAULT_WEEKLY_GOAL_DAYS = 5;

/**
 * Category keywords per goal, in priority order. Matched against the CMS
 * `category` with a loose contains-check on purpose: content categories are
 * edited in D1 by the content team, and a goal that stops matching because a
 * category was renamed `work` to `career_work` would silently fall back to
 * generic order — personalisation that fails invisibly.
 */
const GOAL_CATEGORY_KEYWORDS: Record<LearnerGoal, string[]> = {
  family: ['housing', 'health', 'official', 'document', 'daily', 'food', 'services', 'travel'],
  study: ['study', 'university', 'student', 'campus', 'official', 'document', 'exam', 'visa'],
  travel: ['travel', 'transport', 'station', 'airport', 'daily', 'food', 'services'],
  general: ['daily', 'life', 'food', 'health', 'housing', 'travel', 'cafe', 'basics', 'services'],
  daily_life: ['daily', 'life', 'food', 'health', 'housing', 'travel', 'cafe', 'basics', 'services'],
  work: ['work', 'career', 'job', 'ausbildung', 'office', 'interview', 'official', 'document', 'trades', 'visa'],
  university: ['study', 'university', 'student', 'campus', 'official', 'document', 'exam', 'visa'],
  // Exam preparation is format practice, not a topic: every real-life scenario
  // is legitimate material, so the order stays broad and stable. V23: the new
  // `exam` and `study` categories lead it, so dedicated exam-format content
  // beats generic content once it exists.
  exam: ['exam', 'official', 'document', 'study', 'health', 'housing', 'work', 'daily', 'travel', 'cafe'],
};

export function goalCategoryKeywords(goal: LearnerGoal | null | undefined): string[] {
  return GOAL_CATEGORY_KEYWORDS[goal || 'daily_life'];
}

/** How strongly a scenario's category matches the learner's goal (higher first). */
export function goalMatchScore(category: string | undefined, goal: LearnerGoal | null | undefined): number {
  const value = String(category || '').toLowerCase();
  if (!value) return 0;
  const keywords = goalCategoryKeywords(goal);
  const index = keywords.findIndex((keyword) => value.includes(keyword));
  return index === -1 ? 0 : keywords.length - index;
}

export interface OnboardingAnswers {
  primaryGoal: LearnerGoal | null;
  arrivalStatus: ArrivalStatus | null;
  /** Self-report only: it steers the placement offer, never the level. */
  previousGerman: PreviousGerman | null;
  dailyMinutes: DailyMinuteChoice | null;
  targetDateKind: TargetDateKind | null;
  /** Epoch ms, or null for "no target date". */
  targetDate: number | null;
  weeklyGoalDays: number;
}

export function emptyOnboardingAnswers(): OnboardingAnswers {
  return {
    primaryGoal: null,
    arrivalStatus: null,
    previousGerman: null,
    dailyMinutes: null,
    targetDateKind: null,
    targetDate: null,
    weeklyGoalDays: DEFAULT_WEEKLY_GOAL_DAYS,
  };
}

/** A date the learner typed must be a real, sane future-ish timestamp. */
export function sanitizeTargetDate(kind: TargetDateKind | null, date: number | null, now = Date.now()): number | null {
  if (!kind || date == null) return null;
  if (!Number.isFinite(date)) return null;
  // A target date more than five years out is a typo, not a plan.
  const fiveYears = 5 * 365 * 24 * 60 * 60 * 1000;
  if (date < now - 24 * 60 * 60 * 1000 || date > now + fiveYears) return null;
  return Math.round(date);
}

export function isOnboardingComplete(answers: OnboardingAnswers): boolean {
  // A3: first-run collects only the goal and the daily minutes. Arrival is now an
  // optional later answer (the debrief card), so it must not gate completion.
  return answers.primaryGoal !== null && answers.dailyMinutes !== null;
}

/**
 * The profile patch for a set of answers. Reuses the existing `dailyGoalMinutes`
 * field instead of adding a second one — two fields holding the same number is
 * exactly how "10 minutes today" and "15 minutes today" end up on the same
 * screen.
 */
export function onboardingPatch(answers: OnboardingAnswers, now = Date.now()): Partial<UserEntity> {
  const dailyMinutes =
    answers.dailyMinutes && DAILY_MINUTE_CHOICES.includes(answers.dailyMinutes)
      ? answers.dailyMinutes
      : DEFAULT_DAILY_MINUTES;
  return {
    primaryGoal: answers.primaryGoal || undefined,
    arrivalStatus: answers.arrivalStatus || undefined,
    previousGerman: answers.previousGerman || undefined,
    dailyGoalMinutes: dailyMinutes,
    weeklyGoalDays: Math.min(7, Math.max(1, Math.round(answers.weeklyGoalDays || DEFAULT_WEEKLY_GOAL_DAYS))),
    targetDateKind: answers.targetDateKind || undefined,
    targetDate: sanitizeTargetDate(answers.targetDateKind, answers.targetDate, now) || undefined,
    onboardingCompletedAt: now,
    updatedAt: now,
  };
}

/**
 * Who still needs onboarding: only a signed-in learner who has never completed
 * it. Existing users (rows written before this existed) have no
 * `onboardingCompletedAt`, so they are asked once, from Profile or on next
 * launch — never blocked, never asked twice.
 */
export function needsOnboarding(user: Pick<UserEntity, 'isLoggedIn' | 'onboardingCompletedAt'> | null | undefined): boolean {
  if (!user?.isLoggedIn) return false;
  return !user.onboardingCompletedAt;
}

/**
 * The placement question: the learner either takes the existing check or
 * explicitly skips it, in which case their level stays *unmeasured* — it is
 * never silently assumed to be A1 and never silently called mastered.
 */
export type PlacementChoice = 'take' | 'skip';

export function placementSkipPatch(now = Date.now()): Partial<UserEntity> {
  return { placementSkippedAt: now, updatedAt: now };
}

/** How a level should be spoken about, including the unmeasured case. */
export function describeLearnerLevel(
  user: Pick<UserEntity, 'cefrLevel' | 'placementCompletedAt' | 'placementSkippedAt'> | null | undefined,
  language: UiLanguage = 'ar',
): {
  levelLabel: string;
  measured: boolean;
  detailAr: string;
} {
  const level = user?.cefrLevel || 'A1';
  if (user?.placementCompletedAt) {
    return {
      levelLabel: level,
      measured: true,
      detailAr: translate(language, 'onboarding.level.measured', { level }),
    };
  }
  if (user?.placementSkippedAt) {
    return {
      levelLabel: level,
      measured: false,
      detailAr:
        level === 'A0'
          ? translate(language, 'onboarding.level.skippedZero')
          : translate(language, 'onboarding.level.skippedA1'),
    };
  }
  return {
    levelLabel: level,
    measured: false,
    detailAr: translate(language, 'onboarding.level.unmeasured'),
  };
}

/** Levels the mission selector may use for a learner who skipped placement. */
export function effectiveLevelForMission(level: CEFRLevel | undefined): CEFRLevel {
  return level || 'A1';
}
