#!/usr/bin/env node
/**
 * Session-start readout — the one command `AGENTS.md` §1 describes, made literal.
 *
 * It prints, in a fixed short order:
 *   - git state (branch, clean/dirty, HEAD, last commits, working changes)
 *   - the ledger's active NEXT block (`docs/AGENT-STATE.md`)
 *   - APP-MAP §9 environments/deploy targets + the machine-checked manifest counts
 *   - MEMORY §A canonical facts
 *
 * Read-only: it opens three documents and asks git two questions. It never writes,
 * never deploys and never touches a secret. The parsers are pure and exported so
 * `tests/sessionStart.test.ts` can pin them without spawning a process.
 *
 * Run: `npm run session:start` (or `node scripts/session-start.mjs`).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const WIDTH = 100;
const NEXT_MAX_CHARS = 1100;

/**
 * The gate, named where a run cannot miss it.
 *
 * `AGENTS.md` §5 states the command, and stating it was not enough: the gate existed from
 * 2026-10-15 with no trigger at all. This line is in the readout every run opens first, so the
 * command arrives with the context instead of being recalled from a manual — and it names what it
 * does *not* cover, because that is the part a report gets wrong.
 */
export const GATE_LINE =
  'npm run verify  (full) · --fast on commit · --ci what CI runs · --e2e before a deploy (docs/agent/DEPLOY.md)';

/** Collapse markdown emphasis and whitespace so the terminal text is readable. */
export function plainText(value) {
  return String(value ?? '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cut to a length on a word boundary, with a visible marker. */
export function clip(value, max) {
  const text = plainText(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()} …`;
}

/** Simple greedy wrap, so long prose stays inside the terminal width. */
export function wrap(value, width = WIDTH, indent = '  ') {
  const words = plainText(value).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > width - indent.length) {
      lines.push(indent + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(indent + line);
  return lines.join('\n');
}

/** The `## <prefix>…` section of a markdown document (to the next `## ` or `### `). */
export function section(text, headingPrefix) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith('## ') && line.startsWith(headingPrefix));
  if (start === -1) return '';
  // A section runs to the next heading of the SAME level — never to a sub-heading, which belongs to
  // it. Stopping at `### ` too silently truncated the section: on 2026-10-15 the readout said
  // "UNPROVEN: 14 open of 14" while the section held 19, because one `### ` sub-heading hid five.
  const level = (/^#+/.exec(headingPrefix.trim())?.[0] ?? '##').length;
  const endsHere = (line) => {
    const heading = /^(#+)\s/.exec(line);
    return heading !== null && heading[1].length <= level;
  };
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(endsHere);
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * A bullet's short label: its bold lead if it has one, else its first line. A
 * leading ledger key (`B3:`, `RC-6:`, `V12:`) is kept, because without it the
 * label loses the only handle anyone can look up.
 */
export function bulletLabel(line) {
  const text = String(line).replace(/^-\s*/, '');
  const bold = text.match(/\*\*(.+?)\*\*/);
  if (!bold) return clip(text, 58);
  // A label that starts with the bold lead is the normal case; when words precede
  // it ("Lighthouse **has now been run**"), they carry the handle, so keep them.
  const label = bold.index > 0 ? text.slice(0, bold.index + bold[0].length) : bold[1];
  return clip(label, 58);
}

/**
 * The ledger's open-items sections mix live items with entries kept only for
 * history (`RESOLVED in …`, `superseded`, `kept for history`). The readout should
 * surface the live ones, so they are split rather than listed raw — a wall of
 * already-closed notes is the same as no readout.
 */
export function summariseBullets(sectionText, limit = 6) {
  const bullets = String(sectionText)
    .split(/\r?\n/)
    .filter((line) => /^- /.test(line));
  // "DONE" is matched case-sensitively on purpose: the ledger writes "DONE (V14-1)"
  // for a finished item, and lower-case "done" appears in ordinary prose.
  const isClosed = (line) => /resolved|superseded|kept for history/i.test(line) || /\bDONE\b/.test(line);
  const open = bullets.filter((line) => !isClosed(line));
  return {
    total: bullets.length,
    closedCount: bullets.length - open.length,
    openCount: open.length,
    shown: open.slice(0, limit).map(bulletLabel),
    more: Math.max(0, open.length - limit),
  };
}

/** Rows of the first markdown table in a section, as trimmed cell arrays (header dropped). */
export function tableRows(sectionText) {
  const rows = [];
  let headerDropped = false;
  for (const line of String(sectionText).split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => plainText(cell));
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) {
      // The separator marks the row before it as the header; drop that header.
      if (!headerDropped) {
        rows.pop();
        headerDropped = true;
      }
      continue;
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * The active `NEXT (…)` block from the ledger. The ledger keeps every superseded
 * plan inline as `ARCHIVED NEXT (…)`, so the live one runs from the last
 * `NEXT (` up to the first `ARCHIVED NEXT (` after it.
 */
export function extractNext(ledgerText) {
  const text = String(ledgerText).replace(/\r\n/g, '\n');
  const start = text.lastIndexOf('\nNEXT (');
  if (start === -1) return null;
  const from = start + 1;
  const rest = text.slice(from);
  // The mission is one block: it ends at the next archived NEXT, at the next heading, or at the
  // next bullet. Stopping only at `ARCHIVED NEXT (` meant that a ledger whose archived blocks had
  // been moved out (2026-10-15) fed the whole tail of the file into the readout.
  const stop = rest.search(/\n(?:ARCHIVED NEXT \(|#{1,3} |- )/);
  return plainText(stop === -1 ? rest : rest.slice(0, stop));
}

/** `Last verified:` line from APP-MAP. */
export function lastVerified(appMapText) {
  const match = String(appMapText).match(/Last verified:\s*\*?([^*\n]+?)\*?\s*$/m);
  return match ? plainText(match[1]) : 'UNKNOWN';
}

/** Counts of the four machine-checked manifest blocks in APP-MAP §14. */
export function manifestCounts(appMapText) {
  const counts = {};
  for (const name of ['routes', 'screens', 'endpoints', 'tables']) {
    const match = String(appMapText).match(new RegExp('```appmap-' + name + '\\r?\\n([\\s\\S]*?)```'));
    counts[name] = match
      ? match[1].split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).length
      : 0;
  }
  return counts;
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function gitState() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || 'UNKNOWN';
  const head = git(['log', '-1', '--oneline']) || 'no commits';
  const recent = (git(['log', '-3', '--format=%h %s']) || '').split('\n').filter(Boolean);
  const changes = (git(['status', '--porcelain=v1']) || '').split('\n').filter(Boolean);
  const tracked = changes.filter((line) => !line.startsWith('??')).length;
  const untracked = changes.length - tracked;
  return { branch, head, recent, changes, tracked, untracked };
}

function readDoc(...parts) {
  try {
    return readFileSync(join(ROOT, ...parts), 'utf8');
  } catch {
    return '';
  }
}

/**
 * The orientation documents, with their real size on disk.
 *
 * This exists because the older readout ended with "READ NEXT: APP-MAP → MEMORY →
 * ENV-FACTS → LESSONS", i.e. it told every run to load ~240 KB (~60k tokens) before
 * starting, on top of a 450 KB ledger. That instruction cannot be followed by any
 * model with a context window, so it was being skipped — and the facts it holds (a
 * cached Chromium, a screenshot rig that already exists) are exactly the ones whose
 * absence cost an hour on 2026-10-15. Printing the sizes turns the cost into a fact a
 * run can act on: open a section, never a document.
 */
const ORIENTATION_DOCS = [
  ['APP-MAP', ['docs', 'agent', 'APP-MAP.md']],
  ['ledger', ['docs', 'AGENT-STATE.md']],
  ['PROJECT-BRIEF', ['docs', 'agent', 'PROJECT-BRIEF.md']],
  ['LESSONS', ['docs', 'agent', 'LESSONS.md']],
  ['MEMORY', ['docs', 'agent', 'MEMORY.md']],
  ['ENV-FACTS', ['docs', 'agent', 'ENV-FACTS.md']],
];

export function docSizes() {
  return ORIENTATION_DOCS.map(([name, parts]) => ({
    name,
    kb: Math.round(Buffer.byteLength(readDoc(...parts), 'utf8') / 1024),
  })).sort((a, b) => b.kb - a.kb || a.name.localeCompare(b.name));
}

export function buildReadout(now = new Date()) {
  const ledger = readDoc('docs', 'AGENT-STATE.md');
  const appMap = readDoc('docs', 'agent', 'APP-MAP.md');
  const memory = readDoc('docs', 'agent', 'MEMORY.md');
  const g = gitState();
  const counts = manifestCounts(appMap);
  const out = [];

  out.push(`KATZU SESSION START — ${now.toISOString().slice(0, 10)}`);
  out.push('='.repeat(WIDTH));
  out.push(`GATE  ${GATE_LINE}`);

  out.push('GIT');
  out.push(`  branch:  ${g.branch}`);
  out.push(`  state:   ${g.changes.length === 0 ? 'clean' : `dirty (${g.tracked} modified, ${g.untracked} untracked)`}`);
  out.push(`  head:    ${g.head}`);
  out.push('  recent:');
  for (const line of g.recent) out.push(`    ${clip(line, 90)}`);
  if (g.changes.length) {
    out.push('  changes:');
    for (const line of g.changes.slice(0, 8)) out.push(`    ${clip(line, 90)}`);
    if (g.changes.length > 8) out.push(`    … and ${g.changes.length - 8} more`);
  }

  out.push('');
  out.push('LEDGER NEXT (docs/AGENT-STATE.md) — resume here');
  const next = extractNext(ledger);
  out.push(next ? wrap(clip(next, NEXT_MAX_CHARS)) : '  UNKNOWN — no NEXT block found');

  out.push('');
  out.push('APP-MAP §9 — ENVIRONMENTS & DEPLOY TARGETS (volatile; re-verify before quoting)');
  for (const cells of tableRows(section(appMap, '## 9.'))) {
    out.push(`  ${clip(cells[0], 26)}: ${clip(cells[1] ?? '', 68)}`);
  }
  out.push(`  last verified: ${lastVerified(appMap)}`);
  out.push(
    `  manifest: ${counts.routes} routes · ${counts.screens} screens · ${counts.endpoints} endpoints · ${counts.tables} tables (guard: tests/appMap.test.ts)`,
  );

  out.push('');
  out.push('MEMORY §A — CANONICAL FACTS (do not re-derive)');
  for (const cells of tableRows(section(memory, '## A.'))) {
    out.push(`  ${clip(cells[0], 30)}: ${clip(cells[1] ?? '', 64)}`);
  }

  out.push('');
  out.push('OPEN ITEMS (docs/AGENT-STATE.md) — owner-only work and unproven claims');
  for (const [label, heading] of [
    ['OWNER-OPEN', '## OWNER-OPEN'],
    ['UNPROVEN', '## UNPROVEN'],
  ]) {
    const summary = summariseBullets(section(ledger, heading));
    out.push(
      `  ${label}: ${summary.openCount} open of ${summary.total}` +
        (summary.closedCount ? ` (${summary.closedCount} marked resolved/historical)` : ''),
    );
    for (const item of summary.shown) out.push(`    - ${item}`);
    if (summary.more) out.push(`    … and ${summary.more} more open`);
  }

  out.push('');
  out.push(`READ ON DEMAND — measured document cost: ${docSizes().map((d) => `${d.name} ${d.kb} KB`).join(' · ')}`);
  out.push('  Never load one whole; find the section first: grep -n "^## " <file>, then read that range only.');
  out.push('  Choosing a tool → ENV-FACTS §C-D + MEMORY §C · producing a file → AGENTS.md §4 (the rig, not the browser).');
  return out.join('\n');
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.stdout.write(`${buildReadout()}\n`);
}
