# Katzu — Full Product Specification

> **Status:** living specification document · **Last updated:** 2026-09-25
> **Product owner:** غيدق علوش (Ghaidak Alloush) · ghaidak.com
> **Repository:** `ghaidak077/katzu-webapp-v3` (branch `main`)
> **Purpose:** the single, complete reference for what Katzu is, how it is built, and every
> decision needed to change it later. It summarizes the whole app without omitting a surface.
> Where a fact lives in the code, the owning file is named so it can be verified.

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [Target users & jobs to be done](#2-target-users--jobs-to-be-done)
3. [Product principles (the "Rules")](#3-product-principles-the-rules)
4. [Tech stack](#4-tech-stack)
5. [System architecture](#5-system-architecture)
6. [Repository & file tree](#6-repository--file-tree)
7. [Client routing](#7-client-routing)
8. [Screens (client)](#8-screens-client)
9. [Design system & components](#9-design-system--components)
10. [Local data layer (Dexie / IndexedDB)](#10-local-data-layer-dexie--indexeddb)
11. [Client utilities](#11-client-utilities)
12. [API client (`workerClient`)](#12-api-client-workerclient)
13. [Voice: speech-to-text & text-to-speech](#13-voice-speech-to-text--text-to-speech)
14. [Offline & PWA](#14-offline--pwa)
15. [Backend Worker: request pipeline](#15-backend-worker-request-pipeline)
16. [Backend Worker: full endpoint reference](#16-backend-worker-full-endpoint-reference)
17. [Auth, sessions & identity](#17-auth-sessions--identity)
18. [AI engine](#18-ai-engine)
19. [Hints (multi-move)](#19-hints-multi-move)
20. [Content (D1 curriculum CMS)](#20-content-d1-curriculum-cms)
21. [Admin control plane](#21-admin-control-plane)
22. [Billing — Dodo Payments (dormant)](#22-billing--dodo-payments-dormant)
23. [Crypto sales — NOWPayments](#23-crypto-sales--nowpayments)
24. [Server data model (D1 + KV)](#24-server-data-model-d1--kv)
25. [Feature catalogue (detailed)](#25-feature-catalogue-detailed)
26. [Monetization & the sales site](#26-monetization--the-sales-site)
27. [Environment, secrets & bindings](#27-environment-secrets--bindings)
28. [Deployment & CI/CD](#28-deployment--cicd)
29. [Testing & verification scripts](#29-testing--verification-scripts)
30. [Legal & compliance](#30-legal--compliance)
31. [Known gaps, risks & roadmap](#31-known-gaps-risks--roadmap)
32. [Open decisions](#32-open-decisions)
33. [Appendix A — conventions & glossary](#appendix-a--conventions--glossary)
34. [Appendix B — developer quick reference](#appendix-b--developer-quick-reference)

---

## 1. Product overview

**Katzu is an Arabic-first German conversation-practice app.** It teaches Arabic speakers to
speak and understand German in the real situations that follow a move to Germany — an embassy
appointment, ordering at a café, a job interview, visiting a doctor, viewing an apartment —
with a witty, deadpan "cat" tutor persona ("كَاتْزُو" / Katzu) that roasts German grammar,
never the learner.

- **Platform today:** a **web app / installable PWA** (`react + vite`, `vite-plugin-pwa`).
  A native Android build is referenced historically but lives in a separate repo; the web app
  is the live product.
- **Language model:** Arabic-first UI (RTL, Egyptian/MSA-leaning copy), German is the target
  language, English is a secondary translation field on content rows.
- **Core loop:** choose a scenario → study the phrases/vocabulary → pass a quick quiz →
  hold a live spoken (or typed) conversation with the AI persona → get an honest report,
  mistakes bank, and progress.
- **Business model:** a **free tier** (3 server-counted AI conversation sessions, A1 only)
  plus a single paid plan, **Katzu Pro**, sold as a **one-off activation code** (default
  `5 USD / 1 month`) on a **separate sales site** (`katzu-sales`). The app never takes a
  payment — it only redeems codes.

### Live properties

| Property | URL | Hosting | Notes |
|---|---|---|---|
| Web app (PWA) | `https://katzu-webapp-v3.pages.dev` | Cloudflare Pages | Git-connected to `main`: push → auto build & deploy |
| API / Worker | `https://katzu-test.ghaidakalosh008.workers.dev` | Cloudflare Workers | Worker name `katzu-test` |
| Sales site | `https://katzu-sales.pages.dev` | Cloudflare Pages | Project `katzu-sales`, **not** git-connected — manual `wrangler pages deploy` |
| Intended custom domain | `https://katzu.app` | *not attached yet* | Advertised by `robots.txt` / `sitemap.xml`; does not resolve today |

### What "done" looks like for a learner

Sign in with Google → pick a goal/mission → study → quiz → speak → see an honest report that
separates unaided performance from hint-assisted performance → build a daily streak and XP
rank → review saved words and past mistakes → optionally buy Pro to unlock all CEFR levels and
unlimited conversations.

---

## 2. Target users & jobs to be done

**Primary persona — "أمين, 27, pre-arrival in Syria/Levant".** Planning to move to Germany for
work, study, or family. Learned some German from an app but freezes when a real person speaks.
Wants practice that feels like the real situation, in Arabic explanations, without being judged.

**Secondary personas**
- **Post-arrival learner** who needs functional German now (Anmeldung, doctor, landlord).
- **Working professional / Ausbildung candidate** preparing for interviews (Track reference
  in the roadmap; today `job_interview` exists).
- **University-bound student** (roadmap track; not built).

**Jobs to be done (JTBD)**
1. "Let me *speak* German for real, not tap flashcards."
2. "Explain my mistakes in Arabic so I actually understand the rule."
3. "Show me the exact situations I'll face, with the phrases I'll need."
4. "Be honest about my progress — don't inflate it."
5. "Give me a small daily habit I can keep."
6. "Don't waste my money/time if nothing works."

**Explicit non-goals**
- Not a replacement for a lawyer, doctor, government office, or immigration advisor (stated in
  the terms and in scenario copy).
- Not a grammar reference book; grammar exists only as support for the scenarios.
- Not a marketplace or social network.

---

## 3. Product principles (the "Rules")

The codebase references a numbered rule set in comments (e.g. `Rule 3`, `Rule 5`, `Rule 7`,
`Rule 8`, `Rule 9` in `LiveConversationScreen.tsx`, `QuizScreen.tsx`, `GermanText.tsx`). These
are the product's design contract:

| Rule | Principle | Where it lives |
|---|---|---|
| **3** | **No German learning content is hardcoded in the client.** Content always comes from D1 (or the offline Dexie cache); the app generates quizzes/hints from real rows. | `quizGenerator.ts` header: *"No German-learning content is ever hardcoded in the client (rule 3)."* |
| **5** | **Exactly ONE `/ai/turn` call per learner turn.** Hints are embedded in the turn response (no extra round-trip); cached starter phrases are the zero-call hint floor for turn 0. | `LiveConversationScreen.tsx` `handleSendMessage` |
| **6** | **Session accuracy is computed strictly on independent (non-hint-assisted) sentences.** Assisted sentences never inflate accuracy. | `report/metrics.ts`, `LiveConversationScreen.finishSession` |
| **7** | **Each session has a dynamic turn target based on CEFR + mode**, and completion triggers the celebration → report flow. | `LiveConversationScreen` `targetTurns` |
| **8** | **German text is always LTR-isolated (`<bdi dir="ltr">`) with German typography**, so umlauts/articles/punctuation never reorder inside the RTL Arabic layout. | `GermanText.tsx`, `index.css` `.german-text` |
| **9** | **Honest, actionable remediation:** mistake re-type drills, level promotion only when earned (≥75% avg over 3 sessions). | `SessionReportScreen.tsx`, `PracticeScreen.tsx`, `metrics.ts` |

**Honesty commitments** (called out repeatedly in docs and code):
- A missed day resets the streak to 1; same-day repeats never double-count.
- Accuracy is `—` (not 0, not 100) when there are no independent sentences.
- Trial/quota and Pro gates are enforced **server-side**; the browser never decides entitlement.

---

## 4. Tech stack

### 4.1 Frontend (the PWA)

| Concern | Choice | Version | Notes |
|---|---|---|---|
| Framework | **React** | 18.3 | `react`, `react-dom`; StrictMode in `main.tsx` |
| Language | **TypeScript** | 5.7 | `strict: true`, `noEmit`; `@/*` → `./src/*` |
| Build | **Vite** | 6.2 | `@vitejs/plugin-react`; alias `@` → `src` |
| CSS | **Tailwind CSS** | 3.4 | postcss + autoprefixer; custom theme tokens in `tailwind.config.js` |
| Routing | **React Router** | 7.3 | `BrowserRouter`, `Routes`, nested route wrapper components in `App.tsx` |
| Local DB | **Dexie** (IndexedDB) | 4.0 | `dexie`, `dexie-react-hooks` (`useLiveQuery`); schema v1→v3 |
| Icons | **lucide-react** | 1.16 | used in 19 files |
| Class utils | **clsx + tailwind-merge** | — | `cn()` exported from `components/ui/Button.tsx` |
| Celebration | **canvas-confetti** | 1.9 | redemption success + session report |
| PWA | **vite-plugin-pwa** | 0.21 | `generateSW` (Workbox), manifest, runtime caching |
| Tests | **Vitest** | 5.0 | node environment; 24 files / 220 tests |
| Declared but unused today | `@tanstack/react-query`, `zod`, `workbox-window` | — | present in `package.json`; **no imports in `src/`** — do not assume they are wired up |

### 4.2 Backend (the Worker)

| Concern | Choice |
|---|---|
| Runtime | **Cloudflare Workers** (single unified worker) |
| Entry | `cloudflare-unified-worker.js` (~4,115 lines) |
| Modules | `cloudflare-admin.js` (1,862), `cloudflare-ai-router.js` (provider pool + day-quota ledger + shared cache), `cloudflare-ai-chat.js` (turn + translation), `cloudflare-hints.js` (203), `cloudflare-writing.js`, `cloudflare-dodo.js` (802), `cloudflare-crypto.js` (711) |
| Database | **Cloudflare D1** (`katzu-content`) — curriculum + ledgers + registry |
| KV | `USER_PROGRESS` (state/quota/sessions) + `REDEEMED_CODES` (codes/accounts/referrals) |
| AI (primary) | **Multi-provider pool** — Gemini, Groq, OpenRouter, NVIDIA NIM (`cloudflare-ai-router.js`): tiered rotation within a tier, then across tiers, with a terminal day-quota ledger |
| AI (fallback) | **Cloudflare Workers AI** (`@cf/qwen/qwen3-30b-a3b-fp8`) via the `AI` binding |
| Payments (live path) | **NOWPayments** (crypto) — sales site only |
| Payments (dormant) | **Dodo Payments** — module retained, unconfigured, nothing calls it |
| Config | `wrangler.toml` |

### 4.3 Tooling

- **Package manager:** `npm` (`package-lock.json`; no bun/yarn lock).
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) — install → typecheck → worker syntax →
  tests → build.
- **Deploy tooling:** `wrangler` 4.x for the Worker and the sales site; Cloudflare Pages
  git-integration for the app.
- **Node:** 20+ required.

---

## 5. System architecture

```
                                 ┌────────────────────────────────────────────┐
        ┌──────────────┐         │  Cloudflare Pages: katzu-webapp-v3         │
        │   Learner    │◄───────►│  React 18 + Vite PWA (dist/)               │
        │ (browser /   │         │  • Dexie (IndexedDB) offline cache         │
        │  installed   │         │  • Google Identity Services (GIS) sign-in  │
        │  PWA)        │         │  • Web Speech API (STT de-DE, TTS de-DE)   │
        └──────┬───────┘         └───────────────┬────────────────────────────┘
               │                                 │ Authorization: Bearer sess_…
               │  (only: sign-in, redeeming a code, buying a code)
               │                                 ▼
               │              ┌──────────────────────────────────────────────┐
               │              │  Cloudflare Worker: katzu-test                │
               └─────────────►│  cloudflare-unified-worker.js                 │
                              │   ├─ cloudflare-admin.js   (registry+CMS)     │
                              │   ├─ cloudflare-hints.js   (/ai/hints)        │
                              │   ├─ cloudflare-crypto.js  (/crypto/*)        │
                              │   ├─ cloudflare-dodo.js    (/billing/*, off)  │
                              │   └─ cloudflare-worker-ai-module.js (fallback)│
                              └───┬─────────┬─────────┬──────────┬────────────┘
                                  │         │         │          │
                        ┌─────────▼──┐ ┌────▼─────┐ ┌─▼──────┐ ┌─▼──────────────┐
                        │ D1         │ │ KV       │ │ KV     │ │ Gemini API     │
                        │katzu-content│ │USER_     │ │REDEEMED│ │ (+ Workers AI  │
                        │ (content + │ │PROGRESS  │ │_CODES  │ │   fallback)    │
                        │  ledgers + │ │          │ │        │ │                │
                        │  registry) │ │          │ │        │ │                │
                        └────────────┘ └──────────┘ └────────┘ └────────────────┘

        ┌─────────────────────────────┐        ┌──────────────────────────────────┐
        │ Cloudflare Pages: katzu-sales│        │ NOWPayments (crypto PSP)         │
        │ static Arabic sales site     │───────►│  POST /crypto/checkout → invoice │
        │ (index/success/sales.js ...) │◄───────│  IPN → POST /crypto/webhook      │
        └─────────────────────────────┘        └──────────────────────────────────┘
                (sells a CODE; never talks to the app; the app never talks to it)
```

**Key architectural boundaries**

- **Two separate web properties.** `katzu-webapp-v3` (the app) and `katzu-sales` (the store)
  are distinct Cloudflare Pages projects. They share only the Worker as backend. The app has
  **no checkout UI** and never calls `/crypto/*` or `/billing/*`; the sales site never calls
  the app's authenticated endpoints. The only bridge is the **activation code** the buyer
  pastes into the app's redemption screen.
- **The Worker is the single trust boundary.** Entitlement (free vs Pro), trial quota, rate
  limits, code redemption, and deletion authority all live server-side.
- **Offline-first client.** Curriculum and progress are cached in IndexedDB; the app works
  offline for study/review and degrades honestly for AI features.

---

## 6. Repository & file tree

```
katzu-webapp-v3/
├── .github/workflows/ci.yml          # CI: install → typecheck → worker syntax → tests → build
├── .env.example                      # the env-var contract (no secrets)
├── .gitignore                        # ignores node_modules, dist, .env*, .wrangler/, .vitest/, .claude/
├── DEPLOY.md                         # end-to-end deploy & verification runbook (Worker, D1/KV, billing, crypto, Pages)
├── README.md                         # project intro + local dev + verification
├── index.html                        # Vite HTML shell (lang="ar" dir="rtl", OG/Twitter meta, noscript)
├── metadata.json                     # app metadata: name, description, microphone permission, server-side Gemini capability
├── package.json / package-lock.json  # npm scripts & dependency lock
├── postcss.config.js                 # tailwind + autoprefixer
├── tailwind.config.js                # design tokens (colors, fonts, shadows)
├── tsconfig.json                     # strict TS, @/* path alias, includes src
├── vite.config.ts                    # React + VitePWA (manifest, Workbox runtime caching), @ alias, dev server
├── vitest.config.ts                  # node env, globals, @ alias
├── wrangler.toml                     # Worker bindings (D1/KV/AI) + non-secret vars
│
├── cloudflare-unified-worker.js      # MAIN Worker entry: auth, AI engine, verify, progress, content, routing
├── cloudflare-admin.js               # Admin dashboard HTML + registry/telemetry + /admin/api/* + content CRUD
├── cloudflare-hints.js               # Multi-move hints handler (selectDistinctHints + handleHintsRoute)
├── cloudflare-crypto.js              # NOWPayments: checkout, webhook (HMAC-SHA512), order, health
├── cloudflare-dodo.js                # Dodo Payments module (dormant/unused; retained)
├── cloudflare-worker-ai-module.js    # Workers AI fallback inference
│
├── public/                           # static assets copied verbatim into the build
│   ├── _headers                      # CSP + security headers for the Pages deployment
│   ├── legal.css                     # styling for the legal pages
│   ├── privacy.html                  # hosted privacy policy (/privacy)
│   ├── terms.html                    # hosted terms of use (/terms)
│   ├── robots.txt                    # allow-all + sitemap pointer (advertises katzu.app)
│   ├── sitemap.xml                   # /, /privacy, /terms (advertises katzu.app)
│   └── assets/
│       ├── fonts/                    # cairo.ttf, satoshi_{regular,medium,bold}.ttf
│       └── mascot/*.png              # Katzu mascot stickers + user_avatar.jpg
│
├── src/
│   ├── main.tsx                      # React root: ErrorBoundary + NetworkStatusBanner + App; installs diagnostics capture
│   ├── App.tsx                       # BrowserRouter, all routes, auth gate, bottom tab bar, sign-out
│   ├── index.css                     # font-face, Tailwind directives, base body styles, scrollbars, .german-text
│   ├── types/models.ts               # all TypeScript domain models
│   ├── lib/
│   │   ├── api/workerClient.ts       # the single HTTP client to the Worker (auth, AI, verify, progress…)
│   │   ├── db/katzuDb.ts             # Dexie schema v1–v3, seeds, wipeUserScopedData
│   │   ├── speech/useSpeechInput.ts  # Web Speech STT (de-DE) with zombie-recognizer watchdog
│   │   ├── speech/useSpeechOutput.ts # Web Speech TTS (de-DE) with voice discovery + gesture priming
│   │   └── utils/
│   │       ├── checkIn.ts            # welcome-back greeting logic (tones)
│   │       ├── dailyMission.ts       # deterministic daily-mission rotation
│   │       ├── diagnostics.ts        # in-memory ring buffer + global capture + export
│   │       ├── haptics.ts            # vibration + German bidi isolation helper
│   │       ├── hintIntents.ts        # Arabic labels for hint intents
│   │       ├── links.ts              # SALES_URL, PRO_PRICE_LABEL
│   │       ├── quizGenerator.ts      # build quiz questions from D1 rows (collision-safe)
│   │       ├── scenarioVocab.ts      # scenario category → vocabulary topic mapping
│   │       ├── streak.ts             # pure streak logic
│   │       ├── subscription.ts       # isProEffective (expiry-aware)
│   │       └── xpMilestones.ts       # XP → rank ladder
│   ├── components/
│   │   ├── common/                   # AudioWaveform, ErrorBoundary, GermanText, HintOption, KatzuMascot, NetworkStatusBanner
│   │   ├── sheets/                   # GoalSelectionBottomSheet, PaywallModal, WordInsightBottomSheet
│   │   └── ui/                       # Badge, BottomSheet, Button (cn), Card, Modal
│   └── features/
│       ├── auth/                     # WelcomeScreen, SignInScreen, SubscriptionRedemptionScreen
│       ├── trail/                    # TrailScreen
│       ├── study/                    # ScenarioDetailScreen, StudyScreen
│       ├── quiz/                     # QuizScreen
│       ├── conversation/             # LiveConversationScreen
│       ├── report/                   # SessionReportScreen, metrics.ts
│       ├── practice/                 # PracticeScreen
│       ├── progress/                 # ProgressScreen
│       └── settings/                 # ProfileSettingsScreen, TrustInfoScreen
│
├── sales/                            # the SEPARATE sales site (own Pages project)
│   ├── index.html                    # landing: pitch, $5 price, crypto checkout, local-Syria payment, FAQ, recovery
│   ├── success.html                  # post-payment: polls the worker and reveals the activation code
│   ├── sales.js                      # landing script: CONFIG + crypto checkout + config wiring
│   ├── success.js                    # success-page script: polling + code reveal
│   ├── sales.css                     # AMOLED/M3 RTL styling shared by both pages
│   ├── _headers                      # strict CSP (`script-src 'self'`) + cache rules
│   └── README.md                     # sales-site deployment & config notes
│
├── scripts/
│   ├── audit-quiz-content.mjs        # read-only live audit: quiz mismatches & coverage gaps
│   ├── fix-quiz-content.mjs          # apply guarded gloss corrections to live D1 (dry-run by default)
│   ├── backfill-user-registry.mjs    # seed D1 `users` from KV email_index/account keys (gated, not yet run in prod)
│   ├── capture-admin-screenshots.mjs # refresh docs/screenshots/*.png from the live dashboard
│   ├── smoke-token-hygiene.cjs       # headless-Chromium token-hygiene smoke tests on the deployed app
│   ├── verification-battery.cjs      # combined verification runner
│   ├── verify-admin-live.mjs         # live admin control-plane checks
│   ├── verify-crypto-live.mjs        # live crypto round-trip (invoice → signed IPN → code)
│   └── verify-dodo-live.mjs          # live Dodo round-trip (dormant)
│
├── tests/                            # 24 Vitest files / 220 tests
│   ├── accountOps.test.ts            # export + deletion completeness, cross-account privacy
│   ├── adminContent.test.ts          # rowid-keyed content-update + column/level guards
│   ├── adminRegistry.test.ts         # registry tables, sanitizer, stats
│   ├── backfill.test.ts              # registry backfill SQL generation
│   ├── checkIn.test.ts               # welcome-back tones
│   ├── cryptoPayments.test.ts        # signed IPN → code → /verify redeems (24 assertions)
│   ├── dailyMission.test.ts          # deterministic rotation
│   ├── dodoBilling.test.ts           # Dodo event classification & application (dormant path)
│   ├── hints.test.ts                 # distinct moves, dedupe, non-Arabic rejection, cache, auth-first
│   ├── metrics.test.ts               # independent accuracy + promotion eligibility
│   ├── proStatus.test.ts             # isProEffective expiry logic
│   ├── progress.test.ts              # progress merge/sync
│   ├── quizGenerator.test.ts         # prompts, optionsCollide, drop-when-<4-options
│   ├── referral.test.ts              # referral claim/payout rules
│   ├── scenarioVocab.test.ts         # scenario→topic mapping
│   ├── streak.test.ts                # extend / same-day / reset / future-date
│   ├── subscription.test.ts          # redemption reasons → Arabic, status parsing
│   ├── sync.test.ts                  # payload merge & queue retry
│   ├── tokenHygiene.test.ts          # no idToken persisted; header-only transport
│   ├── trial.test.ts                 # free-quota enforcement (3 sessions, A1-only)
│   ├── workerClient.test.ts          # client HTTP behavior/error mapping
│   ├── workerSecurity.test.ts        # TEST_MODE guard, CORS fail-closed, bounded AI inputs
│   ├── workersAiFallback.test.ts     # fallback engagement & metrics
│   └── xpMilestones.test.ts          # rank ladder + progress %
│
└── docs/
    ├── PRODUCT-SPEC.md               # ← this document
    ├── current-state.md              # Phase-0 baseline facts
    ├── IMPLEMENTATION_PLAN.md        # audit findings + phased plan
    ├── launch-gate.md                # gate checklist with live status
    ├── LAUNCH-CHECKLIST.md           # owner actions separated from code work
    ├── product-gaps.md               # product gaps (G1–G10)
    ├── security-gaps.md              # security gaps (S1–S11)
    ├── verification-report.md        # verification evidence
    ├── pass-quiz-training-hints.md   # the quiz/training/hints/sales-link pass
    └── screenshots/                  # admin dashboard PNGs (overview/users/activity/errors)
```

---

## 7. Client routing

All routes are declared in `src/App.tsx`. **Every learning surface sits behind the sign-in
gate**; only `/welcome` and `/signin` are public (`isPublicPath`).

| Path | Element | Auth | Purpose |
|---|---|---|---|
| `/` | redirect → `/app/trail` | gated | Entry |
| `/welcome` | `WelcomeScreen` | **public** | First-run: name + goal sheet → sign-up |
| `/signin` | `SignInScreen` (`?mode=signup`) | **public** | Google sign-in / sign-up, level picker |
| `/subscription` | `SubscriptionRedemptionScreen` | gated | Redeem an activation code / buy one / claim referral |
| `/app` | redirect → `/app/trail` | gated | — |
| `/app/:tab` | `MainTabsRoute` | gated | Tabs: `trail` \| `practice` \| `progress` \| `profile` |
| `/main`, `/main/:tab` | `MainTabsRoute` | gated | Legacy aliases of `/app/*` |
| `/scenario/:scenarioId` | `ScenarioDetailScreen` | gated | Scenario hub + Study→Quiz→Conversation on-ramp |
| `/scenario/:scenarioId/study` | `StudyScreen` | gated | Phrase / vocab / grammar study |
| `/scenario/:scenarioId/quiz` | `QuizScreen` | gated | Multiple-choice comprehension quiz |
| `/scenario/:scenarioId/live` | `LiveConversationScreen` | gated | The AI conversation (the core) |
| `/session-report` | `SessionReportScreen` | gated | Honest post-session report + mistake drill |
| `/trust/:page` | `TrustInfoScreen` | gated | In-app privacy / terms / support (`page` ∈ privacy\|terms\|contact) |
| `*` | redirect → `/app/trail` (authed) or `/welcome` | — | Catch-all |

**Auth gate behavior (`AppRoutes`)**
- On mount: `initializeDatabaseSeed()` then `workerClient.fetchScenarios/Vocabulary/Grammar()`.
- Until the Dexie `users` row resolves, a lightweight "جاري التحقق من الحساب…" status screen shows.
- Signed-out + non-public path → `/signin` (or `/welcome` when onboarding is unfinished, tracked in
  `localStorage['katzu_onboarding_completed']`).
- The bottom tab bar (`Trail / Practice / Progress / Profile`) renders only inside `MainTabsRoute`
  and is `max-w-md` centred (mobile-first, single-column).

**Notable client-side state keys**
- `sessionStorage['katzu_session_summary']` — the latest session summary passed to the report.
- `localStorage['katzu_onboarding_completed']` — onboarding flag.
- `localStorage['katzu_sales_orders_v1']` — sales-site order book (sales property only).

---

## 8. Screens (client)

Each screen is Arabic-first, `max-w-md`, dark ("AMOLED black") and lives in `src/features/*`.

### 8.1 `WelcomeScreen` — first run (`features/auth/WelcomeScreen.tsx`)
- Brand badge ("Katzu AI • رفيقك الذكي"), welcome mascot, headline **"تحدث الألمانية بدون خوف"**.
- Name input (required) → opens `GoalSelectionBottomSheet` → saves name, `dailyGoalMinutes`,
  `weeklyGoalDays`, `cefrLevel` into the Dexie user row → `onGoToSignIn('signup')`.
- Secondary white "المتابعة باستخدام Google" button; sign-in / sign-up text links; attribution footer.

### 8.2 `SignInScreen` — Google identity (`features/auth/SignInScreen.tsx`)
- Tab switcher (sign-in vs sign-up) that also re-renders the GIS button (`signin_with`/`signup_with`, `locale: 'ar'`).
- **Target CEFR picker** (A1–B2).
- Loads `https://accounts.google.com/gsi/client`, initializes with `VITE_GOOGLE_CLIENT_ID`,
  renders the official button + a fallback prompt button.
- **`completeUserAuth`** decodes the JWT **only to read email/name**, then:
  1. `workerClient.exchangeGoogleToken(idToken)` → opaque `sess_…` session token;
  2. if exchange fails, sign-in fails **honestly** (no raw-token fallback);
  3. writes `sessionToken` to Dexie (never the `idToken`), sets `isLoggedIn`;
  4. `checkSubscriptionStatus` syncs the Pro flag (server is authoritative; stale local flag cleared);
  5. `restoreProgress` merges cloud progress.
- **Missing-config state:** if `VITE_GOOGLE_CLIENT_ID` is absent, a dedicated configuration screen
  explains the required env var (and offers a preview-guest path in that build).
- Security footer ("حسابك وبياناتك محمية ومشفرة").

### 8.3 `SubscriptionRedemptionScreen` — Pro + referral (`features/auth/SubscriptionRedemptionScreen.tsx`)
- Pro benefit list; connected-account chip (`user.email` + "Google ✓").
- **Referral claim card** (`REF-XXXXXXXX`, only while not Pro) → `claimReferral`.
- **Buy card** linking to the **sales site** (`SALES_URL`) with `PRO_PRICE_LABEL` and a note that
  the app itself takes no payment; the machine-readable URL is shown.
- **Activation code card** (`DE-6M-…` placeholder) → `verifyCode`; success fires confetti, writes
  `isSubscriptionActive`/`subscriptionExpiresAt` and a local `redeemed_codes` row, then redirects.
- Error mapping is Arabic via `mapRedemptionReasonToArabic` (`missing_id_token`, `invalid_id_token`,
  `malformed`, `invalid_signature`, `already_redeemed`).

### 8.4 `TrailScreen` — home / curriculum (`features/trail/TrailScreen.tsx`)
- Header: mascot, display name, streak ("N أيام حماس"), XP rank name; Pro badge or "اكتشف مزايا Pro".
- **Katzu daily check-in card**: `buildCheckInMessage` picks one of four tones
  (`first`, `returning`, `streak-keep`, `welcome-back`) from the real `lastActiveDate`/`streakDays`,
  plus the XP progress bar to the next rank (`getXpRank`).
- **Daily mission hero card**: `pickDailyMission` deterministically rotates one scenario per day
  (stable per day/device); "ابدأ مهمة اليوم" opens it.
- **CEFR level pills** A1–B2; non-A1 is Pro-locked (tapping opens the paywall).
- **Vertical trail** of all scenarios; status derived from `scenario_training`
  (`MASTERED` when quiz ≥80, `ACTIVE` when studied, else unlocked); mastered cards glow green.

### 8.5 `ScenarioDetailScreen` — the on-ramp (`features/study/ScenarioDetailScreen.tsx`)
- Scenario host card (German title, Arabic title, persona line).
- **Primary path is Study → Quiz**: the main button reads "ابدأ التدريب: دراسة العبارات" then
  "أكمل التدريب: الاختبار السريع". A clearly **secondary** "تخطَّ التدريب وابدأ المحادثة مباشرة"
  override records `scenario_training.trainingSkippedAt` and goes straight to the conversation.
  The skip **never** bypasses CEFR gating or vocabulary injection.
- Three-step "خطة الإتقان" list (Study / Quiz / Live) with per-step completion ticks.
- Live step is unlocked only when quiz ≥60 or the skip was recorded; otherwise it shows a lock and a
  prompt. Starter-phrase preview (first 3).

### 8.6 `StudyScreen` — phrases / vocab / grammar (`features/study/StudyScreen.tsx`)
- Tabs: **العبارات / المفردات / القواعد** (auto-opens the fullest tab if phrases are empty).
- TTS playback per item; **0.8x / 1.0x** speed toggle.
- Vocabulary shows article badge (`der`/`die`/`das` colour-coded), Arabic gloss, example, and a
  bookmark toggle (`saved_words`).
- Grammar cards render Arabic explanation + German example + Arabic example.
- "انتقل للاختبار السريع (كويز)" writes `studiedAt` and advances.

### 8.7 `QuizScreen` — comprehension (`features/quiz/QuizScreen.tsx`)
- Questions generated by `generateQuizQuestions` from the scenario's **real D1 rows** (vocab → Arabic
  meaning; starter phrases → meaning). The **prompt is always the headword/sentence**; a vocab
  example sentence is shown only as context ("في جملة:"). Ambiguous options are impossible
  (`optionsCollide`); a question with fewer than 4 honest options is dropped.
- One-shot answer with immediate correct/incorrect colouring + "ملاحظة كَاتْزُو" explanation.
- TTS on the prompt.
- **Stale-cache healing:** on mount it re-pulls the scenario detail + topic vocabulary from the
  Worker and `bulkPut`s them, so garbled legacy rows are corrected automatically.
- Completion writes `quizAttempted` + `lastScore` (accuracy %), then CTA to the conversation.

### 8.8 `LiveConversationScreen` — the core (`features/conversation/LiveConversationScreen.tsx`)
- **Mode picker** first: "تمرين سريع" (quick) or "تحدي واقعي مكثف" (immersion).
- Turn target is dynamic (Rule 7): quick = 3/4/5/6 for A1/A2/B1/B2; immersion = 8 (A1–A2) / 10 (B1–B2).
- Sticky header: back, a **CEFR difficulty nudge** (أسهل / أصعب — Pro-only, opens paywall for free users),
  a global **translation toggle** (show/hide Arabic for all messages), and a turn counter.
- Message list: Katzu (left) vs learner (right); **every German word is individually clickable** and
  opens the `WordInsightBottomSheet` when it matches a known vocabulary row.
- **Katzu replies** auto-speak; each carries an Arabic translation and an inviting Arabic follow-up.
- **Correction card** (Rule 6/9): original struck-through, corrected German in green, grammar rule
  chip, Arabic explanation, a positive note, and an optional persona roast.
- **Hints** (Rule 5): a single "💡 اقتراح لردّك" pill reveals one primary suggestion plus an expander
  for the other conversational moves and a ⟳ refresh. Falls back to cached starter phrases, then to
  a fetched set, so the bar is never empty mid-conversation. Using a hint flags the turn
  (`wasHintUsed`) and marks it assist-assisted for accuracy.
- **Error handling:** failed turns show an in-chat error card with "إعادة المحاولة"; network errors
  are normalized to Arabic; a 401 invalidates the stale session and asks for re-sign-in; a
  402/403 (level/quota) opens the paywall.
- **Mic:** STT with Arabic error banners for `not-allowed`, `service-not-allowed`, `network`,
  `no-speech`, `audio-capture`, `language-not-supported`; typing always works.
- **Completion:** at the final turn a celebration card shows, then `finishSession` writes the session,
  XP, streak, and syncs progress, and hands a summary to `/session-report`.

### 8.9 `SessionReportScreen` — honest report (`features/report/SessionReportScreen.tsx`)
- Confetti + celebration header.
- Metrics grid (Rule 6): **independent accuracy** (`—` when no independent sentences) and sentence
  count split into independent vs hint-assisted.
- **Level promotion card** appears only when eligible (Rule 9: 3 most recent same-level sessions,
  each ≥4 independent sentences, average accuracy ≥75%); the learner opts in.
- **Mistake re-type drill**: retype the corrected sentence (flexible match, trailing dot ignored) to
  mark it mastered (`mistakes.isMastered`), with TTS of the correct form.

### 8.10 `PracticeScreen` — review hub (`features/practice/PracticeScreen.tsx`)
- Metric cards: total vocab / saved / error-bank counts.
- Quick actions: **Flashcards** (flip cards over the full vocabulary, progress counter), **Grammar
  summary**, **Error bank** (re-type drill, marks mastered).
- Search (German or Arabic) + category filter (الكل / المحفوظة) over the vocabulary list, with
  bookmark and TTS per row.

### 8.11 `ProgressScreen` — stats (`features/progress/ProgressScreen.tsx`)
- Streak hero card (0 when there is no activity).
- **7-day activity heat-map** (weekday-labelled, based on session timestamps).
- Metrics: average accuracy, total sentences, total speaking minutes.
- **Share card** modal (level / streak / XP) using the Web Share API when available.

### 8.12 `ProfileSettingsScreen` — account & settings (`features/settings/ProfileSettingsScreen.tsx`)
- Profile banner (editable display name, connected Google account, plan badge).
- Pro upgrade card (when free).
- **Referral card**: `REF-…` code with share/copy, verified/pending counts, total reward months.
- **Diagnostics log**: expandable, copy / download / clear (secrets & message content never logged).
- **Speech speed** (1.0x / 0.8x) and **sarcasm level** (GENTLE / SASSY / DEADPAN) settings.
- Trust links (privacy / terms / support) + version + attribution.
- Sign out (revokes the server session and wipes user-scoped local data).
- **Data export** (`/user/export` → `katzu-data-export.json`).
- **Account deletion**: irreversible warning → type `حذف` to confirm → `/user/delete` → local wipe.

### 8.13 `TrustInfoScreen` — in-app legal (`features/settings/TrustInfoScreen.tsx`)
- Three pages (privacy / terms / contact) with Arabic summaries that link to the hosted
  `/privacy` / `/terms` full text and a `mailto:` support button.

---

## 9. Design system & components

### 9.1 Design tokens (`tailwind.config.js` + `src/index.css`)

**Palette (dark / AMOLED):** background `#000000`; surfaces `#0D0B12` (card), `#16121F` (subtle/raised),
`#221A30` (highest), heroes `#1A132B`/`#261D3D`; primary `#8B6FE8` (pressed `#7659D4`), secondary
`#D5BAFF`, tertiary `#F1B4DC`; status success `#7FD9A8`, learning `#F0C674`, error `#E89B9B`;
text primary `#F2F0F7` / secondary `#A8A3BD` / muted `#6E6887`; borders `#2E2640` / active purple.

**German article colours** (a signature detail): `der` = `#7EA6FF` (blue, masculine),
`die` = `#F5B8E0` (pink, feminine), `das` = `#7FD9A8` (green, neuter).

**Typography:** Arabic = **Cairo** (`font-arabic`); German/Latin = **Satoshi** (`font-german`),
both self-hosted from `public/assets/fonts`.

**Shadows:** `glow-purple`, `glow-purple-lg`, `glow-green`.

**Global CSS:** `@font-face` declarations, Tailwind directives, black body, custom purple scrollbar,
and the `.german-text` LTR-isolation class.

### 9.2 Component inventory

| Component | File | Role |
|---|---|---|
| `Button` | `components/ui/Button.tsx` | variants primary/secondary/outline/ghost/danger; sizes sm/md/lg/icon; `isLoading`; also exports `cn()` |
| `Badge` | `components/ui/Badge.tsx` | variants primary/der/die/das/success/learning/error/subtle |
| `Card` | `components/ui/Card.tsx` | variants card/subtle/hero/elevated + `glow` |
| `Modal` | `components/ui/Modal.tsx` | centred dialog, backdrop, body scroll lock |
| `BottomSheet` | `components/ui/BottomSheet.tsx` | bottom sheet with grab handle (used by sheets) |
| `KatzuMascot` | `components/common/KatzuMascot.tsx` | typed access to 16 mascot stickers (`welcome`, `avatar`, `badge`, `barista`, `celebrating`, `listening`, `peace`, `practice`, `profile_card`, `progress_mascot`, `scenario_host`, `settings_mascot`, `thumbs_up`, `trail_guide`, `trail_header`, `word_insight`) |
| `GermanText` | `components/common/GermanText.tsx` | Rule 8: wraps children in `<bdi dir="ltr" lang="de">` with `font-german` |
| `HintOption` | `components/common/HintOption.tsx` | one hint: intent chip + German + Arabic |
| `AudioWaveform` | `components/common/AudioWaveform.tsx` | animated "speaking" bars |
| `NetworkStatusBanner` | `components/common/NetworkStatusBanner.tsx` | global online/offline banner |
| `ErrorBoundary` | `components/common/ErrorBoundary.tsx` | top-level crash screen with reload |
| `PaywallModal` | `components/sheets/PaywallModal.tsx` | Pro upsell + sales-site link |
| `GoalSelectionBottomSheet` | `components/sheets/GoalSelectionBottomSheet.tsx` | daily minutes / weekly days / CEFR |
| `WordInsightBottomSheet` | `components/sheets/WordInsightBottomSheet.tsx` | in-chat word detail (article, gloss, example, save, TTS) |

---

## 10. Local data layer (Dexie / IndexedDB)

**Database name:** `KatzuWebDB` (`src/lib/db/katzuDb.ts`).

| Table | Key / indexes | Contents |
|---|---|---|
| `scenarios` | `id, category` | Scenario rows (titles, persona, 4 level openers) |
| `starter_phrases` | `id, scenario_id, level, sort_order` | Phrase bank / hint fallback |
| `vocabulary` | `id, level, topic, part_of_speech` | Words with article, plural, examples |
| `grammar` | `id, level` | Grammar rules (Arabic explanation + examples) |
| `saved_words` | `wordId, savedAt` | Bookmarked vocabulary |
| `users` | `id, email` | The single `current_user` row (profile, plan, progress, prefs) |
| `redeemed_codes` | `code, redeemedAt` | Locally redeemed activation codes |
| `sessions` | `id, scenarioId, cefrLevel, timestamp, updatedAt` | Session history |
| `scenario_training` | `scenarioId, userId, updatedAt` | Study/quiz state per scenario |
| `mistakes` | `++id, userId, scenarioId, syncId, timestamp, wasHintUsed, updatedAt` | Error bank |
| `sync_queue` | `++id, createdAt, nextRetryAt` | Offline progress sync queue |

**Schema versions**
- **v1** — Android Room v8 parity (the original 10 tables).
- **v2 (additive upgrade)** — adds sync metadata to `sessions` (`independentSentences`,
  `hintAssistedSentences`, `updatedAt`) and `mistakes` (`syncId`, `updatedAt`), and adds `sync_queue`.
  Existing rows get safe defaults; **no learning data is touched**.
- **v3 (security upgrade)** — strips any legacy `users.idToken`; session tokens are the only stored
  credential. A downgrade below v3 re-persists tokens on next sign-in, so avoid downgrading.

**Seeds / fallback (`initializeDatabaseSeed`)**
- Creates the `current_user` row with defaults (A1, streak 0, `SASSY`, 3 free sessions, 15 min/day, 5 days/week).
- Seeds **local fixture** scenarios (6: cafe, bakery, doctor, apartment, job, train), starter phrases,
  vocabulary, and grammar — used only when the DB is empty (offline first run). Production content is
  owned by D1 and overwrites the cache via `bulkPut`.

**`wipeUserScopedData()`** (on sign-out): clears `sessions`, `mistakes`, `saved_words`,
`scenario_training`, `redeemed_codes`, resets the `current_user` row, and calls
`google.accounts.id.disableAutoSelect()` when available.

---

## 11. Client utilities

| Utility | Responsibility | Key exports |
|---|---|---|
| `streak.ts` | Pure, honest streak math: first activity = 1; same day = unchanged; consecutive day = +1; gap ≥2 days = reset to 1; future/corrupt clock = unchanged (no growth, no punishment) | `localDateKey`, `shiftDateKey`, `recalculateStreak` |
| `checkIn.ts` | Katzu's welcome-back line, tone-selected from real state (`first`/`returning`/`streak-keep`/`welcome-back`) | `buildCheckInMessage` |
| `dailyMission.ts` | Deterministic mission rotation (day-index from an epoch; stable across devices/day) | `dayIndexFor`, `pickDailyMission` |
| `xpMilestones.ts` | XP ladder: `بذرة كَاتْزُو` 0 → `مواء واثق` 250 → `صياد الأُملاوت` 750 → `قاتل Konjunktiv II` 1500 → `مالك حالة الجر (Genitiv)` 3000 → `أسطورة الشارع الألماني` 6000, with %/XP-to-next | `XP_MILESTONES`, `getXpRank` |
| `quizGenerator.ts` | Builds quiz questions from D1 rows; `optionsCollide` (harakat/tatweel-normalized containment) forbids ambiguous options; returns types `vocab`/`phrase` with `germanPrompt`, optional `exampleSentence`/`exampleTranslationAr`, `sourceLevel` | `generateQuizQuestions`, `optionsCollide`, `isUsableTranslationAr` |
| `scenarioVocab.ts` | Maps scenario `category` → vocab `topic` (daily_life→food, official→documents, work→work, health→health, housing→housing) with regex fallbacks | `SCENARIO_CATEGORY_TO_TOPIC`, `scenarioToVocabTopic` |
| `hintIntents.ts` | Arabic labels for the closed hint-intent set | `HINT_INTENT_LABELS`, `hintIntentLabel` |
| `subscription.ts` | Expiry-aware Pro gate (an expired date never keeps Pro powers) | `isProEffective` |
| `diagnostics.ts` | In-memory 400-entry ring buffer capturing `console.error/warn`, `window.onerror`, `unhandledrejection`, and manual events; NETS separate; never logs tokens/content; copy/download/clear | `installDiagnosticsCapture`, `logEvent`, `logNetwork`, `logError`, `formatDiagnosticsText`, `copyDiagnostics`, `downloadDiagnostics`, `clearDiagnostics`, `getDiagnostics`, `subscribeDiagnostics` |
| `haptics.ts` | Vibration patterns + German bidi isolation helper | `triggerHaptic`, `isolateGerman` |
| `links.ts` | External link config | `SALES_URL` (default `https://katzu-sales.pages.dev`, overridable via `VITE_SALES_URL`), `PRO_PRICE_LABEL = '5 دولار / شهر'` |
| `report/metrics.ts` | Independent accuracy + promotion eligibility | `calculateIndependentAccuracy`, `getNextPromotionLevel`, `isEligibleForPromotion` |

---

## 12. API client (`workerClient`)

`src/lib/api/workerClient.ts` is the only HTTP layer. Base URL: `VITE_WORKER_URL` (falls back to `''`).

**Cross-cutting behaviors**
- **One credential transport:** `Authorization: Bearer sess_…` **only**; the body never carries a token.
- **No raw-token fallback:** `getEffectiveAuthToken` returns a session token or `''`
  (an explicitly passed token is accepted only if it starts with `sess_`).
- **30 s timeout** with `AbortController`; network failures normalized into typed Arabic errors
  (`REQUEST_TIMEOUT`, `NETWORK_ERROR`, `WORKER_URL_MISSING`).
- **Error mapping:** 401 → `UNAUTHENTICATED` (invalidates the stale session, asks for re-sign-in),
  402/403 → `PAYWALL_REQUIRED`, 429 → `RATE_LIMIT_EXCEEDED`, 503 → `SERVICE_UNAVAILABLE`, others → Arabic message.
- **Progress sync** is merge-based: `mergeProgressPayloads` (latest-`updated_at` wins; mistakes union
  with `is_mastered` OR'd), offline-fails go to `sync_queue` with exponential backoff (cap 1 h) and
  flush on `online` events.

**Methods:** `exchangeGoogleToken`, `signOutSession`, `getEffectiveAuthToken`, `fetchScenarios`,
`fetchScenarioDetail`, `fetchVocabulary`, `fetchGrammar`, `sendTurn`, `fetchHints`, `translateText`,
`verifyCode`, `checkSubscriptionStatus`, `getReferralInfo`, `claimReferral`, `syncProgress`,
`restoreProgress`, `deleteAccount`, `exportUserData`. Helpers: `mergeProgressPayloads`,
`mapRedemptionReasonToArabic`.

---

## 13. Voice: speech-to-text & text-to-speech

- **STT (`useSpeechInput.ts`)** — Web Speech API, `de-DE`, non-continuous with interim results.
  A **stable recognizer** is created lazily and updated via refs so re-renders cannot tear down an
  active session. A **3-second start watchdog** rebuilds a "zombie" recognizer (desktop Edge) so the
  next mic tap works. Errors surface as Arabic banners; typing is always available.
- **TTS (`useSpeechOutput.ts`)** — `speechSynthesis`, `de-DE`, rate 0.8/1.0. Handles async voice
  discovery (`voiceschanged` + polling), prefers a natural non-Google German voice, and **primes the
  engine on the user's first gesture** (mobile autoplay policy). Exposes `isPlaying`, `activeCharIndex`,
  `voicesReady`.

---

## 14. Offline & PWA

`vite.config.ts` → `VitePWA`:
- `registerType: 'autoUpdate'`; manifest name **"Katzu — رفيقك لتعلم الألمانية"**, `display: standalone`,
  `dir: rtl`, `lang: ar`, black theme, mascot icons.
- Workbox precache of `js/css/html/ico/png/ttf/woff2`.
- **Runtime caching:** `StaleWhileRevalidate` for `…workers.dev/(scenarios|vocabulary|grammar)`,
  cache `katzu-api-content`, max 100 entries / 7 days.
- `public/_headers` sets the app CSP and security headers (see §27.4).

**Degradation:** study/review and cached content work offline; AI features and hints report clearly
that an internet connection is required; progress writes queue and flush later.

---

## 15. Backend Worker: request pipeline

`export default { async fetch(request, env) }` in `cloudflare-unified-worker.js`. Order of operations:

1. **TEST_MODE neutralization** — if `env.TEST_MODE` is set **and** `isProductionEnv(env)`, the flag is
   stripped before any handler runs (a stale test var can never bypass Google JWT verification in prod).
2. **CORS** — `getCorsHeaders(request, env)`; **fails closed in production** (unknown origin →
   `403 origin_not_allowed`, diagnostic header `x-cors-rejection`); allowlisted → normal headers;
   `OPTIONS` preflight answered.
3. **Body-size cap** — `Content-Length > 65536` → `413 payload_too_large`.
4. **Route dispatch** — AI/auth/account/referral → admin → billing → crypto → core (verify, check-status,
   generate, progress) → content read/CMS → legacy admin → `404`.
5. **Global error handling** — unhandled errors are logged, recorded into the admin error feed
   (`recordError`), and returned as `500 { error: "server_error" }`.

**Rate limiting / quotas**
- **AI rate limits:** per-account, **D1-backed global counters** (`rate_limit_counters`) with an
  in-isolate Map fallback. Defaults `AI_RATE_LIMIT_PER_MINUTE=10`, `AI_RATE_LIMIT_PER_DAY=200`.
- **Free trial quota:** `MAX_FREE_AI_SESSIONS = 3`, enforced server-side via `ai-quota:<sub>` KV +
  `trial_quota_ledger` D1 (idempotent per `session_id`). The trial is **A1-only**. Only conversation
  turns *consume* quota; `/ai/check-writing` is quota-**checked** (three used sessions open the Pro CTA),
  while hints stay exemption by design — the quota is already consumed while a learner's last free
  session is running, so counting hints there would remove them mid-conversation.
- **Provider windows:** beyond the per-account limits, each pooled `(provider, key, model)` unit carries its
  own terminal window in the day-quota ledger (`cloudflare-ai-router.js`). A unit inside its window is
  skipped, never retried, and the park survives isolate recycling through KV `ai-pool-ledger`.

---

## 16. Backend Worker: full endpoint reference

Legend — **Auth:** `none` = public, `sess` = session/JWT bearer required, `admin` = `Authorization:
Bearer <ADMIN_SECRET>`, `sig` = HMAC signature. **RL:** participates in rate limiting.

### Auth & account
| Method | Path | Auth | RL | Notes |
|---|---|---|---|---|
| POST | `/auth/session` | none (needs Google ID token) | — | Verifies the Google ID token → issues opaque `sess_…` token (30-day TTL) in KV `session:<token>` + `sessions_by_sub:<sub>` index |
| POST | `/auth/signout` | sess | — | Revokes the presented session |
| POST | `/user/delete` | sess | — | Full deletion across KV keys, D1 ledgers, registry; returns per-step result (`success` only if all steps pass) |
| POST | `/user/export` | sess | — | JSON export (no tokens/secrets), `Content-Disposition: katzu-data-export.json` |

### AI

> **Note (2026-09-26):** these routes are served by a **multi-provider pool** (`cloudflare-ai-router.js`:
> Gemini · Groq · OpenRouter · NVIDIA NIM) with a **terminal day-quota ledger** — an exhausted
> `(provider, key, model)` unit is never retried before its window resets, and the park survives isolate
> recycling through KV `ai-pool-ledger`. `/ai/translate` is now entitlement-gated (it had none) and
> `/ai/check-writing` is trial-counted; hints stay quota-exempt by design. **§18 below still describes the
> Gemini-only router this replaced** — that section begins at byte 57,846 of this file, past the ~48 KB
> tool boundary, so it could not be edited in place: treat this table and `docs/current-state.md` as
> authoritative for AI behaviour.

| Method | Path | Auth | RL | Notes |
|---|---|---|---|---|
| POST | `/ai/turn` (alias `/turn`) | sess | ✔ | Roleplay reply + evaluation; bounded inputs; CEFR allowlisted; server-authoritative scenario; handler in `cloudflare-ai-chat.js`, served by the provider pool |
| POST | `/ai/translate` (alias `/translate`) | sess **+ entitlement** | ✔ | Arabic translation, KV-cached (`ai-cache:tr:*`). Entitlement-gated since 2026-09-26 — it previously had no entitlement check at all |
| POST | `/ai/hints` (alias `/hints`) | sess | quota-exempt | 2–4 distinct conversational moves; handled by `cloudflare-hints.js`; KV-cached (`ai-cache:hints:*`) |
| POST | `/ai/check-writing` | sess **+ entitlement** | ✔ | Graded Schreiben (20-900 chars, task derived from the level); trial-counted since 2026-09-26; handler in `cloudflare-writing.js` |
| GET | `/ai/health` (alias `/health`) | none | — | Public health only: `status`, `ready`, cache sizes, `aiPool` (active / idle / exhausted entries + attempt counters), and Workers AI fallback counters. **No provider key metadata** — the response is an allowlisted projection that can never contain a key fragment or a key count |

> **Note (2026-09-25):** `/health` is now hardened — it serves an allowlisted public projection that contains **no Gemini key fragments and no key count** (only overall health + fallback counters). This supersedes the `/health` leak listed as **T1** in §31.1, which could not be edited in place (it sits past the ~63 KB tool offset wall).

### Subscription / referral / progress
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/verify` | sess | Redeems an activation code (atomic via `redeemed_codes_ledger` PRIMARY KEY); grant + referral payout |
| POST | `/check-status` | sess | Current Pro state / days remaining |
| POST | `/referral/info` | sess | Referral code, verified/pending counts, reward months |
| POST | `/referral/claim` | sess | Attach an inviter (rules: not self, once, new accounts) |
| POST | `/progress/sync` | sess | Merge server-side progress (includes `session_summary`, mistakes, saved words, trainings) |
| POST | `/progress/get` | sess | Read server-side progress for restore |

### Content (D1)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/scenarios` | none | All scenarios |
| GET | `/scenarios/:id` | none | One scenario + `starter_phrases` |
| GET | `/vocabulary` | none | Optional `level`, `topic`; `VALID_LEVELS` enforced |
| GET | `/grammar` | none | Optional `level` |

### Admin (see §21 for detail)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin`, `/admin/` | none (shell) | Dashboard HTML + security headers; data endpoints below require the secret |
| GET | `/admin/api/overview` | admin | Registry stats + recent activity/errors |
| GET | `/admin/api/users` | admin | Paginated user list (`plan`, `q`, `limit`, `offset`) |
| GET | `/admin/api/user` | admin | One user + activity + errors + redemption count |
| GET | `/admin/api/activity` / `errors` | admin | Recent feeds |
| GET | `/admin/api/content-list?type=…` | admin | Rowid-keyed list for `vocabulary`/`starter_phrases` (also generic content endpoints) |
| POST | `/admin/api/content-update` | admin | Rowid-keyed update, column + level allowlists |
| POST | `/admin/generate` | admin | Mint an activation code (`months` 1–12) |
| POST | `/admin/upload` | admin | Bulk content upload/upsert |
| POST | `/admin/lookup` / `edit` / `revoke` | admin | Legacy subscription admin |
| POST | `/admin/progress-lookup` / `progress-edit` | admin | Legacy progress admin |
| GET/POST/PUT/DELETE | `/admin/(scenarios\|vocabulary\|grammar\|starter_phrases)[/:id]` | admin | Single-row content CRUD |

### Billing — Dodo (dormant)
`POST /billing/checkout`, `POST /billing/webhook` (signed), `POST /billing/status`, `GET /billing/health`.
With no Dodo keys these answer `503`; **nothing in the app calls them**. `/billing/webhook` is reachable
before CORS so signature-authenticated provider callbacks work.

### Crypto — NOWPayments
`POST /crypto/checkout`, `POST /crypto/webhook` (signed IPN), `GET /crypto/order` (claim-token gated),
`GET /crypto/health` (booleans only). See §23.

---

## 17. Auth, sessions & identity

**Flow**
```
Google Identity Services (browser) → ID token (JWT)
        │  POST /auth/session { id_token }
        ▼
Worker verifyGoogleIdToken(idToken, GOOGLE_CLIENT_ID, env):
  • structure (3 parts) → payload decode
  • exp check
  • aud === GOOGLE_CLIENT_ID
  • iss allowlist (accounts.google.com / https://accounts.google.com)
  • alg pinned to RS256
  • Google tokeninfo round-trip
        ▼
   opaque session token  sess_<random>   (KV: session:<token> + sessions_by_sub:<sub>)
        │  30-day TTL (SESSION_TOKEN_TTL_MS = 30 * 86400 * 1000)
        ▼
Client stores ONLY sessionToken in Dexie; uses `Authorization: Bearer sess_…` thereafter.
```

- **Session resolution:** `verifyGoogleIdToken` short-circuits opaque `sess_…` tokens to
  `resolveSessionToken` (KV lookup with expiry check). The same helper is used everywhere a
  credential is accepted, so header tokens work uniformly.
- **Revocation:** `/auth/signout` deletes the session; `/user/delete` enumerates `sessions_by_sub:<sub>`
  and deletes every session (a leaked token dies immediately instead of living out its TTL).
- **Google audience enforcement:** `GOOGLE_CLIENT_ID` is a **non-secret var** in `wrangler.toml`
  matching `VITE_GOOGLE_CLIENT_ID`; a mismatch rejects sign-in with `401 invalid_id_token`. Android
  (separate repo) must use `serverClientId` = this web client ID.
- **TEST_MODE bypass:** exists for tests; a fetch-entry guard strips it under `ENVIRONMENT=production`,
  and `tests/workerSecurity.test.ts` asserts both the guard and that the deploy config defines no
  `TEST_MODE`/`NODE_ENV`. **Residual risk:** the second bypass trigger
  (`process.env.NODE_ENV === "test"`) is inert only because `nodejs_compat` is not enabled — do not
  enable it without moving that check behind the same guard. (See §31.)
- **`SESSION_SECRET`** is documented as a secret but is **unused** in code (see §31).

---

## 18. AI engine

**Providers & failover**
1. **Gemini** (primary) with **multiple API keys** (`GEMINI_API_KEYS`, comma-separated; 3 live),
   round-robin + sticky model, per-key cooldown parking (an invalid key is parked ~1 h).
2. **Workers AI** (`@cf/qwen/qwen3-30b-a3b-fp8`) via the `AI` binding, gated by
   `AI_FALLBACK_ENABLED`. Responses carry `provider: "workers-ai"`; `served` increments in
   `/health` (KV-backed counters; best-effort diagnostics, never used for billing).

**Turn contract (`/ai/turn`)**
- **Two model calls per turn**: (A) roleplay reply, (B) evaluation — with strict JSON schemas and a
  label-echo sanitizer that strips instruction echoes from output.
- **Bounded inputs:** message/history/field length caps, history window via `boundedHistory`
  (6 messages roleplay / 10 immersion), 64 KB body cap; `cefr_level` allowlisted; if `scenario_id`
  is present the scenario identity is **resolved server-side from D1** (client title/persona ignored).
- **Prompt persona:** witty, self-aware, roasts German grammar — never the learner. Sarcasm level
  (`GENTLE`/`SASSY`/`DEADPAN`) is a user setting passed to the model.
- **Response shape:** `reply_de`, `reply_ar`, optional `followup_ar`, `hints[]`, and
  `evaluation { is_correct, original_mistake, corrected_german, grammar_rule, explanation_ar,
  roast_comment, positive_note_ar }`. The client validates the shape and rejects malformed responses
  rather than crediting a broken turn.
- **Entitlement:** `checkUserEntitlement` before the call — Pro users unrestricted; free users are
  **A1-only** and capped at `MAX_FREE_AI_SESSIONS = 3` (idempotent per `session_id`). Hints never
  consume quota.

**Translation (`/ai/translate`)** — Arabic translation with edge caching (used for openers and
on-demand lookups).

---

## 19. Hints (multi-move)

`cloudflare-hints.js` replaces the old single suggestion with **2–4 distinct conversational moves**.

- Closed intent enum: `answer`, `agree`, `disagree`, `add_detail`, `ask_followup`, `clarify`,
  `express_uncertainty`, `deflect` (labels in `src/lib/utils/hintIntents.ts`).
- `MIN_HINTS = 2`, `MAX_HINTS = 4`, `MAX_OUTPUT_TOKENS = 400`.
- `selectDistinctHints` drops duplicate sentences, two options making the same move, and any
  translation that is not readable Arabic (harakat/tatweel-normalized).
- Cache key is version-prefixed (`v2:`) so old single-hint cache entries are ignored.
- **Client floor:** if the AI call fails or is paywalled, the UI falls back to cached D1 starter
  phrases (fetched on a cold cache), so the suggestion bar is never empty.
- Worker-scoped internals (auth, key rotation, cache, failover, `json`) are **injected** at the call
  site because the handler lives past the ~63 KB edit wall in the unified worker.

---

## 20. Content (D1 curriculum CMS)

**Curriculum database:** D1 `katzu-content`, binding `DB`.

**Content tables**

| Table | Key columns |
|---|---|
| `scenarios` | `id`, `title_de`, `title_ar`, `ai_persona`, `category`, `icon`, `initial_message_a1/a2/b1/b2` |
| `starter_phrases` | `id`, `scenario_id`, `level`, `german`, `translation_en`, `translation_ar`, `sort_order` |
| `vocabulary` | `id`, `german`, `article`, `plural`, `part_of_speech`, `translation_ar`, `translation_en`, `example_de`, `example_ar`, `topic`, `level` |
| `grammar` | `id`, `title_ar`, `rule_de`, `rule_ar`, `level`, `explanation_ar`, `example_de`, `example_ar` |

**Live counts (measured 2026-09-24)**

| Content | Count |
|---|---|
| Scenarios | **5** — `embassy_appointment`, `cafe_order`, `job_interview`, `doctor_visit`, `apartment_viewing` |
| Openers | **5 × 4 levels** (each scenario has real `initial_message_{a1,a2,b1,b2}`) |
| Starter phrases | **20** (hint fallback) |
| Vocabulary | **114** (A1 31 / A2 30 / B1 27 / B2 26) |
| Grammar rules | **4** (one per level) |

**Topic taxonomy:** vocabulary is keyed by **topic** (`food`, `documents`, `work`, `health`,
`housing`); scenarios carry a **category** (`daily_life`, `official`, `work`, `health`, `housing`)
that maps to a topic via `scenarioVocab.ts`. Local seed fixtures use a slightly different taxonomy
(they use scenario ids) — a known gap, mitigated by the quiz's stale-cache healing.

**Editing paths**
- `/admin/upload` — bulk upsert; `scenarios`/`grammar` upsert by id, `vocabulary`/`starter_phrases`
  are **insert-only** (no unique key) — so corrections must use the update route.
- `/admin/api/content-update` — **rowid-keyed**, column-allowlisted (`CONTENT_EDITABLE_TYPES =
  ['vocabulary','starter_phrases']`), level allowlist A1–B2. Guarded by the caller's `expect` value.
- Generic single-row CRUD under `/admin/(scenarios|vocabulary|grammar|starter_phrases)`.

**Quality tooling**
- `scripts/audit-quiz-content.mjs` — read-only live audit replaying the real quiz generator;
  reports mismatches and coverage gaps (last run: **0 mismatches, 0 gaps**).
- `scripts/fix-quiz-content.mjs` — dry-run-by-default gloss corrections with `expect` guards and
  read-back; applied 5 corrections (rows #54, #61, #36, #79, #96).
- Residual (honest): 5 same-topic pairs still overlap textually (`Miete`/`Mietvertrag`,
  `Dokument`/`vorlegen`, `lecker`/`köstlich`, `Arbeit`/`arbeiten`, `Stelle`/`sich bewerben`); each is a
  real degree/noun-verb distinction and `pickDistractors` guarantees they never share a question.

---

## 21. Admin control plane

Lives in `cloudflare-admin.js`. Served as Worker HTML at `GET /admin`.

**Auth model**
- The **shell is public** (200); every data endpoint requires
  `checkAdminAuth` = `Authorization: Bearer ${env.ADMIN_SECRET}` — a plain (non-constant-time) compare
  that **fails closed** if `ADMIN_SECRET` is unset. Query-param auth is not accepted (401).
- The browser stores the operator-typed secret in `sessionStorage['katzu_admin_key']`.

**Dashboard**
- Tabs: Overview / Users / Activity / Errors / Content, with live stats (`getRegistryStats`), user
  search/filter, per-user drill-down (activity, errors, redemptions), content editor
  (`starter_phrases` / `vocabulary` row editors), and generate/upload tools.
- **Security headers on the `/admin` response:** CSP
  `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:;
  connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
  plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`, COOP/CORP `same-origin`.
- **XSS posture:** no DB- or user-supplied value is interpolated into HTML (every field is written with
  `textContent`; `innerHTML` is used only to clear containers). The remaining hardening item is the
  browser-typed secret and static inline `onclick` handlers.

**Registry & telemetry helpers:** `ensureRegistryTables`, `upsertUserFromAccount`, `markUserPro`,
`setUserPlanBySub`, `recordActivity`, `recordError`, `purgeUserRegistry`, `resolveUserRecord`,
`listUsers`, `getUserActivity`, `getUserErrors`, `listActivity`, `listErrors`, `getRegistryStats`,
`getUserRedemptionCount`, `resolveSessionSubFromRequest`, `withVerifyRegistry`, `withAiTelemetry`,
`sanitizeLogMessage` (strips credential-shaped strings before persistence).

**Screenshots** of the live dashboard live in `docs/screenshots/` (overview, users, activity, errors).

---

## 22. Billing — Dodo Payments (dormant)

`cloudflare-dodo.js` is retained but **unconfigured and unused**: with no Dodo keys its routes answer
`503`, and no app code calls `/billing/*`.

- Tables: `billing_events`, `subscriptions` (+ indexes).
- Webhook verification: Standard-Webhooks HMAC signature, rejecting unsigned/tampered/>5 min old.
- Event classification: subscription lifecycle (`active`, `renewed`, `cancelled`, `on_hold`,
  `past_due`, `expired`, `failed`) + `payment.succeeded`/`payment.failed`; grants/ends entitlement by
  writing the same `account:<sub>` record redemption writes.
- **Why dormant:** Dodo's eligibility keys on the country that issued the founder's government ID, and
  only a Syrian ID was available, which is not accepted. Do not re-open this thread; do **not** re-add
  an in-app checkout — paid sales happen on the sales site.
- `scripts/verify-dodo-live.mjs` remains for a future re-enable; `DODO_ENVIRONMENT` defaults to
  `test_mode`.

---

## 23. Crypto sales — NOWPayments

`cloudflare-crypto.js` owns `/crypto/*`, called **only** by the sales site.

**Configuration:** `NOWPAYMENTS_API_KEY` + `NOWPAYMENTS_IPN_SECRET` (secrets; **not set** →
`/crypto/checkout` and `/crypto/webhook` answer `503`), `NOWPAYMENTS_ENVIRONMENT` (`test_mode`
default → `api-sandbox.nowpayments.io`), `NOWPAYMENTS_BASE_URL` (optional override),
`SALES_ORIGIN` (`https://katzu-sales.pages.dev`), `CRYPTO_PRICE_USD` (`5`), `CRYPTO_MONTHS` (`1`).

**Routes & security**
- `POST /crypto/checkout` — **unauthenticated**, creates the invoice server-side; only `checkout_url`,
  `order_id`, `claim_token`, `months`, `price_usd` are returned. Only the `SALES_ORIGIN` browser is
  allowed (unknown Origin → `403`; no Origin → `503` processed). **Note:** it is not rate-limited today.
- `POST /crypto/webhook` — the **only fulfillment authority**: HMAC-SHA512 `x-nowpayments-sig`
  verification over the key-sorted JSON body (constant-time compare), `payment_id:status` replay ledger
  (`crypto_events`), `finished`-only delivery, a conditional UPDATE as the concurrency guard, and a
  5xx + released claim so a provider retry can finish an unfulfilled paid order. Unsigned → `401`.
- `GET /crypto/order` — a buyer's code, gated by the claim token (used by `success.html` polling).
- `GET /crypto/health` — booleans only (`ready`, `apiKeyConfigured`, `ipnSecretConfigured`,
  `environment`, price/months) — never a key.

**Fulfillment:** mints the code through the **existing** activation generator (`handleAdminGenerate`,
the same function `/admin/generate` serves); no code format is duplicated. Tables: `crypto_orders`,
`crypto_events`.

**Verification:** `tests/cryptoPayments.test.ts` (24 assertions incl. signed IPN → code → `/verify`
redeems → `/check-status` reports Pro) and the live script `scripts/verify-crypto-live.mjs`.

**Activation code format:** `DE-<months>M-<8-hex nonce>-<16-hex signature>`, where the signature is
`HMAC-SHA256("DE-<months>M-<nonce>", HMAC_SECRET)` truncated to 16 uppercase hex (64-bit). Redeemed
atomically in `redeemed_codes_ledger`. *Known nit:* signature comparison uses `!==` (not constant-time).

---

## 24. Server data model (D1 + KV)

### 24.1 D1 tables (`katzu-content`)

**Curriculum:** `scenarios`, `starter_phrases`, `vocabulary`, `grammar` (see §20).

**Ledgers (created lazily by `ensureLedgerTables`; PRIMARY KEY = atomic exactly-once):**
- `redeemed_codes_ledger` — `code` PK, `account_id`, `months`, `redeemed_at`.
- `trial_quota_ledger` — (`account_id`, `session_id`) PK, `consumed_at`.
- `referral_payouts` — `invited_account_id` PK, `inviter_account_id`, `awarded_at`.
- `rate_limit_counters` — `counter_id` PK, `window_start`, `count`.

**Registry & telemetry (`ensureRegistryTables`):**
- `users` — `id` PK, `email` UNIQUE, `created_at`, `last_seen_at`, `plan` (`free`/`pro`),
  `plan_expires_at`, `last_ip`, `platform`.
- `activity_log` — `id` PK AI, `user_id`, `event_type`, `metadata` (sanitized JSON), `created_at`.
- `error_reports` — `id` PK AI, `user_id`, `error_type`, `endpoint`, `message`, `created_at`.
- Indexes on `users.last_seen_at`, `(user_id, created_at)` and `(event_type, created_at)` for activity
  and errors.

**Crypto (`ensureCryptoTables`):**
- `crypto_orders` — `order_id` PK, `claim_token`, `months`, `price_usd`, `status`, `provider`,
  `payment_id`, `pay_currency`, `pay_amount`, `invoice_url`, `code`, `created_at`, `paid_at`,
  `delivered_at`.
- `crypto_events` — `event_key` PK, `payment_id`, `payment_status`, `order_id`, `received_at`.

**Billing — Dodo (dormant):** `billing_events`, `subscriptions`.

### 24.2 KV namespaces

**`USER_PROGRESS`**
| Key | Value |
|---|---|
| `session:<token>` | Session record (`sub`, `email`, `expires_at`, …) |
| `sessions_by_sub:<sub>` | Index of that user's session tokens (max ~20) |
| `progress:<sub>` | Synced learning progress payload |
| `ai-quota:<sub>` | Authoritative free-trial counter (`{ used, updated_at }`) |

**`REDEEMED_CODES`**
| Key | Value |
|---|---|
| `code:<CODE>` | Legacy redemption record (D1 ledger is authoritative when present) |
| `account:<sub>` | Pro entitlement (`expiresAt`, plan) |
| `email_index:<email>` | Email → sub lookup |
| `refcode:<CODE>` | Referral code → inviter sub |
| `referred-by:<sub>` | The inviter a user attached |
| `referrals:<sub>` | Referral history (masked invitee emails, status, awarded_at) |

---

## 25. Feature catalogue (detailed)

### 25.1 Authentication & identity
Google Identity Services sign-in; server exchange to a revocable 30-day session; **no raw ID token
persisted**; header-only credential; 401 → honest re-auth; session revocation on sign-out and deletion.
*(Covered by `tests/tokenHygiene.test.ts`, `tests/accountOps.test.ts`, and headless smoke checks.)*

### 25.2 Onboarding
Name capture + `GoalSelectionBottomSheet` (daily minutes 5/15/30, weekly days 3/5/7, target CEFR
A1–B2). Stored in the Dexie user row. A structured **placement test is not built** (see §31).

### 25.3 Curriculum & the Trail
Vertical scenario trail with MASTERED/ACTIVE/unlocked states, CEFR level selector (A1 free; A2–B2
Pro-locked), deterministic daily mission, welcome-back greeting, streak and XP rank. No module/track
structure yet; 5 scenarios total (roadmap: a 30-day "أول 30 يوم في ألمانيا" track).

### 25.4 Study
Phrase / vocab / grammar tabs, TTS with speed control, article colour coding, bookmark words,
**stale-cache healing** pulled from the Worker.

### 25.5 Quiz
Comprehension quiz generated from real D1 rows; headword prompt + example context; collision-safe
options; explanation banner; score persisted to `scenario_training`.

### 25.6 Training gate (on-ramp)
Study → Quiz is the default path with a clearly secondary **"تخطَّ التدريب"** override that records
`trainingSkippedAt`. The skip never bypasses CEFR gating or vocabulary injection (the live session
does not read it).

### 25.7 Live conversation
Mode picker; dynamic turn target; CEFR nudge (Pro); global/per-message translation toggle; clickable
words with insight sheet; auto-spoken replies; correction cards with grammar rule + Arabic
explanation + persona roast; on-demand multi-move hints; robust error/retry; Turkish-typing-free
input; completion → report.

### 25.8 Hints
2–4 distinct conversational moves with Arabic intent labels, embedded in the turn or refreshed on
demand, with a cached starter-phrase floor.

### 25.9 Session report
Honest independent-vs-assisted accuracy, metrics grid, level promotion (≥75% over 3 sessions), and a
mistake re-type drill that marks mastery.

### 25.10 Practice center
Flashcards over the full vocabulary, grammar summary, error bank with re-type drill, searchable
vocabulary list with save + TTS.

### 25.11 Progress
Streak hero, 7-day heat-map, aggregate accuracy/sentences/minutes, shareable achievement card.

### 25.12 Streak, XP & daily loop
`recalculateStreak` (honest reset, no inflation, clock-tamper safe); XP earned per session
(`round(accuracy × 1.5) + 50` if hint-free else `+25`); rank ladder; daily mission; check-in greeting.

### 25.13 Referral
`REF-XXXXXXXX` code per user; an invitee attaches once (never self, new accounts only); the inviter
earns **1 Pro month** on the invitee's first *verified* redemption, recorded atomically in
`referral_payouts`.

### 25.14 Subscription & redemption
Free tier (3 server-counted A1 sessions) → Pro via an activation code redeemed with `/verify`
(atomic), with server-authoritative status on every sign-in.

### 25.15 Data export & account deletion
Export a JSON archive of server-held data (no tokens/secrets). Deletion wipes progress, quota,
account, trial, email index, referral keys, D1 rows + ledgers + registry, and **revokes every
session**, then the client wipes local data; each step is reported so partial failures are retryable.

### 25.16 Diagnostics & telemetry
Client-side diagnostics ring buffer (copy/download/clear; no tokens or content). Server-side, an
activity log and error feed (credential-sanitized) power the admin dashboard. **No third-party
analytics or error-reporting service** is wired (`VITE_SENTRY_DSN` is a documented optional hook).

### 25.17 Voice
STT (`de-DE`) with a zombie-recognizer watchdog and Arabic error banners; TTS (`de-DE`) with voice
discovery + gesture priming; typing always available as a fallback.

### 25.18 Offline
IndexedDB-first content & progress; runtime-cached content endpoints; queued progress sync with
backoff; clear offline messaging for AI features.

---

## 26. Monetization & the sales site

**Plan:** one paid tier, **Katzu Pro**, sold as a **one-off activation code** that grants N months
(default 1) of Pro. Default price label **`5 دولار / شهر`** (`PRO_PRICE_LABEL`).

**Two purchase channels**
1. **Crypto (automated)** — sales site → `POST /crypto/checkout` → NOWPayments invoice → signed IPN
   → `POST /crypto/webhook` mints the code → `success.html` reveals it.
2. **Local Syria (manual by design)** — Syriatel Cash / MTN Cash / bank transfer + Telegram proof;
   the operator mints a code by hand from the admin dashboard.

**Sales site (`sales/`)** — a separate static Cloudflare Pages project (`katzu-sales`):
- `index.html` — product pitch, $5 pricing, crypto buy button, local-payment section, FAQ, "already
  bought?" recovery.
- `success.html` — polls `GET /crypto/order` and shows the code (no-store, noindex).
- `sales.js` — **one config block** to fill (`workerUrl`, `telegram`, `syriatelNumber`, `mtnNumber`,
  `bankDetails`); unfilled values disable the CTA and show a loud warning.
- `_headers` — strict CSP (`script-src 'self'`) allowing only the Worker as a connect target.
- App/policy links are **absolute** in HTML so crawlers/store reviewers that don't run JS still resolve them.

**Boundary rule:** the app has **no checkout UI** and never calls `/crypto/*` or `/billing/*`; the
sales site never calls the app's authenticated endpoints. The activation code is the only bridge;
the app links out via `SALES_URL` from `PaywallModal` and the redemption screen.

---

## 27. Environment, secrets & bindings

### 27.1 `wrangler.toml`

- **name:** `katzu-test` · **main:** `cloudflare-unified-worker.js` · **compatibility_date:** `2025-01-01`

**Bindings**
| Binding | Type | Resource |
|---|---|---|
| `DB` | D1 | `katzu-content` (`a80158e6-a5b4-49c0-b78a-67f390acf71d`) |
| `USER_PROGRESS` | KV | `d901da2026dc4830940562c72935ec78` |
| `REDEEMED_CODES` | KV | `2c60d78d9cbf4f5fa93c620043afb404` |
| `AI` | Workers AI | — |

**Non-secret vars**
`ENVIRONMENT=production` (forces strict CORS + disables the TEST_MODE bypass);
`ALLOWED_ORIGINS` = worker + `katzu-webapp-v3.pages.dev` + `katzu-sales.pages.dev`;
`GOOGLE_CLIENT_ID` (public web OAuth client, `aud` enforced);
`AI_RATE_LIMIT_PER_MINUTE=10`; `AI_RATE_LIMIT_PER_DAY=200`; `AI_FALLBACK_ENABLED=1`;
Dodo block (`DODO_ENVIRONMENT=test_mode`, empty product IDs, `CHECKOUT_RETURN_ORIGIN=""`);
NOWPayments block (`NOWPAYMENTS_ENVIRONMENT=test_mode`, `NOWPAYMENTS_BASE_URL=""`,
`SALES_ORIGIN=https://katzu-sales.pages.dev`, `CRYPTO_PRICE_USD=5`, `CRYPTO_MONTHS=1`).

**Worker secrets (write-only, `wrangler secret put`)**
`GEMINI_API_KEYS` (3 live), `ADMIN_SECRET`, `HMAC_SECRET`, `SESSION_SECRET` (unused — see §31),
and — for the paid path — `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` (**not set**), plus
`DODO_API_KEY`/`DODO_WEBHOOK_SECRET` (dormant).

### 27.2 Pages app build vars

`VITE_GOOGLE_CLIENT_ID`, `VITE_WORKER_URL`, optional `VITE_SENTRY_DSN`, `VITE_CONTACT_URL`,
optional `VITE_SALES_URL`. Current values live in `.env.local`: `VITE_WORKER_URL` =
`https://katzu-test.ghaidakalosh008.workers.dev`; `VITE_GOOGLE_CLIENT_ID` =
`754341831948-…apps.googleusercontent.com`.

### 27.3 Pages/build settings

- App: install `npm ci`, build `npm run build` (`tsc && vite build`), output `dist`.
- Sales: no build command, upload directory `sales`.
- Local dev: `npm install` → `.env` → `npm run dev` (Vite binds `0.0.0.0`, port 3000).

### 27.4 Security headers

- **App (`public/_headers`):** `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: microphone=(self), camera=(), geolocation=()`, and a CSP
  (`default-src 'self'`; `script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client`;
  `connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://*.workers.dev`;
  `frame-src https://accounts.google.com`, etc.).
- **Sales (`sales/_headers`):** strict CSP with `script-src 'self'`, `frame-ancestors 'none'`,
  `no-store`/`noindex` on `success.html`, immutable caching for `/assets/*`.
- **Admin (`/admin` response):** see §21.

---

## 28. Deployment & CI/CD

### 28.1 CI (`.github/workflows/ci.yml`)
On PR / push to `main` / manual:
`npm ci` → `npm run lint` (`tsc --noEmit`) → `node --check cloudflare-unified-worker.js` →
`npm test` (Vitest) → `npm run build`.

### 28.2 App (Cloudflare Pages, git-connected)
Push to `main` → Pages builds with `npm run build` and serves `dist`. `public/_headers`,
`robots.txt`, and `sitemap.xml` ship with it. `/privacy` and `/terms` deploy as extensionless routes
(Pages 308-strips `.html`). Attach the production domain by updating `ALLOWED_ORIGINS` and
`public/_headers`, `robots.txt`, `sitemap.xml`.

### 28.3 Worker
`npm run deploy:worker` (= `wrangler deploy`); `npm run tail:worker` for live logs. Automated
environments authenticate with `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (Keys tab); locally,
`npx wrangler login`.

### 28.4 Sales site
```
npx wrangler pages project create katzu-sales --production-branch=main      # once
npx wrangler pages deploy sales --project-name=katzu-sales --branch=main --commit-dirty=true
```

### 28.5 Post-deploy smoke runbook
`DEPLOY.md` §4 lists the human checklist: missing-config state, real sign-in, one free-tier A1
conversation with a hint, streak/check-in behavior, XP rank, unauth rejection, hints bar states,
error cards & retry, network wording, diagnostics, mic denial/recovery, 502 diagnosis, Workers AI
fallback, quiz content healing, offline refresh, sign-out privacy, token hygiene (IndexedDB has no
`idToken`; header-only requests), session revocation, re-auth path, export, deletion, and a production
bundle scan for secrets.

---

## 29. Testing & verification scripts

**Unit/integration:** 24 Vitest files / **220 tests** (`npm test` = `vitest run`), covering account ops,
admin registry, admin content, backfill, check-in, crypto payments, daily mission, Dodo billing,
hints, metrics, Pro status, progress, quiz generation, referral, scenario→topic mapping, streak,
subscription, sync, token hygiene, trial quota, worker client, worker security, Workers AI fallback,
and XP milestones.

**Live scripts** (`scripts/`)
| Script | Purpose |
|---|---|
| `audit-quiz-content.mjs` | Read-only live quiz audit (mismatches/gaps) |
| `fix-quiz-content.mjs` | Guarded D1 gloss corrections (dry-run default) |
| `verify-admin-live.mjs` | Admin dashboard + registry + free-user lookup |
| `verify-crypto-live.mjs` | Invoice → signed IPN → code round-trip |
| `verify-dodo-live.mjs` | Dodo round-trip (dormant) |
| `backfill-user-registry.mjs` | Seed `users` from KV (gated) |
| `capture-admin-screenshots.mjs` | Refresh dashboard PNGs |
| `smoke-token-hygiene.cjs` | Headless-browser token-hygiene smoke tests on the live app |
| `verification-battery.cjs` | Combined verification runner |

**Standard local gate:** `npm run lint` (clean) · `npm test -- --run` (220 passing) · `npm run build`.

---

## 30. Legal & compliance

**Hosted pages** (`public/`), Arabic-first with an English reference summary, contact
`support@ghaidak.com`, operator "Katzu — غيدق علوش · ghaidak.com", last updated 2026-09-24:
- **`/privacy`** — what is collected (Google identity + email, learning data, operational logs
  without credentials, on-device IndexedDB), AI processing (Google Gemini, with Cloudflare Workers AI
  fallback), sub-processors (Google, Cloudflare), retention (30-day sessions, learning data until
  deletion, operational logs "limited period"), export/delete rights, security, **16+** age floor,
  change policy.
- **`/terms`** — service is **not** legal/medical/governmental/immigration advice; AI limits;
  account rules; quota & subscription (single-use codes bound to one account); acceptable use;
  ownership; deletion; liability; changes.

**In-app trust screens** (`TrustInfoScreen`) show Arabic summaries and link to the hosted pages.

**Still open (owner/counsel):** legal entity, governing law/jurisdiction, log-retention window,
refund terms, medical/legal disclaimers in relevant scenarios, Google Play Data Safety parity, and
the Android-submission items (separate repo).

---

## 31. Known gaps, risks & roadmap

### 31.1 Open technical/security items (verified in source)
| # | Item | Impact | Suggested fix |
|---|---|---|---|
| T1 | `/health` publicly leaks **masked Gemini key fragments** (`Key #1: AQ.Ab8RN…`) | Information disclosure | Remove fragments; return counts/booleans only |
| T2 | `NODE_ENV === "test"` bypass trigger reaches verification if `nodejs_compat` is enabled | Auth collapse | Move behind the same production guard that neutralizes `TEST_MODE` |
| T3 | `SESSION_SECRET` is set but **unused** | Confusion / stale secret | Delete the secret or wire it deliberately |
| T4 | `/crypto/checkout` has **no rate limiting** | Invoice-spam abuse | Add per-IP throttling |
| T5 | Progress sync read-merge-write has no version guard | Concurrent devices can drop writes | Version/`updated_at` CAS |
| T6 | Activation-code signature compare uses `!==` | Timing side-channel (low) | Constant-time compare |
| T7 | Admin uses a browser-typed bearer secret + static inline `onclick` | XSS → full admin | Remove an app-side checkout; prefer Cloudflare Access / separate hostname; move to nonce/hash CSP |
| T8 | App CSP allows `script-src 'unsafe-inline'` | Weaker XSS defense | Remove inline scripts and tighten the policy |
| T9 | CORS sets `access-control-allow-credentials: true` though no cookies are used | Cosmetic | Drop the header |
| T10 | `.claude/settings.local.json` is **tracked in git** | Local tool config leaked | `git rm --cached` |
| T11 | `ADMIN_SECRET` was shared in plain text | Exposed admin | Rotate it |
| T12 | `robots.txt`/`sitemap.xml` advertise `katzu.app`, which doesn't resolve | Cosmetic SEO | Attach the domain or update the files |
| T13 | `@tanstack/react-query`, `zod`, `workbox-window` declared but unused | Bloat/confusion | Remove or wire deliberately |
| T14 | Isolate-local Maps still back the crypto/legacy paths (D1 covers AI) | Abuse-control weakness on some routes | Migrate fully to D1 counters |

### 31.2 Product gaps (not yet built)
- **No value-before-signup:** every learning surface is behind sign-in; no anonymous preview lesson.
- **No placement test / structured onboarding personalization** (goal/schedule are collected; no
  adaptive assessment; level defaults to A1 unless picked).
- **Curriculum is a thin vertical slice:** 5 scenarios / 20 phrases / 114 words / 4 grammar rules —
  well short of a "30-day track".
- **No spaced-repetition (SRS) scheduler** and **no competency model** (progress = XP/streak/sessions
  plus an independent-vs-assisted split); no mistake taxonomy beyond raw evaluation fields.
- **No product analytics** (funnel instrumentation) and no third-party error reporting (`VITE_SENTRY_DSN`
  is an optional hook only).
- **Retention surface is thin:** streak/mission/check-in exist; no reminders, milestones view, or
  re-engagement notifications.
- **No renewal/refund/grace flow** (codes are one-shot, so "renewal" = buying another code).

### 31.3 Blocked / operator-only
- **NOWPayments unconfigured:** `/crypto/health` reports `ready:false` and no purchase can be
  fulfilled until `NOWPAYMENTS_API_KEY` + `NOWPAYMENTS_IPN_SECRET` are set, verified in `test_mode`,
  then the environment flipped to `live_mode`.
- **Local Syria payment details are placeholders** in `sales/sales.js` (the site warns loudly).
- **Manual operator actions:** rotate `ADMIN_SECRET`; rotate/scope `CLOUDFLARE_API_TOKEN`; delete the
  unused `SESSION_SECRET`; decide where `/admin` lives (Cloudflare Access / separate hostname);
  untrack `.claude/settings.local.json`; attach the production domain.
- **Real paid crypto round-trip and real Google sign-in** could not be exercised autonomously
  (need the owner's credentials / keys).

### 31.4 Roadmap (from `docs/IMPLEMENTATION_PLAN.md`, in sequence)
1. **Security & integrity** (mostly done): token hygiene, revocable sessions, complete deletion,
   export, CORS fail-closed, atomic redemption/referral, durable quotas/limits, bounded AI inputs.
2. **Activation:** anonymous guided first lesson + limited preview conversation; placement test;
   onboarding personalization; funnel events.
3. **Curriculum depth:** full **Track A "أول 30 يوم في ألمانيا"** (~13→30 scenarios) with content
   states (draft/reviewed/approved) and a CI content-QA script. *(The single biggest retention lever.)*
4. **Learning engine:** SRS (`review_items`, SM-2-lite), mistake taxonomy, per-scenario "can-do"
   competencies (5 states), report leads with competencies.
5. **Monetization polish:** renewal/grace/refund/restore language, prices configurable without an app
   release, paywall shows achieved → restricted → outcome.
6. **Expansion:** Track B (work/Ausbildung) → Track C (university), offline track packs, review-due
   reminders, analytics.

---

## 32. Open decisions

Only the product owner can decide these; the spec records the current state so a decision has a place
to land.

1. **Legal:** approve final privacy/terms wording, entity name, jurisdiction, log-retention window,
   refund terms, and the **16+** age floor (current assumption).
2. **Payments:** confirm NOWPayments account (no fiat payouts → no ID check), fill local-Syria payment
   details, and decide whether to re-introduce card payments later (a merchant-of-record would solve
   global VAT).
3. **Pricing:** confirm the $5 / 1-month default and whether to add an annual plan.
4. **Domain:** attach `katzu.app` (recommended) or re-point the robots/sitemap/CORS/CSP to the real one.
5. **Admin exposure:** keep the bearer-secret dashboard or move it behind Cloudflare Access / a
   separate hostname.
6. **Localization:** is an Arabic **dialect** variant (beyond MSA-default) in scope for v1?
7. **Analytics:** choose a privacy-respecting analytics provider, or stay analytics-free.
8. **`@tanstack/react-query`/`zod`:** adopt them or remove them from `package.json`.

---

## Appendix A — conventions & glossary

**Naming & style**
- React components `PascalCase` in `components/` and `features/`; hooks `useXxx`; pure logic in
  `lib/utils/*` with unit tests.
- Arabic user-facing copy, RTL layout; German strings always inside `GermanText`.
- Colour grammar: `der` blue, `die` pink, `das` green.
- Import alias `@/` → `src/`.
- Talwind tokens only (`primary`, `surface-card`, `status-success`…); no invented utilities.

**Glossary**
| Term | Meaning |
|---|---|
| **Katzu / كَاتْزُو** | The product and its cat-tutor persona |
| **Scenario** | A real-life German situation (cafe_order, doctor_visit…) with 4 CEFR openers |
| **Starter phrase** | Pre-written useful sentence; also the offline hint floor |
| **Hint intent** | The conversational move a hint makes (answer/agree/…) |
| **Independent vs assisted** | Sentences produced without vs with a hint; only independent ones count for accuracy |
| **Pro** | The paid entitlement (all levels A1–B2 + unlimited conversations) |
| **Activation code** | `DE-<months>M-<nonce>-<sig>` one-off code that grants Pro |
| **Referral code** | `REF-XXXXXXXX`; inviter earns 1 Pro month on a verified first redemption |
| **Trail** | The scenario roadmap home screen |
| **On-ramp** | The Study → Quiz → Conversation gating flow |
| **Sales site** | The separate `katzu-sales` property that sells codes |
| **CEFR** | A1–B2 level scale used for content and conversations |

---

## Appendix B — developer quick reference

```bash
# Install & run
npm install
npm run dev            # Vite dev server on 0.0.0.0:3000

# Verify (the standard gate)
npm run lint           # tsc --noEmit
npm test -- --run      # vitest (220 tests)
npm run build          # tsc && vite build  (do not run casually)

# Worker
npm run deploy:worker  # wrangler deploy
npm run tail:worker    # wrangler tail

# Live checks
node scripts/audit-quiz-content.mjs
node scripts/verify-admin-live.mjs --secret=<ADMIN_SECRET>
node scripts/verify-crypto-live.mjs --ipn=<NOWPAYMENTS_IPN_SECRET>
ADMIN_SECRET='…' node scripts/backfill-user-registry.mjs --kv-export=… --emit-sql

# Deploy the sales site
npx wrangler pages deploy sales --project-name=katzu-sales --branch=main --commit-dirty=true
```

**Verification principle** (from `docs/launch-gate.md`): a capability is only "done" when its
**user-facing behavior is verified on-device or by test execution** — never by compilation alone.

**Related documents:** `docs/current-state.md` (baseline facts), `docs/IMPLEMENTATION_PLAN.md`
(phased plan), `docs/launch-gate.md` (gates), `docs/LAUNCH-CHECKLIST.md` (owner actions),
`docs/product-gaps.md`, `docs/security-gaps.md`, `docs/verification-report.md`,
`docs/pass-quiz-training-hints.md`, and `DEPLOY.md` (deploy runbook).
