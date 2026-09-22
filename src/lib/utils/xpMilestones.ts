// XP milestone ladder: gives totalXp visible meaning — a named badge, and an
// always-visible "distance to next rank" that pulls the learner forward.
// Pure logic, unit-tested. Thresholds are session-based (roughly 75-125 XP
// per completed session), so ranks land every few sessions at first.

export interface XpMilestone {
  id: string;
  nameAr: string; // Katzu persona tone, roasts German grammar not the learner
  minXp: number;
}

export const XP_MILESTONES: readonly XpMilestone[] = [
  { id: 'sprout', nameAr: 'بذرة كَاتْزُو', minXp: 0 },
  { id: 'meow', nameAr: 'مواء واثق', minXp: 250 },
  { id: 'umlaut', nameAr: 'صياد الأُملاوت', minXp: 750 },
  { id: 'konjunktiv', nameAr: 'قاتل Konjunktiv II', minXp: 1500 },
  { id: 'genitive', nameAr: 'مالك حالة الجر (Genitiv)', minXp: 3000 },
  { id: 'legend', nameAr: 'أسطورة الشارع الألماني', minXp: 6000 },
] as const;

export interface XpRankResult {
  milestone: XpMilestone;
  next: XpMilestone | null; // null when the ladder is complete
  progressPercent: number; // 0-100 toward the next milestone
  xpToNext: number; // 0 when maxed
}

function clampPercent(part: number, whole: number): number {
  if (whole <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}

export function getXpRank(totalXp: number): XpRankResult {
  const xp = Math.max(0, Math.floor(totalXp || 0));
  let milestone = XP_MILESTONES[0];
  for (const candidate of XP_MILESTONES) {
    if (xp >= candidate.minXp) milestone = candidate;
  }
  const index = XP_MILESTONES.indexOf(milestone);
  const next = index < XP_MILESTONES.length - 1 ? XP_MILESTONES[index + 1] : null;

  if (!next) {
    return { milestone, next: null, progressPercent: 100, xpToNext: 0 };
  }
  const span = next.minXp - milestone.minXp;
  return {
    milestone,
    next,
    progressPercent: clampPercent(xp - milestone.minXp, span),
    xpToNext: Math.max(0, next.minXp - xp),
  };
}
