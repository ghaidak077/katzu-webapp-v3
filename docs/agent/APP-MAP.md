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
├─ cloudflare-ai-router.js         # multi-provider pool + failover (defaults: Groq, Cerebras, NVIDIA, OpenRouter, Coarena)
├─ cloudflare-ai-providers.js      # owner-managed pool config (KV): disable defaults, custom gateways, keys
├─ cloudflare-admin.js             # admin dashboard + gated admin API (incl. AI Providers tab)
├─ cloudflare-analytics.js         # analytics ingest + retention
├─ cloudflare-content-schema.js    # additive column reconciliation (DB_SCHEMA)
├─ cloudflare-content-studio*.js   # content studio UI/tools
├─ cloudflare-crypto.js            # NOWPayments checkout/webhook (test mode)
├─ cloudflare-{hints,stt,writing,level-spec,turn-quality}.js
│
├─ tests/                          # 206 Vitest spec files (+ helpers/ for fakes)
├─ e2e/                            # 55 Playwright specs + harness.ts
├─ scripts/                        # 70 .mjs: verify/audit/load-curriculum + the static-site rig:
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
| `/welcome` | `auth/WelcomeScreen.tsx` | First-run greeting: one real exchange (German → Arabic → correction), then one signup action; no name field (editable in Profile) |
| `/signin` | `auth/SignInRoute` → `auth/SignInScreen.tsx` | **Google-only** sign-in; level picker A0–B2 (A0 = «تقدير أولي، سنضبطه بالمحادثة»). GIS readiness is observed on the button container (never a timer), `loading` is its own state with neutral copy, and a failed script is re-injected on retry; the CSP must allow `accounts.google.com/gsi/*` and COOP must stay `same-origin-allow-popups` — plain `same-origin` severs the popup. `tests/pwaOffline.test.ts` pins both |
| `/onboarding` | `onboarding/OnboardingScreen.tsx` | Intent/goal capture after signup |
| `/subscription` | `auth/SubscriptionRedemptionScreen.tsx` | Pro offer + activation-code redemption |
| `/placement` | `placement/PlacementScreen.tsx` | Placement test → level |
| Marketing & trust pages | (removed from the app) | Landing, topic pages, `/en/*` and `/trust/*` live on https://website.katzuai.com; old URLs `301` there via `public/_redirects`. `/demo` (removed) `301`s to `/welcome`. A static `public/404.html` answers unknown paths |

### Learner loop (`/app/*` and `/scenario/*`)
| Route | Screen | What it is |
|---|---|---|
| `/app/trail` (default tab) | `journey/JourneyHomeScreen.tsx` | Daily home: `اليوم N · الفصل i من j` over the chapter title, then a thin chapter bar with `k / n مشاهد`; one hero (160px reserved banner band from `sceneFor` — a content `banner_url` still wins — purple→black fallback while it loads, label + title 22/700, LTR German subtitle, minutes, **one** 52px filled action); a ghost review row capped at 10 and hidden when nothing is due; then `مهام اليوم` (3-segment strip + `0 / 3` on the header row, 48px rows, circular check, review batch not listed because grading an item completes it) |
| `/app/library` | `trail/TrailScreen.tsx` | The path: a header that greets by name and holds one streak chip (no «0 / 20» goal ring), one hero card for the next situation (Arabic title, LTR German subtitle, minutes, «دراسة ← مع مساعدة ← وحدك», one full-width «ابدأ» that starts the recommended stage), a slim review row with a capped badge, the free-session pill for free learners, and a **vertical unit map** — current unit open with `الوحدة N · name`, `k من n`, a thin bar and `A1 · xx%`; future units collapsed and dimmed+locked. Situations are timeline rows (done check / current play / number, Arabic title, German subtitle, minutes, 3-segment stage meter); tapping one opens a bottom sheet with the three stages (recommended preselected) whose button starts the scene. Each unit header carries a 56px rounded scene thumbnail (`trail-unit-thumb`, `opacity-60` when locked). No level selector, no rank, no per-row chips. |
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
| `/app/profile` | `settings/ProfileSettingsScreen.tsx` | Profile/settings, sign-out; rank + XP card (one calculation for text and bar), the `REF-` referral card and a separate partner-programme entry |
| `/partners` | `partners/PartnersScreen.tsx` | The signed-in partner link: `POST /affiliate/me` on mount, then the link + copy/share, three steps, a plain sample message and the fine print. Numbers come from the server, never a constant; loading/error/retry states |
| `/dev/system` | `dev/DesignSystemScreen.tsx` | Dev-build only design system |

- Tab router: `/app/:tab` maps `practice → Practice`, `progress → Progress`,
  `profile → Profile`, anything else → `Trail` (`toNavigationTab` in `App.tsx`).
- `/partners` is signed-in only (anonymous → `/signin`), unlike `/delete-account`, which must work
  without a session. The marketing half of the programme stays on the site at `/affiliate`.
- Auth gate: main tabs / learning sessions require sign-in (`App.tsx`); anonymous `/app/*`
  lands on `/welcome`.
- `MainTabsRoute` renders a flat tab bar, not a floating pill: `nav[data-testid="app-tabbar"]`,
  full-bleed on the bottom edge, `border-t border-kz-line` over `bg-kz-black/85 backdrop-blur-xl`
  (`GlassEffectContainer` left the bar on 2026-11-20). The active tab is accent icon + label; the other
  three are muted with a micro label; every target is `min-h-control` (≥44px); the lock badge is
  `data-testid="tab-lock-<tabKey>"`; the lock sheet is a sibling of the `nav`, never a child. The
  content keeps `nav height + safe area` bottom padding through `.kz-tab-scroll`.

---

## 4. Feature inventory (what exists, where the logic lives)

| Feature | Entry | Logic |
|---|---|---|
| Auth (Google ID token) | `/signin` | `features/auth`, verified server-side against `GOOGLE_CLIENT_ID` |
| Legacy demo migration | `/signin` | `lib/demo/migration.ts` folds pre-signup demo state into the account (`demoFlow.ts` only supplies the legacy state shape; the demo lesson itself was removed) |
| 2026-11-23 | Front door localised (B1, part 1) | **Two screens now render from the dictionary; no route, table, endpoint or dependency changed.** `/welcome` (19 → **0**) and `/signin` (31 → **0**) read `welcome.*`/`signin.*` keys in ar/en/id; `GoogleSignInButton`'s default label is dictionary copy, GSI's `locale` follows the UI language, the default display name is localised at write time, and `font-arabic` is applied only for Arabic so English/Indonesian use the body face. New `scripts/i18n-coverage.mjs` (`npm run i18n:coverage`) + `src/lib/i18n/coverage.json`: per-file Arabic counts grouped B1–B7, exit 1 when a batch marked done still renders Arabic. Measured **1,520 → 1,469**; `/onboarding` 48 and `/subscription` 47 stay open, and the `src/lib` copy tables (`GOAL_COPY`, `ARRIVAL_COPY`, `PREVIOUS_GERMAN_COPY`) are outside the scan — a known gap to close before any batch is marked done. Verified in the browser: English and Indonesian front doors render with zero Arabic. |
| 2026-11-19 | Tooling: three gaps that hid the truth closed | **No route, screen, table or dependency changed.** `scripts/docs-budget.mjs` (+ `npm run docs:budget`) is now the single source of the doc budgets the guard imports; `scripts/lint-arabic-gender.mjs` (+ `npm run lint:arabic`, `scripts/arabic-gender-allowlist.json`) scans authored Arabic for a feminine address the runtime guard never saw; `scripts/qa/objective-completion.mjs` (+ `npm run qa:objectives`) reads QA checkpoints per prompt version; `scripts/replay/replay-run.mjs` makes the replay resumable (`--plan`, merged captures, `--save`/`--history`, exit 2 = incomplete). New proofs: `e2e/consentRoundTrip.spec.ts` (grant written, survives reload, failed write leaves the switch off) and `tests/{arabicGender,qaObjectives,replayRun}.test.ts`. |
| 2026-11-18 | Coarena free-model failover | **One provider row, three free models, Gemini 3.8 Flash first.** `cloudflare-ai-router.js` adds `COARENA_FREE_MODELS` (`gemini-3-8-flash`, `gpt-6-luna`, `deepseek-v4-1-flash-1017`) and a `modelFallbacks` field on the `coarena` entry; `expandModelFallbacks()` turns that row into one walk unit per model (dashboard still shows one row per provider, because toggles and stored keys are per provider) and `getPoolHealth` reports those units. A 404/`model_missing`, 5xx, timeout or quota answer parks only the failed id in the ledger, so the next free model answers the same turn. No route, screen, table or dependency changed; learner `/ai/turn` still excludes Coarena until a pair passes the replay gate. Proven by `tests/aiRouter.test.ts` (expansion order, 404 → next model, parked primary skipped) and `tests/aiProviderConfig.test.ts`. **UNPROVEN:** live 402/404 failover against the real gateway (the stub proves the code path, not the remote answer). |
| 2026-11-17 | Coarena provider added | **The pool can now serve a second free gateway; no route, screen, table or dependency changed, and the learner turn is untouched.** `cloudflare-ai-router.js` adds `coarena` (`COARENA_API_KEYS`, base `https://coarena.ai/api/v1`, OpenAI format, free-tier model `gpt-6-luna`, tier `mid`, `rpd:null`) after OpenRouter and last in `PROVIDER_QUALITY_ORDER`. Because its pair is not in `DEFAULT_QUALITY_GATE_PASSES`, `orderPoolForChat` keeps it out of the model-first learner turn; it serves the tier-walk routes (translate, lexeme, hints, ask, writing) and fails over like any other entry. `scripts/coarena-smoke.mjs` proves the key/model/feedback round trip without printing the key (live: models 18, `gpt-6-luna` reply `OK` in 1.7 s, feedback HTTP 200). **UNPROVEN:** the replay quality gate for `coarena:gpt-6-luna` (needs a signed-in live replay). |
| 2026-11-18 | Learner Arabic is gender-neutral (prompt v11) | **No learner gender is collected, so no feminine second person.** `cloudflare-roleplay.js` adds one static prompt rule (address the learner with «من أين أنت؟» / «هل لديك…», never «أنتِ»/«ـكِ») and the check `arabicAddressesLearnerAsFeminine()` (`FEMININE_LEARNER_ADDRESS = /أنتِ|[\u0621-\u064A]كِ/u`) wired into `checkRoleplayReply` as reason `arabic_learner_gender` over `reply_ar` + `hint_ar` + `fix_reason_ar`; `ROLEPLAY_PROMPT_VERSION` 10 -> **11**. Only the diacritized forms are gated, so a neutral «أنت» still passes, and the persona may stay feminine («سعيدة»). Proven by `tests/roleplayTurn.test.ts` (g35 regression) + `tests/roleplayPlans.test.ts` (51 passed) and a live 5-turn `first_greetings` run with a male name (no `أنتِ`/`ـكِ`, `close` only after the learner's «Auf Wiedersehen!», 4/4 objectives). **Live:** worker `54a61d9a-…` answers `/health` with `roleplay_prompt_version:11` (2026-11-23). |
| Daily mission selection | Trail | `lib/mission/selectMission.ts`, `lib/mission/scenarioMinutes.ts`, `lib/utils/dailyMission.ts`, `checkIn.ts` |
| Path one-action layout | `/app/library` | `trail/TrailScreen.tsx` (header with one level line + streak chip, hero with minutes in its top row, a real 3-step bar and one filled «ابدأ» that starts the recommended stage, ghost review row (`N بانتظار`, cap only in its accessible name), flat free-session line, unit map: flat unit header (`الوحدة N · name` + `LtrCounter` `k / n` + chevron + one attached thin bar) over divider-separated timeline rows; one state per lesson — ✓ done / accent current («قيد التنفيذ» + `StageMeter` + minutes) / dim numbered upcoming, stage sheet on tap), `lib/units/{units,progress}.ts` (unit partition, recommendation, composition, `locked = index > current + 1`), `lib/progress/ranks.ts` (`absoluteXpProgress`, profile only) |
| Unit coverage gate | CI / `npm run verify` | `scripts/audit-unit-coverage.mjs` imports `src/lib/units/units.ts`; fails unless every served scenario is in exactly one unit |
| Journey/story context | Story→Live | `lib/journey/{story,practice,context,brief}.ts` |
| Live AI conversation | `/scenario/:id/live` | `useLiveConversation.ts`, `ConversationTranscript.tsx`, `ConversationDock.tsx`, `HintDock.tsx`, `lib/conversation/*`; ONE model call per turn returns reply + correction + hint + objective credits. Header shows the authored goal («مهمتك: …») and objective progress (`scenarioGoals.generated.ts`); the hint dock types/speaks a sentence, never sends it; no word bank, no suggestions sheet |
| AI partner persona/correction | server | `cloudflare-roleplay.js` (**prompt v11**, one call, server-side objective policing), plans + Arabic goals + objective anchors in `cloudflare-roleplay-plans.js` / `cloudflare-roleplay-anchors.js`; the route lives in `cloudflare-ai-chat.js`. **Every plan carries 4 objectives** since 2026-11-18 (`docs/OWNER-SCENARIO-GOALS.md`): the 3 scene goals plus `end_politely`, which the server credits only when the learner's own message contains a farewell, so the persona can never end the chat by itself. Every plan also declares `register` (`sie`/`du`) and `persona_gender` (drives the persona's Arabic forms); v10 adds the every-turn register lock, the one-scenario-detail-per-turn rule, and the farewell-timing/register-switch reply checks; v11 adds the neutral-Arabic rule and rejects feminine second person aimed at the learner (`arabic_learner_gender`) |
| Multi-provider AI + failover | server | `cloudflare-ai-router.js` (defaults: Groq, Cerebras, NVIDIA, OpenRouter, Coarena; owner-editable via admin); Workers AI `[ai]` fallback |
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
| Language matrix (UI × course) | Profile → «طريقة تعلّمي» (`features/settings/LanguagePreferences.tsx`) | `lib/i18n/languages.ts` (codes, direction, `available` per course), `languagePreference.ts` (device `localStorage`, DB-free), `strings.ts` (key dictionary ar/en/id; `translate()` falls back to Arabic), `LanguageProvider.tsx` (`<html lang/dir>`, `useT()`), `useLanguageProfileSync.ts` (device ↔ `users.uiLanguage/targetLanguage`). Server half: `cloudflare-ai-chat.js` `TURN_TARGET_LANGUAGES`/`TURN_NATIVE_LANGUAGES`/`resolveTurnLanguages`, and `native_lang`/`target_lang` on `/ai/turn`. **Dutch is defined but `available:false`/`shipped:false`** — no Dutch course content exists yet (`docs/plans/010-multilanguage-master-plan.md` §5). |
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
| `GET /health` | status only (`status`, `service`, `ready`, `fallback_only`, `maintenance`, `storage`) — **no** pool/provider disclosure. Since 2026-11-16 `ready` means a configured **pool** entry exists, and `fallback_only: true` says the worker can only ride the Workers AI last resort (it used to answer `ready:true` in exactly that state) |
| `GET /ai/health` | AI pool health |
| `POST /ai/turn` | the roleplay turn: one call returning `reply_de/-ar`, `understood_de`, `fix_reason_ar`, `objectives_done/total`, `close`, `hint_de/-ar`, plus a non-secret `meta:{provider,model,attempts,ms}` (2026-11-16; the flat `provider`/`model`/`attempts`/`elapsed_ms` stay for the existing debug label); objectives are credited only against the learner's own words; `502 AI_EMPTY_REPLY` when no reply survives the checks |
| `POST /ai/translate` | translation (can time out — client keeps text, offers retry) |
| `POST /ai/lexeme` | the last resort behind the shipped glossary: ONE model lookup per LEMMA, cached fleet-wide (KV, keyed by stem) and mirrored on the device. `{word, cefr_level}` → `{ar, pos, level, lemma, cached}`; `400` no word, `401` unauth, `429` throttled, `503/502` no provider (the card keeps its honest retry). Serves a cached lemma even with no provider key |
| `POST /ai/hints` | hint floor for the last AI message — quota-exempt from the trial SESSION counter, but has its OWN daily scope `hints` (free 30 / Pro 120 per day, 6/min); over the limit it answers **200 with an empty `hints` array**, never an error; the client shows a short non-error note (`NO_HINT_MESSAGE_AR`, `data-testid="hint-empty"`) and keeps the request button — it never dresses a stored line as the persona's sentence |
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
| an AI endpoint or prompt | `cloudflare-unified-worker.js` + `cloudflare-ai-chat.js`; the conversation prompt itself is `cloudflare-roleplay.js` (docs/agent/ROLEPLAY-PROMPT.md) |
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
- **Document budgets, before writing:** `npm run docs:budget` (`node scripts/docs-budget.mjs`) prints
  every `docs/**/*.md` size, cap and headroom, tightest first; `--json` for machines, exit 1 when one
  is over. The numbers live in that script and `tests/agentDocs.test.ts` imports them, so the printout
  and the gate cannot disagree.
- **Arabic gender lint:** `npm run lint:arabic` (`node scripts/lint-arabic-gender.mjs`) scans authored
  content (`docs/content`, `src`) for a diacritised feminine address (`أنتِ`, `ـكِ`); the regex is
  asserted equal to the runtime guard's in `tests/arabicGender.test.ts`. An intentional hit (a quoted
  line spoken by a woman) goes in `scripts/arabic-gender-allowlist.json` with the reason.
- **Per-objective completion:** `npm run qa:objectives` (`node scripts/qa/objective-completion.mjs`)
  reads QA checkpoints and prints, per prompt version and scenario, how many sessions finished each
  objective. An objective nobody reached is a wording problem in that scene, not a learner problem.
- **Replay, resumable:** `npm run qa:replay -- <capture.json>... [--plan|--save]`, `--history`
  (`scripts/replay/score-replay.mjs` + `replay-run.mjs`). `--plan` lists the uncaptured cases in
  ~9 s-paced batches; several captures merge by case id; exit 0 green, 1 red, 2 incomplete.
- Tiers (T0 per edit → T1 per item → T2 final) are defined in `AGENTS.md` §5.
- Every fixed bug gets a regression test; every pure rule gets unit tests.
- Orientation before work: `npm run session:start` prints the ledger NEXT, §9 targets, MEMORY §A
  facts, git state and the OPEN ITEMS backlog in ~80 lines (`scripts/session-start.mjs`, guarded
  by `tests/sessionStart.test.ts`).

---

## 9. Environments, deploy targets and IDs (volatile — re-verify before quoting)

**Chat-engine revert (2026-11-11).** All 27 chat-engine commits `95f327e..ffc6c7d` are reverted in `4dae8df`; `src/`, the worker and `wrangler.toml` are byte-identical to boundary `a259883` (script engine, AI roleplay, plans, answer bank, rule-first correction checker, hint dock and eval/QA harness gone; `ROLEPLAY_MODEL` removed; the old hint sheet, turn guard and level fallback lines are back). Kept and untouched: consent + endpoint, bad-reply report + route, opener translations + gate, unit path/onboarding/session/report fixes, affiliate, trust text, SEO, website. Live: Pages `61b78993-5929-45e9-8162-c323b48d9f68` (source `4dae8df`, entry `assets/index-BnLPxd6G.js` = the local build except one empty env key) and worker `a57a74ba-0242-4993-802f-549809394c95`. **Go forward again:** `git checkout pre-chat-revert-2026-11-11` (also branch `wip/pre-chat-revert`, source `ffc6c7d`), merge it, redeploy worker `8a82c4a4-a359-4188-8c25-95a9289ef2bf`; Pages rollback target `b65b388a-75cc-43dc-83aa-adc08937c508`.

| Thing | Value |
|---|---|
| Repo | `github.com/ghaidak077/katzu-webapp-v3` (SSH/https), branch of record: **`main`** (`launch-hardening` still exists but V27+ merged onward; `origin/HEAD` → `main`) |
| App (Pages) | `https://katzu-webapp-v3.pages.dev` (custom domain `https://katzuai.com`). **Builds from git on every push to `main`, so a deployment id changes even when the bundle does not** — an id is not an identity here. Record instead the **source SHA + the entry hash**, and read any id on demand with the one command below. |
| App (Pages) — identity to record | **2026-11-20, second pass:** source `5d19bad` (practice-home rows one state each), deployment `74addfc9-04eb-4366-9add-0d47127ee786`, entry `assets/index-BEaZS6ly.js`, screen chunk `assets/TrailScreen-8PTK5bWS.js` (grep `trail-sheet-start` = 1). Superseded: `a88add8` (first pass), deployment `55a750e1-e9e5-45b7-b6e3-3f47ad69f3f1`, entry `assets/index-jEyj3rTh.js`, chunk `assets/TrailScreen-XgkifJu_.js`, `/`, `https://katzuai.com` and `/sw.js` 200. **The entry hash is not proof of a screen:** screens are lazy chunks and the entry carries no `data-testid` and no Arabic, so verify the rendered screen by grepping its chunk (`curl -s https://katzuai.com/assets/TrailScreen-<hash>.js \| grep -c trail-sheet-start`); the chunk name comes from `assets/AppShell-*.js`. Read the entry live: `curl -s https://katzuai.com/ \| grep -o 'assets/index-[^"]*\.js' \| head -1`. Every docs-only push since mints a new id over a byte-identical bundle. |
| App (Pages) — rollback | **Current rollback target:** `45c9b552-c520-4254-8092-e2ffbfc03980` (source `0fa0069`, the deployment before the practice-home second pass). Otherwise it is the previous production deployment in the same list, which carries its own source SHA and date; one read command returns id, source, branch and time: `npx wrangler pages deployment list --project-name=katzu-webapp-v3 --json`. Rollback: `npx wrangler pages deployment rollback <id> --project-name=katzu-webapp-v3`. Verified bundle hashes: source `a88add8` → `index-jEyj3rTh` (live, 2026-11-20), `3037c4e` → `index-4slWyIKP` (2026-11-19) and `0310e88` → `index-4slWyIKP` (prompt v10, measured 2026-11-18); the 2026-10 hashes differ per deploy and are not restated here. |
| App (Pages) — history before 2026-11 | Deployment ids for 2026-10-28…11-18 are in `docs/agent/ARCHIVE-AGENT-STATE.md` and still resolvable with the same list command; they are history, not a rollback plan. |
| App (Pages) — verified surfaces | `robots.txt` (ten crawlers, `Content-Signal` in the wildcard group), root `sitemap.xml`, shell `lang="ar"` + canonical + hreflang, `/sw.js` 200, entry CSS `assets/index-*.css`. Last checked 2026-11-19: `/` 200, entry `index-4slWyIKP.js`. |
| Worker | `https://katzu-test.ghaidakalosh008.workers.dev` (`/health` → 200; `/` → 404, expected). Live version `54a61d9a-73a0-44b7-aeee-d3c9c564614d` (2026-11-23, source `e1519a7`: interface/course language matrix; `/health` 200 `storage:{d1,kv}` + `roleplay_prompt_version:11`, `/crypto/health` 200 `ready:false`, `/admin/api/stats` 401; rollback `89a1a55e-783b-4023-92f1-e17db916cf7d`), then `89a1a55e-783b-4023-92f1-e17db916cf7d` (2026-11-18, source `0310e88`: prompt v10 register + persona gender + learner-first farewell + one persona detail per turn; `/health` 200 `storage:{d1,kv}`, `/crypto/health` 200 `ready:false`, `/admin/api/stats` 401; rollback `05d225ef-d2a2-46bb-a2c1-b6b16e3b2eeb`), then `05d225ef-d2a2-46bb-a2c1-b6b16e3b2eeb` (2026-11-16, source `7c83ffa`: prompt v9, same-model-first router, `AI_CAPACITY_EXHAUSTED` instead of a weak fallback, `meta{provider,model,attempts,ms}`, `/health` `ready|chat_ready|fallback_only`; rollback `d99eeecc-f1fb-4b5f-8cc7-2828b0c02959`), then `d99eeecc-f1fb-4b5f-8cc7-2828b0c02959` (2026-11-16, prompt v8; rollback `b4214794-bf88-4a6e-925c-8c50bef95a6f`), then `e0f16c8d-7bb9-4ef7-bf13-1fa67de23bfd` (2026-11-13, the roleplay chat: one call per turn, prompt v7; rollback `a57a74ba-0242-4993-802f-549809394c95`), then `dd23b2ac-46b0-4b42-a20b-4a41be0cc739` (2026-11-05T06:47Z, first-message opener glosses; wrangler 4.136 prints no deployment id for this version): the learner's conversation-review grant (`/consent/conversation`, 401 signed out) and `POST /consent/conversation/report` (one redacted bad-reply exchange; GET answers 405, signed-out 401), with withdrawal and account deletion hard-deleting the account's stored turns and its KV grant; rollback `e98031d5-9932-4093-a7a9-7ba4ab827b0d` (2026-11-04T07:02Z, source `580e522`, the consent + labelled-report batch), then `70daf981-98bf-49eb-9722-a4b533ac017f` (deployment `798fd12a-1c44-49c0-b13b-cb636b2df49d`, 2026-11-04T05:52Z, the first consent deploy), then `625986fd-46da-4c5e-a5ff-67b3925e260c` (deployment `5884fb31-6fa2-43f3-b02d-c4ae4c5f3bca`, 2026-10-31T13:00Z, source `ed8255c`): the content studio's token-gated `/internal/admin/content/*` (drafts, publish, undo, import/export, backup; **401** unauthenticated) on top of the scene-aware greeting guard that reads the scene text by `role` **or** `sender` (the app sends `{ role, text }`), tolerates greeting typos/variants, and re-asks the scenario's **stored** opener selected by scenario id + level (`sceneOpener` -> `openerForLevel`), so a later bare `hallo` can no longer fall back to «Wie geht es Ihnen?»; history still drives only off-topic and du/Sie, on top of observer-only telemetry; `/ai/lexeme` is live (missing-word 400, unauth 401), `/health` 200 with `storage:{d1,kv}`, `/affiliate/me` 401 signed out, `/affiliate/ref` 400 malformed / 404 unknown, `/admin/api/affiliates*` 401, `/internal/admin/health` 401 with no and a bogus bearer, `/ai/turn` 401 unauth, cron `17 4 * * *` **verified live at 04:17:37 UTC on 2026-10-31** (`[sweep]` + `[sweep:telemetry]` + `[affiliate]`, `outcome: ok`); rollback `862087cb-eeef-48c0-8467-d0bd721c35c3` (deployment `b3c5b2de-2314-488e-aa95-8cc2853b1d27`, 2026-10-31, source `a033b19`, the greeting guard), then `e3f994ef-5524-44ef-95b9-f0fde2923baa` (deployment `f219d5b3-1ce4-4a3d-ad18-79e3023e8534`, 2026-10-31, source `e8e722d`, the wire fix), then `808f1553-9a1a-4af4-bafd-817c62bbb10e` (2026-10-31, source `4ba4514`, the greeting guard before the wire fix), then `6a6db52d-a581-45b1-94c7-ef5b5e9983ea` (2026-10-30, source `053d882`), then `b33136fa-dd5d-45b5-bad5-fabbbfbdca72` (source `73dad45`), then `4d20d59e-562a-43f3-a4e2-00a99da8a507`, then `6860fa2f-bfca-44d7-8fc3-870a87aec926` (source `e9aa028`), then `998873c6-d773-4bb5-9ec5-2c548e550b0f` |
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

- **Scene art is placeholder** — `public/scenes/*.jpg` (13 files) are flat-gradient images of ~2 KB, not
  photographs, and `sceneFor` maps every scenario to one of them. A scene card therefore reads as an
  empty frame; real photography is a content task (generated art was attempted on 2026-11-19 and failed
  on image-provider balance).
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
ai_provider_usage
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
| 2026-11-13 | chat restored: one AI call, server-credited objectives, hint dock | **The practice conversation is the roleplay engine again, with the brief's deltas; no route, table, unit, consent, report, affiliate or website change.** `cloudflare-roleplay.js` prompt v7 returns reply + correction + hint + objectives in one JSON; `cloudflare-roleplay-anchors.js` gates a credit on the learner's own words, so the persona can never mark an objective done and `close` needs all of them. The screen adds «مهمتك: …» and progress, and drops the word bank and the «اقتراح لردّك» sheet for the hint dock + «اطلب تلميحاً». Gate **VERIFY OK 16/16** (942.8 s; browser suite 175 passed / 11 skipped), production smoke 2 passed / 2 skipped. **Deployed** worker `e0f16c8d-7bb9-4ef7-bf13-1fa67de23bfd` (rollback `a57a74ba-…`) and Pages `45c05ab2-dbd0-4d77-ac6c-2cbf470e7421` (source `459ef3f`, entry `assets/index-DvLE3Ihx.js`, rollback `e9d0058f-…`). **UNPROVEN:** the eval bar for v7 — the provider's daily token cap stopped the run (see AGENT-STATE OWNER-OPEN CHAT-EVAL-1), so v6's 30/32 judged is the last evidence. |
| 2026-10-31 | greeting re-ask from the stored opener; Latin isolated in the card | **A bare «hallo» later in a scene can no longer fall back to «Wie geht es Ihnen?», a Latin letter inside the card's Arabic no longer paints as «ا», and the model's Arabic quote can no longer contradict the derived chip; no route, screen, endpoint, table, dependency or router change.** (1) `/ai/turn` now passes `sceneOpener` — the scenario's stored opener selected by scenario id + level (`resolveScenarioIdentity().openers` → `openerForLevel`, the worker twin of `src/lib/conversation/opener.ts`) — and `guardGreetingReply` takes the re-ask topic **only** from it. Reading the topic from joined assistant history stopped matching a stored opener after the first exchange, which is how the wellbeing line returned mid-scene; history (`sceneGerman`, read by `role` or `sender`) still drives off-topic detection and the du/Sie register. The fixed `RE_ASK` fallback now invites more content per level («Hallo! Bitte sagen Sie etwas mehr.» … B2) and never asks about wellbeing. (2) `ConversationMessage.tsx` wraps Latin runs in `<bdi dir="ltr">`, so «حرف l مضعّف» paints `l`. (3) The model's quote (`roastComment`) renders only when no derived chip exists. Tests: `tests/turnGuard.test.ts` **104 passed** (including a multi-turn `{ role, text }` route test whose history is not a stored opener), `tests/openerParity.test.ts` (worker and app ladder equal for every level), `tests/correctionCardRender.test.ts` **4 passed** (`renderToStaticMarkup`), plus `correctionWording`/`designSystem`/`launchSafety`/`v40ConversationA11y`/`openersStatic`/`openerHint` **127 passed**. `npx tsc --noEmit` clean; after shots regenerated at 360×740. Gate **VERIFY OK 14/14** (672.6 s, `--ci --e2e`). **UNPROVEN:** the signed-in scene turn and card — no owner session. **Deployed** worker version `862087cb-eeef-48c0-8467-d0bd721c35c3` (deployment `b3c5b2de-2314-488e-aa95-8cc2853b1d27`, rollback `e3f994ef-...`/`f219d5b3-...`) and Pages `bc807292-fc48-45bb-b398-ddd3710a8728` (source `a033b19`, rollback `f4c077c6-e339-4996-b155-3c678498dc39`); live `/health` 200 `storage:{d1,kv}`, `/crypto/health` 200 `ready:false`, `/internal/admin/health` and `/admin/api/affiliates` 401, `POST /ai/turn` and `/ai/lexeme` 401 signed out. |
| 2026-10-31 | correction card explanation derived | **The Arabic explanation can no longer contradict the chip: both come from `correctionCardCopy()` in `src/lib/conversation/correctionWording.ts`, which returns the label and the explanation from one classification.** Bug: on production `HALO` → `Hallo` showed «Schreibung: Doppel-l» while the model's explanation said to capitalise the first letter and quoted the H. Now a classified difference builds the explanation from its own kind; when case also differs it is named in the same sentence («حرف l مضعّف، واكتب الحرف الأول كبيرًا والباقي صغيرًا.»), and `caseDiffers()` aligns the inserted letter away so `halo` → `hallo` does not invent a case error. Model wording is used only for `fallback`. `tests/correctionWording.test.ts` **23 passed** (`HALO`, `halo`, `Halo`, case-only, fallback); `npx tsc --noEmit` clean; after shots regenerated at 360×740. No router, correction logic, `/ai/turn`, dependency or admin change. Gate **VERIFY OK 14/14** (741.5 s, `--ci --e2e`); **UNPROVEN:** the signed-in card — no owner session. **Deployed** Pages `e1db6dde-f870-487b-915a-ef809c43b070` (source `2439e3a`, Production/main), rollback `5b4c2b86-338a-4ad6-b25f-fb54e1de8fb9` (source `58a16f5`); live `https://katzuai.com` 200 with `assets/index-BHIvDiQs.js` / `assets/index-DDQd4ZBu.css` and the AppShell chunk's lazy `LiveConversationScreen-DDTyFU2n.js`, which carries the chip and both derived Arabic clauses. Worker untouched. |
| 2026-10-31 | correction card redesign | **The note under a learner's message now matches the bubble system and names the rule the learner actually broke; no route, screen, endpoint, table, dependency or AI prompt/schema changed.** Old card: full amber outline, 📌 chip, red strike, model-written `grammar_rule` shown verbatim — so `halo` → `hallo` was labelled «Groß- und Kleinschreibung», and a long German word overflowed the card. New: `kz-surface-subtle` on `rounded-control`, bubble padding, hairline edge + one success accent (corrected word + 2px start edge); neutral struck «قلت» and success «الصحيح» rows share a `w-11` label column; rule chip is neutral and derives from the two visible strings via `src/lib/conversation/correctionWording.ts` (case-only → capitalisation; one inserted repeated letter → «Schreibung: Doppel-l»; extra/dropped/substituted letter named; model rule only as fallback), not from `grammar_rule`. `tests/correctionWording.test.ts` **10 passed** (`halo`, `Halo`, `HALO`, `hallo`→no chip, substitution, fallback). Shots rig `e2e/correctionCardShots.playwright.config.ts` + `e2e/shots/correctionCardShots.spec.ts` wrote **6 PNGs** to `docs/agent/correction-card/` at 360×740 (before/after × one-letter, capitalisation, `Krankenversicherungsbescheinigung`), proving the old mislabel/overflow and the fix. `npx tsc --noEmit` clean, design audit + contrast green (4.52:1 tightest), `npm test` **171 files / 2429 tests**, gate **VERIFY OK 14/14** (691 s, `--ci --e2e`). **UNPROVEN:** the signed-in card — no owner session. **Deployed** Pages `c69c1ca4-9a49-44f6-9034-5200992cd3f4` (source `5d04a51`, Production/main), rollback `73b9768b-c9e0-4520-b1bb-f28579d32910` (source `203d050`); live `https://katzuai.com` 200 with `assets/index-Jlt9cfAM.js` / `assets/index-DDQd4ZBu.css`, and `LiveConversationScreen-BBR2dHO9.js` (182,181 bytes) contains `Schreibung: Doppel-` and `correction-card`. Worker untouched. |
| 2026-10-31 | greeting wire fix | **The greeting guard now actually reaches the scene in production; no route, screen, endpoint, table or dependency changed and the AI router is untouched.** Root cause: `workerClient.sendTurn` rewrites history to `{ role, text }`, but `/ai/turn` extracted scene text only from `history[].sender`, so `sceneGerman` was always empty live and `sceneTopicReAsk` never ran. `cloudflare-ai-chat.js` now reads `role` **or** `sender` with `text ?? content`, and `cloudflare-turn-guard.js` squashes held keys for greetings (`halo`, `hiii`, `halloooo`), accepts hello/hi/hey/moin/servus/guten tag and a lone emoji wave, and still shows the correction card; tolerance is greetings-only, never scene words. `tests/turnGuard.test.ts` posts the app's real payload plus a legacy `sender` case (**97 passed**), and a four-scene probe passed **44/44** variants (A1 airport, A2 café, B1 doctor, B2 job interview). Gate **14/14** (`--ci --e2e`, 717 s); CI `41180974785` green on `e8e722d`. **Deployed** as worker `e3f994ef-5524-44ef-95b9-f0fde2923baa` (deployment `f219d5b3-1ce4-4a3d-ad18-79e3023e8534`), rollback `808f1553-9a1a-4af4-bafd-817c62bbb10e`; raw bundle 753.22 → 753.91 KiB, gzip 178.45 → 178.67 KiB. **UNPROVEN:** the signed-in «hallo» reply — no owner session, and `/ai/turn` answers 401 without one. |
| 2026-11-15 | scenario-one real-user pass: honest copy, fixed opener Arabic | **Four defects found by driving scenario one (`airport_arrival`) as five learner types are fixed; no route, screen, endpoint, table, dependency or prompt changed.** (1) The first Arabic a learner reads was ungrammatical — «هل ينقصك حقيبتك؟» ("does your suitcase lack you?") — in the hand-written override map for the offline and served openers; now «هل حقيبتك مفقودة؟» / «هل أمتعتك مفقودة؟», and `scripts/language-data/opener-ar-extra.json` + the generated maps + `admin-worker/public/bundled-content.json` were rebuilt so all three sources agree. (2) The report told a learner who never opened a hint «أكملنا الجلسة بمساعدة تلميحاتي», because `PRACTISING` (no independent session yet) is not hint use; `src/lib/report/outcomeLine.ts` makes the line follow `assistedSentences`. (3) A `200 {hints: []}` — the documented empty answer — rendered as the red failure «تعذّر الرد»; the hook now sets `hintEmpty` and the screen shows a quiet note instead of an error. (4) A wrong verb form was labelled «تصحيح صغير» and stayed collapsed; `src/lib/conversation/correctionPresentation.ts` opens the card and drops "small" for `grammar`/`meaning` errors, while spelling-only stays collapsed. Tests: `tests/outcomeLine.test.ts` 4, `tests/correctionPresentation.test.ts` 3, `tests/openerHint.test.ts` + `tests/adminContentManagement.test.ts` updated (new Arabic, regenerated bundle). **Deployed** 2026-11-15: worker `5004cffe-8a75-4cd4-8f55-502fda397e0e` (rollback `ef243498-…`) and Pages `c1395517-8045-41d4-8a3d-ad005367b1f3` from source `1fcdf48` (rollback `e332291a-…`); `/health` 200 `storage:{d1,kv}` and the live opener reads «نهارك سعيد. هل أمتعتك مفقودة؟». **UNPROVEN:** model-written replies and the spoken turn — no provider key here, the deployed worker 401s unsigned, and the scripted recogniser never finalised a transcript (repo `e2e/microphone.spec.ts` passes 3/3). |
| 2026-11-16 | practice chat v8: measured correction, 3 goals per scenario, replay harness | **The prompt gained the rules the owner's replay proved were missing; every scenario now has exactly 3 goals; no route, screen, table or dependency changed.** Diagnosis on live `/ai/turn`: every turn was Groq `openai/gpt-oss-120b` (1 attempt, 1.2–1.7 s) and correction recall was **6 of 13 sentences with real errors (46%)** — `understood_de` came back identical to the learner's text, and an off-topic question was deflected once and answered with an invented fact once. `ROLEPLAY_PROMPT_VERSION = 8` in `cloudflare-roleplay.js` adds four rules: always correct real errors (verb choice, auxiliary, word order, article/gender, noun capitalisation) and never echo the learner's error; understand typos instead of correcting to a different word (`lebie` → `liebe`, never `lebe`); off-topic stays in role and never invents a fact; hints ship in the same response, and exactly one question per reply (none at farewell). `meta:{provider,model,attempts,ms}` on `/ai/turn` plus a fixed `prompt_version` in the cost log (it was a hardcoded `1`, so a v7 turn was indistinguishable from a v8 one) make the answerer readable; the hidden Settings debug line reads it. `runWorkersAiFallback` no longer labels a Workers AI reply with the Groq model name. `/health` now says `ready` = "a configured pool entry exists" and adds `fallback_only`, so an exhausted pool is visible instead of looking healthy. All 49 plans in `cloudflare-roleplay-plans.js` carry exactly 3 objectives (the courtesy beats `say_goodbye`/`thank_him`/`thank_and_leave`/`thank_and_finish` are gone, other dropped beats are folded into goal 3), orphan anchors deleted; `docs/OWNER-SCENARIO-GOALS.md` lists all 147 goals and every change; `scripts/replay/` adds the 46-case harness (11 held out) and `score-replay.mjs`. Gate **VERIFY OK 15/15** (`npm run verify -- --ci`, 137.3 s) plus **playwright 175 passed / 11 skipped / 0 failed** (18.2 min) run separately after the wrapper kept dying mid-suite. **Deployed** worker `d99eeecc-f1fb-4b5f-8cc7-2828b0c02959` (rollback `b4214794-bf88-4a6e-925c-8c50bef95a6f`; `/health` 200 `ready:true, fallback_only:false, storage:{d1,kv}`, `/admin/api/overview` 401), Pages `2b0a22d0-f348-4c69-8445-d336f46af4ba` from source `92a0f42` (rollback `c1395517-…`, same client bundle — worker and docs only). **UNPROVEN:** the ≥90% correction gate — the account's 200-turn/day cap stopped the replay after 29 real Groq turns (p95 3.32 s, no double question, no question at farewell, «Ich heisse» still passed uncorrected, 3 of 4 wrong sentences fixed). No model comparison and no LLM judge: no provider key exists here (see OWNER-CHECKLIST §17). |
| 2026-11-16 | AI capacity: one provider organization, same model first, prompt v9 token diet, honest capacity error, 66-case replay | **A learner turn can no longer be answered by the weak Workers AI stand-in, and the prompt costs about a quarter fewer input tokens; no route, screen, table or dependency changed.** `cloudflare-ai-router.js` walks `PROVIDER_QUALITY_ORDER` (groq -> cerebras -> openrouter -> nvidia -> gemini) **by model first** (`modelFirst: true`), so `openai/gpt-oss-120b` is tried on every available provider before any other model, and another model only after it passes the replay gate. One key per provider organization: `CEREBRAS_API_KEYS` / `GROQ_API_KEYS` with a single entry each; a second key is a config error reported in `/health`, never extra capacity. The roleplay path calls the router with `allowWeakFallback: false`, so Workers AI cannot answer chat; when every provider is out of budget the route returns 503 `AI_CAPACITY_EXHAUSTED` with «الخدمة وصلت حدّها اليومي. جرّب لاحقاً», no reply, no hint, and **no charge** — the free session is consumed only after a reply exists (`tests/noFallbackPersona.test.ts` posts the route twice and the counter stays absent). Budgets come from the providers' own `x-ratelimit-*` / `Retry-After` headers; `cloudflare-telemetry.js` records per provider+model turns, tokens and remaining quota into five tables created at runtime by `ensureTelemetryTables` (`migrations/0004_admin_telemetry.sql` is documentation only — `wrangler d1 migrations apply` would replay 0001-0003), surfaced by `/admin/api/ai-usage` with an under-20% alert. Prompt **v9** (`cloudflare-roleplay.js`): the byte-identical instruction block comes first and the scene block last, so a provider that caches a prefix re-reads it from cache; 3 worked turns instead of 6; the last 4 exchanges instead of 6; `max_tokens` 400 instead of 480. Measured on the same scene: **8,333 -> 6,884 prompt chars (about 2,083 -> 1,721 tokens, -362 per turn)**, plus about -120 from history. `scripts/replay/scenario-replay-cases.json` grew **46 -> 66 cases (34 with a real error, 16 held out)**, and `score-replay.mjs` now compares `changed` with case and umlauts intact — folding both sides first made «heisse» -> «heiße» and «lehrerin» -> «Lehrerin» look like no change, so a correct fix could never be credited. **UNPROVEN:** the recall number on the new corpus (the account's daily cap, and the replay burns learner turns); the Cerebras pair (no key configured); and whether Groq caching actually hits for this model (not measured — the code does not assume it). |
| 2026-11-18 | practice chat v10: register lock, learner-decided farewell, persona gender/detail, 3 new replay cases | **The persona can no longer switch address form, end the chat by itself, echo the learner as a "fact", or use the wrong Arabic gender; no route, screen, table or dependency changed.** `ROLEPLAY_PROMPT_VERSION = 10` in `cloudflare-roleplay.js`: every plan in `cloudflare-roleplay-plans.js` now declares `register` (`sie` 40 / `du` 9) and `persona_gender` (female for `first_greetings`/Frau Meier), the prompt re-states the register on every turn and tells the Arabic side to use the persona's own gender (e.g. `سعيدة`), and adds exactly one scenario-defined persona detail per turn from the plan (never an invented fact, never an echo of the learner's own words). Every plan also gains a 4th objective `end_politely`; `shapeRoleplayReply` credits it only when the LEARNER's message contains a farewell (`textHasFarewell` in `cloudflare-roleplay-anchors.js`), so `Ich muss jetzt los` may precede the goodbye but `close`/allDone cannot fire before the learner ends the chat. `checkRoleplayReply` now rejects `farewell_before_learner` and `register_switch` (sentence-initial `Sie` is stripped for `du` scenes so «Sie wohnen hier» is not misread as a formal address). The UI header counts objectives, not turns, so it reads `N من 4`. Replay: `scripts/replay/scenario-replay-cases.json` grew **66 -> 69 cases** (`g34` «Hallo ich bin ghaidak», `g35` «ich komme aus syria», `g36` «ja ich wohne hier», the last marked `noChange`); `score-replay.mjs` adds `--only` and a folded `false_fix` check. Run once on the three cases through the real `runRoleplayTurn` with the production KV key: provider/model **groq/`openai/gpt-oss-120b`**, attempts 1/2/1, corrections credited on `g34` (`Hallo`/`Ghaidak`) and `g35` (`Syrien`), `g36` correctly returned as no change, zero check failures; p95 25.2 s is two 429 waits at 20 s, not model latency (the same turns answered in ~1.1 s). Tests: roleplay + opener suites **55/55**, `npx tsc --noEmit` clean. Deployed worker `89a1a55e-783b-4023-92f1-e17db916cf7d` (rollback `05d225ef-d2a2-46bb-a2c1-b6b16e3b2eeb`), Pages `73943a1c-2735-49e9-b87d-9c241ed0f73f` from `0310e88` (rollback `83cb8db8-f44b-476d-b862-09522f7a347d`). **UNPROVEN/LIMITATION:** the A1 `first_greetings` opener is Sie-form in the fixture/generated bundle only — production D1 still serves the old `du` opener until an owner `CONTENT-LOAD-AUTHORIZED:` line; the `ich komme aus syria` reply addressed the learner with feminine Arabic (`أنتِ`) although the learner's gender is unknown. |
| 2026-11-19 | first-run pass: the screens a new learner actually sees | **Nine visual defects from a 390x844 walk of the real bundle are fixed; no route, endpoint, table or dependency changed.** (1) The transcript starts centred while the opener is alone instead of leaving ~400 px of black, then stacks upward from the dock. (2) A1 no longer opens every reply with its Arabic under it — `arabicSupport: default` now means the opener is translated and later replies are one tap away; A0 keeps always-on, and the toggle reads «إخفاء» when open. (3) The no-voice notice is one sentence. (4) `composeSession` never prints a scenario id (`first_greetings` → «المشهد التالي», exported as `UNTITLED_SCENE_AR`; pinned in `tests/units.test.ts`). (5) The goal ring carries «دقيقة»; the 0% level ring and the 0-XP profile rank card are hidden. (6) Day one renders three units and «N في الطريق» instead of a column of padlocks. The faint «لحظة الوصول · أول موقف في القصة» line above the mission title STAYS: it is the only place that names the episode as the arrival, and `e2e/journey.spec.ts:69` pins it — an earlier removal was reverted. (7) `/welcome` shows one real exchange (German → Arabic → correction) and no longer asks for a name; the broken hero sentence is fixed. (8) The paywall renders no plan cards when `/pricing` returned nothing. (9) Sign-out is a quiet `Button variant="quiet"`; a banner with no artwork takes a 21:9 band. The two locked nav tabs stay: `e2e/tabLock.spec.ts` + `navbarGeometry` pin them as an onboarding affordance with a start CTA, not a dead end. Evidence: `npm run verify` 6/6 (94.9 s), `npm run verify -- --e2e` 16/16, 12 PNGs in `.tmp/ux-audit/`. **Limitation:** scene art is still 13 flat-gradient placeholders (§10). |
| 2026-11-20 | path screen, second visual pass: one state per lesson, one filled button, no boxes | **Visual only — no route, endpoint, table, dependency or progress rule changed.** Every lesson now renders exactly one state: ✓ green done, accent-filled current, dim numbered upcoming. The 3-stage `StageMeter` and the minutes exist only on the current row, so an unreached lesson can no longer look half-finished. Rows lost their card and their per-row meter/minutes: a 1px divider separates them (none on the last), the German subtitle takes the full width and wraps to two lines (`line-clamp-2`) instead of truncating, and only the current row holds a surface (soft accent tint, small «قيد التنفيذ» dot). The hero moves the minutes into its top row beside «التالي», replaces the text arrow «دراسة ← مع مساعدة ← وحدك» with a real 3-step bar (reached filled, current accent + label, next dim) and keeps the screen's only filled button («ابدأ», 52 px). The review strip is one ghost row — icon, «مراجعة سريعة», «N بانتظار», chevron — with the 10-item cap and the minutes only in its accessible name and the review screen, so no separate «… في الانتظار» line remains. Unit headers are text rows (`الوحدة 1 · أولى كلماتك` + `LtrCounter` + chevron) with the thin bar attached directly under, no box and no number badge; the muted «A1 · 7%» sits once in the screen header. Two bordered/filled surfaces remain above the fold: the hero card and the current row. Evidence: `trailOrdering` **39/39**, `uiPolishLaunch` G2 green (the counter uses the shared `LtrCounter`), `journeyLayoutProbe` **5/5**, `journeyPolishShots` **6/6**, `unitPathShots` **6/6**; before/after PNGs in `docs/agent/journey-polish/`. |
| 2026-11-20 | home tab + tab bar: one hero, one ghost row, a bar at the screen edge | **No route, endpoint, table or dependency changed; the home tab now uses the practice home's anatomy.** `JourneyHomeScreen.tsx` moved the chapter bar under the title (`data-testid="chapter-progress"`, `ProgressStrip` + `LtrCounter` «0 / 3 مشاهد») and deleted the bottom chapter card; the 16:9 `ScenarioBanner` hero became a 160px reserved band (`journey-hero-banner`) holding a lazy `scene.artUrl` image — a content `banner_url` still wins, `data-testid="scenario-banner"` kept — with a bottom-to-top `from-kz-black/85` wash, a fade keyed to the current src, and a purple→black fallback that keeps the layout still while it loads; the band carries label / title 22/700 / LTR German subtitle / minutes above one 52px `PrimaryAction`. Review is a single ghost row capped at `min(due, 10)` and hidden when nothing is due; `DailyTasksPanel.tsx` lists one 48px line per task with a circular check, a 3-segment strip + `0 / 3` on the header row, a hint only on the first unfinished route, and no review batch (`markReviewGraded` completes it). The tab bar left `GlassEffectContainer` for a flat `border-t` + blur bar with an accent active tab and four micro labels. The single «المراجعة محفوظة على جهازك» line now lives only in `ReviewScreen`. `/app/library` unit headers carry the 56px scene thumbnail. Evidence: `npm run verify -- --ci --e2e` → `VERIFY OK — 16/16 steps passed`; `navbarGeometry` rewritten to the flat-bar contract (4/4), `banner` 2/2, `dailyTasks` 2/2, `guidedHome.test.ts` 35, `unitPathShots` 6/6, `uiPolishShots` 26/26; shots under `docs/agent/ui-polish/`. |
| 2026-11-22 | language matrix: Arabic/English/Indonesian UI × German course, Dutch defined and gated | **No route, endpoint, table or dependency changed; every existing turn is byte-identical.** `src/lib/i18n/{languages,languagePreference,strings,LanguageProvider,useLanguageProfileSync}.ts*` add the matrix (UI `ar|en|id`, course `de|nl`), a key-based dictionary with Arabic as the reference and the fallback, `<html lang/dir>`, and a two-way device↔profile mirror on additive `users.uiLanguage/targetLanguage` (no Dexie version bump). `LanguagePreferences.tsx` renders the picker in all three languages and is first in Profile → «طريقة تعلّمي»; the tab bar, its lock announcement and the account gate read `t()`. Server: `cloudflare-ai-chat.js` gains `TURN_TARGET_LANGUAGES` (de shipped, nl not), `TURN_NATIVE_LANGUAGES` (ar/en/id prose), `resolveTurnLanguages()` (total → de/ar) and `buildTurnSystemInstruction({targetLang,nativeLang})`; `workerClient` sends `native_lang`/`target_lang` read at send time. Dutch is visible and **not selectable**, with the reason on the row, because no Dutch content exists. Evidence: `tests/languages.test.ts` 19, `tests/turnLanguages.test.ts` 21, `guidedHome.test.ts` updated to the dictionary contract, `npm test` 208 files / 2906 tests. Plan: `docs/plans/010-multilanguage-master-plan.md`. **UNPROVEN:** the picker in a browser (not clicked through); Indonesian/English copy not yet read by native speakers; the rest of the UI is still Arabic-only (Phase 1b). |
