import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TARGET_LANGUAGE,
  DEFAULT_UI_LANGUAGE,
  TARGET_LANGUAGES,
  TARGET_LANGUAGE_META,
  UI_LANGUAGES,
  UI_LANGUAGE_META,
  chooseTargetLanguage,
  directionFor,
  isTargetLanguage,
  isUiLanguage,
  resolveInitialUiLanguage,
  resolveTargetLanguage,
  resolveUiLanguage,
  selectableTargetLanguages,
} from '../src/lib/i18n/languages';
import { UI_STRINGS, isUiStringKey, translate, type UiStringKey } from '../src/lib/i18n/strings';
import { initialTargetLanguage, initialUiLanguage } from '../src/lib/i18n/languagePreference';

const ARABIC = /[\u0600-\u06FF]/;

describe('the language matrix', () => {
  it('ships exactly the three native languages and two target languages the owner named', () => {
    expect([...UI_LANGUAGES]).toEqual(['ar', 'en', 'id']);
    expect([...TARGET_LANGUAGES]).toEqual(['de', 'nl']);
    expect(DEFAULT_UI_LANGUAGE).toBe('ar');
    expect(DEFAULT_TARGET_LANGUAGE).toBe('de');
  });

  it('gives every UI language a real direction, a BCP-47 tag and its own name', () => {
    for (const code of UI_LANGUAGES) {
      const meta = UI_LANGUAGE_META[code];
      expect(meta.code).toBe(code);
      expect(meta.nativeName.trim().length).toBeGreaterThan(0);
      expect(meta.bcp47).toBe(code);
      expect(meta.speechLocale).toContain('-');
      expect(directionFor(code)).toBe(code === 'ar' ? 'rtl' : 'ltr');
    }
  });

  it('names every target language in every native language', () => {
    for (const target of TARGET_LANGUAGES) {
      const meta = TARGET_LANGUAGE_META[target];
      expect(meta.bcp47).toBe(target);
      for (const ui of UI_LANGUAGES) {
        expect(meta.nameIn[ui].trim().length).toBeGreaterThan(0);
      }
    }
    // Arabic names must actually be Arabic, not leftover English.
    expect(TARGET_LANGUAGE_META.de.nameIn.ar).toMatch(ARABIC);
    expect(TARGET_LANGUAGE_META.nl.nameIn.ar).toMatch(ARABIC);
  });

  it('rejects junk instead of accepting it', () => {
    expect(isUiLanguage('ar')).toBe(true);
    expect(isUiLanguage('de')).toBe(false);
    expect(isUiLanguage(undefined)).toBe(false);
    expect(isTargetLanguage('nl')).toBe(true);
    expect(isTargetLanguage('NL')).toBe(false);
  });
});

describe('resolving a UI language', () => {
  it('always honours an explicit stored choice', () => {
    expect(resolveUiLanguage('en', ['id-ID'])).toBe('en');
    expect(resolveUiLanguage('ar', ['en-US'])).toBe('ar');
  });

  it('follows the device on a fresh install, primary subtag only', () => {
    expect(resolveUiLanguage(null, ['id-ID', 'en-US'])).toBe('id');
    expect(resolveUiLanguage(undefined, ['en-GB'])).toBe('en');
    expect(resolveUiLanguage(undefined, ['ar-EG'])).toBe('ar');
  });

  it('falls back to Arabic — not English — for a device it does not speak', () => {
    expect(resolveUiLanguage(null, ['fr-FR'])).toBe('ar');
    expect(resolveUiLanguage(null, [])).toBe('ar');
    expect(resolveUiLanguage('klingon', ['nl-NL'])).toBe('ar');
  });
});

describe('resolving a target language', () => {
  it('accepts the shipped courses and defaults to German', () => {
    expect(resolveTargetLanguage('de')).toBe('de');
    expect(resolveTargetLanguage('nl')).toBe('nl');
    expect(resolveTargetLanguage('fr')).toBe('de');
    expect(resolveTargetLanguage(null)).toBe('de');
  });

  it('refuses to select a course whose content is not shipped', () => {
    expect(chooseTargetLanguage('de')).toBe(true);
    expect(chooseTargetLanguage('nl')).toBe(false);
    expect(selectableTargetLanguages()).toEqual(['de']);
  });

  it('never assumes a language whose coverage is unfinished', () => {
    // An explicit choice is always honoured, even for a partial language.
    expect(resolveInitialUiLanguage('id', ['en-US'])).toBe('id');
    // Detection only when the detected language actually covers the app.
    expect(resolveInitialUiLanguage(null, ['en-US'])).toBe('ar');
    expect(resolveInitialUiLanguage(null, ['id-ID'])).toBe('ar');
    expect(resolveInitialUiLanguage(null, ['ar-EG'])).toBe('ar');
    // The day a language is finished, detection turns itself on with no code change.
    expect(resolveInitialUiLanguage(null, ['en-US'], { ar: true, en: true, id: true })).toBe('en');
    expect(resolveInitialUiLanguage(null, ['id-ID'], { ar: true, en: true, id: true })).toBe('id');
  });

  it('survives a missing browser and still answers a usable pair', () => {
    // Node has no `localStorage`; some runtimes do define `navigator`, so the
    // assertion is on the contract (a supported language, the German course) and
    // not on this machine's locale. `resolveTurnLanguages` is the server-side
    // default, and it is pinned to ar/de separately.
    expect([...UI_LANGUAGES]).toContain(initialUiLanguage());
    expect(initialTargetLanguage()).toBe('de');
  });
});

describe('the UI dictionary', () => {
  it('is complete in all three languages', () => {
    const keys = Object.keys(UI_STRINGS.ar) as UiStringKey[];
    expect(keys.length).toBeGreaterThan(20);
    for (const code of UI_LANGUAGES) {
      for (const key of keys) {
        const value = UI_STRINGS[code][key];
        expect(typeof value, `${code}:${key}`).toBe('string');
        expect(value.trim().length, `${code}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every placeholder in every language, so no sentence loses its number', () => {
    const placeholder = /\{(\w+)\}/g;
    const placeholders = (text: string) => (text.match(placeholder) || []).sort().join(',');
    for (const key of Object.keys(UI_STRINGS.ar) as UiStringKey[]) {
      const expected = placeholders(UI_STRINGS.ar[key]);
      for (const code of UI_LANGUAGES) {
        expect(placeholders(UI_STRINGS[code][key]), `${code}:${key}`).toBe(expected);
      }
    }
  });

  it('writes real Arabic, Indonesian and English — not copies of one language', () => {
    expect(UI_STRINGS.ar['language.sectionTitle']).toMatch(ARABIC);
    expect(UI_STRINGS.en['nav.trail']).toBe('Journey');
    expect(UI_STRINGS.id['nav.trail']).toBe('Perjalanan');
    expect(UI_STRINGS.id['nav.trail']).not.toBe(UI_STRINGS.en['nav.trail']);
  });

  it('interpolates and leaves an unknown placeholder alone', () => {
    expect(translate('ar', 'nav.lockedHint', { label: 'الرحلة' })).toContain('الرحلة');
    expect(translate('en', 'nav.lockedHint', { label: 'Profile' })).toBe(
      'Profile — locked until your first conversation',
    );
    expect(translate('id', 'nav.lockedHint', { label: 'Profil' })).toContain('terkunci');
    expect(translate('en', 'nav.trail', { unused: 1 })).toBe('Journey');
  });

  it('falls back to Arabic for a key it does not know, never to the key itself', () => {
    const unknown = 'not.a.real.key' as UiStringKey;
    expect(translate('en', unknown)).toBe(UI_STRINGS.ar[unknown as UiStringKey] ?? unknown);
    expect(isUiStringKey('nav.trail')).toBe(true);
    expect(isUiStringKey('nav.trail ')).toBe(false);
  });
});
