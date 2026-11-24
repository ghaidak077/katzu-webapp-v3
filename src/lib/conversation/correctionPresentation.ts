import type { CorrectionCategory, CorrectionError } from './germanChecker';
import { translate } from '@/lib/i18n/strings';
import type { UiLanguage } from '@/lib/i18n/languages';

/**
 * How the correction card presents itself.
 *
 * WHY THIS EXISTS
 * The card is collapsed by default — deliberately, so it does not interrupt the
 * conversation. The summary read «تصحيح صغير» ("small correction") for every
 * correction, including a wrong verb form, so a beginner who wrote «ist nicht
 * gekommen» was told they had made a small correction and had to guess that a
 * tap would show the fix. A meaning or grammar correction is not small: it opens
 * by itself and says what it is. Spelling and capitalisation stay quiet.
 */
const MAJOR_CATEGORIES: ReadonlySet<CorrectionCategory> = new Set(['grammar', 'meaning']);

type CategoryOnly = Pick<CorrectionError, 'category'>;

/** True when the correction changes grammar or meaning, not just letters. */
export function correctionNeedsOpening(errors: ReadonlyArray<CategoryOnly>): boolean {
  return errors.some((error) => MAJOR_CATEGORIES.has(error.category));
}

/** The summary line: honest about size, without a second place to change copy. */
export function correctionSummaryLabel(errors: ReadonlyArray<CategoryOnly>, language: UiLanguage = 'ar'): string {
  return correctionNeedsOpening(errors) ? translate(language, 'conv.correction') : translate(language, 'conv.smallCorrection');
}
