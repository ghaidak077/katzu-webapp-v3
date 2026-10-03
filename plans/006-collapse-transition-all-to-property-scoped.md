# 006 — Collapse `transition-all` to property-scoped transitions

- **Status**: TODO
- **Commit**: ef1fb92
- **Severity**: LOW
- **Category**: Performance
- **Estimated scope**: ~60 files, mechanical

## Problem

`transition-all` appears **72 times** across the app. It subscribes the element to transitions on *every* animatable property, including the layout ones the design system has explicitly decided not to animate.

The codebase already knows this. The primary button carries the lesson in a comment:

```tsx
// src/components/ui/Button.tsx:127-129 — current, and correct
        // V20: `transition-colors`, not `transition-all` — colour feedback is what
        // a button needs, and `all` also tracks layout properties on a throttled
        // phone. The old `active:scale` is gone with the V19 motion budget.
        className={cn(
```

`Button.tsx` was fixed in V20. The fix was never propagated to the other 71 sites. `src/components/v2/ProgressStrip.tsx:58` is the clearest remaining case, since it is a component the design system still owns:

```tsx
// src/components/v2/ProgressStrip.tsx:58 — current
              className="h-[3px] flex-1 rounded-full transition-all duration-500"
```

That element animates `background`. `transition-all` also puts it on the hook for `width`, `height`, `padding` and `margin` should any of those ever change.

**Why this is LOW and must be done last:** in every current instance the extra subscriptions cost nothing measurable, because nothing else on those elements actually changes. This is latent debt, not an active bug. It becomes an active bug the moment someone adds a layout property to one of these elements and inherits an animation they did not ask for. The fix is safe and large; the urgency is not.

## Target

Every `transition-all` becomes the property-scoped transition matching what that element actually animates.

| What the element animates | Replace `transition-all` with |
| --- | --- |
| colour only (bg, text, border) | `transition-colors` |
| transform only (hover lift, scale) | `transition-transform` |
| opacity only | `transition-opacity` |
| colour + transform | `transition-[color,background-color,border-color,transform]` |
| background only | `transition-colors` |

Where an element genuinely animates several property families, enumerate them explicitly. That explicitness is the point: `transition-all` hides the question, the enumeration answers it.

## Repo conventions to follow

- `transition-colors` is already the house style for controls; `Button.tsx:127` is the exemplar to imitate.
- Where the element is a `Button`, `Card` or any other unified primitive, **it should not carry a `transition-*` class at all** — the primitive owns its own timing. Removing a redundant class from a component that already uses `Button` is a correct outcome of this plan.
- Do not introduce arbitrary-property syntax (`transition-[...]`) casually: `scripts/design-audit.mjs` counts arbitrary Tailwind values against a budget of 40, currently at 27. Every new `transition-[...]` spends from that budget. Prefer the named utilities; use enumeration only where no named utility covers the set.

## Steps

1. **Enumerate first.** Produce the full list with context before editing:
   ```bash
   grep -rn "transition-all" src/ --include=*.tsx | grep -v "^src/components/ui/Button.tsx"
   ```
   71 expected results (72 minus the Button.tsx comment).

2. **Classify each site** using the table in Target. For each, look at what the element's class list actually changes across states — hover, active, selected, disabled, loading. Do not guess from the class name.

3. **Apply the replacement** file by file. Preserve every other class in the string; change only the `transition-*` token and any paired duration/easing.

4. **Prioritise the design-system components first**, since they are the ones other screens inherit:
   - `src/components/v2/ProgressStrip.tsx:58` and `:91` — animate `background` → `transition-colors`.
   - `src/components/common/AudioWaveform.tsx:21` — animate `height` → handled by plan 005; do not double-edit. After plan 005 it should read `transition-transform`.
   - `src/components/common/HintOption.tsx:22` — border and background on hover → `transition-colors`.
   - `src/components/sheets/*.tsx` — all four sites are border/colour state changes → `transition-colors`.

5. **Do the two transform-carrying sites by hand** (plan 006 is the authority for these, not plan 007):
   - `src/features/practice/PracticeScreen.tsx:383` — `hover:scale-[1.02]`, so `transition-transform`.
   - `src/features/marketing/LandingScreen.tsx:369` — `hover:-translate-y-0.5` plus border colour, so `transition-[color,background-color,border-color,transform]`.

6. **Verify the count drops to zero** outside comments.

## Boundaries

- **Do NOT** change any duration, easing or transform value. This plan changes *which properties are transitioned*, nothing about how they look.
- **Do NOT** touch `src/components/ui/Button.tsx` — already correct.
- **Do NOT** edit `src/components/common/AudioWaveform.tsx:21` if plan 005 has run; if plan 005 has not run, leave line 21 alone entirely and let plan 005 own it.
- **Do NOT** increase the arbitrary-value audit count beyond its current 27/40. If a site genuinely needs enumeration and pushes the count to 40, choose `transition-colors` and accept the small behavioural difference instead — note it and move on.
- **Do NOT** refactor class strings, reorder classes, or run a formatter.
- **If a site's purpose is genuinely unclear from the code, LEAVE IT AS `transition-all` and list it in your report.** A wrong guess here changes real behaviour; an unresolved item costs nothing.

## Verification

- **Mechanical**:
  ```bash
  grep -rn "transition-all" src/ --include=*.tsx | grep -v "Button.tsx" | wc -l   # expect 0
  npx tsc --noEmit                                          # expect exit 0
  npm run design:audit                                      # expect exit 0, arbitrary-value <= 27/40
  npm test                                                  # expect 106 files / 1298 tests pass
  npm run build                                             # expect exit 0
  E2E_TARGET=preview npx playwright test --reporter=line   # expect 62 passed
  ```
- **Feel check**:
  - Spot-check one screen per category: a quiz option, a goal sheet, a profile row, the practice card, the landing card.
  - Hover each and confirm **colour still transitions at the same speed** as before. This is the risk: `transition-colors` does not cover `background-image`, so a site using a gradient background would lose its fade. If you find one, that site needs `transition-[background-image]` or must stay `transition-all`.
  - Confirm no element visibly snaps where it previously faded. Any snap means a property was wrongly dropped — revert that one site and report it.
  - On a real touch device, tap-test the same screens; `transition-colors` is unaffected by the hover-to-tap difference, but transform sites should be checked via the `hover:hover` guard in plan 007.
- **Done when**:
  - `grep -rc "transition-all" src/ --include=*.tsx` returns 0 for every file except `Button.tsx` (comment only).
  - `npm run design` exits 0 and the arbitrary-value count did not increase.
  - The full e2e suite passes.
