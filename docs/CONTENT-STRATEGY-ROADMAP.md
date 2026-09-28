# Katzu — Content Strategy & Scenario Roadmap

**Status: strategy and sequencing reference. Authoring policy and module review status are governed by `AGENTS.md` §4; the authoring prompt remains the field-level schema reference.**

This is the narrative and sequencing layer above [`CONTENT-AUTHORING-PROMPT.md`](./CONTENT-AUTHORING-PROMPT.md). The authoring prompt describes the field-level schema; this roadmap describes what the curriculum should tell and in what order. Follow `AGENTS.md` §4 for the 5–8 scenario module size and the mandatory audit, adversarial AI self-review, review attribution and dry-run gates. Do not write to production D1; only the owner runs the loader's explicit `--commit` path.

---

## 1. Learning-design references: what to borrow

### From Nico’s Weg (DW)

The useful structural lesson is a linear story in which a single early problem creates practical reasons to learn the next set of language. A small recurring cast makes scenes feel connected; short episodes let learners keep moving without turning each visit into a long class.

**Borrow:** an inciting incident with modest, understandable stakes; a small recurring cast; a clear episode order; short episodes. Katzu’s existing Guided Practice plus live conversation is already the appropriate episode length and should not be expanded simply to imitate another course.

**Do not borrow:** passive watch-and-comprehend episodes. Speaking is Katzu’s differentiator. Every scenario in this roadmap must retain a production attempt and a live-conversation turn; a scenario without speaking is not ready to ship.

### From Babbel

The useful unit is one real situation, with grammar explained in the dialogue’s context, production from the beginning, and spaced review layered over the learning rather than split into an unrelated grammar silo.

**Borrow:** grammar in context; hear/produce practice; the existing SRS/review engine; one practical situation per episode.

**Avoid:** isolated vocabulary. Every new vocabulary item in a future module must have a natural home in at least one starter phrase and be usable in the scenario’s own conversation before the learner is quizzed on it cold. A word introduced only in a multiple-choice question fails this rule.

### From Goethe-Institut / DTZ integration-course themes

The practical spine includes personal details, housing, daily life, food, health, transport, official appointments, work and social life. Katzu’s original five production categories (`official`, `health`, `work`, `housing`, `daily_life`) cover most of this roadmap. The app also currently maps `travel` → `travel`; use that existing pair for the airport and train-station scenarios.

---

## 2. Narrative bible

### Premise

The learner is a person who has just moved—or is preparing to move—to Germany. Katzu is the companion who is already there and can help them find their footing. Each episode should be something that could realistically happen to the learner, not a lesson topic dressed up as a scene.

### Inciting incident

The story begins at a German airport. A small problem at passport control or baggage is enough to give the learner a reason to speak German in their first few minutes: the stakes should be understandable and modest, not frightening or catastrophic. The planned opening ID is `airport_arrival`.

This incident is a **content direction**, not approved wording. Every authored row must pass the Content Gate in `AGENTS.md` §4 before it is eligible for loading; the report must identify what a human should spot-check first.

### Recurring cast without a schema extension

The current scenario schema has no NPC-memory field. Until a separately approved extension exists, continuity can be written without changing the schema:

1. Reuse the **exact same `ai_persona` string** in scenarios intended to share a character. For example, the landlord from the flat viewing should be the landlord in a later deposit/repair call. Confirm existing persona strings against the content source before reusing them.
2. Use `situationAr` and `katzuAr` to refer naturally to the learner’s own previous experience, where the screen supports those fields. This is a copywriting instruction, not a new schema field.

The optional future `recurring_character_id` extension is out of scope for this roadmap. Do not build it as part of content authoring.

### Existing chapter structure

The app currently defines `CHAPTER_SIZE = 3` and five Arabic chapter titles in `src/lib/journey/context.ts`. This roadmap proposes fifteen scenario slots to fit that shape. The chapter mapping below is a curriculum proposal; it does **not** by itself guarantee strict linear unlocking or chapter-specific ordering in the app. Treat any required runtime sequencing as a separate product/code change.

| Chapter | Existing app title | Narrative beat |
|---|---|---|
| 1 | الخطوات الأولى في ألمانيا | Arrival, registration and the first roof over your head |
| 2 | الحياة اليومية والمواصلات | Settling into daily life and getting around |
| 3 | العمل والمكتب | Starting and growing a career |
| 4 | الجامعة والجهات الرسمية | Longer-term academic and legal footing |
| 5 | الاستقلال باللغة | B1/B2 independence: opinions, conflict and nuance |

Chapter position is narrative ordering only. It does not change a scenario’s category or vocabulary topic.

---

## 3. Proposed 15-scenario roadmap

The roadmap below is a planning list, **not content ready for upload**. Existing live D1 rows must be fetched and treated as authoritative; do not redefine an existing ID merely to make a chapter file self-contained.

The five IDs `embassy_appointment`, `cafe_order`, `job_interview`, `doctor_visit` and `apartment_viewing` are identified in the existing authoring materials as already present in D1 and must not be redefined. Confirm that against an authorized content export before preparing a module. `bakery_shopping` and `train_station` currently exist only as incomplete local Dexie fallback fixtures; any replacement must preserve those IDs and pass the Content Gate in `AGENTS.md` §4 before it is eligible for loading.

| Ch. | Slot | ID | Situation | Category → topic | Status | Persona continuity |
|---|---:|---|---|---|---|---|
| 1 | 1 | `airport_arrival` | Passport control and a delayed/missing bag at a German airport | `travel` → `travel` | New; proposed opening | Border officer for this scene; Katzu meets the learner here |
| 1 | 2 | `embassy_appointment` | Anmeldung / residence registration | `official` → `documents` | Existing; reuse, do not redefine | Sachbearbeiter |
| 1 | 3 | `apartment_viewing` | Viewing a flat and asking the landlord practical questions | `housing` → `housing` | Existing; reuse, do not redefine | Vermieterin/Vermieter; recurring thread with Ch. 2 slot 6 |
| 2 | 4 | `cafe_order` | Ordering at a café | `daily_life` → `food` | Existing; reuse, do not redefine | Barista |
| 2 | 5 | `bakery_shopping` | Buying bread and asking whether it is fresh | `daily_life` → `food` | Local fallback only; incomplete — replace via AGENTS.md §4 content gate | Bäcker(in) |
| 2 | 6 | `landlord_followup` | Calling the landlord about a deposit or repair | `housing` → `housing` | New | Same exact landlord persona string as Ch. 1 slot 3 |
| 3 | 7 | `job_interview` | Bewerbungsgespräch | `work` → `work` | Existing; reuse, do not redefine | HR / Personalchef(in) |
| 3 | 8 | `erster_arbeitstag` | First day: meeting the team and finding one’s place | `work` → `work` | New | Colleague; recurring thread with Ch. 3 slot 9 |
| 3 | 9 | `office_smalltalk` | Break-room small talk and accepting/declining a lunch invitation | `work` → `work` | New | Same exact colleague persona string as Ch. 3 slot 8 |
| 4 | 10 | `residence_permit` | Ausländerbehörde: residence-title appointment | `official` → `documents` | New | Beamter/Beamtin |
| 4 | 11 | `doctor_visit` | Arztpraxis and asking for a sick note | `health` → `health` | Existing; reuse, do not redefine | Arzt/Ärztin |
| 4 | 12 | `pharmacy_visit` | Apotheke: buying medicine and describing symptoms | `health` → `health` | New | Apotheker(in) |
| 5 | 13 | `train_station` | Buying a ticket and asking about a delay or platform | `travel` → `travel` | Local fallback only; incomplete — replace via AGENTS.md §4 content gate | Bahn employee |
| 5 | 14 | `neighbor_dispute` | A polite noise/conflict conversation with a neighbor | `housing` → `housing` | New | Nachbar(in) |
| 5 | 15 | `friend_catchup` | Informal `du` conversation about plans, the weekend and opinions | `daily_life` → `food` | New | Freund(in) |

### Category/topic handling

Use the existing six-category map, verified in `src/lib/utils/scenarioVocab.ts`:

```text
category -> topic
  daily_life -> food
  official   -> documents
  work       -> work
  health     -> health
  housing    -> housing
  travel     -> travel
```

The airport and station use `travel` → `travel`; `friend_catchup` remains `daily_life` → `food` under the current contract. `travel` is an existing additive code mapping, not a new category proposal. Any module using `travel` needs its own 15–40 row travel vocabulary pool per the authoring prompt; do not count food or documents rows toward that budget. This does not change the content review requirement for the local fixtures.

### Deliberately deferred

University enrollment, Kita/childcare and banking are not part of these fifteen slots. Keep them for a later module. If a curriculum draft records these gaps, state them under its existing `meta.knownLimitations` convention; do not invent schema fields.

---

## 4. Additional authoring rules for this story

These story rules supplement the canonical authoring prompt and do not override the Content Gate in `AGENTS.md` §4.

1. **Story-aware openings:** for a new scenario, each `initial_message_a1..b2` should connect to the inciting incident or prior episode when appropriate. `airport_arrival` is the one opening allowed to introduce the premise cold; later openers may assume the learner knows Katzu.
2. **Grammar in context:** each new scenario needs at least one grammar point tied to structures learners actually need to say in that scene. Reuse an existing grammar ID when revisiting the same rule; do not create near-duplicate rules. The canonical prompt currently asks for at least two grammar rules per level used in a module, so a “one per scenario” rule does not replace that module-level minimum.
3. **No isolated vocabulary:** every new vocabulary row must appear in a starter phrase and be usable in the scenario’s conversation before cold quiz exposure.
4. **Exact persona continuity:** when a persona recurs, use the same `ai_persona` string verbatim. Confirm the existing row’s spelling before authoring a continuation.
5. **Register continuity:** use `Sie` with landlords and officials throughout their story threads. Do not switch a returning character to `du` without a clear in-story reason. Use `du` in the friend scenario where appropriate and keep that register consistent.
6. **B1/B2 nuance:** Chapter 5 should include opinions, softened disagreement, reasons and natural adult phrasing—not merely longer sentences or a more difficult grammar label. This applies especially to `neighbor_dispute` and `friend_catchup`.
7. **Keep spoken production:** every episode must include the existing production/live-speaking path. No scenario ships as a comprehension-only lesson.
8. **Human spot-checks remain useful:** the module report must name, per scenario, the first German idiom/level, Arabic naturalness, bureaucratic factual claim, persona/register or vocabulary-link issue a human should verify. Approval status follows the AI self-review gate in `AGENTS.md` §4; never claim human review.

---

## 5. Module contract and packaging decision

The canonical authoring prompt describes the field-level schema. Under `AGENTS.md` §4, each module contains **5–8 scenarios** and meets the topic, vocabulary, phrase and grammar budgets for its selected rows. The fifteen rows here are five narrative chapters, not necessarily five loadable JSON files. Group them into modules of 5–8, crossing chapter boundaries when appropriate; chapter titles are not schema fields. Do not duplicate or redefine an existing live D1 scenario, or invent filler to reach a count. The audit and loader determine executable validity where those scripts are available.

Existing live D1 scenarios must be referenced/reused without being redefined. The current loader operates on complete module JSON and upserts scenario/grammar rows by ID, while vocabulary and starter phrases have their own deduplication behavior. Do not copy existing IDs into an uploadable module in a way that could overwrite live content or duplicate rows. Confirm D1 rows/persona strings from the Content Studio before authoring integrations.

**Current guardrails:**

- The 5–8 scenario module size and review process are governed by `AGENTS.md` §4.
- The fifteen story slots are not yet packaged into uploadable modules.
- Do not duplicate/redefine the five identified live D1 IDs.
- `bakery_shopping` and `train_station` have incomplete local fallback rows; any replacement must preserve their IDs and pass the content gate.
- Use the existing six-category topic map; schema/category changes are not part of this strategy document.

---

## 6. Future authoring and release sequence

When assembling reviewable modules from this roadmap:

1. Treat the five claimed live D1 IDs as protected; confirm any needed details from an authorized content export. Never redefine those IDs.
2. Package the fifteen roadmap slots into modules of 5–8 scenarios, crossing chapter boundaries as useful. Do not infer that chapter files are loadable just because the folder supports JSON files.
3. Author and gate one reviewable module at a time. Supply this strategy together with the canonical prompt; the prompt remains the schema reference.
4. Apply `AGENTS.md` §4: run `node scripts/audit-curriculum.mjs --file=docs/content/<file>.json`, correct every error, complete up to three adversarial self-review rounds, then run `node scripts/load-curriculum.mjs --file=docs/content/<file>.json` as a dry run.
5. Set `review.status: "approved"` only after a zero-issue self-review round, with the required AI self-review attribution and real timestamp. Otherwise keep it `pending` and list the remaining issues. Only the owner may choose the loader’s explicit `--commit` path.
6. After a gated Chapter 1 row is available to the app, run the existing hero check: a new learner completes sign-in/onboarding and sees `airport_arrival` as Day 1, with the local or authorized content row supplying it. Verify the scene offers speaking, not only study.

This strategy document does not itself author, approve, load, or deploy curriculum.
