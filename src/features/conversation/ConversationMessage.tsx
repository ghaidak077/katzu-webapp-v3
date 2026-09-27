import React, { useMemo } from 'react';
import { Languages, RefreshCw, Volume2 } from 'lucide-react';
import { GermanText } from '@/components/common/GermanText';
import { KatzuMascot } from '@/components/common/KatzuMascot';
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
  onSpeak: (germanText: string) => void;
  onWordClick: (word: string) => void;
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
}) => {
  const isKatzu = message.sender === 'KATZU';

  // Splitting and normalising the sentence once per message instead of once per
  // render is what keeps a long transcript cheap to keep on screen.
  const words = useMemo(
    () => message.germanText.split(' ').map((word) => ({ word, key: normalize(word) })),
    [message.germanText],
  );

  return (
    <article className={`flex ${isKatzu ? 'justify-start' : 'justify-end'}`}>
      <div className="max-w-[88%] min-w-0">
        <div
          className={
            isKatzu
              ? 'kz-surface rounded-[24px] rounded-ss-[8px] px-3.5 py-3'
              : 'rounded-[24px] rounded-se-[8px] bg-gradient-to-br from-primary to-primary-pressed px-3.5 py-3 text-white shadow-glow-purple'
          }
          data-tier={isKatzu ? 'canvas' : undefined}
        >
          {/* German stays in one direction-isolated LTR block: the page is RTL, and
              without isolation the punctuation of a German sentence moves. */}
          <div
            dir="ltr"
            style={{ unicodeBidi: 'isolate' }}
            className={`font-german text-[15px] font-semibold leading-relaxed ${
              isKatzu ? 'text-kz-ink' : 'text-white'
            }`}
          >
            {words.map(({ word, key }, index) => {
              const isKnown = key.length > 1 && knownWords.has(key);
              return (
                <React.Fragment key={`${key}-${index}`}>
                  <span
                    onClick={isKnown ? () => onWordClick(word) : undefined}
                    className={
                      isKnown
                        ? 'cursor-pointer rounded-[6px] underline decoration-dotted decoration-1 underline-offset-[3px] hover:bg-white/10'
                        : undefined
                    }
                  >
                    {word}
                  </span>
                  {index < words.length - 1 ? ' ' : ''}
                </React.Fragment>
              );
            })}
          </div>

          {isKatzu && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/8 pt-1.5">
              <button
                type="button"
                onClick={() => onSpeak(message.germanText)}
                aria-label="اسمع الجملة بالألمانية"
                className="flex h-8 w-8 items-center justify-center rounded-full text-kz-lavender transition-colors hover:bg-white/10"
              >
                <Volume2 className="h-4 w-4" />
              </button>

              {message.arabicTranslation ? (
                <button
                  type="button"
                  onClick={() => onToggleTranslation(message.id)}
                  className="kz-ar-micro flex items-center gap-1 rounded-full px-2 py-1 text-kz-inkFaint transition-colors hover:text-kz-ink"
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
                  className="kz-ar-micro flex items-center gap-1 text-status-learning transition-colors hover:text-status-learning/80"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  تعذرت الترجمة — أعد المحاولة
                </button>
              ) : null}
            </div>
          )}

          {isTranslationVisible && message.arabicTranslation && (
            <p className="kz-ar-caption mt-2 border-t border-white/8 pt-2 leading-relaxed text-kz-inkDim">
              {message.arabicTranslation}
            </p>
          )}

          {/* Katzu's nudge towards the learner's next move. It is advice, so it
              reads as a caption rather than as a second message. */}
          {isKatzu && message.followupAr && (
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
        {message.hasCorrection && (
          <div className="mt-2 overflow-hidden rounded-[20px] border border-status-error/35 bg-surface-subtle text-start">
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
