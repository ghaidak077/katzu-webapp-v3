# Review — `curriculum-interview-medical.json`

Module: مقابلات العمل في المجال الطبي (Vorstellungsgespräche im Gesundheitswesen) · 6 scenarios · 64 vocabulary · 58 starter phrases · 10 grammar rows · primary level B1, vocabulary levels A1/A2/B1.

Gate followed: `docs/agent/CONTENT-GATE.md` — audit → adversarial self-review rounds → approval only after a later zero-defect round → loader dry-run. Reviewed by AI self-review; **no human review**. The reviewer is the same model that authored the rows, so treat this file as a map of what is most likely wrong, not as proof it is right.

## Round 1 — machine audit + adversarial read (defects found, all fixed)

Machine audit (`scripts/audit-curriculum.mjs`) and the draft's own `knownLimitations` were used as the review frame.

1. **Vocabulary rows carried articles inside `german`** (`das Zeugnis`, `der Lebenslauf`, …, 46 noun rows). The cross-draft uniqueness key is `(level, german, topic)` and every other draft stores the bare headword, so mixed storage both broke key comparability and risked future duplicate rows under two spellings. Fixed: normalized all noun rows so `german` is the bare headword and `article` carries der/die/das. Audit passed after this.
2. **Phrase-count overrun** (65 phrases; four scenarios above the 6–10 standard: 11/11/12/12). Fixed by rebalancing to 10/10/9/10/9/10 (58 total): weaker near-duplicate lines deleted, every deleted line's vocabulary coverage re-placed into kept lines or openers — see 3–6.
3. **`interview_pflegefachkraft` had two near-identical "three years on a ward" lines** (`Ich habe drei Jahre…` / `Nach meinem Studium habe ich drei Jahre…`). Fixed: kept the first, extended it to carry `Schicht` coverage; deleted the second.
4. **`kollegen_smalltalk` had two near-identical "Kantinenessen ist gesund und lecker" lines.** Fixed: merged into one; `schmecken` coverage moved into the same line.
5. **Coverage holes after the trim** (found by re-running the word-in-own-topic-text check over all 64 rows): `Schicht`, `mitbringen`, `dauern`, `schmecken` — all re-covered by in-place phrase edits; `Dienstplan`, `Motivation`, `Weiterbildung`, `weiterbilden`, `Bewerbung`, `Verantwortung`, `Frühstück`, `gemeinsam`, `Durst`, `bestellen`, `Mineralwasser`, `gesund`, `Apfel`, `Verband`, `Schmerztablette`, `Diagnose`, `Nachtdienst` had gained coverage in the same rebalance. Final check: 64/64 rows verbatim (or stemmed) in a same-topic phrase or opener.
6. **German naturalness of replacement lines (round-3 re-read of this round's own edits):** `die Schicht am Wochenende war selbstverständlich` → `Schichten am Wochenende waren selbstverständlich`; `Verantwortung im Dienstplan` (wrong preposition sense) → `Verantwortung und arbeite flexibel nach Dienstplan`; `Kantinenessen schmeckt gesund` (semantic mismatch) → `ist heute gesund und schmeckt lecker`; `Nachtdienst-Medikamente` (non-standard compound) → `Um zehn beginne ich den Nachtdienst und gebe dann die Medikamente…`. One duplicate kantine line created by an earlier merge was removed.

Also fixed in earlier passes (recorded for completeness): separable-verb coverage — `mitbringen` and `weiterbilden` now appear as the literal dictionary form in their phrases, since `bringe … mit` / `Abteilung weiterbildet` did not match the headword check; `Nachtdienst` moved topic work → health, where its sentence lives.

## Round 2 checks — no defects

- **du/Sie register:** `du|dich|dir|dein` appears in no phrase outside `kollegen_smalltalk`; the smalltalk scene alone uses du. Openers follow the same split.
- **Articles/plurals:** every noun row carries `article` and `plural` (0 missing); `part_of_speech` distinguishes nouns from verbs/adjectives.
- **No fees, deadlines, or procedural claims as facts:** the Anerkennung scene asks about procedures (`Wie lange dauert das Verfahren?`) without stating durations, fees, or document lists; salary questions stay absent as facts per `knownLimitations`.
- **Arabic:** MSA, no German transliterations, no السلام عليكم for secular greetings (`Guten Tag` → نهارك سعيد), natural word order re-checked in the round-3 read.
- **Uniqueness:** scenario ids, grammar ids, in-draft vocab keys, and `(scenario_id, german)` phrase pairs all unique; no grammar id or scenario id reuses the 15 live ids; grammar ids are namespaced `g_med_*`.
- **Production collision check (read-only, 2026-09-30):** live D1 scenarios/grammar ids and `(level, german, topic)`/`(scenario_id, german)` keys fetched via `wrangler d1 execute --remote --json` (369 unique ids+keys). Scenario and grammar ids: zero collisions. Vocabulary: 5 key collisions (`Bewerbung/B1/work`, `Erfahrung/A2/work`, `Team/A2/work`, `Diagnose/B1/health`, `Frist/B1/documents`) — all with the original live seed vocabulary, **none** owned by any other draft (verified by scanning all `docs/content/curriculum-*.json` + supplements), and the loader skips existing `(level, german, topic)` rows by design, so the load writes 59/64 vocab rows and updates nothing.

## Round 3 — full re-review (zero defects)

All 64 vocabulary rows, 58 phrases, 6 scenarios × 5 openers and 10 grammar rows re-checked after the last edit: article/gender, du/Sie register per scene, Arabic naturalness, secular-greeting rule, no fees/deadlines/laws as facts, every pool word verbatim in a same-topic phrase or opener, uniqueness inside the draft and against the other three drafts' taken keys. **Zero defects found.**

## What a human should spot-check first (highest value, in order)

1. **The medical accuracy of the handover scene** (`station_uebergabe` openers and phrases) — simplified verbal shift handover, deliberately not SBAR; a nurse's eye should confirm nothing teaches a bad habit.
2. **The B1/B2 interview openers with the two-level model answers** — do the trick-question formulations (`Warum sollten wir gerade Sie einstellen?`) match what German hospital panels actually ask?
3. **Articles and plurals of the 64 headwords** — one dictionary pass; the machine checks structure, not gender.
4. **The Arabic medical register** — patient-talk phrases address the patient with Sie and by surname (`Frau Adler`); confirm the Arabic renders this naturally for Syrian/Gulf/Levantine learners alike.
5. **The five seed-vocabulary key overlaps** listed above — confirm the skipped rows' existing translations/levels in D1 are acceptable substitutes for the draft's rows they shadow.
