#!/usr/bin/env node
/**
 * The dictionary as a worksheet, and back again.
 *
 * WHY THIS EXISTS
 * `src/lib/i18n/strings.ts` is a TypeScript file, which made every translation a
 * code edit: a reviewer had to open a 500-line module, find a key between two
 * other languages, and trust that the surrounding JSX did not move while they
 * read. That is a fine shape for the ENGINEER and a bad one for the TRANSLATOR,
 * and it is why 1,400 remaining strings looked like a mountain: each batch was
 * an unattributable 300-line diff instead of a table someone could approve.
 *
 * This script is the table. `--export` writes one CSV + one Markdown sheet per
 * batch (key, the Arabic it must mean, the current English and Indonesian, and
 * which screens read it); `--apply` writes reviewed values back, touching only
 * the English and Indonesian tables and only the keys the sheet names.
 *
 *   node scripts/i18n-strings.mjs --list
 *   node scripts/i18n-strings.mjs --export            # every batch
 *   node scripts/i18n-strings.mjs --export --batch=B1
 *   node scripts/i18n-strings.mjs --apply i18n-worksheets/B1.csv
 *
 * WHY IT PARSES INSTEAD OF IMPORTING
 * Node cannot import a `.ts` module without a flag, and the flag differs across
 * the Node versions `package.json` allows. The tables are object literals of
 * single-quoted strings, so a small scanner reads them exactly, and — more
 * importantly — it can report the byte span of each value, which is what makes
 * `--apply` a surgical rewrite rather than a regeneration of the file.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STRINGS_FILE = join(ROOT, 'src/lib/i18n/strings.ts');
const OUT_DIR = join(ROOT, 'i18n-worksheets');
const SCAN_DIRS = ['src/features', 'src/app', 'src/components'];

/** The three tables, in the order a sheet lists them. */
const LANGS = ['ar', 'en', 'id'];
const TABLE_NAMES = { ar: 'AR', en: 'EN', id: 'ID' };

/**
 * Batch boundaries, mirrored from `scripts/i18n-coverage.mjs`.
 *
 * Duplicated on purpose rather than imported: this script must keep working
 * while someone is editing the coverage script, and a wrong batch label costs a
 * mis-sorted row, not a wrong claim. `--export` without a batch writes all.
 */
const BATCHES = [
  { id: 'B1', name: 'Front door', patterns: [/^src\/features\/auth\//, /^src\/features\/onboarding\//] },
  { id: 'B2', name: 'Journey home and shell', patterns: [/^src\/features\/journey\//, /^src\/app\//] },
  {
    id: 'B3',
    name: 'Story, practice, conversation',
    patterns: [/^src\/features\/conversation\//, /^src\/features\/study\//, /^src\/features\/quiz\//],
  },
  { id: 'B4', name: 'Report and review', patterns: [/^src\/features\/report\//, /^src\/features\/review\//] },
  {
    id: 'B5',
    name: 'Practice, progress, grammar, listening, writing, coach, ask',
    patterns: [
      /^src\/features\/practice\//,
      /^src\/features\/progress\//,
      /^src\/features\/grammar\//,
      /^src\/features\/listening\//,
      /^src\/features\/writing\//,
      /^src\/features\/coach\//,
      /^src\/features\/ask\//,
    ],
  },
  {
    id: 'B6',
    name: 'Settings, paywall, placement, partners, mock exam',
    patterns: [
      /^src\/features\/settings\//,
      /^src\/features\/offers\//,
      /^src\/features\/placement\//,
      /^src\/features\/partners\//,
      /^src\/features\/mockexam\//,
    ],
  },
  { id: 'B7', name: 'Shared components', patterns: [/^src\/components\//] },
  { id: 'B8', name: 'Shared copy tables in lib', patterns: [/^src\/lib\//] },
];

const walk = (dir) => {
  if (!existsSync(join(ROOT, dir))) return [];
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      return /node_modules|__snapshots__|i18n$/.test(entry.name) ? [] : walk(path);
    }
    return /\.(tsx|ts)$/.test(entry.name) ? [path] : [];
  });
};

/**
 * Read one single-quoted JS string literal starting at `start`.
 * Returns the decoded value and the index just past the closing quote, or null
 * when the character at `start` is not a quote.
 */
function readLiteral(text, start) {
  const quote = text[start];
  if (quote !== "'" && quote !== '"') return null;
  let index = start + 1;
  let value = '';
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') {
      const next = text[index + 1];
      value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
      index += 2;
      continue;
    }
    if (char === quote) return { value, end: index + 1 };
    value += char;
    index += 1;
  }
  return null;
}

/** Encode a value as the single-quoted literal the file uses. */
function quote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/** The byte range of `const AR = {` … `}` for one table. */
function tableRange(source, name) {
  const marker = new RegExp(`const ${name}\\s*(?::[^=]*)?=\\s*\\{`);
  const match = marker.exec(source);
  if (!match) return null;
  const open = source.indexOf('{', match.index);
  let depth = 0;
  let index = open;
  let inString = null;
  while (index < source.length) {
    const char = source[index];
    if (inString) {
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === inString) inString = null;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      inString = char;
      index += 1;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return { open: open + 1, close: index, body: source.slice(open + 1, index) };
    }
    index += 1;
  }
  return null;
}

/**
 * Every `'key': 'value'` pair in a table body, with the absolute span of the
 * value so `--apply` can replace exactly it.
 */
function parseTable(source, name) {
  const range = tableRange(source, name);
  if (!range) throw new Error(`Could not find the ${name} table in strings.ts`);
  const entries = new Map();
  let index = 0;
  const body = range.body;
  while (index < body.length) {
    // Skip whitespace and comments between entries.
    while (index < body.length && /[\s,]/.test(body[index])) index += 1;
    if (body.startsWith('/*', index)) {
      const end = body.indexOf('*/', index);
      index = end === -1 ? body.length : end + 2;
      continue;
    }
    if (body.startsWith('//', index)) {
      const end = body.indexOf('\n', index);
      index = end === -1 ? body.length : end + 1;
      continue;
    }
    const key = readLiteral(body, index);
    if (!key) {
      index += 1;
      continue;
    }
    let cursor = key.end;
    while (cursor < body.length && /\s/.test(body[cursor])) cursor += 1;
    if (body[cursor] !== ':') {
      index = key.end;
      continue;
    }
    cursor += 1;
    while (cursor < body.length && /\s/.test(body[cursor])) cursor += 1;
    const value = readLiteral(body, cursor);
    if (!value) {
      index = key.end;
      continue;
    }
    entries.set(key.value, {
      key: key.value,
      value: value.value,
      valueStart: range.open + cursor,
      valueEnd: range.open + value.end,
    });
    index = value.end;
  }
  return entries;
}

const load = () => {
  const source = readFileSync(STRINGS_FILE, 'utf8');
  return {
    source,
    tables: Object.fromEntries(LANGS.map((lang) => [lang, parseTable(source, TABLE_NAMES[lang])])),
  };
};

/** Which screen reads each key — the reviewer's context column. */
function screenIndex() {
  const index = new Map();
  for (const file of SCAN_DIRS.flatMap(walk)) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    for (const match of source.matchAll(/(?:t|translate)\(\s*'([a-zA-Z0-9_.]+)'/g)) {
      const key = match[1];
      const list = index.get(key) ?? [];
      if (!list.includes(file)) list.push(file);
      index.set(key, list);
    }
  }
  return index;
}

const batchFor = (file) => BATCHES.find((batch) => batch.patterns.some((re) => re.test(file)))?.id ?? '—';

const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function exportSheets({ onlyBatch } = {}) {
  const { tables } = load();
  const screens = screenIndex();
  const rows = [...tables.ar.keys()].map((key) => {
    const files = screens.get(key) ?? [];
    const batch = batchFor(files[0] ?? '');
    return {
      key,
      batch,
      ar: tables.ar.get(key)?.value ?? '',
      en: tables.en.get(key)?.value ?? '',
      id: tables.id.get(key)?.value ?? '',
      screens: files.join(' '),
    };
  });
  const counts = new Map();
  for (const row of rows) counts.set(row.batch, (counts.get(row.batch) ?? 0) + 1);
  if (!onlyBatch) {
    console.log(`\n${rows.length} keys in the dictionary.`);
    for (const [batch, count] of [...counts].sort()) console.log(`  ${batch.padEnd(3)} ${String(count).padStart(4)} keys`);
    console.log('\nRun with --export to write the sheets.');
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const selected = rows.filter((row) => row.batch === onlyBatch);
  if (!selected.length) throw new Error(`No keys belong to batch ${onlyBatch}`);

  const csv = [
    'key,batch,arabic_reference,english,indonesian,review_note,screens',
    ...selected.map((row) => [cell(row.key), cell(row.batch), cell(row.ar), cell(row.en), cell(row.id), cell(''), cell(row.screens)].join(',')),
  ].join('\n');
  const csvPath = join(OUT_DIR, `${onlyBatch}.csv`);
  writeFileSync(csvPath, `${csv}\n`, 'utf8');

  const md = [
    `# ${onlyBatch} — translation worksheet`,
    '',
    'Edit the **English** and **Indonesian** columns, add a note where the Arabic admits two readings,',
    'then run `node scripts/i18n-strings.mjs --apply i18n-worksheets/' + onlyBatch + '.csv`.',
    'Arabic is the reference and is never edited from a sheet. See `docs/i18n/GLOSSARY.md`.',
    '',
    '| key | Arabic (reference) | English | Indonesian | screens |',
    '| --- | --- | --- | --- | --- |',
    ...selected.map(
      (row) =>
        `| \`${row.key}\` | ${row.ar.replace(/\|/g, '\\|').replace(/\n/g, ' ')} | ${row.en.replace(/\|/g, '\\|').replace(/\n/g, ' ')} | ${row.id.replace(/\|/g, '\\|').replace(/\n/g, ' ')} | ${row.screens || '—'} |`,
    ),
    '',
  ].join('\n');
  writeFileSync(join(OUT_DIR, `${onlyBatch}.md`), md, 'utf8');

  console.log(`${selected.length} keys → ${relative(ROOT, csvPath)} and ${relative(ROOT, join(OUT_DIR, `${onlyBatch}.md`))}`);
}

/** Minimal RFC-4180 reader: quoted cells, doubled quotes, embedded newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cellValue = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cellValue += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cellValue += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cellValue);
      cellValue = '';
    } else if (char === '\n') {
      row.push(cellValue);
      rows.push(row);
      row = [];
      cellValue = '';
    } else if (char !== '\r') {
      cellValue += char;
    }
  }
  if (cellValue.length || row.length) {
    row.push(cellValue);
    rows.push(row);
  }
  return rows;
}

function applySheet(path) {
  if (!existsSync(path)) throw new Error(`No such worksheet: ${path}`);
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const header = rows.shift() ?? [];
  const column = (name) => header.indexOf(name);
  const keyAt = column('key');
  const enAt = column('english');
  const idAt = column('indonesian');
  if (keyAt === -1 || enAt === -1 || idAt === -1) {
    throw new Error('A worksheet needs the columns key, english, indonesian — export one first.');
  }

  const { source, tables } = load();
  /** valueStart/End → replacement, applied right-to-left so offsets stay valid. */
  const edits = [];
  const unknown = [];
  const changed = [];
  for (const row of rows) {
    const key = (row[keyAt] ?? '').trim();
    if (!key || key === header[keyAt]) continue;
    for (const [lang, at] of [
      ['en', enAt],
      ['id', idAt],
    ]) {
      const next = row[at] ?? '';
      const entry = tables[lang].get(key);
      if (!entry) {
        unknown.push(`${lang}:${key}`);
        continue;
      }
      if (next === entry.value) continue;
      if (!next.trim()) continue; // an empty cell means "not reviewed", not "delete"
      edits.push({ start: entry.valueStart, end: entry.valueEnd, text: quote(next) });
      changed.push(`${lang}:${key}`);
    }
  }
  if (!edits.length) {
    console.log('Nothing to apply: every reviewed cell already matches strings.ts.');
    return;
  }
  let output = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  writeFileSync(STRINGS_FILE, output, 'utf8');
  console.log(`Applied ${edits.length} value(s): ${changed.slice(0, 8).join(', ')}${changed.length > 8 ? ', …' : ''}`);
  if (unknown.length) {
    console.log(`Skipped ${unknown.length} cell(s) whose key does not exist: ${unknown.slice(0, 5).join(', ')}`);
  }
  console.log('Now run: npm run lint && npm run i18n:coverage -- --strict');
}

const args = process.argv.slice(2);
const batchArg = args.find((arg) => arg.startsWith('--batch='))?.split('=')[1];
const applyArg = args.find((arg) => arg.startsWith('--apply'));
const applyPath = applyArg ? (args[args.indexOf(applyArg) + 1] ?? '') : '';

try {
  if (applyArg) {
    if (!applyPath || applyPath.startsWith('--')) throw new Error('--apply needs a worksheet path');
    applySheet(applyPath);
  } else if (args.includes('--export')) {
    exportSheets({ onlyBatch: batchArg });
  } else {
    exportSheets({});
  }
} catch (error) {
  console.error(`i18n-strings: ${error.message}`);
  process.exit(1);
}
