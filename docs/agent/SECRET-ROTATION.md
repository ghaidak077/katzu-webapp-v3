# Secret rotation — the steps and the proof for each

Owner-only. An agent never runs these, never sees a value, and never prints one
(`AGENTS.md` §3). This page exists because "I rotated it" is not evidence: every step
below ends with a command whose output proves the new value is in place and the old one
is dead.

**Two facts that cost a run each (both measured, `docs/AGENT-STATE.md`):**

- A rotation is not applied by being pasted into chat. `ADMIN_SECRET` lives in the Worker's
  variables; until a new version is deployed, `wrangler versions list --name katzu-test`
  still ends at the old id and the old secret still works.
- "set" is not a credential check. A value wrapped in literal angle brackets, 66 chars long
  instead of 64, passed `[ -n "$ADMIN_SECRET" ]` and then died on `HTTP 401` from the loader
  (`docs/agent/CONTENT-LOAD.md` §5).

## 1. `ADMIN_SECRET` (the admin API and the content loader)

**Generate.** 64 lowercase hex characters, nothing around them:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Check the shape before pasting** — length and alphabet only, the value is never echoed:

```bash
[[ $NEW_SECRET =~ ^[0-9a-f]{64}$ ]] && echo shape-ok
```

**Store.** Worker `katzu-test` → Settings → Variables → `ADMIN_SECRET` (Encrypt). The admin
Worker carries no D1 and no AI binding; it does not hold this value.

**Prove.**

```bash
# 1. no bearer, no data — must be 401
curl -s -o /dev/null -w '%{http_code}\n' https://katzu-test.ghaidakalosh008.workers.dev/admin/api/stats
# 2. a new version exists and is the one serving (the old id must not be last)
npx wrangler versions list --name katzu-test | head -5
# 3. the loader accepts it — dry run only, writes nothing
node scripts/load-content-updates.mjs --offline
```

A `401` on (3) with a clean 64-hex value means the value is not what the Worker has, not that
the loader is broken. Re-read `docs/agent/CONTENT-LOAD.md` §5 before retrying.

## 2. `GROQ_API_KEY` (the repository secret the weekly Chat QA reads)

**Store.** `gh secret set GROQ_API_KEY` (paste at the prompt). It must be the same value as a
pool key; a second Groq account is a policy violation, not capacity (`OWNER-CHECKLIST.md` §17).

**Prove.**

```bash
gh secret list --json name                      # shows GROQ_API_KEY, never a value
gh workflow run chat-qa.yml -f max_usd=0.3      # one deliberate run beats waiting for Monday
gh run list --workflow=chat-qa.yml --limit=1 --json conclusion,displayTitle
```

The run must pass the preflight step and reach the sessions. `exit 2` in the job log means the
secret is still empty; the step summary names that fix instead of calling it a regression.

## 3. Pool keys (`GROQ_API_KEYS`, `CEREBRAS_API_KEYS`)

**Store.** Worker variable, comma-separated. `key_id` in `ai_events` is a fingerprint, so the
telemetry keeps the same identity for a rotated-but-equivalent key.

**Prove.**

```bash
curl -s https://katzu-test.ghaidakalosh008.workers.dev/health | head -c 400   # ready:true, chat_ready:true
node scripts/check-deploy-drift.mjs --json                                     # the version serving is the one you meant
```

Then one real turn in the app: a reply that is not the Arabic fallback line.

## After a rotation — what the agent may do

Read-only checks only: the three probe commands above, `npm run check:drift`, and a dry run of
the loader. Anything that writes, deploys or reads the value is yours.
