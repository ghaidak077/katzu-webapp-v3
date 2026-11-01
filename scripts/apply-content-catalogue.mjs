/**
 * Apply `docs/content/catalogue/scenarios-catalogue.json` to the language-data corpus.
 *
 * The catalogue is the single authoring source for scenario content. This script
 * derives the three files the language build consumes, without touching German
 * or Arabic that already shipped:
 *
 *  - `content-snapshot.json` — the scenario rows, in catalogue order.
 *  - `opener-translations.json` — positional Arabic, matched to the new content.
 *    Because the corpus is positional, the previous snapshot + corpus are zipped
 *    first and reused by exact German text, so an unchanged opener keeps the
 *    Arabic a learner already saw. Only a changed opener takes the catalogue's
 *    Arabic.
 *  - `word-glosses.json` — tokens that no longer occur in any opener are pruned
 *    (the build fails on unused entries), and any token without a gloss is
 *    reported so it can be authored instead of silently becoming a "not in your
 *    scene" card.
 *
 *   node scripts/apply-content-catalogue.mjs            # write snapshot + corpus, report gaps
 *   node scripts/apply-content-catalogue.mjs --prune    # also drop unused glosses
 *   node scripts/apply-content-catalogue.mjs --check    # exit 1 if anything would change
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA = join(HERE, 'language-data');
const LEVELS = ['a0', 'a1', 'a2', 'b1', 'b2'];
const write = !process.argv.includes('--check');

const catalogue = JSON.parse(readFileSync(join(ROOT, 'docs/content/catalogue/scenarios-catalogue.json'), 'utf8'));
const scenarios = catalogue.scenarios;

/** Lowercase tokens as they appear in an opener — mirrors build-language-data. */
function tokensOf(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\-\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

function openersOf(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    for (const level of LEVELS) {
      const text = String(row[`initial_message_${level}`] || '').trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push({ id: row.id, level, text });
    }
  }
  return out;
}

const snapshot = {
  fetchedAt: String(catalogue.updated || new Date().toISOString().slice(0, 10)),
  source: 'docs/content/catalogue/scenarios-catalogue.json',
  scenarios: scenarios.map((row) => ({
    id: row.id,
    category: row.category || '',
    ...Object.fromEntries(LEVELS.map((l) => [`initial_message_${l}`, row.openers[l][0]])),
  })),
  vocabulary: JSON.parse(readFileSync(join(DATA, 'content-snapshot.json'), 'utf8')).vocabulary,
};

const openers = openersOf(snapshot.scenarios);

// Previous corpus, keyed by exact German text, so unchanged openers keep their Arabic.
const previousSnapshot = JSON.parse(readFileSync(join(DATA, 'content-snapshot.json'), 'utf8'));
const previousCorpus = JSON.parse(readFileSync(join(DATA, 'opener-translations.json'), 'utf8'));
const previousOpeners = openersOf(previousSnapshot.scenarios);
const shippedArabic = new Map();
previousOpeners.forEach((opener, index) => {
  const arabic = String(previousCorpus.translations[index] || '').trim();
  if (arabic) shippedArabic.set(opener.text.replace(/\s+/g, ' ').trim(), arabic);
});

const authoredArabic = new Map();
for (const row of scenarios) {
  for (const level of LEVELS) {
    const [german, arabic] = row.openers[level];
    authoredArabic.set(String(german).replace(/\s+/g, ' ').trim(), String(arabic).trim());
  }
}

const problems = [];
const translations = openers.map((opener, index) => {
  const key = opener.text.replace(/\s+/g, ' ').trim();
  const arabic = shippedArabic.get(key) || authoredArabic.get(key) || '';
  if (!arabic) problems.push(`opener #${index + 1} (${opener.id}/${opener.level}) has no Arabic: ${key}`);
  return arabic;
});

// Tokens.
const glossFile = JSON.parse(readFileSync(join(DATA, 'word-glosses.json'), 'utf8'));
const glosses = glossFile.glosses;
const vocabularyByKey = new Map();
for (const row of snapshot.vocabulary) {
  const key = String(row.german || '')
    .trim()
    .replace(/^(der|die|das)\s+/i, '')
    .toLowerCase();
  if (key && !vocabularyByKey.has(key)) vocabularyByKey.set(key, row);
}

const used = new Set();
for (const opener of openers) for (const token of tokensOf(opener.text)) used.add(token);

const missing = [...used].filter((token) => !glosses[token] && !vocabularyByKey.get(token)?.translation_ar).sort();
const unused = Object.keys(glosses).filter((token) => !used.has(token)).sort();

const nextGlosses = {};
for (const token of Object.keys(glosses)) if (used.has(token)) nextGlosses[token] = glosses[token];

// `needsReview` marks glosses authored for this content batch that no native
// speaker has checked yet. Pruning a token drops its marker with it.
const nextNeedsReview = (Array.isArray(glossFile.needsReview) ? glossFile.needsReview : [])
  .filter((token) => used.has(token))
  .sort();

const nextSnapshot = `${JSON.stringify(snapshot, null, 1)}\n`;
const nextCorpus = `${JSON.stringify({ ...previousCorpus, translations }, null, 1)}\n`;
const nextGlossFile = `${JSON.stringify({ ...glossFile, needsReview: nextNeedsReview, glosses: nextGlosses }, null, 1)}\n`;

const changed = [];
if (readFileSync(join(DATA, 'content-snapshot.json'), 'utf8') !== nextSnapshot) changed.push('content-snapshot.json');
if (readFileSync(join(DATA, 'opener-translations.json'), 'utf8') !== nextCorpus) changed.push('opener-translations.json');
if (readFileSync(join(DATA, 'word-glosses.json'), 'utf8') !== nextGlossFile) changed.push('word-glosses.json');

console.log(`scenarios: ${scenarios.length}`);
console.log(`distinct openers: ${openers.length} (${openers.length - translations.filter(Boolean).length} without Arabic)`);
console.log(`tokens: ${used.size} used, ${missing.length} without a gloss, ${unused.length} unused`);
console.log(`glosses needing native review: ${nextNeedsReview.length}`);
if (missing.length) console.log(`missing glosses:\n  ${missing.join('\n  ')}`);
if (process.argv.includes('--prune') && unused.length) console.log(`pruning ${unused.length} unused glosses`);
console.log(`would change: ${changed.join(', ') || 'nothing'}`);

if (process.argv.includes('--check')) {
  if (problems.length) {
    console.log(problems.join('\n'));
    process.exit(1);
  }
  process.exit(changed.length ? 1 : 0);
}

if (write) {
  writeFileSync(join(DATA, 'content-snapshot.json'), nextSnapshot, 'utf8');
  writeFileSync(join(DATA, 'opener-translations.json'), nextCorpus, 'utf8');
  if (process.argv.includes('--prune')) writeFileSync(join(DATA, 'word-glosses.json'), nextGlossFile, 'utf8');
  console.log('written');
}
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
