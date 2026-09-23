# Katzu PWA deployment

## 1. Prepare the Worker

1. Install Wrangler and authenticate with the Cloudflare account that owns the Worker and Pages project.
2. Configure the Worker entry point as `cloudflare-unified-worker.js`.
3. Create or select the D1 database used for content and user records.
4. Create the KV namespaces used for progress and redeemed codes.
5. Configure Worker secrets and variables. Use `.env.example` for names only; never commit values:
   - `GEMINI_API_KEY` or `GEMINI_API_KEYS`
   - `GOOGLE_CLIENT_ID`
   - `ALLOWED_ORIGINS`
   - `AI_RATE_LIMIT_PER_MINUTE`
   - `AI_RATE_LIMIT_PER_DAY`
   - the D1/KV bindings used by the Worker. `USER_PROGRESS` is required for
     authenticated trial AI access: the Worker stores authoritative quota
     records under `ai-quota:<google-sub>` in that existing KV namespace.
6. Run additive D1 migrations before serving traffic.
7. Deploy with Wrangler and record the deployed Worker URL.

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
