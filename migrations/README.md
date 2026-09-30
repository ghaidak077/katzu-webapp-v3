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
