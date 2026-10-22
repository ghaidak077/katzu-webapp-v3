# APP-MAP — the whole of Katzu on one page (360° orientation)

**Size: ~126 KB.** Read the *section* you need, never the whole file: `grep -n "^## " docs/agent/APP-MAP.md`
first, then read that range. `npm run session:start` already prints §9 (deploy targets + manifest
counts), which is the part that changes; `tests/agentDocs.test.ts` caps the file at 135 KB so it
cannot grow into something nobody can load.

**Purpose.** Read the section you need to understand what Katzu *is*, how it is built, every screen
and feature, where each thing lives, and what will bite you — **without opening the source tree**.
It is an index, not a novel: every line is a pointer, a fact, or a rule. When you need depth,
follow the path.

**This file is load-bearing.** It is the fastest way for any model (including a small one) to
act like it has already read the whole repo. It pays for itself only if it stays true.

**Update rule (mandatory — same commit as the code change):** any change to a route, screen,
feature, worker endpoint, data table, top-level dependency, deploy target/id, or a new
gotcha/limitation ⇒ update the matching row here **in the same commit**. Add a line to the
**Change log** at the bottom. A run is not done until this file agrees with the code.
`AGENTS.md` §12 enforces this. If you cannot confirm a row, mark it `UNPROVEN` — never guess.

- Owner-only boundaries live in `AGENTS.md` §3 (never edit them).
- Measured environment (versions, machine, commands, traps): `docs/agent/ENV-FACTS.md`.
- Cross-session memory (mistakes + decisions): `docs/agent/MEMORY.md`.
- Current status/ledger: `docs/AGENT-STATE.md`. Owner-facing snapshot: `docs/agent/PROJECT-BRIEF.md`.

*Last verified: 2026-10-19 (V43.1 mock fix). Verified against `src/App.tsx`, `package.json`, `wrangler.toml`,
`cloudflare-unified-worker.js`, `tests/`, `e2e/`, and the live deploy targets below (worker
`66bd8b92-8db6-452d-ad99-88685cab0956`, Pages `assets/index-BfNVQ58w.js` on production deployment
`8fe6d07f-fe49-49c9-8369-985a82a9a8f1`, `main` = `8ca290c`).
Re-check the four "volatile" sections — routes, endpoints, tables, deploy ids — on first touch of any of them.*

---

## 0. Product in 10 lines

- **What:** an Arabic-first PWA that teaches **German** to Arabic speakers through short
  scenario-based conversations with an AI partner, honest correction, and spaced review.
- **Who:** Arab learners heading to Germany (work, Ausbildung, study, exams) — mobile-first,
  390×844 is the reference viewport, RTL is the default direction.
- **Wedge:** real German conversation *about a concrete situation*, in Arabic, with feedback a
  learner can trust. Not a flashcard app, not a grammar course.
- **Non-negotiables:** Arabic-first RTL (German LTR-isolated); the server is authoritative for
  entitlements, quotas, identity and sync; never claim mastery from a hint or one answer; every
  failure is visible, in Arabic, keeps the learner's input, and offers a next action.
- **Language of the product:** UI Arabic, target language German, code/docs English.
- **Demo:** `/demo` needs no account and makes **no AI call**.
- **Monetization:** free tier (3 AI sessions), Pro via activation codes (server-verified) and a
  separate payments site; **payments are in test mode** and carry no real money.
- **Priority order for every decision** (from `docs/agent/QUALITY.md`):
  trust/privacy > learning effectiveness > core loop > clarity > offline > retention >
  conversion > polish > features.

---

## Current execution overlay (2026-10-04)

See [EXCELLENCE-STATUS](EXCELLENCE-STATUS.md) for the uncommitted local excellence batch.
Account-owned offline snapshots are retained across sign-out; legacy unowned snapshots are
quarantined and never auto-uploaded. Local report/pattern data is cleared; late progress/review
responses are session-guarded. No new Dexie table or version is introduced: ownership metadata
is additive, non-indexed. Scenario detail now preserves A0 opener/order; offline topic filters
match online queries; content bootstrap retries failures and memoizes by DB binding.

## 1. Tech stack (v1.1.0)

| Layer | Choice | Notes |
|---|---|---|
| UI | **React 18.3** + **TypeScript 5.7** + **Vite 6** | single framework, no second one (AGENTS §3) |
| Styling | **Tailwind 3.4** + `clsx` + `tailwind-merge` | design tokens in `tailwind.config.js`, `.kz-*` utilities in `src/index.css` |
| Routing | **react-router-dom 7.3** | routes in `src/app/AppShell.tsx` (lazy); `src/App.tsx` holds only `/` + the frame; screens lazy-loaded |
| Client state | **Dexie 4 / IndexedDB** (`src/lib/db/katzuDb.ts`) | offline fixtures + queue + local fallback |
| Server state | **Dexie + WorkerClient** | React Query is declared but unused; removal remains planned |
| Validation | **Explicit validators and TypeScript contracts** | Zod is declared but unused; broader contract hardening remains planned |
| Icons / FX | `lucide-react`, `canvas-confetti`, `ogl` (hero/background) | |
| PWA | `vite-plugin-pwa` 0.21 (Workbox) + `workbox-window` | `registerType: 'autoUpdate'`; precache manifest |
| Backend | **Cloudflare Workers** (JS, no framework) + **D1** + **KV** + Workers AI | `cloudflare-unified-worker.js` + 13 sibling `cloudflare-*.js` modules |
| Testing | **Vitest 5** (node/jsdom) + **Playwright 1.63** (chromium only) | `tests/` and `e2e/` |
| Tooling | `wrangler 4`, `axe-core`, `lighthouse` (dev only) | Node **24.15.0** pinned in CI; this machine runs 24.14.0 (EBADENGINE warning only) |

Root tells: `index.html` → `src/main.tsx` → `src/App.tsx` (landing + frame) → `src/app/AppShell.tsx`
(the app shell, a dynamic import). `metadata.json` is app metadata.

---

## 2. File tree (annotated, focused on what matters)

```
katzu/
├─ index.html                      # SPA shell; Arabic RTL defaults, font preload
├─ package.json                    # scripts + deps (see §9)
├─ vite.config.ts                  # code-splitting, PWA manifest, proxy/build knobs
├─ playwright.config.ts            # chromium; E2E_TARGET=preview owns build+server
├─ vitest.config.ts                # node + jsdom projects
├─ tailwind.config.js              # design tokens (colors, fonts, kz animations)
├─ wrangler.toml                   # worker name, D1/KV/AI bindings, vars, cron
├─ .github/workflows/ci.yml        # verify + e2e + secret-scan (Node 24.15.0); e2e runs the preview bundle (E2E_TARGET=preview)
│
├─ src/
│  ├─ App.tsx                      # ★ ALL routes + auth gate + tab routing (see §3)
│  ├─ main.tsx                     # React root + PWA/service-worker registration
│  ├─ index.css                    # global shell, RTL rules, .kz-* utilities
│  ├─ types/models.ts              # ★ shared domain types (Scenario, Vocabulary, …)
│  ├─ components/
│  │  ├─ ui/                       # primitives (buttons, inputs, cards, …)
│  │  ├─ glass/                    # glass surfaces + FloatingControl (tier-aware)
│  │  ├─ effects/                  # SiriWave / KatzuThinking etc.
│  │  ├─ sheets/ common/ v2/ voice/ # overlays, shared widgets, voice UI
│  ├─ features/                    # ★ one folder per screen family (see §3)
│  │  ├─ auth/        marketing/    # sign-in, welcome, landing, redemption
│  │  ├─ demo/        onboarding/   # public demo, first-run flow
│  │  ├─ journey/     trail/ study/ # daily loop: Journey Home/Story/Practice, library
│  │  ├─ conversation/              # LiveConversationScreen + hook + transcript/dock
│  │  ├─ report/      progress/     # session report, progress dashboard
│  │  ├─ review/      practice/     # SRS review, vocabulary/practice hub
│  │  ├─ listening/   writing/      # listen + write skills
│  │  ├─ coach/       grammar/      # coaching, grammar section
│  │  ├─ placement/   quiz/         # placement test, quizzes
│  │  ├─ settings/    dev/          # profile, trust pages, design-system (dev-only)
│  └─ lib/                         # ★ all logic, no JSX except hooks
│     ├─ api/workerClient.ts        # ★ single client for every Worker call
│     ├─ db/katzuDb.ts              # ★ Dexie schema, seed, offline queue
│     ├─ conversation/              # opener, stateMachine, turnPlan
│     ├─ srs/ (engine, store)       # spaced repetition
│     ├─ content/                   # curriculumAudit, scenarioGrammar map
│     ├─ levels/levelSpec.ts        # A0–B2 level model
│     ├─ memory/ progress/ skills/  # patterns, collections, honest skill summary
│     ├─ debrief/                   # session debrief + exam share image
│     ├─ analytics/ audio/ coach/   # events, mic/speech capture, coaching profile
│     ├─ demo/ design/ entitlement/ # demo flow, renderer tier + scenes, trial
│     ├─ grammar/ journey/ listening/ mission/ onboarding/ placement/
│     ├─ share/ speech/ writing/    # share cards, TTS/voice choice, writing task
│     └─ utils/                     # checkIn, dailyMission, diagnostics, env, haptics,
│                                   #   hintIntents, links, onlineStatus, preloadRecovery,
│                                   #   quizGenerator, rendererTier, scenarioVocab, streak,
│                                   #   subscription, xpMilestones
│
├─ cloudflare-unified-worker.js    # ★ main Worker: routes, auth, AI, sync, admin, D1
├─ cloudflare-ai-chat.js           # AI persona/prompt assembly (identity limits, corrections)
├─ cloudflare-ai-router.js         # multi-provider pool + failover (defaults: NVIDIA + OpenRouter)
├─ cloudflare-ai-providers.js      # owner-managed pool config (KV): disable defaults, custom gateways, keys
├─ cloudflare-admin.js             # admin dashboard + gated admin API (incl. AI Providers tab)
├─ cloudflare-analytics.js         # analytics ingest + retention
├─ cloudflare-content-schema.js    # additive column reconciliation (DB_SCHEMA)
├─ cloudflare-content-studio*.js   # content studio UI/tools
├─ cloudflare-crypto.js            # NOWPayments checkout/webhook (test mode)
├─ cloudflare-{hints,stt,writing,level-spec,turn-quality}.js
│
├─ tests/                          # 88 Vitest spec files (+ helpers/ for fakes)
├─ e2e/                            # 18 Playwright specs + harness.ts
├─ scripts/                        # audit-*, load-curriculum, verify-*-live, batteries
├─ public/                         # _headers (CSP), legal, scenes/, robots, sitemap
├─ sales/                          # separate Pages site for payments
└─ docs/                           # AGENT-STATE.md (ledger), agent/ (this dir), content/,
                                   #   marketing/ (KATZU-LAUNCH-PLAYBOOK.md is SoT)
```

`★` = read this first for the area you are changing.

---

## 3. Screens, routes and what each one does

All routes are declared in **`src/app/AppShell.tsx`**, except `/` which `src/App.tsx`
renders directly (A7: the landing must not wait on the app's Dexie seed, its three
content fetches or the auth gate — those run in the shell, which is a dynamic import).
Screens default to lazy `React.lazy`; a `<Suspense fallback>` shows `RouteFallback`
(`src/components/common/RouteFallback.tsx`) while a chunk loads (never a blank page).
The canonical, machine-checked route list is §14 (`appmap-routes`); this section explains it.
`tests/appMap.test.ts` reads BOTH files for that list, so a route declared in either is seen.

### Public / pre-auth
| Route | Screen (file) | What it is |
|---|---|---|
| `/` | LandingRoute → `marketing/LandingScreen.tsx` | Arabic landing/pitch; states the free quota «٣ جلسات محادثة مجانية» |
| `/welcome` | `auth/WelcomeScreen.tsx` | First-run greeting; name field carries privacy microcopy |
| `/signin` | `auth/SignInRoute` → `auth/SignInScreen.tsx` | **Google-only** sign-in; level picker A0–B2 (A0 = «تقدير أولي، سنضبطه بالمحادثة») |
| `/demo` | `demo/DemoScreen.tsx` | 4-step public demo, **no account, no AI call**; completion names the real scenario and shows the next-day line |
| `/onboarding` | `onboarding/OnboardingScreen.tsx` | Intent/goal capture after signup |
| `/subscription` | `auth/SubscriptionRedemptionScreen.tsx` | Pro offer + activation-code redemption |
| `/placement` | `placement/PlacementScreen.tsx` | Placement test → level |
| `/trust/:page` | `settings/TrustInfoScreen.tsx` | Trust pages: `privacy`, `terms`, `imprint`, `refund` (own lazy chunk) |

### Learner loop (`/app/*` and `/scenario/*`)
| Route | Screen | What it is |
|---|---|---|
| `/app/trail` (default tab) | `journey/JourneyHomeScreen.tsx` | Daily mission home: resume, review-due, streak |
| `/app/library` | `trail/TrailScreen.tsx` | Browse all scenarios/levels (navigation, not the daily mission) |
| `/scenario/:id/story` | `journey/StorySetupScreen.tsx` | Scene + vocab setup before practice |
| `/scenario/:id/practice` | `journey/GuidedPracticeScreen.tsx` | Guided rehearsal; passes context to Live via route state |
| `/scenario/:id/live` | `conversation/LiveConversationScreen.tsx` | **Core loop** — AI chat turn; typing + mic; corrections |
| `/scenario/:id/study` | `study/StudyScreen.tsx` | Deep practice / study |
| `/scenario/:id/quiz` | `quiz/QuizScreen.tsx` | Quiz → result card |
| `/scenario/:id` | `study/ScenarioDetailScreen.tsx` | Scenario detail |
| `/session-report` | `report/SessionReportScreen.tsx` | Debrief: honest stats, corrections, spaced-review scheduling, fix-exercise |
| `/app/review` | `review/ReviewScreen.tsx` | SRS memory review from real past mistakes |
| `/app/listen` | `listening/ListeningScreen.tsx` | Listening drill |
| `/app/write` | `writing/WritingScreen.tsx` | Writing task |
| `/app/coach` | `coach/CoachScreen.tsx` | Coaching/trend |
| `/app/grammar` | `grammar/GrammarSectionScreen.tsx` | Grammar locked path: lessons unlock one after another |
| `/app/progress` | `progress/ProgressScreen.tsx` | Honest measured-vs-unmeasured skills, patterns, streak |
| `/app/practice` | `practice/PracticeScreen.tsx` | Vocabulary hub: search, filters, error bank, flashcards, rules |
| `/app/profile` | `settings/ProfileSettingsScreen.tsx` | Profile/settings, sign-out |
| `/dev/system` | `dev/DesignSystemScreen.tsx` | Dev-build only design system |

- Tab router: `/app/:tab` maps `practice → Practice`, `progress → Progress`,
  `profile → Profile`, anything else → `Trail` (`toNavigationTab` in `App.tsx`).
- Auth gate: main tabs / learning sessions require sign-in (`App.tsx`); anonymous `/app/*`
  lands on `/welcome`.
- `MainTabsRoute` renders the four glass tabs (Trail · Practice · Progress · Profile) inside one
  glass container; the active pill is concentric by construction (do not break this).

---

## 4. Feature inventory (what exists, where the logic lives)

| Feature | Entry | Logic |
|---|---|---|
| Auth (Google ID token) | `/signin` | `features/auth`, verified server-side against `GOOGLE_CLIENT_ID` |
| Public demo | `/demo` | `lib/demo/demoFlow.ts` (+ `migration.ts`) |
| Daily mission selection | Trail | `lib/mission/selectMission.ts`, `lib/utils/dailyMission.ts`, `checkIn.ts` |
| Journey/story context | Story→Live | `lib/journey/{story,practice,context,brief}.ts` |
| Live AI conversation | `/scenario/:id/live` | `useLiveConversation.ts`, `ConversationTranscript.tsx`, `ConversationDock.tsx`, `lib/conversation/*` |
| AI partner persona/correction | server | `cloudflare-ai-chat.js` (identity limits, gentle correction, schema-echo filter) |
| Multi-provider AI + failover | server | `cloudflare-ai-router.js` (defaults: NVIDIA + OpenRouter, owner-editable via admin); Workers AI `[ai]` fallback |
| AI quota / trial ledger | server | KV + `trial_quota_ledger`; `MAX_FREE_AI_SESSIONS = 3` (`cloudflare-unified-worker.js`) |
| SRS spaced review | `/app/review` | `lib/srs/{engine,store}.ts`, `lib/memory/*` |
| Corrections / error bank | report + practice | mistake store in Dexie; surfaced in `/app/practice` |
| Progress & honest skills | `/app/progress` | `lib/progress/collections.ts`, `lib/skills/summary.ts`, `lib/utils/streak.ts` |
| Listening | `/app/listen` | `lib/listening/drill.ts`, `lib/speech/*`, `lib/audio/*` |
| Writing | `/app/write` | `lib/writing/task.ts`, server `/ai/check-writing` |
| Coach | `/app/coach` | `lib/coach/{profile,taxonomy}.ts` |
| Placement | `/placement` | `lib/placement/{engine,generator}.ts` |
| Quizzes / exam card | `/scenario/:id/quiz` | `lib/utils/quizGenerator.ts`, `lib/debrief/examCard.ts`, `examShareImage.ts` |
| Vocabulary hub | `/app/practice` | `lib/utils/scenarioVocab.ts`, `lib/content/scenarioGrammar.ts` |
| Levels A0–B2 | everywhere | `lib/levels/levelSpec.ts`, `cloudflare-level-spec.js` |
| Offline | everywhere | Dexie queue + `lib/utils/onlineStatus.ts`; failures fail soft in Arabic |
| Analytics / retention | server | `lib/analytics/*`, `cloudflare-analytics.js`, allow-list of event names |
| Diagnostics / crash capture | global | `lib/utils/diagnostics.ts` → `/client-error` → `error_reports` |
| Payments (codes only in app) | `/subscription` | `lib/entitlement/trial.ts`, `lib/utils/subscription.ts`; server `/verify` |
| Crypto sales site | `sales/` | `cloudflare-crypto.js` (NOWPayments, **test mode**) |
| Trust/legal pages | `/trust/:page` | `settings/TrustInfoScreen.tsx`, `public/*.html` |
| Renderer tier (perf) | global | `lib/design/rendererTier.ts` → `.kz-lite`; detects saveData/reduced-motion/cores |
| Haptics + feedback motion | global | `lib/utils/haptics.ts` — one semantic API (`tap`/`select`/`success`/`warning`/`error`; Capacitor bridge → `navigator.vibrate` → silent); Settings switch `hapticsEnabled` (absent = ON) + `prefers-reduced-motion` both gate it. `.kz-pop` / `.kz-shake` / `.kz-flip-in` / `.kz-orb-listening` in `src/index.css`, every one neutralised under reduced motion with the state still visible. Silent on iPhone — see §10 |
| Page title per route | global | `titleForPath()` in `src/App.tsx` — sets `document.title` on every navigation (V36); 19 declared routes named, no two collide |
| Screen naming + announcements | every screen | Every `*Screen.tsx` exposes an `<h1>`/`<h2>` (enforced by `simplicity-check.mjs`); states that appear only after an action carry `role="status"`/`role="alert"` (V36) |

---

## 5. Data & storage

- **Client (offline, IndexedDB via Dexie)** — `src/lib/db/katzuDb.ts`: schema, seed,
  insert-if-missing top-ups, offline queue, `wipeUserScopedData` on sign-out. `fake-indexeddb`
  in tests. The daily-task record is an additive Dexie **v9** table `daily_tasks` (key `dateKey`,
  local `YYYY-MM-DD`): monotonic per-task flags + `reviewReps`, wiped on sign-out, never D1.
- **D1 `katzu-content`** (`database_id a80158e6-a5b4-49c0-b78a-67f390acf71d`, binding `DB`):
  content tables `scenarios`, `vocabulary`, `grammar`, `starter_phrases` (remote wins) plus
  worker-created ledger tables: `redeemed_codes_ledger`, `trial_quota_ledger`,
  `referral_payouts`, `referral_lesson_payouts`, `rate_limit_counters`, `sync_revisions`,
  `generated_codes`, `error_reports`, plus the B3 mock ledger `mock_free_claims` and
  `mock_sessions`. Content DDL is **unversioned** and lives only in the
  deployment — read the live schema (`pragma_table_info`) before any write (see MEMORY).
- **KV** — `USER_PROGRESS` (id `d901da2026dc4830940562c72935ec78`, progress + authoritative AI
  quota) · `REDEEMED_CODES` (id `2c60d78d9cbf4f5fa93c620043afb404`).
- **Workers AI** — binding `AI`, fallback only (`AI_FALLBACK_ENABLED=1`).
- **Sync** — rev-guarded merge in D1 `sync_revisions`; client queues offline and retries.
- **Triggers** — cron `17 4 * * *` runs the retention sweep (`sweepExpiredRows`); `POST
  /admin/sweep` does it on demand.

---

## 6. Worker endpoints (public surface)

Main entry `cloudflare-unified-worker.js`; content/API siblings listed in §2.
The canonical, machine-checked endpoint list is §14 (`appmap-endpoints`); this table is the overview.

| Endpoint | Purpose |
|---|---|
| `GET /health` | status only (`status`, `service`, `ready`, `maintenance`) — **no** pool/provider disclosure |
| `GET /ai/health` | AI pool health |
| `POST /ai/turn` | fused conversation turn (translate + reply + correction) |
| `POST /ai/translate` | translation (can time out — client keeps text, offers retry) |
| `POST /ai/hints` | hint floor for the last AI message — quota-exempt from the trial SESSION counter, but has its OWN daily scope `hints` (free 30 / Pro 120 per day, 6/min); over the limit it answers **200 with an empty `hints` array**, never an error, so the client falls back to the free starter phrases |
| `POST /ai/transcribe` | speech → text |
| `POST /ai/check-writing` | writing check |
| `GET /scenarios`, `/scenarios/:id` | content |
| `GET /grammar` | grammar rows |
| `POST /verify` | redeem an activation code → Pro (exactly-once) |
| `GET/POST /progress/get`, `/progress/sync` | rev-guarded progress sync |
| `POST /analytics/events` | allow-listed analytics |
| `POST /client-error` | sanitized crash capture → `error_reports` |
| `GET /crypto/health` | payments readiness flags only — **no app price is read from here** (L1) |
| `POST /crypto/checkout`, `/crypto/webhook` | sales site (separate origin) |
| `/admin/*` | bearer-gated admin: users/registry, codes report, generate/revoke, upload, sweep, edit, schema |

**Entitlements, quotas, identity and sync are server-authoritative.** The client never decides
Pro status or AI allowance. AI never governs billing/account state.

---

## 7. Where-to-look index (jump straight to the right file)

| I need to change… | Start at |
|---|---|
| a route or auth gate | `src/app/AppShell.tsx` (all of them but `/`) |
| the landing page or the tab title | `src/App.tsx` |
| a screen's UI/Copy | matching `src/features/<area>/*Screen.tsx` |
| any Worker/API call | `src/lib/api/workerClient.ts` |
| an AI endpoint or prompt | `cloudflare-unified-worker.js` + `cloudflare-ai-chat.js` |
| AI provider pool | `cloudflare-ai-router.js` (defaults) + `cloudflare-ai-providers.js` (owner edits: disable defaults, custom gateways, keys) |
| offline/DB behaviour | `src/lib/db/katzuDb.ts` |
| domain types/shapes | `src/types/models.ts` |
| content rules/joins | `src/lib/content/{curriculumAudit,scenarioGrammar}.ts` |
| **the Trail's order** | `src/lib/content/scenarioOrder.ts` — journey stages (arrival → exam last); replaced `examFirstScenarios` 2026-10-07 |
| spaced repetition | `src/lib/srs/{engine,store}.ts` |
| levels | `src/lib/levels/levelSpec.ts` |
| a design token / `kz-*` class | `tailwind.config.js`, `src/index.css` |
| a radius | **the ladder only** — `--kz-radius-{tag,chip,control,panel,sheet,hero}` in `src/index.css`, read by Tailwind via `radius('<name>')`. Never hardcode a px radius (V34). |
| a hover state | **`pointer-hover:`**, never `hover:` — it compiles under `@media (hover: hover) and (pointer: fine)`, so a tapped card on a phone does not stay lit. Enforced by design-audit `hover-on-touch` (V34). |
| CSP/security headers | `public/_headers` |
| CI | `.github/workflows/ci.yml` |
| deploy steps / rollback | `docs/agent/DEPLOY.md`, `docs/agent/OWNER-STEPS.md` |
| content authoring rules | `docs/agent/CONTENT-GATE.md` (owner-owned) |
| quality bar | `docs/agent/QUALITY.md` |

---

## 8. Tests, gates and how to run them

- **Unit:** `npm test` (= `vitest run`) — reporter `dot`. `npx tsc --noEmit` (== `npm run lint`).
  Do **not** pass `--reporter=line` (that is Playwright-only; it errors).
- **Types for e2e:** `npx tsc -p e2e --noEmit`.
- **e2e:** `E2E_TARGET=preview npx playwright test --reporter=line` (owns build + server +
  injects `VITE_WORKER_URL`; service workers blocked). Never measure against a hand-started
  server.
- **Build:** `npm run build` (`tsc && vite build`). **Worker syntax:** `node --check
  cloudflare-<name>.js`.
- **Audits/content:** `node scripts/audit-curriculum.mjs`, `audit-quiz-content.mjs`,
  `check-content-drift.mjs` (read-only drift vs live).
- **Design/simplicity gates (all three run in CI, all zero-budget):**
  `node scripts/design-audit.mjs` (10 categories; `hover-on-touch` and `pointer-follow` were added
  in V34), `node scripts/simplicity-check.mjs` (26 screens; a per-screen control budget plus
  `unnamed-heading`, tightened in V36 to accept only `<h1>`/`<h2>` — an `<h3>` section label is not a
  screen name) and `node scripts/contrast-check.mjs` (every token pair vs the canvas and a well).
- **Security:** `npm audit --omit=dev --audit-level=high`.
- Tiers (T0 per edit → T1 per item → T2 final) are defined in `AGENTS.md` §5.
- Every fixed bug gets a regression test; every pure rule gets unit tests.
- Orientation before work: `npm run session:start` prints the ledger NEXT, §9 targets, MEMORY §A
  facts, git state and the OPEN ITEMS backlog in ~80 lines (`scripts/session-start.mjs`, guarded
  by `tests/sessionStart.test.ts`).

---

## 9. Environments, deploy targets and IDs (volatile — re-verify before quoting)

| Thing | Value |
|---|---|
| Repo | `github.com/ghaidak077/katzu-webapp-v3` (SSH/https), branch of record: **`main`** (`launch-hardening` still exists but V27+ merged onward; `origin/HEAD` → `main`) |
| App (Pages) | `https://katzu-webapp-v3.pages.dev` |
| Worker | `https://katzu-test.ghaidakalosh008.workers.dev` (`/health` → 200; `/` → 404, expected) |
| Sales (Pages) | `https://katzu-sales.pages.dev` |
| Worker name | `katzu-test`; account `00df3d915626e0a681f4fef98c1c587c` |
| **Deploy is gated** | the owner asks in plain words (`deploy`, `push it live`, `ship it`) or writes `DEPLOY-AUTHORIZED` with or without targets (`AGENTS.md` §3, V40-3), and only via `docs/agent/DEPLOY.md` |
| **Content load is gated** | only with `CONTENT-LOAD-AUTHORIZED: <files>` and only via `docs/agent/CONTENT-LOAD.md` |
| Never (even authorized) | write prod D1 outside the content path; touch/secrets/`ADMIN_SECRET`; payments/OAuth/domain/legal; force-push |

Scripts: `dev` (vite :3000) · `build` · `preview` · `test` · `test:e2e` · `test:e2e:types` ·
`lint` · `session:start` (readout: ledger NEXT + §9 + MEMORY facts + git + OPEN ITEMS) · `deploy:worker` (**never run without authorization**) · `tail:worker` ·
`test:smoke:token-hygiene`.

---

## 10. Limitations & open items (as of 2026-10-18)

- **Payments not live** — crypto stays in `test_mode`; `ready:false`.
- **Signup is Google-only.**
- **Domain `katzu.app` does not resolve**, though robots/sitemap advertise it (owner item).
- ~~**`ADMIN_SECRET` must be rotated**~~ — **closed by owner decision, 2026-10-05.** The owner reviewed the earlier-prompt exposure and accepts the secret as it stands; it is no longer an open item. Recorded, not verified: a Worker secret cannot be read back.
- **Real-device voice input** never verified on iOS/Android; only Chromium fake capture.
- **Haptics are silent on iPhone (PWA, no native wrapper).** `src/lib/utils/haptics.ts` owns every buzz:
  a Capacitor bridge if one is ever present, then `navigator.vibrate`, then nothing — and iOS Safari has
  never implemented the Vibration API, so an iPhone simply feels nothing (shipped behaviour, not a bug).
  The Settings switch (`hapticsEnabled`, absent = ON) and `prefers-reduced-motion` both override the
  caller. Real iOS haptics need a native wrapper the repo does not have; no Capacitor package is installed.
- **Reading skill** shows «لم يبدأ بعد — قريباً».
- **Ask Katzu is German-only and quota-capped (V28 Stage 2A).** `/ai/ask` takes one question and
  returns validated JSON (Arabic explanation, examples, 3 practice items) or a polite Arabic refusal;
  its own daily cap and rate limit live in worker config (`ASK_FREE_PER_DAY` / `ASK_PRO_PER_DAY` /
  `ASK_RATE_PER_MINUTE`, defaults 8 / 60 / 4) and official/legal German carries a not-legal-advice
  notice. See `cloudflare-ask.js` and `src/features/ask/AskKatzuScreen.tsx`.
- **Chat turns are validated (V28).** `cloudflare-turn-quality.js` drops an embedded hint that does not
  answer the last AI message, refuses a correction that changes nothing or "corrects" an already-correct
  sentence, and gates the persona obstacles (never turn 1, never right after a repeat request). Run
  `node scripts/eval-chat-quality.mjs` (in CI) for the before/after rates.
- **Conversations follow the scenario's own arc (V28 Stage 1, the deferred beats item).**
  `cloudflare-conversation-beats.js` derives 4–8 deterministic beats from a scenario's starter phrases
  (pure, no RNG; de-duped, ordered by `sort_order`, evenly sampled when there are more than 8) and the
  prompt tells the model to move through them one per turn without reciting them. Beats are
  SERVER-resolved in `resolveScenarioIdentity` (one extra concurrent D1 read on a scenario's first turn
  per isolate, cached after, `resetScenarioBeatsCache` for tests) — never client-supplied. The whole
  `/ai/turn` system instruction is built by the exported pure `buildTurnSystemInstruction`, so its cost
  is measurable: `node scripts/measure-turn-cost.mjs` (in CI) reports the added prompt tokens and fails
  above the `BEATS_PROMPT_TOKEN_CAP` (220). Measured addition: **~103–110 estimated tokens/turn**
  (chars/4) on a ~1331–1467-token prompt — the increase the beat could not exceed.
- **Review items are contract-checked (V28).** A card must have a clear Arabic prompt, one German answer,
  and — for a correction — the learner's original and a meaningful change. Items that fail are hidden
  (suppressed, never deleted; Dexie v7 migration); word cards ship both directions and a cloze line.
  See `src/lib/review/validate.ts`.
- **One conversation, two modes (V28).** `practice` (hints + translation + a live correction) and
  `real` (none of those; the same turn call, a report at the end, corrections still recorded and
  enqueued). Session length is a level cap (`levelSpec.maxSessionTurns`, read via `sessionTurnCap`);
  REAL-mode XP is 1.5× practice (`src/lib/progress/sessionXp.ts`).
- **Grammar is a locked path (V28 Stage 2B).** The live grammar rows are ordered into one course
  (`orderGrammarLessons`, level A0 → B2 with authored order hints) and lesson N+1 unlocks only after N
  is passed; a pass needs a threshold (`LESSON_PASS_RATIO = 2/3`) in at least two SEPARATE sessions
  (`lessonState` in `src/lib/grammar/path.ts`), so one answer never promotes anyone. A deliberate
  test-out (a full, perfect run of the lesson's own check) is the one shortcut. Placement start makes
  every lesson below the learner's level optional review, so nobody is walled. Each lesson keeps its
  Arabic explanation, its generated exercises, and a small mixed review of the two lessons before it;
  progress lives in a new additive Dexie **v8** table `grammar_lessons` keyed by lesson id (never D1).
  Covered by `tests/grammarPath.test.ts` (18) and `e2e/grammarPath.spec.ts` (2).
- **Three daily tasks + an Arabic rank ladder (V28 Stage 3).** Journey Home shows one scenario
  session, one grammar step, and one review batch per day, reset at LOCAL midnight; the streak
  tolerates exactly one missed day (`FORGIVEN_DAYS = 1`). The rules are pure
  (`src/lib/daily/tasks.ts`: `dailyTaskStatuses`, `reviewTaskDone`, `dailyTaskStreak`) and persisted in
  an additive Dexie **v9** table `daily_tasks` — `markScenarioTaskDone` / `markGrammarTaskDone` /
  `markReviewGraded` (`src/lib/daily/taskStore.ts`) are the only writers, hooked into the session
  finish, the grammar attempt, and `gradeReviewItem`. A review batch is `REVIEW_BATCH_SIZE = 5` graded
  items OR the queue emptied after at least one. Ranks are the existing Arabic ladder made
  first-class (`src/lib/progress/ranks.ts`, `rankFor`, shown on Trail as "الرتبة N من M"), and XP is
  credited only through `creditXp` (`src/lib/progress/dailyXp.ts`), which caps a local day at
  `DAILY_XP_CAP = 600` so a rank can never be farmed. A **completed day is monotonic** (V28-5): the review
  status honours the persisted row flag (`DailyTaskEvidence.reviewCompleted`) and `completedToday` reads the
  row, so a later due item cannot un-complete a day or shorten the streak. Covered by `tests/dailyTasks.test.ts` (17),
  `tests/dailyTaskStore.test.ts` (7), `tests/ranks.test.ts` (10), `e2e/dailyTasks.spec.ts` (2).
- **The four skill surfaces now have dedicated e2e specs** (V28 follow-up): `e2e/skillSurfaces.spec.ts`
  (5) walks review (only answerable cards shown — suppressed and placeholder items never render —
  then graded to the summary), listening dictation (grades what was heard, names missed words,
  reveals the sentence), writing (rubric + corrected copy from the mocked worker), coach (three
  repeated word-order mistakes aggregate to a named pattern with a real drill button), and the
  Trail Arabic rank badge (`صياد الأُملاوت · الرتبة 3 من 6` at 800 XP). The chat→report→review path IS
  covered end-to-end by `e2e/modes.spec.ts` (V28): PRACTICE shows the hint + live correction,
  REAL hides every aid yet the turn still runs and the correction is answerable in the report. The
  grammar path IS covered by `e2e/grammarPath.spec.ts` (V28 Stage 2B): lesson 2 is locked until
  lesson 1 is passed across two separate sessions.
- **Imprint placeholder + refund one-liner** need the owner's real wording before public launch.
- **CI is green for the last pushed V28 shas (2026-10-02):** Stage 1 — branch `df08d25` (run `36984211159`) and `main` (`36984903494`); Stage 2A — branch `c07771f` (run `36988453680`); Stage 2B — branch dispatch `3963a8b` (run `36992098448`) and the `main` push of the same sha (run `36992692238`); Stage 1F (beats) — branch dispatch `dbc2e36` (run `36996847350`) and the `main` push of the same sha (run `36997578251`). Still quote the run id for the exact sha before claiming it — local green stays not-CI-green.
- Known live defects observed in a signed-in walkthrough (see `docs/AGENT-STATE.md` backlog):
  `/ai/translate` sometimes aborts (`net::ERR_ABORTED`) with a retry; Trail scene-image slot
  shows a placeholder line.
- Fixed (V26): the retype drills. `gradeCorrectionRetype` in `src/lib/srs/engine.ts` accepts the
  corrected fragment embedded in a full sentence; `SessionReportScreen` and `PracticeScreen`
  both use it, and mastery in both now comes only from the review store's `MASTERED_REPS = 3`
  (the practice drill no longer writes `isMastered` itself).

---

## 11. Gotchas that cost real runs (top of the pile)

1. **Working tree is CRLF** though `.gitattributes` pins LF — re-read exact lines before an
   exact-match edit; a written file starting with `#!` will break tests if it is CRLF.
2. **`rg` is not installed** — use `grep -rn` / `git grep -n`.
3. **Batched tool calls run sequentially** — batching saves round-trips, not wall time.
4. **Large stdout is head+tail truncated** — cap to ≤500 lines or tee to a log.
5. **Never trust a local server you did not start** — check the port before/after, kill the
   listening PID (and the process tree for `workerd`).
6. **Stale metrics lie** — re-measure a performance claim before acting on it.
7. **A test double more forgiving than the real engine agrees with the bug** — make fakes
   throw where the real dependency throws.
8. **A 200 is not proof** — verify new assets by size + content-type; a fresh profile for
   painted assets (service-worker cache).
9. **Local green is not CI green** — quote the run id for the pushed sha.
10. **Content DDL is unversioned** — read the live schema before the first write; verify a
    write against the store, classifying differences (absent / pending / diverged / duplicate).

Full evidence for each is in `docs/agent/MEMORY.md` and `docs/agent/LESSONS.md`.

---

## 14. Machine-checked manifest (single source of truth)

`tests/appMap.test.ts` parses the four blocks below and fails when the code diverges. This is the
canonical list for routes, screens and endpoints — §3 and §6 above are the human explanation of
the same thing. **Update the block in the same commit as any route/screen/endpoint/table change**
(§12); never edit one side only. Paths are normalised before comparison (`:param` matches any
`:name`); endpoint rows ending in `/*` are the `startsWith` branches.

```appmap-routes
/
*
/app
/app/:tab
/app/ask
/app/coach
/app/grammar
/app/library
/app/listen
/app/review
/app/write
/demo
/dev/system
/main
/main/:tab
/onboarding
/placement
/scenario/:scenarioId
/scenario/:scenarioId/live
/scenario/:scenarioId/practice
/scenario/:scenarioId/quiz
/scenario/:scenarioId/story
/scenario/:scenarioId/study
/session-report
/delete-account
/mock
/paywall
/signin
/subscription
/trust/:page
/welcome
```

```appmap-screens
src/features/ask/AskKatzuScreen.tsx
src/features/auth/SignInScreen.tsx
src/features/auth/SubscriptionRedemptionScreen.tsx
src/features/auth/WelcomeScreen.tsx
src/features/coach/CoachScreen.tsx
src/features/conversation/LiveConversationScreen.tsx
src/features/demo/DemoScreen.tsx
src/features/dev/DesignSystemScreen.tsx
src/features/grammar/GrammarSectionScreen.tsx
src/features/journey/GuidedPracticeScreen.tsx
src/features/journey/JourneyHomeScreen.tsx
src/features/journey/StorySetupScreen.tsx
src/features/listening/ListeningScreen.tsx
src/features/marketing/LandingScreen.tsx
src/features/mockexam/MockExamScreen.tsx
src/features/onboarding/OnboardingScreen.tsx
src/features/offers/PaywallScreen.tsx
src/features/placement/PlacementScreen.tsx
src/features/practice/PracticeScreen.tsx
src/features/progress/ProgressScreen.tsx
src/features/quiz/QuizScreen.tsx
src/features/report/SessionReportScreen.tsx
src/features/review/ReviewScreen.tsx
src/features/settings/DeletionRequestScreen.tsx
src/features/settings/ProfileSettingsScreen.tsx
src/features/settings/TrustInfoScreen.tsx
src/features/study/ScenarioDetailScreen.tsx
src/features/study/StudyScreen.tsx
src/features/trail/TrailScreen.tsx
src/features/writing/WritingScreen.tsx
```

```appmap-endpoints
/admin
/admin/*
/admin/codes/report
/admin/discount-code
/admin/edit
/admin/generate
/admin/grammar
/admin/lookup
/admin/progress-edit
/admin/progress-lookup
/admin/revoke
/admin/scenarios
/admin/starter_phrases
/admin/sweep
/admin/upload
/admin/vocabulary
/ai/ask
/ai/check-writing
/ai/health
/ai/hints
/ai/transcribe
/ai/translate
/ai/turn
/auth/session
/auth/signout
/check-status
/client-error
/grammar
/health
/hints
/mock/start
/pricing
/progress/get
/progress/sync
/referral/claim
/referral/info
/review/sync
/scenarios
/scenarios/*
/translate
/turn
/user/delete
/user/export
/verify
/vocabulary
```

```appmap-tables
activity_log
crypto_events
crypto_orders
error_reports
generated_codes
mock_free_claims
mock_sessions
rate_limit_counters
redeemed_codes_ledger
referral_lesson_payouts
referral_payouts
sync_revisions
trial_quota_ledger
users
```

The content tables (`scenarios`, `vocabulary`, `grammar`, `starter_phrases`) are deliberately
**not** here: their DDL lives only in the deployment, not the repo (§5, §11.10), so there is no
source line for the guard to read. Worker-created ledger tables are the ones the repo creates.

> **Older half of the change log.** Rows dated 2026-10-04 and earlier moved verbatim to
> `docs/agent/APP-MAP-ARCHIVE.md` on 2026-10-22 (40 rows, 41.8 KB): the 135 KB cap was 9 bytes
> from full and `AGENTS.md` §12 still requires this table. Nothing was deleted — grep the archive.

| Date | Version | Change |
|---|---|---|
| 2026-10-22 | guidedHome 2b | **A first run can no longer back out of itself, and Back from the first story lands on home — no new routes, screens, endpoints, tables or deps; all three fixes gated on the flag.** (1) On the first question the header control called the route's `onBack`, which for a first run is `/welcome` — it walked a signed-in learner out to the sign-up screen, and there is no earlier step to return to, so it is replaced by a 44px spacer and the dots stay centred; on the second question «رجوع للسؤال السابق» opened the previous-German question (an edit-flow step the first run never asks) and then returned to the same grid, and now returns to `goal`. (2) Back from the episode reached through the hop arrived at `/signin`: sign-in had already replaced the entry with `/onboarding`, so a replace-to-story left no in-app screen under it. The hop now replaces that entry with `/app/trail` and **pushes** the story (both calls in one tick, so no flash of home), and `page.goBack()` from the first story lands on the home screen. (3) Null goal: the hero, the sheet's chapter-goal card and the selector were already null-safe (`categoryRealityAr` only compares the goal; `preferGoal` falls through to the full pool), so the one untrue surface was the sheet's «تفضيلاتي» row — a skip writes the completion stamp and the row then claimed answered preferences. `preferencesIncomplete` now also requires `primaryGoal`. **One premise in the brief does not hold:** the skip sits on the second question, so a UI skip can never leave the goal null — the goal is answered before the link exists. Null-goal rendering is therefore proved with a seeded completed-but-goalless profile, not with Skip. Tests: `e2e/firstSessionChain.spec.ts` 5→11 (no back control on the first question, back to the goal from the second, `goBack` from story → home, skip defaults with the goal retained, goalless profile's hero and sheet, flag-off keeps the back control) and `tests/guidedHome.test.ts` +3 source contracts. Verified: `tsc` ×2 0 · `npm test` 156 files / **2067** · chain 11 + onboarding/guidedHome/More/accessibility/navOverlap **23 passed** · `verify --fast` 2/2. |
| 2026-10-22 | guidedHome 2 | **The two questions now end inside the first episode — no new routes, screens, endpoints, tables or deps.** `OnboardingRoute.onDone` sends a first-run learner to `/scenario/:id/story` when the flag is on and keeps `/app/trail` when it is off. Which id is a *resolution*, not a constant: new pure `src/lib/journey/opening.ts` (`resolveOpeningScenarioId`) picks the arrival when its row is on the device, else the first scene in `journeyOrderedScenarios`, else nothing (and today's route), because navigating to a missing id opens Story Setup on «لم نجد هذا المشهد» for the one learner the hop exists for. **Two facts the plan got wrong, corrected here rather than in it.** (1) The offline seed *does* carry `airport_arrival`: `seedStoryOpening()` (`src/lib/db/katzuDb.ts:589`) writes the row and its A1 phrases on every launch, so the hop is deterministic and the fallback is for a partial or pre-fixture cache — a browser cannot be made to produce that state (the row is re-added on mount), so the fallback is proved by `tests/openingScene.test.ts` instead. (2) The V2 episode ends at the Debrief, never at a quiz, so `scenario_training` for a **finished** scene still reads `quizAttempted: false`; `isUnfinished` therefore kept telling a learner who had just finished «أكمل من حيث توقفت», on every later open. `selectMission` gained an optional `completedScenarioIds` — a recorded session, not the quiz fields, decides a scene is finished — branch 4 also skips the opening once its conversation exists, and `JourneyHomeScreen` derives the list from `sessionsByScenario`. Day 0 also stops opening on a review mission: `reviewItems` are withheld from the selector until `firstSessionDone` (the sheet's row keeps its own gate). Both corrections are gated on the flag — with it off the home keeps its shipped mission logic byte-for-byte, including the loop, until the guided shape is walked. The preferences step gained one orientation line and a flag-gated «تخطَّ الأسئلة وابدأ الآن» that saves the default 10 minutes and leaves the goal unanswered rather than inventing one. Tests: `tests/openingScene.test.ts` (3), `tests/missionSelection.test.ts` +2, `tests/guidedHome.test.ts` +4 source contracts, `e2e/firstSessionChain.spec.ts` (5: arrival → practice, skip, flag off → home, resume after practice, and a finished conversation *not* offered as «continue»), and `e2e/onboarding.spec.ts` updated to the new exit. Verified: `tsc` and `tsc -p e2e` 0 · `npm test` 156 files / 2065 · all browser specs re-run 152 passed / 1 skipped (the first journey run's 5 live-turn failures were a dev server started without `VITE_WORKER_URL`; the suite's own `webServer.env` supplies it, and all 12 passed after). Not committed, not deployed. |
| 2026-10-22 | guidedHome 1c | **Day 0 in «المزيد» is the library alone — no new routes, screens, endpoints, tables or deps.** The sheet takes `firstSessionDone` and gates the grammar, listening, writing and coach rows on it: those are the Practice tab's screens, and step 3 locks that tab until the first finished conversation, so listing them on day 0 would be a side door around the lock. The home screen passes the same boolean it uses for the review row, so the lock and the sheet read one fact and cannot disagree. Pinned by `tests/guidedHome.test.ts` (four gates, the library deliberately ungated, the prop passed) and `e2e/guidedHomeMore.spec.ts` (the four rows absent on day 0, a due card alone still hiding writing, all four present after one session; the destinations test seeds a session and leaves day-0 library navigation to `banner`/`firstRun`). Screenshots re-shot at 390×844 in `docs/agent/guided-home/`. **Map housekeeping in the same change:** the change log's 2026-10-04-and-earlier half moved verbatim to `docs/agent/APP-MAP-ARCHIVE.md` (40 rows, 41.8 KB) and that file joined `DOC_EXEMPT` in `tests/agentDocs.test.ts`, because this map sat 9 bytes under its 135 KB cap while `AGENTS.md` §12 still requires the table. |
| 2026-10-22 | guidedHome 1b | **The six blocks the guided home hid are reachable again, in one sheet — no new routes, screens, endpoints, tables or deps.** New `src/features/journey/JourneyMoreSheet.tsx` (the existing `BottomSheet`/`useModalDialog` contract) behind one quiet 44px text row under the tasks (`data-testid="journey-more"`, `aria-haspopup="dialog"`, never auto-opens): «تابع التعلّم» (library, plus grammar, listening, writing and coach once a session is finished — wired to the Practice tab's existing routes from `AppShell`), the review queue, the earned-or-goal card, the weekly recap, the level line, the free-session ledger line (`freeSessionsCopy`: the Worker's number, or "not known", never a local guess), the Pro offer and the preferences edit. Two gates were fixed while doing it: the Pro chip had been dropped outright in 1a, so it now returns after the first completed session under `trial.shouldOfferPro` and lives in the sheet (the guided header stays orientation-only; the Debrief is still where the offer is made), and the sheet's review row uses `dueCount > 0 && firstSessionDone` while the inline row keeps its shipped `mission.kind !== 'review'` rule untouched, so flag-off stays byte-for-byte today. Tests: `tests/guidedHome.test.ts` (12), `e2e/guidedHomeMore.spec.ts` (6: every destination, day-0 emptiness, due card without a session, the post-session rows, 320 px no-overflow, 44 px rows), `openLibraryFromHome` in `e2e/harness.ts` restoring real navigation in `banner`/`firstRun`, and `navOverlap` now measuring the bottom-most button instead of a named testid. Measured at 390×844: home 1442→1155 px, the hero CTA 76 px higher. |
| 2026-10-22 | guidedHome 1a | **Journey Home answers one question per screen, behind a kill switch — no new routes, screens, endpoints, tables or deps.** `src/lib/flags/guidedHome.ts` resolves the device switch (`localStorage['kz.guidedHome']`) → `VITE_GUIDED_HOME` → build mode (ON in dev, OFF in a shipped bundle) as a pure, memoised `resolveGuidedHome`; OFF renders the screen that shipped before it byte-for-byte, because every change is `{!guided && …}` around unchanged JSX. ON keeps the hero (one action), the chapter strip and the daily tasks; the other six blocks moved into «المزيد» (1b). Measured at 390×844: page 1442→1095 px (−24 %), CTA top 557→481, tasks panel ending 3 px past the fold. Tests: `tests/guidedHome.test.ts` (switch precedence, the six gates, the hero and tasks never gated) and `e2e/guidedHome.spec.ts` (both switch positions in a browser). The plan and the conflicts it found: `docs/agent/GUIDED-REFINEMENT-PLAN.md`. |
| 2026-10-19 | V43 + V43.1 pages deploys | V43: debrief pillars/parts summary, mock-contextual paywall, daily-loop banner, Practice tile (`8fb96479-…`, `index-B5ReLSY0.js`). V43.1: the opener effect depended on the inline `mockPart` object, so the mock's 1 s clock reset the conversation every tick — turns vanished and a part could never be finished; it now depends on the part's fields, and `e2e/mockExam.spec.ts` drives all three parts to the debrief (`8fe6d07f-…`, `index-BfNVQ58w.js`, gate 14/14 in 773.1 s, smoke 4/2/0; rollback `5722462d-…`). No new routes/endpoints/tables/deps. |
| 2026-10-19 | V42 merge + deploy (the launch candidate) | **All three deploy targets touched per `docs/agent/DEPLOY.md` (owner words «merge and deply all all»); no new routes/screens/endpoints/tables/deps — the §14 manifests are unchanged (31 routes · 30 screens · 45 endpoints · 14 tables).** What went live: the owner-edited AI pool (`030961a`: NVIDIA/NIM flagship + OpenRouter mid defaults, dashboard-stored plaintext keys masked on every read, async `hasUsableProvider` on every AI route, Workers-AI fallback unchanged), the 2026-10-15 hardening batch (hook profiles, CI = one `npm run verify -- --ci` step, every-doc budgets, cost log), the curricula/progress/UX commit (`9d672e4`, incl. the marketing-shots rig), the two stale-contract e2e fixes (`7b52230` especially `2fa5acd`: the ask-practice Pinterest row pinned to the corrected translation files + one wrong-row assert, the welcome contract `إنشاء حساب جديد وابدأ` with the sign-in probe accepting both CI's no-`VITE_GOOGLE_CLIENT_ID` rendering (branch `تسجيل الدخول غير متاح الآن`) and a mock'd-id local build). **Merge:** `git merge --ff-only 2fa5acd` on `main` — branch is a strict descendant, linear history kept, pushed `a73a95b..2fa5acd` (no force); a stale local `main` (`df9fee8`) is an ancestor of `2fa5acd` (verified) so nothing extra published (`git log --oneline a73a95b..2fa5acd` = 64). **Pre-commit gate:** the runbook branch-gate `npm run verify -- --ci --e2e` **14/14 in 486.8 s** (3 noisy steps relabelled FLAKY, exit 0); **CI `39191010113`** = green (`verify`, `launch-check`, `secret-scan`, `e2e` = 141 passed / 2 skipped / 0 failed) for `2fa5acd`. **Worker:** `npm run deploy:worker` → live `66bd8b92-…` (was `56425f30-…`). **Pages:** build from the git push → production `f805663e-…` from `2fa5acd` serving `assets/index-DZrigzP5.js`. **Verified live read-only:** `/health` = `{status,service,ready:true,maintenance:false,storage:{d1:"ok",kv:"ok"}}` (shape changed by audited code `9c07b44` — never an accident: `git log -S 'storage:{d1:"ok"' cloudflare-unified-worker.js` says so; no pool/models/strategy); `/health` pre-deploy = `{status,service,ready:true,maintenance:false}` — the runbook's old "only four keys" line was updated this commit; `/crypto/health` unchanged (`ready:false`,`test_mode`); unauth `/admin/api/ai-providers` **401**, `/admin/api/me` **401**; `/` **200**. **Smoke:** `E2E_TARGET=production playwright e2e/productionSmoke.spec.ts` = §3 passed / 2 skipped / 0 failed (no rollback per the automatic triggers). **Rollback (recorded, not needed):** worker `npx wrangler rollback 56425f30-…`; Pages `2182564c-…` (source `a73a95b`). Marketing captures ride in history (65 MB, commit `9d672e4`; droppable only before a merge, too late without a rewrite). |
| 2026-10-18 | Haptics + purposeful motion | **One haptic API and a short list of motion, none of it a dark pattern — no new routes, screens, endpoints, tables or deps (APP-MAP §14 manifest unchanged).** `src/lib/utils/haptics.ts` gained the semantic vocabulary (`tap`/`select`/`success`/`warning`/`error`) with Capacitor → `navigator.vibrate` → silent as the device order and the older `triggerHaptic` kept as an alias, so the ~48 shipped call sites did not churn and keep their exact patterns. One switch (`hapticsEnabled?: boolean` on `UserEntity`, ABSENT = ON, so rows written earlier keep the designed feel) is persisted from Profile settings and mirrored into the module flag by `AppShell`'s existing `current_user` live query; `prefers-reduced-motion` and the switch both gate it. Two haptics were genuinely missing and added (paywall CTA = `select`, never `success`; destructive delete = `warning`, `error` only on a real failure). Motion: `.kz-pop` (correct verdicts), `.kz-shake` (wrong, 240 ms, once), `.kz-flip-in` (the review card's answer side), `.kz-orb-listening` (the mic halo now STAYS while listening, breathing at 1.4 s instead of vanishing), a rAF count-up on the report's unaided-sentence count, and `ProgressRail` moved from animating `width` to `transform: scaleX` (origin-right for RTL). Every class is neutralised under `prefers-reduced-motion` with the state still visible. **Evidence:** `tests/haptics.test.ts` (18, incl. toggle/unsupported/reduced-motion/bridge and an end-to-end wiring guard) and the new `feedback motion` block in `tests/designSystem.test.ts`; `npm run verify` **6/6**. **UNPROVEN:** real vibration on hardware — no phone and no device lab here, and iOS Safari has no `navigator.vibrate` at all, so iPhone is silent by design. Local only, not committed, not deployed. |
| 2026-10-18 | AI provider swap + owner-managed pool | **The default AI pool is NVIDIA + OpenRouter only (owner direction): Gemini and Groq default entries are gone, and the pool a request walks is now owner-edited from the admin dashboard.** New `cloudflare-ai-providers.js` — KV config `ai-provider-config` on `USER_PROGRESS` (`resolveProviderPool`: defaults minus owner-disabled + owner custom entries with their own base URL/model/format/tier/keys; stored keys win over env secrets). New admin API actions (`ai-providers`, `ai-provider-save`, `ai-provider-delete`, `ai-provider-default`, `ai-provider-test`) and an "AI Providers" dashboard tab with provider presets (OpenRouter, NVIDIA NIM, Groq, Google AI Studio, OpenAI, DeepSeek, Mistral, Together, Fireworks, Cerebras, xAI, Custom) — keys are stored server-side only and reads are masked to counts + fingerprints, never key material. Worker wiring injects the resolved pool at the single `callAiRouter` call site; `hasUsableProvider` is now async and pool-aware on every AI route; the internal `/ai/health` report describes the merged pool instead of Gemini key inspection. `PROVIDER_POOL` defaults: `nvidia/openai/gpt-oss-20b` (flagship, account-credit limits) and `openrouter/thinkingmachines/inkling-small:free` (mid, rpd 50 account-wide). Workers AI fallback unchanged. **UNPROVEN:** OpenRouter/NVIDIA key lists are still empty in production, so until the owner adds keys (dashboard or `wrangler secret put`) served turns ride the Workers AI fallback; preset model names/URLs are prefills, not verified endpoints. Not deployed. New `tests/aiProviderConfig.test.ts` (22); route/router suites updated to the new defaults. |
| 2026-10-06 | Journey path/library screen polish — shipped | **The trail screen (`TrailScreen.tsx` at `/app/library`) joins the launch-week polish: no new routes, screens, endpoints, tables or deps (APP-MAP §14 manifest unchanged: 31 routes · 30 screens · 45 endpoints · 14 tables).** One-column path with a node gutter (w-10, line at `start-[19px]`); node states done (filled purple + check) / current (ring + dot + the screen's single ambient glow) / locked (hollow); mission strip ~88px; rank card ~72px with `<bdi dir="ltr">` XP; the one-line Katzu greeting restored (`journey-greeting`, existing `checkIn.headline` copy, 22.75px) directly above the review strip — first path card still above the fold at 390x844 (bottom 624px, 220px slack, proven by `e2e/shots/journeyLayoutProbe.spec.ts`). **The "practiced but not independent" state is legible in the chip itself:** `PATH_CHIP_LABEL_AR` overrides `CAPABILITY_LABEL_AR` with `PRACTISING: 'تدرّبت عليه — لم تستقل فيه بعد'` (Trail-only) and the old hint row under the cards is gone. Review mission: subtitle «حان وقت تثبيتها», count kept only in the CTA «راجع 8 عناصر الآن» (pinned by `tests/missionSelection.test.ts`). e2e fixes: `navOverlap.spec.ts` scrolls until the real bottom (`scrollY >= scrollHeight - innerHeight - 1` — lazy hydration left the page short); `skillSurfaces.spec.ts` rank assertion split (`الرتبة 3 من 6` + `صياد الأُملاوت`). **Evidence:** 12 genuine before/after real-viewport shots in `docs/agent/journey-polish/` — all 6 pairs byte-DIFFER; 3 "before" files had been overwritten by a later rig run and were re-shot from the pre-polish tree `a821b18`; mascot contact sheet (review strip `thumbs_up`, path cards `trail_header` at 12px). **Gates (this session):** tsc 0 · tsc -p e2e 0 · `npm test` 139 files / 1787 passed · Playwright preview 132 passed + 2 skipped (pre-existing env-skips) · build 0 · design-audit 0 · contrast 0 · simplicity 29/29. **Deploy (`DEPLOY-AUTHORIZED: worker, pages`):** worker NOT deployed — no `cloudflare-*.js`/`wrangler.toml`/`migrations/` change since the deployed `349faf0` (V10-5/V17-3 precedent); live worker verified unchanged (`/health` identical, `/crypto/health` `ready:false` test_mode, unauth admin 401). Pages production `d3165772-4adc-4118-9895-b7e53188b407` from `6621c53`, serving `assets/index-B0IutCpH.js`; the polish proven in the shipped lazy chunk `assets/TrailScreen-DtGnRxP-.js` (new chip label present); `/` 200, `/demo` 200. **CI:** run `37494923231` — success (pushed sha `6621c53`). **Production smoke:** `E2E_TARGET=production npx playwright test e2e/productionSmoke.spec.ts` → 3 passed + 2 skipped (pre-existing), exit 0. **Rollback targets (recorded pre-deploy, not needed):** worker `315ec953-…` (older `476bac16-…`), Pages `43f5985a-…` from `a821b18` (older `67888b41-…` from `349faf0`). |
| 2026-10-06 | UI polish (launch week) — shipped verdict evidence | **Senior-UX review of four production screens fixed with CSS/layout/copy — no new screens, routes, endpoints, tables or deps (APP-MAP §14 manifest unchanged: 31 routes · 30 screens · 45 endpoints · 14 tables).** **G1:** five Arabic-Indic digits removed from UI strings («٦ دقائق» ×2, «٣٠ ثانية» ×2, the Guided-Practice «٣/٢» literal now derives from `String(totalSteps)`); `tests/westernNumerals.test.ts` extended from price/session tokens to ALL src strings, plus `tests/uiPolishLaunch.test.ts` (9 regressions: placeholder, achievement gate, LTR counters, one-glow). **G2:** every "n / m" counter now renders through the new `src/components/common/LtrCounter.tsx` (`<bdi dir="ltr">`) — Demo, Listening, Writing; Review's counter is Arabic prose «1 من N» under a rail (a "/" is direction-neutral, so «1 / 8» painted as "8 / 1"). **G3:** `.kz-tab-scroll` (nav + safe-area + 16px) on Journey Home + Practice. **G4:** tokens raised — body 1rem, caption 0.8125rem, micro 0.75rem (nothing <12px), Arabic line-height ≥1.6, `--kz-ink-dim` brightened to ≥7:1; contrast-check passes, no ratio lowered. **G5:** Journey Home keeps ONE ambient beam (the hero's); the earned capability card lost its second beam. **Screen 1:** DailyTasksPanel is a compact tappable-row checklist (status circle + one-line subtitle + chevron, 3-segment strip + count — per-task text buttons gone); hero shows scene art only (no second mascot); «المراجعة تعمل بدون اتصال» kept once; «قدرة مكتسبة» now renders ONLY from a recorded INDEPENDENT/RETAINED state, otherwise «هدفك في هذا الفصل» (verified: the gate is buildCapabilityModel's evidence ladder); footer is three 44px chips with the level as a chip. **Screen 2:** grammar/retrieval/listening collapsed into a ONE-OPEN accordion «تدريب أعمق (اختياري)» — default view is phrases + CTA, one input on screen; «أنا جاهز» is a sticky bar with the reassurance under it; selectGrammarRule CAPPED at the learner's level (regression-tested: the B1 rule no longer appears inside an A1 episode); word-order banks carry «رتّب الكلمات» in an LTR 44px row; readiness is dots + count; per-phrase level removed (header chip instead). **Screen 3:** cue/meaning is the headline with kind as a chip; «ما كتبته سابقاً» un-struck in secondary text; «خطأ سابق» → «للتثبيت»; disabled primary keeps ≥4.5:1 via `.kz-primary-disabled` (no 45% fade); «لا أتذكّر — أرني الإجابة» is a full-width outline button; close moved to a header icon; actions anchored bottom. All three result states (correct / almost / incorrect) use warm tones only — `text-kz-neon` / `text-kz-lavender` / `text-kz-warm` (RGB 255,201,138 peach, not red) for the icon + verdict line; the «almost» and «incorrect» states captured as 390x844 screenshots in `docs/agent/ui-polish/` (`review-verdict-almost-390x844-after.png`, `review-verdict-incorrect-390x844-after.png`) from test-only fixtures (never prod data). **Screen 4:** lead card is the review-due entry (same `countDue` the Journey hero reads); first stat chip is «للمراجعة اليوم», total moved to the vocab title; drill tile renamed «تدريب الأخطاء» (it opens the retype modal — different from the «ملف أخطائك» patterns card, verified); grid 3-col, 24px icons; «فلاش كاردز» → «بطاقات المراجعة»; filters «الكل (n)/المحفوظة (n)». Before/after screenshots (390x844 + 360x740, real viewports): `docs/agent/ui-polish/`. **Shipped verdict evidence:** `e2e/shots/uiPolishShots.spec.ts` seeds three due cards (exact answer / wrong-article answer / different-noun answer) and grades each to its verdict, screenshotting correct · almost · incorrect at 390x844; the rig's webServer cwd fixed to the project root. **Gates (this session):** tsc 0 · tsc -p e2e 0 · `npm test` 139/1787 · Playwright preview 122 passed + 2 skipped · build 0 · design-audit 0 · simplicity 29/29 · contrast 0 · `npm audit --omit=dev` 0 vulns. Local only — pushed, not yet deployed. |
| 2026-10-05 | C4 Play readiness | **An install that identifies itself once, and an offline open that is measured.** The manifest gains the install-identity fields it was missing: `id: '/'`, `start_url`, `scope`, `orientation: 'portrait'`, `categories`, and two Arabic launcher shortcuts (`/mock`, `/app/trail`) that stay inside the scope — without `id` a deep link can install as a *second* app beside the one the learner already has. `assetLinksContent({packageName, certSha256})` in `vite.config.ts` emits `/.well-known/assetlinks.json` at build time: a real statement as soon as both variables are present, and `[]` otherwise — an empty list fails Android verification as loudly as a missing file, which is honest, whereas a placeholder fingerprint would make a wrong certificate look configured. Measured, not assumed: `npm run measure:perf` (Lighthouse 13 via its Node API, because the CLI loses the report when its temp profile cannot be deleted on this Windows host) scores **performance 0.87** at **360x640 @2x simulated** — FCP 2.7s, LCP 3.5s, TBT 20ms, CLS 0. Every non-localhost host is mapped to a dead port first, because a Kaspersky web-injection script on this machine otherwise adds 151 KiB of render-blocking JS and understates the score by 8 points (0.79 contaminated). Lighthouse 13 has **removed the PWA category**, so installability is proven directly instead: `e2e/playReadiness.spec.ts` under `e2e/playReadiness.playwright.config.ts` (service workers allowed, which the main suite blocks on purpose) confirms the served manifest, the assetlinks path, and a **cold offline reload rendering the app shell** — the claim the product is sold on. `src/lib/trust/dataSafety.ts` drafts the Play Data Safety answers with the derivable parts re-derived from `package.json` and the analytics allowlist in `tests/dataSafety.test.ts`, and the owner-dependent answers marked UNCONFIRMED. |
| 2026-10-05 | C3 payments hardening | **A spent code and an unreachable database are no longer the same answer.** New `cloudflare-code-abuse.js`: `isDuplicateCodeError` distinguishes a UNIQUE violation from a D1 outage, so `/verify` answers `already_redeemed` only when the database says the constraint was violated and otherwise returns 503 `ledger_unavailable` with `CODE_LEDGER_UNAVAILABLE_MESSAGE` — telling a paying learner their code is gone while it still works was the worst available lie. `lockoutMsFor`/`decideCodeAttempt` escalate a brute-force defence that starts at five failed attempts and doubles per extra attempt up to one hour, keyed on the ACCOUNT (KV `codefail:<sub>`, best-effort by design: a KV outage must never lock a real buyer out), cleared by `resetCodeAttempts` on any success; both messages are Arabic. `activationDelayMs` in `cloudflare-crypto.js` reports the real transfer-start → code-activated gap from the timestamps D1 already holds (null when missing, never 0) and logs it on every delivery, so the activation estimate on the purchase screen can be replaced by a measurement. New `src/lib/offers/paymentInstructions.ts` gives Arabic, per-region payment steps with the caveat and timing marked UNPROVEN, shown on the buy click for the region the SERVER resolved. Crypto stays in test mode: nothing about payment configuration changed. |
| 2026-10-05 | C1 trust pages | **Legal text as fields, and the one sentence that must not be wrong, derived.** `src/lib/trust/content.ts` replaces the hand-written paragraphs: sections are `headingAr` + `bodyAr`, the app fills what it can prove from its own code and every part only the owner can state is a `{{OWNER_FILL}}` placeholder. The processed-data list is **computed from `ANALYTICS_EVENTS` and `ALLOWED_PROP_KEYS`** — the same constants the worker enforces — so the privacy page cannot drift from what is actually collected; a test compares the page's claims with the allowlist. `scripts/check-launch.mjs` counts the open fields and lists them by section; `npm run check:launch:strict` fails while any remain. The new CI job `launch-check` **does not swallow its result** (the repo forbids that everywhere): it runs `LAUNCH_VERIFY=1`, which executes the strict gate and fails unless the gate behaved — exit 1 exactly while a field is open. Today: **10 open fields** (`refund`, `law`, `what`, `how`, `window`, `publisher`, `representative`, `registry`, `supervision`, `dispute`), all owner-only. New public `/delete-account` page for erasure that does not depend on still holding a session: a signed-in learner is deleted immediately through the existing server path, and anyone else has a mail route that asks for nothing but their email. 12 tests. |
| 2026-10-05 | B6 launch day | **Countdown, reminder, share — and one teacher rule.** `examCountdown.ts` counts CALENDAR days to the learner's own date: a missing date says nothing and a passed date is never counted toward again, and the line is shouted only for an exam inside thirty days. `selectDailyMission` gained `targetDate`/`targetDateKind` and attaches `countdownAr` in a wrapper, so the date is a second fact about today and never changes which scenario is chosen (pinned by a test that asserts the scenario is identical either way); it renders on Journey Home and the trail. `ics.ts` builds the reminder as a FILE the learner owns — no push server and no VAPID keys exist yet, and a promise the app cannot keep is worse than a file that does what it says — with the day BEFORE the date, at local time (never `Z`), RFC 5545 escaping and 75-octet folding. `share.ts` shares the learner's own number as a *practice estimate* in the same words the card uses, and drops any referral code that does not match `REF-[A-Z2-9]{8}` rather than putting it in a URL. `/admin/codes/report` gains `teacher_reward`: rewards count **redemptions, never codes printed** (`created − activated` is reported as outstanding and earns nothing), at an owner-set, **UNPROVEN** one month per verified activation. 21 unit tests + 3 Playwright; the share **e2e currently SKIPS** in this environment — the scripted mock does not reach its debrief — so the share text and link are covered by unit tests only. |
| 2026-10-05 | B5 events + admin funnel | **The launch funnel, measured where the owner can read it.** Raw analytics live in KV and expire in 30 days, so "did the free mock convert in Egypt" was unanswerable with SQL. Eight events (`FUNNEL_EVENTS`: `onboarding_goal`, `mock_start`, `mock_finish`, `debrief_view`, `paywall_view`, `upgrade_click`, `code_redeemed`, `share_click`) are now mirrored into `activity_log` through the injected `recordActivity` — additive, best-effort, and only for those eight; everything else stays in KV. Two allowlisted props join the contract, `region` and `cell`, both derived server-side from `/pricing` (a two-value country group and a bucket index), so the cuts answer "which price works" without storing where anybody lives. `/admin/api/overview` gains `funnel`: step counts as **distinct accounts**, step-to-step conversion that prints **no rate when the denominator is zero**, the sequence cut by region and by cell (views → clicks → purchases), `region_mismatches_30d`, and D1/D7/D30 cohort counts. `/verify` records `code_redeemed` with the learner's group; `region_mismatch` is logged only when the **code itself carries a region group**, which today none does, so the counter honestly reads **0** instead of inventing a comparison. New `tests/funnel.test.ts` (7). |
| 2026-10-05 | B4 paywall | **One priced offer, in server order, with the limits stated.** New `GET /pricing` returns `catalogueFor({ group, cell })` with the group read from `CF-IPCountry` and the Exam Pass cell from a hash of the account, so a client cannot price itself; anonymous visitors get the standard group and **no cell**, because inventing a bucket for someone who cannot be charged would make the first price they see differ from the price asked. New `/paywall` (`src/features/offers/PaywallScreen.tsx`) leads with Exam Pass, compares Monthly second and offers the single mock **as a link**; every amount comes from `/pricing` and a failed call shows **no price and no buy button** rather than a number the app invented. `src/lib/offers/pricing.ts` holds the promises and asserts their shape: no "unlimited", no "lifetime", no guaranteed pass (`FORBIDDEN_CLAIMS_AR`), the fair-use cap stated on the card that carries the price (120 AI requests/day, **UNPROVEN** — derived from measured cost, not observed abuse), and the refund line shipped as the `{{OWNER_FILL}}` placeholder C1 will gate on. Redemption stays the existing `/verify` code path, opened from inside the offer. New `tests/offer.test.ts` (14) + 3 Playwright. |
| 2026-10-05 | B3 free B1 mock | **One free B1 Sprechen mock per account, server-gated.** New `cloudflare-mock-exam.js` owns the three parts (plan together · present a topic · react to questions), their briefs, the B1 topic cards and the examiner's prompt words — the app renders what `/mock/start` mints and never invents a rubric. `POST /mock/start` claims the free seat from a D1 `PRIMARY KEY` insert (`mock_free_claims`) with `mock_sessions` as the idempotency key, mints a signed 45-minute grant bound to the account, and answers with what the debrief may show. A verified grant lets a B1 turn through the level floor and replaces the scenario's persona, title and safety category with the examiner's (`MOCK_EXAM_PERSONA`), so the model is never told it is both a café server and an examiner. `estimatePracticeScore` computes the **practice estimate** from what the session measured — independence, accuracy, coverage, pacing — and returns `null` rather than a number when too little was said; no pass mark, no exam-body name, and `mockStart`/`debriefView` cap a free learner at two corrections while stating how many are locked. **Timings and prices are UNPROVEN.** Test totals for this item: 30 server + 14 client unit + 3 Playwright. |
| 2026-10-05 | Batch 2 (pricing layer) | **One server-owned price table with a region resolver, plus entitlement durations.** New `cloudflare-pricing.js`: `PRICES` (standard €29/€12.99/€9, special SY/EG/IQ/PS €12/€5/€3), `PASS_CELLS` for the experiment, `regionGroupFromCountry`/`FromRequest` reading the **Cloudflare country header**, and `experimentBucket` as a deterministic hash of the account id. Unknown, absent and unrecognised countries all resolve to **standard** — anything unmapped fails toward the more expensive group, never the cheaper one. Entitlements: `pass90` +90d, `monthly` +30d, `mock` no expiry (a count, not a clock), with a **strict** expiry comparison pinned at the millisecond and a 7-day reminder that never fires after lapse (`55e74d4`, `8b3ad4f`, `33ec8e0`). **CI:** `37285620163` **success**. **Worker:** `30d65294-3cd9-4251-9aca-229bd6bf7662` (rollback `115d5630-402e-4fbe-ae6b-d3b93c2fe2f8`). **Verified live:** `/health` ready:true · unauth `/admin/api/overview` **401** · `/admin/schema` **401** · `/crypto/health` unchanged (`ready:false`, `test_mode`). **UNPROVEN:** every price, marked `unproven: true` in the payload itself. The authenticated closing proof (translate cache hit, cheap tier on an easy turn, code redemption) is **blocked on the owner** — sign-in is Google-only, so no throwaway account can be made by an agent; it is item 0 on the OWNER LIST. |
| 2026-10-05 | Batch 1 finish | **Cheap-model routing and hashed translate cache shipped.** `isEasyTurn` (A0/A1, ≤60 chars, never the graded turn; fails closed) drives `tierWalkFor`, which **reorders** the provider walk so an easy turn starts at `mid` while `flagship` stays reachable — failover is structurally unchanged (`ecd4796`). `translateCacheKey` replaces the raw sentence as the KV key: the old key exceeded the 512-byte KV limit for long sentences, so the 30-day cache silently did nothing for exactly the inputs that benefit most (`821176f`). The report now prints cheap-routing before/after at an assumed 50% easy share — **$0.0082 → $0.0062 per user-day (~25%)**, the share marked **UNPROVEN** (`5b4dc4a`). **CI:** `37277034302` **success**. **Worker:** `115d5630-402e-4fbe-ae6b-d3b93c2fe2f8` (rollback `bf272ecf-8ed9-40f6-9e87-63bb4b811e89`). **Pages:** `48617093-bd19-41d9-9c5b-f9d5c743bb11` from `0ead9c2` (rollback `4aa3fcb4-02d5-4683-92c2-044d6fcc8765`). **Verified live:** `/health` ready:true · unauth `/admin/api/overview` **401** · `/admin/schema` **401** · `/crypto/health` unchanged (`ready:false`, `test_mode`) · app `/` **200** · `/sw.js` **200** · service worker **active** (`controller: true`) · `/demo` **zero `/ai/*` calls** with only `/scenarios`, `/vocabulary`, `/grammar` on the wire, root populated, **console empty**. **UNPROVEN:** the live cache hit and the cheap tier on a real turn — `/ai/translate` and `/ai/turn` both require a session (**401** unauthenticated), so neither is provable without a learner's credentials; both are covered by tests against the route, not by observation. |
| 2026-10-05 | Batch 1 deploy | **Worker and Pages shipped; CI green on `cc30ed8`.** Four items: the global daily AI spend cap (`be758b7`), generated `robots.txt`/`sitemap.xml` from `VITE_PUBLIC_APP_URL` (`d5c5560`), the named `isSpeechOutputAvailable()` TTS capability check replacing three duplicated inline guards (`fe6d507`), and the cost report (`cc30ed8`) that prints cost per turn/per mock/per user-day per tier and recommends `AI_DAILY_SPEND_CAP: 292`. **CI:** `37270847744`, `37271786937`, `37272297016`, `37272827445` — all **success**. **Worker:** `bf272ecf-8ed9-40f6-9e87-63bb4b811e89` (rollback `d2844175-2827-4c19-b7ba-60b0981f5569`). **Pages:** `4aa3fcb4-02d5-4683-92c2-044d6fcc8765` from `cc30ed8` (rollback `186ae441-3ae1-4368-8844-391def7a2942`). **Verified live:** `/health` `{status,service,ready:true,maintenance:false}` · unauth `/admin/api/overview` **401** · unauth `/admin/schema` **401** · unauth `/crypto/webhook` **401** · `/crypto/health` unchanged (`ready:false`, `test_mode`) · app `/` **200** · `/sw.js` **200` · service worker **active** (`controller: true`) · `/demo` made **zero `/ai/*` calls** with only `/scenarios`, `/vocabulary`, `/grammar` on the wire, root populated, **console empty**. **Item 2 proven by artifact:** live `/robots.txt` and `/sitemap.xml` are now generated and advertise `/trust/privacy`, and `katzu.app` is gone from production. **Known limitation:** the live sitemap emits *relative* `<loc>` values because the Pages project has no `VITE_PUBLIC_APP_URL` set; the sitemap spec wants absolute URLs, so the owner must set that var before relying on indexing. The fallback was chosen over inventing a host. **UNPROVEN:** the spend cap's live behaviour — `AI_DAILY_SPEND_CAP` is unset, so the code is deployed but inert until the owner sets it. Prices behind the recommended 292 are UNPROVEN. |
| 2026-10-05 | S1.2 (S1 in progress) | **Reading dead-end removed from Progress.** `ProgressScreen` listed four skills under «المهارات الأربع» and gave Reading its own «لم يبدأ بعد — قريباً» — a promise with no practice surface behind it. Reading is now withheld by a named `PROGRESS_SKILLS` constant (one line to restore when it ships), the heading reads «المهارات», and every unmeasured row says «لم تُقس بعد». The e2e is inverted rather than deleted: it previously *required* the «قريباً» promise to be visible and now requires it to be **absent** while keeping the three «لم تُقس بعد» rows. Marketing is untouched on purpose — the skills grid labels each skill from a real `ready` flag and the "coming" section says «نُطلقها فقط عندما تكون جاهزة وقابلة للقياس», which is an honest status, not a dead end. **Gates:** `tsc` 0 · `tsc -p e2e` 0 · `npm test` **117 files / 1453** 0 · `E2E_TARGET=preview npx playwright test e2e/progress.spec.ts` **2 passed** 0. **CI:** run `37265195625` for `e40b44e` — **success**. **Deploy (pages only — no `cloudflare-*.js`/`wrangler.toml`/`migrations/` in `fd57e02..e40b44e`, so the worker was deliberately left untouched):** pushed `fd57e02..e40b44e`; Pages production **`186ae441-3ae1-4368-8844-391def7a2942`** (source `e40b44e`), serving `assets/index-CZVxbqGH.js`. **Verified live:** `/health` `{status,service,ready:true,maintenance:false}` · unauth `/admin/api/overview` **401** · app `/` **200** · `/sw.js` **200**. The fix was confirmed in the **shipped lazy chunk** `assets/ProgressScreen-D5FmUidi.js`, not inferred from the bundle hash: «لم يبدأ بعد» **0** occurrences, «لم تُقس بعد» and «المهارات» **1** each. **Rollback targets, recorded and not needed:** Pages `e538669f-e287-4f4b-82d7-02ee88182803` (source `fd57e02`); worker untouched at `d2844175-2827-4c19-b7ba-60b0981f5569`. |
| 2026-10-05 | S1.1 | **Translate path pinned by regression tests (no production change).** The field symptom `net::ERR_ABORTED` was never a missing timeout or retry: `fetchWithTimeout`/`AI_REQUEST_TIMEOUT_MS` (30s) and `translateTextReliable` (3 attempts, 500/1500ms backoff, `''` on give-up) have both existed since V19, and both call sites already render «تعذرت الترجمة — أعد المحاولة». Six tests in `tests/workerClient.test.ts` now pin that behaviour — first-attempt success without retry, success on retry, exactly three attempts then `''`, the measured 500/1500 gaps, abort at the timeout, and a blank input costing no fetch. The timeout double rejects on `abort` like a real `fetch` (APP-MAP §11.7); a double that simply never settles hung the test and proved nothing. |
| 2026-10-05 | L0 | Launch-hardening baseline. The "Excellence A/B work is local and uncommitted" premise was **UNPROVEN and false**: the tree is clean at `85ed663` (2 untracked owner files), so there was nothing to batch-commit. Baseline gate found one real failure: `tests/secretScan.test.ts` timed out at Vitest's 5s default while the scan it runs finishes in ~2s alone — the case shells out to node + one `git grep` per pattern and runs beside 127 other workers, so the budget was wall-clock, not work. Fixed by giving the spawning cases an explicit `SPAWN_TIMEOUT` (assertions untouched) and recorded as MEMORY lesson 40. Baseline: `npm test` **128 files / 1643 tests** green. Also: a stale `vite preview --port 3000` from a prior run held the port and silently blocked the preview gate (MEMORY 2) — freed before measuring. No deploy. |
| 2026-10-05 | L1 | **One price, from one place.** Four surfaces quoted money three different ways: the landing page, the gate modal and the redemption screen mirrored `/crypto/health` (`priceUsd`, **dollars**, check-out still `ready:false`) behind a hardcoded «5 دولار / شهر» fallback, while the paywall screen read `GET /pricing` (**euros**). A learner could be told 5 USD on one screen and 29 € on the next, and the fallback was reachable whenever the fetch failed. New `src/lib/offers/priceSource.ts` is the one loader: one `/pricing` call shared by concurrent callers, cached for the page load, and a **failure is not cached** so a paywall can recover on the next mount. `PaywallScreen` now reads it too, so all four agree by construction. The hardcoded fallback and the whole `/crypto/health` price path are **deleted** from `links.ts`; crypto check-out code is untouched. Failure shows **no price and no buy button** on every surface, never a stale number. **Pass tiers (L6):** the modal offers exactly `pass90` (3-month, recommended) and `monthly` — the server has never priced a yearly or student tier, so there is nothing behind a toggle to reveal. Tests: `tests/priceSource.test.ts` (**16**, replacing the obsolete `tests/planOrdering.test.ts`), incl. source scans that no app file reads `crypto/health`, `priceUsd`, `FALLBACK_PRICE_LABEL` or a hardcoded currency amount; `e2e/paywallPricing.spec.ts` +4 (landing↔paywall parity, no amount on failure, modal tiers, modal no-buy). `npm test` **128 files / 1655** · `tsc` ×2 clean · build 0. |
| 2026-10-05 | L2 | **The free-session promise says three, because the Worker enforces three.** `MAX_FREE_AI_SESSIONS = 3` was mirrored nowhere on the client, so the landing page hand-wrote «٣ جلسات» in two places, the paywall rendered «3 جلسات» through `arCount`, the Dexie seed hard-coded `freeSessionsRemaining: 3`, and the playbook's §9.1 draft promised **one** session («مرة وحدة» / «جلسة محاكاة مجانية وحدة») — four numbers for one allowance, two of them wrong. Now: `src/lib/entitlement/trialCopy.ts` owns the mirror (`MAX_FREE_AI_SESSIONS` + `MAX_FREE_SESSIONS_AR`) and every surface reads it; the Dexie seed points at the same constant; `tests/trialPromise.test.ts` (**11**) reads `MAX_FREE_AI_SESSIONS` **out of `cloudflare-unified-worker.js`** and fails on mismatch, plus source scans that no surface hand-types a count. **Numerals:** Arabic prose takes Arabic-Indic digits now — new `toArabicDigits()` in `src/lib/i18n/arabicCount.ts` feeds the already-present-but-unread `arCountWith` (MEMORY 21), so the paywall says «٣ جلسات» like the landing page. One existing assertion in `tests/v31HonestMoments.test.ts` updated for the digit shape; its subject (server number, not the local seed) is unchanged. **Playbook:** §8 pricing table corrected from $15/$30 to the server's €12,99/€29 standard group with the special-region and `unproven` notes, and §9.1 FS1–FS3 rewritten to three sessions ⚠️ native read. `npm test` **129 files / 1666** · `tsc` 0. |
| 2026-10-05 | L4 | **Four events the funnel could not see.** `free_session_exhausted` (fired only on `FREE_QUOTA_EXHAUSTED` — a level lock is NOT exhaustion and counting both would understate the allowance), `exam_date_set` (lead time in **days**, never the date), `referral_converted` (fired only when the server accepted the claim; the code never travels in the event), `share_landed` (the receiving half of the existing `share_click`, fired once per page load in `App.tsx` when the address bar carries a `ref`). `free_session_exhausted` and `referral_converted` are added to `FUNNEL_EVENTS` so they get a durable D1 row, not only the 30-day KV window. **Deliberately not added:** `share_clicked` (the existing `share_click` already fires at all four share surfaces — a second name would split the funnel) and `order_intent` (**no client path exists**: the app never creates an order, check-out is the separate sales site, and `purchase_clicked` already marks the outbound buy). New `tests/launchEvents.test.ts` (9) walks the whole app and asserts every `track()` name exists in BOTH allow-lists, plus the privacy assertions on each new event. `tests/funnel.test.ts` 8→10 and `tests/workerClient.test.ts` updated for the new counts. `npm test` **131 files / 1702** · `tsc` ×2 clean. |
| 2026-10-05 | L9 + L10 | **Cost safety, and two first-user-path truths.** **The spend cap was invisible to learners.** `AI_DAILY_SPEND_CAP` was read and enforced (`checkDailySpendCap`, and it runs *before* the trial ledger — so a free learner's session does count against the bill, verified in the source), and the Worker already sent an Arabic `DAILY_SPEND_CAP_MESSAGE` with a 503. The client had **no case for that code**: it fell through to `AI_SERVICE_MESSAGE_AR` — «تعذر إكمال هذا الدور» — which reads as the learner's fault and invites exactly the wrong action, retrying into a closed door. New `DAILY_SPEND_CAP_MESSAGE_AR` in `src/lib/conversation/stateMachine.ts`, matched **before** the `/quota/i` branch so it cannot be swept into the free wall, `kind: 'network'` + retryable (the cap lifts on its own). **MITIGATED, NOT FIXED:** `/ai/translate` `net::ERR_ABORTED`. The root cause is not provable from code — the abort is `fetchWithTimeout`'s own 12 s `AbortController` firing on a cold cache — and a bounded retry plus a visible Arabic `translationState: 'unavailable'` with a way back already existed in both callers. Pinned rather than changed, so neither can vanish silently. **Trail placeholder removed:** `ScenarioBanner` printed «صورة هذا الموقف (16:9) ستُضاف هنا» — a developer-facing note shown to the one person who cannot act on it, in the slot forming a learner's first impression of the situation. A scenario without artwork now looks like a lit scene and says nothing. **Reading skill:** verified already honest — the card is a `<div>`, not a button, so there is no dead tap target; now pinned. New `tests/launchSafety.test.ts` (**17**). `npm test` **132 files / 1719**. |
| 2026-10-05 | L8 | **A read-only order view, because the 12h promise had no clock on it.** Playbook D8 promises «يصل الكود خلال ١٢ ساعة» and nothing measured it. New `GET /admin/api/orders` → `listOrders` in `cloudflare-admin.js`: one `SELECT` over the existing `crypto_orders`, no write, no new table, no new auth path. It returns the alias (claim token, truncated to 12 — enough to recognise an order, not the whole handle), the pass in words (`monthly`/`pass90`/`Nmo`), method, status, **code minted vs redeemed as two separate booleans**, and `hoursSincePaid` measured **from `paid_at`, not `created_at`** — the clock the buyer was promised starts when their money landed. `CODE_DELIVERY_PROMISE_HOURS = 12` is a constant rather than a number typed into the view, so the admin and the copy cannot disagree. The honest case is the important one: an unpaid order reports `withinPromise: null`, **never `true`** — there was no delivery to be late for, and reporting "on time" would show a promise kept that was never started. **UNPROVEN live:** `crypto_orders` is still `test_mode`, so this may be empty in production until check-out goes live. Tests: `tests/adminOrders.test.ts` (**16**), incl. 401 with no secret, 401 with the wrong secret, POST refused, and a source scan that no statement is anything but `SELECT`. |
| 2026-10-05 | L5 | **The landing page, in the order a stranger decides in.** F9: hero → demo → proof → price → founder → questions. Four sections are **gone** — `WhySection`, `WhoItIsForSection`, `StepsSection` and the trailing `FinalCta` — because each repeated what the hero already said, and a page that ends with a second CTA has two main actions. **Founder line:** new `FounderSection` carrying the playbook §3.6 non-affiliation sentence **verbatim** (`NON_AFFILIATION_AR`, asserted against the playbook by test), placed above the FAQ because price is exactly where somebody asks "is this official?". It deliberately names **no author** — the repo does not state who builds this, and inventing a founder is the same defect class as inventing a screenshot; the only claim it makes is the one the product keeps (everything measured, and unmeasured things labelled as unmeasured). **Proof:** the repo has **no product screenshot**, so none was fabricated — the proof section carries real German correction pairs, and a test walks every `src`/`href` in the file and fails if one names an asset that is not shipped. **Share tags:** `og:locale ar_AR` + `og:locale:alternate en_US` and `twitter:card summary_large_image` in `index.html`; `og:image` stays root-relative and **no host is hardcoded** (`katzu.app` does not resolve — asserted absent). A designed Arabic-text share card is **NOT built and NOT invented** — see OWNER-OPEN. **Funnel unchanged:** all four steps (`landing_viewed`, `demo_started`, `signup_started`, `first_independent_turn`) still fire separately; a test scans the whole app for them. New `tests/landingMinimal.test.ts` (**15**) + `e2e/landingHero.spec.ts` (**5**), which measures the rendered headline at **390 px** (line boxes, not character count) and asserts the CTA is above the fold. `design-audit` 0, contrast 0. |
| 2026-10-05 | L7 | **The Trail leads with the exam scenarios.** `examFirstScenarios` in `src/lib/levels/levelSpec.ts` (pure, next to the other curriculum-order rules): `exam_*` first, then everything else, each group in the author's own `sort_order`, stable on ties. It only reorders — **nothing is hidden**, and the «اعرض بقية المشاهد» control and `TRAIL_PREVIEW_COUNT` are untouched, which is pinned by a test reading the screen source. A learner who came to prepare for an exam previously met five everyday situations first and had to know that `exam_` meant what it meant. New `tests/trailOrdering.test.ts` (**10**). `npm test` **134 files / 1745**. |
| 2026-10-07 | V41 | **The Trail is a journey, and every card leads with its own banner.** **Order:** supersedes L7 (`examFirstScenarios`, above). That function sorted each group by `sort_order` — a field no scenario row carries (the column is `sequence_order`, and `GET /scenarios` does not order by it either). `Number(undefined ?? 0)` was 0 for every pair, so the sort was a no-op and the list silently fell back to Dexie's primary-key order: **alphabetical by id**. Its test passed because it called the function directly with fixtures that *did* set `sort_order` — a rule the app never ran against a real list. New `src/lib/content/scenarioOrder.ts` owns the order as content logic: nine journey stages (arrival → first words → everyday → home → official → health → work → interviews → exam practice) with an explicit id→stage map, a category/prefix fallback so new content lands sensibly without editing the file, and a total sort (stage → named order within stage → `sequence_order` → id) that never reads the input order. `exam_*` sits last **at the owner's direction** (2026-10-07) — the reversal is the single behaviour change against L7. Reorders only: nothing is filtered, `TRAIL_PREVIEW_COUNT` and «اعرض بقية المشاهد» are untouched. `examFirstScenarios` deleted from `levelSpec.ts`. **Card:** `ScenarioBanner` was a 96px thumbnail rendered only when a scenario had artwork, so most situations were a text row beside a photographed one. Every path card now leads with a **full-width 16:9 banner** and the **Arabic title as the headline** (`title_ar` bold/primary, `title_de` one line beneath as the thing being learned) — the learner is choosing a situation, not reading German they have not met. Art-less scenarios show the scene's real procedural lighting, never a grey box. `scenes.ts` gained art for the six categories that had lighting but no picture (`exam`, `visa`, `study`, `services`, `trades`, `basics`) — floors from the same local set, overridden per scenario by `banner_url`. **Gates:** `npx tsc --noEmit` 0 · `npm test` **139 files / 1792** · `E2E_TARGET=preview npx playwright test` **129 passed / 1 failed / 2 did-not-run** — the failure was `e2e/shots/journeyLayoutProbe.spec.ts`'s `thumbnail ≤120px` ceiling, which encoded the compact design this batch replaced; restated as "banner spans the card" (≥200px) plus the 16:9 ratio, with the first-card-above-the-fold assertion it was protecting kept and still passing (measured 171px tall at 390×844), then **3 passed**. Running that suite also regenerated six committed `docs/agent/journey-polish/*-before.png` evidence images, **restored to HEAD**; `e2e/test-results/` removed. **Content rows untouched** (no `title_ar` rewrite, no new scenarios) — the owner chose code-only, so no Content Gate review file and no production D1 write. Uncommitted, undeployed. |
| 2026-10-05 | L3 | **The channel tag `?src=`, end to end.** New `src/lib/attribution/source.ts` owns it: `sanitizeSource` accepts only `[a-z0-9_-]{1,32}` (case folded), and everything else is **dropped, not trimmed** — a URL, an email or an Arabic sentence cannot become content in a field the admin renders. Captured on **every route change** in `App.tsx` (the tag often arrives on `/demo` or on the signup link itself, so a one-shot boot capture would lose exactly the visits that matter), held in `localStorage`, sent to `/auth/session` as `source`, and forwarded by `buildSalesUrl(ref, src)` — `ref` and `src` travel **together**, neither replacing the other. **Server-side:** additive `users.src TEXT` + index in `ensureRegistryTables`, with the `ALTER` deliberately outside the `CREATE` batch (a D1 batch is transactional, so on a fresh database the ALTER would fail with *duplicate column name* and roll the whole bootstrap back) and the *already exists* case treated as the steady state. `sanitizeSrcTag` in `cloudflare-admin.js` repeats the grammar server-side — a client can be bypassed — and `describeUser` now returns `src`. **Naming:** the column is `src`, not `source`: `describeUser.source` already means *which store the record was read from* (`users`/`email_index`), and one name with two meanings in one response is a silent bug. Tests: `tests/sourceAttribution.test.ts` (**27**, incl. client/server grammar equality) + `e2e/sourceAttribution.spec.ts` (4). `tests/adminRegistry.test.ts` corrected from "no ALTER at all" to "only `ADD COLUMN`, nothing else" — the same correction the content bootstrap already needed — and 5→6 additive columns. `npm test` **131 files / 1702**. |
| 2026-10-05 | L11 | **The CI failure this launch work cost, paid down with a guard.** Run `37336858313` failed the unit job on Linux with ENOENT while the identical tree was green on Windows: `tests/launchEvents.test.ts` read its input as `src/features/analytics/../../lib/analytics/events.ts` — a directory that does not exist, which Windows resolves anyway and Linux refuses, so the defect surfaced as a missing file only in the one place nobody was watching. The test now names the file directly. New `tests/repoPaths.test.ts` (**4**) pins the rule over the whole unit suite: every path literal handed to `readFileSync` — **or to the local read helpers** (`source`, `read`; routing through a wrapper is how the bug hid from the guard's first draft, which scanned only direct calls) — must exist, must reach its file only through directories that exist (**segment-walked**, not `existsSync`-checked, because `existsSync` is exactly what lies here on Windows), and must be relative. The guard was verified the only honest way: the broken path was reintroduced, the guard failed, the fix restored it. MEMORY lesson 41. `npm test` **136 files / 1764**. No deploy. |
| 2026-10-06 | L12 | **One digit shape: a price or a session count is a Western digit.** L2 had made the numerals in Arabic prose Arabic-Indic («٣ جلسات», «٢٩ €»); the owner reversed that for the two classes that are quantities rather than prose. `MAX_FREE_SESSIONS_AR` and `sessionsPhrase` now go through `arCount` (Western by construction), the referral reward copy says «3 أيام», the FAQ example says «25 سنة», and the playbook's build-ready §8/§9.1 are Western throughout (prices, plan months, the session table, the ordinals and counts). Removed `toArabicDigits` and `arCountWith` — the ٣ helper — from `src/lib/i18n/arabicCount.ts`: with the rule in force nothing in the product wanted a second digit shape. New `tests/westernNumerals.test.ts` (**3**) is the one rule for the two classes: it scans all of `src` for an Arabic-Indic digit beside a price/session noun and holds §8/§9.1 to zero Arabic-Indic digits. **Verified by reintroducing the defect** — «٣» put back into `SESSION_FORMS` failed 2 of 3, restored it to 3/3. `tests/trialPromise.test.ts`, `tests/v31HonestMoments.test.ts` and `tests/arabicPlural.test.ts` updated for the shape. `npm test` **138 files / 1776**. |
| 2026-10-06 | L13 | **A share card, built from the repo's own tools.** `og:image` pointed at the raw 512px app icon — a square a social card crops, so a link preview showed a logo rather than a sentence. New `scripts/make-share-image.mjs` (`npm run make:share-image`) renders one local HTML with Chromium through Playwright — Cairo embedded as a data URI, the AMOLED/near-black + lavender palette read from `src/index.css`, the **verbatim landing headline** — at exactly 1200x630, and it refuses to write the PNG if the content overflows its canvas (measured: content 1198x628). Committed `public/assets/share/katzu-share-ar.png` (opaque, no alpha) and pointed `og:image`/`twitter:image` at it with width/height/alt. `index.html` stays **root-relative** (the repo may not hardcode a host it cannot resolve); new exported `absoluteOgImages()` in `vite.config.ts` rewrites exactly the two image tags from `VITE_PUBLIC_APP_URL` at build time. Verified end to end: a build with the var set emits `https://app.example.test/assets/share/katzu-share-ar.png`, a plain build stays `/assets/...`. `scripts/check-launch.mjs` gained its second, owner-only blocker — it now counts an unset `VITE_PUBLIC_APP_URL` and fails strict while it is missing. New `tests/shareImage.test.ts` (**8**), incl. a PNG decode (1200x630, fully opaque) and the transform's three cases. No host is written to any shipped file. |
| 2026-10-06 | L14 | **The spend cap is configured, not merely coded.** L9 shipped `checkDailySpendCap` and its Arabic message, but `AI_DAILY_SPEND_CAP` was **unset**, so the ceiling was inert in production — the emergency brake existed and nothing was holding it. It is now a plain `[vars]` entry in `wrangler.toml` at **292** (the figure `scripts/measure-turn-cost.mjs` recommends), marked **UNPROVEN** in a comment because it is derived from cost estimates rather than observed spend, and stated to be a var that must **never** become a secret. Enforced for the whole service: one `global-ai-spend` counter, incremented **before** the comparison and **before** the trial ledger — so a free learner's conversation counts against the same bill a Pro one does. Verified with `wrangler deploy --dry-run`: `env.AI_DAILY_SPEND_CAP ("292")` present as an Environment Variable, config valid. `tests/launchSafety.test.ts` extended **17→19**: the config value, the no-secret rule, the single counter id, and increment-before-compare. |
| 2026-10-06 | L15 | **A read-only smoke that can be pointed at production.** New `e2e/productionSmoke.spec.ts` (**5**) plus `E2E_TARGET=production` support in `playwright.config.ts` (baseURL = the Pages URL, **no webServer**, overridable with `E2E_PRODUCTION_URL`). It writes nothing: a tagged `?src=test` landing loads, the share tags are on the document, and the console stays empty; the landing and `/paywall` quote the same amount; the free-session copy says «3 جلسات» with no Arabic-Indic left; and the two parts that are meaningless elsewhere declare themselves — the failure-mode price (needs the mock) and the admin 401 (needs the real worker, whose origin is **captured from the app's own `/pricing` request**, so no host is hardcoded). Against production **before** the deploy it found exactly the two gaps this pass creates — `og:image:width` absent and «٣ جلسات» still live (**2 failed**), with the admin 401 **green** and paywall parity **skipped** (anonymous `/paywall` redirects to `/welcome`; the smoke does not sign in). Preview: 4 passed / 1 skipped; full preview suite **111 passed / 2 skipped**. Also fixed a real race the first production run exposed (the price badge is read after it has actually received the server amount). |
| 2026-10-06 | L16 | **Production vs HEAD, read only.** **Pages = HEAD:** production deployment `ec47b2ff-5cc8-4e89-9209-ac851d00538b` from `a3cc0db`, serving `assets/index-BudV5Bjk.js` — the whole frontend, including the L-series, is live. **Worker is stale:** the active 100% deployment is version `0a653eca-2224-4114-b1fa-749bb2cb1251` (version 127, uploaded **2026-10-05T12:44Z**), which predates both L-series commits that touch worker code — `fe1d504` (14:52Z: `users.src`, `sanitizeSrcTag`) and `4d05905` (15:10Z: `listOrders`, `GET /admin/api/orders`). So the source-attribution column and the owner's order view are **not live**, while the client that sends them is. `/health` = `{status,service,ready,maintenance}` — the **model pool is NOT disclosed** in production. `/crypto/health` unchanged (`ready:false`, `test_mode`, no API key); it still publishes plan labels, and those labels carry Arabic-Indic digits («٣ أشهر — وفّر ١٣٪») on a public endpoint — noted, not in the L12 surface set (the app no longer reads `/crypto/health`). A generic 401 on every `/admin/api/*` path means a 401 cannot prove a route exists; the timestamp comparison above is the evidence used. |
| 2026-10-06 | L17 | **The launch pass is live — worker and Pages both.** The owner asked in plain words («finish and deploy all»), so `merge`, `worker` and `pages` were all touched. Pushed `a3cc0db..463e292` with no force; Pages built from git on the push as the runbook requires (no manual Pages deploy). **Worker:** `476bac16-eb7c-4cb9-8ccb-72ac35faf208` (was `0a653eca-…`), the first version to carry `fe1d504` (`users.src`, `sanitizeSrcTag`, the `/auth/session` source) and `4d05905` (`listOrders`, `GET /admin/api/orders`) **and** the newly configured `AI_DAILY_SPEND_CAP ("292")`, confirmed as a live Environment Variable in the deploy output — so the spend ceiling is now armed rather than merely coded (L14), and the stale-worker gap L16 recorded is closed. **Pages:** production deployment `08f0082d-c041-41c8-b1e8-d9938c3188d3` from `463e292`, serving `assets/index-bWgfrKSi.js` (was `index-BudV5Bjk.js`) — so the L13 share card and its `og:image:width/height` are the ones social crawlers now read. **Verified live and read-only:** `/` `/demo` `/welcome` `/sw.js` **200**; `/health` = `{status,service,ready:true,maintenance:false}` (**no pool disclosure**); `/crypto/health` unchanged (`ready:false`, `test_mode`, `apiKeyConfigured:false`); unauth `/admin/api/orders` **401**; `assets/share/katzu-share-ar.png` served **200 image/png, sig 89504e47, 1200x630, 335078 bytes** — byte-identical to the committed artifact. **Production smoke** (`E2E_TARGET=production npx playwright test e2e/productionSmoke.spec.ts`): the two gaps the pre-deploy run found are **closed** — the share tags now resolve and «3 جلسات محادثة مجانية» is live with no Arabic-Indic left — **3 passed / 2 skipped / 0 failed** (the two skips are the cases that are meaningless anonymously: paywall parity and the failure-mode price). **CI:** run `37420600607` for `463e292` — **success**, jobs `secret-scan`, `launch-check`, `verify`, `e2e` all green. **Rollback, recorded and not needed:** worker `0a653eca-2224-4114-b1fa-749bb2cb1251`; Pages `ec47b2ff-5cc8-4e89-9209-ac851d00538b` (source `a3cc0db`). No secret, no production D1 write, no owner-only item touched. **Still owner-only:** the 10 `{{OWNER_FILL}}` legal fields and `VITE_PUBLIC_APP_URL` (11 blockers under `check:launch:strict`). |
