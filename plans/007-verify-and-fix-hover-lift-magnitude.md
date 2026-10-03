# 007 — Reduce the Practice card hover scale

- **Status**: TODO
- **Commit**: ef1fb92
- **Severity**: LOW
- **Category**: Physicality & origin
- **Estimated scope**: 1-2 files, ~4 lines

## Problem

One element translates on hover by more than the design system's own restraint rule allows:

```tsx
// src/features/practice/PracticeScreen.tsx:383 — current
              className="h-60 rounded-3xl bg-surface-hero border border-primary/40 shadow-glow-purple p-6 flex flex-col items-center justify-center text-center cursor-pointer select-none transition-all transform hover:scale-[1.02]"
```

`scale-[1.02]` on a `h-60` (240px) card is a **4.8px growth in each dimension**. The playbook's restraint guidance for UI press feedback is `scale(0.95–0.98)`; for hover it calls for less, not more. At this magnitude the card reads as a misfire on the frame before the tap lands rather than as an invitation to tap. It also animates layout bounds for the duration of the hover.

**Correction to the original finding:** this plan previously claimed both hover-lift sites needed a `@media (hover: hover)` guard. That was wrong, and the check that caught it is worth keeping.

```bash
npm ls tailwindcss   # tailwindcss@3.4.19
```

**Tailwind 3.4 changed the `hover:` variant to only apply on devices whose primary pointer supports hover** (`@media (hover: hover)`). It is already gated. So the sticky-hover defect this plan was written to fix **does not exist in this app**, and no `@media-hover` variant or Tailwind plugin is needed.

## Target

```tsx
// src/features/practice/PracticeScreen.tsx — target
              className="h-60 rounded-3xl bg-surface-hero border border-primary/40 shadow-glow-purple p-6 flex flex-col items-center justify-center text-center cursor-pointer select-none transition-transform hover:scale-[1.01]"
```

Two changes: `scale-[1.02]` → `scale-[1.01]` (a 1.2px change — perceptible, not distracting), and `transition-all transform` → `transition-transform`.

`LandingScreen.tsx:369` is **already correct** and must not change:

```tsx
// src/features/marketing/LandingScreen.tsx:369 — leave as-is
            className="group rounded-3xl p-5 bg-surface-card border border-border-subtle hover:border-primary/40 hover:-translate-y-0.5 transition-all"
```

`-translate-y-0.5` is 2px — within restraint. Plan 006 converts its `transition-all` to a property-scoped transition; that is a different plan's edit.

## Repo conventions to follow

- Arbitrary Tailwind values are budgeted: `scripts/design-audit.mjs` allows 40, currently 27. This swap is budget-neutral (one arbitrary value out, one in).
- Reduced motion is **not** globally covered for this element. The block at `src/index.css:519-529` only targets `.kz-surface`, and this card is not a `kz-surface`. Add `motion-reduce:transform-none` so a reduced-motion learner gets no movement but keeps the colour response.

## Steps

1. **Edit `src/features/practice/PracticeScreen.tsx:383`.** Change `hover:scale-[1.02]` to `hover:scale-[1.01]`, replace `transition-all transform` with `transition-transform`, and append `motion-reduce:transform-none`.

2. **Verify the Tailwind gate empirically, not from documentation.** In the browser, open DevTools → Rendering → *emulate a touch device*, tap the card, and confirm it does not stay lifted. If it *does* stick, this plan's premise is wrong after all and you need to investigate the actual compiled CSS before changing anything.

3. **Do not touch `LandingScreen.tsx:369`.** See Boundaries.

## Boundaries

- **Do NOT** add a `@media-hover` variant or a Tailwind plugin. Tailwind 3.4.19 already handles it; adding one would be solving a problem that does not exist.
- **Do NOT** add hover motion anywhere.
- **Do NOT** change the LandingScreen lift** (`-translate-y-0.5` is correct at 2px).
- **Do NOT** change any colour, height, or layout value on the Practice card.
- **Do NOT** fix a possible unrelated problem: this card has `cursor-pointer` and may be a `<div>` with a click handler rather than a real `<button>`. That is a genuine accessibility finding but it is **not this plan**. Report it separately; do not fix it here.
- If `npm ls tailwindcss` reports a version below 3.4, STOP and report — the pointer gating assumption no longer holds.

## Verification

- **Mechanical**:
  ```bash
  npx tsc --noEmit      # expect exit 0
  npm run design:audit  # expect exit 0, arbitrary-value still <= 27/40
  npm test              # expect 106 files / 1298 tests pass
  npm run build         # expect exit 0
  E2E_TARGET=preview npx playwright test --reporter=line   # expect 62 passed
  ```
- **Feel check**:
  - Desktop with a mouse, hover the Practice card. It must still register as interactive. If `scale-[1.01]` feels inert, `scale-[1.015]` is the compromise; do not go back above 1.015.
  - Emulate a touch device and tap it. It must not stick in a lifted state. (Expected to pass — this is a verification of the version claim, not a fix.)
  - **prefers-reduced-motion: reduce** (Rendering panel). Hovering must produce no movement at all. Colour response must still be present.
  - Confirm the card's shadow (`shadow-glow-purple`) does not now animate in a way that looks detached from the reduced scale.
- **Done when**:
  - `grep -n "hover:scale" src/features/practice/PracticeScreen.tsx` shows `hover:scale-[1.01]` and nothing larger anywhere in `src/`.
  - `npm run design` exits 0 with the arbitrary-value count unchanged.
  - The full e2e suite passes.
