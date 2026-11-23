/**
 * The offline half of `scripts/load-content-updates.mjs`: the run's error type and
 * the catalogue review that needs no secret and no network.
 *
 * WHY IT IS ITS OWN FILE
 * The loader crossed the 500-line script budget when `--offline` was added. The
 * split follows the seam the script already had — `main()` is I/O, the catalogue
 * rendering is not — and nothing was deleted: `load-content-updates.mjs` re-exports
 * `RunError`/`fail`/`describeValue`/`offlineReport` so existing callers keep the path
 * they know.
 */

import { readFileSync } from 'node:fs';
import {
  OPENER_LEVELS,
  payloadIssues,
  scenarioPayload,
  scenarioRows,
} from './content-updates.mjs';

export class RunError extends Error {}

/**
 * Thrown, never `process.exit()`: on this host an immediate exit right after a
 * write to a piped stdout aborts with `0xC0000409`, which masks the real status
 * and reports a completed load as a crash. `main()` returns a status instead and
 * the entry point sets `process.exitCode`, letting Node flush the pipes.
 */
export function fail(message) {
  throw new RunError(message);
}

export function describeValue(value) {
  if (value === null || value === undefined || value === '') return '(empty)';
  const text = String(value);
  return text.length > 72 ? `${text.slice(0, 69)}…` : text;
}

/**
 * The catalogue, rendered for review — no network, no secret, no writes.
 *
 * The dry run needs `ADMIN_SECRET` to read the live rows, so a machine without
 * the secret could not even see whether the catalogue was complete; the 12 new
 * scenes were authored for days before anyone could check them. This mode reads
 * the file and prints exactly what a commit would author, so the review and the
 * completeness check happen before any credential is involved.
 */
export function offlineReport({ repoRoot, catalogueFile, verbose }) {
  let catalogue;
  try {
    catalogue = JSON.parse(readFileSync(catalogueFile, 'utf8'));
  } catch (error) {
    fail(`cannot read ${catalogueFile}: ${error}`);
  }
  const rows = scenarioRows(catalogue);
  if (rows.length === 0) fail(`${catalogueFile.replace(`${repoRoot}/`, '')} has no scenarios — nothing to review`);

  console.log(`Catalogue, offline (nothing is read or written): ${catalogueFile.replace(`${repoRoot}/`, '')}`);
  console.log(`  version: ${catalogue?.version ?? '(none)'} · updated: ${catalogue?.updated ?? '(none)'}`);
  console.log(`  scenarios: ${rows.length} · openers per row: ${OPENER_LEVELS.join(', ')}`);
  for (const row of rows) {
    const payload = scenarioPayload(row);
    console.log(`  ${payload.id} — ${payload.title_de}`);
    console.log(`    ${payload.title_ar}`);
    console.log(`    persona: ${payload.ai_persona} · category: ${payload.category} · icon: ${payload.icon}`);
    if (verbose) {
      for (const level of OPENER_LEVELS) {
        const [german, arabic] = row?.openers?.[level] ?? [];
        console.log(`    ${level}: ${describeValue(german)} | ${describeValue(arabic)}`);
      }
    }
  }

  const issues = payloadIssues(rows);
  if (issues.length > 0) {
    for (const issue of issues.slice(0, 20)) console.error(`  ${issue}`);
    console.error(`\n${issues.length} catalogue problem(s) — a commit would refuse. Nothing was read or written.`);
    return 1;
  }
  console.log('\nCatalogue complete — every row authors all five openers. A dry run needs ADMIN_SECRET; a commit needs --commit.');
  return 0;
}
