import { useEffect, useState } from 'react';

/**
 * Renderer tier (B4c).
 *
 * The glass material's blur, saturation and grain are GPU-composited work. On a
 * weak or thermally-throttled phone they are the difference between a screen
 * that scrolls and one that stutters — and they are pure decoration: contrast
 * never depends on them (the `@supports not (backdrop-filter)` block and every
 * tier's base opacity already guarantee readable glass without the effect).
 *
 * So the app picks a tier once, at startup:
 *
 *   - `full` — everything renders as designed;
 *   - `reduced` — blur/saturation/grain are dropped via the `kz-lite` root
 *     class (below), keeping colours, opacity and elevation so the design
 *     language survives;
 *   - selection is deterministic per device state, not per scroll or per
 *     render: no flapping mid-session. A learner whose device reports nothing
 *     usable gets `full` — the default must be the designed experience, and
 *     dropping effects for someone who could afford them is a regression too.
 *
 * Signals, in order of reliability: explicit user `data-saver` preference
 * (set via the browser's save-data hint or a low-core device), `prefers-reduced-motion`
 * (a strong proxy for low-end hardware and for users who dislike heavy
 * effects), then hardwareConcurrency / deviceMemory heuristics.
 */

export type RendererTier = 'full' | 'reduced';

/** Pure tier selection from the environment's signals. Exported for tests. */
export function detectTier(): RendererTier {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'full';

  // Save-Data: the network itself is asking to be spared heavy compositing.
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return 'reduced';

  // Reduced motion: proxy for both low-end hardware and users who turn effects
  // off — both should get the calm surface.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced';

  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  // Thresholds are deliberately low: flagging a capable laptop would change its
  // look for nothing. Only genuinely constrained devices drop effects.
  if (cores <= 4 || memory <= 2) return 'reduced';

  return 'full';
}

/** The tier, resolved once per page load and stable for the session. */
export function useRendererTier(): RendererTier {
  const [tier] = useState<RendererTier>(detectTier);
  return tier;
}

/** Applies the tier to the document root. Called once from App. */
export function applyRendererTier(tier: RendererTier): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('kz-lite', tier === 'reduced');
}
