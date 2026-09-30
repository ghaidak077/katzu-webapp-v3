# Review — `curriculum-ausbildung-exams.json`

Module: التدريب المهني في ألمانيا وامتحاناته (Ausbildung in Deutschland und die Prüfungen) · 6 scenarios · 51 vocabulary · 60 phrases · 10 grammar rows · primary level B1, vocabulary levels A1/A2/B1/B2.

Gate followed: `docs/agent/CONTENT-GATE.md` — audit → adversarial self-review rounds → approval only after a later zero-defect round → loader dry-run. Reviewed by AI self-review; **no human review**. The reviewer is the same model that authored the rows, so treat this file as a map of what is most likely wrong, not as proof it is right.

## Round 1 — machine audit + adversarial read (defects found, all fixed)

1. **Food pool under minimum (12 < 15).** Fixed: added `Schnitzel`, `Tisch`, `Fenster` — all three already present verbatim in the canteen texts, chosen at collision-free levels after checking every draft and the live D1 snapshot.
2. **Latin/garbled Arabic in the new rows** — `سchnيتسل` (mixed script) in Schnitzel's translation and example. Fixed: pure Arabic `شنتسل` with a gloss.
3. **Nine coverage gaps** (headwords absent from their topic's texts): `Berufsschule`, `Kuchen`, `Wurst`, `einpaken`, `Anmeldeformular`, `Wiederholung`, `Teilnahme`, `ablegen`, `sich anmelden`. All fixed in place by rewriting eight existing phrases to carry the words naturally (e.g. `Heute habe ich Berufsschule: …`, `Falls es knapp wird: Ist eine Wiederholung möglich?`, `Wann kann ich die Prüfung ablegen?`, `kann man sich hier anmelden?`).
4. **Four forced key moves:** `A1|Brötchen|food` and `A1|Kuchen|food` are owned by arrival-module2 AND present in the live seed — both moved to A2 (the owning sentences are A2-level); `A2|Essen` avoided by never adding it; `Prüfung`/`Prüfungsanmeldung`/`Prüfungstermin` distinguished by their distinct keys.
5. **Checker artifact, correctly diagnosed, no data change:** `sich anmelden` is a reflexive lemma — the naive check misses it because German word order separates `sich` from the verb (`kann man sich hier anmelden?`). The reflexive-aware check (strip `sich `, test the verb) shows full coverage.

## Round 2 — fresh-eyes re-read (3 defects found, all fixed)

6. **Wrong voice in two registration phrases** — `Wir benötigen das Original…` and `…die wir benötigen` are clerk-voice, but the learner plays the applicant in `pruefung_anmeldung`. Fixed to learner-voice questions (`Benötigen Sie das Original, oder reicht die Kopie?`, `Wo genau steht die Gebühr?`), keeping the `benötigen` coverage.
7. **Awkward word order** — `Können Sie die Aufgabe mir noch einmal zeigen?` (dative before accusative reads translated). Fixed: `Können Sie mir die Aufgabe noch einmal zeigen?`

## Round 3 — full re-review (zero defects)

All 51 vocabulary rows, 60 phrases, 6 scenarios × 5 openers and 10 grammar rows re-checked: Latin-in-Arabic sweep (clean; German terms inline in grammar `title_ar`/`rule_ar` follow the repo convention), article/plural completeness, 10 phrases per scenario with contiguous sort_order, du/Sie register (du only in `betriebs_kantine` and `berufsschule_tag`, both peer scenes — the checklist states this), scenario ids all new, grammar ids namespaced `g_ausb_`, secular-greeting rule, no exam-body rules/dates/fees/wages as facts (the fee word is taught through a question, never a stated amount). **Zero defects found.**

## Cross-draft and production checks

- **Cross-draft uniqueness:** zero `(level, german, topic)` collisions after the two key moves (verified against all other drafts).
- **Production collision check (read-only, cached live snapshot):** zero scenario/grammar id collisions; zero vocabulary key collisions after the moves (`Brötchen`/`Kuchen` at A2 are free; `Prüfung|A2|work` collides with the seed's documents-topic row — different topic, different key, clean).

## What a human should spot-check first (highest value, in order)

1. **The exam-day scene's realism** — Prüfungsausschuss/Fachgespräch vocabulary is generic on purpose; an Ausbilder's eye should confirm nothing contradicts how IHK/HWK exams actually feel.
2. **The Berichtsheft and Ausbilder relationship lines** — the B2 opener has the Ausbilder step back (`ohne dass ich die Hand führe`); confirm this matches real training relationships.
3. **Articles and plurals of the 51 headwords** — one dictionary pass, especially the compounds (Prüfungsausschuss, Anmeldeformular, Berichtsheft).
4. **The Arabic register for Azubi peers** — the canteen and Berufsschule scenes use informal peer Arabic; confirm it sounds like coworkers, not like the Sie-register scenes.
5. **`Berufsschule`/`Prüfungsanmeldung` compound plurals** — uncountable/compound plural choices were made by analogy; a native check is cheap here.
