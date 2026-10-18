# Katzu — Content audit, part 1: curriculum content and lessons

Part of the [content audit index](CONTENT-AUDIT.md). Severity key and scope are there.


## Pass 0: mechanical scan (all curriculum modules)

Method: `node scripts/audit-curriculum.mjs` (existing validator) plus a scripted scan of all 453 vocabulary rows.

| Check | Result |
|---|---|
| Existing validator (`audit-curriculum.mjs`) | PASSED, 11 files, 0 errors. It checks shape and contract only, not correctness. |
| Required vocab fields present | 453/453, no empty field |
| Noun has `der/die/das` article | all nouns valid |
| Article on non-noun | none |
| Levels | A0 37 · A1 128 · A2 151 · B1 108 · B2 29 (A0 and B2 are thin) |
| Parts of speech | Noun 299 · Verb 87 · Adjective 49 · Adverb 9 · Phrase 7 · Pronoun 2 |
| Topic labels | documents 103 · food 101 · work 87 · housing 46 · health 48 · travel 33 · exam 35 |

| File | Item | Issue | Severity | Proposed fix |
|---|---|---|---|---|
| curriculum-ausbildung-exams.json | vocab `einpaken` (line 519) | Typo. Correct verb is *einpacken*. Headword and example use the typo. | P0 | Change to `einpacken` in headword (line 519) and example (line 1159). Verify the example sentence after the change. Fixed: both changed; the example now reads "Meine Mutter will mir jeden Tag Brötchen mit Wurst einpacken." |
| curriculum-ausbildung-exams.json | example line 1159 `Meine Mutter will mir jeden Tag Brötchen mit Wurst einpaken.` | Same typo in the example sentence. | P0 | Fix together with the headword. Fixed with the headword. |
| all modules | vocab `topic` | Topic `food` is used on 101 rows, including greetings (`hallo`, `tschüss`, `danke`, `ja`, `nein`, `bitte`) in a0-foundations. The label does not describe these items. | P1 | Re-tag greetings and yes/no words (e.g. `general`) and check the topic set against the scenario categories. Needs a decision on the topic taxonomy. |
| 30day-module1 / arrival / a0 / etc. | duplicate headwords (27 found) | Same headword in more than one module, sometimes at different levels: `kaffee` A0/A1/A2, `tee` A0/A2, `brot` A0/A1, `trinken` A0/A1, `kosten` A0/A1, `hilfe` A0/A1, `wiederholen` A0/A2, `wohnung` A1/A2 (same module), `formular` A1/A2, `pause` A1/A2, `uhrzeit` A1/A2, `datum` A1/A2, `prüfung` A2/A2, `selbstständig` B1/B2, `anerkennen` B1/B2. | P1 | Keep one canonical row per headword at its primary level. Other modules should reference it, not repeat it. Needs a decision on whether repetition is intentional for spaced review. |
| 30day-module1 / a0 / arrival / interview-tech | inconsistent `plural` for the same noun (`Kaffee`: `die Kaffees` in two modules, empty in interview-tech; `Tee`: `die Tees` vs empty) | Data drift between duplicate rows. Plural `Kaffees` is also a rare form for everyday use. | P2 | Use one plural per noun. Check `Kaffee`/`Tee` plural forms with a native speaker (*needs native or expert review*). |
| 30day-module1, interview-tech, coverage-fix | German spelling variants in translation: `anerkennen` "to recognise" vs "to recognize"; `schriftlich` "in writing" vs "written" | British and American spelling and a different sense for the same German word across rows. | P2 | Standardise English spelling and the gloss for each headword. |
| all modules | `german` field format | 78 rows put the article in the headword (`der Reisepass`) while others keep the article in the `article` field. The shape is mixed. | P2 | Pick one convention (article in `article` only) and check the loader accepts it. |
| 30day-module1, ausbildung-exams, interview-tech, exam-speaking | 24 nouns with empty `plural` | Missing plural data for review and drills. | P2 | Fill plurals, or mark them as uncountable where that is the case. |
| interview-tech, others | `anerkennen` B2 example `Sie erkennen mein Zertifikat an.` | Correct in form (separable verb with the particle at the end), but the headword/example pairing differs from the B1 row in 30day-module1. Level B1 and B2 are both used for the same verb. | P2 | Keep one row. Covered by the duplicate fix above. |

## Coverage of this pass

- Read by script: all 453 vocabulary rows and all 44 scenario entries (`id`, `category`, `ai_persona`, initial messages).
- Read in full: 3 vocabulary rows (A0 sample) and 1 scenario (`first_greetings`) for the structure.
- Validator: 11 files, passed.
- Items still to read by hand: see sections below for each type.

## Type 1 — Placement items (corrected)

Source: `src/lib/placement/generator.ts` draws from each module's `vocabulary` and `starter_phrases` rows. A first draft of this section contained unverified numbers and three findings that were not errors. They are removed here. Everything below was checked by script.

Pool (verified by script, unique rows, `docs/content/curriculum-*.json`): vocabulary 453, phrases 406.

| Level | Vocabulary | Phrases |
|---|---|---|
| A0 | 37 | 33 |
| A1 | 128 | 114 |
| A2 | 151 | 115 |
| B1 | 108 | 105 |
| B2 | 29 | 36 |

Coverage: all 859 rows were checked by script for article formatting, duplicate headwords and shared Arabic meanings. Individual items were **not** read by eye in this pass, so no level-fit or distractor judgment is made for placement. That read is still to do.

| File | Item | Issue | Severity | Proposed fix |
|---|---|---|---|---|
| `curriculum-coverage-fix.json` and others (78 vocabulary rows) | `der Reisepass`, `der Aufenthaltstitel`, `die Nummer`, `das Dokument`, `der Stempel`, `die Behörde` | `german` already contains the article and the `article` field is also set. Placement prompts show "der der Reisepass". | P1 | Decision needed: strip the article from `german` on the 78 rows (data fix), or guard the generator. |
| `curriculum-coverage-fix.json` (B2 phrase) | "Ich arbeite gern eigenverantwortlich und entschieden — auch unter Zeitdruck." → "أعمل عندهاً باستقلالية وحزم — حتى تحت ضغط الوقت." | "عندهاً" is a typo with no meaning. | P1 | Remove "عندهاً". "حتى تحت" needs native review. |
| `curriculum-ausbildung-exams.json` (B2 phrase) | "Nach dem Essen tauschen wir uns kurz über den Betrieb aus." → "...عن المصنع" | "Betrieb" means company or workplace, not factory. | P1 | Change to "عن الشركة". Needs native review. |
| `curriculum-coverage-fix.json` and `curriculum-30day-module1.json` (B1) | `die Besichtigung` (coverage-fix) and `Besichtigung` (30day-module1), both "المعاينة" | Same headword at the same level, stored twice, one with the article in `german`. | P1 | Merge into one row. |
| Across vocabulary (26 shared Arabic meanings) | "Termin" ×2 at A1; "der Termin" + "Termin" at A1; "Kaffee" at A0, A1, A2; "Brot" at A0, A1; "trinken" at A0, A1; "Wohnung" at A1, A2; "Pass" (A1) vs "der Reisepass" (A1) for "جواز السفر" | The same word at more than one level, or exact duplicates at one level. The distractor guard stops two identical options in one question, but a learner still meets the same word repeatedly. | P1 | Keep one row per headword at its real level. Merge exact duplicates. Level decisions needed for Kaffee, Brot, trinken, Wohnung. |
| `curriculum-interview-tech.json` (B2 phrase) | "مرة أطلقت تحديثًا قبل وقت المناسب" | "قبل وقت المناسب" is ungrammatical. "قبل الأوان" is the standard phrase. | P2 | Replace. Needs native review. |
| `curriculum-interview-medical.json` (`mitbringen`) | "يحضر معه / يملك" | "يملك" is a loose gloss. The A1 row in `curriculum-30day-module1.json` says "يُحضر معه" for the same headword. | P2 | Merge the two rows, or keep one gloss. |
| `curriculum-a0-foundations.json` (`heißen`) | "يُسمَّى / اسمه" | "اسمه" means "his name", a noun. It sits next to a verb gloss. | P2 | Keep "يُسمَّى". Needs native review. |
| Placement pool, B2 | 29 vocabulary + 36 phrases = 65 items | Thin top of the ladder. Long B2 runs will repeat items across attempts. | P2 | Add more B2 rows. |

Removed from the first draft, with reasons:
- "Ich bezahle mit Karte" (arrival-module2, A1): German present for a near-future, and the English gloss also says "will". Not an error.
- "heißen topic = food": not verified. Removed.
- "die Prüfung" and "der Druck" as doubled-article examples: not verified. Removed.
- "29 shared meanings": the script says 26.
- "explanationAr echoes the german prompt": not checked. Removed.

### Placement sample read (by eye) — corrected

The first version of this note described a sample I had not drawn. It is replaced by the real one below.

A seeded generator (LCG, seed 7) drew 12 rows from the combined vocabulary and starter-phrase pool across all curriculum files. Read by eye:

| File | Row | Result |
|---|---|---|
| coverage-fix | phrase, A1, "Hier ist mein Reisepass." | Correct |
| arrival-module2 | vocab, A1, frisch | Correct |
| coverage-fix | vocab, B1, die Verletzung | Correct |
| interview-tech | phrase, B1, Käse im Kühlschrank | Correct |
| exam-speaking | phrase, A2, Ich heiße Omar… | Correct |
| coverage-fix | vocab, **B2, der Geschmack** | **Defect (P0):** example_ar "المذاق تبليبي لطيف." contains a nonsense word (تبليبي). Plural "die Geschmacker" is doubtful, since the standard form is Geschmäcker. Needs native review. Fixed — see the disposition table at the end of this file. |
| interview-medical | phrase, B1, Bewerbung: Ich möchte… | Correct |
| interview-tech | vocab, A2, Ergebnis | Correct |
| 30day-module1 | vocab, Sozialversicherungsnummer | Read at the start of the row only, no defect seen |
| interview-tech | phrase, B2, "Bekommt mein Nachweis…" | Grammatical, but "Hat mein Nachweis…" is more natural. P2 polish. |
| a0-foundations | phrase, A0, Ich komme aus Syrien. | Correct |
| a0-foundations | vocab, A0, Hilfe | Correct |

Result: 11 of 12 correct on wording. One P0 (the garbled Arabic, which is isolated: a grep finds it in one row only). The doubled-article defect (78 rows) is a separate, mechanical finding that this sample did not hit directly. Coverage for this type: 12 rows read by eye and 859 rows checked by script (453 vocabulary, 406 phrases).

## Type 2 — Scenarios

Coverage: all 44 scenarios checked by script (field presence and A1/A2/B1/B2 openers). 10 read by eye (seed 11): exam_erfahrungen_sprechen, bewerbung_ausbildung, kollegen_smalltalk, landlord_followup, ausbildung_alltag, exam_gemeinsam_planen, station_uebergabe, exam_thema_praesentieren, mietvertrag_uebergabe, exam_sich_vorstellen. Some B1/B2 openers were cut off in my display and were not read in full.

| File | Item | Severity | Issue | Proposed fix |
|---|---|---|---|---|
| curriculum-30day-module1.json | mietvertrag_uebergabe, initial_message_a1 | P1 | The A1 opener "Hallo! Sie möchten die Wohnung mieten?" (Do you want to rent the flat?) does not fit the scenario, which is a handover (Übergabe). The A2, B1 and B2 openers all assume the handover. | Rewrite the A1 opener as a handover line, e.g. "Guten Tag! Wir machen heute die Wohnungsübergabe. Haben Sie das Protokoll schon?" Native review of the German wording. |
| all curriculum files | ai_persona values ("… katze") | Open question | The "<Rolle> katze" suffix is a deliberate naming rule (curriculumAudit.ts:429-430), not an error. It is not confirmed whether the UI shows persona names to learners. | Check the UI for ai_persona display. If it is shown, decide whether the suffix belongs there. |
| curriculum-interview-medical.json | kollegen_smalltalk (category daily_life) | P2 | A daily-life scenario sits in the medical interview file. This is a grouping issue only. | Move to a daily-life file when next editing. |
| all curriculum files | initial_message_a0 missing on 15 scenarios | Not a defect | A0 openers are optional by design (curriculumAudit.ts:67-69). | None. |

No P0 found in the 10 scenarios read.

## Type 3 — Lessons and vocabulary

This section replaces an earlier draft. Its row counts, the "12 rows read" figure and the Berufsschule file name were not verified and are withdrawn.

Coverage: a script checked all 453 vocabulary rows in docs/content/curriculum-*.json (rows with `german` and `part_of_speech`). Read by eye: 7 rows (der Geschmack, Bürgeramt, Versichertenkarte, Übergabeprotokoll, Sozialversicherungsnummer, Berufsschule, die Zubereitung). Scenario and lesson bodies and the 406 starter phrases were not re-read in this pass. The headword check covers nouns only.

Script results:
- 0 empty translation_ar or translation_en; 0 missing example_ar.
- 78 rows where `german` already starts with the article (the doubled-article defect).
- 24 nouns with an empty plural. Most are mass nouns (Milch, Butter, Zucker, Tee), which is correct. About 8 are count nouns that should have a plural (listed below).
- 5 noun example sentences that do not contain the headword.

| File | Item | Severity | Issue | Proposed fix |
|---|---|---|---|---|
| curriculum-coverage-fix.json | der Geschmack (B2), example_ar | P0 | The Arabic example "المذاق تبليبي لطيف." contains a non-Arabic word (تبليبي), so the Arabic is wrong. | Fixed: replaced by "المذاق لطيف وبنكهة التوابل.", a plain rendering of the row's own English "The taste is pleasantly spiced." **Needs native review of the wording.** |
| curriculum-coverage-fix.json | der Geschmack, plural | P1 | The plural is given as "die Geschmacker". The usual plural is "die Geschmäcker". | Fixed to `die Geschmäcker` (standard German, as in "die Geschmäcker sind verschieden"). **Needs native review.** |
| 78 rows in curriculum-*.json | `german` with the article, plus the `article` field | P0 | `german` already contains the article (e.g. "die Verletzung") and `article` is also set. The placement generator adds the article again, giving "die die …". Confirmed in placement; other vocabulary renderers not yet checked. | Fix once at the data or render layer, then check all screens. |
| curriculum-30day-module1.json | Bürgeramt (example "Für die Anmeldung brauche ich einen Termin."), Versichertenkarte ("Ihre Karte kommt per Post…"), Übergabeprotokoll ("Im Protokoll stehen alle Mängel."), Sozialversicherungsnummer ("Diese Nummer brauchen wir…"), Steueridentifikationsnummer | P2 | The example uses a related word, not the headword. | Rewrite each example to contain the headword. |
| curriculum-ausbildung-exams.json | Berufsschule | P2 | `plural` is an empty string; should be "die Berufsschulen". | Add plural. |
| curriculum-coverage-fix.json | die Zubereitung | P2 | `plural` is null; should be "die Zubereitungen". | Add plural. |
| curriculum-*.json | Instandhaltung, Druck, Entwicklung, Gültigkeit, Kundendienst | P2 | Count nouns with no plural in the data (from the script list). The file for each was not checked. | Add plurals after checking each row. |
| curriculum-*.json | Tabletten | P2 | Lemma is the plural form. The singular "die Tablette" is the usual headword. | Needs review before any change. |

Level fit: the 7 rows read are at their stated levels and the translations are correct, apart from the Geschmack row above.

Open question: check whether vocabulary screens other than placement show the doubled-article defect.
