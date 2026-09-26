# Katzu PWA deployment

## 1. Prepare the Worker

The repository ships with `wrangler.toml` (entry point `cloudflare-unified-worker.js`, D1 + KV bindings, non-secret vars) and an npm script, so deploying is a single command once the one-time setup below is done.

### One-time setup

1. Fill the three resource IDs in `wrangler.toml` with **your** Cloudflare resource IDs (`npx wrangler d1 list`, `npx wrangler kv namespace list`):
   - `database_id` under `[[d1_databases]]` (DB name `katzu-content`)
   - `id` under the two `[[kv_namespaces]]` blocks (`USER_PROGRESS`, `REDEEMED_CODES`)
2. Set the required secrets (stored in Cloudflare, never in the repo):

   ```bash
   npx wrangler secret put GEMINI_API_KEYS   # comma-separated Gemini keys
   npx wrangler secret put ADMIN_SECRET      # long random string (protects /admin)
   npx wrangler secret put HMAC_SECRET       # long random string (token signing)
   ```

   Optional provider keys for the AI pool (same comma/semicolon/newline list format).
   Gemini alone still works; each additional provider adds a separate free-tier window,
   which is what keeps one exhausted quota from stopping learner conversations:

   ```bash
   npx wrangler secret put GROQ_API_KEYS         # api.groq.com keys
   npx wrangler secret put OPENROUTER_API_KEYS   # openrouter.ai keys (50 req/day per account)
   npx wrangler secret put NVIDIA_API_KEYS       # integrate.api.nvidia.com keys
   ```

   `GOOGLE_CLIENT_ID` is deliberately **not** a secret — it is public (it ships to every
   browser), so it lives in the `[vars]` block of `wrangler.toml` where it can be reviewed
   in git. Set it to the same OAuth client ID as `VITE_GOOGLE_CLIENT_ID`. The worker
   enforces the ID token `aud` claim against it, so a mismatch rejects sign-in with
   `401 invalid_id_token`.

2b. **Billing secrets (Dodo Payments)** — required before any card payment works:

   ```bash
   npx wrangler secret put DODO_API_KEY          # Dodo dashboard -> Developer -> API keys
   npx wrangler secret put DODO_WEBHOOK_SECRET   # Webhooks -> <your endpoint> -> signing secret
   ```

   Then set the non-secret billing values in `[vars]` of `wrangler.toml`:
   `DODO_PRODUCT_ID_MONTHLY` (required), `DODO_PRODUCT_ID_ANNUAL` (optional),
   `DODO_ENVIRONMENT` (`test_mode` by default — it cannot move real money), and
   optionally `CHECKOUT_RETURN_ORIGIN` (defaults to the first `ALLOWED_ORIGINS` entry).

   Register the webhook endpoint in the Dodo dashboard as
   `https://<your-worker-host>/billing/webhook` and subscribe it to the
   subscription lifecycle: `subscription.active`, `subscription.renewed`,
   `subscription.cancelled`, `subscription.on_hold`, `subscription.past_due`,
   `subscription.expired`, `subscription.failed`, plus `payment.succeeded` and
   `payment.failed`. Dodo sends Standard Webhooks headers; the worker verifies the
   HMAC signature and rejects anything unsigned, tampered, or older than 5 minutes.

2c. **Crypto sales secrets (NOWPayments)** — required before the sales site can sell a code:

   ```bash
   npx wrangler secret put NOWPAYMENTS_API_KEY      # NOWPayments dashboard -> Store Settings -> API keys
   npx wrangler secret put NOWPAYMENTS_IPN_SECRET   # Store Settings -> IPN Secret key
   ```

   Then review the non-secret values in `[vars]`: `NOWPAYMENTS_ENVIRONMENT`
   (`test_mode` by default — it talks to `api-sandbox.nowpayments.io` and cannot take
   real money), `SALES_ORIGIN` (where a paying customer is returned, and the only
   browser origin allowed to call `/crypto/checkout`), `CRYPTO_PRICE_USD` and
   `CRYPTO_MONTHS` (price and how many months of Pro one code grants).

   The provider's IPN endpoint is `https://<your-worker-host>/crypto/webhook`. It is
   authenticated by its `x-nowpayments-sig` HMAC-SHA512 signature (over the
   key-sorted JSON body), so it needs no IP allowlist and is reachable without an
   `Origin` header.

3. Set `ALLOWED_ORIGINS` in the `[vars]` block of `wrangler.toml` to the exact Pages origin(s) before public launch (empty = open CORS, dev only). **Keep `ENVIRONMENT = "production"` there as well**: it forces strict CORS even if the allowlist is missing or malformed, and it disables the `TEST_MODE` token-verification bypass.
4. Run additive D1 migrations before serving traffic.

### Deploy / update the Worker

```bash
npm run deploy:worker        # = wrangler deploy
npm run tail:worker          # live request logs for debugging
```

Automated environments authenticate with `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (both available in the Keys tab); locally, `npx wrangler login` opens a browser instead.

Record the deployed Worker URL (shown after deploy) and use it as `VITE_WORKER_URL` for the Pages build. `USER_PROGRESS` is required for authenticated trial AI access: the Worker stores authoritative quota records under `ai-quota:<google-sub>` in that KV namespace.

## 2. Prepare Google Identity Services

Create a production Google OAuth Web client and add the exact HTTPS Pages/custom-domain origins. Set the same client ID in `VITE_GOOGLE_CLIENT_ID` and the Worker `GOOGLE_CLIENT_ID`. Do not use a development origin in production.

## 3. Deploy the PWA to Cloudflare Pages

1. Set the Pages build command to `npm run build`.
2. Set the output directory to `dist`.
3. Configure `VITE_GOOGLE_CLIENT_ID`, `VITE_WORKER_URL`, and optional `VITE_SENTRY_DSN`/`VITE_CONTACT_URL`.
4. Ensure `public/_headers`, `public/robots.txt`, and `public/sitemap.xml` are included in the deployment.
5. Attach the production custom domain and update `ALLOWED_ORIGINS` to the exact origin.
6. Store submission needs a public policy URL: `public/privacy.html` and `public/terms.html` deploy automatically as `/privacy` and `/terms` (Cloudflare Pages strips the `.html` extension with a 308). Confirm both return `200` on the live domain before submitting to Google Play or a payment provider, and use the extensionless URLs in the store listing.

## 3b. Verify the billing pipeline

`GET /billing/health` reports configuration booleans only (never secret values):

```bash
curl -s https://<your-worker-host>/billing/health
```

`ready: true` means the API key, webhook secret, and monthly product are all set.

Then run the end-to-end check against the deployed worker — it posts a real signed
webhook, confirms the plan update through the admin API, proves a replay does not
double-grant, and confirms a terminal event ends the entitlement:

```bash
DODO_WEBHOOK_SECRET='whsec_...' ADMIN_SECRET='...' node scripts/verify-dodo-live.mjs
```

It writes one clearly-marked test account (`dodo-selftest-<timestamp>` /
`dodo-selftest+<timestamp>@katzu.test`) and revokes it at the end; it never
touches a real learner. Supply `ADMIN_SECRET` too, otherwise the "plan read-back"
check is skipped. Exit code 0 means every check passed.

**Status: the in-app card checkout is not present.** The app is redemption-only: it
sells nothing, has no checkout screen, and only ever redeems an activation code
through `POST /verify`. The `/billing/*` routes and this section stay documented
because the worker module still exists, but with no Dodo keys set they answer `503`
and nothing in the app calls them. `DODO_ENVIRONMENT`/`DODO_PRODUCT_ID_*` can stay
empty. Do not re-add a checkout screen to the app: paid sales happen on the separate
sales site (section 3c).

## 3c. Deploy the sales site and verify the crypto pipeline

`sales/` is a **separate** Cloudflare Pages project (`katzu-sales`) — plain static
HTML/CSS/JS, no build command. It sells an activation code; it never talks to the
app, and the app never talks to it. Live at **https://katzu-sales.pages.dev**
(deployment `d7a6a074`, branch `main`). See `sales/README.md` for the two config
blocks (`sales.js` and `success.js`) and fill in the local Syria payment details
there before publishing.

Deploy (from the repository root; creates the project the first time):

```bash
npx wrangler pages project create katzu-sales --production-branch=main
npx wrangler pages deploy sales --project-name=katzu-sales --branch=main --commit-dirty=true
```

After deploying the worker with the crypto vars/secrets above:

```bash
curl -s https://<your-worker-host>/crypto/health      # booleans only, never a key
```

`ready: true` means the API key, the IPN secret, and `SALES_ORIGIN` are all set.
(The sales origin `https://katzu-sales.pages.dev` is already in `ALLOWED_ORIGINS`, so
the browser on the sales site is allowed to call this endpoint.)

Then run the end-to-end check against the deployed worker. It creates a real
sandbox invoice, reads the order back before payment (no code), posts a correctly
signed `finished` notification, proves the code is delivered to the claim token and
that re-delivery mints nothing, and prints the minted code:

```bash
NOWPAYMENTS_IPN_SECRET='<ipn secret>' node scripts/verify-crypto-live.mjs
```

To exercise the provider's own notification instead of a script-signed one, pay the
printed sandbox checkout URL in the provider's test environment and run with
`--poll=300` (add `--no-simulate` to require the real notification).

The minted code is real and redeemable: paste it into the app once
(**شاشة الاشتراك ← تفعيل الكود**) as the final human check. Switch
`NOWPAYMENTS_ENVIRONMENT = "live_mode"` only after that passes.

## 4. Smoke tests after deployment

- Open the site in an incognito window and confirm the missing-configuration state appears when the Google client ID is absent.
- Sign in with Google and confirm the Worker receives the verified token.
- Complete one free-tier A1 conversation, including a hint-assisted turn.
- Daily habit loop: complete a first-ever session and confirm the Trail streak counter shows 1 day and the Katzu check-in card greets the user.
- Daily habit loop: complete a second session the same day and confirm the streak counter does not double-count.
- Daily habit loop: complete a session on the next calendar day and confirm the streak increments; skip a day and confirm it resets honestly to 1 (never inflated).
- Daily habit loop: confirm the "مهمتك اليومية" hero card rotates to a different scenario each day, its «ابدأ مهمة اليوم» button opens that scenario, and a free account is never offered a paid-level mission.
- Daily habit loop: confirm the XP rank name and the progress bar toward the next rank update after completing a session.
- Confirm an unauthenticated AI request is rejected and an expired entitlement opens the redeem/paywall flow.
- Hints: open a new conversation and confirm the suggestions bar is visible before the first reply (cached starter phrases), then confirm AI-generated hints appear after the first Katzu reply, and that the refresh (⟳) button reloads suggestions after a failure.
- Error reporting: send a sentence while the Worker is unreachable (airplane mode) and confirm an error card with «إعادة المحاولة» appears in-chat instead of an endless "كَاتْزُو يفكر في الرد..."; confirm retry re-sends the exact sentence once.
- Network error wording: with ALLOWED_ORIGINS unset on the Worker (open CORS mode) or a wrong worker URL, confirm the in-chat error card shows an Arabic network message (never raw English like "Failed to fetch"), and that setting ALLOWED_ORIGINS to the exact Pages origin restores successful replies.
- Diagnostics: reproduce any error, open Profile → سجل الأخطاء التشخيصي, confirm entries carry ISO timestamps and levels, verify نسخ, تنزيل, and مسح all work, and confirm no token or message content appears in the log text.
- Mic errors: deny microphone permission once and confirm the inline banner explains the denial and typing still works; confirm the banner disappears after a successful retry.
- Mic recovery: on desktop Edge, tap the mic; if no listening state starts within seconds, tap again — the second tap must start listening (zombie-recognizer watchdog), and `language-not-supported` failures show an Arabic banner recommending Chrome/Android instead of failing silently.
- AI 502 diagnosis: when the AI turn fails with HTTP 502, the in-chat error card shows the worker's Arabic message (never a raw English status line), and the diagnostics log records the failure code plus any server `detail`; cross-check `/health` — it reports only overall health (`status`, `ready`, cache sizes, and the Workers AI fallback counters) and deliberately exposes **no** Gemini key metadata (no fragments, no key count), so use `npm run tail:worker` or the admin error feed to see which key or model is failing.
- Workers AI fallback: when all Gemini keys are throttled/unavailable, a chat turn still completes via the Workers AI binding (`@cf/qwen/qwen3-30b-a3b-fp8`) — confirm the turn response carries `provider: "workers-ai"` and `/health` `aiFallback.served` increments; set `AI_FALLBACK_ENABLED="0"` and confirm Gemini-only mode returns the normal error instead.
- Workers AI fallback in-vivo proof (safe procedure — never overwrite production `GEMINI_API_KEYS`; secrets are write-only and cannot be restored): deploy the same worker code under a temporary name (`npx wrangler deploy -c wrangler.probe.toml`) with `GEMINI_API_KEYS` set to an invalid value, an isolated KV namespace, and `TEST_MODE="1"`; send one real `/ai/turn` with a Bearer session/JWT token; confirm HTTP 200 with `provider: "workers-ai"` and a natural German reply; confirm `/health` `aiFallback.served` incremented (`countersSource: "kv"`); then `npx wrangler delete` the probe worker and delete its KV namespace, and confirm production `/health` is untouched. Note: KV counters are best-effort diagnostics — concurrent fallback writes can undercount `served` slightly (read-modify-write race); they are never used for billing.
- Quiz content healing: open the quiz for a scenario whose device cache holds garbled Arabic options (e.g. "يتأخل الساكن"); confirm the quiz auto-refreshes rows from the Worker and re-renders clean options, and that any translation without Arabic letters is filtered out of options.
- Refresh offline and confirm cached curriculum/starter phrases remain available while AI clearly reports that an internet connection is required.
- Test microphone denial and typing fallback in Chrome and Safari.
- Confirm sign-out removes user-scoped local data and a second account cannot see it.
- Token hygiene (Phase 1.1b): sign in and confirm the IndexedDB `users` row (`current_user`) contains `sessionToken` but **no `idToken`** (Application → IndexedDB → KatzuWebDB → users); inspect any authenticated request in the Network tab and confirm the credential travels in the `Authorization: Bearer sess_…` header only — no `id_token` field in any request body; sign out and sign back in on a device that had a legacy row to confirm the Dexie v3 upgrade stripped the old stored `idToken` without losing progress (sessions, mistakes, XP intact).
- Session revocation: sign out and confirm `POST /auth/signout` fires (Network tab); replay a captured `sess_…` token against `/check-status` afterward and confirm it is rejected — a stolen token dies at sign-out instead of living out its TTL.
- Re-auth path: manually clear the stored `sessionToken` (or wait for expiry) and send a chat message — the error card must ask for re-sign-in («انتهت جلسة الدخول…»); confirm no request is sent with a raw Google token.
- Test export and account deletion only after confirming the account and data-loss warning.
- Inspect the production bundle and network requests for API keys, tokens, or personal email addresses.

## 5. Rollback notes (risky changes)

- **Token hygiene (Phase 1.1b):** the worker accepts credentials from the Authorization header first and falls back to `id_token` in the body, so a pre-1.1b app build keeps working against the updated worker — deploy the worker first, ship the app second. Roll back the app build freely; roll back the worker only after old clients are gone. Legacy stored `idToken`s are stripped by the additive Dexie v2→v3 upgrade (no learning data touched); a downgrade to an older app build re-persists tokens on next sign-in — avoid downgrading below v3 schema.
- **CORS fail-closed (Phase 1.4):** open mode now requires `ALLOW_OPEN_CORS="1"` outside production. If local development breaks, set that var in `wrangler dev` — never in production.
- **Session revocation (Phase 1.1a):** `/auth/signout` is additive; rolling it back only removes the sign-out revocation convenience — tokens again expire by TTL only.
