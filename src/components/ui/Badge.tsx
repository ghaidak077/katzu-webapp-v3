import React from 'react';
import { cn } from './Button';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'der' | 'die' | 'das' | 'success' | 'learning' | 'error' | 'subtle';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'primary',
  size = 'md',
  children,
  ...props
}) => {
  const variants = {
    primary: 'bg-primary/20 text-primary border border-primary/30',
    der: 'bg-article-der/20 text-article-der border border-article-der/40',
    die: 'bg-article-die/20 text-article-die border border-article-die/40',
    das: 'bg-article-das/20 text-article-das border border-article-das/40',
    success: 'bg-status-success/20 text-status-success border border-status-success/30',
    learning: 'bg-status-learning/20 text-status-learning border border-status-learning/30',
    error: 'bg-status-error/20 text-status-error border border-status-error/30',
    subtle: 'bg-surface-subtle text-text-secondary border border-border-subtle',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 rounded-lg font-medium',
    md: 'text-xs px-2.5 py-1 rounded-xl font-semibold',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-arabic whitespace-nowrap',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};
