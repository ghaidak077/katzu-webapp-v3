# PROJECT-BRIEF — Katzu snapshot for the owner's advisor

Recon date 2026-09-29; **deployed twice the same day** (owner-authorized). V7–V9 shipped the hardened worker (**`255dbeef-faae-476a-b3f5-6d4666099b70`**, from `b11e66e`) and left Pages at `cbfb29f5-…`; **V10 deployed Pages**: `main` is now **`e487654`**, the production Pages deployment is **`2c245106-c916-4ad1-8c8f-25d52e09f208`** serving **`assets/index-CWWIxWb7.js`**, and the worker was **deliberately not deployed** because no `cloudflare-*.js` or `wrangler.toml` file changed. **No content was loaded** — the load stopped at `ADMIN_SECRET`, which is owner-only (V10-6), and that secret must now be **rotated** because it was pasted into a chat prompt. Also true as of V10: **module1 passed the Content Gate** (31 isolated words and ten unreachable grammar rows fixed, then approved) and a performance pass measured three LCP variants, kept one and reverted two. Sections marked *(live)* reflect the V10 deploy.
Every claim cites a path, a command result, or a ledger line. Unverified claims sit under **UNKNOWN**.
Environment facts: `docs/agent/ENV-FACTS.md`. Status: `docs/AGENT-STATE.md`.

## 1. Product state (what a learner can do today)

Arabic-first German-learning PWA. Public demo needs no account and makes no AI call (`docs/agent/QUALITY.md`, "Product").

| Route | State | Proof |
|---|---|---|
| `/demo` public demo | **works** | `npx playwright test e2e/demo.spec.ts` → 1 passed, 8 s vs dev, 7 s vs `vite preview`; **re-proved on production in V10** in this thread's own logged-out browser — all four steps completed, **zero console messages**, **no `/ai/turn`** |
| `/app/trail` (Journey Home) | **works** | `e2e/journey.spec.ts` 12/12 + `e2e/firstRun.spec.ts` 3/3, ledger RC-5 (not rerun this session) |
| Story Setup → Guided Practice → Live Conversation → Debrief | **works** | `e2e/journey.spec.ts`, `e2e/conversationLayout.spec.ts`, `e2e/microphone.spec.ts`; ledger RC-0 rerun |
| `/app/review`, `/app/listen`, `/app/write`, `/app/coach` | **partial** | offline behaviour audited in `tests/offlineRouteAudit.test.ts`; no dedicated e2e spec |
| `/onboarding`, `/placement`, `/app/library`, `/scenario/:id/*` | **partial** | `e2e/onboarding.spec.ts` 2/2; library/placement/quiz have unit coverage only |
| `/subscription`, `/trust/:page` | **partial** | `e2e/paywall.spec.ts` 4/4; legal links wired in RC-2; real payments are owner-only; V10 moved `/trust/:page` into its own lazy chunk and verified it 200 on production |
| `/app/progress` | **works** | `e2e/progress.spec.ts` (ROUTES covered), ledger RC-0 |
| iOS/Android real-device voice | **unverified** | owner-open item; tested only with Chromium's fake capture device |

## 2. Content state (measured)

- **Live D1** (`wrangler d1 execute katzu-content --remote`, read-only, this session): **5 scenarios, 114 vocabulary, 20 starter_phrases, 4 grammar**.
- **Drafts** (`docs/content/`): `curriculum-30day-module1.json` = 5 scen / 74 vocab / **49** phrases / 10 grammar, `review.status="approved"` (**changed in V10-3**: it was 30 phrases and `pending`); `curriculum-arrival-module2.json` = 5 / 49 / 42 / 4, `approved`. Both re-counted with `node scripts/load-curriculum.mjs --file=… --dry-run`.
- **Review files**: both exist — `docs/content/review-arrival-module2.md` (2026-09-28) and `docs/content/review-30day-module1.md` (2026-09-29: three defect classes per round, plus what a human should spot-check first). Both approvals are AI self-review with **no human review**, which is the gate's own permitted attribution — a native-speaker pass is still the only real check on idiomaticity.
- **Fixture** (`src/lib/db/katzuDb.ts`) is the offline fallback only; it seeds `cafe_order` + `apartment_viewing` (`seedStoryOpening`) and two arrivals via `seedArrivalTopUps` (ids ≥ 2000, insert-if-missing).
- Neither draft is loaded, though **V11 ran the authorized load as far as it can go**: the backup is taken (76,327 B, temp only, uncommitted), the pre-load counts and both collision checks were re-verified, and then the loader was **refused with `HTTP 401`** because the environment's `ADMIN_SECRET` is the 64-hex secret **wrapped in literal angle brackets** (66 chars, `<secret>`). **Nothing was written** — counts stay 5 / 114 / 20 / 4 and the new ids are still absent. Owner fixes, in order: rotate the secret (it was pasted into a chat prompt) and set the bare 64-hex value. So drafts ≠ live.

## 3. Architecture in 15 lines

1. React + TypeScript + Vite + Tailwind + React Router PWA (`index.html` → `src/main.tsx` → `src/App.tsx`).
2. Client state: Dexie/IndexedDB (`src/lib/db/katzuDb.ts`) — offline queue and local fallback.
3. Remote: one Cloudflare Worker `cloudflare-unified-worker.js` (+15 `cloudflare-*.js` modules) behind `src/lib/api/workerClient.ts`.
4. Data: D1 `katzu-content` (scenarios, vocabulary, grammar, starter_phrases — remote wins) · KV `USER_PROGRESS` (progress + authoritative AI quota) · KV `REDEEMED_CODES`.
5. AI path: `/ai/*` → `cloudflare-ai-router.js` multi-provider pool (Gemini active; Groq/OpenRouter/NVIDIA lists empty) → Workers AI `[ai]` fallback (`AI_FALLBACK_ENABLED=1`).
6. Every AI response is validated and bounded server-side; AI is never authoritative for billing or account state (`docs/agent/QUALITY.md`).
7. Auth: Google ID token → Worker verifies `aud` against `GOOGLE_CLIENT_ID`; `TEST_MODE` is ignored in production.
8. Entitlements: server-side subscription/activation state in D1 + KV; client is never authoritative.
9. Sync: rev-guarded merge in D1 `sync_revisions` (P2), client queues offline and retries.
10. Quota: per-account AI limits `AI_RATE_LIMIT_PER_MINUTE=10`, `AI_RATE_LIMIT_PER_DAY=200` + trial ledger.
11. Crypto sales live on a **separate** Pages site (`sales/` → `katzu-sales.pages.dev`) using NOWPayments sandbox; the app only redeems codes.
12. Ops: `MAINTENANCE_MODE` kill switch (shipped as `"off"`) and the `scheduled` retention handler, now activated by a deployed cron (`17 4 * * *`); `POST /admin/sweep` does the same job on demand.
13. Static: Cloudflare Pages `katzu-webapp-v3.pages.dev`.
14. Tests: Vitest (node/jsdom, 68 files / **815** tests) + Playwright (chromium, 10 files / 37 tests). Screens are code-split; V10 moved the last eagerly-imported non-first-paint route (`/trust/:page`) into its own chunk.
15. CI: `.github/workflows/ci.yml` (content audits, prod audit, Playwright job, secret scan).

## 4. Quality metrics (measured this session unless noted)

- Unit: `npm test` → **68 files / 815 tests, all pass** (6.2 s). The +6 are the module1 roster cases V10-3 made executable.
- E2E inventory: **10 spec files / 37 tests**, chromium only. **The whole suite now runs against the production bundle**: `E2E_TARGET=preview npx playwright test` → **37/37 passed**, 2.5 min on the V9 run (4.3 min on the V7-2 run; build ~7 s + tests), with service workers blocked. (One earlier run scored 36/37 on the flake below.)
- Types: `npx tsc --noEmit` exit 0 · `npx tsc -p e2e --noEmit` OK.
- Worker syntax: `node --check cloudflare-unified-worker.js` OK.
- Build: exit 0, 5.8–6.5 s, entry `index-*.js` **497.28 K / 157.50 K gzip**, `sw.js` precache **88 entries / 4172.71 KiB**, Vite still warns about one chunk > 500 kB.
- Bundle top 5: `index` 501 K · `LiveConversationScreen` 96 K · `JourneyHomeScreen` 32 K · `ProfileSettingsScreen` 24 K · `SubscriptionRedemptionScreen` 24 K (+ `index-*.css` 52 K).
- Audit: `npm audit --omit=dev --audit-level=high` → **0 vulnerabilities** (the Lighthouse devDependency adds 3 moderate advisories in the *dev* tree only; the production tree is unchanged — re-verified after the install).
- A11y: `e2e/accessibility.spec.ts` axe WCAG 2.0/2.1 A+AA, zero critical/serious (ledger B6).
- Real-D1 (V8-2, extended in V9-3): server-side sync compare-and-swap and crypto exactly-once pass on local `wrangler dev --local` D1, now **33/33 assertions** — the same two genuine races (one commit / one 409 with the union preserved, one delivery / one duplicate) plus the V9 additions: the first request on an empty database is a sync returning `200 rev:1` that creates all eight lazy tables, and the admin failure throttle gives `[401×5, 429]` with one persistent `count: 5` row. Raw rows read back out of the SQLite file.
- Lighthouse (V9-10, the first baseline; mobile, production, Lighthouse 13.5.0): `/` **73 / 84 / 100 / 100** (perf/a11y/best-practices/seo), `/demo` **72 / 93 / 100 / 100**, `/app/trail` **72 / 83 / 100 / 100** — but `/app/trail` redirected to `/welcome` without an account, so the Trail itself is still unmeasured. LCP 5.5–5.6 s dominates; the causes and two caveats are in the ledger (V9-10), including a 172 KB script this machine's anti-virus injects into every page.
- **Performance experiments (V10-4, local `vite preview`, 3 runs per route):** baseline `/` perf 73 / LCP 5430 ms / TBT 49 ms, `/demo` 72 / 5730 ms. Preload + `eager` + `fetchpriority=high` on the 175 KB hero PNG cut resource load delay 2303 → 455 ms but made the **median worse** (LCP 5879 ms, TBT 100 ms, perf 70); the same hints without the preload were still worse (perf 71, LCP 5611 ms) even though the in-trace LCP improved 958 → 707 ms. **Both reverted**, proved by an empty `git diff` and the reproduced baseline build hash. Kept: the trust pages became a lazy chunk → entry −3.65 kB, median LCP 5425 ms, TBT 31 ms, observed LCP 763 ms, score tied at 73. **Production after the V10 deploy:** `/` 72 / LCP 5115 ms, `/demo` 73 / LCP 5355 ms — unchanged-to-marginally-better, not a win.
- Flaky tests: **none known.** The `e2e/journey.spec.ts:320` flake is fixed at its cause (V8-1, `8313808`: the fake device held the audio level for only 6 animation frames); `E2E_TARGET=preview npx playwright test` is **37/37 twice**, and the spec is 8/8 under six CPU-saturating loops. The earlier banner-geometry flake was fixed in `8a65edf`.

## 5. Risk register (ranked by learner/trust impact)

| # | Risk | Evidence | Effort | Who |
|---|---|---|---|---|
| 1 | ~~Production runs pre-hardening code, incl. an AI-pool disclosure on the public `/health`~~ **FIXED (live)**: live `/health` now returns only `{status, service, ready, maintenance}` | ledger V7-3; `curl …/health` 2026-09-29 | — | closed |
| 2 | ~~18 commits unmerged to `main`~~ **FIXED (live)**: `main` fast-forwarded to `6bfe4fd`, `git rev-list --left-right --count main...launch-hardening` → `0 0` | ledger V7-3 | — | closed |
| 3 | ~~The shipping artifact fails e2e (26/37)~~ **FIXED**: 37/37 vs `vite preview` via `E2E_TARGET=preview` | ledger V7-2 | — | closed |
| 3b | **NEW:** `/admin` serves the control-plane HTML shell unauthenticated (200) | `curl -o /dev/null -w %{http_code} .../admin` → 200; the API behind it is gated (`/admin/api/users` → 401). Already an OWNER-OPEN item (Cloudflare Access) | S | owner |
| 3c | ~~one flaky e2e test (`e2e/journey.spec.ts:320`)~~ **FIXED**: the fake capture device now holds the audio until the harness measures real RMS (V8-1) | ledger V8-1; 37/37 twice vs `vite preview`, 8/8 under CPU load | — | closed |
| 4 | **The LCP is still the top score gap, and the cheap fixes are now proven not to work:** performance 72–73, LCP 5.1–5.4 s in production (5.4–5.8 s locally). V10-4 measured preload/eager/`fetchpriority` three ways and every variant made the median worse, so the remaining lever is the image's **weight** (175 KB PNG shown at 160 px; Lighthouse prices ~171 KB of waste, ~131 KB recoverable by format) plus the ∼65 KB (42 %) of the entry chunk unused on first paint | ledger V9-10 + V10-4 + V10-7; `lcp-discovery-insight`, `image-delivery-insight` and `unused-javascript` all score 0 | M | agent |
| 5 | ~~module1 unapproved~~ **module1 is `approved` since V10-3** (three defect classes fixed: 31 isolated words, ten unreachable grammar rows, six Arabic register/idiom slips). Still not live: the loader's `ADMIN_SECRET` is **set but malformed** — the 64-hex secret wrapped in `<`/`>` — so every authenticated call 401s (V11-2) | §2 counts; ledger V10-3/V11-2; `docs/agent/CONTENT-LOAD.md` precondition 5 | S | owner |
| 5b | **CHANGED (V11): the `ADMIN_SECRET` is compromised twice over** — pasted into a chat prompt in V10, and now exported to every agent shell by the app environment (where it is also malformed). Rotate it before the load, then set the new value | ledger V10-6/V11-2; the value is in the session history and in the process environment | S | **owner — do this first** |
| 6 | ~~Real-D1 behaviour unproven~~ **FIXED for local D1**: 23/23 assertions on `wrangler dev --local` incl. two real races | ledger V8-2; probe deleted, local only, production untouched | — | closed |
| 6b | ~~`POST /progress/sync` on a D1 with no ledger tables answers **500**~~ **FIXED (V9-1)**: the sync path now creates its tables first and degrades to the KV mirror instead of 500ing; the first request on an empty D1 returns `200 rev:1` in the probe | ledger V9-1/V9-3; `4d4e40e` | — | closed |
| 6c | **NEW, FIXED (V9-2):** `/admin/api/*` answered 401 for ever with no failure counter written, so the per-IP lockout could never engage on the dashboard's own data endpoints (the admin module's duplicate gate dropped the recording) | ledger V9-2; probe N3 `[401×5, 429]`, N3b one `count: 5` row; `4d4e40e` | — | closed |
| 7 | This machine can `wrangler deploy` (OAuth token, `workers (write)`) | `npx wrangler whoami` (this session) | S | owner/agent discipline |
| 8 | Payments are sandbox-only, legally unreviewed | `NOWPAYMENTS_ENVIRONMENT="test_mode"`; `OWNER-OPEN` counsel item | L | owner |
| 9 | ~~`MAINTENANCE_MODE` + cron trigger not configured → no automatic retention~~ **FIXED (V9-7, deployed V9-8)**: `MAINTENANCE_MODE="off"` is in `[vars]` and `[triggers] crons = ["17 4 * * *"]` is live, so retention runs at 04:17 UTC | ledger V9-7/V9-8; deploy printed `schedule: 17 4 * * *` | — | closed |
| 10 | Local dev has no `.env` → voice/AI paths degrade locally | only `.env.example` exists, no shell VITE_ vars (this session) | S | agent |

## 6. Ledger digest (`docs/AGENT-STATE.md`)

- **done**: Baseline · B1–B8 (content gate, learning loop, authoring, performance, reliability, a11y, docs, final gate) · RC-0 · RC-2 · RC-3 · RC-4 · RC-5 · V7-1 … V7-4.
- **done, new in V8**: `V8-1` `journey.spec.ts:320` flake fixed at its cause (37/37 twice) · `V8-2` real-local-D1 proof, 23/23 (sync CAS + crypto exactly-once) · `V8-3` ledger `main` hash reconciled to `48582ea`.
- **done, new in V9**: `V9-1` the sync path creates its own tables (V8-F0 fixed, with a strict fresh-DB double) · `V9-2` the ledger-writer audit plus the admin failure throttle, which never actually fired · `V9-3` real-D1 re-proof 33/33 and the full T2 gate · `V9-4` merge + worker deploy · `V9-6` the owner-authorized §3 content-load paragraph + `docs/agent/CONTENT-LOAD.md` (**both removed in V10-1 as unworkable**) · `V9-7` kill-switch config + retention cron · `V9-8` second T2 + merge + deploy (`255dbeef-…`) · `V9-10` the Lighthouse baseline · `V9-11` `docs/agent/OWNER-STEPS.md`.
- **done, new in V10**: `V10-1` the unworkable content-load paragraph removed · `V10-2` the env-secret amendment + runbook in its place · `V10-3` module1 through the Content Gate (31 isolated words, ten unreachable grammar rows, six Arabic slips; approved with AI self-review) · `V10-4` the performance pass (three variants, two reverted on the numbers, one kept) · `V10-5` T2 + merge + **Pages deploy** + production verification (worker deliberately not redeployed) · `V10-7` production Lighthouse re-measured. `V10-6` is the content load, `blocked` on `ADMIN_SECRET`.
- **blocked**: `V10-6` (and the earlier `V9-9`) the content load — it needs the owner's `ADMIN_SECRET`, and module1 would additionally be refused (review still `pending`). `RC-1` is now **done** (the baseline exists, V9-10). `RC-6` is **superseded**: its targets were authorized and executed in V7-3.
- **todo**: the two things the prompt asked for that an agent could still have done are both done, and the rest is owner-only. Nearest agent work: the LCP and first-load-JS causes from V9-10, a PK-aware D1 double for the counter's increment branch, and the two-device sync integration.
- **`OWNER-OPEN`**: two loader `--commit` runs (module2 is approved and its collision check is clean; module1 needs approval first) · Cloudflare Access on `/admin/*` · NOWPayments live mode after a sandbox pass · counsel review of legal pages · custom domain + OAuth origins + `VITE_PUBLIC_APP_URL` · real-device iOS/Android voice · beta cohort of 30–50 · a draft/live title difference on `airport_arrival`. **`MAINTENANCE_MODE` + the cron are done** (V9-7/V9-8); runbooks for the Access, voice, cohort and loader items are in `docs/agent/OWNER-STEPS.md`.
- **`UNPROVEN`** (V10 additions marked): the real content load · human content review (AI self-review only) · sync/crypto atomicity on the *deployed* database · the counter's insert-then-increment branch at unit level · the Trail's own Lighthouse numbers (it redirects to `/welcome` without an account) · a clean-machine Lighthouse run (this one shared the page with an anti-virus script) · visual 360/390 px and offline-recording checks · real-device voice. Now **covered** and so removed from this list: built-bundle e2e, local-D1 sync/crypto atomicity, and the Lighthouse baseline itself.

## 7. Recent changes

`git log -15 --oneline`, grouped:

- **Release-candidate stage**: `a74014a` RC-6 aborted deploy · `9539923` RC-5 1.1.0 + runbook · `2254dc3` RC-4 ledger · `c3ee78d` RC-4 kill switch/retention/`/health` · `8626f34`+`5b6d20a` RC-3 content · `8a5f4e1`+`c1ceeec` RC-2 first run · `4279759`+`7ff4bce` RC-0 adopt v5 manual.
- **Environment/docs**: `570f08a` pin LF on checkout · `5153157` e2e suite self-contained.
- **Product**: `c208f01` paywall price from the worker · `74bbddd` CI gates · `ea90517` Arabic safety disclaimers.

- **V7 stage**: `1b07f82` manual v7 + deploy runbook · `e82221f` block SW in e2e; built bundle 37/37 · `6bfe4fd` deploy snapshot + the merge that carried all 22 hardening/V7 commits to `main` · `48582ea` ledger + brief after the deploy.
- **V8 stage**: `8313808` fix the `journey.spec.ts:320` flake at its cause · `36802ae` the V8 ledger (real-D1 results and the `main` hash correction).
- **V9 stage**: `4d4e40e` every ledger route creates the tables it touches (V8-F0 + the admin throttle) · `ed038f4`/`6e7d7c0` ledger + the round-1 merge and worker deploy (`6aedfd50-…`) · `5f51093` §3 content-load amendment + runbook · `b11e66e` kill-switch config + retention cron · `eff72ae` content-load block + Lighthouse baseline · `09fb166` owner-steps runbook.
- **V9 round-2 deploy**: `main` fast-forwarded `6e7d7c0 → b11e66e` (no force); the live worker is now `255dbeef-…` and prints `schedule: 17 4 * * *`.

`main` reached `b11e66e` at the round-2 merge with `git rev-list --left-right --count main...launch-hardening` → `0 0`, and the branch was pushed both times. The live worker is `255dbeef-faae-476a-b3f5-6d4666099b70`. The V7 deploy was also a fast-forward: `22fe6aa → 6bfe4fd`.

## 8. Live vs local drift (read-only only)

**Drift closed as of 2026-09-29 (V10):** production runs worker `255dbeef-…` built from `b11e66e` (V9's deploy — V10 changed no worker file) and Pages built from `e487654` (V10's push), so the only distance between the tree and production is this ledger/brief commit. V10 changed `src/App.tsx`, `src/lib/content/scenarioGrammar.ts`, `index.html` briefly (reverted in-phase), tests and content/docs — `src/` changed, which is exactly why Pages needed deploying this time and the worker did not.

| | Production (live, after V10-5) | Working tree |
|---|---|---|
| Commit | `e487654` — Pages deployment `2c245106-…` serving `index-CWWIxWb7.js`; worker unchanged at `255dbeef-…` with cron `17 4 * * *` | `e487654` + this ledger/brief commit |
| `/health` | `{status, service, ready, maintenance}` — no pool/models/strategy | same |
| D1 content | 5 scenarios / 114 vocab / 20 phrases / 4 grammar | same; both drafts still not loaded |
| Kill switch / retention | `MAINTENANCE_MODE="off"` **live** and the cron `17 4 * * *` **deployed** | same (V9-7/V9-8) |
| Sales site | `katzu-sales.pages.dev` 200, NOWPayments sandbox `ready:false` | unchanged |

The V9 worker was deployed twice; no D1 migration, no manual D1 write and no content load was made, and no secret was read.

## 9. Recommended next 5 (highest value first)

1. ~~Make the sync path create its own tables (risk 6b / V8-F0)~~ **DONE in V9-1/V9-3**: the first `POST /progress/sync` on a wiped local D1 returns `200 rev:1` and creates all eight lazy tables. Its place: **teach `FreshD1` PRIMARY KEY semantics** so the failure counter's insert-then-increment branch is unit-tested, not only probe-tested.
2. **Fix the LCP path by weight, not by hints** (V10-4 outcome). Reason: LCP 5.1–5.4 s in production is still the largest single score contributor, and V10-4 proved the hint route is a dead end — every variant that prioritised the 175 KB PNG made the median worse. The next lever is converting `katzu_welcome.png` to WebP/AVIF at 160–256 px (Lighthouse: ~171 KB wasted, ~131 KB recoverable by format) and re-measuring the same way. Gate: same 3-run median method, LCP down, no metric worse.
3. **Cut first-load JavaScript** (V9-10 cause 2). Reason: 42 % of the app's own entry bundle (65 KB of 155 KB) is unused on first paint, and FCP 3.2 s with TBT only 40 ms says the cost is fetch+parse. Gate: smaller initial chunk, FCP and SI down, e2e still 37/37.
4. **Cloudflare Access in front of `/admin/*`** (owner). Reason: the control-plane shell still answers 200 unauthenticated. Runbook + curl gate are in `docs/agent/OWNER-STEPS.md`. Gate: anonymous `/admin` is challenged, `/admin/api/*` still 401.
5. **Rotate the pasted `ADMIN_SECRET` and set the bare value, then load module2 and module1** (owner). Reason: both drafts are approved, audited, dry-run and collision-checked against live D1, the **backup is already taken** (V11-1) — only the credential blocks it, and it fails today because the environment holds the secret wrapped in angle brackets, so the loader 401s (V11-2). Rotating first is still the right order, because the same secret was pasted into a chat prompt. Gate: loader `--commit` per `docs/agent/CONTENT-LOAD.md` + counts in the ledger. Expected ceilings (live + both drafts; the loader skips rows whose `level\|german\|topic` or `scenario_id\|german` already exists, so the real result may be lower): **15 scenarios** (5 + 5 + 5, all ids collision-checked as absent), **237 vocabulary** (114 + 74 + 49), **111 phrases** (20 + 49 + 42), **18 grammar** (4 + 10 + 4).
