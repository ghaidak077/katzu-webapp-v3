#!/usr/bin/env node
/**
 * Score a replay of the practice chat against the deterministic checks the owner
 * asked for (2026-11-16). No network, no secrets: it reads a capture file and
 * prints a table plus the gates.
 *
 *   node scripts/replay/score-replay.mjs .tmp/replay-v8.json
 *
 * The capture is produced by driving the live `/ai/turn` from the signed-in
 * browser (see scripts/replay/README.md): one object per turn with the case id,
 * HTTP status and the response body. Scoring here — not in the browser — means
 * the checks are the repo's own pure functions, not a copy.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hintMatchesQuestion } from '../../cloudflare-turn-quality.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const capturePath = resolve(process.argv[2] || join(root, '.tmp', 'replay.json'));
const casesFile = JSON.parse(readFileSync(join(root, 'scripts/replay/scenario-replay-cases.json'), 'utf8'));
const capture = JSON.parse(readFileSync(capturePath, 'utf8'));
const turns = Array.isArray(capture) ? capture : capture.turns;

const byId = new Map(turns.map((turn) => [turn.id, turn]));
const cases = casesFile.cases;
const openers = casesFile.openers;

/** Question marks in a line, the same cheap rule the route uses. */
const questionCount = (text) => (String(text || '').match(/\?/g) || []).length;

/** Fold case, umlauts and punctuation so a comparison is about words. */
function fold(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const META_PHRASES = ['nächste frage', 'naechste frage', 'nächsten schritt', 'naechsten schritt', 'objective', 'السؤال التالي', 'السؤال القادم'];

/** Facts a persona must never assert about a world it cannot see. */
const INVENTED_FACT = /\b(sonnig|regnerisch|regnet|bewölkt|bewoelkt|schneit|grad|°|temperatur|wetterbericht)\b/i;

const NOT_ANSWERS = ['wie bitte', 'ich verstehe nicht', 'was meinen sie'];

function checkCase(entry) {
  const c = cases.find((x) => x.id === entry.id);
  const body = entry.body || {};
  const reply = String(body.reply_de || '');
  const hint = String(body.hint_de || '');
  const understood = String(body.understood_de || '');
  const raw = String(body.raw_de || c?.input || '');
  const close = body.close === true;
  const opener = openers[c?.scenario || ''] || '';
  const failures = [];

  if (entry.status !== 200 || !reply) failures.push('no_reply');
  const marks = questionCount(reply);
  if (close ? marks > 0 : marks !== 1) failures.push(`questions=${marks}`);

  const lowReply = reply.toLowerCase();
  for (const phrase of META_PHRASES) if (lowReply.includes(phrase)) failures.push('meta');
  for (const phrase of NOT_ANSWERS) if (lowReply.includes(phrase)) failures.push('wie_bitte');

  const replyQuestion = reply.split(/(?<=\?)/).find((s) => s.trim().endsWith('?')) || '';
  const openerQuestion = opener.split(/(?<=\?)/).find((s) => s.trim().endsWith('?')) || '';
  if (replyQuestion && openerQuestion && fold(replyQuestion) === fold(openerQuestion)) failures.push('repeat_opener');

  if (hint && !hintMatchesQuestion(reply, hint)) failures.push('hint_mismatch');

  if (c?.offTopic && INVENTED_FACT.test(reply)) failures.push('invented_fact');

  // An echo of the learner's own error is the failure the owner saw twice.
  if (c?.expect?.correct) {
    const wrong = [];
    if (/gekommen/i.test(raw) && !/angekommen/i.test(raw)) wrong.push('gekommen');
    if (/er hat/i.test(raw)) wrong.push('er hat');
    if (/schwartz/i.test(raw)) wrong.push('schwartz');
    if (/lebie/i.test(raw)) wrong.push('leb?ie');
    if (/heise/i.test(raw) && !/heisse|heiße/i.test(raw)) wrong.push('heise');
    for (const token of wrong) {
      if (new RegExp(token.replace(/\?/g, '.'), 'i').test(reply)) failures.push(`echo:${token}`);
    }
  }

  const formHit = (c?.expect?.form || []).every((form) => fold(understood).includes(fold(form)));
  /**
   * `changed` compares with case and umlauts INTACT (2026-11-16). Folding first
   * — as this file did — made «heisse» -> «heiße» and «lehrerin» -> «Lehrerin»
   * look like no change at all, so a correct fix could never be credited and the
   * recall number was measuring the scorer, not the model.
   */
  const strict = (text) =>
    String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/[.,!;:]+$/, '')
      .trim();
  const changed = strict(understood) !== strict(raw) && understood.trim().length > 0;
  const corrected = changed && formHit;

  return {
    id: entry.id,
    scenario: c?.scenario,
    kind: c?.kind,
    holdout: c?.holdout === true,
    provider: body.provider || entry.provider || '',
    model: body.model || '',
    attempts: body.attempts ?? null,
    ms: body.elapsed_ms ?? entry.ms ?? null,
    needsCorrection: c?.expect?.correct === true,
    corrected,
    failures,
    reply,
    understood,
    hint,
    fix: body.fix_reason_ar || '',
  };
}

const scored = cases.map((c) => {
  const entry = byId.get(c.id) || { id: c.id, status: 0, body: {} };
  return checkCase(entry);
});

const pct = (a, b) => (b === 0 ? 'n/a' : `${Math.round((a / b) * 100)}%`);
const withErrors = scored.filter((r) => r.needsCorrection);
const recall = (rows) => {
  const total = rows.length;
  const hits = rows.filter((r) => r.corrected).length;
  return { hits, total, text: `${pct(hits, total)} (${hits}/${total})` };
};
const latencies = scored.map((r) => Number(r.ms)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
const quantile = (q) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] : null);
const providers = scored.reduce((acc, r) => {
  const key = `${r.provider || 'unknown'}/${r.model || '-'}`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const fallbacks = scored.filter((r) => /workers-ai/i.test(String(r.provider))).length;
const errors = scored.filter((r) => r.failures.includes('no_reply')).length;

for (const row of scored) {
  console.log(
    `${row.holdout ? 'H' : ' '} ${row.id.padEnd(4)} ${String(row.ms).padStart(5)}ms ${(row.provider || '-').padEnd(11)} ${row.needsCorrection ? (row.corrected ? 'FIX' : 'MISS') : '  - '} ${row.failures.length ? 'FAIL:' + row.failures.join(',') : 'ok'}`,
  );
}

const allRecall = recall(withErrors);
const tuneRecall = recall(withErrors.filter((r) => !r.holdout));
const holdRecall = recall(withErrors.filter((r) => r.holdout));
const tuneFailures = scored.filter((r) => !r.holdout && r.failures.length);
const holdFailures = scored.filter((r) => r.holdout && r.failures.length);
const offTopic = scored.filter((r) => r.failures.includes('invented_fact')).length;

console.log('');
console.log(`turns            ${scored.length} (held out ${scored.filter((r) => r.holdout).length})`);
console.log(`providers        ${JSON.stringify(providers)}  workers-ai fallback: ${fallbacks}`);
console.log(`latency p50/p95  ${quantile(0.5)} / ${quantile(0.95)} ms`);
console.log(`correction recall ${allRecall.text}  (tune ${tuneRecall.text}, holdout ${holdRecall.text})`);
console.log(`check failures   tune ${tuneFailures.length}, holdout ${holdFailures.length}, error turns ${errors}, invented facts ${offTopic}`);

// ---------------------------------------------------------------------------
// Per provider+model quality gate (owner request, 2026-11-16)
//
// "Same model first" means every available provider serves the pair that passed
// the gate. A pair therefore has to pass on its OWN — a good average across a
// mixed run would let a weak provider hide behind a strong one. Thresholds are
// the owner's and are never lowered here: 85% correction recall on the sentences
// that carry a real error, zero invented facts, exactly one question per reply,
// p95 under 3.5 s.
// ---------------------------------------------------------------------------
const groups = new Map();
for (const row of scored) {
  const key = `${row.provider || 'unknown'}/${row.model || '-'}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
console.log('');
console.log('per provider/model');
console.log('  pair                                 turns  recall   facts  questions  p95ms  gate');
for (const [key, rows] of [...groups.entries()].sort()) {
  const need = rows.filter((r) => r.needsCorrection);
  const hits = need.filter((r) => r.corrected).length;
  const share = need.length ? hits / need.length : null;
  const invented = rows.filter((r) => r.failures.includes('invented_fact')).length;
  const badQuestions = rows.filter((r) => r.failures.some((f) => f.startsWith('questions='))).length;
  const lat = rows.map((r) => Number(r.ms)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const p95 = lat.length ? lat[Math.min(lat.length - 1, Math.floor(0.95 * lat.length))] : null;
  const pass =
    rows.length >= 8 &&
    share !== null &&
    share >= 0.85 &&
    invented === 0 &&
    badQuestions === 0 &&
    p95 !== null &&
    p95 < 3500;
  console.log(
    `  ${key.padEnd(36)} ${String(rows.length).padStart(5)}  ${(share === null ? 'n/a' : `${hits}/${need.length}`).padStart(6)}  ${String(invented).padStart(5)}  ${String(badQuestions).padStart(9)}  ${String(p95).padStart(5)}  ${pass ? 'PASS' : 'FAIL'}`,
  );
}

const gates = [
  ['correction recall >= 90%', withErrors.length ? allRecall.hits / withErrors.length >= 0.9 : false],
  ['zero invented facts on off-topic', offTopic === 0],
  ['p95 latency < 3500 ms', quantile(0.95) !== null && quantile(0.95) < 3500],
  ['zero error cards', errors === 0],
];
for (const [name, ok] of gates) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
const green = gates.every(([, ok]) => ok);
console.log(green ? 'REPLAY OK' : 'REPLAY RED');
process.exit(green ? 0 : 1);
