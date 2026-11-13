/**
 * When does a correction chip show?
 *
 * The roleplay model reads the learner's intended sentence and returns it
 * corrected in `understood_de`. That is the only sentence the chip may display:
 * it is what the learner meant, not a rewritten lesson. Two cheap rules keep the
 * chip honest (2026-11-08):
 *
 *  - a difference of case or punctuation alone is not a correction — «hallo» and
 *    «Hallo!» are the same sentence;
 *  - a large rewrite is not a correction either. If the model paraphrased the
 *    sentence instead of fixing it, the card would teach a sentence the learner
 *    never wrote, so the chip stays closed and the report keeps the
 *    deterministic corrector's own fix.
 *
 * The edit distance is counted on the normalised text (letters, digits, single
 * spaces) and allowed to grow slightly with length, so one typo in a long
 * sentence is still visible while a whole-sentence rewrite is not.
 */

/** Lowercase, keep letters/digits, collapse spaces, drop punctuation. */
export function normalizeForChip(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Character Levenshtein distance — small inputs, so the full matrix is fine. */
export function editDistance(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  let previous = new Array(right.length + 1).fill(0).map((_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[right.length];
}

/** How much of a rewrite is still "the learner's own sentence": 1 char + 1 per 20. */
export function maxChipDistance(normalizedLength: number): number {
  return Math.max(2, Math.ceil(normalizedLength / 5));
}

export interface ChipCorrection {
  /** The learner's sentence exactly as they wrote it. */
  original: string;
  /** The corrected version of the same sentence. */
  corrected: string;
  /** Short Arabic reason, when the model gave one. */
  reasonAr: string;
}

/**
 * The correction the chip may show, or null. Pure and deterministic; the caller
 * renders `corrected` in the existing card's diff and `reasonAr` as its reason.
 */
export function chipCorrectionFor(
  learnerText: string,
  understoodDe: string,
  fixReasonAr = '',
): ChipCorrection | null {
  const original = String(learnerText || '').trim();
  const corrected = String(understoodDe || '').trim();
  if (!original || !corrected) return null;
  const left = normalizeForChip(original);
  const right = normalizeForChip(corrected);
  if (!left || !right || left === right) return null;
  if (editDistance(left, right) > maxChipDistance(left.length)) return null;
  return { original, corrected, reasonAr: String(fixReasonAr || '').trim() };
}
