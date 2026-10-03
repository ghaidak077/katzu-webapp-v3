import React from 'react';
import { cn } from '@/lib/cn';

export type ConnectionState = 'online' | 'offline' | 'syncing' | 'cached';

const STATE_COPY: Record<ConnectionState, { labelAr: string; dotRgb: string }> = {
  online: { labelAr: 'متصل', dotRgb: 'var(--kz-neon)' },
  offline: { labelAr: 'بدون اتصال', dotRgb: 'var(--kz-ink-faint)' },
  syncing: { labelAr: 'جارٍ المزامنة', dotRgb: 'var(--kz-lavender)' },
  // "Cached content is still usable" — the state a learner on a train is in.
  cached: { labelAr: 'محتوى محفوظ', dotRgb: 'var(--kz-warm)' },
};

export interface StatusIndicatorProps {
  state: ConnectionState;
  /** Extra Arabic context, e.g. "المهمة متاحة بدون اتصال". */
  detailAr?: string;
  /** Hides the label and shows only the dot; the label still reaches screen readers. */
  compact?: boolean;
  className?: string;
}

/**
 * Connection state, never carried by colour alone: the dot *and* the Arabic
 * label always ship together, and the accessible name is the same label.
 */
export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ state, detailAr, compact = false, className }) => {
  const copy = STATE_COPY[state];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 font-arabic text-[0.68rem] text-kz-inkFaint', className)}
      role="status"
      aria-label={detailAr ? `${copy.labelAr} — ${detailAr}` : copy.labelAr}
    >
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', state === 'syncing' && 'kz-animated animate-kz-glow-pulse')}
        style={{ background: `rgb(${copy.dotRgb} / 0.9)`, boxShadow: `0 0 8px rgb(${copy.dotRgb} / 0.5)` }}
      />
      {!compact && <span>{copy.labelAr}</span>}
      {!compact && detailAr && <span className="text-kz-inkFaint/80">· {detailAr}</span>}
    </span>
  );
};
