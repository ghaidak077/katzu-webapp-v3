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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

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

// A second placeholder guard, independent of the trust content: fail if ANY
// shipped source still contains a `{{...}}` placeholder token — e.g.
// `REFUND_TEXT = '{{OWNER_FILL}}'` in `src/lib/offers/pricing.ts`. An app must
// never render an unrendered template string to a learner, and the trust-content
// scan above only knows its own file. This is a source scan (no build needed) and
// matches `{{` followed by an uppercase letter or underscore — the placeholder
// shape — so it deliberately does NOT match JSX `{{ ... }}` expressions or JSDoc
// object types like `{{ ok: boolean }}`.
const SHIPPED_ROOTS = ['src', 'sales'];
const shippedFiles = [];
const collectShipped = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) { collectShipped(full); continue; }
    if (/\.(ts|tsx|js|jsx|html|css|json)$/.test(entry)) shippedFiles.push(full);
  }
};
for (const shippedRoot of SHIPPED_ROOTS) {
  try { collectShipped(join(root, shippedRoot)); } catch { /* root may not exist */ }
}
try {
  for (const entry of readdirSync(root)) {
    if (/^cloudflare-.*\.js$/.test(entry)) shippedFiles.push(join(root, entry));
  }
} catch { /* unreadable project root */ }
const PLACEHOLDER_TOKEN = /\{\{[A-Z_]/;
const placeholders = [];
for (const file of shippedFiles) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    // Skip comment-only lines: a comment explaining the placeholder is not a
    // shipped string. A trailing comment on a code line is still caught.
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
    if (PLACEHOLDER_TOKEN.test(line)) {
      placeholders.push({ file: relative(root, file), line: index + 1, text: trimmed.slice(0, 120) });
    }
  });
}

// A third, independent launch blocker: the public origin. Until
// `VITE_PUBLIC_APP_URL` is set, the generated robots/sitemap stay relative and so
// does the share image in `index.html` — which resolves, but a social crawler
// wants absolute. It is owner-only (the domain is not the agent's to choose), so
// it is counted alongside the legal fields and fails the strict gate the same way.
const appUrl = String(process.env.VITE_PUBLIC_APP_URL || '').trim();
const blockers = [...outstanding];
if (placeholders.length) blockers.push('{{placeholders}}');
if (!appUrl) blockers.push('VITE_PUBLIC_APP_URL');

console.log(`[launch-check] strict=${strict ? '1' : '0'}`);
console.log(`[launch-check] outstanding ${PLACEHOLDER} fields: ${outstanding.length}`);
for (const sectionId of outstanding) console.log(`  - ${sectionId}`);
if (outstanding.length === 0) console.log('[launch-check] every legal field is filled in.');
else console.log('[launch-check] these belong to the owner; see the OWNER LIST in docs/AGENT-STATE.md.');
console.log(`[launch-check] shipped strings containing a {{ placeholder token: ${placeholders.length}`);
for (const spot of placeholders) {
  console.log(`  - ${spot.file}:${spot.line}  ${spot.text}`);
}
if (placeholders.length === 0) console.log('[launch-check] no unrendered {{ placeholder ships to a learner.');
else console.log('[launch-check] replace these before shipping (e.g. REFUND_TEXT in src/lib/offers/pricing.ts).');
if (appUrl) console.log(`[launch-check] VITE_PUBLIC_APP_URL set → og:image and robots/sitemap use absolute URLs.`);
else console.log('[launch-check] VITE_PUBLIC_APP_URL is NOT set → share image and robots/sitemap stay relative; crawlers want absolute. Owner-only.');

if (verify) {
  // The gate is verified by re-running it in strict mode and demanding the exact
  // relationship between the count and the exit code.
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, LAUNCH_STRICT: '1', LAUNCH_VERIFY: '0' },
    encoding: 'utf8',
  });
  const expected = blockers.length > 0 ? 1 : 0;
  if (child.status !== expected) {
    console.error(`[launch-check] GATE BROKEN: strict run exited ${child.status}, expected ${expected}.`);
    process.exit(3);
  }
  if (!/outstanding \{\{OWNER_FILL\}\} fields: \d+/.test(String(child.stdout))) {
    console.error('[launch-check] GATE BROKEN: the strict run produced no machine-readable count.');
    process.exit(3);
  }
  console.log(`[launch-check] gate verified: strict exits ${expected} with ${blockers.length} open blocker(s).`);
  process.exit(0);
}

process.exit(strict && blockers.length > 0 ? 1 : 0);