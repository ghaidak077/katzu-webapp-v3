/**
 * The rule label a correction card shows.
 *
 * WHY THIS EXISTS
 * `grammar_rule` is written by the model, and it does not always describe the
 * difference the learner can see: `halo` → `hallo` came back labelled
 * "Groß- und Kleinschreibung" (capitalisation) when the only change is a
 * doubled letter. The two strings are already on screen, so the label is
 * derived from them deterministically, and the model's label is only the
 * fallback for a difference this module cannot classify.
 *
 * The labels stay German on purpose: they name a German spelling rule (the
 * same way "Akkusativ" does), and the card renders them LTR-isolated.
 */

export const CAPITALISATION_LABEL = 'Groß- und Kleinschreibung';

export type CorrectionRuleKind =
  | 'none'
  | 'capitalisation'
  | 'doubled-letter'
  | 'inserted-letter'
  | 'extra-letter'
  | 'substituted-letter'
  | 'fallback';

export interface CorrectionRule {
  label: string;
  kind: CorrectionRuleKind;
}

/**
 * Where `longer` is exactly `shorter` with one character inserted.
 * Returns the index the character occupies in `longer`.
 */
function singleInsertion(longer: string, shorter: string): { index: number; char: string } | null {
  if (longer.length !== shorter.length + 1) return null;

  let index = 0;
  while (index < shorter.length && longer[index] === shorter[index]) index += 1;

  return longer.slice(index + 1) === shorter.slice(index) ? { index, char: longer[index] } : null;
}

/** The first (and only) character that differs between two equal-length strings. */
function singleSubstitution(a: string, b: string): { from: string; to: string } | null {
  if (a.length !== b.length) return null;

  let found: { from: string; to: string } | null = null;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue;
    if (found) return null;
    found = { from: a[index], to: b[index] };
  }
  return found;
}

/**
 * Classify the visible difference between the learner's sentence and the
 * corrected one. Case-insensitive comparison comes first, because "the only
 * change is a capital" is the one rule that must never be guessed at.
 */
export function classifyCorrection(
  original: string | undefined,
  corrected: string | undefined,
): CorrectionRule {
  const from = (original ?? '').trim();
  const to = (corrected ?? '').trim();

  if (!from || !to || from === to) return { label: '', kind: 'none' };

  const lowerFrom = from.toLowerCase();
  const lowerTo = to.toLowerCase();

  if (lowerFrom === lowerTo) {
    return { label: CAPITALISATION_LABEL, kind: 'capitalisation' };
  }

  // The corrected word gained a letter. A letter that repeats its neighbour is
  // the spelling rule ("Doppel-l"), not a generic "one letter" note.
  const added = singleInsertion(lowerTo, lowerFrom);
  if (added) {
    const previous = lowerTo[added.index - 1];
    const next = lowerTo[added.index + 1];
    if (previous === added.char || next === added.char) {
      return { label: `Schreibung: Doppel-${added.char}`, kind: 'doubled-letter' };
    }
    return { label: 'Schreibung: ein Buchstabe', kind: 'inserted-letter' };
  }

  const dropped = singleInsertion(lowerFrom, lowerTo);
  if (dropped) {
    return { label: 'Schreibung: ein Buchstabe zu viel', kind: 'extra-letter' };
  }

  const swapped = singleSubstitution(from, to);
  if (swapped) {
    return { label: `Schreibung: ${swapped.to} statt ${swapped.from}`, kind: 'substituted-letter' };
  }

  return { label: '', kind: 'fallback' };
}

/**
 * The label to render, or '' when the card should show no rule chip.
 * `fallback` is the model's own Arabic or German rule, used only when the
 * strings cannot be classified.
 */
export function correctionRuleLabel(
  original: string | undefined,
  corrected: string | undefined,
  fallback?: string,
): string {
  const result = classifyCorrection(original, corrected);
  if (result.kind === 'fallback') return (fallback ?? '').trim();
  return result.label;
}
