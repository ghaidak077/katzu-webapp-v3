/**
 * Character-level diff for the correction card.
 *
 * WHY THIS EXISTS
 * The card used to show the learner's sentence with `line-through`, which is
 * hard to read — the whole sentence reads as deleted even when one letter is
 * wrong. The card now paints the learner's version red and the corrected version
 * green, and highlights only the characters that changed, so the sentence stays
 * readable and the eye lands on the fix.
 *
 * Pure and deterministic: two short strings in, two segment lists out. No DOM,
 * no network. Longest-common-subsequence keeps the diff honest for multi-word
 * changes (an inserted article, a removed letter, a swapped `ei`).
 */

export interface DiffSegment {
  text: string;
  /** True when this run is not shared with the other sentence. */
  changed: boolean;
}

export interface SentenceDiff {
  /** Segments of the learner's sentence; `changed` marks what must change. */
  from: DiffSegment[];
  /** Segments of the corrected sentence; `changed` marks what was fixed. */
  to: DiffSegment[];
}

/** LCS table over characters, capped so a pathological input cannot stall a turn. */
function lcsTable(a: string, b: string): number[][] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      table[i][j] =
        a[i - 1] === b[j - 1]
          ? table[i - 1][j - 1] + 1
          : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table;
}

function push(segments: DiffSegment[], text: string, changed: boolean): void {
  if (!text) return;
  segments.push({ text, changed });
}

/**
 * The backward walk appends segments from the end of the sentence toward the
 * start, and each `text` is already in reading order. Reverse the *list* only —
 * never the characters — then merge neighbouring runs of the same kind.
 */
function reverseAndMerge(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    const last = out[out.length - 1];
    if (last && last.changed === segment.changed) last.text += segment.text;
    else out.push({ text: segment.text, changed: segment.changed });
  }
  return out;
}

/**
 * Diff two short sentences character by character.
 *
 * `from` is what the learner wrote, `to` is the corrected sentence. Equal text
 * is one unchanged run, so a correct sentence costs no highlighting.
 */
export function diffSentences(from: string, to: string): SentenceDiff {
  const a = String(from || '');
  const b = String(to || '');
  // Guard: the card never renders more than a sentence or two. If something
  // absurd arrives, return the strings whole rather than build a huge table.
  if (a.length > 400 || b.length > 400) {
    return {
      from: a ? [{ text: a, changed: false }] : [],
      to: b ? [{ text: b, changed: false }] : [],
    };
  }

  const table = lcsTable(a, b);
  const fromSegments: DiffSegment[] = [];
  const toSegments: DiffSegment[] = [];

  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      // Walk back as far as the run of equal characters goes, then emit it.
      let start = 0;
      while (i - start > 0 && j - start > 0 && a[i - start - 1] === b[j - start - 1]) start += 1;
      const run = a.slice(i - start, i);
      push(fromSegments, run, false);
      push(toSegments, run, false);
      i -= start;
      j -= start;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      push(toSegments, b[j - 1], true);
      j -= 1;
    } else {
      push(fromSegments, a[i - 1], true);
      i -= 1;
    }
  }

  // The walk above produced runs in reverse order; flip the lists without
  // touching the characters inside each run.
  return { from: reverseAndMerge(fromSegments), to: reverseAndMerge(toSegments) };
}
