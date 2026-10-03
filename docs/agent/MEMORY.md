# MEMORY — durable facts and mistakes that must survive every session

Read this **second** (after `AGENTS.md`, before `docs/agent/APP-MAP.md`). It is the compact,
curated memory layer: the things that have cost real runs, the ids you should not re-derive,
and the decisions that are frozen. The raw append-only log is `docs/agent/LESSONS.md`; this
file is the digest that is short enough to always read.

**Rules for editing this file (agent-owned):**
- Add a **mistake** only when the root cause is *proven by a tool result* — one line:
  `symptom → proven cause → rule`. No speculation, no "probably".
- When the same trap recurs, move it up, not out. If it repeats 2× and a section of
  `AGENTS.md` would prevent it, propose the change in the report (never edit §3 yourself).
- Keep it under ~140 lines. Prune anything already encoded in `AGENTS.md`.
- **Update in the same commit** as the change it describes. If a durable fact changes (URL,
  id, quota, level range), fix the row here immediately.

*Last consolidated: 2026-10-04 (V30).*

---

## A. Canonical facts (do not re-derive; remeasure only if a command fails)

| Fact | Value |
|---|---|
| Repo root | `C:/Users/Lenovo/Desktop/k1/katzu` (shell starts at `/c/Users/Lenovo/Desktop/k1`) |
| Branch of record | `launch-hardening` (named in the ledger, not hardcoded) |
| Remote | `github.com/ghaidak077/katzu-webapp-v3` |
| Node here / in CI | v24.14.0 here; **24.15.0** pinned in CI (EBADENGINE warning here is expected) |
| Gate commands | `npx tsc --noEmit` (== `npm run lint`); `npm test`; `E2E_TARGET=preview npx playwright test`; `npm run build`; `node --check cloudflare-*.js` |
| Reporter trap | Vitest = `dot`/default; **`--reporter=line` is Playwright-only and errors in Vitest** |
| Search | `rg` is NOT installed → `grep -rn` / `git grep -n` |
| App / worker / sales | `katzu-webapp-v3.pages.dev` · `katzu-test.ghaidakalosh008.workers.dev` · `katzu-sales.pages.dev` |
| AI free quota | `MAX_FREE_AI_SESSIONS = 3` (`cloudflare-unified-worker.js`). Session-quota-exempt AI routes still need their OWN daily scope or they are an uncapped bill: `/ai/ask` = 8 free / 60 Pro, **`/ai/hints` = 30 free / 120 Pro** (`hintsQuotaFor`, `cloudflare-hints.js`), all via `checkGlobalRateLimit({ scope })`. |
| Levels | A0–B2 (`src/lib/levels/levelSpec.ts`) |
| Sign-in | Google-only |
| Payments | NOWPayments **test mode**, `ready:false` |
| Deploy / content gates | `DEPLOY-AUTHORIZED:` / `CONTENT-LOAD-AUTHORIZED:` owner lines only; see `docs/agent/DEPLOY.md`, `CONTENT-LOAD.md` |
| Working tree | CRLF (despite `.gitattributes` pinning LF) |
| Ledger of record | `docs/AGENT-STATE.md` |
| Session start | `npm run session:start` — ledger NEXT + APP-MAP §9 + MEMORY §A + git + OPEN ITEMS (owner-only/unproven) |

---

## B. Frozen decisions (do not relitigate)

1. **§3 is owner-only** — stack, secrets, deploys, payments, force-push. An agent never edits
   §3 or the Content Gate; it proposes.
2. **One framework, one DB, one state system, one HTTP client, one AI provider interface.**
   No new runtime dependency when the stack can do it (dev-only tooling may be added).
3. **Server is authoritative** for entitlements, quotas, identity, sync merges and payments.
4. **Payments never touch the app** — the app only redeems codes; checkout lives on the sales
   site (`sales/`).
5. **Production D1 is content-insert-only**, and only through the gated loader.
6. **No fake success, no weakened or skipped test.** "Pre-existing" needs proof on the base
   commit and is still red.
7. **A pushed commit is not verified until the CI run for that sha is green** (quote the id).

---

## C. Recurring mistakes (the digest — full evidence in `LESSONS.md`)

| # | Symptom | Proven cause | Rule |
|---|---|---|---|
| 1 | Exact-match edit fails / a written `#!` file makes tests red | Working tree is **CRLF**; Vite's hashbang strip leaves a stray `\r` | Re-read exact lines before editing; after writing a `#!` file check `tr -cd '\r' < f | wc -c` is `0`. |
| 2 | A measurement is nonsense | A **stale local server** you did not start answered (dev vs preview look alike) | Check the port is free before *and* after; kill the **listening** PID and the whole `workerd` tree; tell servers apart by `GET /@vite/client` content-type. |
| 3 | "It passed locally" but CI is red | Local run cannot see CRLF/LF, fresh install, or a different Node version | Declare requirements where both see them (`engines.node`, CI pin); quote the **CI run id** for the pushed sha. |
| 4 | A green test hid a real failure | A **test double more forgiving than the engine** invented success | Fakes must throw where the real dependency throws. |
| 5 | Performance "fix" made the metric worse | Judged by the flattering number, not the deciding metric | Judge by the **median of the measurement that decides**; revert if it does not improve; prove the revert with a diff + reproduced build hash. |
| 6 | Content loaded but a learner can't reach it | A **code-level join** (`SCENARIO_GRAMMAR_IDS`) not asserted per artifact | For every code join, assert each artifact is reachable; a rule enforced for one artifact is documentation for the rest. |
| 7 | A schema write 500s on the first row | The **live D1 schema is unversioned** and had drifted from the declared one | Read the real schema (`SELECT name FROM pragma_table_info('<t>')`) and diff it against the payload keys **before** the first production write. |
| 8 | "Is it set?" said yes but auth 401'd | The secret was a **placeholder wrapped in `< >`** — a presence test cannot see a wrapper | Verify secret **shape** without printing it (length, hex-count, first/last code point); never trim/re-encode a secret — hand it back to the owner. |
| 9 | A multi-batch save printed `DONE` and exited 0 after a batch failed | The runner's summary was computed from a different set than its per-item lines | Read every item line; a multi-write exit code must be the **conjunction** of its batches. |
| 10 | A new asset answered 200 but was not deployed | Pages serves the previous deployment for a minute and SPA-fallback returns `index.html` with 200 | Verify by **size + content-type** (and the direct deployment URL); a status code is not evidence. |
| 11 | The wrong deployment looked live | Service-worker **precache** kept the old bundle in the returning profile | Verify painted assets from a fresh/incognito profile; say separately whether the update path was observed. |
| 12 | A transient UI state test flaked only in CI | The **mock answered faster than the state it stands in for** | Make the fake able to hold the state open (`translateDelayMs`); assert the replacement too (`toHaveCount(0)`). |
| 13 | A geometry test passed locally, failed in CI | Position-only changes don't fire `ResizeObserver` | Observe the thing that actually changes (`dir`/active child) and poll the final state. |
| 14 | An edit deleted a neighbouring ledger row (twice) | A one-shot replace whose `newString` **re-emitted** the consumed header and dropped it | Insert a row by replacing **only** the next row's unique id prefix; never retype consumed text; verify with `grep -n` + `git diff --stat`. |
| 15 | An integration probe went red while the product was right | The assertion demanded fresh-ledger numbers against **persistent state** | Disposable state dir, wiped first, assert absolute numbers, own your process. |
| 16 | The hint matcher ranked a greeting first | Lexical overlap without a **stopword class** for greetings/pronouns ranks register, not subject | Exclude greetings/politeness and pronoun/possessive forms from content-word ranking. |
| 17 | A "large unused bundle" item kept directing work for versions | A **stale metric** nobody re-measured (measured 0% unused when finally probed) | Re-measure a performance claim before acting; record metrics with their measurement date. |
| 18 | Review showed questions with no clear answer | Items were built from a field that is not a question (`grammarRule` as the prompt) and nothing validated them before display | Validate every generated item before it is shown; suppress (never delete) the ones that fail. |
| 19 | The chat felt illogical (a hint that ignored the question, a no-op correction, an obstacle on turn 1) | Each output shape was checked for presence, never for whether it answered the turn | Validate the AI's own output against the turn (does the hint answer the question, does the correction change anything); gate behaviours, don't cycle them blindly. |
| 20 | A whole feature "felt like a different product" while every check stayed green | Five palette values sat **50° off the brand hue** in OKLCH; valid tokens, wrong hue. No audit could see it, because validity ≠ belonging | Assert **hue**, not just contrast and token-name: a brand-token test that fails if a shipped colour lands in a foreign band. |
| 21 | The app's motion felt arbitrary, then slower after "fixing" it | The declared motion ladder had **zero readers**, so every transition silently used Tailwind's undeclared 150ms default | A token with no reader is not a token. Assert each scale variable is referenced by the config that is supposed to consume it. |
| 22 | A transition class was present but never fired | The element did not exist on the frame before it became visible (`if (!isOpen) return null`), so there was no second state to interpolate from | An entrance needs two rendered states: mount hidden, settle on the next frame. `transition-opacity` on a never-mounted element is dead code. |
| 23 | The global focus ring measured `outline: 2px solid rgba(0,0,0,0)` | `outline-none` is a **utilities-layer** rule and `:focus-visible` lives in `@layer base` — the layer order wins regardless of specificity | A utility that deletes a base-layer treatment needs an audit rule. Verify focus by pressing Tab, never by reading a class list. |
| 24 | A "quota-exempt" AI route turned out to be an uncapped bill | Exempting a route from the session counter left it with **only** the global per-day ceiling | Every session-quota-exempt AI route gets its own `checkGlobalRateLimit({ scope })` with a free/Pro ceiling, and answers the limit as a **usable empty result**, not an error. |
| 25 | The free wall was a dead end — «حاول مرة أخرى» on a condition that had already ended | Every surface kept its own hard-coded list of paywall codes, so `FREE_QUOTA_EXHAUSTED` matched none of them | One module owns the codes (`src/lib/entitlement/codes.ts`); surfaces classify by set, and an unreadable ledger is retryable, not a payment. |
| 26 | A simplicity gate flagged 12 healthy screens, and a heading gate reported them as headingless | A source-level count of `GlassButton`/`variant="primary"` cannot see hierarchy, and an `<h1>`-only match ignores a correct `<h2>` | Measure a new gate against the healthy tree before trusting it; if a heuristic cannot be made honest, delete it and pin its absence with a test. |
| 27 | Arabic counts read «راجع 2 الآن» and «1 يوم» | A digit was interpolated straight into an Arabic phrase; Arabic needs the one/dual as **words** and the noun changing form (3–10 plural, 11+ singular, modulus `% 100`) | Route every count through `arCount`/`arCountWith` (`src/lib/i18n/`) with a form table; never interpolate a bare digit into Arabic prose. |
| 28 | A rendered-control measurement came back as `{}` and looked like "nothing to measure" | `page.evaluate` given a **function string** evaluates to the function itself, which is not serializable, so it returned `undefined` for every screen | Pass a real function, or wrap the string as an IIFE (`(() => {…})()`). An all-`undefined` measurement is a broken harness, not a zero result. |

---

## D. Important details worth not rediscovering

- The **public demo makes no AI call** by design — a regression here is a real bug.
- **Zero `/ai/*` before the first message** in a live session is the intended economy (one fused
  `/ai/turn` per typed turn). A stray `/ai/translate` on open is a regression.
- **`/trust/:page`** is its own lazy chunk; legal links are wired.
- **`_headers`** is the only place that sets CSP; a Google button needs
  `style-src https://accounts.google.com/gsi/style`.
- **Content Studio** (`cloudflare-content-studio*.js`) and `/admin/*` are bearer-gated; never
  read/print `ADMIN_SECRET`.
- **`sweepExpiredRows`** keeps `rate_limit_counters` (24h) and `error_reports` (30d); cron
  `17 4 * * *`.
- Observability is honest: `/health` exposes status only (no pool/provider), `/client-error`
  sanitizes (400-char cap, credential redaction).
- **Mastery has exactly one definition: `MASTERED_REPS = 3` consecutive good recalls, owned by
  `gradeReviewItem`** (`src/lib/srs/store.ts`), which writes `mistakes.isMastered` itself and the
  UI reads it reactively (live query). A screen must never write `isMastered` — both retype drills
  now grade through the store for this reason.
- **A grader must match the shape the learner is invited to produce.** The AI returns a
  correction as a *fragment* (`ist jetzt fertiggestellt`); the debrief asks the learner to
  "write the correct sentence", so a full sentence is correct input. `gradeCorrectionRetype`
  (report retype drill) accepts the fragment inside a sentence; `gradeAnswer` stays exact for
  vocab recall. Two graders, two contracts — do not collapse them.
- **`tests/appMap.test.ts` enforces APP-MAP against the code** (routes, screens, worker
  endpoints, D1 tables). Add the new item to APP-MAP §14's matching `appmap-*` block when you add
  it to the code, or `npm test` reddens.
- **A review card is shown only if it is answerable.** `validateReviewItem` (`src/lib/review/validate.ts`)
  refuses an item with no clear Arabic prompt, no answer, or a correction that changes nothing
  (`isMeaningfulCorrection` folds case/punctuation/umlaut-transliteration). Bad stored items are
  **suppressed** (Dexie v7 migration), never deleted, and mastery stays `gradeReviewItem`'s.
- **The AI's own output is validated before the learner sees it.** `cloudflare-turn-quality.js`
  drops a `next_hint` that does not answer the last AI message, refuses a no-op correction, and
  gates the persona obstacles (never the first turn, never right after a repeat request).
  `scripts/eval-chat-quality.mjs` (in CI) is the before/after measure.
- **A conversation follows the scenario's own arc (V28 Stage 1).** `cloudflare-conversation-beats.js`
  derives 4–8 deterministic beats from a scenario's starter phrases (pure; ordered by `sort_order`;
  evenly sampled above 8) and the prompt moves through them one per turn without reciting them. Beats
  are server-resolved in `resolveScenarioIdentity` (one extra concurrent D1 read on a scenario's first
  turn per isolate, isolate-cached after; `resetScenarioBeatsCache` for tests) — never client-supplied.
  The whole `/ai/turn` system instruction lives in the exported pure `buildTurnSystemInstruction`, and
  `scripts/measure-turn-cost.mjs` (in CI) fails if the beats add more than `BEATS_PROMPT_TOKEN_CAP`
  (220) estimated tokens; measured ~103–110/turn.
- **There are exactly two conversation modes of the SAME conversation (V28): `practice` (hints,
  translation, a live correction) and `real` (none of those; the turn call is unchanged and still
  returns the evaluation, so the report is built from the stored turns; REAL XP is weighted 1.5×).
  The round-count picker is gone — session length is a level cap (`levelSpec.maxSessionTurns`, read
  via `sessionTurnCap`: A0 3 / A1 4 / A2 6 / B1 9 / B2 12).**
- **REAL-mode progress credit is a pure rule, not an inline expression.** `sessionXp`
  (`src/lib/progress/sessionXp.ts`) multiplies practice XP by `REAL_XP_MULTIPLIER` (1.5×) for REAL
  mode; the report's "versus your previous attempt" line appears only when a prior session recorded
  `mistakesCount` (new optional `SessionEntity` field), never a guessed baseline.
- **Ask Katzu (`/app/ask` → `/ai/ask`, V28 Stage 2A) is German-only and quota-capped.** One question
  → one validated JSON answer (Arabic explanation + ≤3 examples + exactly 3 practice items) or a
  polite Arabic refusal for anything off-topic; the learner's text is fenced data, never
  instructions. Its own daily cap and rate limit live in worker config (`ASK_FREE_PER_DAY` 8 /
  `ASK_PRO_PER_DAY` 60 / `ASK_RATE_PER_MINUTE` 4) and **never spend the conversation trial quota**.
  Official/legal German attaches a not-legal-advice notice; practice is graded by the same
  `gradeAnswer` the review engine uses, and a wrong answer enters the validated review path.
  `tests/askRoutes.test.ts` pins the contract, `e2e/ask.spec.ts` the happy path.
- **Grammar is a locked path and its pass rule is PURE (V28 Stage 2B).** `src/lib/grammar/path.ts`
  orders the live rows into one course (`orderGrammarLessons`: level A0 → B2, then `GRAMMAR_ORDER_HINTS`,
  then id) and every lesson's prerequisite is the one before it. `lessonState` is the ONLY pass rule: a
  lesson is `passed` when the ratio clears `LESSON_PASS_RATIO` (2/3) in at least `LESSON_PASS_SESSIONS`
  (2) DISTINCT `sessionId`s — two qualifying attempts in one sitting are one session. `isTestOutPass`
  (a full, perfect run) is the one shortcut; `placementStartIndex` makes every lesson below the
  learner's level optional review so a placement never walls anyone. Progress (attempts + `testedOutAt`)
  is local in the additive Dexie **v8** table `grammar_lessons`; nothing about the path is content, so
  it never reaches D1. Screens must read `buildGrammarPath`, never re-derive the rule.
- **Three daily tasks + an Arabic rank ladder (V28 Stage 3), all pure and locally persisted.**
  `src/lib/daily/tasks.ts` owns the three tasks (one scenario, one grammar, one review), the local-midnight
  reset (`dailyResetKey`), and a streak with exactly `FORGIVEN_DAYS = 1` (`dailyTaskStreak`: today is not a
  miss while it is still in progress; a gap is forgiven only when a completed day follows it; duplicates
  never inflate). A review batch is `REVIEW_BATCH_SIZE = 5` graded items OR the queue emptied after ≥1, so
  a short queue is never a blocked task. `src/lib/daily/taskStore.ts` is the only writer, over the additive
  Dexie **v9** table `daily_tasks` (monotonic flags + `reviewReps`), called from the session finish
  (`markScenarioTaskDone`), the grammar attempt (`markGrammarTaskDone`) and `gradeReviewItem`
  (`markReviewGraded` — the single review chokepoint).
- **A rank is earned only from measured XP.** `rankFor` (`src/lib/progress/ranks.ts`) reads the ONE existing
  `XP_MILESTONES` ladder (the Trail shows `الرتبة N من M`), and `creditXp` (`src/lib/progress/dailyXp.ts`)
  is the ONLY writer of `totalXp` — its input is always the frozen `sessionXp` (accuracy on the learner's own
  sentences), capped per local day (`DAILY_XP_CAP = 600`) with the refused amount reported. Time spent, taps
  and hint-assisted success never move a rank.
- **A completed day is a recorded fact, not a live query (V28-5).** The review task is the only one whose rule
  reads live state (`reviewDue`), so `DailyTaskEvidence.reviewCompleted` (set from the stored `daily_tasks` row)
  now makes its status monotonic, and `readDailyTasks.completedToday` is derived from the row flags — otherwise a
  new due item later the same day un-completed the task and dropped today from the streak. **Accepted limit:** the
  daily cap and the streak key on the *device-local* day, so moving the device clock forward (or crossing a
  timezone) grants a fresh 600 XP and a new streak day; there is no server authority for XP, so this is documented
  rather than faked. **Verified not exploitable:** multi-device `totalXp` merges Last-Write-Wins (`mergeLatest`), so
  device totals never sum, and synced `session_summaries` land in local `db.sessions` so the cap self-corrects.

- **A quiz deck is built once, from a seeded shuffle (V29).** `generateQuizQuestions` defaulted to `Math.random`,
  and `QuizScreen` re-derived its deck on every live-query emit — so the mount-time content heal, which bulkPuts
  the scenario + phrases + topic vocabulary and re-emits `scenarioQ`/`phrasesQ`/`vocabQ`, visibly reordered the
  options (and moved `correctIndex`) ~5 times. The deck is now seeded per scenario (`quizRngForScenario`, reusing
  `seededRng`/`hashString`) and frozen after the first non-empty build. `e2e/quizStability.spec.ts` reproduces the
  real trigger (a delayed mocked worker refresh) and is proven to fail on the pre-fix code.
- **The chat has two pieces, and the transcript keeps the middle (V29).** `ConversationDock` is split into a
  compact `ConversationControls` bar under the header (orb, status, hints) and a one-row thumb-reachable
  `ConversationComposer` at the bottom; the orb is 84–120px (was 116–168). The `conversation-dock` test id is on
  the COMPOSER — it is the bottom boundary `e2e/conversationLayout.spec.ts` measures against (transcript ≥50% of a
  360×640 viewport, composer ≤20%). Hint options now live under `conversation-controls`, not `conversation-dock`.
- **Every production surface offers the words (V29).** `buildWordBank` (`src/lib/utils/wordBank.ts`) returns the
  target sentence's distinct words as tappable chips; it is used by Review's `ar_to_de` cards, both Guided
  Practice production beats, the chat's hint chips (the offered reply's words append into the composer), and the
  Listening dictation (the audio is the prompt and the German is the answer). Writing has no single answer, so it
  uses the sibling `buildWordBankFrom(parts, max)` — assembled from the scenario's own vocabulary + phrases, and
  CAPPING a large pool instead of returning nothing. All bank containers carry `data-testid="word-bank"`. It is
  deliberately NOT built for `de_to_ar` (the prompt is the German), a mistake reconstruction (the words are the
  answer), or a single-word item (one chip would be the whole answer). Review also has an explicit
  «لا أتذكّر — أرني الإجابة» — a reveal is counted once as a miss. Any tapped chat word opens the insight sheet;
  an unknown word gets an honest, no-AI card (no quota) instead of the old silent no-op. `selectGrammarRule`
  prefers a rule whose example reuses the episode's words and never serves an off-scenario rule while a relevant
  one exists.
- **The vocabulary bridge is measured (V29).** Two allow-listed analytics events, mirrored in
  `cloudflare-analytics.js` and pinned equal by `tests/analyticsRoute.test.ts`: `word_bank_tapped` (every chip
  tap, prop `skill` = the production surface, + `kind` on review/practice) and `review_revealed` (the explicit
  «لا أتذكّر — أرني الإجابة» give-up). They answer "does offering the words reduce give-ups?" by comparing the
  reveal rate with and without bank use. There is no session id in the schema — join by `installId` + `route` +
  day. `e2e/skillSurfaces.spec.ts` proves both events actually POST to `/analytics/events`.
- **The day belongs to the server now, not the device (V29-4).** The daily XP cap and the streak were computed
  from the device clock (`dailyXp.ts` + `streak.ts`), so moving the clock or the timezone granted a fresh day.
  `cloudflare-daily.js` now derives the day from the **server** clock shifted by the learner's UTC offset, and
  **locks that offset on the first sync** — a later device timezone cannot move the boundary. State lives in one
  KV record `daily:<sub>`; events are deduped by a stable id, so a retried offline batch credits exactly once.
  On first creation the ledger is seeded from the client's `totalXp` and completed-day history (bounded) so
  shipping never resets an existing learner, then client history is ignored. `/progress/sync` processes the
  ledger **once** before the D1 merge loop and overlays `total_points`/`streak_days`; the client
  (`src/lib/progress/dailyAuthority.ts`) keeps a durable localStorage event queue and **adopts** the server's
  answer. A sync with **no** `daily` payload (old stats-only client) never creates or seeds a ledger — it keeps
  the plain max-merge — but still adopts an existing ledger, so it cannot inflate an account already under
  daily authority. **A worker deploy is required** for this to bite on a real device (the live worker has no
  `cloudflare-daily.js`).
- **What the daily ledger does and does NOT defend (V29-4, measured).** `tests/dailyLedgerAdversarial.test.ts`
  (19 cases) is the reference. **Blocked / bounded:** replaying a given event id credits once; a clock/timezone
  change cannot move the day (offset locked); lifetime XP can never exceed one capped day (600) per server day
  (replaying ids across a day boundary credits nothing); future/invalid seed days, unknown event kinds, ids
  shorter than 4 chars and offsets outside −720..840 are all rejected; accuracy lies and fresh-id replays land
  but stop at the 600/day cap and 1 earned day/day. **Hardened (V29-5) — the four landing attacks are now
  closed:** (1) the ledger is created on EVERY sync, so a missing `daily` payload cannot opt out; a client total
  rises only by `DAILY_XP_CAP × elapsed days`; (2) the one-time first-sync seed is clamped
  (`SEED_MAX_TOTAL`/`SEED_MAX_STREAK`); (3) a per-account async lock serializes the KV read-modify-write
  **within one isolate**, so two concurrent devices no longer drop each other's events; (4) the dedupe window is
  2000 ids. **One residual — do not claim it fixed:** two requests to *different* Cloudflare isolates can still
  race the KV read-modify-write (a LOSS, never inflation); only a D1/DO compare-and-swap closes it.
  **Data lifecycle (V29-5):** account deletion now deletes `daily:<sub>`, `/user/export` includes it, and
  `wipeUserScopedData` clears the localStorage daily-event queue (`katzu_daily_events_v1`) so a signed-out
  learner's sessions cannot be credited to the next account on the device.

---

## E. Open items the owner must decide (not an agent's call)

- Rotate `ADMIN_SECRET` (was exposed in an earlier prompt).
- `katzu.app` does not resolve though robots/sitemap advertise it.
- Imprint placeholder + refund one-liner need real wording before public launch.
- ~~No dedicated e2e for review/listen/write/coach.~~ **Closed (V28-4):** `e2e/skillSurfaces.spec.ts` (5) covers review, listening, writing, coach and the Trail rank badge; V29 added `e2e/quizStability.spec.ts` and extended skillSurfaces/journey/conversationLayout, so the suite is 61 e2e (the word-bank extension added the Writing-bank and hint-bank cases and widened the listening case). What remains uncovered by e2e is only the *live* behaviour of these screens on a real device, not their rendering.
- Real-device voice input unverified.
- Live-walkthrough defects to triage: `/ai/translate` intermittent abort + retry; Trail
  scene-image placeholder line.
