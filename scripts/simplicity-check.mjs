#!/usr/bin/env node
/**
 * The simplicity gate — the thing that stops the product getting harder.
 *
 * Katzu is a learner app. Every screen has ONE obvious action, and nothing a
 * learner cannot do blocks them without a way out. That is a property of the
 * code, so it is measured here rather than promised in a document and re-broken
 * by the next feature.
 *
 * This is a SOURCE gate, not a browser gate: it runs in CI in seconds with no
 * server, and it catches the failure mode that actually recurs — a new screen
 * or a new block added on top of an existing one without anyone re-checking the
 * hierarchy. `e2e/simplicity.spec.ts` proves the fixes in a real browser; this
 * file keeps the bar from slipping back.
 *
 * WHAT IT MEASURES, and why each is a real signal rather than taste:
 *
 *  - `control-budget`  A screen whose default view offers dozens of equal tappable
 *                      things has no starting point. Measured at 110 on
 *                      /app/practice before V32, 2 on /demo.
 *  - `unnamed-heading` A screen with no heading cannot be named by a screen
 *                      reader, so "what do I do here" is unanswerable.
 *
 * WHAT IS DELIBERATELY NOT HERE, and why:
 *
 * The companion rule for the browser — "how many controls LOOK like the main
 * action" — is measured in `e2e/simplicity.spec.ts`, not here. A first attempt
 * at that rule counted filled brand surfaces in the source and failed twelve
 * screens at once, most of them wrongly: it cannot see what is behind a
 * condition, inside a closed modal, or down a collapsed section, so it counts
 * rows and hidden states as if they were on screen. A gate that cries wolf gets
 * switched off, and a switched-off gate is worse than no gate. Two rules that
 * mean what they say beat three that do not.
 *
 * Budgets, not zero: a settings page legitimately holds more than a lesson page,
 * and a quiz legitimately shows its options. Each allowance below is set from a
 * measured screen, not guessed.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';

/** Per-file allowances. Keyed by path suffix; the first match wins. */
const BUDGETS = [
  // A quiz's options ARE the screen; four answers is the design.
  { match: /features\/quiz\/QuizScreen\.tsx$/, controls: 12 },
  // Multiple-choice onboarding: the options are the screen.
  { match: /features\/onboarding\/OnboardingScreen\.tsx$/, controls: 12 },
  { match: /features\/placement\/PlacementScreen\.tsx$/, controls: 10 },
  // Settings and lists are allowed to hold more than a lesson.
  { match: /features\/settings\/ProfileSettingsScreen\.tsx$/, controls: 40 },
  { match: /features\/marketing\/LandingScreen\.tsx$/, controls: 20 },
  { match: /features\/auth\/SubscriptionRedemptionScreen\.tsx$/, controls: 20 },
  { match: /features\/practice\/PracticeScreen\.tsx$/, controls: 24 },
  { match: /features\/trail\/TrailScreen\.tsx$/, controls: 24 },
  { match: /features\/journey\/GuidedPracticeScreen\.tsx$/, controls: 36 },
  { match: /features\/writing\/WritingScreen\.tsx$/, controls: 32 },
  { match: /features\/study\/StudyScreen\.tsx$/, controls: 24 },
  { match: /features\/listening\/ListeningScreen\.tsx$/, controls: 24 },
  // A default: every screen gets an allowance, and it is small.
  { match: /\.tsx$/, controls: 20 },
];

const DEFAULT_BUDGET = { controls: 20 };

function budgetFor(file) {
  const normalized = file.replace(/\\/g, '/');
  return BUDGETS.find((b) => b.match.test(normalized)) || DEFAULT_BUDGET;
}

/** Every JSX control that renders on the screen's default view. */
function countControls(source) {
  const counts = { button: 0, input: 0, select: 0, textarea: 0, anchor: 0, role: 0 };
  // A component's own JSX only; a shared component's cost is counted once, where
  // it is written, so this is an upper bound on what a screen adds.
  const buttonMatches = source.match(/<button\b/g);
  if (buttonMatches) counts.button = buttonMatches.length;
  const anchorMatches = source.match(/<a\s[^>]*href=/g);
  if (anchorMatches) counts.anchor = anchorMatches.length;
  const roleMatches = source.match(/role="(button|tab)"/g);
  if (roleMatches) counts.role = roleMatches.length;
  const inputMatches = source.match(/<input\b/g);
  if (inputMatches) counts.input = inputMatches.length;
  const areaMatches = source.match(/<textarea\b/g);
  if (areaMatches) counts.textarea = areaMatches.length;
  const selectMatches = source.match(/<select\b/g);
  if (selectMatches) counts.select = selectMatches.length;
  return counts;
}

/**
 * Does this screen name itself?
 *
 * h1–h3 all count: a screen whose title is an `<h2>` is perfectly nameable by a
 * screen reader, and an earlier version of this rule accepted only `<h1>` and
 * therefore reported twelve healthy screens as nameless. A rule that invents
 * twelve defects is a rule people delete.
 */
function hasHeading(source) {
  return /<h[123]\b/.test(source) || /role="heading"/.test(source) || /Heading\b/.test(source);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const findings = [];
let checked = 0;

for (const file of walk(SRC)) {
  if (file.includes('/dev/')) continue;
  if (file.includes('/components/')) continue;
  const source = readFileSync(file, 'utf8');
  if (!/export const \w*Screen\b/.test(source)) continue;
  checked += 1;

  const budget = budgetFor(file);
  const counts = countControls(source);
  const controls = counts.button + counts.anchor + counts.role + counts.input + counts.textarea + counts.select;
  if (controls > budget.controls) {
    findings.push({
      rule: 'control-budget',
      file,
      message: `${controls} controls exceeds the ${budget.controls} allowed — a learner with many equal choices has no starting point`,
    });
  }
  if (!hasHeading(source)) {
    findings.push({
      rule: 'unnamed-heading',
      file,
      message: 'no heading element — a screen reader cannot name this screen',
    });
  }
}

const byRule = {};
for (const finding of findings) {
  (byRule[finding.rule] = byRule[finding.rule] || []).push(finding);
}

console.log('='.repeat(74));
console.log('Simplicity gate');
console.log('='.repeat(74));
console.log('');
console.log('  count   budget  category');
for (const [rule, list] of Object.entries(byRule)) {
  console.log(`  ${String(list.length).padStart(5)}   ${String(0).padStart(6)}  FAIL  ${rule}`);
  for (const f of list) console.log(`        · ${f.file.replace(/\\/g, '/')}: ${f.message}`);
}
if (!findings.length) {
  console.log(`      0        0  ok    control-budget      a screen is a set of choices, not a wall`);
  console.log(`      0        0  ok    unnamed-heading    every screen can be named`);
}
console.log('');
console.log(`${checked} screens checked.`);
console.log(findings.length ? 'Simplicity budget EXCEEDED.' : 'Within budget.');
process.exit(findings.length ? 1 : 0);
