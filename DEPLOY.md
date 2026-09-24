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

   `GOOGLE_CLIENT_ID` is deliberately **not** a secret — it is public (it ships to every
   browser), so it lives in the `[vars]` block of `wrangler.toml` where it can be reviewed
   in git. Set it to the same OAuth client ID as `VITE_GOOGLE_CLIENT_ID`. The worker
   enforces the ID token `aud` claim against it, so a mismatch rejects sign-in with
   `401 invalid_id_token`.

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
6. Store submission needs a public policy URL: `/privacy.html` and `/terms.html` are static files in `public/`, so they deploy automatically. Confirm both return `200` on the live domain before submitting to Google Play or a payment provider.

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
- AI 502 diagnosis: when the AI turn fails with HTTP 502, the in-chat error card shows the worker's Arabic message (never a raw English status line), and the diagnostics log records the failure code plus any server `detail`; cross-check `/health` — keys in cooldown appear there (`cooldown` markers) so an invalid `AQ.*` key is visible without reading secrets.
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
