# Katzu — Launch Gate (Phase 0)
Definition: conditions that must be TRUE before **paid public beta**. Each item lists its fixing phase and current status. This file is updated as gates close.

## Gate 0 — Engineering baseline ✅ (closed 2026-09-24)
- [x] `npm run lint` clean · 87/87 tests · build OK · CI on main green
- [x] Worker deployed & healthy (`/health` ready, keys configured, fallback armed)

## Gate 1 — Security & data safety (Phase 1) — status: OPEN (in progress)
- [ ] 1.1 No raw Google ID token persisted in IndexedDB; one credential transport; sessions revocable (sign-out + deletion revoke); no raw-token fallback in production. **Status: landed AND on-device verified on the deployed app — 11/11 headless-browser smoke checks passed (IndexedDB has no idToken, header-only transport, sign-out revocation + wipe, real /ai/turn 401 → session invalidated → Arabic re-auth message). Deletion-side revocation lands with 1.2.**
- [ ] 1.2 Account deletion complete (all key families + local wipe) AND exposed in UI with confirmation, success/failure states. Retention exceptions documented.
- [ ] 1.3 Data export in UI (JSON archive, no tokens/secrets/prompts).
- [ ] 1.4 CORS fails closed in production without valid `ALLOWED_ORIGINS`; open mode requires explicit dev flag; covered by worker tests.
- [ ] 1.5 Atomic: code redemption, referral payout; global (durable) trial quota; progress sync versioned; AI inputs bounded + level allowlisted + server-authoritative scenario data.
- [ ] TEST_MODE cannot silently run in production.
- [ ] Admin surface hardened (no browser-typed secret, no innerHTML/inline handlers) or admin blocked from public worker.

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

## Gate 5 — Monetization (Phase 7) — status: OPEN (owner decisions pending)
- [ ] Payment provider chosen + business entity/banking set (owner).
- [ ] Checkout with server-side webhook entitlement; renewal/cancel/grace/refund/restore paths.
- [ ] Prices configurable without app release.
- [ ] Paywall shows achieved → restricted → outcome, prices, trial/renewal, legal links.
- [ ] Codes flow retained for B2B/gifts.

## Gate 6 — Legal & trust (Phase 8) — status: OPEN
- [ ] Privacy/terms final (no draft markers), refund + subscription terms, support email, business identity.
- [ ] Copy describes *actual* behavior: deletion/export/AI-processing/retention match implementation.
- [ ] Medical/legal/immigration disclaimers present in relevant scenarios.

## Gate 7 — Quality (Phase 10) — status: OPEN
- [ ] Worker tests: auth, CORS, concurrency (redemption/quota/referral/sync), deletion completeness, validation, limits.
- [ ] Browser journeys: onboarding → guest lesson → sign-in → study/quiz/conversation → retry → offline → paywall → sign-out → export → deletion → second-account privacy.
- [ ] Voice tested Chrome desktop/Android + Safari iOS; honest messaging; mic denial + fallback to typing.
- [ ] Beta cohort defined (30–50 Arabic-speaking learners) + feedback/metrics plan.

## Sequencing rule
A gate closes only when its **user-facing behavior** is verified on-device or by test execution — never by compilation alone.
