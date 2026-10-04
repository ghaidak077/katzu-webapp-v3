# 009 — Coordinated experience, interface and motion audit

Date: 2026-10-04. Historical base recorded at session start: `1a72827`.
**Status: PROPOSAL — source implementation and deployment NOT performed.**
The shell became unavailable during the resumed audit, so the current branch/HEAD could not be rechecked. This report does not authorize commits, pushes, production mutations or deployment.

## Phase 0 — Product frame

1. User: an Arabic-speaking German learner; job: handle one real-life situation confidently; success: produce an independent, understandable German response.
2. Aha: learn a real phrase, produce a response, receive useful Arabic feedback; proposed first-value target <60 seconds, actual completion time unknown.
3. Constraints: Arabic-first RTL, isolated German LTR, honest measured progress, privacy, server-authoritative quotas, no shaming or fabricated mastery.
4. Worst context: mid-range phone, mobile data, one hand, interruption, denied microphone, large text; typed learning must remain useful.
5. Execution safety: TypeScript, Vitest, built-preview Playwright, design/contrast gates plus rendered checks; no secrets, live payment/OAuth changes or production data writes.
6. Owner goal: exceptional visual craft and experience, then deployment; skills require one approval of the complete plan, and project deployment authorization is separate.

## A. Verdict

Katzu has a strong Arabic-first learning foundation and several genuinely thoughtful empty states.
Top-tier means dependable accessible interactions, truthful promises and a coherent, visually verified hierarchy—not additional effects everywhere.
The biggest confirmed gap is trust/accessibility consistency; visual excellence cannot yet be signed off because screenshot rendering failed.

**Interface verdict: BLOCK**, based on confirmed misleading quota copy and shared accessibility source defects. This is a whole-product review, not a change review; no finding is attributed to the earlier local batch.

## Scope, recon and method

React 18, TypeScript, Vite, Tailwind 3, React Router, Dexie. Existing motion: CSS transitions, OGL orb and canvas-confetti; no motion library to add. Existing material: AMOLED black, lavender glass, restrained earned accents, Cairo Arabic and Satoshi German. Preserve this identity.

Guidance inspected during the audit/context: AGENTS, CLAUDE, APP-MAP, MEMORY, ENV-FACTS, EXCELLENCE-STATUS, existing motion plans, master roadmap and design conventions. All six better-* domain skills and motion AUDIT/PLAN-TEMPLATE were loaded in the earlier audit segment; external files could not be reloaded after the shell failure. Domain review performed sequentially; no subagent capability was available.

Evidence labels:
- **Walked initial**: rendered route opened and headings/buttons/geometry inspected; not an end-to-end path completion.
- **Source-confirmed**: exact implementation inspected; runtime accessibility impact still needs interface verification where specified.
- **Unknown/UNWALKED**: no fabricated score or pass.

### Domain coverage

| Domain | Evidence | Limits |
|---|---|---|
| Accessibility | Shared Button/Modal/BottomSheet source; public accessibility snapshots; existing axe test inspection | Open-overlay keyboard, real screen reader and every route state NOT VERIFIED |
| Layout | Earlier synthetic route walk at 390 and 320; current public snapshots | Trail overflow unresolved; 200% zoom NOT VERIFIED; no screenshots |
| Writing | Landing/demo/welcome/upgrade/grammar/scenario/progress/empty-state copy | Full AI response quality and live error matrix UNWALKED |
| Typography | Cairo/Satoshi tokens, direction isolation, full grammar row titles | Rendered large-text legibility and truncation inventory NOT VERIFIED |
| Colors | Existing centralized tokens and historical contrast gate | Current rendered glass/composite pairs NOT VERIFIED; no invented contrast failures |
| UI polish | Shared surface/action source and public flow structure | Visual judgement, spacing and motion feel NOT VERIFIED |

### Journey inventory and user's perspective

The earlier synthetic backend traversal returned exit 0 across the following 26 routes. It checked initial states, not all interactions. Four resource 404 console messages remain unattributed; the saved temporary JSON could not be reopened after shell failure. Do not treat this as a clean resource check.

| Route(s) | What seen / expected / actual / user feeling | Coverage |
|---|---|---|
| `/`, `/welcome` | Clear Arabic real-life promise; expect a quick start; several account/demo actions compete; “Which start is best for me?” | Public rendered snapshots, CTA to demo walked |
| `/demo` | Four-step lesson introduction with real cached airport content; expect phrase → quiz → production → feedback; intro visible, later interaction interrupted by tab/page changes; “I want to try before signing in.” | Intro walked; completion UNWALKED |
| `/signin` | Account entry | Successful OAuth, cancellation and callback UNWALKED |
| `/onboarding`, `/placement` | One motivation question at a time and adaptive/zero/known-level choices; expect sensible placement without judgment; initial states clear; “I can start from zero.” | Walked initial; full completion UNWALKED |
| `/app/trail` | Today's learning path; expect an obvious next action; horizontal overflow detected at 390 and 320, no offscreen controls detected; “Is anything hiding?” | Walked initial; overflow root cause UNKNOWN |
| `/app/library` | Learner-name heading and scenario browsing; expect a library label; content available; “Where am I?” | Walked initial; filtering interactions UNWALKED |
| `/scenario/cafe_order/story`, `/practice` | Scene context, next/skip, phrases/grammar/word bank; expect a guided preparation; initial route works; “This tells me what to practise.” | Walked initial; full progression UNWALKED |
| `/scenario/cafe_order`, `/study`, `/quiz` | Preparation before conversation; expect encouragement; one detail line warns Katzu notices improvisation; “Will it judge me?” | Walked initial; full study/quiz UNWALKED |
| `/scenario/cafe_order/live` | Mode picker distinguishes assisted training; expect speaking or typing and recoverable interruption | Mode picker only; conversation/report completion UNWALKED |
| `/session-report`, `/app/review` | Honest no-session/no-due states and return actions; expect a useful next step; empty state gives one; “Nothing is pretending I learned.” | Empty initial walked; populated/error states UNWALKED |
| `/app/listen` | Three-step listening, slower playback, repeat, word bank, exit; expect controllable audio | Walked initial; actual audio/dictation UNWALKED |
| `/app/write`, `/app/coach`, `/app/ask` | Writing prompt, coaching empty state, ask intents; expect practical help; initial actions present; certificate phrasing overstates writing alone | Walked initial; grading/responses/errors UNWALKED |
| `/app/grammar` | Locked path with prerequisite explanations and continue; expect visible exit; onBack unused | Walked initial; exercise completion UNWALKED |
| `/app/practice`, `/app/progress` | Simplified practice and explicitly measured capabilities; expect real progress, not guessed mastery; empties honest | Walked initial; share/dialog and populated states UNWALKED |
| `/app/profile` | Account, name, settings, privacy/export/delete, signout; expect safe account control | Walked initial; edit/export/delete/current signout UNWALKED |
| `/subscription` | Current plan, unavailable-quota disclosure, official external purchase and activation; expect disclosed limits; unlimited claims conflict with server caps | Walked initial; empty fields correctly disable submission; real payment/redemption UNWALKED |
| `/trust/privacy`, `/terms`, `/imprint`, `/refund` | Distinct trust pages and back actions; expect factual policies; imprint openly lacks final publisher details | Walked initial; legal correctness owner-only |
| `/dev/system` | Internal design sampler | Walked initial; overflow observed, excluded from learner-blocking claims |

Not walked: all per-screen loading/error/offline/delay/interruption combinations, real OAuth, checkout/refund, real microphone/audio, real phone, screen reader, cross-device, notifications and complete day-2 return. Prior tests are historical evidence, not a substitute for this matrix.

## B. Journey scorecard and persona panel

Scores are expert audit judgments, not user statistics; unknown where completion is missing.

| Stage | /5 | Evidence |
|---|---|---|
| First 30 seconds | 3 | Audience/job clear; demo value competes with signup and redundant starts |
| Signup/first run | Unknown | Welcome/placement intros inspected; actual OAuth and first-run completion not walked |
| Core loop | Unknown | Multiple initial screens inspected, not a completed live learning session |
| Empty states | 4, inspected subset | Review/report/progress avoid fabricated achievements and offer returns |
| Errors/offline/slow | Unknown | Full current runtime matrix incomplete |
| Upgrade honesty | 2 | “Without daily limits” conflicts with backend daily caps |
| Returning learner | Unknown | Honest measured progress observed; day-2 timing not measured |
| Accessibility | 2, source + snapshots | Shared overlays lack dialog/focus handling; loading Button can lose accessible name |

| Persona | /5 | Independent judgment |
|---|---|---|
| End user (chair) | 3, provisional | Clear useful learning intent, but misleading limits and judgmental preparation copy hurt trust |
| UI/UX expert | 3 | Shared overlay lifecycle and grammar exit need consistency; many error states remain unknown |
| Visual designer | Unknown | Identity is coherent in source; no screenshot or real-device feel evidence supports a visual score |
| Product strategist | 3 | Demo is a strong value-before-account asset but signup competes before proof of value |
| Skeptic | 2 | Unlimited claims contradicted by quotas, incomplete launch legal details, gaps in final verification |

Consensus: the End User's trust and ability to stay oriented outrank adding spectacle. Strategist favors prioritizing the demo; no conversion lift is assumed. Visual designer withholds judgment rather than treating tokens as proof of stunning rendering. Warm humor is worth keeping, but warnings about being judged are not.

## C. Consolidated findings register (8 findings, no padding)

Line references are from source read during this audit; recheck before editing in the shared checkout.

| ID / priority / severity | Stage, owner, location and current implementation | Before → after / why / persona |
|---|---|---|
| F1 P0 HIGH | Upgrade; Writing. `src/features/auth/SubscriptionRedemptionScreen.tsx:197,203`: `غير محدودة بدون قيود يومية`; `src/features/marketing/LandingScreen.tsx:477` unlimited; `src/features/settings/ProfileSettingsScreen.tsx:265` unlimited. Backend `cloudflare-unified-worker.js:567-568` defaults to 20/minute, 150/day; STT/hints/ask have separate caps. | Absolute unlimited → all scenarios with server-governed usage limits and clear recovery when reached. No quota or price changes. Removes a misleading promise; End User/Skeptic. |
| F2 P0 HIGH | Processing; Accessibility. `src/components/ui/Button.tsx:144-152`: `isLoading ? <KatzuThinking size={20} layout="inline" /> : children`; `KatzuThinking.tsx:36-50` no default label, SiriWave canvas is aria-hidden. Default loading button replaces its name with unnamed decoration unless caller supplied aria-label. | Keep the existing action label accessible and visible, add adjacent decorative indicator and aria-busy. Test a normal unlabeled-by-prop Button before/during loading. Name-loss is a source-confirmed shared defect, not a claim every caller fails; Accessibility/Skeptic. |
| F3 P1 MEDIUM | Overlays; Accessibility. `src/components/ui/Modal.tsx:21-45,52-72`, `BottomSheet.tsx:21-49,54-67`: plain divs and body-scroll lock; no dialog semantics, focus entry/trap/restore or Escape handling. | Prefer native modal dialog semantics with existing GlassSurface, showModal/close lifecycle and labelled title; preserve interfaces. If platform limits require fallback, justify it before custom focus management. Shared underlying failure reported once; UI/UX/End User. Escalate to HIGH if runtime confirms pointer-only path or hidden keyboard control. |
| F4 P1 HIGH | Overlay/FAQ transitions; Accessibility. `Modal.tsx:54,68-70`, `BottomSheet.tsx:56,65-66`: transition classes including wrapper opacity and sheet translation. Global reduced-motion `src/index.css:623-633` covers kz-surface/kz-primary but not scrim, and FAQ `LandingScreen.tsx:341` rotates plus with transition-transform. | Remove nonessential FAQ transform animation; make scrim/sheet displacement instant under reduced motion, content/status unchanged. Ordinary motion ignored by preference is a confirmed source omission; runtime emulation required before closure. No whole-app blanket animation override. |
| F5 P1 MEDIUM | Preparation; Writing. `src/features/study/ScenarioDetailScreen.tsx:161-162`: “بدونها سترتجل أمامي، وأنا ألاحظ الارتجال فوراً.” Landing promises a patient partner that does not ridicule. | “خطوتان قصيرتان ثم نتحدث: تعرّف على الكلمات، ثم جرّب اختباراً سريعاً. يمكنك البدء مباشرة إن كنت جاهزاً.” Keep skip; encourage rather than threaten. End User, dignity. |
| F6 P1 MEDIUM | Grammar navigation; UI. `src/features/grammar/GrammarSectionScreen.tsx:168`: onBack accepted but never used; path return at :460 has no back action, lesson :315 only returns to all lessons. | Add existing BackButton to path; lesson returns to path, path to prior screen. Runtime initial no-back corroborates source. No changes to passing/unlock rules. End User/UI/UX. |
| F7 P1 MEDIUM | Entry/product promises; Writing. `LandingScreen.tsx:156`: A1–B2 while FAQ includes A0; :274 says “لا نقاط” while `cloudflare-daily.js:41` and UI rank system use XP; :316 promises Pro without limits. `WritingScreen.tsx:305`: “مهارة الاختبار التي تُحدد الشهادة”. | Say A0–B2; replace no-points promise with “مهمة قصيرة وتقدّم مبني على تدريبك”; writing is one of four exam skills, not certificate determination. Keep honest coming-soon and measured progress. Strategist/Skeptic. |
| F8 P2 LOW | Landmarks; Accessibility. `src/App.tsx:222` main contains `LandingScreen.tsx:105` main and `DemoScreen.tsx:130,162` main (also Ask/Onboarding). Public snapshot contains two nested main landmarks. | Keep exactly one main per route; use div/section for screen inner layout, preserve native header/footer landmarks. One source-of-truth ownership fix, not another wrapper. Screen-reader orientation. |

No confirmed contrast failure, clipped control or inaccessible truncation is claimed. Grammar shortened CTA titles remain reachable in full lesson/list titles, so they do NOT satisfy the inaccessible-truncation trigger. Disabled activation/referral buttons with empty fields are expected, not findings.

### Investigation gates, not findings

- Trail and internal design sampler horizontal scroll width exceeded viewport at 320/390. No offscreen controls were found. Identify element, content versus decoration and zoom behavior before severity/fix; do not hide overflow blindly.
- Four 404 resource errors from traversal: identify URL and affected flow before deciding remediation.
- Browser page/tab changed between snapshots/actions; demo completion not proved and no redirect bug is inferred.
- Publisher details need owner-provided legal data; never invent an address/legal approval.
- Video captions track lacks src; actual video content and need for captions not inspected. Inspect speech/content, then obtain real transcript if required.

## Motion review (eight categories)

| Category | Result |
|---|---|
| Purpose/frequency | Keep instant tabs, progress updates and frequent keyboard actions. Button intentionally uses material highlight, not scale. |
| Easing/duration | Tokens 160/280/300ms are within budget. Overshooting spring documented by project; not a defect on taste alone. Sheet-specific curve is optional craft, pending visual feel evidence. |
| Physicality/origin | Modal starts scale .95 (not zero); sheet from bottom; correct intent. |
| Interruptibility | Both overlays unmount immediately on close; no exit animation. Not a blocker by itself. Rapid reopen/rAF lifecycle needs verification. |
| Performance | Forced specular scroll work removed; composite grammar progress source confirmed. No new timing measurement or speedup claim. |
| Accessibility | Confetti guard already present. F4 transition omission; SiriWave reads preference once per setup and does not subscribe while mounted. |
| Cohesion/tokens | Tailwind reads CSS tokens; do not introduce parallel motion library or animation palette. |
| Missed opportunities | Only restrained occasional transitions, after keyboard and reduced-motion correctness; no decorative navbar travel. |

### Vetted motion priorities

| # | Motion severity | Category/location | Finding | Fix summary |
|---|---|---|---|---|
| M1 | MEDIUM (interface HIGH F4) | Accessibility; shared overlays/FAQ cited above | Some transition owners do not opt out | Instant scrim/translation under reduced motion; delete FAQ rotate transition |
| M2 | MEDIUM | Accessibility; `src/components/effects/SiriWave.tsx:317-318,399-409,428` | matchMedia value captured once; effect depends on variant/size/renderScale only, so enabling reduced motion while indicator remains mounted leaves its JS loop running | Subscribe using existing useReducedMotion; cancel existing rAF, draw one still frame on preference change; preserve software fallback and resource cleanup |

These two are candidates, not selected executable motion plans. **Stop for selection** as required by improve-animations. Selecting the combined recommended plan below selects M1/M2. Then write self-contained motion specifications in `animation-plans/` (the existing `plans/` also holds product roadmaps), with freshly checked HEAD, exact current excerpts and verification. No motion source edited during advice phase.

Missed opportunities (optional, not required fixes):
1. Occasional overlay entrances can use a nonovershooting drawer curve `cubic-bezier(0.32, 0.72, 0, 1)` at 300ms; test before adopting, no global spring replacement.
2. A rare completed independent response can receive a short opacity-only confirmation at 160ms `cubic-bezier(0.23, 1, 0.32, 1)`; persistent text/icon must convey result without motion.
3. Preserve deliberate stillness in navigation, typing, review queues and mode switching rather than adding staggered cards.

### Historical plan reconciliation (source, not renewed test passes)

| Old plan | Current status |
|---|---|
| 001 tokens to Tailwind | Implemented in inspected config; runtime regression not rerun |
| 002 confetti guard | Implemented at SubscriptionRedemptionScreen:100-112; simulated redemption regression still needed |
| 003 sheet/modal entrance | Implemented via mounted/rAF states; exit/interruption feel unverified |
| 004 forced scroll layout | Historical mechanism removed from GlassSurface; whole-repo performance proof not rerun |
| 005 composite progress | Grammar rail implemented with scaleX; other targets not fully reconciled |
| 006 transition-all | Earlier search found only Button comment; do not mechanically execute stale replacement list |
| 007 hover scale | Whole old target inventory not verified; leave unresolved, not TODO-as-proof |

Do not replay stale plans blindly or execute old instructions requiring live redemption.

## D. Complete proposed execution plan

Acceptance: preserve current APIs/data rules and existing owned changes; no runtime dependency; safe local verified batches; coherent Arabic-first identity; one approval, not per-fix approval. Commits/PRs are possible batch boundaries only—creation is not authorized.

| Order / safe batch | Exact scope/change | Effort | Metric / acceptance / verification |
|---|---|---|---|
| 0 Evidence restoration | Restore shell tools; inspect branch/status and ownership, current HEAD, 404 URLs; render screenshots at 320/390/768/desktop, 200% zoom, reduced motion. Complete demo and synthetic core loop including error/offline/slow paths. | M | Every inspected state has recorded evidence; gaps remain explicitly UNWALKED. Classify Trail overflow before fixing it. |
| 1 Trust | F1/F5/F7 in cited screens; remove absolute limits claims, align levels/XP, soften preparation and exam framing; reuse any existing quota-copy helpers, never change quotas/price/legal policy. | S | Zero contradicted promises in inspected copy; unit copy regressions and rendered landing/profile/subscription/detail/write checks. |
| 2 Accessible primitives | F2/F3/F8; preserve loading action label + aria-busy, native dialog behavior with existing material, one main per page; parent callbacks/props stable. | M | Button named while busy; Tab/Shift+Tab stay in overlay, Escape closes, focus returns, background inert; nested-open/rapid reopen tests; axe plus real keyboard across consumers. |
| 3 Motion correctness | Select M1/M2; write then execute exact scoped specs; no new motion on frequent actions. Overlay preference media rule, delete decorative FAQ transition, SiriWave live preference subscription. | S/M | Preference on at load and toggled while open stops displacement/rAF; text and outcomes unchanged; unmount/reopen/resource cleanup tested; normal motion unaffected. |
| 4 Navigation and responsive completion | F6 BackButton; classify/fix confirmed Trail root cause only, min-width/wrap/decoration containment rather than masking content. Verify actual long Arabic/German values at 320 and 200% zoom. | M | All actions visible/reachable, full relevant text available, no dead-end; keyboard/touch targets checked. |
| 5 Visual craft | Landing: demo-first primary for visitors, quiet sign-in, signup after value; signed-in resume unchanged. Apply existing PrimaryAction, heading/type/spacing/material tokens where screenshots show real inconsistency across trail/library/practice/progress/profile and study/live surfaces. Native input rows use min-w-0 where geometry proves need. No wholesale redesign or palette drift. | M | Before/after screenshots show one focal action per learner screen; RTL/LTR and long-copy readable; no task slowdown. Visual final pass required—do not call source changes stunning. |
| 6 Journey resilience | Fill current route-state verification matrix. Repair only discovered input-loss/dead-end/accessibility problems within audited flows; persistent typed fallback, visible feedback by >1s and escape/retry by >5s where operation allows safe cancellation. If a new substantive product decision arises, batch owner questions. | L | Demonstrated demo → account boundary and synthetic story → guided → live → report → review; empty/error/offline/slow/reload/back states recorded. Real OAuth/payment remain owner-only. |
| 7 Final gates/release preparation | `npm run lint`, `npm test`, `npm run test:e2e:types`, relevant and full `E2E_TARGET=preview npx playwright test`, `npm run build`, `npm run design`, Worker JS syntax, production dependency audit, diff checks. Supported Node required. | M | Exact final artifact tested after last repair; no skipped/weakened tests. Keep bundle warning visible. Current release readiness and prior A1/A4/A5/A7 risks evaluated before deploy. |
| 8 Deployment, separately authorized | Only Worker/Pages targets and allowed commands from docs/agent/DEPLOY.md, using connected Cloudflare tools where appropriate. No merge or push implied. Read-only deployed HTTP/smoke proof, no real secrets/payment/data manipulation. | M | Record deployed version, URL, smoke evidence and rollback path. Block if required checks/access/authorization absent. |

Measure actual first-value time and task completion in test runs, not guessed improvement percentages. No current conversion/retention data: unknown; measure only through existing approved privacy-preserving analytics, no new service.

## E. Owner questions and approval

1. **Approve the recommended complete local plan (batches 0–7), including M1/M2 selection?** Recommended: approve; one approval covers implementation and tests, with owner-controlled legal/payment/secret boundaries intact. You can strike items.
2. **Deployment authorization:** project rules require the exact owner line `DEPLOY-AUTHORIZED: worker, pages`. It authorizes those targets only; deployment follows verification and runbook, not immediately on approval. No merge/commit/push is implied.
3. **Legal completeness/caption content:** supply final publisher details or transcript only if necessary for public launch. Do not edit legal content from guesses. These can remain explicitly blocked while independent local improvements proceed.

## F. What not to change

- Arabic-first presentation and real German direction isolation.
- Honest distinction between assisted practice and independent performance.
- Useful review/report/progress empty states and lock prerequisite explanations.
- Free access to already learned material, typed fallback, resumable public demo.
- Server authority for identity, usage, entitlements and measured progress.
- Existing static glass lighting, lightweight/software fallbacks, instant navbar and intentional no-squish Button interaction.
- Reading/exam simulation honestly marked coming soon; never make it sound launched.

## G. Five 90-day bars (targets, not current achievements)

1. First independently produced demo response within 60 seconds in representative mobile usability sessions; record timing and success rather than infer from click count.
2. All reachable learner screens pass a maintained empty/loading/error/offline matrix; each recoverable error supplies a working next action and preserves input.
3. Zero serious/critical automated accessibility failures plus verified keyboard, 320px, 200% zoom and reduced-motion checks across shared interactive components.
4. Zero contradictory price/limit/level/privacy claims between UI and server policy; owner-approved legal completeness before public launch.
5. Every shipped visual change has before/after rendered evidence and real-device feel review; test repeat-learning task time does not regress. Device timings and retention currently unknown.

## Verification and limitations

- Earlier audit segment: 26-route synthetic initial-state traversal exit 0, geometry at 390/320; four unattributed 404s. Not complete flow coverage.
- Current resumed segment: public landing/welcome/demo-intro accessibility snapshots and CTA navigation; exact source reads confirm findings. Browser tab/page changes interrupted deeper demo interaction.
- `run_terminal_command` failed before execution: ENOENT for `C:\Program Files\Git\bin\bash.exe`. Later code_search also failed with missing vendored rg. These are host-tool blockers, not app test failures. No workaround privilege/dependency operation attempted.
- Prior screenshot capture failed because browser webview was not composited. No visual screenshots inspected; no “stunning” or world-class visual pass claimed.
- Current typecheck/tests/build/design were NOT RUN for this docs-only audit. Previous batch proof (1419 unit tests and relevant built-preview checks) remains historical at EXCELLENCE-STATUS, not renewed evidence.
- Previously measured Node 24.14.0 below supported floor; verify under supported Node before release.
- No source edits, installs, commits, pushes, PRs, deploys, production writes, payments or secret actions during this audit. Existing uncommitted prior work and backups preserved.
- Existing dev server answered browser HTTP during this segment; PID/readiness at handoff cannot be rechecked by shell. No process was stopped or replaced.

NEXT: owner selects/approves the combined plan; restore verification tools before implementation, recheck source ownership and HEAD, then execute safe local batches without further per-item approvals.

---

## Execution log — approved 2026-10-04

Owner approved the complete local plan. Deployment remains **blocked**: the owner chose local
verification first and did not supply `DEPLOY-AUTHORIZED:`. No commit, push, PR, deploy or
production write was performed. Base `1a72827`; local Node 24.14.0 (still below the declared floor).

| Item | State | Change |
|---|---|---|
| F1 unlimited claims | Done | Removed "غير محدودة / لا محدودة / بدون قيود يومية" from the upgrade, paywall, profile, report, trail and conversation-limit copy; added one honest fair-use line where Pro is sold. Quotas untouched. |
| F5 judgmental copy | Done | `ScenarioDetailScreen` preparation line now encourages instead of warning that Katzu notices improvisation. |
| F7 level + exam framing | Done | Level range stated A0–B2 everywhere levels are listed (was A1–B2, contradicting the A0 path and FAQ); "لا نقاط" removed (an XP/rank system exists); writing no longer claimed to determine the certificate. |
| F2 busy-button name | Done | `Button` keeps an accessible name while loading (`sr-only` label + `aria-busy`) behind the unchanged thinking indicator. |
| F3 dialog semantics | Done | New `useModalDialog` gives `Modal` and `BottomSheet` `role="dialog"` + `aria-modal`, focus entry, Tab trap, Escape-to-close and focus restore. Markup/visuals preserved (native `<dialog>` restyling could not be screenshot-verified). |
| F4 reduced motion | Done | `index.css` reduced-motion block now also stops the scrim fade; FAQ disclosure glyph no longer animates its transform. |
| M2 SiriWave | Done | Reads reduced motion live via `useReducedMotion` and re-runs on change, instead of a one-time `matchMedia` read at mount. |
| F6 grammar exit | Done | Grammar path renders the shared `BackButton`; `onBack` is used at last. |
| F8 nested main | Done | The five route screens that rendered a second `<main>` inside `App`'s landmark now use a `<div>`; one `<main>` per page. |
| Landing hierarchy | Done | Hero's one primary action is the account-free demo; signup is the clear secondary. |

Regression coverage: `tests/interfaceContracts.test.ts` (10 cases) pins each contract above.

### Verification (this batch, all exit 0)

- `npx tsc --noEmit` — 0
- `npx vitest run` — **115 files / 1429 tests passed** (was 114/1419)
- `npx tsc -p e2e --noEmit` — 0
- `node scripts/design-audit.mjs` — 0 (the initial run went red on `focus-ring-suppression` because of `outline-none` on the new dialog containers; removed, then green)
- `npm run design:contrast` — 0
- `node --check cloudflare-*.js` — 0
- `npm run build` — 0 (entry-chunk >500 kB warning remains, not suppressed)
- `npm audit --omit=dev --audit-level=high` — 0 vulnerabilities
- `E2E_TARGET=preview npx playwright test` — **81 passed (4.9m)**

The dev server this audit had started on port 3000 was stopped so the preview run could use
`--strictPort`; no other process was touched.

### Still open (not done in this batch)

- Trail / `/dev/system` horizontal overflow root cause: **UNKNOWN** (never classified).
- The four 404 resources from the earlier traversal: **UNATTRIBUTED**.
- Full route-state matrix (loading/error/offline/slow/interruption), real OAuth/payment, real
device, screen reader and 200% zoom: **UNWALKED**.
- Optimistic global focus-management nuance for stacked overlays (two open at once) is not covered; each overlay traps independently.
- Visual craft beyond the hero hierarchy (batch 5 remainder) and journey-resilience repair (batch 6) remain unstarted; they need the rendered-screenshot loop, which was unavailable.

---

## Execution log 2 — 2026-10-04 (classification + fixes after the interruptions)

The screenshot renderer recovered this run, so the two biggest gaps closed with measurement instead
of guesswork. Base `1a72827`; still **uncommitted**; deployment still **blocked** (no
`DEPLOY-AUTHORIZED:` line).

### Overflow — classified and fixed at the cause

A temporary Playwright probe measured document `scrollWidth` and every element whose box crossed
the viewport at 320 and 390:

| Route | Width | Before | After |
|---|---|---|---|
| `/app/trail` | 320 | scrollWidth **325** | 320 |
| `/app/trail` | 390 | scrollWidth **394** | 390 |
| `/dev/system` | 320 | scrollWidth **325** | 320 |
| `/dev/system` | 390 | scrollWidth **394** | 390 |

The offender is **decorative, not a control**: the ambient `BorderBeam` halo is drawn
`inset: -30px` (deliberately larger than its card) with no clipping ancestor, so ~5px escaped the
screen and widened the page. The nav's `GlassEffectContainer` union also reported a box past the
edge, but it is already inside an `overflow-hidden` container and does **not** contribute to
scroll width — a `getBoundingClientRect` false positive, excluded. Fix: `overflow-x-clip` on the
app shell in `App.tsx` (`clip`, not `hidden`, so no scroll container is created and the
`position: fixed` nav is untouched). Genuinely invisible on desktop where the halo is well inside
the viewport; trimmed only at the screen edge on narrow phones.

### The four 404s — attributed and fixed at the cause

An 18-route signed-in sweep recorded every `>=400` response and console error: **none** in the
app generally, but the Profile screen issued **four** `POST /referral/info` requests that 404'd.
Source: `workerClient.getReferralInfo()` built `${this.baseUrl}/referral/info`, and with no worker
origin configured (`VITE_WORKER_URL` unset) that collapses to a **same-origin** request every host
answers with 404. (Four = two viewport widths × React's double-invoked mount effect.) Fix: both
`getReferralInfo` and `claimReferral` now refuse to send when `baseUrl` is empty — the same
"do not fire a request we know is wrong" rule the AI endpoints already follow. Re-sweep: clean.

### Hero-video slot — a false-positive found while checking the 404s

The landing `VideoSlot` treated a video as present on `res.ok`, but a single-page dev/preview
server answers an unknown asset path with `index.html` and **200 `text/html`** — so a video that was
never shipped looked present and would render a broken player. The slot now also requires a
`video/*` content type. Verified: no `<video>` renders on `/`.

### Visual pass (renderer restored)

Viewport captures at 320/390 of Trail, Practice, Progress, Profile, Library and `/dev/system`,
reviewed by eye: layout, RTL direction, and wrapping are coherent; no additional must-fix visual
defect surfaced beyond the overflow already fixed. This is a first real visual read, **not** a
claim of "stunning" and **not** a full matrix.

### Regression coverage added

- `tests/interfaceContracts.test.ts` — 12 cases (was 10): + app-shell overflow clip, + hero-video
  content-type guard.
- `tests/workerClient.test.ts` — + "does not send referral requests when no worker origin is
  configured" (asserts `fetch` is never called).

### Verification (this batch, exact artifact, all exit 0)

- `npx tsc --noEmit` — 0 · `npx tsc -p e2e --noEmit` — 0
- `npx vitest run` — **115 files / 1432 tests passed** (was 115/1429)
- `node scripts/design-audit.mjs` — 0 · `node scripts/contrast-check.mjs` — 0
- `node --check cloudflare-*.js` — 0 · `npm audit --omit=dev --audit-level=high` — 0
- `npm run build` — 0 (PWA 101 precache entries, 4309 KiB; the >500 kB entry-chunk warning is kept,
  not suppressed)
- `E2E_TARGET=preview npx playwright test` — **81 passed (6.0m)**

### Still open

- Full route-state matrix (loading/error/offline/slow/interruption), real OAuth/payment, real
  device, screen reader and 200% zoom: **UNWALKED**.
- Batch 5 remainder (visual-craft token pass across every surface) and batch 6 (journey
  resilience) are **not started**; only the hero hierarchy and the overflow are done.
- Stacked-overlay focus nuance (two overlays open at once) still uncovered.
- Deployment: **blocked** — needs the owner's exact `DEPLOY-AUTHORIZED: worker, pages` line.

