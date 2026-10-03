import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * A titled group of settings that can be folded away.
 *
 * The V32 audit measured the profile screen with 29 flat controls and no grouping,
 * so a learner looking for their level or their data had to read everything to
 * find it — and a screen that long hides its own important settings among the
 * diagnostics. Grouping by what the setting *is* puts each one where a learner
 * would look for it, and folding the rest keeps the screen scannable.
 *
 * Collapsed by default except where a screen says otherwise: the first thing on
 * the screen should be the thing most people open the screen for, and folding
 * that away would be its own kind of confusion.
 */
export interface CollapsibleSectionProps {
  title: string;
  /** One line under the title, shown when collapsed so the group explains itself. */
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  hint,
  defaultOpen = false,
  children,
  className = '',
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className={`mb-4 ${className}`}>
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          aria-expanded={open}
          aria-controls={panelId}
          data-testid="section-toggle"
          className="flex w-full min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-card px-4 py-3 text-start transition-colors hover:border-primary/40"
        >
          <span className="min-w-0">
            <span className="block font-arabic text-sm font-bold text-text-primary">{title}</span>
            {!open && hint && (
              <span className="mt-0.5 block font-arabic text-micro text-text-secondary">{hint}</span>
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-text-secondary transition-transform duration-panels ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden
          />
        </button>
      </h3>
      <div id={panelId} hidden={!open} className={open ? 'pt-3' : ''}>
        {open && children}
      </div>
    </section>
  );
};