# Curriculum draft — «أول 30 يوم في ألمانيا» · Module 1: الوصول والتسجيل

**Status: unreviewed draft. Not shipped, not loaded, not visible to any learner.**

This document is the human review surface for
`docs/content/curriculum-30day-module1.json`. Read it before the JSON — the JSON
is the machine-loadable half, this is the half a person decides on.

---

## 1. Why this exists

Measured live on 2026-09-25 (`node scripts/audit-quiz-content.mjs`):

```
scenarioCount: 5
vocabCount:   114
```

Five scenarios and 114 words is a demo. A learner finishes it in a week and has
nothing to come back to, which means retention and payment both die before they
are tested. Phase 5 of `docs/LEARNING-ROADMAP.md` calls for a track wide enough
to justify weeks of study, and recommends proving the pipeline on **module 1
only** before scaling to 30 scenarios. This is that module.

## 2. What module 1 contains

The five registration acts that block everything else for a newcomer. Each one
is a place a learner will physically stand.

| # | Scenario | Level | Title (DE) | Category → topic |
| --- | --- | --- | --- | --- |
| 1 | `anmeldung_buergeramt` | A1 | Die Anmeldung beim Bürgeramt | `official` → `documents` |
| 2 | `termin_online_buchen` | A2 | Einen Termin buchen | `official` → `documents` |
| 3 | `krankenkasse_anmelden` | A2 | Bei der Krankenkasse anmelden | `health` → `health` |
| 4 | `mietvertrag_uebergabe` | B1 | Mietvertrag und Wohnungsübergabe | `housing` → `housing` |
| 5 | `erster_arbeitstag` | B1 | Der erste Arbeitstag | `work` → `work` |

| Content | Count | Per-scenario standard |
| --- | --- | --- |
| Scenarios | 5 | 4 openers each (A1→B2) |
| Vocabulary | 74 | pool of 15+ words per topic (`documents` 26, `health` 16, `housing` 16, `work` 16) |
| Starter phrases | 30 | 6 per scenario |
| Grammar points | 10 | 2+ per level taught (A1, A2, B1) |

### The topic join is not optional

`StudyScreen` and `QuizScreen` find a scenario's words through
`scenarioToVocabTopic(scenario)` in `src/lib/utils/scenarioVocab.ts`. If a
scenario's `category` is not in that map and its `id` matches none of the
fallback patterns, the resolved topic is `''` and the vocabulary list renders
**empty** — silently, with no error. Every `category` in this module is a mapped
one, and every vocabulary row's `topic` is the exact value the map returns.
`scripts/audit-curriculum.mjs` fails the build if that ever stops being true.

## 3. The four-skill standard

Phase 5 requires every scenario to feed all four skills. Speaking and listening
already work off the content above (the conversation engine uses the scenario,
and the dictation drill is built from its starter phrases).

Reading, writing and exam-style tasks are authored in the `deferred` block of the
JSON — five reading texts with Arabic translation and comprehension questions,
five writing tasks with rubrics, five exam-format tasks:

| Skill | Content | Blocker |
| --- | --- | --- |
| Reading | 5 texts + 10 comprehension questions | needs a `reading_texts` table |
| Writing | 5 tasks + rubrics + required constructions | needs `writing_tasks` + `POST /ai/check-writing` |
| Exam | 5 tasks in Goethe / telc / DTZ format | needs `exam_tasks` |

`deferred` is deliberately not loadable: no script in this repo reads it, and the
audit fails if a loadable table name appears inside it. This content is authored
and waiting, not half-shipped.

## 4. Review checklist

Directors of this decision: the German must be correct at the stated level and
the Arabic must read like Arabic, not like a translated German sentence. Both are
cheap to check on real sentences and expensive to fix after 30 scenarios exist.

- [ ] German is correct and idiomatic for the level — articles, plurals, word
      order, register.
- [ ] Arabic reads naturally and is not a literal rendering of the German.
- [ ] Every example sentence is usable verbatim in the situation it is filed
      under.
- [ ] `du`/`Sie` is deliberate and consistent — these scenarios use `Sie` with
      officials.
- [ ] No scenario teaches a word the learner cannot use at that level.

Then, and only then, edit the JSON:

```json
"review": {
  "status": "approved",
  "reviewedBy": "<your name>",
  "reviewedAt": "2026-10-01"
}
```

The loader refuses to write anything while `status` is `pending`, and the audit
refuses an `approved` block that names no reviewer.

## 5. Loading it into D1

### Why not `wrangler d1 execute`

The project's Cloudflare API token has no `D1:Edit` scope:

```
$ npx wrangler d1 execute katzu-content --remote --command "SELECT COUNT(*) FROM vocabulary"
✘ [ERROR] A request to the Cloudflare API (...) failed.
  The given account is not valid or is not authorized to access this service [code: 7403]
```

The deployed Worker already owns a D1 binding and exposes an admin-authenticated
bulk upsert at `POST /admin/upload`, so this is the load path. `ADMIN_SECRET` must
be present in the environment; `scripts/load-curriculum.mjs` never prints it.

```bash
# 1. Always dry-run first — validates, audits, reports, writes nothing.
node scripts/load-curriculum.mjs

# 2. Write, after review.status is approved.
node scripts/load-curriculum.mjs --commit
```

The loader is idempotent. `vocabulary` and `starter_phrases` have no unique key
in D1, so a plain re-upload duplicates rows and hands the quiz two identical
options; existing rows are skipped by `(level, german, topic)` and
`(scenario_id, german)`. `scenarios` and `grammar` are keyed by `id` and upserted
by the Worker, so they are safe to re-run.

After writing, it verifies against the **public** endpoints the app itself reads
(`/scenarios`, `/vocabulary`) and prints the live count per topic, so the report
is the result rather than a claim about it.

## 6. Known limitations

1. **Vocabulary pools per topic, not per scenario.** Two scenarios sharing a
   category (`official` → `documents`) share one word pool. After this module
   loads, the `documents` pool is ~51 words across three scenarios, which dilutes
   how relevant a quiz item is to the scenario just studied. Fixing it properly
   means a `topic` (or `scenario_id`) column on the scenarios table — which is a
   schema change, so it is deliberately not attempted here. This is the single
   most valuable piece of content architecture still open.
2. **D1 cannot hold a draft state.** Neither `vocabulary`, `starter_phrases` nor
   `scenarios` has a `status` column, so anything loaded is immediately live
   curriculum. The review gate is this document plus the loader's refusal — a
   process guarantee, not a database constraint. Phase 5 asks for
   `draft → reviewed → approved` states in D1; that needs an additive migration.
3. **`content-*` admin endpoints are read/update only.** `POST /admin/{type}`
   and `POST /admin/upload` write, but there is no admin UI for *creating*
   vocabulary; `/admin/api/content-list` and `content-update` exist for auditing
   and correcting rows. The Content Studio tab stays read-only by design.
4. **Review state does not sync across devices** (Phase 1 open item): the queue
   survives reloads, but `POST /review/sync` is still unwritten.

## 7. Verifying this module without loading it

```bash
node scripts/audit-curriculum.mjs          # the content gate
npx vitest run tests/curriculumAudit.test.ts   # 22 tests: rules + shipped draft
```

Both run in CI via `npm test`, so a content regression fails the build exactly
the way a code regression does.
