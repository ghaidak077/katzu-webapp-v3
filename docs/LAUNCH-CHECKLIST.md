# Katzu — Launch Checklist (owner actions)

Status as of **2026-09-24**. Separated by *who* can do it: everything under
"Done and verified" is already live; everything under "You must do" needs your
account, your money, your business identity, or your legal review — not code.

Working deployment: worker `katzu-test` → `https://katzu-test.ghaidakalosh008.workers.dev`,
app → `https://katzu-webapp-v3.pages.dev`, sales site → **`https://katzu-sales.pages.dev`**
(Pages project `katzu-sales`, deployment `d7a6a074`, branch `main`).

---

## 0. 2026-09-26 — product pass (app-side; **nothing deployed by this pass**)

Verified locally: `npm run lint` exit 0 · **577 tests / 52 files** · `npm run build`
OK · `node --check` clean on every touched worker file. No Dexie version bump was
needed: every field this pass added to `UserEntity` is non-indexed, so learner
progress on existing devices is untouched.

- **Try-before-signup demo** at `/demo` — a real study → quiz → speak → report loop
  built from the cached curriculum, with **no AI call**, and progress that migrates
  into the account on sign-up.
- **Onboarding** at `/onboarding` — goal, arrival status, target date and daily
  minutes; it drives the daily mission and the learner-level description.
- **Dynamic daily mission** on the Trail (spaced review → continue → weakest skill →
  daily → new), replacing the hardcoded `A1` pick and the "≥80% means mastered" rule.
- **Honest progress** — a "what you can do now" capability card measured from
  independently answered turns (not hints), and an open-mistakes list that enrols a
  wrong quiz answer into spaced review.
- **Conversation state machine** in the live conversation, with an in-flight guard so
  one learner message can never be sent twice.
- **Paywall rewritten** — price, what Pro unlocks, what stays free, and an "I already
  have a code" path; the **share card** replaces the fake-fluency quote and `alert()`.
- **Privacy-safe analytics** — 24 allow-listed event names / 8 property keys, an
  opt-out switch in Settings, no PII or free text.

Two actions this pass created for you:

- **Deploy the worker to make analytics live.** `POST /analytics/events` (new file
  `cloudflare-analytics.js`) exists only in the working tree — run
  `npm run deploy:worker`. Until you do, the app still queues events and drops them
  after `katzu_analytics_queue_v1` fills, which no learner can see.
- **Set `VITE_PUBLIC_APP_URL` at deploy time** (name only; ask me for the value once
  a domain resolves) — it drives the canonical tag, Open Graph URLs, share links and
  the legal-page links, so no `pages.dev` host is hardcoded anywhere in code.

---

## 1. Done and verified (live)

| Area | Evidence |
| --- | --- |
| Session-only auth transport, header-only credentials, no raw ID token in IndexedDB | 11/11 headless-browser smoke checks on the deployed app |
| Sign-out revocation + local wipe; 401 → re-auth flow | same smoke run |
| Account deletion (server keys + D1 ledgers + local wipe + session revocation) with UI confirmation | `tests/accountOps.test.ts`; live `POST /user/delete` path |
| Data export (JSON, secrets/tokens stripped) in Settings | `tests/accountOps.test.ts` asserts no `id_token`/secret fields |
| CORS fails closed; unknown origin → `403 origin_not_allowed` | live probe + `tests/workerSecurity.test.ts` |
| Durable, idempotent redemption / quota / referral / rate limits | `redeemed_codes_ledger`, `trial_quota_ledger`, `referral_payouts`, `rate_limit_counters` |
| Bounded AI inputs, CEFR allowlist, server-resolved scenario identity | `tests/workerSecurity.test.ts` (Phase 1 gate) |
| Admin user registry (free + pro, activity, errors) + SaaS dashboard | live dashboard screenshots in `docs/screenshots/` |
| `TEST_MODE` cannot bypass verification in production | fetch-entry guard + test; live forged-token probe → `401` |
| Hosted privacy + terms pages | `/privacy`, `/terms` (required by Google Play and any PSP) |
| Crypto sales: invoice → signed IPN → activation code → app redemption | `tests/cryptoPayments.test.ts` (24 tests, incl. an end-to-end *signed IPN → code → `/verify` redeems → `/check-status` reports Pro*); live round-trip script `scripts/verify-crypto-live.mjs` (needs the provider's IPN secret) |
| Sales site (`katzu-sales`) is a separate property: the app has **no** checkout UI and no `billing/checkout` call | app-side checkout code reverted; the app only redeems via `/verify` |
| Sales site **deployed and live** with product copy, $5 pricing, buy CTA, and the three local Syria payment routes | `https://katzu-sales.pages.dev` (deployment `d7a6a074`) — 22/22 live-browser checks + served-HTML assertions; `/privacy` and `/terms` links are absolute to `katzu-webapp-v3.pages.dev` and both resolve 200 |
| `/crypto/*` routes live on the worker: health 200 `ok:true`, unauthenticated webhook 401, sales origin allowed, unknown origin 403 | live probes on worker version `7a522d2f` |

Verified this pass: lint exit 0 · **201 tests / 22 files** · build OK · worker bundle
214.81 KiB · `npm run lint && npm test -- --run && npm run build` all green and,
more importantly: the deployed PWA bundle **rebuilds byte-identical** from `main`
(sha256 `ae8068719c…` matches `https://katzu-webapp-v3.pages.dev`), and the live
worker version `fea4190f…` reports `ENVIRONMENT=production`, `GOOGLE_CLIENT_ID`
set, and **no** `TEST_MODE`/`NODE_ENV` in either vars or secrets. Live browser run
of the deployed app: 0 console errors, 0 page errors, 0 failed requests.

---

## 2. You must do — blocking a *paid* public launch

### 2.1 Money — **crypto sales** (the live path) and Dodo (closed)

**Dodo Payments is closed for this account.** Its published eligibility policy keys
on the country that issued the founder's government ID, and the only ID available is
Syrian, which is not on its accepted list. Do not re-open that thread; the app-side
checkout work was reverted as part of this pass so the two properties stay separate.
**Removed outright on 2026-09-26:** the module, the `/billing/*` routes, the
`tests/dodoBilling.test.ts` suite, `scripts/verify-dodo-live.mjs`, the `DODO_*` /
`CHECKOUT_RETURN_ORIGIN` vars and the two Dodo secrets no longer exist. The paid paths
are crypto (below) and a locally-paid code minted from the admin dashboard.

**The live path is a separate sales site + crypto checkout.** Architecture:

```
katzu-sales  (Cloudflare Pages, static)      Katzu webapp (Pages) + worker
  → POST /crypto/checkout → invoice URL        → POST /verify  (activation code)
  → NOWPayments IPN  → POST /crypto/webhook    (unchanged; no payment UI in the app)
  → success.html shows the activation code
```

**Done in code (verified, not just written):**

- `cloudflare-crypto.js` — `POST /crypto/checkout` (invoice created server-side, only
  `checkout_url` + the buyer's claim token returned), `POST /crypto/webhook` (the only
  fulfillment authority: HMAC-SHA512 `x-nowpayments-sig` verification over the
  key-sorted body, `payment_id:status` replay ledger, `finished`-only delivery, a
  conditional UPDATE as the concurrency guard, and a 5xx + released claim so a
  provider retry can finish an unfulfilled paid order), `GET /crypto/order` (the
  buyer's code, gated by the claim token), `GET /crypto/health` (booleans only).
  Additive tables: `crypto_orders`, `crypto_events`.
- Codes are minted by the **existing** generator (`handleAdminGenerate`, the same
  function `POST /admin/generate` serves) — the code format is not duplicated.
- `sales/` — the Arabic-first sales site: product one-screen pitch, $5/1-month price,
  crypto checkout, a manual **local Syria** section (Syriatel Cash / MTN Cash / local
  bank transfer + Telegram), the success page that reveals the code, and links to the
  app's hosted `/privacy` and `/terms`.
- No secret is in any client bundle: the app bundle and the sales site were both
  scanned for key-shaped strings (clean); the API key and IPN secret are Worker
  secrets and `/crypto/health` never echoes them.

**What only you can do:**

1. **Open the NOWPayments account** (`nowpayments.io`) and confirm at signup that no
   ID/nationality check is required for a crypto-only merchant. Their own policy says
   the KYB/KYC procedure is asked for "in a rare case when a certain transaction is
   marked as suspicious", and upfront only for fiat options — do not enable fiat
   payouts, which is what would trigger ID verification. If they reject the account
   anyway, tell me and the fallback is a self-hosted BTCPay Server (zero third-party
   onboarding, no KYC at all, but it needs your own VPS + wallet xpub).
2. **Create the two secrets** (without the key `/crypto/checkout` answers 503; without
   the IPN secret `/crypto/webhook` answers 503 and nothing can be fulfilled):

   ```bash
   npx wrangler secret put NOWPAYMENTS_API_KEY      # Store Settings -> API keys
   npx wrangler secret put NOWPAYMENTS_IPN_SECRET   # Store Settings -> IPN Secret key
   ```

   IPN endpoint to register: `https://katzu-test.ghaidakalosh008.workers.dev/crypto/webhook`
3. **Fill in `sales.js`**: the Telegram handle and the Syriatel/MTN/bank details, then
   redeploy the sales site. (The Pages project `katzu-sales` is already deployed and
   live at https://katzu-sales.pages.dev — no build command, uploaded directory
   `sales`, so a redeploy is one command.) Until those values are filled the Telegram
   button stays disabled and a visible warning names exactly what is missing, so an
   unfilled value can never ship as a dead call to action; the published
   `support@ghaidak.com` email fallback works today.
4. **Verify end to end**: `NOWPAYMENTS_IPN_SECRET='...' node scripts/verify-crypto-live.mjs`
   (creates a real sandbox invoice, proves no code before payment, posts a correctly
   signed `finished` notification, prints the minted code, proves replay mints
   nothing), then complete one **real sandbox payment** on the printed checkout URL
   and run again with `--poll=300 --no-simulate` so the provider's own notification is
   what fulfills the order. Finally paste the code into the app once
   (**شاشة الاشتراك ← تفعيل الكود**) — that redemption is the human proof the loop is
   closed. Then set `NOWPAYMENTS_ENVIRONMENT = "live_mode"`.
5. **Local Syria payments are manual by design**: no automation, no queue. A buyer pays
   by Syriatel Cash / MTN Cash / bank transfer, sends proof on Telegram, and you mint
   the code by hand from the admin dashboard (`POST /admin/generate`).

**Still not built** (deliberately out of this pass — say the word and it's next):
self-serve refunds; an admin view of `crypto_orders` beyond a D1 query; and an
in-app "manage subscription" screen (not applicable to one-off codes).

### 2.2 Security actions only you can take
5. **Rotate `ADMIN_SECRET`.** The value you pasted in chat is now the live secret,
   so it should be considered exposed. `npx wrangler secret put ADMIN_SECRET`.
6. **Confirm the Google audience decision — read this one.** The worker now
   enforces the `aud` claim on Google ID tokens (`GOOGLE_CLIENT_ID`, matching
   `VITE_GOOGLE_CLIENT_ID`, exactly as DEPLOY.md specifies). The web app is
   consistent (the ID is compiled into the deployed bundle). **If your Android app
   signs in with a *different* OAuth client ID, sign-in from Android will now get
   `401 invalid_id_token`.** The Android app must use `serverClientId` = this web
   client ID (Google's documented pattern for backend verification). If Android
   uses another client, either switch it to `serverClientId`, or remove the
   `GOOGLE_CLIENT_ID` line from `wrangler.toml` to revert the check.
7. **Decide where the admin dashboard lives.** It is currently reachable on the
   public worker and authenticates with a bearer secret typed in the browser
   (kept in `sessionStorage`). Acceptable short-term; for production prefer
   Cloudflare Access (SSO in front of `/admin*`) or a separate admin worker.
8. **Add `D1:Edit` to the Cloudflare API token** — needed for the one-time
   registry backfill (§3.1) and any future content work. Today `wrangler d1
   execute --remote` fails with code `7403`.

### 2.3 Legal & store paperwork
9. **Privacy/terms review.** The pages are live and describe the *actual*
   implementation, but confirm with counsel: your legal entity name, governing
   law/jurisdiction, log retention window (currently "limited period"), refund
   terms, and the **16+** age statement I used.
10. **Google Play Data Safety + subscription disclosure** must mirror the privacy
    page (email, learning data, AI processing, deletion/export).
11. **Android app submission items** (separate repo, from `AGENTS.md`): register the
    release keystore SHA-1 in Google Cloud Console; reconcile activation codes with
    Play Billing; short title ≤ 30 chars; zero-permission photo picker;
    `AppLogger` floating debug UI disabled when `BuildConfig.DEBUG == false`.

### 2.4 Domain and indexing (found in the 2026-09-24 pass)
12. **Attach the production domain.** `public/robots.txt` and `public/sitemap.xml`
    advertise `https://katzu.app/`, but that host does **not** currently resolve
    (`curl https://katzu.app/` → no DNS). The app is live on
    `https://katzu-webapp-v3.pages.dev`. Either attach `katzu.app` to the Pages
    project (recommended — it is what your store listing and legal URLs should
    point at) or tell me the real domain and I will update robots, sitemap,
    `ALLOWED_ORIGINS`, and the CSP `connect-src` in one commit. Indexing is
    cosmetic today; the store/PSP requirement is only that the privacy URL
    resolves somewhere you control, which it does. Since the 2026-09-26 pass the
    app side of this is one setting: `VITE_PUBLIC_APP_URL` feeds canonical, Open
    Graph, share and legal links, so the domain change needs no code edit —
    `public/robots.txt` and `public/sitemap.xml` are the only two files that must
    be edited by hand.

---

## 3. You must do — to reach a *confident* public launch

### 3.1 Registry backfill (gated, already written)
`scripts/backfill-user-registry.mjs` seeds the `users` table from existing KV
`email_index:*` / `account:*` keys. It has **not** been run against production.

```bash
node scripts/backfill-user-registry.mjs --kv-export=<your-kv-dump.json> --emit-sql > backfill.sql
npx wrangler d1 execute katzu-content --remote --file=backfill.sql
```
Note: free users who signed in before this migration and never redeemed a code
**cannot** be recovered retrospectively — there is no historical record of them.
Every sign-in from now on registers itself automatically.

### 3.2 Curriculum depth

> **Refreshed 2026-09-29 (V18):** the two tables below are the 2026-09-28 state and are kept
> as history. **Both modules and the grammar supplement are now loaded and verified:** D1 holds
> **15 scenarios / 221 vocabulary / 111 phrases / 22 grammar**, `node scripts/check-content-drift.mjs`
> exits 0, and every module/supplement grammar row is reachable from `SCENARIO_GRAMMAR_IDS`
> (the 4 unreachable rows are the legacy ones in §2.2 item 6). The *depth* goal is still open:
> 15 scenarios is a working product, not a 30-day track. See `docs/agent/LAUNCH-STATUS.md` §7.

Launch gate 3 is still open: the "أول 30 يوم في ألمانيا" track is not complete in
D1. This is content authoring + approval, not code — and it's the single biggest
lever on retention. Authoring now runs through the `AGENTS.md` §4 content gate
(audit script → adversarial self-review → review file → secretless loader
`--dry-run`; the owner runs `--commit`).

**Draft modules waiting for the owner's `--commit` (2026-09-28)**, in
`docs/content/` — these are NOT yet live in D1:

| Module | Status | Rows (draft) |
| --- | --- | --- |
| `curriculum-30day-module1.json` | review **pending** | 5 scenarios / 74 vocab / 30 phrases / 10 grammar |
| `curriculum-arrival-module2.json` | review **approved** (AI self-review only) | 5 scenarios / 49 vocab / 42 phrases / 4 grammar |

Measured **live in D1** on 2026-09-24 (unchanged since — no `--commit` has run):

| Content | Live count |
| --- | --- |
| Scenarios | **5** — embassy appointment, café order, job interview, doctor visit, apartment viewing |
| Conversation openers | **5 × 4 levels** — every scenario has a real `initial_message_{a1,a2,b1,b2}` |
| Starter phrases (hint fallback) | **20** — only 1 per scenario per level |
| Vocabulary | **114** words — A1 31 / A2 30 / B1 27 / B2 26 |
| Grammar rules | **4** — one per level |
The mechanics are finished; the library is a thin vertical slice. A 30-day track
realistically needs ~30 scenarios and several hundred words before retention
figures mean anything, so treat this as the main pre-marketing work item.
### 3.3 Beta cohort
Launch gate 7: 30–50 Arabic-speaking learners, plus a plan for the feedback loop.
The dashboard (users / activity / errors) is ready to support this.

### 3.4 Optional integration
Error reporting: set `VITE_SENTRY_DSN` if you want a third-party dashboard. **Update
2026-09-28:** client-side crash capture already exists — `installDiagnosticsCapture()`
(`src/lib/utils/diagnostics.ts`, installed at boot in `main.tsx`) hooks
`window.onerror` / `unhandledrejection` / console errors, keeps them in a local
ring buffer, and forwards capped, PII-free crash reports to the worker's
`/client-error` route, which stores them in the `error_reports` table the admin
dashboard already shows. A third-party provider is optional, not a gap.

---

## 4. Decisions I made for you — veto anything

| Decision | Value | Why |
| --- | --- | --- |
| Age floor in privacy policy | **16+** | German/EU GDPR consent age; raise/lower freely |
| Log retention wording | "limited period, purged periodically" | No automated purge job exists yet — set a real window if you want a hard promise |
| Admin dashboard auth | bearer secret (unchanged) | Already implemented; Cloudflare Access is the upgrade path |
| `GOOGLE_CLIENT_ID` moved from a secret to `[vars]` | non-secret, reviewable in git | It ships to every browser anyway; secrets would hide it from review |

---

## 5. How to re-verify anything

```bash
npm run lint && npm test -- --run && npm run build     # 891 tests / 74 files must pass (2026-09-29, V18)
npx playwright test                                 # 37 browser tests in 10 files (needs the preview up; E2E_TARGET=preview runs them against the production bundle)
node scripts/check-content-drift.mjs                # exit 0 = production still matches the approved drafts
curl -sI https://katzu-sales.pages.dev/                     # live sales site must be 200
curl -s  https://katzu-test.ghaidakalosh008.workers.dev/crypto/health   # ok:true; ready:true once the keys are set
node scripts/verify-admin-live.mjs --secret=<ADMIN_SECRET>   # live admin + free-user lookup
node scripts/verify-crypto-live.mjs --ipn=<NOWPAYMENTS_IPN_SECRET>  # live crypto round-trip (invoice → signed IPN → code)
node scripts/capture-admin-screenshots.mjs --secret=<ADMIN_SECRET>  # refresh dashboard PNGs
```

After any Redis-free sign-in to the app, the lookup check should report
`source=users` for a free account — that proves the registry path (not the legacy
KV fallback) answered.

## 6. Launch runbook (2026-09-29 — release candidate 1.1.0)

Order matters. The Worker first, then the app, then the sales site: the app is
cached on the device by its service worker, so a client that ships first would
talk to a Worker that does not yet have the routes it expects.

### 6.1 Deploy order
1. **Worker:** `npm run deploy:worker` (= `npx wrangler deploy`, entry
   `cloudflare-unified-worker.js`).
2. **Smoke the Worker before touching the app** (§6.3).
3. **App (Pages):** `npm run build`, then the Pages deploy — either push to `main`
   (the Pages project builds with `npm run build`) or
   `npx wrangler pages deploy dist --project-name=<your-pages-project> --branch=main`.
4. **Sales site (only if it changed):**
   `npx wrangler pages deploy sales --project-name=katzu-sales --branch=main --commit-dirty=true`.
5. **Content (optional, owner-only):** `node scripts/load-curriculum.mjs --file=<module>.json --commit`
   — only after confirming the ids it defines are absent from production D1 (the
   runbook is `docs/agent/CONTENT-LOAD.md`; since V13-1 the loader also refuses to
   write while the deployment's columns and the draft's disagree).
6. **Compare production against the drafts:** `node scripts/check-content-drift.mjs`
   — read-only (`GET`s on `/scenarios`, `/vocabulary`, `/grammar`, and
   `/scenarios/:id` for phrases; never an admin route, never a write). Run it after
   any content change and after any deploy that touches content. It matches rows by
   natural key and classifies every difference: `diverged` (the key is live with
   other values — in practice a row the loader skipped because production already
   had it), `absent` (a module row production lacks), `pending` (the same for a
   supplement, which is unloaded by decision) and `duplicate` (two drafts declare
   one key, so only one wording can ever land). Exit 0 = agreement, 1 = a
   difference (add `--strict` to fail on the by-design classes too), 2 = transport.

### 6.2 Database
There is **no migration runner and no migrate script**. The Worker creates and
extends its own tables idempotently on the first request (`ensureLedgerTables`,
`sync_revisions`, `rate_limit_counters`, the admin registry's `error_reports`, and
the additive content columns through `ensureContentColumns`). Nothing is applied to
D1 by hand, and a deploy that adds a table creates it on the next request.

`migrations/` exists as **documentation only** — nothing executes it. Its
`0001_content_tables.sql` records the *content* tables (which the Worker does not
manage): the DDL the deployed database has, the three `grammar` columns it was
missing, and the `ALTER TABLE` statements for a deployment that lags the code
(those three columns were added by the owner on 2026-09-29 and the Worker now also
carries them in `ADDITIVE_COLUMNS`, so a fresh database heals itself)
(`tests/contentSchema.test.ts` asserts every column the content studio advertises is
either in the recorded DDL or in `ADDITIVE_COLUMNS`). Anyone editing content should
still read `docs/agent/CONTENT-LOAD.md` first; since V13-1 the loader refuses to
write anything at all while the deployment's columns and the draft's disagree.

Retention is enforced by `sweepExpiredRows` — `POST /admin/sweep` with the admin
secret runs it on demand, and the Worker also exposes a `scheduled` handler that
stays inert until a cron trigger exists. Adding the trigger is the owner's change
to `wrangler.toml` (a `[triggers]` block, e.g. `crons = ["17 4 * * *"]`).

### 6.3 Smoke test after the Worker deploy (in this order)
- `curl -s https://<worker-host>/health` → `{"status":"healthy","service":"Katzu Unified Worker","ready":true,"maintenance":false}` **and nothing else**. A longer body means an older Worker is still serving.
- `curl -s https://<worker-host>/crypto/health` → booleans plus `priceUsd`/`months` only, never a key.
- One real AI turn from a signed-in test account (app → Live Interaction) → 200 with a graded reply.
- One progress sync from two browsers on the same account → both keep their writes (rev-guarded; the second device retries once on conflict).
- `/admin` with the secret → dashboard renders; a wrong secret → 401, and 6 failures in 15 minutes from one IP → 429.
- `POST /admin/sweep` with the secret → `{"swept":{"rate_limit_counters":N,"error_reports":M}}`.
- Sign out, then confirm `/ai/turn` from the old session answers 401 rather than serving content.

### 6.4 Rollback
- **Worker:** `npx wrangler rollback` (or `npx wrangler deployments list` then `wrangler rollback <id>`). Every schema change this pass is additive, so the previous Worker keeps working against the same D1.
- **App:** in the Pages project, roll back to the previous deployment. Existing clients keep the older service worker until their next visit; nothing needs purging.
- **Sales site:** same Pages rollback against `katzu-sales`.
- **Content:** loads are per-id and never overwrite existing rows, so a bad load is corrected by loading a corrected file — never by deleting rows.

### 6.5 Emergency stop (no client release needed)
Set `MAINTENANCE_MODE = "on"` in the Worker's `[vars]` and redeploy the Worker.
Every learner write then answers 503 with an Arabic explanation and a `Retry-After`
while reads and `/admin/*` keep working. Remove it (or set `"off"`) to resume.

### 6.6 First 24 hours — what to watch
- **Error feed** (`error_reports`, admin dashboard): expect near-zero. `client_*` rows are client crashes; `server_error` rows are 5xx.
- **`/health`**: `ready:false` means the whole AI pool is unusable — keys missing or exhausted.
- **AI quota burn**: watch the pool's day-quota ledger in the admin health view. A looping account shows up as 429s, not as spend.
- **Webhook failures**: `crypto_*` rows on `/crypto/webhook` in the error feed (a `crypto_price_mismatch` row means a payment that did not match the order).
- **Signup → first session**: compare new `users` rows against session-completed events in `activity_log` for the same day.
- **Contact:** the repository owner. There is no on-call roster in this repo.
