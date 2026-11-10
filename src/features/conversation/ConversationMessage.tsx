import React, { useMemo } from 'react';
import { Languages, RefreshCw, Snail, Volume2, Flag } from 'lucide-react';
import { GermanText } from '@/components/common/GermanText';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { correctionCardCopy } from '@/lib/conversation/correctionWording';
import { diffSentences } from '@/lib/conversation/germanDiff';
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

/**
 * Keeps a Latin run inside an Arabic sentence from being re-shaped by the RTL
 * paragraph. Measured: «حرف l مضعّف» painted the isolated letter `l` as «ا»,
 * because a single Latin letter sitting between Arabic words takes the Arabic
 * script's joining/cursive context. Wrapping the run in `<bdi dir="ltr">` gives
 * it its own direction and the letter stays an `l`.
 */
const LATIN_RUN = /([A-Za-zÄÖÜäöüß]+)/;

function isolateLatin(text: string): React.ReactNode {
  return text.split(LATIN_RUN).map((part, index) =>
    index % 2 === 1 ? (
      <bdi key={`latin-${index}`} dir="ltr">
        {part}
      </bdi>
    ) : (
      part
    ),
  );
}

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
  /**
   * Opens the confirmation for reporting THIS reply. The learner still has to
   * confirm; a tap here sends nothing.
   */
  onReport?: (message: ChatMessage) => void;
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
  /** Hidden Settings toggle, off by default: «AI · model · ms · attempt n». */
  showAiDebug?: boolean;
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
  onReport,
  onWordClick,
  showHelp = true,
  spokenCharIndex = null,
  isSpeaking = false,
  correctionMessage,
  showAiDebug = false,
}) => {
  const isKatzu = message.sender === 'KATZU';

  // Split once per message, not once per render: the segments are the sentence
  // character for character (`wordHighlight`), which is what lets the speech
  // engine's own character index find the right word.
  const segments = useMemo(() => speechSegments(message.germanText), [message.germanText]);
  const spokenWord = activeWordIndex(segments, spokenCharIndex);

  // The card carries one accent — the corrected word, and the thin edge beside
  // it. The rule label and the Arabic explanation are derived together from the
  // two visible strings, so they cannot name different rules (`halo` → `hallo`
  // is a doubled letter, not capitalisation; `HALO` → `Hallo` is both). The
  // model's wording is used only when the difference cannot be classified.
  const correctionCopy = correctionMessage
    ? correctionCardCopy(
        correctionMessage.originalMistake,
        correctionMessage.correctedGerman,
        correctionMessage.grammarRule,
        correctionMessage.explanationAr,
      )
    : { label: '', explanationAr: '' };
  const ruleLabel = correctionCopy.label;
  const hasCorrection = Boolean(correctionMessage?.correctedGerman);
  // The full sentence is what the learner must be able to re-read: the old card
  // showed only the broken fragment, so a multi-word or capitalisation error had
  // no sentence around it. `correctedSentence` is the whole corrected line; the
  // learner's side is their own bubble text.
  const learnerSentence = correctionMessage?.originalMistake || message.germanText;
  const correctedSentence = correctionMessage?.correctedSentence || correctionMessage?.correctedGerman || '';
  const structuredErrors = correctionMessage?.correctionErrors ?? [];
  const sentenceDiff = useMemo(
    () => diffSentences(learnerSentence, correctedSentence),
    [learnerSentence, correctedSentence],
  );

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

          {/* No model-authored 💬 follow-up: a deterministic scene question is
              already appended to the reply, so a second question here was the
              off-topic line. */}

          {/* Reporting lives on its own line with a written label. It used to be a
              14 px icon sharing the meta row with three others, which was present
              on every reply but effectively unfindable — the design cannot rely on
              a learner guessing what a faint flag means. It stays inside the bubble
              so it is unmistakably attached to the reply it reports. */}
          {isKatzu && onReport && (
            <button
              type="button"
              onClick={() => onReport(message)}
              aria-label="أبلغ عن رد سيئ"
              title="أبلغ عن رد سيئ"
              className="kz-ar-micro mt-1 flex h-9 items-center gap-1.5 rounded-full px-2 text-kz-inkDim transition-colors pointer-hover:bg-white/10 pointer-hover:text-kz-warm focus-visible:text-kz-warm"
            >
              <Flag className="h-3.5 w-3.5" />
              أبلغ عن رد سيئ
            </button>
          )}

          {/* Hidden debug label: who answered, how long it took, which attempt.
              Off by default; there is no FALLBACK state to report any more. */}
          {isKatzu && showAiDebug && message.aiDebug && (
            <code dir="ltr" data-testid="ai-debug" className="mt-1 block font-german text-micro text-kz-inkFaint">
              {message.aiDebug}
            </code>
          )}
        </div>

        {/* The correction card: a quiet note under the learner's own bubble, on
            the same surface ladder and spacing as a bubble. One accent — the
            corrected word and the 2px edge beside it — and neutral ink for
            everything else, so it reads as feedback, not a second conversation. */}
        {showHelp && correctionMessage && (
          <details
            data-testid="correction-card"
            className={`kz-message-in group mt-2 rounded-control border-t border-b border-e border-s-2 bg-surface-subtle text-start ${
              hasCorrection ? 'border-s-status-success/60' : 'border-s-kz-line/70'
            }`}
          >
            {/* Collapsed by default: the learner is never interrupted mid-flow.
                «تصحيح صغير ›» sits under their own line and opens the same card. */}
            <summary className="kz-ar-micro flex min-h-touch cursor-pointer list-none items-center gap-1.5 px-3 py-2 font-bold text-kz-inkDim [&::-webkit-details-marker]:hidden">
              <KatzuMascot name="avatar" alt="" className="h-4 w-4 rounded-full opacity-80" />
              <span>تصحيح صغير</span>
              <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
            </summary>

            <div className="px-4 pb-3">
              <span className="kz-ar-micro font-bold text-kz-ink">تصحيح كَاتْزُو</span>

              <div className="mt-2.5 space-y-2.5">
              {(learnerSentence || correctedSentence) && (
                <div className="space-y-1.5">
                  {learnerSentence && (
                    <div className="flex items-baseline gap-2.5">
                      <span className="kz-ar-micro w-11 shrink-0 text-kz-inkDim">قلت</span>
                      <GermanText className="min-w-0 flex-1 break-words hyphens-auto text-right text-status-error/80">
                        {sentenceDiff.from.map((segment, index) =>
                          segment.changed ? (
                            <mark
                              key={`from-${index}`}
                              className="rounded-sm bg-status-error/15 font-semibold text-status-error underline decoration-status-error/60 decoration-2 underline-offset-2"
                            >
                              {segment.text}
                            </mark>
                          ) : (
                            <React.Fragment key={`from-${index}`}>{segment.text}</React.Fragment>
                          ),
                        )}
                      </GermanText>
                    </div>
                  )}
                  {correctedSentence && (
                    <div className="flex items-baseline gap-2.5">
                      <span className="kz-ar-micro w-11 shrink-0 text-kz-inkDim">الصحيح</span>
                      <GermanText className="min-w-0 flex-1 break-words hyphens-auto text-right font-semibold text-status-success">
                        {sentenceDiff.to.map((segment, index) =>
                          segment.changed ? (
                            <mark
                              key={`to-${index}`}
                              className="rounded-sm bg-status-success/15 font-bold text-status-success"
                            >
                              {segment.text}
                            </mark>
                          ) : (
                            <React.Fragment key={`to-${index}`}>{segment.text}</React.Fragment>
                          ),
                        )}
                      </GermanText>
                    </div>
                  )}
                </div>
              )}

              {/* Every error the local checker found, each with its own rule chip
                  and one-line Arabic reason. One correction per line, in the order
                  the learner must fix them (meaning → grammar → spelling → cap.). */}
              {structuredErrors.length > 0 && (
                <ul className="space-y-1.5" data-testid="correction-errors">
                  {structuredErrors.map((error, index) => (
                    <li key={`${error.category}-${index}`} className="flex flex-wrap items-baseline gap-1.5">
                      <span className="kz-ar-micro inline-block max-w-full rounded-chip border border-kz-line bg-white/5 px-2.5 py-0.5 font-semibold text-kz-inkDim">
                        <bdi dir="ltr">{error.label}</bdi>
                      </span>
                      <span className="kz-ar-micro min-w-0 flex-1 text-kz-inkDim">{error.reasonAr}</span>
                    </li>
                  ))}
                </ul>
              )}

              {structuredErrors.length === 0 && ruleLabel && (
                <span className="kz-ar-micro inline-block max-w-full rounded-chip border border-kz-line bg-white/5 px-2.5 py-0.5 text-kz-inkDim">
                  <bdi dir="auto">{ruleLabel}</bdi>
                </span>
              )}

              {correctionMessage.grammarReference && correctionMessage.grammarReference.id === correctionMessage.grammarId && (
                <div className="rounded-chip border border-kz-line bg-white/5 p-2.5">
                  <span className="kz-ar-micro block text-kz-inkFaint">من قاعدة التدريب الموجّه</span>
                  <p className="mt-1 kz-ar-micro font-semibold text-kz-ink">{correctionMessage.grammarReference.titleAr}</p>
                  <p className="mt-1 kz-ar-micro leading-relaxed text-kz-inkDim">{correctionMessage.grammarReference.ruleAr}</p>
                  <GermanText className="mt-1 block text-xs text-kz-inkDim">{correctionMessage.grammarReference.exampleDe}</GermanText>
                </div>
              )}

              {structuredErrors.length === 0 && correctionCopy.explanationAr && (
                <p className="kz-ar-caption leading-relaxed text-kz-inkDim">{isolateLatin(correctionCopy.explanationAr)}</p>
              )}

              {correctionMessage.positiveNoteAr && (
                <p className="kz-ar-micro text-kz-inkFaint">{correctionMessage.positiveNoteAr}</p>
              )}

              {/* The chip above already names the rule, derived from the two
                  visible strings. The model's own Arabic quote is free text and
                  measured to contradict it («حرف l مضعّف» under a capitalisation
                  chip), so it is only shown when there is no chip. */}
              {correctionMessage.roastComment && !ruleLabel && structuredErrors.length === 0 && (
                <p className="kz-ar-micro border-s border-kz-line ps-2.5 text-kz-inkFaint">
                  «{correctionMessage.roastComment}»
                </p>
              )}
              </div>
            </div>
          </details>
        )}
      </div>
    </article>
  );
};

export const ConversationMessage = React.memo(ConversationMessageBase);
export default ConversationMessage;
