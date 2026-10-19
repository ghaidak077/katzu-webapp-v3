#!/usr/bin/env node
/**
 * What a verification run cost — recorded, not argued about. `npm run cost:report`.
 *
 * WHY THIS EXISTS
 * The orientation documents were cut from ~780 KB to ~70 KB and the gate became one command, but
 * "faster and cheaper" stayed a claim about *structure*: nothing wrote down how long a real gate took,
 * so no run could compare itself to the last one, and a regression in the cost of working here was
 * invisible. This appends one JSON line per gate run to a local, gitignored file and reads it back.
 *
 * WHAT IS MEASURED, AND WHAT IS NOT
 * Measured: wall-clock seconds for the whole run and for each step, the number of files in the syntax
 * pass, and the size of the orientation payload (`npm run session:start`), because that is the one
 * number that actually did shrink and it should be visible next to the gate time.
 * NOT measured: model tokens. The harness exposes no token counter (`ENV-FACTS.md` §A: UNKNOWN), so no
 * number here is a token count and it must never be reported as one. The proxy is honest: seconds and
 * bytes on disk, both reproducible by rerunning the command.
 *
 * The log is `.verify-runs.ndjson` in the repo root — gitignored on purpose. It is machine-local
 * telemetry, not repository content: committing it would make every run dirty the tree, which is the
 * class of thing this repo has already been burned by (`playwright.config.ts` on the evidence rigs).
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LOG_FILE = '.verify-runs.ndjson';

/** One line, one run. Documented here because this function and the reader below are the shape. */
export function recordRun(entry, file = LOG_FILE) {
  // `resolve`, not `join`: a caller may pass an absolute path (the test does), and `join` would
  // concatenate it onto the cwd into a path that cannot exist.
  appendFileSync(resolve(process.cwd(), file), `${JSON.stringify(entry)}\n`, 'utf8');
}

/**
 * Tolerant on purpose: this file is appended to by runs that may be killed mid-write (a timeout, a
 * Ctrl-C), so a truncated last line must never break the report.
 */
export function parseRuns(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed.seconds === 'number' ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarise(runs) {
  if (runs.length === 0) return null;
  const slowest = runs.reduce((worst, run) => (run.seconds > worst.seconds ? run : worst), runs[0]);
  return {
    count: runs.length,
    first: runs[0].at ?? 'unknown',
    last: runs[runs.length - 1].at ?? 'unknown',
    medianSeconds: median(runs.map((run) => run.seconds)),
    slowest,
    failures: runs.filter((run) => run.ok === false).length,
    recent: runs.slice(-5),
  };
}

/** The printed report, as lines — pure, so the test can assert on it without a file. */
export function reportLines(runs) {
  const summary = summarise(runs);
  if (!summary) {
    return [
      'No verification runs recorded yet.',
      'They are written by `npm run verify -- --cost` (pre-push does it); this file is machine-local',
      `and gitignored (${LOG_FILE}).`,
    ];
  }
  const lines = [
    `VERIFY COST — ${summary.count} recorded run(s), ${summary.failures} red`,
    `  window:   ${summary.first} → ${summary.last}`,
    `  median:   ${summary.medianSeconds.toFixed(1)}s`,
    `  slowest:  ${summary.slowest.seconds.toFixed(1)}s (${summary.slowest.profile ?? 'unknown'}${summary.slowest.at ? `, ${summary.slowest.at}` : ''})`,
    '  last runs:',
  ];
  for (const run of summary.recent) {
    const steps = Array.isArray(run.steps)
      ? run.steps.map((step) => `${step.name} ${Number(step.seconds ?? 0).toFixed(1)}s`).join(' · ')
      : '';
    lines.push(`    ${run.ok === false ? 'RED ' : 'ok  '} ${run.at ?? '?'}  ${run.profile ?? '?'}  ${Number(run.seconds).toFixed(1)}s`);
    if (steps) lines.push(`         ${steps}`);
  }
  lines.push('  This is wall-clock and bytes on disk. It is NOT a token count — the harness exposes none.');
  return lines;
}

export function main() {
  let text = '';
  try {
    text = readFileSync(resolve(process.cwd(), LOG_FILE), 'utf8');
  } catch {
    text = '';
  }
  for (const line of reportLines(parseRuns(text))) console.log(line);
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) process.exit(main());
