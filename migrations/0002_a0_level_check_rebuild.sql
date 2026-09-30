-- migrations/0002_a0_level_check_rebuild.sql
--
-- DOCUMENTATION ONLY — there is no migration runner, and this file is not run by
-- a deploy, a test or CI (same contract as 0001_content_tables.sql). The
-- statements below were EXECUTED AND VERIFIED end-to-end on a LOCAL copy of the
-- production `katzu-content` database (2026-10-01): the local copy was created
-- with `npx wrangler d1 export katzu-content --remote --output=<backup>.sql`,
-- imported into a scratch local D1 (`wrangler d1 execute <scratch> --local
-- --file=<backup>.sql`), the statements run there, and A0 rows inserted +
-- full counts verified — see the pre-flight checklist at the bottom and
-- docs/AGENT-STATE.md V23-2.
--
-- WHY (V21 Phase 11, docs/AGENT-STATE.md V21-14): the three row tables were
-- created (2026-09-29) with
--
--     level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2'))
--
-- so any A0 row fails with `D1_ERROR: CHECK constraint failed: level IN
-- ('A1','A2','B1','B2')`. SQLite cannot alter a CHECK; the table must be
-- rebuilt. `scenarios` has no level CHECK — it already carries A0 rows fine
-- (the a0-foundations draft's scenarios loaded once before the rollback) — and
-- it must NOT be rebuilt here.
--
-- Production DDL source: `sqlite_master` read 2026-10-01 (counts 38 scenarios /
-- 441 vocabulary / 319 starter_phrases / 56 grammar). The `grammar` table in
-- section 1 of 0001_content_tables.sql predates the V13 `rule_de/rule_ar/
-- example_ar` ALTERs; the DDL below is the LIVE shape, not 0001's.
--
-- OWNER-ONLY (migrations/README.md rule 3): agents must not run production DDL.

-- ============================================================================
-- STEP 0 — pre-flight (read-only, run first; abort unless ALL hold)
-- ============================================================================

-- 0a. The table shapes still match what this file was verified against:
--     the ONLY differences from the DDL in each *_new below must be the CHECK's
--     A0 inclusion. If anything else differs, STOP and re-derive this file.
--
--     npx wrangler d1 execute katzu-content --remote --json \
--       --command "SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('scenarios','vocabulary','starter_phrases','grammar')"

-- 0b. Row counts to compare after the rebuild (record the output):
--
--     npx wrangler d1 execute katzu-content --remote --json \
--       --command "SELECT (SELECT COUNT(*) FROM scenarios) scenarios, (SELECT COUNT(*) FROM vocabulary) vocabulary, (SELECT COUNT(*) FROM starter_phrases) starter_phrases, (SELECT COUNT(*) FROM grammar) grammar"
--
--     Verified baseline at the time of writing: 38 / 441 / 319 / 56.

-- 0c. FRESH BACKUP. Do not proceed without a file you just wrote:
--
--     npx wrangler d1 export katzu-content --remote --output=backups/pre-a0-check-rebuild.sql
--     (record the byte size in the run report)

-- 0d. (Defence in depth) No A0 row can exist yet — every prior A0 write was
--     rejected by the CHECK:
--
--     SELECT
--       (SELECT COUNT(*) FROM vocabulary      WHERE level='A0') +
--       (SELECT COUNT(*) FROM starter_phrases WHERE level='A0') +
--       (SELECT COUNT(*) FROM grammar         WHERE level='A0') AS a0_rows;
--     -- expect 0

-- ============================================================================
-- STEP 1 — the rebuild (one wrangler --command per statement, or all of steps
-- 1–3 as ONE --file run: D1 executes a file as a single batch, so a failure
-- mid-file rolls back the whole batch — prefer --file).
-- ============================================================================

-- 1a. New tables: LIVE production DDL with exactly one change —
--     the CHECK gains 'A0'.

CREATE TABLE vocabulary_new ( id INTEGER PRIMARY KEY AUTOINCREMENT, german TEXT NOT NULL, article TEXT, plural TEXT, part_of_speech TEXT, translation_ar TEXT, translation_en TEXT, example_de TEXT, example_ar TEXT, example_en TEXT, level TEXT NOT NULL CHECK (level IN ('A0','A1','A2','B1','B2')), topic TEXT );

CREATE TABLE starter_phrases_new ( id INTEGER PRIMARY KEY AUTOINCREMENT, scenario_id TEXT NOT NULL, level TEXT NOT NULL CHECK (level IN ('A0','A1','A2','B1','B2')), german TEXT NOT NULL, translation_en TEXT, translation_ar TEXT, sort_order INTEGER DEFAULT 0, FOREIGN KEY (scenario_id) REFERENCES scenarios(id) );

CREATE TABLE grammar_new ( id TEXT PRIMARY KEY, level TEXT NOT NULL CHECK (level IN ('A0','A1','A2','B1','B2')), title_ar TEXT, title_en TEXT, explanation_ar TEXT, explanation_en TEXT, example_de TEXT , rule_de TEXT, rule_ar TEXT, example_ar TEXT);

-- 1b. Copy every row verbatim.

INSERT INTO vocabulary_new ( id, german, article, plural, part_of_speech, translation_ar, translation_en, example_de, example_ar, example_en, level, topic ) SELECT id, german, article, plural, part_of_speech, translation_ar, translation_en, example_de, example_ar, example_en, level, topic FROM vocabulary;

INSERT INTO starter_phrases_new ( id, scenario_id, level, german, translation_en, translation_ar, sort_order ) SELECT id, scenario_id, level, german, translation_en, translation_ar, sort_order FROM starter_phrases;

INSERT INTO grammar_new ( id, level, title_ar, title_en, explanation_ar, explanation_en, example_de, rule_de, rule_ar, example_ar ) SELECT id, level, title_ar, title_en, explanation_ar, explanation_en, example_de, rule_de, rule_ar, example_ar FROM grammar;

-- 1c. Drop old, rename new. D1 runs DDL inside its transaction model; verified
--     locally that DROP+RENAME in the same batch behaves as documented here.

DROP TABLE vocabulary;
ALTER TABLE vocabulary_new RENAME TO vocabulary;

DROP TABLE starter_phrases;
ALTER TABLE starter_phrases_new RENAME TO starter_phrases;

DROP TABLE grammar;
ALTER TABLE grammar_new RENAME TO grammar;

-- ============================================================================
-- STEP 2 — restore the indexes (DROP TABLE dropped them with the tables; the
-- names below are exactly the ones in production sqlite_master).
-- ============================================================================

CREATE INDEX idx_starter_phrases_scenario ON starter_phrases(scenario_id, level);
CREATE INDEX idx_vocabulary_level_topic ON vocabulary(level, topic);

-- ============================================================================
-- STEP 3 — post-flight verification (read-only; every one must hold)
-- ============================================================================

-- 3a. Counts unchanged (compare with step 0b): scenarios/vocabulary/
--     starter_phrases/grammar must equal the recorded baseline (38/441/319/56
--     at the time of writing).

-- 3b. AUTOINCREMENT bookkeeping survived the copy (the loader writes vocab by
--     rowid, so the next implicit id must not collide):
--
--     SELECT seq FROM sqlite_sequence WHERE name='vocabulary';      -- ≥ 441 (max(id) preserved)
--     SELECT seq FROM sqlite_sequence WHERE name='starter_phrases'; -- ≥ 319
--
--     Verified locally: seq survives INSERT INTO ... SELECT with explicit ids.

-- 3c. A0 is now accepted — this is the whole point. Write one probe row per
--     table, verify, DELETE it:
--
--     INSERT INTO vocabulary (german, level, topic) VALUES ('__a0_probe__', 'A0', 'probe_topic');      -- expect: success
--     SELECT id FROM vocabulary WHERE german='__a0_probe__';                                          -- expect: 1 row
--     DELETE FROM vocabulary WHERE german='__a0_probe__';
--     -- (grammar probe uses INSERT INTO grammar (id, level) VALUES ('__a0_probe__', 'A0');
--     --  starter_phrases probe needs a scenario_id that exists in scenarios.)
--
-- 3d. The CHECKs still reject junk levels ('Z9') — the constraint did not
--     disappear, it widened:
--
--     INSERT INTO grammar (id, level) VALUES ('__junk_probe__', 'Z9');  -- expect: CHECK constraint failed

-- 3e. Content still serves (read-only):
--
--     SELECT COUNT(*) FROM vocabulary;   -- matches baseline
--     SELECT COUNT(*) FROM grammar WHERE rule_de IS NOT NULL;  -- matches baseline (56 minus legacy NULLs)

-- ============================================================================
-- AFTER THE REBUILD (still owner actions, in this order)
-- ============================================================================
-- 1. Verify 3a–3e above.
-- 2. Re-run the ready drafts, each with a fresh backup first (they are gated and
--    approved; the loader is NOT authorized to run until an exact
--    CONTENT-LOAD-AUTHORIZED line for each file exists in a prompt):
--      node scripts/load-curriculum.mjs --file=docs/content/curriculum-a0-foundations.json --dry-run
--      node scripts/load-curriculum.mjs --file=docs/content/supplements/grammar-essentials-v21.json --dry-run
--    then --commit (a0-foundations first: grammar-essentials-v21's g_ess_* rows
--    are A0-level grammar and need the widened CHECK, same as the module).
-- 3. Re-run the post-load verification from docs/agent/CONTENT-LOAD.md.

-- ============================================================================
-- PRE-FLIGHT CHECKLIST (print in the run report)
-- ============================================================================
-- [ ] 0a live sqlite_master DDL matches this file's *_new DDL (CHECK excepted)
-- [ ] 0b baseline counts recorded from production (expect 38/441/319/56)
-- [ ] 0c fresh backup exported; byte size recorded
-- [ ] 0d a0_rows query returns 0
-- [ ] one wrangler --file run executes steps 1–2 as a single batch
-- [ ] 3a post counts == baseline counts
-- [ ] 3b sqlite_sequence.seq preserved for vocabulary and starter_phrases
-- [ ] 3c A0 probe row inserted, selected, deleted in all three tables
-- [ ] 3d junk-level probe still rejected by CHECK
-- [ ] 3e content reads match baseline (incl. grammar.rule_de non-NULL count)
-- [ ] loader --dry-run green for both pending drafts
