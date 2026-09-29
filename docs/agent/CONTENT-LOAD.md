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

## Verify
Row counts equal the dry-run expectation. Old rows unchanged (counts + 3 sampled rows compared against the backup). Production `/scenarios`, `/vocabulary` and `/grammar` return the new rows. The demo e2e spec passes against production.

## Rollback (automatic)
Any mismatch → delete ONLY the ids this run inserted (from the dry-run list) via wrangler, verify the counts return to 5 scenarios / 114 vocabulary / 20 starter_phrases / 4 grammar, mark `blocked`, stop.
