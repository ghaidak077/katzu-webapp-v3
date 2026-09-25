#!/usr/bin/env node
/**
 * Data-layer fix for the quiz defects that live in D1, not in app code.
 *
 * The audit (`scripts/audit-quiz-content.mjs`) found vocabulary rows whose
 * Arabic gloss cannot be told apart from another row's gloss. `generateQuizQuestions`
 * refuses to put two colliding glosses in one question, so the quiz stays
 * answerable — but the learner still sees two headwords with the same meaning in
 * Study, which is a content defect and has to be fixed in the data.
 *
 * `/admin/upload` is insert-only for `vocabulary` (no unique key, no ON CONFLICT),
 * so corrected rows cannot be re-uploaded — they would duplicate. This script uses
 * the admin content-update route instead: rowid-keyed, guarded by an `expect`
 * value so it refuses to overwrite anything a human has since edited, and it
 * reads every row back from the API afterwards.
 *
 *   node scripts/fix-quiz-content.mjs --secret=… [--url=…] [--apply]
 *
 * Dry run by default. Nothing is written without `--apply`.
 */

import { optionsCollide } from '../src/lib/utils/quizGenerator.ts';

const args = process.argv.slice(2);
const secretArg = args.find((a) => a.startsWith('--secret='));
const urlArg = args.find((a) => a.startsWith('--url='));
const SECRET = secretArg ? secretArg.slice('--secret='.length) : process.env.ADMIN_SECRET || '';
const BASE = (urlArg ? urlArg.slice('--url='.length) : process.env.KATZU_WORKER_URL || 'https://katzu-test.ghaidakalosh008.workers.dev').replace(/\/+$/, '');
const APPLY = args.includes('--apply');

if (!SECRET) {
  console.error('Missing admin secret. Pass --secret=… or set ADMIN_SECRET.');
  process.exit(1);
}

/** Each edit: the row to find, the value it must still have, and the fix. */
const CORRECTIONS = [
  {
    german: 'einreichen',
    expect: 'يقدّم',
    next: 'يقدّم طلباً',
    why: 'identical gloss to vorlegen ("يُبرز / يقدّم") — two rows reading "to submit" were offered in one question',
  },
  {
    german: 'vorlegen',
    expect: 'يُبرز / يقدّم',
    next: 'يُبرز (وثيقة)',
    why: 'overlapped einreichen; vorlegen is "to present/hand over a document"',
  },
  {
    german: 'Beschwerden',
    expect: 'أعراض / شكاوى',
    next: 'شكاوى/آلام',
    why: 'overlapped Symptome ("أعراض") — complaints/ailments vs symptoms',
  },
  {
    german: 'köstlich',
    expect: 'شهي',
    next: 'لذيذ جداً',
    why: 'pure synonym of lecker ("لذيذ") with no textual overlap to guard on',
  },
  {
    german: 'Führungskraft',
    expect: 'قائد/مدير تنفيذي',
    next: 'قيادي تنفيذي',
    why: 'contained Chef ("مدير") — the two were indistinguishable as options',
  },
];

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const adminHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` };

// 1) Live inventory (public content endpoint — the same rows the app reads).
const live = await api('/vocabulary');
if (live.status !== 200 || !Array.isArray(live.body)) {
  console.error(`Could not read live vocabulary (HTTP ${live.status}).`);
  process.exit(1);
}
const rows = live.body;

const planned = [];
const skipped = [];
for (const c of CORRECTIONS) {
  const match = rows.filter((r) => r.german === c.german);
  if (match.length === 0) {
    skipped.push({ ...c, reason: 'row not found' });
    continue;
  }
  if (match.length > 1) {
    skipped.push({ ...c, reason: `ambiguous: ${match.length} rows named ${c.german}` });
    continue;
  }
  const row = match[0];
  if (row.translation_ar !== c.expect) {
    skipped.push({ ...c, reason: `live value is "${row.translation_ar}", expected "${c.expect}" — refusing to overwrite` });
    continue;
  }
  planned.push({ id: row.id, german: row.german, topic: row.topic, level: row.level, from: row.translation_ar, to: c.next, why: c.why });
}

console.log(`base: ${BASE}`);
console.log(`vocabulary rows live: ${rows.length}`);
console.log('');
console.log('planned gloss corrections:');
for (const p of planned) {
  console.log(`  #${p.id} ${p.german} (${p.level}/${p.topic}): "${p.from}" → "${p.to}"`);
  console.log(`      why: ${p.why}`);
}
if (skipped.length) {
  console.log('');
  console.log('skipped:');
  for (const s of skipped) console.log(`  ${s.german}: ${s.reason}`);
}

if (planned.length === 0) {
  console.log('');
  console.log('Nothing to do — the live data already matches the corrected glosses.');
  process.exit(0);
}

if (!APPLY) {
  console.log('');
  console.log('DRY RUN — nothing written. Re-run with --apply to write these rows.');
  process.exit(0);
}

// 2) Write, then read the rows back from the API (the response is the proof).
const write = await api('/admin/api/content-update', {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({
    type: 'vocabulary',
    updates: planned.map((p) => ({ id: p.id, fields: { translation_ar: p.to } })),
  }),
});
console.log('');
console.log(`POST /admin/api/content-update → HTTP ${write.status}`);
console.log(JSON.stringify(write.body, null, 2).slice(0, 4000));
if (write.status !== 200) process.exit(1);

// 3) Independent read-back through the public endpoint the app uses.
const after = await api('/vocabulary');
const afterRows = Array.isArray(after.body) ? after.body : [];
let bad = 0;
for (const p of planned) {
  const row = afterRows.find((r) => r.id === p.id);
  const ok = row && row.translation_ar === p.to;
  if (!ok) bad++;
  console.log(`read-back #${p.id} ${p.german}: ${row ? `"${row.translation_ar}"` : 'MISSING'} ${ok ? 'OK' : 'MISMATCH'}`);
}

// 4) Re-check the whole table for glosses that could still be mistaken for each other.
const collisions = [];
for (let i = 0; i < afterRows.length; i++) {
  for (let j = i + 1; j < afterRows.length; j++) {
    if (afterRows[i].topic !== afterRows[j].topic) continue;
    if (optionsCollide(afterRows[i].translation_ar, afterRows[j].translation_ar)) {
      collisions.push(`${afterRows[i].topic}: ${afterRows[i].german} "${afterRows[i].translation_ar}" ~ ${afterRows[j].german} "${afterRows[j].translation_ar}"`);
    }
  }
}
console.log('');
console.log(`same-topic glosses that still collide: ${collisions.length}`);
for (const c of collisions) console.log(`  ${c}`);
process.exit(bad === 0 ? 0 : 1);
