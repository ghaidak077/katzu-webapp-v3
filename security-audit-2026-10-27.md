# Security audit — Katzu app + landing site

Date: 2026-10-27
Scope: `katzu/` (Cloudflare Worker, React PWA, Pages config) and `website/` (standalone
landing on website.katzuai.com plus its proxy Worker).
Mode: source-first, defensive. No live probing of application endpoints, no target code
execution, no production data accessed.

## Limits of this run

- **Source only.** Cloudflare dashboard settings (WAF, rate-limiting rules, Access,
  DNS/CAA, Workers observability), Google Cloud OAuth client configuration, and the
  contents of `.env.production` were not readable here. Anything that depends on them is
  listed under *Needs validation* and is **not** marked safe.
- **No sandbox was available**, so nothing target-controlled was built, executed or
  fuzzed. Runtime claims below come from reading code that already ships.
- This is a **scoped audit**, not proof of "completely safe". It covers the security
  boundaries that exist in the repository; absence of a finding is not a guarantee.

## What was fixed during this run (verified live)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | Medium | Landing loaded GSAP, ScrollTrigger and Lenis from public CDNs with **no Subresource Integrity** — a compromised CDN/package could run arbitrary JS in the marketing origin and rewrite its "start learning" CTAs to a phishing flow. | `website/index.html` now pins each script with a `sha384` SRI hash and `crossorigin="anonymous"`. |
| 2 | Medium | Landing shipped **no security headers and no CSP** — any injected script could load from anywhere, and the page could be framed. | Added `website/_headers`: CSP (no external script hosts beyond the two pinned CDNs and Cloudflare's own analytics beacon), `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, referrer policy, Permissions-Policy, COOP. |
| 3 | Medium | The proxy Worker forwarded **every** request header — including `Cookie` and `Authorization` — to `katzu-landing.pages.dev`, and accepted any HTTP method. | `cloudflare-website-proxy.js` now forwards only an allowlist of safe, read-only headers (accept, language, encoding, UA, conditional/range) and answers `405` for anything but GET/HEAD. |
| 4 | Low | Cloudflare's auto-injected analytics beacon was blocked by the new CSP, producing a console error and silently losing pageviews. | Beacon hosts allowed explicitly in the landing CSP. |

Verified after deploy: landing returns the new CSP, SRI attributes are present, POST → 405,
page renders with GSAP/Lenis and **zero console errors**.

## Confirmed findings still open (app)

| # | Severity | Finding | Evidence | Smallest fix |
|---|----------|---------|----------|--------------|
| 5 | Low | App CSP `connect-src` allows **any** `*.workers.dev` host. The app never fetches anything but its own Worker, so a future HTML-injection bug could exfiltrate a session token to an attacker-controlled Workers subdomain. | `public/_headers` line with `connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://*.workers.dev` | Replace `https://*.workers.dev` with the exact Worker origin from the build config. |
| 6 | Low | No `Strict-Transport-Security` and no `Cross-Origin-Opener-Policy` on the app. Framing is already blocked by `frame-ancestors 'self'`; HSTS/COOP are defence in depth. | `public/_headers` | Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` and `Cross-Origin-Opener-Policy: same-origin`. |
| 7 | Low | `POST /auth/session` has **no rate limit** before it calls Google's `tokeninfo` endpoint. Anyone can post junk JWTs and make the Worker perform a Google round-trip each time (CPU + upstream quota), unauthenticated. | `cloudflare-unified-worker.js` `handleAuthSession` → `verifyGoogleIdToken` fetch | Add the same amortized per-IP counter used by `/client-error` (or D1) keyed on `CF-Connecting-IP`, e.g. 20/min. |
| 8 | Low | `POST /client-error` is unauthenticated and writes `error_reports` rows. Its limit is in-isolate only, so it resets with each new Worker isolate and can be used to spam the table. | `handleClientError` uses `checkRateLimit` (in-memory), not the D1 limiter | Use `checkGlobalRateLimit('client-error:'+ip, …)` with a small daily budget, and cap message length. |
| 9 | Informational | `.env.production` is tracked in git. If it ever contains a non-`VITE_` value, that value is public history. | `git ls-files` → `.env.production` | Confirm it holds only `VITE_*` public settings; move anything else to Worker secrets. |
| 10 | Informational | Public `/health` reports pool/model health lanes. No keys are exposed, but it hands an attacker a map of which providers are usable. | `handlePublicHealth` | Keep as-is for status pages, or trim provider details in production. |

## Strong controls verified in source

- **Google ID tokens**: RS256 enforced, `iss` pinned to Google, `aud` checked against
  `GOOGLE_CLIENT_ID`, `exp` checked, and the token is finally verified by Google's
  `tokeninfo` endpoint — not merely decoded. `TEST_MODE` is neutralized unless
  `ENVIRONMENT` is explicitly `"test"`, so a stale var cannot reopen the bypass.
- **Sessions**: 256-bit random opaque `sess_` tokens, 30-day TTL, revoked at sign-out and
  account deletion, never placed in URLs.
- **Admin**: fails closed when the secret is missing or shorter than 24 chars; constant-time
  comparison; durable per-IP lockout (5 failures / 15 min) across `/admin*`; no default
  credential.
- **CORS**: production requires an exact origin allowlist; malformed/missing config fails
  closed; no wildcard, and `Allow-Credentials` is never paired with `*`.
- **SQL**: all user-influenced values are bound parameters; dynamic identifiers come only
  from internal constants/lists; the one free-form filter (order status) is regex-validated.
- **Crypto fulfilment**: HMAC-SHA512 over key-sorted JSON, compared in constant time;
  delivery deduped by payment/status ledger and a conditional `UPDATE`, so a replayed
  webhook cannot mint a second code. Checkout is restricted to `SALES_ORIGIN`.
- **Data rights**: export strips credential-shaped fields recursively; deletion revokes all
  sessions and clears KV/D1 per-account rows including mock and analytics data.
- **Abuse controls**: durable D1 rate limits, per-account daily quota, global AI spend cap,
  activation-code lockout, payload ceilings (64 KB JSON / 400 KB audio), maintenance kill
  switch.
- **Client**: no `dangerouslySetInnerHTML`, no `eval`/`new Function`, React escaping intact;
  external links carry `rel="noopener noreferrer"`; tokens live in IndexedDB, not
  `localStorage`.
- **Dependencies**: `npm audit --omit=dev` → 0 vulnerabilities.
- **Secret scan**: repository tree scan reports only test fixtures; no live credential in
  tracked files.

## Needs validation (outside the source I can see)

1. Cloudflare zone: WAF managed rules, Bot Fight Mode, rate-limiting rules, HSTS setting,
   CAA records, and whether `katzuai.com` / `website.katzuai.com` are proxied.
2. Google Cloud OAuth client: authorised JavaScript origins list — should contain exactly
   `https://katzuai.com` (and the pages.dev fallback), not wildcards.
3. `ADMIN_SECRET` and `HMAC_SECRET` length/entropy in the production Worker; the code
   enforces ≥24 chars for admin only.
4. Contents of tracked `.env.production` (only `VITE_*` public values allowed).
5. Whether Cloudflare Web Analytics is intentional on the landing (now allowed by CSP).

## Suggested next hardening (not applied)

- Narrow the app's `connect-src` to the deployed Worker origin; add HSTS + COOP.
- Add a per-IP limiter to `/auth/session` and a durable limiter to `/client-error`.
- Serve `website.katzuai.com` from the Pages custom domain rather than a proxy Worker once
  DNS access is available — one less moving part in the request path.
- Commit `website/`, `website/_headers`, `cloudflare-website-proxy.js` and
  `wrangler.website.toml` so the hardened configuration is reproducible.

## Addendum — 2026-10-27, later the same day (findings 5–7 closed, checked on production)

Deployed after this audit and re-checked live: app `katzuai.com` ← Pages
**`3c5fcfef-24ea-406c-b3b4-d725a4838b4b`** (bundle `assets/index-DtOhy65S.js`); site
`website.katzuai.com` ← Pages **`de591b4e-364e-4779-8d87-57ea5adb2dd8`**.

| # | Status | What shipped | Live evidence |
|---|--------|--------------|---------------|
| 5 | **Closed** | `connect-src` names only `'self'`, `accounts.google.com`, `oauth2.googleapis.com` and the exact Worker origin `https://katzu-test.ghaidakalosh008.workers.dev` — no `*.workers.dev`. A unit test fails if a scheme-wide or bare-host source returns. | `curl -sI https://katzuai.com/signin` shows the narrowed policy; `tests/pwaOffline.test.ts` pins it. |
| 6 | **Closed, with one correction** | HSTS shipped as asked. **COOP shipped as `same-origin-allow-popups`, not `same-origin`.** `same-origin` is the wrong value for this app: it severs the `window.opener` Google Identity Services' popup needs to return the credential, so the popup would close with no token and sign-in would look broken — the audit's suggested fix would have caused an outage. | Live header reads `cross-origin-opener-policy: same-origin-allow-popups`; the COOP assertion in `tests/pwaOffline.test.ts` fails on plain `same-origin`. |
| 7 | **Closed (2026-10-28)** | `handleAuthSession` now calls `checkGlobalRateLimit` **before** `verifyGoogleIdToken` — scope `auth-session`, 20/min + 600/day per `CF-Connecting-IP`, durable `rate_limit_counters` rows, `429` with `Retry-After` and `retry_after` in the body. Deployed as worker **`6f5ba883-6730-43d2-b8cd-9c275b298fee`** (source `726a710`; rollback `e1a9a2ca-e919-43e2-baba-28a52bddd1cd`). | Live: 30 rapid opaque-session posts to `/auth/session` → 11×`401` then 19×`429`, `Retry-After: 13`; D1 shows `auth-session:m:ip:…` and `:d:ip:…`. `tests/workerSecurity.test.ts` pins the 429 + header. |
| 8 | Open | — | `/client-error` still uses the in-isolate counter. |
| 9 | Open | — | `.env.production` still tracked; read it as public. |
| 10 | Open | — | `/health` still reports the storage lanes. |

Two related changes came out of the same run and are worth keeping in view:

- **GIS needs three more CSP entries than the audit assumed**, all exact hosts: `script-src …/gsi/client`
  (already), `style-src https://accounts.google.com/gsi/style`, `font-src https://fonts.gstatic.com`
  (the button's typeface) and `img-src https://*.googleusercontent.com` (the One Tap avatar). The
  `script-src` stays path-scoped — no bare `https://accounts.google.com`, no `https:`.
- **New finding, #11 (Informational, open): the service worker precaches 122 entries ≈ 4.9 MB and a
  cold install takes ~70 s on this connection.** During that window the app is usable but not
  offline-capable, and `navigator.serviceWorker.ready` does not resolve. Not a security issue; it is
  the first-visit cost of shipping the whole shell. Cheapest fix if it matters: drop the biggest
  non-critical assets from `globPatterns` and let them cache on use.

