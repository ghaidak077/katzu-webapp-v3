#!/usr/bin/env node
/**
 * How much of each SCREEN is still hard-coded Arabic?
 *
 * WHY THIS EXISTS
 * `docs/plans/010-multilanguage-master-plan.md` §4 says a screen is "localised" only when every
 * user-visible string it renders comes from `src/lib/i18n/strings.ts`. That is a per-screen claim,
 * and a claim needs a number: "the app is ~80% translated" hides six screens nobody opened. This
 * script answers the only question a batch boundary needs — which screen, how many strings left.
 *
 * It counts **Arabic segments**, not lines: one line commonly holds a label, a hint and a unit, and
 * counting lines would let a batch look finished while it still has three sentences of Arabic. It
 * counts them **once per file** so a repeated word does not inflate the total, and it ignores
 * comments — a doc comment may be Arabic prose, and that is not something a learner reads.
 *
 *   node scripts/i18n-coverage.mjs              # the per-screen table, batches first
 *   node scripts/i18n-coverage.mjs --json       # same numbers, machine-readable
 *   node scripts/i18n-coverage.mjs --strict     # exit 1 if a batch marked done still has Arabic
 *
 * `--strict` reads `src/lib/i18n/coverage.json`. Nothing is marked done there today, so the gate is
 * green for the honest reason (no claim has been made) rather than because it was never run.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'src/lib/i18n/coverage.json');
const SCAN_DIRS = ['src/features', 'src/app', 'src/components'];
const SCAN_EXT = /\.(tsx|ts)$/;

/**
 * The batch order is the learner's own path through the product (plan §4). A file's batch is the
 * first pattern that matches, so the most specific screen wins over its folder.
 */
const BATCHES = [
  {
    id: 'B1',
    name: 'Front door: welcome, sign-in, onboarding',
    patterns: [/^src\/features\/auth\//, /^src\/features\/onboarding\//],
  },
  {
    id: 'B2',
    name: 'Tab bar, Journey home, app shell',
    patterns: [/^src\/features\/journey\//, /^src\/app\//],
  },
  {
    id: 'B3',
    name: 'Story, guided practice, live conversation',
    patterns: [/^src\/features\/conversation\//, /^src\/features\/study\//, /^src\/features\/quiz\//],
  },
  {
    id: 'B4',
    name: 'Session report, review',
    patterns: [/^src\/features\/report\//, /^src\/features\/review\//],
  },
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
      /^src\/features\/dev\//,
    ],
  },
  { id: 'B7', name: 'Shared components', patterns: [/^src\/components\//] },
];

const ARABIC = /[\u0600-\u06FF]/;
/** One run of Arabic text, including the punctuation and quotes that belong to it. */
const ARABIC_SEGMENT = /[\u0600-\u06FF][\u0600-\u06FF\u061F\u060C\u061B\u066B\u066C\s«»…:!?().،\-]*/gu;

const walk = (dir) => {
  if (!existsSync(join(ROOT, dir))) return [];
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return /node_modules|__snapshots__/.test(entry.name) ? [] : walk(path);
    return SCAN_EXT.test(entry.name) ? [path] : [];
  });
};

/**
 * Strip comments before counting. A block comment is prose for the next engineer; a learner never
 * reads it, and counting it would make the script's number a lie in the other direction.
 */
const withoutComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');

const batchFor = (file) => BATCHES.find((batch) => batch.patterns.some((re) => re.test(file))) ?? null;

export const scan = () => {
  const files = SCAN_DIRS.flatMap(walk).sort();
  const screens = [];
  for (const file of files) {
    const source = withoutComments(readFileSync(join(ROOT, file), 'utf8'));
    if (!ARABIC.test(source)) continue;
    const seen = new Map();
    for (const match of source.matchAll(ARABIC_SEGMENT)) {
      const text = match[0].replace(/\s+/g, ' ').trim();
      // A single letter or a lone punctuation mark is not a string a learner reads.
      if (text.replace(/[^\u0600-\u06FF]/g, '').length < 2) continue;
      seen.set(text, (seen.get(text) ?? 0) + 1);
    }
    if (!seen.size) continue;
    screens.push({
      file,
      batch: batchFor(file)?.id ?? '—',
      strings: seen.size,
      occurrences: [...seen.values()].reduce((a, b) => a + b, 0),
      samples: [...seen.keys()].slice(0, 3),
    });
  }
  const totals = new Map();
  for (const screen of screens) {
    const row = totals.get(screen.batch) ?? { strings: 0, screens: 0 };
    row.strings += screen.strings;
    row.screens += 1;
    totals.set(screen.batch, row);
  }
  return { screens, totals: Object.fromEntries(totals) };
};

const loadManifest = () => {
  if (!existsSync(MANIFEST)) return { batches: {} };
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
};

const main = () => {
  const { screens, totals } = scan();
  const manifest = loadManifest();
  const json = process.argv.includes('--json');
  const done = (id) => manifest.batches?.[id] === true;
  const open = screens.filter((screen) => done(screen.batch));

  if (json) {
    console.log(JSON.stringify({ screens, totals, doneBatches: manifest.batches ?? {} }, null, 2));
  } else {
    if (!screens.length) {
      console.error('no Arabic found in any screen — wrong directory?');
      process.exit(2);
    }
    for (const batch of BATCHES) {
      const rows = screens.filter((screen) => screen.batch === batch.id);
      if (!rows.length) continue;
      const label = done(batch.id) ? 'done' : 'open';
      console.log(`\n${batch.id} — ${batch.name}  [${label}, ${totals[batch.id].strings} strings in ${rows.length} files]`);
      for (const row of rows.sort((a, b) => b.strings - a.strings)) {
        console.log(`  ${String(row.strings).padStart(4)}  ${row.file}`);
      }
    }
    const all = screens.reduce((sum, row) => sum + row.strings, 0);
    console.log(
      `\n${screens.length} screens carry ${all} distinct Arabic strings. ` +
        'A screen is localised only when its count is zero (plan §4).',
    );
    if (open.length) {
      console.log(
        `A batch marked done still carries Arabic: ${open.length} file(s). ` +
          'Fix the screen, or un-mark the batch in src/lib/i18n/coverage.json — never both silent.',
      );
    }
  }
  process.exit(open.length ? 1 : 0);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
