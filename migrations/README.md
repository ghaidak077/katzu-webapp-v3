# migrations — documentation, not a runner

**There is no migration runner and nothing executes these files.** No deploy step,
no test and no CI job reads this directory. The only thing in the repository that
applies DDL to Cloudflare at runtime is the Worker, and it creates its own *ledger*
tables idempotently on first request (`ensureLedgerTables`); it does not manage the
*content* tables.

This directory exists because the content schema had drifted with nothing to
compare it against. On 2026-09-29 the authorized content load wrote three of its
four batches and then failed with `D1_ERROR: table grammar has no column named
rule_de` — the deployed `grammar` table carries an older shape than the drafts, the
curriculum audit and the Worker's `resolvePracticeGrammar` all assume
(`docs/AGENT-STATE.md` V12-2).

| File | What it records |
|---|---|
| [`0001_content_tables.sql`](0001_content_tables.sql) | The four content tables' DDL: section 1 is what production actually has today (verbatim from `sqlite_master`), section 2 the gap, section 3 the three additive `ALTER TABLE` statements still pending on the deployed `grammar` table. |

The executable half of the same facts lives in `ADDITIVE_COLUMNS`
(`cloudflare-content-schema.js`), which `ensureContentColumns` applies on the
Worker's first request: since V13 it carries `grammar.rule_de`, `rule_ar` and
`example_ar`, so a deployment heals itself instead of waiting for a hand-run DDL.

Rules for this directory:

1. **Additive statements only.** These files describe production; a destructive
   statement in one is a bug, not a migration.
2. **A file describes a state, not an intention.** When a statement is applied,
   say so in the file, with the date and the check that proved it — an unapplied
   "migration" that claims to be applied is worse than no file.
3. **Only the owner runs DDL against production.** `AGENTS.md` §3: an agent may
   write content rows under `CONTENT-LOAD-AUTHORIZED` and roll them back; it may
   not change a schema. The commands live in the SQL file's section 3 so the owner
   can copy them.
4. **Keep the loader's probe and this file in step.** Before its first write the
   loader now compares the payload's keys against the live columns it reads through
   `/admin/api/content-list` (a real row read — `/admin/schema` returns the
   content-studio's *declared* schema and would have said `rule_de` existed). If
   this directory and the deployment disagree, the loader is the enforcement point
   and the runbook is the procedure.

## V21 Phase 5 (2026-09-30): `scenarios.initial_message_a0` — NOT YET APPLIED

The A0 foundations module (`docs/content/curriculum-a0-foundations.json`, gate-approved this
phase) carries from-zero openers, so the `scenarios` table needs one additive TEXT column.
The loader's preflight correctly refused the load with "live schema mismatch — nothing was
written" (the V12 enforcement working as designed). Two ways to close the gap, either is fine:

1. **Automatic (the V13 mechanism):** the next worker deploy carries
   `initial_message_a0` in `ADDITIVE_COLUMNS`
   (`cloudflare-content-schema.js`), so the worker's first request after the
   deploy runs the `ALTER TABLE` itself.
2. **Manual (owner, one statement):**

   ```sql
   ALTER TABLE scenarios ADD COLUMN initial_message_a0 TEXT;
   ```

Existing rows read NULL; the app falls back to the A1 opener when the column is
empty (`openerForLevel`), so nothing existing changes behaviour. After either
path, re-run:
`node scripts/load-curriculum.mjs --file=docs/content/curriculum-a0-foundations.json --commit`
(the approved draft and the fresh backup `/tmp/pre-load-katzu-v21-a0.sql`, 166,006 B, are ready).

## V21 Phase 11 (2026-09-30): A0 rejected by the deployed CHECK constraints — NOT YET APPLICABLE, owner-only

The loads of the three A1–B2 modules (`interview-medical`, `interview-tech`,
`ausbildung-exams`) succeeded. The A0 foundations module and the
`grammar-essentials-v21` supplement did not: all three row tables were created
(2026-09-29) with

```sql
level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2'))
```

so any row with `level='A0'` fails with `D1_ERROR: CHECK constraint failed:
level IN ('A1','A2','B1','B2')`. Unlike a missing column this is **not
additive**: SQLite cannot alter a CHECK, the table must be rebuilt
(`CREATE new → INSERT SELECT → DROP old → RENAME`), and a rebuild of a
production table is a schema change — owner-only by rule 3 above. The agent
rolled its one partial write (the 6 A0 `scenarios` rows, which have no level
CHECK) back; verified counts returned to the pre-load baseline
15 / 221 / 111 / 22.

Owner fix sketch (run when A0 launch is wanted):

```sql
-- For each of vocabulary, starter_phrases, grammar:
CREATE TABLE vocabulary_new ( ...same DDL with level IN ('A0','A1','A2','B1','B2')... );
INSERT INTO vocabulary_new SELECT * FROM vocabulary;
DROP TABLE vocabulary; ALTER TABLE vocabulary_new RENAME TO vocabulary;
-- then recreate idx_vocabulary_level_topic
```

`cloudflare-content-schema.js`'s `ADDITIVE_COLUMNS` cannot do this and must not
try. After the rebuild, re-run:
`node scripts/load-curriculum.mjs --file=docs/content/curriculum-a0-foundations.json --commit`
and the supplement's `--commit` (fresh backups first).

## V23 (2026-10-01): the exact A0 rebuild SQL — verified end-to-end on a local D1 copy

`0002_a0_level_check_rebuild.sql` turns the sketch above into the exact,
live-DDL-derived statements (the `grammar` DDL in 0001's section 1 predates the
V13 `rule_de/rule_ar/example_ar` ALTERs; 0002 uses the live shape read from
`sqlite_master` on 2026-10-01) plus pre/post-flight checks.

**Verified 2026-10-01 on a scratch LOCAL D1** (`katzu-content-scratch`, created
by exporting production with `wrangler d1 export katzu-content --remote`,
importing the dump into the scratch binding, and running the file):

- pre: counts 38 / 441 / 319 / 56 matched production; `INSERT ... level='A0'`
  failed with `CHECK constraint failed: level IN ('A1','A2','B1','B2')` (live
  copy reproduces the production constraint).
- the file ran as one `--file` batch: 13 statements, all success.
- post: counts unchanged 38 / 441 / 319 / 56; A0 inserts accepted in all three
  tables (probe rows inserted, selected, deleted); junk level `'Z9'` still
  rejected (`CHECK constraint failed: level IN ('A0','A1','A2','B1','B2')`);
  `sqlite_sequence` preserved (vocabulary seq 505, starter_phrases 361);
  both indexes recreated with identical definitions.

Still owner-only, and still **not run against production**. The checklist is at
the bottom of 0002.
