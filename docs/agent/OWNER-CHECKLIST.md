# Owner checklist — what needs you, in plain language

Every item here is an open item in `docs/AGENT-STATE.md` § OWNER-OPEN (the detailed record); each says what
"done" looks like. `tests/agentDocs.test.ts` keeps the two lists in step. Order matters: 1 and 2 unblock most.

---

## 1. How a learner pays you — the details only you have (V44-1, 2026-10-28)

**What it is.** The pricing page is finished and honest, but no payment method is connected yet, so a buyer's
only route is one email button.

**What you send.** The Telegram handle orders should go to; the Syriatel Cash number and the MTN Cash number
(and the name on each); the bank name, account holder and IBAN; and which currencies you want to collect.

**Done looks like:** the order section of the pricing page shows the real numbers to pay, not just an email.

---

## 2. Four legal sentences only you can write (V44-2, 2026-10-28)

**What it is.** Privacy, terms and refund are complete, except four facts the law expects and an agent must not
invent: governing law, your legal name and address as publisher, any register number, and where a dispute is
settled.

**What you do.** Say each one in a sentence (your lawyer or tax adviser has the register details). The agent
adds them to the terms page.

**Done looks like:** the terms page names your law, your identity and where a complaint goes.

---

## 3. The admin secret, then the content load — V11, V12, V12-1, V18-2

**What it is.** The content is already fully loaded and verified (drift check exit 0). Two leftovers: the admin
secret was once pasted into a chat, so rotate it when you next open Cloudflare, and the `grammar` table still
lacks three columns (`rule_de`, `rule_ar`, `example_ar`) — one additive `ALTER TABLE`, nothing deleted.

**What you do.** Worker → Settings → Variables: set a new `ADMIN_SECRET`; then tell the agent to run the three
`ALTER TABLE` lines and re-run `node scripts/check-content-drift.mjs`.

**Done looks like:** the drift check exits 0 and grammar shows on those five scenarios.

---

## 4. Give the AI pool real keys — AI-POOL (2026-10-18)

**What it is.** The default pool is NVIDIA + OpenRouter and both key lists are empty, so every AI turn rides the
free built-in fallback (works, but capped and weaker).

**What you do.** Admin dashboard → **AI Providers** → pick a preset or Custom, paste key(s), **Save provider**,
**Test**. Or `npx wrangler secret put OPENROUTER_API_KEYS` / `NVIDIA_API_KEYS` with comma-separated lists.

**Done looks like:** Test answers "OK in a few hundred ms", and a live turn stops naming the fallback model.

---

## 5. One address decision — V18-3

**What it is.** The app's generated `robots.txt`, `sitemap.xml` and share image are relative; crawlers want
absolute URLs.

**What you do.** Say "use katzuai.com" and the agent sets `VITE_PUBLIC_APP_URL` at build time — or leave it and
revisit before a public launch.

**Done looks like:** the app's sitemap lists absolute `https://katzuai.com/...` URLs.

---

## 6. Real-device voice — the last big unknown — V18-3

**What it is.** Every voice check so far ran against a simulated microphone, and speaking is the headline feature.

**What you do.** Follow the 14-row checklist in `docs/agent/OWNER-STEPS.md` § 2 on two real phones (one iPhone,
one Android).

**Done looks like:** each row marked pass or fail, with a note for any fail.

---

## 7. Update this machine's Node — V17-1 (not blocking)

**What it is.** This computer runs Node 24.14.0; the project declares 24.15.0 or newer. Everything passes — it is
a declaration gap, not a failure.

**What you do.** `nvm install 24.15.0 && nvm use 24.15.0` (or `winget upgrade OpenJS.NodeJS.LTS`).

**Done looks like:** `node -v` says 24.15.0 and `npm ci` prints no `EBADENGINE` line.

---

## 8. The partner program needs your payout desk and one deploy — AFF-1 (2026-10-28)

**What it is.** `/affiliate` is live: 20% of the first paid order, a 14-day hold, $20 minimum, payouts by USDT,
Syriatel/MTN Cash, bank or Wise. Its button opens `/partners` for the learner's own link.

**What you do.**
1. **Say yes to deploying the worker.** The page that creates those links is written and tested but not live:
   this run covered the site and the app only. Until it ships, `/partners` shows «تعذّر إنشاء رابطك الآن» and a
   retry button. One word — "deploy the worker" — ships it.
2. **Pay on Mondays (UTC).** `GET /admin/api/affiliates/commissions` lists who is owed at least $20 in
   `payout.batches`; send the money, then record it with `POST /admin/api/affiliates/payout` (`affiliate_id`,
   `payout_ref`). Smaller balances stay in `carried`. Tell the agent if you want another payout day or minimum.

**Done looks like:** `/partners` shows a link on your own account, one referred learner has a pending commission,
and the first payout is marked paid with its reference.

---

## 9. Three free lessons a month, or three in total? — FREE-1

**What it is.** The app gives every account three free AI conversations **in total**, not three a month.

**What you decide.** The home page and help page now say the true thing, but the page summary, the last button,
the pricing page and the paywall still say «كل شهر». Either we build the monthly reset, or the word «شهر» goes
from those four places.

**Done looks like:** one sentence about the free allowance everywhere — and it is the number the server enforces.

---

## Nothing to do — recorded so nobody re-opens them

- **Content load drift check — V15-3.** Run `node scripts/check-content-drift.mjs` after any content change.
- **Payments stay off for the beta — V18.** `/crypto/health` reading `ready:false` is the correct state, and the
  site hides the crypto block until the gateway is live.
- **`docs/LAUNCH-CHECKLIST.md` § 2 stays untouched.** Those are your items, unchanged.
- **The two Worker settings are already applied.** Emergency stop: `MAINTENANCE_MODE = "on"`; retention runs 04:17 UTC.
- **The `$60` / `KATZU26` price question is closed.** The site sells the four founding prices from one config, and
  no coupon code is advertised where nothing can redeem it.
