import React from 'react';
import { Keyboard, Snail, Volume2 } from 'lucide-react';
import type { ContextualHint } from '@/types/models';

/**
 * The hint dock: one sentence the learner can actually say, its Arabic meaning,
 * and three ways to use it — hear it, hear it slowly, or type it yourself.
 *
 * A hint never inserts text and never sends a turn. That is the whole point: the
 * learner still has to produce the sentence, and the report still sees whether
 * they did it alone. The typed characters are compared to the offered sentence,
 * so a correct letter is green and the first wrong one is red — feedback while
 * typing, not a correction card after sending.
 */

export interface HintDockProps {
  hint: ContextualHint | null;
  typed: string;
  disabled?: boolean;
  onSpeak: (text: string) => void;
  onSlowSpeak: (text: string) => void;
  onTypeMyself: () => void;
}

function HintSentence({ hint, typed }: { hint: string; typed: string }) {
  const chars = Array.from(hint);
  const typedChars = Array.from(typed);
  // Compare only up to what the learner has typed; the rest stays quiet.
  let firstMismatch = -1;
  for (let index = 0; index < Math.min(chars.length, typedChars.length); index += 1) {
    if (chars[index].toLowerCase() !== typedChars[index].toLowerCase()) {
      firstMismatch = index;
      break;
    }
  }
  return (
    <span dir="ltr" className="font-german text-sm leading-snug">
      {chars.map((char, index) => {
        if (index >= typedChars.length) {
          return (
            <span key={index} className="text-kz-inkFaint">
              {char}
            </span>
          );
        }
        const isWrong = firstMismatch !== -1 && index >= firstMismatch;
        return (
          <span
            key={index}
            className={isWrong ? 'text-status-error' : 'text-status-success'}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}

export const HintDock: React.FC<HintDockProps> = ({
  hint,
  typed,
  disabled = false,
  onSpeak,
  onSlowSpeak,
  onTypeMyself,
}) => {
  if (!hint) return null;
  return (
    <div
      data-testid="hint-dock"
      dir="rtl"
      className="mx-3 mb-0.5 shrink-0 rounded-2xl border border-kz-lavender/25 bg-white/[0.04] px-3 py-1"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <HintSentence hint={hint.german} typed={typed} />
        </div>
        {hint.arabic && (
          <span className="kz-ar-micro max-w-[45%] shrink-0 text-end leading-relaxed text-kz-inkDim">
            {hint.arabic}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSpeak(hint.german.replace(/___/g, '').trim())}
          className="flex min-h-touch items-center gap-1 rounded-full px-2 kz-ar-micro font-semibold text-kz-lavender transition-colors pointer-hover:bg-white/10 disabled:opacity-40"
        >
          <Volume2 className="h-3.5 w-3.5" aria-hidden />
          سمّعني
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSlowSpeak(hint.german.replace(/___/g, '').trim())}
          className="flex min-h-touch items-center gap-1 rounded-full px-2 kz-ar-micro font-semibold text-kz-lavender transition-colors pointer-hover:bg-white/10 disabled:opacity-40"
        >
          <Snail className="h-3.5 w-3.5" aria-hidden />
          ببطء
        </button>
        <button
          type="button"
          onClick={onTypeMyself}
          className="flex min-h-touch items-center gap-1 rounded-full px-2 kz-ar-micro font-semibold text-kz-inkDim transition-colors pointer-hover:bg-white/10"
        >
          <Keyboard className="h-3.5 w-3.5" aria-hidden />
          قلها
        </button>
      </div>
    </div>
  );
};
