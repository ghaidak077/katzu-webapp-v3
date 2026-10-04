import React, { useMemo } from 'react';
import { Languages, RefreshCw, Volume2 } from 'lucide-react';
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
 * keystroke now costs one render (the composer) instead of N, and the only props
 * that can change are the ones that genuinely change a bubble's appearance.
 *
 * WHAT A BUBBLE HAS TO SAY, IN ORDER
 * the German sentence (never re-ordered by the RTL page: it is isolated), a
 * quiet toolbar to hear it and to reveal the Arabic, the Arabic itself, and the
 * one-line Arabic nudge towards what to say next. The correction is deliberately
 * NOT inside the bubble: feedback is what the learner came for, and it reads as a
 * separate card rather than as part of what Katzu said.
 */

export interface ConversationMessageProps {
  message: ChatMessage;
  /** Whether this bubble's Arabic is showing. */
  isTranslationVisible: boolean;
  /**
   * Words the app actually has an entry for. Only these are tappable, so the
   * transcript stops advertising a gesture that does nothing on most words.
   */
  knownWords: Set<string>;
  onToggleTranslation: (messageId: string) => void;
  onRetryTranslation: (messageId: string, germanText: string) => void;
  onSpeak: (message: ChatMessage) => void;
  onWordClick: (word: string) => void;
  /**
   * V28 Stage 1D: whether the study aids render — the Arabic translation, the
   * live correction card, and the follow-up nudge. REAL mode turns this off so
   * the transcript is the German conversation and nothing else; the corrections
   * are still recorded and shown in the end-of-session report. The German itself
   * and its pronunciation always stay.
   */
  showHelp?: boolean;
  /**
   * The character position the speech engine last reported, for **this** bubble,
   * or null. Null for every bubble that is not the one being spoken, so a
   * transcript with one speaker highlights in exactly one place.
   */
  spokenCharIndex?: number | null;
}

const normalize = (value: string) => value.replace(/[^a-zA-ZäöüÄÖÜß]/g, '').toLowerCase();

const ConversationMessageBase: React.FC<ConversationMessageProps> = ({
  message,
  isTranslationVisible,
  knownWords,
  onToggleTranslation,
  onRetryTranslation,
  onSpeak,
  onWordClick,
  showHelp = true,
  spokenCharIndex = null,
}) => {
  const isKatzu = message.sender === 'KATZU';

  // Split once per message, not once per render: the segments are the sentence
  // character for character (see `wordHighlight`), which is what lets the speech
  // engine's own character index find the right word.
  const segments = useMemo(() => speechSegments(message.germanText), [message.germanText]);
  const spokenWord = activeWordIndex(segments, spokenCharIndex);

  return (
    <article
      aria-label={isKatzu ? 'رسالة من كَاتْزُو' : 'رسالتك'}
      className={`flex ${isKatzu ? 'justify-start' : 'justify-end'}`}
    >
      <div className="max-w-[88%] min-w-0">
        <div
          className={
            isKatzu
              ? 'kz-surface rounded-panel rounded-ss-tag px-4 py-3.5'
              : 'rounded-panel rounded-se-tag bg-gradient-to-br from-fill to-fill-pressed px-4 py-3.5 text-on-fill shadow-glow-purple'
          }
          data-tier={isKatzu ? 'canvas' : undefined}
        >
          {/* German stays in one direction-isolated LTR block: the page is RTL, and
              without isolation the punctuation of a German sentence moves. */}
          <div
            dir="ltr"
            style={{ unicodeBidi: 'isolate' }}
            className={`font-german text-body font-semibold leading-relaxed ${
              isKatzu ? 'text-kz-ink' : 'text-white'
            }`}
          >
            {segments.map((segment, index) => {
              if (segment.wordIndex === null) return <React.Fragment key={`gap-${index}`}>{segment.text}</React.Fragment>;
              const key = normalize(segment.text);
              const isKnown = key.length > 1 && knownWords.has(key);
              const isSpoken = segment.wordIndex === spokenWord;
              return (
                <React.Fragment key={`${key}-${index}`}>
                  <span
                    onClick={isKnown ? () => onWordClick(segment.text) : undefined}
                    aria-current={isSpoken ? 'true' : undefined}
                    className={[
                      'rounded-tag transition-colors duration-fast',
                      // The word Katzu is saying right now. It is a reading aid, so
                      // it is a background, not a colour change: German stays
                      // legible whether or not the highlight is on.
                      isSpoken ? 'bg-kz-lavender/25 text-kz-ink shadow-[0_0_0_3px_rgba(180,160,255,0.12)]' : '',
                      !isSpoken && isKnown
                        ? 'cursor-pointer underline decoration-dotted decoration-1 underline-offset-[3px] pointer-hover:bg-white/10'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {segment.text}
                  </span>
                </React.Fragment>
              );
            })}
          </div>

          {isKatzu && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/8 pt-1.5">
              <button
                type="button"
                onClick={() => onSpeak(message)}
                aria-label="اسمع الجملة بالألمانية"
                className="flex h-11 w-11 items-center justify-center rounded-full text-kz-lavender transition-colors pointer-hover:bg-white/10"
              >
                <Volume2 className="h-4 w-4" />
              </button>

              {showHelp ? (
                message.arabicTranslation ? (
                  <button
                    type="button"
                    onClick={() => onToggleTranslation(message.id)}
                    aria-label={isTranslationVisible ? 'إخفاء الترجمة' : 'عرض الترجمة'}
                    className="kz-ar-micro flex min-h-[44px] items-center gap-1 rounded-full px-2 py-1 text-kz-inkFaint transition-colors pointer-hover:text-kz-ink"
                  >
                    <Languages className="h-3.5 w-3.5" />
                    {isTranslationVisible ? 'إخفاء الترجمة' : 'عرض الترجمة'}
                  </button>
                ) : message.translationState === 'pending' ? (
                  <span className="kz-ar-micro flex items-center gap-1 text-kz-inkFaint">
                    <Languages className="h-3.5 w-3.5 animate-pulse" />
                    جارٍ الترجمة…
                  </span>
                ) : message.translationState === 'unavailable' ? (
                  <button
                    type="button"
                    onClick={() => onRetryTranslation(message.id, message.germanText)}
                    className="kz-ar-micro flex items-center gap-1 text-status-learning transition-colors pointer-hover:text-status-learning/80"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    تعذرت الترجمة — أعد المحاولة
                  </button>
                ) : null
              ) : null}
            </div>
          )}

          {showHelp && isTranslationVisible && message.arabicTranslation && (
            <p className="kz-ar-caption mt-2 border-t border-white/8 pt-2 leading-relaxed text-kz-inkDim">
              {message.arabicTranslation}
            </p>
          )}

          {/* Katzu's nudge towards the learner's next move. It is advice, so it
              reads as a caption rather than as a second message. */}
          {showHelp && isKatzu && message.followupAr && (
            <p className="kz-ar-micro mt-2 flex items-start gap-1.5 text-kz-lavender/85">
              <span aria-hidden>💬</span>
              <span className="min-w-0">{message.followupAr}</span>
            </p>
          )}
        </div>

        {/* The correction card. Two things matter: the learner must tell the wrong
            line from the right one at a glance, and any German or English inside
            this Arabic card has to be direction-isolated or its punctuation
            reorders itself. */}
        {showHelp && message.hasCorrection && (
          <div className="mt-2 overflow-hidden rounded-control border border-status-error/35 bg-surface-subtle text-start">
            <div className="flex items-center gap-2 border-b border-status-error/20 bg-status-error/10 px-3.5 py-2">
              <KatzuMascot name="avatar" className="h-5 w-5" />
              <span className="kz-ar-micro font-bold text-status-error">تصحيح كَاتْزُو</span>
            </div>

            <div className="space-y-2.5 p-3.5">
              {(message.originalMistake || message.correctedGerman) && (
                <div className="space-y-1.5">
                  {message.originalMistake && (
                    <div className="flex items-baseline gap-2">
                      <span className="kz-ar-micro shrink-0 text-kz-inkFaint">قلت</span>
                      <GermanText className="text-status-error/80 line-through decoration-status-error/60">
                        {message.originalMistake}
                      </GermanText>
                    </div>
                  )}
                  {message.correctedGerman && (
                    <div className="flex items-baseline gap-2">
                      <span className="kz-ar-micro shrink-0 text-kz-inkFaint">الصحيح</span>
                      <GermanText className="font-bold text-status-success">
                        {message.correctedGerman}
                      </GermanText>
                    </div>
                  )}
                </div>
              )}

              {message.grammarRule && (
                <bdi
                  dir="auto"
                  className="kz-ar-micro inline-flex items-center gap-1.5 rounded-full border border-status-learning/25 bg-status-learning/10 px-2.5 py-1 text-status-learning"
                >
                  <span aria-hidden>📌</span>
                  {message.grammarRule}
                </bdi>
              )}

              {message.grammarReference && message.grammarReference.id === message.grammarId && (
                <div className="rounded-xl border border-kz-lavender/20 bg-kz-lavender/5 p-2.5">
                  <span className="kz-ar-micro block text-kz-inkFaint">من قاعدة التدريب الموجّه</span>
                  <p className="mt-1 kz-ar-micro font-semibold text-kz-lavender">{message.grammarReference.titleAr}</p>
                  <p className="mt-1 kz-ar-micro leading-relaxed text-kz-inkDim">{message.grammarReference.ruleAr}</p>
                  <GermanText className="mt-1 font-german text-xs text-kz-inkDim">{message.grammarReference.exampleDe}</GermanText>
                </div>
              )}

              {message.explanationAr && (
                <p className="kz-ar-micro leading-relaxed text-kz-inkDim">{message.explanationAr}</p>
              )}

              {message.positiveNoteAr && (
                <p className="kz-ar-micro font-semibold text-status-success">✦ {message.positiveNoteAr}</p>
              )}

              {message.roastComment && (
                <p className="kz-ar-micro border-s-2 border-status-learning/40 ps-2.5 italic text-status-learning/90">
                  «{message.roastComment}»
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
