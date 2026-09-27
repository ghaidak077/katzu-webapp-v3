import React from 'react';
import { cn } from '@/components/ui/Button';
import { useGlassInteractive } from './GlassEffectContainer';

export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `primary` is the one obvious action on a screen, `secondary` is a quieter
   * glass control, `quiet` is a text-level escape hatch (type instead of speak),
   * `earned` is reserved for a genuinely unlocked capability.
   */
  variant?: 'primary' | 'secondary' | 'quiet' | 'earned';
  size?: 'md' | 'lg';
  fullWidth?: boolean;
}

const VARIANTS: Record<NonNullable<GlassButtonProps['variant']>, string> = {
  primary: 'kz-primary font-bold',
  secondary: 'kz-surface !rounded-[20px] font-semibold text-kz-inkDim hover:text-kz-ink',
  quiet: 'bg-transparent font-medium text-kz-inkFaint hover:text-kz-inkDim underline-offset-4 hover:underline',
  earned: 'kz-primary kz-earned font-bold',
};

const SIZES: Record<NonNullable<GlassButtonProps['size']>, string> = {
  // 48px is the comfortable thumb target; never shrink the primary action below it.
  md: 'min-h-[48px] px-5 text-[0.95rem]',
  lg: 'min-h-[58px] px-6 text-base',
};

/**
 * The single primary action.
 *
 * A screen gets exactly one `primary`/`earned` button. Everything else is
 * `secondary` or `quiet`, which is how the layout stays free of button grids
 * where every option looks equally important.
 */
export const GlassButton: React.FC<GlassButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  children,
  ...props
}) => {
  // Liquid Glass `.interactive()`: the surface answers the finger in real time
  // rather than swapping to an `:active` colour when the press ends.
  const press = useGlassInteractive<HTMLButtonElement>();
  if (variant === 'quiet') {
    return (
      <button
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 font-arabic text-[0.82rem]',
          'min-h-[44px] px-2 transition-colors disabled:opacity-40 disabled:pointer-events-none',
          VARIANTS.quiet,
          fullWidth && 'w-full',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      ref={press.ref}
      type={type}
      data-tier="canvas"
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onPointerLeave={press.onPointerLeave}
      className={cn(
        'kz-surface kz-interactive inline-flex items-center justify-center gap-2 font-arabic',
        'transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export interface PrimaryActionProps extends GlassButtonProps {
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
    <GlassButton variant="primary" size="lg" fullWidth className={cn('gap-3', className)} disabled={disabled} {...props}>
      {icon}
      <span className="flex flex-col items-center leading-tight">
        <span>{children}</span>
        {subLabel && <span className="text-[0.7rem] font-normal opacity-70">{subLabel}</span>}
      </span>
    </GlassButton>
    {hintAr && (
      <p className="mt-2 text-center font-arabic text-[0.72rem] leading-relaxed text-kz-inkFaint">{hintAr}</p>
    )}
  </div>
);
