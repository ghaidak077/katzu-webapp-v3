import { describe, expect, it } from 'vitest';
import {
  BEAT_MAX_CHARS,
  BEATS_MAX,
  BEATS_MIN,
  beatsInstruction,
  deriveConversationBeats,
} from '../cloudflare-conversation-beats.js';

/**
 * The deterministic conversation beats (V28 Stage 1).
 *
 * These pin the two properties the feature rests on: the derivation is a pure,
 * order-stable reduction of the scenario's starter phrases (no RNG, same input →
 * same beats), and the prompt line it produces is small and bounded. The beats
 * themselves are what stop the chat inventing a new conversation every turn.
 */

const phrase = (german: string, sort_order: number) => ({ german, sort_order });

describe('deriveConversationBeats', () => {
  it('returns nothing for empty or unusable input', () => {
    expect(deriveConversationBeats([])).toEqual([]);
    expect(deriveConversationBeats(undefined)).toEqual([]);
    expect(deriveConversationBeats(['', '   '])).toEqual([]);
    expect(deriveConversationBeats([null, 42, { notGerman: true }])).toEqual([]);
  });

  it('accepts plain strings and orders them by the authored sort_order', () => {
    const beats = deriveConversationBeats([
      phrase('Wie viel kostet das?', 3),
      phrase('Guten Tag!', 1),
      phrase('Ich möchte einen Kaffee.', 2),
    ]);
    expect(beats).toEqual(['Guten Tag!', 'Ich möchte einen Kaffee.', 'Wie viel kostet das?']);
  });

  it('de-duplicates case-insensitively and drops blanks and over-long rows', () => {
    const beats = deriveConversationBeats([
      phrase('Guten Tag!', 1),
      phrase('guten tag!', 2),
      phrase('x'.repeat(BEAT_MAX_CHARS + 1), 3),
      phrase('Haben Sie Tee?', 4),
    ]);
    expect(beats).toEqual(['Guten Tag!', 'Haben Sie Tee?']);
  });

  it('keeps 4–8 beats: returns few when few exist, and 8 (first + last kept) when many', () => {
    const few = ['a', 'b', 'c'].map((text, index) => phrase(text, index));
    expect(deriveConversationBeats(few)).toEqual(['a', 'b', 'c']);

    const many = Array.from({ length: 20 }, (_, index) => phrase(`Satz ${index}`, index));
    const beats = deriveConversationBeats(many);
    expect(beats).toHaveLength(BEATS_MAX);
    expect(beats[0]).toBe('Satz 0');
    expect(beats.at(-1)).toBe('Satz 19');
    expect(beats.length).toBeGreaterThanOrEqual(Math.min(BEATS_MIN, 20));
  });

  it('is deterministic — the same rows always give the same beats', () => {
    const rows = Array.from({ length: 12 }, (_, index) => phrase(`Satz ${index}`, index));
    const first = deriveConversationBeats(rows);
    const second = deriveConversationBeats([...rows].reverse());
    expect(second).toEqual(first);
  });
});

describe('beatsInstruction', () => {
  it('adds nothing when there are no beats', () => {
    expect(beatsInstruction([])).toBe('');
    expect(beatsInstruction(['', '  '])).toBe('');
  });

  it('numbers the beats and caps them at BEATS_MAX', () => {
    const beats = Array.from({ length: 12 }, (_, index) => `Satz ${index}`);
    const instruction = beatsInstruction(beats);
    expect(instruction).toContain('SCENARIO BEATS');
    expect(instruction).toContain('1) Satz 0');
    expect(instruction).toContain(`${BEATS_MAX})`);
    expect(instruction).not.toContain(`${BEATS_MAX + 1})`);
  });

  it('never emits a beat longer than the cap', () => {
    const instruction = beatsInstruction(['y'.repeat(500)]);
    expect(instruction).not.toContain('y'.repeat(BEAT_MAX_CHARS + 1));
  });
});
