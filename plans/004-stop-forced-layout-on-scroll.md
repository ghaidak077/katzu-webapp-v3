# 004 — Stop forcing layout on every scroll frame

- **Status**: TODO
- **Commit**: ef1fb92
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 1 file, ~35 lines

## Problem

The specular-highlight hook attaches an unthrottled `scroll` listener that calls `getBoundingClientRect()` on every scroll event, per subscribed surface:

```ts
// src/components/glass/GlassSurface.tsx:139-149 — current
    const onScroll = () => {
      const rect = node.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      // 0 at the bottom of the viewport, 1 at the top: the highlight drifts as
      // the surface travels, which is what makes it feel lit rather than drawn.
      const progress = Math.min(1, Math.max(0, 1 - rect.top / viewport));
      setVars(baseX + progress * 0.34, baseY + progress * 0.3);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
```

Two problems, both real:

1. **`getBoundingClientRect()` forces synchronous layout.** Reading geometry mid-frame flushes any pending style/layout work, then this handler writes two CSS custom properties, invalidating style for the element's subtree. The result is a read-write-read layout thrash on every scroll frame, at 60–120Hz.
2. **`{ passive: true }` only means "don't call preventDefault"** — it does not throttle. Scroll events fire as fast as the compositor delivers them.

Scope: the hook has exactly one consumer, `src/features/journey/JourneyHomeScreen.tsx:59`, which is **Journey Home — the screen learners scroll most**, and the app's daily landing. So the most-used screen pays the cost.

## Target

Same visual result, computed without reading layout during the scroll frame.

```ts
// src/components/glass/GlassSurface.tsx — target
    // Scroll position is read once per frame at most, and only when the
    // document has actually moved. Measuring `getBoundingClientRect()` inside
    // a scroll handler forces synchronous layout on every event; the cached
    // rect plus a cached page offset gives the same number for free.
    let lastPageY = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const pageY = window.scrollY;
        if (pageY === lastPageY) return;
        lastPageY = pageY;

        const viewport = window.innerHeight || 1;
        // `rectTopInPage` was captured at subscribe time and does not change:
        // the element moves only because the document moved.
        const rectTop = rectTopInPage - pageY;
        const progress = Math.min(1, Math.max(0, 1 - rectTop / viewport));
        setVars(baseX + progress * 0.34, baseY + progress * 0.3);
      });
    };
```

with, captured once in the effect body before `onScroll()`:

```ts
    const rectTopInPage = node.getBoundingClientRect().top + window.scrollY;
```

**Why this is equivalent:** an element's position in the page (`rect.top + scrollY`) is invariant unless something other than scrolling moves it — layout changes, or a reflow caused by content above it resizing. The existing handler has the same exposure (it would read a stale position during its own rAF anyway), so this introduces no new staleness class. It is honest about the trade rather than pretending the value is permanently stable.

If drift on content resize becomes visible during the feel-check, the correct follow-up is a `ResizeObserver` on `node`'s parent, not a return to measuring every frame. **Do not add the ResizeObserver in this plan** - note it and stop.

## Repo conventions to follow

- This hook already has reduced-motion awareness and a live media-query subscription in the same file (`GlassSurface.tsx:86-101`). Do not disturb either.
- `setVars` writes `--kz-spec-x` / `--kz-spec-y`. Keep writing through `setVars`; never write the custom property directly elsewhere.
- The codebase has no rAF-throttling helper. Keep the throttle inline in this hook rather than introducing an abstraction one caller would use.

## Steps

1. **Edit the effect in `src/components/glass/GlassSurface.tsx`** (around lines 135-150). Replace `onScroll` and the `addEventListener` block with the target above. Keep `onScroll()` called once immediately (the initial paint still needs a value) and keep the `removeEventListener` cleanup.

2. **Capture `rectTopInPage` once**, before the `onScroll()` call, using the single expression given in the Target block.

3. **Keep the `lastPageY === return` early-exit.** Scroll events are also dispatched for horizontal-only scrolls and for layout shifts; skipping those is free correctness.

4. **Do not change the math.** `baseX + progress * 0.34` and `baseY + progress * 0.3` must stay exactly as they are. This plan is about how the number is obtained, not what it is.

5. **Cancel any pending frame in cleanup.** If `ticking` is true when the effect tears down, the queued rAF would call `setVars` on an unmounted node. Add to the existing cleanup:

   ```ts
   return () => {
     window.removeEventListener('scroll', onScroll);
     if (ticking) cancelAnimationFrame(rafId);
   };
   ```

   (Store the rAF id in a variable the effect body can see.)

## Boundaries

- **Do NOT** change the visual output. Same highlight, same drift, same curve.
- **Do NOT** refactor `useSpecularHighlight` into a shared utility or add a new hook file.
- **Do NOT** add a `ResizeObserver` — see the Target note.
- **Do NOT** change `usePointerMove` on the same component; it is a different input path and is not part of this finding.
- **Do NOT** touch `JourneyHomeScreen.tsx`. The fix is entirely inside the hook.
- **Do NOT** change `--kz-spec-strength` or any other token.
- If `useSpecularHighlight` is not a hook returning `{ ref, onPointerMove }`, STOP and report.

## Verification

- **Mechanical**:
  ```bash
  npx tsc --noEmit     # expect exit 0
  npm test             # expect 106 files / 1298 tests pass
  npm run build        # expect exit 0
  ```
- **Feel check**:
  - Open Journey Home and scroll slowly, then flick-scroll hard. The highlight must drift **identically** to before. Any visible difference means the math changed, not just the plumbing.
  - DevTools → Performance, record a 3-second scroll. Before: layout events on nearly every frame. After: layout events only when something genuinely reflows.
  - Scroll with the CPU 6× throttled (Rendering panel). The scroll must stay smooth. This is the check that matters — the old code's thrash showed up here first.
  - Navigate **into** Journey Home from a scrolled-down page, then scroll. The initial highlight position must be correct on first paint, not one scroll behind. This is the case the `onScroll()` initial call exists to serve.
  - Confirm no React "state update on unmounted component" warning appears when navigating away mid-scroll.
- **Done when**:
  - `grep -n "getBoundingClientRect" src/components/glass/GlassSurface.tsx` returns exactly **1** match (the one-time capture), down from 2.
  - The scroll handler body contains no layout read.
  - The highlight behaves identically on a real phone.
