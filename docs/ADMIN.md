# Admin panel and telemetry — inspection report (2026-10-31)

Status: **deployed 2026-10-31 and verified live.** The product Worker
`katzu-test` runs version `6a6db52d-a581-45b1-94c7-ef5b5e9983ea`; the panel Worker `katzu-admin`
runs version `e7716e26-f3b4-478e-8097-106481a3369e` (deployment `02:11:40Z`) behind Cloudflare
Access. The owner's own signed-in session exercised the panel at 02:45–02:46 UTC: 26 authenticated
`/internal/admin/*` GETs all answered **200**. The `17 4 * * *` scheduled handler was captured live at
**04:17:37 UTC**: `[sweep]`, `[sweep:telemetry]` and `[affiliate]` all logged with `outcome: ok`, so
both the cron and the retention sweep are proven. The five telemetry tables were created by the first
authenticated panel read. The rollback and backup record is `docs/BACKUP.md`.

## 1. What this adds

| Phase | What | Local state | Live state |
|---|---|---|---|
| 1 | Telemetry: `ai_events`, `route_events`, redaction, retention sweep | code + 29 tests | **deployed** — five tables exist; 26 `route_events` rows from the owner's panel session |
| 2 | Separate panel Worker `katzu-admin`, Access gate, Service-Binding proxy | code + 26 tests (12 access, 14 panel) | **deployed** — Access intercepts `/`, `/api/*` and `/healthz` with a 302 to the team login; `kid` matches `ACCESS_AUD` |
| 3 | Conversation logging: `conversations`, `conversation_attempts`, consent, 90-day scrub | code + tests, master switch **off** | **deployed but inert** — no consent UI, and **stores no text even when the switch is on** until a learner grants consent (§7) |
| 4 | Users, content, alerts, errors, audit, export, delete screens | code + tests | **deployed** — the owner's session loaded health, overview, users, content, conversations, errors and alerts |

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
   page and `/api/*` answers **503** with "Panel disabled" — the panel ships disabled by design. Both
   are set on `katzu-admin` (`ghaidakalosh008.cloudflareaccess.com` and `8374079e…`), and Cloudflare
   Access is enabled for **All traffic** on the Worker. An unauthenticated request now gets a **302**
   to the team login with `kid=8374079e…`; the Worker never sees it. `/healthz` is also behind Access,
   so it is no longer a public liveness probe (a bypass policy would be the owner's choice).
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

- The old embedded HTML page behind `ADMIN_SECRET` is still live and untouched; it has no Access
  layer, no audit trail and no conversation view. The new panel is the separate Worker above. Both
  exist until the owner retires the old one.
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
- The panel shipped through the normal deploy runbook (reviewed tree, full `--ci --e2e` gate,
  version and rollback recorded) — not as an ad-hoc upload.

## 10. Phase appendices — live / rollback

| Phase | Live verification | Rollback |
|---|---|---|
| 1 telemetry | **proven** — five tables in production D1; `route_events` has 26 authenticated `200` rows (02:45:38–02:46:11 UTC); the cron fired at **04:17:37 UTC** and logged `[sweep]` + `[sweep:telemetry]` with `outcome: ok` (`rate_limit_counters` 7, all telemetry counters 0 because the tables were empty) | not needed; tables are additive |
| 2 panel | **proven** — `katzu-admin` `e7716e26`; unauthenticated `/` and `/api/overview` **302** to Access with matching `kid`; owner session loaded the panel and its APIs | rollback `bc7db8cc-5b4a-4a33-83b8-850e9f4c5b16` (deployment `3692c953-321d-4732-b883-cb9258cf0719`) or delete the Worker |
| 3 conversation text | **live but inert** — switch off, no consent UI, no text rows | drop the two tables or leave them (nothing reads them when off) |
| 4 screens | **proven** for reads the owner made (health, overview, users, content, conversations, errors, alerts, audit) | same as phase 2 |

When a deploy is authorised, the sequence and the ids to record are in `docs/agent/DEPLOY.md`;
the pre-deploy rollback targets are in `docs/BACKUP.md` §2.

## 11. Verification

```bash
npx vitest run tests/adminTelemetry.test.ts tests/adminApi.test.ts tests/adminAccess.test.ts tests/adminWorker.test.ts
npx wrangler deploy --dry-run --config admin-worker/wrangler.toml
npm run verify -- --ci
```

On 2026-10-31 the pre-deploy gate printed `VERIFY OK — 14/14 steps passed in 759.6s` with
`--ci --e2e` (the browser suite ran against the built bundle; exit 0). The focused admin suites were
re-run after the deploy: `npx vitest run tests/adminAccess.test.ts tests/adminWorker.test.ts` →
**26 passed**. The production probe is the decisive one: `/` and `/api/overview` both answer **302**
to `https://ghaidakalosh008.cloudflareaccess.com/cdn-cgi/access/login/…?kid=8374079e…`, and the
login page and team JWKS are reachable. `wrangler deploy` printed version
`e7716e26-f3b4-478e-8097-106481a3369e` with `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` bound.

## 12. OWNER INPUT NEEDED

> **Decided by the owner on 2026-10-31:** retention is **90 days for text, 365 for counters**;
> **conversation text stays off** (no consent UI); the **old `/admin` + `ADMIN_SECRET` stay live** until
> the new panel is confirmed with real traffic. Nothing below is blocking; items 1–3 are recorded
> decisions, item 4 is still optional.

1. **Consent control — decided: none for now.** Text stays off: the master switch is unset and no
   per-account consent grant exists. Re-open only if the owner wants the feature.
2. **Retention — confirmed:** 90 days for conversation text, 365 for counters. This is what the sweep
   implements; the policy text in §7 already states it.
3. **Old panel — decided: keep both.** `/admin` and `ADMIN_SECRET` remain until the owner confirms the
   new panel with real traffic; nothing is to be retired yet.
4. **Optional liveness bypass.** Access currently covers `/healthz` too, so external monitoring
   cannot probe it without a signed token. If you want a public health endpoint, create one Access
   bypass policy for `/healthz`; that is a dashboard decision, not a code change.

## 13. UNPROVEN

- **The 04:17 UTC scheduled handler is now proven, but its telemetry branches had nothing to do.**
  A live `wrangler tail` captured the invocation at 04:17:37 UTC: `outcome: ok`, cron `17 4 * * *`,
  `[sweep] {"rate_limit_counters":7,"error_reports":0}`, `[sweep:telemetry] {"conversations_scrubbed":0,
  "conversation_attempts":0,"ai_events":0,"route_events":0}` and `[affiliate] {"approved":0}`. The
  sweep wrote no telemetry row (all tables were empty), so what is proven is that the handler runs and
  the sweep executes; the redaction/scrub branches still need rows to act on.
- **`ai_events` has 0 rows** because no AI call has occurred since the table was created. The writer
  is unit-tested; the first real AI turn is what proves it in production. Same for `route_events` —
  its 26 rows are all from the owner's panel session, none from learner traffic.
- **Conversation text end-to-end remains inert:** no consent control exists, so no text can be
  stored. This is deliberate, not a missing test.
- **The agent did not sign in as the owner.** The owner's session is proven only by its own
  telemetry (26 authenticated 200s) and by the Access redirect; an agent must not drive that session.
- **`/healthz` is no longer publicly probeable** (Access 302); a bypass would be an owner-created
  Access policy.
