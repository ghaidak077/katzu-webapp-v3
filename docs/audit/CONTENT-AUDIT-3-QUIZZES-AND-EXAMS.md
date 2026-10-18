# Katzu — Content audit, part 3: quizzes and exams

Part of the [content audit index](CONTENT-AUDIT.md). Severity key and scope are there.


## Type 7 — Quizzes (vocab and phrase multiple choice)

Coverage: ran `scripts/audit-quiz-content.mjs` against the live worker across all 49 scenarios: 4,757 generated questions, 160 mismatch records and 13 gap records. Read `src/lib/utils/quizGenerator.ts` in full and spot-checked about 15 question blocks by eye from several scenarios. The answer-position distribution is not in the report, so it is **not checked**.

| Sev | File | Item | Issue | Proposed fix |
|---|---|---|---|---|
| P0 | `src/lib/utils/quizGenerator.ts` line 142 (`word = article + german`); data in `docs/content/curriculum-coverage-fix.json` lines 119 (`"die Nummer"`) and 223 (`"die Staatsangehörigkeit"`) | Doubled article in the prompt | 53 rows store the article inside `german` and also set `article`. The live report shows 565 of 4,757 prompts doubled (about 12%), e.g. `die die Nummer`, `der der Stempel`. Learners see a German grammar error on the articles they are learning. | Store `german` without the article in those 53 rows (the `article` field already holds it), or add the article in the generator only when `german` lacks one. |
| P1 | Vocab rows: pre-A0 backup SQL (`backups/pre-a0-check-rebuild-verify.sql`, ids 50 and 224 for `Adresse`; ids 56, 231, 385 for `gültig`); `docs/content/curriculum-30day-module1.json` lines 103 and 111 | Duplicate headwords with different translations | `Adresse` is `عنوان` (id 50) and `العنوان` (id 224, module1 line 103). `gültig` is `سارٍ / صالح` (B1), `ساري المفعول` (A1, module1 line 111) and `صالح` (A2). The vocab distractor pool (`quizGenerator.ts` line 127) can offer one of these as a distractor for another row, so a defensible answer is marked wrong. These duplicates account for the collapse flags I checked; I did not trace all 160. | Merge duplicate headwords into one row with one primary sense. Keep alternative senses only where a scenario needs them. **Needs native or expert review** for which senses to keep for `gültig`. |
| P1 | Distractor selection, `quizGenerator.ts` lines 127 and 166 | Distractors mix word classes | Options come from the whole pool with no part-of-speech match. In the report, the `gültig` (adjective) question offers `جواز السفر` (passport, a noun) and `يعترف بـ`. Learners can rule options out by class alone. | Prefer distractors with the same `part_of_speech`, falling back to the rest only when needed. |
| P1 | Source rows and the same pools (`quizGenerator.ts` lines 127 and 166) | Glosses and sentences used as options | 544 of 4,757 option lines contain a parenthetical or a sentence. Examples from the report: the `Kurs` question offers `التسجيل (إبلاغ البلدية بعنوان سكنك)`, and the `Stift` question offers `أحتاج هذا للاستمارة` (a sentence). These options look different from the rest and give the answer away. | Exclude option text with parentheses or sentence length from distractor pools. Move glosses to the explanation. Clean the source rows. |
| P1 | Scenario × level coverage (report, `COVERAGE GAPS`, 13 records) | No content for some scenario and level | `airport_arrival`, `train_station`, `train_first_ride` and `numbers_and_prices` (topic `travel`) have no B1 or B2 vocabulary or phrases. The five `exam_*` scenarios (`exam_sich_vorstellen`, `exam_erfahrungen_sprechen`, `exam_gemeinsam_planen`, `exam_thema_praesentieren`, `exam_auf_partner_reagieren`) have no B2 content. B1 or B2 learners get only lower-level items on these. | Add B1 and B2 vocabulary and phrases for these scenarios, or mark them A1–A2 only so the trail stops offering them at those levels. |
| P1 | `scripts/audit-quiz-content.mjs` lines 69–71 (`promptIsHeadword`) | Checker blind spot | The expected string is `article + word` built from the same bad row, so `die die Nummer` equals `die die Nummer` and passes. That is why 0 headword mismatches are reported despite 565 doubled prompts. | Compare the prompt with the bare headword and fail when `german` already starts with an article. Add a case to `tests/quizGenerator.test.ts`. |
| P2 | `quizGenerator.ts` line 182 (phrase `explanation`) and the vocab explanation | Explanations do not teach the rule | The phrase explanation is only `German = Arabic`. The vocab explanation gives no gender or plural hint, though the prompt is a noun with an article. | For nouns, add gender and plural. For phrases, add a usage note where the scenario needs one. Lower priority than P0 and P1. |

**Answers checked and correct as translations:** `Stift` → `قلم` (pen), `Kurs` → `دورة` (course), `Adresse` → `العنوان` (address), `gültig` → `ساري المفعول` (valid). The duplicate-row issue above is separate from these correct answers.

**Needs native or expert review:** which Arabic senses to keep for `gültig` (`سارٍ / صالح`, `ساري المفعول`, `صالح`) and `Adresse` (`عنوان` vs `العنوان`), and how to rewrite gloss-style options as short translations without losing meaning.

**Not checked:** answer-position distribution (`correctIndex`), and translation accuracy of every row (only the spot-checked sample above).

Nothing in this type was changed.

## Type 8 — Mock exams (free B1 Sprechen mock)

Coverage: read all 3 parts, all 5 topic cards and the instruction builder in `cloudflare-mock-exam.js` (full file); `src/lib/mockexam/constants.ts` (full); `src/lib/mockexam/score.ts` lines 62–136 of 169 (the estimate formula; lines 137–169 not read). Read the official format from the Goethe-Institut B1 Modellsatz Sprechen page (`bfu.goethe.de/b1_mod/sprechen.php`). Not read: `MockExamScreen.tsx` (grepped only, for timer and estimate wiring). Items sampled: 8 of 8 (3 parts, 5 topics) plus the scoring formula.

Official reference (Goethe B1 Sprechen, cited from the page above): 15 min for a pair. Aufgabe 1 planning together, about 3 min, with a bulleted task card. Aufgabe 2 presentation, about 3 min, from one of two topics with five slide prompts (situation or experience; situation in home country with examples; pros and cons with own opinion and examples; closing). Aufgabe 3 about 2 min: react to feedback and questions, and give feedback and a question on the partner's presentation. Preparation 15 min alone, notes allowed. Scoring: Aufgabe 1 Erfüllung 8, Interaktion 4, Wortschatz/Register 8, Strukturen 8; Aufgabe 2 12/4/12/12; Aufgabe 3 Erfüllung 16; Aussprache 16 across tasks.

| Sev | File | Item | Issue | Proposed fix |
|---|---|---|---|---|
| P0 | `cloudflare-mock-exam.js` (line 247) | `mockExamInstructionForPart`, Part 2 | Reads `chosen.cardDe` and `chosen.cardAr`, but `chosen` is a `MOCK_EXAM_PARTS` entry with no card fields. The examiner receives `TOPIC CARD … "undefined" (Arabic: undefined)`. The topic card is never sent. The `tests/mockExam.test.ts` assertion (line 101) only matches `/TOPIC CARD/`, so the bug passes. | Pass the chosen topic card into the instruction (from the signed grant or the brief) and assert its German text in the test. |
| P0 | `cloudflare-mock-exam.js` (lines 245–248) | Parts 1 and 3 topic line | The examiner is told `TOPIC under discussion: "Teil 1 — Gemeinsam planen"` (a part title, not a topic). The topic the learner sees in the brief (`mockExamBrief().topic`) is never sent to the model for any part, so the learner and the examiner can discuss different topics. | Same fix as above: one topic per mock, sent to every part. |
| P0 | `src/lib/mockexam/score.ts` (line 74) | `BAND.getting_there.ar` | Arabic learner-facing text contains Chinese: `أنت في منتصف الطريق —继续保持، …`. | Replace `继续保持` with Arabic, e.g. `واصل`. Native review of the sentence. |
| P1 | `cloudflare-mock-exam.js` (lines 22–66, 80–100 `MOCK_EXAM_PARTS`) | Part structure and timing | Official: planning about 3 min, presentation about 3 min, reaction about 2 min. Mock: 3 × 300 s (5 min each), and no preparation time or notes before Part 2. Official Part 2 gives five slide prompts; the mock brief asks only for an opinion and "something you usually do". | Owner decision. Either align to 3/3/2 and add the five-point structure and preparation time, or say in-app that the mock is a simplified format. Expert review before changing the brief. |
| P1 | `cloudflare-mock-exam.js` (Part 3) | Task type | Official Aufgabe 3 requires feedback and a question on the partner's presentation, plus discussion of both topics. The mock Part 3 only answers examiner questions ("Auf Fragen reagieren"). | Add a feedback-and-question step, or retitle the part to match what it tests. |
| P1 | `cloudflare-mock-exam.js` (Part 1) | Task card | Official Part 1 gives a concrete situation card with bullet points (e.g. visit a hospitalised classmate). The mock brief is generic ("Was möchten Sie machen?"). | Add situation cards like the topic cards. Check level fit with an expert. |
| P1 | `score.ts` (lines 62–136, `estimatePracticeScore`) | Scoring criteria | The estimate weights independence (35%), accuracy (35%), coverage (15%) and pacing (15%). None of these is an official criterion. Official scoring uses Erfüllung, Interaktion, Wortschatz/Register, Strukturen and Aussprache. Pronunciation is not measured at all. The screen is honest that it is not an official grade (`unproven: true`), but the components do not measure what the exam scores. | Owner decision. Map the estimate to the official criteria where the app can measure them, and state that pronunciation is not scored. |
| P1 | `score.ts` (lines 104–129) | Pacing rule | The comment says "below half the budget … above twice it … both are 100 here". The code returns 100 only for 40–220 % of budget. Below 40 % it keeps the raw value (e.g. 20), so a short session is penalised, which the comment does not say. The comment's "half" is 50 %, not 40 %. | Decide the intended rule, then make the comment and the code agree. Add a test for under-time and over-time. |
| P2 | `cloudflare-mock-exam.js` (line 251) | Examiner instruction | Model-facing typo: `B1 SPEAKEN — PART …`. Should read SPRECHEN. | Fix the word. |
| P2 | `score.ts` (line 74) | `getting_there` text | "والجزء الثالث هو الأضعف عادةً" (part 3 is usually the weakest) is a claim the app does not measure. | Remove the claim, or tie it to the learner's per-part data. |
| P2 | `cloudflare-mock-exam.js` (Umwelt topic) | `titleAr` | "البيئة واليوم اليومي" repeats a word and reads awkwardly. | Rephrase, native review. |
| P2 | `cloudflare-mock-exam.js` (Arbeit topic) | `cardAr` | "كم مهم أن تكون المهنة في حياة سعيدة؟" is an awkward literal translation. | Native review, then rephrase. |
| P2 | `cloudflare-mock-exam.js` (line 232 comment) | Duplicate constant | `MOCK_EXAM_LEVEL` is defined here and in `src/lib/mockexam/constants.ts`. The constants file says a test pins the pair. Confirm the test checks both. | Check the test, no change needed if it does. |

**Needs native or expert review:** every Arabic wording change above, and the Goethe-realism changes (timing, task types, scoring) which need a check against the current Goethe Durchführungsbestimmungen.

Nothing in this type was changed.

## Type 10 — Mock exam: which real exam does it claim to prepare for? (answered from code)

**Answer: no real exam is named anywhere in the mock.** Every mock string is generic ("a B1 speaking
exam"). The rule is explicit in the worker header, `cloudflare-mock-exam.js` line 13: *"nothing here
mentions Goethe, telc, ÖSD or any exam body"*, and `tests/mockExam.test.ts` (lines 30, 48–55)
enforces it over the notice, parts and topics. What a learner sees: `MOCK_EXAM_SCENARIO_TITLE`
"B1 Sprechen — Prüfungssimulation" (`cloudflare-mock-exam.js` line 37), the chip "محاكاة B1"
(`MockExamScreen.tsx` line 135), and the notice "محاكاة تدريب بأسلوب امتحان B1 — ليست الامتحان الرسمي
ولا تمنح درجة معتمدة." (line 55). This section answers the owner's question and restates Type 8 where
they overlap; it does not re-discover Type 8.

Parts, task types and time (all from `cloudflare-mock-exam.js` lines 67–115; 5 topic cards at
122–163):

| Part | id | Task type | Budget |
|---|---|---|---|
| 1 | `plan` | plan something together with a speaking partner (the AI is **not** the examiner here) | 300 s |
| 2 | `present` | present a topic, then answer follow-up questions (one of 5 topic cards) | 300 s |
| 3 | `react` | react to the examiner's questions | 300 s |

Total 15 minutes, with **no preparation time** and no notes step (the brief is minted by
`mockExamBrief`, lines 201–220).

Scoring: there is no official score. `estimatePracticeScore` (`src/lib/mockexam/score.ts` lines
88–144) weights independence 35 % / accuracy 35 % / coverage 15 % / pacing 15 %, returns `null`
below 3 sentences, and always carries `unproven: true` plus the notice "هذا تقدير تدريبي … ليس درجة
رسمية ولا يتبع نتيجة الامتحان." (lines 58–59). The screen labels it "تقدير تدريبي" and shows no pass
mark (`MockExamScreen.tsx` lines 294, 306). This part is honest and was verified in Type 8.

| Sev | File | Item | Issue | Proposed fix |
|---|---|---|---|---|
| P1 | `cloudflare-mock-exam.js` (lines 13, 37, 54–55) vs `src/lib/onboarding/preferences.ts` (line 41) | Which exam the mock is for | The mock deliberately names no exam body. But the onboarding goal "التحضير للامتحان" promises "تمارين Goethe / telc / DTZ **بصيغتها الحقيقية**" ("exercises in Goethe / telc / DTZ **in their real format**"). The mock is one generic B1 format; a learner picking exam prep is promised three named real formats and is never told which one the only exam-prep artefact mirrors. (The landing page is honest — `LandingScreen.tsx` line 313 says the full exam formats are "قيد العمل ويُطلق فقط عندما يكون قابلاً للقياس" — but the onboarding hint is not.) | Either name what the mock approximates, or change the onboarding hint to match what ships. Owner decision. |
| P1 | format vs the real B1 Sprechen | Task types / timing / criteria | Already logged in Type 8: timings 5/5/5 vs roughly 3/3/2 plus 15 min preparation; Part 2 lacks the five-point structure; Part 3 does not test giving feedback and a question on the partner's talk; the estimate's components are not the official criteria (Erfüllung / Interaktion / Wortschatz-Register / Strukturen / Aussprache); pronunciation is not measured at all. Restated here because the owner asked for the mismatches. | See Type 8. |

Mismatch note (from code): the part names — plan / present / react — follow the **Goethe–ÖSD B1
Sprechen** shape, not the DTZ shape (introduce yourself / talk about a topic / plan together); the
app's own content note says so (`docs/content/curriculum-exam-speaking.json` line 2;
`src/lib/content/scenarioGrammar.ts` line 78). The mock never states this. By contrast the
exam-**scenario** disclaimer does name bodies ("DTZ، Goethe/ÖSD", `src/lib/utils/scenarioVocab.ts`
line 125). So the app names exam bodies on the scenario path and never on the mock path.

**Needs native or expert review:** the realism changes (timing, task types, criteria) need a check
against the current official Durchführungsbestimmungen before they are sold as preparation.

Nothing in this type was changed.
