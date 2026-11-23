import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_TARGET_LANGUAGE,
  chooseTargetLanguage,
  directionFor,
  type TargetLanguage,
  type TextDirection,
  type UiLanguage,
} from './languages';
import {
  initialTargetLanguage,
  initialUiLanguage,
  writeStoredTargetLanguage,
  writeStoredUiLanguage,
} from './languagePreference';
import { translate, type UiStringKey } from './strings';

/**
 * The one place a React tree learns which languages are in force.
 *
 * Deliberately DB-free and tiny: it is mounted above the landing page, and the
 * landing page must not pay for the database (decision A7). Persistence is the
 * device's `localStorage` (see `languagePreference.ts`); the signed-in profile
 * copy is reconciled separately by `useLanguageProfileSync`, so a blocked or
 * absent IndexedDB can never leave the UI with no language.
 *
 * The provider also owns the two DOM facts a language switch changes: `<html
 * lang>` and `<html dir>`. Everything else in the app already uses logical
 * properties (`start`/`end`), so an English learner gets a real LTR layout
 * rather than an RTL layout with English words in it.
 */

export interface LanguageContextValue {
  uiLanguage: UiLanguage;
  targetLanguage: TargetLanguage;
  dir: TextDirection;
  setUiLanguage: (language: UiLanguage) => void;
  setTargetLanguage: (language: TargetLanguage) => boolean;
  /** Bound translator for the current UI language. */
  t: (key: UiStringKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [uiLanguage, setUiLanguageState] = useState<UiLanguage>(() => initialUiLanguage());
  const [targetLanguage, setTargetLanguageState] = useState<TargetLanguage>(() => initialTargetLanguage());

  const dir = directionFor(uiLanguage);

  // `lang` and `dir` on the document element are what make hyphenation, font
  // fallback, screen-reader pronunciation and logical CSS all agree. Set in an
  // effect so the very first paint (server-rendered HTML, or the pre-hydration
  // shell) keeps `index.html`'s Arabic defaults rather than browning out.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('lang', uiLanguage);
    root.setAttribute('dir', dir);
  }, [uiLanguage, dir]);

  const setUiLanguage = useCallback((language: UiLanguage) => {
    setUiLanguageState(language);
    writeStoredUiLanguage(language);
  }, []);

  const setTargetLanguage = useCallback((language: TargetLanguage) => {
    // A course that is not shipped cannot be selected — the guard lives here, not
    // only in the picker, so no future call site can opt a learner into a
    // language with no lessons behind it.
    if (!chooseTargetLanguage(language)) return false;
    setTargetLanguageState(language);
    writeStoredTargetLanguage(language);
    return true;
  }, []);

  const t = useCallback(
    (key: UiStringKey, vars?: Record<string, string | number>) => translate(uiLanguage, key, vars),
    [uiLanguage],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ uiLanguage, targetLanguage, dir, setUiLanguage, setTargetLanguage, t }),
    [uiLanguage, targetLanguage, dir, setUiLanguage, setTargetLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * The context, or the Arabic default when a component is rendered outside the
 * provider (a dev harness, a unit test, a route mounted in isolation). Returning
 * a working translator instead of throwing keeps a missing provider a cosmetic
 * defect rather than a blank screen.
 */
export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (context) return context;
  return {
    uiLanguage: 'ar',
    targetLanguage: DEFAULT_TARGET_LANGUAGE,
    dir: 'rtl',
    setUiLanguage: () => {},
    setTargetLanguage: () => false,
    t: (key, vars) => translate('ar', key, vars),
  };
}

/** The translator alone, for the many components that only render text. */
export function useT() {
  return useLanguage().t;
}
