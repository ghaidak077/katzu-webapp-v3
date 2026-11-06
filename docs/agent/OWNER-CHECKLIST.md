# Owner checklist — what needs you, in plain language

Each is in `docs/AGENT-STATE.md` § OWNER-OPEN, with what "done" looks like.

## 1. Your payment details — V44-1 (2026-10-28)

Pricing is finished but no payment method is connected, so buyers can only email. Send: the Telegram handle for
orders; Syriatel Cash and MTN Cash numbers (and the name on each); bank, holder and IBAN; currencies to collect.
**Done:** the order section shows them.

## 2. Four legal sentences — V44-2 (2026-10-28)

Privacy, terms and refund are complete except four facts only you may state: governing law, your name and address,
register number, dispute forum. Say each in a sentence; the agent adds it. **Done:** the terms page names your law,
your identity and where a complaint goes.

## 3. Admin secret and grammar columns — V11, V12, V12-1, V18-2

Rotate `ADMIN_SECRET` once (it was pasted into chat); `grammar` needs one additive `ALTER TABLE` adding
`rule_de`, `rule_ar`, `example_ar`. Set it in Worker → Variables, then have the agent run the three lines and the
drift check. **Done:** drift exits 0 and grammar shows.

## 4. Real AI keys — AI-POOL (2026-10-18)

Both key lists are empty, so every turn rides the free fallback (works, weaker, capped). Admin → **AI Providers**
→ paste key(s) → **Save** → **Test**; or `npx wrangler secret put OPENROUTER_API_KEYS` / `NVIDIA_API_KEYS`.
**Done:** Test answers "OK" fast and a live turn stops naming the fallback.

## 5. One address — V18-3

`robots.txt`, `sitemap.xml` and hreflang need one origin. Say "use katzuai.com" and the agent sets
`VITE_PUBLIC_APP_URL` at build time. **Done:** `https://katzuai.com/sitemap.xml` lists the root.
## 6. Real-device voice — V18-3

All voice checks used a simulated microphone. Follow `docs/agent/OWNER-STEPS.md` §2 (14 rows) on iPhone and Android. **Done:** every row marked pass or fail.

## 7. Node version — V17-1 (not blocking)

This machine runs 24.14.0; the project wants 24.15.0+. Run `nvm install 24.15.0 && nvm use 24.15.0`; done when
`npm ci` shows no `EBADENGINE`.

## 8. Partner program first test — AFF-1 (2026-10-28)

The program is live (20%, 14-day hold, $20 minimum). (1) **Two-account test** (an agent must not sign in as you):
A copies its `/partners` link; B signs up, pays and redeems; A shows one `pending` row, then tell the agent to
delete it. (2) **Mondays:** `GET /admin/api/affiliates/commissions` lists who is owed at least $20 — pay, then
record it with `POST /admin/api/affiliates/payout`. **Done:** a referred learner shows `pending`, a payout recorded.

## 9. Be findable — SEO-1, GEO-1 (2026-11-03)

Code done. You: (1) URL Inspection on `katzuai.com/` and `website.katzuai.com/guides/a1-visa`; send both.
(2) Verify the domain, submit both sitemaps, import into Bing (`GEO-VISIBILITY.md` §5). (3) Add the `www` DNS
record. (4) Read the 12 guides, reply "fine" or edits. (5) Monthly, the 30-question table. (6) Send
LinkedIn / GitHub / X links. **Done:** "Success" for both sitemaps, and the table has numbers.
## 10. Admin panel — decided, nothing to do — V46-1

The panel is live behind Cloudflare Access and cannot touch data or keys; text **off**, retention **90 days
text / 365 counters**, and `/admin` + `ADMIN_SECRET` stay until real traffic confirms it. **Done:** a real
learner turn appears, and you say whether to retire `/admin`.

## 11. Type «hallo» in one scene — V45 (2026-10-31)

Sign in at `katzuai.com`, open **Am Flughafen** (A1), type `halo`: the partner asks about luggage and the note
says «Schreibung: Doppel-l», nothing cut off. Then type `hallo`: the partner stays in the scene, never «Wie geht
es Ihnen?». **Done:** both appear, or send what you saw. Record: `docs/AGENT-STATE.md` UNPROVEN V45.

## 12. Turn on the new conversations — CONTENT-V2-1, CONTENT-V2-4 (2026-11-01)

You chose **everything**: the 49 corrected conversations replace the old ones; the 12 new ones wait until the
Arabic is checked. Two block it: (1) the line `CONTENT-LOAD-AUTHORIZED: scenarios-catalogue.json` — rules
allow only adding rows today, so it also approves updates; (2) the admin key: set here but the live site answers
«unauthorized». **Done:** a dry run lists 49 rows / 327 fields, the load lands with a backup, and the app
shows the corrected scenes.

## 13. Native check of the new Arabic — CONTENT-V2-2, V47 (2026-11-01)

The 159 word meanings, 12 situations and V47's 227 first-message glosses are machine-written.
`docs/OWNER-LANGUAGE-REVIEW.md` and `docs/OWNER-OPENER-REVIEW.md` show German beside Arabic (the latter flags 18
stiff or wrong rows). Read both with a native speaker. **Done:** every `needs_review` is cleared and every flag
approved or corrected.

## 14. Near-duplicate conversations — CONTENT-V2-3 (2026-11-01)

Seven pairs overlap (viewing vs. contract, café vs. restaurant, station vs. first ride, five interviews…).
Deleting one would erase progress and saved links, and there is no "hidden" flag, so both stay and the second is
narrower. Say **keep both** (recommended) or **hide the second** (needs a small retired list).
Pairs: `docs/CONTENT-AUDIT.md` §4. **Done:** one decision recorded.

## 15. Two small decisions about the path screen — TRAIL-1 (2026-11-06)

The home screen now has one button, a 10-item review and one A1–B2 journey. Yours: (1) approve or rewrite
the four level lines («أتدبّر أمري في ألمانيا»، «أتحرّك في يومي بثقة»، «أتعامل مع المواقف الرسمية والعمل»،
«أتحدّث بطلاقة في العمل والدراسة»); (2) rank/XP stays on the profile only or returns as a small home line.
**Done:** the lines are approved or replaced, and one option is recorded.

## Nothing to do — so nobody re-opens them

- **Free lessons are three, once — FREE-1.** `MAX_FREE_AI_SESSIONS = 3`; every surface says «في المجموع».
- **Drift check — V15-3.** Run `node scripts/check-content-drift.mjs` after any content change.
- **Payments stay off for the beta — V18.** `/crypto/health` `ready:false` is correct.
- **`docs/LAUNCH-CHECKLIST.md` §2 stays untouched.** Those are your items, unchanged.
- **The two Worker settings are applied.** Emergency stop: `MAINTENANCE_MODE = "on"`; retention runs 04:17 UTC.
