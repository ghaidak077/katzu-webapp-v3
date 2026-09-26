# Katzu — Current State (Phase 0 baseline)
Recorded: 2026-09-24 · commit after PR #9 merge + CI. All facts verified in source.

## Baseline validation results
- `npm run lint` (tsc --noEmit): **clean**
- `npm test -- --run` (vitest): **16 files / 87 tests passed**
- `npm run build`: **success** (PWA generateSW, 45 precache entries, ~7.4s)
- No compilation errors, no failing tests, no missing runtime bindings at build time.

## Stack (unchanged, no migration proposed)
React 18 + TypeScript + Vite PWA · Dexie (IndexedDB) offline layer · React Router · Tailwind · Cloudflare Worker (`cloudflare-unified-worker.js` + sibling modules) · D1 `katzu-content` (content CMS) · KV `USER_PROGRESS` (progress, sessions, quota, AI pool ledger, shared AI cache, fallback metrics) · KV `REDEEMED_CODES` (codes, accounts, referrals, email index) · **multi-provider AI pool** (Gemini · Groq · OpenRouter · NVIDIA NIM, `cloudflare-ai-router.js`) with Workers AI (`@cf/qwen/qwen3-30b-a3b-fp8`) as the last resort.

## Routes (client, `src/App.tsx`)
`/`→`/app/trail` · `/welcome` · `/signin` · `/subscription` · `/app/:tab` (main tabs) · `/scenario/:scenarioId` · `/scenario/:scenarioId/study` · `/scenario/:scenarioId/quiz` · `/scenario/:scenarioId/live` · `/session-report` · `/app/review` · `/app/listen` · `/app/write` · `/app/coach` · `/placement` · `/trust/:page` · `*` → welcome/trail.
**Every authenticated surface is behind sign-in** (`isAuthenticated` gate). No anonymous/preview flow exists.

## Local DB tables (Dexie, `src/lib/db/katzuDb.ts`)
v1: scenarios, starter_phrases, vocabulary, grammar, saved_words, users, redeemed_codes, sessions, scenario_training, mistakes.
v2 (additive + upgrade): adds sync metadata (`syncId`, `updatedAt`, `independentSentences`, `hintAssistedSentences`) + `sync_queue`.
v4 (additive): `review_items` — the spaced-repetition queue (local-first, synced via `POST /review/sync`).
v5 (additive): `skill_practice` — one row per finished dictation / graded text, the only source for the four-skill card in the Progress tab. Never shown as a zero when unmeasured.
Local fixtures exist as offline fallback content; production content lives in D1.

## Worker routes (`cloudflare-unified-worker.js`)
- Auth/session: `POST /auth/session` (Google ID token → 30-day `sess_*` KV session)
- AI: `POST /ai/turn` (+`/turn`) and `POST /ai/translate` (+`/translate`) — handlers in `cloudflare-ai-chat.js`; `POST /ai/hints` (+`/hints`) — `cloudflare-hints.js`; `POST /ai/check-writing` — `cloudflare-writing.js`; `GET /ai/health` (+`/health`). Provider routing (pool, ledger, transports, shared cache) is `cloudflare-ai-router.js`
- Account: `POST /user/delete`
- Billing (codes): `POST /verify`, `POST /check-status`
- Referral: `POST /referral/info`, `POST /referral/claim`
- Progress: `POST /progress/sync`, `POST /progress/get`
- Writing: `POST /ai/check-writing` (authenticated, entitlement-checked, **trial-counted since 2026-09-26** — three used sessions now open the same Pro CTA as the rest of the app; text 20-900 chars; task derived from the level). Hints stay **quota-exempt on purpose**: the trial quota is consumed while a learner's *last* free session is still running, so counting hints there would strip them out of a conversation the learner is still entitled to have
- Memory queue: `POST /review/sync` (server-authoritative merge of the SRS schedule, KV `review:<sub>`); client calls it at sign-in and when a review session finishes
- Telemetry: `POST /client-error` (unauthenticated, IP rate-limited 8/min, body-capped, credential-sanitized → `error_reports`)
- Content (D1): `GET /scenarios`, `GET /scenarios/:id`, `GET /vocabulary`, `GET /grammar`, `POST /admin/upload`
- Admin: `GET /admin` (HTML dashboard), `POST /admin/generate|edit|lookup|revoke|upload|progress-edit|progress-lookup`, `GET /admin/api/content-list`, `POST /admin/api/content-update` (rowid-keyed, column-allowlisted — the only way to correct an existing `vocabulary`/`starter_phrases` row, since `/admin/upload` is insert-only for those tables)
- Crypto sales: `POST /crypto/checkout`, `POST /crypto/webhook` (NOWPayments IPN, HMAC-SHA512), `GET /crypto/health` — called by the separate sales site, never by the app

## Auth flow (current)
Google Identity Services on client → raw Google ID token → `POST /auth/session` exchange → `sess_*` session token stored in Dexie `users` row → Authorization: Bearer. Auto re-exchange on 401 exists. **Raw `idToken` also remains persisted** and several calls additionally send `id_token` in the body (dual credential transport). Session revocation endpoints do not exist (TTL-only).

## Subscription flow (current)
Activation-code only **in the app**: `POST /verify` (HMAC-signed codes, KV record per code + per account) → `account:<sub>` expiry record → `/check-status`. Referral: `REF-XXXXXXXX` codes; payout on invitee's first redemption. Codes are **sold** on the separate sales site (Cloudflare Pages `katzu-sales` → `POST /crypto/checkout` → NOWPayments → `POST /crypto/webhook` mints the code). The app never takes a payment; the Pro paywall and redemption screen link out to the sales site.

## Deletion flow (current)
`POST /user/delete` revokes every session via the `sessions_by_sub:<sub>` index (worker lines 718-723) and deletes: `progress:<sub>`, quota key, `account:<sub>`, `trial:<sub>`, `email_index:*`, referral claim/history keys, the D1 `user_progress` row, `trial_quota_ledger` and `referral_payouts` rows, and the `users` registry row. **Exposed in the UI (profile settings) with an irreversible-data warning and explicit confirmation; the client wipes Dexie locally afterwards. Every step is reported so partial failures surface as retryable instead of a false success.**

## Offline & crash reporting (current)
- The built `sw.js` answers a cold offline navigation with the cached shell (`navigateFallback: 'index.html'`, pinned by `tests/pwaOffline.test.ts`) and precaches 48 entries; content API reads use `StaleWhileRevalidate` for 7 days.
- `registerType: 'autoUpdate'` → the built `sw.js` contains `skipWaiting` + `clientsClaim`, so a deploy takes over immediately rather than leaving a stale bundle against a newer Dexie schema.
- Uncaught client crashes (`window` / `promise`) POST to `/client-error` and appear in the admin error feed; console output stays on the device by design.

## AI calls (current, 2026-09-26)
**Provider pool** (`cloudflare-ai-router.js`): one hardcoded `PROVIDER_POOL` in three tiers — flagship (`gemini-3.8-flash`, `openai/gpt-oss-120b` on Groq, `gemini-3.7-flash`), mid (`gemini-3.6-flash`, `qwen/qwen3.8-27b`), lite (`gemini-3.5-flash-lite`, `openai/gpt-oss-20b`, OpenRouter `thinkingmachines/inkling-small:free`, plus an NVIDIA NIM entry that stays **inert** until its model is filled in). Keys come from `GEMINI_API_KEYS` / `GROQ_API_KEYS` / `OPENROUTER_API_KEYS` / `NVIDIA_API_KEYS` through one generalized parser. The router rotates within a tier before dropping a tier, rotates keys inside a provider, and bounds a whole walk to 24 s so the client's 30 s timeout cannot fire first.

**Terminal day-quota ledger (the fix):** a 429 whose body carries an explicit per-day signal (Gemini's `GenerateRequestsPerDayPerProjectPerModel`, Groq's `requests per day (RPD)`) parks that `(provider, key, model)` unit until its window resets — Gemini/OpenRouter at midnight Pacific, Groq on its rolling window. Parks persist to KV `ai-pool-ledger` (identified by non-reversible fingerprints), so a recycled isolate does not re-walk the pool; a model reported "not found" is parked for every key. Per-minute throttles keep the short cooldown, and a bare 5xx/empty completion parks nothing. **Before this**, a per-day 429 was classified as per-minute (the check compared `"per_day"` against Gemini's CamelCase `PerDay`), so a day-exhausted key was retried on every message — up to 8 models × N keys × 2 calls per learner sentence.

**Calls:** `/ai/turn` is **ONE model call since 2026-09-26** — the roleplay reply and the grammar grade travel in a single fused prompt/schema (`evaluation` nested first, so a truncated answer loses `reply_de` and fails loudly as a 502 instead of returning a turn the app never graded), which halved the provider cost of every learner message; the HTTP response shape is unchanged, so a cached PWA bundle still works. The 6-message window is context for the reply and the isolation rule tells the model to grade only the learner's final sentence. JSON schemas are enforced and the sanitizer strips label echoes; `/ai/hints` returns 2–4 **distinct conversational moves** with an `intent` tag each (same-move rephrasings and duplicate sentences are dropped server-side), quota-exempt; `/ai/translate` is **entitlement-gated since 2026-09-26** (it had no entitlement check at all) and caches through KV; `/ai/check-writing` is trial-counted. Workers AI is the last resort once the whole pool is parked (`AI_FALLBACK_ENABLED`), with KV-backed metrics. `/health` also reports `aiPool` (active / idle / exhausted entries + attempt counters) and the shared cache sizes. Rate limits 10/min, 200/day per account (D1-backed). 64 KB body cap at entry. Translation and hint caches are **KV-backed** (`ai-cache:*`), not per-isolate Maps — the Maps came back empty on every recycled isolate, so the same opener was re-translated after every deploy.

**Known residue (past the ~48 KB edit boundary, cannot be edited in place):** the legacy Gemini-only walker `callGeminiWithFailover` (head at byte 62,186) and the legacy `handleAiHints` / `handleAiTranslation` / `handleAiConversationTurn` bodies are now **unreachable** but still present; `DEFAULT_MODEL_CHAIN` survives only as a projection of `PROVIDER_POOL` because that walker references it. Deleting them requires editing the file by hand or splitting it.

## Environment & bindings inventory
- **Bindings (wrangler.toml):** `DB` (d1 a80158e6…), `USER_PROGRESS` (kv d901da20…), `REDEEMED_CODES` (kv 2c60d78d…), `AI` (Workers AI). Deployed worker name `katzu-test`.
- **Vars:** `ENVIRONMENT=production`, `GOOGLE_CLIENT_ID` (the public web OAuth client, moved out of secrets so it is reviewable in git), `ALLOWED_ORIGINS` (both prod origins set), `AI_RATE_LIMIT_PER_MINUTE=10`, `AI_RATE_LIMIT_PER_DAY=200`, `AI_FALLBACK_ENABLED=1`.
- **Secrets (deployed, write-only):** `GEMINI_API_KEYS` (3 keys live), `GROQ_API_KEYS` / `OPENROUTER_API_KEYS` / `NVIDIA_API_KEYS` (new provider lists — the pool reports them as `idle: no_keys` in `/health` until they are set), `ADMIN_SECRET`, `HMAC_SECRET`, `SESSION_SECRET`. **`GOOGLE_CLIENT_ID` was listed here previously but `wrangler secret list` showed it was never actually set** (measured 2026-09-24), which is why the ID-token `aud` check had been skipped; it is now a var and enforced.
- **D1 app tables (beyond content):** `users`, `activity_log`, `error_reports` (admin registry + telemetry), `redeemed_codes_ledger`, `trial_quota_ledger`, `referral_payouts`, `rate_limit_counters`.
- **Missing/absent:** analytics service, email service, error-reporting service. NOWPayments is wired in code but unconfigured on the deploy (`/crypto/health` → `ready:false`).

## Documented assumptions / risks noted during baseline
- `TEST_MODE` env accepts structurally-valid JWTs without crypto verification — must never be set in production deploys. **Mitigated: the fetch entry strips it whenever `ENVIRONMENT=production`, and a test asserts the deploy config ships no `TEST_MODE`/`NODE_ENV` var. The residual risk is the second bypass trigger (`process.env.NODE_ENV === "test"`), which is inert on this deploy only because `nodejs_compat` is not enabled — do not enable it without moving that check behind the same guard.**
- Rate limiting and trial-quota locking are isolate-local (in-memory Maps) — global abuse control and hard quota ceilings are not guaranteed under concurrency.
- Admin dashboard is served as worker HTML with inline handlers and a browser-typed bearer secret.
- Local seed fixtures use a different topic taxonomy than D1 rows; quiz screens re-pull from worker on mount (stale-cache healing shipped).
