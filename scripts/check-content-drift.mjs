#!/usr/bin/env node
/**
 * Post-load content drift check — READ ONLY.
 *
 * Compares what the deployed Worker serves (public content endpoints) against what
 * the repository's drafts declare, row by row, and reports every difference. It
 * exists because two divergences were found by hand, not by a gate:
 *
 *   - V14-1: D1's `airport_arrival.title_de` became the approved module2 title
 *     while the offline fixture, the demo copy and `e2e/journey.spec.ts` still
 *     used the old one. Every test runs against mocks or the fixture, so nothing
 *     could see it.
 *   - V14-2: 19 vocabulary rows the drafts declare were never written, because
 *     production already had the same `level|german|topic` and the loader skips
 *     existing rows by rule (`scripts/load-curriculum.mjs:234`). Production keeps
 *     the older wording; the draft's approved wording stays in the repo.
 *
 * Guarantees, in the order they matter:
 *   1. **Only `GET` requests on public endpoints** (`/scenarios`, `/scenarios/:id`,
 *      `/vocabulary`, `/grammar`). No secret, no admin route, no `POST`, no write
 *      path. It cannot modify production.
 *   2. Rows are matched by natural key (scenario id, grammar id,
 *      `level|german|topic`, `scenario_id|german`) and only the draft's own
 *      columns are compared. Live rows the drafts never declare (the pre-module
 *      catalogue, and the legacy `grammar` rows) are counted, not flagged —
 *      modules are additive by design.
 *   3. Every difference is classified, because the classes have different owners:
 *        `diverged` — the key is live, the values are not the draft's. In practice
 *                     this is a row production already served, so the loader
 *                     skipped it (`--strict`-able, but it is the runbook's rule).
 *        `absent`   — a module declares a row production does not have: a real
 *                     load gap.
 *        `pending`  — the same, for a supplement. Supplements are not loaded yet
 *                     (V14 decided to write `grammar-basics.json` without loading
 *                     it), so their rows are declared-but-unloaded on purpose.
 *        `duplicate`— two drafts declare one natural key with different values.
 *                     The loader writes the first and skips the second, so the
 *                     other draft's wording is silently dropped.
 *
 * Exit code: 0 when production matches the drafts · 1 when anything differs ·
 * 2 on a transport or shape failure. Pass `--strict` to also fail on the
 * by-design classes (`diverged`, `pending`), which is what a load runbook wants
 * when it is checking that *its* rows landed.
 *
 * Usage:
 *   node scripts/check-content-drift.mjs [--url=https://...] [--json] [--max=25] [--strict]
 *
 * `--url` defaults to `KATZU_WORKER_URL`, then to the deployed test Worker.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(repoRoot, 'docs', 'content');
const supplementDir = join(contentDir, 'supplements');

const DEFAULT_BASE = 'https://katzu-test.ghaidakalosh008.workers.dev';

/** Natural key + compared columns per table, mirroring the loader's own keys. */
export const TABLE_SPECS = {
  scenarios: {
    keyParts: ['id'],
    columns: [
      'id', 'title_de', 'title_ar', 'ai_persona', 'category', 'icon',
      'initial_message_a0', 'initial_message_a1', 'initial_message_a2', 'initial_message_b1', 'initial_message_b2', 'banner_url',
    ],
  },
  vocabulary: {
    keyParts: ['level', 'german', 'topic'],
    columns: [
      'german', 'article', 'plural', 'part_of_speech', 'translation_ar', 'translation_en',
      'example_de', 'example_ar', 'example_en', 'level', 'topic',
    ],
  },
  starter_phrases: {
    keyParts: ['scenario_id', 'german'],
    columns: ['scenario_id', 'level', 'german', 'translation_en', 'translation_ar', 'sort_order'],
  },
  grammar: {
    keyParts: ['id'],
    columns: ['id', 'title_ar', 'rule_de', 'rule_ar', 'level', 'explanation_ar', 'example_de', 'example_ar'],
  },
};

/** Everything is compared as text: null/undefined and '' are the same absence. */
export function norm(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value.trim() : String(value);
}

/** `|`-joined key as it reads on disk (upper-cased `level`, capitalised nouns). */
export function displayKey(table, row) {
  return TABLE_SPECS[table].keyParts.map((part) => norm(row[part])).join('|');
}

/** Match key — case-insensitive, so `A1|Brot|food` and `a1|brot|food` are one row. */
export function matchKey(table, row) {
  return displayKey(table, row).toLowerCase();
}

/**
 * Compare every declared row against the live rows. Pure: no network, no disk.
 * `drafts` is `[{ file, kind: 'module' | 'supplement', draft }]`, `live` is
 * `{ scenarios, vocabulary, phrases, grammar }` with phrases already flattened
 * across the declared scenarios.
 */
export function compareDrafts(drafts, live) {
  const tables = [];
  const duplicates = [];

  for (const [table, spec] of Object.entries(TABLE_SPECS)) {
    const declared = [];
    for (const { file, kind, draft } of drafts) {
      for (const row of draft[table] ?? []) declared.push({ row, file, kind });
    }

    // Which draft files declare each key. A key two drafts declare means the
    // loader will write the first one it is given and skip the rest, so a
    // divergence there is not production's fault — it is an authoring overlap.
    const declaredByKey = new Map();
    for (const { row, file, kind } of declared) {
      if (kind === 'supplement') continue;
      const key = matchKey(table, row);
      if (!declaredByKey.has(key)) declaredByKey.set(key, new Set());
      declaredByKey.get(key).add(file);
    }

    // First live row wins, matching the loader's own read order.
    const liveIndex = new Map();
    for (const row of live[table] ?? []) {
      const key = matchKey(table, row);
      if (!liveIndex.has(key)) liveIndex.set(key, row);
    }

    const detail = [];
    let identical = 0;
    for (const { row, file, kind } of declared) {
      const key = matchKey(table, row);
      const liveRow = liveIndex.get(key);

      if (!liveRow) {
        detail.push({
          kind: kind === 'supplement' ? 'pending' : 'absent',
          key: displayKey(table, row),
          file,
          fields: [],
        });
        continue;
      }

      const fields = spec.columns
        .filter((column) => column in row)
        .map((column) => ({ field: column, draft: norm(row[column]), live: norm(liveRow[column]) }))
        .filter(({ draft: wanted, live: actual }) => wanted !== actual);

      if (fields.length === 0) {
        identical += 1;
        continue;
      }
      detail.push({
        kind: 'diverged',
        key: displayKey(table, row),
        file,
        liveId: liveRow.id ?? null,
        fields,
        alsoDeclaredBy: [...(declaredByKey.get(key) ?? [])].filter((other) => other !== file).sort(),
      });
    }

    // One natural key declared twice across drafts: the loader writes the first
    // and skips the rest, so the later draft's wording is dropped silently.
    const byKey = new Map();
    for (const { row, file, kind } of declared) {
      if (kind === 'supplement') continue;
      const key = matchKey(table, row);
      if (!byKey.has(key)) byKey.set(key, { key: displayKey(table, row), byFile: new Map() });
      byKey.get(key).byFile.set(file, JSON.stringify(TABLE_SPECS[table].columns.map((column) => norm(row[column]))));
    }
    for (const entry of byKey.values()) {
      if (entry.byFile.size > 1) {
        duplicates.push({
          table,
          key: entry.key,
          files: [...entry.byFile.keys()].sort(),
          disagreeing: new Set(entry.byFile.values()).size > 1,
        });
      }
    }

    const count = (kind) => detail.filter((entry) => entry.kind === kind).length;
    tables.push({
      table,
      declared: declared.length,
      identical,
      diverged: count('diverged'),
      absent: count('absent'),
      pending: count('pending'),
      detail,
    });
  }

  return { tables, duplicates };
}

function listJson(dir) {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => join(dir, name));
  } catch {
    // No supplements directory is not a failure: it is an empty set.
    return [];
  }
}

/** Every draft on disk, tagged with the shape the audit uses. */
export function loadDrafts() {
  return [...listJson(contentDir), ...listJson(supplementDir)].map((absolute) => {
    const posix = absolute.replace(/\\/g, '/');
    return {
      file: posix.slice(posix.indexOf('docs/')),
      kind: posix.includes('/supplements/') ? 'supplement' : 'module',
      draft: JSON.parse(readFileSync(absolute, 'utf8')),
    };
  });
}

/** Read-only: GETs on the public content endpoints, nothing else. */
export async function fetchLive(base, drafts) {
  const get = async (path) => {
    const response = await fetch(`${base}${path}`);
    if (!response.ok) throw new Error(`GET ${path} → HTTP ${response.status}`);
    return response.json();
  };

  const [scenarios, vocabulary, grammar] = await Promise.all([
    get('/scenarios'),
    get('/vocabulary'),
    get('/grammar'),
  ]);
  if (!Array.isArray(scenarios) || !Array.isArray(vocabulary) || !Array.isArray(grammar)) {
    throw new Error('the public content endpoints did not return arrays — is --url the worker?');
  }

  // Phrases are only served per scenario, so they are flattened under the table
  // name the comparison uses (`starter_phrases`, not `phrases`).
  //
  // A scenario that is approved in the repo but not yet loaded reports 404 here.
  // That is the "pending load" state, not a tool failure: skip it and let the
  // comparison classify its declared rows as absent/pending (V24-1). Any other
  // non-ok answer is still a hard abort — a 500 is a real problem.
  const liveScenarioIds = new Set(scenarios.map((row) => row.id));
  const starter_phrases = [];
  for (const { draft } of drafts) {
    for (const scenario of draft.scenarios ?? []) {
      if (!liveScenarioIds.has(scenario.id)) continue;
      const body = await get(`/scenarios/${encodeURIComponent(scenario.id)}`);
      for (const phrase of body?.starter_phrases ?? []) starter_phrases.push({ ...phrase, scenario_id: scenario.id });
    }
  }

  return { scenarios, vocabulary, starter_phrases, grammar };
}

/** One vocabulary of totals for the human report and the exit code. */
export function summarise(comparison) {
  const totals = comparison.tables.reduce(
    (sum, table) => ({
      diverged: sum.diverged + table.diverged,
      // Two flavours of the loader's skip rule: production already had the key,
      // or another draft declared it first.
      divergedPreexisting:
        sum.divergedPreexisting +
        table.detail.filter((entry) => entry.kind === 'diverged' && entry.alsoDeclaredBy.length === 0).length,
      divergedOverlaps:
        sum.divergedOverlaps +
        table.detail.filter((entry) => entry.kind === 'diverged' && entry.alsoDeclaredBy.length > 0).length,
      absent: sum.absent + table.absent,
      pending: sum.pending + table.pending,
      duplicates: sum.duplicates,
      tablesWithGaps: sum.tablesWithGaps + (table.absent > 0 ? 1 : 0),
    }),
    {
      diverged: 0,
      divergedPreexisting: 0,
      divergedOverlaps: 0,
      absent: 0,
      pending: 0,
      duplicates: comparison.duplicates.length,
      tablesWithGaps: 0,
    },
  );
  return { differences: totals.diverged + totals.absent + totals.pending + totals.duplicates, totals };
}

function report({ base, drafts, live, comparison, maxDetail }) {
  const modules = drafts.filter((draft) => draft.kind === 'module').length;
  const supplements = drafts.length - modules;

  console.log(`Content drift check — READ ONLY — against ${base}`);
  console.log(`  drafts: ${drafts.length} file(s) — ${modules} module(s), ${supplements} supplement(s)`);
  console.log(
    `  live: ${live.scenarios.length} scenarios · ${live.vocabulary.length} vocabulary · ` +
      `${live.starter_phrases.length} phrases (declared scenarios) · ${live.grammar.length} grammar`,
  );

  let printed = 0;
  let withheld = 0;
  for (const table of comparison.tables) {
    const ok = table.diverged + table.absent + table.pending === 0;
    console.log(
      `\n  ${ok ? '✔' : '✘'} ${table.table}: ${table.declared} declared · ${table.identical} identical · ` +
        `${table.diverged} diverged · ${table.absent} absent · ${table.pending} pending`,
    );
    for (const entry of table.detail) {
      if (printed >= maxDetail) {
        withheld += 1;
        continue;
      }
      printed += 1;
      if (entry.kind === 'diverged') {
        const shown = entry.fields.map(({ field }) => field).join(', ');
        const cause = entry.alsoDeclaredBy?.length
          ? ` — also declared by ${entry.alsoDeclaredBy.join(', ')}; the loader wrote the other file's copy`
          : ' — production already had this key, so the loader skipped this row';
        console.log(`      ${entry.key} — live id ${entry.liveId}, ${entry.fields.length} field(s): ${shown}${cause}`);
        for (const { field, draft, live: actual } of entry.fields) {
          console.log(`        ${field}: draft "${draft}" vs live "${actual}"`);
        }
      } else if (entry.kind === 'pending') {
        console.log(`      ${entry.key} — declared in ${entry.file}, absent from production (supplement not loaded)`);
      } else {
        console.log(`      ${entry.key} — declared in ${entry.file}, absent from production (load gap)`);
      }
    }
  }
  if (withheld > 0) console.log(`\n  … ${withheld} more row(s) not detailed (--max=${maxDetail})`);

  if (comparison.duplicates.length > 0) {
    console.log('\n  duplicate natural keys across drafts (the loader writes the first, skips the rest):');
    for (const duplicate of comparison.duplicates) {
      console.log(
        `      ${duplicate.table} ${duplicate.key} — ${duplicate.files.join(', ')}` +
          (duplicate.disagreeing ? ' (values differ)' : ' (identical values)'),
      );
    }
  }

  const { differences, totals } = summarise(comparison);

  console.log(
    `\n${differences === 0 ? 'NO DRIFT' : `DRIFT — ${differences} row(s)`}: ` +
      `${totals.diverged} diverged = ${totals.divergedPreexisting} key already live + ${totals.divergedOverlaps} key another draft took ` +
      '(both the loader\'s documented skip rule), ' +
      `${totals.absent} absent across ${totals.tablesWithGaps} table(s), ${totals.pending} pending (supplement), ` +
      `${totals.duplicates} duplicate key(s) across drafts.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const urlArg = args.find((arg) => arg.startsWith('--url='));
  const maxArg = args.find((arg) => arg.startsWith('--max='));
  const strict = args.includes('--strict');
  const asJson = args.includes('--json');
  const base = (urlArg ? urlArg.slice('--url='.length) : process.env.KATZU_WORKER_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const maxDetail = maxArg ? Number(maxArg.slice('--max='.length)) : 25;

  if (!/^https:\/\//.test(base)) {
    console.error(`refusing to check "${base}" — expected an https worker URL`);
    process.exit(2);
  }

  const drafts = loadDrafts();
  if (drafts.length === 0) {
    console.error(`no curriculum drafts found in ${contentDir}`);
    process.exit(2);
  }

  const live = await fetchLive(base, drafts);
  const comparison = compareDrafts(drafts, live);

  if (asJson) {
    const summary = summarise(comparison);
    console.log(
      JSON.stringify(
        { base, drafts: drafts.map(({ file, kind }) => ({ file, kind })), ...summary, comparison },
        null,
        1,
      ),
    );
    process.exit(exitCode(summary, strict));
  }

  console.log('');
  report({ base, drafts, live, comparison, maxDetail });
  process.exit(exitCode(summarise(comparison), strict));
}

/**
 * 0 in agreement · 1 when something the load cannot justify is present.
 *
 * Without `--strict` the by-design classes pass: `diverged` rows were already live
 * before this run (the loader's documented skip rule, `load-curriculum.mjs:234`),
 * and `pending` supplements are unloaded on purpose. Only a module row production
 * does not have at all, or two drafts fighting over one key, is a hard failure.
 */
function exitCode({ differences, totals }, strict) {
  if (differences === 0) return 0;
  if (strict) return 1;
  return totals.absent > 0 || totals.duplicates > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`✘ ${String(error?.message || error)}`);
    process.exit(2);
  });
}
