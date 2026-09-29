import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { KatzuThinking } from '@/components/effects/KatzuThinking';

export function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    // V20: `transition-colors`, not `transition-all` — colour feedback is what a
    // button needs, and `all` also tracks layout properties on a throttled phone.
    // The old active:scale is gone with the V19 motion budget (press feedback is
    // the surface's own brightness, which these variants already carry).
    const baseStyles = 'inline-flex items-center justify-center font-arabic font-semibold rounded-2xl transition-colors disabled:opacity-50 disabled:pointer-events-none select-none';

    const variants = {
      primary: 'bg-primary text-white hover:bg-primary-pressed shadow-glow-purple border border-primary/30',
      secondary: 'bg-surface-subtle text-text-primary hover:bg-surface-highest border border-border-subtle',
      outline: 'bg-transparent border border-primary text-primary hover:bg-primary/10',
      ghost: 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-subtle',
      danger: 'bg-status-error/20 text-status-error border border-status-error/30 hover:bg-status-error/30',
    };

    const sizes = {
      sm: 'text-xs px-3 py-1.5 h-8 gap-1.5',
      md: 'text-sm px-5 py-2.5 h-11 gap-2',
      lg: 'text-base px-6 py-3.5 h-14 gap-2.5 font-bold',
      icon: 'h-10 w-10 p-0 rounded-full',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
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
  }
);
Button.displayName = 'Button';
