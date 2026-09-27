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

export const GOAL_COPY: Record<LearnerGoal, { labelAr: string; hintAr: string }> = {
  daily_life: {
    labelAr: 'الحياة اليومية في ألمانيا',
    hintAr: 'السكن، الطبيب، التسوق، المواصلات',
  },
  work: {
    labelAr: 'العمل أو Ausbildung',
    hintAr: 'المقابلة، زملاء العمل، دوائر العمل',
  },
  university: {
    labelAr: 'الجامعة',
    hintAr: 'التسجيل، المحاضرات، التواصل مع الإدارة',
  },
  exam: {
    labelAr: 'التحضير للامتحان',
    hintAr: 'تمارين Goethe / telc / DTZ بصيغتها الحقيقية',
  },
};

export const ARRIVAL_COPY: Record<ArrivalStatus, string> = {
  preparing: 'ما زلت أستعد للسفر',
  recently_arrived: 'وصلت حديثاً',
  living_in_germany: 'أعيش في ألمانيا بالفعل',
};

export const TARGET_DATE_COPY: Record<TargetDateKind, string> = {
  move: 'تاريخ السفر',
  exam: 'تاريخ الامتحان',
  job: 'موعد العمل أو المقابلة',
};

/**
 * "What have you tried before?" — Katzu asking, not a form field.
 *
 * The answer decides one thing: whether the placement check is the recommended
 * first step or whether the learner can simply start. It never sets a level on
 * its own, because a self-report is not a measurement.
 */
export const PREVIOUS_GERMAN_COPY: Record<PreviousGerman, { labelAr: string; hintAr: string }> = {
  first_time: {
    labelAr: 'لم أجرّب الألمانية قبل',
    hintAr: 'نبدأ من الصفر — وهذا أفضل مكان للبداية',
  },
  some_basics: {
    labelAr: 'تعلّمت قليلاً في المدرسة أو تطبيق',
    hintAr: 'تعرف كلمات وجُملاً — سنقيس أين وصلت بالضبط',
  },
  can_hold: {
    labelAr: 'أستطيع إدارة محادثة بسيطة',
    hintAr: 'مستواك أعلى من البداية — القياس يوفّر عليك وقتاً كبيراً',
  },
};

/**
 * Which ending the placement question recommends, given what the learner said.
 *
 * A first-timer is offered the start of the course, with the check available but
 * not pushed; anyone who has studied before is offered the check first, because
 * starting a learner at A1 on their own say-so is exactly the guess that costs
 * them weeks. Skipping always remains possible — it is a recommendation, not a
 * gate.
 */
export function placementOffer(previous: PreviousGerman | null | undefined): {
  primary: 'start' | 'placement';
  recommendAr: string;
} {
  if (!previous || previous === 'first_time') {
    return {
      primary: 'start',
      recommendAr: 'يمكنك أن تبدأ الآن مباشرة — سنختار معاً من أول مشهد، والقياس متاح في أي وقت.',
    };
  }
  return {
    primary: 'placement',
    recommendAr:
      previous === 'can_hold'
        ? 'قلت إنك تستطيع إدارة محادثة بسيطة — دقيقتان من القياس قد توفّر عليك شهوراً من البداية الخاطئة.'
        : 'قلت إنك تعلّمت شيئاً قبلاً — القياس يحدد نقطة البداية الصحيحة بدقة بدل التخمين.',
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
  daily_life: ['daily', 'life', 'food', 'health', 'housing', 'travel', 'cafe'],
  work: ['work', 'career', 'job', 'ausbildung', 'office', 'interview', 'official', 'document'],
  university: ['study', 'university', 'student', 'campus', 'official', 'document'],
  // Exam preparation is format practice, not a topic: every real-life scenario
  // is legitimate material, so the order stays broad and stable.
  exam: ['official', 'document', 'health', 'housing', 'work', 'daily', 'travel', 'cafe'],
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
  return answers.primaryGoal !== null && answers.arrivalStatus !== null && answers.dailyMinutes !== null;
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
export function describeLearnerLevel(user: Pick<UserEntity, 'cefrLevel' | 'placementCompletedAt' | 'placementSkippedAt'> | null | undefined): {
  levelLabel: string;
  measured: boolean;
  detailAr: string;
} {
  const level = user?.cefrLevel || 'A1';
  if (user?.placementCompletedAt) {
    return { levelLabel: level, measured: true, detailAr: `مستواك المقيس: ${level}` };
  }
  if (user?.placementSkippedAt) {
    return {
      levelLabel: level,
      measured: false,
      detailAr: 'لم تقيس مستواك بعد — نعرض A1 كبداية عملية إلى أن تجري الاختبار التحديدي.',
    };
  }
  return {
    levelLabel: level,
    measured: false,
    detailAr: 'مستواك غير مقيس بعد. ابدأ الاختبار التحديدي (٦ دقائق) لنبني مسارك على قياسك الحقيقي.',
  };
}

/** Levels the mission selector may use for a learner who skipped placement. */
export function effectiveLevelForMission(level: CEFRLevel | undefined): CEFRLevel {
  return level || 'A1';
}
