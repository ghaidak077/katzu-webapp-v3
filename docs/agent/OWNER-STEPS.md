# OWNER-STEPS — things only the owner can do

Written 2026-09-28, refreshed **2026-09-29 (V18)**. Nothing in this file was attempted by an
agent; §3 of `AGENTS.md` puts every item here out of an agent's reach. Each section finishes
with a check that proves it worked.

**Live targets** (recorded in V18 — treat the ids as the rollback map):

| Asset | Id |
| --- | --- |
| Worker `katzu-test` | `https://katzu-test.ghaidakalosh008.workers.dev` — live version **`03007d6e-a379-4e60-9350-1319cc087954` (#111)**, previous **`2a6fd74c-2735-4eb2-84a3-d751e9ace61f` (#110)** |
| App (Pages) | `https://katzu-webapp-v3.pages.dev` — production deployment **`9c23ec00-0878-4dcb-9649-425396f4a4f0`** (`c7ab71b`); `01ba79c3-…` (`616e273`) and `3bead164-…` (`1c3b885`) behind it |
| Sales site | `https://katzu-sales.pages.dev` (Pages project `katzu-sales`) |
| Database | D1 `katzu-content` (`a80158e6-a5b4-49c0-b78a-67f390acf71d`) — 15 scenarios / 221 vocabulary / 111 phrases / 22 grammar |

**If you only do three things before the beta starts:** rotate `ADMIN_SECRET` (§6), decide the
URL you will hand out (§6 — `katzu.app` does not resolve today), and run the two-phone voice
check (§2).

---

## 1. Cloudflare Access in front of `/admin/*`

**Why.** `/admin` still answers **200** to anyone (re-checked in V18): it serves the
control-plane HTML shell. The data behind it is gated — every `/admin/api/*` call without the
bearer secret is a **401** — so this is defence in depth, not an open door, but a public admin
shell is an unnecessary invitation and the shell is the one part the bearer gate cannot protect.

**Do not weaken the worker's own gate while doing this.** `isAdminAuthorized` (bearer secret +
per-IP failure throttle) stays exactly as it is. Access is a second lock on the same door.

### Steps

1. Cloudflare dashboard → **Zero Trust** → **Access** → **Applications** → **Add an application**
   → **Self-hosted**.
2. Fill in:
   - **Application name**: `Katzu admin`
   - **Session duration**: `24 hours` (or shorter)
   - **Public hostname**: subdomain `katzu-test`, domain `ghaidakalosh008.workers.dev`,
     path `admin` — then add a second path entry `admin/*` so both the shell and the API sit
     behind it. (If the dashboard offers only one path field, use `admin` and add the wildcard
     as a second application; Access path matching is exact unless you include the `*`.)
3. **Identity provider**: if none exists yet, add **One-time PIN** first — it needs no external
   account and mails a code to an allowed address. Google is optional and can be added later.
4. **Policy**: `Name: owner`, `Action: Allow`, `Include` → **Emails** → your own address
   (`ghaidakalosh008@gmail.com`). Add a second policy with `Action: Block` and `Include` →
   **Everyone** if you want the default to be closed rather than open-to-nobody.
5. Save. Access sets its own cookies; the worker's CORS allowlist is unaffected because the
   dashboard calls the same origin.

### Verify (this is the check that closes the risk)

```bash
# Before: 200 with the control-plane HTML shell. After: a redirect to the Access
# login (302/303) — never 200 with admin HTML.
curl -s -m 10 -o /dev/null -w '%{http_code}\n' https://katzu-test.ghaidakalosh008.workers.dev/admin

# The API must still be its own second line of defence: 401, not the Access page.
curl -s -m 10 -w ' [%{http_code}]\n' https://katzu-test.ghaidakalosh008.workers.dev/admin/api/users

# And in a signed-in browser with the bearer secret, the dashboard still loads data.
```

---

## 2. Ten-minute voice test — iOS Safari + Android Chrome

The whole voice path has only ever been exercised against Chromium's fake capture device
(`e2e/harness.ts`), so this is the largest untested surface in the product. Do it on two real
phones, in Arabic RTL, at 360 px. (A partial 10-row version of this checklist, written in V9,
was folded in here in V18; `docs/agent/BETA-KIT.md` §3 turns it into a beta task.)

### Checklist (tick both columns)

| # | Step | iOS Safari | Android Chrome |
|---|---|---|---|
| 1 | Open `https://katzu-webapp-v3.pages.dev`, sign in, reach the Journey Home | ☐ | ☐ |
| 2 | Start an episode → Live Interaction. The mic permission prompt appears **once**, in your language | ☐ | ☐ |
| 3 | **Allow**, then speak one short German sentence. Your own words appear on screen **while you are still speaking**, not after you stop | ☐ | ☐ |
| 4 | Stop speaking. The turn advances on its own within a few seconds (it must not hang) | ☐ | ☐ |
| 5 | Say nothing for ~7 s. The app ends the turn with an honest "no speech" message — it must not sit spinning | ☐ | ☐ |
| 6 | **Retry**: after any failure, the retry affordance works and the previous sentence is still in the composer | ☐ | ☐ |
| 7 | **Deny** the mic on a fresh load (revoke permission in browser settings first). The message is Arabic (`الإدخال الصوتي غير متاح — اكتب بالألمانية`), names the cause, and the **typed path still works** | ☐ | ☐ |
| 8 | **Offline**: turn on airplane mode mid-episode. Type a reply — it is accepted, kept, and marked as queued; nothing throws; the Arabic text is a sentence, not an error code | ☐ | ☐ |
| 9 | Back online: the queued work flushes without a manual reload | ☐ | ☐ |
| 10 | Layout at **360 px**: no horizontal scrolling, the dock never covers the transcript, every tappable control is ≥44 px | ☐ | ☐ |
| 11 | Arabic RTL: text right-aligned, punctuation on the correct side, no mirrored Latin numerals inside Arabic sentences | ☐ | ☐ |
| 12 | Rotate the device once during Live Interaction; the session survives | ☐ | ☐ |
| 13 | Add to Home Screen, open from the icon in airplane mode: the shell still loads | ☐ | ☐ |
| 14 | After a 401 (sign out in another tab, then send a turn): the Arabic "session ended" message appears and the sentence is preserved | ☐ | ☐ |

### Notes

- iOS Safari suspends audio work when the screen locks or you switch apps; note whether the turn
  recovers or must be restarted — that is a real distinction worth recording.
- Android Chrome's speech recogniser may route audio to Google's servers; if a turn fails only
  on one device, capture whether `/ai/transcribe` was called at all (Safari → Develop → the
  page's network, or `chrome://inspect` for Android).
- Record the results in `docs/AGENT-STATE.md` under the real-device item, one line per device.

---

## 3. Activation codes — generating and handing them out

The free beta still needs a *code* path so a learner can be given Pro (or a replacement month)
without any payment. Codes are HMAC-signed, **single-use**, and never minted by an agent.

**Generate (dashboard — preferred):** open `/admin` in a browser, paste the bearer secret into
the dashboard's prompt, go to **Licenses & Plans → generate activation codes**, choose
`months` (1–12), copy the code. The dashboard calls `POST /admin/generate`
(`cloudflare-admin.js:1860`), which is the same generator the crypto path uses.

**Generate (curl, only from your own shell — never paste the secret into a chat or an agent
prompt):**

```bash
curl -s -X POST https://katzu-test.ghaidakalosh008.workers.dev/admin/generate \
  -H "Authorization: Bearer $ADMIN_SECRET" -H 'content-type: application/json' \
  -d '{"months":1}'
# → {"code":"DE-1M-XXXXXXXX-<signature>"}
```

**What a code is, so you can explain it:** `DE-<months>M-<nonce>-<HMAC>`. Redeeming it adds
`months` to **that account's** expiry; the exact moment of redemption is recorded in
`redeemed_codes_ledger`, whose primary key is the code itself — so a code cannot be spent twice,
by the same learner or by anyone else, and replaying it never extends Pro. All of that is
proved against a real local D1 in `docs/agent/LAUNCH-STATUS.md` §3 (15/15 checks).

**Handout rules for a 30–50 learner cohort**

- One code per learner. Send it privately (WhatsApp/Telegram DM), never in a group.
- The learner redeems in the app: **sign in → Subscription → "I already have a code"**.
- Keep the sheet in `docs/agent/BETA-KIT.md` §2 filled in: learner ref, code handed, date,
  device, whether it redeemed, first-session date.
- A code that is lost before redemption is fine — mint another. A code that was redeemed and
  lost is not a problem either: the learner already has Pro on that account.
- Do not invent codes by hand or edit the ledger; the signature is what makes a code valid.

**Check redemptions (read-only):**

```bash
npx wrangler d1 execute katzu-content --remote --command \
  "SELECT code, account_id, months, redeemed_at FROM redeemed_codes_ledger ORDER BY redeemed_at DESC LIMIT 10;"
```

**When a learner says "my code doesn't work", the app's own Arabic reason names the cause:**
`invalid_signature` = the code was typed/copied incompletely (send it again as one line, no
spaces); `already_redeemed` = it was used before (check the ledger); `malformed` = extra text
was pasted around the code; `missing_id_token` = they are not signed in.

---

## 4. Daily 5-minute health check

Run this once a day while the cohort is active (all read-only, all safe):

```bash
# 1. The worker is alive and the kill switch is where you left it.
curl -s https://katzu-test.ghaidakalosh008.workers.dev/health
#    expect: {"status":"healthy","service":"Katzu Unified Worker","ready":true,"maintenance":false}
#    ready:false → the AI pool is unusable (missing/exhausted keys) and learners see failures.

# 2. The app is serving and the service worker is intact.
curl -s -o /dev/null -w '%{http_code} ' https://katzu-webapp-v3.pages.dev/ ; curl -s -o /dev/null -w '%{http_code}\n' https://katzu-webapp-v3.pages.dev/sw.js
#    expect: 200 200

# 3. Payments are still off, on purpose.
curl -s https://katzu-test.ghaidakalosh008.workers.dev/crypto/health
#    expect: "ready":false  (anything else means a key appeared — decide whether that was you)

# 4. Production still agrees with the approved content.
node scripts/check-content-drift.mjs
#    expect: exit 0, "0 absent", "0 pending", "0 duplicate key(s)"

# 5. The error feed, newest first (client crashes, server 5xx, webhook failures).
npx wrangler d1 execute katzu-content --remote --command \
  "SELECT error_type, COUNT(*) AS n FROM error_reports WHERE created_at > datetime('now','-1 day') GROUP BY error_type ORDER BY n DESC;"
#    expect: empty or a handful of client_* rows. A cluster of server_error rows is a bug, not noise.

# 6. Redemptions and (if you are handing codes out) who is paying attention.
npx wrangler d1 execute katzu-content --remote --command \
  "SELECT COUNT(*) AS redeemed FROM redeemed_codes_ledger;"
```

Record the date and the six results in one line in `docs/AGENT-STATE.md` (or in the cohort
sheet in `docs/agent/BETA-KIT.md`). Two days of `ready:false`, or any `server_error` cluster,
is worth stopping and fixing before the next handout.

---

## 5. What to do if X breaks

| Symptom | First action (safe, reversible) | Then |
| --- | --- | --- |
| A worker deploy broke something | `npx wrangler rollback 2a6fd74c-2735-4eb2-84a3-d751e9ace61f` (the version before the live one), then `curl …/health` | Re-deploy only after the tree is fixed; the schema changes so far are additive, so the older worker runs fine against the same D1 |
| The app (Pages) shipped a bad bundle | Pages project → **Deployments** → pick `9c23ec00-…`/`01ba79c3-…` → *Rollback* | Clients keep the newer service worker until their next visit; nothing needs purging |
| You need learners to stop writing **right now** | `MAINTENANCE_MODE = "on"` in `wrangler.toml`, `npm run deploy:worker` | Every learner write answers **503** with an Arabic message and a `Retry-After`; reads and `/admin/*` keep working. Set it back to `"off"` and redeploy to resume |
| AI turns fail for everyone | `curl …/health` — `ready:false` means the key pool is unusable | Check the admin health view for an exhausted day-quota or a disabled key; add/replace a key, or raise `AI_RATE_LIMIT_PER_DAY` and redeploy |
| A learner hit the free quota and thinks the app broke | Nothing is broken; they saw `انتهت الجلسات المجانية` | Mint them a code (§3) if they are in the beta, or point them at the Pro screen's "I already have a code" |
| `ADMIN_SECRET` may have leaked | `npx wrangler secret put ADMIN_SECRET` with a new value | Confirm `/admin/api/users` is still **401** anonymously and the dashboard works with the new value. This is the one item **still open from V10** |
| Content looks wrong or a scenario has no grammar rule | `node scripts/check-content-drift.mjs` (exit 0 = production matches the drafts) | If a row is `absent`, load the approved draft (`docs/agent/CONTENT-LOAD.md`); if a *grammar* row exists but no scenario points at it, that is an agent code change (`SCENARIO_GRAMMAR_IDS`) |
| A D1 query or load goes wrong | **Export first**: `npx wrangler d1 export katzu-content --remote --output backup-<date>.sql` | Content loads are insert-only and key-addressed, so a bad load is fixed by loading a corrected file; deleting rows is a last resort and needs the export in hand |
| Payments accidentally become live | Remove `NOWPAYMENTS_API_KEY` / `NOWPAYMENTS_IPN_SECRET` (`npx wrangler secret delete …`) and set `NOWPAYMENTS_ENVIRONMENT = "test_mode"` | `/crypto/health` must read `ready:false` again; the app has no checkout UI, so nothing can charge while the keys are absent |
| A learner cannot sign in | Check `ALLOWED_ORIGINS` still lists the URL they use, and that the custom domain (if any) was added to Google OAuth origins | Their `aud` mismatch returns `invalid_id_token` (200, not a crash) — see §6 |
| Legal/privacy request (delete account, export data) | The learner can do both in-app: Settings → export / delete account | If the app is unreachable, deletion requires the app because it authenticates with the learner's own token |

---

## 6. Remaining owner-only items (short list)

| Item | Why it is owner-only | Done when |
| --- | --- | --- |
| **Rotate `ADMIN_SECRET`** | The value pasted into a V10 chat is still live; §3 forbids an agent handling secrets | `npx wrangler secret put ADMIN_SECRET` run, the dashboard works with the new value, and `/admin/api/users` is still 401 anonymously |
| **Decide the URL the cohort uses** | `robots.txt`/`sitemap.xml` advertise `https://katzu.app/`, which does not resolve; attaching a domain needs your DNS and a Google OAuth origin update | Either attach `katzu.app` to the Pages project (then update `ALLOWED_ORIGINS` + `VITE_PUBLIC_APP_URL`), or accept `katzu-webapp-v3.pages.dev` for the closed beta |
| **Cloudflare Access on `/admin/*`** | Zero Trust is your account | §1's curl check shows a redirect instead of a 200 for the shell |
| **NOWPayments live mode** | Needs live secrets and takes real money | One sandbox round-trip recorded, then `NOWPAYMENTS_ENVIRONMENT = "live_mode"`, then one real low-value purchase redeemed end to end. **Not needed for a free beta** |
| **Counsel review of the legal pages** | Legal judgement, not code (`/trust/privacy`, `/trust/terms`, `/trust/imprint`, `/trust/refund`) | Counsel signs off; add the dated note to the ledger |
| **Custom domain + OAuth origins** | DNS + Google Cloud console; a wrong `aud` silently breaks sign-in | Domain attached; `GOOGLE_CLIENT_ID` and `ALLOWED_ORIGINS` updated in `wrangler.toml`; sign-in succeeds from the new origin |
| **Android `serverClientId` decision** | Only you know which OAuth client the Android build uses | Android signs in with this web client ID (or the `GOOGLE_CLIENT_ID` line is removed from `wrangler.toml`) |
| **Play Store submission items** | Store account and keystore | Keystore SHA-1 registered; short title ≤ 30 chars; Data Safety form mirrors the privacy page |
| **`MAINTENANCE_MODE` during a deploys** | Operator action | Only if a deploy goes wrong; `/health` then reports `maintenance:true` |
| **Real-device voice (§2)** | Needs two real phones | Both columns ticked, results logged in `docs/AGENT-STATE.md` |
