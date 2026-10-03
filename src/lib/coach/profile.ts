import { CATEGORY_COPY, classifyMistake, type MistakeCategory } from './taxonomy';
import type { MistakeEntity, ReviewItemEntity, SessionEntity } from '@/types/models';
import { arCount, arNoun } from '@/lib/i18n/arabicCount';

/** V31: agreement for every count this file puts in front of a learner. */
const MISTAKE_FORMS = { one: 'خطأ', two: 'خطآن', few: 'أخطاء', many: 'خطأً' } as const;
const REVIEW_ITEM_FORMS = { one: 'عنصر', two: 'عنصرين', few: 'عناصر', many: 'عنصراً' } as const;

/**
 * The learner's error profile: which mistake classes recur, how often, and how
 * much of it they have already put behind them.
 *
 * Honesty rules here matter more than in most screens:
 *  - it reports only what was actually recorded (no invented "strengths"),
 *  - it says so plainly when there is not enough evidence to claim a pattern,
 *  - and it never counts a mastered mistake as an open weakness.
 */

/** Below this, one bad conversation could look like a "pattern". */
const MIN_EVIDENCE = 3;
/** How many categories the profile leads with. */
const TOP_COUNT = 3;

export interface CategoryStat {
  category: MistakeCategory;
  count: number;
  mastered: number;
  open: number;
  /** Share of all recorded mistakes, 0–100. */
  sharePercent: number;
}

export interface MistakeProfile {
  total: number;
  mastered: number;
  open: number;
  categories: CategoryStat[];
  top: CategoryStat[];
  hasEnoughEvidence: boolean;
  headlineAr: string;
  detailAr: string;
}

export function buildMistakeProfile(mistakes: MistakeEntity[]): MistakeProfile {
  const rows = Array.isArray(mistakes) ? mistakes : [];
  const counts = new Map<MistakeCategory, { count: number; mastered: number }>();

  for (const mistake of rows) {
    const category = classifyMistake(mistake.grammarRule, mistake.original, mistake.corrected);
    const current = counts.get(category) || { count: 0, mastered: 0 };
    current.count += 1;
    if (mistake.isMastered) current.mastered += 1;
    counts.set(category, current);
  }

  const total = rows.length;
  const categories: CategoryStat[] = [...counts.entries()]
    .map(([category, { count, mastered }]) => ({
      category,
      count,
      mastered,
      open: count - mastered,
      sharePercent: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    // Ties break on category order so the list cannot jitter between renders.
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const mastered = categories.reduce((sum, stat) => sum + stat.mastered, 0);
  const hasEnoughEvidence = total >= MIN_EVIDENCE;
  const top = categories.slice(0, TOP_COUNT);
  const lead = top[0];

  if (!total) {
    return {
      total: 0,
      mastered: 0,
      open: 0,
      categories,
      top,
      hasEnoughEvidence: false,
      headlineAr: 'لا توجد أخطاء مسجلة بعد',
      detailAr: 'تحدث مع كَاتْزُو في مشهد واحد، وسأبدأ بتتبع ما يتكرر عندك.',
    };
  }

  if (!hasEnoughEvidence) {
    return {
      total,
      mastered,
      open: total - mastered,
      categories,
      top,
      hasEnoughEvidence: false,
      headlineAr: `${arCount(total, MISTAKE_FORMS)} مسجّل حتى الآن`,
      detailAr: 'تحدث أكثر قليلاً، وسأستطيع أن أخبرك بنمط أخطائك بدقة بدلاً من التخمين.',
    };
  }

  const leadCopy = CATEGORY_COPY[lead.category];
  return {
    total,
    mastered,
    open: total - mastered,
    categories,
    top,
    hasEnoughEvidence: true,
    headlineAr: `أكثر ما يتكرر عندك: ${leadCopy.labelAr}`,
    detailAr:
      `من ${arCount(total, MISTAKE_FORMS)} مسجّلة، ${lead.sharePercent}% منها في ${leadCopy.labelAr}` +
      (mastered > 0 ? ` — وقد أتقنت ${arNoun(mastered, MISTAKE_FORMS)} منها بالفعل.` : '.'),
  };
}

/** How much of the learner's error history the tutor is told about per turn.
 *  The worker validates the same shape (≤10 items, ≤200 chars each). */
const MEMORY_LIMIT = 6;

/** A rule the learner keeps breaking, as the tutor is told it. */
export interface LearnerMemoryItem {
  rule: string;
  example?: string;
}

/**
 * The tutor's memory of this learner, sent with the turn as `learner_memory`.
 *
 * The conversation endpoint has accepted and validated that field since it was
 * written, and nothing ever produced it: the app recorded every correction and
 * then asked the model to teach a stranger, every turn, forever. This is the
 * producer.
 *
 * Grouped by the rule's own wording rather than by category, because the model is
 * told to keep correcting a repeated error the same way, and the wording it sees
 * is what it can stay consistent with. Spelling-only corrections are dropped —
 * "you mistyped für" is not worth a tutor's attention — and a rule whose every
 * instance is mastered is dropped too, since there is nothing left to target.
 */
export function buildLearnerMemory(
  mistakes: MistakeEntity[],
  limit = MEMORY_LIMIT,
): LearnerMemoryItem[] {
  // Oldest first so the newest failing sentence wins the example.
  const rows = [...(Array.isArray(mistakes) ? mistakes : [])].sort(
    (a, b) => (a?.timestamp || 0) - (b?.timestamp || 0),
  );
  const groups = new Map<string, { rule: string; count: number; mastered: number; example?: string }>();

  for (const mistake of rows) {
    const rule = (mistake?.grammarRule || '').trim();
    if (!rule) continue;
    if (classifyMistake(rule, mistake.original, mistake.corrected) === 'spelling') continue;
    const key = rule.toLowerCase();
    const group = groups.get(key) || { rule, count: 0, mastered: 0, example: undefined };
    group.count += 1;
    if (mistake.isMastered) group.mastered += 1;
    const example = (mistake.original || '').trim();
    if (example) group.example = example;
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => group.mastered < group.count)
    // Most repeated first; ties break on the rule text so the same turn cannot
    // produce a different memory each time it is built.
    .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule))
    .slice(0, limit)
    .map(({ rule, example }) => ({ rule, example }));
}

/** A week, in the unit every trend statement below is measured in. */
const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_WINDOW_MS = 7 * DAY_MS;

/** A trend may only be claimed once the history is long enough to mean something. */
export const MIN_TREND_EVIDENCE = 3;

export type TrendDirection = 'improving' | 'worsening' | 'steady' | 'insufficient';

export interface CategoryTrend {
  category: MistakeCategory;
  count: number;
  open: number;
  mastered: number;
  trend: TrendDirection;
  recentCount: number;
  earlierCount: number;
  lastPracticedAt: number | null;
  nextReviewAt: number | null;
  /** The learner's own sentences, newest first — never invented examples. */
  examples: MistakeEntity[];
}

/**
 * The due time of the next scheduled review for a category, matched through the
 * mistake's own identity so the drill button and the schedule agree on what
 * "this category" means.
 */
export function nextReviewAtForCategory(
  mistakes: MistakeEntity[],
  reviewItems: Array<Pick<ReviewItemEntity, 'refId' | 'dueAt' | 'kind' | 'sourceId'>>,
  category: MistakeCategory,
  now = Date.now(),
): number | null {
  const keys = new Set<string>();
  for (const mistake of mistakes) {
    if (classifyMistake(mistake.grammarRule, mistake.original, mistake.corrected) !== category) continue;
    if (mistake.syncId) keys.add(`mistake:${mistake.syncId}`);
    if (mistake.id != null) keys.add(`id:${mistake.id}`);
  }
  const due = (reviewItems || [])
    .filter((item) => item.kind === 'mistake')
    .filter((item) => keys.has(item.refId) || (item.sourceId != null && keys.has(`id:${item.sourceId}`)))
    .map((item) => Number(item.dueAt) || 0)
    .filter((value) => value > now)
    .sort((a, b) => a - b);
  return due.length ? due[0] : null;
}

/**
 * Per-category trend for the coach screen.
 *
 * `improving`/`worsening` compare the last seven days against the seven before
 * them, and are only claimed once at least MIN_TREND_EVIDENCE mistakes exist in
 * that category — a single bad conversation is not a pattern, and telling a
 * learner they are getting worse on that evidence would be both wrong and
 * discouraging.
 */
export function buildCategoryTrends(
  mistakes: MistakeEntity[],
  reviewItems: Array<Pick<ReviewItemEntity, 'refId' | 'dueAt' | 'kind' | 'sourceId'>> = [],
  now = Date.now(),
): CategoryTrend[] {
  const rows = Array.isArray(mistakes) ? mistakes : [];
  const grouped = new Map<MistakeCategory, MistakeEntity[]>();
  for (const mistake of rows) {
    const category = classifyMistake(mistake.grammarRule, mistake.original, mistake.corrected);
    grouped.set(category, [...(grouped.get(category) || []), mistake]);
  }

  return [...grouped.entries()]
    .map(([category, categoryMistakes]): CategoryTrend => {
      const sorted = [...categoryMistakes].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      const recentCount = sorted.filter((mistake) => now - (mistake.timestamp || 0) <= TREND_WINDOW_MS).length;
      const earlierCount = sorted.filter(
        (mistake) =>
          now - (mistake.timestamp || 0) > TREND_WINDOW_MS &&
          now - (mistake.timestamp || 0) <= 2 * TREND_WINDOW_MS,
      ).length;
      const mastered = sorted.filter((mistake) => mistake.isMastered).length;

      let trend: TrendDirection = 'insufficient';
      if (sorted.length >= MIN_TREND_EVIDENCE) {
        if (recentCount === 0 && earlierCount === 0) trend = 'steady';
        else if (recentCount < earlierCount) trend = 'improving';
        else if (recentCount > earlierCount) trend = 'worsening';
        else trend = 'steady';
      }

      return {
        category,
        count: sorted.length,
        open: sorted.length - mastered,
        mastered,
        trend,
        recentCount,
        earlierCount,
        lastPracticedAt: sorted[0]?.timestamp || null,
        nextReviewAt: nextReviewAtForCategory(sorted, reviewItems, category, now),
        examples: sorted.slice(0, 2),
      };
    })
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

export interface WeeklyCoachSummary {
  /** False when there is not enough recorded activity to say anything at all. */
  hasData: boolean;
  improvedAr: string;
  repeatedAr: string;
  nextAr: string;
}

/**
 * "What improved, what repeated, what to practise next" — from recorded data
 * only. With too little evidence it says so instead of inventing a week.
 */
export function buildWeeklyCoachSummary(
  input: {
    mistakes: MistakeEntity[];
    sessions?: Array<Pick<SessionEntity, 'timestamp' | 'accuracyPercent' | 'independentSentences'>>;
    dueReviewCount?: number;
  },
  now = Date.now(),
): WeeklyCoachSummary {
  const mistakes = Array.isArray(input.mistakes) ? input.mistakes : [];
  const sessions = Array.isArray(input.sessions) ? input.sessions : [];
  const sessionsThisWeek = sessions.filter((session) => now - (session.timestamp || 0) <= TREND_WINDOW_MS);

  if (mistakes.length < MIN_TREND_EVIDENCE && sessionsThisWeek.length === 0) {
    return {
      hasData: false,
      improvedAr: '',
      repeatedAr: '',
      nextAr: 'تحتاج أسبوعاً من التدرّب (محادثة أو تدريبين) لأخبرك بما تحسّن فعلاً. لا أريد تخميناً.',
    };
  }

  const trends = buildCategoryTrends(mistakes, [], now);
  const improvedCategories = trends.filter((trend) => trend.trend === 'improving');
  const masteredRecently = mistakes.filter(
    (mistake) => mistake.isMastered && now - (mistake.timestamp || 0) <= TREND_WINDOW_MS,
  ).length;

  const improvedAr = improvedCategories.length
    ? `تحسّن ${improvedCategories.map((trend) => CATEGORY_COPY[trend.category].labelAr).join(' و ')}: أخطاؤك فيه أقل من الأسبوع الماضي.`
    : masteredRecently > 0
      ? `أتقنت ${masteredRecently} خطأً كانت تتكرر عليك — أي أنك لم تعد تكررها.`
      : 'لم يرصد التطبيق تحسّناً قابلاً للقياس هذا الأسبوع بعد. هذا ليس فشلاً؛ فقط لا توجد بعد بيانات تكفي للحكم.';

  const repeated = [...trends]
    .filter((trend) => trend.open > 0 && (trend.trend === 'worsening' || trend.recentCount > 0))
    .sort((a, b) => b.recentCount - a.recentCount || b.open - a.open);
  const repeatLead = repeated[0];

  const repeatedAr = repeatLead
    ? `ما زال يتكرر: ${CATEGORY_COPY[repeatLead.category].labelAr} (${repeatLead.open} خطأً مفتوحاً).`
    : 'لا يوجد نمط يتكرر على أخطائك المفتوحة في هذه الفترة.';

  const nextAr = input.dueReviewCount && input.dueReviewCount > 0
    ? `التالي: ${arCount(input.dueReviewCount, REVIEW_ITEM_FORMS)} مستحق في المراجعة اليوم.`
    : repeatLead
      ? `التالي: تدرّب على ${CATEGORY_COPY[repeatLead.category].labelAr} — أثره في الأسبوع المقبل سيكون مرئياً.`
      : 'التالي: أكمل مشهداً جديداً — سنبني عليه بيانات الأسبوع القادم.';

  return { hasData: true, improvedAr, repeatedAr, nextAr };
}

/**
 * The mistakes to drill for one category, open ones first: a mistake the learner
 * has already mastered should never be the thing they practise again, but it is
 * still useful as a warm-up when there is nothing else.
 */
export function drillForCategory(
  mistakes: MistakeEntity[],
  category: MistakeCategory,
  limit = 10,
): MistakeEntity[] {
  const matching = (Array.isArray(mistakes) ? mistakes : []).filter(
    (mistake) =>
      classifyMistake(mistake.grammarRule, mistake.original, mistake.corrected) === category,
  );
  const open = matching.filter((mistake) => !mistake.isMastered);
  const done = matching.filter((mistake) => mistake.isMastered);
  return [...open, ...done].slice(0, limit);
}
