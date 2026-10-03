import React from 'react';
import { cn } from '@/lib/cn';
import { GlassSurface, type GlassTier } from '@/components/glass/GlassSurface';

export type CardVariant = 'card' | 'subtle' | 'hero' | 'elevated';
export type CardEmphasis = 'none' | 'primary' | 'earned';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  emphasis?: CardEmphasis;
  padded?: boolean;
  /** Legacy alias for `emphasis="primary"`, kept so older call sites are unchanged. */
  glow?: boolean;
}

/**
 * The app's one card.
 *
 * Like `Button`, Katzu used to have two: `ui/Card` (four colour variants) and
 * `glass/GlassCard` (a `tier` plus an `emphasis`). They described the same idea
 * in two vocabularies, which is why two screens could render "a card" and get
 * visibly different materials.
 *
 * The unified model separates the two things those APIs had merged:
 *
 *   `variant`  — *depth*. Maps onto the material's four tiers (see
 *                `.kz-surface[data-tier]` in index.css). `card` is the standard
 *                panel, `subtle` recedes, `elevated` floats.
 *   `emphasis` — *importance*. The only way a card gets a lit edge, and
 *                `earned` is the only way magenta ever appears: magenta means
 *                "the app recorded this", never "tap me".
 *
 * `glass/GlassCard` is now a compatibility wrapper over this component.
 */
const TIER: Record<CardVariant, GlassTier> = {
  card: 'glass',
  subtle: 'well',
  hero: 'glass',
  elevated: 'floating',
};

export const Card: React.FC<CardProps> = ({
  className,
  variant = 'card',
  emphasis = 'none',
  padded = true,
  glow,
  children,
  ...props
}) => {
  const resolved: CardEmphasis = glow && emphasis === 'none' ? 'primary' : emphasis;

  return (
    <GlassSurface
      tier={TIER[variant]}
      earned={resolved === 'earned'}
      className={cn(
        // `Card` is used far more widely than `GlassCard` was, so the padded
        // default follows the original `Card` (20px, explicit text colour) to
        // avoid resizing panels across a dozen already-shipped screens.
        padded ? 'p-5 text-text-primary' : 'overflow-hidden',
        variant === 'hero' && 'border border-primary/40',
        variant === 'elevated' && 'border border-border-subtle/70',
        resolved === 'primary' && 'shadow-kz-lavender',
        // A card that should feel *alive* wears `BorderBeam role="ambient"`
        // around it; it is not baked in here, because an ambient beam on every
        // card on a screen is exactly the "too many simultaneous glass effects"
        // cost the glass guidance warns about.
        className,
      )}
      {...props}
    >
      {children}
    </GlassSurface>
  );
};