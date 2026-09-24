# Katzu — Current State (Phase 0 baseline)
Recorded: 2026-09-24 · commit after PR #9 merge + CI. All facts verified in source.

## Baseline validation results
- `npm run lint` (tsc --noEmit): **clean**
- `npm test -- --run` (vitest): **16 files / 87 tests passed**
- `npm run build`: **success** (PWA generateSW, 45 precache entries, ~7.4s)
- No compilation errors, no failing tests, no missing runtime bindings at build time.

## Stack (unchanged, no migration proposed)
React 18 + TypeScript + Vite PWA · Dexie (IndexedDB) offline layer · React Router · Tailwind · Cloudflare Worker (single `cloudflare-unified-worker.js`) · D1 `katzu-content` (content CMS) · KV `USER_PROGRESS` (progress, sessions, quota, fallback metrics) · KV `REDEEMED_CODES` (codes, accounts, referrals, email index) · Gemini AI engine with Workers AI (`@cf/qwen/qwen3-30b-a3b-fp8`) fallback.

## Routes (client, `src/App.tsx`)
`/`→`/app/trail` · `/welcome` · `/signin` · `/subscription` · `/app/:tab` (main tabs) · `/scenario/:scenarioId` · `/scenario/:scenarioId/study` · `/scenario/:scenarioId/quiz` · `/scenario/:scenarioId/live` · `/session-report` · `/trust/:page` · `*` → welcome/trail.
**Every authenticated surface is behind sign-in** (`isAuthenticated` gate). No anonymous/preview flow exists.

## Local DB tables (Dexie, `src/lib/db/katzuDb.ts`)
v1: scenarios, starter_phrases, vocabulary, grammar, saved_words, users, redeemed_codes, sessions, scenario_training, mistakes.
v2 (additive + upgrade): adds sync metadata (`syncId`, `updatedAt`, `independentSentences`, `hintAssistedSentences`) + `sync_queue`.
Local fixtures exist as offline fallback content; production content lives in D1.

## Worker routes (`cloudflare-unified-worker.js`)
- Auth/session: `POST /auth/session` (Google ID token → 30-day `sess_*` KV session)
- AI: `POST /ai/turn` (+`/turn`), `POST /ai/translate` (+`/translate`), `POST /ai/hints` (+`/hints`), `GET /ai/health` (+`/health`)
- Account: `POST /user/delete`
- Billing (codes): `POST /verify`, `POST /check-status`
- Referral: `POST /referral/info`, `POST /referral/claim`
- Progress: `POST /progress/sync`, `POST /progress/get`
- Content (D1): `GET /scenarios`, `GET /scenarios/:id`, `GET /vocabulary`, `GET /grammar`, `POST /admin/upload`
- Admin: `GET /admin` (HTML dashboard), `POST /admin/generate|edit|lookup|revoke|upload|progress-edit|progress-lookup`

## Auth flow (current)
Google Identity Services on client → raw Google ID token → `POST /auth/session` exchange → `sess_*` session token stored in Dexie `users` row → Authorization: Bearer. Auto re-exchange on 401 exists. **Raw `idToken` also remains persisted** and several calls additionally send `id_token` in the body (dual credential transport). Session revocation endpoints do not exist (TTL-only).

## Subscription flow (current)
Activation-code only: `POST /verify` (HMAC-signed codes, KV record per code + per account) → `account:<sub>` expiry record → `/check-status`. Referral: `REF-XXXXXXXX` codes; payout on invitee's first redemption. **No real checkout; no payment provider.**

## Deletion flow (current)
`POST /user/delete` deletes: `progress:<sub>`, quota key, `account:<sub>`, `trial:<sub>`, D1 `user_progress` row. **Not exposed in UI. Leaves `session:*`, `email_index:*`, `referral:*` keys. No local Dexie wipe wired to it.**

## AI calls (current)
`/ai/turn` = roleplay call (6-message window) + evaluation call (no history), JSON schemas enforced, sanitizer strips label echoes; `/ai/hints` single-hint (quota-exempt); Workers AI fallback after full Gemini failover (`AI_FALLBACK_ENABLED`), KV-backed fallback metrics in `/health`. Rate limits 10/min, 200/day (per-isolate Map). 64KB body cap at entry.

## Environment & bindings inventory
- **Bindings (wrangler.toml):** `DB` (d1 a80158e6…), `USER_PROGRESS` (kv d901da20…), `REDEEMED_CODES` (kv 2c60d78d…), `AI` (Workers AI). Deployed worker name `katzu-test`.
- **Vars:** `ALLOWED_ORIGINS` (both prod origins set), `AI_RATE_LIMIT_PER_MINUTE=10`, `AI_RATE_LIMIT_PER_DAY=200`, `AI_FALLBACK_ENABLED=1`.
- **Secrets (deployed, write-only):** `GEMINI_API_KEYS` (3 keys live), `GOOGLE_CLIENT_ID`, `ADMIN_SECRET`, `HMAC_SECRET`. **`ENVIRONMENT` is NOT set** — production fail-closed currently relies on the allowlist being present.
- **Missing/absent:** no payment provider, no analytics service, no email service, no error-reporting service.

## Documented assumptions / risks noted during baseline
- `TEST_MODE` env accepts structurally-valid JWTs without crypto verification — must never be set in production deploys.
- Rate limiting and trial-quota locking are isolate-local (in-memory Maps) — global abuse control and hard quota ceilings are not guaranteed under concurrency.
- Admin dashboard is served as worker HTML with inline handlers and a browser-typed bearer secret.
- Local seed fixtures use a different topic taxonomy than D1 rows; quiz screens re-pull from worker on mount (stale-cache healing shipped).
