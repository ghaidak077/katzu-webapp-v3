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
