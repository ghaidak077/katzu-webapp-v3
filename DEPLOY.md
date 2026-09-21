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
- Confirm an unauthenticated AI request is rejected and an expired entitlement opens the redeem/paywall flow.
- Refresh offline and confirm cached curriculum/starter phrases remain available while AI clearly reports that an internet connection is required.
- Test microphone denial and typing fallback in Chrome and Safari.
- Confirm sign-out removes user-scoped local data and a second account cannot see it.
- Test export and account deletion only after confirming the account and data-loss warning.
- Inspect the production bundle and network requests for API keys, tokens, or personal email addresses.
