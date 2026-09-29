# OWNER-STEPS — things only the owner can do

Written 2026-09-29. Nothing in this file was attempted by an agent; §3 puts every item here
out of an agent's reach. Each section is self-contained and finishes with a check that proves
it worked.

Live targets these steps assume:

- worker: `katzu-test` → `https://katzu-test.ghaidakalosh008.workers.dev` (version `255dbeef-…`)
- app: `https://katzu-webapp-v3.pages.dev`
- sales site: `https://katzu-sales.pages.dev`
- D1: `katzu-content` (`a80158e6-a5b4-49c0-b78a-67f390acf71d`)

---

## 1. Cloudflare Access in front of `/admin/*`

**Why.** `/admin` answers **200** to anyone today: it serves the control-plane HTML shell. The
data behind it is gated (every `/admin/api/*` call without the bearer secret is a 401), so this
is defence in depth, not an open door — but a public admin shell is an unnecessary invitation,
and the shell is the one part the bearer gate cannot protect.

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
# Before: 200 with the control-plane HTML shell.
# After:  a redirect to the Cloudflare Access login (302/303), never 200 with admin HTML.
curl -s -m 10 -o /dev/null -w '%{http_code}\n' https://katzu-test.ghaidakalosh008.workers.dev/admin

# The API must still be its own second line of defence: 401, not the Access page.
curl -s -m 10 -w ' [%{http_code}]\n' https://katzu-test.ghaidakalosh008.workers.dev/admin/api/users

# And in a signed-in browser with the bearer secret, the dashboard still loads data.
```

Then update the `3b` risk line in `docs/AGENT-STATE.md` / `docs/agent/PROJECT-BRIEF.md` from
OWNER-OPEN to closed, with the curl output pasted in.

---

## 2. Ten-minute voice test — iOS Safari + Android Chrome

The whole voice path has only ever been exercised against Chromium's fake capture device
(`e2e/harness.ts`) and against a real `AnalyserNode` in the same browser. iOS and Android
implement `getUserMedia`, `MediaRecorder` and the speech recogniser differently, so this is the
largest untested surface in the product. Do it on two real phones, in Arabic RTL, at 360 px.

### Checklist (tick both columns)

| # | Step | iOS Safari | Android Chrome |
|---|---|---|---|
| 1 | Open `https://katzu-webapp-v3.pages.dev`, sign in, reach the Journey Home | ☐ | ☐ |
| 2 | Start an episode → Live Interaction. The mic permission prompt appears **once**, in your language | ☐ | ☐ |
| 3 | **Allow**, then speak one short German sentence. Your own words appear on screen **while you are still speaking**, not after you stop | ☐ | ☐ |
| 4 | Stop speaking. The turn advances on its own within a few seconds (it must not hang) | ☐ | ☐ |
| 5 | Say nothing for ~7 s. The app ends the turn with an honest "no speech" message — it must not sit spinning | ☐ | ☐ |
| 6 | **Retry**: after any failure, the retry affordance works and the previous sentence is still in the composer | ☐ | ☐ |
| 7 | **Deny** the mic on a fresh load (revoke permission in browser settings first). The message is Arabic, names the cause, and the **typed path still works** | ☐ | ☐ |
| 8 | **Offline**: turn on airplane mode mid-episode. Type a reply — it is accepted, kept, and marked as queued; nothing throws; the Arabic text is a sentence, not an error code | ☐ | ☐ |
| 9 | Back online: the queued work flushes without a manual reload | ☐ | ☐ |
| 10 | Layout at **360 px**: no horizontal scrolling, the dock never covers the transcript, every tappable control is ≥44 px | ☐ | ☐ |
| 11 | Arabic RTL: text right-aligned, punctuation on the correct side, no mirrored Latin numerals inside Arabic sentences | ☐ | ☐ |
| 12 | Rotate the device once during Live Interaction; the session survives | ☐ | ☐ |

### Notes

- iOS Safari suspends audio work when the screen locks or you switch apps; note whether the turn
  recovers or must be restarted — that is a real distinction worth recording.
- Android Chrome's speech recogniser may route audio to Google's servers; if a turn fails only
  on one device, capture whether `/ai/transcribe` was called at all (Safari → Develop → the
  page's network, or `chrome://inspect` for Android).
- Record the results in `docs/AGENT-STATE.md` under the real-device item, one line per device.

---

## 3. Beta-cohort feedback template (30–50 learners)

Ask four questions and nothing more — a longer form gets fewer replies.

> **Katzu — first-week feedback**
>
> 1. In your own words, what did Katzu help you do this week? *(one or two sentences)*
> 2. Where did you get stuck or give up? *(name the screen or the moment)*
> 3. Did you ever wonder whether it was working? *(yes/no + what happened)*
> 4. Would you still be using it next week? *(yes / no / only if…)*
>
> Optional: the device and browser you used; a screenshot of anything that looked broken.

**How to run it**

- Send it on **day 7**, not day 1 — the first session is not a habit.
- Ask for the stuck moment *always*; it is the only question whose answers are actionable.
- Watch alongside (same week): `error_reports` count and top `error_type`s in the admin
  dashboard, `/health` `ready`, the free-quota ledger, and whether anyone reaches a second
  session. Feedback and telemetry should agree; where they disagree, trust the telemetry.
- Log findings in `docs/AGENT-STATE.md`, not only in the inbox — an unlogged cohort finding
  cannot be fixed by a later session.

---

## 4. Remaining owner-only items (short list)

| Item | Why it is owner-only | Done when |
|---|---|---|
| **NOWPayments live mode** | Needs the live `NOWPAYMENTS_API_KEY` + `NOWPAYMENTS_IPN_SECRET` and takes real money; §3 forbids secrets and payments work | One sandbox round-trip recorded, then `NOWPAYMENTS_ENVIRONMENT = "live_mode"`, then one real low-value purchase redeemed end to end |
| **Counsel review of the legal pages** | Legal judgement, not code (`/trust/privacy`, `/trust/terms`) | Counsel signs off; add the dated note to the ledger |
| **Custom domain + OAuth origins** | Requires DNS and a Google Cloud console change; a wrong `aud` silently breaks sign-in | Domain attached; `GOOGLE_CLIENT_ID` and `ALLOWED_ORIGINS` updated in `wrangler.toml`; signed in successfully from the new origin |
| **Content load (two files, `--commit`)** | Needs `ADMIN_SECRET` (see OWNER-OPEN in `docs/AGENT-STATE.md`) | module1 approved first; the exact commands and expected counts are in `docs/agent/CONTENT-LOAD.md`; counts before/after recorded |
| **`MAINTENANCE_MODE` = `"on"` during a deploy** | The emergency stop is an operator action | Only if a deploy goes wrong; verify `/health` reports `maintenance: true` |
