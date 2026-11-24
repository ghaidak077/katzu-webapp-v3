/**
 * The UI dictionary: every string the app says to the learner, in the three
 * languages it ships in.
 *
 * Why keys and not "translate the Arabic literal": a key names the *meaning*
 * (`language.uiTitle`), so a screen never depends on the exact wording of
 * another language, and a copy change in Arabic does not silently orphan the
 * English. `UiStringKey` is derived from the Arabic table, and the other two are
 * typed `Record<UiStringKey, string>` — so a missing English or Indonesian line
 * is a TypeScript error, not an Arabic sentence appearing in an English screen.
 * `tests/languages.test.ts` holds the same rule at runtime, for the case where
 * someone edits the table through a cast.
 *
 * Arabic stays the reference: it is the product's first language, not a
 * translation. English and Indonesian are written as native copy, not as
 * literal renderings of the Arabic.
 *
 * Scope: this table grows screen by screen (see
 * `docs/plans/010-multilanguage-master-plan.md`, Phase 1b). A key exists here
 * only once its screen actually reads it; the plan's coverage script is what
 * measures the remaining surface, so nothing claims full coverage early.
 */

import type { UiLanguage } from './languages';
import { AR, type ArKey } from './strings/ar';
import { EN } from './strings/en';
import { ID } from './strings/id';

/**
 * Why keys and not "translate the Arabic literal": a key names the meaning
 * (`conv.startPracticeTurn`), so a screen never depends on the exact wording of
 * another language, and a copy change in Arabic does not silently orphan the
 * English. `UiStringKey` is derived from the Arabic table (`strings/ar.ts`), and
 * the other two are typed against it — so a missing English or Indonesian line
 * is a TypeScript error, not an Arabic sentence appearing in an English screen.
 * `tests/languages.test.ts` holds the same rule at runtime.
 */
export type UiStringKey = ArKey;

export const UI_STRINGS: Record<UiLanguage, Record<UiStringKey, string>> = {
  ar: AR,
  en: EN,
  id: ID,
};

/**
 * The largest value any `{placeholder}` may be given. Numbers and short names
 * qualify; an object or a stack trace does not, and must never be stringified
 * into the sentence a learner reads.
 */
type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * One translation. Falls back to Arabic rather than to the key: a learner who
 * sees "language.uiTitle" on a button has been shown the implementation, and an
 * Arabic sentence in an English screen is at least a sentence.
 */
export function translate(language: UiLanguage, key: UiStringKey, vars?: Vars): string {
  const table = UI_STRINGS[language] || UI_STRINGS.ar;
  const template = table[key] ?? UI_STRINGS.ar[key] ?? key;
  return interpolate(template, vars);
}

/** For a caller that has a key it cannot prove at compile time (a server payload). */
export function isUiStringKey(value: unknown): value is UiStringKey {
  return typeof value === 'string' && value in UI_STRINGS.ar;
}
