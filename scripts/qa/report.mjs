/**
 * Report generation for the chat QA harness.
 *
 * Kept out of run.mjs so neither file crosses the 500-line source budget:
 * run.mjs runs sessions; this module turns transcripts into the owner report
 * (verdict table, per-rule/per-profile rows, prompt-version history, worst
 * transcripts, the five-minute review) and compares a run to the baseline.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLEPLAY_PROMPT_VERSION } from '../../cloudflare-roleplay.js';
import { LEARNER_PROMPT_VERSION } from './profiles.mjs';
import { checksByRule } from './checks.mjs';
import { JUDGE_PASS_MEAN, JUDGE_MIN_CORRECTNESS, RUBRIC_VERSION } from './judge.mjs';
import { ACTOR_MODEL, JUDGE_MODEL } from './provider.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}
export function loadBaseline() {
  const path = join(ROOT, 'scripts', 'qa', 'baseline.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function updateVersions(transcripts) {
  const path = join(ROOT, '.tmp', 'qa', 'versions.json');
  let rows = [];
  try {
    rows = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    rows = [];
  }
  // A prompt version measured on a substitute model is not the same evidence as
  // one measured on the production actor, so the row key is prompt + actor.
  const keyOf = (prompt, actor) => `v${prompt}@${actor || 'unknown'}`;
  const byVersion = new Map();
  for (const transcript of transcripts) {
    const actor = transcript.actor || ACTOR_MODEL;
    const key = keyOf(transcript.promptVersion, actor);
    const row = byVersion.get(key) || { prompt: transcript.promptVersion, actor, train: [], heldout: [] };
    row[transcript.split === 'heldout' ? 'heldout' : 'train'].push(transcript);
    byVersion.set(key, row);
  }
  rows = rows.filter((existing) => !byVersion.has(keyOf(existing.prompt, existing.actor)));
  for (const row of byVersion.values()) {
    const entry = {
      at: new Date().toISOString(),
      prompt: row.prompt,
      actor: row.actor,
      sessions: row.train.length + row.heldout.length,
      trainMean: mean(row.train.filter((item) => item.judge?.mean).map((item) => item.judge.mean)),
      heldoutMean: mean(row.heldout.filter((item) => item.judge?.mean).map((item) => item.judge.mean)),
      pass: [...row.train, ...row.heldout].filter((item) => item.passed).length,
      hardFailures: [...row.train, ...row.heldout].reduce((sum, item) => sum + item.failures.length, 0),
    };
    rows.push(entry);
  }
  // Keep exactly one row per prompt+actor: the newest measurement is the only
  // one that is meaningful, and old runs must not leave duplicate rows behind.
  const newest = new Map();
  for (const row of rows) {
    const key = keyOf(row.prompt, row.actor);
    const seen = newest.get(key);
    if (!seen || String(row.at) > String(seen.at)) newest.set(key, row);
  }
  rows = [...newest.values()].sort((a, b) => String(a.prompt).localeCompare(String(b.prompt)) || String(a.actor).localeCompare(String(b.actor)));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(rows.slice(-40), null, 2));
  return rows.slice(-40);
}

export function regressionsVs(transcripts) {
  const baseline = loadBaseline();
  if (!baseline) return [];
  // Baseline rows are keyed by session id. Reading `item.id` here silently
  // matched nothing, so a real regression could never fail the weekly run.
  return transcripts.filter((item) => {
    const before = baseline.sessions?.[item.sessionId];
    return before && before.passed && !item.passed;
  });
}

export function renderReport({ transcripts, provider, stamp, sessions, env }) {
  const all = transcripts;
  const turnLatencies = all.flatMap((item) => item.turns.filter((turn) => turn.ok).map((turn) => turn.latencyMs)).sort((a, b) => a - b);
  const failedTurns = all.flatMap((item) => item.turns.filter((turn) => !turn.ok));
  const totalTurns = all.reduce((sum, item) => sum + item.turns.length, 0);
  const judgeRows = all.filter((item) => item.judge?.mean);
  const train = all.filter((item) => item.split === 'train');
  const heldout = all.filter((item) => item.split === 'heldout');
  const trainMean = mean(train.filter((item) => item.judge?.mean).map((item) => item.judge.mean));
  const heldoutMean = mean(heldout.filter((item) => item.judge?.mean).map((item) => item.judge.mean));
  const hardTotal = all.flatMap((item) => item.checks).length;
  const hardFailed = all.flatMap((item) => item.failures).length;
  const completed = all.filter((item) => item.objectivesTotal && item.objectivesDone.length === item.objectivesTotal).length;
  const cooperative = all.filter((item) => ['copies_hint', 'strong_learner'].includes(item.profile));
  const cooperativeDone = cooperative.filter((item) => item.objectivesDone.length === item.objectivesTotal).length;
  const ruleRows = checksByRule(all.flatMap((item) => item.checks));
  const worst = [...all]
    .sort((a, b) => b.failures.length - a.failures.length || (a.judge?.mean || 0) - (b.judge?.mean || 0))
    .slice(0, 20);
  const flagged = all.filter((item) => !item.passed);
  const passing = all.filter((item) => item.passed);
  const randomFive = passing.filter((_, index) => index % Math.max(1, Math.ceil(passing.length / 5)) === 0).slice(0, 5);
  const versions = updateVersions(all);
  const baseline = loadBaseline();
  const regression = regressionsVs(all);

  const lines = [
    '# Chat QA report',
    '',
    `Generated by \`npm run qa:chat\` on ${new Date().toISOString().slice(0, 10)} (run \`${stamp}\`).`,
    'Do not edit by hand: the next run replaces this file.',
    '',
    '## What ran',
    '',
    `- Sessions: **${all.length}/${sessions.length}** (${new Set(all.map((item) => item.unitId)).size}/10 units, levels A1–B2)`,
    `- Actor: \`${ACTOR_MODEL}\` · prompt v${all[0]?.promptVersion ?? ROLEPLAY_PROMPT_VERSION} · learner v${all[0]?.learnerVersion ?? LEARNER_PROMPT_VERSION} (${env.learnerMode})`,
    `- Judge: ${env.judgeMode === 'off' ? '**off**' : `\`${JUDGE_MODEL}\` (different family), rubric v${RUBRIC_VERSION}, pass ≥ ${JUDGE_PASS_MEAN}/5 and no correctness < 3`}`,
    `- Provider cost: **$${provider.ledger.usd.toFixed(4)}** of QA_MAX_USD $${env.maxUsd} · ${provider.ledger.calls || '—'} calls · 429 waits ${provider.ledger.retries429}`,
    `- Cost/session (list-price estimate, not an invoice): **$${(provider.ledger.usd / Math.max(1, all.length)).toFixed(4)}**`,
    '',
    '## Verdict',
    '',
    '| gate | threshold | result |',
    '| --- | --- | --- |',
    `| Hard rules | 100% | ${hardFailed === 0 ? 'PASS' : `FAIL — ${hardFailed}/${hardTotal} rule failures`} |`,
    `| Judge mean | ≥ ${JUDGE_PASS_MEAN}/5 | ${judgeRows.length ? `${mean(judgeRows.map((item) => item.judge.mean)).toFixed(2)}/5 (${judgeRows.length} judged)` : 'not judged'} |`,
    `| Correctness < 3 | none | ${judgeRows.filter((item) => item.judge.correctness < 3).length} session(s) |`,
    `| Objective completion (cooperative) | ≥ 95% | ${cooperative.length ? `${Math.round((cooperativeDone / cooperative.length) * 100)}% (${cooperativeDone}/${cooperative.length})` : 'no cooperative sessions'} |`,
    `| Graceful hostile end | 100% | ${all.filter((item) => ['injection', 'off_topic', 'silent'].includes(item.profile)).every((item) => item.failures.every((failure) => failure.rule !== 'graceful_end')) ? 'PASS' : 'FAIL'} |`,
    `| p95 turn latency | < 3000 ms | ${pct(turnLatencies, 95)} ms (p50 ${pct(turnLatencies, 50)} ms) |`,
    `| Error cards (failed turns the UI would surface) | 0 | ${failedTurns.length} |`,
    `| Failed-turn rate shown as a clear error | < 2% | ${totalTurns ? `${((failedTurns.length / totalTurns) * 100).toFixed(1)}% (${failedTurns.length}/${totalTurns} turns)` : 'no turns'} |`,
    `| Held-out within 5 points of train | yes | ${heldout.length ? `${(Math.abs(trainMean - heldoutMean)).toFixed(2)} points` : 'no held-out sessions in this run'} |`,
    '',
    '> There is no authored or offline fallback for persona replies. A failed turn is shown to the learner as a clear error (offline / busy / other), with their sentence kept in the composer — never as a made-up persona line. The target above assumes a paid or second provider: a single free provider will fail more often, and each failure is visible rather than papered over.',
    '',
    '## Per rule (deterministic)',
    '',
    '| rule | pass | fail | sample failure |',
    '| --- | --- | --- | --- |',
    ...ruleRows.map((row) => `| \`${row.rule}\` | ${row.pass} | ${row.fail} | ${row.details[0] ? row.details[0].replace(/\|/g, '\\|').slice(0, 80) : ''} |`),
    '',
    '## Per profile',
    '',
    '| profile | scenario | level | turns | objectives | checks | judge | cost |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...all.map(
      (item) =>
        `| \`${item.profile}\` | ${item.scenarioId} | ${item.level} | ${item.turns.length} | ${item.objectivesDone.length}/${item.objectivesTotal} | ${item.failures.length ? `FAIL (${item.failures.length})` : 'pass'} | ${item.judge?.mean ? `${item.judge.mean.toFixed(2)}/5` : '—'} | $${(item.costUsd || 0).toFixed(4)} |`,
    ),
    '',
    '## Prompt versions (train / held-out)',
    '',
    '| prompt | actor | sessions | train mean | held-out mean | Δ | hard failures |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...versions.map(
      (row) =>
        `| v${row.prompt} | \`${row.actor || 'unknown'}\` | ${row.sessions} | ${row.trainMean ? row.trainMean.toFixed(2) : '—'} | ${row.heldoutMean ? row.heldoutMean.toFixed(2) : '—'} | ${row.trainMean && row.heldoutMean ? (row.trainMean - row.heldoutMean).toFixed(2) : '—'} | ${row.hardFailures} |`,
    ),
    '',
    '> A row measured on a substitute model (e.g. `openai/gpt-oss-20b`) proves the harness and the',
    '> prompt rules mechanically; it is **not** production-actor evidence.',
    '',
    '## 20 worst transcripts',
    '',
    '| # | session | split | hard failures | judge | first problem |',
    '| --- | --- | --- | --- | --- | --- |',
    ...worst.map((item, index) => {
      const first = item.failures[0]?.detail || item.judge?.problems?.[0]?.issue || (item.turns.find((turn) => !turn.ok)?.reason ?? '');
      return `| ${index + 1} | \`${item.sessionId}\` | ${item.split} | ${item.failures.length} | ${item.judge?.mean ? item.judge.mean.toFixed(2) : '—'} | ${String(first).replace(/\|/g, '\\|').slice(0, 100)} |`;
    }),
    '',
    '## Owner review — 5 minutes',
    '',
    // Counts are computed from this run: a heading that says "ten" over a list
    // of four teaches the owner to distrust the report.
    `${Math.min(flagged.length, 10)} flagged transcript${flagged.length === 1 ? '' : 's'} (read the learner line, then the German and Arabic replies):`,
    ...(flagged.length ? flagged.slice(0, 10).map((item) => `- \`${item.sessionId}\` — failures: ${item.failures.map((failure) => failure.rule).join(', ') || 'judge'} · \`${pathFor(item, stamp)}\``) : ['- None flagged; read five random passing transcripts below instead.']),
    '',
    `${randomFive.length || 'No'} random passing transcript${randomFive.length === 1 ? '' : 's'}:`,
    ...randomFive.map((item) => `- \`${item.sessionId}\` — judge ${item.judge?.mean ? item.judge.mean.toFixed(2) : '—'}/5 · \`${pathFor(item, stamp)}\``),
    '',
    '## Not machine-testable (3-line manual checklist)',
    '',
    '- Open the chat on a real phone, tap the microphone, say «Ich möchte einen Kaffee» and confirm the transcript appears before sending.',
    '- Tap the speaker on one reply and confirm German audio plays and can be stopped.',
    '- Sign in with a real Google account on a phone and confirm the practice chat opens after sign-in.',
    '',
    'Speech recognition, TTS and Google sign-in are browser/OS services; no Playwright run can prove them.',
    '',
    '## Regressions vs baseline',
    '',
    regression.length ? regression.map((item) => `- \`${item.sessionId}\` passed before, fails now`).join('\n') : '- None (baseline: ' + (baseline ? 'present' : 'not created yet') + ').',
    '',
  ];
  if (failedTurns.length) {
    lines.push('## Failed turns (provider/parse)', '', ...failedTurns.map((turn) => `- \`${turn.learnerText.slice(0, 60)}\` — ${String(turn.reason).slice(0, 200)}`).slice(0, 20), '');
  }
  if (all.length < sessions.length) {
    lines.push(`> Partial run: ${all.length} of ${sessions.length} sessions. Resume with \`npm run qa:chat -- --resume ${stamp}\`.`, '');
  }
  return lines.join('\n');
}

function pathFor(item, stamp) {
  return `.tmp/qa/runs/${stamp}/session-${item.sessionId}.json`;
}
