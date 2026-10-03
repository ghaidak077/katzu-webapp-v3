import React from 'react';
import { ChevronDown, ChevronUp, Keyboard, Lightbulb, MicOff, RefreshCw, Send } from 'lucide-react';
import { HintOption } from '@/components/common/HintOption';
import { Button } from '@/components/ui/Button';
import { FloatingControl } from '@/components/glass/GlassCard';
import { KatzuOrb, type OrbState } from '@/components/voice/KatzuOrb';
import type { MicSample } from '@/lib/audio/useMicLevel';
import type { ContextualHint } from '@/types/models';

/**
 * The conversation chrome, in two pieces (V29 layout).
 *
 * The owner's report was geometric: the dock — a full-width orb, its status
 * line, the suggestion panel and the composer — measured 245 px of a 539 px
 * phone viewport (304 px with a suggestion open), so the transcript the learner
 * actually reads was squeezed into a sliver. The fix is structural, not
 * cosmetic: the voice/hint mass moves to a compact control bar under the header
 * and the composer shrinks to one row at the bottom, leaving the transcript the
 * middle of the screen.
 *
 * Splitting it this way also removes the whole class of overlap bug the old
 * layout had: the orb can no longer float over a message, because the messages
 * now live in their own region *below* the control bar and can never reach it.
 * Behaviour is unchanged: every value still arrives as a prop, every aria label
 * and the `conversation-dock` test id (now on the composer, which stays the
 * bottom boundary the layout tests measure against) are preserved.
 */

export interface ConversationControlsProps {
  /**
   * V28 Stage 1D: whether the suggestion pill renders. REAL mode passes false
   * (the hint floor is already empty there, so this is belt-and-braces); the
   * microphone and the typed fallback stay in every mode.
   */
  showHelp: boolean;
  visibleHints: ContextualHint[];
  isHintRevealed: boolean;
  isHintExpanded: boolean;
  isRefreshingHints: boolean;
  micError: string | null;
  orbState: OrbState;
  orbTone: 'lavender' | 'earned';
  orbSize: number;
  orbLabelAr: string;
  orbReadLevel: () => MicSample;
  orbDisabled: boolean;
  isRecording: boolean;
  conversationStatusLabelAr: string;
  interimText: string;
  onOrbPress: () => void;
  onRevealHint: () => void;
  onHideHint: () => void;
  onToggleHintExpanded: () => void;
  onRefreshHints: () => void;
  onUseHint: (hint: ContextualHint) => void;
  /** The words of the offered reply, so the learner can type it themselves. */
  hintBank: string[];
  onPickHintWord: (word: string) => void;
  onDismissError: () => void;
}

export const ConversationControls: React.FC<ConversationControlsProps> = ({
  showHelp,
  visibleHints,
  isHintRevealed,
  isHintExpanded,
  isRefreshingHints,
  micError,
  orbState,
  orbTone,
  orbSize,
  orbLabelAr,
  orbReadLevel,
  orbDisabled,
  isRecording,
  conversationStatusLabelAr,
  interimText,
  onOrbPress,
  onRevealHint,
  onHideHint,
  onToggleHintExpanded,
  onRefreshHints,
  onUseHint,
  hintBank,
  onPickHintWord,
  onDismissError,
}) => {
  return (
    <FloatingControl
      data-testid="conversation-controls"
      className="shrink-0 rounded-none border-b border-white/[0.06] px-3 py-2"
    >
      {/* Hints as an on-demand button: a single 💡 pill that reveals the one
          context-aware suggestion when tapped — no always-visible strip
          competing with the chat. */}
      {showHelp && visibleHints.length > 0 && !isHintRevealed && (
        <button
          onClick={onRevealHint}
          className="kz-ar-micro mb-2 flex items-center gap-1.5 rounded-full border border-primary/30 bg-white/5 px-3 py-1.5 font-semibold text-primary transition-colors hover:border-primary/60"
        >
          <Lightbulb className="h-3.5 w-3.5" />
          اقتراح لردّك
        </button>
      )}

      {showHelp && visibleHints.length > 0 && isHintRevealed && (
        <div className="mb-2 flex items-start gap-1.5">
          <div className="max-h-[22vh] min-w-0 flex-1 space-y-1.5 overflow-y-auto">
            <HintOption hint={visibleHints[0]} onUse={() => onUseHint(visibleHints[0])} primary />
            {visibleHints.length > 1 && (
              <>
                <button
                  onClick={onToggleHintExpanded}
                  className="kz-ar-micro flex w-full items-center justify-between rounded-xl kz-chip border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-kz-inkDim transition-colors hover:text-primary"
                >
                  <span>
                    {isHintExpanded
                      ? 'إخفاء الخيارات الأخرى'
                      : `خيارات أخرى في هذا الموقف (${visibleHints.length - 1})`}
                  </span>
                  {isHintExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {isHintExpanded &&
                  visibleHints.slice(1, 4).map((hint, hIdx) => (
                    <HintOption key={hIdx} hint={hint} onUse={() => onUseHint(hint)} />
                  ))}
              </>
            )}
          </div>
          <button
            onClick={onRefreshHints}
            aria-label="تحديث الاقتراحات"
            className="shrink-0 rounded-xl kz-chip border border-white/10 bg-white/5 p-2 text-kz-inkDim transition-colors hover:text-primary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingHints ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onHideHint}
            aria-label="إخفاء الاقتراح"
            className="shrink-0 rounded-xl p-2 text-kz-inkDim transition-colors hover:text-kz-ink"
          >
            ✕
          </button>
        </div>
      )}

      {/* The words of the offered reply. The suggestion sends a whole sentence;
          a learner who wants to say it in their own words (or is not ready to
          send it) can build it from the same chips as every other production
          surface instead. */}
      {showHelp && isHintRevealed && hintBank.length > 0 && (
        <div data-testid="word-bank" dir="ltr" className="mb-2">
          <span className="kz-ar-micro mb-1 block text-kz-inkFaint">بنك الكلمات — اضغط لتضيف الكلمة</span>
          <div className="flex flex-wrap gap-1.5">
            {hintBank.map((word, wordIndex) => (
              <button
                key={`${word}-${wordIndex}`}
                type="button"
                onClick={() => onPickHintWord(word)}
                className="rounded-xl kz-chip border border-white/10 bg-white/5 px-2.5 py-1 font-german text-sm text-kz-ink transition-colors hover:border-primary/50"
              >
                {word}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mic / STT error banner */}
      {micError && (
        <div className="kz-ar-micro mb-2 flex items-start gap-2 rounded-xl border border-status-learning/40 bg-white/5 p-2.5 text-status-learning">
          <MicOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{micError}</span>
          <button
            onClick={onDismissError}
            aria-label="إخفاء"
            className="min-h-[32px] min-w-[32px] text-kz-inkFaint hover:text-kz-ink"
          >
            ✕
          </button>
        </div>
      )}

      {/* The orb owns the microphone; the status line beside it is the only place
          the app says what the microphone is doing. It is a compact row now — the
          voice control no longer eats a third of the screen. */}
      <div className="flex items-center gap-3">
        <KatzuOrb
          state={orbState}
          readLevel={orbReadLevel}
          tone={orbTone}
          size={orbSize}
          onPress={onOrbPress}
          disabled={orbDisabled}
          labelAr={orbLabelAr}
        />
        <div className="min-w-0 flex-1">
          <span
            className={`kz-ar-caption block transition-opacity ${
              isRecording ? 'text-kz-lavender opacity-100' : 'text-kz-inkFaint opacity-80'
            }`}
          >
            {conversationStatusLabelAr}
          </span>

          {/* Live captions while the learner speaks. The platform recogniser returns
              words as they are said, so the learner can see their own German land —
              which is the difference between dictating and being transcribed after
              the fact. It renders only when there is something to show. */}
          {isRecording && interimText && (
            <div
              data-testid="live-caption"
              className="mt-1 flex items-center gap-2 rounded-xl border border-kz-lavender/25 bg-kz-lavender/10 px-2.5 py-1.5"
            >
              <span className="kz-ar-micro shrink-0 font-semibold text-kz-lavender">أسمع</span>
              <span dir="ltr" className="min-w-0 flex-1 truncate font-german text-sm text-kz-ink">
                {interimText}
              </span>
            </div>
          )}
        </div>
      </div>
    </FloatingControl>
  );
};

export interface ConversationComposerProps {
  /** Live element for the composer input (owned by the parent). */
  inputRef: React.Ref<HTMLInputElement>;
  inputText: string;
  isGenerating: boolean;
  isRecording: boolean;
  onInputTextChange: (value: string) => void;
  onInputKeyDown: (key: string) => void;
  onSend: () => void;
  onTypeInstead: () => void;
}

/**
 * The typed composer: one thumb-reachable row at the bottom, and nothing else.
 *
 * It keeps the `conversation-dock` test id because it is the bottom boundary the
 * transcript's layout tests measure against — a message must still end above it.
 */
export const ConversationComposer: React.FC<ConversationComposerProps> = ({
  inputRef,
  inputText,
  isGenerating,
  isRecording,
  onInputTextChange,
  onInputKeyDown,
  onSend,
  onTypeInstead,
}) => {
  return (
    <FloatingControl
      data-testid="conversation-dock"
      className="shrink-0 rounded-b-none rounded-t-[26px] border-t border-white/[0.08] px-4 pt-2.5"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          dir="ltr"
          placeholder={isRecording ? 'أنا أستمع إليك…' : 'اكتب جملتك بالألمانية…'}
          value={inputText}
          onChange={(e) => onInputTextChange(e.target.value)}
          onKeyDown={(e) => onInputKeyDown(e.key)}
          className="h-10 min-w-0 flex-1 rounded-2xl kz-chip border border-white/10 bg-white/5 px-4 font-german text-sm transition-colors placeholder:font-arabic placeholder:text-xs placeholder:text-kz-inkFaint focus:border-primary/60"
        />

        {/* Typing is always one tap away — and it is a control inside the row,
            not a third line of copy under it. */}
        <button
          onClick={onTypeInstead}
          aria-label="اكتب بدلاً من التحدث"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl kz-chip border border-white/10 bg-white/5 text-kz-inkDim transition-colors hover:text-kz-ink"
        >
          <Keyboard className="h-4 w-4" />
        </button>

        <Button
          size="md"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl p-0"
          disabled={!inputText.trim() || isGenerating}
          onClick={onSend}
          aria-label="أرسل جملتك"
        >
          <Send className="h-5 w-5 rotate-180" aria-hidden />
        </Button>
      </div>
    </FloatingControl>
  );
};
