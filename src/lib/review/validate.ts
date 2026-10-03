import type { ReviewDirection, ReviewItemEntity } from '@/types/models';
import { normalizeGermanAnswer } from '@/lib/srs/engine';

// The production word bank is shared with the other production surfaces, so it
// lives in one place; re-exported here to keep this module's public surface
// unchanged.
export { buildWordBank, buildWordBankFrom } from '@/lib/utils/wordBank';

/**
 * The rules a review card must satisfy to be worth showing.
 *
 * WHY THIS FILE EXISTS (V28 Stage 1): the owner's report from real use was that
 * review "contains many mistakes the learner never made, and many questions are
 * illogical, with no clear question or no clear answer." Both symptoms are the
 * same defect — an item was created from data that cannot form a question, and
 * nothing checked before it was shown. A mistake's prompt used to be the bare
 * grammar-rule label (and `صيغة صحيحة` when even that was missing), so the
 * learner saw an Arabic label and was asked to produce a specific German rewrite
 * that was not derivable from anything on screen.
 *
 * So the item contract is now explicit and enforced in one place:
 *   • a clear Arabic prompt (never a placeholder, never a bare German label),
 *   • one expected German answer,
 *   • a direction label, and
 *   • for a correction, the learner's own original (so the task is legible) and
 *     a change that is actually meaningful — not capitalisation, punctuation or
 *     a transliteration the answer normaliser already folds.
 *
 * Everything here is pure so it can be unit-tested without a database, and so
 * the same rule can run at creation time, at adoption time and on the queue.
 */

/**
 * Arabic prompts that carry no question. These are the exact fallbacks the old
 * mistake builder emitted, kept as a list so a regression that reintroduces one
 * fails a test instead of shipping.
 */
export const BANNED_PROMPT_PLACEHOLDERS = ['صيغة صحيحة', 'قواعد نحوية'];

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

/**
 * Arabic-side normalisation for a German→Arabic answer: folds the alef/ya/waw
 * hamza forms, ta marbuta → ha, and drops harakat and tatweel (which Arabic
 * keyboards add invisibly), plus case, punctuation and whitespace.
 */
export function normalizeArabicAnswer(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Grading for the German→Arabic direction. The Arabic meaning is short, so an
 * exact normalised match is 'correct'; every expected word present in the answer
 * is 'close' (the learner understood it, the wording differs).
 */
export function gradeArabicAnswer(expected: string, actual: string): 'correct' | 'close' | 'wrong' {
  const target = normalizeArabicAnswer(expected);
  const given = normalizeArabicAnswer(actual);
  if (!given) return 'wrong';
  if (target === given) return 'correct';
  const targetWords = target.split(' ').filter(Boolean);
  const givenWords = new Set(given.split(' ').filter(Boolean));
  if (targetWords.length > 0 && targetWords.every((word) => givenWords.has(word))) return 'close';
  return 'wrong';
}

/**
 * Did the correction change anything a learner would call a correction?
 *
 * `normalizeGermanAnswer` already folds case, punctuation, whitespace and umlaut
 * transliteration, so if two strings are equal *after* that folding the only
 * difference was style — a full stop, a capital letter, or `fuer` for `für`.
 * That is not a mistake and must not enter the review queue. A real word change
 * (`fertig` → `fertiggestellt`, or a rebuilt clause) survives normalisation.
 */
export function isMeaningfulCorrection(original: string, corrected: string): boolean {
  const before = normalizeGermanAnswer(original);
  const after = normalizeGermanAnswer(corrected);
  if (!after) return false;
  if (!before) return true;
  return before !== after;
}

export interface ReviewValidation {
  ok: boolean;
  reasons: string[];
}

/** Checks one item against the contract above. */
export function validateReviewItem(
  item: Pick<ReviewItemEntity, 'kind' | 'promptAr' | 'answerDe' | 'contextDe'>,
): ReviewValidation {
  const reasons: string[] = [];
  const prompt = String(item.promptAr ?? '').trim();
  const answer = String(item.answerDe ?? '').trim();

  if (prompt.length < 2) reasons.push('prompt_missing');
  else if (!ARABIC_SCRIPT.test(prompt)) reasons.push('prompt_not_arabic');
  if (BANNED_PROMPT_PLACEHOLDERS.some((placeholder) => prompt === placeholder || prompt.startsWith(`${placeholder} `))) {
    reasons.push('prompt_placeholder');
  }
  if (!answer || !normalizeGermanAnswer(answer)) reasons.push('answer_missing');

  if (item.kind === 'mistake') {
    const original = String(item.contextDe ?? '').trim();
    if (!original) reasons.push('mistake_original_missing');
    else if (!isMeaningfulCorrection(original, answer)) reasons.push('correction_not_meaningful');
  }

  return { ok: reasons.length === 0, reasons };
}

/** An item is servable when it is not suppressed and passes the contract. */
export function isServableReviewItem(item: ReviewItemEntity): boolean {
  return !item.suppressed && validateReviewItem(item).ok;
}

/**
 * Drops later duplicates so the same question cannot appear twice in a queue,
 * keyed on kind + normalised prompt + normalised answer. Keeps the first (oldest
 * by the queue's own ordering), which is the one with the most history.
 */
export function dedupeReviewItems<T extends ReviewItemEntity>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.kind}|${normalizeArabicAnswer(item.promptAr)}|${normalizeGermanAnswer(item.answerDe)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * The direction of a word/phrase card, assigned deterministically from its stable
 * refId so the same item keeps the same direction across devices and sessions.
 * Corrections are always produced in German, so callers override this for them.
 */
export function directionFromRefId(refId: string): ReviewDirection {
  let hash = 0;
  for (let index = 0; index < refId.length; index += 1) {
    hash = (hash * 31 + refId.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 2 === 0 ? 'de_to_ar' : 'ar_to_de';
}

/**
 * The context line for a word card: the example sentence with the target word
 * blanked out, so the prompt also shows the word being used (a cloze), never a
 * bare fragment. Returns null when the example does not actually contain the word
 * or the item is not a word with an example.
 */
export function clozeContext(contextDe: string | undefined, answerDe: string): string | null {
  const context = String(contextDe ?? '').trim();
  if (!context) return null;
  const words = normalizeGermanAnswer(answerDe)
    .split(' ')
    .filter((word) => word.length > 1);
  // Blank the longest answer word — the content word, not an article or particle.
  const target = words.sort((a, b) => b.length - a.length)[0];
  if (!target) return null;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\w*\\b`, 'i');
  const probe = normalizeGermanAnswer(context);
  if (!new RegExp(`\\b${escaped}`).test(probe)) return null;
  return context.replace(pattern, '______');
}

