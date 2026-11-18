# Owner checklist — what needs you, in plain language

Each is in `docs/AGENT-STATE.md` § OWNER-OPEN, with what "done" looks like.

## 1. Your payment details — V44-1 (2026-10-28)

Pricing is done but no payment method is connected, so buyers can only email. Send the Telegram handle;
Syriatel/MTN Cash numbers and holder names; bank, holder, IBAN; currencies. **Done:** the order section shows them.

## 2. Four legal sentences — V44-2 (2026-10-28)

Privacy, terms and refund need four facts only you may state: governing law, name and address, register
number, dispute forum. Say each in a sentence; the agent adds it. **Done:** the terms page names your law,
identity and complaint route.

## 3. Admin secret and grammar columns — V11, V12, V12-1, V18-2

Rotate `ADMIN_SECRET` (pasted into chat); `grammar` needs one additive `ALTER TABLE` adding `rule_de`, `rule_ar`,
`example_ar`. Set it in Worker → Variables, then ask the agent. **Done:** drift exits 0, grammar shows.

## 4. AI keys — one organization, nothing to paste twice (AI-POOL, 2026-11-16)

Groq answers every chat turn now. **Do not add a second Groq key or account** — the policy forbids it and the
router treats a second key as a config error. A *different* provider is §17. **Done:** nothing to do.

## 5. One address — V18-3

`robots.txt`, `sitemap.xml` and hreflang need one origin. Say "use katzuai.com" and the agent sets
`VITE_PUBLIC_APP_URL` at build time. **Done:** `https://katzuai.com/sitemap.xml` lists the root.
## 6. Real-device voice — V18-3

Voice was only ever simulated. Follow `docs/agent/OWNER-STEPS.md` §2 (14 rows) on iPhone + Android. **Done:** every row pass or fail.

## 7. Node version — V17-1 (not blocking)

This machine runs 24.14.0; the project wants 24.15.0+. Run `nvm install 24.15.0 && nvm use 24.15.0`; done when
`npm ci` shows no `EBADENGINE`.

## 8. Partner program first test — AFF-1 (2026-10-28)

Live (20%, 14-day hold, $20 minimum). (1) Two-account test: A shares its `/partners` link; B signs up, pays,
redeems; A shows one `pending` row, then ask the agent to delete it. (2) Mondays:
`GET /admin/api/affiliates/commissions` lists who is owed; pay, then `POST /admin/api/affiliates/payout`.
**Done:** one `pending` row and one payout recorded.

## 9. Be findable — SEO-1, GEO-1 (2026-11-03)

Code done. You: URL Inspection on `katzuai.com/` and `/guides/a1-visa`; submit both sitemaps + Bing
(`GEO-VISIBILITY.md` §5); add the `www` DNS record; read the 12 guides; send LinkedIn/GitHub/X links.
**Done:** "Success" on both sitemaps; numbers in the monthly table.
## 10. Admin panel — decided, nothing to do — V46-1

The panel is live behind Cloudflare Access and cannot touch data or keys; text **off**, retention **90 days
text / 365 counters**, and `/admin` + `ADMIN_SECRET` stay until traffic confirms them. **Done:** a real turn
appears and you say whether to retire `/admin`.

## 11. Type «hallo» in one scene — V45 (2026-10-31)

At `katzuai.com` open **Am Flughafen** (A1), type `halo`: the partner asks about luggage and notes
«Schreibung: Doppel-l». Then `hallo`: the partner stays in the scene, never «Wie geht es Ihnen?».
**Done:** both appear, or send what you saw.

## 12. Turn on the new conversations — CONTENT-V2-1, CONTENT-V2-4 (2026-11-01)

You chose **everything**: the 49 corrected conversations replace the old ones; the 12 new wait for the
Arabic check. Two block it: `CONTENT-LOAD-AUTHORIZED: scenarios-catalogue.json` (updates, not adds) and
the admin key. **Done:** a dry run lists 49 rows / 327 fields and the load lands with a backup.

## 13. Native check of the new Arabic — CONTENT-V2-2, V47 (2026-11-01)

The 159 word meanings, 12 situations and 227 first-message glosses are machine-written. `OWNER-LANGUAGE-REVIEW.md`
and `OWNER-OPENER-REVIEW.md` show German beside Arabic (18 flags). Read both with a native speaker. **Done:** every
`needs_review` cleared, every flag fixed.

## 14. Near-duplicate conversations — CONTENT-V2-3 (2026-11-01)

Seven pairs overlap (viewing/contract, café/restaurant, station/first ride, five interviews…). Deleting one
erases progress and links and there is no "hidden" flag, so both stay, the second narrower. Say **keep both**
(recommended) or **hide the second** (needs a retired list). Pairs: `docs/CONTENT-AUDIT.md` §4. **Done:** decided.

## 15. Two path-screen decisions — TRAIL-1 (2026-11-06)

Approve or rewrite the four level lines (A1 «المواقف اليومية»، A2 «يومي بثقة»، B1 «المواقف الرسمية»، B2
«الدراسة والعمل»), and say whether rank/XP stays on the profile only (current) or returns as a home line.
**Done:** lines approved/replaced, one option recorded.

## 16. The ten units — UNIT-PATH-1 (2026-11-07, owner-approved)

Ten units from the 49 served conversations; titles and situations are in `docs/OWNER-UNITS-REVIEW.md`. Owner
approved; `patient_conversation_basics` moved from unit 6 to unit 5.
**Done:** applied; owner may still send wording changes.

## 17. A second provider key, or a paid Groq tier (2026-11-16)

Groq serves chat at ~**200 turns/day for all learners**; when spent they read «الخدمة وصلت حدّها اليومي» and
nothing is charged. Add `CEREBRAS_API_KEYS` (**one** key, one organization) or buy Groq's paid tier. Never a
second Groq account: a policy violation, not capacity.

## 18. A teacher reads the new first sentence — CHAT-V10 (2026-11-18)

The A1 scene should open in formal «Sie»: «Hallo! Ich bin Frau Meier, Ihre Nachbarin. Wie heißen Sie?» /
«أهلاً! أنا السيدة ماير، جارتك. ما اسمك؟». A German teacher confirms both; production keeps the old «du»
sentence until `CONTENT-LOAD-AUTHORIZED:`. **Done:** teacher agrees, opener replaced.

## Nothing to do — so nobody re-opens them

- **FREE-1:** free lessons are three, once (`MAX_FREE_AI_SESSIONS = 3`; «في المجموع»).
- **V15-3:** `node scripts/check-content-drift.mjs` after any content change.
- **V18:** payments stay off; `ready:false` is right (only the two NowPayments secrets are unset).
- **`docs/LAUNCH-CHECKLIST.md` §2 stays untouched** — those are your items.
- **Worker settings applied:** emergency stop `MAINTENANCE_MODE = "on"`; retention 04:17 UTC.
