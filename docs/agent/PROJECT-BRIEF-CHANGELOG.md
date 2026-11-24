# Project brief - recent-changes changelog

Moved out of `PROJECT-BRIEF.md` section 7 on 2026-10-31, verbatim, so the brief stays inside
its 80 KB cap with room to grow. Newer changes stay in the brief; grep this file, never load
it whole.

## 2026-11-24 (later) — B5 in progress: the practice hub and Ask Katzu

- **Two of B5's seven screens are finished, and B5 is deliberately still `open`.** The practice hub
  (55 strings) and Ask Katzu (37 strings, plus the `lib/ask/notices` table it renders and its three
  practice verdicts) read from the dictionary now; `coverage.json` still says `B5: false`, so the gate
  keeps telling the truth about the five screens that are not done (progress 61, grammar 51, writing 39,
  listening 35, coach 30).
- **The hub's own copies live under `hub.*`.** `practice.title`, `.listen` and `.grammarTitle` already
  belonged to the guided-practice table, so the hub's versions were named rather than the old keys
  renamed — a rename would have moved copy under a key another screen already renders.
- **Arabic count agreement moved with the copy:** `PRACTICE_WORD_NOM` and `PRACTICE_DUE_NOM` join
  `countForms.ts`, and English and Indonesian take a counted noun from three unit keys
  (`practice.wordUnit`, `.dueUnit`, `.mistakeUnit`), so "12 words" and "3 mistakes" read as sentences in
  those languages instead of as a number glued to an Arabic noun.
- **`askSuggestions(language)` replaces the literal table.** `ASK_SUGGESTIONS`, `ASK_EXAMPLE_AR`,
  `ASK_LEGAL_NOTICE_AR` and `ASK_PRACTICE_NOTE_AR` still exist and are derived from `UI_STRINGS.ar`, so
  every existing caller and test keeps byte-identical Arabic. `askPracticeFeedbackAr` likewise derives
  from the new `askPracticeFeedback(verdict, language)`.
- **A tool caught by its own guard:** a temporary `scripts/dump.mjs` (lists a screen's remaining Arabic)
  made `tests/registrations.test.ts` fail on the next commit — "reachable from nowhere". Correct call: it
  is a one-off, so it was deleted rather than allowlisted, and the same listing is done inline.
- **Checks:** `tsc` clean after each screen · `i18n:coverage --strict` 0 · `i18n:dir --strict` 0 ·
  `askPractice`/`askRoutes`/`languages` 50 passed · `practiceRetype`/`uiPolishLaunch` 15 passed · pre-push
  verify `6/6` · design audit in budget.
- **Shipped:** commits `6d08e00` and `45e0957`, Pages deployment `0a8838d1`, live bundle
  `index-Cp6VKxdN.js` confirmed to carry both finished screens' English copy.
- **Still open:** five B5 screens, then B6 (325), B7 (72), B8 (106) and the dev-only screen (87). The
  remaining B5 screens all render text built in `lib/coach/profile.ts` and the collection helpers, so each
  one is a screen change *plus* a language parameter in the helper that builds its sentences.

## 2026-11-24 — B3 and B4: the whole session, from the scene page to the report

- **B3 and B4 are finished** — the fifteen files between "open a scene" and "read the debrief"
  (`ScenarioDetailScreen`, `StudyScreen`, `QuizScreen`, `LiveConversationScreen`, `ConversationMessage`,
  `ConversationTranscript`, `ConversationDock`, `HintDock`, `ReviewScreen`, `SessionReportScreen` + its
  `ExamResultCard`, and the conversation/report helpers) carry **zero hard-coded Arabic**; `coverage.json`
  flips B3 and B4 and `--strict` passes. Remaining: **864 strings** across B5–B8 (plus the 87 in the
  dev-only design-system screen).
- **The session's helpers take the language, not the screen.** `messageForCause`, `noHintMessage`,
  `sessionModeCopy`, `correctionSummaryLabel`, `noGermanVoiceMessage`, `buildReviewTask`,
  `buildSessionDebrief`, `buildTomorrowTeaser`, `buildExamCard`, `buildFollowUpCard`, `outcomeLine`,
  `categoryLabel`, `dayZeroCelebration`/`dayZeroCorrectionsLine`/`arSentenceCount` and `recover.ts`'s
  report rebuild each gained an optional `language` (Arabic default). Field names are unchanged, so no
  caller had to be renamed; `arSentenceCount` keeps its historical name because the language is now a
  parameter, not a second function.
- **Arabic stayed byte-identical.** Every Arabic sentence moved into the dictionary verbatim — including
  the two count tables, which moved to `countForms.ts` (`QUIZ_ANSWER_FORMS`, `REVIEW_ITEM_DUE` with its
  accusative dual "عنصرين") so the quiz and review scores still agree with their numbers the way they did.
  The exported `*_AR` constants (`OFFLINE_MESSAGE_AR`, `NO_HINT_MESSAGE_AR`, `MOCK_NOTICE_AR`,
  `DAY_ZERO_*_LINE_AR`, `PRACTISING_WITHOUT_HINTS_AR`, `NO_GERMAN_VOICE_MESSAGE_AR`) are now derived from
  `UI_STRINGS.ar`, so their bytes cannot drift. The Arabic e2e still passes unchanged.
- **The dictionary got its own files.** `strings.ts` had crossed the 1,900-line source budget, so the
  tables now live in `i18n/strings/{ar,en,id}.ts`; `strings.ts` keeps the types, `UI_STRINGS` and
  `translate`. `UiStringKey` is derived from the Arabic table and EN/ID are typed against it, so a missing
  English or Indonesian line is still a compile error rather than an Arabic sentence in an English screen.
- **Two real defects the direction lint caught.** `ConversationMessage`'s German note and the review
  input's field were pinned with `text-right`/`text-left`; on an LTR screen that is a wrong-aligned line,
  so both are now `text-start`, which is what the RTL layout already looked like.
- **Proven in the browser, against the production bundle:** `e2e/i18nLanguage.spec.ts` gained two signed-in
  tests that open a scene page in English and Indonesian and read its mastery plan, step 1, starter-phrase
  heading and training button, failing on any Arabic in that copy. The seven earlier language tests and the
  whole `journey.spec.ts` session (story → guided practice → live turn → debrief) still pass.
- **A stale server nearly hid it:** an old `vite preview` from an earlier run was still holding port 3000, so
  Playwright reused a bundle built before this wave and the new scene test "failed" in Arabic while `lang`
  was correct. Killed the stale PID and re-ran with `E2E_TARGET=preview`, which builds and serves the real
  bundle.
- **Gates:** `tsc` clean · `npm test` **2,907 passed / 208 files** · `lint` 0 · `design:audit` in budget ·
  `i18n:coverage --strict` 0 · `i18n:dir --strict` 0 · `i18nLanguage.spec` **9 passed** · `journey.spec`
  **14 passed**, all on the production build.
- **Shipped:** Pages deployment `4b97e66b`, bundle `index-bc2X1Ryj.js`, confirmed to contain both the
  English and Indonesian scene-page copy.
- **Still open, said plainly:** B5–B8 (864 strings) and the dev-only screen; native review of the en/id copy
  (the mechanism is `/dev/i18n` and the `--export` worksheet); Arabic scene titles, glosses and vocabulary
  are *content*, still Arabic inside the English UI (plan 010 §11).

## 2026-11-23 — B2: the home journey speaks English and Indonesian

- **B2 is finished** — the six files a learner reads every day after sign-in (`JourneyHomeScreen`,
  `GuidedPracticeScreen`, `JourneyMoreSheet`, `StorySetupScreen`, `DailyTasksPanel`, `PracticeLockSheet`)
  plus the four copy tables they render (`journey/context`, `journey/story`, `capability/model`,
  `daily/tasks`) carry **zero hard-coded Arabic**; `coverage.json` flips B2 and `--strict` passes.
  Remaining: **1,234 strings** across B3–B8.
- **The copy tables take the language, not the screen.** `missionReasonAr`, `katzuJourneyLineAr`,
  `situationAr`, `buildJourneyContext`, `buildStorySetup`, `canDoStatementAr`, `gradeRepeat`,
  `gradeTypedProduction` and `retrievalFeedback` gained an optional `language` (Arabic default), so the
  rules stay pure and the screens stay free of copy. The `*Ar` field names are documented as historical
  rather than renamed in the same change.
- **Arabic stayed byte-identical.** Every shipped sentence moved into `strings.ts` verbatim; the count
  forms it needs live in `countForms.ts` (`REVIEW_ITEM_BARE`, `MINUTE_NOM`); the name separator and the
  "I will correct you in Arabic" clause are interpolated, so Arabic keeps its own comma and phrase while
  English and Indonesian get their own. The new home header, chapter bar and «المزيد» row were checked for
  **zero Arabic** in the browser in both languages.
- **Proven, not asserted:** `e2e/i18nLanguage.spec.ts` gained two signed-in tests (English and Indonesian)
  that read the real journey home — day/chapter line, chapter heading, chapter bar, «المزيد» — and fail on
  any Arabic in that chrome. Scenario titles are still Arabic *content* (plan 010 §11), so the test
  deliberately measures the chrome.
- **Two rendering bugs found by doing it:** the PWA update banner — the one bar that appears *because* a
  deploy happened — was Arabic on an English screen and hard-coded `dir="rtl"` plus the Arabic font class;
  it now reads the dictionary and the document direction. And `journey/practice.ts` feedback ("exactly
  right", the article note, the repeat-coverage line) was Arabic on the English practice screen; it is
  localised with the screen that shows it.
- **Gates:** `tsc` clean ×2 · `npm test` **2,907 passed / 208 files** · `design:audit` in budget ·
  `i18n:coverage --strict` 0 · `i18n:dir --strict` 0 · journey e2e (`journey`, `guidedHome`,
  `guidedHomeMore`, `firstSessionChain`, `tabLock`) **42 passed** · `i18nLanguage.spec` **7 passed**.
- **Shipped:** `4a1f6ce` (plus `39a4493`), Pages production deployment `3871f36f-…` and the git build that
  took the alias, live bundle `index-c2iXJhhp.js` confirmed on `https://katzuai.com/` (a later alias build
  serves `index-DYLZlMB_.js`). Verified in the browser on the live site: English `lang=en dir=ltr`, **0**
  Arabic characters; Indonesian `lang=id dir=ltr`, **0** Arabic characters; tab restored to Arabic.
- **Still open, said plainly:** B3–B8 (1,234 strings), native review of the en/id copy (the mechanism is
  `/dev/i18n` plus `npm run i18n:strings -- --export`), and the content layer — scene titles, grammar
  explanations and Indonesian content do not exist yet, which is why a home screen in English still shows
  an Arabic scene title.

## 2026-11-23 — the language work became measurable and reviewable

- **B1 finished, and measured honestly.** `/subscription` (the last B1 screen) plus the free-allowance
  copy moved into the dictionary in all three languages; `freeSessionsCopy` now renders in the learner's
  UI language while keeping the Arabic sentence byte-identical (Arabic still needs `arCount` morphology).
  `src/lib/i18n/coverage.json` flips B1 to `true`, and `npm run i18n:coverage -- --strict` passes.
- **The counter got honest.** Widening it to the eight shared copy tables screens render added **B8
  (211 strings)**; development-only screens (87) are now excluded from the denominator. Honest total:
  **1,545 strings** across B2–B8, up from a number that under-reported the job.
- **Nothing had ever rendered a translated screen.** Every browser test ran Arabic. `e2e/i18nLanguage.spec.ts`
  (5 tests) now pins `lang`, `dir`, **zero Arabic words**, persistence across reload, and the return to RTL
  on `/welcome` and `/signin`; `bootSignedIn({ uiLanguage })` lets any spec boot in another language.
- **Tooling so 1,500 strings stop being a mountain:** `npm run i18n:strings -- --export/--apply` turns a
  batch into a CSV/Markdown worksheet a translator can be paid for and a reviewer can approve;
  `npm run i18n:dir` catches physical `left-/ml-/text-left` utilities on localised screens (LTR-only bug
  class); `/dev/i18n` shows every string beside the Arabic it must mean; `docs/i18n/GLOSSARY.md` fixes the
  termbase and voice so 25 batches cannot drift apart.
- **Demand is now measured.** `language_active` / `language_selected` events carry `uiLang`/`targetLang`
  (codes only) through the client and the worker allowlist — so "is anyone using English?" has an answer.
- **Decisions recorded** in `docs/plans/010-multilanguage-master-plan.md` §11: v1 promises **UI**
  localisation only (content has no Indonesian and no English scenes/grammar); **Dutch is deferred** with the
  reason and the evidence that would reopen it.
- **Shipped** — worker `0f6be797-513f-493b-bd36-878686ecf178` (rollback: `54a61d9a-73a0-44b7-aeee-d3c9c564614d`),
  Pages production deployment `e97d1414-a88c-473c-b20e-eaa21256efcc` from `631c257`, bundle `index-M0X9o32d.js`
  confirmed on `https://katzuai.com/`; `/health` healthy (d1 kv ok), `/admin/api/stats` 401.

## Moved 2026-10-31 (2026-10-18 and earlier)

- **Haptics + purposeful motion (2026-10-18, local only — not committed, not deployed)** — one semantic haptic API (`tap`/`select`/`success`/`warning`/`error` in `src/lib/utils/haptics.ts`, with the older `triggerHaptic` kept as an alias so ~48 shipped call sites kept their exact feel) that prefers a Capacitor bridge, then `navigator.vibrate`, then silence; a Settings switch (`hapticsEnabled`, absent = ON) plus `prefers-reduced-motion` both override the caller. Two haptics were genuinely missing and added (paywall CTA `select`, destructive delete `warning`/`error`). Motion added with the existing tokens only — `.kz-pop`, `.kz-shake`, `.kz-flip-in`, `.kz-orb-listening` (the mic halo now stays while listening), a 420 ms rAF count-up on the report's unaided-sentence count, a staggered arrival for the daily tasks and the report rows, and `ProgressRail` moved from animating `width` to `transform: scaleX`. Every new class is neutralised under reduced motion with the state still visible. Evidence: `tests/haptics.test.ts` (18) and a new `feedback motion` block in `tests/designSystem.test.ts`; `npm run verify` **6/6**. **UNPROVEN:** real vibration on hardware (no phone here) and therefore the whole iOS story — iOS Safari has no `navigator.vibrate`, so an iPhone is silent by design.
- **V32 (2026-10-04)** — measured before touching anything (25 screens at 360px): `/app/practice` had **110 controls** and no starting point, `/app/library` 12 competing primaries, `/app/study` 6 listen buttons all reading «استمع إلى النطق», Guided Practice two inputs sharing one placeholder — while `/demo` needs 2 controls. Fixed: the quiz no longer forces a guess («لا أعرف — أرني الإجابة» reveals it and counts it missed), the practice hub opens on six skill cards with the 48 words behind «تصفّح الكلمات», the Trail previews 5 scenarios, every input has its own visible label, every Study button is named by its phrase, the Welcome name is optional, Ask has a heading and a tappable example, «بدء» reads «ابدأ التدريب», chat preselects «تدريب» as «موصى به», and the level picker appears only at signup. A new standing gate, `scripts/simplicity-check.mjs`, runs in CI; its `primary-budget` rule was written, measured against 12 healthy screens, and **deleted** rather than left crying wolf. Gates: `npm test` **1363**, tsc clean ×2, e2e green, design-audit 0, simplicity-check 0, contrast all pass, `npm audit` 0.
- **V31 (2026-10-04)** — the app failed at exactly the moments a learner is asked to trust it. The free wall was a dead end (only `PAYWALL_REQUIRED` opened the paywall, so `FREE_QUOTA_EXHAUSTED` produced an un-clearable "try again"); one shared entitlement module now classifies by set, and an unreadable ledger is a retryable glitch rather than a payment. The debrief can no longer vanish: `ReportRoute` rebuilds from the Dexie `sessions` + `mistakes` rows, or says plainly that there is nothing to rebuild. `/check-status` reports the real trial ledger («يُحسب على خوادمنا» when unknown, never a fake 0), the hint panel admits when the day's budget is spent, and **13 Arabic count sites now agree with their noun** — one and the dual as words, 3–10 plural, 11+ singular. Gates: `npm test` **1358**, e2e **62 passed**, tsc clean ×2, contrast 4.52:1 tightest, `npm audit` 0.
- **V30 (2026-10-04)** — the app read as two products stitched together. Five palette values sat in the rose band (OKLCH h 339–344, ~50° off the lavender); earned progress is now h 299, `tertiary` moved to a periwinkle shoulder, `article.die` to pale lilac, and both glass tiers pick up the brand hue. The declared motion ladder had **zero readers**, so every transition silently used Tailwind's undeclared 150ms — it is now a real Tailwind scale and the over-budget 560ms step is retired. Confetti (the one animated subsystem ignoring `prefers-reduced-motion`) is gated; the sheet and modal got an entrance they actually had states for; six progress bars moved from animating `width` to `scaleX`; 61 `transition-all` sites now name the property they animate. Accessibility: 19 unnamed form controls named, the global focus ring restored (a utilities-layer `outline-none` had been deleting it on 20 fields), 4 icon-only buttons labelled. Cost: `/ai/hints` was quota-exempt **and** uncapped — only the global 200/day — so it now has its own free 30 / Pro 120 ceiling. Measured: 16 routes clean at 320px and at 200% zoom. Gates: `npm test` **1323**, tsc clean, design-audit 0, contrast 20/20, build OK, `npm audit` 0.
- **V29 design system (2026-10-03)** — the palette was unified onto `src/index.css` as its only owner, `tailwind.config.js` became a token *reader*, and `Button`/`Card` were unified into 7 variants / 4 sizes with glass compat wrappers. The duplicate sign-in button (Google's iframe *plus* Katzu's own) was fixed. `VITE_GOOGLE_CLIENT_ID` is set in the untracked `.env`.
