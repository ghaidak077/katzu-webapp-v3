# Product Experience Audit — V31 (2026-10-04)

Phases 0–3 of the `product-experience-audit` skill. **Audit only: nothing was changed.**
Every finding is cited to a file+line, a measured number, or a walked screen.
`UNWALKED` marks a step that could not be walked and was traced from code instead.

---

## Phase 0 — Frame

| Question | Answer |
|---|---|
| Who, and their ONE job | An Arabic speaker preparing for life in Germany. One job: **say the next real thing they will actually have to say**, today, without fear. |
| The aha moment | The first **independent** German sentence in the live conversation — accepted by Katzu, not by a hint. Proxy already instrumented: `first_independent_turn`. Reached after landing → `/demo` (4 steps, no account) ≈ 3–5 min, or welcome → name → goal sheet → Google → 5 onboarding screens → placement (5–10 Q) → story → practice → live. **The signed-up path is 3–5× longer than the demo path and ends in the same place.** |
| Promises no fix may break | Arabic-first, RTL, honest numbers ("لا نكتب إنجازاً لم نقِسه"), no in-app payment (code redemption only), **no notifications** (a landing-page selling point: "لا نطلب … إذن إشعارات"), no transcript/mistake text in analytics, not-legal-advice notice on Ask, real German error messages on every failure. |
| Worst realistic context | Mid-range Android, mobile data, one thumb, screen reader off, interrupted, possibly 45+. |
| Safety rails | `npx tsc --noEmit` · `npx tsc -p e2e --noEmit` · `npm test` · `E2E_TARGET=preview npx playwright test` · `npm run build` · `node --check cloudflare-*.js` · 4 content audits · `node scripts/design-audit.mjs` · `node scripts/contrast-check.mjs` · `tests/appMap.test.ts` (machine-checks `docs/agent/APP-MAP.md` §14). "Verified" = a gate run, not a claim. |
| Off-limits | Secrets (never print/rotate/set), D1 content writes, deploys without `DEPLOY-AUTHORIZED: <targets>`, new runtime deps, payment/crypto/OAuth/domain changes. |

---

## Phase 1 — The real-user walk

**Method.** 27 routes × 3 viewports (360×640, 320×640, 768×1024) driven against the
production bundle (`vite preview`, `E2E_TARGET=preview` build) with a signed-in learner
and a canned backend — 81 route-visits — plus a second pass that seeded a completed
session, a mistake, two due review items and a 4-day streak to reach the states a fresh
account cannot (7 more). Live production was walked in the real browser for the public
surface. Measured on every visit: horizontal overflow, sub-44 px targets, unnamed form
controls, headings, console/page errors, and the full visible text.

**Clean:** zero horizontal overflow anywhere except two screens; **zero** unnamed form
controls (27 × 3 = 81 visits); **zero** console or page errors in either pass.

### 1. The first 30 seconds — `/` (walked live on production)

What I saw: an Arabic-native promise ("تحدّث الألمانية التي تحتاجها فعلاً"), the ONE next
action above the fold (`ابدأ مجاناً الآن`) plus the trust-preserving alternative
(`جرّب درساً بدون حساب`), an honest four-audience section that says "إن لم تجد حالتك هنا
فربما لم نبنِ ما تحتاج بعد", real German mistakes with corrections, a price table with
**"لا دفع داخل التطبيق ولا اشتراك تلقائي مفاجئ"**, and a "قريباً" list that does not
pretend Reading exists. One video element sits in the hero (buffering on this walk).

*Feeling:* "I know what this is, who it's for, what it costs, and I can try it before
giving anyone my email."

### 2. Signup / first run — `/welcome` → `/signin` → `/onboarding` → `/placement`

| Step | Taps | What I felt |
|---|---|---|
| `/welcome` | type name → goal sheet (minutes/days/level) → Google | **Four competing CTAs** for one action: `ابدأ رحلتك الآن`, `تسجيل الدخول`, `إنشاء حساب جديد`, and the Google button — three of which do the same thing. |
| `/signin` | Google (+ a **level picker A0–B2 shown on the returning-user tab too**) | Google renders exactly one button (verified). But a returning learner is asked to re-pick their level on the *sign-in* tab, where it is already known. |
| `/onboarding` | 5 full screens, one question each | "خمسة أسئلة قصيرة، سؤال واحد في كل شاشة" — honest, and slow. Nothing is skippable and nothing is rewarded on the way. |
| `/placement` | 5–10 adaptive questions, **or** two 32 px-tall text buttons to declare a level | Good framing: "لا نجاح ولا فشل هنا". |

The **goal sheet fires before the account exists**, so a learner who abandons Google
sign-in has set goals for nothing and re-enters the sheet on return.
*Feeling:* "Nothing is wrong here, but I'm being asked five times before anything happens."

### 3. The core loop — story → guided practice → live conversation → debrief (walked)

`/scenario/cafe_order/story` sets the scene and states the mission in plain Arabic.
`/practice` gives 3 phrases + a grammar beat + a listen-and-repeat + the word bank.
`/live` offers **two modes of one conversation** (تدريب مع مساعدة / محادثة حقيقية) —
excellent. A typed turn landed and the transcript read naturally.
*Feeling:* "I know what to do at every moment."

**But the debrief is unrecoverable** — see P0-2.

### 4. Every use case, including the boring ones

Screen checklist — **27/27 walked**:

`/` · `/welcome` · `/signin` · `/demo` · `/trust/privacy` · `/trust/terms` ·
`/onboarding` · `/placement` · `/subscription` · `/app/trail` · `/app/library` ·
`/app/practice` · `/app/progress` · `/app/profile` · `/app/grammar` · `/app/review` ·
`/app/listen` · `/app/write` · `/app/coach` · `/app/ask` · `/scenario/:id` ·
`/scenario/:id/study` · `/scenario/:id/quiz` · `/scenario/:id/story` ·
`/scenario/:id/practice` · `/scenario/:id/live` · `/session-report`

`UNWALKED` (traced from code + the existing suite, not walked as a user):
the debrief **with** a summary; `/demo` steps 2–4; onboarding steps 2–5; the placement
question loop; the quiz result state; the PaywallModal as rendered; code-redemption
failure; offline; the screenshot-based visual pass (the preview webview would not
composite, so the designer's verdict rests on computed styles, the contrast gate and
the design audit — **stated, not hidden**).

### 5. Empty, error, edge, slow

Empty states are the best thing in this product. Every zero names its cause and its next
action:

- `لا توجد مراجعة مستحقة الآن` + "ابدأ مشهداً جديداً…" + *الراحة بين الجلسات جزء من الحفظ، لا انقطاعاً عنه*
- `لا توجد أخطاء مسجلة بعد` + "تحدث مع كَاتْزُو في مشهد واحد…"
- `لم تبدأ بعد. أول مشهد كامل سيُظهر هنا ما أصبحت قادراً عليه — بالضبط، لا أكثر.`
- `هذه أول مهمة لك. لنبدأ بشيء تخوضه فعلاً في ألمانيا.`

Chat errors are per-code and specific: `REQUEST_TIMEOUT` → "انتهت مهلة الاتصال… جملتك
محفوظة", `NETWORK_ERROR` → "تعذر الوصول… أعد المحاولة", and the learner's sentence stays
in the transcript with a one-tap retry. **That is better than most shipped apps.**

Where it fails: the entitlement path (P0-1), the referral load (P1-6), the two blank rows
on Coach (P2-3), and the hint ceiling (P1-5).

### 6. Payment, upgrade, honesty

`/subscription` states the price, the channel ("الدفع يتم على صفحة الشراء الرسمية") and
that no card data is stored. Redemption, referral linking, data export and account
deletion all live here or in Profile. But **the session count it prints is never true**
(P1-3), and the free learner's actual wall is a retry loop instead of this screen (P0-1).

### 7. Retention and the returning user

Streak, three daily tasks, the SRS review queue, one-forgiven-day streak, the Arabic rank
ladder, and `return_day1` / `return_day7` markers. Day 2–3 is unmeasured (P2-10). No
push/email re-engagement — **deliberate, and promised on the landing page.** The
returning path is fast: one daily mission, not a replay of first-run.

### 8. Accessibility throughout

| Check | Result |
|---|---|
| Contrast (all token pairs) | pass, tightest **4.52:1** vs a 4.5 threshold |
| Unnamed form controls | **0** across 81 visits |
| Keyboard focus ring | present (`rgb(180,160,255) solid 1.9px` measured) |
| Sub-44 px targets, **primary** actions | 0 |
| Sub-44 px targets, **secondary** controls | ~90 (P1-8) |
| Horizontal overflow | 2 screens, 4–5 px (P2-1) |
| RTL | native throughout; `origin-right` progress bars |
| Colour as the only signal | no finding |
| SPA route announcement / skip link / per-route title | **absent** (P1-7) |

---

## Phase 2 — The persona panel

| Persona | /5 | Evidence |
|---|---|---|
| **The End User** (chair) | 4 | "It never lies to me and it never leaves me stuck — except when my free sessions run out, where it lies and then strands me." |
| **UI/UX Expert** | 3 | The loop is tight, but `/welcome` offers four doors to one room, the debrief can vanish, and Profile's referral panel is a dead end. |
| **Visual Designer** | 4 | One hue family (measured OKLCH 283–298 on live `/demo`, `/welcome`, `/signin`), AA contrast, a real motion ladder, zero raw hex/rgb/font-size/radius — but the AA margin is 0.02 over the line and secondary controls drop to 16 px. |
| **Product Strategist** | 3 | The activation path is 3–5× longer than the free demo that already gets the learner to value; the monetization moment is a bug; there is no day-2/3 measurement. |
| **The Skeptic** | 3 | The paywall prints "3 جلسات" forever. The hint button spends 30/day and says nothing. The missing-config screen shows learners `.env` instructions. |

**Panel consensus.** The End User's verdict — 4, with the reservation concentrated
entirely at the paywall — outranks the panel, and the experts agree on the diagnosis:
the *product* is unusually honest and unusually well-built, and the failures are not in
the learning experience but at the **moments of truth**: when the free tier ends, when
the reward appears, and when the app says a number. Nothing here requires re-designing
the product. It requires making three specific moments tell the truth.

---

## Phase 3 — The plan

### A. Verdict

Katzu is a product, not a prototype: honest copy, real empty states, a closed core loop,
a disciplined one-hue design system. "World class" for this product is one honest,
seamless path from the landing promise to a spoken German sentence — and that path is
already 90% built. **The single biggest gap is that the moment the free tier runs out,
the app stops being honest and stops being useful at the same time.**

### B. Journey scorecard

| Stage | /5 | One line |
|---|---|---|
| First 30 seconds | 5 | Arabic-native promise, one CTA, honest pricing, "try before you sign up". |
| Signup / first run | 3 | Four doors to one room; the goal sheet fires before the account exists; 5 more screens before value. |
| Core loop | 4 | Tight and well-paced; the debrief is unrecoverable. |
| Skill surfaces | 4 | Real, measured, bridged by a word bank that reduces give-ups. |
| Empty states | 5 | Best-in-class: every zero names its cause and its next action. |
| Errors & edge | 3 | Chat errors are excellent; the entitlement path, the referral panel and the deploy-config copy are not. |
| Payment & honesty | 2 | The paywall states a session count that is never true. |
| Retention | 4 | Streak + tasks + SRS are real; day 2–3 is unmeasured. |
| Accessibility | 3 | AA and named controls; no route announcements, ~90 sub-44 px secondary targets. |
| Visual consistency | 4 | One hue family, token-owned, purposeful motion; the AA margin is 0.02. |

### C. Findings register

#### P0 — journey blockers

**P0-1 · Live conversation · the free wall is a dead end, not an upgrade.**
`useLiveConversation.ts:768` opens the paywall only for `code === 'PAYWALL_REQUIRED'`.
The worker answers **`FREE_QUOTA_EXHAUSTED`** (`cloudflare-unified-worker.js:431`); the
client maps any 402 to `error.code = data.code` (`workerClient.ts:469`), so the code
arrives correctly; `classifyTurnError` (`stateMachine.ts:274`) matches the literal
`PAYWALL_REQUIRED` or a Latin `quota|trial|entitlement|paywall` in the message — and the
client's own Arabic message contains none of those. Result: `{kind:'ai_service',
retryable:true}` → a generic "try again" card, forever.
`WritingScreen.tsx:39` already gets this right with `PAYWALL_CODES`.
→ **Fix the whole entitlement family in one shared constant and reuse `WritingScreen`'s
set.** `QUOTA_UNAVAILABLE` (503) must stay retryable — it is a server hiccup, not a wall.
*Personas: End User (stuck), Strategist (the money moment), Skeptic (a lie).*

**P0-2 · Debrief · the reward is unrecoverable.**
`App.tsx:659–669`: `ReportRoute` restores from React state or `sessionStorage`, and
otherwise `<Navigate to="/app/trail" replace />` — silently, with no message. A refresh,
a crashed tab, or closing the window inside the 3.2 s `finishSession` window destroys the
result. The `sessions` row is already in Dexie.
→ **Reconstruct from the most recent completed session; if there is nothing, say so on a
real screen instead of silently redirecting.**
*Personas: End User, UI/UX.*

#### P1 — friction and trust

**P1-3 · `/subscription` prints a session count that is never true.**
`SubscriptionRedemptionScreen.tsx:157` renders `user.freeSessionsRemaining`, seeded at 3
(`katzuDb.ts:280`) and never written. The real ledger is server-side
(`cloudflare-unified-worker.js:439`) and `/check-status` (`:2247`) does not expose it.
→ Add `free_sessions_remaining` to `/check-status`, render it, and say "الرصيد محسوب على
الخادم" when unknown. *Skeptic — lies-by-omission on the paywall.*

**P1-4 · Arabic number agreement is systematically wrong.**
`راجع 3 عنصراً الآن` (`ProgressScreen.tsx:544`) — Arabic takes the **plural** for 3–10,
so this should be `راجع 3 عناصر الآن`. Same defect at `ReviewScreen.tsx:235`,
`coach/profile.ts:104` and `:325`, `JourneyHomeScreen.tsx:328`, `journey/context.ts:198`,
`ProfileSettingsScreen.tsx:359`, `share/card.ts:99`, `checkIn.ts:47`,
`PracticeScreen.tsx:169`. Worst: `selectMission.ts:194` renders `راجع 3 الآن` — **the noun
is missing entirely** ("Review 3 now" — 3 what?).
→ One tiny pluralizer + a unit test, applied at every site. This is the single most
"machine-made" thing in an Arabic-first product. *End User.*

**P1-5 · The hint refresh becomes a silent lie.**
V30 capped `/ai/hints` at 30/day and answers over-limit with HTTP 200 + `hints: []`;
`useLiveConversation.ts:855` silently falls back to the starter-phrase floor. After 30
refreshes the 💡 button looks alive and always returns the same generic chips.
→ When the server answers `HINTS_QUOTA_EXCEEDED`, say so once under the hint panel and
disable the refresh for the day. *Skeptic.*

**P1-6 · Profile · the referral panel is a dead end.**
`ProfileSettingsScreen.tsx:328` renders "تعذر تحميل كود الإحالة. تحقق من الاتصال وأعد
المحاولة." with **no retry control** — it tells the learner to retry and gives them no way.
→ Add a real `أعد المحاولة` button. *UI/UX, Skeptic.*

**P1-7 · SPA navigation is silent.**
No per-route `document.title`, no skip link, and no focus move or live-region
announcement on route change (`App.tsx:207` — the only `aria-live` regions are the
auth-loading and lazy-route fallbacks). A screen-reader user pressing through the app
hears the same page name on all 27 screens.
→ A `useDocumentTitle` per route + move focus to `<main>` on navigation + one `sr-only`
route announcer + a skip link. *Accessibility.*

**P1-8 · ~90 sub-44 px secondary targets.**
Concentrated: Profile 21, Writing 24, Guided Practice 15, Listening 9, Ask 6. The two
GDPR rows — `تنزيل نسخة بياناتي` and `أريد حذف حسابي` — are **38 px**; the three privacy
links are **16–17 px**. Vocabulary word chips (30 px) are acceptable: a text input is
always available as the alternative. Category/segment chips (30–32 px) are not: they are
the primary navigation inside their screen.
→ `min-h-touch` on the Profile rows and the category/segment chips; leave the word chips.

#### P2 — polish

- **P2-1** 4–5 px horizontal page scroll on `/app/trail` (measured `scrollWidth 364` vs
  `clientWidth 360`). Cause: `GlassEffectContainer`'s union backdrop is expanded by
  `spacing` past the box union (`GlassEffectContainer.tsx:203–211`) and is not clipped.
- **P2-2** `/welcome` offers four doors to one room; `ابدأ رحلتك الآن` and
  `إنشاء حساب جديد` do the same thing. Collapse to one primary + one ghost.
- **P2-3** Coach renders `ما تحسّن:` and `ما تكرّر:` as **empty labels** when
  `weekly.hasData === false` (`CoachScreen.tsx:214–227`, `coach/profile.ts:296–298`).
- **P2-4** `/app/progress` says "3 مراجعة مستحقة" at the top and "0 في المراجعة" directly
  above six vocabulary rows. Two counters, one screen, no explanation.
- **P2-5** `/app/library` and the Trail both render a "today's mission" hero.
- **P2-6** `WORKER_URL_MISSING` tells the learner to "حدّث التطبيق" for a server-side
  misconfiguration (`useLiveConversation.ts:786`).
- **P2-7** The sign-in **tab** shows the A0–B2 picker to a returning user whose level is
  known.
- **P2-8** The missing-`VITE_GOOGLE_CLIENT_ID` screen shows learners `.env` and Cloudflare
  instructions (`SignInScreen.tsx:270–300`).
- **P2-9** Stale `Magenta` comments in `useLiveConversation.ts:246` after the palette
  collapse to one violet axis.
- **P2-10** No `return_day2` / `return_day3` — day 1 and 7 are measured, the habit-forming
  days are not.
- **P2-11** Offline, the grammar path silently degrades from "0 من 77" to "0 من 4" with no
  notice.
- **P2-12** `أكمل تفضيلاتك` ("complete your preferences") sits **above** today's mission
  on the home screen, permanently, for anyone who skipped onboarding.
- **P2-13** `أعرف مستواي — اختره بنفسي` sets `placementSkippedAt`, yet Profile still says
  "مستواك غير مقيس بعد" while the app has already filtered to A1. The data model already
  distinguishes chosen from measured (`PlacementScreen.tsx:149–158`) — only the copy
  fails to use it.

### D. Execution plan

Ordered by (users affected × severity) ÷ effort. Each batch is one commit, independently
revertible. Nothing here needs a new dependency.

---

**Batch 1 — Stop lying at the moments of truth** *(P0-1, P0-2, P1-3, P1-5)*
Effort **M**. Metric: sessions that reach turn 1 after the free wall; `code_redeemed`
conversion from `/subscription`. Verify: new unit tests for `classifyTurnError` covering
`FREE_QUOTA_EXHAUSTED` (→ quota, not retryable) and `QUOTA_UNAVAILABLE` (→ retryable);
a new e2e asserting the paywall opens on a 402 `FREE_QUOTA_EXHAUSTED` and that the retry
button is absent; a `session-summary` unit test for the Dexie reconstruction; a
`/check-status` worker test asserting `free_sessions_remaining`.
1. `src/lib/entitlement/codes.ts` (new) — `ENTITLEMENT_WALL_CODES` + `isEntitlementWall(code)`.
2. `useLiveConversation.ts:768` — use it; keep `QUOTA_UNAVAILABLE` retryable.
3. `stateMachine.ts:274` — match the code set too, not only the message.
4. `App.tsx:659` — reconstruct the summary from the newest completed `sessions` row;
   render an honest "لا يوجد تقرير محفوظ" state instead of a silent redirect.
5. `cloudflare-unified-worker.js:2247` — add `free_sessions_remaining` from `readTrialQuota`.
6. `workerClient.ts` `checkSubscriptionStatus` + `SubscriptionRedemptionScreen.tsx:157`.
7. `useLiveConversation.ts:855` — honour `HINTS_QUOTA_EXCEEDED`.

**Batch 2 — Arabic that a native speaker would sign** *(P1-4, P2-13)*
Effort **S**. Metric: none measurable — this is a quality bar. Verify: a
`tests/arabicPlural.test.ts` covering 0/1/2/3/5/10/11/100 × singular/dual/plural, and a
`design-audit.mjs` rule that flags a bare `${count}` template immediately followed by an
Arabic noun in a template literal.
1. `src/lib/i18n/arabicCount.ts` (new) — `arPlural(n, forms)` + `arCount(n, forms)`,
   unit-tested for the full 0/1/2/3–10/11+ grid.
2. Apply at the ten sites in P1-4; give `selectMission.ts:194` its missing noun.
3. P2-13: use `placementCompletedAt` vs `placementSkippedAt` in the Profile and library
   copy ("اخترت A1 بنفسك — لم يُقَس بعد").

**Batch 3 — Reach every thumb** *(P1-8, P2-1)*
Effort **S**. Metric: task-completion rate on Profile and the writing screen.
Verify: extend the measurement harness used for this audit to assert **zero** sub-44 px
targets outside an explicit allow-list of word chips; assert `scrollWidth <= clientWidth`
on `/app/trail`.
1. `min-h-touch` on the Profile preference rows, the GDPR rows, and the privacy links.
2. `min-h-touch` on category/segment chips (`PracticeScreen`, `ListeningScreen`,
   `AskKatzuScreen`, `StudyScreen`).
3. Clip the glass union backdrop so `/app/trail` has no horizontal scroll.

**Batch 4 — Speak on every screen** *(P1-6, P1-7)*
Effort **M**. Metric: axe violations (0 → 0 with more coverage); task success with a
screen reader. Verify: a new axe spec over the routes the current
`e2e/accessibility.spec.ts` does not visit; a unit test that every route path has a title.
1. `ProfileSettingsScreen.tsx:328` — a real `أعد المحاولة`.
2. Per-route `document.title` (Arabic, one per route).
3. Skip link + focus move to `<main>` + one `sr-only` route announcer.
4. Extend `e2e/accessibility.spec.ts` to the full route list.

**Batch 5 — Corners and copy** *(P2-2, P2-3, P2-4, P2-5, P2-6, P2-7, P2-8, P2-9, P2-10, P2-11, P2-12)*
Effort **S/M**. Verify: per-item unit test where the item is behaviour, e2e otherwise.
- P2-2 collapse `/welcome` to one primary + one ghost.
- P2-3 hide or fill the two blank Coach rows.
- P2-4 label the two Progress counters distinctly.
- P2-5 give the library a catalogue hero instead of a second daily mission.
- P2-6 `WORKER_URL_MISSING` → a support line, not "update the app".
- P2-7 level picker only on the signup tab.
- P2-8 the missing-config screen → one Arabic sentence + a support link.
- P2-9 stale `Magenta` comments.
- P2-10 `return_day2` / `return_day3` (allow-list + worker + tests).
- P2-11 an offline notice when remote content is missing.
- P2-12 move the preferences banner below today's mission.

**Ship order:** 1 → 2 → 3 → 4 → 5. Batch 1 and Batch 1's worker half **require a worker
deploy** to take effect; everything else is Pages-only.

### E. Questions for the owner

1. **Signup funnel — recommended: cut it.** Five onboarding screens before any value, when
   the no-account demo already delivers it in three. Options: **(a) merge the 5 questions
   into 2 screens and default the rest** *(recommended — keeps every question, halves the
   time)*; **(b) move onboarding after the first scenario** (fastest possible value, but
   the daily mission is unmeasured for a day); **(c) leave as is**.
2. **Level picker on the sign-in tab** — hide it for a returning learner (recommended),
   or keep it so they can correct a wrong level.
3. **The four CTAs on `/welcome`** — collapse to `ابدأ رحلتك الآن` + a ghost
   `لديك حساب؟ تسجيل الدخول` (recommended), or keep the demo button as the second door.
4. **Batch 1 needs a worker deploy** to fix the free wall and the session count. Authorize
   `DEPLOY-AUTHORIZED: merge, worker, pages` when the batches are green, or ship
   Pages-only now and let the free wall stay broken until the next authorized deploy.

Nothing else in this plan needs a decision. Everything else was decided end-user-first
and is recorded above.

### F. What NOT to change

- **The honesty layer.** "لا نكتب إنجازاً لم نقِسه", "الراحة بين الجلسات جزء من الحفظ، لا
  انقطاعاً عنه", "هذا ليس تقييماً", "نعرض فقط ما نستطيع قياسه — بلا أرقام مزوّفة", "ليس
  محاضرة أخلاقيات", "لا نبيع بياناتك". This is the product's moat and its brand. Fix the
  numbers; never remove the doubt.
- **No push notifications and no email.** A landing-page selling point. Retention stays
  streak + tasks + SRS.
- **Empty states as they are.** Cause + next action + a reason to come back.
- **REAL mode hiding help.** The trade-off is explained on screen and the report is the
  payoff.
- **The word bank.** It measurably reduces give-ups and is now instrumented.
- **The single violet axis, the focus ring, the motion ladder.** Keep them; protect the
  4.52:1 margin rather than spending it.
- **No new runtime dependency, no new data collected, no payment change, no OAuth change.**

### G. 90-day vision — five measurable bars

| # | Bar | Measured by |
|---|---|---|
| 1 | **First independent German sentence under 90 seconds** for the no-account path and under 4 minutes for the signed-up path | `first_independent_turn` − `demo_started` / `onboarding_started` |
| 2 | **Zero silent failures**: every error state shows a cause and exactly one next action, and no screen redirects without saying why | a new `design-audit` rule + an e2e that walks every error branch and asserts an affordance |
| 3 | **Zero blank states and zero unmeasured numbers on screen** — every count is server-derived or explicitly labelled as local | the Arabic-plural audit + a "no bare count" gate |
| 4 | **Every primary and secondary tap target ≥ 44 px**, exceptions allow-listed by name | the extended measurement harness, in CI |
| 5 | **Day-2 return measured and above the day-7 rate's early curve** | `return_day2` / `return_day3` added next to day 1 and day 7 |

---

## Appendix — what "verified" means here

Gates run during this audit, all green: `npx tsc --noEmit` · `npx tsc -p e2e --noEmit` ·
`npm test` **106 files / 1323 tests** · `E2E_TARGET=preview npx playwright test`
**62 passed (5.3 m)** · `npm run build` · `node scripts/design-audit.mjs` **Within
budget** (0 raw-hex / 0 raw-rgb / 0 raw-font-size / 0 raw-radius / 0 unnamed-field /
0 transition-all / 0 focus-ring-suppression; arbitrary-value 32/40) ·
`node scripts/contrast-check.mjs` **all pass, tightest 4.52:1**.

Walk evidence: 81 route-visits (27 routes × 3 viewports) + 7 seeded states, all served
from the production bundle; the public surface was walked live on
`katzu-webapp-v3.pages.dev`. Zero page errors, zero console errors, zero unnamed form
controls in either pass.

Not verified: the visual pass by eye (the preview webview would not composite, so the
design verdict rests on computed styles and the two design gates), real-device voice,
and any user statistic — every number in this report is a measurement of the app, never
of its users.