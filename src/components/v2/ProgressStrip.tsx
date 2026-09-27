import React from 'react';
import { cn } from '@/components/ui/Button';

export interface ProgressStripProps {
  /** Total segments in the chapter — one per step the learner can actually finish. */
  segments: number;
  /** How many are honestly complete. Clamped; this is never inferred. */
  completed: number;
  /** The segment currently in progress: lit edge, not filled. */
  activeIndex?: number;
  /** Earned styling (magenta) for a completed chapter. */
  earned?: boolean;
  className?: string;
  labelAr?: string;
}

/**
 * Thin segmented progress.
 *
 * Segments, never a big percentage: a learner reads "three of five steps done"
 * from the shape of the strip without the app asserting a number it cannot
 * justify. Completed segments are lavender (or magenta once the whole strip is
 * earned), the active one is a lit edge, the rest stay sunken.
 */
export const ProgressStrip: React.FC<ProgressStripProps> = ({
  segments,
  completed,
  activeIndex,
  earned = false,
  labelAr,
  className,
}) => {
  const total = Math.max(0, Math.floor(segments));
  if (total === 0) return null;
  const done = Math.min(total, Math.max(0, Math.floor(completed)));
  const allDone = done >= total;

  return (
    <div className={cn('w-full', className)}>
      <div
        className="flex items-center gap-1.5"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={labelAr || 'تقدم الفصل'}
      >
        {Array.from({ length: total }).map((_, index) => {
          const isComplete = index < done;
          const isActive = index === activeIndex && !isComplete;
          // The whole strip turns magenta only when the chapter is genuinely
          // complete AND earned styling was requested — never on partial work.
          const toneRgb = allDone && earned ? 'var(--kz-magenta)' : 'var(--kz-lavender)';
          return (
            <span
              key={index}
              data-state={isComplete ? 'complete' : isActive ? 'active' : 'pending'}
              className="h-[3px] flex-1 rounded-full transition-all duration-500"
              style={{
                background: isComplete
                  ? `rgb(${toneRgb} / 0.85)`
                  : isActive
                    ? 'rgb(var(--kz-lavender) / 0.42)'
                    : 'rgb(255 255 255 / 0.09)',
                boxShadow: isComplete ? `0 0 9px rgb(${toneRgb} / 0.4)` : 'none',
              }}
            />
          );
        })}
      </div>
      {labelAr && <p className="mt-1.5 font-arabic text-[0.68rem] text-kz-inkFaint">{labelAr}</p>}
    </div>
  );
};

/**
 * A single thin rail. Used where one continuous measure is honest — e.g. "3 of 4
 * phrases you can say without help" inside Guided Practice.
 */
export const ProgressRail: React.FC<{ value: number; max: number; earned?: boolean; className?: string }> = ({
  value,
  max,
  earned = false,
  className,
}) => {
  const safeMax = Math.max(1, max);
  const ratio = Math.min(1, Math.max(0, value / safeMax));
  return (
    <span className={cn('block h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]', className)}>
      <span
        className="block h-full rounded-full transition-all duration-500"
        style={{
          width: `${ratio * 100}%`,
          background: `rgb(var(--kz-${earned ? 'magenta' : 'lavender'}) / 0.85)`,
          boxShadow: `0 0 10px rgb(var(--kz-${earned ? 'magenta' : 'lavender'}) / 0.4)`,
        }}
      />
    </span>
  );
};
