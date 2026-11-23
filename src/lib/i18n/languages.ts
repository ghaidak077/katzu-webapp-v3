/**
 * The language matrix Katzu supports, in one pure module.
 *
 * Two independent choices, and keeping them independent is the whole design:
 *
 *   • the **UI language** — the language of everything the app says *to* the
 *     learner (buttons, headings, notes, corrections). Arabic remains the
 *     product's first language; English and Indonesian are peers, not
 *     translations of a hidden English source.
 *   • the **target language** — the language the learner is *learning*. German
 *     is the shipped course. Dutch is defined here and gated: `available` is the
 *     single switch the course content flips when it lands, so the picker and
 *     the AI layer can never disagree about whether Dutch is real yet.
 *
 * Nothing in this module reads the DOM, the database or `localStorage`: it is
 * the table, and `languagePreference.ts` is the storage. That is what lets the
 * whole matrix be unit-tested without a browser.
 */

export type UiLanguage = 'ar' | 'en' | 'id';
export type TargetLanguage = 'de' | 'nl';

export const UI_LANGUAGES = ['ar', 'en', 'id'] as const;
export const TARGET_LANGUAGES = ['de', 'nl'] as const;

export const DEFAULT_UI_LANGUAGE: UiLanguage = 'ar';
export const DEFAULT_TARGET_LANGUAGE: TargetLanguage = 'de';

export type TextDirection = 'rtl' | 'ltr';

export interface UiLanguageMeta {
  code: UiLanguage;
  /** The language's own name, which is what a picker should show. */
  nativeName: string;
  /** Its name in English, for documentation and tests — never the only label. */
  englishName: string;
  dir: TextDirection;
  /** Applied to `<html lang>` so the browser hyphenates and translates correctly. */
  bcp47: string;
  /** Speech synthesis / recognition locale for this language. */
  speechLocale: string;
}

export const UI_LANGUAGE_META: Record<UiLanguage, UiLanguageMeta> = {
  ar: { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl', bcp47: 'ar', speechLocale: 'ar-SA' },
  en: { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', bcp47: 'en', speechLocale: 'en-US' },
  id: { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', dir: 'ltr', bcp47: 'id', speechLocale: 'id-ID' },
};

export interface TargetLanguageMeta {
  code: TargetLanguage;
  /** The language's own name: «Deutsch», «Nederlands». */
  nativeName: string;
  /** How it is called in each UI language, so a picker never shows English to an Arabic reader. */
  nameIn: Record<UiLanguage, string>;
  bcp47: string;
  speechLocale: string;
  /**
   * Whether the COURSE for this language is shipped. German is; Dutch is not yet
   * — the scenarios, vocabulary, grammar and roleplay plans are Phase 2 of
   * `docs/plans/010-multilanguage-master-plan.md`. A learner may see Dutch and
   * read exactly why it is not selectable; the app never pretends to teach a
   * language it has no lessons for.
   */
  available: boolean;
}

export const TARGET_LANGUAGE_META: Record<TargetLanguage, TargetLanguageMeta> = {
  de: {
    code: 'de',
    nativeName: 'Deutsch',
    nameIn: { ar: 'الألمانية', en: 'German', id: 'Jerman' },
    bcp47: 'de',
    speechLocale: 'de-DE',
    available: true,
  },
  nl: {
    code: 'nl',
    nativeName: 'Nederlands',
    nameIn: { ar: 'الهولندية', en: 'Dutch', id: 'Belanda' },
    bcp47: 'nl',
    speechLocale: 'nl-NL',
    available: false,
  },
};

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === 'string' && (UI_LANGUAGES as readonly string[]).includes(value);
}

export function isTargetLanguage(value: unknown): value is TargetLanguage {
  return typeof value === 'string' && (TARGET_LANGUAGES as readonly string[]).includes(value);
}

/** The target languages a learner may actually pick today. */
export function selectableTargetLanguages(): TargetLanguage[] {
  return TARGET_LANGUAGES.filter((code) => TARGET_LANGUAGE_META[code].available);
}

/**
 * Whether this course may be chosen. The single gate both the picker and the
 * provider consult, so an unshipped course cannot be selected by any path.
 */
export function chooseTargetLanguage(language: TargetLanguage): boolean {
  return TARGET_LANGUAGE_META[language]?.available === true;
}

export function directionFor(language: UiLanguage): TextDirection {
  return UI_LANGUAGE_META[language].dir;
}

/**
 * Which UI language an install should start in.
 *
 * An explicit stored choice always wins — a learner who picked English is not
 * asked again. Otherwise the device's own language order decides, because
 * arriving on a phone set to Indonesian and being greeted in Arabic is the exact
 * "this is not for you" impression this feature exists to remove. Arabic is the
 * fallback rather than English: the app's authored content, and the learners it
 * was built around, are Arabic-first.
 */
export function resolveUiLanguage(
  stored: unknown,
  deviceLanguages: readonly string[] = [],
): UiLanguage {
  if (isUiLanguage(stored)) return stored;
  for (const raw of deviceLanguages) {
    const primary = String(raw || '').trim().toLowerCase().split(/[-_]/)[0];
    if (isUiLanguage(primary) && primary !== 'ar') return primary;
  }
  return DEFAULT_UI_LANGUAGE;
}

/** A stored target language, or German — the only course that is complete. */
export function resolveTargetLanguage(stored: unknown): TargetLanguage {
  if (isTargetLanguage(stored)) return stored;
  return DEFAULT_TARGET_LANGUAGE;
}

/**
 * Which UI languages are finished enough to be chosen FOR a learner.
 *
 * Device-language detection is only kind when the detected language actually
 * covers the screen the learner lands on. Arabic does. English and Indonesian
 * cover the chrome today (Phase 1b translates the rest screen by screen), so a
 * phone set to English would otherwise open a page that is half English and
 * half Arabic — the exact impression a language feature exists to prevent. So
 * detection is gated on this table: an unfinished language is still fully
 * selectable by hand (a learner may prefer it), it is just never assumed.
 * Flip a row to `true` when its Phase 1b batches are complete.
 */
export const UI_COVERAGE_COMPLETE: Record<UiLanguage, boolean> = {
  ar: true,
  en: false,
  id: false,
};

/**
 * The language to open in: an explicit choice always wins; then the device's own
 * language, but only when that language is finished; then Arabic.
 */
export function resolveInitialUiLanguage(
  stored: unknown,
  deviceLanguages: readonly string[],
  coverage: Record<UiLanguage, boolean> = UI_COVERAGE_COMPLETE,
): UiLanguage {
  if (isUiLanguage(stored)) return stored;
  const detected = resolveUiLanguage(null, deviceLanguages);
  return coverage[detected] ? detected : DEFAULT_UI_LANGUAGE;
}
