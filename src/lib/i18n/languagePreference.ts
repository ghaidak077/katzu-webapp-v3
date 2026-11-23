/**
 * Where a language choice lives on the device.
 *
 * Deliberately DB-free. The entry bundle renders the landing page and must not
 * pull Dexie in (APP-MAP §3, decision A7), yet it also has to paint in the right
 * language and direction on the very first frame. `localStorage` is synchronous,
 * survives reinstall-free reloads and is readable before React mounts — which is
 * exactly the property needed to avoid a flash of Arabic RTL for an English
 * learner. The signed-in profile row is a *second* copy (`useLanguageProfileSync`)
 * so a learner's choice follows them between devices; this module is the
 * device's own memory and the one the UI reads.
 */

import {
  DEFAULT_TARGET_LANGUAGE,
  DEFAULT_UI_LANGUAGE,
  type TargetLanguage,
  type UiLanguage,
  resolveInitialUiLanguage,
  resolveTargetLanguage,
  resolveUiLanguage,
} from './languages';

export const UI_LANGUAGE_STORAGE_KEY = 'katzu_ui_language';
export const TARGET_LANGUAGE_STORAGE_KEY = 'katzu_target_language';

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Private mode / blocked storage: a language choice is a preference, not a
    // credential — losing it degrades to the device default instead of throwing.
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Non-fatal by design; see `storage()`.
  }
}

/** The device's language preferences, most-preferred first. */
export function deviceLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  const list = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  return list.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export function readStoredUiLanguage(): UiLanguage | null {
  const raw = read(UI_LANGUAGE_STORAGE_KEY);
  return raw === 'ar' || raw === 'en' || raw === 'id' ? raw : null;
}

export function writeStoredUiLanguage(language: UiLanguage): void {
  write(UI_LANGUAGE_STORAGE_KEY, language);
}

export function readStoredTargetLanguage(): TargetLanguage | null {
  const raw = read(TARGET_LANGUAGE_STORAGE_KEY);
  return raw === 'de' || raw === 'nl' ? raw : null;
}

export function writeStoredTargetLanguage(language: TargetLanguage): void {
  write(TARGET_LANGUAGE_STORAGE_KEY, language);
}

/** The language to paint with before anything has been chosen. */
export function initialUiLanguage(): UiLanguage {
  return resolveInitialUiLanguage(readStoredUiLanguage(), deviceLanguages());
}

/** The course in force, before anything has been chosen. */
export function initialTargetLanguage(): TargetLanguage {
  return resolveTargetLanguage(readStoredTargetLanguage() ?? DEFAULT_TARGET_LANGUAGE);
}

/**
 * The pair every network call needs, read synchronously at call time.
 *
 * The conversation turn carries both, so the server can answer in the learner's
 * own language while practising the one they chose. Read here rather than passed
 * through eleven call sites: a stale prop on one screen would silently drop an
 * Indonesian learner back into Arabic explanations mid-episode.
 */
export function currentLanguagePair(): { uiLanguage: UiLanguage; targetLanguage: TargetLanguage } {
  return {
    uiLanguage: readStoredUiLanguage() ?? initialUiLanguage() ?? DEFAULT_UI_LANGUAGE,
    targetLanguage: readStoredTargetLanguage() ?? DEFAULT_TARGET_LANGUAGE,
  };
}
