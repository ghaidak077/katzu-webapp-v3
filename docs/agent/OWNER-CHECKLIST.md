# Owner checklist — what needs you, in plain language

Each item is in `docs/AGENT-STATE.md` § OWNER-OPEN, says what "done" looks like, and a test keeps lists
in step.

## 1. How a learner pays you — the details only you have (V44-1, 2026-10-28)

**What it is.** The pricing page is finished, but no payment method is connected, so a buyer can only email.

**What you send.** Telegram handle for orders; Syriatel Cash and MTN Cash numbers (and name on each); bank
name, account holder and IBAN; and the currencies to collect.

**Done looks like:** the order section shows the real numbers, not just an email.

## 2. Four legal sentences only you can write (V44-2, 2026-10-28)

**What it is.** Privacy, terms and refund are complete, except four facts an agent must not invent: governing
law, your legal name and address, any register number, and where a dispute is settled.

**What you do.** Say each in a sentence; the agent adds them to the terms page.

**Done looks like:** the terms page names your law, your identity and where a complaint goes.

## 3. The admin secret, then the content load — V11, V12, V12-1, V18-2

**What it is.** Content is loaded and verified (drift exit 0). Two leftovers: rotate `ADMIN_SECRET` (once
pasted into chat); `grammar` lacks `rule_de`, `rule_ar`, `example_ar` — one additive `ALTER TABLE`.

**What you do.** Worker → Settings → Variables: set a new `ADMIN_SECRET`; then have the agent run the three
`ALTER TABLE` lines and `node scripts/check-content-drift.mjs`.

**Done looks like:** the drift check exits 0 and grammar shows on those five scenarios.

## 4. Give the AI pool real keys — AI-POOL (2026-10-18)

**What it is.** NVIDIA + OpenRouter are the default pool and both key lists are empty, so every AI turn rides
the free built-in fallback (works, capped, weaker).

**What you do.** Admin → **AI Providers** → preset or Custom, paste key(s), **Save provider**, **Test**; or
`npx wrangler secret put OPENROUTER_API_KEYS` / `NVIDIA_API_KEYS`.

**Done looks like:** Test answers "OK in a few hundred ms", and a live turn stops naming the fallback model.

## 5. One address decision — V18-3

**What it is.** `robots.txt`, `sitemap.xml` and hreflang come from one origin; without it they name no host.

**What you do.** Say "use katzuai.com" and the agent sets `VITE_PUBLIC_APP_URL` at build time.

**Done looks like:** `https://katzuai.com/sitemap.xml` lists `https://katzuai.com/`.

## 6. Real-device voice — the last big unknown — V18-3

**What it is.** All voice checks ran against a simulated microphone; speaking is the headline feature.

**What you do.** Follow `docs/agent/OWNER-STEPS.md` § 2 (14 rows) on two real phones (iPhone + Android).

**Done looks like:** each row marked pass or fail, with a note.

## 7. Node version — V17-1 (not blocking)

This machine runs Node 24.14.0; the project declares 24.15.0+. Run `nvm install 24.15.0 && nvm use 24.15.0`
(or `winget upgrade OpenJS.NodeJS.LTS`); done when `npm ci` prints no `EBADENGINE` line.

## 8. The partner program works; your first referred learner is the test — AFF-1 (2026-10-28)

**What it is.** The partner ledger, self-serve link and day-14 approval are live: 20% of the first paid order,
14-day hold, $20 minimum, four payout methods.

**What you do.** (1) **Two-account test** (an agent must not sign in as you): A copies its `/partners` link;
B signs up through it, pays and redeems; A's page and the admin list show one `pending` row, then tell the
agent to delete it. (2) **Mondays (UTC):** `GET /admin/api/affiliates/commissions` lists who is owed at
least $20 — pay, then record it with `POST /admin/api/affiliates/payout`.

**Done looks like:** a real referred learner shows `pending`, and the first payout is recorded as paid.

## 9. Be findable — Google, Bing, AI assistants — SEO-1, GEO-1 (2026-10-29)

**What it is.** Twelve Arabic guides, a sitemap, crawler-friendly `robots.txt` and structured data are live;
what is left is domain verification and a monthly look.

**What you do.** (1) Verify `katzuai.com` in Google Search Console (one TXT record), submit both sitemaps and
import into Bing — `docs/agent/GEO-VISIBILITY.md` §5. (2) Read the 12 guides and reply "fine" or changes
(§7). (3) Monthly, ask 30 Arabic questions across six assistants and fill one table (§2–§4). (4) Send your
LinkedIn / GitHub / X links (§8).

**Done looks like:** Search Console says "Success" for both sitemaps, and the month's table has numbers.

## 10. The admin panel is live — decided 2026-10-31, nothing for you to do — V46-1

**What it is.** The separate locked admin site sits behind Cloudflare Access and cannot touch the database or
a key. Your signed-in session already loaded it: 26 panel requests, all successful, five telemetry tables.

**Your decisions, recorded.** Conversation text stays **off**; retention is **90 days for text, 365 for
counters**; the old `/admin` and `ADMIN_SECRET` stay until you confirm the new panel with real traffic.

**Done looks like:** a real learner turn appears in the panel, and you say whether to retire `/admin`.

## 11. Type «hallo» in one scene — the last live check — V45 (2026-10-31)

The greeting fix is live, but the reply only appears inside a signed-in lesson, so I could not see it.
Sign in at `https://katzuai.com`, open **Am Flughafen** (A1), type `hallo`, and check the partner asks about
your luggage («Fehlt Ihr Gepäck?»), not «Wie geht es Ihnen?». **Done:** that question appears — or send what
you saw. Record: `docs/AGENT-STATE.md` UNPROVEN V45.

## Nothing to do — recorded so nobody re-opens them

- **Free lessons are three, once, not three a month — FREE-1, closed 2026-10-28.** `MAX_FREE_AI_SESSIONS = 3`
  counts once per account; every surface says «في المجموع».
- **Content-load drift check — V15-3.** Run `node scripts/check-content-drift.mjs` after any content change.
- **Payments stay off for the beta — V18.** `/crypto/health` `ready:false` is correct.
- **`docs/LAUNCH-CHECKLIST.md` § 2 stays untouched.** Those are your items, unchanged.
- **The two Worker settings are applied.** Emergency stop: `MAINTENANCE_MODE = "on"`; retention runs 04:17 UTC.
