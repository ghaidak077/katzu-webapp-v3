#!/usr/bin/env node
/**
 * Do learners actually finish the objectives a scene sets? — measured, per objective.
 *
 * WHY THIS EXISTS
 * The header counts `N من 4`, and one objective closes by saying goodbye, which a learner can do at
 * turn two. So "the scene was completed" and "the conversation was useful" are different claims, and
 * only the second one is worth reporting. Turn-level marks are already in every QA transcript
 * (`objectivesDone`, `objectivesTotal`); nothing was reading them, so a scene could pass every check
 * while its middle objectives never once completed.
 *
 *   npm run qa:objectives                     # every checkpoint under .tmp/qa/runs
 *   npm run qa:objectives -- --dir <path>     # one run directory
 *   npm run qa:objectives -- --json
 *
 * Counted per prompt version, on purpose: v10 renamed the closing objective (`say_goodbye` →
 * `end_politely`), so adding a v8 transcript to a v10 row would invent a 0 for a mark that was never
 * asked for. Old checkpoints stay visible under their own version instead of flattering or damning
 * the current prompt.
 *
 * This reads QA checkpoints only. Learner completion in production needs a server-side field that
 * does not exist yet (`docs/AGENT-STATE.md`, UNPROVEN) — a client-side number would be a guess.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { objectivesOf, planForScenario } from '../../cloudflare-roleplay-plans.js';
import { ROLEPLAY_PROMPT_VERSION } from '../../cloudflare-roleplay.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every `session-*.json` under a directory, following run subdirectories. */
export const sessionsIn = (dir) => {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sessionsIn(full));
    else if (/^session-.+\.json$/.test(entry.name)) out.push(full);
  }
  return out.sort();
};

const versionOf = (session) => String(session.promptVersion ?? 'unknown');

/**
 * One row per (prompt version, scenario, objective): how many sessions of that version finished it,
 * out of how many ran. A session that stopped early counts in the denominator — a quota wall must
 * not flatter the number.
 */
export const summarise = (sessions) => {
  const byVersion = new Map();
  for (const session of sessions) {
    const version = versionOf(session);
    const bucket = byVersion.get(version) ?? { sessions: 0, objectivesDone: 0, objectivesTotal: 0, marks: new Map() };
    const done = Array.isArray(session.objectivesDone) ? session.objectivesDone : [];
    const total = Number(session.objectivesTotal) || 0;
    bucket.sessions += 1;
    bucket.objectivesDone += done.length;
    bucket.objectivesTotal += total;
    for (const id of done) {
      const key = `${session.scenarioId ?? session.sessionId ?? '?'} :: ${id}`;
      bucket.marks.set(key, (bucket.marks.get(key) ?? 0) + 1);
    }
    byVersion.set(version, bucket);
  }

  // Seed the objectives the *current* plan asks for, so one nobody reaches shows as 0/N rather than
  // disappearing — that is the row a reader is looking for. Only for the version this build runs.
  const current = byVersion.get(String(ROLEPLAY_PROMPT_VERSION));
  if (current) {
    for (const session of sessions.filter((item) => versionOf(item) === String(ROLEPLAY_PROMPT_VERSION))) {
      const scenario = session.scenarioId;
      if (!scenario) continue;
      for (const objective of objectivesOf(planForScenario(scenario))) {
        const key = `${scenario} :: ${objective.id ?? objective}`;
        if (!current.marks.has(key)) current.marks.set(key, 0);
      }
    }
  }

  const versions = [...byVersion.entries()]
    .map(([version, bucket]) => ({
      version,
      sessions: bucket.sessions,
      meanShare: bucket.objectivesTotal ? Number((bucket.objectivesDone / bucket.objectivesTotal).toFixed(3)) : 0,
      current: version === String(ROLEPLAY_PROMPT_VERSION),
      rows: [...bucket.marks.entries()]
        .map(([key, count]) => {
          const [scenario, objective] = key.split(' :: ');
          return { scenario, objective, sessions: count };
        })
        .sort((a, b) => a.scenario.localeCompare(b.scenario) || b.sessions - a.sessions),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || a.version.localeCompare(b.version));

  return { checkpoints: sessions.length, currentPromptVersion: ROLEPLAY_PROMPT_VERSION, versions };
};

const main = () => {
  const at = process.argv.indexOf('--dir');
  const dir = at > -1 ? process.argv[at + 1] : join(ROOT, '.tmp', 'qa', 'runs');
  const sessions = sessionsIn(dir).map((file) => JSON.parse(readFileSync(file, 'utf8')));
  const summary = summarise(sessions);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ dir, ...summary }, null, 2));
  } else if (!sessions.length) {
    console.log(`no checkpoints under ${dir} — run \`npm run qa:chat -- --weekly\` first (paid, owner-run).`);
  } else {
    for (const version of summary.versions) {
      const tag = version.current ? 'current' : 'earlier prompt';
      console.log(`\nprompt v${version.version} (${tag}) — ${version.sessions} session(s), mean objectives done ` +
        `${(version.meanShare * 100).toFixed(0)}%`);
      for (const row of version.rows) {
        console.log(`  ${String(row.sessions).padStart(3)}/${version.sessions}  ${row.scenario}  ${row.objective}`);
      }
    }
    console.log(
      '\nA current-prompt objective at 0 is a wording or ordering problem in that scene, not a learner problem.',
    );
  }
  process.exit(0);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
