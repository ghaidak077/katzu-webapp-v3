# Katzu — Launch Gate (Phase 0)
Definition: conditions that must be TRUE before **paid public beta**. Each item lists its fixing phase and current status. This file is updated as gates close.

## Gate 0 — Engineering baseline ✅ (closed 2026-09-24)
- [x] `npm run lint` clean · 87/87 tests · build OK · CI on main green
- [x] Worker deployed & healthy (`/health` ready, keys configured, fallback armed)

## Gate 1 — Security & data safety (Phase 1) — status: OPEN (residual items only, updated 2026-09-24)
- [x] 1.1 No raw Google ID token persisted in IndexedDB; one credential transport; sessions revocable (sign-out + deletion revoke); no raw-token fallback in production. **Landed AND on-device verified on the deployed app — 11/11 headless-browser smoke checks passed (IndexedDB has no idToken, header-only transport, sign-out revocation + wipe, real /ai/turn 401 → session invalidated → Arabic re-auth message). Deletion revokes every session through the `sessions_by_sub:` index (worker lines 718-723).**
- [x] 1.2 Account deletion complete (all key families + D1 ledgers + local wipe) AND exposed in UI with confirmation, success/failure states. **`tests/accountOps.test.ts` proves a second account cannot read the deleted user's data.**
- [x] 1.3 Data export in UI (JSON archive, no tokens/secrets/prompts).
- [x] 1.4 CORS fails closed in production without valid `ALLOWED_ORIGINS`; open mode requires explicit dev flag; covered by worker tests. **`ENVIRONMENT=production` is now declared in `wrangler.toml`, so open mode can never engage on this deploy. Live probe: unknown origin → `403 origin_not_allowed`; allowlisted origin → `200`.**
- [x] 1.5 Atomic redemption (`redeemed_codes_ledger`), idempotent referral payout (`referral_payouts`), durable trial quota (`trial_quota_ledger`), durable rate limits (`rate_limit_counters`); AI inputs bounded + CEFR allowlisted + server-authoritative scenario identity.
- [ ] Progress sync versioned / conflict-safe under concurrent writes. **Not separately verified — needs its own check.**
- [x] TEST_MODE cannot silently run in production. **A guard in the worker's fetch entry strips the flag whenever `ENVIRONMENT=production`; `tests/workerSecurity.test.ts` asserts both the guard behaviour and that the deploy config defines no `TEST_MODE`/`NODE_ENV` variable. Live probe with a forged token and the correct `aud` → `401`, proving no bypass is active.**
- [ ] Admin surface hardened (no browser-typed secret, no innerHTML/inline handlers) or admin blocked from public worker. **Partial: the dashboard now lives in `cloudflare-admin.js`, and no DB- or user-supplied value is interpolated into HTML (every field is written with `textContent`; `innerHTML` is used only to clear containers). Still open: a bearer secret typed into the browser, and static inline `onclick` handlers. Owner action — see `docs/LAUNCH-CHECKLIST.md` §2.2.**

## Gate 2 — Activation (Phases 2–3) — status: OPEN
- [ ] Anonymous guided first lesson + limited preview conversation reachable without sign-in.
- [ ] Placement test exists, recommends + explains level (informal label), user-overridable.
- [ ] Onboarding collects goal/arrival/field/schedule; stored; Trail shows next action.
- [ ] Activation funnel events instrumented (no learner text in events).

## Gate 3 — Curriculum depth (Phase 4) — status: OPEN
- [ ] Track A "أول 30 يوم في ألمانيا" complete in D1 with module structure (6 modules) and full per-scenario quality standard.
- [ ] Content states (draft/reviewed/approved) enforced; only `approved` renders as production curriculum.
- [ ] Content QA script runs in CI (schema, levels, Arabic sanity).

## Gate 4 — Learning intelligence (Phase 5) — status: OPEN
- [ ] SRS scheduling live for vocab/mistakes/phrases/grammar; due counts on home.
- [ ] Competency model with 5 states; session report leads with competencies.
- [ ] Independent vs hint-assisted reporting preserved (already exists — keep).

## Gate 5 — Monetization (Phase 7) — status: OPEN (owner action + credentials pending)
- [~] Payment provider chosen: **crypto via NOWPayments on the separate sales site** (`katzu-sales`) — no founder-KYC dependency, which is what closed the card-processor route. Business entity/banking remain owner decisions.
- [~] Server-side webhook entitlement is built (`POST /crypto/webhook`, HMAC-SHA512, rejects unsigned with 401) but **not yet exercisable**: `/crypto/health` reports `ready:false` until `NOWPAYMENTS_API_KEY` + `NOWPAYMENTS_IPN_SECRET` are set. Local-Syria payment details on the sales site are still `FILL` placeholders.
- [ ] Renewal/cancel/grace/refund/restore paths (codes are one-shot, so "renewal" = buying another code; formal policy text still needs counsel).
- [ ] Prices configurable without app release.
- [ ] Paywall shows achieved → restricted → outcome, prices, trial/renewal, legal links.
- [ ] Codes flow retained for B2B/gifts.

## Gate 6 — Legal & trust (Phase 8) — status: PARTIAL (updated 2026-09-24)
- [x] Hosted privacy + terms pages exist and carry no draft markers: `/privacy`, `/terms` (static files in `public/`; Arabic-first with an English summary, support address `support@ghaidak.com`). Live-checked `200` on the deployed app; the in-app trust screens link to them.
- [x] Copy describes *actual* behavior: deletion/export/AI-processing/retention match the implementation (checked against the worker's key + ledger inventory, and against the fields the backend really stores: Google `sub` + email, IP, platform, timestamps).
- [ ] Privacy/terms confirmed by counsel: legal entity, governing law and jurisdiction, log retention window, refund terms, and the age floor (the page currently states 16+).
- [ ] Refund + subscription terms published for the payment provider once a provider is chosen.
- [ ] Medical/legal/immigration disclaimers present in relevant scenarios.

## Gate 7 — Quality (Phase 10) — status: OPEN
- [ ] Worker tests: auth, CORS, concurrency (redemption/quota/referral/sync), deletion completeness, validation, limits.
- [ ] Browser journeys: onboarding → guest lesson → sign-in → study/quiz/conversation → retry → offline → paywall → sign-out → export → deletion → second-account privacy.
- [ ] Voice tested Chrome desktop/Android + Safari iOS; honest messaging; mic denial + fallback to typing.
- [ ] Beta cohort defined (30–50 Arabic-speaking learners) + feedback/metrics plan.

## Sequencing rule
A gate closes only when its **user-facing behavior** is verified on-device or by test execution — never by compilation alone.
