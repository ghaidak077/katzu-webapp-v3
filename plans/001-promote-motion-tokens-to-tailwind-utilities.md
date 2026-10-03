# 001 - Promote the motion tokens to real Tailwind utilities

- **Status**: TODO
- **Commit**: ef1fb92
- **Severity**: HIGH
- **Category**: Cohesion & tokens
- **Estimated scope**: 3 files (1 config, 1 CSS, 1 test) + ~12 call sites

## Problem

`src/index.css:140-144` declares a complete, deliberate motion ladder:

```css
/* src/index.css:140 — current */
  --kz-ease-spring: cubic-bezier(0.22, 1.12, 0.36, 1);
  --kz-ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --kz-dur-fast: 160ms;
  --kz-dur: 280ms;
  --kz-dur-slow: 560ms;
```

**Every one of those five variables has zero references outside the file that declares it.** Verified:

```bash
grep -rn "var(--kz-ease-spring" src/ --include=*.tsx --include=*.ts | grep -v index.css | wc -l   # 0
grep -rn "var(--kz-dur"       src/ --include=*.tsx --include=*.ts | grep -v index.css | wc -l   # 0
```

Meanwhile **38 files** carry a `transition-*` class and rely on Tailwind's undeclared default of `150ms` with the built-in `cubic-bezier(0.4, 0, 0.2, 1)`. Only five call sites in the whole app specify a duration at all:

```bash
grep -rhoE "duration-[0-9]+" src/ --include=*.tsx | sort | uniq -c | sort -rn
#      2 duration-500
#      2 duration-300
#      1 duration-150
```

So the app has one timing language **by accident, not by decision**. Nobody chose 150ms; it is what Tailwind does when you say `transition-colors` and stop. A designer reasoning about "should this be fast or slow?" has no vocabulary to reach for, which is exactly how a design system rots into folklore.

Note the second-order problem: `--kz-dur-slow: 560ms` is longer than the 300ms UI budget from the audit playbook, and `duration-500` is already in use in `src/components/v2/ProgressStrip.tsx:58` and `:91`. Promoting the ladder without auditing what sits on it would launder a bad value into an official token.

## Target

The motion ladder becomes real Tailwind utilities with these exact names and values, then the highest-traffic call sites move onto them.

```js
// tailwind.config.js — target, added inside theme.extend
transitionDuration: {
  fast: 'var(--kz-dur-fast)',   // 160ms
  DEFAULT: 'var(--kz-dur)',     // 280ms
  slow: 'var(--kz-dur-slow)',   // 560ms
},
transitionTimingFunction: {
  spring: 'var(--kz-ease-spring)',  // cubic-bezier(0.22, 1.12, 0.36, 1)
  out: 'var(--kz-ease-out)',        // cubic-bezier(0.2, 0.8, 0.2, 1)
},
```

Resulting utilities: `duration-fast`, `duration-slow`, `ease-spring`, `ease-out`. A bare `transition-colors` now resolves to **280ms**, not 150ms.

**Change `--kz-dur-slow` to 300ms** and rename it `--kz-dur-panels`, so nothing in the ladder exceeds the UI budget:

```css
/* src/index.css — target */
  --kz-ease-spring: cubic-bezier(0.22, 1.12, 0.36, 1);
  --kz-ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --kz-dur-fast: 160ms;
  --kz-dur: 280ms;
  --kz-dur-panels: 300ms;
```

The exact curve and duration values are unchanged from what the owner approved on 2026-10-03 ("keep the existing tokens as-is"); only the over-budget `560ms` is retired.

## Repo conventions to follow

- Tokens live in `src/index.css` under the documented `THE SINGLE PALETTE` `:root` block (`src/index.css:56-158`). Motion tokens are the block at `:140-144`. Add nothing new to the block; only edit existing lines.
- `tailwind.config.js` is a **reader** of those variables, never a second copy. It already has a `token()` helper for colours (`tailwind.config.js:25`); the duration/easing entries above follow the same `var(--kz-…)` reference form documented in the file's header contract (`tailwind.config.js:3-20`).
- The theme already has named scales for colour, font size, radius and spacing. Motion is the missing scale; adding it there is consistent, not novel.
- Every Tailwind token must be declared — `tests/designSystem.test.ts` asserts "every Tailwind-referenced token is declared in `src/index.css`". This plan must keep that test green.

## Steps

1. **Edit `src/index.css:144`.** Replace the single line `--kz-dur-slow: 560ms;` with `--kz-dur-panels: 300ms;`. Leave lines 140 (`--kz-ease-spring`), 141 (`--kz-ease-out`), 142 (`--kz-dur-fast`) and 143 (`--kz-dur`) exactly as they are. Update the comment on line 139 to say the ladder is now consumed by Tailwind utilities.

2. **Edit `tailwind.config.js`.** Inside `theme.extend`, add `transitionDuration` and `transitionTimingFunction` as given in the Target block above. Place them after `spacing` / `minHeight` / `minWidth` and before `boxShadow`, so the scales read in the same order as the file's section comments.

3. **Re-point the hardcoded durations.** These five sites currently bypass the ladder:

   - `src/components/quiz/QuizScreen.tsx:171` — `"h-full bg-primary transition-all duration-300"` → drop `duration-300` (it now equals the default).
   - `src/components/listening/ListeningScreen.tsx:210` — no duration; leaves the default. No change needed.
   - `src/components/v2/ProgressStrip.tsx:58` — `"h-[3px] flex-1 rounded-full transition-all duration-500"` → `duration-panels`. Also change `transition-all` to `transition-colors` (it animates `background`, nothing else).
   - `src/components/v2/ProgressStrip.tsx:91` — same change as :58.
   - `src/components/common/AudioWaveform.tsx:21` — `"w-1 bg-primary rounded-full transition-all duration-300"` → `transition-all duration-fast` (the bar is a live audio meter; it should read as instant, not as a 280ms lag).
   - `src/features/practice/PracticeScreen.tsx:383` — has `hover:scale-[1.02]`; add `duration-fast ease-out` so the hover lift is snappy rather than inheriting the new 280ms default.

4. **Adopt the easings where they earn it.** Two high-value entrances, both currently bare:
   - `src/components/common/GoogleMark.tsx:70` — the Google button's `transition-colors` → `transition-colors duration-fast ease-out`.
   - `src/components/ui/Button.tsx:135` — `disabled:opacity-45` shares the base `transition-colors`; add `duration-fast ease-out` to the base so every press and disabled-fade in the app uses the same curve. This is the single most-felt timing in the product (every button, dozens of times a session) and is currently on Tailwind's built-in curve.

5. **Extend `tests/designSystem.test.ts`.** Add assertions that:
   - `tailwind.config.js` references `--kz-dur-fast`, `--kz-dur`, `--kz-dur-panels`, `--kz-ease-spring`, `--kz-ease-out`;
   - none of those five variables is defined twice;
   - no value in the `:root` motion block exceeds `300ms`;
   - `--kz-dur-slow` no longer exists anywhere in the repo (it is retired, not merely unused).

6. **Run the audit.** `npm run design:audit` must still exit 0, and the `arbitrary-value` count must not increase (this plan adds none).

## Boundaries

- **Do NOT** migrate all 38 files carrying `transition-*` in this plan. That is a mechanical sweep; do it separately once the ladder exists and is proven. This plan covers the ladder plus the five hardcoded durations and two high-traffic entrances.
- **Do NOT** change the curve values of `--kz-ease-spring` or `--kz-ease-out`. The owner explicitly chose to keep them.
- **Do NOT** change any `duration-NNN` where `NNN` already matches a ladder step (300 → default, 160 → `duration-fast`).
- **Do NOT** add a motion library (Motion, GSAP, react-spring). The repo has none by decision.
- **Do NOT** add a `transition-property` override. Leave Tailwind's per-utility property sets alone; plan 007 handles `transition-all` collapse.
- If `tailwind.config.js` does not contain the `token()` helper or the scales named in "Repo conventions", STOP and report — the config has drifted since `ef1fb92`.

## Verification

- **Mechanical** (all must pass, in order):
  ```bash
  npx tsc --noEmit                                  # expect exit 0
  npm run design:audit                              # expect "Within budget", arbitrary-value still 27/40
  node scripts/contrast-check.mjs                   # expect "All contrast pairs pass" (motion must not touch colour tokens)
  npx vitest run tests/designSystem.test.ts          # expect all tests pass, including the 5 new ones
  npm test                                          # expect 106 files / 1298 tests pass
  npm run build                                     # expect exit 0
  ```
- **Feel check**: open any screen and press a button.
  - Every button press and disabled fade should now settle over ~160ms instead of ~150ms. The difference is small but it should feel *consistent*, and critically it should feel identical between `Button`, `GoogleSignInButton` and any hand-rolled button.
  - The `AudioWaveform` bars while audio plays should feel immediate. If they now look sluggish, the default is winning over the `duration-fast` you set.
  - `ProgressStrip` segments (Story Setup / Journey progress) should reach their new state in ~300ms. **They previously took 500ms.** Confirm 300ms does not feel truncated on a real device — this is the one place the change is a visible shortening rather than a harmonisation.
  - In DevTools → Rendering, set **Emulate CSS prefers-reduced-motion: reduce**. The `index.css:519` block sets transition durations to 1ms; confirm button presses still show their state change instantly rather than becoming unresponsive.
- **Done when**:
  - `grep -rn "var(--kz-ease-spring" src/ --include=*.tsx --include=*.ts | grep -v index.css | wc -l` returns a number **greater than 0**.
  - `grep -rn "duration-[0-9]" src/ --include=*.tsx` returns **no matches** (all hardcoded durations are gone).
  - `grep -rn "kz-dur-slow" src/` returns **no matches**.
  - `npm run design` exits 0.

## Notes

The 280ms default is a deliberate change in feel across the whole app, not a pure refactor. It is the right change — 150ms was never chosen — but it is the kind of thing worth seeing on a real device before it ships. Plan 002 depends on this one existing only if you later want to gate confetti with `duration-*`; it does not strictly block.
