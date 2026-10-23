# Katzu Agent State Ledger

## How to read this file (2026-10-15: a live board, not an archive)

**This file is current state and live work.** On 2026-10-15 it was 444 KB / ~110k tokens, 71% of it a
table of completed items nobody reads, which is why the older "read the ledger first" instruction got
skipped — along with the facts it was carrying. Completed work now lives in
`docs/agent/ARCHIVE-AGENT-STATE.md`: nothing was deleted, every word is still there, and it is found by
search rather than by reading. Sections here, in order: RESUME, CURRENT MISSION, two deploy SNAPSHOTs,
OWNER LIST, ITEMS (live rows), DECISIONS, UNPROVEN (open claims), OWNER-OPEN (open items).

- **Resume from `## RESUME` and `## CURRENT MISSION` only.** `npm run session:start` prints both, plus
  `APP-MAP` §9, `MEMORY` §A, git state, and the open owner/unproven counts, in ~90 lines. Start there.
- **Look up one item with search, not by reading:** `grep -n "<topic>" docs/AGENT-STATE.md`, and
  `grep -rn "<topic>" docs/` when the hit is not here — the archive holds the history.
- **Only live work belongs in this file.** `## ITEMS` holds `blocked`/`todo`/`doing` rows; `## UNPROVEN`
  and `## OWNER-OPEN` hold open items. A finished row, and an item marked resolved/superseded/DONE, is
  history: `npm run ledger:archive` moves it out in one command and deletes nothing.
- **A thing that needs a page gets its own document, linked.** One bullet reached 56 KB — 43% of this
  file — before it was moved on 2026-10-15: a policy, a mission log, or a walkthrough is a document,
  not a bullet. `tests/agentDocs.test.ts` caps a single bullet at 8 KB for exactly this reason.
- **The SNAPSHOT sections are production rollback records**: read the newest one before any deploy
  touch, never all of them.
- Shape and size are enforced by `tests/agentDocs.test.ts` (≤ 80 KB, no completed rows, no closed
  bullets in UNPROVEN/OWNER-OPEN, no bullet over 8 KB), so growth is a decision someone made, not drift.

## RESUME

## RESUME

- **Current tree (2026-10-19, this deploy run):** `main` **= `origin/main` = `release-candidate` = `2fa5acd`** — no
  uncommitted repo work. The launch candidate (the owner-approved 5-commit + 3-UX batch + 2 stale-contract
  e2e fixes, 64 commits total) was **merged to `main` and deployed today**; see `## CURRENT MISSION`
  (NEXT V42) and the rollback snapshot below. The two 2026-10-18 browser-suite reds are fixed at the
  contract (`7b52230`, `2fa5acd`): CI **`39191010113`** = **141 passed / 2 skipped / 0 failed** for
  `2fa5acd`. Local gate on the same tree: `npm run verify -- --ci --e2e` **14/14 in 486.8 s** (3 noisy-output
  steps relabelled FLAKY, exit 0). Working tree clean except owned strays, unstaged and never committed:
  `valibjorn-brief.md`, `valibjorn-brief.pdf`, `website/`. Nothing mid-flight.
- **Superseded tree record (2026-10-15 — read as provenance only; the batch it describes is now part of `2fa5acd`):** `main`
  as **uncommitted** — the agentic-system hardening
  batch. The gate finally has triggers: `.githooks/pre-commit` → `npm run verify -- --fast` (structural
  guards + syntax, ~8 s), `.githooks/pre-push` → the full gate with `--cost`, installed by
  `scripts/install-hooks.mjs` (`prepare` + `npm run hooks:install`, repo-local `core.hooksPath`).
  `scripts/verify.mjs` gained profiles (`--fast`/`--ci`/`--e2e`/`--cost`) and `CI_ONLY_STEPS`, and
  **`ci.yml` now runs one step — `npm run verify -- --ci` — where it had nine hand-written ones that
  syntax-checked 1 file against the gate's 47**. Cost is measured now (`scripts/verify-cost.mjs` →
  gitignored `.verify-runs.ndjson`, read back by `npm run cost:report`); wall-clock and bytes, **not**
  tokens. Every `docs/**/*.md` is budgeted (74 files: 15 named, **22 KB default cap**, only the ledger
  archive exempt — before this, 8 of 37 were covered). `DEPLOY.md` requires `npm run verify -- --ci --e2e`
  instead of spelling out T2. **Verified this session:** `git hook run pre-commit` exit 0 (9.2 s);
  `npm run verify` **6/6 in 69 s**; `npm run verify -- --ci` **13/13 in 134.8 s** (the exact set CI runs,
  so CI's command is proven green locally); `npm test` **144 files / 1,862 tests**; and the browser
  suite against the built bundle **121 tests on :3100 → 117 passed / 3 failed / 1 skipped in 12.1 min**
  (port 3000 is held by a dev server another session started, which was deliberately not killed; the run
  used a throwaway config in the OS temp dir differing from `playwright.config.ts` only in the port —
  the three failures are unclassified and are tracked in UNPROVEN below). **One real defect
  found and fixed inside the gate itself:** `spawnSync`'s 1 MB default buffer killed
  `audit-quiz-content.mjs` (1,270,067 bytes of output) with `ENOBUFS`, so a step that exited 0 was
  reported FAIL — now `MAX_OUTPUT_BYTES` (64 MB) and a named runner error (MEMORY §C 48, LESSONS
  2026-10-15). Every new guard was proven red → green and restored byte-exact (CI drift, unwired clone,
  over-budget document, failure-swallowing hook, orphan + broken script). Nothing committed, nothing
  deployed, no secret read, no production write.

- **Last sha:** `6621c53` **pushed and deployed** (journey polish, L18). CI run `37494923231` —
  **success** (`secret-scan`, `launch-check`, `verify`, `e2e` all green). The journey path/library
  screen polish (`1c82059`) + follow-up (`ce533f2`: one-line Katzu greeting back above the review
  strip, «لم تستقل فيه بعد» folded into the PRACTISING chip) + genuine before-shot recapture
  (`db9bb2e`) + pre-deploy snapshot (`6621c53`) are shipped.
- **Next (pre-V41):** the owner-only launch items still gate public launch — the 10 `{{OWNER_FILL}}`
  legal fields and `VITE_PUBLIC_APP_URL` (11 blockers under `npm run check:launch:strict`). Nothing
  else is deployable without an owner decision.
- **C5 gates on `f82ebe5`:** `npm test` **128 files / 1643 tests**, `npm run lint` 0, `npx tsc -p e2e`
  0, `npm audit --omit=dev` **0 vulnerabilities**, design-audit **within budget**, contrast **all
  pass** (tightest 4.52:1), simplicity **within budget** (29 screens), verification battery **12/12**,
  Lighthouse performance **0.87** at 360x640, play-readiness e2e **3/3**.
- **Deferred notes:** `docs/agent/DEFERRED-NOTES.md` (email OTP, web push, Play Billing, domain
  switch, Play wrapper — one paragraph each, nothing built).
- **Live now (pre-V41):** worker `315ec953-d234-481a-93c3-8c493818df5e` (the UI-polish deploy, untouched by
  the journey session — no `cloudflare-*.js`/`wrangler.toml`/`migrations/` file changed in
  `349faf0..6621c53`; rollback target `476bac16-eb7c-4cb9-8ccb-72ac35faf208`, older
  `0a653eca-2224-4114-b1fa-749bb2cb1251`), Pages production `d3165772-4adc-4118-9895-b7e53188b407`
  from `6621c53`, serving `assets/index-B0IutCpH.js` with the journey polish proven in the shipped
  lazy chunk `assets/TrailScreen-DtGnRxP-.js` (the new chip label present, 1 occurrence; rollback
  `43f5985a-5c4e-4820-9efc-0cbcbfd5163b` from `a821b18`, older `67888b41-23ea-4585-a4d2-345b8281119f`).
  The worker still carries `fe1d504` + `4d05905` and the armed `AI_DAILY_SPEND_CAP="292"`.

- **Current tree (2026-10-07, this session):** `main` at `d082e49`, with V41 (Trail journey order +
  banner card) modified + `src/lib/content/scenarioOrder.ts` untracked, **committed and undeployed**.
  **Pages is already live from this tree:** `wrangler pages deployment list` shows the current production
  deployment as `dbe443f7-e3ff-4e7f-a010-229c994d9d8c` from `d082e49` (git-triggered, 16 h old) — so
  the V41 UI is already served by Pages; the only remaining production move in this authorization is the
  **worker deploy**, which DEPLOY.md scopes to "only if worker code changed" and no worker file changed in
  `d082e49..HEAD`. **Live before this session's deploy touch:** worker `/health` status-only healthy,
  `/crypto/health` test_mode unchanged, unauth `/admin/api/users` 401, Pages `/` 200.

- **Deployed this session (owner authorized: merge, worker, pages):** `git push origin main` → `46d8de6`
  on `main` (`origin/main` now == HEAD, `0 0`); git-triggered Pages build became the new production
  deployment **`5b7eae6e-3214-4cd1-a5fe-a11a2fb4cba2`** from `46d8de6` (Active; previous production
  deployment `dbe443f7-...` from `d082e49`); worker **`daa9101f-da5a-4f4c-a798-4fd92e28d6f8`**
  (bindings unchanged: KV ×2, D1, AI, 17 env vars incl. `AI_DAILY_SPEND_CAP="292"` and
  `MAINTENANCE_MODE="off"`; cron `17 4 * * *` intact). **Live verify after deploy:** worker
  `/health` `{"status":"healthy","service":"Katzu Unified Worker","ready":true,"maintenance":false}`
  (shape unchanged), `/crypto/health` unchanged (`test_mode`, `ready:false`, no NOWPayments config),
  unauth `/admin/api/users` → **401**, Pages `/` → **200**. **Live render (this session, this thread): the
  production Trail path was opened in a fresh browser and rendered the V41 journey-ordered cards with
  banners as intended.** `valibjorn-brief.md` + `valibjorn-brief.pdf` left untracked (external read, not
  part of this deploy). **CI:** run **`37601819662`** for pushed sha `46d8de6` — **success** (9 m 27 s).
  No production D1 write, no secret read, no owner-only item touched.

## CURRENT MISSION

NEXT (V43.4): **The key-in-hand admin run is a repo command, and the gate now names what failed — `merge` + `worker` (2026-10-22).** `npm run verify:admin:local` is the V43.3 ad-hoc run made repeatable: it strips any inherited `ADMIN_SECRET`/`HMAC_SECRET`, boots the real worker under `wrangler dev` with a throwaway key on a fresh `--persist-to` dir, applies `migrations/0001`, creates the registry through the real route, seeds 3 users + activity + an error, sweeps 13 endpoints, then drives the served page in Chromium through all eight tabs, the drawer, plan extend, code generation, the codes report and the provider form — 37 checks, failing on any console error or a page that never reaches its last line (`--no-browser` ≈25 s, `--keep` leaves it up). **Two things its first version got wrong, fixed here:** it seeded while `wrangler dev` was live, which reloads the worker mid-run (`TypeError: fetch failed` after eight good requests, twice) and makes a second `d1 execute` compete for the same SQLite file — on Windows that can hang rather than fail — so the run now stops the worker, seeds, and boots again, and its own registry-bootstrap check still runs on the *first* boot. **Its first full run found a fourth defect:** `/admin/edit`'s `add_months` counted from the KV record alone and fell back to *today* when that record was absent while the registry column still held the plan — the drawer said "Expires 2026-11-11", the owner clicked "+1 month", and got 2026-11-22. `planExtensionBase()` extends the date the drawer shows; a lapsed plan still counts from today. Two unit tests + the harness's exact-month assertion. **The gate also stopped hiding reds:** a non-zero step with noisy output printed only "may pass on re-run", so two green-but-red runs each cost a 156 s re-run to learn one IndexedDB test had timed out; `failureEvidence()` now prints the failing test/assertion, and it immediately identified a concurrent agent's orphaned `e2e/shots/*.tmp.spec.ts` as the true cause of the *other* red. The timeout was load, not logic — `dbUpgrade` opens a real v5 IndexedDB in 1.5–2 s alone while `secretScan` walks git history for up to 100 s in the same runner — so it has an explicit 30 s budget with its assertions untouched. **Gates, on a clean worktree of `4b33d70` (node_modules junctioned, i.e. exactly what CI checks out):** `verify -- --ci` **13/13** (unit **155 files / 2,052 tests**, build, content audits, dependency audit) and the browser suite **145 passed / 3 skipped / 0 failed in 6.5 min**. The gate's own browser step could not run as configured: **`metatester64.exe` (MetaTrader 5) owns 127.0.0.1:3000**, so `--strictPort` cannot bind and `webServer` times out after 120 s with zero tests run; the suite ran against the same bundle on **:3400** via a throwaway config differing only in the port (**3101–3200 is an OS-excluded range** — a first attempt on 3123 died with `EACCES`). **Shipped:** `4b33d70` pushed without force; worker **`e1a9a2ca-e919-43e2-baba-28a52bddd1cd`** at 100%, bindings and cron `17 4 * * *` unchanged; Pages rebuilt from git (no frontend source in the diff). **Live, read-only:** `/health` and `/crypto/health` unchanged; unauth `/admin/api/{users,overview,ai-providers,content-list}` and `/admin/codes/report` **401**; `/admin` **200, 133,363 bytes, 4 inline scripts all parsing**, boot flag true, no watchdog banner, all eight tabs switch views with **zero console output**. **Hazard found while verifying it:** five unauthenticated probes trip the durable per-IP admin throttle, which gates the shell too — `/admin` then answers **429 `too_many_attempts`, `Retry-After: 140`**, indistinguishable from a broken deploy; load the page *before* the 401 sweep, or wait it out. **Rollback:** `npx wrangler rollback b2119bfb-68cb-49bb-8639-82d4583eda28`. Not verified: any production *data* path (needs `ADMIN_SECRET`, never read) — the seeded local run is its substitute.

NEXT (V43.3): **Every admin tab, clicked with a real key against a local D1 — three more defects fixed and LIVE (2026-10-22) — `merge` + `worker`.** V43.2 was verified without a key; the data paths need one, and the production `ADMIN_SECRET` is never read, so the worker was booted locally (throwaway key + HMAC secret, seeded D1) and the real page driven in a browser through all eight tabs, the user drawer, plan extend/revoke, lookup, code generation, the codes report and the provider form. **It found three defects no curl could:** (1) `ensureRegistryTables` rethrew the pre-batch `ALTER TABLE users` "no such table" error on a database that had no `users` table yet, so the `CREATE` batch below it never ran — a fresh environment answered "D1 is not bound — registry unavailable" on every tab and could not record one user; (2) `api()` only rejected on 401, so a **403 or 500 arrived looking like data** and the user drawer toasted "Plan extended" for a write the worker had refused (all 23 call sites already end in `.catch`, so it now rejects on any 4xx/5xx and says why once); (3) `listProviderConfig` rebuilt each built-in row from `PROVIDER_POOL` and dropped `config.defaultsKeys`, so saved keys read back as "0 keys · env" the moment the table reloaded while routing — which reads `resolveProviderPool` — served them: the save said "Stored keys for nvidia", the row said nothing was stored. Also: a custom entry with no keys no longer claims an env fallback it does not have. **Proven:** the registry fix against a stub whose ALTER answers "no such table" (and a real error still reports false), the provider list against the save response, and the refusal against the exact toast that used to say "Plan extended" — verified red on the restored old `api()`. **Also confirmed in a real DOM:** the codes report with two labels/totals, Clear keys on *built-in and custom* entries, `aipParseKeys` splitting on all three separators, the walk order printed with real newlines, "+1 month" moving 01-21 → 02-21, and `/admin/generate` minting 3 codes. **Gate:** `verify -- --ci --e2e` **14/14 in 792.5 s** in this tree. **Shipped:** `1ba9abd`, pushed without force; worker **`b2119bfb-68cb-49bb-8639-82d4583eda28`**, bindings and cron unchanged; Pages rebuilt from git, frontend bundle unchanged. **Live verify:** `/health` and `/crypto/health` unchanged, unauth admin routes **401**, `/admin` serves 4 scripts that all parse, and all eight tabs click through with **no console output**. **Rollback:** `npx wrangler rollback 5193b4e9-9653-46b1-9d3d-164e92d0da5a`. **Local-dev facts worth keeping:** `wrangler dev` cannot start this worker as-is (the entry exports test helpers beside the handler, so workerd rejects `DAILY_SPEND_CAP_MESSAGE` as an entry point) — a throwaway entry re-exporting the default fixes it; a fresh local D1 then needs `migrations/0001_content_tables.sql` applied by hand (the worker deliberately does not manage the content tables) plus `HMAC_SECRET`, or `/admin/generate` 500s; browser writes need `ENVIRONMENT=local ALLOW_OPEN_CORS=1`, which is what exposed the false success.

## SNAPSHOT — current production rollbacks (read before any deploy touch)

Recorded 2026-10-19, refreshed at the 2026-10-22 V43.4 worker deploy (the admin-harness fix):
these live ids are the rollback targets for the **next** deploy. Supersedes the 2026-10-06 snapshot
(now in `docs/agent/ARCHIVE-AGENT-STATE.md`), whose worker target `315ec953-…` was replaced by
`56425f30-…` (2026-10-12), then `66bd8b92-…`, then the secret-only `31149c92-…`, and then today's.

- Worker live version id (rollback target for the next deploy):
  **`e1a9a2ca-e919-43e2-baba-28a52bddd1cd`** (100%, 2026-10-22) — the V43.4 fixes (`4b33d70`).
  Still available: `b2119bfb-68cb-49bb-8639-82d4583eda28` (V43.3, `1ba9abd`),
  `5193b4e9-9653-46b1-9d3d-164e92d0da5a` (V43.2, `3358165`),
  `d07b8701-2176-45b4-9807-fa490f469e29` (the same fix at `95f21f7`),
  `31149c92-001f-4c61-8603-80b39c42662f` (live before this run; a secret-only deployment),
  `66bd8b92-8db6-452d-ad99-88685cab0956` (the V42 merge-deploy) and
  `56425f30-c67f-45ea-ace7-a9c4e9b47dd7` (2026-10-12), then the ids in the superseded snapshots below.
- Pages live production deployment id (rollback target for the next deploy):
  `8ec7ea54-ef85-4333-bcb0-bc5618adc74e`, branch `main`, commit `3358165` — a git-triggered
  build, serving `assets/index-BfNVQ58w.js` (unchanged: no frontend source was touched). Older
  rollback targets: `5f115c46-807d-43f7-9fe1-9523dd5eb57c` (source `95f21f7`),
  `8fe6d07f-fe49-49c9-8369-985a82a9a8f1` (source `8ca290c`), `5722462d-7782-40c4-91dd-de40e93851d2`
  (source `6841924`) and `8fb96479-c214-453c-9d6e-775af448e7de` (source `92280ec`), then the ids in
  the archived snapshot.
- `GET /health` body (worker, read 2026-10-19 after the deploy):
  `{"status":"healthy","service":"Katzu Unified Worker","ready":true,"maintenance":false,"storage":{"d1":"ok","kv":"ok"}}`.
  The `storage` object is shipped by `9c07b44` (2026-10-16 launch-metrics commit, verified with
  `git log -S 'storage:{d1:"ok"' -- cloudflare-unified-worker.js`) and tells a learner only that the
  data stores answer — no pool, no models, no strategy. KEEP it when editing that handler.
- `GET /crypto/health` body (worker, read 2026-10-19 after the deploy):
  `{"ok":true,"provider":"nowpayments","environment":"test_mode",...,"priceUsd":5,"months":1,"plans":[...],"ready":false}`
  — unchanged from every previous ledger reading.
- Unauthenticated `GET /admin/api/orders` → **401** at the worker origin
  (`katzu-test.ghaidakalosh008.workers.dev`) — note `katzuai.com` is the **Pages** host and answers
  SPA HTML for every path, so worker routes must never be probed there.
  `/` `/demo` `/sw.js` → **200** on `katzuai.com`, serving `assets/index-BfNVQ58w.js`.
- `origin/main` at snapshot time: `3358165` — gate `npm run verify -- --ci --e2e`
  (**14/14 in 679.7 s**) green in the `95f21f7` tree (the `3358165` delta was re-gated locally,
  **6/6 in 78.7 s**); production smoke **4 passed / 2 skipped / 0 failed**.
- **Rollback is PROVEN available** for both targets: `wrangler whoami` reports account
  `00df3d915626e0a681f4fef98c1c587c` with `workers (write)` (used for the pre-deploy snapshot),
  and `wrangler pages deployment list` lists the live production deployment and its predecessors
  (used for both snapshots this run).

## SNAPSHOT — superseded pre-UI-polish record (2026-10-06)

Moved to `docs/agent/ARCHIVE-AGENT-STATE.md` on 2026-10-19 to keep this file under its 80 KB cap.
Nothing was deleted: search the archive for `pre-UI-polish`.

## OWNER LIST (deduplicated — no secrets, no values)

0. **No throwaway account can be created for the live authenticated proof.** Sign-in is
   Google-only, so the closing check (repeated `/ai/translate` showing a cache hit, an easy A1
   turn reaching the `mid` tier, a code redemption granting its entitlement) cannot be run
   without a real Google account an agent must not touch. Either sign in once yourself and
   paste back the three responses, **or** mint a test code from your own shell with
   `POST /admin/generate` and redeem it through `/verify`. Until one of those happens these
   three remain **UNPROVEN in production**; they are covered only by route tests against the
   real handlers.

Both of these are safe to leave unset: the spend cap is unlimited when absent, and the origin
falls back to the host the app is served from.

1. ~~**Set the daily AI spend cap.**~~ **RESOLVED (L14/L17).** `wrangler.toml` now sets
   `AI_DAILY_SPEND_CAP = "292"` as a plain `[vars]` entry and the deployed worker
   (`476bac16-…`) confirms it as a live Environment Variable. The **value** stays **UNPROVEN**:
   `292` is derived from `node scripts/measure-turn-cost.mjs` ($1/day ÷ 5 active users ÷ $0.0007
   per flagship turn), and both the $1 ceiling and the price table are assumptions — confirm
   against a real invoice. Setting `"0"` still stops all AI traffic immediately, no app redeploy.

2. **Set the public app origin** so the sitemap emits absolute URLs (it currently emits
   relative paths, which the sitemap spec disallows). In the Cloudflare Pages project
   `katzu-webapp-v3` → Settings → Environment variables → Production:
   ```
   VITE_PUBLIC_APP_URL = "https://katzu-webapp-v3.pages.dev"
   ```
   Use this value until a real domain is bought; `robots.txt` and `sitemap.xml` are generated
   from it at build time, so no code change is needed.

3. **Answer the B1 mock rubric question before the mock is sold as exam preparation.**
   The mock now runs the real three-part shape with its own briefs and timings
   (five minutes a part), and reports a **practice estimate** computed from the
   learner's own sentences. Three things are the owner's call and are currently
   marked UNPROVEN in the code:
   - the **part timings** in `MOCK_EXAM_PARTS` (five minutes each) follow the common
     shape of a B1 Sprechen but have not been checked against any real exam specification;
   - the **weighting** of the estimate (`estimatePracticeScore`: independence 35%,
     accuracy 35%, coverage 15%, pacing 15%) is a judgement, not a rubric from an exam body;
   - whether the app may name the level it prepares for in marketing copy. Right now the
     notice says only that this is not the official exam, and no exam-body name appears
     anywhere in the learner-facing strings or the model prompts.
   Edit `MOCK_EXAM_PARTS` / the weights and the notice follows; nothing else has to change.

4. **Decide how a mock credit is delivered.** The entitlement is live and enforced
   (`decideMockAccess`, `/mock/start`), but no code currently *grants* a credit: the code
   format is `DE-<months>M-<nonce>.<sig>`, so a mock-only code needs either a new signed
   format (`DE-MOCK-<nonce>.<sig>`) or an owner-side balance change. Until that is chosen,
   a second mock is reachable only through an active subscription. Mint one yourself with
   `POST /admin/generate` to test the credit path end to end.

5. **Android app identity (only if a Play build is planned).** `/.well-known/assetlinks.json`
   is generated but currently an empty list `[]`, which fails Android verification on purpose.
   Two build variables fill it, and neither is a secret:

   ```bash
   # Cloudflare Pages → katzu-webapp-v3 → Settings → Environment variables → Production
   VITE_ANDROID_PACKAGE_NAME   = app.ghaidakalosh008.katzu
   VITE_ANDROID_CERT_SHA256    = AA:BB:CC:...   # keytool -list -v -keystore upload.jks | grep SHA256
   ```

   Until both are set, the file stays `[]`; that is the honest state, not a bug. The
   fingerprint must be the one Play signs with (the **upload** key, not the Play App Signing
   key, if App Signing is on). Confirm with
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://katzu-webapp-v3.pages.dev`.

6. **Replace the Data Safety draft with the real answers.** `src/lib/trust/dataSafety.ts`
   holds the answers this repo can derive (from the analytics allowlist and `package.json`);
   the ones that are operational rather than code are marked UNCONFIRMED in that file's
   `unconfirmed` array — retention periods in particular. Submit at Play Console → App content
   → Data safety. Nothing there may be asserted from memory; `npm test` re-derives the derivable
   half and fails if the code moves under an answer.

7. **Confirm the activation timing claim.** `activationDelayMs` now logs the real
   transfer-start → code-activated gap on every crypto delivery, but the copy in
   `src/lib/offers/paymentInstructions.ts` is an estimate and is marked UNPROVEN. After a
   handful of real orders, replace both ranges with what was measured. Crypto is in test mode,
   so today it logs nothing.

## Current mission overlay — 2026-10-04

Autonomous excellence execution is tracked in [EXCELLENCE-STATUS](agent/EXCELLENCE-STATUS.md).
That status supersedes historical NEXT/branch/readiness assertions below. **Current batch:
V40-1 (Live Conversation redesign) and V40-2 (the two accessibility defects that redesign
measured and left open) are both committed, pushed, merged to `main` and deployed; V40-2's
Pages deployment is `265d306f-…` from `fbd40bb`, with CI green. See both rows.** Historical
rows remain provenance.

Status for the ledger defined in `AGENTS.md` §8. Rules live in `AGENTS.md`; this file records status and evidence only.

## ITEMS

> **Completed history is not here.** Finished items and the old run-log live in
> `docs/agent/ARCHIVE-AGENT-STATE.md` — nothing was deleted, and it is not read at session start.
> Search it, never load it: `grep -n "<topic>" docs/agent/ARCHIVE-AGENT-STATE.md`.
> Only rows that are still live (`blocked`, `todo`, `doing`) belong in the table below. When it grows
> past the 140 KB cap, `npm run ledger:archive` moves the finished rows out — one command, nothing
> deleted.

| ID | Status | Evidence / blocker |
|---|---|---|
| RC-6. Gated production deploy (owner prompt) | blocked | **Aborted at the preconditions; nothing was deployed, no D1 statement was run, the sales site was untouched.** Gate 0.1 **FAIL** — the tree is clean but on branch `launch-hardening`, and `main` and `origin/main` are both still at `22fe6aa`, so none of P1–P7 or RC-0…RC-5 is on main. Gate 0.2 **PARTIAL** — `npm ci --dry-run` (substitution, see DECISIONS) resolved the tree; `npm run lint` clean; `npm test` **67 files / 799 tests passing**; `npm run build` exit 0; `node --check cloudflare-unified-worker.js` clean; `npm audit --omit=dev --audit-level=high` found **0 vulnerabilities**; secret-pattern grep clean. Playwright **against `vite preview`** did not pass: **26 passed / 11 failed**, and the failure is classified (see UNPROVEN) as the harness, not the product — the built app registers a service worker and the config never sets `serviceWorkers: 'block'`, so Workbox mediates requests that `page.route` mocks cannot reach. The same suite is **37/37 against the dev server**. Gate 0.3 **FAIL** — `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are both **unset**, which is the prompt's own STOP condition ("deploy blocked: no credentials"). Wrangler *is* authenticated locally via an OAuth token tied to the owner's account, so the block is the environment contract, not a broken CLI. Steps 2–5 (D1 migrations, worker deploy, Pages deploy, post-deploy verification) **SKIPPED**. Read-only snapshot recorded anyway: live worker `katzu-test` at `https://katzu-test.ghaidakalosh008.workers.dev`, current version `951f7d4f-f65f-432f-9a42-5a20f1689599` (100%, created 2026-09-27T11:53:00Z); Pages production deployment `26702124-99d7-4fc4-af42-958c02134762` (branch main, commit `22fe6aa`) with `3b148b21-2131-4fa5-8255-942746c2f33e` and `7caaa31a-e6d2-4cc1-b8b7-22e6bb51a39d` as older production rollback targets; `/crypto/health` → `{ok:true, environment:"test_mode", baseUrlHost:"api-sandbox.nowpayments.io", apiKeyConfigured:false, ipnSecretConfigured:false, priceUsd:5, months:1, ready:false}`. **Live `/health` proves production is still the pre-hardening code:** it returns `aiPool:{entries:9, tiers:[…], active:[…gemini/groq model names…]}`, `cachedTranslationsCount`, `primaryWorkingModel` and `strategy` — exactly the pool disclosure RC-4 removed in the working tree, so that exposure is live on the public internet right now. |
| RC-1. Performance (Stage 1) | blocked | **Not run.** Lighthouse is not installed in this environment and adding it as a devDependency (plus a browser download and a `vite preview` server) was out of the remaining budget, so there are **no** before/after numbers and none are claimed anywhere. The prompt's own priority order puts Stage 1 after Stage 3, and Stage 3 consumed the remaining time. Unblocking: `npm i -D lighthouse`, `npm run build && npx vite preview --port 4173`, then `npx lighthouse http://localhost:4173/ --preset=desktop --only-categories=performance,accessibility,best-practices,seo` for `/`, `/demo` and the Trail. The B4 performance record (bounded JourneyHome projection, local scene art, woff2 subsetting, renderer tier, screen split, 478 dead lines removed) remains valid on its own evidence. |
| V9-9. Content load (Phase 4) | blocked | The prompt carries `CONTENT-LOAD-AUTHORIZED: curriculum-30day-module1.json, curriculum-arrival-module2.json`. **Nothing was written to production D1 and no export was taken.** Two independent stops, both verified read-only. **(a) module1 fails the runbook's precondition 2:** `review.status` is `"pending"`, not `"approved"`, and `docs/content/review-<module1>.md` does not exist (`docs/content/` holds only `review-arrival-module2.md`). Its own dry-run says it: "review.status is \"pending\" — a real load would be refused until it is approved", and `scripts/load-curriculum.mjs:131` hard-fails on exactly that. **(b) Neither file is loadable by an agent at all:** the loader needs `process.env.ADMIN_SECRET` (`:57`) and exits when it is unset, verified by running both `--commit` commands — each printed "ADMIN_SECRET is not set. Add it to the environment…" and exited **2** with no network call. §3 forbids an agent requesting, setting or using any secret, `ADMIN_SECRET` included, and the new paragraph's own "Never allowed" list names secrets. **Verified read-only instead:** `audit-curriculum.mjs` PASSED for both files; `load-curriculum.mjs --dry-run` PASSED for both (module2's review line: `approved by AI self-review — GLM 5.3 Flash, no human review`); and the **collision check on production D1 is CLEAN for both** — live scenarios are `apartment_viewing, cafe_order, doctor_visit, embassy_appointment, job_interview` and live grammar `akkusativ_articles, dativ_prepositions, konjunktiv_ii, perfekt_tense`, so **none** of module1's 5 scenario / 10 grammar ids or module2's 5 scenario / 4 grammar ids exist live. Live counts re-read as **5 scenarios / 114 vocabulary / 20 starter_phrases / 4 grammar**, unchanged from V8. Vocabulary and starter_phrases carry no `id` and the loader keys them by `level\|german\|topic` and `scenario_id\|german`, skipping rows already present, so they cannot be overwritten; only `scenarios` and `grammar` are upserted by id, and both were checked. Owner commands in OWNER-OPEN. |
| V10-6. Content load (Phase D.2) | blocked | Owner line `CONTENT-LOAD-AUTHORIZED: curriculum-arrival-module2.json, curriculum-30day-module1.json (module1 only if approved by the Content Gate in this run)`. **Nothing was loaded; no D1 export was taken; no production write occurred, not even a test one.** The runbook's precondition 4 fails on this machine: the sanctioned check `[ -n "$ADMIN_SECRET" ] && echo set` prints **NOT SET**, and `docs/agent/CONTENT-LOAD.md` says an unmet precondition → STOP, no partial load. The agent did not read, store, print or pass the value, and must not (§3). **The secret was published in a chat prompt earlier in this session, so it must be treated as compromised and rotated before any load.** Everything else the runbook requires is true and was verified read-only this run: both files `review.status="approved"` with review files; both audits PASSED; both dry-runs PASSED (module2 → 5/49/42/4; module1 → 5/74/49/10); production collision checks **clean for both modules** (module1: 15 ids, zero rows; module2: 9 ids, zero rows); live counts re-read **5 / 114 / 20 / 4**, unchanged. Owner commands, expected post-load counts and the rollback id list are in `docs/agent/CONTENT-LOAD.md`. |
| V11-2. Load module2 → refused with 401; value shape diagnosed; stopped (Phase 4) | blocked | `node scripts/load-curriculum.mjs --file=docs/content/curriculum-arrival-module2.json --commit > /tmp/v11-load-module2.log 2>&1`: the draft validated locally (5 scenarios / 49 vocabulary / 42 phrases / 4 grammar, review approved), then **the first authenticated read failed — `✘ could not list vocabulary (HTTP 401): {"error":"unauthorized"}`** at `scripts/load-curriculum.mjs:70`. The log carries **zero** `Bearer`/`Authorization` occurrences (the credential was never echoed), the log never reaches a write phase (`Writing …` / `to write` are absent), and **nothing was written to production D1**. **Root cause, established structurally without ever printing the value:** the environment variable is **66 characters** of which exactly **64 are lowercase hex** — chars 2–65 match `^[0-9a-f]{64}$` — with first char `U+003C` (`<`) and last `U+003E` (`>`); i.e. the placeholder form `<secret>` was pasted *with its angle brackets*, so the loader sent `Authorization: Bearer <hex>`. **Nothing was re-encoded, trimmed or re-derived:** §3 reserves secret handling to the owner, so this is an owner-side fix. **Post-attempt state re-verified unchanged:** counts still **5 / 114 / 20 / 4**, the new scenario ids still absent, and `/scenarios`, `/vocabulary`, `/grammar` all **200**. The backup from V11-1 is still valid and still unused; no rollback was needed because no write was attempted. |
| V12-2. Load module2 → grammar batch `HTTP 500` on a live schema gap; 89 inserted rows rolled back; stopped (Phase 4) | blocked | `node scripts/load-curriculum.mjs --file=docs/content/curriculum-arrival-module2.json --commit > /tmp/v12-load-module2.log 2>&1` → **exit 0**, 29 log lines, **`grep -c -E 'Bearer\|Authorization'` = 0** (run before anything was shown; the credential never reached the log). **Three of the four batches wrote, the fourth could not:** `scenarios ✔ HTTP 200 count 5`, `vocabulary ✔ 200 count 42` (7 of 49 rows skipped as already present), `starter_phrases ✔ 200 count 42`, and **`✘ grammar batch 1 failed (HTTP 500): {"error":"admin_route_failed","message":"D1_ERROR: table grammar has no column named rule_de: SQLITE_ERROR"}`** — **0 grammar rows written**. The loader then printed `DONE — 89 row(s) written.` and **exited 0**, because its verification loop covers scenarios and vocabulary topics only and never consults the per-batch statuses, so a failed batch is invisible in its exit code (recorded in `LESSONS.md`). **Rollback, exact, driven by the backup rather than by arithmetic on counts:** the pre-load export contains the two tables' `sqlite_sequence` rows (`vocabulary = 135`, `starter_phrases = 20`) and both are `INTEGER PRIMARY KEY AUTOINCREMENT`, so the new rows are provably `vocabulary id > 135` (42 rows, 136–177) and `starter_phrases id > 20` (42 rows, 21–62) — an id above the pre-load sequence cannot be a pre-existing row. `DELETE FROM starter_phrases WHERE id > 20; DELETE FROM vocabulary WHERE id > 135; DELETE FROM scenarios WHERE id IN ('airport_arrival','train_station','bakery_shopping','landlord_followup','friend_catchup');` → `changes` **42 / 42 / 5 = 89**, exactly the 89 the loader reported. **Both states measured:** post-attempt **10 scenarios / 156 vocabulary / 62 starter_phrases / 4 grammar**; post-rollback **5 / 114 / 20 / 4** with `MAX(vocabulary.id) = 135`, `MAX(starter_phrases.id) = 20`, 0 rows for the 5 new scenario ids and 0 `g_%` grammar ids; live scenario ids back to `apartment_viewing, cafe_order, doctor_visit, embassy_appointment, job_interview` and live grammar to `akkusativ_articles, dativ_prepositions, konjunktiv_ii, perfekt_tense`. **Three sampled old rows match the backup exactly:** vocabulary 22 `Reisepass`/`documents`/`جواز سفر`, 77 `Allergie`/`food`/`حساسية`, 135 `Wohnungsamt`/`housing`/`مكتب الإسكان`, and starter_phrase 1 = `embassy_appointment` "Ich habe einen Termin.". **Public endpoints back to normal:** `/scenarios` 5 rows containing **none** of the new ids, `/vocabulary` 114, `/grammar` 4, `/health` unchanged (`{status, service, ready, maintenance:false}`). **Root cause (read-only, proven twice):** the live `grammar` table is `id, level, title_ar, title_en, explanation_ar, explanation_en, example_de` (`SELECT GROUP_CONCAT(name) FROM pragma_table_info('grammar')`), while the draft row keys, `src/lib/content/curriculumAudit.ts:49`, `src/types/models.ts:89`, the Worker's own `resolvePracticeGrammar` (`cloudflare-unified-worker.js:1211`) and `docs/PRODUCT-SPEC.md:1021` all assume `id, title_ar, rule_de, rule_ar, level, explanation_ar, example_de, example_ar`. `handleAdminUpload` (`cloudflare-unified-worker.js:3053`) builds `INSERT INTO grammar (…)` from **the row's own keys**, so `rule_de` is sent to a table that has no such column; `SELECT id, rule_de FROM grammar LIMIT 1` fails with D1 error **7500** as the independent proof. **Deeper cause:** none of the four content tables' DDL exists anywhere in the repo (`git grep -n "CREATE TABLE.*grammar\|CREATE TABLE.*vocabulary\|CREATE TABLE.*scenarios\|CREATE TABLE.*starter_phrases"` → 0 hits; only the ledger tables are created by the Worker), so the live content schema is unversioned and has drifted — and the local dry-run cannot see it because it never touches the network, while the audit validates the draft against the *documented* field list. **Two production consequences beyond this load:** (a) `resolvePracticeGrammar` selects three columns the live table lacks and swallows the error in a `try/catch` that returns `null`, so the B2 grammar-reference link can never resolve in production; (b) the live grammar ids are `akkusativ_articles`-style while `SCENARIO_GRAMMAR_IDS` and the offline seed use `g_*`, so even with the columns added the five original scenarios would still have no matching D1 row. **Stopped:** module1's ten grammar rows carry the same `rule_de` field, so it was deliberately **not attempted** (rollback → mark blocked → stop). Owner fix is one additive DDL with no data loss, written into OWNER-OPEN; no deploy, no push, no further write. |

| GUIDED-6. Step 6 verification + two-commit split (`guided-home`) | doing | **Verified; nothing staged; commits held for approval.** The fix is global: three hex blacks read through `token()`'s `rgb(var(--x) / <alpha>)` made `bg-surface-card` (60 sites / 18 files), `bg-surface-subtle` (71 / 24), 9 `bg-kz-black` roots, `bg-surface-raised` and the scrollbar track draw nothing since `b54dc62`. **Commit (a) changes other screens:** flag-off at 390x844, 12 of 26 routes change pixels (10 from the fix, 2 from the guided classes); flag-off layout also shifts (home 1441.58 → 1433.58 px, story setup 258.44 → 254.91); details in the APP-MAP `guidedHome 6` row. Daily tasks still end at 846.89 px of 844 — not fixed, not hacked. `bg-kz-soft-black` (3 uses) is undefined. **Plan:** (a) `src/index.css` + `tests/designSystem.test.ts`; (b) four screens + APP-MAP + 8 PNGs. **Next:** owner approves, then commit. |

## DECISIONS

- **V42 (2026-10-19) — three interpretive calls in one deploy, each the conservative option:** The owner's
  words («merge and deply all all») named no targets → all three (`merge`, `worker`, `pages`) were
  **stated in the report before production was touched**, as the runbook requires for an unnamed-target
  deploy. The merge chose **fast-forward over a merge commit** because `release-candidate` is a strict
  descendant of `main` (`merge-base --is-ancestor` exit 0) — linear history, zero semantics change, no
  force. `/health`'s new `storage` field met the runbook's "only four keys" line → traced with
  `git log -S` to the audited `9c07b44` (2026-10-16, newer than the previously deployed version, so
  new-to-production today), verified it discloses only two health booleans — none of
  `aiPool`/`models`/`strategy`, the values the rule actually protects — and **the runbook/ENV-FACTS/
  MEMORY lines were corrected rather than rolling back** a reachable learner path. Every claim above
  carries its command output in the run transcript.

- **AI-POOL (2026-10-18) — "only OpenRouter and NVIDIA" means the DEFAULT pool, and dashboard-stored keys live in KV plaintext by design, masked on every read.** The owner's words set the default walk: Gemini and Groq default entries removed. They remain available as a *preset*, so "delete Gemini" is honored operationally — no request reaches them unless the owner deliberately adds an entry. Keys pasted in the dashboard live in the `USER_PROGRESS` KV namespace under `ai-provider-config`, reached by nothing except this worker's admin routes and provider calls — the same trust tier as a worker secret; the alternative (AES with a key derived from ADMIN_SECRET/HMAC_SECRET) was deferred as unnecessary machinery for a value the owner could equally store as an env secret. Every read path returns counts + non-reversible fingerprints only; nothing logs a key. Second decision under the same item: the guard `hasUsableProvider` became **async** (the owner config is a KV read) and every AI route awaits it — call sites were updated in the same change so the guard cannot silently go non-blocking.

- **V41 — the Trail order is a code rule, not a content column, and exam practice now ends the journey.** Two options existed: populate `sequence_order` on the 44 approved rows and order in D1, or state the journey once in code. The column route needs a production D1 write (owner `CONTENT-LOAD-AUTHORIZED` only) and would still break on the `sort_order`/`sequence_order` mismatch, so the order is a deterministic function over whatever content exists. It starts at the airport and ends at the exam drills, reversing the L7 exam-first decision at the owner's direction (2026-10-07) — recorded in the module header and pinned by `tests/trailOrdering.test.ts`, which now tests the function the screen actually calls. Content rows were deliberately left untouched: the owner chose code-only, so no `title_ar` rewrite and no Content Gate review file.

- **V18 — the closed beta is free and code-only, and payments stay deliberately off.** The prompt authorizes `merge, worker, pages` and a content load, but this run's product decision is that the cohort must not be able to reach a payment path at all: the provider secrets remain absent, `POST /crypto/checkout` answers **503** (`crypto_not_configured`, Arabic copy), the app bundle contains **zero** checkout references, and the only paid mechanism in play is a hand-minted activation code, which is single-use by ledger primary key. Enabling payments is an owner action belonging to a *public* launch, not to this beta — recorded here so a later run does not "helpfully" turn it on to make `/crypto/health` read `ready:true`.
- **V18 — the load set is the supplement plus module1, and module1's scenario/grammar upserts are safe by evidence, not by assumption.** The prompt names the supplement plus "any module1 rows the ledger lists as approved-but-unloaded", which is exactly the three vocabulary rows the drift check reports `absent`; the loader must be given the whole module1 draft to write them, and that draft also carries 5 scenarios and 10 grammar rows that D1 already holds. The loader upserts `scenarios` and `grammar` by id, so the load rewrites those 15 rows — permitted only because the independent drift check reports them **identical** (`scenarios: 10 declared · 10 identical`, `grammar: 18 declared · 18 identical`), i.e. the upsert is a no-op by value. Had any of them diverged, the correct action would have been to stop and treat it as a content decision, not to "let the draft win". Verified after the load: counts 15/221/111/22, max vocabulary id 281→284, max phrase id unchanged at 153, three sampled pre-load rows byte-identical.
- **V18 — the free-path proof is a temporary local probe, and it was deleted.** Redemption and entitlement were proved on a real local D1 (`wrangler dev --local`, wiped `--persist-to`, throwaway `--var` secrets, hand-built TEST_MODE identity, no remote binding, no provider call, **no production write and no real secret**), because the only alternative — redeeming a code against production — would have required minting a code with the live `ADMIN_SECRET` and writing a production ledger row. The probe directory was removed after the run and its server tree killed from the `cmd` wrapper (the V9 stale-server lesson), with `results.json` copied outside the repo. Re-running it is a matter of recreating five small files; the commands are in V18-3.
- **V17 — the CI failure is fixed by raising CI's Node, not by removing the code that needs it.** The cheapest-looking fix was to stop the scripts importing `.ts` (bundle the two `scripts/*.mjs` helpers, or duplicate the pure functions into `.mjs`), and the guarantee the supplement audit rests on would have been weakened: the audit imports the *same* `auditGrammarSupplement` the app ships, so a copy is a second definition that can drift. The other candidate — `--experimental-strip-types` on Node 20 — is a flag Node 20 also lacks for ESM `.ts` (`ERR_UNKNOWN_FILE_EXTENSION`) and would leave the jsdom failure untouched. Raising the pin fixes both symptoms at once, and it is what the repo already required in practice: nothing declared a Node version, so the workflow's `20` was a guess that only CI could fail on. The declaration is now explicit (`engines.node`), the pin is the *lowest* version that satisfies it, and a test keeps them in agreement — so the version cannot silently drift away from the code again in either direction.
- **Deploy, 2026-09-29 (V15-4) — authorized by a line that names `merge, pages` plus a body instruction naming the worker; both were executed, and nothing else was.** The header read `DEPLOY-AUTHORIZED: merge, pages` while step 4 said "worker only if worker code changed, and it changed in V13, so deploy it too". The worker deploy is therefore authorized by the *body*, not the header, and that is recorded here rather than resolved silently: the change it ships is additive-only (`ensureContentColumns`' three `grammar` entries), it has a one-command rollback (`wrangler rollback 2a6fd74c-…`), and the alternative — leaving the self-heal unshipped — was exactly what the same prompt asked to close. No D1 statement, no force-push, no manual Pages deploy (Pages built from the push), no content load, no secret handled.
- **Deploy, 2026-09-29 — authorized by the prompt's exact line `DEPLOY-AUTHORIZED: merge, worker, pages`; all three targets executed, nothing outside them.** Runbook followed: preconditions, snapshot, merge → worker → Pages → smoke; no D1 statement was run, no secret touched, no `--commit` content load, no force-push, and no Pages deploy command was issued (Pages built from the push, as `docs/agent/DEPLOY.md` requires). **Substitution disclosed:** the runbook's smoke step names "run the demo e2e spec against the production URL", but `playwright.config.ts` pins `baseURL` to `localhost:3000` and that spec's harness mocks every off-origin request — pointed at production it would exercise the mock, not the deployment. A real-browser smoke of the live `/demo` (network log, console, service worker, one completed step) is the faithful equivalent of that intent, and it is what was run.
- **§3 amended, owner-authorized, this run only:** the prompt contains `DEPLOY-AUTHORIZED: merge, worker, pages`. The only §3 change was deleting the deploy bullet and adding the amendment paragraph verbatim; proven by diffing the §3 block against the v6 backup (`/tmp/AGENTS.v6.bak`) — exactly two hunks. All other §3 text is byte-identical.
- **Sweep scope extended beyond `docs/` (disclosed):** the mission scoped the sweep to `AGENTS.md`, `docs/` and `docs/agent/`, but moving the Content Gate out of the manual left four comment-only pointers at a section that no longer exists (`scripts/audit-curriculum.mjs`, `src/lib/content/curriculumAudit.ts`, `src/lib/db/katzuDb.ts`, `tests/arrivalRoster.test.ts`). They were fixed in the same commit; the gates above prove no behaviour changed.
- `docs/content/*.json` `_note` metadata strings were updated because they pointed at the moved gate. No content row, id, review status or count changed — `audit-curriculum.mjs` still reports module1 5/74/30/10 pending and module2 5/49/42/4 approved.

- **V9 — the duplicated admin gate stays duplicated; the contract is injected, not shared.** `cloudflare-admin.js` cannot import the worker's gate (a back-import would be a cycle: `cloudflare-crypto.js` imports *from* `cloudflare-admin.js`), and that duplication is what let the copy drift — it kept the comparison and silently dropped the failure recording. Rather than add a third module or restructure the import graph mid-hotfix, the worker injects `recordAdminAuthFailure` and its memoized `ensureLedgerTablesOnce` through the same `deps` object the module already uses for `{ json }` / `{ recordActivity, recordError }`. The two copies are kept deliberately; the `adminRegistry`/`adminContent` tests exist to keep them behaviourally identical.
- **V9 — a leftover `vite preview` looked exactly like a dev server on port 3000.** Before the Playwright gate, a listener on 3000 served the app with `Cache-Control: no-cache` and an `Etag`. The distinguishing probe: `GET /@vite/client` returned `200 text/html` (the SPA fallback) instead of `text/javascript`, i.e. it was `vite preview` — a stale preview from the V8 gate, which `reuseExistingServer: false` (`E2E_TARGET=preview`) would have failed on. Killed by listening PID before the run; recorded in `LESSONS.md` too.
- **V9 — the content load was refused rather than attempted, and that is a hard boundary, not reluctance.** The loader authenticates to `/admin/upload` with `ADMIN_SECRET` (`scripts/load-curriculum.mjs:57`); §3 forbids an agent requesting, setting or using any secret, and the owner's own content-load paragraph lists secrets under "Never allowed". Both files were therefore verified as far as read-only evidence allows — audits, dry-runs, and a live collision check that came back clean — and the `--commit` commands were left to the owner. module1 would additionally be refused by the script itself, because its review is still `pending`.
- **V9 — `wrangler d1 execute` needs `--command` for a query, not `--file`.** The runbook's collision check is written with `--command`; the first attempt substituted `--file`, which wrangler treats as an **import** and answers with only a batch summary (`Total queries executed / Rows read / Rows written`) — no rows. Re-run with `--command "SELECT …"` and the rows come back. Recorded in `LESSONS.md` so a future read-only D1 check does not repeat it.
- **V9 — Lighthouse was pointed at the repo's own Chromium, and its numbers carry a disclosed caveat.** `CHROME_PATH` was set to the installed Playwright Chromium so no second browser was downloaded; and every page carried a 172 KB script injected by this machine's Kaspersky anti-virus, the largest single item in the unminified/unused-JavaScript audit. The scores are reported as measured, the caveat is stated in the V9-10 row, and nothing was fixed (the prompt forbids fixing this run).
- ENV (probed once, this session): toplevel `C:/Users/Lenovo/Desktop/k1/katzu`; `node v24.14.0`; **`rg` is missing** → use `grep`/`git grep -n`; `sh -c 'echo ok'` succeeds → heredocs, `sed`, `awk`, `timeout` are available; `git rev-parse --abbrev-ref HEAD` = `launch-hardening`; `core.autocrlf=true` and `.gitattributes` now pins `eol=lf` — **but the working tree is still CRLF** (re-measured 2026-09-29: `index.html` CR=4, `tailwind.config.js` CR=9, `AGENTS.md` CR=3), so the attribute is not taking effect on this checkout. Re-probed 2026-09-29 and recorded in full in `docs/agent/ENV-FACTS.md`.
- The owner's RC prompt stages were adopted as ledger items `RC-0…RC-5`, worked in the prompt's priority order (0 → 2 → 3 → 1 → 4 → 5), with the prompt's commit prefix `RC-n:`. P-phase items already committed keep their existing `Pn:` commits.
- P7 (doc truth) is folded into RC-5 rather than run twice: both are a documentation-correctness pass and the counts RC-5 must paste are the same counts P7 would update.
- The `.gitattributes` fix was chosen over rewriting the script: the repo's *blobs* are already LF, so the failure existed only in a Windows working tree; pinning `eol=lf` fixes it for every checkout instead of patching one file.
- Legal links on the Pro offer open in a new tab rather than navigating in-app: the trust pages are public routes, and a learner reading the terms should not lose the offer they were considering. `legalPageUrl` (already exported, previously unused) supplies them.
- The empty-state copy fixes were driven by a measured check, not by taste: the vocabulary grid rendered nothing for a zero-match filter, and the level pills measured 32px against a 44px minimum.
- **Substitution disclosed (v6 §2.2 → v7 §4):** the deploy prompt named `npm ci`; I ran `npm ci --dry-run` instead. `npm ci` deletes `node_modules` before reinstalling and the deploy was already blocked on missing credentials, so a failed reinstall would have stranded the workspace (no lint, tests, or e2e) for zero benefit. The dry run still validates that `package.json` and the lockfile agree, and the full suite then ran from the verified install.
- **§0 precedence on the deploy itself (cited, not re-derived):** the owner prompt says it overrides "never deploy", but `AGENTS.md` §3 — which §0 ranks *above* the owner prompt and which only the owner may edit — still reads "Never, under any circumstance: run a deploy". The two conflict, §3 wins, and the owner's own rule for that case is to take the conservative option, log one line and ask one question. So even with credentials present I would not have deployed from this prompt alone; the one-line §3 edit (or the variables) resolves it.
- Supplied v3 manual is already the exact current `AGENTS.md` content observed at session start, so it was left intact rather than rewritten unnecessarily.
- **V8 probe methodology (disclosed, so the evidence can be reproduced or challenged):** the real-D1 proof used the *unmodified* worker source through a wrapper entry (V8-F1 workaround), `TEST_MODE` + a hand-built `alg:RS256` JWT to mint a local identity (the bypass is neutralized in production by `isProductionEnv`, `cloudflare-unified-worker.js:1281`), locally invented `NOWPAYMENTS_IPN_SECRET`/`ADMIN_SECRET`/`HMAC_SECRET` values passed as `--var` (never the owner's secrets, never read), and three `crypto_orders` rows seeded with the local `wrangler d1 execute --local` CLI — the checkout route was not used because it calls the real NOWPayments API. Every endpoint driven was the real handler; the only substituted input is the identity and the order row, both of which are local-only artifacts.
- **`--persist-to` was tried and abandoned, and one intermediate result was thrown away because of it:** `wrangler d1 execute --local --persist-to <dir>` honours the flag while `wrangler dev` in this run kept writing to the default `.wrangler/state` — the seed landed in one directory and the server read the other. The honest resolution is the one used in the final run: use the default state directory for both, wipe it first, and verify the server you are talking to is yours (a stale `wrangler dev` from an earlier run was still holding port 8799 and answering requests, which briefly made a correct result look wrong). Discarded, not recorded as a finding, because the cause was not isolated to `--persist-to` alone.
- **V8-2 asserts the CAS contract, not a wish about it.** The first version of the concurrency check expected both writers to be answered 200. On a real engine the loser gets **409 `SYNC_CONFLICT`**, which is what the code and the client actually specify — the server hands the stale writer the current `rev` instead of silently re-merging on its behalf, and `workerClient.ts` refetches and retries once. The assertion was rewritten to test that contract plus the client protocol's outcome (the union survives), and the failed first assertion is recorded here rather than dropped.
- Freebuff's Changes panel owns Save/Share/commits/push/PRs. Prefer code and verification only; no Git delivery commands were requested or run during this continuation.
- The interrupted full `journey.spec.ts` run was killed and is not a pass. Per §5 (v6 §2.4), run the remaining journey tests in synchronous groups of at most three in B8; do not repeat the timed-out full-file command.
- **V12 — the rollback was scoped by id boundary, and the boundary came from the backup, not from memory.** `vocabulary` and `starter_phrases` have no natural key (the loader dedupes on `level|german|topic` and `scenario_id|german`), so "delete only the rows this run inserted" needs a provable discriminator. Both tables are `INTEGER PRIMARY KEY AUTOINCREMENT` and the V11 export carries their `sqlite_sequence` values (`vocabulary` 135, `starter_phrases` 20), so `id > <pre-load sequence>` is exactly the new set — 42 + 42 rows plus the 5 known scenario ids, 89 in total, which matches the loader's own "89 row(s) written". The alternative, deleting by `(level,german,topic)` key, was rejected because 7 of the draft's vocabulary rows were skipped *as already existing* and a key-based delete would have removed those pre-existing rows too.
- **V12 — the run stopped at the first mismatch instead of trying the second file.** `docs/agent/CONTENT-LOAD.md` says any mismatch → delete only this run's ids, verify the counts return to 5/114/20/4, mark `blocked`, stop. module1's grammar rows carry the same `rule_de` field, so its batch would have failed identically while adding ten more writes to roll back and no information.
- **V13 — the schema fix is expressed twice on purpose, and only one of them is applied by a machine.** The owner's three `ALTER TABLE`s unblock the load today; the three `ADDITIVE_COLUMNS` entries make every *future* deployment of this Worker heal the same gap on its first request. A column in both places is harmless — SQLite answers `duplicate column name`, which `ensureContentColumns` already treats as the steady state — and `tests/contentSchema.test.ts` pins that overlap (`scenarios.banner_url`) so a later edit has to keep it on purpose. The alternative, leaving the additive list one entry long because the owner had already run the DDL, would have preserved exactly the blind spot that produced V12.
- **V14 — the load went ahead at 218 vocabulary, not the prompt's 237, and that is the runbook's rule rather than a shortfall.** `vocabulary` and `starter_phrases` have no unique key, so the loader skips a row whose `level|german|topic` (or `scenario_id|german`) already exists. 19 of the drafts' 123 vocabulary rows (7 module2 + 12 module1) already existed from the original catalogue, so 104 new rows were written and the live total is 114 + 104 = 218. Substituting the naive sum would have meant *duplicating* 19 live rows. Verified independently: all 123 draft vocabulary rows resolve against production, so nothing was dropped — the skipped rows are the released catalogue's own words.
- **V14 — the four original grammar rows are a *supplement*, and the Content Gate has no shape for one.** The gate requires every draft in `docs/content/*.json` to be a 5–8 scenario module; four grammar rows cannot satisfy that, and the gate is owner-owned so it was not edited to fit. The file therefore lives in `docs/content/supplements/` — outside the audit's non-recursive glob, so `audit-curriculum.mjs` still reports exactly 2 drafts — and is gated by `tests/grammarReachability.test.ts` against the same column contract. The cost is disclosed in the row above: it is authored and reviewed but not loadable until the owner either adds a supplement shape to the gate or enters the four rows through the content studio's grammar form.
- **V14 — the owner decided not to rename the four legacy D1 grammar rows, so they stay unreachable by design.** They are not in `SCENARIO_GRAMMAR_IDS` and nothing points at them, which means the reachability test cannot see them (it covers the repo's own content) and they would be the one class of live row that is loadable but untaught. Recorded here as a deliberate exception instead of being encoded as an expectation in a test that would then have to tolerate it.
- **V13 — no production statement was run to prove the preflight, and the unit tests are the substitute.** A `--commit` run against production would either abort (proving the guard fires, at the cost of a real authenticated session) or, if the guard were wrong, write 89 rows again. So the preflight is proven by pinning it against the *recorded* live column list (`pragma_table_info('grammar')`, 2026-09-29) and the exit contract by pinning it against the *recorded* V12 result shape; the end-to-end firing remains unrun until the next authorized load, which is where it will actually matter.
- **V12 — no schema change was made, even though the fix is three additive `ALTER TABLE`s.** The prompt authorizes a content load and explicitly no deploy; production DDL is neither, and the V11 lesson is precisely that an agent must not widen its own authority to make a tool work. The commands and the evidence are in OWNER-OPEN so the owner can decide it in one step.

## UNPROVEN

> Resolved and historical claims are in `docs/agent/ARCHIVE-AGENT-STATE.md` under the same heading.

- **AI-POOL: preset gateway/model names are prefills, not verified endpoints (2026-10-18).** `AI_PRESETS` in the dashboard and the `PROVIDER_POOL` defaults carry model ids (`thinkingmachines/inkling-small:free`, `openai/gpt-oss-20b`, and the preset fills for Groq/OpenAI/DeepSeek/Mistral/Together/Fireworks/Cerebras/xAI/Google) that nobody has validated against the live providers this session; the Test button is the intended validator. OpenRouter's rpd 50 is the repo's own recorded figure, not re-measured.

- **AI-POOL: the dashboard tab and the admin endpoints are unit-proven only (2026-10-18).** The provider store, masking and validation have 22 tests, and the route suites cover the merged pool through the worker, but the dashboard UI has not been opened in a browser and the five admin actions have no direct HTTP-level test; serving runs the pool that `callAiRouter` receives at request time (covered at route level) rather than an on-wrangler-dev integration run.

- **AI-POOL: nothing was verified against production or deployed (2026-10-18).** No deploy authorization was given; production still runs the old Gemini-first worker, and until the owner adds OpenRouter/NVIDIA keys the new code would serve everything off the Workers AI fallback.

- **Browser suite: 117/121 against the built bundle (2026-10-15, this session), and the 3 failures are unclassified.** `E2E_TARGET=preview npx playwright test --project=chromium` on the production bundle gave **117 passed / 3 failed / 1 skipped (12.1 min)**. A focused re-run of the three failing spec files gave **11 passed / 2 failed** and a *different* pair failed, so at least one failure is intermittent. The failing tests cluster on screens whose source files carry **another session's uncommitted edits** (`src/features/auth/SignInScreen.tsx` — the `/mock` "sign in with Google" assertion; `src/features/trail/TrailScreen.tsx` — the 44px Trail targets; `src/App.tsx` — the referral-link copy), and this batch changes **no** app or spec file, so the correlation is real but causation is **UNPROVEN**: nobody has re-run these specs on a clean `src/` tree. Owner of the fix: whoever owns those uncommitted screen changes. `e2e/auditedScreens.spec.ts:22` ("a failed send keeps the round counter honest") failed in both runs and is the one to start with. Port note: the run used a throwaway config in the OS temp dir identical to `playwright.config.ts` except for port 3100, because a dev server started by another session holds 3000.

- B3: loader dry run executed locally via the new secretless `--dry-run` (both modules pass, counts recorded in OWNER-OPEN); the **remote/network dry-run and any real load remain unrun** — they need the owner's `ADMIN_SECRET`. The app-side seed layer is tested on fake-indexeddb, not on a real device database.

- B3: no human review of module2 content; review attribution is AI self-review only.

- **RC-6: nothing was verified against production**, because nothing was deployed. The live worker, Pages production, D1 and the sales site are unchanged and still running the pre-hardening code from `22fe6aa`.

- **NEW V8-F1, open (tooling, not a deploy blocker): `wrangler dev --local` cannot boot the real worker entry.** workerd rejects the entry module's non-function named exports (`export const RATE_LIMIT_RETENTION_MS` / `ERROR_REPORT_RETENTION_MS`, added in `c3ee78d`) with `Incorrect type for map entry 'ERROR_REPORT_RETENTION_MS': the provided value is not of type 'function or ExportedHandler'`, and the runtime never starts. Production accepts the same file (the V7 deploy serves `/health` from it), so this is a wrangler-4.136.3 local-config gap, not a deploy risk. Workaround used by V8-2: run `wrangler dev <wrapper.js>` where the wrapper is `export { default } from "../../cloudflare-unified-worker.js"`, which leaves the code under test byte-identical. Anything else that needs a local worker (a future integration harness, a seed script) hits this first.

- **V9: the admin failure counter's `INSERT`-then-increment path is not unit-tested.** `FreshD1` models a real empty database (a statement against a missing table throws) but **not** a real `PRIMARY KEY`: a duplicate `INSERT` does not raise, so the double cannot reach the “insert throws → increment the existing row” branch that both `recordAdminAuthFailure` and `checkGlobalRateLimit` rely on. That branch is proven against real SQLite by the V9 probe (N3b: exactly one `admin-auth-fail:` row with `count: 5`; N3 `[401×5, 429]`) and the *contract* is pinned by the injected-recorder tests, but a unit-level test of the increment needs a PK-aware double. Deliberately not half-modelled in V9.

- Lighthouse **has now been run** (V9-10, Phase 5 — mobile, production, Lighthouse 13.5.0), which closes RC-1's "no evidence at all" status. Two limits stay on that evidence: the numbers were taken on a machine whose anti-virus injects a 172 KB script into every page (`gc.kis.v2.scr.kaspersky-labs.com/…/main.js`), so the absolute timings are pessimistic and no clean-machine baseline exists; and the Trail route itself is still unmeasured, because `/app/trail` redirected to `/welcome` without an account. The three app-side causes in V9-10 are evidenced from the app's own resources, not from that injected script.

- Visual preview inspection, 360px/390px screenshots, offline network-drop recording behavior, and axe scans remain unverified.

- **V12: the content load has still never completed, and the `grammar` write path has never once succeeded in production.** Live content stays 5 / 114 / 20 / 4 and the two drafts' grammar rows are proven unloadable until the live table gains `rule_de`, `rule_ar`, `example_ar`. The vocabulary and starter_phrases writes *did* succeed this run (42 + 42 rows, HTTP 200 each) and were then deleted on purpose, so their insertion path is now proven against the deployed worker — but their **persistence** is not: no load has ever stayed.

- **V12: the live content schema is unversioned and known only by inspection.** `pragma_table_info` was read for `grammar` only; there is no repo artifact to diff `scenarios`, `vocabulary` or `starter_phrases` against, so a drifted column in a table this run happened not to touch would have shown up nowhere. A future run should record all four tables' `pragma_table_info` before writing.

- **V12: the B2 grammar-link path is dead in production, inferred from code + schema rather than observed end to end.** `resolvePracticeGrammar` names three columns the live table lacks and swallows the resulting D1 error, so it can only ever return `null`; confirming the learner-visible consequence needs a signed-in AI turn, which this run cannot make.

- **V13: the loader's new preflight has never fired against a real deployment.** It is pinned by unit tests against the *recorded* production column list and by construction (one real row read, `SELECT *`, before the first POST), but no end-to-end run has been refused by it — pointing `--commit` at production would either abort, proving the guard at the cost of a live authenticated session, or write 89 rows again if the guard were wrong. The next authorized load is where it fires for real. The same gap covers the additive self-heal: `ensureContentColumns`' new grammar entries are deployed by nothing yet, so a *fresh* deployment is still unproven until one is made.

- **V14: `resolvePracticeGrammar` is proven at the query level in production, not observed end to end.** The exact SQL it runs — same column list, same parameter — returns a row for a loaded scenario, and the function's only failure mode (a D1 error swallowed by its `try/catch`) is gone. Reaching the function itself needs an authenticated AI turn with a Guided Practice grammar id, which a logged-out run cannot produce; the public demo deliberately makes no AI call.

- **V15: the drift check compares production against the *drafts*, so "no drift" is not the same as "production is correct".** Rows no draft declares — the whole pre-module catalogue, and the four legacy `grammar` rows — are counted and deliberately not compared, because the modules are additive. It also cannot tell *why* a key was already live; it reports the class and the live id, and the reasoning (the loader's skip rule) comes from the runbook. Treat a green run as "the repo and the deployment agree about everything the repo owns", not as a content-quality check.

- **V14: the supplement is reviewed but unloaded, and its German fix is unshipped.** `docs/content/supplements/grammar-basics.json` and the matching fixture edit in `src/lib/db/katzuDb.ts` are committed, but the fixture edit needs a Pages deploy to reach learners and the D1 rows need an owner decision to be inserted at all.

### Per-scenario confidence notes (module2) — what a human should spot-check first

- `airport_arrival`: highest confidence overall. Spot-check the German of the b2 opener ("Seit Ihrer Ankunft fehlt also Ihr Gepäck") for the slightly emphatic "also", and the Arabic plural in "خبزتان صغيرتان" against natural spoken usage.

- `train_station`: high confidence. Spot-check that "Bahn katze" matches any live D1 persona row before loading (it is copied from the local fixture, and D1 wins).

- `bakery_shopping`: high confidence. Spot-check "Darf es sonst noch etwas sein?" — idiomatic but register-sensitive; a native speaker may prefer a variant.

- `landlord_followup`: medium confidence (new scenario). Spot-check the b1 opener's elliptical confirmation ("Sie haben gesagt, die Heizung ist kaputt?") and that the phrasing stays natural for a phone call; also confirm the Vermieter katze persona continuity with apartment_viewing is desired on live D1.

- `friend_catchup`: medium confidence (new scenario, du register). Spot-check "Na, wie geht es dir? Erzähl mal!" for tone and the whole scenario for level-appropriate informality; it is the module's only du-register scene.

## OWNER-OPEN

> Resolved and historical owner items are in `docs/agent/ARCHIVE-AGENT-STATE.md`.

- **The AI pool needs your keys before OpenRouter/NVIDIA serve anything (AI-POOL, 2026-10-18).** The default provider pool is now NVIDIA + OpenRouter only and you edit it from the admin dashboard's new **AI Providers** tab — add custom gateways (base URL + model + format + tier + key), disable a default, or pick a preset (OpenRouter, NVIDIA, Groq, Google AI Studio, OpenAI, DeepSeek, Mistral, Together, Fireworks, Cerebras, xAI, Custom). Keys pasted there are stored server-side and never shown again (only a masked fingerprint). Today both key lists are still EMPTY, so until you paste keys in the dashboard or run `npx wrangler secret put OPENROUTER_API_KEYS` / `NVIDIA_API_KEYS`, every AI turn rides the free Workers AI fallback (works, but capped at 700 tokens and lower quality). Done looks like: the AI Providers tab shows a green "OK in N ms" next to the Test button for at least one entry.

- **Nothing is left to load — the content set is complete and verified (V18-2).** `docs/content/supplements/grammar-basics.json` and both modules are in D1: **15 scenarios / 221 vocabulary / 111 phrases / 22 grammar**, `node scripts/check-content-drift.mjs` exits **0** with 0 absent, 0 pending and 0 duplicate keys, and every module/supplement grammar row is reachable from `SCENARIO_GRAMMAR_IDS` (18 of 22; the other 4 are the legacy rows below). The two loader bullets further down are kept only as history. Remaining content work is *authoring volume*, not loading.

- **A cohort needs a URL before it needs anything else (V18-3).** `https://katzu-webapp-v3.pages.dev` works today and is what a closed beta can be handed, but `public/robots.txt` and `public/sitemap.xml` advertise `https://katzu.app/`, which does not resolve, and any store or payment-provider listing will want a host you control. Decide: attach `katzu.app` (then update `ALLOWED_ORIGINS` + `VITE_PUBLIC_APP_URL` + the two static files), or accept the `pages.dev` host for the beta and revisit before a public launch.

- **Real-device voice is still the largest unverified surface (V18-3).** Every voice path in the repo runs against Chromium's fake device; the 14-row checklist in `docs/agent/OWNER-STEPS.md` §2 is the only honest way to close it, and it needs two phones. This is the first thing `docs/agent/BETA-KIT.md` asks for on day 10.

- **Payments stay off for the beta (V18, decision above).** `/crypto/health` reading `ready:false` is the correct state, not a gap to close before the cohort starts.

- **Update this machine's Node to ≥ 24.15.0 — CI now runs 24.15.0 and `engines.node` says `^22.22.2 || ^24.15.0 || >=26.0.0` (V17-1).** The local machine is 24.14.0, one patch below **jsdom 30.1.1**'s declared `^24.15.0`, so `npm ci` prints `npm warn EBADENGINE Unsupported engine { package: 'katzu-web@1.1.0', required: { node: '^22.22.2 || ^24.15.0 || >=26.0.0' }, current: { node: 'v24.14.0' } }` **and the whole suite still passes** — this is a declaration-vs-machine gap, not a failure, which is why it is a note and not a blocker. Fix, one command: `nvm install 24.15.0 && nvm use 24.15.0` (or `winget upgrade OpenJS.NodeJS.LTS`), then confirm with `node -v` and `npm ci` printing no `EBADENGINE` line. Recorded here rather than fixed, because installing a runtime is outside what an agent may change on this machine (`docs/agent/ENV-FACTS.md` §C/§H).

- **Content-load drift check — run `node scripts/check-content-drift.mjs` after any content change (V15-3).** Read-only (`GET`s on the four public endpoints, never the admin ones), exits non-zero when production disagrees with the drafts, and classifies each difference so a by-design skip is not read as a failed load. Current state: scenarios 10/10 and phrases 91/91 identical, grammar 14 identical + 4 pending, vocabulary 104 identical + 19 diverged (all 19 rows the loader skipped by its own rule), 3 duplicate keys across the two modules.

- **Content load (owner-only) — the blocker changed in V12: it is a production schema, not the credential.** The credential is now correct (V12-1: a bare 64-hex value, every shape boolean true) and the loader got through three of its four batches — but `grammar` answered **`HTTP 500 D1_ERROR: table grammar has no column named rule_de`**, so the run deleted its own 89 rows and stopped (V12-2). **The fix is one additive DDL and it loses nothing** (`ALTER TABLE` adds columns only; the two legacy columns `title_en` / `explanation_en` stay, unused):
  ```sql
  ALTER TABLE grammar ADD COLUMN rule_de TEXT;
  ALTER TABLE grammar ADD COLUMN rule_ar TEXT;
  ALTER TABLE grammar ADD COLUMN example_ar TEXT;
  ```
  That matches the schema the app, the audit and the Worker already assume (`docs/PRODUCT-SPEC.md:1021`), and it also revives `resolvePracticeGrammar`, which silently returns `null` today. After it, re-run `docs/agent/CONTENT-LOAD.md` (module2, then module1) with the same environment; the backup is still valid and unused and the collision check is still clean. **Decide at the same time:** whether the four legacy grammar rows (`akkusativ_articles`, `dativ_prepositions`, `konjunktiv_ii`, `perfekt_tense`) should be re-id'd to the `g_*` ids `SCENARIO_GRAMMAR_IDS` and the offline seed use — until then even a successful load leaves the five original scenarios without a D1 grammar row. **Also worth a repo-side fix:** nothing in the repo declares the content tables' DDL, which is why the drift was invisible; a `docs/agent/CONTENT-SCHEMA.md` (or the checks in LESSONS) would make the next load fail loudly *before* it writes.

- **Content load (owner-only; runbook `docs/agent/CONTENT-LOAD.md`).** V11 got as far as the credential: the backup is taken and every other precondition passes for both modules, but `ADMIN_SECRET` in the environment is the 64-hex secret **wrapped in literal angle brackets** (`<secret>`, 66 characters), so the loader answers `HTTP 401` on its first read and **nothing was written** (V11-2). **Two owner actions, in this order:** (1) **rotate the secret** — it was pasted into a chat prompt in this session and must be treated as compromised; (2) put the **bare 64-hex** value in the environment and re-run the loader. If you would rather not touch the variable, the alternative is to authorize the one-command in-shell form explicitly: `ADMIN_SECRET="${ADMIN_SECRET:1:64}" node scripts/load-curriculum.mjs --file=… --commit` (the value stays out of the transcript and out of every file). This run did **not** do that: re-encoding a secret for a tool is exactly what §3 reserves to the owner, so it needs your explicit word. Everything else is verified: both files approved with review files, both audits PASSED, both dry-runs PASSED (module2 → 5 / 49 / 42 / 4; module1 → 5 / 74 / **49** / 10), production collision checks clean for both modules, live counts **5 / 114 / 20 / 4**, backup `/tmp/pre-load-katzu-20260929.sql` (76,327 B, uncommitted). Approval changed in V10-3: **module1 is `approved`**. The exact owner commands:
  ```
  node scripts/load-curriculum.mjs --file=docs/content/curriculum-arrival-module2.json --commit
  node scripts/load-curriculum.mjs --file=docs/content/curriculum-30day-module1.json --commit
  ```
  **Collision check RE-VERIFIED read-only in V9-9 (Phase 4) against live production D1:** all five of module2's scenario ids and all four of its grammar ids are absent (live scenarios: `apartment_viewing, cafe_order, doctor_visit, embassy_appointment, job_interview`; live grammar: `akkusativ_articles, dativ_prepositions, konjunktiv_ii, perfekt_tense`), and the same holds for all 15 of module1's ids — so neither load can overwrite an existing row. V9-9 also confirmed the block is the *secret*, not the content: both `--commit` runs exit **2** with "ADMIN_SECRET is not set", and §3 forbids an agent from using it. **module1 must be approved first** (`review.status` is `pending` and no `docs/content/review-<module1>.md` exists) or `scripts/load-curriculum.mjs:131` refuses it. Never paste the secret into chat.

- Existing `docs/LAUNCH-CHECKLIST.md` §2 owner-only actions remain untouched.

- **Two Worker-side settings the release depends on** (owner-only, both are deploy-time changes):
  **both are now applied (V9-7, deployed in V9-8).** `MAINTENANCE_MODE` is present in `[vars]` as `"off"`, so the emergency stop is now just turning it to `"on"` on the running Worker (§6.5 of `docs/LAUNCH-CHECKLIST.md`); and `[triggers] crons = ["17 4 * * *"]` is deployed, so retention runs automatically at 04:17 UTC instead of depending on a hand-run `POST /admin/sweep`.

- **Before running the module2 loader**, note a draft/live title difference: `curriculum-arrival-module2.json` titles the opening `airport_arrival` as "Am Flughafen: das Gepäck" / "في المطار: الأمتعة", while the live fixture and the story call it "Am Flughafen: fehlendes Gepäck" / "في المطار: الأمتعة المفقودة". `--commit` would soften the opening episode's title. Left unchanged because §4 forbids rewriting an approved module's rows in place; the owner decides whether to align the draft (and re-review) or accept the change.
