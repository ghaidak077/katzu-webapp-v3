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
- [x] Commits — RESOLVED. The A1 row above was written while the tree held another author's uncommitted radius-polish work (src/App.tsx, SignInScreen.tsx, TrailScreen.tsx, GlassEffectContainer.tsx), and that work is STILL uncommitted and still not mine to stage. A1's own files landed anyway in `adf274e` (wrangler.toml, tests/workerSecurity.test.ts, scripts/check-launch.mjs all carry A1's changes at that commit), the rest of the A/B block was committed per task on `main` down to `2a8b853`, and this pass continues on `launch-final` branching from that. [observed]
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
- [x] B1–B5 the paid-value block — DONE (owner-approved scope, derived from this file's own gap list because the plan that named the five never reached a repo file). Every item is pinned in the browser, not by a code read.
  - **B1 (0785394) — the money page printed the owner's placeholder.** `PaywallScreen` rendered `سياسة الاسترداد: {{OWNER_FILL}}`, so a buyer read the literal placeholder where the refund policy belongs. The constant is still a placeholder (the owner must write the line; `check:launch` reports it); `isOwnerFilled()` now decides what is printed, and until then the page says the policy is unpublished, promises nothing about money, and offers the question. The browser assertion that pinned the placeholder as *visible* is inverted, not deleted. [observed]
  - **B2 (6ae5b18) — Pro was set once and never reconciled.** `/check-status` ran only from sign-in and redemption, so a learner who paid on another device stayed free and a revoked one kept Pro until the stored date passed. The shell now re-asks on every open through `reconcileEntitlement()`: `checked` is false on every failure path, so an unanswered question never changes the row, and a silent expiry keeps the known date. The harness mocked `/check-status` with a blanket `{active:false}`, which would have demoted every Pro test the moment the app believed it — the mock now answers for the learner it seeded. [observed] browser test: free row + active answer → the episode runs at A1.
  - **B3 (e0b8f05) — nothing told a paying learner the month was ending.** `days_remaining` was returned on every check and read by no screen; the first news was the level chip dropping to A1 mid-episode. `expiryNoticeAr()` speaks only in the last week (a countdown from day one is nagging), only while the row is really Pro (a revoked subscription keeps its date), and reads the stored date, so it works offline. Two browser tests: named at 3 days with a one-tap renewal, silent at 30. [observed]
  - **B4 (5278627) — the Pro difficulty claim was recorded as unverified; it is real.** `handleNudgeDifficulty` moves one CEFR step from the ⋯ sheet and is Pro-gated. No copy change was needed; the claim now rests on two browser tests instead of a code read (free → the Pro card with the level unchanged; Pro → the chip moves A1→A2), and the §8 row that said no such control had been found is corrected. [observed]
  - **B5 (2a8b853) — the free allowance was announced at the wall.** `freeSessionsRemaining` was read only by the redemption screen, so the learner learned the limit by hitting it. The count now stands on the mode chooser in the app's own `freeSessionsCopy`, taken from the server's ledger (stored by B2) and only when it is a number — `null` (unreadable) shows nothing rather than the locally-seeded 3, and a Pro learner sees no allowance line. Three browser tests. [observed]
  - Gates at B5: `npm test` **1926 passed across 147 files** · browser suite full run **126 passed / 2 failed / 2 skipped of 130** (12.9m) — the two failures are the same pre-existing pair named under A7 (`accessibility.spec.ts:111` Trail 44 px targets, `auditedScreens.spec.ts:46` mock gate wording; reproduced at `8bb9cbc`, unrelated to routing or money) · `npx tsc --noEmit` and `npx tsc -p e2e --noEmit` clean · `npm run build` green. The e2e count rose from 118 at A7 to 126 here because B2–B5 pinned their claims in the browser rather than in a code read: `e2e/paywall.spec.ts` went from 5 specs at `8bb9cbc` to 13 — B2 one (a free row the server now calls Pro still runs the episode at A1), B3 two (named at 3 days with the renewal, silent at 30), B4 two (free → the Pro card, Pro → the chip moves), B5 three (the count from the ledger, nothing for an unreadable one, nothing for a Pro learner).
- [x] C1–C2 trust and erasure — SCOPE STATED, then worked. The plan that named C1–C2 never reached a repo file either, so the scope below is derived from this file's own trust/data-rights rows plus what loading the page actually showed.
  - **C1 (trust pages) — shipped 2026-10-05 and verified, not rebuilt.** `docs/agent/APP-MAP.md` row «C1 trust pages»: `src/lib/trust/content.ts` as fields, the processed-data list computed from the same `ANALYTICS_EVENTS`/`ALLOWED_PROP_KEYS` the worker enforces, `src/lib/trust/dataSafety.ts` derived from `package.json`, public `/trust/*` routes, and `check:launch` counting the open fields. The 10 owner-only `{{OWNER_FILL}}` fields (refund, law, what, how, window, publisher, representative, registry, supervision, dispute) are the whole remaining C1 gap and stay on the BLOCKED-OWNER list. [observed]
  - **C2 (the erasure promise as the learner experiences it) — two real defects, both found by loading `/delete-account` with no session, both fixed.** (a) **Reachability.** `isPublicPath()` did not list the page, and `initializeDatabaseSeed()` hands every first-time visitor a `current_user` row with `isLoggedIn: false`, so the shell's guard treated a GDPR erasure link as a protected route and bounced it to `/welcome` — the one visitor the page exists for (lost token, wiped device, a third party asking). **Proven both ways, not assumed:** with the `isPublicPath` entry removed, `e2e/deletionRequest.spec.ts` fails at `heading «طلب حذف الحساب» toBeVisible`; with it, the page renders and the spec passes. (b) **A false receipt.** The page answered «استلمنا طلبك عبر البريد» after `workerClient.deleteAccount()` — which returns `{success:false}` when there is no token — and there is no server route that queues a request, so a signed-out learner was told their erasure request had been received by nobody. It now opens a prefilled draft to `support@ghaidak.com`, says in words that nothing was sent from this page, and re-offers the draft link if no mail handler opened. A signed-in learner is still deleted on one tap, but the confirmation now follows the server's own `success`: `DELETE_INCOMPLETE` gets «تعذّر إكمال الحذف من هنا», the retry, and the mailbox. And the local wipe now runs on success, because the copy promises the deletion covers this device too — the server route has never heard of a device, and the in-app path had been doing this wipe since V34 while this page did not. **`e2e/deletionRequest.spec.ts` (4) pins reachability, the mail route, the refusal, and the wipe.** Gates: `npx tsc --noEmit` 0 · `npx tsc -p e2e --noEmit` 0 · `npm test` 1926/147 0 · `npm run build` 0 · the spec 4 passed. [observed]

### D — launch-readiness pass (the STEP 1 walk, then the STEP 2 fixes)

- [x] D0 **P0 (fixed, `cb4458e` + `e2307bb`) — the paywall really did omit the price; it was not a test that needed a mock.** `firstRun.spec.ts:84` was red because the modal rendered a hardcoded fallback (`دولار / شهر`) instead of the server's number: a price the app invented, on the page that takes money. The fix quotes `GET /pricing`, the spec's expectation moved to the server's own figure, and the "never a placeholder" check became explicit. Diagnosed as a product defect rather than papered over with a mocked `/pricing`; verified green in every full run since, including the final one. [observed]
- [x] D1 First-impression walk — DONE. A throwaway rig (`e2e/auditWalk.spec.ts`, deleted after use) drove 18 screens in the real flow at **360x640 and 1280x800** — landing, welcome, sign-in, demo, both first-run questions, Trail, scenario detail, guided practice, the mode chooser, the first live turn, the debrief, the paywall, the redeem screen, the privacy page, the erasure page, the library and the profile — writing a PNG per screen to a temp dir (never committed) and a machine probe per screen: tap-target boxes, horizontal overflow, elements outside the viewport, raw placeholder tokens, Latin runs inside RTL text, unlabeled controls, images that never loaded, and composited text contrast. [observed]
  - **Clean at both viewports, measured not assumed:** no horizontal overflow on any screen (`scrollWidth == clientWidth`, including at 360px), nothing positioned outside the layout, zero broken images, zero interactive controls without an accessible name, `dir=rtl` on every screen, no Latin run left inside RTL without an isolation boundary, and every route carries an `h1`/`h2` (the simplicity gate independently reports **29 screens checked, every one nameable**). [observed]
  - **One column of that probe was wrong, and is corrected here instead of reported as a defect.** Its first contrast pass compared the text colour against the nearest ancestor with any non-zero alpha, so a 20%-tinted chip (`bg-status-error/20`) was read as solid `rgb(232,155,155)` and every tinted label looked like a 1.2:1 failure on a black app. A second probe that composites the whole ancestor chain, alpha included, found **0** sub-AA pairs across the landing, onboarding and Trail (`e2e/auditContrast.spec.ts`, also deleted). The token gate agrees: `npm run design:contrast` → all pairs pass, tightest 4.52:1. [observed]
  - **Not reached by the walk, and stated as a hole rather than implied coverage:** the PRICED paywall, because the mock's `/pricing` fails by default (which is why the walk photographed the honest «تعذّر تحميل الأسعار الآن — لن نعرض رقماً لا نعرفه» state instead of a price); the placement screen; the mock exam; and the failure states that need a denied microphone. `e2e/paywallPricing.spec.ts` and `e2e/microphone.spec.ts` cover the first and last of those. Real payments, a real iPhone, a low-end Android and the deployed Worker remain BLOCKED-OWNER. [observed]
  - **The ranked list, as the walk produced it** (what the learner sees / what they must decide / what was wrong). Screens walked in both viewports; the PNGs are in a temp dir (`C:\tmp\katzu-audit`), not committed. [observed]

| # | rank | screen | what the learner sees and must decide | finding |
|---|---|---|---|---|
| 1 | — | `/` landing | One promise, two actions: «جرّب درساً بدون حساب» (primary) and «ابدأ مجاناً الآن»; the decision is try-vs-register | clean |
| 2 | — | `/welcome` | One sentence and one sign-in affordance | clean |
| 3 | — | `/signin` | A single Google button and the sync promise | clean |
| 4 | — | `/demo` | Step 1 of 4, no account, no personal data | clean |
| 5–6 | — | `/onboarding` q1, q2 | One question per screen, five options; the second is minutes | clean |
| 7 | **P1** | `/app/trail` | Today's mission, the mission's action, plus a «أكمل تفضيلاتك» prompt | dismissal X at **26px** |
| 8 | **P1** | `/scenario/:id` | Two short steps then the conversation | skip-to-conversation at **19px** — the fastest route to first value |
| 9 | — | `/scenario/:id/practice` | Three phrases, one readiness action | clean |
| 10 | **P1** | `/scenario/:id/live` chooser | Two modes, one recommended | back chip at **38px** |
| 11 | — | the first live turn | Opener, round counter, mic and a text box | clean (German stays LTR inside the RTL layout) |
| 12 | — | `/session-report` | With nothing stored: names the gap and offers a way on | clean |
| 13 | **P1** | `/paywall` | The offer, with the price unreadable by design when the source fails | refund question at **19px** |
| 14 | **P1** | `/subscription` | Membership state, free allowance from the ledger, the code box | price link at **41px** |
| 15 | **P1** | `/trust/privacy` | The policy itself | rendered the raw `{{OWNER_FILL}}` token |
| 16 | — | `/delete-account` | Erasure, one tap or one mail (C2) | clean after C2 |
| 17 | **P1** | `/app/library` | The scenario list before the mission | same 26px dismissal X |
| 18 | — | `/app/profile` | Account, plan, data controls | clean |

  - **P0: none found by the walk.** The two launch-blocking-grade defects of this pass were the erasure page's reachability and its false receipt (C2), found by loading the page rather than by the probe. **P1: 8 found, 8 fixed** (the six tap targets, the printed placeholder, the erasure pair). **P2: one probe artifact, corrected not fixed** (below). [observed]
- [x] D2 P1 — **the 44px tap floor, six real controls** (fixed, and it clears a spec that had been red since before A1). The walk found: the dismissal X on the two home screens at **26px** (`JourneyHomeScreen`, `TrailScreen`), the skip-to-conversation shortcut at **19px** (`ScenarioDetailScreen` — the fastest path to first value, and the smallest thing on a phone screen), the mode chooser's back chip at **38px** (`LiveConversationScreen`), the paywall's refund question at **19px** and the redeem screen's price link at **41px**. All six now clear the floor with the idiom the repo already uses for this (`min-h-touch min-w-touch` + centred flex, as Modal's and BottomSheet's close buttons do). **Consequence, not claim:** `e2e/accessibility.spec.ts` — the first of the two long-standing red specs — now passes (`primary actions keep 44px targets at 360px on the Trail`), and a new sibling test holds the four other screens to the same rule so the class of defect cannot come back on a screen the Trail test never visited. [observed]
- [x] D3 P1 — **the privacy policy printed its own scaffolding** (fixed). `/trust/privacy` rendered the literal `{{OWNER_FILL}}` token in the middle of the policy text, which is the exact defect B1 fixed on the paywall's refund line and which the C1 tests could not see (they pin `content.ts`, not what a visitor reads). Two changes: the render now says «يُكمل هذا البند قبل النشر — لم نكتب هنا وعداً لا نستطيع الوفاء به» where the owner's sentence will go, and the one "owner field" that was never the owner's to provide — the privacy contact address, which the app already prints in three other places — is filled with `support@ghaidak.com`. The unfinished-page warning stays, so the page is still honest about what is missing. `e2e/trustPages.spec.ts` (7) pins both directions: never the raw token, always the missing-field count. [observed]
- [x] D5 The regression net and the final run. Added: `e2e/deletionRequest.spec.ts` (4, C2 above), `e2e/trustPages.spec.ts` (7, D3), the five-screen tap-target test in `e2e/accessibility.spec.ts` (1, D2) and `e2e/onboarding.spec.ts`'s «a stranger walks from the landing page to the first mission» — the one gap worth closing, because every other spec starts INSIDE the app and nothing proved a stranger can get in: landing hero → `/welcome` → the single sign-in affordance → (the harness seeds exactly the session the Google button would create, the one seam a test cannot cross, stated in the spec) → the two first-run questions → `/app/trail`, with nothing asked twice. **First full run on the D2–D3 tree: 142 tests, 140 passed, 0 failed, 2 skipped, exit 0 (12.2m)** — including both specs that had been red since before A1. [observed]
  - **The second of those two reds came back on the next run, and the cause was the test, not the app — now fixed rather than re-reported.** Run 2 on the same code failed `auditedScreens.spec.ts:46` with «element(s) not found», and Playwright's own error snapshot showed the page in the state the spec never accepted: the mock had STARTED (`progressbar «الجولة 1 من 9»`, the opener, the input). So the spec was waiting on a loading label (`جارٍ تجهيز المحاكاة…`) that React is free to batch away — the same family as the 2026-09-29 mic note and the V32 interim-caption flake — and it passed or failed by timing (3.7s pass, 20s timeout, identical code). **Fix: the exam's started state is now an accepted arm, and the invariant the spec exists for is asserted unconditionally** (`page.getByText('يرجى تسجيل الدخول بحساب Google أولاً')` has a count of 0) instead of only when a gate happened to render — so the replacement is stronger than the vacuous `if (gateText)` branch it removes. Proven with `--repeat-each=3`: **9 passed, no timeouts (49.9s)**, where the old spec had a 20s timeout in it. **Final full run on the frozen tree: 144 tests, 142 passed, 0 failed, 2 skipped, exit 0 (18.4m)** — the mock-gate spec at 7.1s with no timeout, both 44px specs green (9.1s / 13.5s), and D6's fourth-conversation test green (8.3s). [observed]
- [x] D6 The failure states the STEP 2 list names, checked one by one against the browser suite, and the one real gap closed. **Already covered, reused rather than duplicated:** mic denied and no-German-voice (`journey.spec.ts`), AI error (the retry card in `auditedScreens.spec.ts`, plus the Ask failure in `screenNames.spec.ts`), the mock-exam wall (`mockExam.spec.ts`), an offline read (`landingHero.spec.ts` — the full offline walk lives in `playReadiness.spec.ts`, which the suite excludes on purpose because it blocks service workers). **Not covered anywhere, and it is the state the priced funnel rests on: the fourth conversation.** The free wall's Pro card had a unit test in the hook and no browser test at all — `paywall.spec.ts` now drives it with a new harness mirror of the Worker's own answer (402, `FREE_QUOTA_EXHAUSTED`, its own sentence), and asserts three things: the offer names the allowance in the words the learner was promised (`انتهت 3`), it is NOT the generic retry card that no retry could clear (the V31 defect), and `free_session_exhausted` actually reaches the collector from the surface that fires it — the funnel event A5 added, now proven end to end rather than only allow-listed. [observed]
  - Still not covered, and honestly so: **a rejected or expired redemption code in the browser** (the reason strings are unit-tested in `workerClient.test.ts`, the browser only covers the prefill), and **payment pending** (the purchase happens on the processor's own origin, so the app's part is the outbound hand-off). [observed]
- [x] D7 The eight priority areas of this pass, each with a verdict — so nothing is silently skipped:
  1. **Time to first value** — the path is landing → welcome → sign-in → two questions → mission → conversation, and the shortcut that skips two practice steps was a 19px link (D2). Fixed. No screen, permission or question was found that could be deferred further without dropping the onboarding the owner approved in A3. [observed]
  2. **Every failure state human** — D6: five of the seven named states were already covered by existing specs, the fourth-conversation wall was not, and it is now. Two remain uncovered and are named there. [observed]
  3. **Arabic RTL correctness** — checked on all 18 screens at 360px: `dir=rtl` throughout, no Latin run inside an RTL flow without an isolation boundary, and German practice text stays LTR inside the RTL layout. No defect. [observed]
  4. **Paywall and redemption trust** — B1 (the placeholder), B3 (the expiry notice), B5 (the allowance from the ledger), D0 (the invented price), D6 (the wall). Every one of them moved toward saying less rather than more. [observed]
  5. **A debrief that earns a return** — A4's tomorrow teaser and one-card-at-a-time debrief walked clean; with no stored report it names the gap and offers a way on rather than showing an empty shell. [observed]
  6. **Visual consistency** — no new design system: every fix in D2 uses tokens the repo already had (`min-h-touch`, `min-w-touch`, the Modal/BottomSheet close-button idiom). [observed]
  7. **Accessibility floor** — six targets fixed (D2), the Trail spec that had been red since before A1 now passes, and axe reports no critical/serious violation on the six key screens (existing gate, re-run green). [observed]
  8. **Performance on a low-end phone** — no change made and none needed: this pass added no dependency and no eager work. Measured on the built output: entry 155,809 → **155,938 gzip (+129 B)**, AppShell chunk 40,397 → **41,490 B**, precache 4,150.45 → **4,156.60 KiB (+2.12)**. No layout shift was introduced; the walk's screenshots at both viewports were stable. **A real low-end device was not tested — BLOCKED-OWNER.** [observed]
- [ ] D4 — the P2 remainder: nothing else was found. No dead ends, no flash of wrong content, no clipped or overlapping element, no untranslated string, no missing loading/empty/error state on the 18 screens walked. The debrief with no stored report says so and offers the way out; the redeem screen names the free allowance from the server ledger (B5); the erasure page is reachable and honest (C2). Left unchecked on purpose: a walk is never exhaustive, and the screens it did not reach are listed under D1. [observed]

## Release candidate (RC) — the security, data, observability and runbook pass

### RC1 — sync
- [x] Nothing was left unfinished for this pass: A4–A8, B1–B5, C1–C2 and the final-readiness audit (D0–D7) are all `[x]`; the only unchecked line is D4, which is the note "nothing else was found" and stays unchecked on purpose. Branch `release-candidate`, cut from `launch-final`. `npm audit --omit=dev` → **0 vulnerabilities** (`found 0 vulnerabilities`). [observed]

### RC2 — the AI routes: auth, limits, size, and the operator's brake
- [x] **RC2.1 P0 — the emergency spend brake did not reach Whisper (fixed).** `AI_DAILY_SPEND_CAP` is documented in `wrangler.toml` and in `checkDailySpendCap`'s own comment as the switch that "stops all AI traffic… how the operator stops spend without a deploy". Five AI routes reach it through `authenticateAiRequest` (`rateLimit` defaults to **true** — the default, not a per-call option; I read the five call sites, saw no `rateLimit:` key, and had to go back and read the signature before concluding anything), and there the check is real. **`/ai/transcribe` was the exception:** it calls `env.AI.run` (Whisper large-v3-turbo) directly rather than through that gate, so at cap 0 the conversation, translation, hints, writing and ask routes were held while the most expensive call per unit of learner value kept billing, bounded only by 40 recordings/min and 800/day **per account**. **Proven, not inferred:** with the new check disabled, the new route test answers `200` where it must answer `503` (`expected 200 to be 503`), i.e. the route really did run with the brake pulled. The fix injects `checkDailySpendCap` + its message through `aiRouteDeps()` and applies the same 503, the same `DAILY_SPEND_CAP` code and the same Arabic sentence the other routes use, so one number still bounds the day. It also increments the same counter, so Whisper now draws on the same daily allowance as every other call. [observed]
- [x] **RC2.2 P2 — the transcribe error echoed the provider's own text (fixed).** A failed transcription answered with `detail: <provider error>`, and nothing consumes it: the client's only reader of `detail` is the `/ai/turn` path in `workerClient`. The route now answers in Arabic and logs the provider text for the operator only. [observed]
- [x] **RC2.3 The guards that were already there, checked one by one rather than assumed:**
  - **Global request pipeline** — `TEST_MODE` is neutralized before any handler unless `ENVIRONMENT` is exactly `test`; a foreign origin gets `403 origin_not_allowed` from the CORS allow-list; `OPTIONS` is answered without a handler; bodies are capped at **64 KB** (400 KB for the one audio route) with a 413 and an Arabic message; `MAINTENANCE_MODE` refuses every learner **write** before any handler while `/admin/*` stays reachable. [observed]
  - **Admin** — every `/admin*` path passes a durable per-IP failure throttle (**5 failures / 15 min**) *before* the handler, and each admin handler then checks `isAdminAuthorized`: a fail-closed bearer check (`ADMIN_SECRET` unset or shorter than the minimum authorizes nothing), constant-time over length-normalized input so the secret's length is not leaked, and every miss writes the counter. `/admin/discount-code` — the one admin path with **no test** — does call the gate (read at `cloudflare-unified-worker.js:3237`). **No admin log line carries a code or a secret**: the only three `console.*` calls that mention codes/keys are a static `TEST_MODE` warning, a truncated D1 error message, and a missing-secret warning. [observed]
  - **Redemption (`/verify`)** — per-account lockout that escalates with the attempt count and is evaluated **before** `parseCode`, so malformed floods are throttled too; single-use enforced by the ledger's PRIMARY KEY (a UNIQUE violation is told apart from an unreachable ledger, and a spent code is never reported when the database is down); **codes are HMAC-signed** (`DE-<months>M-<nonce>-<16 hex signature>`), so guessing is a signature forgery rather than a search — which is why the absent per-IP throttle is a defence-in-depth gap and not a hole, and why I did **not** add one: this product sells cohort/teacher codes, and a tight per-IP limit would lock out a classroom behind one NAT address. Recorded as a decision, not an oversight. [observed]
  - `/ai/turn` and friends: authentication, entitlement, the global per-account rate limit and the spend cap all run in `authenticateAiRequest` before any model call; when the cap is hit the learner gets **503 + `DAILY_SPEND_CAP` + the Arabic sentence**, never a 500. `/demo` spends nothing (A2.1, re-confirmed: its only AI path is `POST /ai/transcribe`, which requires a session token). [observed]
  - **Security headers** — `public/_headers` carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, a microphone-only `Permissions-Policy`, and a real `Content-Security-Policy` (`object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'`, `form-action 'self'`, Google Identity allowed for script/frame). It is copied verbatim into `dist/_headers` by the build (diffed, identical), and its `connect-src https://*.workers.dev` matches the deployed Worker origin (`katzu-test.ghaidakalosh008.workers.dev`, per `docs/agent/ENV-FACTS.md`), so the CSP does not block the app's own API. **Missing and listed for the owner: `Strict-Transport-Security`** (a zone-level Cloudflare setting; absent from `_headers`). [observed]

### RC3 — data safety: the inventory, the retention, and the deletion path

- [x] **RC3.1 The inventory** — every store the app's own code creates, what it holds, and whether it is personal data. Read from the DDL in `cloudflare-*.js`, not from memory. `[observed]`

| store | what it holds | personal data? | what removes it |
|---|---|---|---|
| D1 `users` | Google sub, email, created/last-seen, plan, plan expiry, **last IP**, platform, channel tag | **yes** (email, IP) | deleted on request (`purgeUserRegistry`) |
| D1 `activity_log` | account handle or sub, event name, small metadata, ts | pseudonymous | deleted on request; the analytics-keyed half was the RC3.2 gap |
| D1 `error_reports` | handle/sub, error type, endpoint, message | pseudonymous (a message can quote a sentence) | swept at 30 days; deleted on request |
| D1 `sync_revisions` | the authoritative merged progress payload per account | **yes** (learning history) | deleted on request |
| D1 `trial_quota_ledger`, `mock_free_claims`, `mock_sessions` | free allowance spent, the one free mock, every mock start | pseudonymous | deleted on request |
| D1 `redeemed_codes_ledger` | code, account id, months, redeemed-at | code + sub | **anonymised** to `deleted-account`, retained for code integrity / fraud |
| D1 `referral_payouts`, `referral_lesson_payouts` | inviter/invited sub pairs | pseudonymous | deleted on request |
| D1 `generated_codes` | minted code, months, teacher/cohort label | no learner data | retained (code registry) |
| D1 `crypto_orders`, `crypto_events` | order id, claim token, payment id, invoice URL, delivered code | buyer data on the **sales** site, never learner data from the app | retained (payment records) — owner's call |
| D1 `rate_limit_counters` | counter id, window start, count | no (hashed key) | swept at 24 hours |
| KV `USER_PROGRESS` | live sessions, progress mirror, daily ledger, AI quota, trial markers, review queue, mock state, analytics batches | **yes** (sessions, progress, what the learner got wrong) | deleted on request (analytics batches: 30-day TTL) |
| KV `REDEEMED_CODES` | account subscription, referral claim/history/code, email index, mock claim/state, redemption lockout | **yes** (email index) | deleted on request |
| D1 `vocabulary`, `starter_phrases`, `grammar`, `scenarios` | the curriculum | no | n/a |

- [x] **RC3.2 The deletion path was incomplete, in two ways, and both are fixed.** `/user/delete` always had a documented walk, and a registry purge keyed on the Google sub. Two classes of record were outside it. (a) **The analytics funnel rows**: `activity_log` carries the *client's* handle (`acct_<djb2 of the email>`), not the sub, so `WHERE user_id = <sub>` never matched them — a learner asking to be erased kept one row per funnel event, and that handle is 32 bits, i.e. confirmable against a candidate email. The deletion now computes the same handle server-side (`analyticsAccountHandle` in `cloudflare-analytics.js`) and deletes those rows; a test pins the two hash implementations together so a client change cannot silently stop the deletion. Proven by disabling the step: the new test fails (`expected [ 'progress', … ] to include 'analytics_rows'`). (b) **Five per-account records the walk simply listed nowhere**: the spaced-repetition queue (`review:` — what the learner got wrong), the mock's `mock-state:`/`mock-free:` keys, the redemption lockout counter (`codefail:`), and the mock's two D1 tables. All five are now deleted in the same walk, and the new test fails with the steps removed (same pattern: red without the fix, green with it). Commits `e96b306`, `a05829b`; `[observed]`.

- [x] **RC3.3 Analytics carry no PII and honour the opt-out — verified, not assumed.** Client side: the event record is a closed allowlist; properties are picked from `ALLOWED_PROP_KEYS`, so a transcript, an email or a token has no field to travel in; the signed-in account is a non-reversible handle and a test asserts an email is never sent as the account id; opting out deletes the pending queue rather than muting it. Server side: the same allowlist is re-applied per event and rejects an email-shaped installation id, and the stored batch is one KV record per batch under a random key. The two lists are pinned to each other by test. `tests/analyticsEvents.test.ts`, `tests/analyticsRoute.test.ts`, `tests/dataSafety.test.ts`. `[observed]`

- [x] **RC3.4 Migrations are additive and re-runnable; here is the order.** `migrations/` is documentation the README says outright nothing executes, and the app's own tables are created by the Worker on its first request. That makes re-runnability load-bearing, so it is now proven rather than asserted: a test records the statements a real request issues, checks every `CREATE` carries `IF NOT EXISTS` and the only `ALTER` is an `ADD COLUMN`, then replays them through real SQLite **twice** and requires an identical schema (skipped only on a Node without the built-in SQLite). To apply, in order: **(1)** nothing for the app tables — deploy the Worker and its first request applies them; **(2)** owner-only, for the A0 curriculum, the `0002_a0_level_check_rebuild.sql` CHECK rebuild, then the two `load-curriculum.mjs` commits named in the README; **(3)** the frontend last. `tests/freshDatabase.test.ts`; `[observed]`.

- [ ] **RC3.5 Retention: the honest remainder.** Two records survive a deletion request by design or by cost, and both are the owner's call rather than the agent's: the **analytics KV batches** (`analytics:evt:<day>:<uuid>`, random keys, no email, 30-day TTL) are not deleted by `/user/delete` because reaching them means listing ~30 day-prefixes and reading every batch inside a synchronous delete request — a slow, fragile deletion is a worse failure mode than a record that expires by itself; and the **code ledger's anonymised rows** (kept for code integrity, per the comment in the route). Neither holds an email, a name or any learner text. Everything else the app stores is removed on request. `[observed]` + one owner decision.

### RC4 — observability: what is logged, what the dashboard answers, and what to alert on

- [x] **RC4.1 Structured logs — the four the brief names, checked one by one.** `ai_turn` `{event,tier,tokens,estimated_cost_usd}` per turn plus `ai_daily_spend_cap_warning` at 80% of the cap (A1.2). **Redemption outcomes: added in this pass** — one `code_redemption` `{event,outcome,reason,locked_out}` line per ATTEMPT written by the registry wrapper, which sees the handler's verdict and never its input, so the code cannot be in it (a success-only row and a lockout counter meant a spike in people failing to redeem was invisible; now it is alertable). **Payment events:** durable rows, not log lines — `crypto_events` (event key, payment id, status, order, received-at; the event key is the idempotency guard) plus the order row's `status/paid_at/delivered_at`, written by the signed IPN handler. **Errors with route and status:** `error_reports` rows carry the account handle, error type, endpoint and message, and `activity_log` carries `ai_turn_failed`/`_completed` with {@status} per AI call; both are queryable, which is what the funnel reads. A new test drives a tampered code and a real one through `/verify` and asserts two structured lines, `invalid_signature` then success, with no code or signature anywhere in them. `[observed]`

- [x] **RC4.2 `/admin/api/metrics` — two of the four numbers it was asked for did not exist, and two were mislabeled.** *What was wrong:* `return_day1` / `return_day7` were emitted by the client and allowlisted from the start, but they were **not funnel events**, so they were never written to D1 — the retention question rested on KV, which expires in 30 days and cannot be grouped; and the response's `cohorts` block shipped `d1` = mock starts and `d7` = redemptions, two retention-looking names carrying numbers that say nothing about retention (worse than an empty field: an operator reads them). *What it now answers:* **activation** — the seven ordered steps, unchanged; **day-1 / day-7 return** — distinct accounts against the accounts active in the window, printed as `null` when there is no denominator; **paywall → redeemed** — the end-to-end rate (of the accounts that saw a paywall, how many hold a redeemed code), explicitly separate from the step-to-step click rate; **AI spend** — the brake's own `global-ai-spend` counter for today against `AI_DAILY_SPEND_CAP`, with `utilization_percent` (a stale row from yesterday reports 0, not that count), plus accounts active today. The misleading `cohorts` block is gone and its one honest number ships as `signups_30d`. All of it is rendered on the dashboard panel, and verified two ways: seeded local data through the aggregation (`tests/funnel.test.ts`) and the real authenticated `GET /admin/api/metrics` surface (`tests/adminRegistry.test.ts`). `[observed]`

- [x] **RC4.3 One health endpoint that checks storage without spending AI.** `/health` (and its `/ai/health` alias) reported whether the AI engine could serve and said nothing about D1 or KV — so a monitoring check could not tell "the Worker answers" from "the Worker answers and its database is gone". It now returns `storage: { d1, kv }` with `ok` / `error` / `unbound` from one `SELECT 1` and one key read: read-only, no AI call (asserted: a bound `AI.run` is never invoked), no counts, no driver text — an error is the single word `error`. Still under the 400-byte budget the privacy tests enforce, and still without key material. `[observed]`

- [x] **RC4.4 The honest remainder, and the exact next step.** "AI cost per active user" in **dollars** is not in D1 and this pass did not put it there: the per-turn estimate is a structured log line (`ai_turn.estimated_cost_usd`), while D1 holds the *call* count the cap actually bounds. The dashboard therefore answers "calls today vs cap" and "calls per active account is derivable", and the dollars stay an owner-side query over Workers Logs (`event:ai_turn`, sum `estimated_cost_usd`) until the router's usage numbers are threaded into the telemetry row — a change to the AI path, deliberately not made in a release-candidate pass. `[observed]`

- [x] **RC4.5 P2 — the pre-submission gate could not run on Windows (fixed).** `npm run check:launch:strict` was `LAUNCH_STRICT=1 node …`, a POSIX env prefix, and npm runs scripts through `cmd` on Windows: the command failed with "not recognized as an internal or external command" and exited non-zero for the wrong reason — a release gate that cannot run on the machine invoking it is not a gate. The script now also accepts `--strict` / `--verify`, package.json uses the flag, and the env form still works (that is what CI sets). Verified on this machine: `npm run check:launch:strict` → exit **1** listing the 10 owner fields and the 2 shipped `{{…}}` strings, while plain `npm run check:launch` → exit **0**. [observed] **Unfinished, and not mine to finish:** the one-line `package.json` change that switches that script to the flag is **not committed** — the file carries another author's uncommitted work (the `verify`, `verify:ci`, `cost:report`, `hooks:install`, `prepare` and `ledger:archive` entries, which are not mine and are still being used from the working tree), and staging the file would stage their work with my message. Until that lands, the script body in the working tree is already correct; on Windows the alias keeps its POSIX prefix only in the committed `package.json`, and `node scripts/check-launch.mjs --strict` is the equivalent that runs anywhere.

- [ ] **Alert thresholds to set in Cloudflare (owner).** These are the rules the numbers above exist to feed; they are documented here because an alert is an operator setting, not code. **(1) Error rate** — Worker 5xx above 2% of requests over 5 minutes (Cloudflare's own Workers metrics), plus a spike in `error_reports` rows for one endpoint. **(2) Spend at 80% of cap** — the `ai_daily_spend_cap_warning` log line and/or `metrics.ai.utilization_percent >= 80`; at 100% learners get 503 `DAILY_SPEND_CAP` with an Arabic sentence, which is a stop, not a bug — treat a 100% day as expected only if the cap was set too low. **(3) Redemption failure spike** — more than ~20 `code_redemption` `outcome:failure` in 10 minutes, watched separately from `locked_out` (a lockout is one account guessing; scattered failures are a broken code or a confusing screen). **(4) AI provider down** — `/health` `ready:false` on two consecutive checks (the Workers AI fallback covers a single provider). **(5) Storage** — `/health` `storage.d1` or `storage.kv` = `error`. **(6) Redemption → delivery gap** — order `paid_at` set with `delivered_at` null for more than 30 minutes. `[unknown]` until the owner sets them.

### RC5 — runbooks (copy-paste ready)

**Where this lives, and why not in `docs/LAUNCH-CHECKLIST.md`.** That file's §6 already owns the deploy order, the post-deploy smoke list and the `MAINTENANCE_MODE` stop, and a doc-budget test caps it at 27 KB — it sat at 25.4 KB, so a second runbook could only fit by weakening a guard or by duplicating text that would then drift. The five sections below are therefore the authoritative runbook, §6 stays the deploy/smoke detail, and this file is the one whose own budget is explicitly allowed to grow. **Nothing is duplicated between them except the two facts that must never disagree** (§6.1's order, and the emergency stop), each stated once.

**RC5.1 Deploy order, and the pre-deploy checklist.**

Order matters: Worker → smoke → app → sales → optional content. The app is cached by its service worker, so an app that ships first talks to a Worker without the routes it expects.

Pre-deploy, all four:
1. **`ENVIRONMENT=production`.** Anything else — specifically `test` — enables the `TEST_MODE` JWT bypass; on a public Worker that is an open door (A1.1 failed it closed, and the test pins it).
2. **Secrets present:** `GOOGLE_CLIENT_ID`, `HMAC_SECRET` (codes are signed with it — rotating it invalidates every unminted code), `ADMIN_SECRET` (below its minimum length it authorizes nothing), at least one AI key. Do **not** set `TEST_MODE`.
3. **`AI_DAILY_SPEND_CAP` set.** Unset or non-numeric fails OPEN, admitting every call. `node scripts/verify-cost.mjs` prints the cap a daily budget in USD implies.
4. **Gates:** `npm run verify -- --ci --e2e` green on the branch, and `npm run check:launch:strict` read — it exits 1 while an owner-only legal field is open, and the list it prints is the point (on Windows the script previously could not run at all; it now takes `--strict`, RC4.5).

Commands: `npm run deploy:worker` (= `npx wrangler deploy`); then the smoke list in `docs/LAUNCH-CHECKLIST.md` §6.3 — whose `/health` expectation gains this pass's field: `{"status":"healthy","service":"Katzu Unified Worker","ready":true,"maintenance":false,"storage":{"d1":"ok","kv":"ok"}}`, and **no body at all** means an older Worker is still serving; then `npm run build` and the Pages deploy (push to `main`, or `npx wrangler pages deploy dist --project-name=<project> --branch=main`); then the sales site only if it changed.

**RC5.2 Rollback, in under five minutes.**

1. **Record the current Worker version first** — `npx wrangler deployments list`; that id is the rollback target, and it is worth capturing before deploying, not after something breaks. Pages has the same thing per deployment in the dashboard.
2. **Worker:** `npx wrangler rollback` (previous) or `npx wrangler rollback <id>`. Every schema change is additive and the lazy DDL is re-runnable (RC3.4), so the previous Worker runs against the same D1 with nothing to migrate back.
3. **App:** roll back to the previous Pages deployment. Clients keep the older service worker until their next visit; nothing needs purging.
4. **What happens to in-flight sessions:** a request already executing finishes on the version that started it. A request that arrives mid-rollback gets a 5xx and the client shows its own retry card with the learner's sentence kept — no silent spinner, no lost input. **Nobody is logged out and no progress is lost:** session tokens live in KV with their own expiry, and the authoritative progress row is D1 `sync_revisions`, neither of which a Worker rollback touches. A learner mid-conversation may see one failed turn; the sentence stays on screen for a retry.
5. **If only one screen is broken, roll back the Worker anyway** — the app is a cached shell, the Worker is the live logic, and the rollback is the faster and more complete fix.

**RC5.3 Launch-day watchlist — the six numbers, and what "bad" looks like.** Read from `GET /admin/api/metrics` (dashboard: *Launch funnel*), `/health`, and the Worker log stream. Thresholds to actually arm are in RC4.4.

| # | number | where | "bad" looks like |
|---|---|---|---|
| 1 | **Error rate** | Workers metrics + `error_reports` | above ~2% of requests over 5 minutes, or one endpoint repeating `server_error` |
| 2 | **AI spend** | `metrics.ai.calls_today` / `cap`, `utilization_percent` | ≥80% before the day's peak; 100% means every AI route answers 503 for the rest of the day |
| 3 | **Day-1 return** | `metrics.returns.day1` | a rate near zero on a readable cohort, or a denominator so small it means nobody is reaching a second visit |
| 4 | **Paywall → redeemed** | `metrics.rates.paywall_to_redeem` | paywall views that never convert, or `upgrade_click` far above redemptions (people try and fail to pay) |
| 5 | **Redemption failures** | the `code_redemption` log line, `outcome:failure` | >20 in 10 minutes, or failures spread across many accounts — one account is a guesser, many accounts is a broken code or a confusing screen |
| 6 | **Signup → first session** | new `users` rows vs session-completed events that day | signups with no first session for hours — onboarding is where they stop |

Less urgent but worth an eye: `/health` `ready:false` (the whole AI pool unusable), `crypto_*` errors on `/crypto/webhook`, and an order with `paid_at` set but `delivered_at` null.

**RC5.4 Incident playbook — one action per scenario.**

- **AI provider down** (`/health` `ready:false` on two consecutive checks, or AI routes answering 5xx): **change nothing yet.** The router walks the key pool and falls back to Workers AI, so one provider or one key is a failover, not a launch event. Only when `ready` stays false with keys configured, check them in Cloudflare → the Worker's settings, then rotate.
- **Spend cap hit early** (100% before the day's peak): either **raise `AI_DAILY_SPEND_CAP` and redeploy the Worker**, or accept the stop — learners get 503 `DAILY_SPEND_CAP` with an Arabic "come back later", never a 500. Do **not** remove the cap to unblock a launch day: it is the one variable that bounds the bill.
- **Redemption failures** (the failure count spikes): read the `reason` in the `code_redemption` line first. Many `invalid_signature` means the codes being handed out were not minted with this deployment's `HMAC_SECRET` (it was rotated, or the codes came from another environment) → regenerate them. `locked_out` on one account is that learner guessing → nothing to fix.
- **Payment confirmed but no code delivered** (order `paid_at` set, `delivered_at` null, or a buyer says nothing arrived): **look the order up in `/admin/api/orders` before replying** — the delivered code is on the row. Present: send it. Absent: re-run delivery for that order (the webhook is idempotent on `event_key`, so re-delivery cannot double-issue). Never send a code you cannot see in the order row.

**RC5.5 Support macros in Arabic — the five questions that will arrive.** Send the first sentence, then ask the one question you need answered. **Never ask for a code, a token or a password** — ask for the purchase email or the order number.

1. **لا أستطيع تسجيل الدخول** — «الدخول بجوجل فقط. جرّب من متصفح آخر (Chrome أو Safari) وتأكد أنك على نفس حساب جوجل الذي سجّلت به. أرسل لنا صورة للشاشة إن استمرت المشكلة.»
2. **الكود لا يعمل** — «الكود يُستخدم مرة واحدة، ويُدخل من «تفعيل العضوية» بعد تسجيل الدخول، بحروف كبيرة كما وصل. إذا ظهرت رسالة أنه مستخدم، أرسل لنا بريد الشراء أو رقم الطلب — لا ترسل الكود نفسه.»
3. **الميكروفون لا يعمل** — «التعرّف على الصوت يحتاج إذن الميكروفون. افتح إعدادات الموقع في المتصفح واسمح بالميكروفون ثم أعد تحميل الصفحة. ويمكنك دائماً كتابة جملتك بالألمانية بدل الكلام.»
4. **أريد استرجاع المبلغ** — «بند الاسترجاع مكتوب في صفحة الشروط؛ أرسل بريد الشراء أو رقم الطلب وسنراجع الحالة معك.» (لا تعِد بمدة ولا بمبلغ.)
5. **أين الكود؟** — «يظهر الكود في صفحة إتمام الشراء وفي بريد شركة الدفع. إن لم يصل، أرسل بريد الشراء أو رقم الطلب وسنعيد إرساله، ثم أدخله من «تفعيل العضوية».»

### RC6 — release verification (STEP 4), as run

- [x] **RC6.1 The full suite, with its real numbers.** `npx tsc --noEmit` → 0. **Unit: 147 files / 1941 tests, all passing** (`npx vitest run` on the final tree). **Browser: 140 passed / 2 skipped / 0 failed, exit 0, 15.6 m** (`npx playwright test`, Chromium, dev server, service workers blocked by design — the two skips are the paywall-parity cases that need a signed-in account). `npm run build` → exit 0. `npm run check:launch:strict` → **exit 1, by design**: 10 `{{OWNER_FILL}}` legal fields and 2 shipped placeholder strings, all owner-only (RC4.5). Nothing was skipped, weakened or annotated to get here. `[observed]`
- [x] **RC6.2 Two specs re-run after the last source change.** The browser suite above started before the `og:url` fix (RC6.5), so the specs that touch the changed file were re-run on the final tree rather than left as an inference: **`e2e/landingHero.spec.ts` → 5 passed** (6.6 s of tests), and `e2e/playReadiness.spec.ts` (RC6.3). Whoever reads this should know the 140-passed figure is a suite run across a source edit plus targeted re-runs — not one clean run of the final commit. `[observed]`
- [x] **RC6.3 PWA — verified on the built output, and the run that failed first is the interesting part.** `dist/manifest.webmanifest` parses as JSON and carries `name`, `short_name`, `display:standalone`, `start_url: /?source=pwa`, `scope:/`, `lang:ar`, `dir:rtl`, `orientation:portrait`, 192/512 icons **and a 512 maskable**, plus two shortcuts whose icons exist on disk. `dist/sw.js` + `workbox-*.js` are emitted, `registerSW.js` is in the HTML, every icon file resolves, and the precache is **111 entries / 4156.66 KiB**. **`e2e/playReadiness.spec.ts` — 3 passed (4.4 s, exit 0) against `vite preview`:** a manifest an installer accepts, `assetlinks.json` at the path Android really fetches **with a JSON content type**, and the app opening offline from the cached shell rather than the browser's error page. **The first attempt at this ran the same spec against the dev server and FAILED all three** (`link[rel=manifest]` never appeared; `/.well-known/assetlinks.json` came back `text/html` because dev has no such file and the SPA fallback answers it) — those failures were the wrong target, not a broken PWA, and the spec's own header says so. Recorded because the next operator will hit it: **this spec needs `npm run build` + `vite preview` on port 3000, and the main suite's green run says nothing about it** (that config blocks service workers by design). `[observed]`
- [x] **RC6.4 Sitemap, robots, canonical and og tags against an origin — built twice.** With **no** `VITE_PUBLIC_APP_URL` (the current state): `robots.txt` advertises a relative `Sitemap: /sitemap.xml`, every `<loc>` is relative, `og:image` stays root-relative, no `og:url`, `assetlinks.json` is `[]` — all four documented, honest degradations of an unset variable, and `check:launch:strict` names the variable. With `VITE_PUBLIC_APP_URL=https://katzu.example` (a throwaway origin, chosen so no real host is ever baked): `Sitemap: https://katzu.example/sitemap.xml`, all five `<loc>` values absolute, `og:image` absolute, `og:url` absolute, and the build exits 0. Canonical is set at runtime from `publicAppUrl()` (the variable, falling back to `location.origin`), which is why it is absent from the static HTML — verified by reading the code path, and **not** by a test: no test asserts the canonical link exists (**P2, listed below**). `[observed]`
- [x] **RC6.5 P2 — `og:url` was a dead code path (fixed).** The landing screen updates `meta[property="og:url"]` on mount, and no HTML ever contained that tag, so the update did nothing — the same class of defect as the deletion walk's missing records. The build now injects an absolute `og:url` when it knows the origin, and the screen creates the tag when it does not, exactly as it already did for canonical. Verified in both builds (present and absolute with the variable; absent without it) and pinned by a test that also asserts idempotence and that no host is hardcoded. `[observed]`
- [x] **RC6.6 Final bundle sizes, against the baseline.** Entry chunk **488,768 B / 156,364 B gzip** (the file `488.77 kB` / `156.36 kB gzip` in the build log — a build log's `kB` is 1000-based, `ls` is Ki-1024, which is why the two numbers for one file differ). Against the recorded baseline of **528,055 B / 167,078 B gzip** (A7, before the landing/shell split) that is **−39.3 kB raw and −10.7 kB gzip (−7.4% raw)**; against the original **534.6 kB** figure named in the brief it is **−45.8 kB, −8.6%**. CSS `62,016 B / 11,653 B gzip`. Precache **4,156.66 KiB / 111 entries** — 795 KiB under the pre-A7 figure (4,951.75 KiB / 114), and 6.2 KiB *above* A7's own 4,150.45 KiB/110, because the paid-value and trust work (B1–C2) added routes and content that the offline contract requires. `[observed]`
- [ ] **RC6.7 Two things this pass verified by reading rather than by running, listed so nobody assumes otherwise.** (a) The canonical link is never asserted by a test, so a regression there would be invisible — worth one assertion in `e2e/landingHero.spec.ts`. (b) The Worker was never deployed by this pass and nothing ran against the deployed Worker: every worker-side claim above is a local route test or a code read, and the e2e suite talks to the harness's mocked Worker, not the real one. `[observed]`

### RC7 — the browser suite on the frozen tree, and the two traps it exposed

- [x] **RC7.1 The browser suite, re-run on the final tree: 142 passed / 2 skipped / 0 failed (15.8 m).** `npx playwright test --reporter=line`, single worker, Chromium, service workers blocked by design; the two skips are the paywall-parity cases that need a signed-in account. This is the full 144-test run over the committed tree (including the `og:url` fix and the `check:launch:strict` flag change), which supersedes RC6.2's "a suite run across a source edit plus targeted re-runs": **one clean run of the final commit** now exists. `[observed]`
- [x] **RC7.2 The first run of this pass was INVALID, and the reason is a trap worth recording.** It opened **10 failures by test 52** — every one of them an AI-turn spec waiting for a reply that never came, plus a stream of `404` console errors — and **none of them was an app defect**. A `vite preview --port 3000 --strictPort` server left running from this pass's own earlier PWA verification still held port 3000, and `reuseExistingServer` is **true** for the default (dev) target, so Playwright adopted a *production bundle* as if it were the dev server. That bundle had been built with no `VITE_WORKER_URL`, so `WORKER_URL_MISSING` failed every turn before any fetch — precisely the failure mode `playwright.config.ts` documents from the other side ("27/37 that way, 37/37 with the origin set"). Killing the stray server and re-running turned 10 failures into 0 with no source change. **The lesson for the next operator: a green `npx playwright test` is only valid if the process serving :3000 is the one Playwright started (or a dev server it was meant to reuse) — check the listener before believing a red run, and never trust a suite run that started while a preview server was up.** `[observed]`
- [x] **RC7.3 `npm run verify:ci` exits 1 on a tree where every step it runs passes — its own heuristic, reported not worked around.** The three steps labelled `FLAKY` (**unit suite + guards**, **production build**, **quiz content audit**) each exited **0**; the runner classifies a passing step with more than 50 lines of output and no `^Error:` line as flaky, then **pushes it into `failures` anyway** (`scripts/verify.mjs`, the `else if (isStepFlaky)` branch — whose own comment reads "Flag flaky output but don't kill the gate"). Run directly on this tree: `npm test` **1941 passed / 0 failed**, `npm run build` **exit 0**, `node scripts/audit-quiz-content.mjs` **exit 0**. **Not fixed here, deliberately:** `scripts/verify.mjs` is untracked work belonging to another author's in-flight tooling (with `tests/verifyScript.test.ts` pinning the current `isFlaky` behaviour), and changing what their gate reports is theirs to decide — the one-line change is to record `ok && isStepFlaky` as a note rather than a failure. Everything the wrapper *does* run is green. `[observed]`
- [x] **RC7.4 The strict gate now runs wherever it is invoked.** `check:launch:strict` is `node scripts/check-launch.mjs --strict` in the committed `package.json` (RC4.5 recorded the script change; the npm line itself was left uncommitted then because the file carries another author's work, and is committed now on its own: **`6964623`**). Re-measured with a captured exit status: `npm run check:launch:strict` → **exit 1** (10 `{{OWNER_FILL}}` legal fields, 2 shipped placeholder strings, `VITE_PUBLIC_APP_URL` unset), `npm run check:launch` → **exit 0**. `[observed]`

### Owner inputs surfaced by the work

- **Daily AI budget in USD** — required to set `AI_DAILY_SPEND_CAP` meaningfully. Formula (now documented in wrangler.toml): `cap = daily AI budget (USD) ÷ cost per turn (USD)`, where cost per turn = `estimateTurnCostUsd({ tier, inputTokens, outputTokens })`. The shipped `292` assumes ~$1.00/day across ~5 users at the flagship price and stays UNPROVEN until the owner picks the budget. `[unknown]`
- **Refund/trust text** — `REFUND_TEXT` and 10 legal fields; the new `{{` guard now reports them in `npm run check:launch` and fails `check:launch:strict`.
- **Public app URL** — `VITE_PUBLIC_APP_URL` (build) / `PUBLIC_APP_URL` (worker) is now OPTIONAL for A6 (the helper degrades honestly without it). It is still required for an absolute `og:image` and for the `VITE_PLAY_BUILD=1` gate.
- **Android package name + cert SHA-256** — for a Play build (gate now exists).
