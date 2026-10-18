import { describe, expect, it } from 'vitest';
import { germanHeadword, germanNounPhrase } from '@/lib/utils/germanNoun';

describe('germanNounPhrase', () => {
  it('adds the article when the noun is bare', () => {
    expect(germanNounPhrase('der', 'Termin')).toBe('der Termin');
  });

  it('never doubles an article already stored in the noun (the "die die …" defect)', () => {
    expect(germanNounPhrase('die', 'die Verletzung')).toBe('die Verletzung');
    expect(germanNounPhrase('der', 'der Reisepass')).toBe('der Reisepass');
    expect(germanNounPhrase('das', 'Das Dokument')).toBe('das Dokument');
  });

  it('keeps a phrase that carries its own article when no article column is set', () => {
    expect(germanNounPhrase(null, 'der Aufenthaltstitel')).toBe('der Aufenthaltstitel');
    expect(germanNounPhrase('', 'gern')).toBe('gern');
  });

  it('returns empty for empty input', () => {
    expect(germanNounPhrase('der', '')).toBe('');
    expect(germanNounPhrase(null, null)).toBe('');
  });
});

describe('germanHeadword', () => {
  it('strips a leading article so a separate article chip is not doubled', () => {
    expect(germanHeadword('der Reisepass')).toBe('Reisepass');
    expect(germanHeadword('eine Rechnung')).toBe('Rechnung');
    expect(germanHeadword('Kaffee')).toBe('Kaffee');
  });
});
