import { describe, expect, it } from 'vitest';
import { checkGerman } from '@/lib/conversation/germanChecker';

/**
 * The reported turn «Es gefallt» was answered with a punctuation note instead of
 * a correction. A missing umlaut is a spelling error and must be shown as one.
 */
describe('missing umlaut', () => {
  it('corrects «gefallt» to «gefällt» with a real spelling reason', () => {
    const result = checkGerman('Es gefallt mir hier', 'A1');
    expect(result.corrected).toBe('Es gefällt mir hier');
    const umlaut = result.errors.find((error) => /gefällt/.test(error.to));
    expect(umlaut).toBeTruthy();
    expect(umlaut?.category).toBe('spelling');
    expect(umlaut?.label).toBe('Umlaut fehlt');
    expect(umlaut?.reasonAr.length).toBeGreaterThan(0);
  });

  it('accepts the ASCII transliteration too', () => {
    expect(checkGerman('es gefaellt mir', 'A1').corrected).toBe('Es gefällt mir');
  });

  it('does not "correct" words that are valid without an umlaut', () => {
    // «schon» (already), «mochte» (liked) and «zahlen» (to pay) are real words.
    expect(checkGerman('Ich bin schon hier', 'A1').corrected).toBe('Ich bin schon hier');
    expect(checkGerman('Ich mochte das', 'A1').corrected).toBe('Ich mochte das');
    expect(checkGerman('Wir zahlen jetzt', 'A1').corrected).toBe('Wir zahlen jetzt');
  });

  it('restores several umlauts in one sentence', () => {
    expect(checkGerman('ich wunsche dir gluck', 'A1').corrected).toBe('Ich wünsche dir Glück');
  });
});
