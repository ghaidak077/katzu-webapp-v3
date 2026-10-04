import React from 'react';
import { cn } from '@/lib/cn';
import { KatzuThinking } from '@/components/effects/KatzuThinking';
import { useGlassInteractive } from '@/components/glass/GlassEffectContainer';

export type ButtonVariant =
  /** The one obvious action on a screen. Dark violet fill, light label. */
  | 'primary'
  /** A real alternative to the primary action. Glass, one tier above the page. */
  | 'secondary'
  /** A text-level escape hatch ("type instead of speak"). No surface at all. */
  | 'quiet'
  /** A capability the learner genuinely unlocked. Magenta edges, never "tap me". */
  | 'earned'
  /** A bordered control for tertiary actions. */
  | 'outline'
  /** No chrome until hovered — used inside dense rows and toolbars. */
  | 'ghost'
  /** Destructive. The only variant allowed to use the danger colour. */
  | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

/**
 * The app's one button.
 *
 * Katzu used to ship two: `ui/Button` (flat Tailwind colours, five variants,
 * four sizes) and `glass/GlassButton` (Liquid Glass material, four variants,
 * two sizes). They disagreed about corner radius, pressed feedback, loading
 * state and what "primary" meant, so the same screen could look like two apps.
 * This is the single implementation; `glass/GlassButton` is now a thin
 * compatibility wrapper that pins the old defaults.
 *
 * Three rules the API enforces rather than leaves to discipline:
 *
 *  1. **One primary per screen.** `primary` and `earned` are the only filled
 *     actions, so a screen that renders two is visibly wrong in review.
 *  2. **Never 3:1 or worse.** Every filled variant's label is an explicit
 *     `*-on-*` token, and `scripts/contrast-check.mjs` fails the build if any of
 *     those pairings drops below 4.5:1.
 *  3. **Never smaller than a thumb.** `sm` is 44px, everything above is 48px+,
 *     and `icon` is 44x44 — the WCAG 2.5.8 floor.
 *
 * Press feedback is the material's own live highlight (`kz-interactive`), not a
 * colour swap or a scale animation, so the surface answers the finger where it
 * was touched.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'kz-primary text-kz-ink font-bold',
  secondary: 'kz-surface !rounded-control font-semibold text-kz-inkDim pointer-hover:text-kz-ink',
  earned: 'kz-primary kz-earned text-kz-ink font-bold',
  quiet:
    'bg-transparent font-medium text-kz-inkFaint pointer-hover:text-kz-inkDim underline-offset-4 pointer-hover:underline',
  outline: 'bg-transparent border border-primary/70 font-semibold text-primary pointer-hover:bg-primary/10',
  ghost:
    'bg-transparent border border-transparent font-medium text-text-secondary pointer-hover:text-text-primary pointer-hover:bg-surface-subtle',
  danger:
    'bg-status-error/20 text-status-error border border-status-error/40 pointer-hover:bg-status-error/30 font-semibold',
};

const SIZES: Record<ButtonSize, string> = {
  // 44px is the thumb-target floor; the primary action never goes below 48px.
  sm: 'min-h-touch px-4 gap-1.5 text-caption',
  md: 'min-h-control px-5 gap-2 text-body',
  lg: 'min-h-[56px] px-6 gap-2.5 text-title',
  icon: 'h-touch w-touch p-0 rounded-full',
};

/** Variants that carry their own painted surface — these get the glass treatment. */
const IS_SURFACE: Record<ButtonVariant, boolean> = {
  primary: true,
  secondary: true,
  earned: true,
  quiet: false,
  outline: false,
  ghost: false,
  danger: false,
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading,
      fullWidth,
      children,
      disabled,
      type = 'button',
      ...props
    },
    forwardedRef,
  ) => {
    const press = useGlassInteractive<HTMLButtonElement>();
    const isDisabled = disabled || isLoading;

    // Merge the local press ref with the caller's so `asChild`-style ref
    // forwarding keeps working for callers that already pass a ref.
    const setRef = React.useCallback(
      (node: HTMLButtonElement | null) => {
        (press.ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef, press.ref],
    );

    return (
      <button
        ref={setRef}
        type={type}
        disabled={isDisabled}
        data-tier={IS_SURFACE[variant] ? 'canvas' : undefined}
        onPointerDown={press.onPointerDown}
        onPointerMove={press.onPointerMove} // design-audit: allow — the live highlight tracks the press, not the hover
        onPointerUp={press.onPointerUp}
        onPointerCancel={press.onPointerCancel}
        onPointerLeave={press.onPointerLeave}
        // V20: `transition-colors`, not `transition-all` — colour feedback is what
        // a button needs, and `all` also tracks layout properties on a throttled
        // phone. The old `active:scale` is gone with the V19 motion budget.
        className={cn(
          'inline-flex select-none items-center justify-center font-arabic',
          IS_SURFACE[variant] && 'kz-surface kz-interactive',
          // A disabled control must look disabled *and* be inert; `aria-disabled`
          // is implied by the real `disabled` attribute above. `duration-fast` +
          // `ease-out` is the single most-felt timing in the product — every
          // press and every disabled fade, dozens of times a session — so it is
          // pinned here rather than inherited from a 280ms default.
          'transition-colors duration-fast ease-out disabled:opacity-45 disabled:pointer-events-none',
          VARIANTS[variant],
          SIZES[size],
          fullWidth && 'w-full',
          className,
        )}
        {...props}
      >
        {isLoading ? (
          // The app's one thinking motion, at control scale. A button that spins
          // its own bordered circle is a second loading language; this is not.
          <KatzuThinking size={20} layout="inline" />
        ) : (
          children
        )}
      </button>
    );
  },
);
Button.displayName = 'Button';

export interface PrimaryActionProps extends ButtonProps {
  /** One Arabic line under the button: what happens when it is tapped. */
  hintAr?: string;
  icon?: React.ReactNode;
  subLabel?: string;
}

/**
 * The primary action plus its single supporting line. Kept as one component so
 * the "one obvious action per screen" rule is enforced by the API rather than by
 * discipline: a screen that renders two of these is visibly wrong in review.
 */
export const PrimaryAction: React.FC<PrimaryActionProps> = ({
  hintAr,
  subLabel,
  icon,
  children,
  className,
  disabled,
  ...props
}) => (
  <div className="w-full">
    <Button
      variant="primary"
      size="lg"
      fullWidth
      className={cn('gap-3', className)}
      disabled={disabled}
      {...props}
    >
      {icon}
      <span className="flex flex-col items-center leading-tight">
        <span>{children}</span>
        {subLabel && <span className="text-micro font-normal opacity-70">{subLabel}</span>}
      </span>
    </Button>
    {hintAr && (
      <p className="mt-2 text-center font-arabic text-micro leading-relaxed text-kz-inkFaint">
        {hintAr}
      </p>
    )}
  </div>
);