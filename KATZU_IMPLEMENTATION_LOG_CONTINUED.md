# KATZU — Implementation Log (continuation)

Recorded: **2026-09-27**. Continuation of `KATZU_V2_IMPLEMENTATION_LOG.md`, which
reached this repository's editor write-reach limit (§Known limitations, item 7
there). Section numbers continue from §11.

---

## 15. The content roadmap now matches the shipped category map (2026-09-27)

The requested full-build prompt's Phase 1 asked whether the airport fixture really uses a
`travel` category before reconciling the roadmap. It does: `seedStoryOpening()` in
`src/lib/db/katzuDb.ts` assigns `category: 'travel'` to `airport_arrival`, and the older
`train_station` fallback is also `travel`. `src/lib/utils/scenarioVocab.ts` contains the
additive `travel: 'travel'` mapping. No category code or schema change was needed in this pass.

`docs/CONTENT-AUTHORING-PROMPT.md` now lists the existing sixth category/topic pair and says a
module using it must meet the same 15–40 word pool; `docs/CONTENT-STRATEGY-ROADMAP.md` now
assigns both the airport and train station to `travel` → `travel`. The contract still requires
**exactly eight scenarios per module**. The fifteen roadmap slots are five narrative chapters,
not five loadable JSON modules. Multiple modules can cross chapter boundaries, but 15 cannot be
grouped into exact-eight modules without an additional distinct slot or a changed roadmap
count. That remains a content-owner decision; no validator/loader rule was relaxed and no
existing live scenario ID is duplicated to fill the gap.

The local fixtures were rechecked: `bakery_shopping` has two phrases and one vocabulary row;
`train_station` has no phrase and one vocabulary row. As directed, both stay held for full
content-team rewrite under their current IDs. The canonical draft remains `pending`; no German
or Arabic curriculum was authored or approved, no content was written to D1, and no worker was
deployed.

**Phase 1 gate:**

| Check | Result |
| --- | --- |
| `node scripts/audit-curriculum.mjs --file=docs/content/curriculum-30day-module1.json` | passed; 5 scenarios, 74 vocabulary rows, 30 phrases, 10 grammar rows; `pending` |
| `npx tsc --noEmit` | run at full verification gate (below) |
| `npx tsc -p e2e --noEmit` | run at full verification gate (below) |
| `npx vitest run` | run at full verification gate (below) |
| UI e2e | no UI files changed in Phase 1 |

The remaining phases in the supplied prompt were evaluated conservatively. Lesson authoring and
AI self-approval conflict with Katzu's content-team ownership rule; no lesson content or approval
will be fabricated. Runtime tracing and code stability work are documented in the final report
with only verified changes claimed.

## 12. The offline shell that shipped dead (2026-09-27)

**What the audit saw.** `docs/verification-report.md` recorded the FAIL as
*"SW registers, but cold offline navigation shows blank root
(`net::ERR_INTERNET_DISCONNECTED` on reload; app-shell fallback missing for
navigation requests)"* — while the source config looked correct
(`navigateFallback: 'index.html'`, `globPatterns` including `html`).

**What was actually happening.** Measured on the built output, in a fresh
browser: `navigator.serviceWorker.ready` resolved with
`reg.active.state === 'activated'` and a controller set — and **Cache Storage
completely empty**. Attaching CDP to the service worker from its first
evaluation surfaced the exception, invisible to the page console:

```
Uncaught (in promise) add-to-cache-list-conflicting-entries :: [
  { firstEntry:  '…/assets/fonts/cairo.ttf' },
  { secondEntry: '…/assets/fonts/cairo.ttf?__WB_REVISION__=0e355a99…' }
]
```

Workbox's `precacheAndRoute` threw while building its install handler, so the
install listener was never registered: the worker activated instantly with no
routes and no precache — **silently**. Three overlapping settings produced it:

1. `includeAssets: ['favicon.ico', 'assets/mascot/*.png', 'assets/fonts/*.ttf']`
   duplicated files already matched by `globPatterns` — once unrevisioned, once
   with a revision. The generated manifest held **104 entries for 84 distinct
   files**.
2. `includeManifestIcons` (default `true`) added a second, separately-hashed
   copy of the two manifest icons, for the same reason seen from the other side.
3. The plugin derives `dontCacheBustURLsMatching` from Vite's `assets/`
   directory, so every *public* file copied there (`assets/fonts/*.ttf`,
   `assets/mascot/*.png`) was precached with `revision: null` — "immutable" —
   and a replaced font or mascot would never invalidate.

**The fix** (`vite.config.ts`): one owner per file, honest revisions.
`includeAssets` removed, `includeManifestIcons: false`, and an explicit
`dontCacheBustURLsMatching: /-[A-Za-z0-9_-]{8}\.(js|css)$/` that matches only
the hash Vite really appends. Result on the built `sw.js`: **84 entries, 0
duplicate URLs, 0 conflicting revisions**; hashed js/css stay `revision: null`;
fonts and mascots are content-hashed.

Verified on the built bundle with the network cut: the precache holds all 84
entries and the offline navigation renders the shell (`offline: nav=ok
root=true`; before the fix, `caches: {}` and `nav-error`).

### 12.1 Why the green tests were green

`tests/pwaOffline.test.ts` pinned the *config values* — all true while the
generated worker was dead. The failure lived in the generated manifest, which
no unit test read, and there is no honest way to assert that without a build.
Regression coverage is therefore split:

- the unit suite now pins the **ownership rules** (no `includeAssets`,
  `includeManifestIcons: false`, and the exact match/no-match set of
  `dontCacheBustURLsMatching`) beside the original fallback contract;
- the live behavior is pinned by the verification battery, which now **waits**
  for `navigator.serviceWorker.ready` and for the precache to hold entries
  before cutting the network. It used to flip offline after a fixed 5 s — mid
  install on a cold cache — and report a failure it had caused itself.

## 13. The public demo had never loaded (2026-09-27)

**What a visitor saw.** `/demo` — the whole value-before-signup promise —
sat on «جارٍ تحضير الدرس التجريبي…» forever. Reproduced on production, on the
dev server, and on the built bundle; **zero console output**, and IndexedDB was
fully populated (scenarios 7, starter_phrases 8, vocabulary 122 on production).

**Root cause**, once the screen was instrumented: the lesson resolved fine —

```
[demo-debug] {scenarios: 6, phrases: 8, vocabulary: 8, lesson: bakery_shopping, questionCount: 2}
```

— and the body still showed "preparing". `useReducer(demoReducer, initialState)`
takes its initial state from the **first** render, where the Dexie live queries
are still pending and `initialState` is therefore `null`. React never adopts a
later initial value, so `state` stayed `null` for the life of the component.

**Why nothing caught it.** The demo had no browser test, and the battery's J5
block walked `/scenario/cafe_order/live` signed out — an auth-gated screen,
which by design lands on `/welcome` — so the signed-out visitor's own screen was
never actually looked at.

**The fix.** An explicit, idempotent hydration event:
`{ type: 'hydrate'; state }` handled as `state ?? event.state` (a repeat hydrate
can never wipe progress), dispatched by `DemoScreen` once the lesson — and any
resumable progress — exists.

Verified on the dev server (intro card in ~1.9 s) and on the built bundle
through the whole flow: study → quiz → produce → done, with the correct form
shown. Coverage added:

- `e2e/demo.spec.ts` — signed out on purpose, walks the entire flow, asserts
  the Arabic RTL shell, isolated LTR German, the done card, and no page errors;
- two reducer tests for `hydrate` (from null; a late hydrate never overwrites);
- the battery's J5 block now walks `/demo` signed out instead of an auth-gated
  screen.

## 14. The learner as the main character, and an arrival that opens the story (2026-09-27)

The audit's verdict was that the *engineering* was strong and the gap was
**narrative depth**: six seed scenarios, no arrival, no persistent cast, and a
learner the app never named. This pass closes the smallest complete slice of
that gap without touching the curriculum boundary.

**The airport arrival is Day 1.** `INTRO_SCENARIO_ID = 'airport_arrival'` is
`export`ed from `src/lib/mission/selectMission.ts`, and `selectDailyMission`
gained a branch that offers the scene **once** — only while no
`scenario_training` record exists for it and it actually has content in the DB.
Every code path is gated on the id, so if the row is absent the feature is a
silent no-op and the mission falls through to today's existing priorities
(review → continue → weak skill → daily → new → no content). `buildJourneyContext`
pins the id to the front of `orderedScenarios` (also a no-op when absent) and
`missionReasonAr` gained an arrival-specific reason. `e2e/journey.spec.ts`
asserts “the first episode is the arrival, not a random day”.

**The seed content is a fixture, not authored curriculum.** The scenario, six
starter phrases and six travel vocabulary rows live in `seedStoryOpening()` in
`src/lib/db/katzuDb.ts`, are idempotent (`add`/`bulkAdd` guarded by existence
checks, ids from `OPENING_FIXTURE_ID = 1000`), and carry an explicit code
comment that they are unreviewed seed text to be replaced by a D1 row. This is
the app's local offline-fallback layer, not D1 — no content ID, CEFR label or
Arabic translation owned by the content team was changed.

**One grammar micro-card per episode.** `src/lib/journey/practice.ts` gained
the pure `selectGrammarRule(grammar, level, { now, excludeGerman })` (nearest-
level sort, day-index rotation, skips a rule whose example is already on the
deck) and `GuidedPractice` now carries a `grammar: PracticeGrammar | null`.
`GuidedPracticeScreen` renders it as a real production beat — the Arabic rule,
usually `selectGrammarRule`'s worked example not among the retrieval cards, a
typed German sentence with umlaut-normalised comparison, an `أرني الصحيحة`
reveal and the explanation — and the progress rail becomes two or three steps
based on its presence. `empty` is now *no cards and no rule*, so a rule alone
still leaves the screen useful.

**The learner is the main character; Katzu is the companion.**
`learnerName(displayName)` in `src/lib/journey/story.ts` takes the first token
and refuses emails and placeholder names (`مستكشف كَاتْزُو`, `طالب كَاتْزُو`,
`متعلّم كاتزو`, `Katzu`). `buildStorySetup` now takes `displayName` and
`arrivalStatus`, returns `learnerName`, and `katzuOpeningLineAr` varies with the
name, arrival status and whether the learner is returning. Story Setup shows an
`أنت: {name}` pill when a real name exists. `PERSONA_ROLES` gained a first
`موظف جوازات المطار` role keyed on `grenz`/`zoll`/`passkontrolle`/`flughafen`,
so the scene's NPC is addressed by role.

**Two smaller corrections.** `SCENARIO_CATEGORY_TO_TOPIC` had no `travel` entry,
so train-station and airport vocabulary resolved to an empty topic and was
unreachable; `travel: 'travel'` fixes it (`tests/scenarioVocab.test.ts` pins it,
and `goalMatchScore` already maps `daily_life`/`exam` to `travel`). The Journey
Home primary button label is now `mission.ctaAr` — one source of truth — instead
of a hardcoded `ابدأ مهمة اليوم`, and the intro gets the badge
`لحظة الوصول · أول موقف في القصة`.

## Verification (local, 2026-09-27)

| Command | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run test:e2e:types` | clean |
| `npx vitest run` | **62 files / 712 tests passed** (was 690; +2 hydrate, +2 offline ownership, +18 V2 narrative this pass) |
| `npm run build` | clean; entry `490.20 kB / 157.50 kB gzip`, 83 precache entries |
| offline check on the built bundle | precache 84/84; `offline: nav=ok root=true` |
| `npx playwright test` | **26 tests in 8 files** green in groups (new: `e2e/demo.spec.ts`, the arrival assertions, the grammar beat) |
| `node --check cloudflare-*.js` | clean on all **13** (the worker was not changed) |

Post-narrative pass, re-run end to end on 2026-09-27: `npx tsc --noEmit` clean ·
`npx tsc -p e2e --noEmit` clean · `npx vitest run` → **62 files / 712 tests
passed** · `npx playwright test` → **26 tests in 8 files**, every spec green
(`banner` 2, `journey` 11, `demo` 1, `onboarding` 2, `conversationLayout` 2,
`progress` 2, `paywall` 4, `microphone` 2) · `npm run build` clean (**entry
490.20 kB / 157.50 kB gzip**, 83 precache entries; `GuidedPracticeScreen` chunk
15.64 kB / 5.39 kB gzip, `JourneyHomeScreen` 13.63 kB).

Live battery re-run against `https://katzu-webapp-v3.pages.dev` on the deployed
commit (bundle `index-DE7WAmP5.js`): **12/12 checks pass** — the offline shell
(`precache=84`, `nav=ok`, root rendered offline) and both signed-out demo checks
included. Full table: `docs/verification-report.md` §14. The run before these
fixes recorded 9/12.

## Known limitations

1. **The arrival seed content is unreviewed.** `airport_arrival`, its six
   phrases and six vocabulary rows are a code fixture in `katzuDb.ts`, written
   so the story has a Day 1; the content team should replace them with a proper
   D1 row (same id keeps the mission wiring) or approve them. Until then the
   scene is honest offline fallback text, not authored curriculum.
2. **The Android retest is still the owner's.** Headless Chromium has no phone
   audio stack; the device checks in §11 of the V2 log (orb deformation,
   endpointing, TTS intelligibility) remain manual.
3. **The OS chime** that comes with the platform recogniser belongs to the
   operating system; no web API can mute it. Accepted cost, not a failure.
4. **The demo needs device content once.** On a genuinely empty, offline first
   visit it states that honestly instead of inventing a lesson (by design).
5. **This file continues the numbering of `KATZU_V2_IMPLEMENTATION_LOG.md`.**
   That file is at its editor's reach limit and is not edited again.

## 16. Episode trace and uncompleted stability gates (2026-09-27)

This section records investigation only; no runtime source, schema, curriculum, art, or Worker
code was changed during this continuation.

### Phase 3 trace

- **Scenario → vocabulary:** the scenario's category is joined to D1 vocabulary topic by
  `scenarioToVocabTopic()` in `src/lib/utils/scenarioVocab.ts`. For `airport_arrival` and
  `train_station`, category `travel` resolves to topic `travel`. `StudyScreen`,
  `GuidedPracticeScreen`, and `QuizScreen` query that topic. Quiz refreshes scenario detail,
  resolves the same topic, and refreshes that vocabulary pool through `workerClient`; its
  questions use vocabulary rows from that pool and starter phrases keyed to `scenario_id`.
- **Live Conversation context boundary:** the conversation component reads the full local
  vocabulary table only for known-word selection. `workerClient.sendTurn()` sends scenario id,
  transcript, level and learner memory; `cloudflare-ai-chat.js` resolves server-authoritative
  title/persona and the learner-memory prompt. It does not receive the Study/Quiz topic pool.
  Thus the same vocabulary *association* powers Study, Guided Practice and Quiz but is not
  supplied as prompt context to Live Conversation. No additional context/schema was added.
- **Grammar:** `selectGrammarRule()` returns a global grammar-row `id` nearest the learner's
  level and rotates deterministically by day. D1/Dexie grammar rows have `id` and `level`, but
  no scenario association. Live Conversation's model-generated `grammar_rule` is prose, stored
  in `MistakeEntity.grammarRule`; `buildLearnerMemory()` groups that prose, not grammar IDs.
  Consequently the exact same grammar row cannot be traced from Guided Practice into a live
  correction with the current contract. This is a confirmed association gap; no heuristic or
  new field was introduced.
- **Mistake → SRS → review:** on a correction with both original and corrected segments,
  `LiveConversationScreen.sendTurn()` writes a mistake with `scenarioId`, `grammarRule`, and
  timestamp, then calls `enrolMistake()`. `src/lib/srs/store.ts` skips missing corrected text
  and inserts idempotently using `[kind+refId]`; `newReviewItemFromMistake()` uses the model's
  prose as the Arabic retrieval prompt, corrected German as the target, original German as
  context, and preserves scenario ID/source ID. New items are due immediately. `ReviewScreen`
  constructs a queue through `buildReviewQueue()` (due-only, interleaved, limit 20); grading
  stores the next schedule (good ladder 1/3/7/16/35/90 days; again in 10 minutes) and a mistake
  is marked mastered only after three successful reps. Relevant coverage exists in
  `tests/reviewStore.test.ts` and `tests/srsEngine.test.ts`.
- **Phase 3 conclusion:** there is no correction→queue dead end for a correction carrying a
  corrected sentence. The requested episode-wide grammar identity is not present in existing
  data, and Live Conversation has no shared vocabulary pool in its prompt. Phase 2 was not
  authored: Katzu's content ownership rule and the 15-slot/exact-eight packaging conflict
  remain gates. Therefore this is a partial code trace, not the requested newly authored
  episode acceptance.

### Phase 4 investigation and verification evidence

- `npx playwright test e2e/conversationLayout.spec.ts` passed **2/2** (34.1 s).
- `npx playwright test e2e/journey.spec.ts --grep "first episode|Guided Practice|whole loop"`
  passed **3/3** (1.4 min): arrival priority, Guided Practice content/feedback, and a correction
  through Debrief. A full `npx playwright test e2e/journey.spec.ts` attempt timed out at the
  terminal tool deadline without a summary; it is not counted as pass/fail.
- No before/after baseline was captured for a component split, so the `LiveConversationScreen`
  refactor was not started. No Journey Home query was bounded because no output-equivalence
  baseline was captured. The screen currently calls whole-table `toArray()` for eight tables;
  each has different consumer and index constraints, so a generic limit would risk changing
  mission/capability results.
- `src/lib/design/scenes.ts` still uses external Unsplash art. No `public/scenes/` image assets
  exist, and no real/licensed local artwork was available; no fake binary placeholders were
  created. `rendererTier.ts` exposes only `isSoftwareRenderer(gl)`, consumed during WebGL
  initialization in SiriWave; there is no app-level renderer tier state to set the surface CSS
  variables from. No CSS tier changes were made and no visual low-tier screenshot was captured.
- `callGeminiWithFailover()` has callers within old handler bodies in `cloudflare-unified-worker.js`.
  Live routing delegates turn, translation and hints to `cloudflare-ai-chat.js` and
  `cloudflare-hints.js`, so those old bodies appear unreachable from the route table, but the
  helper and bodies are still textually connected. Removal was deferred rather than risking
  deleting a still-called path without a complete Worker test/syntax gate.

### Gates still open

- Phase 2 content creation, audit of newly authored modules, adversarial review, and honest
  approval: not performed; content-team ownership prohibits authoring/approval here. Existing
  module remains pending; no D1 or Worker write occurred.
- Phase 3: complete trace of a newly authored episode, grammar-row identity continuity, and
  shared vocabulary available to live prompt: not established.
- Phase 4: all five requested engineering items remain unimplemented; the full baseline for
  `journey.spec.ts` did not complete. The build succeeded at **490.20 kB / 157.49 kB gzip** for
  the entry chunk with **83 precache entries**; these are current measurements only, not a
  before/after comparison. No full Playwright parity data or low-tier visual check was produced.
- Phase 5: `npx tsc --noEmit`, `npx tsc -p e2e --noEmit`, `npx vitest run` and `npm run build`
  passed (62 files / 712 unit tests; build as measured above). The full `npx playwright test`
  again exceeded the terminal tool deadline without a summary. Manual QA, content approval,
  newly authored scenario validation and the final approval sentence are not satisfied and must
  not be represented as satisfied.

No deployment, Git delivery command, D1 write, Worker write, or secret/service change was made.

## 17. Verification from this continuation

| Command | Result |
| --- | --- |
| `npx playwright test e2e/conversationLayout.spec.ts` | 2 passed |
| `npx playwright test e2e/journey.spec.ts --grep "first episode|Guided Practice|whole loop"` | 3 passed |
| `npx playwright test e2e/journey.spec.ts` | terminal tool deadline; no test summary |
| `npx tsc --noEmit` | passed |
| `npx tsc -p e2e --noEmit` | passed |
| `npx vitest run` | **62 files / 712 tests passed** |
| `node scripts/audit-curriculum.mjs --file=docs/content/curriculum-30day-module1.json` | passed; 5 scenarios, 74 vocabulary, 30 phrases, 10 grammar; pending |
| `npm run build` | passed; entry 490.20 kB / 157.49 kB gzip; 83 precache entries |
| `npx playwright test --list` | 26 tests in 8 files discovered; full run timed out without a test summary |

The requested final line **must not** be used: content was not self-reviewed/approved and the
full code gates were not completed.

## 18. Current continuation limitations

- No visually interactive browser inspection tool was available in this environment; managed
  preview readiness was previously verified at HTTP 200, but this continuation did not make a
  screenshot/manual visual claim.
- The exact-eight packaging decision and grammar-to-scenario identity contract need an explicit
  content/product-owner resolution before the corresponding requirements can be completed.
- `public/scenes/` remains absent; the placeholder art request requires real supplied or approved
  image assets.

The prior content reconciliation is §15; this continuation records the verified partial trace
and gates rather than changing runtime behavior.
