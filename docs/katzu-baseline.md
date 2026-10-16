# Katzu — product baseline (for a row-by-row comparison with Pingo)

Output target: `docs/katzu-baseline.md`. Companion file (to be written later, only when both exist): `docs/katzu-vs-pingo.md`.

Repo: `ghidak077/katzu-webapp-v3` (workspace path `katzu/`), branch `main`, HEAD `d3524ff` at capture time. Backend: single Cloudflare Worker (`cloudflare-unified-worker.js`, 4,259 lines) + D1 (`katzu-content`) + KV (`USER_PROGRESS`, `REDEEMED_CODES`) + Workers AI.

Reference document: `reverse/docs/pingo-teardown.md`. **Note:** that file is a *work in progress* — it defines Phase 0 and a TODO list but contains none of the Phase 1–4 tables yet (verified: 76 lines, no tables). So "the same row labels as pingo-teardown.md" cannot be inherited from an existing artefact; the row labels below are proposed here and are the ones `katzu-vs-pingo.md` should reuse.

Evidence labels: `[observed]` = read directly in the source; `[inferred]` = reasoned from source; `[unknown]` = no evidence here.

---

## Phase 0 — capabilities (what this audit could and could not use)

What was read directly:
- The web app source: `src/**` (TS/TSX), router config, all route/screen files, `src/lib/**` subsystems.
- The Worker source: `cloudflare-unified-worker.js` and every `cloudflare-*.js` module (auth, AI router, AI chat, hints, STT, pricing, crypto, mock exam, daily, analytics, admin).
- Config: `wrangler.toml`, `vite.config.ts`, `tailwind.config.js`, `src/index.css`, `package.json`, `migrations/`.
- Tooling: `scripts/measure-turn-cost.mjs` (executed locally — real output below).
- A locally-running dev server on `http://localhost:3000` (already up when this audit started; public routes only).

Capabilities **not** available here, and therefore excluded:
- The D1 export / live database contents — not present in the workspace. All content/table claims are from schema/migration SQL and the code that reads them, not from row data. `[unknown]` where row counts matter.
- The deployed Worker source vs the repo copy — not diffed. All Worker claims are about the repo copy.
- A signed-in Google account and the production AI keys — so a first-run walkthrough past `/signin` was not run, and no AI turn was executed (deliberately: it would spend production AI quota).
- Play Store / App Store data — Katzu is a web PWA, not a store app (`[observed]` `vite.config.ts` `VitePWA`).

Skipped and why:
- Phase 3 beyond the public entry. Reaching "first conversation" requires Google sign-in (`[observed]` `SignInScreen.tsx`), which this environment cannot complete, and `/demo` performs a real `/ai/turn` against the live Worker (`[observed]` `DemoScreen.tsx`) — running it would consume real AI spend and touch the production backend. Those moments are marked `[unknown]`/deferred rather than guessed.

Rules followed: read-only on app code; no backend queries against production; one output file created (`docs/katzu-baseline.md`); secrets/keys never printed (only their storage location and client visibility).

---

## Phase 1 — extraction

### 1. Screens and routes (journey map)

Router: `react-router-dom` v7 `<Routes>` in `[src/App.tsx](src/App.tsx)` (`AppRoutes`). No nested/`createBrowserRouter` config; every route is a flat `<Route>`. Deep links are plain path params (`/scenario/:scenarioId/...`); there is **no** custom URL scheme or hash-routing. Document title is set per route by `titleForPath` `[observed]` (`App.tsx`), so tabs and screen readers get distinct names.

| # | Path | Screen / handler | Auth | Notes |
|---|------|------------------|------|-------|
| 1 | `/` | `LandingScreen` (`LandingRoute`) | public | Marketing page incl. FAQ, price teaser, "try before signup" |
| 2 | `/welcome` | `WelcomeScreen` | public | Value proposition + start/demo |
| 3 | `/signin` | `SignInScreen` (`SignInRoute`) | public | Google-only; `?mode=signup` toggles tab |
| 4 | `/demo` | `DemoScreen` | public | One **real** learning turn before an account; consumes AI |
| 5 | `/onboarding` | `OnboardingScreen` (`OnboardingRoute`) | session | 5 questions + placement offer; `?mode=edit` for profile edit |
| 6 | `/placement` | `PlacementScreen` | session | Level check (A0–B2) |
| 7 | `/subscription` | `SubscriptionRedemptionScreen` | session | Status + code redemption + referral claim |
| 8 | `/paywall` | `PaywallScreen` | session | Priced offer, server prices |
| 9 | `/mock` | `MockExamScreen` | **auth gate in route** (`isAuthenticated`) | One free B1 mock |
| 10 | `/app` → `/app/trail` | redirect | session | |
| 11 | `/app/:tab` | `MainTabsRoute` | session | tabs: `trail`, `practice`, `progress`, `profile` |
| 12 | `/main`, `/main/:tab` | `MainTabsRoute` | session | legacy aliases |
| 13 | `/app/library` | `TrailScreen` | session | pre-V2 trail kept as scenario library |
| 14 | `/scenario/:id` | `ScenarioDetailScreen` | session | |
| 15 | `/scenario/:id/story` | `StorySetupScreen` | session | V2 episode opener |
| 16 | `/scenario/:id/practice` | `GuidedPracticeScreen` | session | V2 guided practice |
| 17 | `/scenario/:id/study` | `StudyScreen` | session | pre-V2 study |
| 18 | `/scenario/:id/quiz` | `QuizScreen` | session | pre-V2 quiz |
| 19 | `/scenario/:id/live` | `LiveConversationScreen` | session | the AI conversation |
| 20 | `/session-report` | `SessionReportScreen` (`ReportRoute`) | session | debrief; rebuilds from Dexie if lost |
| 21 | `/app/grammar` | `GrammarSectionScreen` | session | |
| 22 | `/app/review` | `ReviewScreen` | session | SRS review |
| 23 | `/app/listen` | `ListeningScreen` | session | dictation |
| 24 | `/app/write` | `WritingScreen` | session | |
| 25 | `/app/coach` | `CoachScreen` | session | mistake bank |
| 26 | `/app/ask` | `AskKatzuScreen` | session | German-only assistant |
| 27 | `/trust/:page` | `TrustInfoScreen` | public | privacy/terms/contact/imprint/refund |
| 28 | `/delete-account` | `DeletionRequestScreen` | public | erasure without a live session |
| 29 | `/dev/system` | `DesignSystemScreen` | dev-only | `isDevBuild` guard `[observed]` `App.tsx` |
| 30 | `*` | redirect | — | → `/app/trail` if authed else `/` |

Auth model `[observed]`: only `/`, `/welcome`, `/signin`, `/demo`, `/trust*` are public (`isPublicPath`). Every other route redirects a signed-out user to `/signin` (or `/welcome` if onboarding was never completed). Route-level gate is duplicated for `/mock` only; the rest rely on the effect + `MainTabsRoute` rendering.

Lazy loading `[observed]`: all post-sign-in screens are `React.lazy`; only Landing/Welcome/SignIn are eager (`App.tsx`, comment "everything behind sign-in loads on navigation").

**First-run order (the intended sequence)** `[observed]` (`App.tsx` `SignInRoute.onSuccess`, `OnboardingRoute.onDone`, `LandingRoute`):
`/` → `/welcome` → `/signin` (Google) → (consumes demo progress) → `/onboarding` (5 questions) → placement offer → **take** → `/placement` → `/app/trail`; **skip** → `/app/trail`. A returning user who never measured goes straight to `/placement`.

⚠️ Anomaly to verify with the owner: on a successful sign-in the client sets `localStorage['katzu_onboarding_completed'] = 'true'` **before** onboarding runs `[observed]` (`App.tsx` `SignInRoute.onSuccess`). It is only used to choose `/welcome` vs `/signin` for a signed-out visitor, but the key name is misleading and the value is written regardless of whether onboarding is really complete.

### 2. Onboarding — every field, in order, and what each changes

Screen `[src/features/onboarding/OnboardingScreen.tsx](src/features/onboarding/OnboardingScreen.tsx)`; rules `[src/lib/onboarding/preferences.ts](src/lib/onboarding/preferences.ts)`. One question per screen, 5 question steps then a placement offer.

| Order | Field | Options | What it changes | Evidence |
|-------|-------|---------|-----------------|----------|
| 1 | `primaryGoal` | `daily_life`, `work`, `university`, `exam` | **content order** — reorders the mission/library via category keyword match (`goalCategoryKeywords`, `goalMatchScore`) | observed |
| 2 | `arrivalStatus` | `preparing`, `recently_arrived`, `living_in_germany` | stored on profile; **no direct mission effect found** (`[inferred]` from `preferences.ts`/`selectMission.ts`; feeds learner-memory context only) | observed (stored) / unknown (effect) |
| 3 | `previousGerman` | `first_time`, `some_basics`, `can_hold` | **only** steers the placement recommendation (`placementOffer`); never sets a level | observed |
| 4 | `dailyMinutes` | `5`, `10`, `20` (`DAILY_MINUTE_CHOICES`) | mission length/estimate (`minutesForPlan`); saved to `dailyGoalMinutes` | observed |
| 5 | `targetDateKind` + `targetDate` | `move`, `exam`, `job` + date (optional) | exam countdown line on the mission (`selectMission`), and the `.ics` reminder in Profile; `sanitizeTargetDate` rejects >5y or past | observed |
| 6 | Placement offer | take / skip | take → `/placement`; skip → `placementSkippedAt`, level stays "unmeasured" (`describeLearnerLevel`) | observed |

Persistence: `onboardingPatch()` writes `onboardingCompletedAt`, `weeklyGoalDays` (default 5). A failed local write does **not** trap the learner (caught, continues) `[observed]`. `isOnboardingComplete` requires goal+arrival+minutes; previous/target are optional.

No push/notification permission is requested anywhere in onboarding `[observed]` — the screen explicitly promises no notifications.

### 3. Copy and i18n

Framework: **none.** No `i18next`/`react-intl`/`useTranslation` anywhere `[observed]` (grep: zero matches). All copy is **hardcoded Arabic inline** in TSX. Only two i18n helpers exist: `[src/lib/i18n/arabicCount.ts](src/lib/i18n/arabicCount.ts)` and `[src/lib/i18n/countForms.ts](src/lib/i18n/countForms.ts)` (Arabic plural agreement). `[src/lib/trust/content.ts](src/lib/trust/content.ts)` holds the privacy/terms copy and an Arabic label map.

Language/RTL status:
- `<html lang="ar" dir="rtl">` `[observed]` `index.html`.
- German is isolated LTR with `<bdi dir="ltr" lang="de">` via `[GermanText](src/components/common/GermanText.tsx)` and `<bdi dir="ltr">` counters via `[LtrCounter](src/components/common/LtrCounter.tsx)`. `isolateGerman()` wraps in U+2066/U+2069 `[observed]` `src/lib/utils/haptics.ts`.
- Documents the *previous* bug where pinch-zoom was blocked (`maximum-scale=1.0`) and that it was removed for WCAG `[observed]` `index.html`.
- **Tone** `[observed]`: warm, direct, second-person, "shame-free"; honesty is a stated product principle on the landing page ("every number is measured from your sessions… if we err we fix it and say so") and in the paywall ("what stays free forever"). Persona is a cat ("كَاتْزُو"); the `roastComment` field lets the AI tease German grammar, not the learner.
- **Numeral rule** `[observed]`: Western digits for prices/counts; `tests/westernNumerals.test.ts` fails if Arabic-Indic digits reappear (referenced in `trialCopy.ts` comment).

Copy surfaces (all Arabic, all inline) `[observed]`: onboarding questions/hints, paywall (`PaywallScreen`, `PaywallModal`), redemption success/error strings, conversation error messages (`stateMachine.ts` constants: `MIC_PERMISSION_MESSAGE_AR`, `SPEECH_FAILURE_MESSAGE_AR`, `NETWORK_ERROR_MESSAGE_AR`, `AI_SERVICE_MESSAGE_AR`, `QUOTA_MESSAGE_AR`, `DAILY_SPEND_CAP_MESSAGE_AR`, `SESSION_INVALID_MESSAGE_AR`), empty states ("لا يوجد تقرير محفوظ", "لا يوجد محتوى متاح…"), celebrations (confetti + "تم تفعيل… مبروك 🎉").

Flags:
- Hardcoded Arabic throughout means **no translation layer** — adding a language is a code change, not a config change. `[observed]`
- One placeholder deliberately shipped: `REFUND_TEXT = '{{OWNER_FILL}}'` on the paywall `[observed]` `src/lib/offers/pricing.ts`. `[inferred]` this renders literally to users if not replaced.
- `onboarding_goal` analytics name exists but is only referenced as a **label** in `trust/content.ts`, never emitted `[observed]` — dead event.

### 4. Monetization

Model `[observed]`: **code redemption only; the app never takes payment.** A code is bought on a separate sales site (`katzu-sales` Pages) and redeemed in-app.

| Item | Value | Evidence |
|------|-------|----------|
| Products offered, in order | `pass90` (leads) → `monthly` → `mock` (link) | `OFFER_ORDER`, `pricing.ts` |
| Where prices come from | `GET /pricing` (server); **no price = no buy button** | `priceSource.ts`, `PaywallScreen` |
| Price resolution | region from `CF-IPCountry` (`standard`/`special`) + experiment cell from account-id hash | `handlePricing` (worker) |
| Crypto sale | NOWPayments, `CRYPTO_PRICE_USD=5`, `CRYPTO_MONTHS=1`, `test_mode` sandbox | `wrangler.toml`, `cloudflare-crypto.js` |
| Local payment (sales site) | Syriatel Cash, MTN Cash, bank transfer; card/crypto | `sales/index.html`, `SubscriptionRedemptionScreen` copy |
| Free AI allowance | **3 conversations**, server-owned (`MAX_FREE_AI_SESSIONS = 3`) | `cloudflare-unified-worker.js` L119; mirrored `MAX_FREE_AI_SESSIONS` in `trialCopy.ts` |
| Free level floor | A0 and A1 only; A2/B1/B2 require Pro | `checkUserEntitlement`; mirrored `FREE_LEVEL`/`isLevelFree` in `trial.ts` |
| Free forever | review, mistake bank, daily mission, placement, everything learned | `trial.ts` comment, `PaywallModal` |
| Fair-use cap | `FAIR_USE_AI_PER_DAY = 120` stated in copy (marked UNPROVEN) | `pricing.ts` |
| Per-account rate limit | 10/min, 200/day (worker vars) | `wrangler.toml` (`AI_RATE_LIMIT_*`); in-memory default 20/150 |
| Global spend cap | `AI_DAILY_SPEND_CAP = 292` calls/day (count across all accounts) | `wrangler.toml`; `checkDailySpendCap` |

Where `isPro` is decided `[observed]`:
- **Server is authoritative**: `checkUserEntitlement` reads a live subscription from `REDEEMED_CODES` KV (`account:<sub>`, checks `expiresAt`) and enforces level floor + quota on every AI route.
- **Client gate**: `isProEffective(user)` (`src/lib/utils/subscription.ts`) checks `isSubscriptionActive` **and** expiry locally; `servedLevel()` decides the level the client requests.
- Who can change it: the learner (redeem a code), an admin (`/admin/edit`, `/admin/revoke`, `/admin/generate`, `/admin/discount-code`), the crypto webhook (`mintCode` → admin generate). **Not** the client directly — `isSubscriptionActive` is written only after a successful `/verify`.

Redemption flow `[observed]` (`handleVerify` + `SubscriptionRedemptionScreen`): requires a Google session token → account-based lockout (5 failed code attempts / 15 min) → `parseCode` → HMAC signature check (`DE-<months>M-<nonce>.<sig>`, signed with `HMAC_SECRET`) → atomic D1 ledger insert (`redeemed_codes_ledger`, PRIMARY KEY = code) → KV `account:<sub>` expiry extended → first-ever redemption triggers referral payout. Client then writes `isSubscriptionActive` + `subscriptionExpiresAt` to Dexie and fires confetti. Restore = re-redeem / status re-check; expiry is date-based (`addMonthsIso`), and `isProEffective` stops honouring an expired date.

Paywall placements and triggers `[observed]`:
- Trigger 1 — a turn rejected with `PAYWALL_REQUIRED` or `FREE_QUOTA_EXHAUSTED` → `PaywallModal` inside the conversation (`useLiveConversation`).
- Trigger 2 — after a **completed** episode: `shouldOfferPro({isPro, completedEpisodes})` requires ≥1 recorded episode, shown on the debrief / home / library (never before the first conversation).
- Trigger 3 — `/paywall` route (`PaywallScreen`) and the "buy a code" path on `/subscription`.
- Raw `/pricing` is **public** (a signed-out visitor can see a price).

Loopholes / weaknesses to note `[observed]` unless stated:
- The **free floor is client-selectable in one place**: the AI route trusts the client's `cefr_level` after a level-floor check (A0/A1 free) — a client could send `cefr_level: "A1"` while claiming the episode is a mission. The worker re-derives the scenario identity server-side (`resolveScenarioIdentity`) but the *level* floor is the only level gate, so a Pro-level learner could keep getting free A1 turns (no A2 material, but no paywall either). `[inferred]`
- `TEST_MODE` skip of Google JWT verification is neutralised in production (`fetch` header) — good — but only when `ENVIRONMENT==='production'`; anything else (e.g. a staging var left unset) skips JWT `aud` verification. `[observed]` `wrangler.toml` comment + `fetch`.
- `/pricing` shows a price to anonymous visitors but assigns **no cell** (experiment bucket only for a known account) — consistent, no loophole.
- The mock bypasses the free-conversation counter (`skipQuota`) and the level floor (`skipLevelGate`) but is metered by the mock ledger (one free per account) and still subject to the daily spend cap `[observed]` `handleMockStart`, `checkUserEntitlement` options.
- Referral reward (`REF-XXXXXXXX`) pays 1 month to the referrer only on the invitee's **first paid redemption** (plus a 3-day first-lesson reward) `[observed]` `handleReferralInfo`.

### 5. Retention mechanics

| Mechanic | Status | Evidence |
|----------|--------|----------|
| Streak (daily tasks) | **Built** | `src/lib/daily/tasks.ts` `dailyTaskStreak` (1 forgiven day, `FORGIVEN_DAYS=1`); server mirror `cloudflare-daily.js` `DAILY_XP_CAP=600`, `FORGIVEN_DAYS=1`; streak enforced against **server clock** |
| Daily plan (3 tasks) | **Built** | `tasks.ts` → `scenario`, `grammar`, `review`; local-midnight reset; `DailyTasksPanel` |
| Daily mission picker | **Built** | `selectMission.ts` priority: review → continue → weakest skill → arrival story → rotating mission → new (`INTRO_SCENARIO_ID='airport_arrival'`) |
| XP | **Built** | `sessionXp.ts` (accuracy×1.5 + independence bonus 50/25, ×1.5 REAL), capped by `creditXp` daily authority |
| Ranks / milestones (badges) | **Built (in-app)** | `xpMilestones.ts` 6 named badges (`بذرة كَاتْزُو` … `أسطورة الشارع الألماني`), `ranks.ts` |
| Capability states (skill mastery) | **Built** | `capability/model.ts` NOT_STARTED→INTRODUCED→PRACTISING→INDEPENDENT→RETAINED (evidence-gated; opening a page can never reach INDEPENDENT) |
| Spaced repetition | **Built** | `srs/engine.ts` (simplified SM-2: 1/3/7/16/35/90 ladder, min→max 1–180d, 10-min again delay, interleaved queue, 20/session) |
| Reminders | **Partial** — `.ics` file only | `reminder/ics.ts`; Profile offers a calendar file. **No push server, no VAPID** `[observed]` `ProfileSettingsScreen.tsx` comment |
| Email | **Missing** | no email sending anywhere `[observed]` (grep: no mail provider) |
| Push notifications | **Missing (deferred)** | explicitly deferred in comments; no `pushManager`/`VAPID` `[observed]` |
| PWA install prompt | **Built** | `VitePWA` manifest, `registerType:'autoUpdate'`, shortcuts `/mock` + `/app/trail`, offline nav fallback `index.html` `[observed]` `vite.config.ts` |
| Offline use | **Built** | service worker precache + `StaleWhileRevalidate` for `/scenarios|vocabulary|grammar` (7d) `[observed]` `vite.config.ts` |
| Referral | **Built** | `handleReferralInfo/Claim`; `REF-XXXXXXXX`, 1 month on verified paid referral, 3-day lesson reward |
| Share | **Built** | `share/card.ts` (progress card, allow-listed, refuses email/CEFR claims), `offers/share.ts` (mock estimate link with `?ref=`), desktop/`navigator.share` |
| Confetti / celebrations | **Built** | `canvas-confetti` on redemption; honor reduced-motion `[observed]` |
| Onboarding push / trial nudge | **Missing** | no scheduled re-engagement message |

### 6. Analytics

Provider: **first-party only** — no GA/Mixpanel/PostHog `[observed]`. Events are queued in `localStorage`, batched, and POSTed to the Worker `/analytics/events` (`src/lib/analytics/client.ts` → `cloudflare-analytics.js`). Closed allowlist on both sides; **no PII** (anonymous install id + a djb2 hash of the email; never the email).

Events defined: **40** in `ANALYTICS_EVENTS` `[observed]` `[src/lib/analytics/events.ts](src/lib/analytics/events.ts)` (counted from the array). Emitted: 37 distinct names via direct `track(...)` call sites, plus `return_day1`/`return_day7` emitted indirectly by `retention.ts`. The only defined name with **no** emitter anywhere is `onboarding_goal` (it appears only as an Arabic label in `trust/content.ts`) `[observed]`.

Funnel coverage today (visit → demo → sign-up → first Live turn → paywall → redeem → day-N):

| Funnel step | Instrumented? | Event(s) | Blind spot |
|-------------|---------------|----------|-----------|
| Landing visit | Yes | `landing_viewed` | — |
| Demo start/finish | Yes | `demo_started`, `demo_completed` | does not say whether the demo turn succeeded |
| Sign-up start/complete | Yes | `signup_started`, `signup_completed` | — |
| Onboarding start/complete | Yes | `onboarding_started`, `onboarding_completed` | **`onboarding_goal` never fires** → goal-selection step is invisible |
| Placement | Yes | `placement_started`, `placement_completed` | — |
| First Live turn | Yes | `conversation_started`, `first_independent_turn` | "first" is per-install, not per-account |
| Paywall | Yes | `paywall_view` (`/paywall`), `paywall_viewed` (`PaywallModal`), `upgrade_click`, `purchase_clicked`, `free_session_exhausted` | two distinct paywall names are intentional but must be summed |
| Redeem | Yes | `code_redeemed` (+ server `recordActivity` funnel rows) | wire events are allow-listed |
| Day-N return | Partial | `return_day1`, `return_day7` | anchored to first-seen on the device; a reinstall resets the anchor |
| Referral/share | Yes | `share_click`, `share_landed`, `referral_converted` | — |
| Errors | Yes | `app_error` (ErrorBoundary) + server `error_reports` | — |

**Blind**: no server-side view of "which paywall copy converted" beyond `source` prop; `onboarding_goal` missing; no account-level (vs install-level) retention.

### 7. Config and flags

- **Remote config**: none in the app. `[observed]` no remote-config client.
- **Feature flags / A/B**: one — the pricing experiment (`experimentBucket(accountId)`, `experimentEnabled`, `cell`) is decided **server-side** in `/pricing` `[observed]` `cloudflare-pricing.js`.
- **Worker variables** (non-secret, reviewable) `[observed]` `wrangler.toml`: `ENVIRONMENT`, `ALLOWED_ORIGINS`, `GOOGLE_CLIENT_ID` (public), `AI_RATE_LIMIT_PER_MINUTE=10`, `AI_RATE_LIMIT_PER_DAY=200`, `AI_FALLBACK_ENABLED=1`, `AI_DAILY_SPEND_CAP=292`, `MAINTENANCE_MODE=off`, `NOWPAYMENTS_ENVIRONMENT=test_mode`, `CRYPTO_PRICE_USD=5`, `CRYPTO_MONTHS=1`, `SALES_ORIGIN`.
- **Kill switch**: `MAINTENANCE_MODE` freezes every POST/PUT/PATCH/DELETE at the edge, reads keep working, `/admin/*` exempt `[observed]` `fetch` handler.
- **Secrets** (never printed; stored as Worker secrets via `wrangler secret put`): `GEMINI_API_KEYS`, `GROQ_API_KEYS`, `OPENROUTER_API_KEYS`, `NVIDIA_API_KEYS`, `ADMIN_SECRET`, `HMAC_SECRET`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`. Client visibility: **none** — only `GOOGLE_CLIENT_ID` (public) and the `session_token` reach the browser.
- **Cron**: `[triggers] crons = ["17 4 * * *"]` runs the retention sweep (delete `rate_limit_counters` >24h, `error_reports` >30d) `[observed]` `wrangler.toml` + `scheduled`.

### 8. Learning mechanics

| Feature | Status | How it works (evidence) |
|---------|--------|--------------------------|
| Study | Built | `StudyScreen`; vocab/phrases per scenario (Dexie `starter_phrases`, `vocabulary`) |
| Quiz | Built | `QuizScreen`; score = correct/total (`finalAccuracy`), reveal option costs no score (`gradeAnswer`) |
| Live Conversation | Built | `LiveConversationScreen` + `useLiveConversation`; one `/ai/turn` per user turn |
| Session modes | Built | `practice` (hints+translation+correction) vs `real`/REAL (no help, higher XP ×1.5) `turnPlan.ts` |
| Turn cap | Built | per level: A0 3, A1 4, A2 6, B1 9, B2 12 `maxSessionTurns` `levelSpec.ts` |
| Hints | Built | Fused into the `/ai/turn` reply (`next_hint`) **plus** `POST /ai/hints` (2–4 moves, cached 7d, quota-exempt) + a cached D1 starter-phrase floor ranked against the last AI line |
| Corrections | Built | `/ai/turn` JSON `evaluation{is_correct, corrected_german, original_mistake, grammar_rule, grammar_id, explanation_ar, roast_comment, positive_note_ar}` — corrected fragment + Arabic explanation; saved to `mistakes` and **auto-enrolled in SRS** |
| What the user sees after a turn | Built | Katzu's German reply spoken automatically with word-by-word highlight; Arabic translation (level-gated); correction card; one follow-up question; a fresh hint pill. Orb tone flips to "earned" only when the turn had no correction `[observed]` `useLiveConversation` |
| Translate | Built | `POST /ai/translate`, KV-cached 30d; opener gloss is **stored data first** (zero AI before the first message) |
| Slow replay | Built | `handleSlowSpeak` re-speaks at rate 0.6 `useLiveConversation` |
| Session report / debrief | Built | `SessionReportScreen` + `buildSessionDebrief` (deterministic, **no extra AI call**); independent accuracy, mistakes, "vs previous attempt" (only if a prior row has `mistakesCount`) |
| Spaced repetition | Built | `srs/engine.ts` + `srs/store.ts`; mistakes become production prompts (`newReviewItemFromMistake`) |
| Difficulty nudge | Built (B4) | `handleNudgeDifficulty` in `useLiveConversation.ts` moves the level one CEFR step from the ⋯ sheet («أسهل» / «أصعب»), Pro-only: a free learner gets the Pro card «تغيير المستوى أثناء المحادثة ميزة Pro» instead. `weakestMeasuredSkill` can set the mission (only when a skill is *measured*); level caps vary by CEFR. **Corrected in B4:** this row used to say the paywall's claim was `[inferred]` and unverified — the control exists and is pinned by two browser tests in `e2e/paywall.spec.ts` (free → offer, Pro → the chip moves A1→A2) |
| Listen (dictation) | Built | `ListeningScreen`; STT model is **Whisper on Workers AI** |
| Writing | Built | `WritingScreen` + `POST /ai/check-writing` |
| Ask Katzu | Built | `AskKatzuScreen` + `POST /ai/ask` (German-only, own quota) |
| Mock exam | Built | 3 parts × ~5 min, server-owned briefs, server-minted signed grant; never claims pass/fail `cloudflare-mock-exam.js` |
| Voice input (STT) | Built | Worker `@cf/openai/whisper-large-v3-turbo` (`cloudflare-stt.js`); browser Web Speech recognition was removed |
| Voice output (TTS) | Built | Browser `speechSynthesis` (`useSpeechOutput`), German voice ranked by `voiceChoice.ts`; primed on first gesture |

Correction format (exact wire shape) `[observed]` `cloudflare-ai-chat.js` `handleChatTurnRoute`: JSON with `reply_de`, `reply_ar`, `evaluation{…}`, `next_hint{german, translation_ar}`, `followup_question_ar`; `maxOutputTokens: 1000`, `temperature 0.3`, `reasoningEffort: "low"`, `responseMimeType: application/json`. A grade is returned **only** if the model sent a real boolean `is_correct` (`mergeEvaluation`) — an ungraded turn can never be scored as correct.

### 9. Backend routes (Cloudflare Worker)

Single Worker, one `fetch` handler, `MAINTENANCE_MODE` + CORS + 64 KB body cap (400 KB for `/ai/transcribe`) applied before routing `[observed]` `cloudflare-unified-worker.js` (~L1460–1845).

| Route | Method | Auth | Rate limit | Module |
|-------|--------|------|-----------|--------|
| `/auth/session` | POST | Google idToken | — | unified |
| `/auth/signout` | POST | token | — | unified |
| `/ai/turn`, `/turn` | POST | idToken + entitlement | per-account 10/min·200/day + global spend cap | ai-chat |
| `/ai/translate`, `/translate` | POST | idToken + entitlement | global | ai-chat |
| `/ai/hints`, `/hints` | POST | idToken | global, **quota-exempt** | hints |
| `/ai/transcribe` | POST | idToken | 400 KB body | stt |
| `/ai/check-writing` | POST | idToken + entitlement | global | writing |
| `/ai/ask` | POST | idToken | own daily quota | ask |
| `/health`, `/ai/health` | GET | **public** | — | unified (masked projection) |
| `/user/delete` | POST | idToken | — | unified |
| `/user/export` | POST | idToken | — | unified |
| `/referral/info` | POST | idToken | — | unified |
| `/referral/claim` | POST | idToken | — | unified |
| `/verify` | POST | idToken | account lockout 5/15min | unified |
| `/check-status` | POST | idToken | — | unified |
| `/mock/start` | POST | idToken | mock entitlement | unified |
| `/pricing` | GET | **public** | — | pricing |
| `/progress/sync` | POST | token | honest-401 wrapper | unified |
| `/progress/get` | POST | token | — | unified |
| `/review/sync` | POST | token | — | unified |
| `/client-error` | POST | — | — | unified |
| `/analytics/events` | POST | none (anonymous) | per-IP 30/min·600/day | analytics |
| `/scenarios`, `/scenarios/:id`, `/vocabulary`, `/grammar` | GET | none | — | unified (D1) |
| `/admin`, `/admin/api/*`, `/admin/sweep`, `/admin/generate`, `/admin/codes/report`, `/admin/discount-code`, `/admin/upload`, `/admin/lookup`, `/admin/edit`, `/admin/revoke`, `/admin/progress-lookup`, `/admin/progress-edit`, `/admin/{scenarios|vocabulary|grammar|starter_phrases}` CRUD | GET/POST/PUT/DELETE | `Bearer ADMIN_SECRET` | per-IP failure throttle 5/15min | admin |
| `/crypto/checkout`, `/crypto/webhook`, `/crypto/order`, `/crypto/health` | POST/GET | webhook = HMAC signature | — | crypto |

Duplicates/inconsistencies between `server.ts` and the Worker: **there is no `server.ts`** in this repo `[observed]` (no Express server; grep found none). The only "duplicate" concern is the same route reached through an alias (`/ai/turn` == `/turn`, `/ai/translate` == `/translate`, `/ai/hints` == `/hints`, `/ai/health` == `/health`) `[observed]`. There is also a `sales/*` Pages site (separate deployment, not the Worker).

Progress/daily: there is **no** `/daily` route. Daily authority rides `POST /progress/sync` and `POST /progress/get` (`cloudflare-daily.js` `processDailySync`, `readAuthoritativeDaily`, `overlayStatsWithDaily`) `[observed]`.

### 10. Design system

Tokens `[observed]` `src/index.css` + `tailwind.config.js` (Tailwind reads CSS vars — single source of truth):
- Fonts: **Cairo** (Arabic, variable 100–900) and **Satoshi** (German/Latin), self-hosted via `@font-face`.
- Type scale: `--kz-ar-display/title/body/caption/micro` (Arabic default), German display scale separate; caption ≥13px, micro ≥12px (`[inferred]` legibility floor).
- Radius ladder: `--kz-radius-tag 8 / chip 12 / control 20 / panel 24 / sheet 28 / hero 34`.
- Motion: `--kz-dur-fast 160ms / --kz-dur 280ms / --kz-dur-panels 300ms`; easings `--kz-ease-spring cubic-bezier(0.22,1.12,0.36,1)`, `--kz-ease-out`. One keyframe remains (`kz-glow-pulse`); decorative entry/loop animations were deleted.
- Colour: dark-only palette (no light theme, no `prefers-color-scheme` branch `[observed]`). Accent (`primary` = lavender) vs fill (`fill` = deep lavender) deliberately separated for contrast (documented 8.86:1 accent, 4.52:1 fill). `magenta` reserved for *earned* progress only.
- Hit targets: `--touch 44px`, `--control 48px`.
- Reduced motion: honoured (confetti gated by `useReducedMotion`) `[observed]` `SubscriptionRedemptionScreen`; the app is not reduced-motion-audited everywhere `[inferred]`.
- Haptics: `navigator.vibrate` — light 10ms / medium 25ms / success pattern / error pattern `[observed]` `src/lib/utils/haptics.ts` (mirrors an Android `KatzuHaptics.kt`).

Mascot — the sticker set is **16**, not 14 `[observed]` `[KatzuMascot.tsx](src/components/common/KatzuMascot.tsx)` (`MascotSticker`): `welcome, avatar, badge, barista, celebrating, listening, peace, practice, profile_card, progress_mascot, scenario_host, settings_mascot, thumbs_up, trail_guide, trail_header, word_insight`.

Where each appears (grep of `<KatzuMascot>` + `KatzuPresence`):

| Pose | Used in |
|------|---------|
| `welcome` | Landing hero, Welcome, Placement intro, Demo result (also the LCP image, webp) |
| `avatar` | Ask header, conversation bubbles, Trail header, Landing header |
| `badge` | Paywall screen, PaywallModal, SubscriptionRedemption |
| `practice` | Grammar, Practice, Writing, Onboarding steps (via `KatzuPresence`) |
| `peace` | Listening intro, Placement done, Trail |
| `celebrating` | Demo done, Listening done, Placement done |
| `scenario_host` | ScenarioDetail |
| `progress_mascot`, `thumbs_up`, `listening` | Coach |
| `profile_card` | Profile |
| `trail_guide` / `trail_header` | Trail (via `KatzuPresence` states) — `[inferred]` from `KatzuPresence` pose map |
| `barista`, `word_insight`, `settings_mascot` | present in the asset set; `barista`/`word_insight`/`settings_mascot` have **no direct `<KatzuMascot>` call site found** `[observed]` |

Dark mode / RTL: dark is the only theme; RTL is the document default with explicit LTR isolation for German (see §3). Pinch-zoom allowed; `viewport-fit=cover` for safe-area insets `[observed]` `index.html`.

---

## Phase 2 — cost and performance baseline

### Provider calls per Live turn
`[observed]` `cloudflare-ai-chat.js` `handleChatTurnRoute`:
- **1** fused `/ai/turn` call normally (answering + grading were merged; the old two-call version doubled cost).
- **+1** repair call **only if** the German violates the level caps (one retry), else a deterministic fallback line.
- Multi-provider router (`cloudflare-ai-router.js` `PROVIDER_POOL`): Gemini (flagship/mid/lite), Groq (`gpt-oss-120b`, `qwen3.8-27b`, `gpt-oss-20b`), OpenRouter (`inkling-small:free`), NVIDIA (`gpt-oss-20b`); sticky model, per-key cooldown, failover. `AI_FALLBACK_ENABLED=1` adds a Workers AI fallback.
- `easyTurn` starts the walk at the cheaper **mid** tier for short A0/A1 non-graded turns.

### Per-turn token estimate and cost (measured locally, `node scripts/measure-turn-cost.mjs`)
`[observed]` real output:
- Mean prompt ≈ **1,528 tokens** (est. chars/4); assumed completion **90 tokens**; `maxOutputTokens: 1000`.
- Prices are marked **UNPROVEN** (`AI_TIER_PRICES_USD_PER_MTOK`): flagship in 0.30 / out 2.50; mid 0.15/1.25; lite 0.075/0.30 per Mtok.

| Tier | per turn | per mock (3 turns) | per user-day (12 turns) |
|------|----------|--------------------|--------------------------|
| flagship | $0.0007 | $0.0021 | $0.0082 |
| mid | $0.0003 | $0.0010 | $0.0041 |
| lite | $0.0001 | $0.0004 | $0.0017 |

- Cheap-routing (flagship→mid for ~50% of turns, UNPROVEN share) saves ~$0.0021/user-day (~25%); flagship→lite would save ~79%.
- Recommended `AI_DAILY_SPEND_CAP` from the harness: **292 calls/day** (= $1.00/day ÷ 5 users ÷ $0.0007) — which is what `wrangler.toml` ships. `[observed]` This is a planning number, **not** observed production spend.

### Caching
`[observed]`:
- **Translation** — KV-backed (`readAiCache`/`writeAiCache`, namespace `tr`), TTL **30 days**; moved from a per-isolate Map precisely because isolate recycling re-translated the same opener.
- **Hints** — KV-backed (namespace `hints`), TTL **7 days**; also a cached D1 starter-phrase floor that costs zero AI.
- **TTS** — none; browser `speechSynthesis` (device voices, no network, no cache needed).
- **Opener Arabic** — stored gloss first; an AI translate only when no gloss ships.

### Offline support
`[observed]` `vite.config.ts`:
- `VitePWA`, `registerType: 'autoUpdate'`, `navigateFallback: 'index.html'` (cold offline open lands on the app shell).
- Precache `**/*.{js,css,html,ico,png,webp,ttf,woff2}`; runtime `StaleWhileRevalidate` for `/scenarios|vocabulary|grammar` (100 entries, 7 days).
- Content lives in IndexedDB (Dexie) after first fetch, so scenarios/vocab/grammar/review work offline.
- What does **not** work offline: any AI turn (conversation, translate, hints, STT/whisper, writing, ask), code redemption, progress sync, analytics. The conversation machine has an explicit `offline` state and preserves the learner's sentence `[observed]` `stateMachine.ts`.

### Latency path for one turn (mic end → STT → LLM → TTS start)
`[inferred]` from code — **not measured** (no signed-in session, no AI keys here):
`hold/tap orb` → `MediaRecorder` capture → `POST /ai/transcribe` (Whisper `large-v3-turbo`, up to 400 KB) → text shown, **NOT auto-sent** (learner taps أرسل) → `POST /ai/turn` (one fused model call, unstreamed) → reply parsed → TTS `speechSynthesis.speak()` starts. The turn is **unstreamed** (the model answer is awaited whole), which the repo itself flags as a latency cost (`measure-turn-cost.mjs` comment; `maxOutputTokens` trimmed "1600 was slack, and slack is latency"). Exact ms per hop: `[unknown]`.

### Where progress is stored, and what a device change loses
`[observed]`:
- **Client (IndexedDB/Dexie, `katzuDb` v9)**: `sessions`, `mistakes`, `review_items`, `saved_words`, `scenario_training`, `grammar_lessons`, `skill_practice`, `memory_patterns`, `daily_tasks`, `redeemed_codes`, `users`, plus seeded content (`scenarios`, `starter_phrases`, `vocabulary`, `grammar`).
- **Local storage**: install id, onboarding flags, analytics queue, retention anchor, session summary (also `sessionStorage`).
- **Server KV/D1**: `USER_PROGRESS` (progress blob + **daily ledger** + AI cache + trial-session keys), `REDEEMED_CODES` (subscription, redeemed codes, referral maps), D1 (`redeemed_codes_ledger`, `trial_quota_ledger`, `referral_lesson_payouts`, `generated_codes`, `users`, `activity_log`, `rate_limit_counters`, `error_reports`, content tables).
- **Lost on a device change**: anything not yet synced. `wipeUserScopedData()` clears user-scoped Dexie tables on sign-out; on a new device the learner gets content re-fetched + server progress/daily re-adopted via `/progress/get`, but **not** the local mistake/review history unless it was synced to `USER_PROGRESS` (`/progress/sync` syncs the progress blob; review items sync via `/review/sync`). `[inferred]` — a device that never synced loses local-only mistakes and review scheduling.

---

## Phase 3 — live walkthrough

Environment: a dev server was already running at `http://localhost:3000` (not started by this audit; left untouched). Public routes were inspected in the Browser panel. No AI turn was executed (would spend production quota). Google sign-in could not be completed here.

What was actually observed:
- `/` renders in Arabic RTL, HTTP 200 in ~0.2 s (localhost), **no console errors/warnings** `[observed]`. Full landing content present: hero, "one real lesson without an account", 3 real mistake examples (Ich habe 25 Jahre → Ich bin 25 Jahre alt, etc.), free-vs-Pro pricing section, 4 skills (Sprechen/Hören = available, Lesen/Schreiben = "قريباً"), 6-item FAQ, footer privacy/terms/contact.
- `/signin` renders the Google Identity Services button only — **no email/password** `[observed]` (`GoogleSignInButton`, `window.google.accounts.id`).
- App is **network-dependent for first content**: the landing/signin are trivial, but any learning surface needs `/ai/*`.

`[unknown]` (could not run, not guessed): seconds-to-first-value on a real device; number of taps before the first conversation; permission prompts and their exact timing (mic prompt timing is client-controlled at orb press `[inferred]`); the exact first paywall moment in a real session (code says: after a completed episode, or on the 4th free conversation / an A2+ level attempt); breakage on mobile Chrome vs Safari. The conversation/STT path targets Android Chrome specifically (comments cite Android mic behaviour and removed Web Speech recognition), but no on-device Safari check was possible.

---

## Phase 4 — self-assessment

### Top 10 risks

| # | Risk | Class | Evidence |
|---|------|-------|----------|
| 1 | `{{OWNER_FILL}}` refund placeholder ships to users if unfilled | Trust/legal | `pricing.ts` `REFUND_TEXT` |
| 2 | Level floor is the only server gate; a client can request `cefr_level:'A1'` to stay free indefinitely (no A2+ content, but no paywall) | Revenue leak | `checkUserEntitlement` `[inferred]` |
| 3 | No push/email re-engagement; reminders are a one-off `.ics` | Retention blocker | `reminder/ics.ts`, Profile comment |
| 4 | Unstreamed AI turn = full model latency before any audio; a slow provider is a silent wait | UX/trust | `handleChatTurnRoute`, cost script comment |
| 5 | `AI_DAILY_SPEND_CAP=292` and all tier prices are UNPROVEN planning guesses | Cost | `wrangler.toml`, `AI_TIER_PRICES_USD_PER_MTOK` |
| 6 | `onboarding_goal` never fires; `arrivalStatus` has no observable mission effect → onboarding personalization is partly unmeasurable/unused | Analytics/retention | `events.ts`, `preferences.ts` |
| 7 | Google-only sign-in with no fallback — a blocked/absent Google (common for some audiences/networks) blocks all learning | Access/trust | `SignInScreen.tsx` |
| 8 | TTS depends on the device's German voice; a phone with no German voice degrades the core listening loop | UX (Android/iOS variance) | `useSpeechOutput`, `voiceChoice.ts` |
| 9 | `TEST_MODE` JWT bypass is only neutralised when `ENVIRONMENT==='production'` | Security | `fetch` handler + `wrangler.toml` comment |
| 10 | Two distinct paywall event names (`paywall_view` vs `paywall_viewed`) can under-count the funnel if not summed | Measurement | `PaywallScreen` vs `PaywallModal` |

Additional watch items: no light theme (accessibility); `localStorage['katzu_onboarding_completed']` semantics; content is CMS-driven (D1) so an empty cache offline is a real "no content" state.

### Top 10 strengths worth protecting

| # | Strength | Evidence |
|---|----------|----------|
| 1 | Server is authoritative for subscription, quota, pricing, mock access — client cannot grant Pro or pick a price | `checkUserEntitlement`, `handlePricing`, `verifyMockGrant` |
| 2 | Trial + redemption are atomically idempotent in D1 (no double-spend, replay-safe) | `redeemed_codes_ledger`, `trial_quota_ledger` |
| 3 | 3 free conversations is one number, mirrored and test-pinned against the Worker (no copy drift) | `trialCopy.ts` + `trialPromise.test.ts` |
| 4 | Capability states are evidence-gated — opening a page or using hints can never claim "independent" | `capability/model.ts` |
| 5 | Deterministic SRS with Arabic-first feedback (ä/ae, ß/ss, article verdicts) tuned for Arabic speakers | `srs/engine.ts` |
| 6 | Honest error/entitlement copy — walls and glitches are distinct codes, learner keeps their sentence | `entitlement/codes.ts`, `stateMachine.ts` |
| 7 | Privacy-by-design analytics: closed allowlist, no PII, one-click opt-out that deletes the queue | `analytics/events.ts`, `client.ts` |
| 8 | Offline-first PWA with a real navigation fallback and cached content | `vite.config.ts` |
| 9 | Cost controls that fail safe: per-account rate limits, global spend cap, key cooldown/failover, maintenance kill switch | worker + `wrangler.toml` |
| 10 | German/RTL handling is deliberate (LTR isolation, Arabic plural agreement, Western numerals) | `GermanText`, `arabicCount`, numeral tests |

---

## 7. Unknowns and how to resolve each

| Unknown | How to resolve |
|---------|----------------|
| D1 row data (content coverage per level, codes issued/redeemed, users, activity) | Export D1 (`wrangler d1 export katzu-content`) and inspect — not available here |
| Deployed Worker == repo copy? | Diff `wrangler` deployment version against HEAD `d3524ff` |
| Real per-turn cost / real daily spend | Read actual provider invoices + `error_reports`/`activity_log` volumes; replace the UNPROVEN price table |
| Real latency per hop | Instrument `/ai/transcribe` and `/ai/turn` (Cloudflare logs) and measure on a device |
| On-device mobile Chrome/Safari behaviour | Run the walkthrough on real hardware with a real Google account |
| Whether `arrivalStatus` changes anything today | Grep deep for its consumers across worker + client (only `preferences.ts`/memory found) |
| Whether the "change difficulty mid-conversation" claim is a real control | Inspect `LiveConversationScreen` for any difficulty control beyond level/mode |
| Whether `barista`/`word_insight`/`settings_mascot` are ever rendered | Search built `dist/` bundle, not just source |
| Effective retention (day-1/7) | Query the analytics funnel rows once real traffic exists |

---

## Comparison scaffolding for `docs/katzu-vs-pingo.md`

Proposed one-comparison-table-per-section, each row labelled so the two files line up:
- **Journey/route rows**: Entry → Demo → Sign-in → Onboarding → Placement → First lesson → Live turn → Debrief → Paywall → Redeem → Day-N return.
- **Onboarding rows**: Goal, Arrival, Previous experience, Time budget, Target date, Placement offer.
- **Monetization rows**: Free allowance, Free level floor, Tiers, Price source, Payment methods, Redemption, Restore/expiry, Referral, Fair-use, Loopholes.
- **Retention rows**: Streak, Daily plan, Mission picker, XP, Ranks, Skill mastery, SRS, Reminders, Email, Push, PWA install, Share, Referral.
- **Analytics rows**: each funnel step + error tracking + opt-out.
- **Config rows**: Remote config, Flags/A-B, Kill switch, Secrets.
- **Learning rows**: Study, Quiz, Live, Hints, Corrections, Translate, Slow replay, Report, SRS, Difficulty, Modes, STT, TTS.
- **Backend rows**: route, method, auth, rate limit.
- **Design rows**: tokens, fonts, motion, haptics, mascot, dark mode, RTL.
- **Cost rows**: calls/turn, prompt tokens, $/turn per tier, caching, offline, latency, storage.

Each row to carry: **Pingo / Katzu / Winner / Action**, plus a gap class of **Have / Partial / Missing / Better**, then a ranked top-15 backlog (impact, effort, file to change), then 5 experiments (metric + threshold). Anything that does not fit Arabic speakers moving to Germany must be marked **"do not copy"**.

## LATER
`docs/katzu-vs-pingo.md` is only to be produced when both baseline files exist (this file and a completed `reverse/docs/pingo-teardown.md`). It is not created here.

## Launch tracker

One line per task (append-only). Evidence labels: [observed] = read/ran here; [inferred]; [unknown]. Ordered A1 → A8, B1 → B5, C1 → C2.

- [x] A1.1 TEST_MODE fails closed — JWT bypass honored ONLY when `ENVIRONMENT` is explicitly `"test"`; missing/unknown now behaves as production. New test `honors TEST_MODE only when ENVIRONMENT is explicitly "test"` in tests/workerSecurity.test.ts. [observed] passing.
- [x] A1.2 `AI_DAILY_SPEND_CAP` documented with the formula (cap = daily AI budget USD ÷ cost per turn USD) in wrangler.toml; structured `{"event":"ai_turn",tier,tokens,estimated_cost_usd}` log per turn + `{"event":"ai_daily_spend_cap_warning"}` at 80%. Owner input listed below. [observed]
- [x] A1.3 Free-quota leak VERIFIED not broken — 3-session cap holds on retry and under `cefr_level:"A1"` from a Pro-level profile. Existing tests + 2 new tests. [observed]
- [x] A1.4 "{{" shipped-string guard added to scripts/check-launch.mjs; finds `REFUND_TEXT` (src/lib/offers/pricing.ts:103). Strict gate exits 1 while any remain — expected until the owner supplies the text. [observed]
- [ ] Commits — NOT made. The working tree already held unrelated uncommitted work (radius-polish in src/App.tsx, SignInScreen.tsx, TrailScreen.tsx, JourneyHomeScreen.tsx, GlassEffectContainer.tsx); a per-task commit would have swept others' hunks. Left uncommitted. [observed]
- Note: the suite was ALREADY red before A1 on tests/agentDocs.test.ts (owner-added docs/katzu-baseline.md 45 KB and docs/katzu-user-journey.md 40 KB over the 22 KB default cap). Fixed the guard's documented way — named caps with reasons in BUDGETS_KB.

- [x] A2.1 `/demo` and `/ai/turn` — RESOLVED: `/demo` does NOT call `/ai/turn`. It grades deterministically via `src/lib/demo/demoFlow.ts`; its only AI call is an optional voice path → `POST /ai/transcribe`, which REQUIRES a session Bearer token (`workerClient.transcribeAudio` throws `UNAUTHENTICATED` without one), so an anonymous visitor spends no AI. The baseline §Phase 0/§Phase 3 claim that the demo runs a real `/ai/turn` is STALE; the journey doc is correct. No per-IP rate-limit change needed. [observed]
- [x] A2.2 `arrivalStatus` in mission selection — RESOLVED: it does NOT change WHICH mission is chosen. `src/lib/mission/selectMission.ts` selects the arrival scene by the constant `INTRO_SCENARIO_ID = 'airport_arrival'`, never by the learner's `arrivalStatus`; no `arrival` reference exists in that file's priority list. It DOES change framing: `situationAr()` (src/lib/journey/context.ts:99), `missionReasonAr()` (context.ts:186), the story opener (src/lib/journey/story.ts:178), and the Profile line. Chosen path: keep the answer (it is real and used) but move the question OUT of first-run into the A4 skipped-questions card, consistent with A3. [observed]

- [x] A3 Front door, ask once — DONE. (a) WelcomeScreen: goal sheet (minutes/days/level) removed; submit only saves the optional display name then hands to sign-in. (b) SignInScreen: sign-up level picker removed; level defaults A1. (c) OnboardingScreen: first-run = 2 questions (goal, daily minutes) then straight to the mission; edit mode keeps the full 5. (d) `isOnboardingComplete` now goal+minutes. (e) `SignInRoute.onSuccess` → `/app/trail`; `OnboardingRoute.onDone` → `/app/trail`; never `/placement`. Acceptance (landing→sign-in→2 questions→first mission, nothing asked twice) verified by the rewritten `e2e/onboarding.spec.ts` (2 passed) + `e2e/simplicity.spec.ts` (passed) + 1875 unit + build. [observed]
  - Fixed en route: the minutes answer saved in the same tick as the click needed an explicit override (stale-state bug), caught by the e2e.
  - Pre-existing e2e red (NOT caused by A3, evidence: the failing element is inside PaywallModal/pricing, untouched here): `e2e/firstRun.spec.ts:84` "the Pro offer names the price…" — `modal-price-pass90` not found. Left as-is. [observed]

- [x] A6 Redemption friction (client half) — `/subscription?code=XXXX` now pre-fills the redeem box (normalised uppercase, read once on mount) in `src/features/auth/SubscriptionRedemptionScreen.tsx`. [observed] tsc + 1877 unit + build green.
- [x] A6 (admin half) — DONE (commit faafad3). The blocker was real (the dashboard is served from the worker origin) and is now resolved without inventing a host: the helper reads `PUBLIC_APP_URL` **or** the app build's `VITE_PUBLIC_APP_URL` from the worker env, rejects anything that is not an absolute http(s) URL, and when nothing is configured the panel SAYS so and the copied message carries the code alone. Each generated code gets "Copy message" (the whole Arabic message, `redeemMessageAr`) and "Copy code". The message text has one owner (exported, unit-tested) and the dashboard receives it as a template, so the copy cannot disagree with itself. `PUBLIC_APP_URL` documented in `wrangler.toml` (empty by default — no code change needed if the owner prefers the VITE_ name). [observed] tsc + 1907 unit + build green.
- [x] A8 Play and domain readiness — VERIFIED mostly already implemented and completed: `robots.txt` + `sitemap.xml` are generated from `VITE_PUBLIC_APP_URL` (vite.config.ts), and `assetlinks.json` is generated from `VITE_ANDROID_PACKAGE_NAME`/`VITE_ANDROID_CERT_SHA256` with `[]` otherwise. NEW: `missingPlayBuildVars()` + a `VITE_PLAY_BUILD=1` gate that fails the build when `VITE_PUBLIC_APP_URL`, `VITE_ANDROID_PACKAGE_NAME` or `VITE_ANDROID_CERT_SHA256` is missing. 4 new tests in tests/playReadiness.test.ts. [observed] normal build exits 0, Play build exits 1 naming the missing vars.

### Not yet done (honest state — remaining checklist)

- [x] A4 Debrief and habit — DONE (commit e9559f1). The debrief now ends with a tomorrow teaser and a "scene أخرى" hand-off; a one-time skipped-questions card (arrival / previous German / exam-move date) appears once and offers placement; the trail carries a local-data weekly recap; and a session with no German voice reports it in Arabic instead of failing silently. [observed] tsc + 1878 unit + build green.
- [x] A5 Measurement — DONE (commit 141b440). Four emissions the funnel was blind to (`onboarding_goal`, `paywall_view` from the modal, `share_click{kind:'exam_card'}`, `time_to_first_turn`), plus `GET /admin/api/metrics` and a funnel panel that prints no rate without a real denominator. The `paywall_view`/`paywall_viewed` split is resolved by firing BOTH from one call site — the old name keeps its history, the aggregated name starts counting. [observed] tsc + unit suite + build green; `npm run verify` PASS.
- [x] A7 Speed — DONE, in three parts, each measured on the built output.
  - **Fonts (commit 8bb9cbc):** the four TTF faces are the second `src` in each `@font-face`, so the only browser that can read one cannot run a service worker — yet all 821 KB sat in the precache every install downloads. `globPatterns` no longer lists `ttf`. **Precache 4951.75 KiB / 114 entries → 4150.45 KiB / 110 entries.** The files stay served; the online fallback is unchanged. Pinned by `tests/pwaOffline.test.ts`.
  - **Landing vs app shell (commit 2deeab5):** the entry held the whole router, so a stranger at `/` waited behind a full-screen «جاري التحقق من الحساب» gate for the Dexie seed, `suppressInvalidReviewItems` and three content fetches before the page they clicked on could paint. The shell (gate + seed + every route but `/`) is now `src/app/AppShell.tsx`, a dynamic import. **Entry chunk 528,055 B / 167,078 gzip → 488,365 B / 155,809 gzip; the shell is a 40,397 B chunk.** Measured cold on `vite preview` (incognito, no SW): first-contentful-paint **806 ms**, and the only requests are the entry chunk, CSS, `registerSW.js`, `cairo.woff2` and the hero art/video — **zero worker calls on the landing** (before: `/health`, `/scenarios`, `/vocabulary`, `/grammar`, `/events` all fired at boot). The gate, the seed order and the redirect rules are unchanged; only their moment is. `tests/appMap.test.ts` now reads both router files (the map is load-bearing) and `tests/interfaceContracts.test.ts` follows the `overflow-x-clip` anchor to the file that now holds it.
  - **Google script:** VERIFIED already scoped, no change needed — `index.html` has no `gsi` tag, and `SignInScreen` injects `https://accounts.google.com/gsi/client` in an effect that runs only when that screen mounts (and only with a client id). After the split it cannot even be reached before the shell loads. [observed]
  - **"Precache app shell only": deliberately NOT done.** The offline contract is the product (a learner on a train), and route chunks are precached so a screen never opened online still works offline; narrowing the glob would trade install weight for a broken promise. Left as an owner decision, with the numbers above.
  - **Browser suite:** full run `118 passed / 2 failed`, and the two failures are PRE-EXISTING — reproduced at `8bb9cbc` in a git worktree with the same node_modules (`e2e/accessibility.spec.ts:111` Trail 44 px targets, `e2e/auditedScreens.spec.ts:46` mock gate wording). Neither touches routing; both were red before this work.
- [ ] B1–B5 — NOT ATTEMPTED (budget). **Scope not recorded in this repo** — the plan that named these five did not survive into a file, so the block was not guessed at. Needs the owner's list.
- [ ] C1–C2 — NOT ATTEMPTED (budget).

### Owner inputs surfaced by the work

- **Daily AI budget in USD** — required to set `AI_DAILY_SPEND_CAP` meaningfully. Formula (now documented in wrangler.toml): `cap = daily AI budget (USD) ÷ cost per turn (USD)`, where cost per turn = `estimateTurnCostUsd({ tier, inputTokens, outputTokens })`. The shipped `292` assumes ~$1.00/day across ~5 users at the flagship price and stays UNPROVEN until the owner picks the budget. `[unknown]`
- **Refund/trust text** — `REFUND_TEXT` and 10 legal fields; the new `{{` guard now reports them in `npm run check:launch` and fails `check:launch:strict`.
- **Public app URL** — `VITE_PUBLIC_APP_URL` (build) / `PUBLIC_APP_URL` (worker) is now OPTIONAL for A6 (the helper degrades honestly without it). It is still required for an absolute `og:image` and for the `VITE_PLAY_BUILD=1` gate.
- **Android package name + cert SHA-256** — for a Play build (gate now exists).
