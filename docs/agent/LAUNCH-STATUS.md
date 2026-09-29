# LAUNCH-STATUS — closed-beta readiness

**Scope, stated plainly: this is a *closed-beta go-live*, not a public launch.** The
product is free / code-only: there is no working payment path in the app (by design,
the sales site owns crypto checkout and its provider keys are absent), no store
listing, no custom domain, and no paid marketing. What "ready" means here is *a
cohort of 30–50 invited Arabic-speaking learners can be handed the app and use it
without an agent in the loop*. Everything that a public, paid launch would need is
listed separately as **OWNER-ONLY** or **BLOCKED** so it is not mistaken for done.

- Audited at commit **`c7ab71b`** (V17 tree) under V18; CI run **`36570416704`** green
  (verify · e2e · secret-scan).
- App `https://katzu-webapp-v3.pages.dev` · worker `https://katzu-test.ghaidakalosh008.workers.dev`
  · sales `https://katzu-sales.pages.dev`.
- Live content after the V18 load: **15 scenarios / 221 vocabulary / 111 phrases / 22 grammar**.

**How to read the status column**

| Status | Meaning |
| --- | --- |
| **READY** | verified in V18 by a command whose output is quoted here, and nothing owner-side is needed to keep it true |
| **OWNER-ONLY** | it works or is merely unconfigured, and only the owner holds the account/identity/money/legal decision to change it |
| **BLOCKED** | it is broken or cannot be verified, and it gates the beta |

---

## 1. Production smoke battery (live URL) — **READY**

`node scripts/verification-battery.cjs` → **12/12 PASS** against the deployed app
(read-only; the script creates nothing but its own browser profile):

| Check | Evidence (from the run) |
| --- | --- |
| Landing renders, no blank screen | `root populated`, Arabic-first copy |
| Anonymous `/app/trail` does not 404/blank | landed on `/welcome` |
| No uncaught console errors on landing | `clean` |
| Signed-out demo opens a real lesson | `intro=true, dir=rtl, ltrNodes=1` |
| The demo reaches its own German input without an account | `started=true, ltrInput=true` |
| No console errors inside the demo | `clean` |
| No horizontal overflow 320→1440 px | `all widths clean` |
| Anonymous storage contains no tokens | `localStorage keys: katzu_analytics_queue_v1, katzu_install_id; cookies: 0` |
| Initial load < 6 s headless | `297 ms, LCP 324 ms, JS 155KB over 3 requests` |
| **Offline shell loads** | `ready=true, worker=activated, precache=90, nav=ok, root populated=true` |
| Trust/privacy page reachable in the deployed app | `privacy copy visible=true` |
| PWA manifest valid | `name=Katzu — رفيقك لتعلم الألمانية, icons=2, lang=ar` |

Route-level probe (curl, V18): `/`, `/demo`, `/welcome`, `/signin`, `/trust/privacy`,
`/trust/terms`, `/trust/imprint`, `/trust/refund`, `/sw.js`, `/manifest.webmanifest`,
`/robots.txt`, `/sitemap.xml` → **all 200**; `katzu-sales.pages.dev` → 200.

Full demo walk, fresh incognito tab, no account: four steps completed (phrase →
vocabulary → two comprehension questions answered correctly with Arabic feedback →
typed sentence `Mein Koffer ist nicht angekommen.` graded correct) → completion screen
naming «في المطار: الأمتعة» with a review-card offer; **console empty**, network log
shows `/scenarios` `/vocabulary` `/grammar` `/analytics/events` all 200, the hero
served as `katzu_welcome.webp`, and **no `/ai/turn`** anywhere in the log — the public
demo costs nothing and needs no account.

## 2. Worker, bindings and infrastructure — **READY** (rollback targets in §6)

| Check | Status | Evidence |
| --- | --- | --- |
| `/health` is trimmed | READY | `{"status":"healthy","service":"Katzu Unified Worker","ready":true,"maintenance":false}` — asserted key-for-key (no pool/model/strategy disclosure) |
| `/crypto/health` honest about being unconfigured | READY | `ready:false`, `apiKeyConfigured:false`, `ipnSecretConfigured:false`, `environment:"test_mode"` — flags only, no key value |
| Admin API closed | READY | `/admin/api/users` and `/admin/api/schema` **401** without a secret; with the secret 200 (proved against the local real D1); the per-IP throttle `[401×5, 429]` is unit-tested (`tests/workerSecurity.test.ts`) |
| `MAINTENANCE_MODE` present and **off** | READY | `wrangler.toml:91 MAINTENANCE_MODE = "off"`; live `/health` `maintenance:false` |
| Retention cron registered | READY | `wrangler.toml:128 crons = ["17 4 * * *"]`, deployed with version #111 (V15-4 verified it intact) |
| D1 reachable from this machine | READY | `wrangler d1 export … --remote` and `wrangler d1 execute … --remote` both used successfully in V18 → the **`D1:Edit` token item in `LAUNCH-CHECKLIST.md` §2.2 item 8 is stale and resolved** |
| Content matches the drafts | READY | `node scripts/check-content-drift.mjs` **exit 0**: scenarios 10/10, phrases 91/91, grammar 18/18 identical, vocabulary 0 absent, 0 duplicate keys (16 rows still `diverged` = pre-module catalogue rows the loader intentionally skipped) |
| Every grammar row is reachable | READY | 15 scenarios mapped in `SCENARIO_GRAMMAR_IDS`; **18 of the 22 live rows are reachable**; the 4 unreachable are the legacy `akkusativ_articles` / `dativ_prepositions` / `konjunktiv_ii` / `perfekt_tense` rows the owner chose not to rename (§2.2 item 6 of the checklist); **0 mapped ids lack a live row** — the V18 load gave the five original scenarios their first live rule to teach |

## 3. Free / code-only path — **READY**

**No money can leave a learner's hands.** Structurally: `src/` contains **zero**
references to `crypto/checkout`, `billing/checkout` or `checkout_url` (only `sales/`
does), and the app-side checkout code was reverted in the 2026-09-26 pass. Live and
local both: `POST /crypto/checkout` → **503** `crypto_not_configured` with an Arabic
message, `POST /crypto/webhook` with no signature → **401**, `/crypto/health`
`ready:false`. Until the owner sets the provider secrets, the paid path is inert — a
closed beta cannot accidentally charge anyone.

**Activation-code redemption + entitlement, on the local real-D1 harness — 15/15 PASS.**
Method (temporary, deleted after the run): `wrangler dev --local` with the V8-F1
wrapper entry, its **own** `--persist-to .wrangler/v18-probe/state` on a wiped
directory, throwaway local `--var` secrets (`ADMIN_SECRET`, `HMAC_SECRET`,
`GOOGLE_CLIENT_ID`, `TEST_MODE:1`, `ENVIRONMENT:test`) and a hand-built `alg:RS256`
identity token. Nothing pointed at production: no remote binding, no production D1 or
KV write, no real secret, no provider call.

| Check | Result |
| --- | --- |
| `/health` healthy, maintenance off, no extra fields | PASS |
| `/crypto/checkout` refuses without a key (cannot charge) | PASS — 503 |
| `/crypto/health` exposes flags only, no key value | PASS |
| `/crypto/webhook` refuses an unsigned body | PASS — 401 |
| `/admin/api/users` without a secret → 401, with the (local) secret → 200 | PASS |
| `/admin/generate` mints a `DE-1M-…` code | PASS |
| A free account is **not** Pro before redeeming | PASS — `active:false, days_remaining:0` |
| `/verify` redeems the code → Pro for 1 month | PASS — `valid:true`, expiry +30 days |
| `/check-status` then reports Pro active with ~30 days left | PASS — `active:true, days_remaining:30` |
| The same code cannot be redeemed by another account | PASS — `already_redeemed` |
| The second account is still free (no double grant) | PASS — `active:false` |
| Replaying a redeemed code does not extend the payer's Pro | PASS — `already_redeemed`, expiry unchanged |
| A code with a tampered signature is refused | PASS — `invalid_signature` |
| A malformed code is refused with 400 | PASS — `malformed` |

Raw local D1 after the run: `redeemed_codes_ledger` = **1 row / 1 distinct code / 1
account** — the double-redeem attempts left no second row, so the ledger primary key
(not application logic) is what makes redemption exactly-once.

**Free-tier behaviour a beta learner will meet** — evidence in §5 and in the e2e suite:
the demo is free and unauthenticated; the livelier paths (live conversation, hints,
writing) are gated by the trial quota, and `tests/trial.test.ts`,
`tests/entitlement.test.ts`, `tests/proStatus.test.ts` and `e2e/paywall.spec.ts`
pin the rules (an A2 learner is not gated before their first episode; a Pro learner
runs at their measured level). **No paywall appears before the first meaningful
lesson**: the demo and onboarding reference no paywall component at all, the landing
page states "what is free and what Pro unlocks" as copy *before* any gate
(`LandingScreen.tsx:281`), and the first paywall can only surface once a free
session's allowance is spent (the terminal `quota_exhausted` state).

## 4. Privacy, safety and data — **READY** (legal wording is OWNER-ONLY)

| Check | Status | Evidence |
| --- | --- | --- |
| Analytics is an allow-list on both sides | READY | server `cloudflare-analytics.js:40 EVENT_NAMES` + `:122` rejects anything else (`unknown_event`); client `src/lib/analytics/events.ts:49 ALLOWED_PROP_KEYS`; `tests/analyticsEvents.test.ts`, `tests/analyticsRoute.test.ts` |
| No tokens in anonymous storage | READY | live battery: `localStorage keys: katzu_analytics_queue_v1, katzu_install_id; cookies: 0`; `tests/tokenHygiene.test.ts`; `scripts/smoke-token-hygiene.cjs` |
| No transcripts or audio in logs / crash reports | READY | `tests/diagnosticsPersistence.test.ts` (never stores console output), `tests/clientCrashReporting.test.ts`, `tests/clientErrorReport.test.ts`; the crash path sends capped, PII-free fields to `/client-error` |
| Client crash reporting works | READY | `installDiagnosticsCapture()` in `src/main.tsx` → local ring buffer → `/client-error` → `error_reports` (admin dashboard); local real-D1 first-run probe (V9-3) stored a row |
| `/health` and error routes leak nothing | READY | `tests/healthPrivacy.test.ts`; live `/health` asserted key-for-key in §2 |
| Legal pages render | READY (copy) / **OWNER-ONLY** (review) | `/trust/privacy`, `/trust/terms`, `/trust/imprint`, `/trust/refund` all 200 with the copy visible in the deployed app; **counsel review, entity name, jurisdiction, retention window and the 16+ age floor are the owner's** |
| Deletion and export | READY | `tests/accountOps.test.ts`; export strips `id_token`/secrets |

## 5. Failure UX — Arabic message with a next action — **READY**

Every failure a beta learner can hit has Arabic copy that names the state and the way
forward, and the learner's typed sentence is preserved.

| Failure | Copy (verbatim, `src/…`) | Next action named | Evidence |
| --- | --- | --- | --- |
| Offline | `لا يوجد اتصال` (orb label) + banner `غير متصل` | "your sentence is kept; resend when the connection returns" | `useLiveConversation.ts:260`, `NetworkStatusBanner.tsx`; `tests/conversationState.test.ts`, `tests/offlineRouteAudit.test.ts`, `tests/networkDropRecording.test.ts` |
| Server unreachable / timeout | `تعذر الوصول إلى الخادم. جملتك محفوظة هنا، أعد المحاولة.` · `انتهت مهلة الاتصال بالخادم. جملتك محفوظة — أعد الإرسال عندما يعود الاتصال.` | retry / resend, text preserved | `useLiveConversation.ts:669,671`, `workerClient.ts:34,486`; `tests/workerClient.test.ts`, `tests/conversationState.test.ts` |
| Microphone denied | `mic_permission` state; orb becomes `الإدخال الصوتي غير متاح — اكتب بالألمانية`; `MIC_PERMISSION_MESSAGE_AR` | type instead — the typed path is never closed | `stateMachine.ts:84,152`, `useVoiceCapture.ts`; **`e2e/microphone.spec.ts`**, `tests/voiceCapture.test.ts`, `tests/nativeSpeech.test.ts` |
| Recording too long | `التسجيل أطول من المسموح. سجّل جملة واحدة قصيرة.` | record one short sentence | `useVoiceCapture.ts:84` |
| Free quota exhausted | `انتهت الجلسات المجانية`; the state is **terminal for the session** so a retry cannot burn more | upgrade / redeem a code (paywall + "I already have a code") | `stateMachine.ts:34,73-78`, `useLiveConversation.ts:258`; `tests/trial.test.ts`, `tests/entitlement.test.ts`, `e2e/paywall.spec.ts` |
| Session expired (401) | `انتهت جلسة الدخول. سجّل الدخول من جديد ثم أعد المحاولة — نصّك محفوظ هنا.` | sign in again; the text is kept | `workerClient.ts:366,449,1166,1208,1228`; `tests/tokenHygiene.test.ts`, `tests/workerClient.test.ts`, `tests/aiRoutes.test.ts`, `tests/writing.test.ts` (**no browser test drives a live 401** — the state is unit-tested only, and the 401→re-auth flow was previously verified by the headless-browser smoke run recorded in `LAUNCH-CHECKLIST.md` §1) |
| Translation failed | `تعذرت الترجمة — أعد المحاولة` | retry the translation only | `ConversationMessage.tsx:164` |
| Any uncaught render error | `حدث خطأ` card with retry | retry | `ErrorBoundary.tsx` |

Adjacent states that also have copy: unusable transcript
(`UNUSABLE_TRANSCRIPT_MESSAGE_AR`), voice unsupported, and the no-mic device path.

## 6. Rollback readiness — **READY**

| Asset | Id (recorded this run) | How to roll back |
| --- | --- | --- |
| Worker | **live version `03007d6e-a379-4e60-9350-1319cc087954` (#111)**; previous **`2a6fd74c-2735-4eb2-84a3-d751e9ace61f` (#110)** | `npx wrangler rollback 2a6fd74c-2735-4eb2-84a3-d751e9ace61f` (or plain `npx wrangler rollback` for the previous one); command verified present in this wrangler (`wrangler rollback [version-id]`) |
| App (Pages) | production deployment **`9c23ec00-0878-4dcb-9649-425396f4a4f0`** at `c7ab71b` (`01ba79c3-…` at `616e273`, `3bead164-…` at `1c3b885` behind it) | Pages project → Deployments → the older deployment → *Rollback*; clients keep the newer service worker until their next visit |
| Sales site | Pages project `katzu-sales`, live `/` 200 | same Pages rollback against that project |
| Content (D1) | pre-V18 export `/tmp/pre-load-katzu-20260929-v18.sql` (162,924 B, 496 INSERTs; sequences: vocabulary 281, starter_phrases 153) | loads are insert-only and key-addressed; a bad load is corrected by loading a corrected file. The V18 load added exactly **3 vocabulary rows (ids 282–284)** and **4 grammar rows** — deleting those seven ids restores the pre-load state |
| Emergency stop | — | set `MAINTENANCE_MODE = "on"` in `wrangler.toml` and `npm run deploy:worker`: every learner **write** then answers 503 with an Arabic explanation and a `Retry-After`, while reads and `/admin/*` keep working; set it back to `"off"` to resume |

## 7. Item-by-item against `LAUNCH-CHECKLIST.md`

| Checklist item | Status | Note |
| --- | --- | --- |
| §0 product pass | READY | superseded by later runs; its "deploy the worker for analytics" action is long done |
| §1 done-and-verified (auth transport, revocation, deletion, export, CORS, ledgers, admin registry, legal pages, crypto code) | READY | re-verified this run where it is live (battery + curls); the two stale numbers in that table ("577 tests / 52 files", "201 tests / 22 files") describe old passes — current suite is **891 tests / 74 files** |
| §2.1 crypto sales end-to-end | **OWNER-ONLY** (and deliberately off) | the code path is tested (`tests/cryptoPayments.test.ts`, 24 tests) but `/crypto/checkout` answers 503 and `/crypto/health` `ready:false` because the provider secrets are absent. For a **free closed beta this is the safe state**; enabling it is a paid-launch action |
| §2.1 local Syria codes minted by hand | READY | `POST /admin/generate` proved against the local real D1 (this run); the owner mints codes from the dashboard |
| §2.2 rotate `ADMIN_SECRET` | **OWNER-ONLY** | the value pasted into a V10 prompt is still the live secret (`wrangler secret put ADMIN_SECRET`). **Highest-value owner action in this document** |
| §2.2 Google audience decision (Android `serverClientId`) | **OWNER-ONLY** | unchanged; only matters when the Android build signs in |
| §2.2 Cloudflare Access in front of `/admin/*` | **OWNER-ONLY** | steps are in `docs/agent/OWNER-STEPS.md`; the worker's bearer gate stays as defence in depth (verified still 401) |
| §2.2 add `D1:Edit` to the API token | **RESOLVED — stale item** | `wrangler d1 export` and `wrangler d1 execute --remote` both worked in V18 (and again in V17/V18 content work) |
| §2.3 legal review, Play Data Safety, Android submission items | **OWNER-ONLY** | pages render; counsel and store paperwork are not an agent's to sign |
| §2.4 attach the production domain | **OWNER-ONLY** | `robots.txt`/`sitemap.xml` still advertise `https://katzu.app/`, which does not resolve; indexing is cosmetic for a beta, and `VITE_PUBLIC_APP_URL` makes the app-side change a setting |
| §3.1 registry backfill | **OWNER-ONLY** | `scripts/backfill-user-registry.mjs` exists and is tested (`tests/backfill.test.ts`); it has never been run against production, and pre-migration free users cannot be recovered retrospectively |
| §3.2 curriculum depth — was "module1 pending, 5/114/20/4 live" | **READY as far as this run can take it; the *depth* goal remains OPEN** | the checklist table is stale: module1 is approved **and loaded**, and the supplement landed in V18, so D1 now holds **15 / 221 / 111 / 22**. The honest remaining gap is *volume* — a 30-day track still wants ~30 scenarios and several hundred words |
| §3.3 beta cohort of 30–50 + feedback loop | **OWNER-ONLY** | `docs/agent/BETA-KIT.md` (V18) is the kit: handout, feedback template, daily check |
| §3.4 third-party error reporting (Sentry) | READY (optional) | built-in capture exists and is tested; Sentry is optional by decision |
| §4 owner decisions (16+, retention wording, admin auth, `GOOGLE_CLIENT_ID` in vars) | OWNER-ONLY | unchanged, still consistent with the implementation |
| §5 re-verify commands | READY | numbers refreshed in V18: `npm test` **891 tests / 74 files** (was written as 747/65), Playwright **37/37**, drift check exit 0 |
| §6 launch runbook (deploy order, smoke, D1, rollback, emergency stop, first 24 h) | READY | unchanged and still correct; V18 exercised the content-load and drift steps of it |

## 8. Gaps, ranked (nothing here is silently dropped)

1. **`ADMIN_SECRET` rotation — OWNER-ONLY, highest value.** The exposed value is still live; everything else in this document assumes it will be replaced.
2. **Beta cannot start before a domain or a clear URL decision — OWNER-ONLY.** `katzu-webapp-v3.pages.dev` works and is what a cohort can be handed today, but `robots.txt`, `sitemap.xml` and the store/legal URLs point at `katzu.app`, which does not resolve. Handing out the `pages.dev` URL is acceptable for a closed beta; it is not acceptable for a public launch.
3. **Real-device voice is still unproven — OWNER-ONLY.** Every voice path in this repo runs against Chromium's fake device (`e2e/microphone.spec.ts`). The 10-minute iOS Safari + Android Chrome checklist in `BETA-KIT.md` is the only honest way to close it, and it needs two real phones.
4. **Curriculum volume — OPEN, agent+owner authoring.** 15 scenarios / 221 words is a working product, not a 30-day track. This is the largest retention lever and the next content milestone.
5. **Two-device sync is unit- and local-D1-proven, not observed in the wild** (`tests/sync.test.ts`, the V9-3 real-D1 probe). A beta is what will test it for real; the v2 two-device integration remains on the backlog.
6. **`FreshD1` PRIMARY KEY semantics** (carried from V16/V17): the counter's insert-then-increment branch is still only covered through the real-D1 probe, not by a unit test with faithful D1 semantics.
7. **No automated content-freshness alarm — agent.** `scripts/check-content-drift.mjs` is a pull check; the daily health card in `BETA-KIT.md` asks a human to run it. Making the deploy runbook call it automatically (and archive its `--json`) would turn "production agrees with the repo" into a recorded fact.
8. **Public-launch items that are *not* gaps for a closed beta but must not be forgotten:** payments (provider account + secrets + a real sandbox pass), counsel-reviewed privacy/terms, Play submission items, custom domain + OAuth origins, and an on-call/incident owner. All are OWNER-ONLY and listed in §7.

**Counts:** READY **12** · OWNER-ONLY **11** · BLOCKED **0**.
