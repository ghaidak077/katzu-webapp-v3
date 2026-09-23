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
   npx wrangler secret put GOOGLE_CLIENT_ID  # same OAuth client ID as VITE_GOOGLE_CLIENT_ID
   npx wrangler secret put ADMIN_SECRET      # long random string (protects /admin)
   npx wrangler secret put HMAC_SECRET       # long random string (token signing)
   ```

3. Set `ALLOWED_ORIGINS` in the `[vars]` block of `wrangler.toml` to the exact Pages origin(s) before public launch (empty = open CORS, dev only).
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
- Refresh offline and confirm cached curriculum/starter phrases remain available while AI clearly reports that an internet connection is required.
- Test microphone denial and typing fallback in Chrome and Safari.
- Confirm sign-out removes user-scoped local data and a second account cannot see it.
- Test export and account deletion only after confirming the account and data-loss warning.
- Inspect the production bundle and network requests for API keys, tokens, or personal email addresses.
