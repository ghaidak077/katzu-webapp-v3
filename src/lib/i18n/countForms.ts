/**
 * The Arabic nouns this app counts, in all four agreement forms.
 *
 * One place, so the Arabic can be reviewed by a native speaker as a table
 * rather than hunted through eleven files — and so a new count site cannot
 * invent its own (wrong) forms. The case matters as much as the number: the same
 * noun is nominative standing alone, accusative after a verb, and genitive after
 * a preposition, and the dual changes shape in each.
 *
 * Every form here is the one an Arabic speaker would write; see
 * `tests/arabicPlural.test.ts` for the selection rule and
 * `scripts/design-audit.mjs` for the gate that stops a hard-coded noun after a
 * count from coming back.
 */

import type { ArabicCountForms } from './arabicCount';

/** "3 عناصر" — nominative or bare: "مراجعة اليوم · 3 عناصر" */
export const REVIEW_ITEM_NOM: ArabicCountForms = {
  one: 'عنصر واحد',
  two: 'عنصران',
  few: 'عناصر',
  many: 'عنصراً',
};

/** "راجع 3 عناصر" — accusative, the object of a verb. */
export const REVIEW_ITEM_ACC: ArabicCountForms = {
  one: 'عنصراً واحداً',
  two: 'عنصرين',
  few: 'عناصر',
  many: 'عنصراً',
};

/** "من 3 عناصر" — genitive, after a preposition. */
export const REVIEW_ITEM_GEN: ArabicCountForms = {
  one: 'عنصر واحد',
  two: 'عنصرين',
  few: 'عناصر',
  many: 'عنصراً',
};

/** "3 أخطاء" — nominative: "2 خطآن مسجّلان" is written by the caller's verb. */
export const MISTAKE_NOM: ArabicCountForms = {
  one: 'خطأ واحد',
  two: 'خطآن',
  few: 'أخطاء',
  many: 'خطأً',
};

/** "من 3 أخطاء" — genitive, after من. */
export const MISTAKE_GEN: ArabicCountForms = {
  one: 'خطأ واحد',
  two: 'خطأين',
  few: 'أخطاء',
  many: 'خطأ',
};

/** "3 أيام متتالية" — nominative. */
export const STREAK_DAY_NOM: ArabicCountForms = {
  one: 'يوم متتالٍ',
  two: 'يومان متتاليان',
  few: 'أيام متتالية',
  many: 'يوماً متتالياً',
};

/** "سلسلتك 3 أيام" — accusative, the object of a possessive phrase. */
export const STREAK_DAY_ACC: ArabicCountForms = {
  one: 'يوماً واحداً',
  two: 'يومين',
  few: 'أيام',
  many: 'يوماً',
};

/** "10 دقائق" — nominative. */
export const MINUTE_NOM: ArabicCountForms = {
  one: 'دقيقة',
  two: 'دقيقتان',
  few: 'دقائق',
  many: 'دقيقة',
};

/** "3 تصحيحات سابقة" — nominative. */
export const CORRECTION_NOM: ArabicCountForms = {
  one: 'تصحيح واحد',
  two: 'تصحيحان',
  few: 'تصحيحات',
  many: 'تصحيحاً',
};

/** "3 سجلات" — nominative, for the diagnostics log. */
export const LOG_ENTRY_NOM: ArabicCountForms = {
  one: 'سجل',
  two: 'سجلان',
  few: 'سجلات',
  many: 'سجل',
};

/** "3 جمل" — nominative: "أنتجت 3 جمل في الموقف". */
export const SENTENCE_NOM: ArabicCountForms = {
  one: 'جملة',
  two: 'جملتان',
  few: 'جمل',
  many: 'جملة',
};