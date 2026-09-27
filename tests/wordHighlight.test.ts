import { describe, expect, it } from 'vitest';
import { activeWordIndex, speechSegments, speechWordCount } from '@/lib/speech/wordHighlight';

/**
 * Highlighting the word being spoken, at the character the speech engine reported.
 *
 * Two things have to hold or the highlight drifts: the rendered segments must be
 * the input string character for character (or every index after the first odd
 * space is wrong), and a boundary that lands between words must highlight nothing
 * rather than the wrong word.
 */
const german = 'Die Miete beträgt 800 Euro kalt, dazu kommen 150 Euro Nebenkosten.';

describe('speechSegments', () => {
  it('renders back exactly the string the speech engine was given', () => {
    const samples = [
      german,
      '  Guten   Tag  ',
      'Zeile eins\nZeile zwei',
      'Ein Satz.',
      '',
      '   ',
    ];
    for (const sample of samples) {
      const segments = speechSegments(sample);
      expect(segments.map((segment) => segment.text).join(''), sample).toBe(sample);
    }
  });

  it('numbers the words in order and leaves the gaps unnumbered', () => {
    const segments = speechSegments('Guten Tag, Frau Müller!');
    expect(segments.filter((segment) => segment.wordIndex !== null).map((segment) => segment.text)).toEqual([
      'Guten',
      'Tag,',
      'Frau',
      'Müller!',
    ]);
    expect(segments.filter((segment) => segment.wordIndex === null).every((segment) => /^\s+$/.test(segment.text))).toBe(true);
    expect(speechWordCount(segments)).toBe(4);
  });

  it('counts nothing for whitespace-only text', () => {
    expect(speechWordCount(speechSegments('   '))).toBe(0);
  });
});

describe('activeWordIndex', () => {
  const segments = speechSegments(german);

  it('finds the word a reported character position falls inside', () => {
    // "Die Miete beträgt …" — 0 is D of Die, 4 is M of Miete, 10 is b of beträgt.
    expect(activeWordIndex(segments, 0)).toBe(0);
    expect(activeWordIndex(segments, 4)).toBe(1);
    expect(activeWordIndex(segments, 10)).toBe(2);
    // A number is a word of its own (the engine reports a boundary for it), and the
    // last character of a word still belongs to that word.
    expect(activeWordIndex(segments, german.indexOf('800'))).toBe(3);
    const euroAt = german.indexOf('Euro');
    expect(activeWordIndex(segments, euroAt + 'Euro'.length - 1)).toBe(4);
  });

  it('highlights nothing when nothing is being spoken', () => {
    expect(activeWordIndex(segments, null)).toBe(-1);
    expect(activeWordIndex(segments, undefined)).toBe(-1);
    expect(activeWordIndex(segments, Number.NaN)).toBe(-1);
  });

  it('highlights nothing for a position past the end or inside a gap', () => {
    expect(activeWordIndex(segments, german.length + 5)).toBe(-1);
    // The space between "Die" and "Miete" is not a word.
    expect(activeWordIndex(segments, 3)).toBe(-1);
  });

  it('stays correct across the spacing a real sentence has', () => {
    // Two spaces: joining tokens with one space would put every index after this
    // one position out, which is exactly the drift this test exists to catch.
    const spaced = 'Ich  möchte   einen Kaffee';
    const spacedSegments = speechSegments(spaced);
    expect(spacedSegments.map((segment) => segment.text).join('')).toBe(spaced);
    expect(activeWordIndex(spacedSegments, 0)).toBe(0);
    expect(activeWordIndex(spacedSegments, 5)).toBe(1); // "möchte" — after two spaces
    expect(activeWordIndex(spacedSegments, 13)).toBe(-1); // still inside the three-space gap
    expect(activeWordIndex(spacedSegments, 14)).toBe(2); // "einen"
    expect(activeWordIndex(spacedSegments, spaced.indexOf('Kaffee'))).toBe(3);
  });

  it('does not treat an Arabic sentence as one word', () => {
    const arabic = 'أريد قهوة من فضلك';
    const arabicSegments = speechSegments(arabic);
    expect(speechWordCount(arabicSegments)).toBe(4);
    expect(activeWordIndex(arabicSegments, arabic.indexOf('قهوة'))).toBe(1);
  });
});
