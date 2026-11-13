/**
 * The hint dock is a sentence the learner may choose to say. It is text from a
 * model, so it gets the same treatment as any other model output before it is
 * shown: it must be German, it must be one line, and it must not carry a
 * command, a meta label or somebody's personal data.
 *
 * Everything here is deterministic and runs locally. `handleUseHint` still only
 * fills the composer — the hint is never sent by a tap — so the learner always
 * reads (and can edit) the sentence before saying it.
 */

import type { CEFRLevel, ContextualHint } from '@/types/models';
import { checkGerman } from './germanChecker';

const MAX_HINT_CHARS = 200;

const META_OPENING =
  /^(hint|suggestion|vorschlag|antwort|answer|reply|response|assistant|model|note|hinweis|du könntest|sie könnten|you could|try saying)\b/i;

const PLACEHOLDER_VARIANTS =
  /(\[[^\]\n]{1,40}\]|\{[^}\n]{1,40}\}|<[^>\n]{1,40}>|\.{3,}|…|X{3,}|_{2,})/g;

/** Model-inserted personal data that must never be shown as if it were the learner's. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL = /\b(?:https?:\/\/|www\.)[^\s]+/gi;
const PHONE = /\+?\d[\d\s().-]{6,}\d/g;
const NAME_AFTER_INTRO = /\b(hei(?:ß|ss)e|Name ist)\s+[A-ZÄÖÜ][\p{L}-]{1,30}/gu;

function cleanText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/```[a-z]*|```/gi, '')
    .replace(/^[\s"'«»„“”]+|[\s"'«»„“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One deterministic German answer sentence, or null when the text is not safe
 * to offer. `null` means "fall back to the starter floor" — never "show it
 * anyway, the learner will notice".
 */
export function sanitizeHintGerman(raw: unknown, level: CEFRLevel = 'A1'): string | null {
  let text = cleanText(raw);
  if (!text || text.length > MAX_HINT_CHARS) return null;
  if (META_OPENING.test(text)) return null;
  // One sentence, not a card: a newline or a numbered list is model prose.
  if (/\n|(?:^|\s)\d+[.)]\s/.test(text)) return null;
  // The German hint must not carry Arabic; its translation is a separate field.
  if (/[\u0600-\u06FF]/.test(text)) return null;

  text = text.replace(PLACEHOLDER_VARIANTS, '___');
  text = text.replace(EMAIL, '___').replace(URL, '___').replace(PHONE, '___');
  text = text.replace(NAME_AFTER_INTRO, (_match, intro: string) => `${intro} ___`);
  // Model output occasionally wraps the sentence in markdown emphasis.
  text = text
    .replace(/^[*_~]+|[*_~]+$/g, '')
    .replace(/\s+([,.!?;:])/g, (_match, punctuation: string) => punctuation)
    .replace(/\s+/g, ' ')
    .trim();

  // The corrector is conservative and only fixes what it can prove; it never
  // rewrites the meaning of the sentence.
  const corrected = checkGerman(text, level).corrected || text;
  if (!/[A-Za-zÄÖÜäöüß]{2}/.test(corrected)) return null;
  if (corrected.length > MAX_HINT_CHARS) return null;
  return corrected;
}

/**
 * Sanitize a list of hints in order, dropping unusable ones and duplicates.
 * Invalid AI hints simply disappear, which is what makes the starter phrases
 * (already merged underneath them by the dock) the visible floor.
 */
export function sanitizeHints(
  hints: Array<ContextualHint | null | undefined>,
  level: CEFRLevel = 'A1',
): ContextualHint[] {
  const seen = new Set<string>();
  const result: ContextualHint[] = [];
  for (const hint of hints) {
    const german = sanitizeHintGerman(hint?.german, level);
    if (!german) continue;
    const key = german.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const arabic = cleanText(hint?.arabic);
    result.push({ german, arabic });
  }
  return result;
}
