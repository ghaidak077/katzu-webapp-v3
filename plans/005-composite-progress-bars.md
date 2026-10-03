# 005 — Composite the progress bars instead of animating width

- **Status**: TODO
- **Commit**: ef1fb92
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 6 files, ~30 lines

## Problem

Six progress bars drive their fill with an inline `width` percentage. `width` is a layout property: animating it forces layout, paint and composite on every frame instead of running on the compositor.

```tsx
// src/features/quiz/QuizScreen.tsx:169-173 — current
      <div className="w-full h-1.5 bg-surface-card rounded-full overflow-hidden mb-8">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>
```

Full inventory of width-driven fills:

| File | Line | Updates on |
| --- | --- | --- |
| `src/features/quiz/QuizScreen.tsx` | 171 | every question advance |
| `src/features/listening/ListeningScreen.tsx` | 210 | every dictation item |
| `src/features/placement/PlacementScreen.tsx` | 342 | every placement question |
| `src/features/grammar/GrammarSectionScreen.tsx` | 461 | lesson completion |
| `src/features/trail/TrailScreen.tsx` | 238 | XP rank, recalculated often |
| `src/features/writing/WritingScreen.tsx` | 215 | rubric score, animated reveal |

**The fix already exists in this codebase and was not applied.** The turn-progress bar in the live conversation screen is the same visual element and already does it correctly:

```tsx
// src/features/conversation/LiveConversationScreen.tsx:236-239 — the exemplar
        {/* The round progress, as the header's own bottom edge. Instant width
            change (V19 motion rule): a transition here is decoration. */}
        <div className="absolute bottom-0 start-0 h-[2px] rounded-full bg-primary" style={{ width: `${turnProgress * 100}%` }} />
```

Note that exemplar still uses `width` — it is correct only because it applies **no transition at all**, so the change is instant and no layout animation occurs. This plan goes one step further for the bars that *do* animate, so the transition can stay and still be free.

## Target

Convert the fill to `transform: scaleX()` with `transform-origin` at the inline start. The parent keeps its existing `overflow-hidden`, which clips the scaled fill exactly as it clipped the sized fill.

```tsx
// src/features/quiz/QuizScreen.tsx — target
      <div className="w-full h-1.5 bg-surface-card rounded-full overflow-hidden mb-8">
        <div
          className="h-full w-full origin-left rtl:origin-right bg-primary transition-transform duration-[var(--kz-dur)] ease-out"
          style={{ transform: `scaleX(${((currentIndex + 1) / questions.length)})` }}
        />
      </div>
```

Katzu is **RTL**. A progress bar in an RTL layout fills from the right, so the origin must be `right`. `origin-left rtl:origin-right` handles both; if the app is RTL-only (it sets `dir="rtl"` in `index.html`), drop `origin-left` and keep `origin-right` alone.

Six sites, same shape:

- **QuizScreen.tsx:171** — `scaleX((currentIndex + 1) / questions.length)`
- **ListeningScreen.tsx:210** — `scaleX(progressPercent / 100)`
- **PlacementScreen.tsx:342** — `scaleX(progressPercent / 100)`
- **GrammarSectionScreen.tsx:461** — `scaleX(path.totalCount ? path.completedCount / path.totalCount : 0)`
- **TrailScreen.tsx:238** — `scaleX(xpRank.progressPercent / 100)`
- **WritingScreen.tsx:215** — `scaleX(Math.round(((score || 0) / feedback.maxScore) * 100) / 100)`

Also convert the three that animate **`height`** for the same reason: `src/features/coach/CoachScreen.tsx:196` and `:309`, and `src/components/common/AudioWaveform.tsx:27` (which animates height on a timer — the worst case in the app). `AudioWaveform` becomes `scaleY` about its vertical centre; keep its `animate-pulse` and `animationDelay` untouched.

## Repo conventions to follow

- **Durations come from the token ladder** (`src/index.css:140-144`): `var(--kz-dur)` = 280ms. If plan 001 has landed, `duration-default` is equivalent. Never type a raw millisecond value.
- **Bars are constant-motion while filling** — the playbook's decision order gives `linear` for progress. Use `ease-out` only where the bar is settling after a discrete event (a completed rubric, a finished lesson). For the live/hot ones (Quiz, Listening, Placement, Trail) prefer `ease-linear` or no easing at all.
- `AudioWaveform` already has reduced-motion handling? **No — verify this.** If it does not, this plan must not make it worse; see Boundaries.

## Steps

1. **Convert the six width-driven bars** per the table above. Each needs three changes: `w-full` added to the fill, `origin-right` (RTL), and `transform: scaleX(...)` replacing the width. Keep each site's existing colour and rounding classes untouched.

2. **Convert `AudioWaveform.tsx:27`** from an animated `height` percentage to `transform: scaleY(...)` with `origin-bottom` so the bar grows upward from its baseline like a real level meter. The `Math.max(25, (i + 1) * 20 % 100)` expression stays as the scale input.

3. **Convert the two CoachScreen bars** (`:196`, `:309`) to `scaleX`. These are stat bars that appear with a value, not live meters.

4. **Confirm the RTL origin is right.** Open each screen in the app and check the bar fills from the right edge. Getting this backwards is the single most likely mistake in this plan and it is immediately visible.

5. **Leave `LiveConversationScreen.tsx:236` alone.** It is already correct by the documented V19 rule. Changing it would be churn.

## Boundaries

- **Do NOT** change the values being displayed. Every percentage must be mathematically identical to before.
- **Do NOT** touch `LiveConversationScreen.tsx:236` — see step 5.
- **Do NOT** add a transition to `LiveConversationScreen` or anywhere the V19 rule says motion is decoration.
- **Do NOT** change bar colours, heights, or the track styling.
- **Do NOT** use `transform: scaleX(0)` as a starting keyframe; scaleX(0) here represents "0% progress" which is legitimate data, not an entrance animation.
- **Do NOT** migrate `src/components/v2/ProgressStrip.tsx` beyond the duration fix already assigned to plan 001. It animates `background` colour, not layout.
- If any of the six files no longer uses an inline `width` at the stated line, STOP and report — content has drifted.

## Verification

- **Mechanical**:
  ```bash
  npx tsc --noEmit     # expect exit 0
  npm test             # expect 106 files / 1298 tests pass
  npm run build        # expect exit 0
  E2E_TARGET=preview npx playwright test --reporter=line   # expect 62 passed
  ```
  The e2e suite matters most here: `quizStability.spec.ts` and `skillSurfaces.spec.ts` drive these bars.
- **Feel check**:
  - Take a quiz. The progress bar must advance **from the right**, and the number shown must be unchanged from before. If it fills leftward, the `transform-origin` is wrong.
  - Complete a dictation item in Listening and a placement question; same check.
  - Complete a rubric in Writing. The score bar must animate identically — this one has a visible reveal, so any timing change is obvious.
  - DevTools → Performance, record while advancing the quiz bar. Layout events should drop to zero during the fill; before, they fired every frame.
  - **Edge case:** navigate to a screen with a partially-filled bar at 33%. The fill must be exactly one third as wide as the track. `scaleX(0.33)` is not `33%` of a rounded track in sub-pixel terms, so check a non-round value for visible jitter.
  - Toggle **prefers-reduced-motion: reduce**. `index.css:519` sets `.kz-surface` transitions to 1ms; bars should snap rather than animate, and must remain fully opaque.
  - Check `AudioWaveform` during live recording: bars must still grow and fall plausibly, and must not visually invert.
- **Done when**:
  - `grep -rn 'style={{ width:' src/ | grep -i "progress\|percent\|count\|score"` returns no matches for the six bars in scope.
  - `grep -n "transition-transform" src/features/quiz/QuizScreen.tsx` returns a match.
  - Every bar fills right-to-left and shows the same number as before.
