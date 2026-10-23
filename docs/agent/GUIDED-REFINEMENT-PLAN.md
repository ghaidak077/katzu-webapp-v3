# Guided refinement — one action per screen

**Status:** plan for approval. No source, test, config or content file was changed.
**Scope:** the first-run path and Journey Home only. Everything sits behind one flag, `guidedHome`.
**Size:** the brief asked for ~25 KB, but `tests/agentDocs.test.ts` caps every unnamed
`docs/**/*.md` at 22 KB; this file is written to that gate (§I-7).

**Read §I first** — it is where the direction and the code disagree, and it changes decisions.

---

## A. Current-state audit (APP-MAP §3 is the route table; anchors are files/lines)

| Screen | Shows today | Competing actions | Where a new user gets lost |
|---|---|---|---|
| `/welcome` `auth/WelcomeScreen.tsx` | Badge, mascot, headline, optional name field, CTA, divider, demo button, Google button (`:108`), “لديك حساب” + sign-in (`:123`), credit | **5**, all moving forward | The Google button and the CTA go to the *same* destination (`onGoToSignIn('signup')`, `:42` vs `:108`); the demo is a third door. Nothing says “3 minutes”. |
| `/signin`, `/onboarding`, `/placement` | Tab switcher + one Google control; one question per screen, first run = 2 (`FIRST_RUN_STEPS`, `:47`); optional 2-minute check | 3; 4 then 3; — | Clean. **No level picker** (A3, `SignInScreen.tsx:391`) and onboarding is already 30 s with no jump to placement (`:377`): nothing to fix here. |
| `/app/trail` `journey/JourneyHomeScreen.tsx` | **9 stacked blocks**: header + Pro chip (`:289`), onboarding nag with its own X (`:314`), hero (16:9 banner + badge + DE/AR title + reason + time + level note + countdown + CTA, `:344`), 3-row daily panel (`:435`), Katzu line (`:438`), review row (`:448`), capability/goal card (`:464`), chapter strip (`:481`), expiry card (`:502`), weekly recap (`:520`), 2 chips + level chip (`:536`) | **~10 tappable things** on first paint | The owner's complaint, confirmed. The hero does not visually outrank six blocks about *later* (chapter goal, progress, recap, expiry) — nothing answers “what do I do first”. |
| `/scenario/:id/story` `journey/StorySetupScreen.tsx` | Back, location chip, 3 chip rows, glass card with DE+AR title, situation, «لماذا اليوم», «مهمتك», opener card with play + translation, Katzu line, offline banner, `PrimaryAction` «ابدأ التدريب», quiet «ليس الآن» | 4 (back, play, CTA, not-now) | Two cards of prose before the button; rationale sits at the same weight as the action. |
| `/scenario/:id/practice` `journey/GuidedPracticeScreen.tsx` | 2–3 phrase cards, one-open accordion, readiness dots, docked «أنا جاهز» | 1 primary + collapsed sections | **Already right** (V32 / launch polish). Nothing to change. |
| `/scenario/:id/live` `conversation/LiveConversationScreen.tsx` | Mode chooser: practice card (recommended), real card, a third «ابدأ «تدريب» الآن» (`:242`), back | 4 | The third button duplicates the first card — but this is the core loop; out of scope (§J). |
| `/session-report` `report/SessionReportScreen.tsx` | Presence, headline, capability card + 4 evidence rows, debrief card (+ «مشهد آخر الآن»), follow-up card (`:539`), exam card, level promotion, Pro card, inline retype drill (an input per mistake), dock | **up to 9** | A first-timer finishes their first real conversation and is asked a **new question** (placement) and offered a **purchase** at the same time as the drill. The primary CTA flips to «راجع تصحيحات هذه الجلسة» whenever a correction is open (`:705`) — i.e. it sends a day-0 learner into review. |
| tabs `app/AppShell.tsx:546` `MainTabsRoute` | One concentric glass pill, 4 tabs, all live immediately | 4 | On day 0, التدريب/التقدم/الملف open dashboards of things the learner has not measured, with no explanation. |

---

## B. Target state per screen

Voice: second person, short, warm, no exclamation marks. Western digits for counts (`اليوم 1`, not ١;
the G1/G2 rule in APP-MAP §4).

**Home — one hero, one path, one “more”.**

| Slot | Content | Arabic |
|---|---|---|
| Header | day · chapter line, chapter `h1`, offline indicator, Pro chip (hidden until the first session) | `اليوم {context.dayNumber} · الفصل {i} من {n}` — unchanged, keeps `e2e/journey.spec.ts` green |
| **Primary** | the existing hero (16:9 banner + badge + DE title + AR title), then **one** button; the exam countdown stays inside it | badge `missionTitleBadgeAr(...)` and `mission.ctaAr` unchanged («ابدأ من لحظة الوصول» / «أكمل من حيث توقفت» / «ابدأ مهمة اليوم (10 د)»), `data-testid="exam-countdown"` kept |
| Path | existing chapter `ProgressStrip`, moved under the hero | `بقي {n} من {m} مشاهد في هذا الفصل` |
| Habit | `DailyTasksPanel` unchanged; hidden until the first session | unchanged strings |
| Secondary | one quiet row → one `BottomSheet` holding the nag (only if preferences are truly missing), Katzu line, review row, capability/goal card, weekly recap, expiry card, «القواعد», «كل المشاهد والمستويات», level chip and the hero's reason / time / level note | «المزيد» / «كل شيء آخر» |

Moved, not deleted: those blocks render inside one `BottomSheet` (`components/ui/BottomSheet.tsx`)
from the same JSX as today (§E step 1) — one source of markup. Empty/error states keep their
substance: `no_content` keeps «نزّل المحتوى وابدأ» + hint, offline keeps the indicator and CTA hint.

**Story Setup.** Primary «ابدأ التدريب», secondary «ليس الآن» (both unchanged). «لماذا اليوم» +
«مهمتك» move into one disclosure «تفاصيل هذا الموقف». Title, situation, opener + translation retry
and the Katzu line stay. Empty/error unchanged (`:135-160`).

**Report.** Kept: presence, headline, capability card + evidence rows, debrief card, retype drill, dock.
Hidden **on the first session only**: follow-up card, Pro card, «مشهد آخر الآن», promotion, exam
card; the dock's primary becomes «العودة إلى الرحلة» even when corrections are open. One added line
under the headline: «هذه أول جلسة كاملة لك — وهذه الأرقام هي كل ما قِسناه.» Celebration = the existing
earned treatment + `kz-pop` + `useCountUp`.

**Tabs.** Tapping التدريب/التقدم/الملف before the first session opens a `BottomSheet` (pill
untouched, `aria-current` stays on الرحلة): title «هذا القسم يفتح بعد أول محادثة», body «جلسة واحدة
قصيرة تكفي — وبعدها كل شيء مفتوح.», primary «ابدأ أول محادثة» → the hero's story, quiet
«الإعدادات والحساب» → `/app/profile` (trust escape hatch, §I-1) and «إغلاق». Direct URLs keep
working: the lock is on the tab **button**, not on a route; no route is removed.

---

## C. First-session script

```
/ → /welcome → /signin (Google) → /onboarding [goal, minutes]
  → /scenario/airport_arrival/story → …/practice → …/live → /session-report → /app/trail
```

Two routing changes only: `OnboardingRoute.onDone` (`AppShell.tsx:450-458`) jumps to
`/scenario/${INTRO_SCENARIO_ID}/story` when the flag is on and the scenario row exists (else
`/app/trail` as today); home defers the review mission until the first session is done.

**“First session done” = `db.sessions.count() > 0`.** No new table: `useLiveConversation.ts:1069` is
the only writer of `db.sessions` and runs only when the conversation actually completes;
`scenario_training.studiedAt` is written earlier (guided practice `:162`) and must not unlock. This
is the evidence `context.isFirstRun` (`lib/journey/context.ts:150`) almost uses, and `dayNumber`
(`:119`) already derives from the first session.

**Quit mid-way, return.** No new state — every resume point exists: before story → the hero is still
the arrival episode (`selectMission.ts:282`, no training row yet); after practice → branch 2 returns
«أكمل من حيث توقفت»; after the last turn but before the report → `ReportRoute` rebuilds it from
`sessions` + `mistakes` (`AppShell.tsx:743`). Onboarding never re-asks
(`needsOnboarding`, `lib/onboarding/preferences.ts:214`).

**Tab lock without touching the pill.** All four `TabButton`s stay rendered, unchanged
(`AppShell.tsx:546` `MainTabsRoute`); `setTab` becomes `(next) => (locked && next !== 'Trail') ? openSheet() :
navigate(...)`. `data-glass-key`, `activeKey`, the container and the concentric shape are untouched —
exactly what `e2e/navbarGeometry.spec.ts` measures.

---

## D. Flag design

`src/lib/flags/guidedHome.ts`:

```ts
const KEY = 'kz.guidedHome';                 // per-device kill switch, no deploy
export function isGuidedHomeEnabled(): boolean {   // read once, lazily
  try { const v = localStorage.getItem(KEY); if (v === '0') return false; if (v === '1') return true; } catch {}
  return (import.meta as { env?: { VITE_GUIDED_HOME?: string } }).env?.VITE_GUIDED_HOME !== '0';
}
```

Same `import.meta` cast as `lib/utils/env.ts` (no `vite/client` types). Default **on**;
`VITE_GUIDED_HOME=0` or `localStorage['kz.guidedHome']='0'` turns it off per build / per device.

Read in four places: `JourneyHomeScreen`, `MainTabsRoute` (lock), `OnboardingRoute` (jump),
`ReportRoute` → prop into `SessionReportScreen`.

**Off = today, byte for byte.** Every new element is wrapped in `{guided && …}` or an early return
that is skipped, so the DOM when off is the current DOM; no storage write, no event, no route
change (`/app/trail` already exists), no CSS. Guarded by one new unit test (each new block sits
inside a `guided` condition) plus a full e2e run with `VITE_GUIDED_HOME=0`.

---

## E. Execution order — one screen per step

Every step: re-read exact lines before an exact-match edit (CRLF tree); `npx tsc --noEmit`;
`npm test`; the listed specs with the dev server on :3000 (`npm run dev`; `reuseExistingServer`);
before/after shots at 390×844 via the existing rig (`e2e/shots/*`, `TAG=before|after`);
`node scripts/simplicity-check.mjs` and `node scripts/design-audit.mjs` stay at 0. Never touch:
`cloudflare-*.js`, `src/lib/db/katzuDb.ts`, `lib/srs/*`, `lib/entitlement/*`,
`useLiveConversation.ts`, `ConversationDock.tsx`, `migrations/`, `wrangler.toml`.

### 1. Home hero card (flag skeleton + home)
Touch: new `lib/flags/guidedHome.ts`; `journey/JourneyHomeScreen.tsx` (wrap the secondary blocks,
render them in one sheet, hide the nag / Pro chip / review row at 0 sessions); new
`journey/JourneyMoreSheet.tsx` (not `*Screen.tsx`, so APP-MAP §14 needs no entry); APP-MAP §3/§4
rows + change-log line. Not: `AppShell`, `TrailScreen`, `DailyTasksPanel`, `ProgressStrip`,
`index.css`. Effort M (~4 h), risk low (presentation only). Tests: `e2e/banner.spec.ts:92` and
`e2e/firstRun.spec.ts:100` reach the library through the sheet (or `page.goto('/app/library')`);
`e2e/navOverlap.spec.ts:25` last element becomes `[data-testid="journey-more"]`; add
`tests/guidedHome.test.ts` and one sheet e2e. `e2e/journey.spec.ts` stays green untouched. Done
when: hero + path + tasks + «المزيد» fit one 390×844 screen, exactly one filled primary, listed
specs green, suite green with the flag off, both source gates at 0.

### 2. First-session chain (the preferences step already exists)
Touch: `AppShell.tsx` `OnboardingRoute.onDone` only (guarded jump); `JourneyHomeScreen` review
deferral at the `selectDailyMission` call (`reviewItems: firstSessionDone ? reviewItems : []`).
Not: `OnboardingScreen.tsx`, `selectMission.ts` (keep it pure), welcome/sign-in. Effort S (~2 h),
risk medium-low (the row check plus `/app/trail` fallback covers a missing scenario). Tests:
`e2e/onboarding.spec.ts` — both first-run tests now expect `/scenario/airport_arrival/story` and the
“stranger” test continues one step; add an e2e for “quit after practice, resume on home”. Done when:
a fresh learner goes story → report → home, no placement question on the path, onboarding spec green,
journey green with the flag off.

### 3. Tab locking
Touch: `AppShell.tsx` `MainTabsRoute` (lock predicate, sheet, guarded `setTab`); new
`components/nav/TabLockSheet.tsx`. Not: `TabButton`, `GlassEffectContainer`, the `nav` markup, any
tab screen body. Effort S (~2 h), risk medium (two specs measure the pill). Tests: `e2e/navbarGeometry.spec.ts` “switching tabs” (seed one `sessions` row, or assert the
sheet and `aria-current` staying on الرحلة); add an e2e for the locked sheet incl. the profile
escape hatch. `e2e/navOverlap.spec.ts` (`page.goto`) stays green. Done when: a day-0 learner gets the
sheet from any non-Trail tab, the pill never moves, exactly one `aria-current`, direct URLs
unaffected.

### 4. Story Setup
Touch: `journey/StorySetupScreen.tsx` only (one disclosure for rationale). Not:
`lib/journey/story.ts`, `brief.ts`, the translation path. Effort S (~1.5 h), risk low. Tests:
`tests/launchSafety.test.ts` (`setTranslationState('unavailable')`), `e2e/journey.spec.ts` story
test and `e2e/accessibility.spec.ts` story test stay green untouched; add an e2e that the rationale
opens and the CTA stays visible. Done when: the first action is reachable without scrolling at
360×640 and 390×844, opener/translation retry/«ليس الآن» all still work.

### 5. Report and celebration
Touch: `report/SessionReportScreen.tsx` (`guided` + `firstSession` props; hide the five blocks in
§B; force the dock's return branch; add the one line) and `ReportRoute` in `AppShell.tsx`.
Not: `lib/debrief/*`, `shouldOfferPro`, the retype drill and `gradeCorrectionRetype`, `sessionXp`,
the `track()` calls. Effort M (~3 h), risk medium (this file carries the honesty rules — hide,
never weaken). Tests: `e2e/journey.spec.ts` debrief test stays green (ملخّص الجلسة, جُمل نطقتها بلا
مساعدة, تصحيحات هذه الجلسة, أبرز ما يحتاج تثبيتاً, and no fake praise); `tests/launchEvents.test.ts`
and `tests/interfaceContracts.test.ts` (`A0`) stay green; add a first-session report e2e (no Pro
card, no follow-up card, one primary) and one asserting placement appears on the **second** report.
Done when: first report has exactly one filled action; every evidence row unchanged.

### 6. Design-token polish
Touch: class strings in `JourneyHomeScreen`, `StorySetupScreen`, `TabLockSheet`, `JourneyMoreSheet`;
only if unavoidable, `index.css` `:root` + `tailwind.config.js` in the same commit. Rules: type via
`kz-ar-title/body/caption/micro` and `kz-de-*`; radius via the `tag/chip/control/panel/sheet/hero`
ladder; motion via `duration-fast|panels` + `ease-out|ease-spring`; one accent (`kz-lavender`;
`kz-magenta` only for earned); no new `shadow-glow-purple`, no arbitrary `text-[…]`, no hex/rgb
(budget today: 40 arbitrary values, must not grow). Not: other screens, `KatzuPresence`,
`BorderBeam`, `ScenarioBanner`. Effort M (~3 h), risk low but the token test is strict. Tests:
`tests/designSystem.test.ts`, `tests/v34ApplePolish.test.ts`, `tests/uiPolishLaunch.test.ts`
(one-beam rule `:120`, earned-card rule `:78`); `design-audit` and `contrast-check` at 0. Done when
home is 1 glass card + 1 well (from 3 + 1) and every colour/size touched is a token.

### 7. Progressive reveal
Touch: `JourneyHomeScreen.tsx` only — review row/mission require `firstSessionDone && dayNumber > 1`;
capability card, weekly recap, expiry card and level chip appear after 3 sessions (or when the
underlying fact is actionable, e.g. a paid month ending). Not: `lib/srs`, `lib/daily`,
`selectMission.ts`, `TrailScreen.tsx`. Effort S (~2 h), risk low. Tests:
`e2e/dailyTasks.spec.ts` seeds `daily_tasks` on a 0-session user — seed one session too (the panel
is a habit surface, not a first-run one); `e2e/shareReferral.spec.ts` countdown tests keep passing
because the countdown stays in the hero; add a unit test for the reveal predicate. Done when: day 0
shows no review/progress/recap; day 2 shows exactly one review entry point; a 3-session learner sees
today's screen minus the crowding.

---

## F. Risk register

| Risk | How we notice | Rollback |
|---|---|---|
| Home loses a control a test or learner relied on | `e2e/banner`, `e2e/firstRun`, `e2e/navOverlap` red | revert step 1 files; flag off restores today's home |
| Tab lock strands a learner (no sign-out) | locked-sheet e2e, owner walkthrough | drop step 3 files; the sheet's profile link covers trust |
| Onboarding jump lands on a missing scenario | new step-2 e2e; `db.scenarios.get(INTRO_SCENARIO_ID)` guard | flag off → `/app/trail`; or revert `OnboardingRoute` only |
| Report hides an honesty row | `e2e/journey` debrief test, `tests/launchEvents` | revert step 5; the flag never gates evidence, only offers |
| Pill geometry drifts | `e2e/navbarGeometry.spec.ts` | step 3 is additive in `setTab` + a sheet |
| A source gate reddens (simplicity, design, doc size) | `npm test` | each gate is in its step's “done when”, not a final sweep |
| CRLF / exact-match edit corrupts a neighbour | `npx tsc --noEmit` right after each edit | re-read the region, re-apply (AGENTS §6) |

---

## G. Success metrics (existing events only)

`cloudflare-analytics.js` validates names against its own `EVENT_NAMES` (lockstep with
`src/lib/analytics/events.ts:19`), so **a new event needs a worker change — out of scope.** Each metric
joins events already emitted, keyed by `installId`.

| Question | Source | Target |
|---|---|---|
| App open → first message | `ts(time_to_first_turn)` − `ts(onboarding_completed)` (proxy: app open ≈ onboarding start; the limit is stated in the report) | **< 60 s** |
| First scenario completed | a `conversation_completed` after the first `onboarding_completed`, same installId | ≥ 55 % of signups |
| Day-2 return | `return_day1` (already emitted) | +5 pts vs. baseline |
| Taps to first action | not an event: measured in e2e at 390×844 from `/app/trail` to `/scenario/:id/story` | **1** |
| No leakage / regression | no rise in `app_error`; `conversation_started` per `signup_completed` not lower | no regression |
| Report read | `debrief_view` after the first session | ≥ 80 % |

Read 30 days of these events **before** step 1, so “+5 pts” has a number behind it.

---

## H. Open questions for the owner

1. **Profile lock vs trust.** Locking الملف also blocks sign-out and the privacy pages. Default: the
   lock sheet's «الإعدادات والحساب» escape hatch. Approve?
2. **Welcome screen.** Its Google button goes to the same place as the CTA. Drop it, or keep welcome
   untouched for now? (Default: untouched in step 2.)
3. **“Day 0”.** “No completed session yet”, not calendar day 1 — that is what makes “review never on
   day 0” enforceable. **Confirmed, and built (1a–1c).**
4. **Pro chip.** **Settled in 1b:** hidden until the first session, then offered in «المزيد», not the
   header.
5. **Celebration.** Existing `kz-pop` + earned treatment only (no dependency, reduced-motion safe),
   or `canvas-confetti` (already a dependency, used only by the redemption screen) behind a
   reduced-motion guard?
6. **Flag default at ship.** ON in the built bundle from step 1 (fast feedback; all e2e encode the
   new shape), or ON in preview / OFF in the shipped bundle until you walk it?
7. **Screenshots.** 390×844 only, or also 360×640 (the narrowest target)?

**Assumptions (stated):** (a) `airport_arrival` exists in local content at A1 — the step-2 guard
proves it, fallback is today's behaviour; (b) “one line” in the hero means one sentence, not one
element; (c) the “XP card / level tabs / scenario list” the owner named live on `/app/library`
(`TrailScreen.tsx`); this plan does not restyle the library.

---

## I. Where the direction conflicts with the code

1. **Tab locking blocks trust surfaces.** الملف holds sign-out and `/trust/*`; blanket-locking it
   breaks “trust/privacy first” (`QUALITY.md`). Mitigation: escape hatch in the lock sheet, no route
   or nav change. Needs your yes (H-1).
2. **`/signin` has no level picker.** A3 removed it (`SignInScreen.tsx:300`); first-run never shows
   placement. The direction's “level/placement” step is already satisfied — no level screen is added.
3. **The preferences step already exists** and is already two questions
   (`OnboardingScreen.tsx:47`). Building a new one would be a rebuild; step 2 only changes its exit.
4. **“Streak chip hidden at 0” has no home to hide in.** It lives on `/app/library`
   (`data-testid="trail-streak-chip"`, `TrailScreen.tsx:359`), shows a neutral goal state at 0, and
   `e2e/shots/journeyLayoutProbe.spec.ts` asserts it exists at ≤44 px. Leave it; home's 0-streak line
   is already a goal sentence.
5. **“Review never on day 0” needs an explicit gate — and the old inline row is dead.** `dueCount > 0`
   does not do it (the demo can create due items immediately), and review is mission priority #1
   (`selectMission.ts:221`), so `dueCount > 0 && mission.kind !== 'review'` can never both hold: the
   home's inline review row cannot render at all. Pre-existing, and **not fixed by this plan** (§J);
   the sheet's row uses `dueCount > 0 && firstSessionDone`.
6. **The report routes a day-0 learner into review** whenever a correction is open
   (`SessionReportScreen.tsx:705`) — step 5 must override it, not hide it.
7. **The doc-size gate (22 KB) is below the requested 25 KB.** This file is written to the gate.
8. **Every e2e user has 0 sessions** (`e2e/harness.ts:464`), so a flag-on default moves every spec
   into the guided shape at once — intentional, hence steps 1–3 list their spec updates.
   `e2e/simplicity.spec.ts` pins welcome's CTA label: a welcome rework must update it deliberately.

## J. Deliberately not touched

`LiveConversationScreen` / `ConversationDock` and the AI turn path (the duplicate chooser button is a
core-loop edit); `PracticeScreen`, `ProgressScreen`, `ProfileSettingsScreen` internals; `TrailScreen`;
`katzuDb.ts`; `lib/srs`, `lib/daily`, `lib/entitlement`, `lib/mission`; analytics vocabulary; worker; pill.

**Backlog, not this plan:** the inline review row is dead (§I.5) — pre-existing; fixing it is a
separate decision.
