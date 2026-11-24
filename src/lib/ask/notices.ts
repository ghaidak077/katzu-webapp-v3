/**
 * Ask Katzu notices (V28 Stage 2A).
 *
 * The legal notice deliberately reuses the exact wording of the official-category
 * disclaimer in `src/lib/utils/scenarioVocab.ts` (`safetyDisclaimerFor`), so the
 * app says the same thing about legal German everywhere — a scenario screen and
 * the ask screen can never disagree about whether advice is being given.
 *
 * 010 i18n: the copy now lives in the dictionary and every export here takes the
 * language. The `*_AR` names are historical — they are kept because callers and
 * tests use them, and they are derived from `UI_STRINGS.ar`, so their bytes
 * cannot drift from the Arabic the app actually renders.
 */
import { translate, UI_STRINGS, type UiStringKey } from '@/lib/i18n/strings';
import type { UiLanguage } from '@/lib/i18n/languages';

export const ASK_LEGAL_NOTICE_AR = UI_STRINGS.ar['ask.legal'];
export const ASK_PRACTICE_NOTE_AR = UI_STRINGS.ar['ask.practiceNote'];
export const ASK_EXAMPLE_AR = UI_STRINGS.ar['ask.example'];

export const askLegalNotice = (language: UiLanguage = 'ar'): string => translate(language, 'ask.legal');

/** What the practice section promises — never mastery from one answer. */
export const askPracticeNote = (language: UiLanguage = 'ar'): string =>
  translate(language, 'ask.practiceNote');

/**
 * The example the input's placeholder used to show (V32). Placeholders cannot be
 * tapped and disappear the moment you type, so it is a real, fillable suggestion.
 */
export const askExample = (language: UiLanguage = 'ar'): string => translate(language, 'ask.example');

/**
 * The prompt suggestions, keyed by the intent the learner is most likely to want.
 * The label and the prompt are separate keys because the label is the chip a
 * learner reads and the prompt is the question that fills the box.
 */
const SUGGESTION_KEYS: Array<{ label: UiStringKey; prompt: UiStringKey }> = [
  { label: 'ask.intent.translate', prompt: 'ask.suggestion.translate' },
  { label: 'ask.intent.grammar', prompt: 'ask.suggestion.grammar' },
  { label: 'ask.intent.word', prompt: 'ask.suggestion.word' },
  { label: 'ask.intent.checkSentence', prompt: 'ask.suggestion.checkSentence' },
  { label: 'ask.intent.official', prompt: 'ask.suggestion.official' },
];

export const askSuggestions = (
  language: UiLanguage = 'ar',
): Array<{ label: string; prompt: string }> =>
  SUGGESTION_KEYS.map((keys) => ({
    label: translate(language, keys.label),
    prompt: translate(language, keys.prompt),
  }));

export const ASK_SUGGESTIONS = askSuggestions('ar');

/** The intent chip's label, in the learner's language. */
export const ASK_INTENT_KEYS: Record<string, UiStringKey> = {
  translate: 'ask.intent.translate',
  grammar: 'ask.intent.grammar',
  word: 'ask.intent.word',
  check_sentence: 'ask.intent.checkSentence',
  official: 'ask.intent.official',
};
