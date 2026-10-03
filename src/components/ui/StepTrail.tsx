import React from 'react';
import { Check } from 'lucide-react';

/**
 * The moves of a drill, in order, with the one being done now marked.
 *
 * The V32 audit found the skill screens never numbered their steps: a learner had
 * to infer listen → type → check from the layout alone. Numbered, the screen
 * teaches its own procedure, and the answer to "what do I do now?" is on the
 * screen instead of in the learner's head.
 *
 * Steps already done keep a tick and stay readable — this is a position marker,
 * not a progress bar to stare at.
 */
export interface StepTrailProps {
  steps: readonly string[];
  /** 0-based index of the step in progress. */
  current: number;
  className?: string;
}

export const StepTrail: React.FC<StepTrailProps> = ({ steps, current, className = '' }) => (
  <ol
    className={`mb-4 flex items-center gap-1.5 ${className}`}
    aria-label="خطوات التدريب"
    data-testid="step-trail"
  >
    {steps.map((label, index) => {
      const done = index < current;
      const active = index === current;
      return (
        <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            aria-current={active ? 'step' : undefined}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-micro font-bold transition-colors ${
              active
                ? 'kz-primary text-kz-ink'
                : done
                  ? 'bg-status-success/20 text-status-success'
                  : 'bg-surface-subtle text-text-muted'
            }`}
          >
            {done ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
          </span>
          <span
            className={`truncate text-micro font-arabic ${
              active ? 'font-bold text-text-primary' : 'text-text-muted'
            }`}
          >
            {label}
          </span>
        </li>
      );
    })}
  </ol>
);
