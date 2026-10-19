# Katzu Excellence — current execution status

Updated: 2026-10-04. Base: local `main` at `1a72827`. **Local, uncommitted, not deployed.**
Roadmap: [008 master plan](../../plans/008-katzu-excellence-master-plan.md).
Shared rules: [AGENTS.md](../../AGENTS.md); [CLAUDE.md](../../CLAUDE.md) delegates to them.

## Batch 1

| Item | State | Evidence / limit |
|---|---|---|
| A1 account-owned queue and cleanup | Partial, implemented | Six real IndexedDB regressions: four original defects failed before repair; owner-alias continuity also passes. Snapshots retained by account; unowned legacy snapshots quarantined. Sign-out clears derived patterns/stored report and App report state. Progress/review response adoption guarded by session and transactions. Full conversation/sign-in in-flight lifecycle, cross-tab same-token epoch, recovery disclosure/export and account-delete retained-queue policy remain outstanding; do not mark full A1 complete. |
| A2 A0/order scenario fields | Targeted defect fixed | Detail mapper preserves `initial_message_a0` and `sequence_order`; regression failed before repair. Broader validated DTO mapper remains planned. |
| A3 offline topic-only filter | Targeted defect fixed | Indexed topic fallback; housing/missing-topic regression failed before repair. Broader query parity matrix remains planned. |
| A6 schema bootstrap recovery | Implemented | Binding-scoped WeakMap; failed attempts removed; retry/binding regression failed before repair. Real local D1 proof remains planned. |
| Agent environment/docs | Implemented | Owner-only AGENTS §3 unchanged; automatic commit rules removed; CLAUDE delegates; current overlays supersede stale historical claims. README Node floor corrected; APP-MAP correctly identifies React Query/Zod as unused declarations. |

## Verification

- `npm run lint`: passed after source repair (TypeScript source check).
- `npm run test:e2e:types`: passed.
- `node --check cloudflare-content-schema.js`: passed.
- Full unit suite after source changes: **114 files / 1,419 tests passed** on final source.
- Before-repair isolation tests: 4 failed / 1 passed; before-repair content/schema regressions: 3 failed / 8 passed.
- One existing registry assertion required correction: per-binding bootstrap legitimately adds five columns. It now asserts exactly five `ALTER TABLE ... ADD COLUMN ... TEXT` statements and rejects any other/destructive schema change, rather than incorrectly requiring no ALTER at all.
- Production-build browser suite: **80/80 passed (4.7 minutes)** before the final owner-email-alias addition. Final rebuilt artifact: **13/13 affected browser tests passed (51.1 seconds)**, including the new real UI sign-out/IndexedDB/report cleanup test, modes, onboarding, and skill surfaces.
- Final `npm run design` and simplicity gate: passed. Production build passed through the final Playwright preview harness; entry chunk still exceeds Vite's 500 kB warning threshold (not suppressed).
- Local documentation links and `git diff --check`: verified; AGENTS §3 byte-for-byte matches HEAD. No new commit, deployment, secret operation, or production write.

## Data/compatibility behavior

No server endpoint/schema changes, no production writes, no new IndexedDB table/version.
User `accountId`, queue `ownerAccountId`, and scenario `sequence_order` are additive fields.
New sign-ins capture the Google subject only after successful server session exchange. Existing
signed-in rows can bind new work to normalized email until sign-in supplies the subject; replay
accepts both the subject and the same authenticated user's normalized email alias, with regression coverage.
Legacy queue rows without an owner are retained but never automatically attributed or uploaded.
Retained snapshots contain learning data, not bearer credentials; retention/export/delete UX still
needs explicit follow-up before describing preservation as a complete account lifecycle.

## Remaining prioritized work

1. Finish A1: in-flight conversation/sign-in/cross-tab lifecycle, recovery disclosure and retained-queue export/delete policy.
2. A4 actual-byte request reading; A5 atomic scoped rate limiting with real local D1 tests.
3. A7 bounded sync containment; B1 production-build CI selection; B2/B3 permanent real SW/data-engine coverage.
4. Then C contract/transport hygiene and tooling dependency triage. No major forced upgrades.

No performance improvement is claimed. No current remote CI or production behavior was verified.
Local Node 24.14.0 is below the declared floor; supported-runtime verification remains needed.
Existing untracked SQL backups are untouched. Historical ledger/readiness documents are provenance,
not execution authorization. No commits/pushes/PRs/merges/deployments were requested or performed.

NEXT: complete remaining A1 acceptance criteria, then A4/A5; preserve verified small batches.

## Batch 2 — experience / interface / motion (2026-10-04, owner-approved)

Plan: [009](../../plans/009-coordinated-experience-interface-motion-audit.md). Implemented with the
owner's one approval; **not committed and not deployed.** Deployment stayed blocked because no
`DEPLOY-AUTHORIZED:` line was supplied (the owner chose local verification first).

Done: honest upgrade/paywall/trail/report copy (no false "unlimited" or "no points"), A0–B2 level
range, non-judgmental preparation copy, writing skill no longer claimed to decide the certificate;
busy `Button` keeps its accessible name (`aria-busy` + `sr-only`); `Modal`/`BottomSheet` are real
dialogs (role, focus trap, Escape, focus restore) via new `src/components/ui/useModalDialog.ts`;
scrim fade covered by reduced motion; FAQ glyph no longer animates; `SiriWave` reads the motion
preference live; grammar path has a back button; one `<main>` per page; demo-first hero.

Verification on the final source: `tsc` 0; **115 files / 1429 unit tests**; e2e types 0;
`design-audit` 0 and contrast 0; `node --check` on the worker 0; `build` 0 (entry-chunk >500 kB
warning retained); production-dependency audit 0 vulnerabilities; **`E2E_TARGET=preview` 81/81
passed**. New regression file: `tests/interfaceContracts.test.ts`.

Not done, still unproven: Trail / `/dev/system` overflow root cause; the four unattributed 404s;
full loading/error/offline/interruption matrix; real OAuth/payment; real device, screen reader and
200 % zoom; the visual-craft and journey-resilience batches (need the rendered-screenshot loop,
which was unavailable). No CI or production behaviour was verified.

## Batch 3 — overflow + 404 classification, 2026-10-04 (same plan 009)

The two items above are now **closed with measurement**. The screenshot renderer recovered.

- **Overflow**: the ambient `BorderBeam` halo (`inset: -30px`, unclipped) was widening the page.
  Measured `scrollWidth` 325 at 320 and 394 at 390 on both routes → **320 / 390** after adding
  `overflow-x-clip` to the app shell (`App.tsx`; `clip` keeps the fixed nav and creates no scroll
  container). The nav's glass union is an `overflow-hidden` false positive, not a contributor.
- **The four 404s**: `workerClient.getReferralInfo()` fired a same-origin `POST /referral/info`
  when no worker origin is configured (Profile screen). Guarded in `getReferralInfo`/`claimReferral`;
  an 18-route sweep is now clean.
- **Hero-video slot**: `res.ok` wrongly accepted the SPA fallback (200 `text/html`); now requires a
  `video/*` content type, so a never-shipped video no longer renders a broken player.
- **Visual pass**: viewport captures at 320/390 of Trail/Practice/Progress/Profile/Library/dev-system
  reviewed by eye — coherent, no further must-fix defect. First real visual read, not a "stunning"
  claim and not a full matrix.

Verification on the final artifact: `tsc` 0; `tsc -p e2e` 0; **115 files / 1432 unit tests**;
`design-audit` 0; contrast 0; `node --check` 0; production audit 0; `build` 0; **`E2E_TARGET=preview`
81/81 passed**. New tests: +2 cases in `tests/interfaceContracts.test.ts`, +1 in
`tests/workerClient.test.ts`. Still **uncommitted and not deployed** (no `DEPLOY-AUTHORIZED:` line).
Still unproven: full route-state matrix, real OAuth/payment/device/screen-reader/200 % zoom, and the
batch 5 remainder / batch 6 journey resilience.

## Deploy record — 2026-10-04 (`DEPLOY-AUTHORIZED: merge, worker, pages`)

- **merge:** `main` pushed `1a72827..633319b` (no force). Pages builds from git on push.
- **worker:** `npm run deploy:worker` → `katzu-test`, version
  **`66e1c99d-b8aa-4f93-ba05-2a8b60270c88`** (was `aafcf3bf-8307-4e20-bca6-240a075c8dd3`).
  Verified: `/health` = `{status,service,ready,maintenance}` only; `/crypto/health` unchanged
  (`ready:false`); unauth `/admin/api/overview` and `/admin/schema` → **401**.
- **pages:** deployment **`4cf0d3a7-8e66-4eb4-b056-dcbb05a38631`** (source `633319b`, Production).
  Verified: `https://katzu-webapp-v3.pages.dev/` → 200, serving `assets/index-Cipqt6LI.js` (was
  `index-CfZ6VaJV.js`), `sw.js` → 200; `/demo` loads with **no account and no `/ai/` call**, the
  service worker registers and controls, and all content fetches (`/scenarios`, `/vocabulary`,
  `/grammar`) return 200 with zero console errors.
- **Rollback:** worker `npx wrangler rollback aafcf3bf-8307-4e20-bca6-240a075c8dd3`; Pages previous
  production deployment `d97e280e-bd66-4669-a27b-0a5c3beb6365` (source `1a72827`).
- **Substitution, recorded honestly:** the public-demo smoke loaded the production `/demo` and
  confirmed no account + no AI call on load, service-worker registration and clean network — it did
  **not** submit a live demo turn, to avoid spending the production AI key. The demo e2e spec could
  not be run as-is against the remote origin because its harness mocks all non-localhost traffic.

## Deploy record — 2026-10-04 (V38, `DEPLOY-AUTHORIZED: merge, worker, pages`)

**Batch:** the install-icon fix (opaque, correctly-sized manifest icons + the iOS apple-touch-icon)
and the conversation polish (a full-size centred thinking card, a centred voice orb, 44px composer
controls, and an orb that yields pixels on short phones so the transcript keeps half the screen).
Gates: `tsc` ×2 clean · `npm test` **116 files / 1437 tests** · Playwright **81 passed** · build OK ·
`node --check cloudflare-unified-worker.js` clean · design-audit / contrast clean · `npm audit` 0.

- **merge:** committed the tree to `main` as `93653dc`, pushed `3776b1c..93653dc` (no force). Pages
  builds from git on push.
- **worker:** `npm run deploy:worker` → `katzu-test`, version
  **`4d34c8eb-6047-4b4a-a859-cea43d673e1f`** (was `66e1c99d-b8aa-4f93-ba05-2a8b60270c88`).
  Verified: `/health` = `{status,service,ready,maintenance}` only; `/crypto/health` unchanged
  (`ready:false`); unauth `/admin/api/overview` and `/admin/schema` → **401**.
- **pages:** deployment **`ef91fad7-f5d9-4764-8e7f-f93952808bdb`** (source `93653dc`, Production).
  Verified: `https://katzu-webapp-v3.pages.dev/` → 200 serving **`assets/index-DHO4J2Da.js`** (was
  `index-Cipqt6LI.js`); the four icons serve 200 at exact byte sizes
  (25 487 / 128 393 / 89 590 / 22 649); `manifest.webmanifest` lists 3 icons; `/demo` loads with
  **no account and no `/ai/` call** (only `/analytics/events`); `scripts/verification-battery.cjs`
  **12/12** including SW active, precache **105** and offline navigation.
- **Rollback:** worker `npx wrangler rollback 66e1c99d-b8aa-4f93-ba05-2a8b60270c88`; Pages previous
  production deployment `d1d9c23b-f4e7-4965-8b42-360512f89052` (source `3776b1c`).
- **Substitution, recorded honestly:** the runbook's step-4 smoke names the demo e2e spec against the
  production URL, but its harness mocks all non-localhost traffic (`e2e/harness.ts:168`), so it
  cannot run against a remote origin; `verification-battery.cjs` (purpose-built, read-only) was used
  instead, and the no-AI-call clause was confirmed directly in a browser.
- **Not touched:** no secret change, no production D1 write, no owner-only item.

## Haptics + purposeful motion - browser-suite reds classified (2026-10-18)

The working tree's browser suite (`E2E_TARGET=preview npx playwright test`) was 138 passed / 2 skipped / **4 failed**. All four were re-run on the **base commit `e9ec954`** in a clean worktree (detached, `node_modules` junctioned, no working-tree changes, same three spec files - all three are unmodified in the working tree), with the run's own `--grep` on the four test titles:

- `ask.spec.ts` "the Practice tab opens Ask Katzu..." (failure at `:62`, a mistake row not written) - **fails on base** -> pre-existing, not caused by this batch.
- `simplicity.spec.ts` "a learner can reach sign-in from /welcome..." (failure at `:126`, the old `ابدأ رحلتك الآن` CTA is gone) - **fails on base** -> pre-existing.
- `deletionRequest.spec.ts:94` and `:112` - **pass on base**, fail in this tree. Cause proven without a second build: the uncommitted `src/features/settings/DeletionRequestScreen.tsx` renders the email field only when signed out (`signedIn === true ? ...اكتب حذف... : ...بريدك الإلكتروني...`, lines 165-189) while both specs call `bootSignedIn` first, so `getByLabel('بريدك الإلكتروني')` can never appear. That screen is not touched by the haptics/motion change; the specs and that edit belong to the session that owns that screen. No fix was made here.

Base worktree and its junction were removed after the run; nothing was committed from it.

## The four browser-suite reds — closed at the contracts, shipped green (2026-10-19)

The classification above stayed causal while the fixes were prepared; the launch-candidate branch now
carries them and CI proves it on the exact SHA (run `39191010113` for `2fa5acd`: **verify**, `launch-check`,
`secret-scan`, `e2e` all green — **e2e = 141 passed / 2 skipped / 0 failed**, the local `--ci --e2e` gate
over the same tree = **14/14**).

- `ask.spec.ts` (`7b52230`) was a **stale contract, not an app bug**: the live curriculum re-order in
  `0d01500` moved the translation-files row block, and the spec still expected the pre-reorder output.
  The spec now asserts that the corrected translation files carry **no mistakes row** and the
  wrong-reorder files carry one — the same contract `tests/askPractice.test.ts` pins — so the spec
  matches what the app has shipped since `0d01500` and CI's e2e agrees with its own unit suite.
- `simplicity.spec.ts` (`2fa5acd`) was also a **stale contract**: the pinned welcome CTA label
  (`إنشاء حساب جديد وابدأ`) is the screen's current copy, and the second failure was CI's own build
  difference: CI bundles without `VITE_GOOGLE_CLIENT_ID`, so the sign-in screen shows the honest
  unavailable line («تسجيل الدخول غير متاح الأن») instead of the Google button a mock'd local id
  produced. The spec now pins the current label and **accepts either rendering via `.or()`** — asserting
  what a learner can see in each build, not what one build happened to show.
- `deletionRequest.spec.ts` `:94`/`:112` are **green on `2fa5acd`** — the screen and its specs ship in
  one committed tree, so the label/modality mismatch the classification describes no longer exists. The
  2026-10-18 section above is kept unchanged as the causal record of how they were diagnosed; nothing
  was skipped or weakened to get green.

**Manual check on a real Android phone - NOT run by this session (no device on this machine, so every haptics claim stays `UNPROVEN` on hardware):**

1. Settings (Profile) - haptics switch ON; answer a quiz question **wrong** -> one short sideways shake, once, no repeat.
2. Answer one **right** -> the verdict row pops into place, no shake.
3. Open a conversation and start the mic -> the halo stays lit while listening and breathes clearly faster than when idle (1.4 s vs 3 s); it must not go dark at the moment listening starts.
4. Switch haptics OFF; repeat 1-2 -> the visuals still play but nothing vibrates anywhere (paywall button and the delete-account button included).
5. Haptics ON + Android "Remove animations" (Developer options) -> pop, shake and card flip are gone, while the green/red verdict and the correct/wrong text still appear.
