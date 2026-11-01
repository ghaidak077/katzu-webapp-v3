# Content audit — scenarios v2

Measured 2026-11-01 against the live content export
`backups/pre-content-v2/content.sql` (49 `scenarios` rows), parsed to
`%TEMP%/opencode/scenarios-d1.json` and compared column-by-column with the
owner's `katzu-scenarios.json` attachment: **all 49 rows are byte-identical**.

Nothing in this document is a claim about the database after 2026-11-01. The
local catalogue is `docs/content/catalogue/scenarios-catalogue.json`; production rows are
unchanged until an authorized content load.

## 1. What was measured

| Check | Result |
| --- | --- |
| Scenario rows | 49 |
| `initial_message_a0` missing | **20 of 49** |
| Openers violating a level cap | **165 cells**, in 47 of 49 scenarios |
| `ai_persona` not following the `<Rolle> katze` convention | **5** |
| Icon stored as emoji (mixed with kebab-case keys) | **5** |
| `sequence_order` set to anything but 0 | **0 of 49** |
| `banner_url` set | **0 of 49** |

Cap check used the owner's brief and the worker's own per-sentence caps
(`cloudflare-level-spec.js`): A0 6 words / 6 per sentence / exactly 1 question;
A1 10 / 8 / 1; A2 18 / 10 / 2 sentences / 1 question; B1 30 / 12 / 3 sentences;
B2 45 / 15. An opener has to satisfy both, because the greeting guard
(`sceneTopicReAsk`) re-validates the stored last sentence and silently falls
back to a generic re-ask when it fails.

### 1.1 The twenty missing A0 openers

`embassy_appointment`, `cafe_order`, `job_interview`, `doctor_visit`,
`apartment_viewing`, `airport_arrival`, `train_station`, `bakery_shopping`,
`landlord_followup`, `friend_catchup`, `anmeldung_buergeramt`,
`termin_online_buchen`, `krankenkasse_anmelden`, `mietvertrag_uebergabe`,
`erster_arbeitstag`, `pass_und_dokumente`, `restaurant_besonders`,
`gesundheit_alltag`, `wohnung_besichtigen_tiefer`, `buero_gespraech_tiefer`.

A learner who starts at zero therefore met A1 German in 20 of 49 scenes.

### 1.2 The worst cap violations (words per level)

`interview_pflegefachkraft` 10 / 23 / 33 / 50 / 59 against 6 / 10 / 18 / 30 / 45.
`interview_arzt` 10 / 21 / 29 / 39 / 51. `patient_conversation_basics`
9 / 18 / 30 / 47 / 55. `station_uebergabe` 11 / 19 / 30 / 40 / 56.
`kollegen_smalltalk` 8 / 18 / 28 / 37 / 60.

The pattern is not "a few rows need trimming": the level ladder was written as
one text per scenario and then filled downward, so A0–A2 are B1/B2 sentences
with words removed. The catalogue rebuilds the ladder from the scene's key
question outward instead.

### 1.3 Persona and icon drift

Personas missing the `katze` convention: `embassy_appointment`
(`Herr Schmidt, ein deutscher Konsulatsangestellter`), `cafe_order`
(`Frau Weber, eine Kellnerin`), `job_interview` (`Herr Bauer, ein
Personalleiter`), `doctor_visit` (`Dr. Fischer, ein Hausarzt`),
`apartment_viewing` (`Frau Klein, eine Vermieterin`). Everything else already
follows `<Rolle> katze`.

Icons are two systems at once: five emoji (`🏛️ ☕ 💼 🩺 🏠`) and 44 kebab-case
lucide names (`plane`, `shopping-bag`, `heart-pulse`, …). The app never renders
`scenario.icon` — cards use `ScenarioBanner` and `sceneFor()` — so the column is
a CMS convention only. The catalogue keeps the **kebab-case** keys, matching
`src/lib/db/katzuDb.ts` and the 44 rows that already use them.

### 1.4 Ordering

`sequence_order` is 0 on every row, and `/scenarios` does not order by it. The
Trail is ordered by `src/lib/content/scenarioOrder.ts` (stage → named order →
`sequence_order` → id). Setting real numbers therefore only changes the result
when the screen stops using that module. The catalogue still assigns a real
1..N order (survival → daily life → health/housing → official/work → exams) so
the data says what the journey means, and `scenarioOrder.ts` is extended in the
same change for the new ids.

## 2. German correctness pass

The full pass rewrote every opener, so the fixes below are folded in rather
than listed as separate patches. The recurring errors that motivated the pass:

- **Register leaks.** `du`-forms inside scenes whose persona is an official,
  landlord or doctor (`Wie heißt du?` from a `Sachbearbeiter`), and `Sie`-forms
  between friends. Rule applied: `Sie` for officials, landlords, employers,
  doctors, insurers and strangers in service roles; `du` only for peers
  (friends, classmates, close colleagues in the informal scenes).
- **Missing finite verb / telegraphic German** in A2–B2 openers
  (`Bitte Ihre Papiere.`), and noun stacks that no speaker would say.
- **Wrong article/gender** on the persona roles (`eine Vermieterin` used for a
  male-coded scene, `Arzt Praxen`), and missing `zu`/`zum` before
  institutions.
- **False friends and anglicisms** (`Termin nehmen`, `Ich bin agree`), and
  `Wie geht es Ihnen?` used as a scene question. That question is banned inside
  a scene: it asks about wellbeing, not about the scene's business, and every
  test now enforces its absence.
- **Questions that are not the scene's question** (small talk at the end),
  which broke the greeting guard's re-ask. Every opener now ends with the
  scene's key question as its last sentence.

## 3. Level contract applied

| Level | Total words | Sentences | Questions | Shape |
| --- | --- | --- | --- | --- |
| A0 | ≤ 6 | 1–2 | exactly 1 | greeting + one basic question |
| A1 | ≤ 10 | 1–2 | exactly 1 | one simple question, present/Perfekt |
| A2 | ≤ 18 | ≤ 2 | exactly 1 | one short reason/context + question |
| B1 | ≤ 30 | ≤ 3 | 1–2 | situation + a connected follow-up |
| B2 | ≤ 45 | ≤ 3 | ≤ 2 | detail + two connected questions |

The key question is always the **last sentence**, because `sceneTopicReAsk`
reuses the last German sentence and the last Arabic sentence. Arabic keeps the
same sentence boundaries as German: the final Arabic question is the last
`sentence` and carries the Arabic question mark.

## 4. Duplicates: merge and soft-retire

The database has no retired/hidden column and the app has no filter. Deleting
or rewriting a row is a production D1 write, which this run is not authorized to
perform. So duplicates are handled in the only backwards-compatible way:

1. **Keep both rows** — learner progress, history rows and deep links keep
   resolving.
2. **Differentiate the pair** so they are no longer near-duplicates: the second
   scene starts later in the journey and asks a narrower question.
3. **Document the canonical one** and list the pair here for the owner.

| Pair | Canonical | Soft-retired (kept, later, narrower) | Reason |
| --- | --- | --- | --- |
| `apartment_viewing` / `wohnung_besichtigen_tiefer` | `apartment_viewing` | `wohnung_besichtigen_tiefer` | same first viewing; the second now covers contract details and move-in |
| `doctor_visit` / `gesundheit_alltag` | `doctor_visit` | `gesundheit_alltag` | first visit vs. symptoms + prescription follow-up |
| `cafe_order` / `restaurant_besonders` | `cafe_order` | `restaurant_besonders` | drink order vs. restaurant requests and complaints |
| `train_station` / `train_first_ride` | `train_station` | `train_first_ride` | station orientation vs. first ride with a ticket |
| interview family | `job_interview` | `interview_pflegefachkraft`, `interview_arzt`, `interview_it_fachkraft`, `interview_entwickler` | generic interview is canonical; the four are field-specific and stay because they carry distinct vocabulary and progress |
| `anerkennung_gespraech` / `anerkennung_it_zertifikate` | `anerkennung_gespraech` | `anerkennung_it_zertifikate` | general recognition vs. IT certificates only |
| `exam_*` (5) | kept | — | they are different exam parts, not duplicates |

Retiring (deleting) any of these still needs an owner-authorized D1 write and a
decision about the progress rows that point at them; this document is the
record of that decision, not a deletion.

## 5. New scenarios (12)

Added because a learner in Germany meets them in the first months and none of
them existed: Jobcenter appointment, pharmacy, mobile-phone contract,
Kita/school parent meeting, emergency call 112, local transport ticket/fare,
signing up for an integration course, booking a doctor's appointment by phone,
collecting a parcel, police lost-property office, dentist, language café.

Each ships A0–B2, Arabic title, a `<Rolle> katze` persona, a kebab-case icon, a
category from `scenarioVocab.ts`, and a real `sequence_order`. New rows and new
Arabic glosses are marked `needs_review` in the catalogue; no fee, deadline,
document list or medical/legal fact is invented.

## 6. Single authoring source

Before this run the same content was reachable four ways: the nine
`docs/content/curriculum-*.json` drafts, the D1 export, the language-data
snapshot and the generated gloss modules. They could drift independently.

Now: **`docs/content/catalogue/scenarios-catalogue.json` is the authoring source.** The
language snapshot (`scripts/language-data/content-snapshot.json`), the positional
Arabic corpus (`opener-translations.json`) and the gloss corpus
(`word-glosses.json`) are regenerated from it by
`node scripts/apply-content-catalogue.mjs`, and the shipped modules by
`node scripts/build-language-data.mjs --offline`. The curriculum drafts stay as
historical module proposals; the catalogue is what the next content load reads.

## 7. Limits of this audit

- Turkish/Arabic-first review of the Arabic is a native-speaker task; the
  catalogue marks new Arabic `needs_review` and `docs/OWNER-LANGUAGE-REVIEW.md`
  lists every pair.
- The banner column stays `null`: no per-scenario artwork exists, and
  `sceneFor()` already provides a real local scene image.
- Nothing here proves the live app renders the new rows; that needs the
  authorized D1 load followed by a live check.

## 8. Result after the pass (measured)

| Check | Before | After |
| --- | --- | --- |
| Scenario rows in the catalogue | 49 | **61** |
| `initial_message_a0` missing | 20 | **0** |
| Openers breaking a cap or the level spec | 165 | **0 of 305** |
| `ai_persona` not ending in `katze` | 5 | **0** |
| Emoji icons | 5 | **0** |
| `sequence_order` = 0 | 49 | **0** (now 1..61) |
| Distinct openers / translations | 223 | **301 / 301** |
| Opener tokens with a gloss | — | **457 / 457** |
| Authored glosses awaiting native review | — | **159** |

Two defects surfaced during the pass and were fixed rather than accepted:

- **Perspective.** 29 A0 openers were written as the learner's line even though
  the opener is the partner's first message (`Hallo! Wo ist mein Gleis?` from a
  `Bahnmitarbeiter`). They were rewritten in the persona's voice; the learner's
  own line is never the opener.
- **Tense.** Eight A0/A1 openers used Präteritum/Perfekt markers the level spec
  forbids (`Wie war dein Tag?`, `Wo haben Sie gearbeitet?`). Rephrased to
  Präsens instead of accepting the worker's silent fallback.

The gate that keeps this true is `tests/contentCatalogue.test.ts` (21 tests):
shape, personas, icons, categories, caps per sentence and in total, exactly one
question as the last sentence, Arabic sentence parity, Latin isolation, the
English blocklist, the twelve `needs_review` rows, gloss integrity, bundled ↔
worker parity, and the shipped-snapshot parity. `tests/turnGuard.test.ts` runs a
bare greeting against all 61 × 5 openers and asserts the scene's own question
comes back inside its level.

## 9. Load boundary (why nothing is live)

`docs/agent/CONTENT-LOAD.md` permits `load-curriculum.mjs --commit` only for files named in an owner
`CONTENT-LOAD-AUTHORIZED:` line, and that loader is insert-only. The 12 new ids can be inserted; the 49
existing ids need `UPDATE`s, which §3 forbids. So the corrected 49 have no write path today. The two honest
options are in `docs/agent/OWNER-CHECKLIST.md` §12: insert the 12 new rows only, or authorize an
update-capable path that is written and tested first. The catalogue itself is not a loader input — it is the
source the snapshot, corpus and gloss files are derived from. Use `--offline`
for every local build: without it the generator fetches the live 49 rows, overwrites
`content-snapshot.json` before validating, and then reports corpus gaps that describe
production rather than the catalogue.


