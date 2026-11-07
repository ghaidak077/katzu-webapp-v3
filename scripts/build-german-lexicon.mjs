#!/usr/bin/env node
/**
 * Generates `src/lib/conversation/germanLexicon.generated.ts`.
 *
 * WHY: the local German checker needs a noun list (gender + lemma) and a set of
 * known spellings to catch ie/ei and ß/ss swaps without a network call. The
 * shipped content snapshot already carries every noun the app teaches; this
 * script turns it into a tiny, tree-shakeable TS module. The curated supplement
 * covers the handful of everyday words the taught vocabulary does not ship yet
 * (Katze, Hund, Gift, Geschenk and the verbs behind the golden set).
 *
 * Run: node scripts/build-german-lexicon.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SOURCE = join(ROOT, 'scripts', 'language-data', 'content-snapshot.json');
const TARGET = join(ROOT, 'src', 'lib', 'conversation', 'germanLexicon.generated.ts');

const ARTICLES = new Set(['der', 'die', 'das']);
const capitalizeProper = (value) => value[0].toUpperCase() + value.slice(1);

/** "der Reisepass" / "die (pl.) Schmerzen" → { lemma: 'Reisepass', article: 'der', plural: false } */
function normalizeNoun(german, articleField) {
  let text = String(german || '').trim();
  const articleText = String(articleField || '').trim().toLowerCase();
  const plural = /pl\./.test(articleText);
  const article = articleText.split(/\s+/)[0];
  // Some rows already carry their article in the German column.
  const parts = text.split(/\s+/);
  if (ARTICLES.has(parts[0]?.toLowerCase())) {
    text = parts.slice(1).join(' ');
  }
  text = text.replace(/\((?:pl\.?|plural)\)/gi, '').trim();
  if (!text) return null;
  return {
    lemma: text,
    article: ARTICLES.has(article) ? article : null,
    plural,
  };
}

const snapshot = JSON.parse(readFileSync(SOURCE, 'utf8'));
const vocabulary = Array.isArray(snapshot.vocabulary) ? snapshot.vocabulary : [];

const nouns = {};
const words = new Set();

for (const row of vocabulary) {
  const german = String(row?.german || '').trim();
  if (!german) continue;
  const first = german.split(/\s+/)[0].toLowerCase();
  const bare = ARTICLES.has(first) ? german.split(/\s+/).slice(1).join(' ') : german;
  for (const token of bare.replace(/\([^)]*\)/g, ' ').split(/\s+/)) {
    if (/^[A-Za-zÄÖÜäöüß-]{2,}$/.test(token)) words.add(token);
  }
  if (String(row?.part_of_speech || '').toLowerCase() !== 'noun') continue;
  const noun = normalizeNoun(german, row.article);
  if (!noun) continue;
  const key = noun.lemma.toLowerCase();
  // First row wins: the snapshot repeats a word across topics with the same gender.
  if (!nouns[key]) nouns[key] = noun;
}

/**
 * The curated supplement. Everything here is either a word the golden set needs
 * (Katze, Hund, Gift, Geschenk) or a high-frequency everyday noun/verb whose
 * gender/lemma the taught vocabulary does not ship yet.
 */
const CURATED_NOUNS = [
  { lemma: 'Katze', article: 'die', plural: false },
  { lemma: 'Hund', article: 'der', plural: false },
  { lemma: 'Gift', article: 'das', plural: false },
  { lemma: 'Geschenk', article: 'das', plural: false },
  { lemma: 'Blume', article: 'die', plural: false },
  { lemma: 'Buch', article: 'das', plural: false },
  { lemma: 'Tisch', article: 'der', plural: false },
  { lemma: 'Stuhl', article: 'der', plural: false },
  { lemma: 'Tür', article: 'die', plural: false },
  { lemma: 'Fenster', article: 'das', plural: false },
  { lemma: 'Auto', article: 'das', plural: false },
  { lemma: 'Freund', article: 'der', plural: false },
  { lemma: 'Freundin', article: 'die', plural: false },
  { lemma: 'Mutter', article: 'die', plural: false },
  { lemma: 'Vater', article: 'der', plural: false },
  { lemma: 'Kind', article: 'das', plural: false },
  { lemma: 'Name', article: 'der', plural: false },
  { lemma: 'Tag', article: 'der', plural: false },
  { lemma: 'Morgen', article: 'der', plural: false },
  { lemma: 'Abend', article: 'der', plural: false },
  { lemma: 'Wasser', article: 'das', plural: false },
  { lemma: 'Brot', article: 'das', plural: false },
  { lemma: 'Apfel', article: 'der', plural: false },
  { lemma: 'Milch', article: 'die', plural: false },
  { lemma: 'Zeit', article: 'die', plural: false },
  { lemma: 'Jahr', article: 'das', plural: false },
  { lemma: 'Woche', article: 'die', plural: false },
  { lemma: 'Monat', article: 'der', plural: false },
  { lemma: 'Frau', article: 'die', plural: false },
  { lemma: 'Herr', article: 'der', plural: false },
  { lemma: 'Film', article: 'der', plural: false },
  { lemma: 'Kino', article: 'das', plural: false },
  { lemma: 'Tasche', article: 'die', plural: false },
  { lemma: 'Bahnhof', article: 'der', plural: false },
  { lemma: 'Montag', article: 'der', plural: false },
  { lemma: 'Dienstag', article: 'der', plural: false },
  { lemma: 'Mittwoch', article: 'der', plural: false },
  { lemma: 'Donnerstag', article: 'der', plural: false },
  { lemma: 'Freitag', article: 'der', plural: false },
  { lemma: 'Samstag', article: 'der', plural: false },
  { lemma: 'Sonntag', article: 'der', plural: false },
  { lemma: 'Deutsch', article: 'das', plural: false },
  { lemma: 'Englisch', article: 'das', plural: false },
  { lemma: 'Arabisch', article: 'das', plural: false },
];

for (const noun of CURATED_NOUNS) {
  const key = noun.lemma.toLowerCase();
  if (!nouns[key]) nouns[key] = noun;
}

/**
 * Proper names (places and the owner's name). They are capitalised like nouns
 * but never take an article, so they live in their own map.
 */
const PROPER_NOUNS = [
  'Berlin', 'München', 'Muenchen', 'Hamburg', 'Köln', 'Koeln', 'Frankfurt',
  'Stuttgart', 'Düsseldorf', 'Duesseldorf', 'Leipzig', 'Dresden', 'Wien',
  'Zürich', 'Zuerich', 'Deutschland', 'Österreich', 'Oesterreich', 'Schweiz',
  'Europa', 'Ghaidak', 'Syrien', 'Irak', 'Ägypten', 'Aegypten', 'Türkei',
  'Tuerkei', 'Libanon', 'Jordanien', 'Marokko', 'Tunesien', 'Algerien',
  'Frankreich', 'Italien', 'Spanien', 'Griechenland', 'Polen', 'Russland',
];

/**
 * Mass nouns read naturally without an article ("Ich trinke Kaffee"), so the
 * missing-article rule must not insert "einen" in front of them.
 */
const MASS_NOUNS = [
  'Kaffee', 'Tee', 'Wasser', 'Milch', 'Brot', 'Reis', 'Fleisch', 'Obst',
  'Gemüse', 'Geld', 'Zeit', 'Musik', 'Arbeit', 'Hunger', 'Durst',
  'Deutsch', 'Englisch', 'Arabisch',
];

const CURATED_WORDS = [
  'lieben', 'liebe', 'liebst', 'liebt', 'heißen', 'heiße', 'heißt', 'haben', 'habe', 'hast', 'hat',
  'sein', 'bin', 'bist', 'ist', 'sind', 'kommen', 'komme', 'kommst', 'kommt', 'gehen', 'gehe',
  'gehst', 'geht', 'wohnen', 'wohne', 'wohnst', 'wohnt', 'trinken', 'trinke', 'trinkst', 'trinkt',
  'essen', 'esse', 'isst', 'lernen', 'lerne', 'lernst', 'lernt', 'sprechen', 'spreche', 'sprichst',
  'spricht', 'machen', 'mache', 'machst', 'macht', 'kaufen', 'kaufe', 'kaufst', 'kauft', 'geben',
  'gebe', 'gibst', 'gibt', 'nehmen', 'nehme', 'nimmst', 'nimmt', 'sehen', 'sehe', 'siehst', 'sieht',
  'möchten', 'möchte', 'möchtest', 'möchtet', 'können', 'kann', 'kannst', 'könnt', 'müssen', 'muss',
  'musst', 'müsst', 'werden', 'werde', 'wirst', 'wird', 'werdet', 'bekommen', 'bekomme', 'bekommst',
  'bekommt', 'schön', 'gut', 'gern', 'gerne', 'heute', 'morgen', 'gestern', 'jetzt', 'dann', 'auch',
  'nicht', 'kein', 'keine', 'einen', 'eine', 'einem', 'einer', 'eines', 'mein', 'meine', 'meinen',
  'dein', 'deine', 'deinen', 'ihr', 'ihre', 'ihren', 'unser', 'unsere', 'unseren', 'danke', 'bitte',
  'hallo', 'tschüss', 'wiedersehen', 'guten', 'frau', 'herr', 'ghaidak', 'katze', 'hund', 'gift',
  'geschenk', 'freund', 'freundin', 'mutter', 'vater', 'kind', 'name',
];
for (const word of CURATED_WORDS) words.add(word);
for (const proper of PROPER_NOUNS) words.add(proper);

const nounEntries = Object.values(nouns)
  .sort((a, b) => a.lemma.localeCompare(b.lemma, 'de'))
  .map((noun) => `  ${JSON.stringify(noun.lemma.toLowerCase())}: { lemma: ${JSON.stringify(noun.lemma)}, article: ${JSON.stringify(noun.article)}, plural: ${noun.plural} },`)
  .join('\n');

const properEntries = PROPER_NOUNS
  .map((lemma) => `  ${JSON.stringify(lemma.toLowerCase())}: ${JSON.stringify(capitalizeProper(lemma))},`)
  .join('\n');

const massEntries = MASS_NOUNS
  .map((lemma) => `  ${JSON.stringify(lemma.toLowerCase())},`)
  .join('\n');

const wordEntries = [...words]
  .filter((word) => /^[A-Za-zÄÖÜäöüß-]+$/.test(word))
  .sort((a, b) => a.localeCompare(b, 'de'))
  .map((word) => `  ${JSON.stringify(word.toLowerCase())},`)
  .join('\n');

const output = `/**
 * GENERATED — do not edit by hand.
 * Source: scripts/language-data/content-snapshot.json + the curated supplement in
 * scripts/build-german-lexicon.mjs. Run \`node scripts/build-german-lexicon.mjs\`.
 *
 * The local German checker uses this to correct noun capitalisation, gender and
 * the common ie/ei and ß/ss swaps without a network call.
 */

export interface LexiconNoun {
  /** The correctly capitalised lemma, e.g. «Katze». */
  lemma: string;
  article: 'der' | 'die' | 'das' | null;
  plural: boolean;
}

export const NOUNS: Record<string, LexiconNoun> = {
${nounEntries}
};

/** Proper names: lower-case key → correctly capitalised form. Never take an article. */
export const PROPER_NOUNS: Record<string, string> = {
${properEntries}
};

/** Mass nouns that read naturally without an article. */
export const MASS_NOUNS: ReadonlySet<string> = new Set([
${massEntries}
]);

/** Known spellings, lower-case. Used only to recognise a plausible target word. */
export const KNOWN_WORDS: ReadonlySet<string> = new Set([
${wordEntries}
]);
`;

writeFileSync(TARGET, output, 'utf8');
console.log(`wrote ${TARGET}: ${Object.keys(nouns).length} nouns, ${words.size} words`);
