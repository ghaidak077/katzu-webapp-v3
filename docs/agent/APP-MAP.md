# APP-MAP — the whole of Katzu on one page (360° orientation)

**Purpose.** Read this file to understand what Katzu *is*, how it is built, every screen and
feature, where each thing lives, and what will bite you — **without opening the source tree**.
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

*Last verified: 2026-10-04 (V38-DEPLOY). Verified against `src/App.tsx`, `package.json`, `wrangler.toml`,
`cloudflare-unified-worker.js`, `tests/`, `e2e/`, and the live deploy targets below (worker
`4d34c8eb-6047-4b4a-a859-cea43d673e1f`, Pages `assets/index-DHO4J2Da.js` on production deployment
`ef91fad7-f5d9-4764-8e7f-f93952808bdb`, `main` = `93653dc`).
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
| Routing | **react-router-dom 7.3** | all routes in `src/App.tsx`; screens lazy-loaded |
| Client state | **Dexie 4 / IndexedDB** (`src/lib/db/katzuDb.ts`) | offline fixtures + queue + local fallback |
| Server state | **Dexie + WorkerClient** | React Query is declared but unused; removal remains planned |
| Validation | **Explicit validators and TypeScript contracts** | Zod is declared but unused; broader contract hardening remains planned |
| Icons / FX | `lucide-react`, `canvas-confetti`, `ogl` (hero/background) | |
| PWA | `vite-plugin-pwa` 0.21 (Workbox) + `workbox-window` | `registerType: 'autoUpdate'`; precache manifest |
| Backend | **Cloudflare Workers** (JS, no framework) + **D1** + **KV** + Workers AI | `cloudflare-unified-worker.js` + 13 sibling `cloudflare-*.js` modules |
| Testing | **Vitest 5** (node/jsdom) + **Playwright 1.63** (chromium only) | `tests/` and `e2e/` |
| Tooling | `wrangler 4`, `axe-core`, `lighthouse` (dev only) | Node **24.15.0** pinned in CI; this machine runs 24.14.0 (EBADENGINE warning only) |

Root tells: `index.html` → `src/main.tsx` → `src/App.tsx`. `metadata.json` is app metadata.

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
├─ cloudflare-ai-router.js         # multi-provider pool + failover
├─ cloudflare-admin.js             # admin dashboard + gated admin API
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

All routes are declared in **`src/App.tsx`**. Screens default to lazy `React.lazy`; a
`<Suspense fallback>` shows `RouteFallback` while a chunk loads (never a blank page).
The canonical, machine-checked route list is §14 (`appmap-routes`); this section explains it.

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
| Multi-provider AI + failover | server | `cloudflare-ai-router.js`; Workers AI `[ai]` fallback |
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
| a route or auth gate | `src/App.tsx` |
| a screen's UI/Copy | matching `src/features/<area>/*Screen.tsx` |
| any Worker/API call | `src/lib/api/workerClient.ts` |
| an AI endpoint or prompt | `cloudflare-unified-worker.js` + `cloudflare-ai-chat.js` |
| AI provider pool | `cloudflare-ai-router.js` |
| offline/DB behaviour | `src/lib/db/katzuDb.ts` |
| domain types/shapes | `src/types/models.ts` |
| content rules/joins | `src/lib/content/{curriculumAudit,scenarioGrammar}.ts` |
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
| **Deploy is gated** | allowed only with the owner line `DEPLOY-AUTHORIZED: <targets>` and only via `docs/agent/DEPLOY.md` |
| **Content load is gated** | only with `CONTENT-LOAD-AUTHORIZED: <files>` and only via `docs/agent/CONTENT-LOAD.md` |
| Never (even authorized) | write prod D1 outside the content path; touch/secrets/`ADMIN_SECRET`; payments/OAuth/domain/legal; force-push |

Scripts: `dev` (vite :3000) · `build` · `preview` · `test` · `test:e2e` · `test:e2e:types` ·
`lint` · `session:start` (readout: ledger NEXT + §9 + MEMORY facts + git + OPEN ITEMS) · `deploy:worker` (**never run without authorization**) · `tail:worker` ·
`test:smoke:token-hygiene`.

---

## 10. Limitations & open items (as of 2026-10-02)

- **Payments not live** — crypto stays in `test_mode`; `ready:false`.
- **Signup is Google-only.**
- **Domain `katzu.app` does not resolve**, though robots/sitemap advertise it (owner item).
- ~~**`ADMIN_SECRET` must be rotated**~~ — **closed by owner decision, 2026-10-05.** The owner reviewed the earlier-prompt exposure and accepts the secret as it stands; it is no longer an open item. Recorded, not verified: a Worker secret cannot be read back.
- **Real-device voice input** never verified on iOS/Android; only Chromium fake capture.
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

## Change log

| Date | Version | Change |
|---|---|---|
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
| 2026-10-04 | V40-4 | **CI flakes fixed at the cause.** `e2e/firstRun.spec.ts` now waits for `Modal`'s entrance animation to settle before measuring a tap target (the transformed box read 43.5 px mid-`scale-95`); `e2e/simplicity.spec.ts` waits on `escape.or(finished)` instead of the always-mounted `quiz-options`; `e2e/harness.ts` seeds `katzu_onboarding_completed` so a `bootSignedIn` learner matches a real sign-in and the sign-out guard no longer races the handler to `/welcome`. `.github/workflows/ci.yml`'s e2e step now sets `E2E_TARGET: preview`, so it runs the bundle its name claims. A fourth flake — the live caption in `journey.spec.ts`, which finalised as `say()` returned because its `interimHoldMs` equalled the harness's speaking ceiling — is fixed by holding the interim for 3000 ms. No assertion weakened. |
| 2026-10-04 | Excellence batch 1 (local) | Account-owned pending progress, transactional sign-out/report cleanup, stale progress/review response guards, lossless A0/order detail caching, offline topic-filter parity, and binding-scoped retryable content bootstrap. Current status: EXCELLENCE-STATUS.md; no deploy. |
| 2026-10-02 | V26 | Created. Consolidates product, stack, tree, screens, features, data, endpoints, tests, env, limits and gotchas into one orientation file; wired the update rule into `AGENTS.md` §12. |
| 2026-10-02 | V26 | Added §14 machine-checked manifest (`appmap-routes`, `appmap-screens`, `appmap-endpoints`, `appmap-tables`) and `tests/appMap.test.ts`, which fails when code and this file diverge. |
| 2026-10-02 | V26 | Fixed the session-report retype drill rejecting a correct full sentence: new pure `gradeCorrectionRetype` in `src/lib/srs/engine.ts` (content-word run, either direction), used by `SessionReportScreen`; `gradeAnswer` stays exact. |
| 2026-10-02 | V26 | Added `scripts/session-start.mjs` + `npm run session:start` — one short readout of ledger NEXT, §9 targets + manifest counts, MEMORY §A facts and git state. |
| 2026-10-02 | V26 | Applied the shared retype grader and store-owned mastery to `PracticeScreen` (was exact-match and wrote `isMastered` after one retype); guard test `tests/practiceRetype.test.ts`. |
| 2026-10-02 | V27 | Session readout gained an OPEN ITEMS section: the ledger's OWNER-OPEN and UNPROVEN entries, split into still-open vs `RESOLVED`/`DONE`/`superseded` history, with counts and capped labels. |
| 2026-10-02 | V27 | Deployed: merged `launch-hardening` to `main` (fast-forward to `a2f6115`) and let Pages build — production deployment `b87f00b4-4975-43b9-93b7-1483db2e0904`. Worker code unchanged, so no worker deploy. CI green on the branch sha and on the merged `main` sha. |
| 2026-10-02 | V27 | Production-verified the two retype fixes in a real browser walkthrough (390×844): both the PracticeScreen mistake drill and the session-report debrief accepted the full sentence `Ich habe den Bericht jetzt fertiggestellt` for the fragment `ist jetzt fertiggestellt`; smoke battery 12/12, `/health` healthy/ready, unauthenticated `/admin/api/users` → 401. |
| 2026-10-02 | V28 | Review rebuilt (owner feedback #1): `src/lib/review/validate.ts` gates every item (`validateReviewItem`, `isMeaningfulCorrection`, `gradeArabicAnswer`, dedupe, direction, cloze); bad items are suppressed not deleted via a Dexie **v7** migration; the mistake prompt is a real Arabic instruction; both directions render in `ReviewScreen`. |
| 2026-10-02 | V28 | Chat quality (owner feedback #2): new pure `cloudflare-turn-quality.js` wired into `/ai/turn` — hints must answer the last AI message, corrections must change something, obstacles are gated; `scripts/eval-chat-quality.mjs` + `tests/fixtures/chatTurns.json` run offline in CI (hints 58%→100%, corrections 58%→100%, obstacles 50%→100%). No extra AI call per turn. |
| 2026-10-02 | V28 | Two modes of the SAME conversation (owner feedback #3): the 3/8 round picker is gone — `practice` (help) or `real` (no hints/translation/live corrections) over one conversation, length a level cap (`levelSpec.maxSessionTurns` via `sessionTurnCap`). REAL keeps the turn call (it returns the evaluation silently) and the report renders every correction, what went well, kept phrases, "what you can now do", and a "versus your previous attempt" line; REAL XP is 1.5× practice (`sessionXp`). Verbs `TURNS_BY_MODE`/`planTurns`/`turnPlanForLevel` deleted. |
| 2026-10-02 | V28 | Stage 1 deployed: worker version `f3d9bd3f-39ef-4816-a539-8eb1701f5fb8` (previous `9cf79e18…`) and Pages production `2f3bbb1a-46e1-4fd0-9b58-3780e3b55fdc` (source `df08d25`, previous `61aff978…`). CI green on the branch sha (`36984211159`) and on `main` (`36984903494`); smoke battery 12/12; both modes verified live in a signed-in production walkthrough. |
| 2026-10-02 | V28 | Ask Katzu (owner feedback #4, Stage 2A): new `/app/ask` screen + route (entry from the Practice tab) and new `/ai/ask` endpoint. One question in (Arabic or German) → one validated JSON answer (Arabic explanation, ≤3 examples, exactly 3 practice items) or a polite Arabic refusal for anything off-topic; the learner's text is fenced data, not instructions. Its own server-side daily quota + rate limit (`ASK_FREE_PER_DAY`/`ASK_PRO_PER_DAY`/`ASK_RATE_PER_MINUTE`) never spends the conversation trial quota; official/legal German attaches a not-legal-advice notice reusing the scenario disclaimer wording; wrong practice answers enter the validated review path. |
| 2026-10-02 | V28 | Stage 2A deployed (2C gate): worker version `ed14beae-524c-4b3f-a5d3-d33270b21776` (previous `f3d9bd3f…`) has the new `/ai/ask` route live (unauthenticated 401; letterless body 400 `ASK_INVALID_INPUT`); Pages production is `7436c750-8804-4bf5-a604-3d54c9aaf123` (source `c07771f`). CI green on the branch sha `c07771f` (run `36988453680`); smoke battery 12/12; Ask Katzu answered a real grammar question end-to-end in the owner's signed-in production profile (Pro quota 60/day shown). |
| 2026-10-02 | V28 | Grammar locked path (owner feedback #5, Stage 2B): `/app/grammar` is now one ordered course, not a row list. New pure `src/lib/grammar/path.ts` (`orderGrammarLessons`, `placementStartIndex`, `isQualifyingAttempt`, `isTestOutPass`, `lessonState`, `isLessonCleared`, `buildGrammarPath`, `mixedReviewLessonIds`) holds the single rule — a pass is `LESSON_PASS_RATIO = 2/3` in at least two separate sessions; lesson N+1 unlocks only after N is cleared; a placement makes earlier lessons optional. `pathStore.ts` persists attempts + test-outs in a new additive Dexie **v8** table `grammar_lessons`. The screen shows "lesson N of M" with a progress bar, one next action, a test-out, and a mixed review of earlier lessons; a wrong production still writes a mistake + enrols a review item. Tests: `tests/grammarPath.test.ts` (18), `tests/grammarPathStore.test.ts` (5), `e2e/grammarPath.spec.ts` (2). |
| 2026-10-02 | V28 | Deterministic conversation beats (Stage 1, the deferred measurement): a new pure `cloudflare-conversation-beats.js` derives 4–8 beats from a scenario's starter phrases and the prompt moves the model through them in order, one per turn, without reciting them. The whole `/ai/turn` system instruction is now the exported `buildTurnSystemInstruction`, so the prompt's exact cost is measurable; `scripts/measure-turn-cost.mjs` (in CI) reports and caps the added tokens. Tests `tests/conversationBeats.test.ts` (8) + two `/ai/turn` route tests (beats present with starter phrases; absent without). |
| 2026-10-02 | V28 | Stage 1F deployed (2C gate): CI green on the branch sha `dbc2e36` (run `36996847350`) and the `main` push of the same sha (run `36997578251`); merged fast-forward to `main`. **Worker deployed** version `0ab4658d-c34c-4e55-b191-7ee0da341e91` (previous/rollback `ed14beae-524c-4b3f-a5d3-d33270b21776`) — this is the first stage since 2A to change worker code. Pages production `9683e543-caa6-453b-9baf-8c91b8c653d2` (source `dbc2e36`; previous `e864572d…`). Verify: `/health` healthy/ready, `/crypto/health` unchanged (`ready:false`), Pages 200, admin 401, battery 12/12. Live turn-latency BEFORE samples in the owner's signed-in profile: 20229 / 1483 / 1429 ms (n=3, cold-first-call outlier); AFTER samples not taken (the live screen reverted to the mode picker under owner input) — carried UNPROVEN. |
| 2026-10-02 | V28 | Stage 2B deployed (2C gate): CI green on the branch sha `3963a8b` (run `36992098448`) and on the `main` push of the same sha (run `36992692238`); merged fast-forward to `main`. Worker NOT deployed (2B changed no worker code — live worker stays `ed14beae-524c-4b3f-a5d3-d33270b21776`). Pages production is `cd2f56b0-543a-4b3a-86e2-171eab806f06` (source `3963a8b`; previous `b2674c23…`). Production verify: `/health` healthy/ready, `/crypto/health` unchanged (`ready:false`), Pages 200, unauthenticated admin 401, battery 12/12; a read-only signed-in walkthrough of `/app/grammar` showed 77 lessons with «أكملت 0 من 77», the five A0 lessons tagged «مراجعة اختيارية» (placement start), lesson 6 open and marked «التالي», and every later lesson disabled/locked. |
| 2026-10-02 | V28 | Stage 3 deployed (gate): CI green on the branch sha `333e204` (run `37003561899`) and the `main` push of the same sha (run `37004205066`); merged fast-forward to `main`. Worker NOT deployed (Stage 3 changed no worker code — live worker stays `0ab4658d-c34c-4e55-b191-7ee0da341e91`). Pages production `058eeacb-db6c-4ae7-8545-56b5f5c7c4bc` (source `333e204`; previous `d64d867e-49a0-48be-bb3c-680bd1de1a9b`), serving `assets/index-DBkQtuj4.js` which carries the daily-task strings. Verify: `/health` status-only healthy/ready, `/crypto/health` unchanged (`ready:false`), Pages 200, admin 401, battery 12/12; a signed-in production walkthrough rendered «مهام اليوم · 0 من 3» with the three task rows and the review batch at `(0/5)` (two reloads were needed — the returning profile's service-worker precache served the old bundle first). |
| 2026-10-02 | V28 | Streak/XP inflation audit (owner follow-up): **fixed** a completed review day being un-completed by later work — the review task's status now honours the persisted `daily_tasks` row (`DailyTaskEvidence.reviewCompleted`) and `readDailyTasks.completedToday` is derived from the row flags, so a new due item can no longer drop today from the streak. Regression test proven to fail on the pre-fix store. **Verified not exploitable:** unmeasured-session XP (a session always has ≥1 learner sentence) and multi-device totals (Last-Write-Wins merge, so they never sum). **Accepted limit:** the cap and streak key on the device-local day, so a clock/timezone change grants a fresh day — inherent to a local-first design, documented not faked. `npm test` 1217. |
| 2026-10-02 | V28 | e2e coverage for the four skill surfaces + the Trail rank badge (owner follow-up): new `e2e/skillSurfaces.spec.ts` (5 tests) walks review, listening, writing, coach and the rank label in a real browser. `E2E_TARGET=preview npx playwright test` is now **57 passed** (was 52); `npx tsc -p e2e --noEmit` clean. Also measured the AFTER turn latency (V28-1F) live: see the ledger row `V28-1F-AFTER`. |
| 2026-10-03 | V29 | Product-experience audit, execution 1 of 2 — quiz stability + chat layout + vocabulary bridge (owner: "options keep changing", "the chat shape takes too much space", "not obvious what to answer because they lack the vocabulary"). **Quiz:** the deck is seeded per scenario (`quizRngForScenario` in `src/lib/utils/quizGenerator.ts`, reusing `seededRng`/`hashString`) and frozen after the first non-empty build, so the cold-device content heal — which re-emits `scenarioQ`/`phrasesQ`/`vocabQ` several times — can no longer reshuffle options or move `correctIndex`; guarded by `e2e/quizStability.spec.ts` (proven to fail on the pre-fix code). **Chat layout:** `ConversationDock` split into a compact `ConversationControls` bar under the header (smaller orb + status + hints) and a one-row thumb-reachable `ConversationComposer` at the bottom; transcript keeps the middle (measured: composer ≈10% of a 360×640 viewport vs the old ~45% dock); orb size 116–168 → 84–120; `e2e/conversationLayout.spec.ts` now asserts transcript ≥50% and composer ≤20%. **Vocabulary bridge:** new shared `src/lib/utils/wordBank.ts` (`buildWordBank`) powers tappable word chips on Review's production cards and both Guided Practice beats; Review gains an explicit «لا أتذكّر — أرني الإجابة» (counted once as a miss); any tapped chat word now opens the insight sheet (unknown words get an honest, no-AI card instead of a silent tap); `selectGrammarRule` no longer serves an off-scenario rule while one reusing the episode's vocabulary exists. `npm test` 1225 (was 1217); e2e 59 passed (was 57). |
| 2026-10-03 | V29 | Word-bank scaffolding extended to the remaining production surfaces (owner: "extend the word-bank scaffolding to the hint chips and the listening/writing surfaces, so every place that asks the learner to produce German offers the words"). `buildWordBank` gains a sibling `buildWordBankFrom(parts, max)` for a task with no single answer — it CAPS an over-long pool instead of returning nothing (Writing's topic has dozens of words). **hint chips:** `ConversationControls` shows the words of the offered reply (built from `visibleHints[0].german`) as chips that append into the composer, so the learner can build the reply instead of only sending it. **listening:** `ListeningScreen` offers the dictation sentence's words as chips into the input (the audio is the prompt and the German is the answer — the same shape as an `ar_to_de` review card; a single-word item has no bank). **writing:** `WritingScreen` assembles a bank from the scenario's own vocabulary (via `scenarioToVocabTopic`) plus its target phrases. All three carry `data-testid="word-bank"`. `npm test` 1229 (was 1225); e2e 61 passed (was 59). |
| 2026-10-03 | V29 | Vocabulary-bridge analytics (owner: "analytics (or an A/B) for word-bank taps and «لم أتذكّر» reveals so we can tell whether the vocabulary bridge actually reduces give-ups"). Chose analytics over a live A/B — no new infra or deps, and the closed allow-list already carries the join keys (`installId` + day), so the reveal rate can be compared with and without bank use. Two events added to BOTH allow-lists (`src/lib/analytics/events.ts` + `cloudflare-analytics.js`, kept equal by `tests/analyticsRoute.test.ts`): **`word_bank_tapped`** (every chip tap; prop `skill` = review / practice / chat / listening / writing, plus `kind` on review/practice) and **`review_revealed`** (the explicit «لا أتذكّر — أرني الإجابة» way out). All four bank containers now carry `data-testid="word-bank"` (Review's added). `e2e/skillSurfaces.spec.ts` proves the two events actually POST to `/analytics/events` — not just that `track()` was called. `npm test` 1230 (was 1229); e2e 62 passed (was 61). |
| 2026-10-03 | V29 | Daily XP + streak made server-authoritative (owner: "so a device clock or timezone change can no longer grant a fresh day") — it closes the accepted limit of the V28 streak/XP audit. New `cloudflare-daily.js` derives the day from the **server** clock shifted by the learner's offset, and **locks that offset at first sync** (`clampOffset` −720..840) so a later device timezone cannot move the day boundary; on first creation it seeds `totalXp` + completed-day history from the client (bounded, so an existing learner is not reset), then ignores client history. `applyDailyEvents` is idempotent by event id, caps `xpToday` at 600, marks the three daily tasks and records an earned day; `sessionXpFor`/`dailyStreak` are twins of the client rules (pinned by `tests/dailyAuthority.test.ts`). One KV record `daily:<sub>`. `/progress/sync` processes the ledger once before the D1 merge loop and overlays `total_points`/`streak_days` (D1 and KV-degrade paths); `/progress/get` overlays too. A stats-only legacy client neither creates nor seeds a ledger but still adopts an existing one, so the plain max-merge it relies on is preserved while an account under daily authority cannot be inflated. Client: `src/lib/progress/dailyAuthority.ts` (durable localStorage event queue, `buildDailyPayload`, `adoptDailyAuthority` writing `totalXp`/`streakDays`/`dailyAuthority`), adopted by `workerClient.ts`. `npm test` 1265 (was 1230, +16 across `tests/dailyAuthority.test.ts` + `tests/dailyRoute.test.ts`, +19 in the adversarial `tests/dailyLedgerAdversarial.test.ts`); e2e 62 passed; build OK. **Adversarial probe — lands:** omitting `daily` while no ledger exists stores arbitrary stats (blocked once a ledger exists); the one-time first-sync seed is unbounded (lifetime XP and a fabricated completed-day history → streak); accuracy lies and fresh-id replays land but cap at 600 XP + 1 earned day/day; the 400-id dedupe window can be evicted for one re-credit. **Blocked:** id replay, the clock/timezone change (offset locked), future/invalid seed days, unknown kinds, short ids, out-of-range offsets, and lifetime XP beyond one capped day per server day. **Correctness hole:** the KV ledger is a non-atomic read-modify-write, so two concurrent devices with distinct events lose one. No commit/deploy; a worker deploy is required to enforce it live. |
| 2026-10-03 | V29 | Adversarial hardening of the daily ledger + a public-launch-readiness pass. All four attacks the probe landed are closed: the ledger is now created on **every** `/progress/sync` (a missing `daily` payload can no longer opt out of authority; a client total rises only by `DAILY_XP_CAP × elapsed days`), the first-sync seed is clamped (`SEED_MAX_TOTAL`/`SEED_MAX_STREAK`), a per-account async lock serializes the KV read-modify-write in-isolate (removing the concurrent lost-update), and the dedupe window rose 400→2000. The D1 path preflights `base_rev` so a request that will 409 never touches the ledger. Two real data-lifecycle bugs from V29-4 were found and fixed: `handleDeleteUser` now deletes `daily:<sub>` (it survived deletion before) and `/user/export` includes it; `wipeUserScopedData` clears the localStorage daily-event queue so a signed-out learner's sessions cannot be credited to the next account (new leaf `src/lib/progress/dailyQueueKey.ts`). Gates: build OK, tsc clean (src+e2e), `npm test` **1266** (was 1265; +1 wipe test; 105 files), e2e **62 passed** (production bundle), 4 content audits exit 0, `npm audit` 0, secret-scan clean. Committed as `e0ecd81`; CI run **`37109392007`** green (verify · e2e 62 passed · secret-scan). **Deployed (V29-6, `DEPLOY-AUTHORIZED: merge, worker, pages`):** merged ff to `main` `559aa81`; worker **`a510e25c-ed78-470e-92a6-810d38794cc1`** now carries `cloudflare-daily.js`; production serves **`assets/index-CfZ6VaJV.js`**; unauth admin 401; the two new analytics events accepted live; battery 12/12; `main` push CI `37110867672` green. |
| 2026-10-04 | V30 | Design-system hardening + motion scale + cost ceiling. **Palette:** five values sat in the rose band (OKLCH h 339–344, ~50° off the lavender) — `kz-magenta`, `kz-magenta-deep`, `tertiary`, `tertiary.container`, `article.die`. Earned is now h 299 (`174 123 255` / deep `115 67 222`), `tertiary` moved to a periwinkle shoulder (h 272), `article.die` to pale lilac (h 300), and both glass tiers pick up the brand hue (`16 13 26` canvas, `7 5 14` well). Canvas-side copies in `borderBeamCss.ts` / `KatzuOrb.tsx` / `KatzuPresence.tsx` and `tailwind.config.js` are pinned to their tokens by `tests/designSystem.test.ts`. **Motion:** the ladder in `src/index.css` had zero readers, so every transition silently used Tailwind's undeclared 150ms; `transitionDuration` (`fast`/`DEFAULT`/`panels`) + `transitionTimingFunction` (`spring`/`out`) now read those variables, and the over-budget `--kz-dur-slow: 560ms` is retired as `--kz-dur-panels: 300ms`. Confetti is gated on `useReducedMotion` (it was the one animated subsystem ignoring it). `BottomSheet`/`Modal` gained a real entrance (`data-mounted` + rAF; the old `transition-opacity` could never fire). The scroll handler in `GlassSurface` now derives position from `scrollY` inside a rAF instead of calling `getBoundingClientRect()` per event. Six progress bars moved from inline `width` to `scaleX` (RTL origin), and `AudioWaveform` from `height` to `scaleY`. All 61 remaining `transition-all` sites name the property they animate (three enumerate explicitly). **Accessibility:** 19 form controls gained an `aria-label`; 20 bare `outline-none` removed (a utilities-layer rule that deleted the global focus ring); 4 icon-only buttons named, the bookmark got `aria-pressed`; 3 sub-44px targets raised. **Gates:** `design-audit.mjs` gained three zero-budget rules (`unnamed-field`, `transition-all`, `focus-ring-suppression`). **Cost:** `/ai/hints` was quota-exempt with no ceiling of its own — only the global 200/day, so refreshing hints repeatedly was an uncapped bill; it now has its own `hints` scope (free 30 / Pro 120 per day). **Measured:** 16 routes clean at 320px and at 200% zoom (no horizontal overflow, no sub-44px target). Gates: tsc clean (src + e2e), `npm test` **1323** (was 1319), design-audit 0, contrast 20/20, build OK, `npm audit` 0. |
| 2026-10-04 | V31 | Honest moments of truth + Arabic number agreement. **Free wall:** only `PAYWALL_REQUIRED` opened the paywall, so `FREE_QUOTA_EXHAUSTED` fell into the retryable "try again" card that no retry could clear; the new `src/lib/entitlement/codes.ts` is the single owner (`ENTITLEMENT_WALL_CODES`, and `ENTITLEMENT_UNAVAILABLE_CODES` — deliberately retryable, because an unreadable ledger is a glitch, not a payment) and is consumed by `stateMachine.ts` `classifyTurnError`, `useLiveConversation` and `WritingScreen`. **Debrief:** `App.tsx` `ReportRoute` rebuilds from the Dexie `sessions` + `mistakes` rows (new `src/features/report/recover.ts`) and falls back to a real `NoSavedReportScreen` instead of a silent `<Navigate>`. **Trial ledger:** `/check-status` returns `free_sessions_remaining` + `max_free_sessions`; `src/lib/entitlement/trialCopy.ts` `freeSessionsCopy(null)` reads «يُحسب على خوادمنا» rather than inventing 0. **Hints:** `fetchHintsWithStatus` carries `HINTS_QUOTA_EXCEEDED` and the dock says the day's budget is spent instead of falling back forever. **Plurals:** new `src/lib/i18n/arabicCount.ts` + `countForms.ts` (one and the dual as words, 3–10 plural, 11+ singular, modulus `% 100`) applied at 13+ sites. Gates: `npm test` **1358**, e2e 62 passed, tsc clean ×2, design-audit 0, contrast all pass, `npm audit` 0. |
| 2026-10-04 | V32 | Stupid-simple pass (owner: "make the product simpel stupid to use, in a glance … especially chat and test and quizzes"). Measured first (25 screens at 360px): `/app/practice` **110 controls**, `/app/library` 12 competing primaries, `/app/study` 6 listen buttons all labelled identically, Guided Practice two inputs sharing one placeholder, `/demo` 2. **Quiz:** «لا أعرف — أرني الإجابة» reveals the answer, states it counts as missed, and enrols the item for review. **Practice:** `browseWords` puts the six skill cards first and the 48 words behind «تصفّح الكلمات» («ابحث في الكل» is a filter, not a heading). **Trail:** 5 scenarios then «اعرض بقية المشاهد». **Inputs:** every Guided Practice field has a visible `<label>` and its own placeholder; every Study listen button is named by its phrase. **Welcome:** the name is optional («متعلم»). **Ask:** a real `<h1>` and a tappable «جرّب مثالاً» (`ASK_EXAMPLE_AR`). **Copy:** «بدء» → «ابدأ التدريب». **Chat:** PRACTICE preselected with «موصى به», REAL one tap below. **Sign-in:** the level picker is signup-only. **New gate:** `scripts/simplicity-check.mjs` (26 screens, `control-budget` + `unnamed-heading`) in CI, pinned by `tests/simplicityGate.test.ts` and `e2e/simplicity.spec.ts`; its `primary-budget` rule was written, measured against 12 healthy screens, and deleted rather than shipped. |
| 2026-10-04 | V33 | The V32 P2 backlog, closed — each item measured, not asserted. **Steps are numbered** by a new shared `src/components/ui/StepTrail.tsx` (real `<ol>`, `aria-current="step"`); `ListeningScreen` uses `LISTENING_STEPS = ['استمع','اكتب','تحقّق']` and `WritingScreen` `WRITING_STEPS = ['اقرأ المهمة','اكتب','اقرأ التصحيح']`. **Profile is grouped** by a new `src/components/ui/CollapsibleSection.tsx` (real `<h3>` toggle, `aria-expanded`/`aria-controls`, hint while folded) into حسابي (open by default), طريقة تعلّمي and بياناتك — **29 → 8 rendered controls measured at 360px**, pinned ≤ 12 by `e2e/polish.spec.ts`. **Locked grammar lessons now state the reason** (`lockReasonAr`, built from the lesson's unmet `prerequisites`, naming the holding lesson by title). **The preferences nag sits below today's mission** as a quiet `border-border-subtle` row instead of a second primary-weight hero. **The chat word bank says you can build a sentence** («اضغط لتبني جملتك بنفسك») rather than only send one; the other three banks keep their plain wording. Gates: `npm test` **1379**, e2e **71 passed**, tsc clean ×2, design-audit and simplicity-check within budget, contrast all pass, `npm audit` 0. |
| 2026-10-04 | V34 | Apple-polish + performance pass (owner: "improve the design and performance … polish rather than redesign … unnecessary motions like the glare when mouse hovering … meaningless since our app is for phones"). **Pointer glare deleted:** `useSpecularHighlight` / `SpecularHighlight` / the per-surface `.kz-specular` span are gone; the material is lit from a fixed token direction. **Hover gated:** all 134 `hover:` utilities became `pointer-hover:`, compiled under `@media (hover: hover) and (pointer: fine)`. **The ambient beam is painted, not driven:** the shared 30 fps rAF driver, `buildPulseConfig` and `attachPulse` are deleted; the resting edge fades in once over 600 ms, and only the active comet still animates. **Measured on the production bundle** (`e2e/perf/perfprobe.spec.ts`, committed and excluded from the suite): idle 5 s **100.4 ms → 0 ms** of style recalculation; 200 pointer moves **969.1 ms → 0 ms**; scroll **62.3 ms → 0 ms**. **Consistency:** one radius ladder (`--kz-radius-*` in `src/index.css`, read by Tailwind) so the primary and secondary buttons can no longer differ by 2 px; the `:focus-visible` `border-radius: 4px` override deleted so the ring follows each control's own corner; `prefers-reduced-transparency` and `prefers-contrast` both answered; size-specific tracking on the Latin scale only, never positive on Arabic. **One product defect found and fixed while measuring:** V33 had folded sign-out into a collapsed Profile section, so leaving needed an extra tap — sign-out is hoisted and always visible. New gates: design-audit `hover-on-touch` + `pointer-follow`, `tests/v34ApplePolish.test.ts` (24), `e2e/applePolish.spec.ts` (2). Gates: tsc ×2 clean · `npm test` 111/1404 · Playwright 73 passed · build OK · audits clean. |
| 2026-10-02 | V28 | Stage 3 daily tasks + ranks (owner mission items #6): Journey Home now carries a three-task panel — one scenario session, one grammar step, one review batch — reset at LOCAL midnight with a one-forgiven-day streak. New pure `src/lib/daily/tasks.ts` (`dailyTaskStatuses`, `reviewTaskDone`, `dailyTaskStreak`, `FORGIVEN_DAYS = 1`, `REVIEW_BATCH_SIZE = 5`) + store `src/lib/daily/taskStore.ts` persisting to an additive Dexie **v9** table `daily_tasks`; writers are `markScenarioTaskDone` (session finish), `markGrammarTaskDone` (grammar attempt) and `markReviewGraded` (`gradeReviewItem`, the single review chokepoint). New Arabic rank ladder `src/lib/progress/ranks.ts` (`rankFor`, `RANKS`, shown on Trail as "الرتبة N من M") and anti-farming XP `src/lib/progress/dailyXp.ts` (`creditXp`, `DAILY_XP_CAP = 600`) — the only writer of `totalXp`. UI: `src/features/journey/DailyTasksPanel.tsx`. Tests: `tests/dailyTasks.test.ts` (16), `tests/dailyTaskStore.test.ts` (7), `tests/ranks.test.ts` (10), `e2e/dailyTasks.spec.ts` (2). |
| 2026-10-04 | V35 | Cross-discipline interface review (`/better-interface`, all six `better-*` domain skills) across 13 screens at 320px and 412px in a real browser, then the polish it earned. **Fixed:** landing footer links measured 55x20 / 38x20 / 60x20 and Listening's «تشغيل بطيء 0.8x» / «إعادة» measured 83x17 / 25x17 (with the full-width exit at 32px) — all six now `min-h-touch` + `inline-flex items-center`, measured after as landing **3 → 0** and listening **8 → 5** sub-44px controls; the Journey Home and Ask headings no longer truncate their own words (`truncate` → `text-balance`); three fields that rendered at 12–14px are `text-base`, because under iOS Safari's 16px focus-zoom threshold focusing one magnifies the page; Practice's two filter chips gained the thumb target. **Three findings were withdrawn after re-measurement** — an "unnamed control" (my checker skipped `<label for>`; platform-correct name resolution finds **0** across 13 screens), a "sideways-scrolling Journey Home" (`scrollWidth` counts what `overflow-x: hidden` already clips; a real swipe leaves `scrollX` at 0), and "five truncated card titles" (3px of Cairo glyph overflow, not clipping). **Pinned by three new `e2e/polish.spec.ts` tests** that measure rendered hit areas and font sizes. **Correction to the V34 record:** `npx tsc -p e2e --noEmit` has been failing since `089cb54` (a type cast in the perf probe) and was reported clean because the status came from a pipe; fixed and re-verified unpiped. Gates: tsc ×2 clean · `npm test` 111/1404 · Playwright 76 passed · build OK · design-audit, simplicity-check, contrast, `npm audit`, content audits all clean. |
| 2026-10-04 | V37 | Coordinated experience/interface/motion batch + deploy. **Interface:** `Modal`/`BottomSheet` are real dialogs (new `src/components/ui/useModalDialog.ts`: `role="dialog"`, `aria-modal`, focus entry, Tab trap, Escape-to-close, focus restore); a loading `Button` keeps its accessible name (`aria-busy` + `sr-only` label); one `<main>` per page (nested `<main>` removed from five screens); the grammar path gained the shared `BackButton`. **Motion:** the reduced-motion block now also stops the `.kz-scrim` fade; the FAQ disclosure glyph no longer animates its transform; `SiriWave` reads the preference live via `useReducedMotion`. **Honesty copy:** removed "غير محدودة / لا محدودة / بدون قيود يومية" and "لا نقاط" from the upgrade/paywall/profile/report/trail/conversation copy; level range stated A0–B2 everywhere; the landing hero's one primary action is the account-free demo. **Defects fixed by measurement:** the ambient `BorderBeam` halo (`inset: -30px`, unclipped) was widening the page (`scrollWidth` 325 @320 and 394 @390 on `/app/trail` and `/dev/system`) — fixed with `overflow-x-clip` on the app shell; `workerClient.getReferralInfo`/`claimReferral` no longer fire a same-origin `/referral/info` when no worker origin is configured (the four 404s on Profile); the landing hero-video slot now requires a `video/*` content type, so the SPA fallback (200 `text/html`) can no longer render a broken player. **Gates:** `tsc` 0 · `tsc -p e2e` 0 · `npm test` **115 files / 1432** · `E2E_TARGET=preview npx playwright test` **81 passed** · build 0 · `node --check` 0 · design-audit 0 · contrast 0 · `npm audit --omit=dev` 0. **Deployed** (`DEPLOY-AUTHORIZED: merge, worker, pages`): `main` pushed `1a72827..633319b` then docs `a9d0441`; worker `66e1c99d-b8aa-4f93-ba05-2a8b60270c88` (was `aafcf3bf-…`); production `ed995593-0a8d-4e50-9b18-bde6b6308719` serving `assets/index-Cipqt6LI.js` (was `index-CZabXOG5.js`). Verified live: `/health` status-only, `/crypto/health` unchanged (`ready:false`), unauth `/admin/api/overview` + `/admin/schema` **401**, `/demo` loads with no account and no `/ai/` call, SW registers, live content **49 / 531 / 73**. Rollback: worker `wrangler rollback aafcf3bf-…`; Pages `d97e280e-…`. No secret, D1 write, or owner-only item touched. |
| 2026-10-04 | V36 | **Map corrected against the code, not just appended to.** The `Last verified` header still named the pre-V34 bundle, §9 still named `launch-hardening` as the branch of record (`origin/HEAD` is `main`), and §8 did not list the three standing design/simplicity gates at all — so a new run reading those sections would have shipped against a stale bundle, the wrong branch, and without the gates. All three now corrected, and the V34–V36 facts added to the body (§7 radius ladder + `pointer-hover:`, §4 page titles + screen naming, §8 gates) instead of living only in this changelog. Product-experience audit (`/product-experience-audit`): every screen walked as a real user, the panel findings filed, the approved plan executed. **Guided Practice and the Quiz screen had no top-level heading** — Guided Practice was named only by an `<h3>` grammar title at line 304, Quiz only by a heading that renders on the result screen — so both are now named (the practice header line became its `<h1>`, the quiz top bar states «اختبار سريع»); `scripts/simplicity-check.mjs` `hasHeading()` tightened from `<h1>`/`<h2>`/`<h3>` to `<h1>`/`<h2>` after measuring the strict rule over all 27 screens (it named exactly those two), and its guard test now evaluates the shipped expression against an h3-only screen. **The Ask failure card carries `role="alert"`**, and Placement feedback, Quiz explanation and the redemption error/success banners carry `role="status"`/`role="alert"` as Listening and Writing already did. **`document.title` follows the route** via `titleForPath` in `src/App.tsx` (exported, 19 declared routes named, no two colliding), so two open tabs are distinguishable. Pinned by `tests/screenNames.test.ts` (5) and `e2e/screenNames.spec.ts` (4); the throwaway walk spec was deleted. Gates: tsc ×2 clean · `npm test` 112 files / 1410 · Playwright 80 passed · build OK · design-audit / simplicity / contrast clean · `npm audit` 0 · three content audits 0. |
| 2026-10-04 | V38 | Install-icon + conversation polish, deployed. **Install icon:** the installed PWA drew a white, broken logo because the manifest pointed at the transparent mascot art under a size the file did not have (a 512px file labelled 192x192); `vite.config.ts` + `index.html` now ship four opaque icons composited on the brand near-black — `katzu_icon_192/512`, `katzu_icon_maskable_512` (safe-zone padded), `katzu_apple_180` — at real dimensions, plus the Apple web-app metas. New `tests/manifestIcons.test.ts` decodes the PNGs and asserts real size == declared size and every alpha byte 255. **Chat:** the in-flight indicator moved from a 20px wave in a slim chip to a 56px centred glass card; the voice orb is centred with its status/live-caption column beneath it; composer controls are 44px; and `orbSizeForViewport` scales the orb down smoothly below ~760px of height so the transcript keeps half the screen on the 360×640 floor (measured 309.7 → ≥320). **Gates:** `tsc` 0 · `tsc -p e2e` 0 · `npm test` **116 files / 1437** · `E2E_TARGET=preview npx playwright test` **81 passed** · build 0 · `node --check` 0 · design-audit 0 · contrast 0 · `npm audit --omit=dev` 0. **Deployed** (`DEPLOY-AUTHORIZED: merge, worker, pages`): `main` pushed `3776b1c..93653dc`; worker `4d34c8eb-6047-4b4a-a859-cea43d673e1f` (was `66e1c99d-…`); production `ef91fad7-f5d9-4764-8e7f-f93952808bdb` serving `assets/index-DHO4J2Da.js` (was `index-Cipqt6LI.js`). Verified live: the four icons serve 200 at exact byte sizes (25 487 / 128 393 / 89 590 / 22 649), `manifest.webmanifest` lists 3 icons, `/health` status-only, `/crypto/health` unchanged (`ready:false`), unauth admin **401**, `/demo` loads signed-out with only `/analytics/events` on the wire (**no `/ai/` call**), and `scripts/verification-battery.cjs` scored **12/12** including SW active + precache 105 + offline navigation. Live content re-measured: **49 / 531 / 73**. Rollback: worker `66e1c99d-…`; Pages `d1d9c23b-…`. No secret, D1 write, or owner-only item touched. |
| 2026-10-04 | V40 | Live Conversation redesign (UI/layout only) + deploy. **Header:** compact 56px bar (back · truncated title with a segmented round bar + level chip · ⋯); difficulty and the global translate toggle moved into the ⋯ bottom sheet (48px rows); three controls at most. **Chat:** the orb card above the transcript was removed so the chat fills the screen; coach bubbles sit beside a 32px mascot avatar with 17px LTR German (`kz-de-message`) and the Arabic collapsed behind a «ترجمة» chip (grid-rows height animation); the correction is one left-accent card under the learner's own bubble; typing shows three dots in a bubble; an entering message fades+rises; a ↓ jump button appears when the learner scrolls up. **Input bar:** one rounded `surface-hero` container with a 44px lightbulb hint button (opens a hint bottom sheet, replacing the pill), an auto-LTR 16px textarea (`Schreib deinen Satz…`, grows to 3 lines), and a 56px action button that cross-fades the orb mic ↔ send; the keyboard-toggle icon is gone. **Polish:** top-centre radial light, `visualViewport` keyboard handling (with a `100dvh` fallback), reduced-motion disabling the pulses/spins, `navigator.vibrate(10)` on mic, Arabic aria-labels, memoised messages. A `backdrop-filter` parent trapped the hint sheet's `position: fixed`, so the sheet is now a sibling of the dock. Gates: `tsc` 0 · `tsc -p e2e` 0 · `npm test` **116 files / 1437** · `E2E_TARGET=preview npx playwright test` **82 passed** · build 0 · `node --check` 0 · design-audit 0 · contrast 0 · `npm audit --omit=dev` 0 · geometry measured at 360×740 (transcript 573 px, dock 87 px) and 412×915 (748 / 87) with the bar inside a keyboard-shrunk viewport. **Deployed** (`DEPLOY-AUTHORIZED: merge, worker, pages`): `main` pushed `4b3ae3a..e289fa2`; worker `d2844175-2827-4c19-b7ba-60b0981f5569` (was `4d34c8eb-…`; no worker code change — frontend-only); Pages production serving `assets/index-CAndzOJZ.js` (was `index-DHO4J2Da.js`), 200. Verified live: `/health` status-only, `/crypto/health` unchanged (`ready:false`), unauth admin **401**, `scripts/verification-battery.cjs` **12/12**. Rollback: worker `4d34c8eb-…`; Pages `ef91fad7-…`. No secret, D1 write, or owner-only item touched. |
| 2026-10-04 | V40-2 | The two accessibility defects V40 measured and left open, fixed on evidence. **Invisible control announced:** the 56px action slot cross-fades the orb and the send plane, and the half not showing was hidden with `opacity-0` alone — measured with an empty field it was `disabled=true` but still in the accessibility tree, so a screen reader walked from the field into an invisible «أرسل جملتك» and then into the microphone (and, once text was typed, the reverse). Fixed with `aria-hidden` + `disabled`/`tabIndex={-1}` + the existing `pointer-events-none` on whichever half is not showing; `KatzuOrb` now also states its disabled state in the tab order. `inert` was tried first and rejected on measurement — React 18.3 never writes the attribute to the DOM (`inertAttr=false`, no warning), so a type declaration would have made the build green while hiding nothing; a unit test now pins that the source does not use it. **Pinch-zoom restored (WCAG 1.4.4):** `index.html` no longer sets `maximum-scale=1.0, user-scalable=no` (the item V9-10 filed as unfixed, invisible to the B6 gate because axe rates `meta-viewport` moderate) and now sets `viewport-fit=cover`, which is what makes the dock's `env(safe-area-inset-bottom)` real on a notched phone; the double-tap suppression the old tag was really providing moved to `touch-action: manipulation` on controls, with `pan-x pan-y pinch-zoom` on the transcript and `overscroll-behavior: none` on `html`. `meta-viewport` was the only axe violation left on the live screen and it is now zero at any impact, with and without text; the `color-contrast` item V9-10 filed on `/` and `/welcome` no longer reproduces on the current bundle. **Contracts:** new `tests/v40ConversationA11y.test.ts` (10) and `e2e/conversationA11y.spec.ts` (4), plus a public-screens scan at *every* impact in `e2e/accessibility.spec.ts` — the band the viewport failure lived in. Both new e2e tests were shown to fail on the pre-fix bundle. The conversation root also gained a `.kz-viewport-pin` class (`100vh` then `100dvh`) so an engine without `dvh` cannot collapse the screen. Gates: `tsc` 0 · `tsc -p e2e` 0 · `npm test` **117 files / 1447** · `E2E_TARGET=preview npx playwright test` **87 passed** · build 0 (precache 105) · `node --check` 0 · design-audit 0 · contrast 0 · simplicity-check 0 · `npm audit --omit=dev` 0. **Deployed** (`DEPLOY-AUTHORIZED: merge, pages`): `main` pushed `dbf32a1..fbd40bb`; Pages built from git on the push, production deployment **`265d306f-acbf-4887-8fae-e87b6ca4ab02`** serving `assets/index-DgZAvg7.css` (the `viewport-fit=cover` meta and all four new CSS rules verified in the live bytes). No worker deploy — no worker code changed, so the worker stays `d2844175-…`. Verified live: `/` `/demo` `/sw.js` 200, `/health` status-only, `/crypto/health` unchanged (`ready:false`), unauth admin **401**, `scripts/verification-battery.cjs` **12/12**. Rollback: Pages `3a63b224-98b1-40bf-a631-9ad1f8b49cb6`. CI run `37211172367` **success**. |
| 2026-10-05 | L0 | Launch-hardening baseline. The "Excellence A/B work is local and uncommitted" premise was **UNPROVEN and false**: the tree is clean at `85ed663` (2 untracked owner files), so there was nothing to batch-commit. Baseline gate found one real failure: `tests/secretScan.test.ts` timed out at Vitest's 5s default while the scan it runs finishes in ~2s alone — the case shells out to node + one `git grep` per pattern and runs beside 127 other workers, so the budget was wall-clock, not work. Fixed by giving the spawning cases an explicit `SPAWN_TIMEOUT` (assertions untouched) and recorded as MEMORY lesson 40. Baseline: `npm test` **128 files / 1643 tests** green. Also: a stale `vite preview --port 3000` from a prior run held the port and silently blocked the preview gate (MEMORY 2) — freed before measuring. No deploy. |
| 2026-10-05 | L1 | **One price, from one place.** Four surfaces quoted money three different ways: the landing page, the gate modal and the redemption screen mirrored `/crypto/health` (`priceUsd`, **dollars**, check-out still `ready:false`) behind a hardcoded «5 دولار / شهر» fallback, while the paywall screen read `GET /pricing` (**euros**). A learner could be told 5 USD on one screen and 29 € on the next, and the fallback was reachable whenever the fetch failed. New `src/lib/offers/priceSource.ts` is the one loader: one `/pricing` call shared by concurrent callers, cached for the page load, and a **failure is not cached** so a paywall can recover on the next mount. `PaywallScreen` now reads it too, so all four agree by construction. The hardcoded fallback and the whole `/crypto/health` price path are **deleted** from `links.ts`; crypto check-out code is untouched. Failure shows **no price and no buy button** on every surface, never a stale number. **Pass tiers (L6):** the modal offers exactly `pass90` (3-month, recommended) and `monthly` — the server has never priced a yearly or student tier, so there is nothing behind a toggle to reveal. Tests: `tests/priceSource.test.ts` (**16**, replacing the obsolete `tests/planOrdering.test.ts`), incl. source scans that no app file reads `crypto/health`, `priceUsd`, `FALLBACK_PRICE_LABEL` or a hardcoded currency amount; `e2e/paywallPricing.spec.ts` +4 (landing↔paywall parity, no amount on failure, modal tiers, modal no-buy). `npm test` **128 files / 1655** · `tsc` ×2 clean · build 0. |
| 2026-10-05 | L2 | **The free-session promise says three, because the Worker enforces three.** `MAX_FREE_AI_SESSIONS = 3` was mirrored nowhere on the client, so the landing page hand-wrote «٣ جلسات» in two places, the paywall rendered «3 جلسات» through `arCount`, the Dexie seed hard-coded `freeSessionsRemaining: 3`, and the playbook's §9.1 draft promised **one** session («مرة وحدة» / «جلسة محاكاة مجانية وحدة») — four numbers for one allowance, two of them wrong. Now: `src/lib/entitlement/trialCopy.ts` owns the mirror (`MAX_FREE_AI_SESSIONS` + `MAX_FREE_SESSIONS_AR`) and every surface reads it; the Dexie seed points at the same constant; `tests/trialPromise.test.ts` (**11**) reads `MAX_FREE_AI_SESSIONS` **out of `cloudflare-unified-worker.js`** and fails on mismatch, plus source scans that no surface hand-types a count. **Numerals:** Arabic prose takes Arabic-Indic digits now — new `toArabicDigits()` in `src/lib/i18n/arabicCount.ts` feeds the already-present-but-unread `arCountWith` (MEMORY 21), so the paywall says «٣ جلسات» like the landing page. One existing assertion in `tests/v31HonestMoments.test.ts` updated for the digit shape; its subject (server number, not the local seed) is unchanged. **Playbook:** §8 pricing table corrected from $15/$30 to the server's €12,99/€29 standard group with the special-region and `unproven` notes, and §9.1 FS1–FS3 rewritten to three sessions ⚠️ native read. `npm test` **129 files / 1666** · `tsc` 0. |
| 2026-10-05 | L4 | **Four events the funnel could not see.** `free_session_exhausted` (fired only on `FREE_QUOTA_EXHAUSTED` — a level lock is NOT exhaustion and counting both would understate the allowance), `exam_date_set` (lead time in **days**, never the date), `referral_converted` (fired only when the server accepted the claim; the code never travels in the event), `share_landed` (the receiving half of the existing `share_click`, fired once per page load in `App.tsx` when the address bar carries a `ref`). `free_session_exhausted` and `referral_converted` are added to `FUNNEL_EVENTS` so they get a durable D1 row, not only the 30-day KV window. **Deliberately not added:** `share_clicked` (the existing `share_click` already fires at all four share surfaces — a second name would split the funnel) and `order_intent` (**no client path exists**: the app never creates an order, check-out is the separate sales site, and `purchase_clicked` already marks the outbound buy). New `tests/launchEvents.test.ts` (9) walks the whole app and asserts every `track()` name exists in BOTH allow-lists, plus the privacy assertions on each new event. `tests/funnel.test.ts` 8→10 and `tests/workerClient.test.ts` updated for the new counts. `npm test` **131 files / 1702** · `tsc` ×2 clean. |
| 2026-10-05 | L9 + L10 | **Cost safety, and two first-user-path truths.** **The spend cap was invisible to learners.** `AI_DAILY_SPEND_CAP` was read and enforced (`checkDailySpendCap`, and it runs *before* the trial ledger — so a free learner's session does count against the bill, verified in the source), and the Worker already sent an Arabic `DAILY_SPEND_CAP_MESSAGE` with a 503. The client had **no case for that code**: it fell through to `AI_SERVICE_MESSAGE_AR` — «تعذر إكمال هذا الدور» — which reads as the learner's fault and invites exactly the wrong action, retrying into a closed door. New `DAILY_SPEND_CAP_MESSAGE_AR` in `src/lib/conversation/stateMachine.ts`, matched **before** the `/quota/i` branch so it cannot be swept into the free wall, `kind: 'network'` + retryable (the cap lifts on its own). **MITIGATED, NOT FIXED:** `/ai/translate` `net::ERR_ABORTED`. The root cause is not provable from code — the abort is `fetchWithTimeout`'s own 12 s `AbortController` firing on a cold cache — and a bounded retry plus a visible Arabic `translationState: 'unavailable'` with a way back already existed in both callers. Pinned rather than changed, so neither can vanish silently. **Trail placeholder removed:** `ScenarioBanner` printed «صورة هذا الموقف (16:9) ستُضاف هنا» — a developer-facing note shown to the one person who cannot act on it, in the slot forming a learner's first impression of the situation. A scenario without artwork now looks like a lit scene and says nothing. **Reading skill:** verified already honest — the card is a `<div>`, not a button, so there is no dead tap target; now pinned. New `tests/launchSafety.test.ts` (**17**). `npm test` **132 files / 1719**. |
| 2026-10-05 | L8 | **A read-only order view, because the 12h promise had no clock on it.** Playbook D8 promises «يصل الكود خلال ١٢ ساعة» and nothing measured it. New `GET /admin/api/orders` → `listOrders` in `cloudflare-admin.js`: one `SELECT` over the existing `crypto_orders`, no write, no new table, no new auth path. It returns the alias (claim token, truncated to 12 — enough to recognise an order, not the whole handle), the pass in words (`monthly`/`pass90`/`Nmo`), method, status, **code minted vs redeemed as two separate booleans**, and `hoursSincePaid` measured **from `paid_at`, not `created_at`** — the clock the buyer was promised starts when their money landed. `CODE_DELIVERY_PROMISE_HOURS = 12` is a constant rather than a number typed into the view, so the admin and the copy cannot disagree. The honest case is the important one: an unpaid order reports `withinPromise: null`, **never `true`** — there was no delivery to be late for, and reporting "on time" would show a promise kept that was never started. **UNPROVEN live:** `crypto_orders` is still `test_mode`, so this may be empty in production until check-out goes live. Tests: `tests/adminOrders.test.ts` (**16**), incl. 401 with no secret, 401 with the wrong secret, POST refused, and a source scan that no statement is anything but `SELECT`. |
| 2026-10-05 | L5 | **The landing page, in the order a stranger decides in.** F9: hero → demo → proof → price → founder → questions. Four sections are **gone** — `WhySection`, `WhoItIsForSection`, `StepsSection` and the trailing `FinalCta` — because each repeated what the hero already said, and a page that ends with a second CTA has two main actions. **Founder line:** new `FounderSection` carrying the playbook §3.6 non-affiliation sentence **verbatim** (`NON_AFFILIATION_AR`, asserted against the playbook by test), placed above the FAQ because price is exactly where somebody asks "is this official?". It deliberately names **no author** — the repo does not state who builds this, and inventing a founder is the same defect class as inventing a screenshot; the only claim it makes is the one the product keeps (everything measured, and unmeasured things labelled as unmeasured). **Proof:** the repo has **no product screenshot**, so none was fabricated — the proof section carries real German correction pairs, and a test walks every `src`/`href` in the file and fails if one names an asset that is not shipped. **Share tags:** `og:locale ar_AR` + `og:locale:alternate en_US` and `twitter:card summary_large_image` in `index.html`; `og:image` stays root-relative and **no host is hardcoded** (`katzu.app` does not resolve — asserted absent). A designed Arabic-text share card is **NOT built and NOT invented** — see OWNER-OPEN. **Funnel unchanged:** all four steps (`landing_viewed`, `demo_started`, `signup_started`, `first_independent_turn`) still fire separately; a test scans the whole app for them. New `tests/landingMinimal.test.ts` (**15**) + `e2e/landingHero.spec.ts` (**5**), which measures the rendered headline at **390 px** (line boxes, not character count) and asserts the CTA is above the fold. `design-audit` 0, contrast 0. |
| 2026-10-05 | L7 | **The Trail leads with the exam scenarios.** `examFirstScenarios` in `src/lib/levels/levelSpec.ts` (pure, next to the other curriculum-order rules): `exam_*` first, then everything else, each group in the author's own `sort_order`, stable on ties. It only reorders — **nothing is hidden**, and the «اعرض بقية المشاهد» control and `TRAIL_PREVIEW_COUNT` are untouched, which is pinned by a test reading the screen source. A learner who came to prepare for an exam previously met five everyday situations first and had to know that `exam_` meant what it meant. New `tests/trailOrdering.test.ts` (**10**). `npm test` **134 files / 1745**. |
| 2026-10-05 | L3 | **The channel tag `?src=`, end to end.** New `src/lib/attribution/source.ts` owns it: `sanitizeSource` accepts only `[a-z0-9_-]{1,32}` (case folded), and everything else is **dropped, not trimmed** — a URL, an email or an Arabic sentence cannot become content in a field the admin renders. Captured on **every route change** in `App.tsx` (the tag often arrives on `/demo` or on the signup link itself, so a one-shot boot capture would lose exactly the visits that matter), held in `localStorage`, sent to `/auth/session` as `source`, and forwarded by `buildSalesUrl(ref, src)` — `ref` and `src` travel **together**, neither replacing the other. **Server-side:** additive `users.src TEXT` + index in `ensureRegistryTables`, with the `ALTER` deliberately outside the `CREATE` batch (a D1 batch is transactional, so on a fresh database the ALTER would fail with *duplicate column name* and roll the whole bootstrap back) and the *already exists* case treated as the steady state. `sanitizeSrcTag` in `cloudflare-admin.js` repeats the grammar server-side — a client can be bypassed — and `describeUser` now returns `src`. **Naming:** the column is `src`, not `source`: `describeUser.source` already means *which store the record was read from* (`users`/`email_index`), and one name with two meanings in one response is a silent bug. Tests: `tests/sourceAttribution.test.ts` (**27**, incl. client/server grammar equality) + `e2e/sourceAttribution.spec.ts` (4). `tests/adminRegistry.test.ts` corrected from "no ALTER at all" to "only `ADD COLUMN`, nothing else" — the same correction the content bootstrap already needed — and 5→6 additive columns. `npm test` **131 files / 1702**. |
| 2026-10-05 | L11 | **The CI failure this launch work cost, paid down with a guard.** Run `37336858313` failed the unit job on Linux with ENOENT while the identical tree was green on Windows: `tests/launchEvents.test.ts` read its input as `src/features/analytics/../../lib/analytics/events.ts` — a directory that does not exist, which Windows resolves anyway and Linux refuses, so the defect surfaced as a missing file only in the one place nobody was watching. The test now names the file directly. New `tests/repoPaths.test.ts` (**4**) pins the rule over the whole unit suite: every path literal handed to `readFileSync` — **or to the local read helpers** (`source`, `read`; routing through a wrapper is how the bug hid from the guard's first draft, which scanned only direct calls) — must exist, must reach its file only through directories that exist (**segment-walked**, not `existsSync`-checked, because `existsSync` is exactly what lies here on Windows), and must be relative. The guard was verified the only honest way: the broken path was reintroduced, the guard failed, the fix restored it. MEMORY lesson 41. `npm test` **136 files / 1764**. No deploy. |
| 2026-10-06 | L12 | **One digit shape: a price or a session count is a Western digit.** L2 had made the numerals in Arabic prose Arabic-Indic («٣ جلسات», «٢٩ €»); the owner reversed that for the two classes that are quantities rather than prose. `MAX_FREE_SESSIONS_AR` and `sessionsPhrase` now go through `arCount` (Western by construction), the referral reward copy says «3 أيام», the FAQ example says «25 سنة», and the playbook's build-ready §8/§9.1 are Western throughout (prices, plan months, the session table, the ordinals and counts). Removed `toArabicDigits` and `arCountWith` — the ٣ helper — from `src/lib/i18n/arabicCount.ts`: with the rule in force nothing in the product wanted a second digit shape. New `tests/westernNumerals.test.ts` (**3**) is the one rule for the two classes: it scans all of `src` for an Arabic-Indic digit beside a price/session noun and holds §8/§9.1 to zero Arabic-Indic digits. **Verified by reintroducing the defect** — «٣» put back into `SESSION_FORMS` failed 2 of 3, restored it to 3/3. `tests/trialPromise.test.ts`, `tests/v31HonestMoments.test.ts` and `tests/arabicPlural.test.ts` updated for the shape. `npm test` **138 files / 1776**. |
| 2026-10-06 | L13 | **A share card, built from the repo's own tools.** `og:image` pointed at the raw 512px app icon — a square a social card crops, so a link preview showed a logo rather than a sentence. New `scripts/make-share-image.mjs` (`npm run make:share-image`) renders one local HTML with Chromium through Playwright — Cairo embedded as a data URI, the AMOLED/near-black + lavender palette read from `src/index.css`, the **verbatim landing headline** — at exactly 1200x630, and it refuses to write the PNG if the content overflows its canvas (measured: content 1198x628). Committed `public/assets/share/katzu-share-ar.png` (opaque, no alpha) and pointed `og:image`/`twitter:image` at it with width/height/alt. `index.html` stays **root-relative** (the repo may not hardcode a host it cannot resolve); new exported `absoluteOgImages()` in `vite.config.ts` rewrites exactly the two image tags from `VITE_PUBLIC_APP_URL` at build time. Verified end to end: a build with the var set emits `https://app.example.test/assets/share/katzu-share-ar.png`, a plain build stays `/assets/...`. `scripts/check-launch.mjs` gained its second, owner-only blocker — it now counts an unset `VITE_PUBLIC_APP_URL` and fails strict while it is missing. New `tests/shareImage.test.ts` (**8**), incl. a PNG decode (1200x630, fully opaque) and the transform's three cases. No host is written to any shipped file. |
| 2026-10-06 | L14 | **The spend cap is configured, not merely coded.** L9 shipped `checkDailySpendCap` and its Arabic message, but `AI_DAILY_SPEND_CAP` was **unset**, so the ceiling was inert in production — the emergency brake existed and nothing was holding it. It is now a plain `[vars]` entry in `wrangler.toml` at **292** (the figure `scripts/measure-turn-cost.mjs` recommends), marked **UNPROVEN** in a comment because it is derived from cost estimates rather than observed spend, and stated to be a var that must **never** become a secret. Enforced for the whole service: one `global-ai-spend` counter, incremented **before** the comparison and **before** the trial ledger — so a free learner's conversation counts against the same bill a Pro one does. Verified with `wrangler deploy --dry-run`: `env.AI_DAILY_SPEND_CAP ("292")` present as an Environment Variable, config valid. `tests/launchSafety.test.ts` extended **17→19**: the config value, the no-secret rule, the single counter id, and increment-before-compare. |
| 2026-10-06 | L15 | **A read-only smoke that can be pointed at production.** New `e2e/productionSmoke.spec.ts` (**5**) plus `E2E_TARGET=production` support in `playwright.config.ts` (baseURL = the Pages URL, **no webServer**, overridable with `E2E_PRODUCTION_URL`). It writes nothing: a tagged `?src=test` landing loads, the share tags are on the document, and the console stays empty; the landing and `/paywall` quote the same amount; the free-session copy says «3 جلسات» with no Arabic-Indic left; and the two parts that are meaningless elsewhere declare themselves — the failure-mode price (needs the mock) and the admin 401 (needs the real worker, whose origin is **captured from the app's own `/pricing` request**, so no host is hardcoded). Against production **before** the deploy it found exactly the two gaps this pass creates — `og:image:width` absent and «٣ جلسات» still live (**2 failed**), with the admin 401 **green** and paywall parity **skipped** (anonymous `/paywall` redirects to `/welcome`; the smoke does not sign in). Preview: 4 passed / 1 skipped; full preview suite **111 passed / 2 skipped**. Also fixed a real race the first production run exposed (the price badge is read after it has actually received the server amount). |
| 2026-10-06 | L16 | **Production vs HEAD, read only.** **Pages = HEAD:** production deployment `ec47b2ff-5cc8-4e89-9209-ac851d00538b` from `a3cc0db`, serving `assets/index-BudV5Bjk.js` — the whole frontend, including the L-series, is live. **Worker is stale:** the active 100% deployment is version `0a653eca-2224-4114-b1fa-749bb2cb1251` (version 127, uploaded **2026-10-05T12:44Z**), which predates both L-series commits that touch worker code — `fe1d504` (14:52Z: `users.src`, `sanitizeSrcTag`) and `4d05905` (15:10Z: `listOrders`, `GET /admin/api/orders`). So the source-attribution column and the owner's order view are **not live**, while the client that sends them is. `/health` = `{status,service,ready,maintenance}` — the **model pool is NOT disclosed** in production. `/crypto/health` unchanged (`ready:false`, `test_mode`, no API key); it still publishes plan labels, and those labels carry Arabic-Indic digits («٣ أشهر — وفّر ١٣٪») on a public endpoint — noted, not in the L12 surface set (the app no longer reads `/crypto/health`). A generic 401 on every `/admin/api/*` path means a 401 cannot prove a route exists; the timestamp comparison above is the evidence used. |
