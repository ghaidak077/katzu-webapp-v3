#!/usr/bin/env node
/**
 * Is the prompt the repo ships the prompt the Worker serves?
 *
 * WHY THIS EXISTS
 * v11 was written, tested, committed and pushed while production kept answering
 * with v10 — so an Arabic defect the owner had already paid to fix kept reaching
 * learners. Nothing failed; the gap was found by hand, twice. `/health` now
 * publishes `roleplay_prompt_version`, and this script compares it with the
 * module the repo would deploy. A committed-but-undeployed prompt is a red line
 * in a report, not a fact someone has to remember.
 *
 * `--plan` prints the deploy packet for the current tree: target, the version id
 * to record for rollback, and the two probes that decide success. It reads and
 * prints; it never deploys and never touches a secret (AGENTS §3).
 *
 * Exit codes: 0 match · 1 drift · 2 unreachable/unparseable.
 */

import { pathToFileURL } from 'node:url';
import { ROLEPLAY_PROMPT_VERSION } from '../cloudflare-roleplay.js';

export const DEFAULT_WORKER_URL = 'https://katzu-test.ghaidakalosh008.workers.dev';

/**
 * Compare the repo's prompt version with the deployed health payload.
 * `live` is null when the payload has no version field (a worker older than the
 * field). Returns one verdict word plus the numbers that produced it.
 */
export function promptDrift(repoVersion, live) {
  const repo = Number(repoVersion);
  // `Number(null)` is 0, which would read as "the worker serves v0" — a version
  // that never existed. Missing means missing, not zero.
  const hasValue = live !== null && live !== undefined && String(live).trim() !== '';
  const deployed = hasValue ? Number(live) : NaN;
  if (!Number.isFinite(deployed)) {
    return { verdict: 'unknown', repo, deployed: null, ok: false };
  }
  if (deployed === repo) return { verdict: 'match', repo, deployed, ok: true };
  return { verdict: deployed < repo ? 'behind' : 'ahead', repo, deployed, ok: false };
}

/** One sentence a report can quote, whatever the verdict. */
export function driftMessage({ verdict, repo, deployed }) {
  if (verdict === 'match') return `prompt v${repo} is live`;
  if (verdict === 'unknown') {
    return `the deployed worker does not publish a prompt version — it predates v${repo} (deploy needed)`;
  }
  if (verdict === 'behind') return `the repo ships prompt v${repo} but the worker serves v${deployed} — the fix is committed, not live`;
  return `the worker serves prompt v${deployed} but the repo is at v${repo} — the tree is behind production`;
}

export function deployPlan(repoVersion) {
  return [
    `target: worker katzu-test (prompt v${repoVersion})`,
    'precondition: `npm run verify -- --ci --e2e` green on the exact commit (docs/agent/DEPLOY.md)',
    'record first: `npx wrangler versions list --name katzu-test` — the newest id is the rollback target',
    'deploy: `npm run deploy:worker`',
    'probe 1: `node scripts/check-deploy-drift.mjs` — must exit 0 (prompt version matches)',
    'probe 2: `curl -s -m 10 <worker>/health` — status healthy, ready per the configured pool, storage ok',
    'rollback: `npx wrangler rollback <recorded version id>`; record both ids in the ledger',
  ].join('\n');
}

function argValue(args, name, fallback = '') {
  const hit = args.find((entry) => entry.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main(argv = process.argv.slice(2)) {
  const url = (argValue(argv, 'url', DEFAULT_WORKER_URL) || DEFAULT_WORKER_URL).replace(/\/+$/, '');
  const timeout = Math.max(1000, Number(argValue(argv, 'timeout', '10000')) || 10000);
  if (argv.includes('--plan')) {
    console.log(deployPlan(ROLEPLAY_PROMPT_VERSION));
    return 0;
  }
  let body;
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(timeout) });
    body = await res.json();
  } catch (error) {
    console.error(`unreachable: ${url}/health (${String(error?.message || error).slice(0, 120)})`);
    return 2;
  }
  const drift = promptDrift(ROLEPLAY_PROMPT_VERSION, body?.roleplay_prompt_version);
  const message = driftMessage(drift);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ url, ...drift, message }, null, 2));
  } else {
    console.log(message);
    if (!drift.ok) console.log(deployPlan(ROLEPLAY_PROMPT_VERSION));
  }
  return drift.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().then((code) => {
    process.exitCode = code;
  });
}
