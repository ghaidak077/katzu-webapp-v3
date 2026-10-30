/**
 * The word card's answer, without a network call.
 *
 * WHY THIS EXISTS (V30)
 * Tapping a German word used to open a dead-end card for every word that was not
 * an exact row of the loaded scenario vocabulary — «هذه الكلمة ليست في محتوى
 * مشهدك بعد» with the part of speech «—». The word a learner taps is usually a
 * word the scene already said, so the card was wrong about the app's own content,
 * and with no AI provider configured the "look it up" path was a 503 anyway.
 *
 * Every word of every scenario opener now ships with lemma, Arabic meaning, part
 * of speech and level (`src/lib/vocabulary/wordGlossary.generated.ts`, generated
 * by `scripts/build-language-data.mjs`). This module is the deterministic lookup
 * over that data: exact token, then a light inflection strip, then a compound
 * split (Deutschlernen -> Deutsch + lernen). Pure and synchronous, so it is
 * usable on the first render and offline.
 */

import { WORD_GLOSSARY, type WordGloss } from './wordGlossary.generated';

export type WordLookup = WordGloss & {
  /** The token as it appears in the sentence. */
  german: string;
  /** How the entry was found: the token, an inflection of it, or a compound. */
  match: 'exact' | 'inflected' | 'compound';
  /** The resolved lemma, present on every entry (shot from the data). */
  audioText: string;
};

const ARTICLES = /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer)\s+/i;

/** Lowercased lookup key: no articles, no punctuation, no stray spacing. */
export function glossKey(text: string): string {
  return String(text || '')
    .trim()
    .replace(ARTICLES, '')
    .replace(/[^\p{L}\p{M}\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Endings German adds to a stem, longest first. Stripping one and finding the
 * stem is how "lerne"/"lernst"/"gelernt" reach "lernen" without a morphology
 * engine; a wrong guess is harmless because the split is only accepted when the
 * stem itself is in the shipped glossary.
 */
const INFLECTIONS = ['ungen', 'ungen', 'est', 'ten', 'test', 'tet', 'ete', 'en', 'er', 'em', 'es', 'te', 'st', 'et', 'e', 'n', 's', 't'];

/** ä/ö/ü -> a/o/u, so "hätte" can find "hat". */
const fold = (word: string): string => word.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');

const byFoldedKey = new Map<string, string>();
for (const token of Object.keys(WORD_GLOSSARY)) byFoldedKey.set(fold(token), token);

function entryFor(key: string): WordGloss | null {
  if (Object.prototype.hasOwnProperty.call(WORD_GLOSSARY, key)) return WORD_GLOSSARY[key];
  const folded = byFoldedKey.get(fold(key));
  return folded ? WORD_GLOSSARY[folded] : null;
}

function toLookup(word: string, gloss: WordGloss, match: WordLookup['match']): WordLookup {
  return {
    ...gloss,
    german: word,
    match,
    audioText: gloss.lemma || word,
  };
}

/**
 * The one function the card uses. Returns null only for a word that is genuinely
 * outside the shipped content — the caller shows an honest retry state, never a
 * "not in your scene" dead end and never an invented meaning.
 */
export function lookupWord(rawWord: string): WordLookup | null {
  const word = String(rawWord || '').trim();
  const key = glossKey(word);
  if (!key) return null;

  // 1. The token itself (or its article-stripped form).
  const direct = entryFor(key);
  if (direct) return toLookup(word, direct, 'exact');

  // 2. A known compound declared in the corpus (Deutschlernen -> Deutsch + lernen).
  for (const [token, gloss] of Object.entries(WORD_GLOSSARY)) {
    if (!gloss.parts || gloss.parts.length < 2) continue;
    if (fold(token) === fold(key)) return toLookup(word, gloss, 'compound');
  }

  // 3. A compound the corpus does not declare: split it at every boundary and
  //    accept a split where both halves are known words.
  for (let cut = 3; cut <= key.length - 3; cut += 1) {
    const head = entryFor(key.slice(0, cut));
    const tail = entryFor(key.slice(cut));
    if (!head || !tail) continue;
    return toLookup(
      word,
      {
        lemma: `${head.lemma} + ${tail.lemma}`,
        ar: `${head.ar} + ${tail.ar}`,
        pos: head.pos === tail.pos ? head.pos : 'phrase',
        level: head.level < tail.level ? head.level : tail.level,
        parts: [head.lemma, tail.lemma],
      },
      'compound',
    );
  }

  // 4. An inflection: strip a German ending and retry the stem, and the other way
  //    round (the sentence says "Kaffees", the gloss ships "Kaffee").
  for (const ending of INFLECTIONS) {
    if (!key.endsWith(ending) || key.length - ending.length < 3) continue;
    const stem = entryFor(key.slice(0, key.length - ending.length));
    if (stem) return toLookup(word, stem, 'inflected');
  }
  for (const suffix of ['n', 'e', 'en', 's', 'er']) {
    const grown = entryFor(key + suffix);
    if (grown) return toLookup(word, grown, 'inflected');
  }

  return null;
}

/** Coverage helpers used by the build test and the diagnostics panel. */
export function glossarySize(): number {
  return Object.keys(WORD_GLOSSARY).length;
}