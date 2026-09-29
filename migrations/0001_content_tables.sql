-- migrations/0001_content_tables.sql
--
-- DOCUMENTATION ONLY — there is no migration runner, and this file is not run by
-- a deploy, a test or CI. Nothing in the repository executes it. Section 1 is
-- parsed by tests/contentSchema.test.ts as *the deployed shape*, which is why the
-- statements in it are kept verbatim rather than tidied.
--
-- Why this file exists (V12, docs/AGENT-STATE.md V12-2)
-- -----------------------------------------------------
-- The four *content* tables (scenarios, vocabulary, starter_phrases, grammar) had
-- no DDL anywhere in this repository. The Worker creates only its own *ledger*
-- tables at request time; the content tables were created out-of-band in an
-- earlier session. So the live schema was unversioned, and it drifted.
--
-- On 2026-09-29 the authorized content load wrote three of its four batches
-- (scenarios, vocabulary, starter_phrases → HTTP 200) and then died on
--
--     D1_ERROR: table grammar has no column named rule_de: SQLITE_ERROR
--
-- because `handleAdminUpload` (cloudflare-unified-worker.js) builds
-- `INSERT INTO <table> (…)` from the row's own keys, while the deployed `grammar`
-- table carries an older, shorter shape. Nothing could see it beforehand: the
-- curriculum audit validates the *draft* against the documented field list and the
-- loader's `--dry-run` never touches the network. `/admin/schema` does not help
-- either — it returns the content-studio's *declared* schema, which listed
-- `rule_de` while the live table had no such column. Only a real row read shows
-- what D1 has, which is what `scripts/load-curriculum.mjs` now does before its
-- first write.

-- SECTION 0 — note on section 1's provenance
-- =========================================
-- The statements below are `sqlite_master.sql` read from production D1
-- `katzu-content` on 2026-09-29 (`SELECT name, sql FROM sqlite_master WHERE
-- type='table'`), reflowed onto single lines. They describe **what production has
-- today**, not what it should have; the difference is section 2.

-- SECTION 1 — the deployed DDL (parsed by tests/contentSchema.test.ts)
-- ====================================================================

CREATE TABLE scenarios ( id TEXT PRIMARY KEY, title_de TEXT NOT NULL, title_ar TEXT NOT NULL, ai_persona TEXT, category TEXT, icon TEXT, initial_message_a1 TEXT, initial_message_a2 TEXT, initial_message_b1 TEXT, initial_message_b2 TEXT , sequence_order INTEGER DEFAULT 0, banner_url TEXT);

CREATE TABLE vocabulary ( id INTEGER PRIMARY KEY AUTOINCREMENT, german TEXT NOT NULL, article TEXT, plural TEXT, part_of_speech TEXT, translation_ar TEXT, translation_en TEXT, example_de TEXT, example_ar TEXT, example_en TEXT, level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2')), topic TEXT );

CREATE TABLE starter_phrases ( id INTEGER PRIMARY KEY AUTOINCREMENT, scenario_id TEXT NOT NULL, level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2')), german TEXT NOT NULL, translation_en TEXT, translation_ar TEXT, sort_order INTEGER DEFAULT 0, FOREIGN KEY (scenario_id) REFERENCES scenarios(id) );

CREATE TABLE grammar ( id TEXT PRIMARY KEY, level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2')), title_ar TEXT, title_en TEXT, explanation_ar TEXT, explanation_en TEXT, example_de TEXT );

CREATE INDEX idx_starter_phrases_scenario ON starter_phrases(scenario_id, level);
CREATE INDEX idx_vocabulary_level_topic ON vocabulary(level, topic);

-- Section 1's grammar table is three columns short of what the app requires.
-- `title_en` and `explanation_en` exist there and nothing in src/ or the Worker
-- reads them: they are pre-`rule_de` legacy. No column above is dropped or
-- retyped by anything that follows.

-- SECTION 2 — the gap, and who closes it
-- =====================================
-- `src/types/models.ts`, `src/lib/content/curriculumAudit.ts`,
-- `cloudflare-content-schema.js` (DB_SCHEMA) and the Worker's
-- `resolvePracticeGrammar` all expect these eight `grammar` columns:
--
--     id, level, title_ar, rule_de, rule_ar, explanation_ar, example_de, example_ar
--
-- Deployed today: id, level, title_ar, title_en, explanation_ar, explanation_en,
-- example_de. **Missing: rule_de, rule_ar, example_ar.**
--
-- Two things close it, and they are deliberately the same facts in two places:
--
--   1. `ADDITIVE_COLUMNS` in `cloudflare-content-schema.js` — the executable
--      copy. `ensureContentColumns` runs on the Worker's first request and adds
--      any listed column that is absent, so a deployment heals itself once the
--      Worker carrying those entries is deployed. V13 added the three grammar
--      entries there; before that the list held only `scenarios.banner_url`,
--      which is exactly why the Worker ran on every request for months without
--      noticing this. `tests/contentSchema.test.ts` asserts the invariant now:
--      every `DB_SCHEMA` column is in section 1 or in `ADDITIVE_COLUMNS`.
--   2. The owner's `ALTER TABLE`s in section 3 — the immediate unblock today,
--      without waiting for a deploy.

-- SECTION 3 — the statements for a deployment that lags the code
-- ==============================================================
-- Owner-only, run by hand against production (agents must not run production DDL:
-- AGENTS.md §3 — the content-load permission covers content rows and the rollback
-- of those rows, nothing else). `ALTER TABLE ADD COLUMN` adds columns only; no
-- row is read, changed or lost. If the Worker carrying the V13 `ADDITIVE_COLUMNS`
-- is deployed first, these are unnecessary and answer "duplicate column name",
-- which `ensureContentColumns` treats as the steady state.
--
--   npx wrangler d1 execute katzu-content --remote --command "ALTER TABLE grammar ADD COLUMN rule_de TEXT"
--   npx wrangler d1 execute katzu-content --remote --command "ALTER TABLE grammar ADD COLUMN rule_ar TEXT"
--   npx wrangler d1 execute katzu-content --remote --command "ALTER TABLE grammar ADD COLUMN example_ar TEXT"
--
-- Status: **not applied as of V13-1.** Re-reading `pragma_table_info('grammar')`
-- returned the seven legacy columns, so the next authorized content load still
-- needs either these statements or the deploy.
--
-- Verify afterwards (read-only):
--
--   npx wrangler d1 execute katzu-content --remote --json \
--     --command "SELECT GROUP_CONCAT(name) FROM pragma_table_info('grammar')"
--
--   -- expect: id,level,title_ar,title_en,explanation_ar,explanation_en,example_de,rule_de,rule_ar,example_ar
--
-- Then re-run docs/agent/CONTENT-LOAD.md; the loader's own preflight (rule 5 in
-- scripts/load-curriculum.mjs) now refuses to write anything while the two shapes
-- still disagree, so a half-loaded run cannot happen again.

-- SECTION 4 — a follow-up that is content, not schema
-- ==================================================
-- The four pre-existing `grammar` rows (akkusativ_articles, dativ_prepositions,
-- konjunktiv_ii, perfekt_tense) use a different id namespace from the `g_*` ids in
-- `src/lib/content/scenarioGrammar.ts` and the offline seed in
-- `src/lib/db/katzuDb.ts`, so the five original scenarios resolve no D1 grammar row
-- even after section 3. That is a content decision (rename the rows, map both, or
-- author `g_*` rows), recorded in docs/AGENT-STATE.md OWNER-OPEN — not a schema
-- change, and not fixed here.
