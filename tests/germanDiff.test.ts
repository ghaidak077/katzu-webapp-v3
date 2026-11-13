import { describe, expect, it } from 'vitest';
import { diffSentences } from '../src/lib/conversation/germanDiff';

/**
 * Regression: the backward LCS walk used to reverse the characters inside every
 * merged run, so the card painted `Ich liebe` as `l hcI ... e`. The diff must
 * only reorder the segment list, never the text.
 */

const reconstruct = (segments: { text: string }[]): string =>
  segments.map((segment) => segment.text).join('');

describe('diffSentences', () => {
  it('keeps the learner sentence in reading order', () => {
    const { from } = diffSentences('Ich leibe katze', 'Ich liebe eine Katze.');
    expect(reconstruct(from)).toBe('Ich leibe katze');
  });

  it('keeps the corrected sentence in reading order', () => {
    const { to } = diffSentences('Ich leibe katze', 'Ich liebe eine Katze.');
    expect(reconstruct(to)).toBe('Ich liebe eine Katze.');
  });

  it('marks only the characters that changed', () => {
    const { from, to } = diffSentences('Ich leibe katze', 'Ich liebe eine Katze.');
    const changedFrom = from.filter((segment) => segment.changed).map((s) => s.text).join('');
    const changedTo = to.filter((segment) => segment.changed).map((s) => s.text).join('');
    expect(changedFrom).not.toContain('hcI');
    expect(changedTo).toContain('K');
    expect(changedTo).toContain('eine ');
    expect(changedFrom.length).toBeLessThanOrEqual('Ich leibe katze'.length);
  });

  it('round-trips the greeting sentence', () => {
    const input = 'hallo Frau Meier ich heiße ghaidak';
    const output = 'Hallo Frau Meier, ich heiße Ghaidak.';
    const diff = diffSentences(input, output);
    expect(reconstruct(diff.from)).toBe(input);
    expect(reconstruct(diff.to)).toBe(output);
  });

  it('marks nothing when the sentences are identical', () => {
    const diff = diffSentences('Ich trinke Kaffee.', 'Ich trinke Kaffee.');
    expect(diff.from.every((segment) => !segment.changed)).toBe(true);
    expect(diff.to.every((segment) => !segment.changed)).toBe(true);
    expect(reconstruct(diff.to)).toBe('Ich trinke Kaffee.');
  });

  it('returns the original strings whole when they are too long', () => {
    const long = 'a'.repeat(500);
    const diff = diffSentences(long, long);
    expect(diff.from).toHaveLength(1);
    expect(diff.from[0].text).toHaveLength(500);
  });
});
