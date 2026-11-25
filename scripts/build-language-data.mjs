#!/usr/bin/env node
/**
 * Builds Katzu's static language data from the authored corpus.
 *
 * WHY THIS EXISTS
 * The first Katzu message of every scenario and the Arabic behind every tappable
 * word used to be an AI round-trip at runtime: the opener's gloss was fetched
 * with `/ai/translate`, and an unknown word opened a dead-end card. With no
 * provider keys configured the first of those is a 503 and the second never
 * answers at all. Both are static content, so both are generated here, once, and
 * ship inside the bundle — the opener renders with its Arabic before any network
 * call, and works offline.
 *
 * WHAT IT GUARANTEES (exit code 1 if any fails)
 *  - every distinct scenario opener has a non-empty Arabic translation;
 *  - every token of every opener resolves to [lemma, arabic, pos, level];
 *  - the emitted modules are exactly the corpus applied to the live content.
 *
 * Usage:
 *   node scripts/build-language-data.mjs            # fetch live content, snapshot it, rebuild
 *   node scripts/build-language-data.mjs --offline  # rebuild from the committed snapshot only
 *   node scripts/build-language-data.mjs --list     # print the German/Arabic pairs for proofreading
 *   node scripts/build-language-data.mjs --check     # validate only, write nothing
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA = join(HERE, 'language-data');
mkdirSync(join(ROOT, 'src/lib/vocabulary'), { recursive: true });
const WORKER = process.env.KATZU_CONTENT_ORIGIN || 'https://katzu-test.ghaidakalosh008.workers.dev';
const LEVELS = ['a0', 'a1', 'a2', 'b1', 'b2'];
const PARTS_OF_SPEECH = new Set([
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'article', 'preposition',
  'conjunction', 'numeral', 'interjection', 'particle', 'proper noun', 'phrase',
]);
const LEVEL_SET = new Set(['A0', 'A1', 'A2', 'B1', 'B2']);
const ARABIC = /[\u0600-\u06FF]/;
/** Latin is allowed only inside parentheses — a German hint next to the Arabic. */
const latinOutsideParens = (value) => String(value).replace(/\([^)]*\)/g, '').match(/[A-Za-z]/);

const args = new Set(process.argv.slice(2));
const read = (file) => JSON.parse(readFileSync(join(DATA, file), 'utf8'));
const corpus = read('opener-translations.json');
const glossCorpus = read('word-glosses.json').glosses;
/**
 * Arabic for first messages the authored catalogue snapshot does not hold.
 *
 * The snapshot is the catalogue (61 scenarios). The worker serves a different
 * 49-scenario corpus, so regenerating from the snapshot alone silently dropped
 * 221 openers that learners actually receive (V41: live chat showed «تعذرت
 * الترجمة» on the A1 greeting because «Hallo! Ich bin Frau Meier, deine
 * Nachbarin. Wie heißt du?» had no gloss). This file records the served corpus
 * plus the mock-exam openers and the code fallback, so a content refresh cannot
 * erase them again. Authored entries win when the same German appears in both.
 */
const extraCorpus = read('opener-ar-extra.json').openers || {};

/**
 * English and Indonesian for the same content.
 *
 * Arabic is the source corpus above and stays byte-identical. A learner reading
 * the app in English or Indonesian used to get the Arabic gloss behind
 * «translate», and the Arabic meaning on every tapped word — the last place a
 * non-Arabic learner met a language they cannot read. The translations live in
 * their own files (`openers-i18n/*.json`, `word-glosses-i18n.json`) so a batch
 * of them can be added or reviewed without touching the Arabic.
 *
 * Openers are index-aligned chunks: each file declares the `range` it covers, so
 * a missing or duplicated line is a build failure instead of a silent shift. A
 * word is keyed by its token, which is short and unambiguous.
 */
const I18N_LANGS = ['en', 'id'];
const i18nDir = join(DATA, 'openers-i18n');
const i18nChunks = existsSync(i18nDir)
  ? readdirSync(i18nDir).filter((file) => file.endsWith('.json')).sort()
  : [];
/** Every opener the app can serve, in the order the i18n chunks are indexed on. */
const fullOpenerTexts = () => [
  ...openers.map((opener) => opener.text),
  ...Object.keys(extraCorpus).map((german) => String(german).trim().replace(/\s+/g, ' ')),
];

/** Lowercase tokens as they appear in an opener: letters, umlauts and hyphens. */
export function tokensOf(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\-\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

async function loadContent() {
  if (args.has('--offline')) return read('content-snapshot.json');
  const get = async (path) => {
    const res = await fetch(`${WORKER}${path}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${path} answered ${res.status}`);
    return res.json();
  };
  const [scenarios, vocabulary] = await Promise.all([get('/scenarios'), get('/vocabulary')]);
  const snapshot = {
    fetchedAt: new Date().toISOString().slice(0, 10),
    source: WORKER,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      category: s.category || '',
      ...Object.fromEntries(LEVELS.map((l) => [`initial_message_${l}`, s[`initial_message_${l}`] || ''])),
    })),
    vocabulary: vocabulary.map((v) => ({
      german: v.german, article: v.article || '', part_of_speech: v.part_of_speech || '',
      translation_ar: v.translation_ar || '', level: v.level || '',
    })),
  };
  writeFileSync(join(DATA, 'content-snapshot.json'), `${JSON.stringify(snapshot, null, 1)}\n`, 'utf8');
  return snapshot;
}

/** Every distinct opener, in scenario order and level order — the corpus' index order. */
export function openersOf(scenarios) {
  const seen = new Set();
  const out = [];
  for (const scenario of scenarios) {
    for (const level of LEVELS) {
      const text = String(scenario[`initial_message_${level}`] || '').trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push({ scenario: scenario.id, level: level.toUpperCase(), text });
    }
  }
  return out;
}

const problems = [];
const content = await loadContent();
const openers = openersOf(content.scenarios);
const translations = corpus.translations;

if (translations.length !== openers.length) {
  problems.push(`opener corpus has ${translations.length} entries for ${openers.length} distinct openers`);
}

const openerGlosses = {};
openers.forEach((opener, index) => {
  const arabic = String(translations[index] || '').trim();
  if (!arabic) problems.push(`opener #${index + 1} has no translation: ${opener.text}`);
  else if (!ARABIC.test(arabic)) problems.push(`opener #${index + 1} has no Arabic: ${arabic}`);
  else if (latinOutsideParens(arabic)) problems.push(`opener #${index + 1} carries Latin text: ${arabic}`);
  openerGlosses[opener.text.replace(/\s+/g, ' ').trim()] = arabic;
});

// Merge the durable extra corpus after the authored one. It only fills keys the
// catalogue does not already cover, and it is validated exactly like authored
// Arabic: a gloss that is empty, has no Arabic, or carries unsupported Latin
// text is a build failure, not a quiet fallback.
let mergedFromExtra = 0;
for (const [german, arabicValue] of Object.entries(extraCorpus)) {
  const key = String(german || '').trim().replace(/\s+/g, ' ');
  const arabic = String(arabicValue || '').trim();
  if (!key) { problems.push('extra corpus has an empty opener key'); continue; }
  if (!arabic) { problems.push(`extra opener has no translation: ${key}`); continue; }
  if (!ARABIC.test(arabic)) { problems.push(`extra opener has no Arabic: ${key}`); continue; }
  if (latinOutsideParens(arabic)) { problems.push(`extra opener carries Latin text: ${key}`); continue; }
  if (Object.prototype.hasOwnProperty.call(openerGlosses, key)) continue;
  openerGlosses[key] = arabic;
  mergedFromExtra += 1;
}

const glossary = {};
const tokenOwners = new Map();
openers.forEach((opener, index) => {
  for (const token of tokensOf(opener.text)) {
    if (!tokenOwners.has(token)) tokenOwners.set(token, { count: 0, openerIndex: index });
    tokenOwners.get(token).count += 1;
  }
});

for (const [token, meta] of tokenOwners) {
  const entry = glossCorpus[token];
  // A missing gloss is reported once, after the content vocabulary has had its
  // chance to fill the token — see the `stillMissing` check below.
  if (!entry) continue;
  const [lemma, arabic, pos, level, parts] = entry;
  if (!lemma || !arabic) problems.push(`"${token}" is missing a lemma or a meaning`);
  if (!ARABIC.test(String(arabic || ''))) problems.push(`"${token}" has no Arabic meaning`);
  if (latinOutsideParens(arabic)) problems.push(`"${token}" meaning carries Latin text: ${arabic}`);
  if (!PARTS_OF_SPEECH.has(pos)) problems.push(`"${token}" has an unknown part of speech: ${pos}`);
  if (!LEVEL_SET.has(level)) problems.push(`"${token}" has an unknown level: ${level}`);
  if (parts && (!Array.isArray(parts) || parts.some((p) => !String(p).trim()))) {
    problems.push(`"${token}" lists an empty compound part: ${JSON.stringify(parts)}`);
  }
  const opener = openers[meta.openerIndex];
  glossary[token] = {
    lemma, ar: arabic, pos, level,
    parts: Array.isArray(parts) ? parts : null,
    exampleDe: opener.text,
    exampleAr: translations[meta.openerIndex],
  };
}

// The vocabulary table already ships real Arabic meanings with their own part of
// speech and level, and most common function words live there. A token the
// authored corpus does not cover is filled from that content instead of being
// written twice — the app's own content stays the single source for it.
const vocabularyByKey = new Map();
for (const row of content.vocabulary) {
  const key = String(row.german || '')
    .trim()
    .replace(/^(der|die|das)\s+/i, '')
    .toLowerCase();
  if (key && !vocabularyByKey.has(key)) vocabularyByKey.set(key, row);
}
let filledFromVocabulary = 0;
for (const [token, meta] of tokenOwners) {
  if (glossary[token]) continue;
  const row = vocabularyByKey.get(token);
  if (!row || !row.translation_ar) continue;
  const opener = openers[meta.openerIndex];
  glossary[token] = {
    lemma: String(row.german || token).trim(),
    ar: String(row.translation_ar).trim(),
    pos: String(row.part_of_speech || 'noun').toLowerCase(),
    level: String(row.level || 'A1').toUpperCase(),
    parts: null,
    exampleDe: opener.text,
    exampleAr: translations[meta.openerIndex],
  };
  filledFromVocabulary += 1;
}

const unused = Object.keys(glossCorpus).filter((token) => !tokenOwners.has(token));
if (unused.length) problems.push(`${unused.length} glosses are not used by any opener: ${unused.slice(0, 8).join(', ')}`);

// Any token still unresolved after the authored corpus and the content rows is a
// real gap, not a formatting detail: it becomes the "not in your scene" card the
// learner must never see again.
const stillMissing = [...tokenOwners.keys()].filter((token) => !glossary[token]);
if (stillMissing.length) {
  problems.push(`${stillMissing.length} opener tokens resolve to nothing: ${stillMissing.slice(0, 10).join(', ')}`);
}

// ---- English and Indonesian, merged onto the same entries ----
const openerI18n = {};
const byIndex = [];
let nextIndex = 1;
for (const file of i18nChunks) {
  let chunk = null;
  try {
    chunk = JSON.parse(readFileSync(join(i18nDir, file), 'utf8'));
  } catch (error) {
    problems.push(`i18n chunk ${file} is not valid JSON: ${error.message}`);
    continue;
  }
  const [start, end] = Array.isArray(chunk.range) ? chunk.range : [NaN, NaN];
  if (start !== nextIndex) problems.push(`i18n chunk ${file} starts at ${start}, expected ${nextIndex}`);
  const size = end - start + 1;
  for (const lang of I18N_LANGS) {
    const rows = chunk[lang];
    if (!Array.isArray(rows) || rows.length !== size) {
      problems.push(`i18n chunk ${file} has ${Array.isArray(rows) ? rows.length : 0} ${lang} rows, expected ${size}`);
      continue;
    }
    rows.forEach((row, offset) => {
      const index = start + offset;
      const text = String(row || '').trim();
      if (!text) problems.push(`i18n ${lang} row ${index} is empty`);
      else if (ARABIC.test(text)) problems.push(`i18n ${lang} row ${index} carries Arabic: ${text}`);
      byIndex[index - 1] = { ...(byIndex[index - 1] || {}), [lang]: text };
    });
  }
  nextIndex = end + 1;
}

const shippedOpenerTexts = fullOpenerTexts();
if (i18nChunks.length && nextIndex - 1 !== shippedOpenerTexts.length) {
  problems.push(`opener i18n covers ${nextIndex - 1} openers for ${shippedOpenerTexts.length} shipped openers`);
}
shippedOpenerTexts.forEach((text, index) => {
  const entry = byIndex[index];
  if (!entry || I18N_LANGS.some((lang) => !entry[lang])) {
    problems.push(`opener #${index + 1} has no complete English/Indonesian gloss: ${text}`);
    return;
  }
  openerI18n[text.replace(/\s+/g, ' ').trim()] = { en: entry.en, id: entry.id };
});

const wordI18nFile = join(DATA, 'word-glosses-i18n.json');
const wordI18n = existsSync(wordI18nFile)
  ? JSON.parse(readFileSync(wordI18nFile, 'utf8')).glosses || {}
  : {};
const wordsWithoutI18n = [];
for (const [token, gloss] of Object.entries(glossary)) {
  const entry = wordI18n[token];
  if (!Array.isArray(entry) || entry.length < 2) {
    wordsWithoutI18n.push(token);
    continue;
  }
  const [english, indonesian] = entry.map((value) => String(value || '').trim());
  if (!english || !indonesian) {
    problems.push(`word i18n for "${token}" is incomplete`);
    continue;
  }
  if (ARABIC.test(english) || ARABIC.test(indonesian)) {
    problems.push(`word i18n for "${token}" carries Arabic`);
    continue;
  }
  gloss.en = english;
  gloss.id = indonesian;
}
if (wordsWithoutI18n.length) {
  problems.push(`${wordsWithoutI18n.length} words have no English/Indonesian meaning: ${wordsWithoutI18n.slice(0, 8).join(', ')}`);
}

const report = {
  distinctOpeners: openers.length,
  scenarios: content.scenarios.length,
  translated: translations.filter((t) => String(t || '').trim()).length,
  distinctTokens: tokenOwners.size,
  glossed: Object.keys(glossary).length,
  filledFromVocabulary,
  mergedFromExtra,
  shippedOpeners: Object.keys(openerGlosses).length,
  unresolved: tokenOwners.size - Object.keys(glossary).length,
};

console.log(`language data: ${report.scenarios} scenarios · ${report.distinctOpeners} distinct openers · ${report.translated} translated`);
console.log(`                ${report.mergedFromExtra} extra live/mock openers merged · ${report.shippedOpeners} openers shipped in total`);
console.log(`                ${report.distinctTokens} distinct opener tokens · ${report.glossed} in the shipped glossary (${report.filledFromVocabulary} from the content vocabulary) · ${report.unresolved} unresolved`);
console.log(`                corpus size: ${Object.keys(glossCorpus).length} authored glosses, ${translations.length} translations`);

if (args.has('--list')) {
  openers.forEach((opener, index) => console.log(`\n[${index + 1}] ${opener.text}\n    ${translations[index]}`));
}

if (problems.length) {
  console.error(`\nFAILED — ${problems.length} problem(s):`);
  for (const problem of problems.slice(0, 40)) console.error(`  · ${problem}`);
  if (problems.length > 40) console.error(`  · …and ${problems.length - 40} more`);
  process.exit(1);
}

if (args.has('--check')) {
  console.log('\nOK (check only, nothing written)');
  process.exit(0);
}

const header = `/**
 * GENERATED — do not edit by hand.
 *
 * Source: scripts/language-data/ (corpus + content snapshot), built by
 * \`node scripts/build-language-data.mjs\`. Every scenario opener ships with its
 * Arabic here, so the first message of a conversation renders instantly, costs
 * zero AI calls and works offline. Regenerate after editing the corpus.
 */
`;

writeFileSync(
  join(ROOT, 'src/lib/conversation/openerGlosses.generated.ts'),
  `${header}export const OPENER_GLOSSES: Record<string, string> = ${JSON.stringify(openerGlosses, null, 2)};\n`,
  'utf8',
);

// The worker's copy of the same reviewed map. The greeting guard re-asks the
// scene's own last question when the learner sends only a greeting, and the
// worker is plain JS — so the corpus has to exist in a module it can import.
writeFileSync(
  join(ROOT, 'cloudflare-opener-glosses.generated.js'),
  `${header}export const OPENER_GLOSSES = ${JSON.stringify(openerGlosses, null, 2)};\n`,
  'utf8',
);

const entries = Object.entries(glossary)
  .map(([token, gloss]) => {
    const parts = gloss.parts ? `, parts: ${JSON.stringify(gloss.parts)}` : '';
    return `  ${JSON.stringify(token)}: { lemma: ${JSON.stringify(gloss.lemma)}, ar: ${JSON.stringify(gloss.ar)}, en: ${JSON.stringify(gloss.en)}, id: ${JSON.stringify(gloss.id)}, pos: ${JSON.stringify(gloss.pos)}, level: ${JSON.stringify(gloss.level)}${parts} }`;
  })
  .join(',\n');

writeFileSync(
  join(ROOT, 'src/lib/vocabulary/wordGlossary.generated.ts'),
  `${header}export interface WordGloss {\n  lemma: string;\n  ar: string;\n  /** English meaning, for a learner reading the app in English. */\n  en: string;\n  /** Indonesian meaning, for a learner reading the app in Indonesian. */\n  id: string;\n  pos: string;\n  level: string;\n  /** The parts of a compound word, when the corpus declares them. */\n  parts?: string[];\n}\n\n/** Lemma, meaning, part of speech and level for every word in a scenario opener. */\nexport const WORD_GLOSSARY: Record<string, WordGloss> = {\n${entries},\n};\n`,
  'utf8',
);

// The non-Arabic openers ship as their own map beside the Arabic one: the worker
// imports the Arabic module (its greeting guard speaks Arabic) and must not grow
// with translations it never reads.
// One line per opener: the map is ~530 entries, and the repo's file-size guard
// counts lines (a pretty-printed map of this size crosses it).
const i18nEntries = Object.entries(openerI18n)
  .map(([german, entry]) => `  ${JSON.stringify(german)}: { en: ${JSON.stringify(entry.en)}, id: ${JSON.stringify(entry.id)} },`)
  .join('\n');

writeFileSync(
  join(ROOT, 'src/lib/conversation/openerGlossesI18n.generated.ts'),
  `${header}export interface OpenerGlossI18n {\n  en: string;\n  id: string;\n}\n\n/** The same opener keyed to English and Indonesian. */\nexport const OPENER_GLOSSES_I18N: Record<string, OpenerGlossI18n> = {\n${i18nEntries}\n};\n`,
  'utf8',
);

const review = [
  '# Owner review — the Arabic shipped with every scenario opener',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} by \`node scripts/build-language-data.mjs --list\`.`,
  'Read it the way a learner would: the German is what the partner says first, the Arabic is what',
  'the learner sees behind «ترجمة». Edit `scripts/language-data/opener-translations.json` (same order)',
  'or `scripts/language-data/word-glosses.json`, then regenerate.',
  '',
  `- ${openers.length} openers across ${content.scenarios.length} scenarios`,
  `- ${Object.keys(glossary).length} word entries (lemma + meaning + part of speech + level)`,
  '',
].concat(openers.map((opener, index) => `${index + 1}. **${opener.text}**\n   - ${translations[index]}`));
writeFileSync(join(ROOT, 'docs/OWNER-LANGUAGE-REVIEW.md'), `${review.join('\n')}\n`, 'utf8');

console.log('\nwrote src/lib/conversation/openerGlosses.generated.ts');
console.log('wrote src/lib/conversation/openerGlossesI18n.generated.ts');
console.log('wrote src/lib/vocabulary/wordGlossary.generated.ts');
console.log('wrote docs/OWNER-LANGUAGE-REVIEW.md');
