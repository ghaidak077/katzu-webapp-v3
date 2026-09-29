# PROJECT-BRIEF — Katzu snapshot for the owner's advisor

Recon date 2026-09-29; **deployed the same day** (owner-authorized): `main` = `launch-hardening` = `6bfe4fd`, worker `07d7d341-…`, Pages production `cbfb29f5-…`. Sections marked *(live)* reflect the deploy.
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

- Unit: `npm test` → **67 files / 799 tests, all pass** (9 s).
- E2E inventory: **10 spec files / 37 tests**, chromium only. **The whole suite now runs against the production bundle**: `E2E_TARGET=preview npx playwright test` → **37/37 passed**, 4.3 min (build 14 s + tests), with service workers blocked. (One earlier run scored 36/37 on the flake below.)
- Types: `npx tsc --noEmit` exit 0 · `npx tsc -p e2e --noEmit` OK.
- Worker syntax: `node --check cloudflare-unified-worker.js` OK.
- Build: exit 0, 17 s, `dist` 4.4 M, entry `index-*.js` 492 K, `sw.js` precache 86 entries / 4171.99 KiB, Vite warns one chunk > 500 kB.
- Bundle top 5: `index` 492 K · `LiveConversationScreen` 96 K · `JourneyHomeScreen` 32 K · `ProfileSettingsScreen` 24 K · `SubscriptionRedemptionScreen` 24 K (+ `index-*.css` 52 K).
- Audit: `npm audit --omit=dev --audit-level=high` → **0 vulnerabilities**.
- A11y: `e2e/accessibility.spec.ts` axe WCAG 2.0/2.1 A+AA, zero critical/serious (ledger B6).
- Flaky tests: **UNKNOWN** — no reruns this session; the only known earlier flake (banner geometry) was fixed in `8a65edf`.

## 5. Risk register (ranked by learner/trust impact)

| # | Risk | Evidence | Effort | Who |
|---|---|---|---|---|
| 1 | ~~Production runs pre-hardening code, incl. an AI-pool disclosure on the public `/health`~~ **FIXED (live)**: live `/health` now returns only `{status, service, ready, maintenance}` | ledger V7-3; `curl …/health` 2026-09-29 | — | closed |
| 2 | ~~18 commits unmerged to `main`~~ **FIXED (live)**: `main` fast-forwarded to `6bfe4fd`, `git rev-list --left-right --count main...launch-hardening` → `0 0` | ledger V7-3 | — | closed |
| 3 | ~~The shipping artifact fails e2e (26/37)~~ **FIXED**: 37/37 vs `vite preview` via `E2E_TARGET=preview` | ledger V7-2 | — | closed |
| 3b | **NEW:** `/admin` serves the control-plane HTML shell unauthenticated (200) | `curl -o /dev/null -w %{http_code} .../admin` → 200; the API behind it is gated (`/admin/api/users` → 401). Already an OWNER-OPEN item (Cloudflare Access) | S | owner |
| 3c | **NEW:** one flaky e2e test (`e2e/journey.spec.ts:320`) — 1 failure in 3 preview runs | ledger UNPROVEN + LESSONS; passes 3/3 standalone and in two other full runs | S | agent |
| 4 | No Lighthouse numbers at all | ledger RC-1 `blocked`; Lighthouse not installed | M | agent |
| 5 | Two approved/pending modules are not live; module1 is `pending` so a load would be refused | §2 counts; `OWNER-OPEN` loader commands | S | owner |
| 6 | Real-D1 behaviour unproven — sync compare-and-swap and crypto idempotency only tested on fakes | ledger UNPROVEN; AGENTS.md §5 | M | agent |
| 7 | This machine can `wrangler deploy` (OAuth token, `workers (write)`) | `npx wrangler whoami` (this session) | S | owner/agent discipline |
| 8 | Payments are sandbox-only, legally unreviewed | `NOWPAYMENTS_ENVIRONMENT="test_mode"`; `OWNER-OPEN` counsel item | L | owner |
| 9 | `MAINTENANCE_MODE` + cron trigger not configured → no automatic retention | `wrangler.toml` has neither; ledger RC-4 | S | owner |
| 10 | Local dev has no `.env` → voice/AI paths degrade locally | only `.env.example` exists, no shell VITE_ vars (this session) | S | agent |

## 6. Ledger digest (`docs/AGENT-STATE.md`)

- **done**: Baseline · B1–B8 (content gate, learning loop, authoring, performance, reliability, a11y, docs, final gate) · RC-0 · RC-2 · RC-3 · RC-4 · RC-5.
- **done, new this run**: `V7-1` manual v7 + deploy runbook · `V7-2` built bundle 37/37 · `V7-3` merge + worker + Pages deploy, verified · `V7-4` report + brief.
- **blocked**: `RC-1` (Lighthouse not installed — the only item with no evidence at all). `RC-6` is now **superseded**: its targets were authorized and executed in V7-3.
- **todo**: nothing agent-run is open except the flaky test (3c); everything else is owner-only.
- **`OWNER-OPEN`**: two loader `--commit` runs (module2, module1) · `MAINTENANCE_MODE` + cron trigger · Cloudflare Access on `/admin/*` · NOWPayments live mode after a sandbox pass · counsel review of legal pages · custom domain + OAuth origins + `VITE_PUBLIC_APP_URL` · worker/Pages deploys · real-device iOS/Android voice · beta cohort of 30–50 · a draft/live title difference on `airport_arrival`.
- **`UNPROVEN`**: loader remote dry-run/real load · human content review (AI self-review only) · built-bundle e2e · anything against production D1 · real-D1 sync/crypto atomicity · Lighthouse · visual 360/390 px and offline-recording checks.

## 7. Recent changes

`git log -15 --oneline`, grouped:

- **Release-candidate stage**: `a74014a` RC-6 aborted deploy · `9539923` RC-5 1.1.0 + runbook · `2254dc3` RC-4 ledger · `c3ee78d` RC-4 kill switch/retention/`/health` · `8626f34`+`5b6d20a` RC-3 content · `8a5f4e1`+`c1ceeec` RC-2 first run · `4279759`+`7ff4bce` RC-0 adopt v5 manual.
- **Environment/docs**: `570f08a` pin LF on checkout · `5153157` e2e suite self-contained.
- **Product**: `c208f01` paywall price from the worker · `74bbddd` CI gates · `ea90517` Arabic safety disclaimers.

- **V7 stage (this run)**: `1b07f82` manual v7 + deploy runbook · `e82221f` block SW in e2e; built bundle 37/37 · `6bfe4fd` deploy snapshot + the merge that carried all 22 hardening/V7 commits to `main`.

`main` and `launch-hardening` are now identical (`git rev-list --left-right --count main...launch-hardening` → `0 0`), so the old `main...launch-hardening` diff no longer exists. The deploy was a fast-forward: `22fe6aa → 6bfe4fd`.

## 8. Live vs local drift (read-only only)

**No drift as of 2026-09-29:** production and the working tree are the same commit (`6bfe4fd`).

| | Production (live, after V7-3) | Working tree |
|---|---|---|
| Commit | `6bfe4fd` — Pages production `cbfb29f5-…`, worker `07d7d341-…` | `6bfe4fd` (`launch-hardening`) |
| `/health` | `{status, service, ready, maintenance}` — no pool/models/strategy | same |
| D1 content | 5 scenarios / 114 vocab / 20 phrases / 4 grammar | same; both drafts still not loaded |
| Kill switch / retention | `MAINTENANCE_MODE` present but off; still no cron trigger | same |
| Sales site | `katzu-sales.pages.dev` 200, NOWPayments sandbox `ready:false` | unchanged |

Nothing was deployed, no D1 write was made, no secret was read.

## 9. Recommended next 5 (highest value first)

1. **Fix the flaky test** `e2e/journey.spec.ts:320` (close risk 3c). Reason: a flaky test is a bug (v7 §5) and it is the only thing standing between the suite and a clean 37/37 twice in a row. Gate: 5 consecutive passes of that spec.
2. **Lighthouse baseline** on `/`, `/demo`, Trail. Reason: the only backlog item with no evidence at all. Gate: numbers recorded in the ledger.
3. **Real-D1 local run** (`wrangler dev --local`) for sync compare-and-swap and crypto idempotency. Reason: both are proven only against fakes. Gate: one passing integration test per path.
4. **Cloudflare Access in front of `/admin/*`** (owner). Reason: the control-plane shell answers 200 unauthenticated today. Gate: anonymous `/admin` is challenged.
5. **Load the two approved/pending modules** (owner, needs `ADMIN_SECRET`). Reason: 10 authored scenarios and 123 vocabulary rows are sitting unused while live D1 holds 5. Gate: loader `--commit` + row counts in the ledger.
