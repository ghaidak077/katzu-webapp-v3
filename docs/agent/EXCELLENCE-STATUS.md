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
