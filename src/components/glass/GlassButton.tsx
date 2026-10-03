import React from 'react';
import { Button, PrimaryAction, type ButtonProps } from '@/components/ui/Button';

/**
 * Compatibility wrapper — the V2 name for the app's one button.
 *
 * `ui/Button` and `glass/GlassButton` used to be two different components with
 * two different sets of variants, corner radii and press feedback. There is now
 * a single implementation (`ui/Button`); this file exists only so the screens
 * that already say `GlassButton` keep working, and so the older default variant
 * is preserved exactly: `GlassButton` defaulted to `secondary`, `Button`
 * defaults to `primary`.
 *
 * New code should import `Button` / `PrimaryAction` directly.
 */
export interface GlassButtonProps extends ButtonProps {
  /** Retained for call sites written against the old two-value API. */
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  ...props
}) => <Button variant={variant} size={size} {...props} />;

export { PrimaryAction };
export default GlassButton;