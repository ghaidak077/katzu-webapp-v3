import { describe, expect, it } from 'vitest';
import {
  buildReadout,
  clip,
  extractNext,
  lastVerified,
  manifestCounts,
  plainText,
  section,
  tableRows,
  wrap,
} from '../scripts/session-start.mjs';

/**
 * The session-start readout is how a new run gets oriented without reading the
 * whole tree (`AGENTS.md` §1). Its parsers are pure and pinned here so a change to
 * one of the three documents' shape fails as a test instead of quietly printing a
 * blank or wrong section — the same failure the readout exists to prevent.
 */

describe('plainText / clip / wrap', () => {
  it('strips markdown emphasis and collapses whitespace', () => {
    expect(plainText('  **bold**   `code`\n more ')).toBe('bold code more');
  });

  it('clips on a word boundary with a visible marker, and leaves short text alone', () => {
    expect(clip('short line', 40)).toBe('short line');
    expect(clip('one two three four five', 12)).toBe('one two …');
  });

  it('wraps to the given width without losing a word', () => {
    const lines = wrap('alpha beta gamma delta', 18, '').split('\n');
    expect(lines.every((line) => line.length <= 18)).toBe(true);
    expect(lines.join(' ')).toBe('alpha beta gamma delta');
  });
});

describe('section / tableRows', () => {
  const doc = ['# t', '## A. Facts', '| K | V |', '| --- | --- |', '| a | 1 |', '| b | 2 |', '## B. Next', '| x | y |'].join('\n');

  it('reads a section up to the next heading of the same level', () => {
    expect(section(doc, '## A.')).toContain('| a | 1 |');
    expect(section(doc, '## A.')).not.toContain('## B.');
    expect(section(doc, '## Missing')).toBe('');
  });

  it('drops the header row and any row outside the section', () => {
    expect(tableRows(section(doc, '## A.'))).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });
});

describe('extractNext', () => {
  it('returns the active NEXT block and stops at the first ARCHIVED NEXT', () => {
    const ledger = [
      'old stuff',
      'NEXT (V9): **the old plan.** ARCHIVED NEXT (V8): the older plan.',
      '',
      'NEXT (V26): **the live plan:** do the thing.',
      'ARCHIVED NEXT (V24): shipped.',
    ].join('\n');
    const next = extractNext(ledger);
    expect(next).toContain('the live plan');
    expect(next).not.toContain('the old plan');
    expect(next).not.toContain('shipped');
  });

  it('handles a ledger with no NEXT block', () => {
    expect(extractNext('nothing here')).toBeNull();
  });
});

describe('APP-MAP helpers', () => {
  it('counts every manifest block and reports Last verified', () => {
    const appMap = [
      '## 9. Environments',
      '| Thing | Value |',
      '| --- | --- |',
      '| App | https://example.test |',
      '*Last verified: 2026-10-02 (V26).*',
      '```appmap-routes',
      '/',
      '/app',
      '```',
      '```appmap-screens',
      'src/a/Screen.tsx',
      '```',
      '```appmap-endpoints',
      '/health',
      '```',
      '```appmap-tables',
      'users',
      '```',
    ].join('\n');
    expect(manifestCounts(appMap)).toEqual({ routes: 2, screens: 1, endpoints: 1, tables: 1 });
    expect(lastVerified(appMap)).toBe('2026-10-02 (V26).');
  });
});

describe('buildReadout (against the real repo documents)', () => {
  const readout = buildReadout(new Date('2026-10-02T00:00:00Z'));

  it('prints all four sections in the documented order', () => {
    const order = ['GIT', 'LEDGER NEXT', 'APP-MAP §9', 'MEMORY §A'];
    const positions = order.map((heading) => readout.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('includes the live deploy targets and the manifest counts', () => {
    expect(readout).toContain('https://katzu-webapp-v3.pages.dev');
    expect(readout).toMatch(/manifest: \d+ routes · \d+ screens · \d+ endpoints · \d+ tables/);
  });

  it('surfaces a canonical fact and a real ledger NEXT', () => {
    expect(readout).toContain('MAX_FREE_AI_SESSIONS');
    expect(readout).toMatch(/NEXT \(V\d/);
  });

  it('stays a short readout, not a document dump', () => {
    // The whole point is orientation in a glance; if this grows past a screen or
    // two it has become another document nobody reads.
    expect(readout.split('\n').length).toBeLessThan(70);
    expect(readout.length).toBeLessThan(9000);
  });
});
