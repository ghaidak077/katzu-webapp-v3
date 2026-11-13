#!/usr/bin/env node
/**
 * `npm run qa:chat` — the automated owner review of the practice chat.
 *
 * Drives the REAL turn path (`runRoleplayTurn` → the same prompt, parser,
 * shaper and checks the Worker uses) with twelve synthetic learners, runs the
 * frozen deterministic checks and the whole-transcript judge, and writes
 * `docs/agent/CHAT-QA-REPORT.md`.
 *
 *   npm run qa:chat -- --dry                 # fixtures + plans only, no network
 *   npm run qa:chat -- --from-kv             # key from the production pool
 *   npm run qa:chat -- --limit 3             # smoke three sessions
 *   npm run qa:chat -- --max-turns 5 --pacing 7000
 *   npm run qa:chat -- --only careless_speller--cafe_order
 *   npm run qa:chat -- --report-only 2026-11-09T14-20-08   # rebuild from checkpoints
 *   npm run qa:chat -- --judge=off           # deterministic checks only
 *
 * Everything is checkpointed under `.tmp/qa/runs/<stamp>/`, so a run stopped by
 * a quota wall can be resumed with `--resume <stamp>`.
 */
import './register.mjs';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRoleplayTurn, ROLEPLAY_PROMPT_VERSION } from '../../cloudflare-roleplay.js';
import { planForScenario, objectivesOf } from '../../cloudflare-roleplay-plans.js';
import { SESSIONS } from './scenarios.mjs';
import { learnerText, buildLearnerInstruction, LEARNER_PROMPT_VERSION, profileById } from './profiles.mjs';
import { runChecks, hardFailures } from './checks.mjs';
import { mean, renderReport, regressionsVs } from './report.mjs';
import { judgeTranscript, JUDGE_PASS_MEAN, JUDGE_MIN_CORRECTNESS } from './judge.mjs';
import { createProvider, loadKey, ACTOR_MODEL, JUDGE_MODEL } from './provider.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const MAX_USD = Math.max(0, Number(value('max-usd', process.env.QA_MAX_USD || '5')) || 5);
const MAX_TURNS = Math.max(1, Math.min(10, Number(value('max-turns', '6')) || 6));
const PACING_MS = Math.max(0, Number(value('pacing', '7000')) || 0);
const LEARNER_MODE = value('learner', 'deterministic');
const JUDGE_MODE = value('judge', 'on');
const STAMP = value('resume', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
const RUN_DIR = join(ROOT, '.tmp', 'qa', 'runs', STAMP);
const REPORT_OUT = value('report-out', '') || join(ROOT, 'docs', 'agent', 'CHAT-QA-REPORT.md');
const PROGRESS = join(ROOT, '.tmp', 'qa', 'progress.log');

function log(line) {
  const text = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
  console.log(text);
  try {
    mkdirSync(dirname(PROGRESS), { recursive: true });
    writeFileSync(PROGRESS, `${text}\n`, { flag: 'a' });
  } catch {
    /* progress is best effort */
  }
}

function selectSessions() {
  let sessions = SESSIONS;
  if (flag('weekly')) {
    // 10 scenarios × 3 profiles = 30 sessions, spread across units rather than
    // three copies of the same three scenarios.
    const profiles = ['careless_speller', 'copies_hint', 'injection'];
    const scenarios = SESSIONS.slice(0, 10);
    sessions = profiles.flatMap((profile) =>
      scenarios.map((session) => ({ ...session, profile, id: `${profile}--${session.scenarioId}` })),
    );
  }
  const only = value('only', '');
  if (only) {
    const wanted = new Set(only.split(',').map((item) => item.trim()));
    sessions = sessions.filter((session) => wanted.has(session.id) || wanted.has(session.profile) || wanted.has(session.scenarioId));
  }
  const limit = Number(value('limit', '0')) || 0;
  if (limit > 0) sessions = sessions.slice(0, limit);
  return sessions;
}

async function dryRun(sessions) {
  log(`dry: ${sessions.length} session(s), prompt v${ROLEPLAY_PROMPT_VERSION}, learner v${LEARNER_PROMPT_VERSION}`);
  for (const session of sessions) {
    const plan = planForScenario(session.scenarioId);
    if (!plan) throw new Error(`missing plan for ${session.scenarioId}`);
    if (!profileById(session.profile)) throw new Error(`missing profile ${session.profile}`);
    const first = learnerText({ profileId: session.profile, scenarioId: session.scenarioId, turn: 1 });
    log(`dry: ${session.id} | ${session.level} | ${objectivesOf(plan).length} objectives | first="${first.slice(0, 60)}"`);
  }
  log('dry: imports, plans, profiles and splits are valid; no provider call made');
}

async function runSession({ session, provider, stamp }) {
  const plan = planForScenario(session.scenarioId);
  const objectives = objectivesOf(plan);
  const history = [];
  const turns = [];
  let objectivesDone = [];
  let closed = false;
  let hintDe = '';
  const startedAt = Date.now();

  for (let turnNumber = 1; turnNumber <= MAX_TURNS; turnNumber += 1) {
    if (closed) break;
    let text = learnerText({ profileId: session.profile, scenarioId: session.scenarioId, turn: turnNumber, hintDe });
    if (LEARNER_MODE === 'model') {
      try {
        text = (await provider.completeText({
          model: ACTOR_MODEL,
          system: buildLearnerInstruction({ profileId: session.profile, scenarioId: session.scenarioId, level: plan.level, plan }),
          user: `The persona just said: "${turns.at(-1)?.turn?.reply_de || '(nothing yet, you speak first)'}". Write your next message.`,
          maxTokens: 120,
        })) || text;
      } catch (error) {
        log(`${session.id}: model learner failed, falling back to the policy (${String(error.message).slice(0, 80)})`);
      }
    }

    const turnStarted = Date.now();
    let outcome;
    try {
      outcome = await runRoleplayTurn({
        env: {},
        plan,
        level: plan.level,
        learnerText: text,
        history,
        objectivesDone,
        callAiRouter: provider.actorRouter,
      });
    } catch (error) {
      if (error?.code === 'QA_BUDGET' || error?.code === 'QA_DAILY_QUOTA') throw error;
      outcome = { ok: false, reason: String(error?.message || error), raw: '' };
    }
    const latencyMs = Date.now() - turnStarted;

    if (!outcome.ok) {
      turns.push({ turnNumber, learnerText: text, ok: false, reason: outcome.reason, raw: outcome.raw || '', latencyMs });
      log(`${session.id} turn ${turnNumber}: FAILED ${String(outcome.reason).slice(0, 120)}`);
      break;
    }

    const turn = outcome.turn;
    const expectedNoCorrection = session.profile === 'copies_hint';
    turns.push({
      turnNumber,
      learnerText: text,
      ok: true,
      turn,
      raw: outcome.raw,
      latencyMs,
      expectedNoCorrection,
      tokensIn: Math.ceil((outcome.systemInstruction?.length || 0) / 4) + Math.ceil(text.length / 4),
      tokensOut: Math.ceil(String(outcome.raw || '').length / 4),
      attempts: outcome.attempts,
    });
    history.push({ role: 'user', text });
    history.push({ role: 'model', text: turn.reply_de });
    objectivesDone = turn.objectives_done || objectivesDone;
    hintDe = turn.hint_de || hintDe;
    closed = turn.close === true;
    log(
      `${session.id} turn ${turnNumber}: ${latencyMs} ms | ${(objectivesDone.length)}/${objectives.length} | ${turn.reply_de.slice(0, 70)}`,
    );
  }

  const transcript = {
    sessionId: session.id,
    profile: session.profile,
    scenarioId: session.scenarioId,
    unitId: session.unitId,
    level: session.level,
    split: session.split,
    planVersion: 1,
    promptVersion: ROLEPLAY_PROMPT_VERSION,
    learnerVersion: LEARNER_PROMPT_VERSION,
    actor: ACTOR_MODEL,
    turns,
    objectivesDone,
    objectivesTotal: objectives.length,
    closed,
    elapsedMs: Date.now() - startedAt,
  };
  transcript.checks = runChecks(transcript, { plan, profileId: session.profile });
  transcript.failures = hardFailures(transcript.checks);
  if (JUDGE_MODE !== 'off' && turns.some((entry) => entry.ok)) {
    try {
      transcript.judge = await judgeTranscript({ provider, transcript, plan });
    } catch (error) {
      transcript.judge = { ok: false, reason: `judge_error:${String(error.message).slice(0, 160)}` };
    }
  }
  transcript.passed = transcript.failures.length === 0 && turns.every((entry) => entry.ok) && transcript.judge?.ok !== false;
  return transcript;
}


async function main() {
  const sessions = selectSessions();
  if (flag('dry')) {
    await dryRun(sessions);
    return;
  }
  // Rebuild the report from checkpoints already on disk, without a key or a
  // network call. Used when a run is stopped by a quota wall: the evidence is
  // real and worth reporting, and this never pretends a partial run is complete.
  const reportOnly = value('report-only', '');
  if (reportOnly) {
    const dir = join(ROOT, '.tmp', 'qa', 'runs', reportOnly);
    const files = existsSync(dir) ? readdirSync(dir).filter((name) => /^session-.+\.json$/.test(name)) : [];
    const saved = files.map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
    if (!saved.length) {
      console.error(`no checkpoints in ${dir}`);
      process.exit(1);
    }
    const usd = saved.reduce((sum, item) => sum + (item.costUsd || 0), 0);
    const provider = { ledger: { usd, calls: 0, retries429: 0 } };
    const report = renderReport({ transcripts: saved, provider, stamp: reportOnly, sessions, env: { maxUsd: MAX_USD, learnerMode: LEARNER_MODE, judgeMode: JUDGE_MODE } });
    const reportPath = REPORT_OUT;
    writeFileSync(reportPath, report);
    log(`report from ${saved.length}/${sessions.length} checkpoint(s): ${reportPath}`);
    process.exitCode = saved.length < sessions.length ? 3 : 0;
    return;
  }
  const loaded = loadKey({ fromKv: flag('from-kv') });
  if (!loaded.key) {
    console.error('no provider key: set GROQ_API_KEY or pass --from-kv (nothing printed)');
    process.exit(2);
  }
  mkdirSync(RUN_DIR, { recursive: true });
  log(`run ${STAMP}: ${sessions.length} session(s) | key ${loaded.source} | actor ${ACTOR_MODEL} | judge ${JUDGE_MODE === 'off' ? 'off' : JUDGE_MODEL} | QA_MAX_USD ${MAX_USD}`);

  const provider = createProvider({ key: loaded.key, maxUsd: MAX_USD, pacingMs: PACING_MS, log });
  const transcripts = [];
  let aborted = '';
  for (const session of sessions) {
    const checkpoint = join(RUN_DIR, `session-${session.id}.json`);
    if (existsSync(checkpoint)) {
      const saved = JSON.parse(readFileSync(checkpoint, 'utf8'));
      // A checkpoint names the prompt it was produced with. Reusing one across a
      // prompt bump would silently mix v3 evidence into a v4 verdict, so only a
      // matching checkpoint is a resume; anything else is re-run.
      if (saved.promptVersion === ROLEPLAY_PROMPT_VERSION && saved.learnerVersion === LEARNER_PROMPT_VERSION && saved.turns.every((turn) => turn.ok)) {
        transcripts.push(saved);
        log(`resume: ${session.id} already complete (${saved.passed ? 'pass' : 'fail'})`);
        continue;
      }
      log(`resume: ${session.id} checkpoint not reusable (prompt v${saved.promptVersion}/learner v${saved.learnerVersion}, ${saved.turns.filter((turn) => !turn.ok).length} failed turn(s)) — re-running`);
    }
    let result;
    const usdBefore = provider.ledger.usd;
    try {
      result = await runSession({ session, provider, stamp: STAMP });
    } catch (error) {
      if (error?.code === 'QA_BUDGET' || error?.code === 'QA_DAILY_QUOTA') {
        aborted = `stopped: ${error.message}`;
        log(aborted);
        break;
      }
      throw error;
    }
    result.costUsd = provider.ledger.usd - usdBefore;
    writeFileSync(checkpoint, JSON.stringify(result, null, 2));
    transcripts.push(result);
    log(`${session.id}: ${result.passed ? 'PASS' : 'FAIL'} | checks ${result.checks.length - result.failures.length}/${result.checks.length} | judge ${result.judge?.mean ? result.judge.mean.toFixed(2) : '—'} | $${provider.ledger.usd.toFixed(4)} spent`);
  }

  if (!transcripts.length) {
    console.error('no transcript produced');
    process.exit(1);
  }
  const report = renderReport({ transcripts, provider, stamp: STAMP, sessions, env: { maxUsd: MAX_USD, learnerMode: LEARNER_MODE, judgeMode: JUDGE_MODE } });
  const reportPath = REPORT_OUT;
  writeFileSync(reportPath, report);
  log(`report: ${reportPath}`);
  log(`cost: $${provider.ledger.usd.toFixed(4)} / $${MAX_USD}${aborted ? ` (${aborted})` : ''}`);
  const failed = transcripts.filter((item) => !item.passed).length;
  log(`sessions: ${transcripts.length - failed} pass / ${failed} fail`);
  // CI's contract is "fail on a regression against the baseline, on a broken
  // hard rule, or on a judge mean under the ship threshold" — not "fail because
  // any single session failed", which turns a known failing profile into a red
  // weekly run that everyone learns to ignore.
  const brokenHard = transcripts.filter((item) => item.failures.length > 0 || item.turns.some((entry) => !entry.ok));
  const judged = transcripts.filter((item) => typeof item.judge?.mean === 'number');
  const judgeMean = mean(judged.map((item) => item.judge.mean));
  const regressions = regressionsVs(transcripts);
  const judgeBelow = JUDGE_MODE !== 'off' && judged.length > 0 && judgeMean < JUDGE_PASS_MEAN;
  const correctnessBelow = transcripts.filter((item) => typeof item.judge?.correctness === 'number' && item.judge.correctness < JUDGE_MIN_CORRECTNESS);
  if (correctnessBelow.length) log(`correctness < ${JUDGE_MIN_CORRECTNESS}: ${correctnessBelow.map((item) => item.sessionId).join(', ')}`);
  if (judgeBelow) log(`judge mean ${judgeMean.toFixed(2)} < ${JUDGE_PASS_MEAN}`);
  if (regressions.length) log(`regressions: ${regressions.map((item) => item.sessionId).join(', ')}`);
  if (transcripts.length < sessions.length) process.exitCode = 3;
  else if (brokenHard.length || regressions.length || judgeBelow || correctnessBelow.length) process.exitCode = 1;

  // A baseline is the thing CI compares against, so a partial run must never
  // write one: a quota wall would otherwise turn "not measured" into "passed
  // before", and the next green run would look like a regression.
  if (flag('write-baseline') && transcripts.length < sessions.length) {
    log(`baseline not written: only ${transcripts.length}/${sessions.length} sessions ran`);
  } else if (flag('write-baseline')) {
    const rows = Object.fromEntries(
      transcripts.map((item) => [item.sessionId, { passed: item.passed, judge: item.judge?.mean || 0, prompt: item.promptVersion }]),
    );
    writeFileSync(
      join(ROOT, 'scripts', 'qa', 'baseline.json'),
      JSON.stringify({ at: new Date().toISOString(), prompt: ROLEPLAY_PROMPT_VERSION, sessions: rows }, null, 2),
    );
    log('baseline written: scripts/qa/baseline.json');
  }
}

main().catch((error) => {
  console.error(`qa:chat failed: ${String(error?.message || error).slice(0, 500)}`);
  process.exit(1);
});
