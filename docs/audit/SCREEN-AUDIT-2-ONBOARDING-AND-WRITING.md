# Katzu — Screen audit, part 2: Onboarding, placement, writing and grammar

Part of the [screen audit index](SCREEN-AUDIT.md). Scope, severity key and status key are there.

## 6. Onboarding (all steps) — `src/features/onboarding/OnboardingScreen.tsx` ⚠️ (save/finish logic read, L76–107)

**What works**
- Saving is guarded by `isSaving`, so a double tap cannot write twice.
- A failed local write logs a warning and still moves the learner on. A comment explains that the Trail prompt will ask again later. This is the right trade-off.
- A first-run learner is never recorded as having "skipped" placement. Their level stays unmeasured, which keeps the data honest.
- Each step advances with a light haptic.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P2 | **A failed write is invisible to the learner.** The app moves on, which is good, but the learner is not told that their choices may not be saved. Consider a single non-blocking notice. | `save` catch |
| P2 | **The `finally` always calls `onDone(choice)`,** so a failed save and a successful save look identical to the parent. Acceptable, but the parent cannot tell them apart for analytics (`onboarding_completed` is tracked even on failure). | `save` finally |
| P3 | Step screens (L107–441) were not read in this pass. Re-check the step copy and back-navigation in a follow-up. | step UI |

## 7. Placement — `src/features/placement/PlacementScreen.tsx` ⚠️ ("nothing could be measured" state L255–284 and answer controls read)

**What works**
- Answer and next controls are disabled while saving and until an answer is chosen, so the learner cannot skip past an unanswered item.
- The result card uses `role="status"` and `aria-live="polite"`, so the outcome is announced.
- When nothing can be measured, the screen says so instead of inventing a level.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P2 | **"Next" stays disabled with no hint** of what to do until an option is chosen. A short line of instruction under the options would help. | `disabled={!answered}` |
| P2 | **A silent `catch`** (~L170) in the save path. Confirm the learner is not left on a stuck screen when a write fails. | save |
| P3 | Options are buttons with German text only in some items; check that the Arabic gloss is always present for an Arabic-first learner. | options |

## 8. Writing and Grammar lesson flow — `src/features/writing/WritingScreen.tsx`, `src/features/grammar/GrammarSectionScreen.tsx` ⚠️ (labels, disabled states and alerts checked by search; full read pending)

**What works**
- The writing input has an Arabic `aria-label` and a German placeholder.
- Writing errors use `role="alert"`, so they are announced.
- The writing submit is disabled until there is input (`canSubmit`).
- Grammar answers are gated: "check" stays disabled until every item is answered (`allAnswered`), and locked items are disabled.
- The grammar rule input has an Arabic `aria-label`.
- Corrected writing has a "listen to the corrected version" button with an Arabic label.

**Findings**

| Sev | Finding | Where |
|---|---|---|
| P2 | **The grammar check button's disabled state gives no reason** when some items are unanswered. | `disabled={!allAnswered}` |
| P2 | **Writing placeholder is German ("Schreibe hier auf Deutsch…")** while the rest of the instruction is Arabic. An Arabic-first learner may not know what to write in the box. | writing placeholder |
| P3 | Locked grammar items are disabled without a text reason. | `disabled={locked}` |

## 8b. Story setup, guided practice (see §3b)

