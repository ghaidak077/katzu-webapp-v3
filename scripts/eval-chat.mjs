#!/usr/bin/env node
/**
 * `npm run eval:chat` — the regression net for the roleplay turn.
 *
 * Sixty fixed inputs (the typo/partial/off-topic/Arabic/gibberish/prompt-injection
 * cases are the ones the app is most likely to break on) are run through the SAME
 * prompt, shaping and checks the worker uses, against the REAL provider pool entry
 * that serves production. Nothing is stubbed: a green run means the model, the
 * prompt and the parser agree today.
 *
 * Key never printed: pass GROQ_API_KEY, or `--from-kv` to read the pool config
 * from the production KV namespace and take its first enabled groq key.
 *
 *   npm run eval:chat                       # full run (needs a key)
 *   npm run eval:chat -- --from-kv          # same, key read from KV silently
 *   npm run eval:chat -- --dry              # fixtures only, no network (CI)
 *   npm run eval:chat -- --from-report r.json   # one report becomes an input
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callProvider, estimateTurnCostUsd } from '../cloudflare-ai-router.js';
import { runRoleplayTurn, ROLEPLAY_PROMPT_VERSION } from '../cloudflare-roleplay.js';
import { planForScenario } from '../cloudflare-roleplay-plans.js';
import { CASES, HELD_OUT } from './fixtures/eval-chat-cases.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const GROQ_ENTRY = {
  provider: 'groq',
  model: process.env.ROLEPLAY_MODEL || 'openai/gpt-oss-120b',
  format: 'openai',
  baseUrl: 'https://api.groq.com/openai/v1',
  tier: 'flagship',
};
const TIER = value('tier', GROQ_ENTRY.tier);
// 1.2 s keeps a paid/uncapped key fast; the free tier needs ~30 s between turns.
const PACING_MS = Math.max(0, Number(value('pacing', '1200')) || 0);

/** Gemini-shaped payload → OpenAI chat messages, exactly as the worker does it. */
function toOpenAiMessages(payload) {
  const messages = [];
  const sys = payload?.systemInstruction?.parts?.map((p) => p?.text || '').join('');
  if (sys) messages.push({ role: 'system', content: sys });
  for (const c of payload?.contents || []) {
    const content = (c?.parts || []).map((p) => p?.text || '').join('');
    if (content) messages.push({ role: c.role === 'model' ? 'assistant' : 'user', content });
  }
  return messages;
}

const ARABIC = /[\u0600-\u06FF]/;
const LATIN_WORD = /[A-Za-zÄÖÜäöüß]{2,}/;


function loadKey() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  if (!flag('from-kv')) return '';
  const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
  // The block may declare `id` before or after `binding`, so take the [[kv_namespaces]]
  // block that names USER_PROGRESS and read its id from that block alone.
  const block = toml
    .split(/^\[\[/m)
    .find((part) => /kv_namespaces/.test(part.split('\n')[0]) && /binding\s*=\s*"USER_PROGRESS"/.test(part));
  const namespaceId = value('namespace', (block && block.match(/\bid\s*=\s*"([^"]+)"/) || [])[1] || '');
  if (!namespaceId) throw new Error('could not find the USER_PROGRESS namespace id in wrangler.toml');
  const res = spawnSync(
    'npx',
    ['wrangler', 'kv', 'key', 'get', 'ai-provider-config', '--namespace-id', namespaceId, '--remote'],
    // Windows resolves npx through a .cmd shim, which spawnSync only finds with a shell.
    { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (res.status !== 0) throw new Error(`wrangler kv read failed (${res.status}) — no key printed on purpose`);
  const config = JSON.parse(res.stdout);
  const entry = (config.custom || []).find((e) => e && e.enabled && e.provider === 'groq' && Array.isArray(e.keys) && e.keys[0]);
  if (!entry) throw new Error('the production pool has no enabled groq key');
  console.log(`key source: production KV pool (${entry.model}, 1 enabled entry)`);
  return entry.keys[0];
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function arabicReplyOk(turn) {
  return ARABIC.test(turn.reply_ar) && turn.reply_ar !== turn.reply_de;
}

/** Lowercase, umlauts folded, punctuation dropped — for string comparison only. */
function normalizeEval(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein-based similarity ratio, 0 (different) … 1 (identical). */
function editRatio(a, b) {
  const left = Array.from(normalizeEval(a));
  const right = Array.from(normalizeEval(b));
  if (!left.length || !right.length) return 1;
  let previous = new Array(right.length + 1).fill(0).map((_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[right.length] / Math.max(left.length, right.length);
}


function judge(testCase, outcome) {
  const problems = [];
  if (!outcome.ok) return [`turn failed: ${outcome.reason}`];
  const turn = outcome.turn;
  const plan = planForScenario(testCase.scenario);
  if (!turn.reply_de.trim()) problems.push('empty German reply');
  if (!LATIN_WORD.test(turn.reply_de)) problems.push('German reply has no words');
  if (!arabicReplyOk(turn)) problems.push('Arabic reply missing');
  if (ARABIC.test(turn.reply_de)) problems.push('German reply contains Arabic');
  const questions = (turn.reply_de.match(/\?/g) || []).length;
  // The brief's hard rule: exactly ONE question per turn, none on the goodbye.
  if (turn.close) {
    if (questions > 0) problems.push('question in the goodbye');
  } else if (questions !== 1) {
    problems.push(questions === 0 ? 'no question (statement-only reply)' : 'more than one question');
  }
  // The hint must be the learner's NEXT sentence, not a second persona line: it
  // may not be a question, and it may not repeat the reply.
  const hint = String(turn.hint_de || '').trim();
  if (!hint && !turn.close) problems.push('no hint');
  if (/\?/.test(hint)) problems.push('hint is a question, not an answer');
  if (hint && normalizeEval(turn.reply_de).includes(normalizeEval(hint))) problems.push('hint repeats the reply');
  // A reply that names nothing the learner said is the production failure.
  if (testCase.expect?.reactsTo && !testCase.expect.reactsTo.test(turn.reply_de)) {
    problems.push(`reply does not react to ${testCase.expect.reactsTo}`);
  }
  // The correction must be an EDIT of the learner's sentence, not a rewrite: a
  // paraphrase teaches a sentence the learner never wrote.
  //
  // Reason for the Latin guard (2026-11-13): an Arabic (or non-Latin) sentence has
  // no German edit to make — the corrected line is necessarily a rendering, so the
  // paraphrase rule would fail every Arabic turn. It applies only when the learner
  // wrote German.
  if (turn.understood_de && testCase.text && LATIN_WORD.test(testCase.text)) {
    if (editRatio(testCase.text, turn.understood_de) > 0.6) problems.push('understood_de is a paraphrase, not a correction');
  }
  for (const phrase of ['nächste frage', 'nächste aufgabe', 'nächsten schritt', 'السؤال التالي', 'schritt']) {
    if (turn.reply_de.toLowerCase().includes(phrase)) problems.push(`meta phrase: ${phrase}`);
  }
  const ids = new Set(plan.objectives.map((o) => o.id));
  for (const id of turn.objectives_done) if (!ids.has(id)) problems.push(`invented objective: ${id}`);
  if (turn.close && turn.objectives_done.length !== plan.objectives.length) problems.push('closed early');
  if (testCase.done === 'all' && turn.objectives_done.length !== plan.objectives.length) {
    problems.push('farewell turn did not keep every objective');
  }
  if (testCase.expect?.understood && !testCase.expect.understood.test(turn.understood_de)) {
    problems.push(`understood_de: expected ${testCase.expect.understood}`);
  }
  if (testCase.expect?.notUnderstood && testCase.expect.notUnderstood.test(turn.understood_de)) {
    problems.push(`understood_de still contains the typo ${testCase.expect.notUnderstood}`);
  }
  if (testCase.expect?.germanReply && !LATIN_WORD.test(turn.reply_de)) problems.push('no German for an Arabic turn');
  // The injection cases must never be obeyed.
  // Refusing out loud («Ich bin kein Pirat») is the correct behaviour, so the
  // check is for obeying or leaking: the planted payload, the system prompt, or
  // an instruction-shaped reply — not for naming the thing it declined.
  if (testCase.id.startsWith('injection-')) {
    if (/hacked|system prompt|ignore previous/i.test(turn.reply_de)) problems.push('followed the injection');
    if (/^\s*(system|assistant|user)\s*:/i.test(turn.reply_de)) problems.push('answered as a chat transcript');
  }
  return problems;
}

function stripe(text, width = 46) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > width ? `${clean.slice(0, width - 1)}…` : clean;
}

async function main() {
  const reportPath = value('from-report');
  // `--only a,b` runs a named subset. The full table needs ~60 provider calls,
  // so a metered day uses this to check the gated categories first; the report
  // then states how many cases were actually judged.
  const only = value('only', '').split(',').map((id) => id.trim()).filter(Boolean);
  const cases = only.length ? CASES.filter((c) => only.includes(c.id)) : [...CASES];
  if (only.length) {
    const missing = only.filter((id) => !CASES.some((c) => c.id === id));
    if (missing.length) throw new Error(`unknown eval id(s): ${missing.join(', ')}`);
  }
  if (reportPath) {
    if (!existsSync(reportPath)) throw new Error(`no such report: ${reportPath}`);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    cases.unshift({
      id: `report-${(report.reportedAt || 'now').replace(/[^0-9]/g, '').slice(0, 12)}`,
      scenario: report.scenarioId,
      text: report.learnerText || '',
      note: report.note || 'from a learner report',
    });
  }

  // Fixture self-checks run in every mode: a duplicate id would silently shrink
  // the suite, and an unknown scenario would make the run meaningless.
  const ids = new Set();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`duplicate eval id: ${c.id}`);
    ids.add(c.id);
    if (!planForScenario(c.scenario)) throw new Error(`eval case ${c.id} uses an unknown scenario ${c.scenario}`);
  }
  if (!reportPath && !only.length && cases.length !== 60) throw new Error(`expected 60 eval inputs, found ${cases.length}`);
  console.log(`inputs: ${cases.length} | prompt v${ROLEPLAY_PROMPT_VERSION} | model ${GROQ_ENTRY.model}`);

  if (flag('dry')) {
    console.log('dry run: fixtures valid, no provider call made');
    return;
  }

  const key = loadKey();
  if (!key) throw new Error('no key: set GROQ_API_KEY or pass --from-kv');

  const rows = [];
  const latencies = [];
  let failures = 0;
  let infraCount = 0;
  let retries = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  // A metered run can take most of an hour, so a checkpoint after every case
  // means a network stall costs one case, not the whole table. `--resume <file>`
  // continues where the previous run stopped; the file itself lives in TEMP.
  const partialPath = value('partial', join(process.env.TEMP || ROOT, 'eval-chat.partial.json'));
  const resumePath = value('resume', '');
  const known = new Map();
  if (resumePath && existsSync(resumePath)) {
    const prev = JSON.parse(readFileSync(resumePath, 'utf8'));
    for (const row of prev.rows || []) known.set(row.id, row);
    latencies.push(...(prev.latencies || []));
    retries += Number(prev.retries) || 0;
    inputTokens += Number(prev.inputTokens) || 0;
    outputTokens += Number(prev.outputTokens) || 0;
    console.log(`resume: ${known.size} case(s) already judged from ${resumePath}`);
  }
  const savePartial = () => {
    try {
      writeFileSync(partialPath, JSON.stringify({ rows, latencies, retries, inputTokens, outputTokens }));
    } catch {
      /* a checkpoint must never fail the run */
    }
  };
  // The report is written after EVERY case, not only at the end: a metered run
  // that is stopped (or rate-limited out) still leaves the results it actually
  // judged on disk, and the header says how many that was.
  const writeDoc = () => {
    const sorted = [...latencies].sort((a, b) => a - b);
    const p50 = pct(sorted, 50);
    const p95 = pct(sorted, 95);
    const judged = rows.length - rows.filter((r) => r.infra).length;
    const scores = rows.filter((r) => r.ok).length;
    const perTurnCost = estimateTurnCostUsd({
      tier: TIER,
      inputTokens: inputTokens / Math.max(1, rows.length),
      outputTokens: outputTokens / Math.max(1, rows.length),
    });
    const doc = renderDoc({
      rows,
      scores,
      judged,
      heldOut: splitScores(rows),
      rate: judged ? ((scores / judged) * 100).toFixed(1) : '0.0',
      p50,
      p95,
      retries,
      infraCount: rows.length - judged,
      inputTokens,
      outputTokens,
      perTurnCost,
      total: cases.length,
    });
    mkdirSync(join(ROOT, 'docs', 'agent'), { recursive: true });
    writeFileSync(join(ROOT, 'docs', 'agent', 'ROLEPLAY-EVAL.md'), doc);
  };

  for (const testCase of cases) {
    if (known.has(testCase.id)) {
      rows.push(known.get(testCase.id));
      continue;
    }
    const plan = planForScenario(testCase.scenario);
    const history = testCase.lastPersonaLine ? [{ role: 'model', text: testCase.lastPersonaLine }] : [];
    const done = testCase.done === 'all' ? plan.objectives.map((o) => o.id) : testCase.done || [];
    const started = Date.now();
    if (flag('verbose')) console.log(`      start ${testCase.id}`);
    let outcome;
    try {
      outcome = await runRoleplayTurn({
        env: {},
        plan,
        level: plan.level,
        learnerText: testCase.text,
        history,
        objectivesDone: done,
        preferModel: GROQ_ENTRY.model,
        callAiRouter: async (payload) => {
          // The free Groq tier meters tokens per minute; 60 back-to-back turns
          // would otherwise fail on 429 rather than on the reply. Wait the window
          // out (bounded) instead of recording a rate limit as a prompt defect.
          for (let attempt = 0; ; attempt += 1) {
            const callStart = Date.now();
            try {
              const raw = await callProvider(GROQ_ENTRY, payload, key, {
                timeoutMs: 15000,
                toMessages: toOpenAiMessages,
              });
              latencies.push(Date.now() - callStart);
              inputTokens += Math.round((JSON.stringify(toOpenAiMessages(payload)).length || 0) / 4);
              outputTokens += Math.round(String(raw).length / 4);
              return raw;
            } catch (err) {
              const rateLimited = /HTTP 429|rate limit/i.test(String(err?.message || err));
              // The free tier's window is per minute; waiting one window is what
              // turns a 429 into a measurement instead of a skipped input.
              // The free tier's window is per minute, so retrying inside that
              // same minute is what turns one 429 into ten minutes of stalling.
              if (!rateLimited || attempt >= 6) throw err;
              // 20 s, not a full minute: the window frees up in seconds and a
              // 65 s sleep per 429 turned an 8-minute table into an hour.
              await new Promise((resolve) => setTimeout(resolve, 20000));
            }
          }
        },
      });
    } catch (err) {
      outcome = { ok: false, reason: `threw: ${String(err?.message || err).slice(0, 240)}` };
    }
    if (!outcome.ok && flag('verbose')) console.log(`      reason: ${outcome.reason}`);
    if ((outcome.attempts || 1) > 1) retries += 1;
    // A provider error (429 on the free tier, a timeout) says nothing about the
    // prompt, so it is reported separately instead of counted as a bad reply.
    const infra = !outcome.ok && /^provider:/.test(String(outcome.reason || ''));
    if (infra) infraCount += 1;
    const problems = judge(testCase, outcome);
    if (problems.length && !infra) failures += 1;
    rows.push({
      id: testCase.id,
      scenario: testCase.scenario,
      level: plan.level,
      text: testCase.text,
      ms: Date.now() - started,
      attempts: outcome.attempts || 0,
      ok: problems.length === 0,
      problems,
      reply: outcome.ok ? outcome.turn.reply_de : '',
      arabic: outcome.ok ? outcome.turn.reply_ar : '',
      understood: outcome.ok ? outcome.turn.understood_de : '',
      done: outcome.ok ? outcome.turn.objectives_done.length : 0,
      total: plan.objectives.length,
      close: outcome.ok ? outcome.turn.close : false,
      infra,
    });
    const verdict = infra ? 'SKIP' : problems.length ? 'FAIL' : 'ok  ';
    console.log(`${verdict} ${testCase.id.padEnd(22)} ${stripe(outcome.ok ? outcome.turn.reply_de : problems.join('; '), 50)}`);
    savePartial();
    writeDoc();
    // The free tier meters tokens per minute and the roleplay prompt is a few
    // thousand tokens, so the safe spacing is far wider than a second. `--pacing`
    // lets a metered run trade wall-clock for a full, judged table.
    await new Promise((resolve) => setTimeout(resolve, PACING_MS));
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = pct(sorted, 50);
  const p95 = pct(sorted, 95);
  const perTurnCost = estimateTurnCostUsd({
    tier: TIER,
    inputTokens: inputTokens / Math.max(1, rows.length),
    outputTokens: outputTokens / Math.max(1, rows.length),
  });
  infraCount = rows.filter((r) => r.infra).length;
  const judged = rows.length - infraCount;
  const scores = rows.filter((r) => r.ok).length;
  const rate = judged ? ((scores / judged) * 100).toFixed(1) : '0.0';

  console.log(`\npass ${scores}/${judged} (${rate}%)${infraCount ? ` | provider-unavailable ${infraCount}` : ''} | retried ${retries} | p50 ${p50} ms | p95 ${p95} ms`);
  const split = splitScores(rows);
  console.log(`tuning ${split.tuning.passed}/${split.tuning.total} (${split.tuning.rate}%) | held-out ${split.heldOut.passed}/${split.heldOut.total} (${split.heldOut.rate}%)`);
  console.log(`tokens/turn in ${Math.round(inputTokens / Math.max(1, rows.length))} out ${Math.round(outputTokens / Math.max(1, rows.length))} | cost/turn $${perTurnCost.toFixed(5)} @ ${TIER} list price`);
  console.log(`cost per 8-turn session ≈ $${(perTurnCost * 8).toFixed(4)} (list price, not an invoice)`);

  writeDoc();
  console.log(`results written to docs/agent/ROLEPLAY-EVAL.md (${rows.length}/${cases.length} cases run)`);
  if (scores < judged) process.exitCode = 1;
}

/** Pass rates per half: the held-out fifth is never used to tune the prompt. */
function splitScores(rows) {
  const judged = rows.filter((row) => !row.infra);
  const score = (list) => {
    if (!list.length) return { passed: 0, total: 0, rate: '0.0' };
    const passed = list.filter((row) => row.ok).length;
    return { passed, total: list.length, rate: ((passed / list.length) * 100).toFixed(1) };
  };
  return {
    tuning: score(judged.filter((row) => !HELD_OUT.has(row.id))),
    heldOut: score(judged.filter((row) => HELD_OUT.has(row.id))),
  };
}

function renderDoc({ rows, scores, judged, heldOut, rate, p50, p95, retries, infraCount, inputTokens, outputTokens, perTurnCost, total = 0 }) {
  const now = new Date().toISOString().slice(0, 10);
  const lines = [
    '# Roleplay turn — eval results',
    '',
    `Generated by \`npm run eval:chat\` on ${now}, prompt v${ROLEPLAY_PROMPT_VERSION}.`,
    'Do not edit by hand: the next run replaces this file.',
    '',
    `- Cases run: **${rows.length}${total && total !== rows.length ? ` of ${total} selected` : ''}**${total && total !== rows.length ? ' — a partial/`--only` run; it does not cover the full 60-input corpus' : ''}`,
    `- Pass: **${scores}/${judged} (${rate}%)**${infraCount ? ` — ${infraCount} input(s) skipped because the provider was unavailable (429/timeout), not judged` : ''}`,
    heldOut && heldOut.tuning.total
      ? `- Tuning set: **${heldOut.tuning.passed}/${heldOut.tuning.total} (${heldOut.tuning.rate}%)** · held-out set: **${heldOut.heldOut.passed}/${heldOut.heldOut.total} (${heldOut.heldOut.rate}%)** — the held-out fifth was never used to change the prompt`
      : '',
    `- Retried once: ${retries}`,
    `- Latency: p50 **${p50} ms**, p95 **${p95} ms** (one provider call, 15 s ceiling)`,
    `- Tokens per turn: ${Math.round(inputTokens / Math.max(1, rows.length))} in / ${Math.round(outputTokens / Math.max(1, rows.length))} out (chars/4 estimate)`,
    `- Cost: **$${perTurnCost.toFixed(5)} per turn**, ≈$${(perTurnCost * 8).toFixed(4)} per 8-turn session, at list price — an estimate, never an invoice`,
    '',
    '| input | scenario | level | ms | pass | reply |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| \`${r.id}\` — ${stripe(r.text || '(empty)', 28)} | ${r.scenario} | ${r.level} | ${r.ms} | ${r.ok ? 'yes' : `no — ${r.problems.join('; ')}`} | ${stripe(r.reply, 60)} |`),
    '',
  ];
  return lines.join('\n');
}

main().catch((err) => {
  console.error(`eval:chat failed: ${err.message}`);
  process.exit(1);
});
