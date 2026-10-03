import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Katzu V2 material primitives.
 *
 * The whole point of these is that "glass" is a *material with depth tiers*, not
 * a dark card with a border. Each surface states which tier it belongs to, and
 * the tier decides opacity, blur, tint, edge light and elevation (see
 * `.kz-surface[data-tier=…]` in index.css). Two consequences matter:
 *
 *  - a floating control can never look like a sunken well, because they are not
 *    the same declaration with different colours;
 *  - every surface reacts to the scene behind it through `--kz-scene-rgb`, which
 *    SceneBackdrop sets and glass inherits.
 */

export type GlassTier = 'canvas' | 'well' | 'glass' | 'floating';

export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  tier?: GlassTier;

  /** 0..1 — multiplies the scene tint this surface absorbs. */
  sceneInfluence?: number;
  /** Applies the earned-progress glow (magenta). Only for real achievements. */
  earned?: boolean;
}

export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  tier = 'glass',
  sceneInfluence,
  earned = false,
  className,
  style,
  children,
  ...props
}) => {
  return (
    <div
      data-tier={tier}
      className={cn('kz-surface', earned && 'kz-earned', className)}
      style={
        sceneInfluence !== undefined
          ? ({ ['--kz-scene-warmth' as string]: String(sceneInfluence), ...style } as React.CSSProperties)
          : style
      }
      {...props}
    >
      {children}
      <span aria-hidden className="kz-specular" />
    </div>
  );
};

/** A sunken tray: progress rails, review rows, input wells. */
export const GlassWell: React.FC<Omit<GlassSurfaceProps, 'tier'>> = ({ className, ...props }) => (
  <GlassSurface tier="well" className={cn('overflow-hidden', className)} {...props} />
);

/*
 * The CSS-only neon edge that used to live here is gone: an active surface now
 * wears `BorderBeam` (`role="active"`), which is a real travelling comet rather
 * than a static inner shadow, and magenta still only appears through
 * `palette="earned"`. One mechanism for a living edge, not two.
 */

/**
 * Soft directional highlight. Placed as a component (not only as the ::after
 * layer) so a screen can put it on a surface it does not own — e.g. the scene
 * frame on Journey Home.
 */
export const SpecularHighlight: React.FC<{ className?: string; strength?: number }> = ({
  className,
  strength,
}) => (
  <span
    aria-hidden
    className={cn('kz-specular', className)}
    style={
      strength !== undefined ? ({ ['--kz-spec-strength' as string]: String(strength) } as React.CSSProperties) : undefined
    }
  />
);

/** True when the learner asked the OS for reduced motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}

/**
 * Moves a surface's specular highlight with the pointer and with scroll.
 *
 * Pointer tracking is attached to the element, not to the window, so a scroll
 * (where there is no pointer) still produces a slow highlight shift — a static
 * white border is exactly what this exists to avoid.
 */
export function useSpecularHighlight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  const setVars = useCallback((x: number, y: number, strength?: number) => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty('--kz-spec-x', `${Math.round(x * 100)}%`);
    node.style.setProperty('--kz-spec-y', `${Math.round(y * 100)}%`);
    if (strength !== undefined) node.style.setProperty('--kz-spec-strength', strength.toFixed(3));
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<T>) => {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      setVars((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    },
    [setVars],
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const baseX = 0.28;
    const baseY = -0.18;
    setVars(baseX, baseY);

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
  }, [setVars]);

  return { ref, onPointerMove };
}
