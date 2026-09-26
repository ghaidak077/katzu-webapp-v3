# Katzu — Learning Roadmap (A1 → B2)

**Status:** plan for owner review · written 2026-09-25
**Scope of this document:** app quality, learning method, content, and the four skills
(speaking, listening, reading, writing) for **A1–B2 only**, with German exam readiness.
Payment, domain, and legal items are deliberately out of scope.

Everything below is grounded in what the code actually does today (verified in this
repository), not in what the docs claim. Where a claim is measured, the measurement is
given.

---

## 0. Audit and ranked plan (2026-09-26)

Everything here is measured, not recalled. Where a number appears, it was read this session.

### 0.1 Measured state

| Area | Measurement |
| --- | --- |
| Tests | **42 files · 456 tests, all passing**; `tsc --noEmit` clean; 11 worker modules pass `node --check` |
| Bundle (before today) | **one 619 kB chunk / 183 kB gzipped** — Vite warned on every build (`chunkSizeWarningLimit`) |
| Bundle (after today) | entry **424.57 kB / 135.4 kB gzipped**, 21 screens in their own chunks, 83 precache entries (all 36 built chunks precached, so offline still works) |
| Memory engine | shipped: scheduler, review screen, enrolment from study/words/conversation/writing/placement, `/review/sync` merge, Dexie v4 |
| Placement | shipped: adaptive check, post-sign-in gate, level override, missed questions seed the review queue |
| Skills | speaking, listening (dictation), writing (graded) — **reading is the only one absent** |
| Content (live D1) | 5 scenarios · 114 vocabulary (A1 31 / A2 30 / B1 27 / B2 26) · 4 grammar rows · 20 starter phrases |
| Content authoring | live Content Studio (schema, per-row validation, upsert/dedupe, gated sync deletes, export) + `docs/CONTENT-AUTHORING-PROMPT.md` |
| AI cost shape | **one** model call per learner turn (reply + grade fused), KV-backed translation/hint caches, tiered pool with a terminal day-quota ledger, Workers AI as last resort |
| Robustness | route error boundary, offline navigation fallback, client crash reporting, honest 401s on the session routes, no silent progress loss |

### 0.2 What today's audit closed

1. **The tutor never saw the learner's mistakes.** `learner_memory` was validated by the worker
   (`≤10 items × ≤200 chars`) and then discarded, and no client code ever produced it: every
   correction was stored, scheduled — and invisible to the model that could act on it. Now
   `buildLearnerMemory()` (grouped by rule wording, most repeated first, spelling-only dropped,
   fully-mastered rules dropped) is sent with each turn and appended to the prompt as a second
   system part, so the stable half of the instruction keeps its cache prefix. Costs nothing
   extra: same single call.
2. **First load was the whole app.** Route-level code splitting + a guarded
   `vite:preloadError` recovery (a deploy that swaps chunks mid-session recovers with one reload,
   never a loop).

### 0.3 The plan, ranked by learning impact per unit of complexity

The ordering rule is unchanged: **memory → placement → content depth → polish**. Items above
line "later" are the ones that change outcomes; the rest is craft.

| # | Item | Effort | Why this rank |
| --- | --- | --- | --- |
| 1 | **Content depth: 5 → ~13 scenarios** using the studio + `CONTENT-AUTHORING-PROMPT.md`, one module per work block (registration, work, housing, health, money/contracts) | L, mostly authoring + human review | The engine is built and now authorable; content is the only thing standing between the current demo and weeks of study. Nothing else multiplies without it. |
| 2 | **Reading — the fourth skill.** Additive `reading_texts` table (via the worker's admin schema path — the workspace token still cannot run DDL), the 5 texts already authored in the module-1 `deferred` block, a reader screen with tap-to-gloss (reuse `WordInsightBottomSheet`) and MCQ comprehension | M–L | Finishes "four skills or it is not a course" and is the last exam-credible claim we cannot make today. |
| 3 | **Grammar drills, deterministic.** Fill-in-the-blank and sentence-transformation generated from `grammar` rows (4 today → ~10 per module after #1). No AI call per question | M | Converts a read-only table into production practice for free, and gives the correction card somewhere to send the learner. |
| 4 | **Intent capture + a trail that reflects it.** Goal (work / study / family / daily), time to arrival, target certificate; the trail reorders and weights the same library | M | Placement already sets the level; intent is what turns "a level" into "a plan I believe in" — the conversion lever. |
| 5 | **One call per session, not just per turn: the debrief.** A single extra call at session end that summarises what the learner did well, what recurs, and what tomorrow's review will contain | S | Highest visible value per token of anything left on this list, and it is one call per session rather than per message. |
| 6 | **Exam-mode task bank** (Goethe/telc/DTZ formats, A1–B2) as content, trained through the screens that already exist (listening drill, graded writing, conversation) | L, content-bound | The differentiator the marketing claims, but it must follow #1 — a format with no content is a screenshot. |
| Later | per-skill breakdown inside the session report, prompt-level personalisation tests, vendor chunk splitting (needs a `vite.config.ts` change), leagues/social, pronunciation scoring | — | Polish, not learning. The three in the middle are legitimate; the last three are on the rejected list in `AGENTS.md` and stay there. |

### 0.4 How to keep exploiting the stack we already pay for

- **Models:** one call per learner turn is already the floor for roleplay + grading; the next
  saving is *per session* (debrief, #5) and *not calling the model at all* where content is
  deterministic (#3). Never add a second provider; the pool + ledger exists to make one provider
  outage survivable, not to multiply spend.
- **D1/KV:** content and telemetry live in D1; the shared AI cache and the day-quota ledger live
  in KV. Any new capability that can be content or a cache should not become a new table without
  a reason, and no migration may be destructive.
- **PWA/Dexie:** the app must stay fully usable offline; every new screen inherits the precache
  and the `review_items` queue rather than inventing its own storage.
- **Learner memory:** it is now the model's context, and it should also drive what the daily
  mission proposes (the same `buildLearnerMemory`/mistake-profile data, no separate pipeline).

---

## 1. Where the product actually stands today

### 1.1 The loop that exists

```
Trail  →  Scenario  →  Study (flashcards)  →  Quiz (4 multiple-choice)  →  Live Conversation  →  Session Report
                                                                                                      ↓
                                                                                          XP · streak · missions · promotion
```

Verified in code:

| Piece | Reality |
| --- | --- |
| Conversation engine | Two AI calls per learner turn — an in-character roleplay reply, then a **separate** pedagogical evaluation (so the partner character never breaks to correct you). JSON-schema enforced, 6-message window, Arabic roast on German grammar absurdity, `next_hint` + an Arabic follow-up question. |
| Quiz | `generateQuizQuestions()` builds 4 MCQ items from real D1 vocabulary + starter phrases. It already refuses ambiguous Arabic glosses (`optionsCollide`) and rejects non-Arabic translations. |
| Progress | XP, streak, rotating daily missions, and a level-promotion rule (3 sessions at a level, ≥4 independent sentences each, ≥75% average accuracy). |
| Hints | 2–4 *distinct conversational moves* per turn with an intent tag, plus cached starter phrases as an always-available floor. |
| Offline | Dexie + service-worker precache; `/progress/sync` + `/progress/get` with a retry queue. |
| Free tier | 3 AI sessions, enforced per session id server-side; paywall at exhaustion. |

**This is a genuinely good core.** The roleplay/evaluation split is better than most
competitors, and the hint-move design is real pedagogy, not decoration.

### 1.2 The measured gaps

| Gap | Measurement | Consequence for the learner |
| --- | --- | --- |
| **No memory engine** | `nextReview`, `reviewDue`, `srs` → **0 references in 46 source files** | They practise a word once and never see it again. This is the single largest learning defect in the product. |
| **No placement** | `placement`, `levelTest` → **0 references** | Everyone starts at A1 regardless of ability. An A2 learner is bored on day one and leaves. |
| **Only two of four skills** *(partly closed 2026-09-25: listening and writing shipped; reading remains)* | Speaking (conversation) + recognition (MCQ). No reading, no listening, no writing task types exist. | Cannot honestly claim to prepare anyone for an exam — Goethe/telc/DTZ all test four modules. |
| **Content is a thin slice** | Live: **5 scenarios**, 114 vocabulary rows, **4** grammar rules, 20 starter phrases | 5 scenarios is a demo. It cannot carry weeks of study, so retention dies before payment is ever a question. |
| **No mistake memory** | `mistakes` rows are stored but never resurfaced except in one practice screen; no taxonomy | The app forgets your error pattern. A coach's core value is remembering what *you* keep getting wrong. |
| **No competency model** | Progress = XP, streak, accuracy % | XP is not learning. Nobody can answer "what can I now do in German?" |
| **No analytics** | `analytics` → **0 references** | We cannot see where learners quit, so we cannot improve the funnel. |
| **No crash reporting** | `Sentry`/client error reporting → **0 references**; server side has `error_reports` | A silent client crash is invisible. |

### 1.3 What "replacing a course and a coach" actually requires

A course gives you a **sequence**, a **syllabus**, **four skills**, and **exam fidelity**.
A coach gives you **memory of your errors**, **corrective feedback**, **accountability**,
and **someone to speak to daily**. Katzu already has the hardest and most expensive piece
— an always-available patient conversation partner with Arabic explanations. What it lacks
is the *system around it*: sequence, memory, the other three skills, and proof of progress.

---

## 2. What the best apps do — and where the opening is

| App | What it wins on | What it does badly |
| --- | --- | --- |
| **Duolingo** | Habit mechanics (streak, leagues, short sessions). World-class retention engineering. | Shallow spaced repetition, almost no real speaking, weak exam relevance. |
| **Babbel** | Structured curriculum, grammar taught explicitly, real dialogues, CEFR-aligned path. | Speaking is scripted; little free production; not built for immigration timelines. |
| **Busuu** | Native-speaker community correction on your writing/speaking; official certificates. | Feedback is slow and inconsistent; no daily conversation partner. |
| **Pimsleur** | Audio-first, **graduated interval recall**, forces you to produce out loud. Excellent for spoken fluency. | No reading/writing depth, no visual context, dated UX. |
| **Speak / Langua (AI)** | High-volume AI speaking with instant feedback. | English-first, not Arabic-native, thin grammar explanation, no exam formats. |
| **Anki** | The real thing for spaced repetition; unbeatable retention per minute. | Brutal UX, no curriculum, no speaking, no feedback — you must supply everything. |
| **italki / Preply** | Real humans: accountability and genuine interaction. | $10–25/hour. Most learners in our target market cannot sustain it. |

**The consensus of the evidence is consistent:** progress comes from *comprehensible input*
+ *pushed output* + *spaced retrieval* + *immediate corrective feedback* + *interleaving*
(practising mixed material rather than blocked repetition). No mainstream app delivers all
five for Arabic speakers learning German for immigration.

**Katzu's opening — state it plainly in marketing:**

> Arabic-first · trains the German you actually need in Germany (bureaucracy, Arbeit,
> Wohnung, Arzt, Studium) · you speak out loud every single day · it remembers your
> mistakes and brings them back at the right time · and it trains the real Goethe/telc/DTZ
> task formats, not a game that pretends to be an exam.

Nothing in the market occupies that position. That is the whole business.

---

## 3. The plan

Seven phases. Each is independently shippable, and each ends with something a learner can
feel. Ordered strictly by *learning impact per unit of complexity*.

### Phase 0 — Make the core honest and unbreakable
**Goal:** no dead ends, no silent failures, no fake progress.
**Effort:** small.

1. **Client error capture → the existing `error_reports` D1 table. SHIPPED 2026-09-25.**
   Uncaught `window`/`promise` errors are POSTed to `POST /client-error` and land in the
   `error_reports` feed the admin dashboard already reads. The route is unauthenticated (the
   app can crash before sign-in) but IP rate-limited to 8/min, body-capped, and every stored
   message goes through the existing credential sanitizer. **Console output is deliberately
   NOT forwarded** — it can carry a learner's own German — and each crash is sent once, at
   most 8 per session, so a render loop cannot flood it
   (`tests/clientErrorReport.test.ts`, `tests/clientCrashReporting.test.ts`).
2. **Error boundary per route.** A thrown render currently blanks the app. One `ErrorBoundary`
   component wrapping `<Routes>` with an Arabic recovery screen ("أعد المحاولة" / "افتح بدون نت").
3. **Mic-denied and offline paths must always end somewhere.** Every failure state gets a
   guaranteed alternative: type instead of speak, cached hints instead of AI hints, nothing
   lost on quota exhaustion. **Offline navigation SHIPPED 2026-09-25:** the built service
   worker had no navigation fallback, so opening the installed app with no connection showed
   the browser's error page and *every* offline path was unreachable — the exact moment a
   learner on a train needs the app. `navigateFallback: 'index.html'` is now pinned by
   `tests/pwaOffline.test.ts` and verified in the generated `sw.js`.
4. **Honesty audit of the session report.** Never show a metric that was not measured
   (already true for independent vs. hint-assisted — keep that standard everywhere).

**Done when:** a headless run of every route produces zero console errors, and any blocked
action offers a working alternative.

---

### Phase 1 — The memory engine (spaced repetition) — *the single biggest lever*
**Goal:** the app remembers what you are about to forget, and brings it back at the right time.
**Effort:** medium · **Impact:** highest of anything in this document.
**Status: SHIPPED 2026-09-25.** `src/lib/srs/engine.ts` (scheduler, answer grading,
interleaved queue), `src/lib/srs/store.ts` (enrolment + grading), Dexie schema **v4**
(`review_items`, additive), `/app/review` (`ReviewScreen`), a "مراجعة اليوم: N" entry point
above the daily mission on the Trail, and automatic enrolment from studied vocabulary,
bookmarked words, and every conversation correction. 32 new tests
(`tests/srsEngine.test.ts`, `tests/reviewStore.test.ts`) cover the scheduler rules and the
real migration over IndexedDB.

**Both open items closed 2026-09-25:**

- **The queue syncs across devices.** `POST /review/sync` stores the schedule in
  `USER_PROGRESS` under `review:<sub>` and is the *single* merge authority: the client uploads
  its whole local queue, the worker merges it and returns the merged set, and the client
  adopts exactly what comes back. It runs at sign-in (so a new phone gets its schedule back
  instead of starting the learner's memory at zero) and when a review session finishes.
  Unit-tested guarantees: a stale second device cannot undo a finished review, an empty
  local queue still returns the stored one, two accounts never share a queue, and junk client
  rows are dropped rather than stored as unanswerable cards (`tests/reviewSync.test.ts`,
  plus adoption in `tests/reviewStore.test.ts`).
- **The version-bump hazard is closed at the source.** `vite.config.ts` keeps
  `registerType: 'autoUpdate'`, so the built `sw.js` sends `skipWaiting` +
  `clientsClaim` and a new deploy takes over immediately instead of leaving a stale bundle
  running against a newer database; `initializeDatabaseSeed` keeps its one-shot reload guard
  as the backstop.

**Still open in this phase (deliberately):** nothing. The engine is complete for the three
kinds the model defines (`vocab`, `phrase`, `mistake`); grammar/listening items would be new
content kinds, not new scheduling.

**Why this first:** the app currently teaches a word once. Everything else — content, exam
mode, gamification — multiplies an engine that does not yet exist. Adding scenarios without
spaced repetition just makes more words to forget.

**What to build**

- **New Dexie table, `review_items` (schema v4, additive upgrade — same pattern as the
  existing v2/v3 migrations, so no learner data is touched):**
  `++id, userId, kind, refId, dueAt, interval, ease, lapses, reps`
  where `kind ∈ { vocab, phrase, mistake, grammar, listening }`.
- **`src/lib/srs/engine.ts`** — a small, boring, testable scheduler. Intervals
  1 → 3 → 7 → 16 → 35 → 90 days with an ease adjustment and a hard "again" reset. Do **not**
  build FSRS; a well-tuned SM-2 lite behaves nearly identically at our volume and cannot
  regress into opacity.
- **`src/features/review/ReviewScreen.tsx` at `/app/review`** — one mixed session that
  **interleaves** kinds and scenarios (evidence favours mixed practice over blocked). Each
  item is *produced*, not merely recognised: type or say the German, reveal, self-grade
  again/hard/good. Recognition-only review is the trap that makes Duolingo graduates unable
  to speak.
- **Mistakes auto-enrol.** Every correction the conversation engine already produces
  (`MistakeEntity` — it has `isMastered` but nothing ever schedules it) enters the queue and
  is retested as production, not as a multiple-choice question.
- **Trail shows "due today: N" as the primary action.** This is the daily hook, and it is
  honest: the number is real.
- **Sync it.** Extend the existing `ProgressPayload`/`/progress/sync` shape so review state
  survives a device change — otherwise the engine dies with a cleared browser.

**Done when:** a learner who studies today sees the same items again tomorrow, and not the
day after that; and D2/D7 return rate exceeds the Phase-0 baseline by a measurable margin.

---

### Phase 2 — All four skills (listening, reading, writing)
**Goal:** stop being a speaking app with flashcards. Cover the skills every exam tests.
**Effort:** medium–large.

**Status: LISTENING SHIPPED 2026-09-25.** `src/lib/listening/drill.ts` (sentence-first drill
queue, and a dictation scorer that forgives spelling variants but names the words that were
missed) and `/app/listen`, reachable from the Practice hub. The drill plays German through the
app's existing speech synthesis with a 0.8× replay, and on a device with no speech synthesis it
shows the sentence for three seconds and hides it instead — the drill still works rather than
becoming a dead end. Missed sentences are enrolled into the same review queue as everything
else, so listening gaps are not a separate forgotten list. 18 new tests.

**Why dictation rather than "choose what you heard":** every other exercise in the app can be
passed by recognising text on screen. Dictation cannot. It is the only one that forces the
learner to hold the sound, segment it into words, and reconstruct German — the skill needed in
a Bürgeramt queue or on the phone.**WRITING SHIPPED 2026-09-25 — three of the four skills now train.** `POST /ai/check-writing`
(handler + `cloudflare-writing.js`) grades a real exam-shaped task at the learner's level
(short message → appointment request → formal email → complaint) against a four-dimension
rubric — task, coherence, grammar, vocabulary — and returns the text with its errors fixed,
1-2 sentences of Arabic on what to fix first, and up to five corrections each with its rule
and an Arabic explanation. Two things are deliberately server-authoritative: the task is
derived from the level and validated (a client cannot show one task and be graded on
another), and `percent` is computed from the dimensions the model actually returned, so a
missing dimension is not a zero and no score is invented. Empty or unusable model output is
an error with an Arabic retry, never an empty sheet.

`/app/write` (from the Practice hub) takes the topic from the scenario the learner most
recently trained, so writing sits inside the situation they are preparing for. Every
correction is written into `mistakes` and enrolled in the **same** review queue as the
conversation's, which means what they got wrong in writing comes back in the memory loop
instead of living in a separate screen. 20 new tests (`tests/writing.test.ts`), including the
client/worker task contract, the clamps, and the paywall path through the real router.

**Per-skill measurement, honestly.** `skill_practice` (Dexie **v5**, additive) stores one row
per finished dictation and per graded text, and the Progress tab shows the four skills using
only measured rows — `null` renders as «لم تُقس بعد» rather than a zero, and reading says it
has not started. `tests/skillPractice.test.ts` pins that rule; the skills card is the easiest
place in a language app to quietly invent a number.

**Still open in this phase:** reading texts (needs a `reading_texts` D1 table plus authored
content — the one genuinely blocked item, because this workspace's Cloudflare token has no
`D1:Edit` scope), grammar production drills generated from the existing `grammar` rows rather
than one AI call per question, and a per-skill breakdown inside the session report itself.

**Authored but not shippable yet (2026-09-25):** five reading texts with Arabic translation and comprehension questions, five writing tasks with rubrics, and five exam-format tasks for module 1 exist in the `deferred` block of `docs/content/curriculum-30day-module1.json`. They are deliberately outside the loadable tables — no script reads them and the audit fails if a loadable table name appears there — because the three tables they need do not exist. See `docs/CURRICULUM-DRAFT.md`.

- **Listening — dictation.** Play German through the existing TTS (`useSpeechOutput`), learner
  types what they heard, diff-scored with tolerance for umlauts/ß and punctuation. Include a
  slow replay (the existing `speechSpeed` preference already supports it). No new
  infrastructure and no per-item cost. Start with one dictation item per scenario, drawn from
  its real starter phrases.
- **Reading — short graded texts.** New D1 table `reading_texts` (`id, scenario_id, level,
  title_de, body_de, translation_ar, questions_json`), plus a reader screen with **tap-to-gloss**
  — reuse the existing `WordInsightBottomSheet`, which already does exactly this job. Add
  comprehension questions in the same MCQ shape the quiz generator already produces.
- **Writing — graded production.** New endpoint `POST /ai/check-writing` (single call, no
  roleplay): learner writes a short German text (B1/B2: email to a landlord, complaint,
  application), receives a rubric-scored correction — task fulfilment, coherence, grammar,
  vocabulary — a corrected version, and an Arabic explanation of *why*. This is where a coach
  is most expensive and where AI is genuinely better than a course.
- **Grammar production drills.** The `grammar` table exists but holds only 4 rules and is
  read-only in the learner flow. Add fill-in-the-blank and sentence-transformation drill
  types generated deterministically from grammar rows — **not** one AI call per question.

**Done when:** every scenario carries at least one item in each of the four skills, and the
session report shows per-skill progress instead of only a speaking score.

---

### Phase 3 — Placement and personalisation
**Goal:** know the learner on day one; give them a reason to trust the app immediately.
**Effort:** small · **Impact:** very high for perceived value and conversion.

**Status: MEASUREMENT SHIPPED 2026-09-25.** `src/lib/placement/engine.ts` (a 2-up/1-down
staircase, convergence rule, and the Arabic result wording) and `generator.ts` (questions
drawn from the existing D1 vocabulary and phrases at the learner's current level), the
`/placement` screen, a post-sign-in gate so a never-measured learner is placed before the
Trail, a level override in Profile, and the questions they missed seeding their first review
session. 22 new tests.

**Still open in this phase:**

- **Intent capture.** Onboarding still collects only minutes/days/level, not goal (work /
  study / family / daily life), time to arrival or exam, or target certificate.
- **A Trail ordered by that intent.** Placement sets the level; it does not yet reorder or
  weight the curriculum. Same content library, different sequence, is still unbuilt.
- **Grammar items.** The check asks vocabulary, sentence, and listening questions only. There
  is no grammar *question* content in D1, and inventing it inside app code would break the rule
  that content lives in the backend — it belongs in the content work of Phase 5.

- **`/placement` — a 3–4 minute adaptive check** mixing listening, reading, and grammar
  items. Start at A2 difficulty, escalate or step down on correctness. Output: a level with a
  plain Arabic explanation of *why* ("فهمت الجمل الطويلة وتمييز الأزمنة، لكن أدوات التعريف
  ما زالت تسبب أخطاء") — an explanation, not just a label. The learner can override it.
- **Onboarding captures intent, not just a name:** goal (عمل / دراسة / عائلة / حياة يومية),
  time until arrival or exam, and target certificate. Route through the existing
  `GoalSelectionBottomSheet` pattern.
- **The Trail is generated from that.** A learner heading to a B1 exam in six months sees a
  different sequence from someone who arrived last week — same content library, different
  order and weight. No new content required to make this feel personal.
- **Seed the review queue from the placement result** so day one already has a warm-up set.

**Done when:** a returning A2 learner is no longer taught `der/die/das` from zero, and the
Trail's first three nodes visibly reflect the stated goal.

---

### Phase 4 — Exam mode (A1–B2)
**Goal:** become the thing learners pay for because a certificate is at stake.
**Effort:** large, and mostly content — but the highest-value claim in the market.

Note: the German equivalences of the exams you mentioned are **Goethe-Zertifikat**
(A1–B2, plus DTZ for the integration course), **telc**, and **TestDaF/DSH** for university
(TOEFL is the English-language analogue — same idea, wrong language).

All of these test **four modules: Lesen · Hören · Schreiben · Sprechen.** So:

1. **Module training** — per-level task types that mirror the real formats (matching
   notices, adverts, forms; short announcements; formal email; picture/plan description;
   opinion statement).
2. **Timed mock exam** — full run with a visible clock and a scored report per module, shown
   against the real pass thresholds, with an honest verdict ("Lesen: 78 % — قريب جداً من
   النجاح. Hören يحتاج عملاً.").
3. **Report maps to action** — every wrong answer routes into the review queue and the
   targeted drill set. The exam result is not the end of the session; it *is* the next plan.
4. **Content first, code second.** The engine is a handful of screens plus a scoring table;
   the real work is authored items, and it must go through the review gate below.

**Sequencing recommendation:** ship **DTZ/Goethe B1 first.** That is the certificate that
blocks residence permits and most jobs, it is the level where our audience actually is, and
it is the level where learners are already paying for courses today.

---

### Phase 5 — Content depth: 5 scenarios → 30+  *(the real retention lever)*
**Goal:** a library that justifies weeks of study and a monthly price.
**Effort:** ongoing; mostly authoring, with a strict quality gate.

**Shipped so far (2026-09-25): the draft pipeline and module 1.** Module 1
(الوصول والتسجيل — 5 scenarios, 74 vocabulary rows, 30 starter phrases, 10 grammar
points, plus five reading texts, five writing tasks and five exam-format tasks)
is authored in `docs/content/curriculum-30day-module1.json` and **explicitly
unreviewed**: it is in no database and no learner can see it. What *is* shipped and
enforced is the pipeline around it. `src/lib/content/curriculumAudit.ts` validates a
draft against the real D1 column contract, the real `scenarioToVocabTopic` join and
the per-scenario standard — with no dependency on `@/` aliases, so a Node CLI and
the test suite enforce identical rules. `scripts/audit-curriculum.mjs` runs it in CI
through `npm test`; `tests/curriculumAudit.test.ts` (22 tests) gates the shipped
draft and pins every rule; and `scripts/load-curriculum.mjs` is the only sanctioned
load path — dry-run by default and refusing to write while `review.status` is not
`approved`. It is idempotent (existing rows are skipped, because `vocabulary` has no
unique key) and verifies the write against the public `/scenarios` and `/vocabulary`
endpoints afterwards. Review surface: `docs/CURRICULUM-DRAFT.md`.

**Still open in this phase:** the module cannot be loaded by an agent —
`ADMIN_SECRET` is not in the workspace environment and the Cloudflare token has no
`D1:Edit` scope (`code 7403`), so the owner runs one command after reviewing.
Modules 2–6 are not written. Vocabulary pools per *topic*, not per scenario, so
two scenarios sharing a category share one word pool — after this module loads the
`documents` pool spans three scenarios, which dilutes quiz relevance. Fixing that
needs a `topic` column on the scenarios table. D1 also has no `status` column, so
the review gate is a process guarantee rather than a database constraint.

- **Track: "أول 30 يوم في ألمانيا" — 6 modules × ~5 scenarios.** Arrival & registration ·
  bureaucracy & documents · housing · work & Ausbildung · health · study & university.
  Each scenario is a place a learner will actually stand in.
- **Per-scenario quality standard (enforced, not aspirational):** 4 openers (already there) ·
  15–25 vocabulary rows · 6–10 starter phrases · 2–3 grammar points · 1 reading text ·
  2 listening items · 1 writing task · 1 exam-style task. Every scenario then feeds all four
  skills *and* the review queue by construction.
- **Content states in D1: draft → reviewed → approved.** Only `approved` renders as
  production curriculum, so half-finished material can never reach a learner.
- **Runs in CI.** `scripts/audit-quiz-content.mjs` already exists; extend it to validate
  schema, level plausibility, Arabic sanity (no empty/non-Arabic glosses), and the
  per-scenario standard above. A content regression should fail the build like a code one.
- **Authoring shortcut that respects the rule "content never lives in app code":** generate a
  first draft per scenario (AI-assisted), then require human/owner approval before it becomes
  `approved`. AI drafts are unlimited; **unreviewed AI content never ships.**

**Done when:** 30+ approved scenarios exist with full four-skill coverage, and the audit
script gates them all.

---

### Phase 6 — Coach intelligence
**Goal:** the thing a course cannot do — remember *your* mistakes and act on them.
**Effort:** medium.

- **Mistake taxonomy.** Classify each existing `MistakeEntity` into
  article / case / word order / verb conjugation / vocabulary / spelling, derived from the
  grammar rule the evaluator already returns.
- **Error profile screen** ("ملف أخطائك"): your top three recurring errors, how they trend over
  time, and a one-tap drill built from your own mistakes. This screen alone justifies
  "coach" language.
- **Competency model — 5 states** per can-do statement
  (NOT_STARTED → INTRODUCED → PRACTISING → INDEPENDENT → RETAINED), fed by the review engine
  and the conversation reports.
- **Session report leads with capability, not points:** "you can now order in a café without
  hints" beats "+40 XP". Keep XP as the garnish, never the headline.
- **Weekly Arabic progress report** in-app: what improved, what regressed, what is next.

**Done when:** a learner can see, in one screen, exactly which German patterns they personally
keep breaking — and fix them without leaving the screen.

**Shipped so far (2026-09-25):** mistake taxonomy + error profile + drill.
`src/lib/coach/taxonomy.ts` classifies every correction into article / case / word order / verb
forms / preposition / vocabulary / spelling, keyword-based and deterministic — no AI call per
mistake, and it works offline. `src/lib/coach/profile.ts` aggregates it and enforces the honesty
rules (no pattern claimed below 3 recorded mistakes; a mastered mistake is never shown as an open
weakness). `src/features/coach/CoachScreen.tsx` at `/app/coach` shows the top three patterns with
real examples from the learner's own corrections and pushes that category to the front of the
review queue, so the drill is the memory engine rather than a second, parallel one.

**Still open here:** the 5-state competency model, the weekly Arabic report, and session reports
leading with capability. The competency model needs the four-skill task types (Phase 2) before it
can score anything but conversation.

---

### Phase 7 — Habit and marketability
**Goal:** make it easy to start, easy to return to, and easy to tell a friend about.
**Effort:** small–medium.

- **A real public landing page.** Today `/` bounces a stranger straight into a name form and
  sign-in; the sales site is the only marketing surface. A public page must state the promise
  (Arabic-first, daily speaking, real German, exam-ready), show Katzu, and offer **a taste
  before the account** — one free scenario reachable without sign-in. Nothing else will convert
  cold traffic, and the login wall is currently the biggest leak in the funnel.
- **One clear daily action.** "اليوم: 5 دقائق مراجعة + مشهد واحد." One button, honest count.
- **Shareable progress card** in Arabic — organic acquisition from a market that lives on
  WhatsApp and Telegram.
- **Streak protection and a real weekly goal** (the `weeklyGoalDays` field already exists and
  is unused): a missed day must be recoverable, never punitive — punitive streaks generate
  churn, protective ones generate loyalty.
**Shipped so far (2026-09-25): the public landing page.** `/` used to be a blind
redirect to `/app/trail`, so a stranger was bounced straight into a name form and
had nothing to read — cold traffic converted at zero.
`src/features/marketing/LandingScreen.tsx` now states the promise in Arabic and RTL
(Arabic-first, German for real life, speak out loud daily, honest progress), shows
Katzu, and routes into `/welcome` and `/signin`; a signed-in learner sees "متابعة
رحلتك" instead of the pitch. Every claim is limited to what the app actually does —
reading, writing and exam formats are listed under "قريباً", not marketed as shipped.
Two real funnel defects were fixed with it: the privacy and terms pages were
unreachable to signed-out visitors (the route bounced them to sign-in), and the
unknown-route fallback sent strangers to an onboarding form instead of the landing
page.

**Still open in this phase:** a taste before the account (one free scenario without
sign-in), the shareable Arabic progress card, streak protection and a real weekly
goal (`weeklyGoalDays` exists and is unused), and the free-tier rebalance below.

- **Free tier rebalance.** Three AI sessions is a hard wall in front of the value. Give the
  first scenario *fully* free (all four skills, a complete conversation), then build the
  paywall around the moment the learner wants more scenarios and levels — not around their
  first conversation.

---

## 4. What we deliberately will NOT build (anti-bloat)

Complexity is a permanent cost, and every item here is a distraction from the loop above:

1. **No new backend, database, or AI provider.** Cloudflare Worker + D1 + KV + the existing
   Gemini/Workers-AI failover is more than sufficient and already hardened.
2. **No avatars, video tutors, or 3D anything.** They cost money, add latency, and teach
   nothing.
3. **No leagues, social feed, or leaderboard.** Pure retention theatre with real
   infrastructure cost; our audience's motivation is a certificate and a job, not a badge.
4. **No pronunciation-scoring ML.** Scores for Arabic-L1 German would be unreliable and
   dishonest; instead let learners re-record and compare against TTS.
5. **No C1/C2.** A1–B2 is the whole market that matters now. Depth beats range.
6. **No free-form AI content without human approval.** Unlimited generation, gated delivery.
7. **No second content system.** D1 + the admin dashboard + the audit script stay the one
   pipeline.

---

## 5. Sequencing

| Order | Phase | Effort | Depends on | Learner-visible outcome |
| --- | --- | --- | --- | --- |
| 1 | 0 · Stability & honesty | S | — | Nothing breaks silently; every blocked action has a way forward |
| 2 | 1 · Memory engine (SRS) | M | Phase 0 | "It brings back exactly what I was forgetting" |
| 3 | 3 · Placement & personalisation | S | — | "It knew my level in three minutes" |
| 4 | 2 · Four skills | M–L | Phase 1 | "I also read, listen and write — not just talk" |
| 5 | 5 · Content depth 5 → 30+ | L (content) | Phase 2 | "There is enough here for months" |
| 6 | 6 · Coach intelligence | M | Phases 1–2 | "It knows my personal mistakes" |
| 7 | 4 · Exam mode (B1 first) | L | Phases 2, 5 | "It prepares me for the certificate that changes my life" |
| 8 | 7 · Habit & marketability | S–M | Phase 1 | "I have a reason to open it every day" |

Note the deliberate ordering: **the memory engine and the placement test come before more
content.** Adding 25 scenarios to an app that forgets everything is the most expensive
mistake available to us.

## 6. How we will know it is working

**Stability (must never regress):** zero console errors on the deployed app · zero failed
AI turns without a fallback · crash-free session rate.

**Learning (the actual product):** reviews completed per active learner per day · items
retained at 30 days · independent-sentence accuracy trend (already measured today — keep the
honest split) · can-do statements per learner per month.

**Depth:** approved scenarios per level · four-skill coverage per scenario · % of exam task
types implemented per level.

**Trust:** no metric displayed that was not measured. If we ever show progress that did not
happen, we have become the thing we are trying to replace.

## 7. Recommended next three moves

1. **Phase 1 (memory engine).** Highest learning impact, no external dependency, and it makes
   every existing scenario more valuable before a single new one is written.
2. **Phase 3 (placement).** Small, and it converts "another app that starts at A1" into
   "an app that knows me".
3. **Phase 5, first module only** (Arrival & registration, 5 scenarios, full four-skill
   standard) as the template that proves the content pipeline before scaling to 30.

Phase 0 ships alongside all three as continuous hygiene, not as a separate project.
