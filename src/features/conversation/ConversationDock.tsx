import React from 'react';
import { ChevronDown, ChevronUp, Keyboard, Lightbulb, MicOff, RefreshCw, Send } from 'lucide-react';
import { HintOption } from '@/components/common/HintOption';
import { Button } from '@/components/ui/Button';
import { KatzuOrb, type OrbState } from '@/components/voice/KatzuOrb';
import type { MicSample } from '@/lib/audio/useMicLevel';
import type { ContextualHint } from '@/types/models';

/**
 * The bottom dock of the live conversation (B4d mechanical split).
 *
 * Extracted verbatim from `LiveConversationScreen`'s JSX: the on-demand hint pill
 * and its expanded options, the microphone error banner, the orb with its state
 * label, the live caption, and the typed-composer row. Zero behaviour change:
 * every value arrives as a prop, every class name and aria label is byte-identical
 * to what the screen rendered before, and the input ref stays parent-owned so the
 * screen's focus calls (`handleTypeInstead`, transcript arrival, hint use) keep
 * landing on the same element.
 */

export interface ConversationDockProps {
  /** Live element for the composer input (owned by the parent). */
  inputRef: React.Ref<HTMLInputElement>;
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
  isVoiceSupported: boolean;
  conversationStatusLabelAr: string;
  interimText: string;
  inputText: string;
  isGenerating: boolean;
  onInputTextChange: (value: string) => void;
  onInputKeyDown: (key: string) => void;
  onSend: () => void;
  onTypeInstead: () => void;
  onOrbPress: () => void;
  onRevealHint: () => void;
  onHideHint: () => void;
  onToggleHintExpanded: () => void;
  onRefreshHints: () => void;
  onUseHint: (hint: ContextualHint) => void;
  onDismissError: () => void;
}

export const ConversationDock: React.FC<ConversationDockProps> = ({
  inputRef,
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
  isVoiceSupported,
  conversationStatusLabelAr,
  interimText,
  inputText,
  isGenerating,
  onInputTextChange,
  onInputKeyDown,
  onSend,
  onTypeInstead,
  onOrbPress,
  onRevealHint,
  onHideHint,
  onToggleHintExpanded,
  onRefreshHints,
  onUseHint,
  onDismissError,
}) => {
  return (
    <div
      data-testid="conversation-dock"
      className="shrink-0 border-t border-white/[0.06] bg-black/85 px-4 pt-2.5 backdrop-blur-xl"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {/* Hints as an on-demand button: a single 💡 pill that reveals the one
          context-aware suggestion when tapped — no always-visible strip
          competing with the chat. */}
      {visibleHints.length > 0 && !isHintRevealed && (
        <button
          onClick={onRevealHint}
          className="kz-ar-micro mb-2 flex items-center gap-1.5 rounded-full border border-primary/30 bg-white/5 px-3 py-1.5 font-semibold text-primary transition-colors hover:border-primary/60"
        >
          <Lightbulb className="h-3.5 w-3.5" />
          اقتراح لردّك
        </button>
      )}

      {visibleHints.length > 0 && isHintRevealed && (
        <div className="mb-2 flex items-start gap-1.5">
          <div className="max-h-[26vh] min-w-0 flex-1 space-y-1.5 overflow-y-auto">
            <HintOption hint={visibleHints[0]} onUse={() => onUseHint(visibleHints[0])} primary />
            {visibleHints.length > 1 && (
              <>
                <button
                  onClick={onToggleHintExpanded}
                  className="kz-ar-micro flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-kz-inkDim transition-colors hover:text-primary"
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
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-kz-inkDim transition-colors hover:text-primary"
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

      {/* The orb owns the microphone, and the label under it is the only place
          the app says what the microphone is doing. */}
      <div className="flex flex-col items-center">
        <KatzuOrb
          state={orbState}
          readLevel={orbReadLevel}
          tone={orbTone}
          size={orbSize}
          onPress={onOrbPress}
          disabled={orbDisabled}
          labelAr={orbLabelAr}
        />
        <span
          className={`kz-ar-micro h-4 transition-opacity ${
            isRecording ? 'text-kz-lavender opacity-100' : 'text-kz-inkFaint opacity-70'
          }`}
        >
          {conversationStatusLabelAr}
        </span>
      </div>

      {/* Live captions while the learner speaks. The platform recogniser returns
          words as they are said, so the learner can see their own German land —
          which is the difference between dictating and being transcribed after
          the fact. It renders only when there is something to show (the recorder
          fallback cannot know the words until the recording ends), so nothing
          here can announce a caption that is not coming. */}
      {isRecording && interimText && (
        <div
          data-testid="live-caption"
          className="mt-2 flex items-center gap-2 rounded-xl border border-kz-lavender/25 bg-kz-lavender/10 px-3 py-2"
        >
          <span className="kz-ar-micro shrink-0 font-semibold text-kz-lavender">أسمع</span>
          <span dir="ltr" className="min-w-0 flex-1 truncate font-german text-sm text-kz-ink">
            {interimText}
          </span>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          dir="ltr"
          placeholder={isRecording ? 'أنا أستمع إليك…' : 'اكتب جملتك بالألمانية…'}
          value={inputText}
          onChange={(e) => onInputTextChange(e.target.value)}
          onKeyDown={(e) => onInputKeyDown(e.key)}
          className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 font-german text-sm outline-none transition-colors placeholder:font-arabic placeholder:text-xs placeholder:text-kz-inkFaint focus:border-primary/60"
        />

        {/* Typing is always one tap away — and it is a control inside the row,
            not a third line of copy under it. */}
        <button
          onClick={onTypeInstead}
          aria-label="اكتب بدلاً من التحدث"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-kz-inkDim transition-colors hover:text-kz-ink"
        >
          <Keyboard className="h-4 w-4" />
        </button>

        <Button
          size="md"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl p-0"
          disabled={!inputText.trim() || isGenerating}
          onClick={onSend}
          aria-label="أرسل جملتك"
        >
          <Send className="h-5 w-5 rotate-180" aria-hidden />
        </Button>
      </div>
    </div>
  );
};
