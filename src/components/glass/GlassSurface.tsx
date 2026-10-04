import React, { useEffect, useState } from 'react';
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
 *
 * V34: the surface is lit from a fixed direction (`--kz-spec-x/-y` in
 * index.css) rather than from the pointer. The specular layer and the hook
 * that drove it are gone — see the note on the tokens for the measurement.
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
    </div>
  );
};

/** A sunken tray: progress rails, review rows, input wells. */
export const GlassWell: React.FC<Omit<GlassSurfaceProps, 'tier'>> = ({ className, ...props }) => (
  <GlassSurface tier="well" className={cn('overflow-hidden', className)} {...props} />
);

/* True when the learner asked the OS for reduced motion. */
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
