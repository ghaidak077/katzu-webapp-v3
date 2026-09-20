import React from 'react';
import { cn } from '../ui/Button';

export interface GermanTextProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'div';
}

/**
 * GermanText component strictly enforces Rule 8:
 * LTR isolation (<bdi dir="ltr">) and German typography (Satoshi/Latin)
 * so that umlauts, articles and punctuation never flip in RTL Arabic layouts.
 */
export const GermanText: React.FC<GermanTextProps> = ({
  children,
  className,
  as: Component = 'span',
  ...props
}) => {
  return (
    <Component
      className={cn('font-german font-medium tracking-wide inline-block', className)}
      {...props}
    >
      <bdi dir="ltr" lang="de">
        {children}
      </bdi>
    </Component>
  );
};
