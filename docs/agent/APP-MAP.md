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

*Last verified: 2026-10-02 (V28 Stage 3). Verified against `src/App.tsx`, `package.json`, `wrangler.toml`,
`cloudflare-unified-worker.js`, `tests/`, `e2e/`. Re-check the four "volatile" sections — routes,
endpoints, tables, deploy ids — on first touch of any of them.*

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

## 1. Tech stack (v1.1.0)

| Layer | Choice | Notes |
|---|---|---|
| UI | **React 18.3** + **TypeScript 5.7** + **Vite 6** | single framework, no second one (AGENTS §3) |
| Styling | **Tailwind 3.4** + `clsx` + `tailwind-merge` | design tokens in `tailwind.config.js`, `.kz-*` utilities in `src/index.css` |
| Routing | **react-router-dom 7.3** | all routes in `src/App.tsx`; screens lazy-loaded |
| Client state | **Dexie 4 / IndexedDB** (`src/lib/db/katzuDb.ts`) | offline fixtures + queue + local fallback |
| Server state | **@tanstack/react-query 5** | remote fetches |
| Validation | **zod 3.24** | request/response shapes |
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
├─ .github/workflows/ci.yml        # verify + e2e + secret-scan (Node 24.15.0)
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
  `generated_codes`, `error_reports`. Content DDL is **unversioned** and lives only in the
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
| `GET /crypto/health` | payments readiness flags + price only |
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
| Repo | `github.com/ghaidak077/katzu-webapp-v3` (SSH/https), branch of record: `launch-hardening` |
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
- **`ADMIN_SECRET` must be rotated** (was exposed in an earlier prompt).
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
src/features/onboarding/OnboardingScreen.tsx
src/features/placement/PlacementScreen.tsx
src/features/practice/PracticeScreen.tsx
src/features/progress/ProgressScreen.tsx
src/features/quiz/QuizScreen.tsx
src/features/report/SessionReportScreen.tsx
src/features/review/ReviewScreen.tsx
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
| 2026-10-03 | V29 | Vocabulary-bridge analytics (owner: "analytics (or an A/B) for word-bank taps and «لم أتذكّر» reveals so we can tell whether the vocabulary bridge actually reduces give-ups"). Chose analytics over a live A/B — no new infra or deps, and the closed allow-list already carries the join keys (`installId` + day), so the reveal rate can be compared with and without bank use. Two events added to BOTH allow-lists (`src/lib/analytics/events.ts` + `cloudflare-analytics.js`, kept equal by `tests/analyticsRoute.test.ts`): **`word_bank_tapped`** (every chip tap; prop `skill` = review|practice|chat|listening|writing, plus `kind` on review/practice) and **`review_revealed`** (the explicit «لا أتذكّر — أرني الإجابة» way out). All four bank containers now carry `data-testid="word-bank"` (Review's added). `e2e/skillSurfaces.spec.ts` proves the two events actually POST to `/analytics/events` — not just that `track()` was called. `npm test` 1230 (was 1229); e2e 62 passed (was 61). |
| 2026-10-03 | V29 | Daily XP + streak made server-authoritative (owner: "so a device clock or timezone change can no longer grant a fresh day") — it closes the accepted limit of the V28 streak/XP audit. New `cloudflare-daily.js` derives the day from the **server** clock shifted by the learner's offset, and **locks that offset at first sync** (`clampOffset` −720..840) so a later device timezone cannot move the day boundary; on first creation it seeds `totalXp` + completed-day history from the client (bounded, so an existing learner is not reset), then ignores client history. `applyDailyEvents` is idempotent by event id, caps `xpToday` at 600, marks the three daily tasks and records an earned day; `sessionXpFor`/`dailyStreak` are twins of the client rules (pinned by `tests/dailyAuthority.test.ts`). One KV record `daily:<sub>`. `/progress/sync` processes the ledger once before the D1 merge loop and overlays `total_points`/`streak_days` (D1 and KV-degrade paths); `/progress/get` overlays too. A stats-only legacy client neither creates nor seeds a ledger but still adopts an existing one, so the plain max-merge it relies on is preserved while an account under daily authority cannot be inflated. Client: `src/lib/progress/dailyAuthority.ts` (durable localStorage event queue, `buildDailyPayload`, `adoptDailyAuthority` writing `totalXp`/`streakDays`/`dailyAuthority`), adopted by `workerClient.ts`. `npm test` 1265 (was 1230, +16 across `tests/dailyAuthority.test.ts` + `tests/dailyRoute.test.ts`, +19 in the adversarial `tests/dailyLedgerAdversarial.test.ts`); e2e 62 passed; build OK. **Adversarial probe — lands:** omitting `daily` while no ledger exists stores arbitrary stats (blocked once a ledger exists); the one-time first-sync seed is unbounded (lifetime XP and a fabricated completed-day history → streak); accuracy lies and fresh-id replays land but cap at 600 XP + 1 earned day/day; the 400-id dedupe window can be evicted for one re-credit. **Blocked:** id replay, the clock/timezone change (offset locked), future/invalid seed days, unknown kinds, short ids, out-of-range offsets, and lifetime XP beyond one capped day per server day. **Correctness hole:** the KV ledger is a non-atomic read-modify-write, so two concurrent devices with distinct events lose one. No commit/deploy; a worker deploy is required to enforce it live. |
| 2026-10-03 | V29 | Adversarial hardening of the daily ledger + a public-launch-readiness pass. All four attacks the probe landed are closed: the ledger is now created on **every** `/progress/sync` (a missing `daily` payload can no longer opt out of authority; a client total rises only by `DAILY_XP_CAP × elapsed days`), the first-sync seed is clamped (`SEED_MAX_TOTAL`/`SEED_MAX_STREAK`), a per-account async lock serializes the KV read-modify-write in-isolate (removing the concurrent lost-update), and the dedupe window rose 400→2000. The D1 path preflights `base_rev` so a request that will 409 never touches the ledger. Two real data-lifecycle bugs from V29-4 were found and fixed: `handleDeleteUser` now deletes `daily:<sub>` (it survived deletion before) and `/user/export` includes it; `wipeUserScopedData` clears the localStorage daily-event queue so a signed-out learner's sessions cannot be credited to the next account (new leaf `src/lib/progress/dailyQueueKey.ts`). Gates: build OK, tsc clean (src+e2e), `npm test` **1266** (was 1265; +1 wipe test; 105 files), e2e **62 passed** (production bundle), 4 content audits exit 0, `npm audit` 0, secret-scan clean. Committed as `e0ecd81`; CI run **`37109392007`** green (verify · e2e 62 passed · secret-scan). **Deployed (V29-6, `DEPLOY-AUTHORIZED: merge, worker, pages`):** merged ff to `main` `559aa81`; worker **`a510e25c-ed78-470e-92a6-810d38794cc1`** now carries `cloudflare-daily.js`; production serves **`assets/index-CfZ6VaJV.js`**; unauth admin 401; the two new analytics events accepted live; battery 12/12; `main` push CI `37110867672` green. |
| 2026-10-04 | V30 | Design-system hardening + motion scale + cost ceiling. **Palette:** five values sat in the rose band (OKLCH h 339–344, ~50° off the lavender) — `kz-magenta`, `kz-magenta-deep`, `tertiary`, `tertiary.container`, `article.die`. Earned is now h 299 (`174 123 255` / deep `115 67 222`), `tertiary` moved to a periwinkle shoulder (h 272), `article.die` to pale lilac (h 300), and both glass tiers pick up the brand hue (`16 13 26` canvas, `7 5 14` well). Canvas-side copies in `borderBeamCss.ts` / `KatzuOrb.tsx` / `KatzuPresence.tsx` and `tailwind.config.js` are pinned to their tokens by `tests/designSystem.test.ts`. **Motion:** the ladder in `src/index.css` had zero readers, so every transition silently used Tailwind's undeclared 150ms; `transitionDuration` (`fast`/`DEFAULT`/`panels`) + `transitionTimingFunction` (`spring`/`out`) now read those variables, and the over-budget `--kz-dur-slow: 560ms` is retired as `--kz-dur-panels: 300ms`. Confetti is gated on `useReducedMotion` (it was the one animated subsystem ignoring it). `BottomSheet`/`Modal` gained a real entrance (`data-mounted` + rAF; the old `transition-opacity` could never fire). The scroll handler in `GlassSurface` now derives position from `scrollY` inside a rAF instead of calling `getBoundingClientRect()` per event. Six progress bars moved from inline `width` to `scaleX` (RTL origin), and `AudioWaveform` from `height` to `scaleY`. All 61 remaining `transition-all` sites name the property they animate (three enumerate explicitly). **Accessibility:** 19 form controls gained an `aria-label`; 20 bare `outline-none` removed (a utilities-layer rule that deleted the global focus ring); 4 icon-only buttons named, the bookmark got `aria-pressed`; 3 sub-44px targets raised. **Gates:** `design-audit.mjs` gained three zero-budget rules (`unnamed-field`, `transition-all`, `focus-ring-suppression`). **Cost:** `/ai/hints` was quota-exempt with no ceiling of its own — only the global 200/day, so refreshing hints repeatedly was an uncapped bill; it now has its own `hints` scope (free 30 / Pro 120 per day). **Measured:** 16 routes clean at 320px and at 200% zoom (no horizontal overflow, no sub-44px target). Gates: tsc clean (src + e2e), `npm test` **1323** (was 1319), design-audit 0, contrast 20/20, build OK, `npm audit` 0. |
| 2026-10-02 | V28 | Stage 3 daily tasks + ranks (owner mission items #6): Journey Home now carries a three-task panel — one scenario session, one grammar step, one review batch — reset at LOCAL midnight with a one-forgiven-day streak. New pure `src/lib/daily/tasks.ts` (`dailyTaskStatuses`, `reviewTaskDone`, `dailyTaskStreak`, `FORGIVEN_DAYS = 1`, `REVIEW_BATCH_SIZE = 5`) + store `src/lib/daily/taskStore.ts` persisting to an additive Dexie **v9** table `daily_tasks`; writers are `markScenarioTaskDone` (session finish), `markGrammarTaskDone` (grammar attempt) and `markReviewGraded` (`gradeReviewItem`, the single review chokepoint). New Arabic rank ladder `src/lib/progress/ranks.ts` (`rankFor`, `RANKS`, shown on Trail as "الرتبة N من M") and anti-farming XP `src/lib/progress/dailyXp.ts` (`creditXp`, `DAILY_XP_CAP = 600`) — the only writer of `totalXp`. UI: `src/features/journey/DailyTasksPanel.tsx`. Tests: `tests/dailyTasks.test.ts` (16), `tests/dailyTaskStore.test.ts` (7), `tests/ranks.test.ts` (10), `e2e/dailyTasks.spec.ts` (2). |
