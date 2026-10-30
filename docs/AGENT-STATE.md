# Katzu Agent State Ledger

## How to read this file (2026-10-15: a live board, not an archive)

**This file is current state and live work.** On 2026-10-15 it was 444 KB / ~110k tokens, 71% of it a
table of completed items nobody reads, which is why the older "read the ledger first" instruction got
skipped — along with the facts it was carrying. Completed work now lives in
`docs/agent/ARCHIVE-AGENT-STATE.md`: nothing was deleted, every word is still there, and it is found by
search rather than by reading. Sections here, in order: RESUME, CURRENT MISSION, two deploy SNAPSHOTs,
OWNER LIST, ITEMS (live rows), DECISIONS, UNPROVEN (open claims), OWNER-OPEN (open items).

- **Resume from `## RESUME` and `## CURRENT MISSION` only.** `npm run session:start` prints both, plus
  `APP-MAP` §9, `MEMORY` §A, git state, and the open owner/unproven counts, in ~90 lines. Start there.
- **Look up one item with search, not by reading:** `grep -n "<topic>" docs/AGENT-STATE.md`, and
  `grep -rn "<topic>" docs/` when the hit is not here — the archive holds the history.
- **Only live work belongs in this file.** `## ITEMS` holds `blocked`/`todo`/`doing` rows; `## UNPROVEN`
  and `## OWNER-OPEN` hold open items. A finished row, and an item marked resolved/superseded/DONE, is
  history: `npm run ledger:archive` moves it out in one command and deletes nothing.
- **A thing that needs a page gets its own document, linked.** One bullet reached 56 KB — 43% of this
  file — before it was moved on 2026-10-15: a policy, a mission log, or a walkthrough is a document,
  not a bullet. `tests/agentDocs.test.ts` caps a single bullet at 8 KB for exactly this reason.
- **The SNAPSHOT sections are production rollback records**: read the newest one before any deploy
  touch, never all of them.
- Shape and size are enforced by `tests/agentDocs.test.ts` (≤ 80 KB, no completed rows, no closed
  bullets in UNPROVEN/OWNER-OPEN, no bullet over 8 KB), so growth is a decision someone made, not drift.

## RESUME

- **2026-10-30 — the home headline reads as words again and names the language (site deployed).** A tag-stripping extractor read the home `h1` as one word («تُتعلَّمبالتحدّث») because its two block lines were joined with no whitespace; a newline fixes the measurement and changes nothing on screen (the two `.ml` line boxes, the `h1`, the hero box and the document height are identical to the pre-fix build at 390×844 and 1366×800). The home `title`, `og:title`, `twitter:title` and the `WebPage` JSON-LD `name` now read «كاتزو — تطبيق لتعلّم اللغة الألمانية بالمحادثة» (**46 characters**), the description carries «تعلم اللغة الألمانية», and **no other page kept a different title by accident — only `/` moved**. Images: all 20 `<img>` on the site already had an `alt` (19 decorative brand marks beside the visible «كاتزو», one Arabic alt on the home screenshot), so nothing needed fixing. New `tests/headings.test.ts` fails when any heading, HTML or `md/` twin, fuses at a tag run — it reports the old H1 as `تُتعلَّم•بالتحدّث` and today as clean. Live after the deploy: `/` `/pricing` `/affiliate` `/help` `/guides` **200**, the 46-character title, the 5-word H1 with its whitespace, `og:title`, `twitter:title` and the JSON-LD name all read back from production, markdown negotiation on `/pricing` still `text/markdown` + `Vary` + `X-Robots-Tag`, and `md/` now reads «الألمانية تُتعلَّم بالتحدّث، لا بالحفظ.». Gate `VERIFY OK 14/14` (731.5 s, exit 0); local `wrangler pages dev` crawl 17/17 sitemap URLs 200 and **33 old URLs each a single 301 to a 200**. Read-only header check, no Cloudflare change: `http://website.katzuai.com/` **200**, `http://katzuai.com/` **301 → `https://katzuai.com/`**. Deploy and rollback ids: SNAPSHOT.
- **2026-10-29 — the site is now built to be crawled and cited: 12 Arabic guides, one sitemap, a crawler
  policy that welcomes the AI assistants.** The site is 17 pages (`/guides` + 12 articles), each with one H1, an
  answer-first lead, a table or checklist, FAQs, «آخر تحديث», an author and official sources; the build refuses a
  guide outside 900–1500 words, a dead related link, a quoted price or a promise. Both hosts' `robots.txt` allow
  the ten named crawlers and disallow only `/admin/ /api/ /private/`; the site sitemap carries **17** URLs with
  real `lastmod`; `/llms.txt` and an IndexNow key are generated and `npm run seo:indexnow` submitted the 17 (202).
  The app emits a root-only `sitemap.xml`, and both hosts count an assistant referral as
  `landing_viewed`/`source` (hostname only, no cookie). Live: site
  `03ec8a29-…`, app `58455d0e-…` (SNAPSHOT); 17/17 sitemap URLs 200, 47 links/assets 0 dead, mobile SEO/a11y 100
  on five pages, `/` byte-identical except the head tags, the footer «الأدلة» link and `ai-ref.js`. **Edge block,
  unfixable here:** Cloudflare answers `403` to GPTBot, ClaudeBot and PerplexityBot and its managed `robots.txt`
  disallows them — OWNER-OPEN SEO-1/GEO-1; citation evidence UNPROVEN.

- **2026-10-28 — AFF-1 went live on the Worker, and the free tier stopped promising a month.** The worker that
  owns the partner ledger is deployed and answers `/affiliate/me` (401 signed out), `/affiliate/ref` (400 on a
  malformed code) and the owner-only `/admin/api/affiliates*` (401); the three tables exist in production D1.
  Every free-lesson surface now says «في المجموع» — home meta/OG/JSON-LD/CTA, `/pricing`, the paywall and the
  soft-prompt copy — because `MAX_FREE_AI_SESSIONS` counts `trial_quota_ledger` rows with no period filter
  (FREE-1 closed; the once-branch of the owner's OR). The `dayZeroReport` flake was a **cause**, not a rerun:
  a 1.2 s timer opened the soft Pro modal after the first correction and its scrim covered «أرسل جملتك» for the
  rest of the episode; the timer is gone and the spec now watches that 1.6 s window. Deploy ids, live strings
  and the two-account gap: SNAPSHOT + OWNER-OPEN AFF-1.

- **2026-10-28 — the home page stopped saying two things the app does not do (site deployed).** Three copy fixes,
  text only: the trust line dropped «أخطاؤك ومحادثاتك تبقى على جهازك» (`syncProgress` uploads mistakes + session
  summaries to `/progress/sync`); the free-lessons FAQ dropped «تتجدد دروسك المجانية كل شهر» (`MAX_FREE_AI_SESSIONS
  = 3`, all-time in `trial_quota_ledger`); the voice FAQ answers instead of pointing at a paragraph
  (`cloudflare-stt.js`: audio → Workers AI Whisper, never stored). Stat `6` → **49** (live `GET /scenarios`), rail
  card 06 = the real café scenario; `/help` links `/#rail` as «49 موقفاً في التطبيق». Proof: gate green, 390 + 1440
  one H1 / no overflow, strings read back live; ids in SNAPSHOT. Its «كل شهر» residue was closed by FREE-1.

- **2026-10-28 — `/partners` was a 404, not a broken button (app rebuilt from git).** The route was in the
  router but not in `public/_redirects`, so that deep link died while its siblings answered 200 (`404.html`
  stops the shell fallback; gotcha 11). `/partners / 200` is listed and `tests/appMap.test.ts` fails when a code
  route has no 200 rewrite (proved by deleting the line). Live: 200 → shell → `/welcome`, no page errors.

- **CI on `c359095` is green.** Run `40703219152` rerun: **170 passed / 2 skipped**, verify green; attempt 1
  failed only `dayZeroReport.spec.ts:179`, where the `PaywallModal` scrim covered «أرسل جملتك» for all 90 s.
  It passes locally (17.2 s) and the suite was green on `e453e1c`: trigger UNPROVEN at the time — the cause is
  the removed soft-prompt timer (RESUME above), and CI on `d786bd0` is green (run `40709993823`).

- **2026-10-28 — CI red on `3980b39` was a socket reset, not the tree.** Run `40701347617` failed only
  `quiz content audit` with `fetch failed [ECONNRESET]` while `GET /scenarios` answered 3/3 200 here and the
  same step passed in the pre-push gate. That step now retries a *thrown* network error 3× (an HTTP status still
  fails; proven: exit 1 after 3 attempts against a closed port), so a runner's TLS reset no longer reddens CI.

- **2026-10-28 — the partner program is live and has no partners yet (AFF-1).** `/affiliate` states 20% of the
  first paid order, a 14-day hold, a $20 minimum and four payout methods (from `AFFILIATE_CONFIG`);
  `cloudflare-affiliate.js` owns the tables, signup attach, day-14 approval and refund voiding. Deployed worker
  `998873c6-…`, site `4dbf4a05-…`, app `408cf69c-…`, push `ccbbacb..4870d39`; live proof (`ZZTEST01`, 30-day
  cookie, admin 401) in SNAPSHOT. Next: the owner creates the first code.

- **2026-10-28 — `/` is the owner's design again (deployed).** Full record (design parity, Lighthouse
  97/100/100, 33 redirects, deploy `90880c38-…`) and the three-page site + audit #7 entries are in
  `docs/agent/ARCHIVE-AGENT-STATE.md` (search `RESUME 2026-10-28`).

## CURRENT MISSION

**GEO + `/guides` — the site is built to be crawled and cited (2026-10-29).** Twelve Arabic guides answer real
questions (A1 visa, Integrationskurs, doctor, flat, Anmeldung, work, recognition, phone), each with one H1, an
answer-first lead, a table or checklist, FAQs, «آخر تحديث» and official sources. `site-seo.mjs` owns
sitemap/robots/llms/IndexNow, `site-schema.mjs` the JSON-LD, `seo-agents.mjs` the ten crawlers; the app emits a
root-only sitemap so one canonical cannot be indexed thirty times.

**AFF-1 — the affiliate programme ships, and the free-tier promise now matches the app (2026-10-28).**
The Worker that owns the partner ledger is deployed and its three tables exist in production D1
(`affiliates`, `referrals`, `commissions`, created idempotently by `ensureLedgerTables` on the first
request). `POST /affiliate/me` mints a partner code for a signed-in account and `/partners` shows the
link; `POST /affiliate/ref` validates a code; the day-14 approval runs in `scheduled()` and again
lazily on every admin read. **Two endpoints the owner named do not exist and never did** —
`/affiliate/enroll` and `/affiliate/me/payout`; the real surface is `/affiliate/me` plus the
owner-only `/admin/api/affiliates/{create,void,payout}`. What remains is the owner's own two-account
run (OWNER-OPEN AFF-1). **Free tier:** `MAX_FREE_AI_SESSIONS = 3` is counted once per account, ever,
so every surface now says «في المجموع» and the word «شهر» is gone from the home page, `/pricing`, the
paywall and the soft-prompt copy (FREE-1 resolved). **Motion:** the soft Pro prompt that opened 1.2 s
after the first correction is removed — its scrim covered «أرسل جملتك» until dismissed, which is the
`dayZeroReport` CI flake; `e2e/dayZeroReport.spec.ts` now watches that window.

NEXT (V44): **SEO-1 and GEO-1 are the owner's two steps, and nothing in this batch is startable without them.**
Search Console (one TXT record) + Bing + `npm run seo:indexnow` (SEO-1); a native read of the 12 guides, the
30-prompt panel and real profile URLs for `sameAs` (GEO-1) — all in `docs/agent/GEO-VISIBILITY.md`. V44-1 and
V44-2 (money and legal fields) still block the paying surfaces. AFF-1's referral test and payout day stay with
the owner; an agent must not sign in as them or use the admin key. A live 403 or challenge from Cloudflare is a
dashboard setting (Security → Bots / WAF), never repo code.

## SNAPSHOT — current production rollbacks (read before any deploy touch)

Recorded 2026-10-19, refreshed at the 2026-10-22 V43.4 worker deploy (the admin-harness fix), the
2026-10-23 guided-home Pages deploy and the 2026-10-28 worker + site + app deploys: these live ids are
the rollback targets for the **next** deploy. Supersedes the 2026-10-06 snapshot
(now in `docs/agent/ARCHIVE-AGENT-STATE.md`), whose worker target `315ec953-…` was replaced by
`56425f30-…` (2026-10-12), then `66bd8b92-…`, then the secret-only `31149c92-…`, and then today's.

- Worker live version id (rollback target for the next deploy):
  **`6860fa2f-bfca-44d7-8fc3-870a87aec926`** (100%, deployed 2026-10-28T15:49:00Z) — `e9aa028`'s worker bundle:
  `POST /affiliate/me` (401 signed out; it answered **404 `{"error":"not_found"}`** on the previous
  version), `/affiliate/ref`, the six owner-only `/admin/api/affiliates` routes and cron `17 4 * * *`
  (the deploy printed `Deployed katzu-test triggers … schedule: 17 4 * * *`). Live after the deploy:
  `/health` 200 `storage:{d1,kv}` ok; `POST /affiliate/me` **401**; `POST /affiliate/ref`
  **404 `unknown_code`** on `ZZTEST01` and **400 `malformed_code`** on `!!!`; `GET
  /admin/api/affiliates` and `/commissions` **401**. The `unknown_code` (never `503`) proves the
  `SELECT status FROM affiliates …` ran, so the three AFFILIATE_TABLES exist in production D1 —
  `migrations/0003_affiliate_tables.sql` needs no runner because `ensureLedgerTables` applies it
  idempotently on the first request.
  **Rollback target: `998873c6-d773-4bb5-9ec5-2c548e550b0f`** (the partner ledger, `4870d39`), then
  `f0b5fa01-b4a2-449c-b470-e770721487eb` (the founding-price table, `80c6b9a`), then the audit #7 limiter
  `6f5ba883-6730-43d2-b8cd-9c275b298fee` (2026-10-28), then
  `e1a9a2ca-e919-43e2-baba-28a52bddd1cd` (V43.4, `4b33d70`),
  `b2119bfb-68cb-49bb-8639-82d4583eda28` (V43.3, `1ba9abd`),
  `5193b4e9-9653-46b1-9d3d-164e92d0da5a` (V43.2, `3358165`),
  `d07b8701-2176-45b4-9807-fa490f469e29` (the same fix at `95f21f7`),
  `31149c92-001f-4c61-8603-80b39c42662f` (live before this run; a secret-only deployment),
  `66bd8b92-8db6-452d-ad99-88685cab0956` (the V42 merge-deploy) and
  `56425f30-c67f-45ea-ace7-a9c4e9b47dd7` (2026-10-12), then the ids in the superseded snapshots below.
- **App Pages production (2026-10-30, source `4ba7b4b`):** deployment
  **`b5ab2a14-9a08-4084-9904-c202e06f8fb9`** — the site-fix push rebuilt the app and **changed nothing in
  the bundle** (`assets/index-DZbiK2cC.js`, identical to the two deployments before it). Before it:
  `f1bccd5f-0da7-4049-ac7a-b990e38e9edb` (source `9032c46`) — same bundle as `ee86640`, a docs-only push.
  `vite build` emits `robots.txt` (ten crawlers, only `/admin/ /api/ /private/` disallowed, `Sitemap:` from the
  same origin) and a **root-only** `sitemap.xml`, and the shell carries `lang="ar"`, one canonical and
  `hreflang` ar + x-default. Live: `/sitemap.xml` 200 (one `<loc>`), `/robots.txt` 200 with our groups, `/` 200
  with the head links. The project builds from git, so **every** push
  to `main` mints a new id — never quote one without reading
  `wrangler pages deployment list --project-name=katzu-webapp-v3` first.
  **Rollback target: `7754239c-0a66-4908-a4b2-bfadcd4f5a8f`** (source `f7da7e5`, same bundle), then
  `f1bccd5f-0da7-4049-ac7a-b990e38e9edb` (source `9032c46`), then `6b97992e-1d16-4198-82fd-98917a824829` (`945e7fd`, pre-batch), then
  `8c6a1c59-123b-4fca-9e89-b1ef2c7865c2` (`691a4a9`), then
  `b0be8a57-e9af-4cb6-9c4f-1d38e37e1a2c` (`d786bd0`).
- **Site Pages production (2026-10-30, direct upload of `website/`):** `katzu-landing` deployment
  **`361b0125-a220-4ab9-8e6b-b94f0e0479a9`** (branch `main`, source `4ba7b4b`, uploaded from inside
  `website/` so the Functions bundle shipped) — the home `h1` whitespace, the home title and the heading-fusion guard: `bg-mobile.mp4` 1.44 MB
  (H.264 720×1280, no audio, faststart) at ≤700px, `bg.mp4` above it. Live: `/` `/pricing` `/affiliate` `/help` `/guides` **200**, the 46-character title, the five-word H1 with
  its whitespace, `og:title`, `twitter:title` and the JSON-LD `name` all read back from production, and
  markdown negotiation on `/pricing` → `text/markdown` + `Vary` + `X-Robots-Tag` (browsers get HTML).
  **Rollback target: `7d547d60-9b67-4e51-b601-01227087df90`** (`3bacf75`, the home film's phone cut —
  `bg-mobile.mp4` 1.44 MB at ≤700px, `bg.mp4` above it), then `39639c5c-b610-4575-bee5-5520bde0c4d2`
  (`eda9a7f`), then `3e859def-277f-46e7-a107-a45bb09ef5d0`
  (`f3980be`), `44566671-7ab3-43e0-91f2-b487d4a9990a` (`7595c37`),
  `03ec8a29-250d-4517-bf18-3df1049b9106` (`ee86640`), `099924cc-7269-4b48-86d9-f970dafac255`
  (`92f60a4`), `1107f7b3-8c11-459c-886a-c4c4ad5d711b` (`e9aa028`, four pages),
  `4dbf4a05-3cb3-411c-a408-a168fe3f6cc9` (partner page),
  `90880c38-5f90-4378-844c-5f1ef1fb055e` (three-page design home),
  `1359fb18-e862-4774-b9fb-939a45c20159` (rebuilt three pages). The 2026-10-29 copy, stat and `h1`
  checks still held at the crawl. Note: this project does **not** build from git — a push is not a deploy.
- **Sales Pages production (2026-10-28, direct upload of `sales/`):** `katzu-sales` deployment
  **`d3811619-6ce1-4c96-82e7-d11e6004c7ae`** — `_redirects` answers every path with one 301 to
  `https://website.katzuai.com/pricing#pay`. **Rollback target: `0de6a626-a242-421f-aca0-faa0ef218722`**
  (the last real sales page). Retired on purpose: a second sales page would be a second price.
- Older app targets: `c89828af-acba-41bd-8514-8eba166d6c0e` (`1e9d09f`, `assets/index-DkRAI1BL.js`),
  `50f30132-0412-417f-95de-8cc0dc545d7b` (`d216ae8`, `assets/index-BfNVQ58w.js`), `8ec7ea54-…`
  (`3358165`), `5f115c46-…` (`95f21f7`), `8fe6d07f-…` (`8ca290c`), then the archived snapshot.
- `GET /health` body (worker, re-read 2026-10-28 after the founding-price deploy — unchanged):
  `{"status":"healthy","service":"Katzu Unified Worker","ready":true,"maintenance":false,"storage":{"d1":"ok","kv":"ok"}}`.
  The `storage` object is shipped by `9c07b44` (2026-10-16 launch-metrics commit, verified with
  `git log -S 'storage:{d1:"ok"' -- cloudflare-unified-worker.js`) and tells a learner only that the
  data stores answer — no pool, no models, no strategy. KEEP it when editing that handler.
- `GET /crypto/health` body (worker, re-read 2026-10-28): `priceUsd:14.99` + four plans (`monthly`
  14.99/29.99, `quarterly` 29.99/59.99, `halfyear` 49.99/99.99 `recommended`, `yearly` 99.99/199.99) read
  from `pricing.config.json`; `ready:false` is fine in closed beta.
- Unauthenticated `GET /admin/api/orders` → **401** at the worker origin
  (`katzu-test.ghaidakalosh008.workers.dev`) — note `katzuai.com` is the **Pages** host and answers
  SPA HTML for every path, so worker routes must never be probed there.
  `/` `/signin` `/sw.js` → **200** on `katzuai.com`, serving `assets/index-CZBi4VYc.js` (+ the
  `AppShell-D0v5tmUb.js` chunk; re-read 2026-10-28 after the `691a4a9` app deploy).
- `origin/main` at snapshot time: `691a4a9` (the deployed code SHA; the docs commit recording this
  deploy follows it and changes no runtime file) — gate `npm run verify -- --ci --e2e`
  **VERIFY OK 14/14 in 790.1s** on that tree, `dayZeroReport` 5/5. CI for `691a4a9` is confirmed
  separately with the run id. Live checks were HTTP-level (status codes, body greps, one bundle crawl
  over the 81 chunks reachable from `/`); the production smoke spec was not re-run this pass.
- **Rollback is PROVEN available** for both targets: `wrangler whoami` reports account
  `00df3d915626e0a681f4fef98c1c587c` with `workers (write)` (used for the pre-deploy snapshot),
  and `wrangler pages deployment list` lists the live production deployment and its predecessors
  (used for both snapshots this run).

## SNAPSHOT — superseded pre-UI-polish record (2026-10-06)

Moved to `docs/agent/ARCHIVE-AGENT-STATE.md` on 2026-10-19 to keep this file under its 80 KB cap.
Nothing was deleted: search the archive for `pre-UI-polish`.

## OWNER LIST — older deduplicated list (moved 2026-10-28)

The 2026-10 owner list that used to sit here was a second copy of items now kept, with their
current status, in `## UNPROVEN` / `## OWNER-OPEN` below. It moved verbatim to
`docs/agent/ARCHIVE-AGENT-STATE.md` (search `OWNER LIST 2026-10 moved`).

## Current mission overlay — 2026-10-04

Autonomous excellence execution is tracked in [EXCELLENCE-STATUS](agent/EXCELLENCE-STATUS.md).
That status supersedes historical NEXT/branch/readiness assertions below. **Current batch:
V40-1 (Live Conversation redesign) and V40-2 (the two accessibility defects that redesign
measured and left open) are both committed, pushed, merged to `main` and deployed; V40-2's
Pages deployment is `265d306f-…` from `fbd40bb`, with CI green. See both rows.** Historical
rows remain provenance.

Status for the ledger defined in `AGENTS.md` §8. Rules live in `AGENTS.md`; this file records status and evidence only.

## ITEMS

> **Completed history is not here.** Finished items and the old run-log live in
> `docs/agent/ARCHIVE-AGENT-STATE.md` — nothing was deleted, and it is not read at session start.
> Search it, never load it: `grep -n "<topic>" docs/agent/ARCHIVE-AGENT-STATE.md`.
> Only rows that are still live (`blocked`, `todo`, `doing`) belong in the table below. When it grows
> past the 140 KB cap, `npm run ledger:archive` moves the finished rows out — one command, nothing
> deleted.

| ID | Status | Evidence / blocker |
|---|---|---|
| RC-6. Gated production deploy (owner prompt) | blocked | **Aborted at the preconditions; nothing was deployed, no D1 statement was run, the sales site was untouched.** Gate 0.1 **FAIL** — the tree is clean but on branch `launch-hardening`, and `main` and `origin/main` are both still at `22fe6aa`, so none of P1–P7 or RC-0…RC-5 is on main. Gate 0.2 **PARTIAL** — `npm ci --dry-run` (substitution, see DECISIONS) resolved the tree; `npm run lint` clean; `npm test` **67 files / 799 tests passing**; `npm run build` exit 0; `node --check cloudflare-unified-worker.js` clean; `npm audit --omit=dev --audit-level=high` found **0 vulnerabilities**; secret-pattern grep clean. Playwright **against `vite preview`** did not pass: **26 passed / 11 failed**, and the failure is classified (see UNPROVEN) as the harness, not the product — the built app registers a service worker and the config never sets `serviceWorkers: 'block'`, so Workbox mediates requests that `page.route` mocks cannot reach. The same suite is **37/37 against the dev server**. Gate 0.3 **FAIL** — `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are both **unset**, which is the prompt's own STOP condition ("deploy blocked: no credentials"). Wrangler *is* authenticated locally via an OAuth token tied to the owner's account, so the block is the environment contract, not a broken CLI. Steps 2–5 (D1 migrations, worker deploy, Pages deploy, post-deploy verification) **SKIPPED**. Read-only snapshot recorded anyway: live worker `katzu-test` at `https://katzu-test.ghaidakalosh008.workers.dev`, current version `951f7d4f-f65f-432f-9a42-5a20f1689599` (100%, created 2026-09-27T11:53:00Z); Pages production deployment `26702124-99d7-4fc4-af42-958c02134762` (branch main, commit `22fe6aa`) with `3b148b21-2131-4fa5-8255-942746c2f33e` and `7caaa31a-e6d2-4cc1-b8b7-22e6bb51a39d` as older production rollback targets; `/crypto/health` → `{ok:true, environment:"test_mode", baseUrlHost:"api-sandbox.nowpayments.io", apiKeyConfigured:false, ipnSecretConfigured:false, priceUsd:5, months:1, ready:false}`. **Live `/health` proves production is still the pre-hardening code:** it returns `aiPool:{entries:9, tiers:[…], active:[…gemini/groq model names…]}`, `cachedTranslationsCount`, `primaryWorkingModel` and `strategy` — exactly the pool disclosure RC-4 removed in the working tree, so that exposure is live on the public internet right now. |
| RC-1. Performance (Stage 1) | blocked | **Not run.** Lighthouse is not installed in this environment and adding it as a devDependency (plus a browser download and a `vite preview` server) was out of the remaining budget, so there are **no** before/after numbers and none are claimed anywhere. The prompt's own priority order puts Stage 1 after Stage 3, and Stage 3 consumed the remaining time. Unblocking: `npm i -D lighthouse`, `npm run build && npx vite preview --port 4173`, then `npx lighthouse http://localhost:4173/ --preset=desktop --only-categories=performance,accessibility,best-practices,seo` for `/`, `/demo` and the Trail. The B4 performance record (bounded JourneyHome projection, local scene art, woff2 subsetting, renderer tier, screen split, 478 dead lines removed) remains valid on its own evidence. |
| V9-9. Content load (Phase 4) | blocked | The prompt carries `CONTENT-LOAD-AUTHORIZED: curriculum-30day-module1.json, curriculum-arrival-module2.json`. **Nothing was written to production D1 and no export was taken.** Two independent stops, both verified read-only. **(a) module1 fails the runbook's precondition 2:** `review.status` is `"pending"`, not `"approved"`, and `docs/content/review-<module1>.md` does not exist (`docs/content/` holds only `review-arrival-module2.md`). Its own dry-run says it: "review.status is \"pending\" — a real load would be refused until it is approved", and `scripts/load-curriculum.mjs:131` hard-fails on exactly that. **(b) Neither file is loadable by an agent at all:** the loader needs `process.env.ADMIN_SECRET` (`:57`) and exits when it is unset, verified by running both `--commit` commands — each printed "ADMIN_SECRET is not set. Add it to the environment…" and exited **2** with no network call. §3 forbids an agent requesting, setting or using any secret, `ADMIN_SECRET` included, and the new paragraph's own "Never allowed" list names secrets. **Verified read-only instead:** `audit-curriculum.mjs` PASSED for both files; `load-curriculum.mjs --dry-run` PASSED for both (module2's review line: `approved by AI self-review — GLM 5.3 Flash, no human review`); and the **collision check on production D1 is CLEAN for both** — live scenarios are `apartment_viewing, cafe_order, doctor_visit, embassy_appointment, job_interview` and live grammar `akkusativ_articles, dativ_prepositions, konjunktiv_ii, perfekt_tense`, so **none** of module1's 5 scenario / 10 grammar ids or module2's 5 scenario / 4 grammar ids exist live. Live counts re-read as **5 scenarios / 114 vocabulary / 20 starter_phrases / 4 grammar**, unchanged from V8. Vocabulary and starter_phrases carry no `id` and the loader keys them by `level\|german\|topic` and `scenario_id\|german`, skipping rows already present, so they cannot be overwritten; only `scenarios` and `grammar` are upserted by id, and both were checked. Owner commands in OWNER-OPEN. |
| V10-6. Content load (Phase D.2) | blocked | Owner line `CONTENT-LOAD-AUTHORIZED: curriculum-arrival-module2.json, curriculum-30day-module1.json (module1 only if approved by the Content Gate in this run)`. **Nothing was loaded; no D1 export was taken; no production write occurred, not even a test one.** The runbook's precondition 4 fails on this machine: the sanctioned check `[ -n "$ADMIN_SECRET" ] && echo set` prints **NOT SET**, and `docs/agent/CONTENT-LOAD.md` says an unmet precondition → STOP, no partial load. The agent did not read, store, print or pass the value, and must not (§3). **The secret was published in a chat prompt earlier in this session, so it must be treated as compromised and rotated before any load.** Everything else the runbook requires is true and was verified read-only this run: both files `review.status="approved"` with review files; both audits PASSED; both dry-runs PASSED (module2 → 5/49/42/4; module1 → 5/74/49/10); production collision checks **clean for both modules** (module1: 15 ids, zero rows; module2: 9 ids, zero rows); live counts re-read **5 / 114 / 20 / 4**, unchanged. Owner commands, expected post-load counts and the rollback id list are in `docs/agent/CONTENT-LOAD.md`. |
| V11-2. Load module2 → refused with 401; value shape diagnosed; stopped (Phase 4) | blocked | `node scripts/load-curriculum.mjs --file=docs/content/curriculum-arrival-module2.json --commit > /tmp/v11-load-module2.log 2>&1`: the draft validated locally (5 scenarios / 49 vocabulary / 42 phrases / 4 grammar, review approved), then **the first authenticated read failed — `✘ could not list vocabulary (HTTP 401): {"error":"unauthorized"}`** at `scripts/load-curriculum.mjs:70`. The log carries **zero** `Bearer`/`Authorization` occurrences (the credential was never echoed), the log never reaches a write phase (`Writing …` / `to write` are absent), and **nothing was written to production D1**. **Root cause, established structurally without ever printing the value:** the environment variable is **66 characters** of which exactly **64 are lowercase hex** — chars 2–65 match `^[0-9a-f]{64}$` — with first char `U+003C` (`<`) and last `U+003E` (`>`); i.e. the placeholder form `<secret>` was pasted *with its angle brackets*, so the loader sent `Authorization: Bearer <hex>`. **Nothing was re-encoded, trimmed or re-derived:** §3 reserves secret handling to the owner, so this is an owner-side fix. **Post-attempt state re-verified unchanged:** counts still **5 / 114 / 20 / 4**, the new scenario ids still absent, and `/scenarios`, `/vocabulary`, `/grammar` all **200**. The backup from V11-1 is still valid and still unused; no rollback was needed because no write was attempted. |
| V12-2. Load module2 → grammar batch `HTTP 500` on a live schema gap; 89 inserted rows rolled back; stopped (Phase 4) | blocked | `node scripts/load-curriculum.mjs --file=docs/content/curriculum-arrival-module2.json --commit > /tmp/v12-load-module2.log 2>&1` → **exit 0**, 29 log lines, **`grep -c -E 'Bearer\|Authorization'` = 0** (run before anything was shown; the credential never reached the log). **Three of the four batches wrote, the fourth could not:** `scenarios ✔ HTTP 200 count 5`, `vocabulary ✔ 200 count 42` (7 of 49 rows skipped as already present), `starter_phrases ✔ 200 count 42`, and **`✘ grammar batch 1 failed (HTTP 500): {"error":"admin_route_failed","message":"D1_ERROR: table grammar has no column named rule_de: SQLITE_ERROR"}`** — **0 grammar rows written**. The loader then printed `DONE — 89 row(s) written.` and **exited 0**, because its verification loop covers scenarios and vocabulary topics only and never consults the per-batch statuses, so a failed batch is invisible in its exit code (recorded in `LESSONS.md`). **Rollback, exact, driven by the backup rather than by arithmetic on counts:** the pre-load export contains the two tables' `sqlite_sequence` rows (`vocabulary = 135`, `starter_phrases = 20`) and both are `INTEGER PRIMARY KEY AUTOINCREMENT`, so the new rows are provably `vocabulary id > 135` (42 rows, 136–177) and `starter_phrases id > 20` (42 rows, 21–62) — an id above the pre-load sequence cannot be a pre-existing row. `DELETE FROM starter_phrases WHERE id > 20; DELETE FROM vocabulary WHERE id > 135; DELETE FROM scenarios WHERE id IN ('airport_arrival','train_station','bakery_shopping','landlord_followup','friend_catchup');` → `changes` **42 / 42 / 5 = 89**, exactly the 89 the loader reported. **Both states measured:** post-attempt **10 scenarios / 156 vocabulary / 62 starter_phrases / 4 grammar**; post-rollback **5 / 114 / 20 / 4** with `MAX(vocabulary.id) = 135`, `MAX(starter_phrases.id) = 20`, 0 rows for the 5 new scenario ids and 0 `g_%` grammar ids; live scenario ids back to `apartment_viewing, cafe_order, doctor_visit, embassy_appointment, job_interview` and live grammar to `akkusativ_articles, dativ_prepositions, konjunktiv_ii, perfekt_tense`. **Three sampled old rows match the backup exactly:** vocabulary 22 `Reisepass`/`documents`/`جواز سفر`, 77 `Allergie`/`food`/`حساسية`, 135 `Wohnungsamt`/`housing`/`مكتب الإسكان`, and starter_phrase 1 = `embassy_appointment` "Ich habe einen Termin.". **Public endpoints back to normal:** `/scenarios` 5 rows containing **none** of the new ids, `/vocabulary` 114, `/grammar` 4, `/health` unchanged (`{status, service, ready, maintenance:false}`). **Root cause (read-only, proven twice):** the live `grammar` table is `id, level, title_ar, title_en, explanation_ar, explanation_en, example_de` (`SELECT GROUP_CONCAT(name) FROM pragma_table_info('grammar')`), while the draft row keys, `src/lib/content/curriculumAudit.ts:49`, `src/types/models.ts:89`, the Worker's own `resolvePracticeGrammar` (`cloudflare-unified-worker.js:1211`) and `docs/PRODUCT-SPEC.md:1021` all assume `id, title_ar, rule_de, rule_ar, level, explanation_ar, example_de, example_ar`. `handleAdminUpload` (`cloudflare-unified-worker.js:3053`) builds `INSERT INTO grammar (…)` from **the row's own keys**, so `rule_de` is sent to a table that has no such column; `SELECT id, rule_de FROM grammar LIMIT 1` fails with D1 error **7500** as the independent proof. **Deeper cause:** none of the four content tables' DDL exists anywhere in the repo (`git grep -n "CREATE TABLE.*grammar\|CREATE TABLE.*vocabulary\|CREATE TABLE.*scenarios\|CREATE TABLE.*starter_phrases"` → 0 hits; only the ledger tables are created by the Worker), so the live content schema is unversioned and has drifted — and the local dry-run cannot see it because it never touches the network, while the audit validates the draft against the *documented* field list. **Two production consequences beyond this load:** (a) `resolvePracticeGrammar` selects three columns the live table lacks and swallows the error in a `try/catch` that returns `null`, so the B2 grammar-reference link can never resolve in production; (b) the live grammar ids are `akkusativ_articles`-style while `SCENARIO_GRAMMAR_IDS` and the offline seed use `g_*`, so even with the columns added the five original scenarios would still have no matching D1 row. **Stopped:** module1's ten grammar rows carry the same `rule_de` field, so it was deliberately **not attempted** (rollback → mark blocked → stop). Owner fix is one additive DDL with no data loss, written into OWNER-OPEN; no deploy, no push, no further write. |
| V44 Review task contract | doing | Gates green; `docs/agent/review-v41/`; await owner approval before merge/deploy. |

## DECISIONS

- **GEO-1 (2026-10-29) — three small honest choices instead of three larger ones.** Guides are flat files
  (`guides/<slug>.html`, canonical extensionless): no directory index, one URL per article. The app sitemap
  lists the origin root only — one canonical per route beats thirty near-duplicates. `/llms.txt` says in its
  own text that it is a non-standard convention. Referrals reuse `landing_viewed` + `source`.
- **FREE-1 (2026-10-28) — the situation count is the server's list, not the marketing rail.** Live
  `GET /scenarios` returns **49** rows (five are `exam_*`), so the home stat reads 49 and `/help` says
  «49 موقفاً في التطبيق»; the rail keeps six cards as a sampler and card 06 is the real `cafe_order`
  («المقهى / Was möchten Sie trinken?»). Cutting the number to 6 would have been the false fix.
- **FREE-1 (2026-10-28) — the voice answer is what the code does.** `cloudflare-stt.js` sends the recording to
  Workers AI Whisper and stores nothing; `/ai/turn` logs no learner text; `/progress/sync` does store mistakes and
  session summaries — which is why the old «تبقى على جهازك» clause was deleted, not reworded. `/help` keeps the
  `#privacy` link.
- **AFF-1 (2026-10-28) — the code creates itself, and the site points at the screen that does it.** `/affiliate`
  no longer asks anyone to email an application: its CTA is `https://katzuai.com/partners`, and
  `POST /affiliate/me` finds-or-creates one `affiliates` row keyed by the account email — code derived from the
  local part, suffix attempts only on collision, `ON CONFLICT(code) DO NOTHING` so two racing requests merge
  instead of duplicating. The answer carries only code/status/rate/approval/minimum/methods: contact and payout
  details never leave the worker. Self-serve rows are `status:'active'`, `payout_method:'Wise'`,
  `payout_details:<email>` and `name` = the local part, so the owner can still reconcile a payout to a person.
- **AFF-1 (2026-10-28) — the three win labels are divs, not headings.** Under the page's single `<h1>` they read
  as a skipped level and Lighthouse dinged heading order; they are card labels, not document sections, so the
  type stayed (`font: 900 1.08rem Cairo`) and the semantics went (`.win .win-h`). a11y went 0.98 → 1.00.
- **Deploy scope (2026-10-28) — site + app only; the worker stays exactly as deployed.** `/partners` needs
  `POST /affiliate/me`, so until the owner authorises a worker deploy the screen is live and its one call is not;
  the Arabic retry state («تعذّر إنشاء رابطك الآن… أعد المحاولة») is the honest interim, not a hidden failure.

- **AFF-1 (2026-10-28) — the partner program is a separate system with one config source.** The in-app `REF-`
  rewards (`referral_payouts`, `awardVerifiedReferral`) are untouched; partner money lives in three new tables
  managed by `cloudflare-affiliate.js`, whose `AFFILIATE_CONFIG` is the only place the 20%, 14 days and $20
  live — the page's numbers are read from it at build time through esbuild, so copy and code cannot drift.
  Commission is `Math.round(netCents × 0.20)` (a $49.99 order → $10.00) and a refund after payout is a
  **negative `approved` row** with `order_ref` `refund:<original>`, so the next batch nets it without editing
  history. Approval runs on the daily `17 4 * * *` cron and lazily on admin reads; either way day 14 is the
  earliest date, never before.
- **AFF-1 (2026-10-28) — the affiliate tables are created by the Worker, with a documentation-only migration.**
  `ensureLedgerTables` executes idempotent `CREATE TABLE IF NOT EXISTS` + the partial unique index
  (`… WHERE order_ref NOT LIKE 'refund:%'`), so a fresh environment works without a manual step; the SQL file
  exists so a human can read the schema, not because a run must apply it. `tests/freshDatabase.test.ts`'s
  strict D1 double now models `CREATE UNIQUE INDEX`, which it previously ignored.
- **AFF-1 (2026-10-28) — attribution is one shared script and one cookie on the parent domain.** `ref.js`
  (generated, no dependency) writes `katzu_ref` for 30 days on `.katzuai.com`, pings the Worker once to reject
  unknown codes, and clears only on `unknown_code`/`malformed_code`; the site's `connect-src` names that same
  Worker origin and a guard test reads the origin out of the script. The app sends its cookie value with the
  Google sign-in call, so the server decides the attribution — a second browser cannot re-attribute an account.
- **AFF-1 (2026-10-28) — a new `scripts/site-content-affiliate.mjs` module instead of a bigger build file.**
  `build-website.mjs` was at the 500-line budget; the page copy, config bundling and capture script moved to a
  `site-content*.mjs` module (the owner's stated edit scope) and the build reads them as before. The page uses
  the existing inner-page shell (`.phead` + `.reveal`) exactly like `/pricing` and `/help`; no new color, font,
  card style or animation was added, and the home-only GSAP loader/pin-scroll was deliberately not copied.
- **AFF-1 (2026-10-28) — the home diff is exactly two lines, and that is the reviewable fact.** `website/index.html`
  differs from the shipped design only by the footer `الشركاء` link and one `<script src="/assets/ref.js" defer>`
  tag; `git diff website/index.html` is the proof. `/pricing` and `/help` gained the same footer link, the FAQ
  row and two privacy sentences only. The owner's home design is otherwise untouched.


> **Older decisions (2026-10-19 and earlier — V8–V18, the September deploy authorizations, the first ENV
> probe) moved verbatim to `docs/agent/ARCHIVE-AGENT-STATE.md` on 2026-10-30**, when this file sat 45 bytes
> under its 80 KB cap. Nothing was deleted or rewritten: `grep -n "V14" docs/agent/ARCHIVE-AGENT-STATE.md`
> finds each one. New decisions stay here; anything older than the current batch belongs in the archive.

## UNPROVEN

> Resolved and historical claims are in `docs/agent/ARCHIVE-AGENT-STATE.md` under the same heading.

- **GEO-1 (2026-10-29) — crawlability is verified; being cited is not.** `robots.txt`, sitemap and JSON-LD
  are machine-checked live, but nobody has asked the 30 Arabic panel yet, so there is **zero** evidence that
  any assistant mentions or cites Katzu, and `/llms.txt` has no published effect. Measured instead: Cloudflare
  answers GPTBot, ClaudeBot and PerplexityBot `403` on HTML and the sitemap (robots.txt is 200), and its managed
  block disallows them before our groups — a dashboard setting.
- **AFF-1 (2026-10-28) — the partner money path is unit-proven and now deployed, not live-proven.** Live, after the deploy: `/health` 200 with `storage:{d1,kv}` ok, `POST /affiliate/me` **401** signed out, `POST /affiliate/ref` **400** on a malformed code, `/admin/api/affiliates[/commissions]` **401** without the key, and the three tables present in production D1 (`sqlite_master` read). **Not live-proven:** the Google sign-in attach (Google-only sign-in; an agent must not use a real account), a real `/affiliate/me` code for a real account, the commission row created by a real activation-code redemption inside the app, the day-14 cron on real data, and a real refund after payout. All the rules are covered by the 32 tests in `tests/affiliate.test.ts` against a D1 double, which proves the rules, not D1's atomicity.

- **Google Sign-In: the popup → credential → session path is UNPROVEN end-to-end (2026-10-27).** Live, the GIS script, its stylesheet, its button iframe and its font all return **200** under the production CSP, and Google's button renders in both a clean profile and a service-worker-controlled one — but nothing closed the loop, because that needs a real Google account an agent must not touch. Proven instead: delaying `/gsi/client` by 2.5 s on the local build shows the neutral "preparing" notice (no false "could not load"), and after the script arrives the real button replaces the fallback; a hard `ERR_FAILED` on the first request is followed by a tap that re-injects the script and lands on Google's button (`gsi-local.json`, `gsi-retry.mjs`). What remains unproven is only Google's own credential response through `exchangeGoogleToken` → session → sync.

- **PWA upgrade across the deployed fix is UNPROVEN as a cross-version path (2026-10-27).** The population that had the pre-fix worker was not reproducible after deploy (the old precache belonged to an unreachable tree). Verified instead in a persistent profile against `https://katzuai.com`: the new SW installs and activates (**~70 s**, 122 precache entries ≈ 4.9 MB — a real first-visit cost), `navigator.serviceWorker.ready` resolves, a reload takes control, and `/signin` then boots under that controller with Google's button rendered and no alert. A browser that already holds the old SW is covered by the same `navigateFallbackDenylist` + `skipWaiting`/`clientsClaim` in the shipped `sw.js`, but that transition was not observed from an old cache.

- **AI-POOL: preset gateway/model names are prefills, not verified endpoints (2026-10-18).** `AI_PRESETS` in the dashboard and the `PROVIDER_POOL` defaults carry model ids (`thinkingmachines/inkling-small:free`, `openai/gpt-oss-20b`, and the preset fills for Groq/OpenAI/DeepSeek/Mistral/Together/Fireworks/Cerebras/xAI/Google) that nobody has validated against the live providers this session; the Test button is the intended validator. OpenRouter's rpd 50 is the repo's own recorded figure, not re-measured.

- **AI-POOL: the dashboard tab and the admin endpoints are unit-proven only (2026-10-18).** The provider store, masking and validation have 22 tests, and the route suites cover the merged pool through the worker, but the dashboard UI has not been opened in a browser and the five admin actions have no direct HTTP-level test; serving runs the pool that `callAiRouter` receives at request time (covered at route level) rather than an on-wrangler-dev integration run.

- **AI-POOL: nothing was verified against production or deployed (2026-10-18).** No deploy authorization was given; production still runs the old Gemini-first worker, and until the owner adds OpenRouter/NVIDIA keys the new code would serve everything off the Workers AI fallback.

- **Browser suite: 117/121 against the built bundle (2026-10-15, this session), and the 3 failures are unclassified.** `E2E_TARGET=preview npx playwright test --project=chromium` on the production bundle gave **117 passed / 3 failed / 1 skipped (12.1 min)**. A focused re-run of the three failing spec files gave **11 passed / 2 failed** and a *different* pair failed, so at least one failure is intermittent. The failing tests cluster on screens whose source files carry **another session's uncommitted edits** (`src/features/auth/SignInScreen.tsx` — the `/mock` "sign in with Google" assertion; `src/features/trail/TrailScreen.tsx` — the 44px Trail targets; `src/App.tsx` — the referral-link copy), and this batch changes **no** app or spec file, so the correlation is real but causation is **UNPROVEN**: nobody has re-run these specs on a clean `src/` tree. Owner of the fix: whoever owns those uncommitted screen changes. `e2e/auditedScreens.spec.ts:22` ("a failed send keeps the round counter honest") failed in both runs and is the one to start with. Port note: the run used a throwaway config in the OS temp dir identical to `playwright.config.ts` except for port 3100, because a dev server started by another session holds 3000.

- B3: loader dry run executed locally via the new secretless `--dry-run` (both modules pass, counts recorded in OWNER-OPEN); the **remote/network dry-run and any real load remain unrun** — they need the owner's `ADMIN_SECRET`. The app-side seed layer is tested on fake-indexeddb, not on a real device database.

- B3: no human review of module2 content; review attribution is AI self-review only.

- **RC-6: nothing was verified against production**, because nothing was deployed. The live worker, Pages production, D1 and the sales site are unchanged and still running the pre-hardening code from `22fe6aa`.

- **NEW V8-F1, open (tooling, not a deploy blocker): `wrangler dev --local` cannot boot the real worker entry.** workerd rejects the entry module's non-function named exports (`export const RATE_LIMIT_RETENTION_MS` / `ERROR_REPORT_RETENTION_MS`, added in `c3ee78d`) with `Incorrect type for map entry 'ERROR_REPORT_RETENTION_MS': the provided value is not of type 'function or ExportedHandler'`, and the runtime never starts. Production accepts the same file (the V7 deploy serves `/health` from it), so this is a wrangler-4.136.3 local-config gap, not a deploy risk. Workaround used by V8-2: run `wrangler dev <wrapper.js>` where the wrapper is `export { default } from "../../cloudflare-unified-worker.js"`, which leaves the code under test byte-identical. Anything else that needs a local worker (a future integration harness, a seed script) hits this first.

- **V9: the admin failure counter's `INSERT`-then-increment path is not unit-tested.** `FreshD1` models a real empty database (a statement against a missing table throws) but **not** a real `PRIMARY KEY`: a duplicate `INSERT` does not raise, so the double cannot reach the “insert throws → increment the existing row” branch that both `recordAdminAuthFailure` and `checkGlobalRateLimit` rely on. That branch is proven against real SQLite by the V9 probe (N3b: exactly one `admin-auth-fail:` row with `count: 5`; N3 `[401×5, 429]`) and the *contract* is pinned by the injected-recorder tests, but a unit-level test of the increment needs a PK-aware double. Deliberately not half-modelled in V9.

- Lighthouse **has now been run** (V9-10, Phase 5 — mobile, production, Lighthouse 13.5.0), which closes RC-1's "no evidence at all" status. Two limits stay on that evidence: the numbers were taken on a machine whose anti-virus injects a 172 KB script into every page (`gc.kis.v2.scr.kaspersky-labs.com/…/main.js`), so the absolute timings are pessimistic and no clean-machine baseline exists; and the Trail route itself is still unmeasured, because `/app/trail` redirected to `/welcome` without an account. The three app-side causes in V9-10 are evidenced from the app's own resources, not from that injected script.

- Visual preview inspection, 360px/390px screenshots, offline network-drop recording behavior, and axe scans remain unverified.

- **V12: the content load has still never completed, and the `grammar` write path has never once succeeded in production.** Live content stays 5 / 114 / 20 / 4 and the two drafts' grammar rows are proven unloadable until the live table gains `rule_de`, `rule_ar`, `example_ar`. The vocabulary and starter_phrases writes *did* succeed this run (42 + 42 rows, HTTP 200 each) and were then deleted on purpose, so their insertion path is now proven against the deployed worker — but their **persistence** is not: no load has ever stayed.

- **V12: the live content schema is unversioned and known only by inspection.** `pragma_table_info` was read for `grammar` only; there is no repo artifact to diff `scenarios`, `vocabulary` or `starter_phrases` against, so a drifted column in a table this run happened not to touch would have shown up nowhere. A future run should record all four tables' `pragma_table_info` before writing.

- **V12: the B2 grammar-link path is dead in production, inferred from code + schema rather than observed end to end.** `resolvePracticeGrammar` names three columns the live table lacks and swallows the resulting D1 error, so it can only ever return `null`; confirming the learner-visible consequence needs a signed-in AI turn, which this run cannot make.

- **V13: the loader's new preflight has never fired against a real deployment.** It is pinned by unit tests against the *recorded* production column list and by construction (one real row read, `SELECT *`, before the first POST), but no end-to-end run has been refused by it — pointing `--commit` at production would either abort, proving the guard at the cost of a live authenticated session, or write 89 rows again if the guard were wrong. The next authorized load is where it fires for real. The same gap covers the additive self-heal: `ensureContentColumns`' new grammar entries are deployed by nothing yet, so a *fresh* deployment is still unproven until one is made.

- **V14: `resolvePracticeGrammar` is proven at the query level in production, not observed end to end.** The exact SQL it runs — same column list, same parameter — returns a row for a loaded scenario, and the function's only failure mode (a D1 error swallowed by its `try/catch`) is gone. Reaching the function itself needs an authenticated AI turn with a Guided Practice grammar id, which a logged-out run cannot produce; the public demo deliberately makes no AI call.

- **V15: the drift check compares production against the *drafts*, so "no drift" is not the same as "production is correct".** Rows no draft declares — the whole pre-module catalogue, and the four legacy `grammar` rows — are counted and deliberately not compared, because the modules are additive. It also cannot tell *why* a key was already live; it reports the class and the live id, and the reasoning (the loader's skip rule) comes from the runbook. Treat a green run as "the repo and the deployment agree about everything the repo owns", not as a content-quality check.

- **V14: the supplement is reviewed but unloaded, and its German fix is unshipped.** `docs/content/supplements/grammar-basics.json` and the matching fixture edit in `src/lib/db/katzuDb.ts` are committed, but the fixture edit needs a Pages deploy to reach learners and the D1 rows need an owner decision to be inserted at all.

### Per-scenario confidence notes (module2) — what a human should spot-check first

- `airport_arrival`: highest confidence overall. Spot-check the German of the b2 opener ("Seit Ihrer Ankunft fehlt also Ihr Gepäck") for the slightly emphatic "also", and the Arabic plural in "خبزتان صغيرتان" against natural spoken usage.

- `train_station`: high confidence. Spot-check that "Bahn katze" matches any live D1 persona row before loading (it is copied from the local fixture, and D1 wins).

- `bakery_shopping`: high confidence. Spot-check "Darf es sonst noch etwas sein?" — idiomatic but register-sensitive; a native speaker may prefer a variant.

- `landlord_followup`: medium confidence (new scenario). Spot-check the b1 opener's elliptical confirmation ("Sie haben gesagt, die Heizung ist kaputt?") and that the phrasing stays natural for a phone call; also confirm the Vermieter katze persona continuity with apartment_viewing is desired on live D1.

- `friend_catchup`: medium confidence (new scenario, du register). Spot-check "Na, wie geht es dir? Erzähl mal!" for tone and the whole scenario for level-appropriate informality; it is the module's only du-register scene.

## OWNER-OPEN

> Resolved and historical owner items are in `docs/agent/ARCHIVE-AGENT-STATE.md`.

- **Being findable needs two owner steps, and neither is code (SEO-1, GEO-1, 2026-10-29).** (1) Verify
  `katzuai.com` in Google Search Console (one TXT record in Cloudflare), submit both sitemaps, import into Bing,
  run `npm run seo:indexnow` — `docs/agent/GEO-VISIBILITY.md` §5. (2) Read the twelve guides and reply "fine" or
  the lines to change (§7), run the 30-prompt panel monthly (§2–§4), and send real LinkedIn / GitHub / X URLs for
  `sameAs` (§8). A live `403`/`429` for any crawler is Cloudflare **Security → Bots / WAF**. Done: both sitemaps
  "Success", one panel table.

- **The partner program is live end to end except the two things only you can do — the two-account test and the payout day (AFF-1, 2026-10-28).** The Worker is deployed: the three tables exist in production D1, `POST /affiliate/me` mints a code for a signed-in account (so `/partners` no longer shows «تعذّر إنشاء رابطك الآن»), `POST /affiliate/ref` validates a code, and the owner-only `/admin/api/affiliates*` routes answer 401 without the key. **What is still unproven is the money path with real accounts**, because it needs two interactive Google sign-ins and an authorised admin read: learner A opens `/partners`, copies the link; learner B signs up through it, pays, redeems the code; A's `/partners` and the commissions report must show one `pending` commission, then the test rows get deleted. **Also:** the endpoints you named — `/affiliate/enroll` and `/affiliate/me/payout` — do not exist in this codebase and never did; the working surface is `/affiliate/me` (self-serve, no application) plus `/admin/api/affiliates/{create,void,payout}` behind your key, so nothing was invented to match the names. **Two decisions stay yours:** the weekly payout day (batches are prepared **Monday**, UTC) and whether **$20** stays the minimum. Done looks like: a real referred learner shows `pending`, and the first payout is marked paid with its reference.

- **The order path needs your payment details before a learner can pay (V44-1, 2026-10-28).** No local payment method is configured, so `/pricing#pay` ships the three honest steps and a single `mailto:support@ghaidak.com` button — never a `FILL`, never "unavailable", never a crypto block that cannot take money. To turn that into a real checkout, send: the **Telegram handle** orders may go to, the **Syriatel Cash** and **MTN Cash** numbers (and whose name is on them), the **bank** name, account holder and IBAN, and which currencies you want to collect in. Done looks like: the owner sends those details and the agent adds them to `pricing.config.json` + `src/lib/offers/paymentInstructions.ts` and the `/pricing#pay` block, then proves the page renders them.

- **Four legal fields are still open, and they are yours to state — not the agent's to invent (V44-2, 2026-10-28).** `src/lib/trust/content.ts` publishes privacy, terms and refund in full, but deliberately leaves out: the **governing law**, the **publisher's legal identity and address**, any **commercial-register / supervisory authority** number, and the **dispute-resolution forum**. They are not printed as placeholders either — the sentence is simply absent, which is honest but incomplete. Done looks like: the owner states each in one sentence and the agent adds it to the terms section, `OWNER-CHECKLIST.md` and the ledger.

- **The AI pool needs your keys before OpenRouter/NVIDIA serve anything (AI-POOL, 2026-10-18).** The default provider pool is now NVIDIA + OpenRouter only and you edit it from the admin dashboard's new **AI Providers** tab — add custom gateways (base URL + model + format + tier + key), disable a default, or pick a preset (OpenRouter, NVIDIA, Groq, Google AI Studio, OpenAI, DeepSeek, Mistral, Together, Fireworks, Cerebras, xAI, Custom). Keys pasted there are stored server-side and never shown again (only a masked fingerprint). Today both key lists are still EMPTY, so until you paste keys in the dashboard or run `npx wrangler secret put OPENROUTER_API_KEYS` / `NVIDIA_API_KEYS`, every AI turn rides the free Workers AI fallback (works, but capped at 700 tokens and lower quality). Done looks like: the AI Providers tab shows a green "OK in N ms" next to the Test button for at least one entry.

- **Nothing is left to load — the content set is complete and verified (V18-2).** `docs/content/supplements/grammar-basics.json` and both modules are in D1: **15 scenarios / 221 vocabulary / 111 phrases / 22 grammar**, `node scripts/check-content-drift.mjs` exits **0** with 0 absent, 0 pending and 0 duplicate keys, and every module/supplement grammar row is reachable from `SCENARIO_GRAMMAR_IDS` (18 of 22; the other 4 are the legacy rows below). Remaining content work is *authoring volume*, not loading.

- **A cohort needs a URL before it needs anything else (V18-3).** `https://katzu-webapp-v3.pages.dev` works today and is what a closed beta can be handed, but `public/robots.txt` and `public/sitemap.xml` advertise `https://katzu.app/`, which does not resolve, and any store or payment-provider listing will want a host you control. Decide: attach `katzu.app` (then update `ALLOWED_ORIGINS` + `VITE_PUBLIC_APP_URL` + the two static files), or accept the `pages.dev` host for the beta and revisit before a public launch.

- **Real-device voice is still the largest unverified surface (V18-3).** Every voice path in the repo runs against Chromium's fake device; the 14-row checklist in `docs/agent/OWNER-STEPS.md` §2 is the only honest way to close it, and it needs two phones. This is the first thing `docs/agent/BETA-KIT.md` asks for on day 10.

- **Payments stay off for the beta (V18, decision above).** `/crypto/health` reading `ready:false` is the correct state, not a gap to close before the cohort starts.

- **Update this machine's Node to ≥ 24.15.0 — CI now runs 24.15.0 and `engines.node` says `^22.22.2 || ^24.15.0 || >=26.0.0` (V17-1).** The local machine is 24.14.0, one patch below **jsdom 30.1.1**'s declared `^24.15.0`, so `npm ci` prints `npm warn EBADENGINE Unsupported engine { package: 'katzu-web@1.1.0', required: { node: '^22.22.2 || ^24.15.0 || >=26.0.0' }, current: { node: 'v24.14.0' } }` **and the whole suite still passes** — this is a declaration-vs-machine gap, not a failure, which is why it is a note and not a blocker. Fix, one command: `nvm install 24.15.0 && nvm use 24.15.0` (or `winget upgrade OpenJS.NodeJS.LTS`), then confirm with `node -v` and `npm ci` printing no `EBADENGINE` line. Recorded here rather than fixed, because installing a runtime is outside what an agent may change on this machine (`docs/agent/ENV-FACTS.md` §C/§H).

- **Content-load drift check — run `node scripts/check-content-drift.mjs` after any content change (V15-3).** Read-only (`GET`s on the four public endpoints, never the admin ones), exits non-zero when production disagrees with the drafts, and classifies each difference so a by-design skip is not read as a failed load. Current state: scenarios 10/10 and phrases 91/91 identical, grammar 14 identical + 4 pending, vocabulary 104 identical + 19 diverged (all 19 rows the loader skipped by its own rule), 3 duplicate keys across the two modules.

- **Content-load history (V11/V12) moved out on 2026-10-28** to `docs/agent/ARCHIVE-AGENT-STATE.md`
  (search `CONTENT-LOAD V11/V12 moved`): the wrapped-secret 401 and the missing `grammar` columns are
  superseded by V18-2 — the set is complete and `check-content-drift.mjs` exits 0.

- Existing `docs/LAUNCH-CHECKLIST.md` §2 owner-only actions remain untouched.

- **Two Worker-side settings the release depends on** (owner-only, both are deploy-time changes):
  **both are now applied (V9-7, deployed in V9-8).** `MAINTENANCE_MODE` is present in `[vars]` as `"off"`, so the emergency stop is now just turning it to `"on"` on the running Worker (§6.5 of `docs/LAUNCH-CHECKLIST.md`); and `[triggers] crons = ["17 4 * * *"]` is deployed, so retention runs automatically at 04:17 UTC instead of depending on a hand-run `POST /admin/sweep`.

- **Before running the module2 loader**, note a draft/live title difference: `curriculum-arrival-module2.json` titles the opening `airport_arrival` as "Am Flughafen: das Gepäck" / "في المطار: الأمتعة", while the live fixture and the story call it "Am Flughafen: fehlendes Gepäck" / "في المطار: الأمتعة المفقودة". `--commit` would soften the opening episode's title. Left unchanged because §4 forbids rewriting an approved module's rows in place; the owner decides whether to align the draft (and re-review) or accept the change.
