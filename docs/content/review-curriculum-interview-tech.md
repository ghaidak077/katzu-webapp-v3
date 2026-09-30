# Review — `curriculum-interview-tech.json`

Module: مقابلات وحياة العمل في التقنية (IT-Vorstellungsgespräche und Arbeitsalltag) · 6 scenarios · 50 vocabulary · 60 phrases · 10 grammar rows · primary level B1, vocabulary levels A1/A2/B1/B2.

Gate followed: `docs/agent/CONTENT-GATE.md` — audit → adversarial self-review rounds → approval only after a later zero-defect round → loader dry-run. Reviewed by AI self-review; **no human review**. The reviewer is the same model that authored the rows, so treat this file as a map of what is most likely wrong, not as proof it is right.

## Round 1 — machine audit + adversarial read (defects found, all fixed)

Machine audit (`scripts/audit-curriculum.mjs`): PASSED on first run (structure, pools, contiguous sort_order, levels).

Adversarial read found:

1. **Garbled Arabic + Latin intrusion** — the standup phrase's Arabic contained a corrupted transliteration of "Jonas" (letters in wrong order), and the Mahlzeit example carried the Latin word inside `example_ar`. Fixed: natural Arabic without any Latin (`ويوناس يتولى التصميم` re-ordered; Mahlzeit explained as تحية الغداء).
2. **Coverage gap `einrichten`** — the verb appeared only split (`…neu ein.`), invisible to the headword check. Fixed: the support phrase now uses the nominalization `beim Einrichten des Zugangs` (natural countable German, per the module1 precedent).
3. **Coverage gaps `Formular` and `Fortbildung`** — headwords present in the pool but nowhere in their topic's texts. Fixed in place: the recognition phrase now asks `Welche Formulare und Bescheinigungen brauchen Sie von mir?` and the Kurs phrase reads `Ich habe einen Kurs gemacht und danach eine Fortbildung.`
4. **Three forced key moves:** `A1|Kaffee|food` (module2 owns it), `A1|Tee|food` (collides with the live seed — the loader would silently skip it), `A1|Formular|documents` (module1 owns it). All three moved to A2 — each word's sentence is A2-level anyway.
5. **Checklist vs content mismatch** — the checklist claimed Sie everywhere outside the kitchen, but the daily standup uses du (correctly: German dev teams do). Fixed the checklist wording; `g_tech_du_im_team` teaches exactly this split.

## Round 2 — fresh-eyes re-read (2 defects found, both fixed)

6. **English word in `rule_de`:** `Der Prefix geht ans Ende` — Denglisch slip. Fixed: `Bei trennbaren Verben geht die Vorsilbe ans Ende`.
7. **Awkward passive in a B2 phrase:** `Muss die Kopie vom Original beglaubigt sein?` — grammatical but unnatural. Fixed: `Muss ich die Kopie vom Original beglaubigen lassen?`

## Round 3 — full re-review (zero defects)

All 50 vocabulary rows, 60 phrases, 6 scenarios × 5 openers and 10 grammar rows re-checked: Latin-in-Arabic sweep (clean; German grammar terms inline in grammar `title_ar`/`rule_ar` follow the repo convention the approved medical module set), article/plural completeness for every noun row, 6–10 phrases per scenario with contiguous sort_order, du/Sie register (du only in `tech_kuechenpause` and `daily_standup`, both deliberate and taught), scenario ids all new against the 27 existing ones, grammar ids namespaced `g_tech_`, secular-greeting rule, no fees/deadlines/visa/procedural claims as facts. **Zero defects found.**

## Cross-draft and production checks

- **Cross-draft uniqueness (all curriculum-*.json):** zero `(level, german, topic)` collisions after the three key moves.
- **Production collision check (read-only, cached live snapshot from this session):** zero scenario/grammar id collisions; four vocabulary keys collide with the live seed (`Kaffee/A1` — moved to A2, `Tee/A1` — moved to A2, `Formular/A1` — moved to A2, `Bescheinigung/B1` — accepted: the seed's row is skipped by the loader's insert-only rule, this draft's richer row stays as the draft of record for future loads after a seed reset).

## What a human should spot-check first (highest value, in order)

1. **The daily standup's du-register convention** — German dev teams vary; some standups stay Sie with new colleagues. The row teaches du; confirm that matches the target audience's real teams.
2. **The support-desk openers** — Frau Berger's frustration is played for practice; a native ear should confirm the escalation stays polite and realistic.
3. **Articles and plurals of the 50 headwords** — one dictionary pass; the machine checks structure, not gender.
4. **The Arabic technical register** — terms like خادم (server) and رسالة خطأ (error message) have several regional variants; confirm these are the most widely understood.
5. **The recognition scene's conversational shapes** — deliberately no procedural facts (fees, authorities, durations); confirm nothing reads as legal advice.
