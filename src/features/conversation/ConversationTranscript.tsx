import React from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { ConversationMessage } from './ConversationMessage';
import { KatzuThinking } from '@/components/effects/KatzuThinking';
import type { ChatMessage } from '@/types/models';

/**
 * The transcript region of the live conversation (B4d mechanical split).
 *
 * Extracted verbatim from `LiveConversationScreen`'s JSX — the bubble list, the
 * in-flight thinking indicator, the failed-turn error card with retry, and the
 * completion card. Zero behaviour change: every value arrives as a prop, every
 * class name and aria label is byte-identical to what the screen rendered before,
 * and the parent keeps owning the scroll ref so the stick-to-bottom logic and the
 * ResizeObserver see the same DOM node (`scrollRef` is forwarded here).
 */

export interface ConversationTranscriptProps {
  /** Live element for the scrollable transcript region (owned by the parent). */
  scrollRef: React.Ref<HTMLDivElement>;
  onScroll: () => void;
  messages: ChatMessage[];
  showArabicTranslation: Record<string, boolean>;
  showAllTranslations: boolean;
  knownWords: Set<string>;
  isGenerating: boolean;
  /** { failedText, message } while a turn failed and its sentence is retryable. */
  turnError: { failedText: string; message: string } | null;
  isSessionCompleted: boolean;
  speakingId: string | null;
  activeCharIndex: number | null;
  onToggleTranslation: (messageId: string) => void;
  onRetryTranslation: (messageId: string, germanText: string) => void;
  onSpeak: (message: ChatMessage) => void;
  onWordClick: (word: string) => void;
  onRetryFailedTurn: () => void;
}

export const ConversationTranscript: React.FC<ConversationTranscriptProps> = ({
  scrollRef,
  onScroll,
  messages,
  showArabicTranslation,
  showAllTranslations,
  knownWords,
  isGenerating,
  turnError,
  isSessionCompleted,
  speakingId,
  activeCharIndex,
  onToggleTranslation,
  onRetryTranslation,
  onSpeak,
  onWordClick,
  onRetryFailedTurn,
}) => {
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      data-testid="conversation-transcript"
      className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-4"
    >
      {messages.map((msg) => {
        // Explicit per-message choice overrides the global toggle. The
        // scenario opener is the exception: it is the only message a learner
        // has no way to guess at (no earlier turn to decode it against), so
        // its Arabic shows unless they hide it themselves.
        const isTransVisible =
          msg.id in showArabicTranslation
            ? showArabicTranslation[msg.id]
            : msg.id === 'msg_initial'
              ? true
              : showAllTranslations;

        return (
          <ConversationMessage
            key={msg.id}
            message={msg}
            isTranslationVisible={isTransVisible}
            knownWords={knownWords}
            onToggleTranslation={onToggleTranslation}
            onRetryTranslation={onRetryTranslation}
            onSpeak={onSpeak}
            onWordClick={onWordClick}
            spokenCharIndex={speakingId === msg.id ? activeCharIndex : null}
          />
        );
      })}

      {isGenerating && (
        <div className="flex w-fit items-center gap-2 rounded-2xl kz-chip border border-white/10 bg-white/5 px-3 py-2">
          <KatzuThinking size={20} layout="inline" labelAr="كَاتْزُو يفكر في الرد…" className="gap-2" />
        </div>
      )}

      {/* Failed-turn error card with retry — never a silent hang */}
      {turnError && !isGenerating && (
        <div className="space-y-2 rounded-2xl border border-status-error/40 bg-surface-subtle p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-status-error">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>تعذر إرسال جملتك:</span>
          </div>
          <div dir="ltr" className="font-german text-xs text-kz-inkDim">
            {turnError.failedText}
          </div>
          <p className="kz-ar-micro text-kz-inkDim">{turnError.message}</p>
          <button
            onClick={onRetryFailedTurn}
            className="kz-ar-micro flex items-center gap-1.5 rounded-xl border border-primary/50 bg-primary/20 px-3 py-1.5 font-bold text-primary transition-colors hover:bg-primary/30"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Rule 7: Celebration Card on Exchange Completion */}
      {isSessionCompleted && (
        <div className="my-2 flex items-center gap-3 rounded-3xl border border-primary/40 bg-white/5 p-4 shadow-glow-purple">
          <div className="flex-1">
            <div className="kz-ar-micro flex items-center gap-1.5 font-bold text-status-success">
              <CheckCircle2 className="h-4 w-4" />
              اكتملت محادثة السيناريو بنجاح!
            </div>
            <div className="mt-1">
              <KatzuThinking
                size={22}
                layout="inline"
                labelAr="أحسنت! جاري إعداد تقرير أدائك اللغوي مع كَاتْزُو..."
                className="gap-2"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
