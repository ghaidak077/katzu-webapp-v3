#!/usr/bin/env node
/**
 * Fails when a served scenario does not belong to exactly one unit.
 *
 * WHY THIS EXISTS
 * The path is now built from units, and a unit lists the scenario ids it owns.
 * That list is a promise: every situation the Worker actually serves must be
 * reachable through exactly one unit, or a learner can be told they finished
 * the path while a served scenario was never offered — and a duplicate owner
 * makes the same situation appear twice in the recommended order. The
 * served-opener gate caught the same class of drift between the worker and the
 * authored catalogue; this is its unit-level twin.
 *
 * WHAT IT CHECKS
 *  - every id in the served payload is in exactly one unit;
 *  - no id is claimed by two units;
 *  - every id a unit claims is actually served (a stale unit row is as bad as a
 *    missing one: it sends the learner to a scenario the worker cannot open).
 *
 * USAGE
 *   node scripts/audit-unit-coverage.mjs              # fetch the worker (3 attempts)
 *   node scripts/audit-unit-coverage.mjs --offline    # committed fixture, no network
 *   node scripts/audit-unit-coverage.mjs --json       # machine-readable result
 *
 * Exit codes: 0 covered, 1 a served id is missing/duplicated or a unit id is not
 * served, 2 the content or the unit config could not be read.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UNITS } from '../src/lib/units/units.ts';

export const DEFAULT_ORIGIN = 'https://katzu-test.ghaidakalosh008.workers.dev';
export const FIXTURE = 'tests/fixtures/live-scenarios.json';

/** `/scenarios` returns a bare array; the committed fixture wraps it. Accept both. */
export function scenariosFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.scenarios)) return payload.scenarios;
  throw new Error('scenario payload is neither an array nor { scenarios: [...] }');
}

/**
 * The pure half: served ids against the unit config.
 *
 * `owners` is built by hand rather than through the app's first-wins map, so a
 * duplicate is visible as a duplicate instead of being silently collapsed.
 */
export function auditUnitCoverage(payload, units = UNITS) {
  const served = scenariosFrom(payload)
    .map((scenario) => String(scenario?.id || ''))
    .filter(Boolean);
  const servedSet = new Set(served);

  const owners = new Map();
  const duplicates = [];
  const stale = [];
  for (const unit of units) {
    for (const scenarioId of unit.scenarioIds) {
      const list = owners.get(scenarioId) || [];
      if (list.length > 0) duplicates.push({ scenarioId, units: [...list, unit.id] });
      else owners.set(scenarioId, [unit.id]);
      if (!servedSet.has(scenarioId)) stale.push({ scenarioId, unit: unit.id });
    }
  }

  const missing = served.filter((scenarioId) => !owners.has(scenarioId));
  const duplicateIds = new Set(duplicates.map((entry) => entry.scenarioId));
  return {
    served: served.length,
    units: units.length,
    covered: served.length - missing.length - duplicateIds.size,
    missing,
    duplicates,
    stale,
  };
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
      if (attempt < 3) await new Promise((done) => setTimeout(done, attempt * 1_000));
    }
  }
  throw new Error(`could not read ${origin}/scenarios after 3 attempts: ${lastError?.message || lastError}`);
}

async function main() {
  const argv = new Set(process.argv.slice(2));
  const useFixture = argv.has('--offline');
  const origin = process.env.KATZU_CONTENT_ORIGIN || DEFAULT_ORIGIN;
  const source = useFixture ? FIXTURE : `${origin}/scenarios`;

  let payload;
  try {
    payload = useFixture ? JSON.parse(readFileSync(resolve(FIXTURE), 'utf8')) : await fetchScenarios(origin);
  } catch (error) {
    console.error(`unit coverage: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  let result;
  try {
    result = auditUnitCoverage(payload);
  } catch (error) {
    console.error(`unit coverage: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const failed = result.missing.length + result.duplicates.length + result.stale.length > 0;
  if (argv.has('--json')) {
    console.log(JSON.stringify({ source, ...result }, null, 2));
  } else {
    console.log(
      `unit coverage: ${result.served} served scenarios across ${result.units} units — ` +
        `${result.covered} covered exactly once, ` +
        `${result.missing.length} missing, ${result.duplicates.length} duplicated, ${result.stale.length} stale (${source})`,
    );
    for (const id of result.missing) console.error(`  MISSING ${id} (no unit owns it)`);
    for (const entry of result.duplicates) {
      console.error(`  DUPLICATE ${entry.scenarioId} (${entry.units.join(', ')})`);
    }
    for (const entry of result.stale) {
      console.error(`  STALE ${entry.scenarioId} in ${entry.unit} (not served)`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) await main();
