# 002 — Gate the confetti celebration behind reduced motion

- **Status**: TODO
- **Commit**: ef1fb92
- **Severity**: HIGH
- **Category**: Accessibility
- **Estimated scope**: 1 file, ~10 lines

## Problem

Katzu fires 100 confetti particles the moment a learner redeems a Pro code. It does not check `prefers-reduced-motion`:

```tsx
// src/features/auth/SubscriptionRedemptionScreen.tsx:71-79 — current
        // Trigger celebratory confetti
        try {
          confetti({
            particleCount: 100,
            spread: 80,
            origin: { y: 0.6 },
          });
        } catch (_) {}
```

This is the **only** animated subsystem in the app that ignores the preference. Every other one handles it:

| Subsystem | Gate | Location |
| --- | --- | --- |
| WebGL orb | `useReducedMotion()` | `src/components/voice/KatzuOrb.tsx:113` |
| Border beam | `useReducedMotion()` | `src/components/effects/BorderBeam.tsx:62` |
| SiriWave | `matchMedia` | `src/components/effects/SiriWave.tsx:317` |
| Syncing dot | `.kz-animated` CSS class | `src/components/v2/StatusIndicator.tsx:37` |
| Glass specular | `useReducedMotion()` | `src/components/glass/GlassSurface.tsx:89` |
| **Confetti** | **none** | `src/features/auth/SubscriptionRedemptionScreen.tsx:73` |

Screen-reader users and people with vestibular disorders who have asked their OS for less motion get 100 particles thrown at them at the exact moment they are reading a confirmation message. It is also the app's single most expensive animation: `canvas-confetti` creates a full-screen canvas and runs its own rAF loop, on the screen that just completed a payment-adjacent flow.

The existing `try/catch` shows the intent was defensive about failure, not about motion. Fixing the gap is a small change with a large correctness payoff.

## Target

```tsx
// target
        // Celebration, unless the learner has asked their OS for less motion.
        // Everything else in the app gates on this; confetti was the exception.
        if (!reducedMotion) {
          try {
            confetti({
              particleCount: 100,
              spread: 80,
              origin: { y: 0.6 },
            });
          } catch {
            // A celebration is never worth an unhandled error.
          }
        }
```

`reducedMotion` comes from the app's existing hook. No new dependency, no new file.

**The success message must still appear.** Reduced motion means fewer and gentler animations, not a worse product: the learner who turned motion off still gets `تم تفعيل اشتراك Katzu Pro بنجاح لمدة … أشهر! مبروك 🎉` at `src/features/auth/SubscriptionRedemptionScreen.tsx:86`. Never gate the *content*, only the decoration.

## Repo conventions to follow

- **Use the app's own hook, never a raw `matchMedia`.** `useReducedMotion` is exported from `src/components/glass/GlassSurface.tsx:86` and already lives outside the `GlassSurface` component in that file. All three consumers (`KatzuOrb`, `BorderBeam`, `GlassEffectContainer`) import it from there:

  ```tsx
  import { useReducedMotion } from '@/components/glass/GlassSurface';
  ```

- It reads and subscribes to the media query live (`GlassSurface.tsx:89-101`), so it reacts if the learner changes the setting mid-session. Do not re-implement it locally.
- The file already imports React hooks at the top; add to that block, not inline.

## Steps

1. **Add the import.** In `src/features/auth/SubscriptionRedemptionScreen.tsx`, next to the other component imports, add:

   ```tsx
   import { useReducedMotion } from '@/components/glass/GlassSurface';
   ```

2. **Call the hook at the top of the component.** Inside `SubscriptionRedemptionScreen`, alongside the existing `useState` calls, add `const reducedMotion = useReducedMotion();`.

3. **Wrap the confetti call.** Replace the existing `try { confetti({...}) } catch (_) {}` block with the `if (!reducedMotion) { ... }` form shown in the Target block. Keep the same `particleCount: 100`, `spread: 80`, `origin: { y: 0.6 }` values — the celebration itself is right; only its availability changes.

4. **Do not touch the success message.** Leave `setSuccessMessage(...)` at `:86` and the `db.users.update(...)` at `:90` exactly as they are, inside and outside the `if` alike. The subscription is granted whether or not the particles fly.

## Boundaries

- **Do NOT** change the particle count, spread or origin.
- **Do NOT** remove the `try/catch`. Confetti is decoration; it must never be able to break a redemption.
- **Do NOT** add a `prefers-reduced-motion` CSS override for this. Confetti is canvas-driven; a CSS media query cannot reach it. The JS gate is the only correct mechanism.
- **Do NOT** add confetti anywhere else. It has exactly one call site today and this plan keeps it at one.
- **Do NOT** gate `setSuccessMessage`, the database write, or any navigation behind the flag.
- If `src/components/glass/GlassSurface.tsx` does not export `useReducedMotion`, STOP and report.

## Verification

- **Mechanical**:
  ```bash
  npx tsc --noEmit          # expect exit 0
  npm test                  # expect 106 files / 1298 tests pass
  npm run build             # expect exit 0
  ```
- **Feel check**:
  - **Reduced motion on** (DevTools → Rendering → *Emulate CSS prefers-reduced-motion: reduce*), redeem a valid Pro code. Expect: **no particles**, and the Arabic success message appears immediately and completely. The screen must feel finished, not like it failed to animate.
  - **Reduced motion off**, redeem again. Expect: the full 100-particle burst, unchanged from today's behaviour.
  - Toggle the preference **while the screen is open**, then redeem. The hook subscribes live, so the current setting must win. Confirm this — it is the part a hardcoded `matchMedia` at module scope would get wrong.
  - Enter an invalid code and confirm nothing changed about error handling.
- **Done when**:
  - `grep -n "confetti(" src/features/auth/SubscriptionRedemptionScreen.tsx` shows the call nested inside a `reducedMotion` guard.
  - With reduced motion emulated, no `<canvas>` from confetti is added to the DOM after redemption.
  - The success message text is byte-identical to what it was before this change.

## Notes

This is the highest severity-per-line fix in the audit. It is also the only finding that is a correctness bug rather than a taste question, which makes it the safest plan to execute first if the others are deferred.
