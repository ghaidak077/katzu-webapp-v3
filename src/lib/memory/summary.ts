import type { CEFRLevel, LearnerGoal, MemoryPatternEntity } from '@/types/models';
import { levelSpecFor } from '@/lib/levels/levelSpec';

/**
 * The ≤150-token memory summary injected into every `/ai/turn` (V21 Phase 3).
 *
 * It rides the EXISTING `learner_memory` allow-listed field the worker has
 * validated and used since V20 — same shape ({ rule, example }[]), same limits
 * (≤10 items, rule ≤200 chars, example ≤200 chars) — so the wire format, the
 * worker's validation and the provider prefix-caching rules are untouched.
 * The only new thing is WHERE the rules come from: the Phase-3 pattern table
 * (recurring mistakes + weak vocabulary) instead of mistakes alone.
 *
 * Selection order (deterministic, mission rules): recurring mistakes by
 * repetition, then weak vocabulary, then the goal/profession line so the tutor
 * can steer the conversation toward what the learner needs German FOR.
 */

export const MEMORY_SUMMARY_TOKEN_BUDGET = 150;

/** Result of selecting the memory for one turn. */
export interface MemorySummary {
  /** The { rule, example }[] items for the existing `learner_memory` field. */
  items: Array<{ rule: string; example?: string }>;
  /** Approximate token cost — the caller can log it; the builder enforces the cap. */
  approxTokens: number;
}

export interface MemorySummaryInput {
  patterns: MemoryPatternEntity[];
  level: CEFRLevel;
  goal?: LearnerGoal | null;
  profession?: 'medical' | 'tech' | 'other' | null;
  scenarioTitleAr?: string;
}

const GOAL_LINE_AR: Record<LearnerGoal, string> = {
  daily_life: 'يحتاج الألمانية للحياة اليومية في ألمانيا',
  work: 'يحتاج الألمانية للعمل',
  university: 'يحتاج الألمانية للدراسة الجامعية',
  exam: 'يستعد لامتحان لغة ألمانية',
};

const PROFESSION_LINE_AR: Record<NonNullable<MemorySummaryInput['profession']>, string> = {
  medical: 'مجال طبي (تمريض/طب)',
  tech: 'مجال تقني (دعم/برمجة)',
  other: 'مجال مهني عام',
};

export function buildMemorySummary(input: MemorySummaryInput): MemorySummary {
  const { patterns, level, goal, profession } = input;
  const mistakePatterns = patterns
    .filter((pattern) => pattern.kind === 'mistake')
    .sort((a, b) => b.count - a.count || a.patternId.localeCompare(b.patternId));
  const vocabPatterns = patterns
    .filter((pattern) => pattern.kind === 'vocab')
    .sort((a, b) => b.count - a.count || a.patternId.localeCompare(b.patternId));

  // The goal/profession line is built FIRST because it is the one line that
  // must never be crowded out: patterns fill what remains. The worker caps the
  // field at 10 items, so a goal reserves one of those slots when it exists.
  const goalParts: string[] = [];
  if (goal && GOAL_LINE_AR[goal]) goalParts.push(GOAL_LINE_AR[goal]);
  if (profession && PROFESSION_LINE_AR[profession]) goalParts.push(PROFESSION_LINE_AR[profession]);
  const goalRule = goalParts.length > 0
    ? `المتعلم ${goalParts.join('، ')} — وجّه المواقف نحو هذا`
    : null;
  const goalCost = goalRule ? approxTokens(goalRule) : 0;

  const items: Array<{ rule: string; example?: string }> = [];
  let tokens = 0;
  // The 10-item ceiling is the worker's allow-list, not a suggestion.
  const itemLimit = goalRule ? 9 : 10;

  // 1. Recurring mistakes, most repeated first. The example is the CORRECTED
  //    German — the tutor re-uses the right shape, never the broken one.
  for (const pattern of mistakePatterns) {
    const rule = pattern.german
      ? `${pattern.labelAr} — الصواب: ${pattern.german}`
      : pattern.labelAr;
    const example = pattern.german || undefined;
    const cost = approxTokens(rule) + (example ? approxTokens(example) : 0);
    if (tokens + cost + goalCost > MEMORY_SUMMARY_TOKEN_BUDGET || items.length >= itemLimit) break;
    items.push({ rule, example });
    tokens += cost;
  }

  // 2. Weak vocabulary, most lapses first, while budget remains.
  for (const pattern of vocabPatterns) {
    if (items.length >= itemLimit) break;
    const rule = pattern.german
      ? `كلمة تكرر نسيانها: ${pattern.german} (${pattern.labelAr})`
      : pattern.labelAr;
    const cost = approxTokens(rule);
    if (tokens + cost + goalCost > MEMORY_SUMMARY_TOKEN_BUDGET) break;
    items.push({ rule });
    tokens += cost;
  }

  // 3. The goal line, always last in the list the tutor reads.
  if (goalRule && tokens + goalCost <= MEMORY_SUMMARY_TOKEN_BUDGET) {
    items.push({ rule: goalRule });
    tokens += goalCost;
  }

  // Level drift guard: the tutor prompt already carries the level caps, so a
  // level the spec does not know falls back to A1 exactly once, here.
  void levelSpecFor(level).speakingSpeed;

  return { items, approxTokens: tokens };
}

/** Rough token estimate: German/Arabic prose averages ~3.5 chars per token. */
export function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(String(text || '').length / 3.5));
}
