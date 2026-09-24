# Katzu — Launch Checklist (owner actions)

Status as of **2026-09-24**. Separated by *who* can do it: everything under
"Done and verified" is already live; everything under "You must do" needs your
account, your money, your business identity, or your legal review — not code.

Working deployment: worker `katzu-test` → `https://katzu-test.ghaidakalosh008.workers.dev`,
app → `https://katzu-webapp-v3.pages.dev`.

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

Verified this pass: lint exit 0 · **154 tests / 20 files** · build OK · worker bundle 170.84 KiB.

---

## 2. You must do — blocking a *paid* public launch

### 2.1 Money (biggest remaining block)
The app currently monetizes with **activation codes only**. Selling them needs a
payment provider.

1. **Pick a provider and open the account.** For a solo Arabic-first PWA selling
   globally, a merchant-of-record (they handle EU VAT + invoices for you) is much
   less work than raw Stripe: **Paddle** or **Lemon Squeezy**. Choose plain
   **Stripe** only if you want to own tax/VAT reporting yourself.
2. **Business identity + banking**: legal name, address, bank account, and tax ID
   as the provider requires. Individual/sole-proprietor is usually fine to start.
3. **Set prices** (monthly / annual, and whether the free trial stays 3 AI sessions).
4. Then hand it to me: checkout + **server-side webhook** that writes the
   entitlement, plus renewal/cancel/refund/restore paths. Nothing in the app
   currently depends on a provider, so this is additive.

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
npm run lint && npm test -- --run && npm run build     # 154 tests must pass
node scripts/verify-admin-live.mjs --secret=<ADMIN_SECRET>   # live admin + free-user lookup
node scripts/capture-admin-screenshots.mjs --secret=<ADMIN_SECRET>  # refresh dashboard PNGs
```

After any Redis-free sign-in to the app, the lookup check should report
`source=users` for a free account — that proves the registry path (not the legacy
KV fallback) answered.
