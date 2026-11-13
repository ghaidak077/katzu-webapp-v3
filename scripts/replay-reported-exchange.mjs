#!/usr/bin/env node
/**
 * Turn one «أبلغ عن رد سيئ» report into a permanent regression test.
 *
 * The in-app report button sends exactly one exchange — the learner's sentence
 * and Katzu's reply — to the worker. When a learner reports a bad reply, save
 * that JSON payload to a file and run:
 *
 *   npm run regression:report -- report.json
 *
 * The script validates the shape, refuses a scenario that is not yet scripted,
 * and writes `tests/fixtures/reported-exchanges/<slug>.json`. The test in
 * `tests/reportedExchange.test.ts` then runs on every gate: the reply must be a
 * single clean German line (one question at most, zero corrections). Deleting
 * the fixture is the documented way to retire a fixed report.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const fixtureDir = join(repoRoot, 'tests', 'fixtures', 'reported-exchanges');

/**
 * The scripted ids are the single source of truth. They are read from the
 * TypeScript registry by a tiny Node-side regex, so this tool never duplicates
 * the list and never drifts from it.
 */
function scriptedScenarioIds() {
  const source = readFileSync(join(repoRoot, 'src', 'lib', 'conversation', 'script', 'scripts.ts'), 'utf8');
  return new Set([...source.matchAll(/scenarioId:\s*'([^']+)'/g)].map((match) => match[1]));
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const file = process.argv[2];
if (!file) fail('usage: npm run regression:report -- <report.json>');

let payload;
try {
  payload = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
} catch (error) {
  fail(`could not read ${file}: ${error instanceof Error ? error.message : String(error)}`);
}

const scenarioId = typeof payload.scenarioId === 'string' ? payload.scenarioId.trim() : '';
const learnerText = typeof payload.learnerText === 'string' ? payload.learnerText.trim() : '';
const replyText = typeof payload.replyText === 'string' ? payload.replyText.trim() : '';

if (!scenarioId) fail('report is missing `scenarioId`');
if (!learnerText) fail('report is missing `learnerText`');
if (!replyText) fail('report is missing `replyText`');

const scripted = scriptedScenarioIds();
if (!scripted.has(scenarioId)) {
  fail(
    `"${scenarioId}" is not a scripted scenario yet. Reports are only meaningful once the ` +
      'scenario is served by the app-owned script; keep the report in the issue instead.',
  );
}

const fixture = {
  scenarioId,
  cefrLevel: typeof payload.cefrLevel === 'string' ? payload.cefrLevel : undefined,
  learnerText,
  replyText,
  reportedAt: new Date().toISOString(),
  note: typeof payload.note === 'string' ? payload.note.slice(0, 280) : undefined,
};

const slug = `${scenarioId}-${Date.now()}`;
mkdirSync(fixtureDir, { recursive: true });
const target = join(fixtureDir, `${slug}.json`);
writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

console.log(`✓ wrote ${target}`);
console.log('  The gate now covers it. Run just this check with:');
console.log('    npx vitest run tests/reportedExchange.test.ts');
