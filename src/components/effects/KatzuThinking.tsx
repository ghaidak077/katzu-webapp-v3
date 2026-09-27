import React from 'react';
import { cn } from '@/components/ui/Button';
import { SiriWave, type SiriWaveVariant } from './SiriWave';

/**
 * One thinking language for the whole app.
 *
 * Every place that used to draw its own spinner — a `Loader2` with
 * `animate-spin`, a bordered circle, a bare text placeholder — now renders this,
 * so a learner sees the same motion whether Katzu is grading a paragraph,
 * compiling a debrief, or assembling a rehearsal deck.
 *
 * `role="status"` with an Arabic label is the accessible half: motion alone tells
 * a screen reader nothing, and "waiting" in Arabic tells it everything.
 */

export interface KatzuThinkingProps {
  /** Arabic status line. Omit only where neighbouring text already says it. */
  labelAr?: string;
  size?: number;
  /** `fluid-dots` for processing; `wave` only where Katzu's voice is playing. */
  variant?: SiriWaveVariant;

  /** `inline` sits next to its label, `block` centres a stacked indicator. */
  layout?: 'inline' | 'block';
  className?: string;
}

export const KatzuThinking: React.FC<KatzuThinkingProps> = ({
  labelAr,
  size = 48,
  variant = 'fluid-dots',
  layout = 'block',
  className,
}) => (
  <div
    role="status"
    aria-live="polite"
    className={cn(
      'flex items-center gap-3',
      layout === 'block' ? 'flex-col justify-center text-center' : 'flex-row',
      className,
    )}
  >
    <SiriWave variant={variant} size={size} />
    {labelAr && <p className="kz-ar-caption text-kz-inkDim">{labelAr}</p>}
  </div>
);

export default KatzuThinking;
