import { describe, expect, it } from 'vitest';
import { sanitizeHintGerman, sanitizeHints } from '@/lib/conversation/hintSafety';

describe('hint safety', () => {
  it('keeps a clean German sentence', () => {
    expect(sanitizeHintGerman('Ich möchte einen Kaffee, bitte.')).toBe(
      'Ich möchte einen Kaffee, bitte.',
    );
  });

  it('rejects meta labels and model prose', () => {
    expect(sanitizeHintGerman('Hinweis: sag etwas Höfliches')).toBeNull();
    expect(sanitizeHintGerman('Suggestion: Ich nehme den Kuchen.')).toBeNull();
    expect(sanitizeHintGerman('Hier sind zwei Optionen:\n1. Kaffee\n2. Tee')).toBeNull();
    expect(sanitizeHintGerman('')).toBeNull();
    expect(sanitizeHintGerman(undefined)).toBeNull();
  });

  it('rejects an Arabic line in the German field', () => {
    expect(sanitizeHintGerman('Ich nehme das. أنا آخذ هذا')).toBeNull();
  });

  it('turns every placeholder style into the same blank', () => {
    expect(sanitizeHintGerman('Ich heiße [Name].')).toBe('Ich heiße ___.');
    expect(sanitizeHintGerman('Ich trinke {Getränk}.')).toBe('Ich trinke ___.');
    expect(sanitizeHintGerman('Ich wohne in ... .')).toBe('Ich wohne in ___.');
  });

  it('blanks inserted personal data instead of showing it', () => {
    expect(sanitizeHintGerman('Meine E-Mail ist ali@example.com.')).toContain('___');
    expect(sanitizeHintGerman('Meine E-Mail ist ali@example.com.')).not.toContain('example.com');
    expect(sanitizeHintGerman('Meine Nummer ist 0176 1234567.')).not.toContain('1234567');
    expect(sanitizeHintGerman('Ich heiße Ahmed.')).toBe('Ich heiße ___.');
  });

  it('drops unusable hints and de-duplicates the rest', () => {
    const hints = sanitizeHints([
      { german: 'Ich möchte einen Kaffee.', arabic: 'أريد قهوة.' },
      { german: 'Hinweis: model text', arabic: '' },
      { german: 'ich möchte einen kaffee.', arabic: '' },
      { german: '  ', arabic: '' },
    ]);
    expect(hints).toHaveLength(1);
    expect(hints[0].german).toContain('Ich möchte');
    expect(hints[0].arabic).toBe('أريد قهوة.');
  });
});
