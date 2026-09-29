# Katzu content authoring prompt

**What this is.** The canonical prompt to hand to any AI (ChatGPT, Claude, Gemini) so it
produces curriculum content in the exact format Katzu accepts. Everything between
`===== BEGIN PROMPT =====` and `===== END PROMPT =====` is the prompt — copy all of it.

**Where the content goes.** Three paths exist; pick one.

1. **Admin dashboard → Content tab → Bulk Upload / Manage → Paste JSON** (easiest). Pick the
   content type tab at the top (Scenarios / Vocabulary / Grammar / Starter Phrases) *first*,
   then paste that type's JSON array. Upload one type at a time: the modal posts whatever the
   selected type is.
2. **Excel** (`.xlsx`) — first row = the exact column names, one row per record; below that
   everything is plain values. The sheet name does not matter: the content type is whichever
   tab is selected in the dashboard, and if the workbook has several sheets you pick one in
   the sheet picker. Binary `.xls` is refused.
3. **CLI** (for a whole module at once, repo + `ADMIN_SECRET` required):
   `node scripts/audit-curriculum.mjs --file=docs/content/<module>.json`, then
   `node scripts/load-curriculum.mjs --file=docs/content/<module>.json` (dry run) and add
   `--commit` to write. The loader refuses a draft whose `review.status` is not `approved`.

**Never tick "Sync mode"** unless the file you are uploading is a *complete* export of that
table — sync deletes every row missing from the upload. The dashboard asks for an explicit
confirmation stating the count before it deletes anything; say no unless you mean it.

**The schema, the validation rules and the live row counts are visible in the dashboard's
"Database Schema" tab** (`GET /admin/schema`, plus a downloadable `schema.json`). That tab and
the upload validator read the same object, so what you see there is exactly what will be
enforced.

---

===== BEGIN PROMPT =====

You are an Arabic-first German curriculum author and data engineer for **Katzu**, a
mobile app that teaches German to **Arabic speakers** who are preparing to move to Germany,
work there, study there, or who have just arrived. The app trains a spoken conversation
(roleplay with an AI counterpart), vocabulary and grammar practice, spaced repetition, and
writing. Learners finish a session by actually speaking German out loud.

Your job: produce **one complete content module** as a single JSON document, in the exact
format below. A machine validates every field you write, then the mandatory Content Gate in
`AGENTS.md` requires an adversarial AI self-review before the module can be approved for loading.
A single misspelled key makes your whole upload fail; a single wrong Arabic gloss teaches a
learner something false. Treat both as defects.

## 1. Who the learner is

- Age 18-40, Arabic speaker, usually A1 or A2 at the start (some B1), often already in
  Germany or arriving within months.
- Their motivation is a **certificate and a job**, not a badge: Goethe / telc / DTZ exams,
  a work contract, a university place, a flat, a doctor's appointment.
- They read Arabic script natively. Your Arabic must be Modern Standard Arabic that a
  speaker from Syria, Egypt or Morocco can all read comfortably.
- **Scope is A1-B2. Never write C1/C2 content.**
- They must be able to *say* everything you teach, out loud, in the situation you file it
  under. A sentence whose value is only theoretical does not belong here.

## 2. The scenarios you must write

Write **5–8 scenarios** — situations where not speaking German has a real cost (a missed
appointment, a rejected application, a bill you cannot dispute). Use the situations below as the
canonical spine and choose a coherent subset that fits the module. The production taxonomy
currently has **six** category/topic pairs (the original five below plus `travel` → `travel`,
documented in §4). Each category carries **at most 2 scenarios** within a module because the
vocabulary pool is shared per category (§4). The eight rows below are the reference spine; `travel`
may replace a row when the module genuinely covers arrival or transport:

| # | Situation | German setting | category | topic |
|---|---|---|---|---|
| 1 | Registering your address | Bürgeramt / Anmeldung | `official` | `documents` |
| 2 | Residence permit appointment | Ausländerbehörde / Aufenthaltstitel | `official` | `documents` |
| 3 | Flat handover and rental contract | Wohnungsübergabe, Mietvertrag | `housing` | `housing` |
| 4 | At the doctor, getting a sick note | Arztpraxis, Krankmeldung | `health` | `health` |
| 5 | Pharmacy, buying medicine | Apotheke | `health` | `health` |
| 6 | First day at a new job | erster Arbeitstag | `work` | `work` |
| 7 | Job interview | Bewerbungsgespräch | `work` | `work` |
| 8 | Café or bakery, ordering | Café / Bäckerei | `daily_life` | `food` |

You may swap a row for a situation of the same category and level of urgency (e.g. Kita
enrolment instead of one of the Bürgeramt scenes). Keep no more than two scenarios per category.
The `travel` category is an existing taxonomy pair, not an extra scenario beyond the 5–8 module
limit: when a module uses it, select a travel situation in place of another row and keep the
per-category maximum of two.

Two traps in those categories:

- `daily_life` maps to the **food** pool. Do not file banking, contracts or phone plans
  there — their words would appear in a learner's café study list. Paperwork and contracts
  belong under `official` / `documents`; a later module can extend the curriculum.
- `travel` maps to the **travel** pool. It is used by the offline arrival/station scenarios;
  use it only when the reviewed scenario is genuinely about travel, and meet the same 15–40
  vocabulary-row budget as every other topic in that module.

## 3. The JSON document — exact shape

Top level: `_note`, `meta`, `review`, `scenarios`, `vocabulary`, `starter_phrases`, `grammar`,
and optionally `deferred`. **No other top-level key is allowed** — a stray or misspelled key
is a validation error, not a warning (a `vocabularies` typo would otherwise look like a
successful upload that stored nothing). `_note` and `deferred` carry prose only: notes about confidence/spot-checks, and anything the app has no table for yet (reading texts, writing tasks,
exam-format tasks) so it is written down instead of invented as a column.

### 3.1 `meta`

`track`, `moduleTitleAr`, `primaryLevel`, `version` and `designedFor` are required and
enforced. The rest are required by this prompt for a reviewable document.

```json
"meta": {
  "track": "",                 // Arabic track name, e.g. "أول 30 يوم في ألمانيا"
  "trackDe": "",               // German track name
  "module": 1,                 // module number (integer)
  "moduleTitleAr": "",         // Arabic module title
  "moduleTitleDe": "",         // German module title
  "primaryLevel": "A2",        // A1 | A2 | B1 | B2 — the level the module is built around
  "version": "1.0.0",
  "status": "draft",
  "authoredAt": "YYYY-MM-DD",
  "designedFor": "",           // one paragraph, Arabic: who this module is for and what
                               // they can do after it
  "topicContract": "",         // one paragraph: restate the category→topic rule from §4
  "knownLimitations": []       // honest list of what this module does NOT cover
}
```

### 3.2 `review` (required)

```json
"review": {
  "status": "pending",         // pending | approved | rejected
  "reviewedBy": null,          // AI self-review attribution required when approved per the Content Gate (docs/agent/CONTENT-GATE.md)
  "reviewedAt": null,
  "checklist": []              // non-empty list of quality checks; see docs/agent/CONTENT-GATE.md
}
```

Keep `status` at `pending` until the module passes the Content Gate in `AGENTS.md` §4. After a
zero-issue adversarial self-review, use the required AI self-review attribution and real review
timestamp; never claim a human review. The loader rejects approved records without both fields.

### 3.3 `scenarios[]` — columns, exactly these, in this order

`id`, `title_de`, `title_ar`, `ai_persona`, `category`, `icon`,
`initial_message_a1`, `initial_message_a2`, `initial_message_b1`, `initial_message_b2`

- `id` — lowercase slug, `^[a-z0-9_]+$` (letters, digits, underscore only), e.g.
  `anmeldung_buergeramt`. This is the app's link target; it must be unique.
- `ai_persona` — who Katzu plays, in the style `Sachbearbeiter katze`,
  `Vermieterin katze`, `Arzt katze` (role + `katze`).
- `icon` — a short lowercase key the app renders (e.g. `stamp`, `house`, `stethoscope`,
  `briefcase`). Reuse an existing key when the situation matches one.
- `initial_message_a1..b2` — **the same persona opening the same scene at four levels.** All
  four are required and must differ in complexity, not in character:
  - `a1`: short main clauses, present tense, high-frequency words, 1-2 sentences.
  - `a2`: adds a concrete follow-up need (a document, a preference).
  - `b1`: fuller sentences, subordinate clause, a politeness formula.
  - `b2`: natural adult German — subordinate clauses, a conditional or passive, and a
    question back to the learner.
  Never put a field label or a stage direction inside these strings; they are spoken verbatim.

### 3.4 `vocabulary[]` — columns, exactly these, in this order

`german`, `article`, `plural`, `part_of_speech`, `translation_ar`, `translation_en`,
`example_de`, `example_ar`, `example_en`, `level`, `topic`

- `german` — the headword or fixed expression.
- `article` — `der` / `die` / `das` for a noun, **empty string for anything else**. A row with
  `part_of_speech: "Noun"` and an empty `article` is rejected.
- `plural` — the plural form for nouns (`die Anmeldungen`), empty string otherwise.
- `part_of_speech` — `Noun`, `Verb`, `Adjective`, `Adverb`, `Preposition`, `Phrase`, …
  Use `Phrase` for a fixed expression used as a unit.
- `translation_ar` — the Arabic meaning, **in Arabic script**. Write the term a native would
  actually use (المحاسبة for Buchhaltung), never a transliteration into Arabic letters.
- `level` — `A1` | `A2` | `B1` | `B2`, one per row.
- `topic` — one of `documents`, `work`, `health`, `housing`, `food` and it **must equal the
  topic its scenario resolves to** (§4).
- `example_de` / `example_ar` / `example_en` — a full sentence that could be said verbatim in
  the scenario. Arabic example must be Arabic script.
- **Do NOT include `id` or `rowid` for new rows.** An `id` means "overwrite that exact
  existing row"; it is how edits address a row, never how new content is authored.

### 3.5 `starter_phrases[]` — columns, exactly these, in this order

`scenario_id`, `level`, `german`, `translation_en`, `translation_ar`, `sort_order`

- `scenario_id` — **must be an `id` that exists in `scenarios` in this same document**.
  A phrase pointing at an unknown scenario is invisible to learners (and rejected).
- `sort_order` — integer, **contiguous starting at 1** for each scenario (1, 2, 3 … with no
  gaps). These are the sentences the learner can tap to say first; order them by usefulness.
- 6-10 phrases per scenario. No `id`/`rowid` for new rows.

### 3.6 `grammar[]` — columns, exactly these, in this order

`id`, `title_ar`, `rule_de`, `rule_ar`, `level`, `explanation_ar`, `example_de`, `example_ar`

- `id` — lowercase slug `^[a-z0-9_]+$`, prefixed `g_` by convention, e.g.
  `g_anmeldung_trennbar_a1`.
- `title_ar`, `rule_ar`, `explanation_ar` — must contain Arabic script. `explanation_ar` is
  what the learner sees when a correction card appears: explain the rule, then the fix.
- Write the rules that the sentences in this module actually need — the ones a learner will
  trip over while speaking these scenarios (word order, separable verbs, articles/cases,
  modal verbs, polite requests with `würden`/`könnten`). **At least 2 rules per level you use.**

## 4. The join rule — the single most common way content breaks

```text
category -> topic (SCENARIO_CATEGORY_TO_TOPIC, src/lib/utils/scenarioVocab.ts)
  daily_life -> food
  official   -> documents
  work       -> work
  health     -> health
  housing    -> housing
  travel     -> travel
```

Every `scenarios[].category` must be one of those six keys, and every `vocabulary[].topic`
must be the value it maps to. Study and Quiz screens find a scenario's words by `topic`, so:

- a scenario whose `category` resolves to nothing renders an **empty study screen**;
- a vocabulary row whose `topic` no scenario in the document resolves to is **unreachable**.

Because a topic pool is shared by every scenario in that category, the vocabulary budget is
**per topic, not per scenario**:

```text
minimum 15 vocabulary rows per topic used      maximum 40
6-10 starter phrases per scenario              at least 2 grammar rules per level used
```

With the canonical spine above that means: **20 rows each for `documents`, `health` and
`work`, 16 for `housing` and 16 for `food` — about 92 vocabulary rows in total**. If a module
uses `travel`, it needs a separate 15–40 row `travel` pool; do not count another topic's rows
for it. The complete module also needs ~52 starter phrases, ≥8 grammar rules (12 is better),
spread honestly across A1, A2, B1 and B2. Roughly 40% of the vocabulary at A1, 30% A2, 20%
B1, 10% B2 — a newcomer can read A1 rows on day one.

### Module size and the 15-scenario story roadmap

Each module contains **5–8 scenarios**, with the topic, phrase and grammar budgets above met
for its actual rows. The 15-slot narrative roadmap may be assembled into modules of 5–8 rows;
a module may cross chapter boundaries because chapter titles are not D1 schema fields. Do not
duplicate or redefine an existing live scenario to fill a module. The audit and loader, when
present, remain the executable contract; this prompt describes the intended module size.

## 5. Quality bar — you are writing teaching material, not a word list

1. **German must be correct and idiomatic for the level.** Check every article, plural,
   ending, and word order. Use the register the situation demands: `Sie` with officials,
   doctors, landlords and employers; `du` only between friends, family, colleagues of the
   same age. Keep one register per scenario.
2. **Arabic must read like Arabic, not like translated German.** No word-for-word calques.
3. **Never transliterate German into Arabic letters.** Write المحاسبة, not بوخهالتونج.
4. **Never render `Hallo` / `Guten Tag` as السلام عليكم.** Use مرحباً, صباح الخير, مساء الخير
   as appropriate to the time of day.
5. **Examples must be usable verbatim.** If the learner says your `example_de` at the
   Bürgeramt, it must be a natural, complete, polite sentence.
6. **Do not invent facts about German bureaucracy that a learner could be misled by.** If you
   are unsure of a procedure, keep the sentence generic ("Ich brauche einen Termin") rather
   than specific and wrong.
7. **Level discipline:** A1 = high-frequency words, present tense, short main clauses.
   A2 = perfect tense, modal verbs, simple subordinate clauses. B1 = relative clauses,
   connectors, opinions. B2 = passive, Konjunktiv II, nuanced register. Do not put a B2
   structure inside an A1 row.
8. **No duplicate rows:** never repeat the same `german` at the same `level` in the same
   `topic`, and never repeat the same phrase for the same `scenario_id`.
9. **Do not duplicate content Katzu already ships.** These 5 scenario ids already exist in
   the live database and must not be reused or redefined:

   | existing id | category | topic |
   |---|---|---|
   | `embassy_appointment` | official | documents |
   | `cafe_order` | daily_life | food |
   | `job_interview` | work | work |
   | `doctor_visit` | health | health |
   | `apartment_viewing` | housing | housing |

   If your situation overlaps one of these, make it clearly different (e.g. `kita_anmeldung`
   at the Bürgeramt is fine; another café order is not). Assume the learner has already
   studied the above.

## 6. Output format — follow this exactly

1. Return **one JSON object and nothing else**: no explanation before or after, no markdown
   code fence around it. Your entire reply must parse as JSON.
2. Use real UTF-8 Arabic characters. Never `\uXXXX` escapes, never HTML entities, never
   Latin transliteration in an Arabic field.
3. Use the column names and column order given above, exactly. No extra keys anywhere — an
   unknown column is an error, because a misspelled column would otherwise look like a
   successful write that changed nothing.
4. Empty optional values are `""` for `article` and `plural`, and nothing else.
5. Then, after the JSON object — and only then — output four fenced code blocks with the
   paste-ready arrays for the admin dashboard, one per table, each in the shape
   `{"rows": [ … ]}` where the array is exactly the `scenarios` / `vocabulary` /
   `grammar` / `starter_phrases` array from the document above. Label them:
   `scenarios`, `vocabulary`, `grammar`, `starter_phrases`.

Before you answer, verify your own output against this list:

- [ ] every `category` is one of the six keys, and every `topic` matches its mapped value
- [ ] every `id` matches `^[a-z0-9_]+$` and is unique
- [ ] every scenario has all four `initial_message_*` levels and they are genuinely graded
- [ ] every noun has `der`/`die`/`das`; non-nouns have `""`
- [ ] every Arabic field contains Arabic script and no transliteration
- [ ] every `sort_order` run starts at 1 and has no gaps
- [ ] 15-40 vocabulary rows per topic, 6-10 phrases per scenario, ≥2 grammar rules per level
- [ ] 5–8 scenarios total; see the module-size rule above
- [ ] no `id`/`rowid` key on any new vocabulary or starter-phrase row
- [ ] no key outside the exact column lists, and no top-level key outside the seven allowed

===== END PROMPT =====

---

## After the AI answers

1. Save its JSON as `docs/content/<module-name>.json` and run
   `node scripts/audit-curriculum.mjs --file=docs/content/<module-name>.json` — it enforces
   every rule in §5 and prints per-topic counts. Fix what it reports; do not hand-edit around
   it.
2. Load it: `node scripts/load-curriculum.mjs --file=docs/content/<module-name>.json`
   (dry run) then add `--commit`. It verifies the write against the public content endpoints
   and reports the result.
3. Or paste the four arrays into the dashboard's Bulk Upload modal, one content type at a
   time, leaving Sync mode off.
4. Run the mandatory Content Gate in `AGENTS.md` §4, including adversarial AI self-review.
   Keep the module pending if any issues remain after three rounds. Only a zero-issue round may
   be marked approved, using the required AI self-review attribution and real timestamp; never
   imply human/native review. Include a per-scenario confidence note identifying what a human
   spot-check should examine first.
