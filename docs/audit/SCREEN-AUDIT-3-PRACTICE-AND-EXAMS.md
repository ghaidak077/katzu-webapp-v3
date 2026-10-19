# Katzu — Screen audit, part 3: Conversation, listening, exams and review

Part of the [screen audit index](SCREEN-AUDIT.md). Scope, severity key and status key are there.

## 9. Chat / conversation practice

### 9a. Ask Katzu — `src/features/ask/AskKatzuScreen.tsx` ✅

**Purpose:** one German or Arabic question → one validated German explanation, examples, three practice items, and a local check. Wrong answers join the review queue.

**What works**
- Question text survives every failure; error card has a retry (`role="alert"`).
- Out-of-scope questions get a polite refusal card, not an error.
- Labelled textarea, `dir="auto"`, practice inputs have an `aria-label`.
- Verdict uses colour, icon and text ("correct / close / wrong").
- Legal notice is reused verbatim from the scenario disclaimer.
- Back button has `aria-label="العودة"`.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P1 | **The error card always offers "أعد المحاولة".** If the failure is the daily limit, retrying can only fail again, and no upgrade path is offered on the error card (the Pro link appears only after a successful answer). Check what `result.error` returns for quota and route quota errors to the Pro card. | error card, `ask()` |
| P2 | **No loading state in the body.** Only the button text changes to "يسأل…". The answer area stays blank for the whole request, with no status line for screen-reader users. | `isAsking` |
| P2 | **The answer is not announced.** The result appears with no `aria-live` and focus stays on the button. A screen-reader user does not hear that an answer arrived. | answer section |
| P2 | **Keyboard send is hidden.** Enter inserts a newline; Ctrl/Cmd+Enter sends, but no on-screen hint says so. | textarea `onKeyDown` |
| P2 | **Daily allowance is invisible until the first answer.** Before any question the footer says only "الألمانية فقط"; the quota appears only after a successful ask. | footer |
| P3 | The header subtitle lists five intents in one line of micro text, which is dense for a first-time user. | header |
| P3 | Practice items after a wrong answer stay editable, and the wrong attempt is not shown beside the correction. | practice rows |

### 9b. Coach — `src/features/coach/CoachScreen.tsx` ✅

**Purpose:** "ملف أخطائك": recurring mistake categories, trends, examples, and a drill button.

**What works**
- Evidence gate: below the threshold it says it is still learning, and shows no invented pattern.
- Weekly summary says "only what we can measure, no fake numbers".
- Drill buttons are disabled while one drill runs, and the active one shows a loading state.
- Mistake examples show the wrong and corrected German side by side.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P1 | **"تدرّب على هذا الآن" does nothing visible when there is nothing to drill.** `practise()` stays on the screen with no message, so the button looks broken. The code comment says this is deliberate, but the learner gets no feedback. | `practise`, `focused > 0` |
| P2 | **If the mistake table fails to load, the screen shows the "نراجع أخطاءك" spinner forever.** There is no error branch and no back button in the loading state. | `!mistakes` early return |
| P2 | **The "بقية الأنماط" bars show a count, not a label for the bar.** Bars are `aria-hidden`-less decorative divs; the count is the only text. | rest-of-categories card |
| P2 | **Bar track colour `bg-border-subtle` is very low contrast** against black. The rest-of-categories bars may be hard to see. | bar |
| P3 | Tokens are `text-text-*` / `bg-surface-*`, not the `kz-*` tokens used by the journey screens. | styling |
| P3 | The only exit is the body button — no header back control, unlike Ask Katzu. | layout |
## 10. Listening and live practice

### 10a. Listening drill — `src/features/listening/ListeningScreen.tsx` ⚠️ (L150–235 read)

**What works**
- Loading, empty ("no listening content yet", with a way back), and finished states each have their own screen.
- A step trail (listen → write → read answer) and a count-based progress bar.
- Without speech support, a status line says so and the learner is told to type; the sentence stays visible until the learner hides it (changed in this pass).

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P1 | **Fixed in this pass:** without speech support the sentence stays visible until the learner hides it, and they can show it again. Before, it hid after a fixed peek time, which made the drill unwinnable for a learner who could not hold the sentence. | `!audioAvailable` notice, `peekVisible` |
| P2 | **The step trail is decorative for screen readers.** `StepTrail` is driven by `step`, but there is no text announcing the current step. | `StepTrail` |

### 10b. Live conversation — `src/features/conversation/LiveConversationScreen.tsx`, `ConversationDock.tsx`, `ConversationTranscript.tsx`, `ConversationMessage.tsx` ✅

**Purpose:** speak or type German with Katzu. Practice mode gives help (hints, translations, word taps); real mode does not.

**What works**
- Mode choice first: practice is marked recommended, real mode is one tap below, and the learner is never forced to pick.
- Header back button is 44 px with an Arabic `aria-label`. The round progress is a `progressbar` with a clear label ("الجولة 2 من 5").
- Mic errors are announced (`role="alert"`) and can be dismissed. Live captions show the learner's own speech as it is recognised.
- Without speech input, a status line says so and the text field remains; the orb is disabled, not hidden.
- A missing German voice gets a one-line warning instead of silence.
- The field is labelled in Arabic, typed as German (`dir="ltr"`), and sends on Enter.
- The send button and microphone are not both in the accessibility tree at once (carefully documented).
- Failed turns have a retry; translation failures have a retry.
- Words in Katzu's replies are tappable for an insight sheet with save.
- Paywall modal covers level lock and quota exhaustion.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P1 | **Fixed in this pass: there is an explicit end action** ("إنهاء الجلسة وعرض الملخص") in the options sheet. Before, the session could only end by reaching the round target. The header offers only Back and the options sheet. The options sheet had difficulty and translation toggles only (before this pass). Whether Back saves the session or discards it is still not stated on screen; verify it. | header, options sheet |
| P2 | **The translation toggle's `aria-label` differs from its visible text.** Visible: "إظهار الترجمة تلقائياً". Label: "إظهار كل الترجمات" / "إخفاء كل الترجمات". Its on/off state is shown only by a text chip ("مفعّل" / "متوقف"), not `aria-pressed`. | options sheet |
| P2 | **Hint refresh is disabled once the hint quota is spent, with no reason shown.** | `ConversationDock` refresh button, `hintQuotaSpent` |
| P2 | **Difficulty buttons are disabled at A1 and B2 with only a 30% opacity.** There is no text saying why. | options sheet |
| P2 | **The "easier" and "harder" rows use opposite chevron icons from what a learner may expect** (down for easier, up for harder). Label carries the meaning; the icon is noise. | options sheet |
| P3 | The current level chip (`B1` etc.) is in German font with no Arabic label, so an Arabic-first learner may not know what it is. | header level chip |

## 11. Exams, quizzes, report, review

### 11a. Free B1 mock exam — `src/features/mockexam/MockExamScreen.tsx` ⚠️ (L1–120 read)

**What works**
- The mock is claimed once per screen, with a stable session ID used as the server idempotency key, so a re-render cannot start a second mock.
- A failed claim shows the server's reason and does not spin forever.
- The part clock warns and counts, but never stops the learner speaking. This is the right call for a speaking test.
- The result is labelled as a practice estimate, with no pass mark. The notice travels with the result.
- Free learners see the two most useful corrections and a count of the locked ones, not a wall of errors.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P1 | **A failed claim has no retry control.** The screen shows the reason and nothing to tap except the route to buy. A learner with a network blip is stuck until they leave. | `claimError` branch |
| P2 | **The timer and part changes are not announced.** Only the visible number changes. | part clock |
| P2 | **The share link is built from `window.location.origin`,** so a shared link points at whatever origin the learner is on (preview or local). | `buildShareLink` |

### 11b. Quiz — `src/features/quiz/QuizScreen.tsx` ⚠️ (L1–110 read)

**What works**
- Questions are generated from the scenario's real content, not hard-coded.
- The deck is seeded from the scenario, so the same content gives the same questions, and it is frozen after the first build. Options cannot move under the learner while background syncs run. This fixed a real bug, and the comments explain it well.
- Questions are drawn from the learner's level ±1, with a fallback so the deck is never empty.
- A revealed answer scores zero, so reveal cannot be used to inflate the score.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P2 | **A content refresh failure is only logged.** The learner sees stale local content with no sign it may be outdated. Acceptable, but an empty deck would give no message at all. | refresh `catch` |
| P2 | **Score line is announced with `aria-live="polite"` (L302)** but feedback on each answer is not explicitly labelled as correct or wrong for screen readers beyond the icon. Verify the answer state text. | feedback |
| P3 | Quiz and conversation both exist for the same scenario. The path from quiz to conversation (`onProceedToConversation`) is clear, but the learner is not told the quiz is optional. | next step |

### 11c. Session report — `src/features/report/SessionReportScreen.tsx` ⚠️ (search only, 770 lines)

**What works**
- The level promotion button is disabled once the level has been promoted, so it cannot be applied twice.
- The follow-up card text field is disabled when empty.
- Failed follow-up stamping is logged (`console.warn`) and does not block the report.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P2 | **Failed saves surface only as `console.warn`** (~L175, ~L186). The learner is not told that the follow-up card was not stamped. | follow-up card |
| P2 | **A `catch (err)` at ~L240** handles a failure path not read in this pass. Verify its learner-facing message. | save path |
| P2 | The report is long; the main takeaway should be at the top. Verify the order. | layout |

### 11d. Review (spaced repetition) — `src/features/review/ReviewScreen.tsx` ✅ (loading, empty and verdict states read)

**What works**
- Loading state is `role="status"` with `aria-live`.
- The empty state says "no review due right now" and tells the learner when the next item is due, so they know they do not need to act.
- The verdict card (correct / close / wrong) uses icon and text, with `aria-live="polite"`.
- "I don't remember — show me" is an explicit, honest option. It does not count as a correct answer.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P2 | **The empty-state "next review" time is calculated once per render** from `Date.now()`. It may show stale text if the screen stays open past the due time. | `nextDueAt` |
| P3 | Dark tokens are `kz-*` here while Profile and Welcome use `text-text-*`. Two token systems on one path. | styling |

