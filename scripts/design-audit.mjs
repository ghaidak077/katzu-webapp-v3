#!/usr/bin/env node
/**
 * Design-system drift audit.
 *
 * Answers one question: how much of the UI is expressed through the design
 * system, and how much is a hardcoded one-off that will never agree with
 * anything else? Every finding is a real class of drift — a hex literal, a
 * raw `rgb()`, an arbitrary Tailwind value, a raw font size, a one-off radius —
 * not a style opinion.
 *
 *   node scripts/design-audit.mjs [--verbose]
 *
 * Exits non-zero when a category is over budget, so CI holds the line as the
 * app grows instead of decaying back into ad-hoc styling.
 *
 * A line may opt out with a trailing `design-audit: allow` comment plus a
 * reason. The exemption is local and reviewable — a file is never silently
 * skipped, because "this file is exempt" is exactly how a design system rots.
 * The two legitimate exemptions today are official third-party brand assets
 * (the Google mark must not be recoloured) and a pure-white gradient used as a
 * mask, which is not a colour at all.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** Files that *are* the token definitions, so raw values are their job. */
const TOKEN_FILES = new Set(['src/index.css', 'tailwind.config.js']);

/** Marks a deliberate, reviewed exemption on a single line. */
const ALLOW = 'design-audit: allow';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(tsx?|css)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC).map((f) => relative(ROOT, f).replace(/\\/g, '/'));
const src = new Map(files.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));

/** Strip comments so prose that *describes* a value is never counted as one. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const RULES = [
  {
    kind: 'raw-hex',
    test: (c) => /#[0-9a-fA-F]{3,8}\b/.test(c),
    why: 'hardcoded colour — use a semantic token',
    budget: 0,
    skip: (f) => TOKEN_FILES.has(f),
  },
  {
    kind: 'raw-rgb',
    test: (c) => /\brgba?\(\s*\d/.test(c),
    why: 'raw rgb() in code — read the token with rgb(var(--kz-x) / a)',
    budget: 0,
  },
  {
    kind: 'arbitrary-value',
    // Arbitrary Tailwind values bypass the scale. Grid/fraction syntax
    // (w-1/2) and arbitrary *properties* ([color:red]) are not scale values.
    test: (c) => /(?<![\w-])[a-z]+-(\[[^\]]+\])/.test(c) && !/^\[[a-z-]+:/.test(c),
    why: 'arbitrary Tailwind value — belongs on a named scale step',
    budget: 40,
  },
  {
    kind: 'raw-font-size',
    test: (c) => /(?<![\w-])text-\[(?!0?\.)/.test(c),
    why: 'raw font size — use the text-display/title/body/caption/micro scale',
    budget: 0,
  },
  {
    kind: 'raw-radius',
    test: (c) => /rounded-\[(?!full)/.test(c),
    why: 'raw radius — use the chip/control/panel/sheet/tag scale',
    budget: 0,
  },
  {
    // A placeholder is not a label: it disappears the moment there is text, so
    // the field ends up with no accessible name at all. Every form control in
    // this app therefore needs an explicit `aria-label` (or a real <label>).
    kind: 'unnamed-field',
    test: (c, lines, index) => {
      if (!/<(input|textarea|select)\b/.test(c)) return false;
      if (/type=["']hidden["']/.test(c)) return false;
      // A control is named by anything on its own opening tag, or by a wrapping
      // <label>. Scanning the tag alone would false-positive on multi-line
      // elements, so the check is structural and reads the surrounding lines.
      return isUnnamedControl(lines, index);
    },
    why: 'form control with no accessible name — add aria-label or a wrapping <label>',
    budget: 0,
  },
  {
    // `transition-all` subscribes an element to every animatable property,
    // including the layout ones the design system decided not to animate.
    // Every site in Katzu now names the family it actually changes; this rule
    // keeps that from decaying back into "safe" folklore. `transition` on its
    // own is fine — that is the property-scoped default.
    kind: 'transition-all',
    test: (c) => /(?<![-\w])transition-all/.test(c),
    why: 'transition-all — name the properties this element actually animates',
    budget: 0,
  },
  {
    // `outline-none` is a *utilities-layer* rule and `:focus-visible` lives in
    // `@layer base`, so it wins on layer order no matter the specificity. A bare
    // `outline-none` therefore deletes the app's only focus ring — the audited
    // measurement was `outline: 2px solid rgba(0,0,0,0)` on /welcome. A scoped
    // `focus-visible:outline-none` that is paired with a `ring-*` on the same
    // element is a deliberate replacement treatment and stays legal.
    kind: 'focus-ring-suppression',
    test: (c) => /(?<![-\w:])outline-none/.test(c),
    why: 'bare outline-none deletes the global focus ring — remove it',
    budget: 0,
  },
];

/**
 * A form control is named if its opening tag carries `aria-label` /
 * `aria-labelledby` / an `id` a `<label for>` could point at, or if it is
 * wrapped in a `<label>`. Returns true only when none of those hold, which means
 * a screen reader would announce nothing for the field.
 *
 * The opening tag can span many lines, so the tag text is collected forward
 * until the line that closes it, and the `<label>` search walks backwards over
 * the lines above.
 */
function isUnnamedControl(all, index) {
  let end = index;
  while (end < all.length && end - index < 15 && !/\/>\s*$/.test(all[end])) end++;

  for (let i = index; i <= end; i++) {
    if (/aria-label=/.test(all[i]) || /aria-labelledby=/.test(all[i]) || /\bid=/.test(all[i])) return false;
    if (/<label\b/.test(all[i])) return false;
  }
  // A <label> that opened on an earlier line and has not closed yet wraps this
  // control: count opens and closes walking back up.
  let opens = 0;
  for (let i = index - 1; i >= 0; i--) {
    opens += (all[i].match(/<label\b/g) ?? []).length;
    opens -= (all[i].match(/<\/label>/g) ?? []).length;
    if (opens > 0) return false;
  }
  return true;
}

const findings = [];
for (const [file, text] of src) {
  if (TOKEN_FILES.has(file)) continue;
  const lines = code(text).split('\n');

  /**
   * A raw `rgb()` is not drift when Tailwind classes cannot reach the value.
   * Two real contexts:
   *   · an inline `style={{ … }}` object — React needs a real colour there, and
   *     a runtime alpha cannot be expressed as a utility class;
   *   · a canvas / WebGL drawing context — `ctx.fillStyle` and shader uniforms
   *     are not DOM at all.
   * Everything else is genuine drift.
   */
  let styleDepth = 0;
  const inUnstyleableContext = lines.map((line) => {
    const opens = (line.match(/style=\{\{/g) ?? []).length;
    const closes = (line.match(/\}\}/g) ?? []).length;
    const inside = styleDepth > 0 || opens > 0;
    styleDepth = Math.max(0, styleDepth + opens - closes);
    const canvas = /\b(ctx|context|gl)\.[a-zA-Z]+|addColorStop|create(?:Linear|Radial)Gradient|uniform/.test(
      line,
    );
    return inside || canvas;
  });

  for (const rule of RULES) {
    if (rule.skip?.(file)) continue;
    lines.forEach((line, i) => {
      if (!rule.test(line, lines, i) || line.includes(ALLOW)) return;
      if (rule.kind === 'raw-rgb' && inUnstyleableContext[i]) return;
      findings.push({ file, kind: rule.kind, line: i + 1, snippet: line.trim().slice(0, 88) });
    });
  }
}

/* ---- Structural duplication: is there more than one component per role? --- */
const ROLE_PATTERNS = [
  { role: 'button', test: /<button[\s>]/ },
  { role: 'dialog', test: /role="dialog"/ },
];
const byRole = new Map(ROLE_PATTERNS.map((r) => [r.role, []]));
for (const [file, text] of src) {
  if (!file.includes('/components/')) continue;
  const body = code(text);
  for (const { role, test } of ROLE_PATTERNS) {
    if (test.test(body)) byRole.get(role).push(file);
  }
}

const byKind = new Map();
for (const f of findings) {
  if (!byKind.has(f.kind)) byKind.set(f.kind, []);
  byKind.get(f.kind).push(f);
}

const verbose = process.argv.includes('--verbose');
let over = 0;

console.log('\nKatzu design-system drift audit');
console.log('='.repeat(66));
console.log(`${'count'.padStart(7)}  ${'budget'.padStart(7)}  category`);

for (const rule of RULES) {
  const list = byKind.get(rule.kind) ?? [];
  const pass = list.length <= rule.budget;
  if (!pass) over++;
  console.log(
    `${String(list.length).padStart(7)}  ${String(rule.budget).padStart(7)}  ${(pass ? 'ok   ' : 'OVER ') + rule.kind.padEnd(16)} ${rule.why}`,
  );
  if (!pass && verbose) {
    for (const f of list.slice(0, 40)) {
      console.log(`               ${f.file}:${f.line}  ${f.snippet}`);
    }
    if (list.length > 40) console.log(`               … and ${list.length - 40} more`);
  }
}

console.log('-'.repeat(66));
for (const { role } of ROLE_PATTERNS) {
  const list = byRole.get(role);
  const n = list.length;
  console.log(`${String(n).padStart(7)}          components render a raw <${role}>`);
  if (n > 1) for (const f of list) console.log(`               · ${f}`);
}
console.log('='.repeat(66));
console.log(
  over === 0
    ? 'Within budget.'
    : `${over} category(ies) over budget — new code must not add to these.`,
);
process.exit(over === 0 ? 0 : 1);