# Katzu — Current State
Recorded: 2026-09-24 baseline, **updated 2026-09-27 (content contract reconciliation — first section below)**; previous updates 2026-09-27 (narrative + main character), (offline shell + public demo), (native voice pass), (chat/voice/banner pass) and (Katzu V2 episode + material system). All facts verified in source.

## 2026-09-29 (release-candidate pass) — first-run dead ends, persona rules, operational controls
- **P1–P6 (earlier phases) confirmed present in source, not just in docs:** constant-time admin auth with a per-IP failure throttle, rev-guarded progress sync through `sync_revisions`, tightened CSP (no inline `script-src`), Arabic safety disclaimers on health/official/housing scenarios, CI gates (content audits, prod dependency audit, Playwright job, secret scan) and one price source for the paywall (`/crypto/health` → `priceUsd`/`months`). Crypto webhook re-read: HMAC signature + constant-time compare, exactly-once claim/store on `status`, and an amount guard at ±$0.01.
- **First-run:** a 390×844 Arabic walkthrough found the practice vocabulary grid had **no empty branch at all** (a blank area for a null search or an empty saved list), a mistake bank that only congratulated, a flashcard empty state that explained nothing, CEFR level pills measuring ~32px against a 44px thumb minimum, and a Pro offer with no legal links. All five fixed; `e2e/firstRun.spec.ts` pins them at phone size.
- **Content:** both audit scripts pass with nothing to fix (0 mismatches, 0 gaps); all 768 German + 153 Arabic shipped strings are free of mojibake and ASCII umlaut spellings, now enforced by tests. Two persona rules that existed nowhere in the prompt — never claim to be human, never reveal its own instructions — are now an always-present `IDENTITY LIMITS` block with five assertions behind it.
- **Resilience:** added the `MAINTENANCE_MODE` kill switch (503 + Arabic on every learner write, reads and `/admin/*` untouched, absent = off), a retention sweep for `rate_limit_counters` and `error_reports` (`POST /admin/sweep`, plus an inert `scheduled` handler), and trimmed `/health` from a full pool report to status only.
- **Verification:** `npm run lint` clean; `npm test` **67 files / 799 tests**; Playwright **37/37** (journey 12, others 22, firstRun 3); `npm run build` exit 0; `node --check` clean on every worker; `npm audit --omit=dev --audit-level=high` → 0 vulnerabilities; secret grep clean. **Lighthouse was not run** (no Lighthouse in this environment and no devDependency added) — Stage 1's before/after numbers are still missing; the performance work of B4 stands on its own recorded numbers.
- **One long-standing red gate closed:** `tests/backfill.test.ts` had been reported as a pre-existing load failure. It was a Windows checkout artifact — `core.autocrlf=true` with no `.gitattributes` made the imported hashbang `.mjs` CRLF, and Vite's hashbang strip left a stray `\r`. The repo's blobs were always LF; with LF the file passes 9/9 and `.gitattributes` now pins `text=auto eol=lf`.
- **Owner-only work still open:** the two loader `--commit` runs, `MAINTENANCE_MODE` + the cron trigger, Cloudflare Access on `/admin/*`, NOWPayments live mode, counsel review, custom domain/OAuth origins, the worker deploy, and iOS/Android voice on real devices.

## 2026-09-28 (launch-hardening pass) — performance, reliability groundwork, docs reconciliation
- **B4 performance done, all six sub-items.** (a) JourneyHome's 8 full-table `toArray()` live queries replaced by one bounded identity-preserving projection (`src/features/journey/journeyHomeData.ts`, proven by `tests/journeyHomeData.test.ts`). (b) 14 Unsplash hotlinks replaced by local 640×360 JPEGs in `public/scenes/` (29 KB total; `banner_url` still wins). (e) Cairo/Satoshi subset to woff2 (588K→116K, ~72K→~15K each), TTF fallback kept. (c) React renderer tier (`src/lib/design/rendererTier.ts`): saveData → reduced-motion → cores/memory picks `full|reduced` once per page load; `kz-lite` drops blur/saturation/grain, never contrast. (d) `LiveConversationScreen` (1248 lines) split mechanically into `useLiveConversation.ts` + `ConversationTranscript.tsx` + `ConversationDock.tsx` with zero behaviour change. (f) unreachable legacy AI handlers deleted from `cloudflare-unified-worker.js` (478 lines: `handleAiConversationTurn/Translation/Hints`, `callGeminiWithFailover`, `summarizeFailoverState`) plus `LEDGER_SCOPES` from the router.
- **Verification:** `npx tsc --noEmit` clean; `npx vitest run` **65 files / 747 tests** passing; conversation e2e groups green before AND after the split (3/3 live interaction, 2/2 layout, 2/2 debrief/no-recogniser); `node --check` clean on both workers. Build numbers recorded at the B8 gate.
- **Content state:** module2 (`arrival`) approved via the §4 gate (AI self-review, review file `docs/content/review-arrival-module2.md`); module1 stays pending by design. Both drafts await the owner's loader `--commit`; live D1 counts unchanged (5/20/114/4, see LAUNCH-CHECKLIST §3.2 which now separates draft from live).
- **Docs:** LAUNCH-CHECKLIST client-crash claim corrected (capture already exists via `installDiagnosticsCapture` → `/client-error` → `error_reports`), re-verify counts updated to 747/65 and 27 Playwright tests.
- **B5/B6 (reliability, accessibility) not yet executed** — recorded as open in `AGENT-STATE.md`.

## 2026-09-27 (sixth pass) — content strategy reconciled to the shipped join map (historical entry; current authoring policy: `AGENTS.md` §4)
- **Verified existing taxonomy, no code/schema change.** `airport_arrival` and `train_station` fallback fixtures use `category: 'travel'`; `SCENARIO_CATEGORY_TO_TOPIC.travel` maps to `'travel'`. The authoring prompt now documents this existing sixth category/topic pair and requires a separate 15–40 word pool whenever a module uses it. The roadmap now maps both arrival and station to `travel` → `travel`, consistent with the shipped fixture/map.
- **Historical contract note (2026-09-27):** this pass recorded the then-current exact-eight authoring contract and did not change curriculum rows. The current 5–8 contract and AI self-review gate are defined by `AGENTS.md` §4; this historical note is not an active rule.
- **Fallback content facts at that time:** `bakery_shopping` had two local starter phrases and one fallback vocabulary row; `train_station` had no local starter phrase and one fallback vocabulary row. Any replacement must preserve existing IDs and pass `AGENTS.md` §4.
- **Authoring/approval not performed in that historical pass.** The draft was pending then. The current review process is `AGENTS.md` §4; no D1 or Worker write occurred in that pass.
- **Historical Phase 1 audit claim:** the earlier implementation log recorded an audit pass (5 scenarios, 74 vocabulary, 30 phrases, 10 grammar; pending). The audit CLI is not currently present in this workspace; do not treat that historical output as a current run.

## 2026-09-27 (Phase 3 trace / Phase 4 investigation)
- **Vocabulary join verified for the current travel mapping.** The scenario row’s `category` is converted by `scenarioToVocabTopic()` in `src/lib/utils/scenarioVocab.ts`; `airport_arrival`/`train_station` with `travel` resolve to topic `travel`. Study, Guided Practice and Quiz query Dexie vocabulary by that topic. Quiz also refreshes scenario detail and its resolved topic through `workerClient.fetchScenarioDetail()` and `fetchVocabulary(undefined, topic)`. Quiz distractors come from the full same topic pool; starter-phrase questions use scenario-specific `scenario_id` rows. These paths are pinned by `tests/scenarioVocab.test.ts`.
- **Live Conversation is not using that topic pool for prompt context.** `LiveConversationScreen` currently reads all vocabulary rows to support known-word tap lookup; `workerClient.sendTurn()` sends the scenario id, transcript, level and `learner_memory`, but no vocabulary/topic collection. The server-authoritative `/ai/turn` prompt resolves scenario title/persona and passes the learner’s memory, not a vocabulary pool. Therefore the content association is shared by Study/Guided Practice/Quiz, but not injected as vocabulary into Live Conversation. This is a confirmed gap; no new prompt context was added because Phase 2 curriculum was not authored and the instruction forbids an architecture redesign.
- **Mistake → review queue is connected and tested.** `LiveConversationScreen.sendTurn()` stores corrections with scenario id, original/corrected German, model-provided grammar prose, and timestamp, then calls `enrolMistake()`. `src/lib/srs/store.ts` skips corrections with no corrected text and uses idempotent `[kind+refId]` enrolment; `newReviewItemFromMistake()` creates an immediately due production item with corrected German answer, original sentence context and `scenarioId`. `ReviewScreen` loads the user’s items and `buildReviewQueue()` filters due, interleaves kinds and caps at 20; `gradeReviewItem()` schedules the next interval (good ladder 1/3/7/16/35/90 days, `again` in 10 minutes) and marks mistakes mastered after three consecutive successes. Tests exist in `tests/reviewStore.test.ts` and `tests/srsEngine.test.ts`.
- **Grammar rule identity is not end-to-end.** `GuidedPracticeScreen` selects from the entire grammar table using `selectGrammarRule()` (nearest level/day rotation); `PracticeGrammar.id` is shown in the view model but is not persisted with practice or a scenario. D1/Dexie grammar has `id` and `level` but no scenario association. Conversation’s `grammar_rule` is generated Arabic prose and stored in `MistakeEntity.grammarRule`; `learner_memory` groups that prose and the SRS mistake item repeats it as the Arabic prompt. No exact grammar-row ID match can be made from existing data. This is a content-association/schema contract gap, not a broken SRS enrollment; no schema field, fuzzy matching, or guessed identity was introduced.
- **Phase 3 episode gate status at that time: partial.** The code trace confirmed the correction-to-review path when corrected text exists, and that exact grammar-ID continuity was unavailable then. A fresh implementation should re-inspect the current code and follow the present backlog in `AGENTS.md` §6.
- **Phase 4 evidence and gates:** `e2e/conversationLayout.spec.ts` baseline passed (2/2); a focused `e2e/journey.spec.ts` run for first arrival, Guided Practice and the correction→Debrief loop passed (3/3). A full `npx playwright test e2e/journey.spec.ts` attempt and a later full `npx playwright test` attempt exceeded the terminal tool deadline without test summaries; neither is a pass nor a diagnosed test failure. No component split, Dexie query bound, art replacement, renderer tier change, or legacy-code removal was made in this pass. Reasons: Phase 4 requests before/after full-suite parity and visual confirmation; full baseline did not complete, `public/scenes/` has no art files, and the software-renderer helper is local to WebGL initialization rather than a React-level `tier` API. Existing Unsplash artwork remains. Legacy `callGeminiWithFailover` still has in-file callers inside old handler bodies, but routing uses the extracted `cloudflare-ai-chat.js`/`cloudflare-hints.js` handlers; safe deletion still needs careful removal of the now-unreachable route bodies together with helper/constants, then full Worker tests/syntax checks, and is deferred.
- **Verification this continuation:** `npx tsc --noEmit` and `npx tsc -p e2e --noEmit` passed; `npx vitest run` passed **62 files / 712 tests**; the curriculum audit passed with 5 scenarios, 74 vocabulary, 30 phrases and 10 grammar rows (pending); `npm run build` passed with entry bundle **490.20 kB / 157.49 kB gzip** and **83 precache entries**. `npx playwright test --list` discovered 26 tests in 8 files. Full Playwright remains unverified due to terminal deadline. No visual screenshot/manual runtime inspection was available in this tool session.

## 2026-09-27 (fifth pass) — the learner as the main character, and an arrival that opens the story (full log: `KATZU_IMPLEMENTATION_LOG_CONTINUED.md` §14)
- **The audit's gap was narrative, not architecture.** Six seed scenarios, no arrival, no persistent cast, and a learner the app never named. This pass adds the smallest complete slice of that: a Day 1 arrival scene, one grammar micro-card per episode, and the learner named as the protagonist with Katzu as the companion.
- **The airport arrival is Day 1.** `INTRO_SCENARIO_ID = 'airport_arrival'` (`src/lib/mission/selectMission.ts`); `selectDailyMission` gained a branch that offers the scene **once** — only while no `scenario_training` record exists for it and it has content. Every path is gated on the id, so when the row is absent the feature is a silent no-op and the mission falls through to the existing priorities (review → continue → weak skill → daily → new → no content). `buildJourneyContext` pins the id to the front of `orderedScenarios` (no-op when absent) and `missionReasonAr` gained an arrival-specific reason. `e2e/journey.spec.ts` asserts “the first episode is the arrival, not a random day”.
- **The seed content is an app fixture, not authored curriculum.** `seedStoryOpening()` in `src/lib/db/katzuDb.ts` seeds the scenario, six starter phrases and six travel vocabulary rows idempotently (`add`/`bulkAdd` guarded by existence checks, ids from `OPENING_FIXTURE_ID = 1000`) with an explicit comment that it is unreviewed offline-fallback text to be replaced by a D1 row. No content ID, CEFR label or Arabic translation owned by the content team was changed.
- **One grammar micro-card per episode.** `src/lib/journey/practice.ts` gained the pure `selectGrammarRule(grammar, level, { now, excludeGerman })` (nearest-level sort, day-index rotation, skips examples duplicated among practice cards). `GuidedPracticeScreen` renders it as a real production beat (Arabic rule, typed German with umlaut-normalised comparison, `أرني الصحيحة` reveal, explanation) and the progress rail becomes two or three steps accordingly. `empty` is now no cards and no rule.
- **The learner is the main character.** `learnerName(displayName)` takes the first token and refuses emails and placeholder names; `buildStorySetup` takes `displayName`/`arrivalStatus`, returns `learnerName`, and `katzuOpeningLineAr` varies with name, arrival status and returning state. Story Setup shows an `أنت: {name}` pill. `PERSONA_ROLES` gained a first `موظف جوازات المطار` role for the arrival NPC.
- **Two smaller corrections.** `SCENARIO_CATEGORY_TO_TOPIC` had no `travel` entry, so airport/station vocabulary was unreachable; `travel: 'travel'` fixes it. Journey Home uses `mission.ctaAr` (one source of truth), and the intro gets its arrival badge.
- **Verification**: `npx tsc --noEmit` clean · `npx tsc -p e2e --noEmit` clean · `npx vitest run` → **62 files / 712 tests passed** · `npx playwright test` → **26 tests in 8 files**, every spec green in groups · `npm run build` clean (entry **490.20 kB / 157.50 kB gzip**, 83 precache entries).

## 2026-09-27 (fourth pass) — the offline shell and the public demo (full log: `KATZU_IMPLEMENTATION_LOG_CONTINUED.md` §12–13)
- **The built `sw.js` had never activated with a cache — silently.** Workbox's `precacheAndRoute` threw `add-to-cache-list-conflicting-entries` while building its install handler, so the worker activated instantly with **no routes and no precache**, and every cold offline navigation hit the network and died (`ERR_INTERNET_DISCONNECTED`). Fixed in `vite.config.ts` — one owner per file: `includeAssets` removed, `includeManifestIcons: false`, explicit `dontCacheBustURLsMatching`. Built result: **84 entries, 0 duplicate URLs, 0 conflicts**; fonts/mascots content-hashed; offline navigation renders the shell.
- **The public demo had never loaded — on any device.** `/demo` state now hydrates explicitly when Dexie lesson content becomes available. Signed-out e2e exercises study → quiz → produce → done; no AI call is made.
- **Verification**: `npm run lint` clean · `npx vitest run` → **62 files / 694 tests** · `npx playwright test` → **25 tests in 8 files** · `npm run build` clean · `node --check` clean on all thirteen `cloudflare-*.js`.

## 2026-09-27 (third pass) — native voice, both directions (full log: `KATZU_V2_IMPLEMENTATION_LOG.md` §11)
- **Speech input is native-first, with the Whisper recording path behind it.** `src/lib/audio/nativeSpeech.ts` handles platform recognition with honest failure classes; `src/lib/audio/useVoiceCapture.ts` provides native-first and MediaRecorder→Worker fallback. No audio is stored.
- **The learner sees their own German while they are still speaking.** `src/lib/speech/wordHighlight.ts` maps exact German character offsets to speech boundaries; caption displays LTR-isolated German and does not claim pronunciation scoring.
- **TTS voice choice is deterministic.** `chooseGermanVoice` prefers device then natural German voices with stable ties.
- **Verification**: `npm run lint` clean · `npx vitest run` → **62 files / 690 tests passed** · Playwright 24 tests / 7 files green in groups · E2E types clean. Android audio-stack behavior remains manual.

## 2026-09-27 (second pass) — the first real phone session (full log: `KATZU_V2_IMPLEMENTATION_LOG.md` §10)
- Speech input pipeline, safe mic fallback, fixed structural conversation layout, scenario banners, durable privacy-safe crash log, and prompt corrections. Android-specific behavior not verified in headless Chromium.

## 2026-09-27 — Katzu V2 (full log: `KATZU_V2_IMPLEMENTATION_LOG.md`)
- Daily episode, story setup, guided practice, live conversation and Debrief; reusable glass material system, voice-first orb, honest capability summary, renderer fallback, review reskin and offline/voice behavior. Details and historical verification are in the original implementation log.

## 2026-09-26 — product pass (value-before-signup, personalisation, honest progress)
- Public demo, personal onboarding, deterministic daily mission, capability-based progress, mistake coach, conversation state machine, privacy-safe analytics, share card, paywall/subscription/code-redemption improvements and app error recovery. Detailed behavior/tests are in the prior current-state sections and implementation log.

## Baseline validation results
- `npm run lint` (tsc --noEmit): **clean**
- `npm test -- --run` (vitest): **16 files / 87 tests passed**
- `npm run build`: **success** (PWA generateSW, 45 precache entries, ~7.4s)
- No compilation errors, no failing tests, no missing runtime bindings at build time.

## Stack (unchanged, no migration proposed)
React 18 + TypeScript + Vite PWA · Dexie (IndexedDB) offline layer · React Router · Tailwind · Cloudflare Worker (`cloudflare-unified-worker.js` + sibling modules) · D1 `katzu-content` (content CMS) · KV `USER_PROGRESS` (progress, sessions, quota, AI pool ledger, shared AI cache, fallback metrics) · KV `REDEEMED_CODES` (codes, accounts, referrals, email index) · **multi-provider AI pool** (Gemini · Groq · OpenRouter · NVIDIA NIM, `cloudflare-ai-router.js`) with Workers AI (`@cf/qwen/qwen3-30b-a3b-fp8`) as the last resort.

## Routes (client, `src/App.tsx`)
`/`→`/app/trail` · `/welcome` · `/signin` · `/demo` · `/onboarding` · `/subscription` · `/app/:tab` (main tabs) · `/app/library` (pre-V2 trail as the scenario/level browser) · `/scenario/:scenarioId/story` · `/scenario/:scenarioId/practice` · `/scenario/:scenarioId` · `/scenario/:scenarioId/study` · `/scenario/:scenarioId/quiz` · `/scenario/:scenarioId/live` · `/session-report` · `/app/review` · `/app/listen` · `/app/write` · `/app/coach` · `/placement` · `/dev/system` (dev only) · `/trust/:page` · `*` → welcome/trail.
The Trail tab now renders `JourneyHomeScreen` (today's one mission); the old `TrailScreen` remains reachable at `/app/library` for browsing every scenario.
**Every authenticated surface is behind sign-in** (`isAuthenticated` gate). The one public flow outside it is `/demo` — the try-before-signup lesson, explicitly listed in `isPublicPath` and calling **no AI endpoint**, so it cannot spend a quota it has no owner for. `/onboarding` stays gated: its first-run pass is reached through sign-in from the demo's conversion CTA, and `consumeDemoProgress()` migrates the visitor's progress on arrival.

## Local DB tables (Dexie, `src/lib/db/katzuDb.ts`)
v1: scenarios, starter_phrases, vocabulary, grammar, saved_words, users, redeemed_codes, sessions, scenario_training, mistakes.
v2 (additive + upgrade): adds sync metadata + `sync_queue`.
v4 (additive): `review_items` — the spaced-repetition queue (local-first, synced via `POST /review/sync`).
v5 (additive): `skill_practice` — measured writing/listening results.
Local fixtures exist as offline fallback content; production content lives in D1.

## Worker routes (`cloudflare-unified-worker.js`)
- Auth/session, AI turns/translations/hints/writing/transcription, billing codes/referrals, progress + review sync, analytics, content reads/admin CMS, crypto sales. Detailed boundaries and security notes remain in the earlier document sections.

## Content authoring (current)
- Admin Content Studio validates D1 content against `cloudflare-content-schema.js` and curriculum drafts against `src/lib/content/curriculumAudit.ts`.
- The authoring schema lives in `docs/CONTENT-AUTHORING-PROMPT.md`; approval follows the audit and AI self-review gate in `AGENTS.md` §4. Local fixtures are not written to production D1.

## Auth flow (current)
Google Identity Services on client → `POST /auth/session` exchange → `sess_*` session token stored in Dexie `users` row → Authorization: Bearer. Raw Google ID tokens were removed from persistent storage by Dexie migration; session revocation uses account deletion.

## Subscription flow (current)
Activation-code only in app; codes sold through the separate sales site and redeemed in app. Referral attribution is preserved.

## Deletion flow (current)
`POST /user/delete` revokes sessions and removes account-scoped remote data; the client wipes local user-scoped Dexie tables after confirmation.

## Offline & crash reporting (current)
- PWA shell precache and API stale-while-revalidate behavior are documented above; client errors are bounded and sanitized.

## AI calls (current)
- Multi-provider router, validated one-call turn handler, learner-memory prompt context, rate/quota guards and bounded errors; detailed implementation lives in `cloudflare-ai-router.js` and `cloudflare-ai-chat.js`.

## Client performance & robustness (current, 2026-09-26)
- Route-level code splitting and guarded `vite:preloadError` recovery; details above.

## Environment & bindings inventory
- Worker bindings and configured runtime details are described in the deploy configuration; no secrets are stored in source.

## Documented assumptions / risks noted during baseline
- Keep test-only authentication bypass gated away from production.
- Rate limiting and trial-quota locking need distributed guarantees under concurrency.
- Content taxonomy and external banner image availability are known concerns.
