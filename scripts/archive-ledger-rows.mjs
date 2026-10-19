#!/usr/bin/env node
/**
 * Archive everything in the ledger that is history. `npm run ledger:archive`.
 *
 * WHY THIS EXISTS
 * `docs/AGENT-STATE.md` is the one file every run must touch. On 2026-10-15 it had reached 444 KB
 * (~110k tokens) — 71% of it a table of `done` items no run reads, plus a 56 KB bullet that had
 * swallowed a dozen archived mission logs. No context survives loading that, so runs skipped the
 * file, and the facts it carried were skipped with it. The ledger is now a **live board** and this
 * command is what keeps it one:
 *
 *   - `## ITEMS` rows whose status is done/shipped/complete        -> archive
 *   - `## UNPROVEN` and `## OWNER-OPEN` bullets marked
 *     resolved / superseded / kept for history / DONE               -> archive
 *
 * Everything else — current state, open work, decisions, deploy rollbacks — stays. **Nothing is
 * ever deleted:** moved items are byte-identical, and `tests/agentDocs.test.ts` fails when history
 * is pasted back into the ledger, so the rule has teeth without a human watching it.
 *
 * NOT AUTOMATED, ON PURPOSE: a bullet that has grown into a document. Splitting one is a judgement
 * call (`## How to read this file` states the rule), so this tool only reports the largest ones
 * instead of guessing where to cut.
 *
 * USAGE
 *   npm run ledger:archive          # idempotent; says "nothing to archive" when there is none
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const LEDGER = join(ROOT, 'docs', 'AGENT-STATE.md');
const ARCHIVE = join(ROOT, 'docs', 'agent', 'ARCHIVE-AGENT-STATE.md');
const CAP_KB = 80;
const BIG_BULLET_KB = 8;

/** The ledger's own definition of history — the same rule `session-start.mjs` summarises with. */
const isClosed = (line) =>
  /resolved|superseded|kept for history/i.test(line) || /\bDONE\b/.test(line);

/** A finished `## ITEMS` row: `| id | done … | evidence |`. */
const isFinishedRow = (line) => {
  if (!line.startsWith('| ')) return false;
  return /^(done|shipped|complete)/i.test((line.split('|')[2] ?? '').trim());
};

/** Sections that keep only live items, and the archive heading their closed items move to. */
const BULLET_SECTIONS = {
  UNPROVEN: 'UNPROVEN — resolved/historical',
  'OWNER-OPEN': 'OWNER-OPEN — resolved/historical',
};

const ledgerSrc = readFileSync(LEDGER, 'utf8');
const EOL = ledgerSrc.includes('\r\n') ? '\r\n' : '\n';
const lines = ledgerSrc.split(/\r?\n/);
const endOfSection = (start) => {
  for (let i = start + 1; i < lines.length; i++) if (lines[i].startsWith('## ')) return i;
  return lines.length;
};

const out = [];
const movedRows = [];
const movedBullets = {}; // archive title -> lines
let biggest = { kb: 0, label: '' };
let i = 0;

while (i < lines.length) {
  const heading = lines[i].startsWith('## ') ? lines[i].slice(3) : null;

  if (heading === 'ITEMS') {
    const section = lines.slice(i, endOfSection(i));
    const headerAt = section.findIndex((line) => /^\|\s*ID\s*\|/.test(line));
    if (headerAt < 0) {
      console.error('[ledger:archive] the ITEMS section has no table header — no change made.');
      process.exit(1);
    }
    // The prefix runs to the table separator and carries the section's prose pointer with it.
    const body = section.slice(headerAt + 2);
    movedRows.push(...body.filter(isFinishedRow));
    out.push(
      ...section.slice(0, headerAt + 2),
      ...body.filter((line) => line.trim() !== '' && !isFinishedRow(line)),
      '',
    );
    i = endOfSection(i);
    continue;
  }

  if (heading && heading in BULLET_SECTIONS) {
    const section = lines.slice(i, endOfSection(i));
    const body = section.slice(1);
    const ranges = [];
    for (let k = 0; k < body.length; k++) {
      if (!body[k].startsWith('- ')) continue;
      let end = k + 1;
      // A bullet ends at the next bullet, or at section prose: a blockquote pointer or a heading
      // belongs to the section, and moving it with a bullet would strip context from the ledger.
      while (end < body.length && !body[end].startsWith('- ') && !/^(>|#{1,6} )/.test(body[end])) end++;
      ranges.push({ start: k, end, closed: isClosed(body[k]) });
      k = end - 1;
    }
    const mine = [];
    for (const range of ranges) {
      if (!range.closed) continue;
      const bullet = body.slice(range.start, range.end);
      while (bullet.length && bullet[bullet.length - 1].trim() === '') bullet.pop();
      mine.push(...bullet);
      const kb = bullet.join('\n').length / 1024;
      if (kb > biggest.kb) biggest = { kb, label: bullet[0].slice(0, 70) };
    }
    movedBullets[BULLET_SECTIONS[heading]] = mine;

    const kept = [];
    for (let k = 0; k < body.length; k++) {
      if (ranges.some((range) => range.closed && k >= range.start && k < range.end)) continue;
      const line = body[k];
      if (line.trim() === '' && (kept.length === 0 || kept[kept.length - 1].trim() === '')) continue;
      kept.push(line);
    }
    out.push(lines[i], '', ...kept);
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    out.push('');
    i = endOfSection(i);
    continue;
  }

  out.push(lines[i]);
  i += 1;
}

const movedTotal =
  movedRows.length + Object.values(movedBullets).reduce((n, rows) => n + rows.length, 0);
const kbNow = (statSync(LEDGER).size / 1024).toFixed(1);
if (movedTotal === 0) {
  const sizes = ['ITEMS', ...Object.keys(BULLET_SECTIONS)]
    .map((heading) => {
      const at = lines.findIndex((line) => line === `## ${heading}`);
      if (at < 0) return `${heading} absent`;
      return `${heading} ${(lines.slice(at, endOfSection(at)).join('\n').length / 1024).toFixed(1)} KB`;
    })
    .join(' · ');
  console.log(`[ledger:archive] nothing to archive — ledger ${kbNow} KB / cap ${CAP_KB} KB`);
  console.log(`[ledger:archive] ${sizes}`);
  process.exit(0);
}

while (out.length && out[out.length - 1].trim() === '') out.pop();
writeFileSync(LEDGER, out.join(EOL) + EOL, 'utf8');

// ---- archive --------------------------------------------------------------------------------
const archiveSrc = readFileSync(ARCHIVE, 'utf8');
const aEol = archiveSrc.includes('\r\n') ? '\r\n' : '\n';
const archive = archiveSrc.split(/\r?\n/);

const insertRows = (title, rows) => {
  if (rows.length === 0) return;
  const at = archive.findIndex((line) => line === `## ${title}`);
  if (at < 0) {
    archive.push('', `## ${title}`, '', ...rows, '');
    return;
  }
  let end = archive.findIndex((line, k) => k > at && line.startsWith('## '));
  if (end < 0) end = archive.length;
  let at2 = end;
  while (at2 > at && archive[at2 - 1].trim() === '') at2 -= 1;
  archive.splice(at2, 0, ...rows);
};

insertRows('ITEMS — completed', movedRows);
for (const [title, rows] of Object.entries(movedBullets)) insertRows(title, rows);
while (archive.length && archive[archive.length - 1].trim() === '') archive.pop();
writeFileSync(ARCHIVE, archive.join(aEol) + aEol, 'utf8');

const kb = (p) => (statSync(p).size / 1024).toFixed(1);
console.log(`[ledger:archive] moved ${movedTotal} item(s) → docs/agent/ARCHIVE-AGENT-STATE.md`);
console.log(`[ledger:archive]   items rows ${movedRows.length}` + Object.entries(movedBullets).map(([t, r]) => ` · ${t.split(' — ')[0]} bullets ${r.length}`).join(''));
console.log(`[ledger:archive] ledger ${kb(LEDGER)} KB (cap ${CAP_KB} KB) · archive ${kb(ARCHIVE)} KB`);
if (biggest.kb > BIG_BULLET_KB) {
  console.log(`[ledger:archive] NOTE: a moved bullet was ${biggest.kb.toFixed(1)} KB ("${biggest.label}…").`);
  console.log('[ledger:archive] A bullet that big is a document: give it its own file and link it (see the ledger header).');
}
