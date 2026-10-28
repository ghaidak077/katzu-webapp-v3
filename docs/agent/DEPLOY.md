# Deploy runbook (agent-executable; every step needs evidence in the ledger)

## Preconditions (all must hold, else STOP, report, no partial deploy)
1. The owner asked for a deploy — `deploy` in plain words is enough, as is `DEPLOY-AUTHORIZED` with or without targets (v7 §3). If they named targets, touch only those; if they did not, name the ones you will touch in the report **before** step 1 of the sequence, and stop if the change needs one they would not expect (a worker deploy for a frontend-only change).
2. `npm run verify -- --ci --e2e` green on the branch — **the gate, not a list**. It is the same command CI runs (`--ci`; the browser suite with service workers blocked is the `--e2e` profile, run against `vite preview`). The step list lives in `scripts/verify.mjs` and is printed by the run itself; a copy of it here would be a fourth list to keep in step. Quote the run's `VERIFY OK` line in the ledger, and `npm run cost:report` shows whether the gate itself is getting slower.
3. Tree clean, branch pushed, `git log main..HEAD` reviewed for stray probe files or secrets (`git grep -nEi "secret|token|api_key"` on the diff).
4. `npx wrangler whoami` shows the expected account (OAuth login is acceptable; env tokens not required).
5. Migrations: only additive SQL, listed in the ledger. Anything destructive → STOP (owner-only).

## Snapshot (before touching anything, read-only)
Record in ledger: current worker version id (`wrangler deployments list`), current Pages deployment id, `/health` and `/crypto/health` bodies. These are the rollback targets. If rollback cannot be confirmed available, record `UNPROVEN` and tell the owner in the report.

## Sequence
1. `merge`: fast-forward or merge commit of the branch into `main`, push (no force). Pages builds from git on push: do NOT run a manual Pages deploy; wait for that build and verify it.
2. `worker`: `npm run deploy:worker`. Verify with `curl -m 10`: `/health` returns its four status
   keys **plus `storage:{d1:"ok",kv:"ok"}`** (shipped by `9c07b44`, 2026-10-16 — health booleans only;
   still **no aiPool, models, strategy** — those leak provider config); `/crypto/health` unchanged (`ready:false` is fine in closed beta); an admin route without auth returns 401/403.
   The `/auth/session` limit (20/min + 600/day per IP, scope `auth-session`) is a **shared budget behind
   a NAT**; if a cohort reports `429`, raise the numbers in `cloudflare-unified-worker.js` and keep
   `tests/workerSecurity.test.ts` green rather than removing the check.
3. `pages`: verify the production URL returns 200, the built bundle loads the demo with no AI call and no account, and the service worker registers. Three Pages projects build from git and must **not** be uploaded by hand: app `katzu-webapp-v3` → `katzuai.com`, site `katzu-landing` → `website.katzuai.com` (three pages: `/`, `/pricing`, `/help`; Cloudflare serves `pricing.html` at `/pricing`), sales `katzu-sales` → `sales/`, which is now redirect-only (`_redirects` → `/pricing#pay`). After the site build, check `/`, `/pricing`, `/help` return 200 and one old URL (e.g. `/trust/privacy`) answers a single 301 to its final anchor.
4. Smoke: run the demo e2e spec against the production URL (read-only, no login).

## Rollback (automatic, no asking)
Any verify step fails → `npx wrangler rollback <recorded version id>` for the worker (redeploy the recorded Pages deployment if Pages was the failing part), re-run the `/health` check, record both in the ledger, mark `blocked`, stop.

## After
Ledger: deployed version ids, verification outputs, rollback refs. Add a `DEPLOYED:` line to ADVISOR SYNC. Do not touch owner-only items.
The gate must have been green **in that same working tree**: a green run from an earlier tree is not evidence for this one, and the deploy is the one place where the difference is unrecoverable.
