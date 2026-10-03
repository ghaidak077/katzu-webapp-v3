# 003 — Give the sheet and modal a real entrance

- **Status**: TODO
- **Commit**: ef1fb92
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 2 files, ~40 lines

## Problem

Both overlays in Katzu mount instantly at their final position and carry a transition class that can never fire.

```tsx
// src/components/ui/BottomSheet.tsx:31-42 — current
  if (!isOpen) return null;

  return (
    <div className="kz-scrim fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm transition-opacity">
      <div className="fixed inset-0" onClick={onClose} />
      <GlassSurface
        tier="floating"
        className={cn(
          'relative w-full max-w-xl rounded-t-3xl p-6 z-10 max-h-[85vh] overflow-y-auto text-text-primary',
          className
        )}
      >
```

`if (!isOpen) return null` means the element does not exist on the frame before it becomes visible. A CSS transition needs two rendered states to interpolate between. The browser computes the *first* style for the element in its final position and paints it there. **`transition-opacity` on the scrim at `:35` is dead code** — the class is correct in isolation and inert in practice.

Net effect: a bottom sheet should rise from the bottom edge of the screen and a modal should fade in over its scrim. Both teleport.

`src/components/ui/Modal.tsx:31` has the same `if (!isOpen) return null` and no transition at all.

By the audit's frequency table these are *occasional* surfaces (~2 openings per session), which is exactly the band where "standard animation" is correct and delight is not.

## Target

Use `data-mounted`, the legacy fallback for `@starting-style`, set in `useEffect`. This codebase targets browsers where `@starting-style` support is not guaranteed, and `useEffect` is already imported in both files.

**BottomSheet — target:**

```tsx
// src/components/ui/BottomSheet.tsx — target
  const [mounted, setMounted] = React.useState(false);

  // A transition needs two rendered states. `isOpen` alone gives us one, so
  // the sheet mounts in its resting position and settles on the next frame.
  useEffect(() => {
    if (!isOpen) {
      setMounted(false);
      return;
    }
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      data-mounted={mounted || undefined}
      className="kz-scrim fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-fast ease-out data-[mounted]:opacity-100 opacity-0"
    >
      <div className="fixed inset-0" onClick={onClose} />
      <GlassSurface
        tier="floating"
        className={cn(
          'relative w-full max-w-xl rounded-t-3xl p-6 z-10 max-h-[85vh] overflow-y-auto text-text-primary',
          'translate-y-full transition-transform duration-[var(--kz-dur)] ease-spring',
          mounted ? 'translate-y-0' : '',
          className
        )}
      >
```

**Modal — target:** same `mounted` state and effect, but centred, so it fades rather than slides (the audit playbook exempts modals from transform-origin concerns precisely because they appear centred):

```tsx
// src/components/ui/Modal.tsx — target, on the GlassSurface className
          'relative w-full max-w-lg rounded-3xl p-6 z-10 max-h-[90vh] overflow-y-auto text-text-primary',
          'opacity-0 scale-95 transition-[opacity,transform] duration-[var(--kz-dur)] ease-spring',
          mounted ? 'opacity-100 scale-100' : '',
```

`scale-95`, **not** `scale-0` — nothing in the real world appears from nothing.

## Repo conventions to follow

- **Duration/easing come from the token ladder**, not literals. `src/index.css:140-144` defines `--kz-dur-fast: 160ms`, `--kz-dur: 280ms`, `--kz-ease-spring: cubic-bezier(0.22, 1.12, 0.36, 1)`. Plan 001 promotes these to `duration-fast` / `duration-*` / `ease-spring` Tailwind utilities. **Use `ease-spring` and `duration-[var(--kz-dur)]`; if plan 001 has landed, `duration-default` is equivalent.** Either way, never type a raw millisecond value.
- **`ease-out` for entrances.** The playbook's decision order is unambiguous: entering or exiting uses ease-out. `--kz-ease-spring` is the app's designated entrance curve and carries only a slight overshoot, which suits a sheet arriving.
- **Existing reduced-motion handling.** `src/index.css:519-529` already collapses `.kz-surface` transitions to 1ms under `prefers-reduced-motion: reduce`:

  ```css
  @media (prefers-reduced-motion: reduce) {
    .kz-surface, .kz-surface::after, .kz-primary, .kz-specular {
      transition-duration: 1ms !important;
    }
  }
  ```

  Because both overlays render through `GlassSurface` (which applies `.kz-surface`), **reduced motion is already handled for free**. Do not add another media query.
- Both files already import `cn` from `@/lib/cn`, so use it rather than string concatenation.

## Steps

1. **`src/components/ui/BottomSheet.tsx`** — add the `mounted` state and the `requestAnimationFrame` effect after the existing `document.body.style.overflow` effect. Add `data-mounted` to the scrim `<div>`. Add the `translate-y-full transition-transform … ` classes plus the `mounted` conditional to the `GlassSurface` `className` inside the existing `cn(...)` call.

2. **`src/components/ui/Modal.tsx`** — the same `mounted` state and effect, the same `data-mounted` attribute on its scrim `<div>` (which currently carries no transition), and the opacity/scale classes on its `GlassSurface`.

3. **Check `GlassSurface` does not strip `className`.** Confirm it merges the caller's classes (`src/components/glass/GlassSurface.tsx:29`). If it does not, use `SpecularHighlight`-style composition instead. **If `GlassSurface` refuses conditional classes in any way, STOP and report** rather than fighting it.

4. **Do not add exit animations.** A proper close transition needs the element to stay mounted through its exit, which changes the `isOpen` contract for all four call sites. That is a larger, riskier change and is explicitly out of scope. Open-without-close is a known asymmetry; plan this properly later if it proves to matter.

## Boundaries

- **Do NOT** implement exit animations (see step 4).
- **Do NOT** add `@starting-style`; use the `data-mounted` fallback described above.
- **Do NOT** touch the call sites** — `GoalSelectionBottomSheet.tsx:38` and `WordInsightBottomSheet.tsx:30` must be unchanged. The fix belongs in the shared component, which is the whole point.
- **Do NOT** add a new reduced-motion media query; `.kz-surface` already covers it.
- **Do NOT** animate `height`, `top` or `margin`. `transform` and `opacity` only.
- **Do NOT** add a spring that overshoots far enough for the sheet to visibly bounce past its resting position. `--kz-ease-spring` is chosen because its overshoot is small.
- If the `isOpen` prop is not a plain boolean at either call site, STOP and report.

## Verification

- **Mechanical**:
  ```bash
  npx tsc --noEmit     # expect exit 0
  npm test             # expect 106 files / 1298 tests pass
  npm run build        # expect exit 0
  ```
  The e2e suite is the important one here — `PaywallModal`, `GoalSelectionBottomSheet` and the hint sheet are all driven by Playwright:
  ```bash
  E2E_TARGET=preview npx playwright test --reporter=line   # expect 62 passed
  ```
- **Feel check**:
  - Open the goal-selection sheet. It should **rise from the bottom edge**, not fade in place, and the scrim should dim at the same time. The two must feel like one event.
  - Open the Paywall modal. It should fade and grow slightly from 95% — a whisper, not a zoom.
  - In DevTools → Animations panel, set playback to **10%** and step frame by frame. The sheet must originate at the bottom edge of the viewport. If it appears to scale from its centre, the transform is wrong.
  - **Spam the open/close toggle** as fast as you can. Nothing should restart from zero, stick half-open, or leave a residual `translate-y`. Because the effect cancels its own rAF on unmount, a fast re-open must land cleanly.
  - Confirm the scrim does not flash: the sheet must never be visible before the scrim starts dimming.
  - Toggle **prefers-reduced-motion: reduce** (Rendering panel). The sheet must appear instantly with no slide, and remain fully opaque — it should not become transparent or unresponsive.
  - Open a sheet on a real phone. The `backdrop-blur` plus a full-screen translate must not drop frames on a low-end device; `.kz-lite` already drops the blur under the renderer tier.
- **Done when**:
  - `grep -n "transition-opacity" src/components/ui/BottomSheet.tsx` shows the class paired with a `data-mounted` conditional, not used unconditionally.
  - Opening either overlay visibly changes its position or opacity across frames.
  - All 62 e2e tests pass unchanged — if any e2e selector depended on the old markup shape, this plan broke it.
