# Katzu — Screen audit, part 1: Trail, Practice, Journey, Progress, Profile

Part of the [screen audit index](SCREEN-AUDIT.md). Scope, severity key and status key are there.

## 1. Trail tab — `src/features/trail/TrailScreen.tsx` ✅

**Purpose:** today's mission, rank, level choice, and the situation path.

**What works**
- One primary action for today (`missionCta`), chosen by a deterministic selector.
- Node states (done / current / open) each have a text chip, not colour alone.
- Scenario cards have an accessible name with both Arabic and German titles.
- The onboarding prompt can be dismissed, and the dismissal is persisted.
- The path shows five situations, with an explicit "show the rest" control.
- The current node is the only glowing element on the screen.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P1 | **The mission button can open the paywall for a level the app says is free.** The mission is planned at `episodeLevel` (`servedLevel`), but `handleScenarioClick` checks `selectedLevel`, which is set from the learner's own `cefrLevel`. A free B1 learner is served A1 yet gets the B1 paywall. Needs a test to confirm. | `missionCta`, `handleScenarioClick`, `useEffect` on `cefrLevel` |
| P1 | **The CEFR pills look like a filter but do not filter.** `scenarios` is never narrowed by `selectedLevel`. The level only decides whether a tap opens the paywall. The code comment calls the pills "a filter for browsing", which contradicts behaviour. | `levels.map`, `scenarios.slice` |
| P1 | **Locks are shown on pills only.** Locked scenario cards show no lock. A free learner learns a level is paid only after tapping a card or pill. | scenario cards |
| P2 | **No empty state for the path.** With no scenarios, `<ol data-testid="trail-path">` renders empty with no message. | `ol` |
| P2 | **"No content" recovery reloads the whole page.** `window.location.reload()` gives no feedback and no offline message if it fails. | `missionCta`, `no_content` |
| P3 | The "Katzu's one-line welcome" comment is duplicated above `checkIn`. Code hygiene only; the greeting renders once. | comment |
| P3 | Streak copy "{n} أيام حماس" ("days of enthusiasm") is not a standard streak label. A learner may read it as motivation, not a count. | streak chip |
| P3 | "اكتشف مزايا Pro" in the header appears on every visit for free users and competes with the greeting for space. | header |

---

## 2. Practice tab — `src/features/practice/PracticeScreen.tsx` ✅

**Purpose:** training hub. Review due items, mistake bank, flashcards, grammar summary, listening and writing shortcuts, vocabulary bank.

**What works**
- Leads with one action: review due items, with a count and a status line.
- Mistake retyping uses the same review engine as the debrief.
- Several empty states say what to do next.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P1 | **Flashcard self-rating does nothing.** "أحتاج مراجعتها 🔁" and "أعرفها تماماً ✓" both only flip to the next card. Neither answer is recorded or scheduled (the handlers call only `setIsFlipped` and `setFlashcardIndex`). (Verified, ~L510–529.) | flashcard footer |
| P1 | **Flashcards cycle the whole vocabulary, not due items.** The deck is `vocabulary[flashcardIndex]` with modulo wrap. (Verified.) | `currentFlashcard`, ~L145 |
| P1 | **Flashcards cannot be used from the keyboard.** The flip target is a `div` with `onClick` and no `role`, `tabIndex` or key handler. (Verified, ~L460.) | flashcard face |
| P2 | **Word-list icon buttons have no accessible name.** The bookmark (save word) and speak buttons (~L431–441) have no `aria-label`. The mistake speak button (~L603) also has none. (Verified.) | word rows, mistake rows |
| P2 | **The "أخطاء للتثبيت" stat is `mistakes.length`, the total row count.** It is unclear whether mastered mistakes leave the table. If not, the label overstates what is left to consolidate. Check the mistake write path. | stats row, ~L197–198 |
| P2 | **Flashcard empty-state button only closes the modal.** "تصفّح المفردات" does not open the vocabulary list. | flashcard empty state, ~L538 |
| P2 | **Vocabulary is hidden until "تصفّح الكلمات" is tapped.** A learner who types in the search field sees a count, not results, and the field does not open the list. | `browseWords`, ~L371 |
| P2 | **The vocabulary empty message reads like a fault.** "لم يصل بعد أي محتوى إلى هذا الجهاز…" is accurate for a missing download, but a learner who has not yet finished a scene will read it as broken. | ~L387 |
| P3 | The grammar and mistake modals have empty states. The grammar modal's is less specific. | modals |
| P3 | Tile labels ("الاستماع", "الكتابة") match tab-bar destinations, so they can look like duplicate navigation. | tool grid |

---

## 3. Journey home — `src/features/journey/JourneyHomeScreen.tsx` ✅

**Purpose:** answers "what do I do today?" with one mission card and one action, plus status, daily tasks, chapter progress, Pro expiry and a weekly recap.

**What works**
- One prominent action (`PrimaryAction`); review is hidden as a secondary row when it is already today's mission, so there are never two competing CTAs.
- The mission level is stated when it differs from the learner's level ("هذه المهمة بمستوى A1 — وهو المتاح في الخطة المجانية"), so the paywall is not a surprise.
- Onboarding nudge has a 44 px dismiss button with an `aria-label`.
- Offline state is shown with a status indicator, and the copy only claims cached missions work offline.
- Progress is shown as segments, not a percentage, and capability copy only appears after a recorded independent success.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P1 | **Mission level and paywall can disagree.** The mission is served at `level` (`servedLevel`), but the paywall gate on the Trail reads the learner's own level (see §1). The home screen explains the level; the Trail gate does not. | mission card, ~L330–340 |
| P1 | **"No content" recovery is `window.location.reload()`.** No feedback while reloading and no offline message if the reload cannot load the app. | `no_content` branch |
| P2 | **Chapter progress is announced both as text and as a `progressbar`.** Good, but the `progressbar` has no `aria-label`, so the reader may say only a number. Give it the chapter title. | chapter strip (`ProgressStrip`, L42–45) |
| P2 | **Pro button in header is always visible to free users** and competes with the greeting, as on the Trail. | header |
| P3 | Imports are split by constants declared between `import` statements (`REVIEW_ITEM_FORMS`, `MINUTE_FORMS`). Code hygiene only. | top of file |
| P3 | The `\u2014` escape is written literally inside a JSX comment. Cosmetic in source only. | comment near `level` |
| P3 | The "هدفك في هذا الفصل" card is a placeholder shown when there is no capability yet. It motivates, but a new learner sees a second card of similar weight beneath the mission. | chapter goal card |

### 3b. Story setup, guided practice, study, scenario detail ✅

**Files:** `journey/StorySetupScreen.tsx`, `journey/GuidedPracticeScreen.tsx`, `study/StudyScreen.tsx`, `study/ScenarioDetailScreen.tsx`, `journey/DailyTasksPanel.tsx`

**What works**
- Scenario detail says why the conversation is locked and offers an explicit, visible skip ("تخطّى التدريب وابدأ المحادثة مباشرة"), and the copy says the level of words does not change when skipping.
- Story opener translation: a failed translation falls back to an `unavailable` state, is logged, and does not block the screen.
- Guided practice: a failed review-enrolment write is swallowed on purpose, with a comment explaining the conversation must not be blocked.
- Icon buttons have Arabic `aria-label`s (speak, save word, back).
- Study phrases tab has an empty state that points to the vocabulary tab.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P1 | **The three step cards are clickable `div`s with no role, no `tabIndex`, and no key handler.** "1. دراسة", "2. اختبار", and "3. المحادثة" cannot be reached or activated by keyboard or switch control. | `ScenarioDetailScreen.tsx` ~L190–230 (`onClick` on `div`) |
| P3 | **Locked conversation step is tappable on purpose** (it opens the skip prompt, `handleConversationClick` L94–97), but its only lock signal is `opacity-80` plus a lock icon. Consider `aria-disabled` plus a visible hint. | step 3 card |
| P1 | **The study tab has a fixed bottom CTA with only `mb-8` of list padding.** The floating "انتقل للاختبار" button can cover the last phrase or vocabulary row on a small phone. Check the scroll end. | `StudyScreen.tsx` ~L262–270 |
| P2 | **The speed toggle has no pressed state.** The label changes ("1.0x عادية" / "0.8x هادئة") but the button has no `aria-pressed`, so the state is only visible text. | `StudyScreen.tsx` ~L101–108 |
| P2 | **The phrases/vocab/grammar switch is three plain buttons** with no `role="tablist"`, `role="tab"`, or `aria-selected`. | `StudyScreen.tsx` ~L117–140 |
| P2 | **Vocabulary and phrase counts are in the tab labels only** and do not announce changes. Acceptable; noted for completeness. | tabs |
| P2 | **The translation retry button is 36 px high** (`min-h-[36px]`), below the 44 px target the rest of the app uses. Retry itself exists (L232–239). | `StorySetupScreen.tsx` ~L233 |
| P3 | The `DailyTasksPanel` rows use `aria-disabled` on a button, so a completed task is still focusable and tappable. Confirm the handler is a no-op when done. | `DailyTasksPanel.tsx` L75–76 |
| P3 | Scenario detail uses `Card`/`Button` with `text-text-*` tokens, while the journey screens use `kz-*` glass tokens. Two visual systems on one learner path. | styling |

## 4. Progress tab — `src/features/progress/ProgressScreen.tsx` ⚠️ (share flow and word/grammar lists read, L190–214)

**What works**
- The share card is validated before it leaves the device (no email, no level claim, no transcript text).
- Share falls back to clipboard, and each outcome has an Arabic status line. A dismissed native share sheet is treated as not an error.
- Vocabulary and grammar lists show a preview with a "show all" toggle.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P2 | **The share status is a single text line with no `role="status"` or `aria-live`.** A screen-reader user taps share and hears nothing when the copy succeeds or fails. | `shareStatus` |
| P2 | **Share button is disabled until a card exists** (`disabled={!shareCard}`) with no explanation of what unlocks it. | share button |
| P2 | **Silent `catch` blocks** (~L201, ~L208) swallow errors with no user feedback. Confirm they only cover non-critical reads. | data loads |
| P3 | The fallback message asks the learner to "select and copy manually", which is a poor path on a phone. | `shareStatus` |

## 5. Profile tab — `src/features/settings/ProfileSettingsScreen.tsx` ⚠️ (delete and export controls read; 796 lines, rest not read)

**What works**
- Account deletion requires typing the exact phrase `أريد حذف حسابي`. The button stays disabled until the text matches and while a delete is in progress. This is the right pattern for an irreversible action.
- Export is disabled while exporting, so it cannot be double-triggered.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P2 | **Two empty `catch {}` blocks** (~L130, ~L135) swallow failures in the settings flow with no message to the learner. Verify what they guard. | settings load / save |
| P2 | **Profile and the public deletion page offer different deletion paths.** Profile requires typed confirmation; the request page (§15) does not. The safer one should be the only one. | delete flows |
| P3 | The tab is long (796 lines). A learner scanning for "delete account" passes through many sections first. Verify the ordering. | layout |

