#!/usr/bin/env node
/**
 * Contrast check for the Katzu design tokens.
 *
 * The palette is dark-only (OLED), so every pairing that matters is either
 * content-on-surface or text-on-fill. This script computes the WCAG 2.1
 * contrast ratio of each declared pair and fails when a *text* pair is below
 * its threshold, so the token file cannot silently regress into a design that
 * looks good and reads badly.
 *
 *   node scripts/contrast-check.mjs           # report
 *   node scripts/contrast-check.mjs --verbose # include passing pairs
 *
 * Thresholds: 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px
 * bold) and for non-text UI boundaries (borders, control edges).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* ------------------------------------------------------------------ *
 * Colour maths (WCAG 2.1 relative luminance + contrast ratio)
 * ------------------------------------------------------------------ */
function parseHex(hex) {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function channel(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ------------------------------------------------------------------ *
 * The pairs that must hold, read from the real token definitions so this
 * script can never drift away from what the app actually paints.
 * ------------------------------------------------------------------ */
const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

/**
 * Reads a token straight out of `src/index.css`. Katzu declares its palette as
 * RGB triplets (`180 160 255`) so alpha compositing needs only one declaration,
 * so both forms are accepted here.
 */
function cssVar(name) {
  const hex = css.match(new RegExp(`--${name}:\\s*#([0-9a-fA-F]{3,8})`));
  if (hex) return '#' + hex[1];
  const triplet = css.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s*;`));
  if (triplet) {
    return (
      '#' +
      [triplet[1], triplet[2], triplet[3]]
        .map((v) => Math.round(Number(v)).toString(16).padStart(2, '0'))
        .join('')
    );
  }
  throw new Error(`token --${name} not found in src/index.css`);
}

const surface = cssVar('kz-soft-black');

const PAIRS = [
  // [foreground token, background token, kind, label]
  ['kz-ink', 'kz-soft-black', 'text', 'primary text on the app background'],
  ['kz-ink-dim', 'kz-soft-black', 'text', 'secondary text on the app background'],
  ['kz-ink-faint', 'kz-soft-black', 'text', 'muted text on the app background'],
  ['kz-ink', 'kz-near-black', 'text', 'primary text on a well'],
  ['kz-ink-dim', 'kz-near-black', 'text', 'secondary text on a well'],
  ['kz-ink-faint', 'kz-near-black', 'text', 'muted text on a well'],
  ['kz-lavender', 'kz-soft-black', 'text', 'accent text on the app background'],
  ['kz-lavender', 'kz-near-black', 'text', 'accent text on a well'],
  ['kz-magenta', 'kz-soft-black', 'text', 'earned text on the app background'],
  ['kz-warm', 'kz-soft-black', 'text', 'warning text on the app background'],
  ['kz-neon', 'kz-soft-black', 'text', 'success text on the app background'],
  ['kz-cool', 'kz-soft-black', 'text', 'info text on the app background'],
  // Control labels on the filled button colours.
  ['kz-on-fill', 'kz-lavender-deep', 'text', 'button label on the primary fill'],
  ['kz-on-fill', 'kz-lavender-press', 'text', 'button label on the pressed fill'],
  ['kz-on-danger', 'kz-danger', 'text', 'label on a destructive fill'],
  ['kz-on-lavender', 'kz-lavender', 'text', 'label on a lavender chip'],
  ['kz-on-lavender', 'kz-warm', 'text', 'label on a warm chip'],
  ['kz-on-lavender', 'kz-neon', 'text', 'label on a success chip'],
  // Non-text: control boundaries and focus rings need 3:1.
  ['kz-lavender', 'kz-soft-black', 'ui', 'primary control edge on the background'],
  ['kz-lavender', 'kz-near-black', 'ui', 'primary control edge on a well'],
  ['kz-line-strong', 'kz-soft-black', 'ui', 'interactive control edge on a surface'],
];

const verbose = process.argv.includes('--verbose');

console.log('\nKatzu token contrast');
console.log('='.repeat(74));
console.log(
  `${'ratio'.padStart(7)}  ${'min'.padStart(5)}  ${'verdict'.padEnd(9)}  pair`,
);

let failures = 0;
let worst = Infinity;

for (const [fg, bg, kind, label] of PAIRS) {
  const ratio = contrast(cssVar(fg), cssVar(bg));
  const min = kind === 'text' ? 4.5 : 3;
  const pass = ratio >= min;
  if (!pass) failures++;
  else if (kind === 'text') worst = Math.min(worst, ratio);
  if (!pass || verbose) {
    console.log(
      `${ratio.toFixed(2).padStart(7)}  ${String(min).padStart(5)}  ${(pass ? 'pass' : 'FAIL').padEnd(9)}  ${label}`,
    );
  }
}

console.log('-'.repeat(74));
console.log(`surface used as the worst-case background: ${surface}`);
if (Number.isFinite(worst)) {
  console.log(`tightest passing text pair: ${worst.toFixed(2)}:1 (threshold 4.5)`);
}
console.log('='.repeat(74));
console.log(failures === 0 ? 'All contrast pairs pass.' : `${failures} pair(s) below threshold.`);

process.exit(failures === 0 ? 0 : 1);