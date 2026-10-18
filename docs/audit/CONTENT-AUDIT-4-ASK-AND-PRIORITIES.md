# Katzu — Content audit, part 4: Ask Katzu, Coach, and priorities

Part of the [content audit index](CONTENT-AUDIT.md). Severity key and scope are there.


## Type 9 — Ask Katzu and Coach (prompts and graders)

Coverage: read `src/lib/ask/notices.ts` (33/33 lines) and `src/lib/ask/practice.ts` (33/33); the
shared grader both call — `gradeAnswer` and `ARTICLE_PREFIX` in `src/lib/srs/engine.ts` (whole
file, 394/394); the full Ask worker `cloudflare-ask.js` (392/392: input gate, keyword list, quota,
prompt, schema, validator); the Coach grammar prompt `buildTurnSystemInstruction` in
`cloudflare-ai-chat.js` (lines 69–201, plus the translation handler 820–885); the Coach content
`src/lib/coach/taxonomy.ts` (161/161) and `src/lib/coach/profile.ts` (355/355); `CoachScreen.tsx`;
and the Ask screen's notice/practice wiring (`AskKatzuScreen.tsx` lines 95–136 and 250–372).
Reproduced the grader by compiling the real `engine.ts` with esbuild and calling `gradeAnswer`
(results below). Ran `tests/askPractice.test.ts` and `tests/srsEngine.test.ts`: **34 passed**.

Naming note: the learner-facing Coach screen (`CoachScreen.tsx`) is a local Dexie notebook and
makes no AI call; its content is `coach/profile.ts`. The "Coach prompt" is the grammar-evaluation
half of the fused turn prompt (`cloudflare-ai-chat.js` `evaluationInstruction`, lines 141–154).

Severity principle used here: a defect that can call a **correct** answer wrong is P0 (same class as
the Type 5 dictation bug); a defect that lets a **wrong** answer pass is P1 (the Type 4 leniency row).

| Sev | File | Item | Issue | Proposed fix |
|---|---|---|---|---|
| P0 | `src/lib/ask/practice.ts` (line 25) → `src/lib/srs/engine.ts` (`gradeAnswer` lines 164–174, `ARTICLE_PREFIX` line 44) | Ask practice grader, `translate` and `fill` | The grader is exact string match after normalisation and strips only a **definite** article `der/die/das/den/dem`. It asks the model for exactly one `answer_de` (`cloudflare-ask.js` lines 159–163), so any other **correct** German is `wrong`. Reproduced against the real code: `ein Termin` vs `einen Termin` → `wrong`; `der Kaffee` vs `ein Kaffee` → `wrong`; `Ich brauche einen Termin beim Arzt.` vs `Ich brauche einen Termin mit dem Arzt.` → `wrong`; only `der Kaffee` vs `Kaffee` → `close`. A non-`correct` verdict is written to `db.mistakes` and enrolled for review (`AskKatzuScreen.tsx` lines 112–129), so a correct translation becomes a **false error in the SRS**. The app's own `close` copy talks about "الأداة" (the article) (`practice.ts` line 31), but an indefinite-article mistake never reaches it. | Owner decision, because the single-answer design is deliberate (`practice.ts` lines 6–12). Options: let `answer_de` carry 2–3 accepted answers; or grade `translate` with the token-based rule the retype drill already uses (`gradeCorrectionRetype`, `engine.ts` lines 102–119); and extend `ARTICLE_PREFIX` to `ein/eine/einen/einem/einer/eines` and `des`. |
| P2 | `src/lib/ask/notices.ts` (lines 4–10) and `src/features/ask/AskKatzuScreen.tsx` (lines 286–292) | Legal-notice comment vs the text it claims to copy | The comment says the notice "deliberately reuses the exact wording of the official-category disclaimer in `scenarioVocab.ts` (`safetyDisclaimerFor`)", and the screen repeats "reused verbatim". Verified false: `notices.ts` line 10 begins "هذا شرح للغة الألمانية فقط…" while `scenarioVocab.ts` line 113 begins "هذا تدريب للمحادثة فقط…". Only the **second** sentence matches. | Fix the comment(s) to say the two share the same promise (the sentence after the first clause), or align the wording. The wording difference itself is defensible — the Ask screen explains, a scenario converses — so this is the comment, not the text. |
| P2 | `cloudflare-ask.js` (lines 55–67 keyword list, line 264 `legal` flag) vs `src/lib/utils/scenarioVocab.ts` (lines 109–127) | One notice for every domain | Ask attaches the single legal/immigration notice to any keyword hit (including `krankenkasse`, `miete`). The scenario path has four domain-specific notices (medical 110, legal 113, housing 116, visa 121, exam 125). A health-insurance or housing question in Ask therefore shows the legal/immigration wording. | Owner decision: either accept one generic notice for Ask, or map the hit to the domain notice. Low priority. |
| P2 | `src/lib/coach/profile.ts` (lines 317 and 326) | Arabic count agreement | Two learner-facing counts hard-code the "many" form and bypass `arCount`, which the file imports (line 3) and uses at line 330: `أتقنت ${masteredRecently} خطأً` and `(${repeatLead.open} خطأً مفتوحاً)`. At 1 or 2 the Arabic is ungrammatical (the file's own V31 rule, lines 5–7). | Route both through `arCount(..., MISTAKE_FORMS)`. |

**Checked and consistent (no issue found).**
- Ask prompt treats the learner's text as fenced DATA (`cloudflare-ask.js` lines 139, 150–153); refuses an out-of-scope question in Arabic only (155, 215–226); requires a readable Arabic explanation and at least one practice item (231, 255); the legal line only asks to explain words/structures (131–135).
- Coach grammar prompt grades only the last sentence (142, 168); `grammar_rule` must be a short Arabic label (149); the roast targets German grammar, never the learner (143–144); its greeting rule (137) matches the translation handler's (856).
- `coach/taxonomy.ts` labels and advice read correctly; `classifyMistake` is deterministic and covers all eight `MISTAKE_CATEGORIES`.

**Needs native or expert review:** the Arabic wording suggestions above, and the owner's decision on
the Ask grader's accepted-answer design.

Nothing in this type was changed.

## Final ranked list

Severity here is the audit's own: **P0** wrong or misleading · **P1** level or format mismatch ·
**P2** polish. Grader principle: over-strict (correct answer marked wrong) = P0; over-lenient (wrong
answer passes) = P1. Items already logged above are listed once at their highest severity.

### P0 — wrong or misleading (fix before trust)

1. **Doubled article — one root cause.** The generator prepends `article` to a `german` that already
   holds it, so the learner reads "die die …". Affects 78 vocabulary rows and, through them, 565 of
   4,757 quiz prompts, the placement prompts, the listening drill, and the **review answer**:
   `src/lib/srs/engine.ts` `newReviewItemFromVocabulary` (lines 321, 329) builds
   `${article}${vocabulary.german}`, so the SRS card's expected answer is "die die …" and a correct
   learner answer is graded wrong — reproduced: `gradeAnswer('die die Verletzung','die Verletzung')`
   → `wrong`. That answers the open question left in Type 3 — the defect is not placement-only.
   Other sources: `quizGenerator.ts` line 142, `src/lib/listening/drill.ts`,
   `docs/content/curriculum-*.json`. (Type 1, 3, 5, 7.)
2. **`akkusativ_articles` teaches the wrong rule.** Definite *der → den* (not *einen*; only indefinite
   *ein → einen*). Live in production. `docs/content/supplements/grammar-legacy-d4-patch.json`
   lines 36–38; the same error repeats in `curriculum-coverage-fix.json` line 1384. (Type 4.)
3. **`g_a1_negation_nicht_kein` says *kein/nicht* negate "Namen" (names); it must be "Nomen"
   (nouns).** Teaches something false. `docs/content/supplements/grammar-essentials-v21.json`
   line 45. (Type 4.)
4. **Listening dictation: a standalone "—" shifts the diff index,** so a perfect typed answer is
   graded `close` with a word wrongly listed as missed (≥20 phrases). `src/lib/listening/drill.ts`
   `diffDictation`. (Type 5.)
5. **Mock exam Part 2 sends `undefined` instead of the topic card,** because it reads
   `chosen.cardDe`/`chosen.cardAr` from a part object that has no card fields; the selected `topic`
   is computed and then never used, and Parts 1/3 send a part title as the "topic".
   `cloudflare-mock-exam.js` lines 240–248; the test at `tests/mockExam.test.ts` line 101 only
   matches `/TOPIC CARD/`, so it passes. (Type 8.)
6. **Mock score band contains Chinese.** `BAND.getting_there.ar` has "继续保持" inside Arabic.
   `src/lib/mockexam/score.ts` line 74. (Type 8.)
7. **`einpaken` is a typo for *einpacken*,** in the headword and the example (B1).
   `docs/content/curriculum-ausbildung-exams.json` lines 519 and 1159. (Pass 0.)
8. **`der Geschmack` row is garbled:** example Arabic "المذاق تبليبي لطيف." contains a nonsense word,
   and the plural "die Geschmacker" should be "die Geschmäcker". `docs/content/curriculum-coverage-fix.json`
   (B2). (Type 1, 3.)
9. **Ask practice grader can mark a correct answer wrong and file it as a mistake** (new, Type 9).
   `src/lib/ask/practice.ts` line 25 → `src/lib/srs/engine.ts` lines 164–174; the prompt allows only
   one `answer_de` (`cloudflare-ask.js` lines 159–163).

### P1 — level or format mismatch

1. **Mock name/format vs the promise.** The mock names no exam, yet onboarding promises
   "Goethe / telc / DTZ بصيغتها الحقيقية" (`preferences.ts` line 41); the mock is Goethe/ÖSD-shaped
   and mis-timed against the real exam. (Type 8, 10.)
2. **Writing gets no situation and no Sie rule:** the learner and the grader see only the Arabic topic
   title plus phrases, never the German situation or its content points; the formal email never says
   *Sie*. (`WritingScreen.tsx` 325–331, `cloudflare-writing.js` 105–113, 73–74, 122.) (Type 6.)
3. **Writing task and topic can contradict** (A1 `short_message` judged against an official topic);
   B2 `complaint` can get a topic with no grievance. (Type 6.)
4. **Grammar reorder distractor duplicates a word already in the sentence** (`exercises.ts` ~line 91)
   and the **lenient grader returns `close` for any substring**, including one word (`exercises.ts`
   ~line 129). (Type 4.)
5. **Grammar coverage gaps:** no Genitiv and no Präteritum rows; *seit*+Dativ taught at A2 and B1;
   Konjunktiv II levels undefined; only 10 thin B2 rows. (Type 4.)
6. **Quiz distractors are not part-of-speech matched and include glosses/sentences** (544 of 4,757
   option lines), and scenario×level coverage has 13 gaps (exam_* scenarios have no B2 content;
   travel scenarios have no B1/B2). The audit script's `promptIsHeadword` check is blind to the
   doubled article. (Type 7.)
7. **Placement/curriculum duplication and label drift:** 27 duplicate headwords across modules at
   different levels; 26 shared Arabic meanings; topic `food` on greetings; "عندهاً" typo and
   "Betrieb → المصنع" mistranslation. (Pass 0, Type 1, 3.)
8. **Scenario opener mismatch:** `mietvertrag_uebergabe` A1 opener asks about renting, not the
   handover the other levels assume. (Type 2.)
9. **Listening Arabic is ungrammatical in one B1 phrase** ("أحب التحمل المسئولية"). (Type 5.)

### P2 — polish

- 24 missing plurals (some count nouns); 5 examples that do not contain the headword; `Berufsschule`
  and `die Zubereitung` missing plurals; `Tabletten` lemma is plural.
- Arabic/typo pass: "شكاوايّ" → "شكاويّ"; stray Indonesian "seperti" → "مثل"; the `g_tech_du_im_team`
  and `g_tech_fuer_zweck` example/rule mismatches; `Erholen Sie sich…` register vs informal Arabic.
- Mock polish: `B1 SPEAKEN` typo (`cloudflare-mock-exam.js` line 251); `titleAr`/`cardAr` wording;
  the pacing comment and code disagree (score.ts 104–129); "part 3 is usually the weakest" is an
  unmeasured claim (score.ts line 74).
- Quiz explanations teach no gender/plural hint; a test comment points at
  `tests/writingContract.test.ts`, which does not exist (`writing/task.ts` line 8).
- Coach Arabic count agreement (`coach/profile.ts` 317, 326); Ask legal-notice comment vs text
  (`ask/notices.ts` 4–10); Ask shows one legal notice for every domain (`cloudflare-ask.js` 55–67).

### Coverage (read X of Y per type)

| Type | Read in full | Scripted / sampled | Remaining to read |
|---|---|---|---|
| 0 mechanical | validator + all 453 vocab rows by script | all 44 scenarios by script | topic taxonomy decision |
| 1 placement | 12 rows by eye | 859 rows (453 vocab + 406 phrases) by script | level-fit/distractor judgment for all items |
| 2 scenarios | 10 scenarios by eye | 44 by script | some B1/B2 openers were truncated in the first read |
| 3 lessons/vocab | 7 rows by eye | 453 rows by script | scenario/lesson bodies and the 406 phrases |
| 4 grammar | 77 of 77 rows | `exercises.ts` reproduced | answer-position distribution; by-eye exercises |
| 5 listening | 12 of 859 pool items by eye | 859 by script; scoring reproduced | none outstanding beyond the fixes |
| 6 writing | 4 of 4 task formats | 5 topic blocks + 2 A0 items | total number of writing topics not counted |
| 7 quizzes | ~15 questions by eye | 4,757 questions by script | `correctIndex` distribution; full translation accuracy |
| 8 mock | 3 of 3 parts, 5 of 5 topics; score.ts whole | — | Goethe-realism check (owner/expert) |
| 9 Ask/Coach | notices 33/33, practice 33/33, engine grader 394/394, `cloudflare-ask.js` 392/392, Coach prompt 69–201, taxonomy 161/161, profile 355/355, both screens | grader reproduced; 34 tests passed | owner decision on accepted answers |
| 10 mock claim | full `cloudflare-mock-exam.js`; `score.ts`; `preferences.ts` 25–43; test asserts | — | Goethe-realism check (owner/expert) |

### Document note (operational)

`docs/audit/CONTENT-AUDIT.md` is **42 KB against the 22 KB default** in `tests/agentDocs.test.ts`
(`BUDGETS_KB`, line 26). `npx vitest run tests/agentDocs.test.ts` is **red on this file alone**
(30 passed, 1 failed), and it was red before this append. The repo's stated fix is to split and link
(as `SCREEN-AUDIT.md` was), not to raise the cap. Splitting is left for the owner's approval because
it is a structural change to the document being reviewed.
