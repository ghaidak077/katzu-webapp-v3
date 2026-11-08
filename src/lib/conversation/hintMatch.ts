/**
 * Did the learner type the sentence the hint offered?
 *
 * A hint is help, not an answer to copy blindly, but when the sent sentence is
 * the offered one (with the personal blanks filled) the turn must be counted as
 * «بتلميح». That is the only bridge between the hint dock and the report.
 *
 * Pure and network-free so the rule can be unit-tested.
 */

/** Lowercase, drop punctuation, collapse whitespace — the comparison surface. */
export function normalizeForHint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"«»„“”()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sentenceMatchesHint(typed: string, hint: string): boolean {
  const t = normalizeForHint(typed);
  const h = normalizeForHint(hint);
  if (!t || !h) return false;
  if (!h.includes('___')) return t === h;

  // A hint with blanks («Ich heiße ___.») can never equal the learner's own
  // sentence: it matches when everything around the blanks matches and the
  // blank was actually filled with something.
  const [before, ...rest] = h.split('___');
  const after = rest.join('___');
  if (!t.startsWith(before)) return false;
  if (after && !t.endsWith(after)) return false;
  const filled = t.slice(before.length, t.length - after.length).replace(/_/g, '').trim();
  return /[a-zäöüß0-9]/i.test(filled);
}
