#!/usr/bin/env node
/**
 * Fails when the worker serves a first message the shipped bundle cannot translate.
 *
 * WHY THIS EXISTS
 * V47 shipped a map built from the authored 61-scenario catalogue while the worker was
 * already serving 49 different scenarios. 221 first messages rendered with no Arabic,
 * and nothing failed: the build validated the snapshot it was given, and the snapshot
 * was not what the learner receives. The two content sets are legitimate (the authored
 * catalogue is the source for a refresh; the worker is what is live), so the guard is
 * not "make them identical" — it is "compare the shipped map against the content the
 * worker actually serves, and stop the gate when one first message would render bare".
 *
 * WHAT IT CHECKS
 *  - every non-empty `initial_message_<level>` on the served scenarios resolves, through
 *    the same trim + whitespace-collapse the app uses, to a non-empty Arabic gloss;
 *  - the gloss actually contains Arabic letters (a placeholder or an empty string is a
 *    miss even though the key exists);
 *  - the payload is readable as a scenario list, so a changed response shape fails loudly
 *    instead of auditing zero scenarios and passing.
 *
 * USAGE
 *   node scripts/audit-opener-coverage.mjs              # fetch the worker (3 attempts)
 *   node scripts/audit-opener-coverage.mjs --offline    # committed fixture, no network
 *   node scripts/audit-opener-coverage.mjs --fixture <path>
 *   node scripts/audit-opener-coverage.mjs --json       # machine-readable result
 *
 * Exit codes: 0 covered, 1 a served opener has no Arabic, 2 the content could not be read.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { OPENER_GLOSSES } from '../cloudflare-opener-glosses.generated.js';

export const LEVELS = ['a0', 'a1', 'a2', 'b1', 'b2'];
export const DEFAULT_ORIGIN = 'https://katzu-test.ghaidakalosh008.workers.dev';
export const FIXTURE = 'tests/fixtures/live-scenarios.json';
export const ARABIC = /[\u0600-\u06FF]/;

/** The app's lookup normalisation: `storedOpenerArabic` trims and collapses whitespace. */
export const keyOf = (text) => String(text || '').trim().replace(/\s+/g, ' ');

/** `/scenarios` returns a bare array; the committed fixture wraps it. Accept both. */
export function scenariosFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.scenarios)) return payload.scenarios;
  throw new Error('scenario payload is neither an array nor { scenarios: [...] }');
}

/**
 * The pure half: what the worker serves, against what ships.
 *
 * `missing` carries the reason, because "no gloss" and "a gloss that is not Arabic"
 * need different fixes (author a translation vs. repair a bad row).
 */
export function auditOpeners(payload, glosses = OPENER_GLOSSES) {
  const scenarios = scenariosFrom(payload);
  const missing = [];
  let openers = 0;
  for (const scenario of scenarios) {
    for (const level of LEVELS) {
      const text = keyOf(scenario?.[`initial_message_${level}`]);
      if (!text) continue;
      openers += 1;
      const gloss = Object.prototype.hasOwnProperty.call(glosses, text) ? glosses[text] : '';
      const arabic = String(gloss || '').trim();
      if (arabic && ARABIC.test(arabic)) continue;
      missing.push({
        scenario: String(scenario?.id || '(no id)'),
        level: level.toUpperCase(),
        text,
        reason: arabic ? 'gloss has no Arabic' : 'no gloss',
      });
    }
  }
  return { scenarios: scenarios.length, openers, covered: openers - missing.length, missing };
}

/** One line per miss, with the id the reviewer needs to find the content row. */
export function describeMissing(missing) {
  return missing.map(
    (miss) => `${miss.scenario} ${miss.level} (${miss.reason}): ${miss.text}`,
  );
}

async function fetchScenarios(origin) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${origin}/scenarios`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${origin}/scenarios`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw new Error(`could not read ${origin}/scenarios after 3 attempts: ${lastError?.message || lastError}`);
}

function readFixture(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

/**
 * The CLI. `process.exit()` is avoided on purpose: cutting a run short while the fetch
 * handle is still closing trips a libuv assertion on Windows, which reads as a crash
 * instead of the verdict the step is reporting.
 */
async function main() {
  const argv = new Set(process.argv.slice(2));
  const fixtureAt = process.argv.indexOf('--fixture');
  const useFixture = argv.has('--offline') || fixtureAt >= 0;
  const fixture = fixtureAt >= 0 ? process.argv[fixtureAt + 1] : FIXTURE;
  const origin = process.env.KATZU_CONTENT_ORIGIN || DEFAULT_ORIGIN;
  const source = useFixture ? fixture : `${origin}/scenarios`;

  let payload;
  try {
    payload = useFixture ? readFixture(fixture) : await fetchScenarios(origin);
  } catch (error) {
    console.error(`opener coverage: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  let result;
  try {
    result = auditOpeners(payload);
  } catch (error) {
    console.error(`opener coverage: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  if (argv.has('--json')) {
    console.log(JSON.stringify({ source, ...result }, null, 2));
  } else {
    console.log(
      `served opener coverage: ${result.scenarios} scenarios, ${result.openers} first messages, ` +
        `${result.covered} with Arabic, ${result.missing.length} missing (${source})`,
    );
    for (const line of describeMissing(result.missing)) console.error(`  MISSING ${line}`);
  }
  process.exitCode = result.missing.length === 0 ? 0 : 1;
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) await main();
