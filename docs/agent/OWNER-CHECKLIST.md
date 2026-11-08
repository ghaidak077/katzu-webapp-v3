# Owner checklist — what needs you, in plain language

Each is in `docs/AGENT-STATE.md` § OWNER-OPEN, with what "done" looks like.

## 1. Your payment details — V44-1 (2026-10-28)

Pricing is finished but no payment method is connected, so buyers can only email. Send the Telegram handle for
orders, Syriatel/MTN Cash numbers and holder names, bank/holder/IBAN, currencies. **Done:** the order section
shows them.

## 2. Four legal sentences — V44-2 (2026-10-28)

Privacy, terms and refund need four facts only you may state: governing law, your name and address, register
number, dispute forum. Say each in a sentence; the agent adds it. **Done:** the terms page names your law,
identity and complaint route.

## 3. Admin secret and grammar columns — V11, V12, V12-1, V18-2

Rotate `ADMIN_SECRET` (it was pasted into chat); `grammar` needs one additive `ALTER TABLE` with `rule_de`,
`rule_ar`, `example_ar`. Set it in Worker → Variables, then ask. **Done:** drift exits 0.

## 4. Real AI keys — AI-POOL (2026-10-18)

Both key lists are empty, so every turn rides the free fallback. Admin → **AI Providers**
→ paste key(s) → **Save** → **Test**; or `npx wrangler secret put OPENROUTER_API_KEYS` / `NVIDIA_API_KEYS`.
**Done:** Test answers "OK" fast and a live turn stops naming the fallback.

## 5. One address — V18-3

`robots.txt`, `sitemap.xml` and hreflang need one origin. Say "use katzuai.com" and the agent sets
`VITE_PUBLIC_APP_URL` at build time. **Done:** `https://katzuai.com/sitemap.xml` lists the root.
## 6. Real-device voice — V18-3

Voice was only checked with a simulated microphone. Run `docs/agent/OWNER-STEPS.md` §2 (14 rows) on iPhone + Android. **Done:** each row pass or fail.

## 7. Node version — V17-1 (not blocking)

This machine runs 24.14.0; the project wants 24.15.0+. Run `nvm install 24.15.0`; done when `npm ci`
shows no `EBADENGINE`.

## 8. Partner program first test — AFF-1 (2026-10-28)

Live (20%, 14-day hold, $20 minimum). (1) Two-account test: A shares its `/partners` link; B signs up, pays and
redeems; A shows one `pending` row, then ask the agent to delete it. (2) Mondays:
`GET /admin/api/affiliates/commissions` lists who is owed; pay, then record with
`POST /admin/api/affiliates/payout`. **Done:** one `pending` row and one payout recorded.

## 9. Be findable — SEO-1, GEO-1 (2026-11-03)

Code done. You: URL Inspection on `katzuai.com/` and `/guides/a1-visa`; submit both sitemaps + Bing
(`GEO-VISIBILITY.md` §5); add the `www` DNS record; read the 12 guides; send LinkedIn/GitHub/X links.
**Done:** "Success" for both sitemaps.
## 10. Admin panel — decided, nothing to do — V46-1

The panel is live behind Cloudflare Access and cannot touch data or keys; text **off**, retention **90 days
text / 365 counters**, and `/admin` + `ADMIN_SECRET` stay until real traffic confirms it. **Done:** a real
learner turn appears, and you say whether to retire `/admin`.

## 11. Type «hallo» in one scene — V45 (2026-10-31)

At `katzuai.com` open **Am Flughafen** (A1), type `halo`: the partner asks about luggage and the note says
«Schreibung: Doppel-l», nothing cut off. Then type `hallo`: the partner stays in the scene, never «Wie geht es
Ihnen?». **Done:** both appear, or send what you saw.

## 12. Turn on the new conversations — CONTENT-V2-1, CONTENT-V2-4 (2026-11-01)

You chose **everything**: the 49 corrected conversations replace the old ones; the 12 new wait until the
Arabic is checked. Two blockers: `CONTENT-LOAD-AUTHORIZED: scenarios-catalogue.json` (updates, not just
adds) and the admin key (set here, but the live site answers «unauthorized»). **Done:** a dry run lists 49 rows /
327 fields, the load lands with a backup, and the app shows the corrected scenes.

## 13. Native check of the new Arabic — CONTENT-V2-2, V47 (2026-11-01)

The 159 meanings, 12 situations and 227 opener glosses are machine-written; `OWNER-LANGUAGE-REVIEW.md`
and `OWNER-OPENER-REVIEW.md` show German beside Arabic (18 flags). Read both with a native speaker.
**Done:** every flag approved or corrected.

## 14. Near-duplicate conversations — CONTENT-V2-3 (2026-11-01)

Seven pairs overlap (viewing/contract, café/restaurant, station/first ride, five interviews…). Deleting one erases
progress and links, and there is no "hidden" flag, so both stay and the second is narrower. Say **keep both**
(recommended) or **hide the second** (needs a retired list). Pairs: `docs/CONTENT-AUDIT.md` §4. **Done:** decided.

## 15. Two path-screen decisions — TRAIL-1 (2026-11-06)

Approve or rewrite the four level lines (A1 «أتصرّف في المواقف اليومية»، A2 «أتحرّك في يومي بثقة»، B1 «أتعامل مع
المواقف الرسمية والعمل»، B2 «أتحدّث عن الدراسة والعمل بثقة»), and say whether rank/XP stays on the profile only
(current) or returns as a home line. **Done:** lines approved/replaced, option recorded.

## 16. The ten units — UNIT-PATH-1 (2026-11-07, owner-approved)

Ten units from the 49 conversations; titles, outcome lines and situations are in docs/OWNER-UNITS-REVIEW.md (patient talk sits in unit 5). **Done:** applied; send wording changes.

## 17. Review the hint answers — 49 questions (2026-11-07)

The first button now answers the last question and the sheet is never empty; all 154 lines are clean. List: docs/OWNER-ANSWER-BANK-REVIEW.md. **Done:** read it, report any odd answer.

## 18. Read the pilot chat scripts — SCRIPT-ENGINE (2026-11-08)

The 11 pilot conversations now run from a fixed script: every question, reply, hint and farewell is in
`src/lib/conversation/script/scripts.ts`, three German/Arabic variants per step. **Done:** read the pairs,
report any odd line.

## Nothing to do — so nobody re-opens them

- **Free lessons are three, once — FREE-1.** `MAX_FREE_AI_SESSIONS = 3`; every surface says «في المجموع».
- **Drift check — V15-3.** Run `node scripts/check-content-drift.mjs` after any content change.
- **Payments stay off for the beta — V18.** `/crypto/health` `ready:false` is correct.
- **`docs/LAUNCH-CHECKLIST.md` §2 stays untouched.** Those are your items, unchanged.
- **The two Worker settings are applied.** Emergency stop: `MAINTENANCE_MODE = "on"`; retention runs 04:17 UTC.
