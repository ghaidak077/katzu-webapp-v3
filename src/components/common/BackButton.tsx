import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * The app's one back button.
 *
 * Eight screens used to grow their own: the same `<button>` with the same
 * `p-2.5 rounded-2xl bg-surface-card` class string, and nothing stopping them
 * from drifting apart. Seven of the eight measured **41px** — three pixels under
 * the 44px thumb floor the rest of the app enforces — and the eighth had been
 * patched with `min-h-[44px] min-w-[44px]` arbitrary values rather than with a
 * token, which is the same drift wearing a different hat.
 *
 * This component is the fix rather than another patch: `size="icon"` is already
 * `h-touch w-touch` (44x44), the surface comes from `variant="secondary"`, and
 * the focus ring is the global one. Nothing left to hand-roll, so nothing left
 * to get wrong.
 *
 * The chevron points right (`ArrowRight`) because Katzu is RTL: "back" is toward
 * the start of the line, which is the right edge in Arabic. Every one of the
 * eight copies already used this direction, so this preserves it explicitly
 * rather than by accident.
 */
export interface BackButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  onBack: () => void;
  /** Used for the accessible name; the icon itself is decorative. */
  label?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({
  onBack,
  label = 'العودة',
  className,
  ...props
}) => (
  <Button
    variant="secondary"
    size="icon"
    onClick={onBack}
    aria-label={label}
    className={className}
    {...props}
  >
    <ArrowRight className="h-5 w-5" aria-hidden="true" />
  </Button>
);

export default BackButton;
