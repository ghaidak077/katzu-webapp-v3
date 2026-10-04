import React, { useMemo } from 'react';
import { Languages, RefreshCw, Snail, Volume2 } from 'lucide-react';
import { GermanText } from '@/components/common/GermanText';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { activeWordIndex, speechSegments } from '@/lib/speech/wordHighlight';
import type { ChatMessage } from '@/types/models';

/**
 * One message in the live transcript, memoised.
 *
 * WHY IT IS ITS OWN COMPONENT
 * The screen holds the learner's draft sentence in state, so every keystroke
 * re-rendered the whole transcript — and a transcript is the most expensive thing
 * on the screen: each bubble splits its German into clickable words, measures
 * nothing, and re-runs its own translation logic. Typing a twelve-word sentence
 * did that twelve times over for every message on screen. With `React.memo` a
 * keystroke now costs one render (the composer) instead of N.
 *
 * THE REDESIGN (V40)
 * The bubble is the hero of the conversation, so it now reads like one: Katzu's
 * messages sit beside a 32px avatar, the German is a real body size (17px,
 * `kz-de-message`) in an isolated LTR block, and the Arabic is a quiet chip below
 * the sentence instead of a wall of always-on Arabic. The correction is a single
 * inline card with a left accent bar, not a nested bordered panel.
 */

export interface ConversationMessageProps {
  message: ChatMessage;
  /** Whether this bubble's Arabic is showing. */
  isTranslationVisible: boolean;
  /**
   * Words the app actually has an entry for. Used only to decide how strongly a
   * word advertises its tappability — every word opens the insight sheet, because
   * an unknown word is exactly the one a struggling learner taps.
   */
  knownWords: Set<string>;
  onToggleTranslation: (messageId: string) => void;
  onRetryTranslation: (messageId: string, germanText: string) => void;
  onSpeak: (message: ChatMessage) => void;
  /** Speaks the sentence slowly — the replay a learner reaches for after missing it. */
  onSlowSpeak?: (message: ChatMessage) => void;
  onWordClick: (word: string) => void;
  /**
   * V28 Stage 1D: whether the study aids render — the Arabic translation, the
   * live correction card, and the follow-up nudge. REAL mode turns this off so
   * the transcript is the German conversation and nothing else.
   */
  showHelp?: boolean;
  /**
   * The character position the speech engine last reported, for **this** bubble,
   * or null, so a transcript with one speaker highlights in exactly one place.
   */
  spokenCharIndex?: number | null;
  /** True while this bubble is the one being spoken — the avatar glows. */
  isSpeaking?: boolean;
  /**
   * The correction carried by the reply to this learner message, if any. It is
   * rendered under the learner's own bubble (feedback belongs to what they said),
   * even though the data rides the reply the worker produced.
   */
  correctionMessage?: ChatMessage;
}

const normalize = (value: string) => value.replace(/[^a-zA-ZäöüÄÖÜß]/g, '').toLowerCase();

const ConversationMessageBase: React.FC<ConversationMessageProps> = ({
  message,
  isTranslationVisible,
  knownWords,
  onToggleTranslation,
  onRetryTranslation,
  onSpeak,
  onSlowSpeak,
  onWordClick,
  showHelp = true,
  spokenCharIndex = null,
  isSpeaking = false,
  correctionMessage,
}) => {
  const isKatzu = message.sender === 'KATZU';

  // Split once per message, not once per render: the segments are the sentence
  // character for character (`wordHighlight`), which is what lets the speech
  // engine's own character index find the right word.
  const segments = useMemo(() => speechSegments(message.germanText), [message.germanText]);
  const spokenWord = activeWordIndex(segments, spokenCharIndex);

  // The correction accent. `success` when Katzu had something positive to say,
  // otherwise the learning amber — the same two roles the palette already names.
  const correctionAccent = correctionMessage?.originalMistake ? 'learning' : 'success';

  return (
    <article
      aria-label={isKatzu ? 'رسالة من كَاتْزُو' : 'رسالتك'}
      className={`kz-message-in flex items-end gap-2 ${isKatzu ? 'justify-start' : 'justify-end'}`}
    >
      {isKatzu && (
        <span
          aria-hidden
          className={`relative mb-1 shrink-0 rounded-full transition-shadow duration-fast ${
            isSpeaking ? 'ring-2 ring-kz-lavender/60 shadow-glow-purple' : ''
          }`}
        >
          <KatzuMascot name="avatar" alt="" className="h-8 w-8 rounded-full" />
        </span>
      )}

      <div className="min-w-0 max-w-[82%]">
        <div
          className={
            isKatzu
              ? 'kz-surface rounded-control rounded-ss-tag px-4 py-3'
              : 'rounded-control rounded-se-tag bg-gradient-to-br from-fill to-fill-pressed px-4 py-3 text-on-fill'
          }
          data-tier={isKatzu ? 'canvas' : undefined}
        >
          {/* German stays in one direction-isolated LTR block: the page is RTL, and
              without isolation the punctuation of a German sentence moves. */}
          <div
            dir="ltr"
            style={{ unicodeBidi: 'isolate' }}
            className={`kz-de-message text-start ${isKatzu ? 'text-kz-ink' : 'text-white'}`}
          >
            {segments.map((segment, index) => {
              if (segment.wordIndex === null) return <React.Fragment key={`gap-${index}`}>{segment.text}</React.Fragment>;
              const key = normalize(segment.text);
              const isKnown = key.length > 1 && knownWords.has(key);
              const isSpoken = segment.wordIndex === spokenWord;
              return (
                <span
                  key={`${key}-${index}`}
                  onClick={key ? () => onWordClick(segment.text) : undefined}
                  aria-current={isSpoken ? 'true' : undefined}
                  className={[
                    'rounded-tag transition-colors duration-fast',
                    key ? 'cursor-pointer active:underline active:decoration-dotted' : '',
                    isKnown ? 'pointer-hover:underline pointer-hover:decoration-dotted' : '',
                    // The word Katzu is saying right now. A background, not a
                    // colour change: German stays legible either way.
                    isSpoken ? 'bg-kz-lavender/25 text-kz-ink shadow-[0_0_0_3px_rgba(180,160,255,0.12)]' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {segment.text}
                </span>
              );
            })}
          </div>

          {isKatzu && (
            <div className="mt-2 flex items-center justify-between gap-2">
              {showHelp && message.arabicTranslation ? (
                <button
                  type="button"
                  onClick={() => onToggleTranslation(message.id)}
                  aria-label={isTranslationVisible ? 'إخفاء الترجمة' : 'عرض الترجمة'}
                  className={`kz-ar-micro flex h-9 items-center gap-1 rounded-full px-2 transition-colors ${
                    isTranslationVisible ? 'text-kz-inkDim' : 'text-kz-inkFaint'
                  } pointer-hover:text-kz-ink`}
                >
                  <Languages className="h-3.5 w-3.5" />
                  ترجمة
                </button>
              ) : showHelp && message.translationState === 'pending' ? (
                <span className="kz-ar-micro flex items-center gap-1 text-kz-inkFaint">
                  <Languages className="h-3.5 w-3.5 animate-pulse" />
                  جارٍ الترجمة…
                </span>
              ) : showHelp && message.translationState === 'unavailable' ? (
                <button
                  type="button"
                  onClick={() => onRetryTranslation(message.id, message.germanText)}
                  className="kz-ar-micro flex h-9 items-center gap-1 text-status-learning transition-colors pointer-hover:text-status-learning/80"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  تعذرت الترجمة — أعد المحاولة
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSpeak(message)}
                  aria-label="اسمع الجملة بالألمانية"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-kz-lavender/80 transition-colors pointer-hover:bg-white/10 pointer-hover:text-kz-lavender"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
                {onSlowSpeak && (
                  <button
                    type="button"
                    onClick={() => onSlowSpeak(message)}
                    aria-label="اسمع ببطء"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-kz-lavender/60 transition-colors pointer-hover:bg-white/10 pointer-hover:text-kz-lavender"
                  >
                    <Snail className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* The Arabic, collapsed by default (unless the global toggle is on). A
              height animation, not a divider: the bubble grows to make room. */}
          {showHelp && isKatzu && message.arabicTranslation && (
            <div className="kz-translation mt-0" data-open={isTranslationVisible || undefined}>
              <p dir="rtl" className="min-h-0 pt-2 kz-ar-caption leading-relaxed text-kz-inkDim">
                {message.arabicTranslation}
              </p>
            </div>
          )}

          {/* Katzu's nudge towards the learner's next move. */}
          {showHelp && isKatzu && message.followupAr && (
            <p className="kz-ar-micro mt-2 flex items-start gap-1.5 text-kz-lavender/85">
              <span aria-hidden>💬</span>
              <span className="min-w-0">{message.followupAr}</span>
            </p>
          )}
        </div>

        {/* The correction card: one inline block with a left accent bar, under the
            learner's own bubble. Feedback is what the learner came for, so it stays
            visible — but it reads as a note, not a second conversation. */}
        {showHelp && correctionMessage && (
          <div
            className={`mt-2 overflow-hidden rounded-control border-s-2 bg-surface-subtle ps-3 pe-3.5 py-3 text-start ${
              correctionAccent === 'success' ? 'border-status-success' : 'border-status-learning'
            }`}
          >
            <div className="flex items-center gap-2">
              <KatzuMascot name="avatar" alt="" className="h-5 w-5" />
              <span
                className={`kz-ar-micro font-bold ${
                  correctionAccent === 'success' ? 'text-status-success' : 'text-status-learning'
                }`}
              >
                تصحيح كَاتْزُو
              </span>
            </div>

            <div className="mt-2 space-y-2">
              {(correctionMessage.originalMistake || correctionMessage.correctedGerman) && (
                <div className="space-y-1">
                  {correctionMessage.originalMistake && (
                    <div className="flex items-baseline gap-2">
                      <span className="kz-ar-micro shrink-0 text-kz-inkFaint">قلت</span>
                      <GermanText className="text-status-error/80 line-through decoration-status-error/60">
                        {correctionMessage.originalMistake}
                      </GermanText>
                    </div>
                  )}
                  {correctionMessage.correctedGerman && (
                    <div className="flex items-baseline gap-2">
                      <span className="kz-ar-micro shrink-0 text-kz-inkFaint">الصحيح</span>
                      <GermanText className="font-bold text-status-success">{correctionMessage.correctedGerman}</GermanText>
                    </div>
                  )}
                </div>
              )}

              {correctionMessage.grammarRule && (
                <bdi
                  dir="auto"
                  className="kz-ar-micro inline-flex items-center gap-1.5 rounded-full border border-status-learning/25 bg-status-learning/10 px-2.5 py-1 text-status-learning"
                >
                  <span aria-hidden>📌</span>
                  {correctionMessage.grammarRule}
                </bdi>
              )}

              {correctionMessage.grammarReference && correctionMessage.grammarReference.id === correctionMessage.grammarId && (
                <div className="rounded-xl border border-kz-lavender/20 bg-kz-lavender/5 p-2.5">
                  <span className="kz-ar-micro block text-kz-inkFaint">من قاعدة التدريب الموجّه</span>
                  <p className="mt-1 kz-ar-micro font-semibold text-kz-lavender">{correctionMessage.grammarReference.titleAr}</p>
                  <p className="mt-1 kz-ar-micro leading-relaxed text-kz-inkDim">{correctionMessage.grammarReference.ruleAr}</p>
                  <GermanText className="mt-1 font-german text-xs text-kz-inkDim">{correctionMessage.grammarReference.exampleDe}</GermanText>
                </div>
              )}

              {correctionMessage.explanationAr && (
                <p className="kz-ar-micro leading-relaxed text-kz-inkDim">{correctionMessage.explanationAr}</p>
              )}

              {correctionMessage.positiveNoteAr && (
                <p className="kz-ar-micro font-semibold text-status-success">✦ {correctionMessage.positiveNoteAr}</p>
              )}

              {correctionMessage.roastComment && (
                <p className="kz-ar-micro border-s-2 border-status-learning/40 ps-2.5 italic text-status-learning/90">
                  «{correctionMessage.roastComment}»
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
};

export const ConversationMessage = React.memo(ConversationMessageBase);
export default ConversationMessage;
