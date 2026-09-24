# Katzu — Technical & Product Implementation Plan
**Basis:** full codebase audit (2026-09-24). Every finding below was verified in source, not assumed.
Stack preserved: React 18 + Vite PWA, Dexie/IndexedDB, Cloudflare Worker, D1, KV, Gemini (+ Workers AI fallback).

---

## A. Audit baseline (verified facts)

**Build/tests:** `tsc --noEmit` clean · vitest 16 files / 87 tests pass · `vite build` OK (PWA, 45 precache entries) · CI live on `main` (workflow: typecheck → worker syntax → tests → build).

**What already works (do not rebuild):**
- Session-token layer exists: `/auth/session` exchanges Google ID token → 30-day `sess_*` token (KV-backed); client exchanges on sign-in and auto-recovers 401s on `/ai/turn`.
- CORS: strict when `ALLOWED_ORIGINS` valid (configured in `wrangler.toml`); open mode only when config missing **and** not marked production; rejection diagnostics headers; 403 gate at entry.
- AI engine: multi-key + model failover, Workers AI fallback (qwen3-30b) behind `AI_FALLBACK_ENABLED`, KV-backed usage metrics, response schemas + label sanitization, `boundedHistory()` (6/4/10 by mode), rate limits (20/min, 150/day), 64KB body cap, Workers-AI metrics.
- Content: 5 scenarios live in D1 (`embassy_appointment`, `cafe_order`, `job_interview`, `doctor_visit`, `apartment_viewing`), vocab/grammar endpoints with `VALID_LEVELS` enforcement.
- Honest scoring exists: `independentSentences` vs `hintAssistedSentences` (Dexie v2 additive migration + upgrade).
- Deletion endpoint `/user/delete` exists but is partial (see B1), and is not exposed in any UI.

**Verified problems (ordered by evidence):**

| # | Problem | Evidence |
|---|---|---|
| A1 | **No checkout at all** — subscription is activation-codes only | `SubscriptionRedemptionScreen.tsx` = code input only; zero payment code anywhere (`grep stripe/paddle/checkout` → empty) |
| A2 | **Auth wall before value** — every route requires sign-in; WelcomeScreen CTA goes straight to `/signin` | `App.tsx` routes: all under auth gate; no preview/anonymous lesson flow |
| A3 | **Curriculum too small for $5/mo** | 5 scenarios in D1; no track structure; no placement/onboarding (`grep placement/onboarding` → none) |
| A4 | **No spaced repetition, no competency model** | `grep nextReview/spaced/interval` → none; progress = XP/streak/sessions |
| A5 | **Legal copy is self-declared drafts** | `TrustInfoScreen.tsx`: "هذه الصفحة توضيحية أولية ويجب مراجعتها قانونياً", "مسودة تشغيلية وليست نصاً قانونياً نهائياً" |
| S1 | **Deletion incomplete** — leaves `session:*`, `email_index:*`, `referral:*` KV keys; no UI exposed | `handleDeleteUser` deletes only 4 keys + D1 row; `grep حذف الحساب` in `src/` → only workerClient wrapper |
| S2 | **No data export** | only diagnostics download exists in settings |
| S3 | **Raw Google ID token persisted in IndexedDB** + same credential sent in **both** header and body on several calls | `db.users` row keeps `idToken`; workerClient lines 385/534/588/633-637 send `id_token` in body while also setting `Authorization: Bearer` |
| S4 | **Fail-open fallback to raw ID token** when session exchange fails | `workerClient.getEffectiveAuthToken`: no `sessionToken` → returns raw `idToken`; worker accepts both |
| S5 | **Code redemption not atomic** — check-then-put on `code:*` | `handleVerify`: `get(existingCode)` → `put(codeKey)`; two concurrent requests both pass the get |
| S6 | **Trial quota per-isolate lock only** — `quotaLocks` Map is in-memory; concurrent isolates can exceed 3 free sessions | `consumeTrialQuota` (in-memory promise chain) over KV read/put |
| S7 | **Progress sync read-merge-write race** — no versioning; two devices can drop each other's writes | `handleProgressSync`: get → merge → put, no `updated_at` comparison |
| S8 | **Referral double-payout window** — `isFirstRedemption` = `!existingAccountRaw` evaluated before put | two concurrent first redemptions → both see empty → both award |
| S9 | **Rate limit per-isolate Map** — resets per isolate, not global | `userRateLimits` Map |
| S10 | **AI request fields unbounded** — `user_message`, `scenario_title`, `persona`, `cefr_level` taken from client with no length caps; `scenario_title/persona` injected into prompt (client-trusted); level not allowlisted on `/ai/turn` (only content endpoints check `VALID_LEVELS`) | `handleAiConversationTurn` line 1021+ |
| S11 | **Admin: static bearer secret typed in browser HTML page; `innerHTML` + inline `onclick`** | `renderAdminDashboardHtml`: `admin-secret-input`, `tbody.innerHTML = ...`, dozens of inline handlers |
| S12 | **Sessions not revocable** — no revoke/sign-out/delete of `session:*` keys | no `session:` delete anywhere; TTL-only expiry (30d) |

---

## B. Prioritized plan

### Phase 1 — Launch blockers (security, integrity, trust)  ~1–2 weeks of focused work
**P0-S10 — Bound & validate AI inputs (worker-only, smallest risk window, ships in hours)**
- Caps: `user_message ≤ 500 chars`, `history ≤ 10 items × 500 chars`, `scenario_title ≤ 120`, `persona ≤ 300`, drop `sarcasm_level` decimals; reject oversized with 400.
- Allowlist `cefr_level` to `VALID_LEVELS` on `/ai/turn` + `/ai/translate` + `/ai/hints`.
- Server-authoritative scenario: if `scenario_id` present, look up title/persona from D1 and ignore client-supplied values (client-supplied only when scenario not found → 400).
- Tests: field-limit + injection-attempt cases in worker tests.

**P0-S5/S8 — Make redemption & referral atomic (worker-only)**
- Redemption: write `code:*` first as the claim marker (`put` with a uniqueness guard via a two-phase `get → put → get(yours)` re-read + `REDEEMED_CODES` list check), or move codes to D1 with `INSERT OR IGNORE` on a unique primary key — D1 gives real transactions; KV stays for read-through caching. Extending expiry reads the winner's record.
- Referral payout: mark `referral:<inviter>:<invitedSub>` claimed in the same transaction as first redemption.
- Tests: concurrent-redemption simulation (mock KV/D1).

**P0-S6/S9 — Durable counters (worker-only)**
- Trial quota: keep `session_id` idempotency keys (already good), move the authoritative counter to D1 (`INSERT` per consumed session + `COUNT`), KV as cache. Replaces per-isolate lock semantics.
- Rate limiting: move per-minute/day counters to the same D1 pattern or a KV counter with short TTL; accept KV's eventual consistency for abuse control but make it global.

**P0-S1/S12 — Complete deletion + session revocation (worker + UI)**
- `handleDeleteUser`: enumerate and delete `session:*` for the sub (store a `sessions_by_sub:<sub>` index at creation to make this possible), `email_index:*`, `referral:*` claims, trial-session keys, quota, progress, account, D1 rows. Return a per-store result map; only `success: true` if all succeeded (partial failure → 500 with what remains).
- Add `POST /auth/signout` that revokes the presented session token; client calls it on sign-out and clears IndexedDB auth rows.
- Add **Settings UI**: "حذف الحساب" with typed confirmation + re-auth + clear Arabic explanation of what is deleted.
- Tests: deletion completeness (all key families), revocation blocks subsequent requests.

**P0-S2 — Data export (client-first, trivially safe)**
- Settings → "تصدير بياناتي": build JSON archive from Dexie (profile prefs, sessions, mistakes, saved words, scenario_training, redeemed codes) **excluding tokens**; download via Blob. Optional `GET /progress/get` merge for cloud-side data.
- Test: archive contains expected tables, no `idToken`/`sessionToken` fields.

**P0-A5 — Replace draft legal copy (content-only)**
- Rewrite `TrustInfoScreen` pages as final copy: privacy (what is sent to AI provider, Google identity, Cloudflare processing, GDPR rights, deletion/export how-to), terms, refund/support, business identity, minors policy, medical/legal disclaimer (already has a good base line — keep it). No draft markers remain.
- Requires product-owner review of final wording (their legal responsibility) — I prepare, owner approves.

**P0-S3/S4 — Token hygiene (client, no behavior regressions allowed)**
- Stop persisting raw `idToken`: exchange to session token at sign-in, store **only** `sessionToken`; keep `idToken` in memory only for the exchange call.
- Remove credential duplication: Authorization header **or** body field, never both (worker already reads both — standardize on header).
- Keep the 401→re-exchange auto-recovery (exists), but re-auth prompt instead of raw-token fallback when exchange fails.
- Tests: after sign-in, IndexedDB contains no raw `idToken`; requests carry exactly one credential.

### Phase 2 — Activation (value before signup)  ~1–2 weeks
**A2 — Anonymous first lesson:**
- Route `/try` (no auth): pick goal → 3-step placement-lite → one guided A1 lesson (Study → Quiz → text-only conversation preview with 3 turns via a new `/ai/preview` endpoint: unauthenticated, IP-rate-limited, strictly A1, no history carry-over, content from D1).
- Sign-up wall only at "save progress / continue / full conversation".
- No fake guest accounts — anonymous state stays local-only under a clearly separate Dexie table, merged into the real account on first sign-in.

**A3 — Placement + onboarding (client + small D1 additions):**
- 10–15 item adaptive placement (vocabulary recognition, word order, article/gender, case intro, one listening item, one production item) → recommends A1/A2/B1/B2, overridable, labeled "تقدير غير رسمي من Katzu".
- Onboarding: goal (daily life / work / university), arrival status, field, weekly schedule, Arabic style preference (MSA default). Stored in Dexie `user_prefs` (additive Dexie v3 migration — never destructive).

### Phase 3 — Curriculum foundation: Track A "أول 30 يوم في ألمانيا"  ~2–3 weeks, content-heavy
- Build the 13 Track-A scenarios in D1 (Anmeldung, directions, bank account, health insurance, doctor/pharmacy, transport, supermarket/bakery, landlord/viewing, official letter, appointment booking, neighbor, problem report, emergencies) with the full quality standard per scenario (outcome, cultural notes, vocab, phrases, grammar focus, listening/speaking tasks, Arabic-speaker mistake patterns, difficulty variants, success criteria).
- Levels A1→B1 mapped per scenario; A2/B1 variants authored for the same situations.
- Batch-authored via the existing admin D1 CMS; verified by a content QA script (schema, level allowlist, Arabic text sanity, no garbled rows) run in CI.
- **Do not** market tracks as complete until all rows exist in D1 and pass QA.

### Phase 4 — Learning engine  ~2 weeks
- **SRS:** `review_items` table (Dexie v3 additive + optional D1 sync) for vocab/mistakes/phrases/grammar; simple SM-2-lite (ease, interval, due date, streak of successes) — explainable, unit-tested.
- **Mistake taxonomy:** category tagging from evaluation output (article/gender, word order, conjugation, case, preposition, plural, vocabulary, formality, omission/addition) feeding both SRS and reports.
- **Competencies:** per-scenario "can-do" statements with 5 states (not started → retained); session report leads with competencies gained, XP demoted to a secondary line.
- **Honest scoring:** keep independent vs hint-assisted split (exists); add competency evidence only from independent turns.

### Phase 5 — Paid product (checkout)  ~1–2 weeks after provider chosen
- **Provider decision needed from product owner:** merchant-of-record options (Paddle, Lemon Squeezy) handle global VAT and need no US bank account; Stripe + a tax product is the alternative but requires more ops. No key is hardcoded — server webhook grants entitlement by writing the same `account:<sub>` record redemption writes.
- Monthly + annual plans, price served from worker config (changeable without app release), restore-purchase, cancel instructions, failure/grace states.
- Keep activation codes for B2B/gifts (already built).
- Entitlement check stays server-side (already is); browser never decides payment success.

### Phase 6 — Expansion (after Track A proves out)
- Track B (work/Ausbildung, 17 scenarios) → Track C (university, 15 scenarios), offline track packs with download progress, review-due reminders, referral share flow improvements (mechanism exists server-side), analytics events for the funnel metrics defined in the brief.

---

## C. Sequencing logic
1. Security/integrity first (Phase 1): everything else sits on trustworthy accounts, money, and data.
2. Activation before content scale: placement + preview tell us which content to deepen.
3. One excellent track before three shallow ones.
4. Monetization after the free experience proves value — but legal copy and deletion must precede any public payment link.

## D. Decisions only the product owner can make
- Final legal copy approval (I draft, owner owns).
- Payment provider + business/banking entity details.
- Price points and trial length for checkout.
- Whether Arabic dialect variants are in scope for v1 (plan assumes MSA-only default).
