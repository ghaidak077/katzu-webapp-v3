import React from 'react';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { UiStringKey } from '@/lib/i18n/strings';

export type ConnectionState = 'online' | 'offline' | 'syncing' | 'cached';

const STATE_COPY: Record<ConnectionState, { key: UiStringKey; dotRgb: string }> = {
  online: { key: 'status.online', dotRgb: 'var(--kz-neon)' },
  offline: { key: 'status.offline', dotRgb: 'var(--kz-ink-faint)' },
  syncing: { key: 'status.syncing', dotRgb: 'var(--kz-lavender)' },
  // "Cached content is still usable" — the state a learner on a train is in.
  cached: { key: 'status.cached', dotRgb: 'var(--kz-warm)' },
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
  const { t } = useLanguage();
  const copy = STATE_COPY[state];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 font-arabic text-[0.68rem] text-kz-inkFaint', className)}
      role="status"
      aria-label={detailAr ? `${t(copy.key)} — ${detailAr}` : t(copy.key)}
    >
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', state === 'syncing' && 'kz-animated animate-kz-glow-pulse')}
        style={{ background: `rgb(${copy.dotRgb} / 0.9)`, boxShadow: `0 0 8px rgb(${copy.dotRgb} / 0.5)` }}
      />
      {!compact && <span>{t(copy.key)}</span>}
      {!compact && detailAr && <span className="text-kz-inkFaint/80">· {detailAr}</span>}
    </span>
  );
};
