import React from 'react';
import { Card, type CardEmphasis } from '@/components/ui/Card';
import { GlassSurface, type GlassTier } from './GlassSurface';
import { cn } from '@/lib/cn';

/**
 * Compatibility wrapper — the V2 name for the app's one card.
 *
 * `glass/GlassCard` and `ui/Card` used to be separate components with separate
 * prop vocabularies (`tier` vs `variant`). There is now one implementation
 * (`ui/Card`); this file maps the old vocabulary onto it so the screens that
 * already say `GlassCard` keep working, including their 16px default padding.
 */
export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Retained from the old API: `canvas` → subtle panel, `glass` → standard. */
  tier?: Extract<GlassTier, 'canvas' | 'glass'>;
  emphasis?: CardEmphasis;
  padded?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  tier = 'glass',
  emphasis = 'none',
  padded = true,
  className,
  ...props
}) => (
  <Card
    variant={tier === 'canvas' ? 'subtle' : 'card'}
    emphasis={emphasis}
    padded={padded}
    className={cn(padded ? '!p-4' : 'overflow-hidden', className)}
    {...props}
  />
);

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
    className={cn('rounded-sheet', className)}
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