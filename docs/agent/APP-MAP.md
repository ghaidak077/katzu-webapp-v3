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
| `/app/library` | `trail/TrailScreen.tsx` | The path: one primary action (`ابدأ جلسة اليوم` / `تابع`) with the composed session and minutes, capped review row, free-session line, one level card (percent ring + ability line) and a **vertical unit map** — current unit expanded, others collapsed with `N من M`, future units dimmed+locked, units below the placement level open and marked «تخطّيتَ»; compact situation cards with 3 evidence stages. No level selector, no rank. |
| `/scenario/:id/story` | `journey/StorySetupScreen.tsx` | Scene + vocab setup before practice; day-0 CTA hint gated on the shared `isFirstSessionDone` |
| `/scenario/:id/practice` | `journey/GuidedPracticeScreen.tsx` | Guided rehearsal; passes context to Live via route state |
| `/scenario/:id/live` | `conversation/LiveConversationScreen.tsx` | **Core loop** — AI chat turn; typing + mic; corrections |
| `/scenario/:id/study` | `study/StudyScreen.tsx` | Deep practice / study |
| `/scenario/:id/quiz` | `quiz/QuizScreen.tsx` | Quiz → result card |
| `/scenario/:id` | `study/ScenarioDetailScreen.tsx` | Scenario detail |
| `/session-report` | `report/SessionReportScreen.tsx` | Debrief: honest stats, corrections, spaced-review scheduling, fix-exercise; rank-up celebration when the session crossed a rank |
| `/app/review` | `review/ReviewScreen.tsx` | One explicit task per item: word, sentence→German, German→Arabic read-and-reveal, or correction |
| `/app/listen` | `listening/ListeningScreen.tsx` | Listening drill |
| `/app/write` | `writing/WritingScreen.tsx` | Writing task |
| `/app/coach` | `coach/CoachScreen.tsx` | Coaching/trend |
| `/app/grammar` | `grammar/GrammarSectionScreen.tsx` | Grammar locked path: lessons unlock one after another |
| `/app/progress` | `progress/ProgressScreen.tsx` | Honest measured-vs-unmeasured skills, patterns, streak |
| `/app/practice` | `practice/PracticeScreen.tsx` | Vocabulary hub: search, filters, error bank, flashcards, rules |
| `/app/profile` | `settings/ProfileSettingsScreen.tsx` | Profile/settings, sign-out; rank + XP card (one calculation for text and bar), the `REF-` referral card and a separate partner-programme entry; «ما نتذكره عنك» shows/deletes the four local facts (name/city/job/goal, `lib/memory/personalFacts.ts`) |
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
| Daily mission selection | Trail | `lib/mission/selectMission.ts`, `lib/mission/scenarioMinutes.ts`, `lib/utils/dailyMission.ts`, `checkIn.ts` |
| Path one-action layout | `/app/library` | `trail/TrailScreen.tsx` (single composed-session CTA, 10-item review cap, unit map, mastery stages), `lib/units/{units,progress}.ts` (unit partition, recommendation, composition), `lib/progress/ranks.ts` (`absoluteXpProgress`, profile only) |
| Unit coverage gate | CI / `npm run verify` | `scripts/audit-unit-coverage.mjs` imports `src/lib/units/units.ts`; fails unless every served scenario is in exactly one unit |
| Journey/story context | Story→Live | `lib/journey/{story,practice,context,brief}.ts` |
| Live AI conversation | `/scenario/:id/live` | `useLiveConversation.ts`, `ConversationTranscript.tsx`, `ConversationDock.tsx`, `HintDock.tsx`, `lib/conversation/*`; runs at the profile level, the ⋯ sheet offers 3 current-unit topics + «فاجئني», never a level control. **All 49 scenes run the roleplay turn** (`cloudflare-roleplay.js` + server plans): one prompt plays the persona and owns objective progress and closing; the client sends `objectives_done` only, derives the correction chip from `understood_de`, sanitises `hint_de` before display, retries once silently then fails with one of three clear Arabic sentences (offline / busy / other), restores the sentence to the composer and never adds a failed bubble (no counted turn, no free-session charge); hints are AI only with «اطلب تلميحاً» when a turn carries none |
| AI partner persona/correction | server | `cloudflare-ai-chat.js` (identity limits, gentle correction, schema-echo filter, trailing-question guard for A0–A2; the 💬 `followup_question_ar` line was removed at the source) |
| Deterministic German checks | client | `lib/conversation/germanChecker.ts` (rules win over the model; lexicon from `germanLexicon.generated.ts`, rebuilt by `scripts/build-german-lexicon.mjs`), `correctionChip.ts` (the chip shows the model's corrected reading of the learner's own sentence, never a paraphrase), `germanDiff.ts` (character diff) |
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
| `POST /ai/lexeme` | the last resort behind the shipped glossary: ONE model lookup per LEMMA, cached fleet-wide (KV, keyed by stem) and mirrored on the device. `{word, cefr_level}` → `{ar, pos, level, lemma, cached}`; `400` no word, `401` unauth, `429` throttled, `503/502` no provider (the card keeps its honest retry). Serves a cached lemma even with no provider key |
| `POST /ai/hints` | hint floor for the last AI message — quota-exempt from the trial SESSION counter, but has its OWN daily scope `hints` (free 30 / Pro 120 per day, 6/min); over the limit it answers **200 with an empty `hints` array**, never an error, so the client falls back to the free starter phrases |
| `POST /ai/transcribe` | speech → text |
| `POST /ai/check-writing` | writing check |
| `GET /scenarios`, `/scenarios/:id` | content |
| `GET /grammar` | grammar rows |
| `POST /verify` | redeem an activation code → Pro (exactly-once) |
| `GET/POST /progress/get`, `/progress/sync` | rev-guarded progress sync |
| `POST /analytics/events` | allow-listed analytics |
| `POST /client-error` | sanitized crash capture → `error_reports` |
| `GET/POST /consent/conversation` | learner-controlled conversation-review grant in KV `consent:logging:<sub>`; GET reports `{available, granted}`, POST `{granted}` grants/withdraws (withdrawal hard-deletes that account's `conversations` + `conversation_attempts`) |
| `POST /consent/conversation/report` | one learner-triggered bad-reply exchange (`learner_text`, `reply_text` + context) stored with `flagged=1`, `note='learner_report'`, `outcome='reported'`, same redaction/90-day sweep; gated by the operator switch but **not** by the learner's global grant |
| `GET /crypto/health` | payments readiness flags only — **no app price is read from here** (L1) |
| `POST /crypto/checkout`, `/crypto/webhook` | sales site (separate origin) |
| `POST /affiliate/ref` | is a partner code real and active? `{ok:true}` / `404 unknown_code` / `400 malformed_code` / `429`; returns **no** partner data. The site sets the 30-day `.katzuai.com` cookie itself and only clears it on 404/400 |
| `POST /affiliate/me` | **a signed-in learner's own partner code**, created on first call. Session token or Google ID token; one `affiliates` row keyed by the account email, code derived from the email local part and merged on `ON CONFLICT(code) DO NOTHING`; `201` on create / `200` on existing / `401` unauth / `400` no email / `405` non-POST / `503` storage unavailable. Answers `{ok,code,status,rate,approvalDays,minPayoutCents,payoutMethods}` and **never** contact or payout details |
| `/admin/api/affiliates*` | bearer-gated partner surface (`cloudflare-affiliate.js`): `GET /affiliates` (partners + ledger totals), `POST /affiliates/create`, `GET /affiliates/commissions`, `POST /affiliates/void`, `POST /affiliates/payout`, `GET /affiliates/payout.csv` — same throttle, bearer check and `no-store` as every other admin endpoint |
| `/admin/*` | bearer-gated admin: users/registry, codes report, generate/revoke, upload, sweep, edit, schema |
| `/internal/admin/content/*` | content management behind the panel's Service Binding (`cloudflare-content-admin.js`): meta, list/search/filter, draft → publish/discard, duplicate, soft delete/restore, undo, CSV/JSON import with dry run, export, dated backup, bundled-review notes + corrections export. Not routable by hostname; token + rate limit + 401-before-404 as the rest of `/internal/admin/*` |
| `/admin/api/content-studio/*` | the same studio router bridged onto the bearer-gated admin surface (`cloudflare-admin.js` → `handleContentAdminRequest`, actor `content-loader`): `GET meta`, `audit`, `<type>`, `export`, `<type>/history`; `POST <type>/{draft,publish,publish-all,discard,undo}`, `backup`, `import`. Same throttle + `no-store`; no new privilege and no panel UI change |

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
| an opener, a scenario title/persona/order, or a word's meaning/POS/level | **authoring source `docs/content/catalogue/scenarios-catalogue.json`** (61 scenarios × A0–B2) → `node scripts/apply-content-catalogue.mjs` derives `scripts/language-data/{content-snapshot,opener-translations,word-glosses}.json` → `node scripts/build-language-data.mjs --offline` → `src/lib/conversation/openerGlosses.generated.ts` + `cloudflare-opener-glosses.generated.js` + `src/lib/vocabulary/wordGlossary.generated.ts`; lookup in `src/lib/vocabulary/wordGloss.ts`. The catalogue is authoring-only (61 scenarios); production D1 serves a different 49-scenario corpus until an authorized content load (`docs/agent/CONTENT-LOAD.md`) — **so the worker's `/scenarios` output is the source of truth for anything a learner sees**, and `scripts/audit-opener-coverage.mjs` fails the gate when any served first message has no Arabic. **Arabic for first messages the catalogue snapshot does not hold lives in `scripts/language-data/opener-ar-extra.json`** (the live 49-scenario corpus, the three B1 mock-exam part openers, the code fallback); the build merges it after the authored corpus and validates it identically, so a content refresh cannot erase it. Shipped today: **526 openers, 457 glosses**. |
| how the partner answers a bare greeting | `cloudflare-turn-guard.js` (`guardGreetingReply`, called early in `/ai/turn`): the scenario's **stored** opener's own last question, selected by scenario id + level (`resolveScenarioIdentity().openers` → `openerForLevel`, the worker twin of `src/lib/conversation/opener.ts`) via `sceneTopicReAsk` + `cloudflare-opener-glosses.generated.js`. History is never the topic source: joined model turns stopped matching a stored opener after the first exchange, which is how «Wie geht es Ihnen?» returned mid-scene. When no stored opener can answer, the fixed `RE_ASK` line invites more content and never asks about wellbeing. `sceneGerman` (history entries by `role` **or** `sender`) is still used for off-topic words and the du/Sie register. Greeting detection squashes held keys/typos and accepts hello/hi/hey/moin/servus/guten tag and a lone emoji wave; that tolerance is greetings-only, never scene words |
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
- **Chat QA (real model, synthetic learners):** `npm run qa:chat -- --from-kv` drives the real
  `runRoleplayTurn` with 12 deterministic learner profiles, the frozen hard checks and a
  whole-transcript judge on a different model family; it writes `docs/agent/CHAT-QA-REPORT.md`.
  Flags: `--dry` (no network), `--resume <stamp>`, `--only a--b`, `--weekly` (3 profiles × 10
  scenarios for CI), `--write-baseline`. Judge calibration is
  `npm run qa:chat:calibrate -- --from-kv` → `docs/agent/CHAT-QA-CALIBRATION.md`. A checkpoint is
  only reused when its prompt+learner version match and every turn succeeded. Groq's free-tier
  **daily** token wall aborts with `QA_DAILY_QUOTA` instead of retrying a 65 s wait. The report is
  rendered by `scripts/qa/report.mjs` (keeps the orchestrator under the 500-line budget) and its
  prompt-version table keys a row by prompt **+ actor**, so a substitute-model row is never read
  as production evidence.
- **Live chat UI:** `npx playwright test -c e2e/chatQaLive.playwright.config.ts` — 390×844,
  throttled, real model via `page.route('/ai/turn')` → `runRoleplayTurn`; projects `live` (6
  scenarios, screenshot per turn) and `live-pwa` (service-worker update).
- **Build:** `npm run build` (`tsc && vite build`). **Worker syntax:** `node --check
  cloudflare-<name>.js`.
- **Audits/content:** `node scripts/audit-curriculum.mjs`, `audit-quiz-content.mjs`,
  `check-content-drift.mjs` (read-only drift vs live), and **`node scripts/audit-opener-coverage.mjs`
  (CI-only)** — fetches the worker's real `/scenarios` and fails if any served `initial_message_<level>`
  has no Arabic gloss in the shipped map (3 attempts, 15 s timeout; `--offline` audits the committed
  fixture, `--json` for machines, exit 0/1/2). This is the gate that V47 lacked: the fixture was fully
  translated while 221 live openers rendered bare.
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
| App (Pages) | `https://katzu-webapp-v3.pages.dev` (custom domain `https://katzuai.com`). **Builds from git on every push to `main`, so the deployment id changes on docs-only pushes too** — quote it only after reading `npx wrangler pages deployment list --project-name=katzu-webapp-v3`. Last verified **2026-11-09** (roleplay hardening, `1a587d7`): deployment `d8f719a1-c299-407f-b415-3bb4bab1017c` (docs-only `cd8de87`) and the bundle build `4b95a34a-5b71-4ac2-a07c-4c298b996c54` (`1a587d7`) serve the same entry `assets/index-BMaau88M.js` and lazy `LiveConversationScreen-T4h-ly06.js` carrying «أعد المحاولة»; `/sw.js` 200; production smoke 2 passed / 2 skipped; rollback `8b78acc4-0301-4e32-b696-477437371dd5` from `de07bd2`). Earlier **2026-11-08** (scripted-practice fixes, `086d545`): deployment `b0b066df-e003-4507-bbd3-da7259a66cc4` (later docs-only builds such as `75380f84-e4f1-402e-b550-838d8e98d696` from `7352ce6` serve the same bundle; live chunk `LiveConversationScreen-DJh3I_8D.js` carries «Wie gefällt dir», «سعيدة بمعرفتك» and «Wie bitte», and no «تُنهى بنقطة»); production smoke 2 passed / 2 skipped; rollback `eea032dd-ebb1-4636-8381-0ea38e177789` (source `4d419d6`, script-AI turns; entry `assets/index-D6Htrqgk.js`), then `9ab1f882-0659-4d66-a051-7ef5941cddf7` (source `48f723b`), then `ecc68c3f-4985-4cff-8a1e-809a43851645` (source `09f0b92`, script-owned chat + hint dock + local memory), then `f9261d73-7f96-43ad-a07c-42c099fe6a51` (source `7cedfd0`), then `7b5995a4-9b08-4fb6-9190-670a6aca10a9` (source `421715a`, session-replay fixes), then `26335c17-a358-444e-a29a-bedd99845690` (source `6d84cfc`). Worker `e89a0fc1-9647-4fa0-b9cc-5b2705fbd52c` (rollback `17abb92b-bf13-4656-bb02-c9c9c75af41c`, then `5b0635aa-112d-45f8-ab17-093fd9295e69`, then `aeee3302-f036-47e4-aea6-211043375d60`; `/health` 200 with `storage:{d1,kv}`, `/crypto/health` 200 `ready:false`, `/internal/admin/health` 401). Earlier: UNIT-PATH owner-approved ten-unit map, composed session, goal-only signup: deployment `5c63e575-9021-4caa-82de-a2ec6dd7d6c7` (source `19b431a`; entry `assets/index-BnLPxd6G.js`, `/` and `https://katzuai.com` both 200, `/sw.js` 200, production smoke 2 passed / 2 skipped); rollback `b914e4ba-c296-44eb-8302-f19c5d571c03` (source `58551b9`, docs-only, same bundle as `eff039c2-…`), then `eff039c2-4f80-4836-b964-8337d61cdddb` (source `4af08b2`; entry `assets/index-DesAHQkO.js`), then `4e9775c6-40e9-4ebc-aa59-b24c7a4ee1d2` (source `8e37986`, docs-only, same bundle), then `a10ab1b7-69a1-4bb8-8870-ecd9c2a50b1e` (source `35a4363`, TRAIL-1; entry `assets/index-BVLRTDPT.js`), then `7549eab3-ffb4-4583-9bbe-87061a55eca9` (source `31f65d3`, docs-only, entry `index-BuFoPzZ9.js`), then `7bfe14d6-eef2-420a-9164-f853bc8f4f11` (source `87997a4`, docs-only, same entry), then `5c3e24c8-8183-4eaa-90d1-e85a701f502e` (source `0099ab4`, docs-only). Previous bundle deployment — first-message Arabic + pointer focus: deployment `bf78a12c-fae8-4474-b70b-4142a98e9a1e` (source `9ace95e`; entry `assets/index-BuFoPzZ9.js`, lazy `assets/opener-DcmfekFc.js` 90,565 B carrying the live-corpus Arabic incl. «Hallo! Ich bin Frau Meier, deine Nachbarin. Wie heißt du?», `/sw.js` 200, `https://katzuai.com` 200); rollback `0c25ba91-21cd-4eee-83c7-893755803cf3` (source `d2353a6`, labelled per-reply report; entry `assets/index-3KsTlLGj.js`, `assets/AppShell-BkKLS82I.js`, lazy `LiveConversationScreen-CjozgZmU.js` 145,681 bytes with the labelled «أبلغ عن رد سيئ» line, `SessionReportScreen-COJKDuE4.js`, `conversationConsent-B7o-RqQj.js`; `https://katzuai.com` answers 200 with that hash, and the prompt-mode service worker served it after two reloads); rollback `6cb04cff-076a-4e5c-8bfa-e50b07138493` (source `11e7051`, docs-only), then `d1324296-3585-4b4d-afca-bb2453825ac2` (source `580e522`; entry `assets/index-CsARdscf.js`, `assets/AppShell-Sy8uwkx5.js`, lazy `LiveConversationScreen-DIf5FKxw.js` with the icon-only report action, `SessionReportScreen-BaO5BEu7.js` with the one-time sheet, `ProfileSettingsScreen-DG11uPLH.js` with the visible on/off labels, and `conversationConsent-ac6MEAi4.js` carrying `/consent/conversation/report`), then `c2fb76b0-cae3-4235-a7f4-49cc0693514a` (source `59a6942`), then 2026-10-31 (greeting re-ask from the stored opener + Latin isolation in the card): deployment `bc807292-fc48-45bb-b398-ddd3710a8728` (source `a033b19`; entry `assets/index-CfqO0tha.js`, `assets/AppShell-CL4Y31Jk.js` -> lazy `LiveConversationScreen-CllYR611.js` 183,935 bytes containing the isolated-Latin wrapper (`bdi` with `dir:"ltr"`) and the derived `Schreibung: Doppel-` chip; `https://katzuai.com` answers 200 with that hash); rollback `f4c077c6-e339-4996-b155-3c678498dc39` (source `aa6635d`, docs-only), then `e1db6dde-f870-487b-915a-ef809c43b070` (source `2439e3a`; entry `assets/index-BHIvDiQs.js`, CSS `assets/index-DDQd4ZBu.css`, `assets/AppShell-CP1iPsE-.js` → lazy `LiveConversationScreen-DDTyFU2n.js` (173,580 bytes) carrying `Schreibung: Doppel-`, `مضعّف` and `الباقي صغيرًا`; `https://katzuai.com` answers 200 with those hashes); rollback `5b4c2b86-338a-4ad6-b25f-fb54e1de8fb9` (source `58a16f5`), then `c69c1ca4-9a49-44f6-9034-5200992cd3f4` (source `5d04a51`), then `73b9768b-c9e0-4520-b1bb-f28579d32910` (source `203d050`), then `203a5983-e334-45b9-a530-ba856055288c`. Earlier content-signal verification (**2026-10-29**): `vite build` emits `robots.txt` (the ten crawlers, `/admin/ /api/ /private/` only, and `Content-Signal: search=yes, ai-input=yes, ai-train=yes` in the wildcard group) and a root-only `sitemap.xml` from `VITE_PUBLIC_APP_URL`, and the shell carries `lang="ar"`, one canonical and `hreflang` ar + x-default; deployment `203a5983-e334-45b9-a530-ba856055288c` (source `d920829`, 2026-10-31: the docs push that recorded the admin deploy — bundle byte-identical, `assets/index-uXgW2nvR.js`, and every later docs-only push mints another id exactly this way); rollback `40b04fb7-dc48-4263-9f1f-e8e2a020fa64` (source `053d882`, the admin-panel batch), then `39d0c289-0ce9-41ad-ae99-e886b617c48c` (source `0b53942`), then `d150eea2-9af3-4984-bb00-70b3c181141e` (source `5a8c7d5`), then `e948f1dc-40fd-4a6a-b6df-1c8efac1297b` (source `51bf25b`, the batch's own code: precomputed openers + `/ai/lexeme` + greeting guard), then `183636fd-ac65-4cfe-a8f2-6ac42b89c085` (source `0424ef3`), then `e58871a2-078d-4d6e-b6e5-591c1ce7c736` (source `2c5faff`), then `b5ab2a14-9a08-4084-9904-c202e06f8fb9` (source `4ba7b4b`, bundle `assets/index-DZbiK2cC.js`) |
| Worker | `https://katzu-test.ghaidakalosh008.workers.dev` (`/health` → 200; `/` → 404, expected). Live version `a73207be-e4ab-4529-9108-f51d8fbcb82e` (2026-11-09, tree `1a587d7`; `/health` 200 with `storage:{d1,kv}`, `/crypto/health` 200 `ready:false`, `/internal/admin/health` 401; rollback `e89a0fc1-9647-4fa0-b9cc-5b2705fbd52c`). Previous `e89a0fc1-9647-4fa0-b9cc-5b2705fbd52c` (2026-11-08, tree `086d545`; rollback `17abb92b-bf13-4656-bb02-c9c9c75af41c`, then `5b0635aa-112d-45f8-ab17-093fd9295e69`, then `aeee3302-f036-47e4-aea6-211043375d60`, then `3afaa92c-5d0e-463a-af73-7eaf90d00cde`, behind it `dd23b2ac-46b0-4b42-a20b-4a41be0cc739`, 2026-11-05T06:47Z, first-message opener glosses): the learner's conversation-review grant (`/consent/conversation`, 401 signed out) and `POST /consent/conversation/report` (one redacted bad-reply exchange; GET answers 405, signed-out 401), with withdrawal and account deletion hard-deleting the account's stored turns and its KV grant; rollback `e98031d5-9932-4093-a7a9-7ba4ab827b0d` (2026-11-04T07:02Z, source `580e522`, the consent + labelled-report batch), then `70daf981-98bf-49eb-9722-a4b533ac017f` (deployment `798fd12a-1c44-49c0-b13b-cb636b2df49d`, 2026-11-04T05:52Z, the first consent deploy), then `625986fd-46da-4c5e-a5ff-67b3925e260c` (deployment `5884fb31-6fa2-43f3-b02d-c4ae4c5f3bca`, 2026-10-31T13:00Z, source `ed8255c`): the content studio's token-gated `/internal/admin/content/*` (drafts, publish, undo, import/export, backup; **401** unauthenticated) on top of the scene-aware greeting guard that reads the scene text by `role` **or** `sender` (the app sends `{ role, text }`), tolerates greeting typos/variants, and re-asks the scenario's **stored** opener selected by scenario id + level (`sceneOpener` -> `openerForLevel`), so a later bare `hallo` can no longer fall back to «Wie geht es Ihnen?»; history still drives only off-topic and du/Sie, on top of observer-only telemetry; `/ai/lexeme` is live (missing-word 400, unauth 401), `/health` 200 with `storage:{d1,kv}`, `/affiliate/me` 401 signed out, `/affiliate/ref` 400 malformed / 404 unknown, `/admin/api/affiliates*` 401, `/internal/admin/health` 401 with no and a bogus bearer, `/ai/turn` 401 unauth, cron `17 4 * * *` **verified live at 04:17:37 UTC on 2026-10-31** (`[sweep]` + `[sweep:telemetry]` + `[affiliate]`, `outcome: ok`); rollback `862087cb-eeef-48c0-8467-d0bd721c35c3` (deployment `b3c5b2de-2314-488e-aa95-8cc2853b1d27`, 2026-10-31, source `a033b19`, the greeting guard), then `e3f994ef-5524-44ef-95b9-f0fde2923baa` (deployment `f219d5b3-1ce4-4a3d-ad18-79e3023e8534`, 2026-10-31, source `e8e722d`, the wire fix), then `808f1553-9a1a-4af4-bafd-817c62bbb10e` (2026-10-31, source `4ba4514`, the greeting guard before the wire fix), then `6a6db52d-a581-45b1-94c7-ef5b5e9983ea` (2026-10-30, source `053d882`), then `b33136fa-dd5d-45b5-bad5-fabbbfbdca72` (source `73dad45`), then `4d20d59e-562a-43f3-a4e2-00a99da8a507`, then `6860fa2f-bfca-44d7-8fc3-870a87aec926` (source `e9aa028`), then `998873c6-d773-4bb5-9ec5-2c548e550b0f` |
| Admin panel Worker | `https://katzu-admin.ghaidakalosh008.workers.dev` — separate Worker behind **Cloudflare Access (All traffic)**; no D1 and no AI binding, KV token only, `/api/*` proxied through a Service Binding to `katzu-test`. Live version `8c383727-85b3-43f2-ac29-efc6126ef869` (deployment `95d460dd-1abb-4634-af68-285e57bd3c93`, 2026-10-31 13:01:11Z, 4 assets incl. `/bundled-content.json`): content studio UI (drafts/publish/undo/import/backup, plain DOM + `textContent`) over the existing screens; unauthenticated `/`, `/api/overview`, `/healthz`, `/bundled-content.json` all **302** to the team login with `kid=8374079e…` matching `ACCESS_AUD`; rollback `e7716e26-f3b4-478e-8097-106481a3369e` (deployment `adff257d-f3d6-44cc-94f5-6a40514cd455`), then `bc7db8cc-5b4a-4a33-83b8-850e9f4c5b16` (`3692c953-…`), or delete the Worker |
| Site (Pages) | `https://website.katzuai.com` ← Pages project `katzu-landing`, **direct upload** of `website/` built by `node scripts/build-website.mjs` (does not build from git). Last verified **2026-11-04** (conversation-review consent): deployment **`6c6c6023-888f-4786-8b38-64eba9cc9852`** (branch `main`, source `580e522`, uploaded from inside `website/` so the Functions bundle shipped; `/` `/pricing` `/affiliate` `/help` `/guides` **200**, `/privacy` a single **301** to `/help#privacy`, and `Accept: text/markdown` on `/help` returns `text/markdown` carrying the report sentence); rollback **`5be0e65b-02dd-4eaf-9826-44e5bb0d39f6`** (source `59a6942`), then 2026-10-30 (the home-headline batch): **17 pages** (`/`, `/pricing`, `/affiliate`, `/help`, `/guides`, twelve `/guides/<slug>`) plus `404.html`, a 17-URL sitemap, `robots.txt` for the ten crawlers, `llms.txt`, the IndexNow key `01b620d0…txt`, `/assets/ai-ref.js`; `/` still renders from `scripts/templates/home.html` = the owner's design, now with JSON-LD + hreflang in the head and one footer link «الأدلة». `robots.txt` (2026-10-29) also carries `Content-Signal` in its wildcard group. **Since 2026-10-29 the project also ships a Pages Function** (`website/functions/_middleware.js`): every page served on `Accept: text/markdown` comes from its `md/` twin with `Vary: Accept` + `X-Robots-Tag: noindex`, and browsers still get the byte-identical HTML. `website/_routes.json` limits invocations to the six page shapes plus `/functions/*`, so assets, `/md/*` and the crawler files never reach the Function; `onRequest` is fail-open (any error returns `context.next()`). Deploy **from inside `website/`** (`cd website && npx wrangler pages deploy . --project-name=katzu-landing`) or wrangler reports "No Functions" and the twins ship without their negotiator. Deployment **`361b0125-a220-4ab9-8e6b-b94f0e0479a9`**, source `4ba7b4b` (2026-10-30: the whitespace between the home `h1` lines, its title/language batch and the new heading-fusion guard — 2 files uploaded, Functions bundle included; live `/` `/pricing` `/affiliate` `/help` `/guides` 200, the 46-character title and the five-word H1 read back from production, markdown negotiation verified on `/pricing`); rollback `7d547d60-9b67-4e51-b601-01227087df90` (source `3bacf75`, the phone cut — `bg-mobile.mp4` at ≤700px), then `39639c5c-b610-4575-bee5-5520bde0c4d2` (source `eda9a7f`), then `3e859def-277f-46e7-a107-a45bb09ef5d0` (source `f3980be`) |
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
- **Chat turns are validated (V28), for mock-exam turns only.** `cloudflare-turn-quality.js` drops an
  embedded hint that does not answer the last AI message, refuses a correction that changes nothing or
  "corrects" an already-correct sentence, and gates the persona obstacles (never turn 1, never right after a
  repeat request). Run `node scripts/eval-chat-quality.mjs` (in CI) for the before/after rates. Ordinary
  conversations never reach these guards: they are roleplay turns (below).
- **Every conversation is one model call that plays a plan (ROLEPLAY, 2026-11-09).** All 49 scenes run
  `cloudflare-roleplay.js`: one system prompt (persona, goal, 3–5 objectives, level word cap, the JSON
  contract) + the last six turns, with the learner's message labelled as DATA rather than instructions.
  Plans live server-side in `cloudflare-roleplay-plans.js`; the model comes from `ROLEPLAY_MODEL` and the
  pool keeps keys, quotas and failover. The server owns progress and closing (an invented objective id is
  dropped; `close` only when every objective is done) and shapes only displayable answers. Three cheap
  checks run before display — not a near-repeat of the last three persona lines, at most one question mark
  (none at the goodbye), no meta words such as «nächste Frage» — with ONE retry and then an honest 502
  `AI_EMPTY_REPLY`. **There is no authored or offline fallback for persona replies** (2026-11-10): the
  per-level re-ask/ack/trailing-question tables, the level fallback lines and the «Wie bitte?» fallbacks
  are deleted, and `tests/turnGuard.test.ts` + `tests/noFallbackPersona.test.ts` fail if one returns or
  if a persona bubble can be built without a model answer. Entering offline still shows the shipped
  opener and its shipped Arabic; the composer is disabled with the offline sentence and a re-check
  button, nothing queues and no answer is cached. Budget: 3.5 s per attempt, one silent retry, second
  provider included, ~8 s total; then the one of three clear Arabic sentences (offline / busy / other),
  the learner's text back in the composer, no duplicate bubble, no counted turn and no free-session
  charge (quota is claimed only after a reply exists — `handleChatTurnRoute`). Busy gets two visible
  countdown retries before the button; «other» adds «أبلغ عن المشكلة», which sends a diagnostic id only.
  Hints are AI only: a reply without a valid hint offers «اطلب تلميحاً» (one small `/ai/hints` call).
  Settings hides an off-by-default debug toggle («AI · model · ms · attempt n» / «ERROR · reason»).
  The correction chip comes from the model's
  `understood_de` when it is a small edit of the learner's own sentence (`correctionChip.ts`), while
  `checkGerman` still supplies the report and the mistake bank. Prompt copy: `docs/agent/ROLEPLAY-PROMPT.md`;
  measurements: `npm run eval:chat -- --from-kv` → `docs/agent/ROLEPLAY-EVAL.md`. The script engine, the
  beat engine, the answer bank and the suggestion guard are deleted.
- **A cached pre-rewrite bundle still renders (2026-11-09).** A request carrying `script_context` gets the
  same reply/hint under the legacy `script_turn` key (`legacyScriptTurn`), so the old PWA uses its authored
  script and local matcher until the service worker delivers the new bundle; current clients ignore the key.
  `eval:chat` paces itself (`--pacing`, a 65 s wait after 429, `--partial`/`--resume`/`--only` in TEMP): the free
  Groq tier meters 8K TPM and 200K TPD for gpt-oss-120b, shared with production, and one turn is ~950
  tokens, so a full 60-input run needs ~57K tokens and can stall for a day once TPD is spent.
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
/ai/lexeme
/ai/transcribe
/ai/translate
/ai/turn
/auth/session
/auth/signout
/check-status
/client-error
/consent/conversation
/grammar
/health
/hints
/internal/admin
/internal/admin/*
/lexeme
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
admin_audit
affiliates
ai_events
commissions
conversation_attempts
conversations
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
route_events
sync_revisions
trial_quota_ledger
users
```

The content tables (`scenarios`, `vocabulary`, `grammar`, `starter_phrases`) are deliberately
**not** here: their DDL lives only in the deployment, not the repo (§5, §11.10), so there is no
source line for the guard to read. Worker-created ledger tables are the ones the repo creates.
The panel's own content tables (`content_drafts`, `content_audit`, `content_trash`,
`content_backups`, `content_reviews`) are created by `ensureContentAdminTables` through a
parameterised `createTableSql(name, …)`, so the extractor does not see their names either; they are
additive and hold no learner row.

> **Older half of the change log.** Rows dated 2026-10-04 and earlier moved verbatim to
> `docs/agent/APP-MAP-ARCHIVE.md` on 2026-10-22 (40 rows, 41.8 KB), rows dated 2026-10-07 and
> earlier on 2026-10-28 (31 more rows), the two rows dated 2026-10-18 on 2026-11-05, and every row
> dated 2026-10-31 and earlier on 2026-11-07 (33 rows) — each time because `AGENTS.md` §12 requires
> this table and the 135 KB cap was within a few bytes of full. Nothing was deleted — grep the archive.

| Date | Version | Change |
|---|---|---|
| 2026-11-09 | chat QA harness: live UI rig + actor-keyed report | **Docs/scripts only; no route, screen, endpoint, table or dependency changed.** `scripts/qa/` drives the real `runRoleplayTurn` with 12 synthetic learners through the frozen checks and a whole-transcript judge on another model family; `scripts/qa/report.mjs` renders the owner report (the orchestrator stays under the 500-line budget) and keys its prompt-version row by prompt **+ actor**, so a substitute-model run is never read as production evidence. `e2e/chatQaLive*.spec.ts` runs the 390×844 live UI rig (six scenarios, retry, five concurrent learners, PWA update) and is never part of `npm run verify`. |
| 2026-11-09 | roleplay hardening: invisible 429s, safe hints, old-bundle compat | **A provider stall no longer costs a turn or shows an error card, a hint cannot carry meta text or personal-data blanks, and a pre-rewrite PWA keeps working; no route, screen, endpoint, table or dependency changed.** `turnRecovery.ts` classifies a 429/timeout/network/5xx as transient and retries silently (1.2 s, 3.2 s) before the client restores the sentence with «أعد المحاولة» and no failed bubble; `RATE_LIMIT_EXCEEDED` gets its own Arabic message. `hintSafety.ts` deterministically repairs German spacing/capitalisation/umlauts, drops meta/placeholder/personal-data hints and falls back to the starter floor; hints stay tap-to-insert, never auto-send. A legacy `script_context` request gets the reply/hint under `script_turn` (`legacyScriptTurn`), so a cached old bundle finishes its lesson while the SW updates. `eval:chat` gained `--partial`/`--resume` and a 65 s post-429 wait after the 8K-TPM free tier stalled a 30 s-pacing run. Tests: `turnRecovery`, `hintSafety`, `roleplayTurn` compat; e2e paywall progress assertions restored against `objective-progress`. |
| 2026-11-09 | roleplay turn: one prompt, one call, plans instead of scripts | **Every conversation — all 49 scenes — is now one model call playing a server-side plan; the script engine, the beat engine, the answer bank and the suggestion guard are deleted.** `cloudflare-roleplay-plans.js` holds 49 plans (persona name/gender/role/personality, goal, 3–5 plain-id objectives; level from `units.ts`); `cloudflare-roleplay.js` owns one versioned prompt (`ROLEPLAY_PROMPT_VERSION = 1`), the last-six-turns contents with the learner's message labelled as data, strict-JSON parsing, server-owned objective/close shaping, the three display checks (near-repeat against the last three persona lines, ≤1 question mark and none at the goodbye, meta-phrase ban), one retry and `runRoleplayTurn` as the tested seam. `/ai/turn` branches to it before the legacy guards; the mock-exam path still uses the fused prompt + `cloudflare-turn-quality.js`. The client sends `objectives_done` only, shows the server's objective progress in the header, hides the hint dock after `close`, offers «إنهاء» then, and derives the correction chip from `understood_de` via `correctionChip.ts` while `checkGerman` keeps the report and mistake bank. Model by `ROLEPLAY_MODEL` (temp 0.3, 300 tokens, 4 s attempt, 9 s budget); the turn log is structured cost only. `npm run eval:chat` (60 fixtures, `--dry` in CI, `--from-kv` live, `--from-report`) writes `docs/agent/ROLEPLAY-EVAL.md`; prompt copy in `docs/agent/ROLEPLAY-PROMPT.md`. Tests: `roleplayTurn` (plan coverage over all 49 served ids, prompt contract, shaping, checks, retry) + `reportedExchange` retargeted; the legacy turn suites and `scriptedConversation.spec.ts` removed with the code they pinned. |
| 2026-11-08 | scripted practice replay: full-slot matching, greetings arc, gendered glosses | **All 11 pilot scripts now survive replaying a real A1 session — fragments and any casing fill the right slot, no question repeats, and a first unclear answer is asked again with the model answer; no route, table, endpoint or dependency changed.** `engine.ts`: `barePhrase`/`cleanPlace`/`numberValue` accept «in berlin», «aus London», «ich heiße leo», «Hallo, ich bin Leo», bare ages and jobs; `matchAnswer(step, raw, slots)` rejects a value that matches another step's type (cross-slot guard); `keepNameOnce` uses the just-captured slot name, so «Freut mich, Ghaidak!» never repeats. Failure policy: first unclear → «Wie bitte?» plus the model answer in the hint dock, second → gentle bridge to the next open step (never silent, never «Kein Problem»). `scripts.ts`: greetings arc name → origin → city → «Wie gefällt dir {city}?» → farewell; all address/street/phone asks deleted; each persona carries `gender` and Arabic glosses agree (`glossLint.ts` gate over every shipped gloss; `GOODBYE` is gender-neutral). `germanChecker.ts` no longer emits the «تُنهى بنقطة» note. `useLiveConversation.ts` header total = `scriptTurnTarget(script)` (5 for `first_greetings`). Tests: `scenarioScript` **84** (unique slot, re-worded duplicate, sensitive-topic ban, header M = steps, exact golden replay, 15 fragment/casing cases per slot type, name once), `e2e/conversationLayout`/`paywall` header assertions. Gate **VERIFY OK 16/16** (729 s, `--ci --e2e`); Pages `b0b066df-…` (source `086d545`), worker `e89a0fc1-…`, production smoke 2/2. |
| 2026-11-08 | scripted chat V34: the AI reads the learner's words, the script keeps the arc | **A migrated scene now sends one bounded `/ai/turn` per turn for the human half, while the script still owns the step, the accepted answer and the next question; no route, table, endpoint or dependency changed.** `src/lib/conversation/script/aiTurn.ts` builds a capped `script_context` (step, slot, question on screen, authored hint, ≤8 keywords, ≤24 scene facts, learner name, turn index) and validates the reply: how the model read THIS sentence (`matched`/`slot`/`value`), one in-character reaction with no question mark, and a hint that repairs THIS attempt. The worker (`cloudflare-ai-chat.js` `/ai/turn`) returns `script_turn` early in script mode, re-bounding every field and rejecting invented facts; `src/lib/api/aiTurnResponse.ts` shape-checks it. `engine.ts` keeps the local matcher as cross-check (an explicit local match overrules an AI rejection; an accepted AI value must appear in the learner's text), never lets a reaction replace the question (off-topic = «reaction + the script's re-ask»), and stores the repair hint. `useLiveConversation.ts` gives the call 7 s and falls back silently to the authored line, so no error card can appear; `germanChecker.ts` now repairs missing umlauts. Tests: `scriptAiTurn` **13**, `umlautCorrection`, `scenarioScript` **39** (all 11 scripts), `e2e/scriptedConversation.spec.ts` **3** (seeds the 49 served rows so `first_greetings` is served, captures only `POST /ai/turn`, asserts reaction + re-ask and the repair hint). Gate **VERIFY OK 16/16** (827.8 s, `--ci --e2e`). |
| 2026-11-08 | script-owned chat: no repeated question, hint dock, collapsed correction, local memory | **Migrated scenarios are now decided on the device, so the question a learner has answered is never asked again and every session ends after a farewell; no route, endpoint or dependency changed.** `src/lib/conversation/script/{types,engine,scripts,index}.ts` is a pure state machine (one shared with the worker/tests, no network) holding 11 pilot scripts — `first_greetings` + units 1–2 — with 3 German/Arabic ask variants, recognition, reactions, hints and a farewell last; `useLiveConversation.ts` runs the script branch before any AI call (zero AI calls per scripted turn) and persists a stated city via `lib/memory/personalFacts.ts`. Every line passes `guardGermanLine` (≤1 question, role, level length, no markdown). New `HintDock.tsx` (+`lib/conversation/hintMatch.ts`) shows the sentence with blanks, its Arabic meaning, and «سمّعني»/«ببطء»/«قلها» without ever sending; a hint-matched sentence is tagged «بتلميح». The correction card is now a collapsed `<details>` chip «تصحيح صغير ›» rather than a blocking card. Header reads «N من M»; report numbers are LTR-isolated and the review hint respects the 10-item cap; the green «أحسنت!» banner is gone. Settings gains «ما نتذكره عنك» (`PersonalFactsCard.tsx`: name/city/job/goal, visible and deletable, local only) and the privacy page names those four facts (`TRUST_VERSION 2026-11-08`). `tests/scenarioScript.test.ts` replays 10 personas × 5 AI behaviours across all 11 scripts. A script is served only when the session's served level equals the script's own (`scriptForScenario(id, level)`), so the B1 mock and A2 paywall keep the legacy engine; browser specs that measure the model engine now run on unmigrated `friend_catchup`/`landlord_followup`. Gate **VERIFY OK 16/16** (799.5 s, `--ci --e2e`). Measured over the real engine with `vite-node`: 2,200 sessions / 9,400 turns, 0 AI calls, turn compute p95 0.009 ms (excludes the deliberate typing beat and rendering). Deployed 2026-11-08: Pages `ecc68c3f-4985-4cff-8a1e-809a43851645` (source `09f0b92`, rollback `f9261d73-7f96-43ad-a07c-42c099fe6a51`) and worker `5b0635aa-112d-45f8-ab17-093fd9295e69` (rollback `aeee3302-f036-47e4-aea6-211043375d60`). |
| 2026-11-07 | session-replay fixes: no false correction, never-empty hints, no off-topic 💬 line | **Every shipped suggestion now survives the corrector unchanged, the hint sheet answers the last question first and is never empty, and the off-topic Arabic follow-up no longer exists; no route, table, dependency or provider change.** `germanChecker.ts`: `du/dir/dich/dein*` are never capitalised (only common nouns in context or a person name after heiße/bin/ist/Frau/Herr), formal `Sie/Ihnen` always are, and a missing final `.`/`?` became an optional soft note (`softNoteAr`) instead of a silent edit — so «قريب! بقي تصحيح واحد» only appears with ≥1 real error. `answerBank.ts` adds 49 question types × 3 level-appropriate answers (147) + 3 repeat + 4 generic = **154 shipped strings, 0 corrections**; `visibleHints` leads a matched question with its own answers («Wie heißt du?» → «Ich heiße …» with the learner's name, «Wie geht es dir?» → «Mir geht es gut, danke.»), appends the repeat family last, and keeps a clean contextual hint before the generic family for an unmatched one. `cloudflare-ai-chat.js` no longer emits `followup_question_ar` (the 💬 line's source), so the current scene's own level-validated question is the only one appended. Glosses already read «اسمي …» (no «أنا اسمي» in the repo). Tests: `answerBank` (bank clean/coverage/ordering/name), `shippedGermanStrings` (openers + starter phrases, 0 corrections), `germanCheckerGolden` +21 du/Sie goldens, `turnGuard` cross-scenario isolation, `e2e/greetingsReplay.spec.ts` replays the owner's session (no false correction; one capital `G`, no added period; non-empty sheet, no café words). Gate **VERIFY OK 16/16** in 725 s. |
| 2026-11-07 | live chat: deterministic corrections, context-valid hints, question-bounded turns | **A wrong sentence is now corrected by local rules before the model sees it, the card shows both full sentences with every error and an Arabic reason, suggestions must answer the last AI line, and every A0–A2 turn ends with one answerable question; no route, table, dependency or provider change.** `src/lib/conversation/germanChecker.ts` checks meaning traps (Gift/Geschenk, bekommen/werden), noun/proper-name capitals, sentence-start capitals, greeting comma, ie/ei, ß/ss, articles (gender/case/possessive, mass nouns), plural hints and question punctuation; its 305-noun/585-word lexicon is generated from `content-snapshot.json` + a curated supplement by `scripts/build-german-lexicon.mjs` (`npm run build:lexicon`). `useLiveConversation.sendTurn` runs it BEFORE the single `/ai/turn` call, merges only the model's fallback into a full sentence, persists the whole learner sentence + whole correction, and shows «أحسنت» only for a correct sentence. `germanDiff.ts` paints red/green character changes (the backward LCS merge had reversed text inside every run — regression test `tests/germanDiff.test.ts` **6**). `suggestionGuard.ts` rejects hints whose topic anchor is absent and requires an answer-shaped line after a question; the sheet instruction is «رتّب الكلمات لتبني الجملة». The worker appends one scene question when an A0–A2 reply does not end with one (`guardTrailingQuestion`, logged `ai_turn_trailing_question`). The header progress dashes carry the `N/M` label; the card sits above the dock at 390×844 (shots in `.tmp`, not committed). Tests: `germanCheckerGolden` **141** (≥30 inputs per A0/A1/A2 + no-fetch + praise-only-when-correct), `suggestionGuard` **9**, `germanDiff` **6**, `turnGuard` additions, full suite **2829**. Gate **VERIFY OK 16/16** in 762 s. **Deployed:** Pages `a1bb59aa-…` (source `95f327e`, entry `index-CwoHfIVI.js`, lazy `LiveConversationScreen-81tNUWQg.js`; rollback `35a7ae7b-…`) and worker `3afaa92c-…` (rollback `dd23b2ac-…`; `/health` storage ok, admin 401, `/crypto/health` unchanged). |
| 2026-11-07 | ten-unit path from the owner's approved list | **The unit map is now the owner's 10 units, in path order, with practice-only outcome lines; no route, endpoint, table or dependency changed.** `src/lib/units/units.ts` now holds «أول كلماتك» (6), «من السفارة إلى ألمانيا» (5), «أوراقك ومعاملاتك» (4), «بيت جديد» (4), «صحتك ومواعيدك» (5), «العمل والناس» (4), «في المكتب» (5), «التدريب والاعتراف بشهادتك» (6), «مقابلات العمل» (5), «محادثة بأسلوب الامتحان» (5). All 49 served scenarios stay in exactly one unit (gate 49/49); every outcome line says «في هذه الوحدة تتدرّب على …» and the B2 line says the exam-style talk is training only and grants no certificate. One deliberate move from the owner's draft: `patient_conversation_basics` goes from unit 6 to unit 5 because its openers are the learner speaking as a patient («Mir ist nicht gut…»), not a work/small-talk scene. `buildUnitProgress` now exposes `skipped` for units below the placement level; `/app/library` keeps them open and labels them «تخطّيتَ» (nothing is locked behind the starting point, soft lock still starts only after the next unit). Migration is unchanged: completed scenario ids recompute unit progress, level and XP are untouched, and the recommendation still continues started-but-unfinished first. Tests: `tests/units.test.ts` (10 units, 4–6 each, new ids/order, skipped/open behavior, paywall boundary) and `e2e/firstRun.spec.ts` A1 seed list updated. Deployed Pages `5c63e575-…` (source `19b431a`, entry `assets/index-BnLPxd6G.js`; `/`, `katzuai.com` and `/sw.js` 200; production smoke 2 passed / 2 skipped); rollback `b914e4ba-…`; worker unchanged. |
| 2026-11-07 | guided unit path + composed sessions + goal-only signup | **The path is now one vertical unit ladder and the learner never picks what comes next.** `src/lib/units/units.ts` partitions the 49 worker-served scenarios into 9 ordered units (A1→B2, checkpoint last, 5 goal tags); `src/lib/units/progress.ts` holds `recommendScenario` (continue → next → checkpoint), `stageFor` (study→with help→solo), `composeSession` (due review max 10 → next stage → optional second solo scene), `nextPlanStep` and `sessionOutcomeOffer` (test-out >85 / repeat with help <50). `/app/library` renders the unit map: current unit expanded, others collapsed with `N من M`, future units dimmed+locked, one level card (percent ring + exact ability copy), no level selector and no «41 موقفاً». The CTA is one composed session with its preview and total minutes, plus «جلسة مجانية N من 3»; review stays capped at ten with the backlog in small text. `/session-report` auto-advances after 2 s with «ليس الآن», asks ease once (سهلة/مناسبة/صعبة → `lastSessionEase`) and surfaces the test-out/repeat card. `/scenario/:id/live` runs at the profile level; the ⋯ sheet offers three current-unit topics + «فاجئني» and no difficulty control. `/onboarding` is one question («ما هدفك من الألمانية؟», 5 choices) that reorders units inside a level only. `scripts/audit-unit-coverage.mjs` is the CI `unit coverage` step. Tests: `tests/units.test.ts` 20, rewritten `tests/trailOrdering.test.ts`, `tests/onboarding.test.ts`, `journeyLayoutProbe` (unit map, ≥3 cards at 390×844), `e2e/paywall.spec.ts` topic sheet; full gate **VERIFY OK 16/16** (795 s) with `--ci --e2e`. Deployed Pages `eff039c2-…` (source `4af08b2`, entry `assets/index-DesAHQkO.js`; rollback `4e9775c6-…`), worker untouched. **Owner-open:** confirm the unit partition and Arabic unit titles in `docs/OWNER-UNITS-REVIEW.md`. |
| 2026-11-06 | path screen: one primary action, one progression, rank on the profile | **`/app/library` now answers «what do I do now?» and the app has one progression system; no route, endpoint, table or dependency changed.** The screen dropped the rank card, the XP strip and the side timeline. Its structure: a slim header (name, Pro badge, daily-goal ring; the streak chip appears only when it is above zero), one full-width `trail-primary-cta` «تابع: [scenario] · [N] دقائق», a secondary 10-item review row with the backlog in small text («+120 في الانتظار»), then the CEFR journey — a level card with a ring and «N مواقف للمستوى التالي», a sticky A1/A2/B1/B2 bar whose future levels are dimmed and open the paywall, and compact 64 px scenario cards with the three evidence stages (دراسة · مع مساعدة · وحدك), «التالي» and «جديد». Rank/XP moved to `profile-rank-card` in `/app/profile`, where text «N / M XP» and the bar share `absoluteXpProgress` (800 XP → «800 / 1500 XP», `aria-valuenow="53"`, 0.53 fill); crossing a rank is celebrated once as `session-rank-up` on `/session-report`. New pure helpers: `src/lib/mission/scenarioMinutes.ts` (duration, 10-item review cap, backlog). Tests: `trailOrdering`, `scenarioMinutes`, updated `v33SimplifyPolish`/`interfaceContracts`, `journeyLayoutProbe` at 390×844 (one CTA, ≥3 cards above the fold, 130 reviews → 10, locked levels → paywall, profile XP/bar agreement), `banner`/`firstRun`/`skillSurfaces`; gate **VERIFY OK 15/15** (792.8 s) with `--ci --e2e`. Before/after 390×844 screenshots for new, mid-progress, 130-review and zero states in the gitignored `.tmp/trail-redesign/`. Deployed Pages `a10ab1b7-…` (source `35a4363`, entry `assets/index-BVLRTDPT.js`); worker untouched. **Owner-open:** the four level descriptions are proposed copy and the rank placement is a choice (`OWNER-CHECKLIST.md` §15). |
| 2026-11-05 | deploy record: served-opener gate | **Docs/scripts only; the bundle hash did not change.** Pages `7bfe14d6-eef2-420a-9164-f853bc8f4f11` (source `87997a4`, entry `assets/index-BuFoPzZ9.js` unchanged, `/` and `https://katzuai.com` 200); rollback `5c3e24c8-8183-4eaa-90d1-e85a701f502e` (source `0099ab4`). No worker deploy: `cloudflare-*.js` and the app bundle are byte-identical. |
| 2026-11-05 | served-opener coverage gate + owner review | **The missing half of V47 is now enforced, and the owner has a file to review the 227 new Arabic lines; no route, screen, endpoint, table or dependency changed.** V47's tests proved the committed fixture was translated, but the fixture is not the content the worker serves — the authored catalogue has 61 scenarios, the worker serves 49, and that split is what let 221 live openers render bare. `scripts/audit-opener-coverage.mjs` now fetches the worker's real `/scenarios` (3 attempts, 15 s timeout), applies the app's own trim + whitespace-collapse, and fails (exit 1) when any non-empty `initial_message_<level>` has no gloss or a gloss with no Arabic; an unreadable payload exits 2 rather than auditing zero and passing. It runs as the CI-only step `served opener coverage` in `scripts/verify.mjs`; `--offline`/`--fixture` audit the committed fixture. `tests/openerCoverage.test.ts` (8) covers misses, non-Arabic glosses, normalisation, both payload shapes, the fixture and the CI wiring. `docs/OWNER-OPENER-REVIEW.md` lists all 227 glosses German → Arabic by level with 18 flagged rows and suggested wording (6,138 B `OWNER-CHECKLIST.md` §13 points at it). Measured: **49 scenarios / 225 first messages / 0 missing** live and from the fixture. |
| 2026-11-05 | first-message Arabic coverage + pointer focus | **Every first message now renders its Arabic from the shipped map, and the reply-report buttons share one focus treatment; no route, screen, endpoint, table or dependency changed.** Root cause of «تعذرت الترجمة» on the A1 greeting: `openerGlosses.generated.ts` held only the 301 authored-catalogue openers (stale snapshot, «Frau Yilmaz»), while the worker served 49 scenarios / 223 distinct openers (including «Hallo! Ich bin Frau Meier, deine Nachbarin. Wie heißt du?»); 221 had no gloss. New durable `scripts/language-data/opener-ar-extra.json` (227 entries) is merged after the authored corpus by `scripts/build-language-data.mjs` (authored wins, same validation), giving **526 shipped openers / 457 glosses**, 0 unresolved tokens; `admin-worker/public/bundled-content.json` regenerated to match. `useLiveConversation.ts` and `StorySetupScreen.tsx` render a stored gloss immediately and otherwise show a short loading state with exactly one automatic retry before the honest message; neither path calls `/ai/translate`. The report outline was `:focus-visible` on the programmatically restored trigger after a pointer close — `useModalDialog.ts` now sets `data-pointer-focus` and `src/index.css` suppresses the ring until the next key press/blur. Tests: **`tests/firstMessageTranslation.test.ts` 6 passed** (1,484 cells across live practice, live real, catalogue, curriculum, story, mock exam, fallback; 1,484/1,484 translated, 526 distinct, zero `fetch` calls), `tests/reportFocus.test.ts` 4, `tests/contentCatalogue.test.ts` + `tests/adminContentManagement.test.ts` updated to treat the catalogue as a subset (no hard-coded 223/892). |
| 2026-11-05 | labelled per-reply report control | **The report action is now findable, and nothing else changed.** It was a 14 px unlabelled `Flag` sharing the meta row with speaker/slow/ترجمة — present under every AI bubble, but no learner could be expected to guess it. `ConversationMessage.tsx` now renders it on its own line at the bottom of every Katzu bubble with the visible words «أبلغ عن رد سيئ», same `onReport` handler, same confirmation sheet and same `POST /consent/conversation/report`; no route, endpoint, table, dependency or gate changed. The 390 px evidence rig is `e2e/reportActionShots.playwright.config.ts` + `e2e/shots/reportActionShots.spec.ts` (images in `docs/agent/report-action/`). Verified: `tsc`, consent suites **28/28**, gate **VERIFY OK 14/14** (908.7 s) with e2e, production `LiveConversationScreen-CjozgZmU.js` (145,681 B) carries the label, and the prompt-mode service worker served the new entry after two reloads. |
| 2026-11-05 | conversation-review consent + per-reply report | **The learner now chooses whether practice text is stored, and can report one bad reply explicitly — no route, screen, table or dependency changed.** Settings gained the toggle pair with visible «مفعّل/متوقف» labels; the consent grant lives in KV and withdrawal hard-deletes that account's rows. A one-time bottom sheet after the first full live practice conversation (pure gate `src/lib/consent/prompt.ts`, 60-day suppression on no/close, never during a session or on a recovered report) calls `POST /consent/conversation`. `POST /consent/conversation/report` (`cloudflare-consent.js`) stores exactly one redacted exchange with `flagged=1`, `note='learner_report'`, `outcome='reported'`, gated by `CONVERSATION_LOGGING` but not by the global grant; the per-reply «أبلغ عن رد سيئ» button confirms before sending. Privacy text in app + `/help#privacy` + markdown twin gained the report sentence, `TRUST_VERSION` is `2026-11-05`. |
| 2026-11-01 | update-capable content path + «تحديث متاح» prompt (local only) | **Two operational changes, nothing live: the PWA asks before it reloads into a new bundle, and a live scenario row can be corrected through the Content Studio without the insert-only loader.** (1) Service-worker updates use `registerType: 'prompt'` (`vite.config.ts`), a hand-written registration in `src/main.tsx`, and `UpdatePrompt.tsx` + `src/lib/pwa/updatePrompt.ts`: an Arabic banner, a 30-min/visibility check, a dismissed prompt re-asks on next open, and `LiveConversationScreen` holds the reload while a conversation is in progress so the chat is not discarded. The built `dist/sw.js` (8883 bytes) has no top-level `skipWaiting()` and only waits for `SKIP_WAITING`; `registerSW.js` is no longer emitted. (2) `cloudflare-admin.js` bridges `/admin/api/content-studio/*` to `handleContentAdminRequest` as actor `content-loader` under the same bearer check, throttle and `no-store`; the studio's undo gained `contractRow`, because an audit `before_state` from `SELECT *` carries the legacy `sequence_order` and undo had rejected it as an unknown column (49/49 real local undos returned 409 before the fix). `scripts/load-content-updates.mjs` (dry run / `--commit` / `--undo=<manifest>`) updates only ids that are already live, refuses to create rows, refuses while any draft exists, keeps live `banner_url`, and writes a manifest with before/after/audit uids/backup. `scripts/verify-content-update-local.mjs` proves it against a real local D1 seeded from `backups/pre-content-v2/content.sql`: **28/28**, 49 rows / 327 fields, commit matched the catalogue column-for-column, the 12 new ids stayed absent, `/scenarios` correct, undo restored every field. Tests: `tests/loadContentUpdates.test.ts` **17**, `tests/contentStudio.test.ts` **33**, `tests/updatePrompt.test.ts` **4**, `tests/pwaOffline.test.ts` **16**. Production is unchanged: the 12 scenes stay out and the 49-row UPDATE still needs the owner's `CONTENT-LOAD-AUTHORIZED` line plus an amendment to §3's insert-only wording. |
| 2026-11-01 | scenarios v2 authored locally, single source | **Conversation content now has one authoring source and passes the level contract; the AI router, admin panel, routes, screens, endpoints, tables and dependencies are untouched — nothing is live.** `docs/content/catalogue/scenarios-catalogue.json` holds **61** scenarios (49 existing + 12 new: `jobcenter_termin`, `apotheke`, `handyvertrag`, `kita_elterngespraech`, `notruf_112`, `nahverkehr_ticket`, `integrationskurs_anmelden`, `arzttermin_telefon`, `paket_abholen`, `polizei_fundbuero`, `zahnarzt`, `sprachcafe`), each with A0–B2 openers, Arabic, `<Rolle> katze` persona, kebab-case icon, category and `sequence_order` 1..61. `scripts/apply-content-catalogue.mjs` derives the snapshot, positional Arabic corpus and gloss file; `scripts/build-language-data.mjs --offline` regenerated the bundle and worker opener maps (**301 openers, 457 tokens, 0 unresolved**). Two defects were fixed rather than accepted: 29 A0 openers were written as the learner's line instead of the partner's, and 8 A0/A1 openers used forbidden past-tense markers. New Arabic/glosses are marked `needs_review` (**12 scenarios, 159 glosses**). Tests: `tests/contentCatalogue.test.ts` **21 passed**, `tests/turnGuard.test.ts` now runs a bare greeting against **all 61×5** openers, `tests/trailOrdering.test.ts` covers the 12 new stages. **UNPROVEN:** the live app — production D1 needs an owner `CONTENT-LOAD-AUTHORIZED` line, and the loader is insert-only (the 49 existing rows need updates that the gate forbids). |
| 2026-10-31 | content management in the new panel | **The separate `katzu-admin` panel can now create, edit, publish, discard, duplicate, soft-delete, restore and undo content without the old `/admin` bearer key, and a learner only ever sees a published row.** New `cloudflare-content-admin.js` adds five runtime-created tables (`content_drafts`, `content_audit`, `content_trash`, `content_backups`, `content_reviews`) — no learner table or query changed. Every route is under `/internal/admin/content/*` over the existing Service Binding, with the token, 120/min limit and 401-before-404 dispatch; `proxyToApi` forwards the Access-verified operator email as `x-admin-actor`. Edits are drafts with a field diff; Publish re-validates and writes the base row, audited with before/after; Delete copies the exact row (rowid included) to trash; Undo writes the stored before-state, NULLs included. Import (CSV/JSON) is dry-run-first and applies only drafts; export is JSON/CSV; the first write of each UTC day snapshots all four tables plus the D1 bookmark into `content_backups`. Bundled content (223 openers, 892 glosses) is a generated read-only asset (`scripts/build-bundled-content.mjs` → `admin-worker/public/bundled-content.json`); the panel stores A0/A1-first proofreading flags/notes/corrected Arabic and exports `katzu-bundled-corrections-v1`, never writing the bundle. Panel UI is plain DOM with `textContent` only. Tests: `tests/adminContentManagement.test.ts` **51 passed** (auth, validation, draft invisibility, exact undo/restore, dry-run no-op, CSV round-trip, one-draft saves, backup, bundled read-only), `tests/adminPanelContentUi.test.ts` **guards no `innerHTML` and every control is wired**. No route, screen, learner endpoint or dependency changed; old `/admin` stays live. |
| 2026-10-31 | greeting re-ask from the stored opener; Latin isolated in the card | **A bare «hallo» later in a scene can no longer fall back to «Wie geht es Ihnen?», a Latin letter inside the card's Arabic no longer paints as «ا», and the model's Arabic quote can no longer contradict the derived chip; no route, screen, endpoint, table, dependency or router change.** (1) `/ai/turn` now passes `sceneOpener` — the scenario's stored opener selected by scenario id + level (`resolveScenarioIdentity().openers` → `openerForLevel`, the worker twin of `src/lib/conversation/opener.ts`) — and `guardGreetingReply` takes the re-ask topic **only** from it. Reading the topic from joined assistant history stopped matching a stored opener after the first exchange, which is how the wellbeing line returned mid-scene; history (`sceneGerman`, read by `role` or `sender`) still drives off-topic detection and the du/Sie register. The fixed `RE_ASK` fallback now invites more content per level («Hallo! Bitte sagen Sie etwas mehr.» … B2) and never asks about wellbeing. (2) `ConversationMessage.tsx` wraps Latin runs in `<bdi dir="ltr">`, so «حرف l مضعّف» paints `l`. (3) The model's quote (`roastComment`) renders only when no derived chip exists. Tests: `tests/turnGuard.test.ts` **104 passed** (including a multi-turn `{ role, text }` route test whose history is not a stored opener), `tests/openerParity.test.ts` (worker and app ladder equal for every level), `tests/correctionCardRender.test.ts` **4 passed** (`renderToStaticMarkup`), plus `correctionWording`/`designSystem`/`launchSafety`/`v40ConversationA11y`/`openersStatic`/`openerHint` **127 passed**. `npx tsc --noEmit` clean; after shots regenerated at 360×740. Gate **VERIFY OK 14/14** (672.6 s, `--ci --e2e`). **UNPROVEN:** the signed-in scene turn and card — no owner session. **Deployed** worker version `862087cb-eeef-48c0-8467-d0bd721c35c3` (deployment `b3c5b2de-2314-488e-aa95-8cc2853b1d27`, rollback `e3f994ef-...`/`f219d5b3-...`) and Pages `bc807292-fc48-45bb-b398-ddd3710a8728` (source `a033b19`, rollback `f4c077c6-e339-4996-b155-3c678498dc39`); live `/health` 200 `storage:{d1,kv}`, `/crypto/health` 200 `ready:false`, `/internal/admin/health` and `/admin/api/affiliates` 401, `POST /ai/turn` and `/ai/lexeme` 401 signed out. |
| 2026-10-31 | correction card explanation derived | **The Arabic explanation can no longer contradict the chip: both come from `correctionCardCopy()` in `src/lib/conversation/correctionWording.ts`, which returns the label and the explanation from one classification.** Bug: on production `HALO` → `Hallo` showed «Schreibung: Doppel-l» while the model's explanation said to capitalise the first letter and quoted the H. Now a classified difference builds the explanation from its own kind; when case also differs it is named in the same sentence («حرف l مضعّف، واكتب الحرف الأول كبيرًا والباقي صغيرًا.»), and `caseDiffers()` aligns the inserted letter away so `halo` → `hallo` does not invent a case error. Model wording is used only for `fallback`. `tests/correctionWording.test.ts` **23 passed** (`HALO`, `halo`, `Halo`, case-only, fallback); `npx tsc --noEmit` clean; after shots regenerated at 360×740. No router, correction logic, `/ai/turn`, dependency or admin change. Gate **VERIFY OK 14/14** (741.5 s, `--ci --e2e`); **UNPROVEN:** the signed-in card — no owner session. **Deployed** Pages `e1db6dde-f870-487b-915a-ef809c43b070` (source `2439e3a`, Production/main), rollback `5b4c2b86-338a-4ad6-b25f-fb54e1de8fb9` (source `58a16f5`); live `https://katzuai.com` 200 with `assets/index-BHIvDiQs.js` / `assets/index-DDQd4ZBu.css` and the AppShell chunk's lazy `LiveConversationScreen-DDTyFU2n.js`, which carries the chip and both derived Arabic clauses. Worker untouched. |
| 2026-10-31 | correction card redesign | **The note under a learner's message now matches the bubble system and names the rule the learner actually broke; no route, screen, endpoint, table, dependency or AI prompt/schema changed.** Old card: full amber outline, 📌 chip, red strike, model-written `grammar_rule` shown verbatim — so `halo` → `hallo` was labelled «Groß- und Kleinschreibung», and a long German word overflowed the card. New: `kz-surface-subtle` on `rounded-control`, bubble padding, hairline edge + one success accent (corrected word + 2px start edge); neutral struck «قلت» and success «الصحيح» rows share a `w-11` label column; rule chip is neutral and derives from the two visible strings via `src/lib/conversation/correctionWording.ts` (case-only → capitalisation; one inserted repeated letter → «Schreibung: Doppel-l»; extra/dropped/substituted letter named; model rule only as fallback), not from `grammar_rule`. `tests/correctionWording.test.ts` **10 passed** (`halo`, `Halo`, `HALO`, `hallo`→no chip, substitution, fallback). Shots rig `e2e/correctionCardShots.playwright.config.ts` + `e2e/shots/correctionCardShots.spec.ts` wrote **6 PNGs** to `docs/agent/correction-card/` at 360×740 (before/after × one-letter, capitalisation, `Krankenversicherungsbescheinigung`), proving the old mislabel/overflow and the fix. `npx tsc --noEmit` clean, design audit + contrast green (4.52:1 tightest), `npm test` **171 files / 2429 tests**, gate **VERIFY OK 14/14** (691 s, `--ci --e2e`). **UNPROVEN:** the signed-in card — no owner session. **Deployed** Pages `c69c1ca4-9a49-44f6-9034-5200992cd3f4` (source `5d04a51`, Production/main), rollback `73b9768b-c9e0-4520-b1bb-f28579d32910` (source `203d050`); live `https://katzuai.com` 200 with `assets/index-Jlt9cfAM.js` / `assets/index-DDQd4ZBu.css`, and `LiveConversationScreen-BBR2dHO9.js` (182,181 bytes) contains `Schreibung: Doppel-` and `correction-card`. Worker untouched. |
| 2026-10-31 | greeting wire fix | **The greeting guard now actually reaches the scene in production; no route, screen, endpoint, table or dependency changed and the AI router is untouched.** Root cause: `workerClient.sendTurn` rewrites history to `{ role, text }`, but `/ai/turn` extracted scene text only from `history[].sender`, so `sceneGerman` was always empty live and `sceneTopicReAsk` never ran. `cloudflare-ai-chat.js` now reads `role` **or** `sender` with `text ?? content`, and `cloudflare-turn-guard.js` squashes held keys for greetings (`halo`, `hiii`, `halloooo`), accepts hello/hi/hey/moin/servus/guten tag and a lone emoji wave, and still shows the correction card; tolerance is greetings-only, never scene words. `tests/turnGuard.test.ts` posts the app's real payload plus a legacy `sender` case (**97 passed**), and a four-scene probe passed **44/44** variants (A1 airport, A2 café, B1 doctor, B2 job interview). Gate **14/14** (`--ci --e2e`, 717 s); CI `41180974785` green on `e8e722d`. **Deployed** as worker `e3f994ef-5524-44ef-95b9-f0fde2923baa` (deployment `f219d5b3-1ce4-4a3d-ad18-79e3023e8534`), rollback `808f1553-9a1a-4af4-bafd-817c62bbb10e`; raw bundle 753.22 → 753.91 KiB, gzip 178.45 → 178.67 KiB. **UNPROVEN:** the signed-in «hallo» reply — no owner session, and `/ai/turn` answers 401 without one. |
