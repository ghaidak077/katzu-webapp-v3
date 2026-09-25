import { CATEGORY_COPY, classifyMistake, type MistakeCategory } from './taxonomy';
import type { MistakeEntity } from '@/types/models';

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
      headlineAr: `${total} ${total === 1 ? 'خطأ مسجل' : 'أخطاء مسجلة'} حتى الآن`,
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
      `من ${total} خطأً مسجلاً، ${lead.sharePercent}% منها في ${leadCopy.labelAr}` +
      (mastered > 0 ? ` — وقد أتقنت ${mastered} منها بالفعل.` : '.'),
  };
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
