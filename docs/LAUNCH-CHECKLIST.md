# Katzu — Launch Checklist (owner actions)

Status as of **2026-09-24**. Separated by *who* can do it: everything under
"Done and verified" is already live; everything under "You must do" needs your
account, your money, your business identity, or your legal review — not code.

Working deployment: worker `katzu-test` → `https://katzu-test.ghaidakalosh008.workers.dev`,
app → `https://katzu-webapp-v3.pages.dev`, sales site → **`https://katzu-sales.pages.dev`**
(Pages project `katzu-sales`, deployment `d7a6a074`, branch `main`).

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
    resolves somewhere you control, which it does.

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
Launch gate 3 is still open: the "أول 30 يوم في ألمانيا" track is not complete in
D1. This is content authoring + approval, not code — and it's the single biggest
lever on retention. I can add scenarios via the admin Content tab or the API as
soon as you approve the outline.

Measured live on 2026-09-24, so you can judge it against the outline:

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
Error reporting: set `VITE_SENTRY_DSN` (there is a worker `error_reports` table for
server-side errors, but nothing captures client-side crashes yet).

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
npm run lint && npm test -- --run && npm run build     # 201 tests must pass
curl -sI https://katzu-sales.pages.dev/                     # live sales site must be 200
curl -s  https://katzu-test.ghaidakalosh008.workers.dev/crypto/health   # ok:true; ready:true once the keys are set
node scripts/verify-admin-live.mjs --secret=<ADMIN_SECRET>   # live admin + free-user lookup
node scripts/verify-crypto-live.mjs --ipn=<NOWPAYMENTS_IPN_SECRET>  # live crypto round-trip (invoice → signed IPN → code)
node scripts/verify-dodo-live.mjs --secret=<DODO_WEBHOOK_SECRET> --admin=<ADMIN_SECRET>  # Dodo (dormant: no keys set)
node scripts/capture-admin-screenshots.mjs --secret=<ADMIN_SECRET>  # refresh dashboard PNGs
```

After any Redis-free sign-in to the app, the lookup check should report
`source=users` for a free account — that proves the registry path (not the legacy
KV fallback) answered.
