import React, { useCallback, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, CheckCircle2, RefreshCw } from 'lucide-react';
import { ConversationMessage } from './ConversationMessage';
import { KatzuThinking } from '@/components/effects/KatzuThinking';
import type { ChatMessage } from '@/types/models';

/**
 * The transcript region of the live conversation.
 *
 * It is the hero of the screen: a flexible column between the compact header and
 * the input bar, with nothing else floating over it. The parent owns the scroll
 * behaviour (stick-to-bottom); this component adds the one thing that behaviour
 * cannot see from the outside — whether the learner has scrolled up — so it can
 * offer a jump back to the newest message instead of yanking them there.
 */

export interface ConversationTranscriptProps {
  /** Live element for the scrollable transcript region (owned by the parent). */
  scrollRef: React.Ref<HTMLDivElement>;
  onScroll: () => void;
  messages: ChatMessage[];
  showArabicTranslation: Record<string, boolean>;
  showAllTranslations: boolean;
  knownWords: Set<string>;
  /**
   * V28 Stage 1D: whether the study aids render (Arabic translation, the
   * correction card, the follow-up nudge). REAL mode passes false.
   */
  showHelp: boolean;
  isGenerating: boolean;
  /** { failedText, message } while a turn failed and its sentence is retryable. */
  turnError: { failedText: string; message: string } | null;
  isSessionCompleted: boolean;
  speakingId: string | null;
  activeCharIndex: number | null;
  onToggleTranslation: (messageId: string) => void;
  onRetryTranslation: (messageId: string, germanText: string) => void;
  onSpeak: (message: ChatMessage) => void;
  onSlowSpeak?: (message: ChatMessage) => void;
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
  showHelp,
  isGenerating,
  turnError,
  isSessionCompleted,
  speakingId,
  activeCharIndex,
  onToggleTranslation,
  onRetryTranslation,
  onSpeak,
  onSlowSpeak,
  onWordClick,
  onRetryFailedTurn,
}) => {
  const localRef = useRef<HTMLDivElement | null>(null);
  const [showJump, setShowJump] = useState(false);

  // Assign the element to both refs: the parent's for its own scroll effects, and
  // a local one so the jump button can move the same node.
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      localRef.current = node;
      if (typeof scrollRef === 'function') scrollRef(node);
      else if (scrollRef) (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [scrollRef],
  );

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      onScroll();
      const el = event.currentTarget;
      setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
    },
    [onScroll],
  );

  const jumpToBottom = useCallback(() => {
    const el = localRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setShowJump(false);
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={setRef}
        onScroll={handleScroll}
        data-testid="conversation-transcript"
        className="h-full space-y-3 overflow-y-auto px-4 py-3"
      >
        {messages.map((msg, index) => {
          // The correction rides the reply the worker returned, but it belongs to
          // what the learner said — so it is rendered under their bubble, keyed off
          // the immediately-following reply.
          const next = messages[index + 1];
          const correctionMessage =
            msg.sender === 'USER' && next?.sender === 'KATZU' && next.hasCorrection ? next : undefined;

          // Explicit per-message choice overrides the global toggle. The scenario
          // opener is the exception: it is the one message a learner cannot guess
          // at, so its Arabic shows unless they hide it themselves.
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
              showHelp={showHelp}
              knownWords={knownWords}
              onToggleTranslation={onToggleTranslation}
              onRetryTranslation={onRetryTranslation}
              onSpeak={onSpeak}
              onSlowSpeak={onSlowSpeak}
              onWordClick={onWordClick}
              spokenCharIndex={speakingId === msg.id ? activeCharIndex : null}
              isSpeaking={speakingId === msg.id}
              correctionMessage={correctionMessage}
            />
          );
        })}

        {/* Katzu is composing a reply: three dots in a bubble that matches his own
            messages, so the wait belongs to the conversation instead of sitting
            above it as a separate card. */}
        {isGenerating && (
          <div className="flex items-end gap-2" data-testid="katzu-thinking">
            <span className="mb-1 h-8 w-8 shrink-0 rounded-full bg-kz-lavender/10" aria-hidden />
            <div
              data-tier="canvas"
              className="kz-surface flex items-center gap-1.5 rounded-control rounded-ss-tag px-4 py-3.5"
              role="status"
              aria-label="كَاتْزُو يفكر في الرد…"
            >
              <span className="kz-typing-dot h-1.5 w-1.5 rounded-full bg-kz-lavender" />
              <span className="kz-typing-dot h-1.5 w-1.5 rounded-full bg-kz-lavender" />
              <span className="kz-typing-dot h-1.5 w-1.5 rounded-full bg-kz-lavender" />
            </div>
          </div>
        )}

        {/* Failed-turn error card with retry — never a silent hang */}
        {turnError && !isGenerating && (
          <div className="space-y-2 rounded-control border border-status-error/40 bg-surface-subtle p-3.5">
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
              className="kz-ar-micro flex items-center gap-1.5 rounded-xl border border-primary/50 bg-primary/20 px-3 py-1.5 font-bold text-primary transition-colors pointer-hover:bg-primary/30"
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
                  size={30}
                  layout="inline"
                  labelAr="أحسنت! جاري إعداد تقرير أدائك اللغوي مع كَاتْزُو..."
                  className="gap-2"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Offered only when the learner has scrolled up, and instantly takes them
          back — the explicit alternative to a silent auto-scroll fight. */}
      {showJump && (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label="الانتقال إلى أحدث رسالة"
          className="kz-animated absolute bottom-3 end-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-surface-highest text-kz-ink transition-colors pointer-hover:bg-surface-highest/80"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
