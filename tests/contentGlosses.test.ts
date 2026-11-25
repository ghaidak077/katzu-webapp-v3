import { describe, expect, it } from 'vitest';
import { OPENER_GLOSSES } from '@/lib/conversation/openerGlosses.generated';
import { OPENER_GLOSSES_I18N } from '@/lib/conversation/openerGlossesI18n.generated';
import { storedOpenerArabic, storedOpenerGloss } from '@/lib/conversation/opener';
import { WORD_GLOSSARY } from '@/lib/vocabulary/wordGlossary.generated';
import { lookupWord } from '@/lib/vocabulary/wordGloss';
import { UI_LANGUAGES } from '@/lib/i18n/languages';

/**
 * The content layer's promise: no learner reads a language they did not choose.
 *
 * The UI was localised first, but the shipped learning content stayed Arabic —
 * so an English or Indonesian learner met Arabic behind every «translate» panel
 * and on every tapped word. These tests hold the other half of that contract:
 * every opener and every glossary word carries English and Indonesian, the
 * Arabic output is untouched, and the runtime picks by UI language.
 */

const ARABIC = /[\u0600-\u06FF]/;

describe('shipped content glosses', () => {
  it('covers every shipped opener in every UI language', () => {
    const openers = Object.keys(OPENER_GLOSSES);
    expect(openers.length).toBeGreaterThan(500);
    const missing = openers.filter((german) => {
      const entry = OPENER_GLOSSES_I18N[german];
      return !entry || !entry.en?.trim() || !entry.id?.trim();
    });
    expect(missing).toEqual([]);
  });

  it('never ships Arabic inside an English or Indonesian gloss', () => {
    const tainted = Object.entries(OPENER_GLOSSES_I18N).filter(
      ([, entry]) => ARABIC.test(entry.en) || ARABIC.test(entry.id),
    );
    expect(tainted).toEqual([]);
  });

  it('covers every glossary word in every UI language', () => {
    const words = Object.entries(WORD_GLOSSARY);
    expect(words.length).toBeGreaterThan(400);
    const incomplete = words
      .filter(([, gloss]) => !gloss.en?.trim() || !gloss.id?.trim())
      .map(([token]) => token);
    expect(incomplete).toEqual([]);
    expect(ARABIC.test(Object.values(WORD_GLOSSARY).map((g) => g.en).join(' '))).toBe(false);
    expect(ARABIC.test(Object.values(WORD_GLOSSARY).map((g) => g.id).join(' '))).toBe(false);
  });
});

describe('gloss resolution by UI language', () => {
  const opener = 'Hallo! Wie heißt du?';

  it('keeps the Arabic gloss exactly as authored', () => {
    expect(storedOpenerGloss(opener, 'ar')).toBe(storedOpenerArabic(opener));
    expect(ARABIC.test(String(storedOpenerArabic(opener)))).toBe(true);
  });

  it('answers in the learner’s own language', () => {
    expect(storedOpenerGloss(opener, 'en')).toBe("Hello! What's your name?");
    expect(storedOpenerGloss(opener, 'id')).toBe('Halo! Siapa namamu?');
  });

  it('resolves a tapped word in every language, without inventing a meaning', () => {
    const arabic = lookupWord('Kaffee', 'ar');
    const english = lookupWord('Kaffee', 'en');
    const indonesian = lookupWord('Kaffee', 'id');
    expect(arabic?.meaning).toBe(arabic?.ar);
    expect(arabic?.meaning).toMatch(ARABIC);
    expect(english?.meaning).toBe('coffee');
    expect(indonesian?.meaning).toBe('kopi');
    // Unknown text stays unknown: the card's retry state, never a guess.
    expect(lookupWord('xyzzy', 'en')).toBeNull();
  });

  it('gives every UI language a readable meaning for every word', () => {
    const unreadable = Object.keys(WORD_GLOSSARY).flatMap((token) =>
      UI_LANGUAGES.filter((language) => {
        const meaning = lookupWord(token, language)?.meaning;
        return !meaning || !meaning.trim();
      }).map((language) => `${token}:${language}`),
    );
    expect(unreadable).toEqual([]);
  });
});
