# Project brief archive - stage history

Moved verbatim out of `docs/agent/PROJECT-BRIEF.md` on 2026-10-28 when the brief reached its 80 KB budget. Append-only: grep it, never read it whole. Current state lives in the brief itself.

`git log -15 --oneline`, grouped:

- **Release-candidate stage**: `a74014a` RC-6 aborted deploy · `9539923` RC-5 1.1.0 + runbook · `2254dc3` RC-4 ledger · `c3ee78d` RC-4 kill switch/retention/`/health` · `8626f34`+`5b6d20a` RC-3 content · `8a5f4e1`+`c1ceeec` RC-2 first run · `4279759`+`7ff4bce` RC-0 adopt v5 manual.
- **Environment/docs**: `570f08a` pin LF on checkout · `5153157` e2e suite self-contained.
- **Product**: `c208f01` paywall price from the worker · `74bbddd` CI gates · `ea90517` Arabic safety disclaimers.

- **V7 stage**: `1b07f82` manual v7 + deploy runbook · `e82221f` block SW in e2e; built bundle 37/37 · `6bfe4fd` deploy snapshot + the merge that carried all 22 hardening/V7 commits to `main` · `48582ea` ledger + brief after the deploy.
- **V8 stage**: `8313808` fix the `journey.spec.ts:320` flake at its cause · `36802ae` the V8 ledger (real-D1 results and the `main` hash correction).
- **V9 stage**: `4d4e40e` every ledger route creates the tables it touches (V8-F0 + the admin throttle) · `ed038f4`/`6e7d7c0` ledger + the round-1 merge and worker deploy (`6aedfd50-…`) · `5f51093` §3 content-load amendment + runbook · `b11e66e` kill-switch config + retention cron · `eff72ae` content-load block + Lighthouse baseline · `09fb166` owner-steps runbook.
- **V9 round-2 deploy**: `main` fast-forwarded `6e7d7c0 → b11e66e` (no force); the live worker is now `255dbeef-…` and prints `schedule: 17 4 * * *`.
- **V10–V14 stage** (all on `launch-hardening`, unpushed unless noted): `ecbcb41`/`6c05947` the content-load amendment removed then re-added in the env-secret form · `7301686` module1 through the Content Gate · `e487654` lazy trust pages (**the last Pages deploy: `2c245106-…` serving `index-CWWIxWb7.js`**) · `5c3cf9f` V10 ledger/brief · `b84f3ec` V11 — backup taken, credential malformed, nothing written · `f73b291` V12 — the load ran, hit the production schema gap, rolled back its own 89 rows · `050499b` V13 — the loader can no longer half-write, and the content schema is documented plus self-healing · **`V14:` — the content load itself (module2 + module1), the grammar supplement, the reachability gate**.
- **V16 stage** (`fa3a0d2`): the loader learns the supplement shape · module1's three duplicated keys removed and its housing pool refilled · the hero converted to a 20 KB WebP with measured medians · then **merge + Pages** — `main` fast-forwarded `3f3c98b → fa3a0d2` (no force), Pages production `bbef47aa-…`, the worker deliberately untouched because no worker file changed.
- **V15 stage** (`5433566`): the fixture title aligned to D1 · grammar supplements accepted by the gate · `scripts/check-content-drift.mjs` added and run against production · then **merge + worker + Pages** — `main` fast-forwarded `5c3cf9f → 5433566` (no force), worker `03007d6e-…`, Pages production `35762f02-…` serving `assets/index-DCIM0lrE.js`.
- **V14 state:** the two loads and every check above ran with **no deploy** — at the time `main` was `e487654`, the Pages deployment `2c245106-…` and the live worker `255dbeef-…`. D1 changed (that is the point of the run); nothing else did.

`main` reached `b11e66e` at the round-2 merge with `git rev-list --left-right --count main...launch-hardening` → `0 0`, and the branch was pushed both times. The live worker is `255dbeef-faae-476a-b3f5-6d4666099b70`. The V7 deploy was also a fast-forward: `22fe6aa → 6bfe4fd`.

## Previous snapshot — 2026-11-05 (every first message ships its Arabic; report buttons share one focus ring)

**Deployed 2026-11-05 (merge + worker + pages).** The A1 «أول الكلمات» first message had shown
«تعذرت الترجمة» because the shipped opener map came from the authored 61-scenario snapshot (301 openers,
«Frau Yilmaz») while the worker serves 49 scenarios / **223** openers («Frau Meier») — 221 had no gloss.
`scripts/language-data/opener-ar-extra.json` now holds those 227 first messages and `build-language-data.mjs`
merges it after the authored corpus, shipping **526 openers / 457 glosses / 0 unresolved**; the app reads the
map synchronously, so the first render makes **no `/ai/translate` call** and works offline. A missing gloss
shows a short loading state, retries once automatically, then an honest retry. Point-closed modals keep
focus without the ring until the next key press. **Proof:** `firstMessageTranslation` **6** (1,484 cells,
zero `fetch`), `reportFocus` **4**, `tsc` clean, gate **VERIFY OK 14/14** (866.1 s). **V47-1 (deployed
2026-11-05):** the missing half is now a gate — `scripts/audit-opener-coverage.mjs` reads the worker's real
`/scenarios` in CI and fails on any served first message with no Arabic (measured 49 scenarios / 225 first
messages / 0 missing), and `docs/OWNER-OPENER-REVIEW.md` lists the 227 new glosses with 18 flags. Gate
**15/15** (721.9 s), no bundle byte changed. Pages `7bfe14d6-…` (source `87997a4`, same entry
`index-BuFoPzZ9.js`; rollback `5c3e24c8-…`); previous `bf78a12c-…` (source `9ace95e`); worker
`dd23b2ac-…` (rollback `e98031d5-…`). **Unproven:** a signed-in
production first bubble; production `/scenarios` still answers 404.

## Previous snapshot — 2026-11-05 (the report action is labelled; consent work unchanged)

**Deployed:** product Worker **`e98031d5-…`** (deployment `09fa2438-…`, source `580e522`, rollback
`70daf981-…`, unchanged today), Pages **`0c25ba91-21cd-4eee-83c7-893755803cf3`** (source `d2353a6`,
rollback `6cb04cff-…`, then `d1324296-…`) serving `assets/index-3KsTlLGj.js`, and landing site
**`6c6c6023-…`** (rollback `5be0e65b-…`).
- **Consent, off by default:** Settings shows an ON/OFF pair readable from the knob and a visible label,
  never pre-ticked. A one-time sheet appears only after the first full live practice conversation (never
  mid-session or on a recovered report); «نعم» calls `POST /consent/conversation`, «لا» or close suppresses
  the ask for 60 days.
- **Per-reply report:** «أبلغ عن رد سيئ» is now a labelled line at the bottom of every AI bubble (it was
  an unlabelled 14 px flag); it confirms, then the worker stores exactly **one** redacted exchange
  (`conversations` with `flagged=1`, `note='learner_report'`, `outcome='reported'`) — even with the global
  toggle off, and the UI says so. Reported rows inherit the 90-day sweep, withdrawal and account deletion.
- **Privacy text:** app, `website/help.html` and its markdown twin gained the report sentence;
  `TRUST_VERSION` is `2026-11-05`.
- **Proof:** `conversationConsent` + `conversationConsentPrompt` **28**, `tsc` clean, gate
  **`VERIFY OK 14/14` in 814.5 s** with e2e; production smoke **2 passed / 2 skipped** after fixing a
  stale `/pricing` wait that also failed on the previous deployment.
- **Live:** worker `/health` 200, `/consent/conversation` 401 signed out, report GET 405 / anonymous POST
  401, admin health and export 401; app 200 with the new hash; site pages 200 and `/help` negotiates
  `text/markdown` with the report sentence.
- **Unproven:** the toggle and sheet in a real signed-in session, and a real reported exchange reaching
  D1 from the app. **Owner input needed:** legal identity/contact for the privacy policy.


## Snapshot moved 2026-11-07 (2026-11-06 path screen answers what now)

## Current snapshot — 2026-11-06 (the path screen answers «what now»; rank lives on the profile)

**Deployed 2026-11-06 (app; worker unchanged).** `/app/library` used to ask the learner to choose
between a rank card, an XP strip, a timeline and a grid of oversized cards. It now has one job: a
slim header (name, Pro badge, daily-goal ring, and a streak chip only when the streak is above zero),
**one** full-width action «تابع: [scenario] · [N] دقائق», and a secondary 10-item review row whose
backlog is a quiet «+120 في الانتظار» instead of a guilt count. Below it sits the only progression
system — the CEFR journey: a level card with a ring, «N مواقف للمستوى التالي» and one ability line,
a sticky A1/A2/B1/B2 bar (future levels dimmed, tap opens the paywall) and compact 64 px scenario
cards with the three evidence stages (دراسة · مع مساعدة · وحدك), «التالي» and «جديد». The rank/XP
card moved to `/app/profile`, where «800 / 1500 XP» and the bar come from one `absoluteXpProgress`
calculation; crossing a rank is celebrated once on `/session-report`. **Proof:** `tsc` clean, new
`trailOrdering` + `scenarioMinutes` tests, updated `v33SimplifyPolish`/`interfaceContracts`, a
390×844 browser probe (one CTA, ≥3 cards above the fold, 130 reviews → 10, locked levels → paywall,
XP text and bar agree), gate **VERIFY OK 15/15** (792.8 s). **Deployed:** Pages `a10ab1b7-…`
(source `35a4363`, entry `assets/index-BVLRTDPT.js`, `/` and `katzuai.com` 200, `/sw.js` 200),
rollback `7549eab3-…`; production smoke 2 passed / 2 skipped. Before/after screenshots for new,
mid-progress, 130-review and zero states are in the gitignored `.tmp/trail-redesign/`.
**Owner-open:** the four level descriptions are proposed copy and the rank placement is a choice
(`OWNER-CHECKLIST.md` §15).

