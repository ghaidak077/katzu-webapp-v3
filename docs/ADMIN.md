# Admin panel and telemetry — inspection report (2026-10-31)

Status: **built and tested locally; nothing in this document is deployed yet.** The live product Worker
is still `katzu-test` version `b33136fa-…` and the only live admin surface is the old embedded
`/admin` page. The rollback and backup record is `docs/BACKUP.md`.

## 1. What this adds

| Phase | What | Local state | Live state |
|---|---|---|---|
| 1 | Telemetry: `ai_events`, `route_events`, redaction, retention sweep | code + 29 tests | **not deployed** |
| 2 | Separate panel Worker `katzu-admin`, Access gate, Service-Binding proxy | code + 26 tests (12 access, 14 panel) | **not deployed** — no Access application exists |
| 3 | Conversation logging: `conversations`, `conversation_attempts`, consent, 90-day scrub | code + tests, master switch **off** | **not deployed**, and **stores no text even when the switch is on** until a learner grants consent (§7) |
| 4 | Users, content, alerts, errors, audit, export, delete screens | code + tests | **not deployed** |

The old embedded `/admin` page and `ADMIN_SECRET` are untouched. They stay until the new panel is
verified live and the owner says to retire them.

## 2. Architecture

```
browser ──Cloudflare Access──▶ katzu-admin (Worker, static assets)
                                  │  verifies Cf-Access-Jwt-Assertion itself
                                  │  /api/*  →  Service Binding KATZU_API
                                  ▼
                          katzu-test (product Worker)
                                  │  POST /internal/admin/*  (token, rate limit, audit)
                                  ▼
                          D1 katzu-content   KV USER_PROGRESS
```

- The panel Worker has **no D1 binding and no AI keys**. It cannot read a key value, and its only
  write path is the internal API below.
- `/internal/admin/*` exists on the product Worker but is not routable from the internet by hostname:
  it is reached through the Service Binding. It still requires the token, so a misconfiguration is
  two failures away from exposure, not one.
- The panel never stores, shows or accepts an API-key value. The providers control is an
  enable/disable switch for a provider **entry**, not a key editor.

## 3. Access model (deny by default)

1. **Configuration.** Both `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` must be non-empty. Until then every
   page and `/api/*` answers **503** with "Panel disabled" — the panel ships disabled by design.
2. **Identity.** Every request must carry a Cloudflare Access JWT (header or `CF_Authorization`
   cookie) signed RS256 by the team's JWKS, with the right `iss`, `aud`, `exp`, `nbf` and `iat`.
   Failures answer the same `401 {"error":"unauthorized"}` and never say which check failed.
   Keys are cached 10 minutes; a down JWKS endpoint fails closed.
3. **Internal token.** The panel reads/creates a random 32-byte token at KV key
   `internal:admin-token` (`ika_…`). It is sent as `Authorization: Bearer` over the binding and never
   reaches the browser. Comparison is constant-time; **no token configured means 401** (fail closed).
   An `ADMIN_INTERNAL_TOKEN` binding, if the owner ever adds one, wins over the KV copy.
4. **Rate limit.** 120 requests/minute per caller key (isolate state), answered `429` with
   `Retry-After`.
5. **No CDN, no inline script.** `default-src 'self'`; the panel is three local files. All data is
   inserted with `textContent`/DOM nodes, never `innerHTML`; conversation text is data, never markup
   and never sent to a model.

`ADMIN_SECRET` is not used by any of this. No secret value was read, printed or set.

## 4. Internal API

All paths below are under `/internal/admin`, authenticated by the token, and audited on mutation
(`admin_audit`: action, target, meta, release, timestamp; never text). Numeric query parameters are
clamped server-side.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `ok`, DB probe, release, logging state, retention, last-hour counts |
| GET | `/overview?hours=` | AI calls by kind/route/provider, success rate, latency, route error rate, conversation count |
| GET | `/errors?hours=&limit=` | failing AI calls, 5xx routes, existing `error_reports` |
| GET | `/alerts` | explainable thresholds (invalid key, >2% route errors, daily quota, timeouts, slow average) |
| GET | `/audit?limit=` | last admin actions |
| GET | `/users?q=&limit=` | users (id, email, plan, expiry, last seen) + totals |
| DELETE | `/users/:id/conversations` | hard-delete one user's conversation text |
| GET | `/content` | row counts for the five content tables + content activity (7 days) |
| GET | `/conversations?hours=&limit=&user=&scenario=&before=` | list with 200-char preview, flag and redaction state |
| GET | `/conversations/:turnId` | one row + its provider attempts |
| DELETE | `/conversations/:turnId` | hard delete one turn |
| POST | `/conversations/:turnId/flag` | `{flagged, note}` — review marking |
| POST | `/export` | `{user_id?, hours?}` JSON download; audited |
| GET | `/retention` | the retention vocabulary the sweep uses |
| POST | `/retention/sweep` | apply the 90/365-day rules now |
| POST | `/providers/state` | `{provider, enabled}` — entry-level enable/disable, reversible |

Every 401 is emitted **before** route matching, so an unauthenticated caller cannot enumerate paths.

## 5. Data model and retention

| Table | Holds | Retention |
|---|---|---|
| `ai_events` | one row per AI route call: route, provider, model, key **id**, outcome, status, latency, fallback flag, scenario, level, `user_id` (if resolvable), release, `turn_id` | 365 days (`EVENT_RETENTION_DAYS`) |
| `route_events` | path, method, status, latency, release — no query string, no body | 365 days |
| `conversations` | optional text row (§7): learner text, reply, hints, corrections, word cards, client context | text scrubbed at 90 days; metrics stay |
| `conversation_attempts` | one row per provider attempt for a stored turn | deleted at 90 days |
| `admin_audit` | admin mutations | 365 days |

Applied at runtime by `ensureTelemetryTables` (idempotent `CREATE TABLE IF NOT EXISTS`) because
production D1 has no `d1_migrations` table. `migrations/0004_admin_telemetry.sql` is the same DDL for
review. No existing table or column is altered.

`key_id` is a stable fingerprint, never a key value. `user_id` is the session subject; Google-ID-token
sessions have no `sess_` token, so their `user_id` is `NULL` — a known limitation, not an error.

## 6. Hot path

- `ctx.waitUntil` everywhere. With no request lifetime the write is **skipped**, not left dangling.
- Nothing reads D1 on the request path. The only KV read is the consent check, and only when the
  master switch is on and a conversation row is about to be built.
- Every telemetry function swallows its own failure; a broken log cannot fail a learner's turn.
- The AI router gained an observer-only `onAttempt` hook. Rotation, cooldown and failover logic are
  unchanged; the attempt collector only listens.
- Unit tests cover the no-DB and no-`ctx` cases; route behaviour is pinned by the existing suites.

## 7. Conversation logging and consent

Two independent gates, both required:

1. **Operator switch** `CONVERSATION_LOGGING` — absent, `off`, `0`, `false` or anything else means
   **metrics only**. This is the default and the state that will ship.
2. **Learner grant** — KV `consent:logging:<user_sub>` must be `1`, `true` or `granted`. An absent
   key, an anonymous request (`user_id` null) or a failed KV read means **no text is stored**.
   Silence is not consent; this is deliberately not an opt-out check.

When both are on: text is redacted at write time (email, phone, URL, long digit runs), capped
(2,000 chars for message/reply), stored with `turn_id` (unique), and scrubbed to `NULL` at 90 days
while the row keeps its metrics. Per-turn and per-user hard delete exist in the admin API.

**Current limitation, stated plainly:** no user-facing consent control exists yet (adding one changes
learner-visible UI, which this batch was not allowed to do). Therefore, even with
`CONVERSATION_LOGGING=on`, **no conversation text will be stored** until a consent grant is written
to that KV key. The metrics half works immediately. This is the conservative reading of "stored only
with consent" and it is why phase 3 is not claimed as complete.

### Exact privacy-policy text (to publish only with a consent control)

Add to `TRUST_CONTENT.privacy.sections` in `src/lib/trust/content.ts`, and bump `TRUST_VERSION`:

```ts
{
  id: 'conversations',
  headingAr: 'المحادثات المحفوظة للمراجعة (بموافقتك)',
  bodyAr:
    'لا نحفظ نص محادثاتك ما لم توافق على ذلك صراحةً. إن وافقت، نحفظ رسالتك وردّ كاتزو لمدة ٩٠ يوماً كحد أقصى، بعد إخفاء البريد الإلكتروني وأرقام الهاتف والروابط، ولمراجعة جودة التعليم فقط. لا نستخدم النص لتدريب أي نموذج، ولا نبيعه، ولا نشاركه لأغراض تسويقية، ويمكنك سحب موافقتك وحذف محادثاتك في أي وقت من الإعدادات.',
},
```

English equivalent, for the owner's review (not shipped):

> We do not store the text of your conversations unless you explicitly agree. If you do, your
> message and Katzu's reply are kept for at most 90 days, with email addresses, phone numbers and
> links masked, and are used only to review teaching quality. The text is never used to train a
> model, sold, or shared for marketing, and you can withdraw consent and delete your conversations
> at any time in Settings.

Do **not** publish this text before the Settings control and the delete action exist. Today's live
privacy page remains true because no conversation text is stored anywhere.

## 8. Inspection findings

- The live admin is a single embedded HTML page in the product Worker behind `ADMIN_SECRET`; it has
  no Access layer, no audit trail and no conversation view. It was left untouched.
- The product Worker already has `D1`, `KV`, AI keys and a scheduled trigger; the panel therefore
  gets none of them, only a Service Binding.
- Production D1 has no `d1_migrations`; the repo's convention is idempotent DDL at runtime. Followed.
- The AI router's key rotation is in-memory and per isolate; a "disable key" that edits provider
  config would not be the same thing as a cooldown. The panel disables a provider **entry** through
  the existing `setDefaultProviderState`, which is reversible and never touches a key value.
- `MAINTENANCE_MODE` would otherwise block admin writes; `/internal/*` is explicitly exempt so the
  owner can inspect during maintenance. The exemption is one `if` and is covered by tests.
- The panel proxy rewrites `/api/*` → `/internal/admin/*`, so the internal route name exists in one
  place in the browser bundle: nowhere.
- No runtime dependency was added. Access JWT verification uses WebCrypto; tests inject the
  certificate fetcher instead of adding a production bypass.

## 9. Decision log (one line each)

- Separate Worker + Service Binding instead of a second hostname on the product Worker — the panel
  must not share the product's bindings.
- Random KV token instead of `ADMIN_SECRET` — no secret value is read, set or rotated by this work.
- Deny-before-route 401 — an unauthenticated caller learns nothing, including which paths exist.
- Access JWT checked in the Worker as well as at the edge — the edge rule is a dashboard setting; the
  code must fail closed if it is ever removed.
- Telemetry writes only in `ctx.waitUntil`; no `ctx` means no write — a dangling query is worse than
  a missing row.
- Runtime idempotent DDL — production has no migration runner; matching `ensureLedgerTables`.
- Conversation text gated by master switch **and** explicit per-account grant — silence is not
  consent.
- Provider "disable" means entry state, not key editing — the panel has no key surface at all.
- Old `/admin` stays live until the new panel is verified and the owner retires it — no big-bang
  removal.
- Deploy stays blocked on a reviewed, pushed tree — the runbook requires it and this work is
  uncommitted.

## 10. Phase appendices — live / rollback

| Phase | Live verification | Rollback |
|---|---|---|
| 1 telemetry | **none** (not deployed) | not needed; tables are additive |
| 2 panel | **none** — `katzu-admin` does not exist in Cloudflare; Access cannot be created with the current token scope | delete the Worker; no product change |
| 3 conversation text | **none**; switch off, no consent UI | drop the two tables or leave them (nothing reads them when off) |
| 4 screens | **none** | same as phase 2 |

When a deploy is authorised, the sequence and the ids to record are in `docs/agent/DEPLOY.md`;
the pre-deploy rollback targets are in `docs/BACKUP.md` §2.

## 11. Verification

```bash
npx vitest run tests/adminTelemetry.test.ts tests/adminApi.test.ts tests/adminAccess.test.ts tests/adminWorker.test.ts
npx wrangler deploy --dry-run --config admin-worker/wrangler.toml
npm run verify -- --ci
```

Last local results are in the ledger (`docs/AGENT-STATE.md`) and the final report. On 2026-10-31 the
full gate printed `VERIFY OK — 13/13 steps passed in 97.5s` on this tree (unit suite 59.8 s, types,
design/contrast, syntax 66 files; browser suite not run — it is a deploy-time requirement). `--dry-run`
was clean the same day: 3 asset files, 9.82 KiB upload, `USER_PROGRESS`, `KATZU_API`, `ASSETS`,
`ACCESS_TEAM_DOMAIN=""`, `ACCESS_AUD=""`.

## 12. OWNER INPUT NEEDED

1. **Deploy permission and a reviewed tree.** Nothing is committed. The runbook needs a clean,
   pushed tree, so the owner must say "commit and deploy" (targets: worker `katzu-test` and the new
   `katzu-admin`). Until then every panel page is UNPROVEN live.
2. **Cloudflare Access application.** Zero Trust → Access → Applications → Add → Self-hosted, host
   `katzu-admin.<subdomain>.workers.dev`, policy = the owner's email. Send back the **team domain**
   and **audience** (both public identifiers) and they go into `admin-worker/wrangler.toml`. The
   current API token has no `access` scope, so this cannot be done by the agent.
3. **Consent control decision.** Either approve a small Settings control (grant/withdraw + delete my
   conversations) and the exact text in §7, or keep conversation text permanently off. Without it,
   phase 3 stores metrics only.
4. **Retention confirmation.** 90 days for text, 365 for counters — confirm or change before the
   policy text is published.
5. **Old panel.** After the new panel is verified, say whether `/admin` and `ADMIN_SECRET` should be
   retired (recommended: yes) or kept as a break-glass door.

## 13. UNPROVEN

- Every panel page and every `/api/*` proxy call: needs a real Access session an agent must not
  create.
- `katzu-admin` deployment: does not exist yet.
- Runtime DDL on production D1: the tables appear on the first internal call; not observed live.
- Conversation text end-to-end: no consent control exists, so it is intentionally inert.
- Cloudflare Access itself: cannot be configured with the current token scope.
