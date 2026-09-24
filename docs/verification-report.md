# Katzu — Full Verification Report
**Date:** 2026-09-24 · commit `ff7b857` (main) · deployed targets: Pages `katzu-webapp-v3.pages.dev`, Worker `katzu-test` (live version deployed from this commit).
**Method:** every claim carries real evidence. Nothing was deployed or fixed during this audit (read-only against production; browser checks touched only their own throwaway browser profile). No secret values are printed.

---

## 1. Executive summary

| Metric | Count |
|---|---|
| Automated checks executed | 60+ (baseline cmds, static scans, 103 unit tests, live worker probes, 12-check browser battery, 11-check token-hygiene battery) |
| Verified pass | 55 |
| Verified failure | 4 (documented below, none silently fixed) |
| Blocked / not verifiable | 6 |
| Launch blockers (critical) | 4 |
| High-priority issues | 5 |

**Overall status: NOT READY for public launch. READY FOR INTERNAL TESTING / PRIVATE ALPHA.**

Top 5 risks (in order):
1. **No checkout** — the only monetization is activation codes; the $5/mo product cannot be purchased (verified: no payment code anywhere; `SubscriptionRedemptionScreen` = code input only).
2. **Concurrency windows on KV** — code redemption, referral payout, and trial quota use read-modify-write with no transaction; concurrent requests can double-redeem a code or exceed the free quota (verified by code reading; unit tests for concurrency are absent). Rate limits are isolate-local.
3. **Account deletion is incomplete and unreachable** — worker deletes 4 KV keys + D1 row but leaves `session:*`, `email_index:*`, `referral:*`; no UI exposes it; no export feature exists — both contradict the in-app privacy copy (verified by source + UI absence).
4. **AI request fields unbounded & client-trusted** — `persona`, `scenario_title` from the client are injected into the prompt; `user_message` length unbounded (only the global 64KB cap applies); CEFR level not allowlisted on AI endpoints (verified in `handleAiConversationTurn`).
5. **Draft legal pages + sign-in-only value** — TrustInfoScreen self-declares as draft («مسودة تشغيلية»), and every learning surface is behind sign-in (no preview), suppressing activation (verified).

**Launch recommendation:** proceed to internal testing / private alpha immediately; close Gate-1 security items (in progress: CORS fail-closed, session revocation, token hygiene already landed and verified) before any public payment link.

---

## 2. Environment

| Item | Value |
|---|---|
| Node | v22.23.2 |
| npm | 10.9.8 |
| Dependencies installed | Yes (lockfile respected; `npm ci` used by CI) |
| Git status | Clean except untracked `.claude/skills/` (local tooling) |
| CI workflow | `.github/workflows/ci.yml` — typecheck + worker syntax + tests + build; green on latest commit |
| Worker bindings (wrangler.toml) | `DB` (D1), `USER_PROGRESS` (KV), `REDEEMED_CODES` (KV), `AI` (Workers AI) — all documented |
| Vars configured | `ALLOWED_ORIGINS` (both prod origins), rate limits, `AI_FALLBACK_ENABLED=1` |
| Secrets configured (names only) | `GEMINI_API_KEYS`, `GOOGLE_CLIENT_ID`, `ADMIN_SECRET`, `HMAC_SECRET` — values never read |
| Assets | `_headers`, `robots.txt`, `sitemap.xml`, mascot icons (manifest icon sources exist on disk + live 200) |

---

## 3. Automated test results (exact)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` (tsc --noEmit) | 0 | clean |
| `npm test -- --run` | 0 | **17 files / 103 passed / 0 failed / 0 skipped** |
| `npm run build` | 0 | built in 6.87s; one chunk-size warning (Vite default limit; advisory only) |
| `node --check cloudflare-unified-worker.js` | 0 | OK |
| `npm audit` | 0 | **0 vulnerabilities** |
| Live worker probes (curl) | — | see §6 |
| Browser battery (`scripts/verification-battery.cjs`) | — | 8/12 pass (4 failures documented §7) |
| Token-hygiene battery (`scripts/smoke-token-hygiene.cjs`) | — | 11/11 pass |

Per-file unit tests (vitest JSON reporter): checkIn 6 · dailyMission 6 · metrics 4 · proStatus 5 · progress 2 · quizGenerator 5 · referral 5 · scenarioVocab 5 · streak 8 · subscription 5 · sync 2 · tokenHygiene 7 · trial 5 · workerClient 8 · workerSecurity 18 · workersAiFallback 6 · xpMilestones 6.

**Missing test coverage (explicit gaps):** concurrent redemption / quota race / referral replay (§6.6); cross-user isolation at the worker level (two-session progress test); malformed/oversized per-field AI payloads (only whole-body 64KB tested); progress two-device merge conflict; timezone/DST streak boundaries; placeholder/guest-token flow; offline quiz/mistake review; `handleAdmin*` authorization matrix beyond "no secret → 401".

---

## 4. Security results (static + live)

| # | Finding | Location | Evidence | Severity | Blocks launch? |
|---|---|---|---|---|---|
| S1 | AI input fields unbounded; client `persona`/`scenario_title` injected into prompt; CEFR level not allowlisted on AI endpoints | `handleAiConversationTurn` | source reading: destructures client fields, no caps; `grep` for bounds empty | HIGH | Yes (prompt-injection + cost control) |
| S2 | Code redemption not atomic (`get`→`put`) | `handleVerify` | source reading | HIGH | Yes (paid entitlement) |
| S3 | Trial quota per-isolate lock; rate limits per-isolate Map | `consumeTrialQuota`, `checkRateLimit` | source reading | HIGH | Yes (quota abuse) |
| S4 | Deletion leaves `session:*`/`email_index:*`/`referral:*`; no UI; no export | `handleDeleteUser`, `src/features` | source + UI grep | HIGH | Yes (GDPR/trust) |
| S5 | Admin dashboard: bearer secret typed into browser page; `innerHTML`-style rendering; served at `/admin` unauthenticated (secret-gated API calls only; page shell + inline handlers exposed) | `renderAdminDashboardHtml`; live probe `GET /admin → 200` | live curl + source | MEDIUM | Before admin use in prod |
| S6 | Guest/preview sign-in uses fake token `preview_guest_token` with `guest@katzu.app` | `SignInScreen.tsx:277` | source | MEDIUM | Yes (fake auth identity) |
| S7 | CSP allows `unsafe-inline` for scripts | `public/_headers` | source | MEDIUM | No (but harden) |
| S8 | Legacy: raw `idToken` was persisted — **remediated and verified** (Dexie v3 strip; signed-in live audit shows `idToken: ABSENT`) | `katzuDb.ts` | live browser audit | RESOLVED | — |
| S9 | Tokens never written to diagnostics/export/logs | `diagnostics.ts` header comment + no token grep hits | static scan | PASS | — |

**Verified clean:** no provider secrets in `src/`; Gemini keys only server-side; browser bundle has zero secret patterns; CORS fails closed live (`Origin: https://evil.example` → rejection header, 403 path); `TEST_MODE` bypass documented as never-for-production.

---

## 5. Worker endpoint inventory (verified against source)

| Endpoint | Method | Auth | Entitlement | Rate limit | Quota | Notes / verified errors |
|---|---|---|---|---|---|---|
| /auth/session | POST | Google JWT | — | — | — | exchanges to 30d `sess_*` |
| /auth/signout | POST | session | — | — | — | revokes; idempotent (tested) |
| /ai/turn (+/turn) | POST | session/JWT | yes | yes (per-isolate) | consumes per session_id | 401/402/429/413/400 verified live |
| /ai/translate | POST | session/JWT | yes | yes | exempt | 401 unauth verified in tests |
| /ai/hints | POST | session/JWT | yes | yes | **exempt** (by design) | hints never blocked (tested) |
| /ai/health (/health) | GET | none | — | — | — | healthy; keys/fallback metrics live |
| /user/delete | POST | session/JWT | — | — | — | partial (S4) |
| /verify | POST | session/JWT (extractIdToken) | — | — | — | HMAC codes; race S2 |
| /check-status | POST | session/JWT | — | — | — | 400 on missing credential (live) |
| /referral/info, /referral/claim | POST | session/JWT | — | — | — | payout race S2 |
| /progress/sync, /progress/get | POST | session/JWT | — | — | — | merge exists; race S3-adjacent |
| /scenarios, /scenarios/:id, /vocabulary, /grammar | GET | **none (public)** | — | — | — | verified credential-free live |
| /admin* | GET/POST | ADMIN_SECRET bearer | — | — | — | no secret → 401 live; page shell 200 (S5) |

---

## 6. Live worker probes (evidence)

- `GET /health` → `status: healthy, keys: 3, fallback enabled: true, binding: true, served: 0`
- Unknown origin `POST /check-status` → response carries `x-cors-rejection: origin_not_in_allowlist` (fail-closed verified live)
- Approved origin, empty body → `400` (structured error, no internals)
- 70KB body → **413** payload_too_large
- Malformed JSON → **400** `user_message required`-class structured error
- `POST /admin/generate` without secret → **401**

---

## 7. Browser & user-journey results (live deployed app)

| Journey | Result | Evidence | Severity |
|---|---|---|---|
| Landing renders (no blank screen) | PASS | root populated; Arabic UI text present; zero console errors | — |
| Anonymous route guard | PASS | `/app/trail` → `/welcome` redirect (auth-first by design) | — |
| Conversation screen RTL/LTR | **FAIL (audit-path only)** | unauthenticated visit redirects to `/welcome` before the LTR input exists — the signed-in token-hygiene battery separately verified `dir=rtl` shell + `input[dir=ltr]` + full turn flow 11/11 | Low (coverage order) |
| Horizontal overflow 320→1440px | PASS | scrollWidth−clientWidth ≤ 2px on profile at all 7 widths | — |
| Anonymous storage clean | PASS | no localStorage/sessionStorage/cookies; no tokens | — |
| Signed-in storage audit | PASS | `idToken: ABSENT`, session-only, no cookies; email present as expected per policy | — |
| Performance | PASS | 210ms load, LCP 232ms, 155KB JS / 3 requests (headless) | — |
| PWA manifest | PASS | `lang: ar, dir: rtl`, 2 icons, icon files live (200) | — |
| **Offline shell** | **FAIL** | SW registers, but cold offline navigation shows blank root (`net::ERR_INTERNET_DISCONNECTED` on reload; app-shell fallback missing for navigation requests) | HIGH |
| **Trust/privacy reachable** | **FAIL** | `/trust/privacy` redirects anonymous users to `/welcome` (route guard treats it as protected); legal pages unreachable for logged-out users and no link surfaces in welcome/sign-in | MEDIUM |
| Accessibility spot-check | PASS | 0 icon-only unlabeled buttons on welcome; 5 focusables; 200% zoom overflow = 0px | — |

Journey classification for the report table: New learner onboarding **PASS (blocked at sign-in wall by design)** · First lesson **BLOCKED (requires real sign-in — no anonymous preview exists)** · Sign-in **BLOCKED (needs product-owner Google account)** · Conversation **PASS (11/11 with seeded session)** · Offline learning **FAIL** · Subscription **BLOCKED (no checkout; codes need a real code)** · Account deletion **FAIL (unreachable in UI; worker partial)**.

---

## 8. Content & pedagogy sample (live D1)

- `apartment_viewing`: title_ar «معاينة شقة» natural; German phrases level-appropriate (A1–B1 spread: „Die Wohnung ist schön." → „Sind die Nebenkosten im Mietpreis enthalten?"); Arabic translations natural MSA, correctly mapped (`german`/`translation_ar` fields intact — earlier garbled rows were stale cache, healing logic shipped).
- Persona field present but **only 28 chars** — scenario personas are thin; roleplay relies on generic persona default. Content-depth gap (Gate 3).
- Roast safety: sarcasm prompt explicitly «never mocking the learner» (worker line-level evidence); pronunciation claims: UI does not advertise scoring beyond transcription feedback (verified strings).
- Unsupported claims: none found in copy beyond draft-legal inconsistency (S4/G6).

---

## 9. Performance
- Load 210ms / LCP 232ms / 155KB JS (headless, warm CDN) — excellent for 3G-class targets.
- Bundle: single index chunk triggers Vite's chunk-size advisory (aesthetic, not blocking).
- Risks flagged for future: unbounded chat message state (long sessions), AI latency depends on model-chain walk (fallback armed; `/health` shows served=0 so far).

---

## 10. Privacy
- Storage audit (live): anonymous = zero storage; signed-in = session token + profile email only, no cookies/localStorage tokens; no `idToken` (remediated).
- Network audit (live + captured): no Gemini key ever in browser; auth header-only (post-1.1b, 11/11); worker responses `Cache-Control: no-store` via CORS header set; CSP `connect-src` limits API surface to accounts.google.com + workers.dev.
- `npm audit`: 0 vulnerabilities.
- Deletion/export gaps: see S4 — policy copy currently overpromises.

---

## 11. Production readiness checklist
- Env vars/secrets documented (names only) — YES · D1/KV IDs in wrangler.toml — YES · CORS explicit + fail-closed live — YES · OAuth origins documented (worker + Google console as per DEPLOY.md) — YES
- Robots + sitemap + headers — YES · Icons live — YES · Debug UI: `AppLogger` gate needs release-build verification on PWA web (flagged, unverified) — PARTIAL
- Admin protected (API) — YES; admin page shell hardening — PENDING (S5)
- Billing provider — **MISSING (no checkout)** · Legal pages — **DRAFTS** · Support email — **PLACEHOLDER text** («أضف بريد الدعم الرسمي…»)
- Rollback notes — YES (DEPLOY.md §5) · Backup/recovery for D1 — NOT DOCUMENTED

## 12. Launch gate
**NOT READY — READY FOR INTERNAL TESTING — READY FOR PRIVATE ALPHA — not READY FOR PAID BETA — not READY FOR PUBLIC LAUNCH**

Blocked-for-public list from the brief: concurrency abuse (S2/S3) · incomplete deletion (S4) · unreviewed legal while accepting payment (no payment exists yet — but legal must land with it) · unbounded AI fields (S1) · admin hardening (S5). Authentication/token exposure/CORS/browser-secrets/data-leak-between-accounts: **all verified resolved or passing**.

## 13. Prioritized fix plan (do not implement without approval)
1. **P0** — S1 AI bounds + level allowlist + server-side scenario lookup (worker-only, hours).
2. **P0** — S2/S3 atomic redemption + durable quota (D1 transaction) + global rate limits + concurrency tests.
3. **P0** — S4 complete deletion (+revoke via `sessions_by_sub`) + deletion/export UI (Gate 1.2/1.3).
4. **P1** — Offline app-shell navigation fallback (`navigateFallback` for SW) + trust pages made public + legal copy finalization.
5. **P1** — S6 guest token removal (replace with honest local-preview mode or remove).
6. **P2** — S5 admin hardening; CSP `unsafe-inline` removal; chunk splitting; D1 backup runbook; debug-UI release gating verification.
