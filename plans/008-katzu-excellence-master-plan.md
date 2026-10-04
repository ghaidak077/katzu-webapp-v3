# Katzu Excellence Master Plan — 2026

**Status:** Owner approved autonomous local execution on 2026-10-04. This document alone grants no production/deploy/secret authorization. Current partial implementation and verification: [EXCELLENCE-STATUS](../docs/agent/EXCELLENCE-STATUS.md).
**Prepared:** 2026-10-04.
**Source baseline:** local `main`, commit `1a72827`, plus the read-only audit in this conversation.
**Purpose:** turn a promising Arabic-first German-learning PWA into a dependable, delightful product with a maintainable engineering foundation and measurable learning value.

> Excellence is not more screens, more animation, or more AI. It is a learner speaking German they could not speak before, understanding their next step, trusting their feedback, and never losing their work.

No plan can guarantee commercial success or superiority over every competing app. This plan makes that ambition testable: reliability, speed, independent learning, accessibility, retention, and operating cost—not marketing claims.

## Contents

1. [Direction and non-negotiables](#1-direction-and-non-negotiables)
2. [Evidence baseline](#2-evidence-baseline)
3. [Success scorecard](#3-success-scorecard)
4. [Architecture and compatibility rules](#4-architecture-and-compatibility-rules)
5. [Execution sequence](#5-execution-sequence)
6. [Phase A — Trust and correctness](#6-phase-a--trust-and-correctness)
7. [Phase B — Verification that reflects the shipped app](#7-phase-b--verification-that-reflects-the-shipped-app)
8. [Phase C — Clean, maintainable engineering](#8-phase-c--clean-maintainable-engineering)
9. [Phase D — Fast, resilient, scalable](#9-phase-d--fast-resilient-scalable)
10. [Phase E — An exceptional learning product](#10-phase-e--an-exceptional-learning-product)
11. [Phase F — Premium experience without visual noise](#11-phase-f--premium-experience-without-visual-noise)
12. [Phase G — Operate and grow responsibly](#12-phase-g--operate-and-grow-responsibly)
13. [Verification and release protocol](#13-verification-and-release-protocol)
14. [Cleanup policy](#14-cleanup-policy)
15. [Risk register and owner decisions](#15-risk-register-and-owner-decisions)
16. [Delivery checklist and first milestone](#16-delivery-checklist-and-first-milestone)

## 1. Direction and non-negotiables

### The product Katzu should win at

**A practical German-speaking companion for Arabic speakers navigating life in Germany.** Its advantage should be a better bridge from Arabic understanding to independent German production—not a generic chatbot with a language-learning skin.

The core experience remains:

**One relevant mission → useful vocabulary in context → supported rehearsal → real conversation → honest feedback → spaced recall → transfer to a new situation.**

The product should be:

- **Trustworthy:** account boundaries hold, progress survives, feedback admits uncertainty, paid access is server-controlled.
- **Clear:** every screen has one understandable primary action and a useful way out.
- **Fast:** meaningful content appears promptly on ordinary phones; interaction never feels held hostage by decorative rendering or a slow provider.
- **Helpful offline:** available lessons and reviews remain usable; synchronization state is understandable.
- **Arabic-native:** natural copy, correct RTL, isolated German, appropriate explanations of common Arabic-to-German difficulties.
- **Evidence-led:** independent production and delayed recall matter more than XP, taps, or completion counts.
- **Maintainable:** explicit contracts, small coherent modules, tests of behavior, reproducible data setup.

### Boundaries

Follow [AGENTS.md](../AGENTS.md) and [QUALITY.md](../docs/agent/QUALITY.md). This plan does not amend them.

- Keep React, TypeScript, Vite, Tailwind, React Router, Dexie, Workers, D1, KV, Vitest, and Playwright.
- No rewrite, second framework, second database, second state system, or speculative runtime dependency.
- Keep existing public routes, endpoint compatibility, data identities, offline behavior, and server-authoritative entitlements.
- No production writes, deploys, merges, secret operations, or content loads without the required separate authorization.
- Payments, OAuth audience, admin protection, domain, and legal decisions remain owner-controlled.
- No automatic commit/push/PR is authorized by this plan.
- Do not import a new third-party service merely to appear modern. If a real capability gap later justifies one, research options through Gravity Index and obtain the necessary owner decision.
- Preserve learner history. Cleanup is not permission to delete production data, backups, or stored progress.
- Existing motion plans are historical proposals, not confirmed current defects. Reconcile them against current code before execution.

## 2. Evidence baseline

These measurements come from the preceding audit, not current production telemetry. Re-baseline before implementation if the checkout changes.

| Area | Observed baseline | Interpretation |
|---|---|---|
| Repository | 505 tracked files; 155 under `src`; 112 passing unit spec files | Scope is manageable; raw workspace file counts include tooling outside the app |
| Unit tests | 1,410 passed | Strong regression foundation, not proof of complete coverage |
| Browser suite | 80/80 Chromium tests passed against dev server | Real UI behavior with mocked backend/auth; not full production-build certification |
| Type checks | Frontend and E2E passed | Worker JS is outside the frontend TypeScript boundary |
| Worker modules | All root Worker modules passed syntax checks | Syntax is not type/contract/concurrency verification |
| Build | Passed; entry 528.27 kB minified / 167.25 kB gzip | Initial payload deserves measured attention |
| PWA | 101 precache entries / 4,304.16 KiB | Offline reload passed after full installation; install size can improve |
| Production dependencies | npm audit reported zero | Does not cover every deployed behavior or unknown vulnerability |
| Full dependency graph | 9 reported issues: 6 high, 2 moderate, 1 low | Tooling updates need individual review, not forced blanket upgrades |
| Extra unused checks | 20 diagnostics | Includes unused imports, parameters, locals, and an unused helper |
| Explicit frontend `any` | 59 AST type nodes | Concentrated contract-hardening opportunity |
| Largest modules | Worker 3,738 lines; client 1,564; live hook 1,138 | Several unrelated concerns share large edit surfaces |
| Redundant public assets | 639,501 byte-identical bytes beyond first copies | URLs may be intentional aliases; consolidate references before deletion |
| Orphaned frontend modules | No obvious app orphan; curriculum audit used outside main graph | Do not delete modules simply because the app does not import them |

### Confirmed audit defects

1. Account A's queued progress survives sign-out and can be replayed with account B's token. Reproduced with isolated synthetic browser data and intercepted requests.
2. Sign-out leaves memory patterns and cached session-report storage; app report state is also not explicitly reset.
3. Detail-response mapping drops `initial_message_a0` and `sequence_order` before overwriting the scenario row. Reproduced locally.
4. Topic-only offline vocabulary queries return other topics. Reproduced locally.
5. The general body-size ceiling relies on `Content-Length`; a 70,012-byte request without it reached the handler instead of receiving 413.
6. Content schema initialization remembers a failed promise after a transient outage; recovery did not cause another DB attempt.
7. CI's browser job says preview but does not select `E2E_TARGET=preview`; configuration defaults to dev.

### Source-supported risks, not production incident claims

- Rate-limit read/modify/write is non-atomic; fallback does not preserve scoped limits. Real-D1 concurrency remains to be measured.
- Full-history upload grows with sessions/mistakes; 250 representative session summaries alone serialized to 75,413 bytes, above 65,536 bytes. Exact failure depends on transport/header behavior; that header loophole is not an acceptable solution.
- Full snapshots accumulate after repeated sync failures, and several screens read entire IndexedDB tables.
- Schema bootstrap runs on request paths; documented migration files are not an automated runner.
- Existing docs contain stale stack, runtime, and status claims.

## 3. Success scorecard

**The numbers below are proposed targets, not achieved results.** First establish representative baselines; change targets only with documented product/resource reasoning, never simply to turn a failing gate green.

| Dimension | Proposed acceptance target | Measurement |
|---|---|---|
| Account isolation | Zero cross-account payloads, cached reports, or late writes | A→sign-out→B tests with offline queues and delayed requests |
| Progress durability | No accepted event lost or counted twice in defined supported scenarios | Real local D1/KV integration, restart and conflict tests |
| UI reliability | Zero known unhandled errors in supported core journeys | Browser error capture + privacy-safe operational aggregates |
| Accessibility | WCAG 2.2 AA for supported core flows, no serious/critical axe findings | Automated scans + keyboard, focus, zoom, screen-reader review |
| Web experience | Field p75 LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 when sample is meaningful | Privacy-safe field measurement, separated by route/device/connectivity |
| Lab regressions | No >10% regression in deciding route timing without explicit tradeoff | Same hardware, production artifact, ≥5 runs, report median and spread |
| Initial transfer | Aim for ≤150 kB gzip eager entry and ≤350 kB critical-path transfer on landing | Actual dependency waterfall; chunk renaming alone is not a win |
| Offline installation | Aim for ≤3 MiB required precache while preserving required content | Generated manifest and actual complete offline installation |
| Local responsiveness | At 10k sessions / 20k mistakes / 10k review items, indexed primary queries p95 ≤100 ms on agreed reference device | Synthetic representative data; include derivation/render cost separately |
| Sync scale | Supported large histories converge through bounded batches; no permanent retry loop | 10k-session/multi-device/adversarial integration runs |
| Learning accuracy | ≥95% precision on a human-adjudicated held-out correction set, with abstention reported | Level/scenario/source stratification; never score only existing fixtures |
| Learning outcome | Improvement in independent production and 7-day delayed recall | Baseline/return tasks with assistance accounted for |
| Usability | ≥80% of a small target-user cohort completes first mission without coaching | Observe 8–12 learners first; record sample size and uncertainty |
| AI economics | Exactly one fused generation per submitted conversation turn unless documented recovery; bounded hints/ask/STT | Request counts, route-specific quotas, estimated provider cost |
| Delivery safety | Production-build UI + real SW lifecycle + local data-engine tests pass for release candidate | Separate suites, then authorized release verification |

Operational SLOs should be set after a measured beta: candidate 99.9% non-AI API availability monthly; AI generation success/latency reported separately. A slow provider must not be disguised by excluding failed requests or marking a fallback lesson as successful generation.

## 4. Architecture and compatibility rules

### Preferred dependency direction

`Route composition → feature UI/hooks → feature/application services → shared domain rules + data/API adapters`.

- Pure domain rules must not depend on React, DOM, fetch, or the live database.
- Components may retain small local view state; do not move every boolean into a service.
- Feature boundaries should expose a small intentional API, not giant barrels that force eager loading.
- Keep Dexie as the local data source. Do not activate React Query solely because it is installed; remove unused dependencies when confirmed, unless an independently justified use is approved.
- Keep one transport implementation, but expose typed feature-specific methods.
- Keep Worker routing thin. Authentication, quota, sync, curriculum, analytics, and admin behavior belong in coherent modules with injected capabilities where needed.
- Prefer direct functions over generic service containers, inheritance hierarchies, or abstraction frameworks.

### Stable interfaces

Existing routes, endpoint paths, response fields used by older clients, IndexedDB database name, entity keys, and entitlement decisions are compatibility constraints.

New contracts should explicitly define:

- `ScenarioDTO`: all current opener levels, optional artwork/order fields, and list/detail parity.
- `ApiError`: stable machine code, HTTP status, safe Arabic display message, optional retry delay, and retryability category.
- `SessionSummary`: validated stored/route/report representation, not `any` or unchecked JSON.
- `ProgressEnvelope`: versioned payload, stable event IDs, account ownership, cursor/revision metadata, bounded batch contents.
- `SyncQueueItem`: owning subject, schema version, status, attempts, scheduled retry, and safe error category; no embedded bearer token.
- `SyncAck`: explicitly accepted IDs/cursor and authoritative revision; delete local pending work only after a verified acknowledgement.

These are proposed internal contracts, not permission to change every API at once. Introduce adapters and version negotiation; retain the current endpoint behavior until a tested migration/cutover exists.

### Data rules

- Scope learner data to authenticated identity; `current_user` is a UI lookup key, not sufficient ownership proof.
- Add schema versions; do not reuse an existing version number.
- Keep replay idempotent, merges defined per field, and acknowledgements tied to sent records.
- Make authority explicit: billing/quota/security state server-owned; offline observations locally provisional until reconciled.
- Never call eventual consistency “exactly once.” Any authority still in KV needs a documented race model; use existing D1 atomicity where required.
- Do not refactor historical migrations cosmetically. Verify upgrades from supported historical versions before changing migration behavior.

## 5. Execution sequence

| Phase | Outcome | Priority | Dependencies | Planning size |
|---|---|---|---|---|
| A | Trust defects fixed; account boundaries and input contracts hold | P0/P1 | Re-baseline | L |
| B | Gates exercise production UI, SW lifecycle, and real data engines | P1 | Start alongside A; final gates after fixes | M–L |
| C | Predictable code boundaries, types, lint, dependency hygiene | P1/P2 | A; B safety net | L |
| D | Bounded sync, reliable daily authority, measured speed | P1/P2 | A/B; relevant C boundaries | L–XL |
| E | Measurably better learning and differentiated real-life practice | P2 | Trust/quality prerequisites; human review | XL |
| F | Consistent, accessible, premium interaction | P2 | A/B; measured D constraints | L |
| G | Safe beta, sustainable economics, operational readiness | P1/P2 | Begins with measurement; launch after gates | L |

Sizes: S = roughly 0.5–1 focused engineering day, M = 2–4, L = 5–8, XL = 9+ or discovery-dependent. They are planning estimates, not deadlines; integration, human review, hardware testing, and owner work are separate. Re-estimate after A/B. Deliver usable small milestones, not one giant branch.

## 6. Phase A — Trust and correctness

### A1 — Account-bound local data and safe sign-out [P0, L]

**Start:** [katzuDb.ts](../src/lib/db/katzuDb.ts), [App.tsx](../src/App.tsx), [workerClient.ts](../src/lib/api/workerClient.ts), [SignInScreen.tsx](../src/features/auth/SignInScreen.tsx).

**Work:** create a complete account-data inventory; associate queued records with server identity; quarantine legacy records whose ownership cannot be proved. Stop or invalidate account-scoped in-flight work using an account epoch/session generation. Clear derived patterns, stored summaries, in-memory summaries, and account-specific caches on transition. Make Dexie cleanup transactional. Preserve unsynced work under the original owner rather than automatically replaying or blindly deleting it; surface a clear warning/export option when appropriate.

**Acceptance:**
- Account A's queued records never send as B, even after reload, reconnect, overlapping restore/sync, or sign-out during an active request.
- No A report, pattern, entitlement display, or late response becomes visible under B.
- Sign-out is recoverable after partial storage failure; no mixed-account state is presented as success.
- Legacy unowned payloads are not uploaded automatically. Treatment is explained and regression-tested.
- Server session revocation failure is distinguishable from local sign-out; no false “all devices revoked” claim.

**Proof:** browser A→B tests with intercepted requests; IndexedDB readback; delayed-response tests; account deletion/export lifecycle tests; re-login of A recovers any deliberately retained pending work.

### A2 — Lossless validated curriculum mapping [P1, S–M]

**Start:** [workerClient.ts](../src/lib/api/workerClient.ts), [models.ts](../src/types/models.ts).

**Work:** one field-complete list/detail mapper; validate external data as `unknown`; separate genuinely absent optional fields from intentionally cleared fields. Preserve A0 openers and sequence metadata; use explicit update semantics rather than ad-hoc replacement.

**Acceptance:** all supported fields survive list→detail→offline→refresh; invalid responses cannot overwrite valid cached rows; list/detail contracts agree; older responses remain readable.

**Proof:** DTO fixtures for A0–B2, null/absent values, malformed payloads, ordering, and browser detail refresh.

### A3 — Online/offline query parity [P1, S]

**Work:** match vocabulary filters in every combination; use existing indexes where practical; audit grammar/scenario filtering for the same class of bug.

**Acceptance:** topic-only, level-only, combined, and empty results are identical for the same source data online/offline; no whole-table fallback when a requested filter applies.

**Proof:** table-driven tests and an offline browser task.

### A4 — Bounded request reading and consistent input validation [P1, M]

**Start:** [Worker entry](../cloudflare-unified-worker.js), route modules.

**Work:** enforce real-byte ceilings while reading, not only declared length; reject incompatible content types; distinguish malformed JSON from valid but invalid schemas; route audio under its existing separate finite ceiling. Bound nested arrays/text/numbers before merge or prompt assembly.

**Acceptance:** oversized streamed/headerless/incorrect-length payloads return 413; malformed inputs return safe 400 errors; no raw body/token in logs; requests are not fully buffered beyond the allowed ceiling; existing valid uploads still work.

**Proof:** real local Worker HTTP requests for exact byte boundaries, Unicode UTF-8, omitted headers, malformed types, and bounded audio.

### A5 — Atomic scoped abuse controls [P1, M]

**Work:** replace counter read/modify/write with an atomic D1 operation; preserve route scopes and limits in fallback; bound/expire in-memory fallback records. Distinguish normal rate rejection from storage failure. For paid/spend-sensitive routes, explicitly decide when failure must fail closed rather than admit unbounded spend.

**Acceptance:** N concurrent requests cannot exceed the declared cap; account/scopes do not consume each other's counters; boundary windows and Retry-After are correct; DB outage behavior is documented and cannot silently widen budgets.

**Proof:** real local D1 concurrent minute/day/scoped tests, outage tests, and restoration tests. Do not rely on a permissive FakeD1.

### A6 — Retryable, binding-scoped schema bootstrap [P1, S–M]

**Start:** [cloudflare-content-schema.js](../cloudflare-content-schema.js).

**Work:** memoize successful initialization only, share simultaneous attempts, and key readiness by binding. Do not mask missing tables as healthy schema. Keep any existing additive compatibility behavior until controlled migrations replace it.

**Acceptance:** outage→recovery retries successfully; one binding's success cannot certify another; simultaneous calls avoid redundant bootstrap; duplicate-column steady state remains safe.

**Proof:** deterministic outage/binding tests plus a fresh local D1 instance.

### A7 — Bounded-sync containment [P1, M; prerequisite to D2]

**Work:** prevent full-history 413 retry loops immediately. Define a backward-compatible bounded transmission strategy; do not truncate authoritative learner history to satisfy transport limits. Classify permanent errors, surface blocked sync, and compact redundant account-owned snapshots only when all unique events are preserved.

**Acceptance:** repeated failed sync does not multiply equivalent full snapshots; 413 is visible and not retried forever unchanged; a large history has a safe forward path; acknowledgement determines deletion.

**Proof:** size boundary tests, 250/1k-session browser payloads, repeated failure→recovery, pending-event preservation.

**Phase A exit:** all seven items verified; no known cross-account leak; existing core flows unchanged. A is not “done” merely because old tests pass.

## 7. Phase B — Verification that reflects the shipped app

### B1 — Correct production-build CI [P1, M]

**Start:** [ci.yml](../.github/workflows/ci.yml), [playwright.config.ts](../playwright.config.ts).

Select preview explicitly, supply test-only build variables, refuse unintended server reuse, and ensure the served artifact is the one built for that run. Reduce duplicate gate/build work only after confirming ownership of the build/server lifecycle.

**Acceptance:** CI proves a production bundle, not Vite dev; wrong artifact/server fails clearly; test-only values never reach a real deploy artifact; supported Node versions are aligned in docs/config.

### B2 — Dedicated real service-worker lifecycle suite [P1, M]

Keep route-mocked tests service-worker-blocked. Add a separate production suite with a real registered Worker and controlled local API—not route interception that the SW bypasses.

**Acceptance:** complete installation→offline reload; offline deep link; offline art/fonts; interrupted install; old-client→new-bundle update; stale chunk recovery; upgrade with existing data; safe return from background. Tests wait for complete caches/controller, not merely an activated registration. A completely unvisited installation is not promised to work offline.

### B3 — Real local data-engine integration [P1, L]

Automate local-only Worker/D1/KV setup with synthetic data and teardown. Prove quota boundaries, concurrent sync, first-request schema readiness, daily authority, session lifecycle, and deletion/export. Existing payment/entitlement behavior may be covered locally with fakes at the external provider boundary; do not operate real payments.

**Acceptance:** clean checkout can reproduce setup; no production bindings/secrets used; engine failures are visible; restart and concurrent writes preserve invariants; cleanup cannot touch shared/prod data.

### B4 — Supported device and failure matrix [P1/P2, M–L]

Automate Chromium and WebKit where supported by the runner; add Firefox smoke where useful. Browser emulation does not replace physical devices.

**Matrix:** 360px/390px and short-phone viewport, RTL/LTR German text, 200% zoom, reduced motion, low renderer tier, keyboard-only, offline/slow/flapping network, expired auth, quota exhaustion, microphone denial, no speech, unsupported codec, app background/foreground, IndexedDB failure, and multi-tab/account transitions.

**Acceptance:** core journey works on a real Android Chrome and iOS Safari/installed PWA, with device/OS/browser evidence. Unsupported behavior has a visible typed/cached fallback. Zero serious/critical accessibility issues on supported states, plus manual focus/screen-reader checks.

### B5 — Tests that find bugs, not only recognize source text [P2, M]

Preserve useful architecture/design guards, but add behavior tests for their claimed invariants. Strengthen fakes to reject unsupported statements and return realistic failure shapes. Use targeted mutation/injected-defect checks for ownership, quota, mapping, retry, and acknowledgements.

**Acceptance:** each A regression test fails on its corresponding defective implementation; expected synthetic errors are distinguished from unexpected test noise; no sleeps/retries used to hide races; no test-count or line-coverage vanity target.

**Phase B exit:** production UI, real SW, and local backend/data suites are distinct, reproducible, and green. Coverage limits are documented.

## 8. Phase C — Clean, maintainable engineering

### C1 — Establish accurate contracts and remove high-risk `any` [P1, L]

Type API errors, session summaries, progress envelopes, external responses, environment configuration, and Google callback shapes. Use `unknown` at boundaries and real validation. Start Worker checks with existing JSDoc/checkJs or an isolated backend configuration, then migrate modules incrementally if it improves maintainability without bundling churn.

**Acceptance:** no unchecked data reaches cache/report/domain logic; no new unexplained `any`; prioritize the 59 current sites by risk rather than blanket replacing them with casts; backend checks cover changed modules; no suppressions merely to pass.

### C2 — One transport, explicit feature services [P1/P2, L]

Extract a bounded transport from the current client; consolidate auth-header handling, cancellation, timeout, JSON decoding, and typed error normalization. Feature API methods remain discoverable and backward-compatible. Support both caller cancellation and timeout—one signal must not disable the other.

**Acceptance:** auth is not stored in queued bodies; bounded network waits; expiry recovery has a direct Arabic action; retries are idempotent; no automatic retry of non-idempotent writes without stable IDs; no circular adapter dependencies.

### C3 — Separate Worker responsibilities [P2, L]

Move coherent concerns out of the 3,738-line entry: route dispatch, auth/session, abuse controls, progress/review, curriculum access, and admin operations. Use current sibling modules before inventing a new hierarchy. Extract one concern at a time; leave external interfaces unchanged.

**Acceptance:** route entry coordinates rather than implements domain logic; request handlers have clear input/output; business logic is independently testable; no duplicate auth gates with drifting semantics; no eager initialization on unrelated routes unless justified.

### C4 — Decompose live conversation and oversized UI [P2, L]

Separate session orchestration, audio lifecycle, turn submission, persistence, feedback derivation, and view state. Preserve the existing conversation state machine as the authority. Split large screen sections only when they have a meaningful responsibility or rendering benefit.

**Acceptance:** one owner per lifecycle/state transition; duplicate submits prevented; no late state updates after navigation; bounded microphone/audio cleanup; UI layout and assisted-vs-independent attribution unchanged; component count is not the objective.

### C5 — Actual linting and incremental unused-code enforcement [P2, M]

Add project-local dev-only lint tooling if approved under existing tooling policy; include hook rules, unsafe promises, imports, and basic correctness. Resolve the 20 unused diagnostics by intent, including unused callbacks that may expose missing UX. Enable no-unused checks after cleanup. Adopt formatting without a giant whole-repo rewrite.

**Acceptance:** zero unexplained unused findings in maintained source; hooks dependencies reviewed behaviorally; safe errors are not swallowed to satisfy a rule; no mass suppressions; touched-file formatting is consistent.

### C6 — Dependency and documentation hygiene [P1/P2, M]

Review full npm advisories by actual dependency chain/exposure. Prefer compatible patches; major Tailwind migration is a separately justified project, not an audit shortcut. Remove unused React Query/Zod only after confirming no tool/runtime consumer. Keep OGL: it is genuinely used. Align README Node guidance, stack map, runtime facts, and current project brief; move historical narrative into archives without destroying provenance.

**Acceptance:** dependency audit has no untriaged high/critical issues; any temporary exception has owner, exposure rationale, compensating control, expiry, and follow-up—not a disabled audit. Lockfile/install/build agree; clean supported-Node install works; docs accurately distinguish current fact from historical measurement.

**Phase C exit:** large modules have deliberate boundaries; contracts and lint catch risky changes early; no new architectural system is needed to understand a feature.

## 9. Phase D — Fast, resilient, scalable

### D1 — Reproducible schema lifecycle [P1/P2, L]

**Start:** [migrations](../migrations/README.md), content schema, ledger bootstrap, local integration harness.

Create an executable local schema baseline and ordered migration verification. Separate historical production-derived documentation from runnable setup. Verify current production shape only through authorized read-only means; do not assume old DDL is current. Move toward controlled initialization/migrations instead of every isolate discovering schema on user traffic.

**Acceptance:** empty and supported older local databases converge; indexes/constraints/sequences preserved; no destructive production rebuild is implied; rollback means compatible application rollback plus a rehearsed forward recovery/backup procedure where schema is not reversibly downgradable.

### D2 — Incremental account-scoped synchronization [P1, XL]

Define protocol versioning, stable record/event identity, dirty markers, batch/cursor bounds, acknowledgement, tombstone behavior where deletion exists, merge rules, and recovery after partial acceptance. Add a transitional adapter for old full-snapshot clients. Keep large local histories; archive/retention is a separate product decision.

**Acceptance:**
- Batches are below the server ceiling with UTF-8/envelope headroom; proposed initial soft budget 48 KiB, tested rather than assumed.
- 10k sessions and associated mistakes sync without increasing a single request with lifetime history.
- Offline edits, multi-device races, timeout-after-commit, replays, app restart, partial ack, and reordered delivery converge correctly.
- Only accepted IDs/cursors are cleared; no stale whole-array clearing.
- Delete/unsave semantics are explicit; set-union merges must not resurrect a legitimate deletion indefinitely.
- Queue backoff uses jitter where appropriate, bounded retries/classification, a single-flight account guard, and visible blocked state.

**Proof:** representative correctness/performance integration, bandwidth/request counts, real D1 rows, old/new client interoperability.

### D3 — Durable daily authority and financial/quota invariants [P1, L]

Revalidate the current daily ledger: historical docs acknowledge cross-isolate KV risks. If daily XP/task/streak state must be authoritative, store atomic event acceptance/aggregate changes in existing D1 rather than relying on per-isolate locks. Keep idempotent reconciliation and old-client compatibility.

**Acceptance:** same event credited once across isolates; concurrent distinct events are not lost; clock/timezone changes cannot expand cap; offline catch-up follows published rules; daily commits and progress acknowledgements cannot disagree silently. Entitlements/redemption remain independently server-controlled.

### D4 — Indexed local queries and content freshness [P2, L]

Measure before rewriting. Replace unbounded reactive whole-table reads with indexed selection/pagination or well-defined bounded aggregate views where justified. Design compound indexes from actual query shapes. Establish curriculum freshness/versioning and explicit removal/retirement semantics rather than assuming `bulkPut` can reconcile everything.

**Acceptance:** reference-device large-dataset query targets met; visible summaries unchanged; no per-render expensive derivations; remote removals do not leave ghost curriculum forever; offline fallback does not overwrite newer remote content; any index change is an additive tested migration.

### D5 — Reduce critical-path and installation cost [P2, M–L]

Measure network waterfalls and execution on a clean production build. Review startup DB/analytics/content work, eager auth/landing dependencies, assets, fonts, and lazy boundaries. Consolidate duplicate assets with reference maps. Do not “optimize” by moving bytes to another eagerly downloaded chunk or hiding Vite warnings.

**Acceptance:** scorecard transfer/install targets met or a documented measured tradeoff; first meaningful paint and interaction improve on deciding measurements; Arabic fonts/art remain usable offline; no broken alias URLs; no auth flash or blank loading state.

### D6 — AI latency, cancellation, and cost discipline [P2, L]

Measure cold/warm success and failure per route, level, provider class, and device/network. Define an end-to-end deadline across failover attempts, not just independent timeouts. Prevent duplicate paid generation on retry; preserve typed input and provide deterministic practice while unavailable. Evaluate progressive feedback/streaming only if safe partial responses can be distinguished from validated final correction data.

**Acceptance:** one fused turn call in normal operation; hint/ask/STT budgets remain distinct; retries never double-consume a session; cancelled UI work does not produce late account writes; p50/p95 and failure rates reported together; no real-time speed promise without measured provider evidence.

**Phase D exit:** supported histories and races are correct; performance gains are measured; remaining platform limits are explicit.

## 10. Phase E — An exceptional learning product

### E1 — Human-adjudicated learning quality [P1/P2, L + reviewer time]

Build a stratified held-out set across A0–B2, Arabic-speaker mistakes, already-correct alternatives, colloquial/formal German, repeat requests, hint relevance, sensitive situations, and malformed model output. Separate validator correctness from language-teaching correctness. Have qualified Arabic/German reviewers adjudicate disagreements.

**Acceptance:** correction precision target measured with sample size, recall, abstention, and severity; no fabricated correction is converted into a review card; low-confidence output is explained or withheld; exam estimates are never advertised as official certification; legal/medical language remains learning support, not professional advice.

### E2 — Scaffolding that fades into independence [P2, L]

Keep the word bridge, but measure assisted work honestly. A word-bank tap, reveal, translation, and independent attempt should be distinct evidence. Reduce support as capability grows; do not remove help abruptly or count answer assembly as unassisted mastery. Include a delayed independent retry and a changed-context transfer task.

**Acceptance:** learner can always ask for support; report names assistance; independently produced answers receive appropriate recognition; spaced recall tests avoid giving away the answer by default; support fading has a useful fallback and does not punish beginners.

### E3 — Complete, coherent first-week path [P2, L]

Design a small, curated first-week path around concrete needs: arrival, buying something, directions, appointments, housing, and work/study. Reconcile with existing curriculum, do not add duplicate scenario families. Show why today's mission fits the learner's goal/time/weakness and what they will be able to do afterward.

**Acceptance:** from demo/sign-in to first useful phrase is clear; placement is explainable/skippable under existing policy; no jargon or surprise advanced content; day two intentionally recalls day one; human reviewers approve the high-frequency path; scenario vocabulary/grammar/review joins are reachable.

### E4 — Evidence-based adaptive coach [P2, L]

Use deterministic selection from actual independent production, repeated mistakes, due review, goal, and available time. Explain the recommendation in one Arabic sentence. Let the learner choose a different mission. Avoid persistent free-form personal profiling or inferred sensitive attributes.

**Acceptance:** same inputs/date produce reproducible recommendations; supported evidence is distinguished from insufficient data; mixed review targets recurring mistakes; no mastery inferred from page views; coaching improves measured completion/transfer without extra mandatory AI calls.

### E5 — Signature feature: rehearsal → real-world variation → proof [P2, XL]

Build a differentiated scenario family, not another generic chat screen. Rehearse with support, then encounter a bounded variation (different price, missing document, different request), then retry a similar goal later without the answer exposed. Present a private capability portfolio: “I can arrange an appointment,” backed by attempts and recall, not decorative percentages.

**Acceptance:** variations are authored/server-resolved within level constraints; one core conversation engine; no uncontrolled agent actions; variants test transfer rather than arbitrary difficulty; learner can inspect the evidence behind a capability; sharing is opt-in and excludes personal sentences.

### E6 — Deliberate expansion, not feature accumulation [P2/P3, discovery]

Reading-in-context and richer exam practice are candidates only after the first-week/recall path is validated. A reading activity should feed the same vocabulary/review/capability model. Exam practice should use explicit rubrics and honest limits. Assess pronunciation only if validated against real devices, accents, and noise; never infer phonetic accuracy from a transcription match alone.

**Acceptance:** every new surface has a distinct learning job, reusable evidence/storage, human quality review, and a success metric. If it adds navigation burden without better learning, do not ship it.

**Phase E exit:** held-out quality and observed independent learning support the product claims. Small curated excellence beats a large unreviewed catalogue.

## 11. Phase F — Premium experience without visual noise

### F1 — A unified screen-state and navigation contract [P2, M–L]

Standardize loading/empty/offline/slow/error/auth-expired/quota/success patterns with existing primitives. Every learning screen has a heading, one primary action, clear progress, reachable exit, and preserved input. Review the unused grammar `onBack` prop as potential missing navigation, not just an import cleanup.

**Acceptance:** no infinite spinner or dead-end disabled control; every failure has actionable Arabic copy; back from deep routes is predictable; refresh resumes or honestly explains what cannot resume; labels and control semantics survive long strings and RTL.

### F2 — Coherent visual and interaction system [P2, L]

Use current semantic tokens, spacing/radius/type ladders, glass primitives, and renderer tiers. Audit hierarchy and density rather than redesigning every screen. Reconcile [existing motion proposals](README.md); retain meaningful stillness and touch-safe hover rules. Decorative animation must not compete with words, keyboard, feedback, or recording status.

**Acceptance:** one primary visual emphasis; no raw style drift; 44px minimum targets as default (larger primary thumb controls where practical); input text avoids iOS zoom; visible focus; non-color state cues; reduced motion honored; no excessive blur on low-tier devices; no forced scroll layout or unnecessary full-screen canvas work.

### F3 — Real usability and accessibility review [P1/P2, M + participants]

Observe 8–12 Arabic-speaking learners of varied German levels using ordinary phones. Ask them to start, recover from a failure, explain feedback, return to a due review, and describe what they learned. Include keyboard/screen-reader users where feasible; compensate/consent appropriately through owner decisions.

**Acceptance:** identify top three confusion/friction points, fix them, and repeat the tasks; report sample/context rather than claiming statistical certainty. Confidence and comprehension must improve without extra coaching. Automated accessibility scores are not a substitute for this work.

### F4 — Calm habit support and ownership of progress [P2, M]

Keep daily goals flexible, streaks honest, and rewards attached to learning. Provide a clear pending/synced indicator and recovery detail on demand. Resume incomplete work. Avoid shame copy, fake scarcity, or manipulative paywall interruption.

**Acceptance:** the learner understands why a day/skill counts; assisted work is not overstated; notification requests, if ever added, follow demonstrated value and require consent; the meaningful free experience remains useful.

**Phase F exit:** supported screens look related, explain themselves, work on phones, and stay calm under failure.

## 12. Phase G — Operate and grow responsibly

### G1 — Privacy-safe diagnostics and operating scorecard [P1/P2, M]

Use existing analytics/telemetry capabilities first. Track operational error categories, API success/latency, sync backlog age, quota rejections, first-mission completion, independent attempts, delayed recall, and return cohorts. Include version/route/device class only when justified and bounded.

**Acceptance:** allow-listed metadata only; no raw audio/transcripts/tokens/auth headers; user control and retention/deletion behavior verified; metrics separate unavailable observations from zero; dashboards can distinguish provider outage, client bug, and curriculum defect.

### G2 — AI unit economics and graceful budgets [P1/P2, M]

Compute cost per completed useful mission, per retained learner, and per route. Provider token counts or pricing evidence should replace rough character estimates for billing decisions where available. Keep rate/cost budgets separate from learning entitlements.

**Acceptance:** quotas, maximum retry cost, and outage fallback are explicit; activation codes remain exactly-once; no pricing/paid launch change without owner approval; quality and latency are reported alongside cost.

### G3 — Security, backup, and incident readiness [P1, L + owner actions]

Threat-model account switching, bearer sessions, deletion/export, admin access, content uploads, model input/output, sync races, and backups. Review session issuance/index caps, KV revocation consistency, and account deletion beyond current fixtures. Expand secret scanning safely: current tracked-source scanning excludes several file classes; avoid printing matched secrets, and define an owner-controlled history-remediation process if needed.

**Acceptance:** no known high-impact trust issue; account export/delete cover every authoritative and derived store; retention actually runs; local backup restore is rehearsed with counts/constraints/readback; emergency mode and authorized rollback have clear criteria and owner; secrets are never requested, printed, or rotated by the implementation agent.

### G4 — Measured beta and release readiness [P1/P2, L]

Reconcile [launch checklist](../docs/LAUNCH-CHECKLIST.md) and owner-only items. Launch a small consented cohort when trust/device/content gates pass. Measure first-mission completion, independent production, 7-day recall, D1/D7 return, failure recovery, and AI cost. Define metric denominators/cohorts/timezones and retain only necessary data.

**Acceptance:** no public paid release until security/domain/legal/payment/device owner gates are resolved; exact deployed SHA and artifact verified after authorization; support/incident response works; improvements are driven by observed bottlenecks, not inflated percentages from tiny samples.

**Phase G exit:** code-ready is distinguished from launched; the owner has evidence and a practical operating process, not only a green build.

## 13. Verification and release protocol

### Before each item

1. Inspect current branch/status and preserve unrelated work.
2. Re-read affected behavior and acceptance criteria; reconcile stale plans.
3. Capture a reproducible baseline; for a confirmed bug, add/prove a failing regression before repair where feasible.
4. Identify contracts/data migrations/old-client effects and rollback limits.
5. Implement one coherent concern; no unrelated mass formatting, dependency upgrades, or folder moves.

### Required checks

Use supported Node and project-local installed tools. Existing commands:

```bash
npm run lint
npm run test:e2e:types
npm test -- --reporter=dot
npm run build
npm run design
node scripts/simplicity-check.mjs
node scripts/audit-curriculum.mjs
node scripts/eval-chat-quality.mjs
node scripts/measure-turn-cost.mjs
npm audit --omit=dev --audit-level=high
npm audit
E2E_TARGET=preview npx playwright test --reporter=line
```

Check every changed Worker module with `node --check`; add backend type/lint checks after C1/C5. Run related tests per item; full release gate at milestones. The live quiz audit is separate, read-only but network-dependent; do not represent it as an offline reproducible test. New B2/B3 suites must have documented local commands once implemented; this plan deliberately does not invent currently nonexistent scripts.

Capture command exit status before tailing/filtering logs, or use `set -o pipefail`. Never weaken assertions, skip a failing test, add suppression, or swallow an error merely to pass. A failure may reveal an app defect, stale expected behavior, or a harness bug; fix the cause and prove the intended behavior.

### Verification through actual interfaces

- UI change: browser journey, small viewport, keyboard/RTL and relevant failure state.
- Storage/auth change: actual IndexedDB readback and account transitions.
- Concurrency change: real local D1/Worker; mocks alone cannot certify it.
- PWA change: built artifact with real SW installation, update, and offline behavior.
- Performance change: representative correctness plus before/after timing on the same environment; ≥5 runs, medians/spread, cold/warm, device/network notes.
- Learning change: held-out reviewer-adjudicated examples plus end-to-end review enrollment/grading; distinguish fixture quality from live language quality.
- Release: authorized only; exact SHA/CI/artifact, public health, access protection, supported journey, and documented rollback readiness.

### Every completed item reports

`ID · outcome · files/contracts/data touched · regression proof · commands/exit status · measurements · compatibility/rollback · remaining limitations`.

Keep the app map current when routes/screens/endpoints/tables/dependencies change. Keep a concise current brief; append evidence/history elsewhere. Never declare a release green using a historical CI run for another SHA.

## 14. Cleanup policy

| Candidate | Recommended treatment | Required safety check |
|---|---|---|
| Unused React Query/Zod | Remove if still unused; update docs/lockfile | Static consumer search, clean install, build/tests |
| 20 unused diagnostics | Resolve intention before deletion | Typecheck with unused flags; behavior for callbacks/parameters |
| Duplicate mascot/scene bytes | Canonical assets + migrated references/aliases | Track URLs from code, content, docs, SW; offline visual checks |
| `user_avatar.jpg` | Candidate only | Search content/external URL usage; no assumption from main import graph |
| TTF fallbacks | Evaluate compatibility/precache policy, not automatic deletion | Supported-browser/font rendering and offline evidence |
| Curriculum audit module | Keep | Scripts/tests consume it outside runtime import graph |
| Existing schema history/migrations | Keep provenance; distinguish runnable baseline from archive | Historical upgrade/readback verification |
| SQL backups | Retain under explicit backup policy; keep out of normal source staging | Owner retention/restore decision; inspect sensitivity without printing data |
| Agent/tool directories outside app repo | Optional workspace housekeeping only | Verify tool ownership; not part of app cleanup |
| Stale narrative docs | Consolidate current truth; archive dated history | Preserve decisions/provenance and working links |

**No file is deleted solely because it is large, old, untracked, or not imported by the app.** Require a replacement/reference plan and passing behavior checks. Do not stage or publish backups accidentally.

## 15. Risk register and owner decisions

| Risk | Mitigation / decision |
|---|---|
| Big-bang rewrite breaks working product | Small independent milestones, compatibility adapters, behavior tests before extraction |
| Queue cleanup loses unsynced work | Account-bound retention/quarantine, explicit lifecycle, tested re-login recovery |
| Old PWA clients meet new API/schema | Versioned compatible protocol, old-client tests, controlled update/cutover |
| Atomicity claimed on eventually consistent KV | Use real engine proof and existing D1 where authority requires it |
| Major tooling upgrade breaks design | Advisory-by-advisory triage; separate major migration with visual gates |
| Performance hides a usability/quality regression | Measure deciding metrics and preserve correctness/accessibility/learning |
| New AI features multiply cost | One core engine, bounded calls, route budgets, quality/cost measurement |
| More gamification masks weak learning | Independent production, delayed recall, and transfer as north-star evidence |
| Legal/admin/payment readiness remains unresolved | Owner-only checklist; no public paid launch claim |
| Human-review/device work absent | Explicit external prerequisite, not a substituted mock pass |

### Decisions needed when their phase begins

1. **Unsynced work on sign-out:** recommended account-bound retention with visible disclosure and no cross-account upload; confirm retention/export expectations.
2. **Supported launch devices:** recommended Android Chrome + iOS Safari/installed PWA; add others after evidence/capacity review.
3. **Human review:** nominate qualified Arabic/German reviewers and a small target-user cohort; budget/consent are owner decisions.
4. **Launch/security/legal/payment/domain:** reconcile the existing owner checklist; this plan does not authorize any action there.
5. **Historical storage:** decide intended long-term history/backup retention; incremental sync must not silently impose a new loss policy.
6. **Experiments:** approve privacy/measurement boundaries before collecting additional learner data; optional paid/pricing experiments require a separate decision.

Do not block reversible local engineering on every aesthetic preference. Owner approval is for consequential product/privacy/spend/production decisions.

## 16. Delivery checklist and first milestone

### Milestone gates

- **M1 — Trusted:** A1–A6 complete, A7 containment complete; cross-account/error-contract regressions proved.
- **M2 — Reproducible:** B1–B3 complete; clean supported-runtime checkout exercises production UI, real SW, and local backend.
- **M3 — Maintainable:** C1–C6 complete in justified scope; critical contracts typed, transport unified, lint/dependency/doc hygiene established.
- **M4 — Scalable and fast:** D1–D6 verified on representative datasets and agreed devices; no indefinite oversized-sync retry; real concurrency proof.
- **M5 — Distinctive:** E1–E5 and F1–F3 demonstrate better independent learning and understandable mobile UX; E6 only if justified.
- **M6 — Launchable:** G1–G4, real-device checks, owner-only gates, exact-release verification, and support/restore readiness complete.

A later milestone is not a substitute for an earlier missing trust gate. G measurement and human review preparation can begin early; risky new features wait for the safety foundation.

### First implementation batch

1. Re-baseline current checkout and create the cross-account regression harness.
2. Implement A1 account isolation/sign-out, including late-response and legacy-queue behavior.
3. Implement A2/A3 mapping and query parity as separate small fixes.
4. Implement A4/A6 body reading and initialization recovery.
5. Implement A5 atomic scoped limiting with real local D1 proof.
6. Complete A7 containment and B1 production-build CI; begin B2/B3 permanent integration coverage.
7. Run full applicable gates and deliver M1 evidence. Stop and resolve red gates before starting cosmetic cleanup.

### What “super clean and modern” means at completion

- The learner cannot lose or leak work through normal account/network/device transitions.
- Every external input and response has an explicit validated contract.
- The code has one clear owner per responsibility and a small set of comprehensible abstractions.
- Initial loading, local queries, sync growth, AI attempts, and installed resources have measured budgets.
- The same product works with keyboard, RTL, reduced motion, small phones, and realistic failures.
- Feedback is useful, accurate, and honest about assistance/uncertainty.
- Progress reflects independent capability and delayed recall—not decorative scores.
- A clean checkout reproduces the verification; the actual release artifact is tested.
- The owner can operate, restore, support, and improve the product with evidence.

**Implementation is complete only when those behaviors are demonstrated. This document is the roadmap, not a claim that they are already achieved.**
