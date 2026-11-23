#!/usr/bin/env node
/**
 * Physical direction utilities are a bug the moment a screen is LTR.
 *
 * WHY THIS EXISTS
 * The app is authored in Arabic, so `ml-3` and `text-left` look harmless: in RTL
 * the document mirrors them and they land where the eye expects. The language
 * switch turns that into a real defect — `margin-left` stays on the left in
 * English, `text-left` is correct there but `left-0` is not, and a chevron drawn
 * with `left` points out of the page instead of into it. None of it throws, none
 * of it fails a type check, and every existing test runs in Arabic, so a
 * translated screen can ship visibly broken with the gate green.
 *
 * What is checked, in the files that actually localise (they call `t()`), is the
 * physical-property class family: margins/paddings/borders/radii/insets on one
 * side, plus `text-left`/`text-right`. The fix is the logical twin the rest of
 * the codebase already uses: `ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`,
 * `border-s-`/`border-e-`, `rounded-s-`/`rounded-e-`.
 *
 *   node scripts/i18n-direction-lint.mjs            # report, exit 0
 *   node scripts/i18n-direction-lint.mjs --strict   # exit 1 on any finding
 *
 * An intentional physical direction (a code block pinned `dir="ltr"`, a mirrored
 * decorative flourish) is silenced on its own line with `dir-ok` and a reason:
 * the escape hatch is reviewable, a blanket exclusion is not.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src/features', 'src/app', 'src/components'];

/** `left-0`, `right-[3px]`, `ml-2`, `pr-4`, `border-l`, `rounded-r-lg`, `text-left`. */
const RULES = [
  { pattern: /(?:^|[\s"'`])(?:left|right)-(?:\d|\[|full|auto)/, why: 'use start-/end- (logical inset)' },
  { pattern: /(?:^|[\s"'`])(?:ml|mr)-(?:\d|\[|auto|px)/, why: 'use ms-/me-' },
  { pattern: /(?:^|[\s"'`])(?:pl|pr)-(?:\d|\[|px)/, why: 'use ps-/pe-' },
  { pattern: /(?:^|[\s"'`])border-([lr])(?:-|\s|$)/, why: 'use border-s-/border-e-' },
  { pattern: /(?:^|[\s"'`])rounded-([lr])(?:-|\s|$)/, why: 'use rounded-s-/rounded-e-' },
  { pattern: /\btext-(?:left|right)\b/, why: 'use text-start/text-end' },
];

const walk = (dir) => {
  if (!existsSync(join(ROOT, dir))) return [];
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return /node_modules|__snapshots__/.test(entry.name) ? [] : walk(path);
    return /\.(tsx|ts)$/.test(entry.name) ? [path] : [];
  });
};

const findings = [];
for (const file of SCAN_DIRS.flatMap(walk)) {
  const source = readFileSync(join(ROOT, file), 'utf8');
  // Only screens that actually localise can be shown in another language; a
  // still-Arabic-only file is covered by the coverage counter instead.
  if (!/\buseT\(|\bt\(/.test(source)) continue;
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    // The opt-out sits in the comment block directly above, because a JSX
    // attribute list has nowhere to put one on the same line.
    const escapeWindow = lines.slice(Math.max(0, index - 3), index + 1).join('\n');
    if (escapeWindow.includes('dir-ok')) return;
    // A comment describing the rule is not a violation of it.
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        findings.push({ file, line: index + 1, text: trimmed.slice(0, 120), why: rule.why });
        break;
      }
    }
  });
}

const strict = process.argv.includes('--strict');
if (!findings.length) {
  console.log('i18n direction lint: no physical direction utilities in localised screens.');
  process.exit(0);
}
const byFile = new Map();
for (const finding of findings) {
  const list = byFile.get(finding.file) ?? [];
  list.push(finding);
  byFile.set(finding.file, list);
}
console.log(`i18n direction lint: ${findings.length} physical direction(s) in ${byFile.size} localised file(s).`);
for (const [file, list] of byFile) {
  console.log(`\n  ${file}`);
  for (const finding of list) console.log(`    ${finding.line}: ${finding.why}\n      ${finding.text}`);
}
console.log('\nLogical twins (ms-/me-, ps-/pe-, start-/end-, border-s/e, rounded-s/e) mirror automatically.');
process.exit(strict ? 1 : 0);
