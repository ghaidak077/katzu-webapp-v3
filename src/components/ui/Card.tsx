import React from 'react';
import { cn } from './Button';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'card' | 'subtle' | 'hero' | 'elevated';
  glow?: boolean;
}

export const Card: React.FC<CardProps> = ({
  className,
  variant = 'card',
  glow = false,
  children,
  ...props
}) => {
  const variants = {
    card: 'bg-surface-card border border-border-subtle',
    subtle: 'bg-surface-subtle border border-border-subtle',
    hero: 'bg-gradient-to-br from-surface-hero to-surface-card border border-primary/30',
    elevated: 'bg-surface-highest border border-border-subtle shadow-xl',
  };

  return (
    <div
      className={cn(
        'rounded-3xl p-5 transition-all text-text-primary',
        variants[variant],
        glow && 'shadow-glow-purple',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
