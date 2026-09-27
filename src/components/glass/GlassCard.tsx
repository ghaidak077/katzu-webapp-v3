import React from 'react';
import { cn } from '@/components/ui/Button';
import { GlassSurface, type GlassTier } from './GlassSurface';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tier?: Extract<GlassTier, 'canvas' | 'glass'>;
  /** Lifts the card and lights its edge — for the one action that matters. */
  emphasis?: 'none' | 'primary' | 'earned';
  padded?: boolean;
}

/**
 * A content panel. `emphasis` is the only way a card gets glow, and `earned` is
 * reserved for progress the app actually recorded — magenta never means "tap me".
 */
export const GlassCard: React.FC<GlassCardProps> = ({
  tier = 'glass',
  emphasis = 'none',
  padded = true,
  className,
  style,
  children,
  ...props
}) => {
  return (
    // A card that should feel alive wears `BorderBeam role="ambient"` around it;
    // it is not baked in here, because an ambient beam on every card on a screen is
    // exactly the "too many simultaneous glass effects" cost the glass guidance warns
    // about. `emphasis` remains the card's own treatment (and `earned` its magenta).
    <GlassSurface
      tier={tier}
      earned={emphasis === 'earned'}
      className={cn('overflow-hidden', padded && 'p-4', className)}
      style={style}
      {...props}
    >
      {children}
    </GlassSurface>
  );
};

export interface FloatingControlProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Magenta edge for earned states only. */
  tone?: 'lavender' | 'magenta';
}

/**
 * The top tier: controls that float *above* the layout (bottom bars, the mic
 * dock, sticky headers). Always the blurriest, brightest-edged surface on the
 * screen, which is what gives the interface a real z-order instead of one
 * uniform panel colour.
 */
export const FloatingControl: React.FC<FloatingControlProps> = ({
  tone = 'lavender',
  className,
  children,
  ...props
}) => (
  <GlassSurface
    tier="floating"
    className={cn('rounded-[26px]', className)}
    style={{ '--kz-glow-rgb': tone === 'magenta' ? 'var(--kz-magenta)' : 'var(--kz-lavender)' } as React.CSSProperties}
    {...props}
  >
    {children}
  </GlassSurface>
);

/**
 * Re-tints a subtree with one scene's light. Used where a scene must influence
 * surfaces it is not an ancestor of — e.g. the story screen's glass panel
 * matching the artwork above it.
 */
export const AdaptiveTintLayer: React.FC<{
  sceneRgb: string;
  warmth: number;
  className?: string;
  children: React.ReactNode;
}> = ({ sceneRgb, warmth, className, children }) => (
  <div
    className={className}
    style={
      {
        '--kz-scene-rgb': sceneRgb,
        '--kz-scene-warmth': String(warmth),
      } as React.CSSProperties
    }
  >
    {children}
  </div>
);
