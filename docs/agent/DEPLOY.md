# Deploy runbook (agent-executable; every step needs evidence in the ledger)

## Preconditions (all must hold, else STOP, report, no partial deploy)
1. Prompt contains `DEPLOY-AUTHORIZED` covering each target you touch.
2. Full T2 green on the branch: tsc, `npm test`, `npm run build`, `node --check` worker, audit, and ALL Playwright specs against `vite preview` with service workers blocked (37/37).
3. Tree clean, branch pushed, `git log main..HEAD` reviewed for stray probe files or secrets (`git grep -nEi "secret|token|api_key"` on the diff).
4. `npx wrangler whoami` shows the expected account (OAuth login is acceptable; env tokens not required).
5. Migrations: only additive SQL, listed in the ledger. Anything destructive → STOP (owner-only).

## Snapshot (before touching anything, read-only)
Record in ledger: current worker version id (`wrangler deployments list`), current Pages deployment id, `/health` and `/crypto/health` bodies. These are the rollback targets. If rollback cannot be confirmed available, record `UNPROVEN` and tell the owner in the report.

## Sequence
1. `merge`: fast-forward or merge commit of the branch into `main`, push (no force). Pages builds from git on push: do NOT run a manual Pages deploy; wait for that build and verify it.
2. `worker`: `npm run deploy:worker`. Verify with `curl -m 10`: `/health` returns only status/service/ready/maintenance (no aiPool, models, strategy); `/crypto/health` unchanged (`ready:false` is fine in closed beta); an admin route without auth returns 401/403.
3. `pages`: verify the production URL returns 200, the built bundle loads the demo with no AI call and no account, and the service worker registers.
4. Smoke: run the demo e2e spec against the production URL (read-only, no login).

## Rollback (automatic, no asking)
Any verify step fails → `npx wrangler rollback <recorded version id>` for the worker (redeploy the recorded Pages deployment if Pages was the failing part), re-run the `/health` check, record both in the ledger, mark `blocked`, stop.

## After
Ledger: deployed version ids, verification outputs, rollback refs. Add a `DEPLOYED:` line to ADVISOR SYNC. Do not touch owner-only items.
