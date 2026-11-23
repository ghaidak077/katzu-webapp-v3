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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hintMatchesQuestion } from '../../cloudflare-turn-quality.js';
import { ROLEPLAY_PROMPT_VERSION } from '../../cloudflare-roleplay.js';
import {
  PACING_MS,
  mergeCaptures,
  planRemaining,
  readResults,
  recordResult,
  usableTurn,
} from './replay-run.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `--flag value` pairs are not capture paths; everything else positional is a capture file. */
const flagValueIndexes = new Set(
  process.argv.flatMap((arg, index) =>
    ['--only', '--dir', '--batch', '--pacing'].includes(arg) ? [index + 1] : [],
  ),
);
/** Every capture file given, merged by id — a run split across sittings scores as one run. */
const capturePaths = process.argv
  .slice(2)
  .filter((arg, index) => !arg.startsWith('--') && !flagValueIndexes.has(index + 2))
  .map((arg) => resolve(arg));
const casesFile = JSON.parse(readFileSync(join(root, 'scripts/replay/scenario-replay-cases.json'), 'utf8'));

/** `--only g34,g35` or `--only=g34,g35` scores just those cases. */
const onlyArg = process.argv.find((arg) => arg === '--only' || arg.startsWith('--only='));
const onlyIds = onlyArg
  ? (onlyArg.includes('=')
      ? onlyArg.slice(onlyArg.indexOf('=') + 1)
      : process.argv[process.argv.indexOf(onlyArg) + 1] || ''
    )
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  : [];
const cases = onlyIds.length ? casesFile.cases.filter((c) => onlyIds.includes(c.id)) : casesFile.cases;
const openers = casesFile.openers;

// ---------------------------------------------------------------------------
// `--plan`: what is still missing, in batches sized for one sitting.
// Reads whatever captures were given (none is fine) and exits before scoring.
// ---------------------------------------------------------------------------
const flagValue = (name, fallback) => {
  const at = process.argv.findIndex((arg) => arg === name || arg.startsWith(`${name}=`));
  if (at < 0) return fallback;
  const arg = process.argv[at];
  return arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : process.argv[at + 1] ?? fallback;
};

if (process.argv.includes('--plan')) {
  const captures = capturePaths
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')));
  const turns = mergeCaptures(captures);
  const plan = planRemaining({
    cases,
    capturedIds: turns.filter(usableTurn).map((turn) => turn.id),
    batchSize: Number(flagValue('--batch', 12)) || 12,
    pacingMs: Number(flagValue('--pacing', PACING_MS)) || PACING_MS,
  });
  console.log(
    `${plan.captured}/${plan.total} captured, ${plan.remaining} left ` +
      `(≈${plan.estimatedMinutes} min at ${Math.round(plan.pacingMs / 1000)} s/turn)`,
  );
  plan.batches.forEach((ids, index) => console.log(`  batch ${index + 1}: ${ids.join(',')}`));
  if (!plan.remaining) console.log('nothing left — score it with no --plan flag');
  process.exit(0);
}

const resultsDir = join(root, '.tmp', 'replay-results');

if (process.argv.includes('--history')) {
  const runs = readResults(resultsDir);
  if (!runs.length) console.log('no stored replay results yet — score a capture with --save.');
  for (const run of runs) {
    console.log(
      `${run.file.slice(0, 19).replace(/T/, ' ')}  v${run.promptVersion ?? '?'}  ` +
        `recall ${run.recall?.hits ?? '?'}/${run.recall?.total ?? '?'}  turns ${run.turns ?? '?'}  ` +
        `${run.green ? 'OK' : 'RED'}`,
    );
  }
  process.exit(0);
}

const turns = mergeCaptures(
  capturePaths
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf8'))),
);
const byId = new Map(turns.map((turn) => [turn.id, turn]));

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
  // A case with no capture is missing, not wrong. Counting it as a failure made a partial run
  // (54 of 69 uncaptured after the 2026-11-16 quota wall) read as 0% recall.
  const missing = entry.status === 0;
  if (missing) {
    return {
      id: entry.id,
      scenario: c?.scenario,
      kind: c?.kind,
      holdout: c?.holdout === true,
      missing: true,
      provider: '',
      model: '',
      attempts: null,
      ms: null,
      needsCorrection: c?.expect?.correct === true,
      corrected: false,
      failures: [],
      reply: '',
      understood: '',
      hint: '',
      fix: '',
    };
  }

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

  // A sentence that needs no correction must not come back "fixed". Fold case,
  // punctuation and umlauts first, so «ja ich wohne hier» → «Ja, ich wohne
  // hier.» is not a correction while a real word change (word order, verb,
  // ending) is. `changed` below stays case-strict on purpose.
  if (c?.noChange && understood.trim() && fold(understood) !== fold(raw)) failures.push('false_fix');

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
    missing: false,
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
const present = scored.filter((r) => !r.missing);
const missingRows = scored.filter((r) => r.missing);
const withErrors = present.filter((r) => r.needsCorrection);
const recall = (rows) => {
  const total = rows.length;
  const hits = rows.filter((r) => r.corrected).length;
  return { hits, total, text: `${pct(hits, total)} (${hits}/${total})` };
};
const latencies = present.map((r) => Number(r.ms)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
const quantile = (q) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] : null);
const providers = present.reduce((acc, r) => {
  const key = `${r.provider || 'unknown'}/${r.model || '-'}`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const fallbacks = present.filter((r) => /workers-ai/i.test(String(r.provider))).length;
const errors = present.filter((r) => r.failures.includes('no_reply')).length;

for (const row of scored) {
  if (row.missing) {
    console.log(`  ${row.id.padEnd(4)} not captured`);
    continue;
  }
  console.log(
    `${row.holdout ? 'H' : ' '} ${row.id.padEnd(4)} ${String(row.ms).padStart(5)}ms ${(row.provider || '-').padEnd(11)} ${row.needsCorrection ? (row.corrected ? 'FIX' : 'MISS') : '  - '} ${row.failures.length ? 'FAIL:' + row.failures.join(',') : 'ok'}`,
  );
}

const allRecall = recall(withErrors);
const tuneRecall = recall(withErrors.filter((r) => !r.holdout));
const holdRecall = recall(withErrors.filter((r) => r.holdout));
const tuneFailures = present.filter((r) => !r.holdout && r.failures.length);
const holdFailures = present.filter((r) => r.holdout && r.failures.length);
const offTopic = present.filter((r) => r.failures.includes('invented_fact')).length;

console.log('');
console.log(`turns            ${present.length} captured of ${scored.length} (held out ${present.filter((r) => r.holdout).length}, missing ${missingRows.length})`);
if (onlyIds.length) console.log(`subset           ${onlyIds.join(',')} — gates below are indicative only`);
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
for (const row of present) {
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
  [`every case captured (${present.length}/${scored.length})`, missingRows.length === 0],
];
for (const [name, ok] of gates) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
const green = gates.every(([, ok]) => ok);
// Exit 2 is "not finished", not "failed": a batch that hit a quota wall is resumable, and calling
// it RED would teach the next run to ignore the report. 0 green, 1 red with a full denominator.
const incomplete = missingRows.length > 0;
console.log(incomplete ? `REPLAY INCOMPLETE — ${missingRows.length} case(s) uncaptured, \`--plan\` shows what is left` : green ? 'REPLAY OK' : 'REPLAY RED');

// `--save` keeps the numbers: the next run compares against them instead of quoting a memory.
if (process.argv.includes('--save')) {
  const path = recordResult(resultsDir, {
    promptVersion: ROLEPLAY_PROMPT_VERSION,
    captures: capturePaths.map((path) => path.replace(`${root}\\`, '').replace(/\\/g, '/')),
    turns: present.length,
    missing: missingRows.length,
    recall: { hits: allRecall.hits, total: allRecall.total, tune: tuneRecall, holdout: holdRecall },
    p95Ms: quantile(0.95),
    errors,
    inventedFacts: offTopic,
    green,
  });
  console.log(`saved ${path.replace(`${root}\\`, '').replace(/\\/g, '/')} — \`--history\` lists the trend.`);
}
process.exit(incomplete ? 2 : green ? 0 : 1);
