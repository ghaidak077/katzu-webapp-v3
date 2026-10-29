# Owner checklist — what needs you, in plain language

Every item here is an open item in `docs/AGENT-STATE.md` § OWNER-OPEN; each says what "done" looks like,
and `tests/agentDocs.test.ts` keeps the two lists in step. Order matters: 1 and 2 unblock most.

---

## 1. How a learner pays you — the details only you have (V44-1, 2026-10-28)

**What it is.** The pricing page is finished, but no payment method is connected, so a buyer's only route is
one email button.

**What you send.** The Telegram handle orders should go to; the Syriatel Cash number and the MTN Cash number
(and the name on each); the bank name, account holder and IBAN; and which currencies you want to collect.

**Done looks like:** the order section shows the real numbers to pay, not just an email.

---

## 2. Four legal sentences only you can write (V44-2, 2026-10-28)

**What it is.** Privacy, terms and refund are complete, except four facts the law expects and an agent must not
invent: governing law, your legal name and address as publisher, any register number, and where a dispute is
settled.

**What you do.** Say each in a sentence (your lawyer or tax adviser has the register details); the agent adds
them to the terms page.

**Done looks like:** the terms page names your law, your identity and where a complaint goes.

---

## 3. The admin secret, then the content load — V11, V12, V12-1, V18-2

**What it is.** The content is loaded and verified (drift check exit 0). Two leftovers: the admin secret was
once pasted into a chat (rotate it in Cloudflare), and `grammar` lacks `rule_de`, `rule_ar`, `example_ar` —
one additive `ALTER TABLE`.

**What you do.** Worker → Settings → Variables: set a new `ADMIN_SECRET`; then tell the agent to run the three
`ALTER TABLE` lines and re-run `node scripts/check-content-drift.mjs`.

**Done looks like:** the drift check exits 0 and grammar shows on those five scenarios.

---

## 4. Give the AI pool real keys — AI-POOL (2026-10-18)

**What it is.** The default pool is NVIDIA + OpenRouter and both key lists are empty, so every AI turn rides the
free built-in fallback (works, but capped and weaker).

**What you do.** Admin → **AI Providers** → preset or Custom, paste key(s), **Save provider**, **Test**; or
`npx wrangler secret put OPENROUTER_API_KEYS` / `NVIDIA_API_KEYS`.

**Done looks like:** Test answers "OK in a few hundred ms", and a live turn stops naming the fallback model.

---

## 5. One address decision — V18-3

**What it is.** The app's `robots.txt`, `sitemap.xml` and hreflang are generated from one origin; without it
they stay honest but name no host.

**What you do.** Say "use katzuai.com" and the agent sets `VITE_PUBLIC_APP_URL` at build time — or leave it.

**Done looks like:** `https://katzuai.com/sitemap.xml` lists `https://katzuai.com/`.

---

## 6. Real-device voice — the last big unknown — V18-3

**What it is.** Every voice check ran against a simulated microphone, and speaking is the headline feature.

**What you do.** Follow the 14 rows of `docs/agent/OWNER-STEPS.md` § 2 on two real phones (iPhone + Android).

**Done looks like:** each row marked pass or fail, with a note.

---

## 7. Node version — V17-1 (not blocking)

**What it is.** This computer runs Node 24.14.0; the project declares 24.15.0+ — a declaration gap, not a
failure. Run `nvm install 24.15.0 && nvm use 24.15.0` (or `winget upgrade OpenJS.NodeJS.LTS`).

**Done looks like:** `node -v` says 24.15.0 and `npm ci` prints no `EBADENGINE` line.

---

## 8. The partner program works; your first referred learner is the test — AFF-1 (2026-10-28)

**What it is.** The partner ledger, the self-serve link and the day-14 approval run in production:
20% of the first paid order, a 14-day hold, $20 minimum, four payout methods.

**What you do.** (1) **Two-account test** (an agent must not sign in as you): A opens `/partners` and copies
its link; B signs up through it, pays and redeems; A's page and the admin commissions list show one `pending`
row, then tell the agent to delete the test rows. (2) **Pay on Mondays (UTC)**: `GET
/admin/api/affiliates/commissions` lists who is owed at least $20 — send the money, then record it with
`POST /admin/api/affiliates/payout` (`affiliate_id`, `payout_ref`).

**Done looks like:** a real referred learner shows `pending`, and the first payout is recorded as paid.

---

## 9. Be findable — Google, Bing, AI assistants — SEO-1, GEO-1 (2026-10-29)

**What it is.** Twelve Arabic guides, a sitemap, crawler-friendly `robots.txt` and the structured data
an assistant reads are live; what is left is the domain verification and a monthly look.

**What you do.** (1) Verify `katzuai.com` in Google Search Console (one TXT record in Cloudflare), submit both
sitemaps, import into Bing — `docs/agent/GEO-VISIBILITY.md` §5. (2) Read the 12 guides and reply "fine" or the
lines to change (§7). (3) Monthly, ask the same 30 Arabic questions in ChatGPT, Gemini, Perplexity, Claude,
Copilot and Google, and fill one table (§2–§4). (4) Send your real LinkedIn / GitHub / X links for `sameAs` (§8).

**Done looks like:** Search Console says "Success" for both sitemaps, and the month's table has numbers.

---

## Nothing to do — recorded so nobody re-opens them

- **Free lessons are three, once, not three a month — FREE-1, closed 2026-10-28.** `MAX_FREE_AI_SESSIONS = 3`
  counts once per account, ever; every surface says «في المجموع».
- **Content load drift check — V15-3.** Run `node scripts/check-content-drift.mjs` after any content change.
- **Payments stay off for the beta — V18.** `/crypto/health` reading `ready:false` is the correct state, and the
  site hides the crypto block until the gateway is live.
- **`docs/LAUNCH-CHECKLIST.md` § 2 stays untouched.** Those are your items, unchanged.
- **The two Worker settings are already applied.** Emergency stop: `MAINTENANCE_MODE = "on"`; retention runs 04:17 UTC.
- **The `$60` / `KATZU26` price question is closed.** The site sells the four founding prices from one config.
