# PROJECT-BRIEF — Katzu snapshot for the owner's advisor

Recon date 2026-09-29; **deployed the same day** (owner-authorized): the deploy is at `6bfe4fd` (worker `07d7d341-…`, Pages production `cbfb29f5-…`), and `main` is now `48582ea` — the V7-4 docs commit on top of it. `launch-hardening` is `main` plus the V8 commits (`8313808`, the V8 ledger) and the V9 commit (`4d4e40e`); the V9 merge + worker deploy run under the owner's `DEPLOY-AUTHORIZED: merge, worker` line. Sections marked *(live)* reflect the V7 deploy until that V9 deploy lands.
Every claim cites a path, a command result, or a ledger line. Unverified claims sit under **UNKNOWN**.
Environment facts: `docs/agent/ENV-FACTS.md`. Status: `docs/AGENT-STATE.md`.

## 1. Product state (what a learner can do today)

Arabic-first German-learning PWA. Public demo needs no account and makes no AI call (`docs/agent/QUALITY.md`, "Product").

| Route | State | Proof |
|---|---|---|
| `/demo` public demo | **works** | `npx playwright test e2e/demo.spec.ts` → 1 passed, 8 s vs dev, 7 s vs `vite preview` (this session) |
| `/app/trail` (Journey Home) | **works** | `e2e/journey.spec.ts` 12/12 + `e2e/firstRun.spec.ts` 3/3, ledger RC-5 (not rerun this session) |
| Story Setup → Guided Practice → Live Conversation → Debrief | **works** | `e2e/journey.spec.ts`, `e2e/conversationLayout.spec.ts`, `e2e/microphone.spec.ts`; ledger RC-0 rerun |
| `/app/review`, `/app/listen`, `/app/write`, `/app/coach` | **partial** | offline behaviour audited in `tests/offlineRouteAudit.test.ts`; no dedicated e2e spec |
| `/onboarding`, `/placement`, `/app/library`, `/scenario/:id/*` | **partial** | `e2e/onboarding.spec.ts` 2/2; library/placement/quiz have unit coverage only |
| `/subscription`, `/trust/:page` | **partial** | `e2e/paywall.spec.ts` 4/4; legal links wired in RC-2; real payments are owner-only |
| `/app/progress` | **works** | `e2e/progress.spec.ts` (ROUTES covered), ledger RC-0 |
| iOS/Android real-device voice | **unverified** | owner-open item; tested only with Chromium's fake capture device |

## 2. Content state (measured)

- **Live D1** (`wrangler d1 execute katzu-content --remote`, read-only, this session): **5 scenarios, 114 vocabulary, 20 starter_phrases, 4 grammar**.
- **Drafts** (`docs/content/`): `curriculum-30day-module1.json` = 5 scen / 74 vocab / 30 phrases / 10 grammar, `review.status="pending"`; `curriculum-arrival-module2.json` = 5 / 49 / 42 / 4, `review.status="approved"` (both counted this session with `node -e`).
- **Review files**: only `docs/content/review-arrival-module2.md` exists. Module1 has **no** review file, consistent with `pending`.
- **Fixture** (`src/lib/db/katzuDb.ts`) is the offline fallback only; it seeds `cafe_order` + `apartment_viewing` (`seedStoryOpening`) and two arrivals via `seedArrivalTopUps` (ids ≥ 2000, insert-if-missing).
- Neither draft is loaded: the loader requires the owner's `ADMIN_SECRET` (`OWNER-OPEN`). So drafts ≠ live.

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
12. Ops: `MAINTENANCE_MODE` kill switch, `POST /admin/sweep` retention, `scheduled` handler (inert — no cron trigger).
13. Static: Cloudflare Pages `katzu-webapp-v3.pages.dev`.
14. Tests: Vitest (node/jsdom, 67 files) + Playwright (chromium, 10 files / 37 tests).
15. CI: `.github/workflows/ci.yml` (content audits, prod audit, Playwright job, secret scan).

## 4. Quality metrics (measured this session unless noted)

- Unit: `npm test` → **68 files / 807 tests, all pass** (6.6 s).
- E2E inventory: **10 spec files / 37 tests**, chromium only. **The whole suite now runs against the production bundle**: `E2E_TARGET=preview npx playwright test` → **37/37 passed**, 2.5 min on the V9 run (4.3 min on the V7-2 run; build ~7 s + tests), with service workers blocked. (One earlier run scored 36/37 on the flake below.)
- Types: `npx tsc --noEmit` exit 0 · `npx tsc -p e2e --noEmit` OK.
- Worker syntax: `node --check cloudflare-unified-worker.js` OK.
- Build: exit 0, 6.8 s, entry `index-*.js` 500.93 K / 158.53 K gzip, `sw.js` precache 86 entries / 4171.99 KiB, Vite warns one chunk > 500 kB.
- Bundle top 5: `index` 492 K · `LiveConversationScreen` 96 K · `JourneyHomeScreen` 32 K · `ProfileSettingsScreen` 24 K · `SubscriptionRedemptionScreen` 24 K (+ `index-*.css` 52 K).
- Audit: `npm audit --omit=dev --audit-level=high` → **0 vulnerabilities**.
- A11y: `e2e/accessibility.spec.ts` axe WCAG 2.0/2.1 A+AA, zero critical/serious (ledger B6).
- Real-D1 (V8-2, extended in V9-3): server-side sync compare-and-swap and crypto exactly-once pass on local `wrangler dev --local` D1, now **33/33 assertions** — the same two genuine races (one commit / one 409 with the union preserved, one delivery / one duplicate) plus the V9 additions: the first request on an empty database is a sync returning `200 rev:1` that creates all eight lazy tables, and the admin failure throttle gives `[401×5, 429]` with one persistent `count: 5` row. Raw rows read back out of the SQLite file.
- Flaky tests: **none known.** The `e2e/journey.spec.ts:320` flake is fixed at its cause (V8-1, `8313808`: the fake device held the audio level for only 6 animation frames); `E2E_TARGET=preview npx playwright test` is **37/37 twice**, and the spec is 8/8 under six CPU-saturating loops. The earlier banner-geometry flake was fixed in `8a65edf`.

## 5. Risk register (ranked by learner/trust impact)

| # | Risk | Evidence | Effort | Who |
|---|---|---|---|---|
| 1 | ~~Production runs pre-hardening code, incl. an AI-pool disclosure on the public `/health`~~ **FIXED (live)**: live `/health` now returns only `{status, service, ready, maintenance}` | ledger V7-3; `curl …/health` 2026-09-29 | — | closed |
| 2 | ~~18 commits unmerged to `main`~~ **FIXED (live)**: `main` fast-forwarded to `6bfe4fd`, `git rev-list --left-right --count main...launch-hardening` → `0 0` | ledger V7-3 | — | closed |
| 3 | ~~The shipping artifact fails e2e (26/37)~~ **FIXED**: 37/37 vs `vite preview` via `E2E_TARGET=preview` | ledger V7-2 | — | closed |
| 3b | **NEW:** `/admin` serves the control-plane HTML shell unauthenticated (200) | `curl -o /dev/null -w %{http_code} .../admin` → 200; the API behind it is gated (`/admin/api/users` → 401). Already an OWNER-OPEN item (Cloudflare Access) | S | owner |
| 3c | ~~one flaky e2e test (`e2e/journey.spec.ts:320`)~~ **FIXED**: the fake capture device now holds the audio until the harness measures real RMS (V8-1) | ledger V8-1; 37/37 twice vs `vite preview`, 8/8 under CPU load | — | closed |
| 4 | No Lighthouse numbers at all | ledger RC-1 `blocked`; Lighthouse not installed | M | agent |
| 5 | Two approved/pending modules are not live; module1 is `pending` so a load would be refused | §2 counts; `OWNER-OPEN` loader commands | S | owner |
| 6 | ~~Real-D1 behaviour unproven~~ **FIXED for local D1**: 23/23 assertions on `wrangler dev --local` incl. two real races | ledger V8-2; probe deleted, local only, production untouched | — | closed |
| 6b | ~~`POST /progress/sync` on a D1 with no ledger tables answers **500**~~ **FIXED (V9-1)**: the sync path now creates its tables first and degrades to the KV mirror instead of 500ing; the first request on an empty D1 returns `200 rev:1` in the probe | ledger V9-1/V9-3; `4d4e40e` | — | closed |
| 6c | **NEW, FIXED (V9-2):** `/admin/api/*` answered 401 for ever with no failure counter written, so the per-IP lockout could never engage on the dashboard's own data endpoints (the admin module's duplicate gate dropped the recording) | ledger V9-2; probe N3 `[401×5, 429]`, N3b one `count: 5` row; `4d4e40e` | — | closed |
| 7 | This machine can `wrangler deploy` (OAuth token, `workers (write)`) | `npx wrangler whoami` (this session) | S | owner/agent discipline |
| 8 | Payments are sandbox-only, legally unreviewed | `NOWPAYMENTS_ENVIRONMENT="test_mode"`; `OWNER-OPEN` counsel item | L | owner |
| 9 | `MAINTENANCE_MODE` + cron trigger not configured → no automatic retention | `wrangler.toml` has neither; ledger RC-4 | S | owner |
| 10 | Local dev has no `.env` → voice/AI paths degrade locally | only `.env.example` exists, no shell VITE_ vars (this session) | S | agent |

## 6. Ledger digest (`docs/AGENT-STATE.md`)

- **done**: Baseline · B1–B8 (content gate, learning loop, authoring, performance, reliability, a11y, docs, final gate) · RC-0 · RC-2 · RC-3 · RC-4 · RC-5 · V7-1 … V7-4.
- **done, new in V8**: `V8-1` `journey.spec.ts:320` flake fixed at its cause (37/37 twice) · `V8-2` real-local-D1 proof, 23/23 (sync CAS + crypto exactly-once) · `V8-3` ledger `main` hash reconciled to `48582ea`.
- **done, new in V9**: `V9-1` the sync path creates its own tables (V8-F0 fixed, with a strict fresh-DB double) · `V9-2` the ledger-writer audit plus the admin failure throttle, which never actually fired · `V9-3` real-D1 re-proof 33/33 and the full T2 gate.
- **blocked**: `RC-1` (Lighthouse not installed — the only item with no evidence at all). `RC-6` is now **superseded**: its targets were authorized and executed in V7-3.
- **todo**: nothing agent-runnable in this thread is open (risks 6b/6c are closed). Nearest follow-ups: RC-1 Lighthouse · a PK-aware D1 double for the counter's increment branch · the two-device sync integration.
- **`OWNER-OPEN`**: two loader `--commit` runs (module2, module1) · `MAINTENANCE_MODE` + cron trigger · Cloudflare Access on `/admin/*` · NOWPayments live mode after a sandbox pass · counsel review of legal pages · custom domain + OAuth origins + `VITE_PUBLIC_APP_URL` · worker/Pages deploys · real-device iOS/Android voice · beta cohort of 30–50 · a draft/live title difference on `airport_arrival`.
- **`UNPROVEN`**: loader remote dry-run/real load · human content review (AI self-review only) · built-bundle e2e · anything against production D1 · real-D1 sync/crypto atomicity · Lighthouse · visual 360/390 px and offline-recording checks.

## 7. Recent changes

`git log -15 --oneline`, grouped:

- **Release-candidate stage**: `a74014a` RC-6 aborted deploy · `9539923` RC-5 1.1.0 + runbook · `2254dc3` RC-4 ledger · `c3ee78d` RC-4 kill switch/retention/`/health` · `8626f34`+`5b6d20a` RC-3 content · `8a5f4e1`+`c1ceeec` RC-2 first run · `4279759`+`7ff4bce` RC-0 adopt v5 manual.
- **Environment/docs**: `570f08a` pin LF on checkout · `5153157` e2e suite self-contained.
- **Product**: `c208f01` paywall price from the worker · `74bbddd` CI gates · `ea90517` Arabic safety disclaimers.

- **V7 stage**: `1b07f82` manual v7 + deploy runbook · `e82221f` block SW in e2e; built bundle 37/37 · `6bfe4fd` deploy snapshot + the merge that carried all 22 hardening/V7 commits to `main` · `48582ea` ledger + brief after the deploy.
- **V8 stage**: `8313808` fix the `journey.spec.ts:320` flake at its cause · `36802ae` the V8 ledger (real-D1 results and the `main` hash correction).
- **V9 stage (this run)**: `4d4e40e` every ledger route creates the tables it touches (V8-F0 fixed; the admin failure throttle fixed) · plus the docs commit carrying the 33/33 probe and the T2 gate.

`main` = `48582ea`; `launch-hardening` was ahead of it by the V8 commits and is now ahead by V9 as well. The V7 deploy was a fast-forward: `22fe6aa → 6bfe4fd`, and production still runs that commit until the V9 worker deploy lands.

## 8. Live vs local drift (read-only only)

**Worker drift as of 2026-09-29 (V9):** production runs `6bfe4fd` (V7 worker `07d7d341-…`). The working tree adds V8 (test-harness only) and **V9, which does change worker code** — `cloudflare-unified-worker.js` and `cloudflare-admin.js` — so the live worker is the pre-V9 code until the authorized V9 merge + deploy lands. No `src/` file changed in V8 or V9, so the Pages bundle is unaffected.

| | Production (live, after V7-3) | Working tree |
|---|---|---|
| Commit | `6bfe4fd` — Pages production `cbfb29f5-…`, worker `07d7d341-…` | `main` `48582ea`, `launch-hardening` = `48582ea` + V8 + V9 (`4d4e40e`) |
| `/health` | `{status, service, ready, maintenance}` — no pool/models/strategy | same |
| D1 content | 5 scenarios / 114 vocab / 20 phrases / 4 grammar | same; both drafts still not loaded |
| Kill switch / retention | `MAINTENANCE_MODE` present but off; still no cron trigger | same |
| Sales site | `katzu-sales.pages.dev` 200, NOWPayments sandbox `ready:false` | unchanged |

Nothing was deployed, no D1 write was made, no secret was read.

## 9. Recommended next 5 (highest value first)

1. ~~Make the sync path create its own tables (risk 6b / V8-F0)~~ **DONE in V9-1/V9-3**: the first `POST /progress/sync` on a wiped local D1 returns `200 rev:1` and creates all eight lazy tables. Its place: **teach `FreshD1` PRIMARY KEY semantics** so the failure counter's insert-then-increment branch is unit-tested, not only probe-tested.
2. **Lighthouse baseline** on `/`, `/demo`, Trail. Reason: the only backlog item with no evidence at all. Gate: numbers recorded in the ledger.
3. **Drive the client's 409→refetch→retry loop from two real browsers** against one local D1. Reason: V8-2 proved the server contract; the client half is still only unit-tested. Gate: two contexts, one database, union preserved.
4. **Cloudflare Access in front of `/admin/*`** (owner). Reason: the control-plane shell answers 200 unauthenticated today. Gate: anonymous `/admin` is challenged.
5. **Load the two approved/pending modules** (owner, needs `ADMIN_SECRET`). Reason: 10 authored scenarios and 123 vocabulary rows are sitting unused while live D1 holds 5. Gate: loader `--commit` + row counts in the ledger.
