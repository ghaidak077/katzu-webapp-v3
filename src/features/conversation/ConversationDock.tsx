import React from 'react';
import { ChevronDown, ChevronUp, Lightbulb, MicOff, RefreshCw, Send, X } from 'lucide-react';
import { HintOption } from '@/components/common/HintOption';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FloatingControl } from '@/components/glass/GlassCard';
import { KatzuOrb, type OrbState } from '@/components/voice/KatzuOrb';
import type { MicSample } from '@/lib/audio/useMicLevel';
import type { ContextualHint } from '@/types/models';

/**
 * The conversation's bottom bar (V40).
 *
 * One rounded container pinned to the bottom edge, holding the three things a
 * thumb reaches for: the hint button, the sentence field, and the action button.
 * The orb — the microphone — IS the action button, so the idle screen has no
 * large bordered card wrapping a control that does nothing, and no message can
 * ever sit under the microphone because it lives in the input row.
 *
 * The hint suggestions moved into a bottom sheet behind the lightbulb so the
 * chat is not crowded by an always-visible suggestion panel; the word bank and
 * the refresh/hide controls travel with them. Every value still arrives as a
 * prop and the behaviour is unchanged.
 */

export interface ConversationDockProps {
  /** V28 Stage 1D: whether the hint affordance renders (REAL mode passes false). */
  showHelp: boolean;
  visibleHints: ContextualHint[];
  isHintRevealed: boolean;
  isHintExpanded: boolean;
  isRefreshingHints: boolean;
  /** V31: today's AI hint budget is spent. */
  hintQuotaSpent?: boolean;
  micError: string | null;
  orbState: OrbState;
  orbTone: 'lavender' | 'earned';
  orbLabelAr: string;
  orbReadLevel: () => MicSample;
  orbDisabled: boolean;
  isRecording: boolean;
  /** Katzu is speaking: the microphone dims so it does not compete with the voice. */
  isCoachSpeaking?: boolean;
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
  /** Live element for the sentence field (owned by the parent). */
  inputRef: React.Ref<HTMLTextAreaElement>;
  inputText: string;
  isGenerating: boolean;
  onInputTextChange: (value: string) => void;
  onInputKeyDown: (key: string) => void;
  onSend: () => void;
}

export const ConversationDock: React.FC<ConversationDockProps> = ({
  showHelp,
  visibleHints,
  isHintRevealed,
  isHintExpanded,
  isRefreshingHints,
  hintQuotaSpent,
  micError,
  orbState,
  orbTone,
  orbLabelAr,
  orbReadLevel,
  orbDisabled,
  isRecording,
  isCoachSpeaking = false,
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
  inputRef,
  inputText,
  isGenerating,
  onInputTextChange,
  onInputKeyDown,
  onSend,
}) => {
  const hasText = inputText.trim().length > 0;
  const hintsAvailable = showHelp && visibleHints.length > 0;
  // The orb is "working" for the whole turn it is not the learner's: recognising
  // their words, evaluating them, or composing the reply.
  const isProcessing = orbState === 'transcribing' || orbState === 'evaluating' || orbState === 'replying';

  return (
    <>
      <FloatingControl
      data-testid="conversation-dock"
      className="shrink-0 rounded-b-none rounded-t-sheet border-t border-white/[0.06] px-3 pt-2"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      {/* Mic / STT error banner — stated where the microphone is. */}
      {micError && (
        <div className="kz-ar-micro mb-2 flex items-start gap-2 rounded-xl border border-status-learning/40 bg-white/5 p-2.5 text-status-learning">
          <MicOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1" role="alert">
            {micError}
          </span>
          <button
            onClick={onDismissError}
            aria-label="إخفاء"
            className="flex min-h-touch min-w-touch items-center justify-center text-kz-inkFaint pointer-hover:text-kz-ink"
          >
            ✕
          </button>
        </div>
      )}

      {/* The learner's own German while they are still speaking: the live transcript,
          grey and italic, right where the final sentence will land. */}
      {isRecording && interimText && (
        <div data-testid="live-caption" className="mb-1.5 flex items-center gap-2 px-1">
          <span className="kz-ar-micro shrink-0 font-semibold text-kz-lavender">أسمع</span>
          <span dir="ltr" className="min-w-0 flex-1 truncate font-german text-base italic text-kz-inkDim">
            {interimText}
          </span>
        </div>
      )}

      {/* The one rounded container: hint · field · action. */}
      <div className="flex items-end gap-2 rounded-sheet border border-white/[0.06] bg-surface-hero px-2 py-1.5">
        {showHelp && (
          <button
            type="button"
            onClick={onRevealHint}
            aria-label="اقتراح لردّك"
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full kz-chip border border-white/10 bg-white/5 text-kz-lavender transition-colors pointer-hover:bg-white/10"
          >
            <Lightbulb className="h-5 w-5" />
            {hintsAvailable && !isHintRevealed && (
              <span
                aria-hidden
                className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-kz-lavender ring-2 ring-surface-hero"
              />
            )}
          </button>
        )}

        <textarea
          ref={inputRef}
          rows={1}
          dir="ltr"
          aria-label="اكتب جملتك بالألمانية"
          placeholder="Schreib deinen Satz…"
          value={inputText}
          onChange={(e) => onInputTextChange(e.target.value)}
          onKeyDown={(e) => onInputKeyDown(e.key)}
          style={{ fieldSizing: 'content' } as React.CSSProperties}
          className="max-h-24 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-3 font-german text-base leading-tight text-kz-ink placeholder:font-arabic placeholder:text-sm placeholder:text-kz-inkFaint"
        />

        {/* Dynamic action button: the orb while the field is empty, the send plane
            the moment there is something to send. Cross-faded, one tap target. */}
        <div className="relative h-14 w-14 shrink-0">
          <div
            className={`absolute inset-0 transition-opacity duration-fast ${
              hasText ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
          >
            <div
              className={`relative h-14 w-14 transition-opacity duration-fast ${
                isCoachSpeaking ? 'opacity-60' : ''
              }`}
            >
              {/* The breath belongs to a decorative layer behind the control, never
                  to the button itself: a hit target that scales forever is both
                  hard to tap and impossible to drive in a test. */}
              {orbState === 'idle' && (
                <span aria-hidden className="kz-orb-glow kz-animated pointer-events-none absolute inset-0 rounded-full" />
              )}
              {isProcessing && (
                <span aria-hidden className="kz-animated kz-orb-ring pointer-events-none absolute inset-0 rounded-full" />
              )}
              <KatzuOrb
                state={orbState}
                readLevel={orbReadLevel}
                tone={orbTone}
                size={56}
                onPress={onOrbPress}
                disabled={orbDisabled || hasText}
                labelAr={orbLabelAr}
              />
            </div>
          </div>
          <div
            className={`absolute inset-0 transition-opacity duration-fast ${
              hasText ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <button
              type="button"
              onClick={onSend}
              disabled={isGenerating || !hasText}
              aria-label="أرسل جملتك"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-fill to-fill-pressed text-on-fill shadow-glow-purple transition-colors disabled:opacity-60"
            >
              <Send className="h-5 w-5 rotate-180" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </FloatingControl>

      {/* Suggestions, the word bank and the quota note — one bottom sheet behind
          the lightbulb. It is a SIBLING of the dock, not a child: the dock's
          glass surface carries `backdrop-filter`, which makes it the containing
          block for a `position: fixed` descendant — nesting the sheet would trap
          it inside the dock's box instead of overlaying the screen. `conversation-controls` keeps the container the AI-economy
          tests address the suggestion buttons through. */}
      <BottomSheet isOpen={isHintRevealed} onClose={onHideHint} title="اقتراح لردّك">
        <div data-testid="conversation-controls">
          {visibleHints.length > 0 ? (
            <div className="space-y-1.5">
              <HintOption
                hint={visibleHints[0]}
                onUse={() => {
                  onHideHint();
                  onUseHint(visibleHints[0]);
                }}
                primary
              />
              {visibleHints.length > 1 && (
                <>
                  <button
                    onClick={onToggleHintExpanded}
                    className="kz-ar-micro flex min-h-touch w-full items-center justify-between rounded-xl kz-chip border border-white/10 bg-white/5 px-3 py-2 font-semibold text-kz-inkDim transition-colors pointer-hover:text-primary"
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
                      <HintOption
                        key={hIdx}
                        hint={hint}
                        onUse={() => {
                          onHideHint();
                          onUseHint(hint);
                        }}
                      />
                    ))}
                </>
              )}
            </div>
          ) : (
            <p className="kz-ar-micro text-kz-inkFaint">لا توجد اقتراحات لهذه اللحظة.</p>
          )}

          {hintQuotaSpent && (
            <p className="kz-ar-micro mt-3 text-kz-inkFaint" role="status">
              استهلكت اقتراحات اليوم. هذه عبارات من الموقف نفسه، وتتجدد غداً.
            </p>
          )}

          {/* The words of the offered reply, so a learner who is not ready to send
              the canned sentence can build their own from the same chips. */}
          {isHintRevealed && hintBank.length > 0 && (
            <div data-testid="word-bank" dir="ltr" className="mt-3">
              <span className="kz-ar-micro mb-1 block text-kz-inkFaint">
                هذه كلمات الجملة بالترتيب — اضغط لتبني جملتك بنفسك
              </span>
              <div className="flex flex-wrap gap-1.5">
                {hintBank.map((word, wordIndex) => (
                  <button
                    key={`${word}-${wordIndex}`}
                    type="button"
                    onClick={() => onPickHintWord(word)}
                    className="rounded-xl kz-chip border border-white/10 bg-white/5 px-2.5 py-1 font-german text-sm text-kz-ink transition-colors pointer-hover:border-primary/50"
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              onClick={onRefreshHints}
              disabled={hintQuotaSpent}
              className="kz-ar-micro flex min-h-touch items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-kz-inkDim transition-colors pointer-hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingHints ? 'kz-animated animate-spin' : ''}`} />
              تحديث الاقتراحات
            </button>
            <button
              onClick={onHideHint}
              aria-label="إخفاء الاقتراح"
              className="flex min-h-touch min-w-touch items-center justify-center rounded-full text-kz-inkDim transition-colors pointer-hover:text-kz-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
};
