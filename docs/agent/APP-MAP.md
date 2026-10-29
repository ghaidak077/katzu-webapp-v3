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

*Last verified: 2026-10-28 (founding prices + three-page site). Verified against `src/App.tsx`, `pricing.config.json`,
`package.json`, `wrangler.toml`, `cloudflare-unified-worker.js`, `tests/`, `e2e/`, and the live deploy targets
below (worker `f0b5fa01-b4a2-449c-b470-e770721487eb`, app `assets/index-D4avOAYK.js` from production
deployment `a11c874e-…`, site `1359fb18-…`; `main` = `f334f6d`).
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
├─ scripts/                        # verify/audit/load-curriculum + the static-site rig:
│                                  #   build-website.mjs (18 pages), guides/ (12 articles),
│                                  #   site-seo.mjs (sitemap/robots/llms), site-schema.mjs (JSON-LD),
│                                  #   seo-agents.mjs (the 10 crawlers), site-referrer.mjs,
│                                  #   indexnow-submit.mjs
├─ public/                         # _headers (CSP), legal, scenes/, robots, sitemap
├─ website/                        # ★ the marketing site (direct upload to katzu-landing):
│                                  #   index/pricing/affiliate/help/guides + guides/<slug>.html,
│                                  #   sitemap.xml, robots.txt, llms.txt, IndexNow key, assets/
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
| `/` | `App.tsx` entry → `AppShell.tsx` | The shell decides: signed-in → `/app/trail`, returning visitor → `/signin`, first visit → `/welcome`. The marketing landing moved to the separate site (website.katzuai.com) |
| `/welcome` | `auth/WelcomeScreen.tsx` | First-run greeting; name field carries privacy microcopy |
| `/signin` | `auth/SignInRoute` → `auth/SignInScreen.tsx` | **Google-only** sign-in; level picker A0–B2 (A0 = «تقدير أولي، سنضبطه بالمحادثة»). GIS readiness is observed on the button container (never a timer), `loading` is its own state with neutral copy, and a failed script is re-injected on retry; the CSP must allow `accounts.google.com/gsi/*` and COOP must stay `same-origin-allow-popups` — plain `same-origin` severs the popup. `tests/pwaOffline.test.ts` pins both |
| `/onboarding` | `onboarding/OnboardingScreen.tsx` | Intent/goal capture after signup |
| `/subscription` | `auth/SubscriptionRedemptionScreen.tsx` | Pro offer + activation-code redemption |
| `/placement` | `placement/PlacementScreen.tsx` | Placement test → level |
| Marketing & trust pages | (removed from the app) | Landing, topic pages, `/en/*` and `/trust/*` live on https://website.katzuai.com; old URLs `301` there via `public/_redirects`. `/demo` (removed) `301`s to `/welcome`. A static `public/404.html` answers unknown paths |

### Learner loop (`/app/*` and `/scenario/*`)
| Route | Screen | What it is |
|---|---|---|
| `/app/trail` (default tab) | `journey/JourneyHomeScreen.tsx` | Daily mission home: resume, review-due, streak |
| `/app/library` | `trail/TrailScreen.tsx` | Browse all scenarios/levels (navigation, not the daily mission) |
| `/scenario/:id/story` | `journey/StorySetupScreen.tsx` | Scene + vocab setup before practice; day-0 CTA hint gated on the shared `isFirstSessionDone` |
| `/scenario/:id/practice` | `journey/GuidedPracticeScreen.tsx` | Guided rehearsal; passes context to Live via route state |
| `/scenario/:id/live` | `conversation/LiveConversationScreen.tsx` | **Core loop** — AI chat turn; typing + mic; corrections |
| `/scenario/:id/study` | `study/StudyScreen.tsx` | Deep practice / study |
| `/scenario/:id/quiz` | `quiz/QuizScreen.tsx` | Quiz → result card |
| `/scenario/:id` | `study/ScenarioDetailScreen.tsx` | Scenario detail |
| `/session-report` | `report/SessionReportScreen.tsx` | Debrief: honest stats, corrections, spaced-review scheduling, fix-exercise |
| `/app/review` | `review/ReviewScreen.tsx` | One explicit task per item: word, sentence→German, German→Arabic read-and-reveal, or correction |
| `/app/listen` | `listening/ListeningScreen.tsx` | Listening drill |
| `/app/write` | `writing/WritingScreen.tsx` | Writing task |
| `/app/coach` | `coach/CoachScreen.tsx` | Coaching/trend |
| `/app/grammar` | `grammar/GrammarSectionScreen.tsx` | Grammar locked path: lessons unlock one after another |
| `/app/progress` | `progress/ProgressScreen.tsx` | Honest measured-vs-unmeasured skills, patterns, streak |
| `/app/practice` | `practice/PracticeScreen.tsx` | Vocabulary hub: search, filters, error bank, flashcards, rules |
| `/app/profile` | `settings/ProfileSettingsScreen.tsx` | Profile/settings, sign-out; carries the `REF-` referral card and a separate partner-programme entry |
| `/partners` | `partners/PartnersScreen.tsx` | The signed-in partner link: `POST /affiliate/me` on mount, then the link + copy/share, three steps, a plain sample message and the fine print. Numbers come from the server, never a constant; loading/error/retry states |
| `/dev/system` | `dev/DesignSystemScreen.tsx` | Dev-build only design system |

- Tab router: `/app/:tab` maps `practice → Practice`, `progress → Progress`,
  `profile → Profile`, anything else → `Trail` (`toNavigationTab` in `App.tsx`).
- `/partners` is signed-in only (anonymous → `/signin`), unlike `/delete-account`, which must work
  without a session. The marketing half of the programme stays on the site at `/affiliate`.
- Auth gate: main tabs / learning sessions require sign-in (`App.tsx`); anonymous `/app/*`
  lands on `/welcome`.
- `MainTabsRoute` renders the four glass tabs (Trail · Practice · Progress · Profile) inside one
  glass container; the active pill is concentric by construction (do not break this).

---

## 4. Feature inventory (what exists, where the logic lives)

| Feature | Entry | Logic |
|---|---|---|
| Auth (Google ID token) | `/signin` | `features/auth`, verified server-side against `GOOGLE_CLIENT_ID` |
| Legacy demo migration | `/signin` | `lib/demo/migration.ts` folds pre-signup demo state into the account (`demoFlow.ts` only supplies the legacy state shape; the demo lesson itself was removed) |
| Daily mission selection | Trail | `lib/mission/selectMission.ts`, `lib/utils/dailyMission.ts`, `checkIn.ts` |
| Journey/story context | Story→Live | `lib/journey/{story,practice,context,brief}.ts` |
| Live AI conversation | `/scenario/:id/live` | `useLiveConversation.ts`, `ConversationTranscript.tsx`, `ConversationDock.tsx`, `lib/conversation/*` |
| AI partner persona/correction | server | `cloudflare-ai-chat.js` (identity limits, gentle correction, schema-echo filter) |
| Multi-provider AI + failover | server | `cloudflare-ai-router.js` (defaults: NVIDIA + OpenRouter, owner-editable via admin); Workers AI `[ai]` fallback |
| AI quota / trial ledger | server | KV + `trial_quota_ledger`; `MAX_FREE_AI_SESSIONS = 3` (`cloudflare-unified-worker.js`) |
| SRS spaced review | `/app/review` | `lib/srs/{engine,store}.ts`, `lib/review/validate.ts`, `lib/memory/*` |
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
| Sales property (retired) | `sales/_redirects` | one `301` to `https://website.katzuai.com/pricing#pay`; `cloudflare-crypto.js` (NOWPayments, **test mode**, hidden on the site until live) |
| Trust/legal pages | external | Content source `src/lib/trust/content.ts` (the `check:launch` gate); rendered inline on https://website.katzuai.com/help#privacy · `#terms` · `#refund`; the app links there via `legalPageUrl()` |
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
  `mock_sessions`, and the affiliate programme's `affiliates`, `referrals`, `commissions`
  (`migrations/0003_affiliate_tables.sql` documents that DDL; the Worker creates it). Content DDL is **unversioned** and lives only in the
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
| `POST /affiliate/ref` | is a partner code real and active? `{ok:true}` / `404 unknown_code` / `400 malformed_code` / `429`; returns **no** partner data. The site sets the 30-day `.katzuai.com` cookie itself and only clears it on 404/400 |
| `POST /affiliate/me` | **a signed-in learner's own partner code**, created on first call. Session token or Google ID token; one `affiliates` row keyed by the account email, code derived from the email local part and merged on `ON CONFLICT(code) DO NOTHING`; `201` on create / `200` on existing / `401` unauth / `400` no email / `405` non-POST / `503` storage unavailable. Answers `{ok,code,status,rate,approvalDays,minPayoutCents,payoutMethods}` and **never** contact or payout details |
| `/admin/api/affiliates*` | bearer-gated partner surface (`cloudflare-affiliate.js`): `GET /affiliates` (partners + ledger totals), `POST /affiliates/create`, `GET /affiliates/commissions`, `POST /affiliates/void`, `POST /affiliates/payout`, `GET /affiliates/payout.csv` — same throttle, bearer check and `no-store` as every other admin endpoint |
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
| App (Pages) | `https://katzu-webapp-v3.pages.dev` (custom domain `https://katzuai.com`). **Builds from git on every push to `main`, so the deployment id changes on docs-only pushes too** — quote it only after reading `npx wrangler pages deployment list --project-name=katzu-webapp-v3`. Last verified **2026-10-29** (content-signal batch): `vite build` emits `robots.txt` (the ten crawlers, `/admin/ /api/ /private/` only, and `Content-Signal: search=yes, ai-input=yes, ai-train=yes` in the wildcard group) and a root-only `sitemap.xml` from `VITE_PUBLIC_APP_URL`, and the shell carries `lang="ar"`, one canonical and `hreflang` ar + x-default; deployment `632ddcae-7c31-464c-8df9-0cbaf4d0d205` (source `7595c37`); rollback `e8934052-804f-4dab-a710-756befc443c9` (source `d514739`) |
| Worker | `https://katzu-test.ghaidakalosh008.workers.dev` (`/health` → 200; `/` → 404, expected). Live version `6860fa2f-bfca-44d7-8fc3-870a87aec926` (2026-10-28, source `e9aa028`): `/affiliate/me` 401 signed out, `/affiliate/ref` 400 malformed / 404 unknown, `/admin/api/affiliates*` 401, cron `17 4 * * *`; rollback `998873c6-d773-4bb5-9ec5-2c548e550b0f` |
| Site (Pages) | `https://website.katzuai.com` ← Pages project `katzu-landing`, **direct upload** of `website/` built by `node scripts/build-website.mjs` (does not build from git). Last verified **2026-10-29** (GEO batch): **17 pages** (`/`, `/pricing`, `/affiliate`, `/help`, `/guides`, twelve `/guides/<slug>`) plus `404.html`, a 17-URL sitemap, `robots.txt` for the ten crawlers, `llms.txt`, the IndexNow key `01b620d0…txt`, `/assets/ai-ref.js`; `/` still renders from `scripts/templates/home.html` = the owner's design, now with JSON-LD + hreflang in the head and one footer link «الأدلة». `robots.txt` (2026-10-29) also carries `Content-Signal` in its wildcard group. Deployment `44566671-7ab3-43e0-91f2-b487d4a9990a`, source `7595c37`; rollback `03ec8a29-250d-4517-bf18-3df1049b9106` (source `ee86640`) |
| Sales (Pages) | `https://katzu-sales.pages.dev` ← project `katzu-sales`, **direct upload** of `sales/`, redirect-only: every path 301 → `https://website.katzuai.com/pricing#pay` (2026-10-28: `d3811619-6ce1-4c96-82e7-d11e6004c7ae`; rollback `0de6a626-a242-421f-aca0-faa0ef218722`) |
| Worker name | `katzu-test`; account `00df3d915626e0a681f4fef98c1c587c` |
| **Deploy is gated** | the owner asks in plain words (`deploy`, `push it live`, `ship it`) or writes `DEPLOY-AUTHORIZED` with or without targets (`AGENTS.md` §3, V40-3), and only via `docs/agent/DEPLOY.md` |
| **Content load is gated** | only with `CONTENT-LOAD-AUTHORIZED: <files>` and only via `docs/agent/CONTENT-LOAD.md` |
| Never (even authorized) | write prod D1 outside the content path; touch/secrets/`ADMIN_SECRET`; payments/OAuth/domain/legal; force-push |

Scripts: `dev` (vite :3000) · `build` · `preview` · `test` · `test:e2e` · `test:e2e:types` ·
`lint` · `session:start` (readout: ledger NEXT + §9 + MEMORY facts + git + OPEN ITEMS) · `deploy:worker` (**never run without authorization**) · `tail:worker` ·
`test:smoke:token-hygiene`.

---

## 10. Limitations & open items (as of 2026-10-29)

- **Payments not live** — crypto stays in `test_mode`; `ready:false`.
- **GEO batch (2026-10-29): the site is crawlable, the effect is unmeasured.** Both hosts serve a `robots.txt`
  allowing the ten crawlers (Googlebot, bingbot, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
  Claude-SearchBot, PerplexityBot, Applebot, Google-Extended) and disallowing only `/admin/ /api/ /private/`;
  the site sitemap lists **17** URLs with real `lastmod`, the app sitemap **only** the origin root,
  `/llms.txt` is generated, and `npm run seo:indexnow` submits the 17. **`/llms.txt` is a non-standard
  convention with no published effect on ranking or citation** — kept because it is one generated file.
  **GEO-1:** the 12 guides need an owner read (`docs/agent/GEO-VISIBILITY.md` §7), the 30-prompt panel has
  not been run, and Organization `sameAs` stays absent until real profile URLs exist.
- **The partner programme is deployed; its money path is open with the owner (AFF-1, 2026-10-28).** The worker
  that owns the ledger is live, `POST /affiliate/me` mints a code for a signed-in account, and the three tables
  exist in production D1. **Unproven with real accounts:** the Google-signup attribution, the commission row from
  a real activation-code redemption, the day-14 cron on real data, a refund after payout — all unit-proven against
  a D1 double only. **`/affiliate/enroll` and `/affiliate/me/payout` do not exist in this codebase and never
  did**; the real surface is `/affiliate/me` (self-serve, no application) plus the owner-only
  `/admin/api/affiliates/{create,void,payout}` behind the bearer key.
- **Free lessons are three, once — `FREE-1` closed 2026-10-28.** `MAX_FREE_AI_SESSIONS = 3` counts
  `trial_quota_ledger` rows for the account with no period filter and nothing resets it, so every surface says
  «في المجموع»: home meta/OG/JSON-LD/last button, `/pricing`, `PaywallScreen.tsx` and the `SOFT_PROMPT_*` copy.
  `FREE_LESSONS_PER_MONTH` keeps its name because it is the config key, not a promise; a monthly reset was not built.
- **`dayZeroReport` was a real bug, not a flaky wait (fixed 2026-10-28).** A 1.2 s timer opened the soft Pro modal
  after the first correction; its scrim covered «أرسل جملتك» until dismissed, so the next click waited out the
  90 s timeout. The timer is removed and `e2e/dayZeroReport.spec.ts` watches that 1.6 s window.
- **Signup is Google-only.**
- **Canonical origin is `https://katzuai.com`** (`.env.production`, `VITE_PUBLIC_APP_URL`); the legacy `katzu.app` name does not resolve and is no longer advertised.
- **Cloudflare edge can still block AI crawlers.**
  ClaudeBot and PerplexityBot were answered `403` before any repository `robots.txt` (2026-10-24); the repo
  allowlist cannot override an edge challenge — that is Security → Bots / WAF in the dashboard (owner action).
  The live ten-agent crawl result is in the ledger (GEO-1).
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
- **Review items are contract-checked (V28, V44).** One pure `buildReviewTask` (`src/lib/review/validate.ts`)
  decides the whole card: header, cue, input and answer describe the same task. Types: Arabic word + gloss
  → German (no word bank by default; hint after one miss); full Arabic sentence → German; German → Arabic
  read-and-reveal + 3-way self-rating (no `accepted_answers` field exists, so no typed-Arabic matching and
  no AI call); correction only with Arabic meaning + full wrong + full right, otherwise converted to
  sentence→German or dropped. A card without a usable cue is suppressed, never deleted (Dexie v7
  migration); old mistake rows without a stored meaning are suppressed from Review. German is normalized
  (case, final punctuation, ä≈ae); a miss gets the correct form + diff, records "again" once, and leaves
  one retry. See `src/lib/review/validate.ts`.
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
11. **A route is not live until `public/_redirects` lists it** — `404.html` stops Cloudflare
    Pages falling back to the shell, so a new `<Route>` without a 200 rewrite is a live 404.
    `/partners` did exactly that on 2026-10-28 while every sibling route answered 200;
    `tests/appMap.test.ts` now fails when a code route has no rewrite.

Full evidence for each is in `docs/agent/MEMORY.md` and `docs/agent/LESSONS.md`.

---

## 14. Machine-checked manifest (single source of truth)

`tests/appMap.test.ts` parses the four blocks below and fails when the code diverges. This is the
canonical list for routes, screens and endpoints — §3 and §6 above are the human explanation of
the same thing. **Update the block in the same commit as any route/screen/endpoint/table change**
(§12); never edit one side only. Paths are normalised before comparison (`:param` matches any
`:name`); endpoint rows ending in `/*` are the `startsWith` branches.

```appmap-routes
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
/dev/system
/main
/main/:tab
/onboarding
/partners
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
/welcome
```

```appmap-screens
src/features/ask/AskKatzuScreen.tsx
src/features/auth/SignInScreen.tsx
src/features/auth/SubscriptionRedemptionScreen.tsx
src/features/auth/WelcomeScreen.tsx
src/features/coach/CoachScreen.tsx
src/features/conversation/LiveConversationScreen.tsx
src/features/dev/DesignSystemScreen.tsx
src/features/grammar/GrammarSectionScreen.tsx
src/features/journey/GuidedPracticeScreen.tsx
src/features/journey/JourneyHomeScreen.tsx
src/features/journey/StorySetupScreen.tsx
src/features/listening/ListeningScreen.tsx
src/features/mockexam/MockExamScreen.tsx
src/features/onboarding/OnboardingScreen.tsx
src/features/offers/PaywallScreen.tsx
src/features/partners/PartnersScreen.tsx
src/features/placement/PlacementScreen.tsx
src/features/practice/PracticeScreen.tsx
src/features/progress/ProgressScreen.tsx
src/features/quiz/QuizScreen.tsx
src/features/report/SessionReportScreen.tsx
src/features/review/ReviewScreen.tsx
src/features/settings/DeletionRequestScreen.tsx
src/features/settings/ProfileSettingsScreen.tsx
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
affiliates
commissions
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
referrals
sync_revisions
trial_quota_ledger
users
```

The content tables (`scenarios`, `vocabulary`, `grammar`, `starter_phrases`) are deliberately
**not** here: their DDL lives only in the deployment, not the repo (§5, §11.10), so there is no
source line for the guard to read. Worker-created ledger tables are the ones the repo creates.

> **Older half of the change log.** Rows dated 2026-10-04 and earlier moved verbatim to
> `docs/agent/APP-MAP-ARCHIVE.md` on 2026-10-22 (40 rows, 41.8 KB), and rows dated 2026-10-07 and
> earlier on 2026-10-28 (31 more rows), both times because `AGENTS.md` §12 requires this table and
> the 135 KB cap was within a few bytes of full. Nothing was deleted — grep the archive.

| Date | Version | Change |
|---|---|---|
| 2026-10-29 | content signal in both robots files | **One directive added to two generated files; no route, screen, endpoint, table or dependency changed.** `scripts/seo-agents.mjs` now exports `CONTENT_SIGNAL` and `robotsGroup()`, so `website.katzuai.com` and `katzuai.com` emit `Content-Signal: search=yes, ai-input=yes, ai-train=yes` as the first line of the `User-agent: *` group; the named-crawler groups and every existing `Allow`/`Disallow`/`Sitemap` line are byte-identical. Both live files are byte-identical to the built ones, so Cloudflare no longer prepends a managed block (it used to add `ai-train=no, use=reference`). `node scripts/seo-agents.mjs --check`: 10/10 crawlers 200 on both hosts, and the five-URL panel (site `/`, `/sitemap.xml`, `/robots.txt`, `/guides/a1-visa`, app `/robots.txt`) 50/50 200 — the 403s recorded against GPTBot/ClaudeBot/PerplexityBot are gone too. Site `44566671-…`, app `632ddcae-…` (§9). |
| 2026-10-29 | GEO-1 + `/guides` live | **The marketing site is 17 pages and built to be crawled; no app route, screen, endpoint or table was added.** Twelve Arabic guides under `website/guides/` (900–1500 words, answer-first, table or checklist, 3–5 FAQs, «آخر تحديث», official sources), a `/guides` hub, and one generated crawler surface: `sitemap.xml` (17 URLs, real `lastmod`), `robots.txt` (ten named crawlers; only `/admin/ /api/ /private/` disallowed), `llms.txt`, the IndexNow key, `/assets/ai-ref.js` (one `landing_viewed` + allowlisted `source`, hostname only). JSON-LD: Organization/WebSite/SoftwareApplication on `/`, BreadcrumbList on every non-home page (home is the path root), FAQPage on `/help` and each guide matching the visible text, Article with author + dates, OfferCatalog on `/pricing`. **App:** `vite build` emits a root-only `sitemap.xml` + `robots.txt` and the shell carries ar + x-default hreflang. **Live:** site `03ec8a29-…`, app `58455d0e-…` (§9); 17/17 sitemap URLs 200, 47 links/assets checked on the live host with 0 dead, IndexNow 202 Accepted. **Not fixed here:** Cloudflare still answers `403` to GPTBot, ClaudeBot and PerplexityBot on HTML and its managed `robots.txt` block disallows them before ours — dashboard setting, OWNER-OPEN GEO-1. |
| 2026-10-28 | AFF-1 live + free-tier truth | **The worker that owns the partner ledger is deployed, and no route, screen, endpoint, table or dependency was added — the code was already written, the deploy was the missing step.** Production now answers `POST /affiliate/me` **401** signed out, `POST /affiliate/ref` **400** on a malformed code and `/admin/api/affiliates*` **401** without the key, `/health` reports `storage:{d1,kv}` ok, and `affiliates` / `referrals` / `commissions` exist in D1 `katzu-content` (read via `sqlite_master`; `AFFILIATE_TABLES` is applied idempotently by `ensureLedgerTables`, so `migrations/0003_affiliate_tables.sql` needs no runner). **`/affiliate/enroll` and `/affiliate/me/payout` do not exist in this codebase and never did** — the surface is `/affiliate/me` plus the owner-only `/admin/api/affiliates/{create,void,payout}`. **Free tier:** `MAX_FREE_AI_SESSIONS = 3` counts `trial_quota_ledger` rows with no period filter, so «كل شهر» left every surface — home meta/OG/JSON-LD/last CTA (`scripts/templates/home.html`), `/pricing` (`scripts/site-pricing.mjs`), the paywall (`PaywallScreen.tsx`) and `SOFT_PROMPT_*` (`foundingPlans.ts`); all now say «في المجموع», and `cloudflare-pricing.js` records why the config key keeps its old name (FREE-1 closed). **Motion:** the soft Pro modal that opened 1.2 s after the first correction is removed (`useLiveConversation.ts`) — its scrim covered «أرسل جملتك» until dismissed, which is the `dayZeroReport` CI flake; the spec now watches that 1.6 s window. **Evidence:** `npm run verify -- --ci --e2e` **VERIFY OK 14/14**, `dayZeroReport` 5/5; live string check 0 wrong-domain hits on five pages. Deploy ids in §9 and `docs/AGENT-STATE.md`. |
| 2026-10-28 | home truth fixes | **Three home-page claims now match what the code does, and the situation count matches the live list — text only: no layout, no route, no screen, no endpoint, no table.** (1) The trust line dropped «وأخطاؤك ومحادثاتك تبقى على جهازك» — false, because `syncProgress` uploads `mistakes` (original + corrected sentence) and session summaries to `/progress/sync` — and reads «صوتك لا يُخزَّن. يُعالَج لفهم كلامك فقط، ولا نستخدم محادثاتك للإعلانات.» (2) The free-lessons FAQ dropped «تتجدد دروسك المجانية كل شهر» — false, because `MAX_FREE_AI_SESSIONS = 3` is counted all-time in `trial_quota_ledger` with no monthly reset — and now says what actually stays free plus what a subscription opens. (3) The voice FAQ answers instead of pointing at a paragraph, on `/` and on `/help` (with its `#privacy` link), worded from `cloudflare-stt.js` (audio goes to Workers AI Whisper, is never stored) and `/progress/sync`. (4) The stat `6` became `49` (the real `GET /scenarios` row count) and card 06 is the real café scenario («المقهى / Was möchten Sie trinken?») instead of the «والآن» teaser; `/help`'s "what is Katzu" answer links `/#rail` as «49 موقفاً في التطبيق». Files: `scripts/templates/home.html`, `scripts/site-content.mjs`, rebuilt `website/index.html` + `website/help.html`. **Still unproven copy:** «كل شهر» survives in the home meta/OG/JSON-LD, the end CTA, `/pricing` and the in-app paywall — see §10. |
| 2026-10-28 | partner link, self-serve | **The site's partner promise now has a screen behind it: `/partners` creates the learner's code on first visit — one new app route + screen and one worker endpoint, no new table.** `POST /affiliate/me` (session- or Google-token auth) finds-or-creates one `affiliates` row keyed by the account email, derives a deterministic `A-Z0-9` 3–20 code from the email local part (`partnerCodeFromEmail`), so a racing second request merges on `ON CONFLICT(code) DO NOTHING`, and answers only `{ok,code,status,rate,approvalDays,minPayoutCents,payoutMethods}` — never contact or payout details; 201 create / 200 existing / 401 / 400 / 405 / 503. `PartnersScreen.tsx` reads every number from that response (never a constant), shows the link with copy/share, the three steps, a plain sample message and the fine print, and has loading/error/retry states; the profile screen gains a separate partner card — the `REF-` card stays, because they are two ledgers. `/affiliate` is rebuilt to the owner's win-win-win copy with a commission calculator (6-month default → `$10`, 3 subscribers → `$30`) and its CTA points at `https://katzuai.com/partners`; the three win labels are divs, not headings, which took the page from a skipped `h1 → h3` level to a clean Lighthouse run. **Evidence:** 32 affiliate tests, Lighthouse mobile a11y **100** / SEO **100** / 0 failing audits, 390 + 1440 renders with no horizontal overflow and one H1. Production ids in §9. |
| 2026-10-28 | partner program | **`/affiliate` is the fourth site page and the worker gained a partner ledger — no app route or screen changed.** `cloudflare-affiliate.js` owns `AFFILIATE_CONFIG` (20% of the net first paid order, `approvalDays: 14`, `minPayoutCents: 2000`, `payoutWeekday: 1`, $20 minimum, methods USDT / Syriatel-MTN Cash / bank / Wise), the idempotent `affiliates` / `referrals` / `commissions` DDL + partial unique index, `POST /affiliate/ref`, attribution attach at signup, commission on activation-code redemption, day-14 approval (daily cron `17 4 * * *` + lazy on admin reads), refund void / negative-row netting, and six owner-only admin routes under `/admin/api/affiliates`. The app reads `katzu_ref` and sends it with the Google sign-in call; the server decides first-valid-code-wins per account. The page's numbers are read from the same config through esbuild (`scripts/site-content-affiliate.mjs`), it reuses `.phead` + `.reveal` and the existing buttons, and `/` changed by two lines only (footer link + `ref.js`). `website/_headers` `connect-src` now names the Worker, pinned by a test. **Evidence:** 26 affiliate tests + `tests/offer.test.ts` 25, `npm run verify -- --ci --e2e` **VERIFY OK 14/14**; Lighthouse mobile `/affiliate` a11y **100**, SEO **100**; crawl clean 5 pages / 10 root files. Production ids in §9. |
| 2026-10-28 | home = the design file | **`/` is the owner's design again, and no route, screen, endpoint, table or dependency changed.** `website.katzuai.com/` now renders `scripts/templates/home.html` — a copy of the owner's `index (62).html`, hero to footer, including the two pinned scenes, the situations rail, the error timeline, the loader, the custom cursor and `bg.mp4` — and `website/assets/site.css` carries that design's stylesheet verbatim as its base layer, so `/pricing`, `/help` and 404 keep their markup on the same tokens, nav, flat footer and background still. Only four kinds of change exist on the home page: nav/footer → `/`, `/pricing`, `/help` (+ `#privacy` `#terms` `#refund`), every CTA → `https://katzuai.com/welcome`, the coupon/`$60` tier block → one line + `الأسعار والباقات` → `/pricing`, and the refund copy → 3/6/12 months. GSAP 3.12.5 + ScrollTrigger 3.12.5 + Lenis 1.1.14 are vendored under `website/assets/vendor/` (CSP stays `script-src 'self'`); the design's own `<style>` is no longer inline. The three "known defects" are the design's own computed values (`.glass` = transparent over `.bgimg` + `rgba(255,255,255,.13)` border + 18px blur; hero `.ml` overflow = the pre-reveal translate; zero padding = the `.pin` scenes), so no redesign was applied. Home copy is no longer generated from `scripts/site-content.mjs`, which holds `/pricing` + `/help` only — **never rewrite the home page from it**. **Tests:** `tests/offer.test.ts` follows the design nav links, asserts `.bgimg` on the subpages only and `bg.mp4` on the home only, and keeps one H1 per page. Static crawl **4 pages / 33 redirects / 0 problems**; Lighthouse mobile perf/a11y/SEO **97-100/100/100**; full `npx playwright test` **170 passed / 2 skipped, exit 0**. Production: site `90880c38-5f90-4378-844c-5f1ef1fb055e` (source `06b2c04`), app rebuilt by the same push as `45c24f5f-…` (same bundle); worker and sales untouched; rollbacks in `docs/AGENT-STATE.md`. |
| 2026-10-28 | three-page site + founding prices | **Marketing is exactly three Arabic pages (`/`, `/pricing`, `/help`) and the price exists once — no new app routes, screens, endpoints or tables.** `scripts/build-website.mjs` now writes only `index.html`, `pricing.html`, `help.html`, `404.html`, robots, a 3-URL sitemap and `_redirects`, and deletes every other `website/**.html`; the retired `en/`, `trust/` and topic pages are gone. Copy lives in `scripts/site-content.mjs`, money vocabulary in the new `scripts/site-pricing.mjs` (plans, cards, rules, JSON-LD, order/restore mailtos, all read from `pricing.config.json`), legal text in `src/lib/trust/content.ts` rendered inline on `/help#privacy|#terms|#refund`. One shell, one `site.css`, one background; the home-only `bg.mp4` is the single video. Prices are the founding four (`$14.99 / $29.99 / $49.99 / $99.99`, struck future `$29.99 / $59.99 / $99.99 / $199.99`), rules stated once (1,000 paid members or 31 Jan 2027, price kept on renewal, 7-day refund on 3/6/12 months, code within 12 h); `KATZU26` and the `$60`/`$42` pair are retired everywhere. One activation code carries the plan's own duration, because redemption adds the plan's `months` (`addMonthsIso`). Checkout: no local method is configured, so `/pricing#pay` ships the three steps plus one `mailto:support@ghaidak.com` CTA and no crypto block. `public/_redirects` and `website/_redirects` send every legacy URL in **one** 301 to its final anchor; `sales/_redirects` retires that property to `/pricing#pay`; `legalPageUrl()` points at `/help#…` and `AppShell` opens it in a new document. **Tests:** `tests/offer.test.ts` (4 HTML files, price only on `/pricing`, link allowlist, 3-URL sitemap, one H1, video home-only), `tests/trustContent.test.ts` (3 pages, 0 open placeholders, privacy by category), `tests/appMap.test.ts` (single-hop redirect targets). Local crawl 4 pages / 9 links OK; Lighthouse mobile a11y **100**, SEO **100**, perf **95–99** on all three (best-practices 81 is the host antivirus injecting an http script — the served HTML contains no `kaspersky`). **Production (2026-10-28):** worker `f0b5fa01-b4a2-449c-b470-e770721487eb`, app `a11c874e-0eb5-4a80-96ab-630321664e03` (source `f334f6d`), site `1359fb18-e862-4774-b9fb-939a45c20159`, sales `d3811619-6ce1-4c96-82e7-d11e6004c7ae`; rollbacks in `docs/AGENT-STATE.md`. |
| 2026-10-28 | partners deep link | **`https://katzuai.com/partners` answered 404 while every sibling SPA route answered 200 — a new route was added to the router but not to `public/_redirects`, and the static `404.html` stops Pages falling back to the shell. No route/screen/endpoint/table/dependency changed.** `/partners / 200` joins the rewrite list, and `tests/appMap.test.ts` now derives every static route from `App.tsx` + `AppShell.tsx` and fails when one has no exact or wildcard 200 rewrite (`/dev/system` excepted: it exists only in a dev build). Proven non-vacuous by removing the new line and watching the test name `/partners`. The route itself was always correct — this is the serving layer. |
| 2026-10-28 | audit #7 + beacon CSP | **`/auth/session` is rate-limited before the Google round-trip, and the Pages beacon stops hitting a CSP error — no new routes, screens, endpoints, tables or deps.** `handleAuthSession` now calls `checkGlobalRateLimit` (`scope 'auth-session'`, 20/min + 600/day per `CF-Connecting-IP`, durable `rate_limit_counters` rows) *before* `verifyGoogleIdToken`, answering `429` with `Retry-After` and `retry_after`; live proof 11×`401` then 19×`429` with `Retry-After: 13`. `public/_headers` adds `static.cloudflareinsights.com` to `script-src` and `https://cloudflareinsights.com` to `connect-src`, matching the site's precedent. **Tests:** new limiter case in `tests/workerSecurity.test.ts`, beacon-host assertion in `tests/pwaOffline.test.ts`; `npm run verify -- --ci --e2e` **14/14**, browser suite exit 0. Production: worker `6f5ba883-6730-43d2-b8cd-9c275b298fee`, app `4fc1306f-…` (source `29f6aec`), site unchanged; rollbacks in `docs/AGENT-STATE.md`. |
| 2026-10-27 | split-serve + auth fix | **The app serves the product only and Google Sign-In works again — no new routes, screens, endpoints, tables or deps.** Marketing moved to the static `website/` build on `website.katzuai.com`: `public/_redirects` `301`s `/pricing`, `/faq`, `/en`, `/trust/*` there, `/demo` to `/welcome`, and the in-app marketing pages, `thinking.tsx` and `marketingShots` rig left `src/`. **The auth defect:** `SignInScreen` decided GIS was ready with a one-shot `setTimeout(700)` while its fallback button stayed tappable, so a tap inside that window printed «تعذر تحميل خدمة Google الآن…» and a script that failed to load was never retried; readiness is now a `MutationObserver` on the button container with a distinct `loading` state («جارٍ تجهيز خدمة Google…»), and `gsiAttempt` re-injects a failed script so «حاول مجدداً» can succeed. `public/_headers` now allows GIS's exact hosts (`script-src …/gsi/client`, `style-src …/gsi/style`, `font-src fonts.gstatic.com`, `img-src *.googleusercontent.com`) and ships COOP `same-origin-allow-popups` — plain `same-origin` severs the GIS popup. **Tests:** `tests/pwaOffline.test.ts` 16/16 (path-scoped GIS `script-src`, no scheme-wide source, COOP value) and `npm run verify` 6/6. Production: app `3c5fcfef-24ea-406c-b3b4-d725a4838b4b` (source `da7656c`, bundle `assets/index-DtOhy65S.js`), site `de591b4e-364e-4779-8d87-57ea5adb2dd8`; rollbacks and the UNPROVEN Google-credential item are in `docs/AGENT-STATE.md`. |
| 2026-10-24 | ai-visibility | **Public marketing/trust pages are now prerendered static HTML; `/app/*` stays the SPA and the Worker is unchanged.** `src/lib/seo/publicContent.ts` owns Arabic/English copy and 13 real FAQs; `src/lib/seo/publicPages.ts` renders 22 flat `.html` files (landing, `/en`, 7 bilingual topics, 5 trust pages, `404.html`), so Cloudflare Pages serves `/faq` from `faq.html` with `200` instead of redirecting to `/faq/`; unique title/description/canonical, `lang`/`dir`/`hreflang`, `Organization`/`WebSite`/`SoftwareApplication`/`WebPage`/`BreadcrumbList`/`FAQPage` JSON-LD, `robots.txt`, `sitemap.xml` with `lastmod`, `llms.txt`, `llms-full.txt`; `vite.config.ts` injects the Arabic landing and emits the artifacts. Private routes get `X-Robots-Tag: noindex, nofollow` in `public/_headers`; legacy `/privacy` and `/terms` `301` to `/trust/*` via `public/_redirects`. Because `404.html` otherwise catches every SPA deep link, `_redirects` proxies the real client routes (`/app/*`, `/main/*`, `/scenario/*` and the named SPA paths) to `/` with `200` before the 404 handler; Preview verified all SPA paths `200` and an unknown public path `404`. Production `fa12556e` (source `072b1c9`) returns the same 200/404 pairs, unique canonicals and JSON-LD; Cloudflare still `403`s `PerplexityBot`, `GPTBot` and `ClaudeBot` and prepends training disallows. Copy uses only spec/code facts: free A0–A1, Pro A2–B2, 3 server-counted sessions, 120 requests/day fair use, 5 fallback situations; no ratings, reviews, user counts, awards or fixed price claim. **Tests:** `tests/publicPages.test.ts` 26 pass including one-h1/canonical/JSON-LD/landing-root regression and `tests/appMap.test.ts`. `npm run verify -- --ci --e2e` gate result and deployment ids are in `docs/ai-visibility.md`. |
| 2026-10-24 | dependency cleanup | Removed unused `zod`; reason `GHSA-mrhx-c7xc-m3w5`, no 3.x patch, no imports. |
| 2026-10-24 | review task 1 | **Review is one explicit task per item — no route/screen/endpoint/table/dependency change, and no production touch.** One pure `buildReviewTask` (`src/lib/review/validate.ts`) derives header, cue, input and grading for four servable types: Arabic word + gloss → German, full Arabic sentence → German, German → Arabic read-and-reveal + 3-way self-rating (no `accepted_answers` field exists, so no typed-Arabic match and no AI call), and correction only when an Arabic meaning, full wrong and full right are present; fragments convert to sentence→German or drop. The screen removes the old "OR"/«جملة جاهزة» mixed cues, ships no word bank by default (hint after a miss), normalizes German (case, final punctuation, ä≈ae), shows one correct answer + diff on a miss, records "again" once for wrong/close/reveal, and offers «سهلة»/«صعبة» only after a correct typed answer. Mistakes without a stored meaning (old rows) are hidden from Review, kept in Dexie. **Flag OFF:** the same task contract applies with `VITE_GUIDED_HOME=0`; old rows without `meaningAr` remain hidden from Review and retained in Dexie. **Tests:** `tests/reviewTasks.test.ts` (21), updated review/store/validation tests; `e2e/review.spec.ts` (5 types + stored scheduler row); `npm test` 2134 passed / 159 files; `npm run verify` 6/6; built e2e flag OFF and ON 184 passed / 3 skipped each. **Evidence:** 74 390×844 before/after shots in `docs/agent/review-v41/{before,after}/`. Local commit `Review: one explicit task per item, clear cue and feedback`; not merged/deployed. |
| 2026-10-23 | guidedHome 7 deploy | **The guided home is live in production (`main` `1e9d09f`, `--no-ff`; docs-only commits after it, e.g. `2f5f536`, rebuild the same bundle under a new Pages id).** Pages deployment `c89828af-acba-41bd-8514-8eba166d6c0e` serves `assets/index-DkRAI1BL.js` with `VITE_GUIDED_HOME:"1"` (`.env.production`); staging preview `fedcd115-…` proved the shell; production smoke **4 passed / 2 skipped / 0 failed**, `/demo` 4/4 on the live origin, SW on `/`. No route/screen/endpoint/table/dependency changed. Rollback: dashboard redeploy of `50f30132-…` or `git revert -m 1 1e9d09f` + push. Signed-in guided home/report/paywall UNPROVEN (needs an account); worker `e1a9a2ca-…` and D1 untouched. |
| 2026-10-23 | guidedHome 7 | **The guided home's facts now arrive in the order the learner earns them — no new routes, screens, endpoints, tables or deps; flag OFF renders the shipped screen.** New pure `src/lib/journey/reveal.ts`: `isReviewRevealed` (`guided` ⇒ `firstSessionDone && dayNumber >= 2`), `isProgressRevealed` (`guided` ⇒ `actionable \|\| sessionCount >= 3`) and `sheetReviewCount` (0 unless revealed, due and the hero is **not** already the review). `JourneyHomeScreen` reads the shared `firstSessionDone` and moves its `context` memo above `completedScenarioIds`/`mission` so `context.dayNumber` feeds the rule instead of a second day formula; the mission selector receives review items only when `reviewRevealed` (day 0's suppression now covers day 1 too), the habit panel renders only after the first finished session, and «المزيد» receives `progressVisible={progressRevealed}` — a new optional prop on `JourneyMoreSheet`, default true, gating the whole «تقدّمك» block. Exactly one review entry point: when the hero mission is the review the sheet's row is suppressed (replacing the old "a menu must not have a hole" rule); when the mission is anything else the sheet remains where the queue is reachable. The expiry card stays outside the three-session gate because it only exists when `actionable` — the plan's own exception, stated in a comment. **Tests:** `tests/journeyReveal.test.ts` (thresholds, flag-off, one-entry-point table) + `tests/guidedHome.test.ts` contracts = 41 passing; `e2e/guidedHomeMore.spec.ts` (day 0 sheet empty of progress, day 1 unlocks skills but not review/progress, day 2 + three sessions shows exactly one review and the progress facts) plus updated `guidedHome`, `dailyTasks` and `firstSessionChain` = 22 focused passing. **Evidence:** five 390×844 states before/after in `docs/agent/ui-polish/step7-*` (home day 0/1/2, sheet day 0/2); day-1 and day-2 home are byte-identical before/after — the only home change is day 0 (−the panel) and the only sheet change is the earned blocks. |
| 2026-10-23 | guidedHome 6 | **The four guided surfaces now read the design tokens for type, radius, colour and motion — no new routes, screens, endpoints, tables or deps.** Class-only polish in `JourneyHomeScreen`, `StorySetupScreen`, `JourneyMoreSheet` and `PracticeLockSheet`: the 44px and 36px arbitrary minimums became `min-h-touch`; `rounded-xl`/`rounded-2xl` became `rounded-chip`/`rounded-control`/`rounded-panel` (12/20/24 px; control and panel are not the old 16 px, so those corners are visibly rounder); raw `bg-black`/`bg-black/*`, `border-white/10`, `bg-white/[0.03]` and `divide-white/[0.06]` became `bg-kz-black/*`, `border-kz-line`, `bg-kz-ink/5` and `divide-kz-line`; the countdown line became `kz-ar-micro text-kz-warm`; the German title became `kz-de-caption`; touched transitions gained `duration-fast ease-out`. **Real token bug found by the after-shot:** the three foundation blacks were hex, so `bg-kz-black/45` compiled to invalid `rgb(#000000 / .45)` and the uncommitted `bg-kz-black/45` pill would have lost its background (committed `HEAD` used `bg-black/45`, which was valid). They are now the triplets `0 0 0`, `5 5 8` and `10 10 13`, which fixes every utility that reads them, not only the guided screens: since `b54dc62` (2026-10-04) `bg-surface-card` (60 call sites / 18 files) and `bg-surface-subtle` (71 / 24) computed `rgba(0, 0, 0, 0)` and drew nothing, as did 9 pre-existing `bg-kz-black` roots, `bg-surface-raised` and the `rgb(var(--kz-black))` scrollbar track. Commit (a) is therefore a visual change on many screens: a 390x844 flag-off crawl of 26 routes changes pixels on 12 of them — 10 from this fix alone (practice hub 159,105 of 328,560 px = 48.34 %, study 157,373 = 47.81 %, quiz 69,002 = 20.96 %, profile 68,799 = 20.9 %, subscription 67,712 = 20.57 %, library 66,801 = 20.29 %, write 36,643 = 11.13 %, scenario detail 32,172 = 9.77 %, welcome 17,347 = 5.27 %, grammar 1,034 = 0.31 %) and 2 from the guided-screen classes below (home 33,758 = 10.26 %, story setup 7,524 = 2.29 %); 5 more (demo, onboarding, session report, progress, review) change computed colour without changing a pixel. Sign-in and listening are excluded from that count: their two captures came from builds with a different Google-ID and exercise state, so their pixel delta is not this change. `bg-kz-soft-black` (3 uses, live conversation and mock exam) is not a defined utility, so it still renders nothing: a separate defect, not repaired here. Pinned by a new `tests/designSystem.test.ts` triplet guard. **Evidence:** design audit has 0 raw hex, 0 raw rgb, 0 raw font size and 0 raw radius, with arbitrary values at 36 of the 40 budget (unchanged); contrast passes with the tightest text pair at 4.52:1; `npm test` 157 files / 2104 passed and `npm run verify` is 6/6 steps PASS; the full preview e2e suite is 183 specs and ran 180 passed / 3 skipped / 0 failed with `VITE_GUIDED_HOME=0` and the same 180 / 3 / 0 with `=1` (the three skips are environmental - two production-only smoke cases and one scripted-mock case - so no guided spec is skipped by either flag), with `dist` grepped after each run to prove it carried `"0"` then `"1"`. 390x844 before/after PNGs for all four surfaces are in `docs/agent/ui-polish/` and were pixel-diffed, not eyeballed: home 314 px of 328,560 (only the two locked-tab badges regain `bg-kz-black/60`), story setup 7,524 (2.29%), the `المزيد` sheet 1,140, the lock sheet 8,262 (`leading-relaxed` dropped, so 1.625 -> 1.75 line-height reflows the sheet). The black-token fix is global, so it is measured beyond these: a 26-route flag-off crawl shows 10 further screens changed colour-only (largest `tab-practice` 48.3%, `scenario-study` 47.8%, `scenario-quiz` 21.0%), 5 changed in computed colour with 0 px, and the marketing landing (`/`, 6,118 px full page) changed 1,130,155 px = 47.4% as every card and FAQ row paints its surface for the first time. Flag-off geometry is not identical in the two guided screens: home document 1,441.58 -> 1,433.58 px (the Katzu Pro button and two task chips go 48 -> 44 px via `min-h-touch`) and story setup 3.53 px shorter (German title 16 -> 12.8 px via `kz-de-caption`, back button and four chips take `border-kz-line`, listen button 16 -> 20 px radius and 0.28 s -> 0.16 s ease-out); every other transition is unchanged. The daily-tasks panel still ends at 846.89 px in an 844 px viewport - unchanged by this work, not fixed, not hacked. |
| 2026-10-23 | guidedHome 5b | **The awaited session write is now failure-safe, and it is the ONE deliberate exception to flag-off identity — no new routes, screens, endpoints, tables or deps.** `finishSession` wraps `await db.sessions.put(sessionRecord)` in `try/catch` with `console.warn('Session record save failed:', error)` (the same report the background `syncProgress` failure already uses) and never rethrows. When the write succeeds it still completes before the hand-off, so the report's first render sees the row (the Step-5 flash fix). When it rejects, XP, the streak, `db.users.update` and `onCompleteSession` run exactly as they did before the await existed: the failure path is unchanged — same report, same summary, same credited XP, only the session row missing. **Why awaiting is allowed with the flag off:** the DOM and copy of a flag-off report stay identical, but the unawaited write was already a real flag-off bug — the report, including the Pro offer it renders from `shouldOfferPro`, could mount before the row committed and show the offer a frame late. Awaiting fixes that on both flags; this is the only place flag-off behaviour is deliberately allowed to differ. **Unknown completion is honest:** `dayZeroCelebration` now takes `completedNaturally?: boolean` and compares `=== true`, and `SessionReportScreen` passes `summary.completedNaturally` through uncoerced — an older stored summary without the field shows «بدأتَ رحلتك — هذه أول محادثة لك.», never «أنجزت». **Tests:** `tests/dayZeroFinish.test.ts` (+1: omitted flag takes the early line) and `e2e/dayZeroReport.spec.ts` (+1: an `IDBObjectStore.put` rejecting for the `sessions` store still lands on `/session-report` with the full debrief and `users/current_user.totalXp > 0`). |
| 2026-10-23 | guidedHome 5 | **The first finished conversation is a finish line, behind the flag — no new routes, screens, endpoints, tables or deps.** With the flag on and exactly one live-completed session, `/session-report` opens on the celebration («أنجزت محادثتك الأولى!»), the measured sentence, the streak line (only when `streakDays === 1`), one corrections teaser (absent at k=0) and a non-tappable «غداً» line — with ONE primary «العودة إلى الرحلة» and no review CTA — and puts the entire shipped report (capability card, debrief details, «مشهد آخر الآن», corrections drill, level promotion, follow-up, exam card, Pro offer) behind one quiet «تفاصيل الجلسة» disclosure. The gate is the pure `isDayZeroFinish({ guided, sessionsCount, fromRecovered })` in `src/features/report/dayZeroFinish.ts`: `sessionsCount` is the RAW `db.sessions` live count (`undefined` while loading → never celebrates), and `fromRecovered` is true only on the `recover.ts` branch in `AppShell`, so a rebuilt/older report, a returning learner and a flag-off build render today's full screen unchanged. An early-ended session keeps the finish line with the honest «بدأتَ رحلتك — هذه أول محادثة لك.». **Root cause fixed while proving it:** `finishSession` did not `await db.sessions.put(sessionRecord)`, so the report could mount before the row committed and briefly render the returning-learner screen — a real learner flash, not only a test race. **Tests:** `tests/dayZeroFinish.test.ts` (21: gate incl. loading/recovered/flag-off, Arabic counts, every celebration branch, teaser k=0) and `e2e/dayZeroReport.spec.ts` (4: day-0 closed+open with axe at both states, Pro offer hidden then revealed, flag-off full screen, returning learner, recovered report never celebrates). Existing report specs (`journey`, `modes`, `paywall`) open the disclosure through `openSessionDetailsIfPresent` instead of pinning the switch, so they exercise the guided path too. **Evidence:** 390×844 shots in `docs/agent/day-zero-finish/`; tsc app+e2e 0; `npm test` 157 files / 2102 passed; affected 34/34 under `VITE_GUIDED_HOME=0` and `=1`; full Playwright 179 passed / 3 skipped / 0 failed under each flag. |
| 2026-10-23 | guidedHome 4b | **Story Setup's day-0 hint is gated on the flag — fixes a flag-off regression in ae294f7 — no new routes, screens, endpoints, tables or deps.** ae294f7 (guidedHome 4) shipped the day-0 copy UNGATED: it set `dayZero = !isFirstSessionDone({ guided, sessionCount, user })`, and with the flag off `isFirstSessionDone` falls back to `sessionCount > 0`, so a brand-new learner on a production (flag-off) build saw the new day-0 hint. Flag-off must stay byte-for-byte the old hint «خطوتان قصيرتان ثم تبدأ المحادثة.». The decision is now a pure rule `isDayZeroOpening({ guided, sessionCount, user })` in `src/lib/journey/firstSession.ts`: false when the flag is off and while the count is still loading (undefined/null), else the inverse of the shared `isFirstSessionDone` rule — and `StorySetupScreen` passes `db.sessions.count()` RAW (no `?? 0`), so a still-loading returning learner never flashes the day-0 line. Pinned by `tests/guidedHome.test.ts` (unit tests: guided-off, loading, day-0, one finished session, Pro, `freeSessionsRemaining===0`; source-contract: raw count, no coercion, both copy strings) and `e2e/journey.spec.ts` (day-0 test now forces the flag on; a new flag-off fresh-learner test asserts the old hint; a finished-episode + flag-on learner asserts the old hint). |
| 2026-10-22 | guidedHome 4 | **Story Setup's first-run CTA now reads one shared first-session fact — no new routes, screens, endpoints, tables or deps.** The episode opening at `/scenario/:id/story` only told day-0 from returning via the **per-scene** `studiedAt` badge, so it could call a learner new while the home hero and the Practice/Progress locks called them returning (and the reverse, across surfaces). It now gates the PrimaryAction's hint on the SAME `isFirstSessionDone({ guided, sessionCount, user })` rule those other surfaces read (`sessionCount = db.sessions.count() ?? 0`); day 0 → «ستستمع أولاً، ثم تتحدث أنت — لا يوجد اختبار ولا حكم.», returning → «خطوتان قصيرتان ثم تبدأ المحادثة.». The `studiedAt` badge stays layered on top (per-scene "returned here" ≠ global "done first conversation"). Pinned by `tests/guidedHome.test.ts` (source-contract: shared-rule wiring + both copy strings) and `e2e/journey.spec.ts` (day-0 hint renders in-browser; the CTA **label** is unchanged, so the 4 specs clicking `ابدأ التدريب` and the a11y scan stay green). |
| 2026-10-22 | guidedHome 3 | **Practice and Progress stay closed until the first conversation — no new routes, screens, endpoints, tables or deps.** One shared pure fact (`src/lib/journey/firstSession.ts`, `isFirstSessionDone`) = `sessions.count()>0 \|\| isProEffective(user) \|\| user.freeSessionsRemaining===0`, consulted only while the flag is on (OFF returns the old `sessions>0` rule, so today's DOM renders unchanged). It drives the tab bar's `setTab` guard (a locked tap opens the sheet instead of navigating), the route guard (`/app/practice`, `/app/progress`, `/app/review` are `replace`d to `/app/trail` with the sheet opened, so Back never bounces), and the new lock sheet `src/features/journey/PracticeLockSheet.tsx` — a **sibling of `nav`**, reusing `BottomSheet`, never a child of the glass container so it cannot be a fifth measured tab. The sheet's primary resolves the SAME opening episode the onboarding hop uses (`resolveOpeningScenarioId` → `airport_arrival/story`, fallback `/app/trail`); secondary «لاحقاً», no bypass. A locked tab keeps its ink and adds `aria-disabled` + a small `aria-hidden` lock badge — never opacity, never `disabled`, size unchanged. The first preferences question gained a quiet GlassButton «تخطَّ الآن وابدأ» calling `save('skip', {}, 'skip_first')` — the funnel is told this learner walked past the goal, and the analytics allow-list accepts any non-empty `source`, so no worker change. **Two accepted limitations.** (1) A Pro learner and a learner whose free allowance is spent are never locked — the rule deliberately exempts them, so the lock (and its nudge) never appears for them; proven at the rule level by `tests/guidedHome.test.ts` and asserted as "not locked" in `e2e/tabLock.spec.ts`. (2) The count is the local `sessions` ledger read live, with no Worker cross-check — the app's existing local-first model — so a cleared local ledger re-opens the tabs until the next session row. **Two further accepted limitations, from the step-3 verification pass.** (a) A full sign-out that wipes the local data leaves a returning free offline learner with `sessions.count()=0` again, so the tabs re-lock until a new session row — the lock re-reads the local ledger and has no memory of the wiped conversation. (b) The unlock fact counts any `sessions` row, even one with zero spoken sentences, while the Pro offer (`shouldOfferPro`) counts only rows with ≥1 spoken sentence (`completedEpisodeCount` / `MIN_EPISODE_TURNS`), so a zero-sentence row opens the tabs while the offer stays hidden — the two can disagree. Tests: `tests/guidedHome.test.ts` +5 Step-3 source contracts (shared rule in home + tab bar, sheet sibling of `nav`, exact copy, locked-tab look, flag-off gated clauses), `e2e/tabLock.spec.ts` (7), a new day-0 case in `e2e/navbarGeometry.spec.ts`, and every spec that reaches Practice/Progress/Review now boots `{ history: true }`. Screenshots at 390×844 in `docs/agent/guided-home/`. |
| 2026-10-22 | guidedHome 2b | **A first run can no longer back out of itself, and Back from the first story lands on home — no new routes, screens, endpoints, tables or deps; all three fixes gated on the flag.** (1) On the first question the header control called the route's `onBack`, which for a first run is `/welcome` — it walked a signed-in learner out to the sign-up screen, and there is no earlier step to return to, so it is replaced by a 44px spacer and the dots stay centred; on the second question «رجوع للسؤال السابق» opened the previous-German question (an edit-flow step the first run never asks) and then returned to the same grid, and now returns to `goal`. (2) Back from the episode reached through the hop arrived at `/signin`: sign-in had already replaced the entry with `/onboarding`, so a replace-to-story left no in-app screen under it. The hop now replaces that entry with `/app/trail` and **pushes** the story (both calls in one tick, so no flash of home), and `page.goBack()` from the first story lands on the home screen. (3) Null goal: the hero, the sheet's chapter-goal card and the selector were already null-safe (`categoryRealityAr` only compares the goal; `preferGoal` falls through to the full pool), so the one untrue surface was the sheet's «تفضيلاتي» row — a skip writes the completion stamp and the row then claimed answered preferences. `preferencesIncomplete` now also requires `primaryGoal`. **One premise in the brief does not hold:** the skip sits on the second question, so a UI skip can never leave the goal null — the goal is answered before the link exists. Null-goal rendering is therefore proved with a seeded completed-but-goalless profile, not with Skip. Tests: `e2e/firstSessionChain.spec.ts` 5→11 (no back control on the first question, back to the goal from the second, `goBack` from story → home, skip defaults with the goal retained, goalless profile's hero and sheet, flag-off keeps the back control) and `tests/guidedHome.test.ts` +3 source contracts. Verified: `tsc` ×2 0 · `npm test` 156 files / **2067** · chain 11 + onboarding/guidedHome/More/accessibility/navOverlap **23 passed** · `verify --fast` 2/2. |
| 2026-10-22 | guidedHome 2 | **The two questions now end inside the first episode — no new routes, screens, endpoints, tables or deps.** `OnboardingRoute.onDone` sends a first-run learner to `/scenario/:id/story` when the flag is on and keeps `/app/trail` when it is off. Which id is a *resolution*, not a constant: new pure `src/lib/journey/opening.ts` (`resolveOpeningScenarioId`) picks the arrival when its row is on the device, else the first scene in `journeyOrderedScenarios`, else nothing (and today's route), because navigating to a missing id opens Story Setup on «لم نجد هذا المشهد» for the one learner the hop exists for. **Two facts the plan got wrong, corrected here rather than in it.** (1) The offline seed *does* carry `airport_arrival`: `seedStoryOpening()` (`src/lib/db/katzuDb.ts:589`) writes the row and its A1 phrases on every launch, so the hop is deterministic and the fallback is for a partial or pre-fixture cache — a browser cannot be made to produce that state (the row is re-added on mount), so the fallback is proved by `tests/openingScene.test.ts` instead. (2) The V2 episode ends at the Debrief, never at a quiz, so `scenario_training` for a **finished** scene still reads `quizAttempted: false`; `isUnfinished` therefore kept telling a learner who had just finished «أكمل من حيث توقفت», on every later open. `selectMission` gained an optional `completedScenarioIds` — a recorded session, not the quiz fields, decides a scene is finished — branch 4 also skips the opening once its conversation exists, and `JourneyHomeScreen` derives the list from `sessionsByScenario`. Day 0 also stops opening on a review mission: `reviewItems` are withheld from the selector until `firstSessionDone` (the sheet's row keeps its own gate). Both corrections are gated on the flag — with it off the home keeps its shipped mission logic byte-for-byte, including the loop, until the guided shape is walked. The preferences step gained one orientation line and a flag-gated «تخطَّ الأسئلة وابدأ الآن» that saves the default 10 minutes and leaves the goal unanswered rather than inventing one. Tests: `tests/openingScene.test.ts` (3), `tests/missionSelection.test.ts` +2, `tests/guidedHome.test.ts` +4 source contracts, `e2e/firstSessionChain.spec.ts` (5: arrival → practice, skip, flag off → home, resume after practice, and a finished conversation *not* offered as «continue»), and `e2e/onboarding.spec.ts` updated to the new exit. Verified: `tsc` and `tsc -p e2e` 0 · `npm test` 156 files / 2065 · all browser specs re-run 152 passed / 1 skipped (the first journey run's 5 live-turn failures were a dev server started without `VITE_WORKER_URL`; the suite's own `webServer.env` supplies it, and all 12 passed after). Not committed, not deployed. |
| 2026-10-22 | guidedHome 1c | **Day 0 in «المزيد» is the library alone — no new routes, screens, endpoints, tables or deps.** The sheet takes `firstSessionDone` and gates the grammar, listening, writing and coach rows on it: those are the Practice tab's screens, and step 3 locks that tab until the first finished conversation, so listing them on day 0 would be a side door around the lock. The home screen passes the same boolean it uses for the review row, so the lock and the sheet read one fact and cannot disagree. Pinned by `tests/guidedHome.test.ts` (four gates, the library deliberately ungated, the prop passed) and `e2e/guidedHomeMore.spec.ts` (the four rows absent on day 0, a due card alone still hiding writing, all four present after one session; the destinations test seeds a session and leaves day-0 library navigation to `banner`/`firstRun`). Screenshots re-shot at 390×844 in `docs/agent/guided-home/`. **Map housekeeping in the same change:** the change log's 2026-10-04-and-earlier half moved verbatim to `docs/agent/APP-MAP-ARCHIVE.md` (40 rows, 41.8 KB) and that file joined `DOC_EXEMPT` in `tests/agentDocs.test.ts`, because this map sat 9 bytes under its 135 KB cap while `AGENTS.md` §12 still requires the table. |
| 2026-10-22 | guidedHome 1b | **The six blocks the guided home hid are reachable again, in one sheet — no new routes, screens, endpoints, tables or deps.** New `src/features/journey/JourneyMoreSheet.tsx` (the existing `BottomSheet`/`useModalDialog` contract) behind one quiet 44px text row under the tasks (`data-testid="journey-more"`, `aria-haspopup="dialog"`, never auto-opens): «تابع التعلّم» (library, plus grammar, listening, writing and coach once a session is finished — wired to the Practice tab's existing routes from `AppShell`), the review queue, the earned-or-goal card, the weekly recap, the level line, the free-session ledger line (`freeSessionsCopy`: the Worker's number, or "not known", never a local guess), the Pro offer and the preferences edit. Two gates were fixed while doing it: the Pro chip had been dropped outright in 1a, so it now returns after the first completed session under `trial.shouldOfferPro` and lives in the sheet (the guided header stays orientation-only; the Debrief is still where the offer is made), and the sheet's review row uses `dueCount > 0 && firstSessionDone` while the inline row keeps its shipped `mission.kind !== 'review'` rule untouched, so flag-off stays byte-for-byte today. Tests: `tests/guidedHome.test.ts` (12), `e2e/guidedHomeMore.spec.ts` (6: every destination, day-0 emptiness, due card without a session, the post-session rows, 320 px no-overflow, 44 px rows), `openLibraryFromHome` in `e2e/harness.ts` restoring real navigation in `banner`/`firstRun`, and `navOverlap` now measuring the bottom-most button instead of a named testid. Measured at 390×844: home 1442→1155 px, the hero CTA 76 px higher. |
| 2026-10-22 | guidedHome 1a | **Journey Home answers one question per screen, behind a kill switch — no new routes, screens, endpoints, tables or deps.** `src/lib/flags/guidedHome.ts` resolves the device switch (`localStorage['kz.guidedHome']`) → `VITE_GUIDED_HOME` → build mode (ON in dev, OFF in a shipped bundle) as a pure, memoised `resolveGuidedHome`; OFF renders the screen that shipped before it byte-for-byte, because every change is `{!guided && …}` around unchanged JSX. ON keeps the hero (one action), the chapter strip and the daily tasks; the other six blocks moved into «المزيد» (1b). Measured at 390×844: page 1442→1095 px (−24 %), CTA top 557→481, tasks panel ending 3 px past the fold. Tests: `tests/guidedHome.test.ts` (switch precedence, the six gates, the hero and tasks never gated) and `e2e/guidedHome.spec.ts` (both switch positions in a browser). The plan and the conflicts it found: `docs/agent/GUIDED-REFINEMENT-PLAN.md`. |
| 2026-10-19 | V43 + V43.1 pages deploys | V43: debrief pillars/parts summary, mock-contextual paywall, daily-loop banner, Practice tile (`8fb96479-…`, `index-B5ReLSY0.js`). V43.1: the opener effect depended on the inline `mockPart` object, so the mock's 1 s clock reset the conversation every tick — turns vanished and a part could never be finished; it now depends on the part's fields, and `e2e/mockExam.spec.ts` drives all three parts to the debrief (`8fe6d07f-…`, `index-BfNVQ58w.js`, gate 14/14 in 773.1 s, smoke 4/2/0; rollback `5722462d-…`). No new routes/endpoints/tables/deps. |
| 2026-10-19 | V42 merge + deploy (the launch candidate) | **All three deploy targets touched per `docs/agent/DEPLOY.md` (owner words «merge and deply all all»); no new routes/screens/endpoints/tables/deps — the §14 manifests are unchanged (31 routes · 30 screens · 45 endpoints · 14 tables).** What went live: the owner-edited AI pool (`030961a`: NVIDIA/NIM flagship + OpenRouter mid defaults, dashboard-stored plaintext keys masked on every read, async `hasUsableProvider` on every AI route, Workers-AI fallback unchanged), the 2026-10-15 hardening batch (hook profiles, CI = one `npm run verify -- --ci` step, every-doc budgets, cost log), the curricula/progress/UX commit (`9d672e4`, incl. the marketing-shots rig), the two stale-contract e2e fixes (`7b52230` especially `2fa5acd`: the ask-practice Pinterest row pinned to the corrected translation files + one wrong-row assert, the welcome contract `إنشاء حساب جديد وابدأ` with the sign-in probe accepting both CI's no-`VITE_GOOGLE_CLIENT_ID` rendering (branch `تسجيل الدخول غير متاح الآن`) and a mock'd-id local build). **Merge:** `git merge --ff-only 2fa5acd` on `main` — branch is a strict descendant, linear history kept, pushed `a73a95b..2fa5acd` (no force); a stale local `main` (`df9fee8`) is an ancestor of `2fa5acd` (verified) so nothing extra published (`git log --oneline a73a95b..2fa5acd` = 64). **Pre-commit gate:** the runbook branch-gate `npm run verify -- --ci --e2e` **14/14 in 486.8 s** (3 noisy steps relabelled FLAKY, exit 0); **CI `39191010113`** = green (`verify`, `launch-check`, `secret-scan`, `e2e` = 141 passed / 2 skipped / 0 failed) for `2fa5acd`. **Worker:** `npm run deploy:worker` → live `66bd8b92-…` (was `56425f30-…`). **Pages:** build from the git push → production `f805663e-…` from `2fa5acd` serving `assets/index-DZrigzP5.js`. **Verified live read-only:** `/health` = `{status,service,ready:true,maintenance:false,storage:{d1:"ok",kv:"ok"}}` (shape changed by audited code `9c07b44` — never an accident: `git log -S 'storage:{d1:"ok"' cloudflare-unified-worker.js` says so; no pool/models/strategy); `/health` pre-deploy = `{status,service,ready:true,maintenance:false}` — the runbook's old "only four keys" line was updated this commit; `/crypto/health` unchanged (`ready:false`,`test_mode`); unauth `/admin/api/ai-providers` **401**, `/admin/api/me` **401**; `/` **200**. **Smoke:** `E2E_TARGET=production playwright e2e/productionSmoke.spec.ts` = §3 passed / 2 skipped / 0 failed (no rollback per the automatic triggers). **Rollback (recorded, not needed):** worker `npx wrangler rollback 56425f30-…`; Pages `2182564c-…` (source `a73a95b`). Marketing captures ride in history (65 MB, commit `9d672e4`; droppable only before a merge, too late without a rewrite). |
| 2026-10-18 | Haptics + purposeful motion | **One haptic API and a short list of motion, none of it a dark pattern — no new routes, screens, endpoints, tables or deps (APP-MAP §14 manifest unchanged).** `src/lib/utils/haptics.ts` gained the semantic vocabulary (`tap`/`select`/`success`/`warning`/`error`) with Capacitor → `navigator.vibrate` → silent as the device order and the older `triggerHaptic` kept as an alias, so the ~48 shipped call sites did not churn and keep their exact patterns. One switch (`hapticsEnabled?: boolean` on `UserEntity`, ABSENT = ON, so rows written earlier keep the designed feel) is persisted from Profile settings and mirrored into the module flag by `AppShell`'s existing `current_user` live query; `prefers-reduced-motion` and the switch both gate it. Two haptics were genuinely missing and added (paywall CTA = `select`, never `success`; destructive delete = `warning`, `error` only on a real failure). Motion: `.kz-pop` (correct verdicts), `.kz-shake` (wrong, 240 ms, once), `.kz-flip-in` (the review card's answer side), `.kz-orb-listening` (the mic halo now STAYS while listening, breathing at 1.4 s instead of vanishing), a rAF count-up on the report's unaided-sentence count, and `ProgressRail` moved from animating `width` to `transform: scaleX` (origin-right for RTL). Every class is neutralised under `prefers-reduced-motion` with the state still visible. **Evidence:** `tests/haptics.test.ts` (18, incl. toggle/unsupported/reduced-motion/bridge and an end-to-end wiring guard) and the new `feedback motion` block in `tests/designSystem.test.ts`; `npm run verify` **6/6**. **UNPROVEN:** real vibration on hardware — no phone and no device lab here, and iOS Safari has no `navigator.vibrate` at all, so iPhone is silent by design. Local only, not committed, not deployed. |
| 2026-10-18 | AI provider swap + owner-managed pool | **The default AI pool is NVIDIA + OpenRouter only (owner direction): Gemini and Groq default entries are gone, and the pool a request walks is now owner-edited from the admin dashboard.** New `cloudflare-ai-providers.js` — KV config `ai-provider-config` on `USER_PROGRESS` (`resolveProviderPool`: defaults minus owner-disabled + owner custom entries with their own base URL/model/format/tier/keys; stored keys win over env secrets). New admin API actions (`ai-providers`, `ai-provider-save`, `ai-provider-delete`, `ai-provider-default`, `ai-provider-test`) and an "AI Providers" dashboard tab with provider presets (OpenRouter, NVIDIA NIM, Groq, Google AI Studio, OpenAI, DeepSeek, Mistral, Together, Fireworks, Cerebras, xAI, Custom) — keys are stored server-side only and reads are masked to counts + fingerprints, never key material. Worker wiring injects the resolved pool at the single `callAiRouter` call site; `hasUsableProvider` is now async and pool-aware on every AI route; the internal `/ai/health` report describes the merged pool instead of Gemini key inspection. `PROVIDER_POOL` defaults: `nvidia/openai/gpt-oss-20b` (flagship, account-credit limits) and `openrouter/thinkingmachines/inkling-small:free` (mid, rpd 50 account-wide). Workers AI fallback unchanged. **UNPROVEN:** OpenRouter/NVIDIA key lists are still empty in production, so until the owner adds keys (dashboard or `wrangler secret put`) served turns ride the Workers AI fallback; preset model names/URLs are prefills, not verified endpoints. Not deployed. New `tests/aiProviderConfig.test.ts` (22); route/router suites updated to the new defaults. |
