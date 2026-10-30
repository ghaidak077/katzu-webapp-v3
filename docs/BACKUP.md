# Backup — the state before the admin panel (2026-10-31)

This is the "undo" record for the admin work (telemetry, the separate panel Worker, conversation
logging, the user/content/alerts screens). It was taken **before the first line of admin code** and
every value below was read from Cloudflare or git in that session, not copied from memory.

If the admin work has to be abandoned, the shortest correct path is §4 (worker) + §5 (Pages): both
are Cloudflare-side rollbacks and need no rebuild. §6 restores the database.

## 1. What was captured

| Artifact | What it proves / restores |
|---|---|
| git tag `pre-admin-backup` (annotated) | The exact commit the backup describes: **`0b53942e105287963088caf98fdc4ede2c3b6bc4`** (`git rev-parse pre-admin-backup^{commit}`) |
| branch `backup/pre-admin` | Same commit, pushed to `origin`; a permanent ref that survives tag edits |
| `worker-pre-admin/cloudflare-unified-worker.js` (+ `.map`) | The deployed Worker bundle, byte copy (595 KB) — the last resort if no version can be rolled back to |
| `wrangler.toml.txt` | Product Worker configuration and bindings as deployed |
| `secret-names.json` | **Secret names only**, never values — the eight names the Worker expects |
| `d1-schema.json` | `sqlite_master` for every table, index and trigger in production D1 |
| `d1-migrations.txt` | The `d1_migrations` probe (production has no such table — see §6) |
| `d1-bookmark.txt` | D1 Time Travel bookmark at backup time |
| `katzu-content-full.sql` | Full `katzu-content` export (660 KB) taken with `d1 export` |
| `kv-namespaces.json` | KV namespace ids and titles |
| `kv-user-progress-keys.json` | Every key in `USER_PROGRESS` at backup time (62 KB of key names/values) |
| `kv-ai-provider-config.json` | The provider configuration keys only |

The folder is `backups/pre-admin-2026-10-31/` and is **gitignored** (it holds a database export and
KV contents). It exists only on this machine; do not commit it and do not delete it before the admin
work is accepted.

Secrets: only the names were recorded. `ADMIN_SECRET`, `GEMINI_API_KEYS`, `GROQ_API_KEYS`,
`HMAC_SECRET`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NVIDIA_API_KEYS`,
`OPENROUTER_API_KEYS`. Their values were never read, printed or stored, and no restore step below
needs them.

## 2. Live state at backup time

- **Worker `katzu-test`** (product): deployment **`b23b5534-29c8-4ecb-8986-33e95da356ef`**, version
  **`b33136fa-dd5d-45b5-bad5-fabbbfbdca72`** at 100%. This is the worker rollback target.
- **Pages app `katzu-webapp-v3`**: production deployment
  **`39d0c289-0ce9-41ad-ae99-e886b617c48c`** (branch `main`, commit `0b53942`). Rollback targets in
  order: `d150eea2-9af3-4984-bb00-70b3c181141e` (commit `5a8c7d5`), then
  `e948f1dc-40fd-4a6a-b6df-1c8efac1297b`. Re-read with
  `npx wrangler pages deployment list --project-name=katzu-webapp-v3`.
- **D1 `katzu-content`**: Time Travel bookmark
  **`00000588-00000000-00005114-1fa4525fe62bbcdee47de232afe7ff34`**.
- **KV `USER_PROGRESS`**: id `d901da2026dc4830940562c72935ec78`.
- Pushing the backup branch produced a Pages **preview** build (`a9af86ef…`). Previews are not
  production and need no rollback.

## 3. Green gate before any work

`npm run verify -- --ci` on `0b53942` → **VERIFY OK 13/13**, 103.9 s, exit 0. The tag is only useful
if the tree it names was green; that is the recorded proof.

## 4. Restore the product Worker

Preferred — Cloudflare keeps the previous version:

```bash
npx wrangler rollback b33136fa-dd5d-45b5-bad5-fabbbfbdca72 --name katzu-test
```

The version id is a **version**, not a deployment id; `rollback` promotes it back to 100%. Verify with
`curl -m 10 https://katzu-test.ghaidakalosh008.workers.dev/health` → 200 and
`"storage":{"d1":…,"kv":…}`. Record the new deployment id before doing anything else.

Last resort — redeploy the byte copy of the bundle:

```bash
cd backups/pre-admin-2026-10-31/worker-pre-admin
npx wrangler deploy cloudflare-unified-worker.js --name katzu-test --no-bundle
```

`--no-bundle` is required: the file is already the built ESM bundle. This loses the binding set if
`wrangler.toml` is not the repository one; check `wrangler.toml.txt` against it first.

## 5. Restore the app (Pages)

```bash
npx wrangler pages deployment rollback 39d0c289-0ce9-41ad-ae99-e886b617c48c \
  --project-name=katzu-webapp-v3
```

If that deployment cannot be promoted, use `d150eea2-…`, then `e948f1dc-…`, in that order. Verify
`https://katzuai.com/` → 200 and the service worker still registers. Cloudflare's own dashboard
(`Workers & Pages → katzu-webapp-v3 → Deployments → … → Rollback`) performs the same operation.

The two static projects (`katzu-landing`, `katzu-sales`) are direct-upload and were **not** touched by
the admin work; they have no admin code and need no restore.

## 6. Restore the database

Two layers, in this order:

1. **Time Travel** (whole database, fastest):

   ```bash
   npx wrangler d1 time-travel restore katzu-content \
     --bookmark=00000588-00000000-00005114-1fa4525fe62bbcdee47de232afe7ff34
   ```

   Time Travel keeps 30 days by default on this plan; after that this bookmark is gone and only the
   export remains.

2. **The export** (single database, full SQL):

   ```bash
   npx wrangler d1 execute katzu-content --remote --file=backups/pre-admin-2026-10-31/katzu-content-full.sql
   ```

   The export is data + schema and is **not** idempotent-safe to run over a live database: restore
   into a fresh database first (`d1 create`), check the row counts against §1's schema dump, and only
   then point the Worker at it. Running it on top of an existing database will collide on primary
   keys.

The admin work adds five tables (`ai_events`, `route_events`, `conversations`,
`conversation_attempts`, `admin_audit`) and no column on an existing table, so a code rollback alone
leaves them behind harmlessly. Dropping them is optional and is **not** part of the undo: they hold
the audit trail of what the panel did.

`d1_migrations` does not exist in production. `migrations/0004_admin_telemetry.sql` is documentation;
the Worker applies the same idempotent `CREATE TABLE IF NOT EXISTS` statements at runtime
(`ensureTelemetryTables`), exactly like the affiliate tables.

## 7. Restore KV

The admin work adds exactly one key: `internal:admin-token` in `USER_PROGRESS` (the shared token
between the two Workers). It is created on first panel call. To revoke panel access, delete it:

```bash
npx wrangler kv key delete internal:admin-token \
  --namespace-id=d901da2026dc4830940562c72935ec78 --remote
```

The product Worker fails closed with no token (401 on every `/internal/admin/*`), and the panel
creates a new one on its next call. `kv-user-progress-keys.json` holds the full pre-admin key set if
a key ever needs to be compared or restored.

## 8. What this backup does NOT cover

- **Secret values.** Never captured, by rule. A lost secret is an owner rotation, not a restore.
- **Cloudflare Access configuration.** None existed before the admin work and none exists now; the
  panel ships disabled until the owner creates the Access application (see `docs/ADMIN.md`).
- **The website projects** (static, untouched).
- **A rehearsed restore.** Time Travel and `rollback` are documented Cloudflare operations but were
  **not executed** in this session — running them would change production for a drill. `UNPROVEN`
  until someone actually needs it or the owner approves a drill window.
- **The Worker's in-memory state** (rate-limit buckets, AI cooldowns). It is rebuilt on deploy.

## 9. If the panel must be removed

1. `npx wrangler delete --name katzu-admin` — removes the panel Worker and its static assets.
2. Delete `internal:admin-token` (§7).
3. Deploy the previous product Worker (§4) if `/internal/admin/*` should stop existing too. Without
   that step the internal routes stay reachable **only** through a Service Binding, never from the
   internet, and they still require the token.
4. Leave the five telemetry tables or drop them; nothing else reads them.
