#!/usr/bin/env node
/**
 * The strict launch check.
 *
 * WHAT IT IS FOR
 * One question: is anything in the legal text still waiting for the owner? The
 * app marks those places `{{OWNER_FILL}}` rather than inventing them, so this
 * script counts them and lists them by page and section.
 *
 * WHY IT IS A SEPARATE, NON-BLOCKING CI JOB
 * `LAUNCH_STRICT=1` turns the outstanding placeholders into a failure — that is
 * the gate to run before a store submission, and it is expected to fail today,
 * because the legal text is the owner's to write and this repository may not
 * write it. It is a separate job rather than part of the main pipeline so that a
 * deliberately incomplete legal page never turns every code push red, and never
 * hides the fact that it is incomplete either: the report is printed either way.
 *
 * Exit codes: 0 clean (or strict with nothing outstanding), 1 strict with
 * outstanding fields, 2 could not read the content.
 *
 * Usage:
 *   node scripts/check-launch.mjs             # report only, never fails
 *   LAUNCH_STRICT=1 node scripts/check-launch.mjs   # fails while any field is open
 *   LAUNCH_VERIFY=1 node scripts/check-launch.mjs    # fails only if the GATE is broken
 *
 * WHY THE THIRD MODE EXISTS
 * `tests/ciWorkflow.test.ts` forbids `continue-on-error` anywhere in the workflow,
 * and that rule is right: a pipeline step that swallows failures teaches everyone
 * to ignore red. So CI cannot mark this job "informational" the usual way. Instead
 * CI runs `LAUNCH_VERIFY=1`, which executes the strict check and asserts the gate
 * BEHAVES — it exits 1 exactly while a field is open and 0 when none are. The job
 * therefore fails if the gate is broken, and passes while the legal text is
 * legitimately the owner's to write. The owner's own pre-submission run is
 * `npm run check:launch:strict`, whose exit code is the gate.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'src', 'lib', 'trust', 'content.ts');
const PLACEHOLDER = '{{OWNER_FILL}}';
const strict = process.env.LAUNCH_STRICT === '1';
const verify = process.env.LAUNCH_VERIFY === '1';

let text = '';
try {
  text = readFileSync(source, 'utf8');
} catch (error) {
  console.error(`[launch-check] cannot read ${source}: ${error.message}`);
  process.exit(2);
}

// Each page is a key in TRUST_CONTENT; the sections under it carry the ids. The
// scan is textual on purpose: it must run without a TypeScript toolchain, so a
// broken build can still be checked for unfinished legal text.
const outstanding = [];
for (const match of text.matchAll(/id:\s*'([a-z-]+)'[\s\S]{0,400}?bodyAr:\s*`([^`]*)`/g)) {
  const [, sectionId, body] = match;
  if (body.includes(PLACEHOLDER)) outstanding.push(sectionId);
}
// Sections whose whole body IS the placeholder are written as `${OWNER_FILL}`.
for (const match of text.matchAll(/id:\s*'([a-z-]+)'[\s\S]{0,200}?bodyAr:\s*`\$\{OWNER_FILL\}`/g)) {
  const sectionId = match[1];
  if (!outstanding.includes(sectionId)) outstanding.push(sectionId);
}

console.log(`[launch-check] strict=${strict ? '1' : '0'}`);
console.log(`[launch-check] outstanding ${PLACEHOLDER} fields: ${outstanding.length}`);
for (const sectionId of outstanding) console.log(`  - ${sectionId}`);
if (outstanding.length === 0) console.log('[launch-check] every legal field is filled in.');
else console.log('[launch-check] these belong to the owner; see the OWNER LIST in docs/AGENT-STATE.md.');

if (verify) {
  // The gate is verified by re-running it in strict mode and demanding the exact
  // relationship between the count and the exit code.
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, LAUNCH_STRICT: '1', LAUNCH_VERIFY: '0' },
    encoding: 'utf8',
  });
  const expected = outstanding.length > 0 ? 1 : 0;
  if (child.status !== expected) {
    console.error(`[launch-check] GATE BROKEN: strict run exited ${child.status}, expected ${expected}.`);
    process.exit(3);
  }
  if (!/outstanding \{\{OWNER_FILL\}\} fields: \d+/.test(String(child.stdout))) {
    console.error('[launch-check] GATE BROKEN: the strict run produced no machine-readable count.');
    process.exit(3);
  }
  console.log(`[launch-check] gate verified: strict exits ${expected} with ${outstanding.length} open field(s).`);
  process.exit(0);
}

process.exit(strict && outstanding.length > 0 ? 1 : 0);