/**
 * Which word is being spoken.
 *
 * `speechSynthesis` reports a `charIndex` on its `boundary` events, relative to the
 * exact string handed to it. The transcript renders that same string, so
 * highlighting the spoken word is a mapping problem — and one worth doing as a
 * pure function, because the mapping has two traps that a screenshot cannot show:
 *
 *  1. **The offsets must be the real ones.** Re-joining tokens with a single space
 *     is what most implementations do, and it shifts every index the moment the
 *     source has a double space, a leading space, or a newline. These segments are
 *     built by slicing the original string, so the concatenation of the segments is
 *     the input, character for character.
 *  2. **A boundary can land between words.** Chrome reports the start of the word
 *     it is about to say, but a pause, a number read aloud, or a voice that reports
 *     punctuation can put the index on a space. Rather than guess, the active word
 *     is the token whose own range contains the index; anything else returns -1 and
 *     the transcript simply keeps the previous word highlighted.
 */

export interface SpeechSegment {
  /** The exact text of this piece, in order. */
  text: string;
  /** Index of the spoken word this piece is, or null for the gaps between words. */
  wordIndex: number | null;
}

/** Anything between two non-space runs: spaces, and nothing else. */
const TOKEN = /\S+/g;

/**
 * Splits text into renderable segments, keeping every character and giving each
 * word-bearing segment its index.
 */
export function speechSegments(text: string): SpeechSegment[] {
  const source = String(text ?? '');
  const segments: SpeechSegment[] = [];
  let cursor = 0;
  let wordIndex = 0;

  TOKEN.lastIndex = 0;
  for (let match = TOKEN.exec(source); match; match = TOKEN.exec(source)) {
    if (match.index > cursor) segments.push({ text: source.slice(cursor, match.index), wordIndex: null });
    segments.push({ text: match[0], wordIndex });
    wordIndex += 1;
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), wordIndex: null });
  return segments;
}

/** How many spoken words the text has — the segments' word count, not a guess. */
export function speechWordCount(segments: readonly SpeechSegment[]): number {
  return segments.reduce((count, segment) => (segment.wordIndex === null ? count : count + 1), 0);
}

/**
 * The word index a character position falls inside, or -1.
 *
 * `charIndex` is what the speech engine reported; null means nothing is being
 * spoken (no highlight at all).
 */
export function activeWordIndex(
  segments: readonly SpeechSegment[],
  charIndex: number | null | undefined,
): number {
  if (charIndex === null || charIndex === undefined || Number.isNaN(charIndex)) return -1;
  let offset = 0;
  for (const segment of segments) {
    const end = offset + segment.text.length;
    if (segment.wordIndex !== null && charIndex >= offset && charIndex < end) return segment.wordIndex;
    offset = end;
  }
  return -1;
}
