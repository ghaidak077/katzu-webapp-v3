import React from 'react';
import { GermanText } from '@/components/common/GermanText';
import { hintIntentLabel } from '@/lib/utils/hintIntents';
import type { ContextualHint } from '@/types/models';

export interface HintOptionProps {
  hint: ContextualHint;
  onUse: () => void;
  /** The default-visible suggestion renders slightly stronger than the rest. */
  primary?: boolean;
}

/**
 * One suggestion in the hint sheet. The intent chip is what makes the options
 * legible as *different moves* rather than four phrasings of one idea.
 */
export const HintOption: React.FC<HintOptionProps> = ({ hint, onUse, primary = false }) => {
  const label = hintIntentLabel(hint.intent);
  return (
    <button
      onClick={onUse}
      className={`w-full px-3 py-2 rounded-2xl bg-surface-card border text-xs font-semibold text-start transition-all flex flex-col gap-1 ${
        primary ? 'border-primary/40 hover:border-primary/70' : 'border-border-subtle hover:border-primary/40'
      }`}
    >
      {label && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-arabic self-start">
          {label}
        </span>
      )}
      <GermanText className="text-primary font-bold">{hint.german}</GermanText>
      <span className="text-[10px] text-text-muted font-arabic">{hint.arabic}</span>
    </button>
  );
};
