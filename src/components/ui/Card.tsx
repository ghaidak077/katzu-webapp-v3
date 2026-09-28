import React from 'react';
import { cn } from './Button';
import { GlassSurface } from '@/components/glass/GlassSurface';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'card' | 'subtle' | 'hero' | 'elevated';
  glow?: boolean;
}

/**
 * The app-wide card, now a Liquid Glass surface.
 *
 * Every screen that still uses the legacy `Card` (Trail, Coach, Writing,
 * Listening, Study, Quiz, Practice, Settings, …) gets the real material —
 * backdrop blur, scene tint, specular sheen, lensing edge — with zero per-screen
 * edits. The old variants map onto glass tiers:
 *
 *   card    → `glass`  (the standard translucent panel)
 *   subtle  → `well`   (a quieter, more recessive surface)
 *   hero    → `glass` + primary border (the mission card keeps its emphasis)
 *   elevated→ `floating` (the brightest, blurriest tier)
 *
 * Contrast is preserved: `GlassSurface` guarantees the same minimum body the
 * opaque colours had, and the kz-lite renderer tier swaps blur for opacity
 * automatically.
 */
export const Card: React.FC<CardProps> = ({
  className,
  variant = 'card',
  glow = false,
  children,
  ...props
}) => {
  const tier = variant === 'elevated' ? 'floating' : variant === 'subtle' ? 'well' : 'glass';

  const emphasis =
    variant === 'hero'
      ? 'border border-primary/40'
      : variant === 'elevated'
        ? 'border border-border-subtle/70'
        : undefined;

  return (
    <GlassSurface
      tier={tier}
      className={cn(
        'rounded-3xl p-5 text-text-primary',
        emphasis,
        glow && 'shadow-glow-purple',
        className
      )}
      {...props}
    >
      {children}
    </GlassSurface>
  );
};
