import { arCount } from '@/lib/i18n/arabicCount';
import { journeyOrderedScenarios } from '@/lib/content/scenarioOrder';

/**
 * The «غداً» line (A4) — what the report says about tomorrow.
 *
 * The screen used to carry a fixed sentence («غداً: مشهد جديد ينتظرك — دقيقتان
 * تكفيان.») that was the same after every episode, which is the one thing a
 * return line cannot be: it told the learner nothing about *their* tomorrow, so
 * it read as decoration and got skipped. This builds the line from two facts the
 * app already has on disk — the next scene in the journey order and how many
 * review items are actually due — so it changes when the learner's situation
 * changes.
 *
 * Pure and total: same input, same output; unknown input degrades to the
 * generic sentence rather than to an empty one (a missing line here would look
 * like a bug, and the generic wording is still true).
 */

/** Arabic agreement for the reviews waiting tomorrow. */
const REVIEW_ITEM_NOM = {
  one: 'مراجعة واحدة',
  two: 'مراجعتان',
  few: 'مراجعات',
  many: 'مراجعة',
} as const;

export interface TomorrowTeaserInput {
  /** The next scene in the learner's journey, when one can be named. */
  nextScenarioTitle?: string | null;
  /** Review items due now — the count the review screen will actually serve. */
  dueCount?: number | null;
}

/** The teaser's two halves, so a screen can style or split them. */
export interface TomorrowTeaser {
  /** «غداً: «المقهى»» — promises something specific, or stays generic. */
  missionAr: string;
  /** «و3 مراجعات في انتظارك — دقيقتان تكفيان.» */
  reviewAr: string;
}

export function buildTomorrowTeaser({ nextScenarioTitle, dueCount }: TomorrowTeaserInput): TomorrowTeaser {
  const title = typeof nextScenarioTitle === 'string' ? nextScenarioTitle.trim() : '';
  const due = Math.max(0, Math.trunc(Number.isFinite(Number(dueCount)) ? Number(dueCount) : 0));

  return {
    missionAr: title ? `غداً: «${title}»` : 'غداً: مشهد جديد من رحلتك',
    reviewAr:
      due > 0
        ? `و${arCount(due, REVIEW_ITEM_NOM)} من جلساتك السابقة في انتظارك — دقيقتان تكفيان.`
        : 'ولا شيء معلّق في المراجعة — دقيقتان لمشهد جديد تكفيان.',
  };
}

/** The teaser as one line, for a surface that renders a single paragraph. */
export function tomorrowTeaserAr(input: TomorrowTeaserInput): string {
  const teaser = buildTomorrowTeaser(input);
  return `${teaser.missionAr}، ${teaser.reviewAr}`;
}

/**
 * The next scene in the journey order after the one just finished.
 *
 * Deliberately journey order, not a re-run of the mission selector: after an
 * episode the learner has just seen the mission card, and naming a *different*
 * scene here than the trail names tomorrow would be two screens disagreeing
 * about the same day. The trail stays the authority on the mission; this only
 * looks one step ahead in the fixed path.
 */
export function nextScenarioAfter<
  T extends { id: string; title?: string | null; category?: string | null; sequence_order?: number | null },
>(scenarios: T[] | undefined | null, currentId: string | null | undefined): { id: string; title: string } | null {
  const ordered = journeyOrderedScenarios(scenarios ?? []);
  if (ordered.length === 0) return null;
  const currentIndex = ordered.findIndex((scenario) => scenario.id === currentId);
  const next = currentIndex === -1 ? ordered[0] : ordered[currentIndex + 1];
  if (!next?.id) return null;
  return { id: String(next.id), title: next.title ? String(next.title) : '' };
}

/** Just the next scene's title, for a surface that only names it. */
export function nextScenarioTitleAfter<
  T extends { id: string; title?: string | null; category?: string | null; sequence_order?: number | null },
>(scenarios: T[] | undefined | null, currentId: string | null | undefined): string | null {
  return nextScenarioAfter(scenarios, currentId)?.title || null;
}
