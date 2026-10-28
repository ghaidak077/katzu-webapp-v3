# Project brief archive - stage history

Moved verbatim out of `docs/agent/PROJECT-BRIEF.md` on 2026-10-28 when the brief reached its 80 KB budget. Append-only: grep it, never read it whole. Current state lives in the brief itself.

`git log -15 --oneline`, grouped:

- **Release-candidate stage**: `a74014a` RC-6 aborted deploy · `9539923` RC-5 1.1.0 + runbook · `2254dc3` RC-4 ledger · `c3ee78d` RC-4 kill switch/retention/`/health` · `8626f34`+`5b6d20a` RC-3 content · `8a5f4e1`+`c1ceeec` RC-2 first run · `4279759`+`7ff4bce` RC-0 adopt v5 manual.
- **Environment/docs**: `570f08a` pin LF on checkout · `5153157` e2e suite self-contained.
- **Product**: `c208f01` paywall price from the worker · `74bbddd` CI gates · `ea90517` Arabic safety disclaimers.

- **V7 stage**: `1b07f82` manual v7 + deploy runbook · `e82221f` block SW in e2e; built bundle 37/37 · `6bfe4fd` deploy snapshot + the merge that carried all 22 hardening/V7 commits to `main` · `48582ea` ledger + brief after the deploy.
- **V8 stage**: `8313808` fix the `journey.spec.ts:320` flake at its cause · `36802ae` the V8 ledger (real-D1 results and the `main` hash correction).
- **V9 stage**: `4d4e40e` every ledger route creates the tables it touches (V8-F0 + the admin throttle) · `ed038f4`/`6e7d7c0` ledger + the round-1 merge and worker deploy (`6aedfd50-…`) · `5f51093` §3 content-load amendment + runbook · `b11e66e` kill-switch config + retention cron · `eff72ae` content-load block + Lighthouse baseline · `09fb166` owner-steps runbook.
- **V9 round-2 deploy**: `main` fast-forwarded `6e7d7c0 → b11e66e` (no force); the live worker is now `255dbeef-…` and prints `schedule: 17 4 * * *`.
- **V10–V14 stage** (all on `launch-hardening`, unpushed unless noted): `ecbcb41`/`6c05947` the content-load amendment removed then re-added in the env-secret form · `7301686` module1 through the Content Gate · `e487654` lazy trust pages (**the last Pages deploy: `2c245106-…` serving `index-CWWIxWb7.js`**) · `5c3cf9f` V10 ledger/brief · `b84f3ec` V11 — backup taken, credential malformed, nothing written · `f73b291` V12 — the load ran, hit the production schema gap, rolled back its own 89 rows · `050499b` V13 — the loader can no longer half-write, and the content schema is documented plus self-healing · **`V14:` — the content load itself (module2 + module1), the grammar supplement, the reachability gate**.
- **V16 stage** (`fa3a0d2`): the loader learns the supplement shape · module1's three duplicated keys removed and its housing pool refilled · the hero converted to a 20 KB WebP with measured medians · then **merge + Pages** — `main` fast-forwarded `3f3c98b → fa3a0d2` (no force), Pages production `bbef47aa-…`, the worker deliberately untouched because no worker file changed.
- **V15 stage** (`5433566`): the fixture title aligned to D1 · grammar supplements accepted by the gate · `scripts/check-content-drift.mjs` added and run against production · then **merge + worker + Pages** — `main` fast-forwarded `5c3cf9f → 5433566` (no force), worker `03007d6e-…`, Pages production `35762f02-…` serving `assets/index-DCIM0lrE.js`.
- **V14 state:** the two loads and every check above ran with **no deploy** — at the time `main` was `e487654`, the Pages deployment `2c245106-…` and the live worker `255dbeef-…`. D1 changed (that is the point of the run); nothing else did.

`main` reached `b11e66e` at the round-2 merge with `git rev-list --left-right --count main...launch-hardening` → `0 0`, and the branch was pushed both times. The live worker is `255dbeef-faae-476a-b3f5-6d4666099b70`. The V7 deploy was also a fast-forward: `22fe6aa → 6bfe4fd`.
