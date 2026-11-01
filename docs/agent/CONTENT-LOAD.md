# Content load runbook (production D1 write, insert-only)

## Preconditions (else STOP, no partial load)
1. Prompt has `CONTENT-LOAD-AUTHORIZED` naming each file loaded.
2. Each file: review.status="approved", a review file under `docs/content/`, a passing `audit-curriculum.mjs` and a passing `load-curriculum.mjs --dry-run`.
3. Read-only collision check on production D1 (`wrangler d1 execute <db> --remote --command "SELECT id FROM <table> WHERE id IN (...)"`): every scenario, vocab, phrase and grammar id in the file must be ABSENT. Any collision → STOP, list in OWNER-OPEN.
4. `ADMIN_SECRET` reports "set", checked **only** with `[ -n "$ADMIN_SECRET" ] && echo set`. The agent must never print, echo, log, store, commit, or pass the value in a command line or argument. To look for a leaked value, grep the loader log for `Bearer`/`Authorization` — never for the value itself.
5. *(Added in V11 after a real stall — "set" is not a credential check.)* The value must be the credential the worker actually accepts. V11's first load attempt passed `[ -n ]` and then died on `HTTP 401 unauthorized`, because the variable held the 64-hex secret wrapped in literal **angle brackets** (66 chars; chars 2–65 clean hex). Before loading, check the *shape* without printing it: `printf 'length=%s\n' "${#ADMIN_SECRET}"`, `[[ $ADMIN_SECRET =~ ^[0-9a-f]{64}$ ]]`, and the code points of the first and last characters (`printf '%d' "'${ADMIN_SECRET:0:1}"`). A wrapper character, a length other than the expected one, or any `401` from the loader means **stop** and report the shape (never the value) — an agent must not re-encode, trim or re-derive a secret to make the loader work; that is an owner-side environment fix.

## Backup
`wrangler d1 export <db> --remote --output $TMP/pre-load.sql`. Record the path and size in the ledger. Never commit it.

## Load
One file at a time, **module2 first**, then module1 only if the Content Gate approved it:

```
node scripts/load-curriculum.mjs --file=docs/content/curriculum-arrival-module2.json --commit
node scripts/load-curriculum.mjs --file=docs/content/curriculum-30day-module1.json --commit   # only if approved
```

Redirect each run's output to a temp log, check that log for `Bearer`/`Authorization` before showing anything, and print only the count lines. Never show output containing the secret.

The loader now reads one real row of each table first and **refuses to write anything** when the draft needs a column the deployment does not have (V12's `grammar.rule_de`, see `docs/AGENT-STATE.md` V13-1). A refusal exits non-zero and writes nothing, so it is not a mismatch to roll back — it is a schema to fix (owner action; `migrations/0001_content_tables.sql`). Its closing summary lists every batch, and any batch that did not answer 200 makes the whole run exit non-zero.

## Verify
Row counts equal the dry-run expectation. Old rows unchanged (counts + 3 sampled rows compared against the backup). Production `/scenarios`, `/vocabulary` and `/grammar` return the new rows. The demo e2e spec passes against production.

## Rollback (automatic)
Any mismatch → delete ONLY the ids this run inserted (from the dry-run list) via wrangler, verify the counts return to 5 scenarios / 114 vocabulary / 20 starter_phrases / 4 grammar, mark `blocked`, stop.

## Correcting rows that are already live (built 2026-11-01 — NOT yet authorized)

The insert-only loader above cannot change a live row. `scripts/load-content-updates.mjs`
is the update-capable path: same `ADMIN_SECRET` rule, but it writes through the Content
Studio (`/admin/api/content-studio/<type>/{draft,publish-all,undo}`) so every write has a
draft, an audit row, a dated backup and an undo per row.

```
node scripts/load-content-updates.mjs                      # dry run: lists every field before → after, writes nothing
node scripts/load-content-updates.mjs --commit             # drafts → publish-all → verify → manifest in backups/content-load-<stamp>/
node scripts/load-content-updates.mjs --undo=backups/content-load-<stamp>/manifest.json
```

Rules it enforces itself (all covered by `tests/loadContentUpdates.test.ts`):

- **insert-only stays true**: a catalogue id that is not already live is printed as
  `WILL NOT be created` and never written. 2026-11-01: the 12 new scenes stay out.
- refuses to start if any draft of that type already exists (`publish-all` would publish it too);
- carries live `banner_url` over; never writes `sequence_order` (the journey order is code:
  `src/lib/content/scenarioOrder.ts`);
- takes a studio backup + export, records a manifest (before, after, audit uids, bookmark) and
  only then writes; on any verification failure it undoes the publishes it made;
- `--undo` refuses when live rows no longer match the manifest's after-state (someone edited
  them since the load).

The gate is unchanged: **§3 still says insert-only, so this path needs the owner's explicit
amendment plus the exact `CONTENT-LOAD-AUTHORIZED: <file names>` line**. `docs/AGENT-STATE.md`
carries the open item.

Local proof of the whole path (fresh D1 seeded from `backups/pre-content-v2/content.sql`,
throwaway key, real `wrangler dev`, ~2 min):

```
node scripts/verify-content-update-local.mjs    # 28 checks; exit 0 = pass
```

Measured 2026-11-01: 49 live rows, **49 rows / 327 fields** (a0/a1/a2/b1/b2 49 each, title_ar 32,
ai_persona 25, title_de 15, icon 10); dry run wrote nothing and made no draft; a planted draft
blocked the commit; the commit published 49 rows, matched the catalogue column-for-column, left
the 12 new ids absent, `/scenarios` served the corrected rows, a second dry run found nothing,
and `--undo` restored every field. The run also found a real studio defect: an audit
`before_state` from `SELECT *` carries the legacy `sequence_order`, which undo rejected as an
unknown column — fixed by projecting stored audit rows onto `DB_SCHEMA` (`contractRow`).

