# Katzu PWA deployment

## 1. Prepare the Worker

1. Install Wrangler and authenticate with the Cloudflare account that owns the Worker and Pages project.
2. Configure the Worker entry point as `cloudflare-unified-worker.js`.
3. Create or select the D1 database used for content and user records.
4. Create the KV namespaces used for progress and redeemed codes.
5. Configure Worker secrets and variables. Use `.env.example` for names only; never commit values:
   - `GEMINI_API_KEY`, `GEMINI_MODEL`, and `GEMINI_FALLBACK_MODEL`
   - `SESSION_SECRET` (a new, high-entropy secret; do not reuse `HMAC_SECRET`)
   - `GOOGLE_CLIENT_ID`
   - `ALLOWED_ORIGINS`
   - `AI_RATE_LIMIT_PER_MINUTE`
   - `AI_RATE_LIMIT_PER_DAY`
   - `AI_DAILY_TURN_CAP` (default `150`)
   - Access tiers (all optional): `TRIAL_DAYS` (default `7`), `TRIAL_DAILY_SESSIONS` (default `5`),
     `FREE_DAILY_SESSIONS` (default `1`), `FREE_LEVELS` (default `A1`, comma list), `MAX_SESSION_TURNS` (default `12`)
   - the D1/KV bindings used by the Worker. `USER_PROGRESS` stores progress;
     quota counters are D1-authoritative.
6. Run the migrations once, in order, before serving traffic:
   `wrangler d1 execute <DB_NAME> --remote --file migrations/001_quota.sql`, then
   `wrangler d1 execute <DB_NAME> --remote --file migrations/002_trial.sql`
   (`002` is not repeatable; if it fails with "duplicate column", it already ran).

   Access model, enforced only on the Worker:
   - `pro` (active code): every level, limited only by `AI_DAILY_TURN_CAP`.
   - `trial` (first `TRIAL_DAYS` days after first sign-in): every level, up to `TRIAL_DAILY_SESSIONS` new live sessions per UTC day.
   - `free` (after the trial): only `FREE_LEVELS`, up to `FREE_DAILY_SESSIONS` new live sessions per UTC day.
   The trial start is stored once in `accounts.trial_started_at` and survives clearing browser data.
   A new `session_id` is admitted by one conditional D1 statement (per-day session count for that user);
   turns inside a session increment only while `turns < MAX_SESSION_TURNS`. The Worker checks D1
   `meta.changes` and refunds `usage.turns` and `trial_sessions.turns` when Gemini fails.
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
- Confirm an unauthenticated AI request is rejected and an expired entitlement opens the redeem/paywall flow.
- Refresh offline and confirm cached curriculum/starter phrases remain available while AI clearly reports that an internet connection is required.
- Test microphone denial and typing fallback in Chrome and Safari.
- Confirm sign-out removes user-scoped local data and a second account cannot see it.
- Test export and account deletion only after confirming the account and data-loss warning.
- Inspect the production bundle and network requests for API keys, tokens, or personal email addresses.
