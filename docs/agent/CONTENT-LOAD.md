# Content load runbook (production D1 write, insert-only)

## Preconditions (else STOP, no partial load)
1. Prompt has `CONTENT-LOAD-AUTHORIZED` naming each file loaded.
2. Each file: review.status="approved", docs/content/review-<module>.md exists, audit-curriculum.mjs PASSED, load-curriculum.mjs --dry-run PASSED.
3. Read-only collision check on production D1 (`wrangler d1 execute <db> --remote --command "SELECT id FROM <table> WHERE id IN (...)"`): every scenario, vocab, phrase and grammar id in the file must be ABSENT. Any collision → STOP, list in OWNER-OPEN.

## Backup
`wrangler d1 export <db> --remote --output $TMP/pre-load.sql`. Record path and size in the ledger. Never commit it.

## Load
One file at a time: `node scripts/load-curriculum.mjs --file=<f> --commit`. After each file, re-query row counts and compare with the dry-run counts.

## Verify
Production /scenarios, /vocabulary, /grammar return the new rows. Old rows unchanged (counts + 3 sampled rows vs backup). Run the demo e2e spec against production.

## Rollback (automatic)
Any mismatch → DELETE only the ids this run inserted (from the dry-run list), re-verify counts equal pre-load numbers, mark blocked, stop.
