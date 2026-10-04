import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Languages, MoreHorizontal } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { WordInsightBottomSheet } from '@/components/sheets/WordInsightBottomSheet';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import { triggerHaptic } from '@/lib/utils/haptics';
import { SESSION_MODE_COPY } from '@/lib/conversation/turnPlan';
import { buildWordBank } from '@/lib/utils/wordBank';
import { track } from '@/lib/analytics/client';
import type { SessionDebrief } from '@/lib/debrief/debrief';
import type { CEFRLevel } from '@/types/models';
import { ConversationDock } from './ConversationDock';
import { ConversationTranscript } from './ConversationTranscript';
import { useLiveConversation } from './useLiveConversation';

export interface LiveConversationScreenProps {
  scenarioId: string;
  vocabularyContext?: string[];
  grammarId?: string;
  onBack: () => void;
  onOpenSubscription?: () => void;
  onCompleteSession: (sessionSummary: {
    scenarioId: string;
    scenarioTitle: string;
    cefrLevel: CEFRLevel;
    sentencesSpoken: number;
    accuracyPercent: number | null;
    durationSeconds: number;
    independentSentences: number;
    assistedSentences: number;
    mistakes: Array<{ original: string; corrected: string; grammarRule: string }>;
    debrief: SessionDebrief;
  }) => void;
}

/**
 * The live conversation screen (V40 layout).
 *
 * All conversation logic — state machine, voice, turn sending, session finishing —
 * lives in `useLiveConversation`. This file is the layout:
 *
 *   header (back · title + round segments + level · ⋯)
 *   → chat (the flexible hero, nothing floating over it)
 *   → bottom input bar (hint · field · orb/send)
 *
 * The difficulty and translate controls moved into the ⋯ sheet, so the header is
 * three controls at most, and the orb is now the input bar's action button rather
 * than a card above the chat.
 */
export const LiveConversationScreen: React.FC<LiveConversationScreenProps> = ({
  scenarioId,
  vocabularyContext,
  grammarId,
  onBack,
  onOpenSubscription,
  onCompleteSession,
}) => {
  const [optionsOpen, setOptionsOpen] = useState(false);
  /**
   * The visual viewport, when the engine has one.
   *
   * `100dvh` tracks the browser chrome, but on iOS Safari the soft keyboard shrinks
   * only the *visual* viewport, not the layout one — so the input bar would sit
   * underneath the keys. Sizing the screen to `visualViewport.height` keeps the
   * field just above the keyboard on every engine that reports it; the `dvh` class
   * below is the fallback where it does not.
   */
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => setViewportHeight(vv.height);
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  const live = useLiveConversation({
    scenarioId,
    vocabularyContext,
    grammarId,
    onBack,
    onCompleteSession,
  });

  const {
    // data
    messages,
    dispatch,
    // state
    inputText,
    setInputText,
    showArabicTranslation,
    showAllTranslations,
    visibleHints,
    isHintRevealed,
    setIsHintRevealed,
    isHintExpanded,
    setIsHintExpanded,
    isRefreshingHints,
    hintQuotaSpent,
    turnError,
    micError,
    isSessionCompleted,
    isGenerating,
    sessionMode,
    realMode,
    setSessionMode,
    effectiveLevel,
    targetTurns,
    userTurnsCount,
    characterNameAr,
    orbState,
    orbTone,
    orbLabelAr,
    speakingId,
    activeCharIndex,
    voice,
    paywall,
    setPaywall,
    selectedWordForInsight,
    setSelectedWordForInsight,
    knownWords,
    // refs
    scrollRef,
    inputRef,
    // handlers
    handleOrbPress,
    handleToggleTranslation,
    handleToggleAllTranslations,
    handleTranscriptScroll,
    handleWordClick,
    handleToggleSaveWord,
    handleSpeak,
    handleSlowSpeak,
    handleSendMessage,
    retryFailedTurn,
    requestOpenerTranslation,
    handleUseHint,
    refreshHints,
    handleNudgeDifficulty,
  } = live;

  // The words behind the currently-offered suggestion, so the learner can build a
  // reply themselves instead of only sending the canned line.
  const hintBank = useMemo(
    () => (visibleHints[0] ? buildWordBank(visibleHints[0].german) : []),
    [visibleHints],
  );

  if (!sessionMode) {
    return (
      <div className="flex min-h-screen max-w-md mx-auto flex-col justify-center bg-black p-6 text-kz-ink">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 self-start rounded-2xl kz-chip border border-white/10 bg-white/5 p-2"
          aria-label="العودة"
        >
          <ArrowRight className="h-5 w-5 text-kz-inkDim" />
        </button>
        <div className="mb-6 text-center">
          <h1 className="kz-ar-title mb-2 font-bold">كيف تريد أن تتحدث؟</h1>
          <p className="kz-ar-caption text-kz-inkDim">
            المحادثة نفسها في الحالتين — الفرق في المساعدة التي تريدها الآن.
          </p>
        </div>
        <div className="space-y-3">
          {/* V32: two equal cards asked a learner who has never spoken German to
              choose between "with help" and "without help" — a judgement they
              cannot make yet. PRACTICE is now marked recommended and the whole
              card is one tap to START; REAL mode stays exactly one tap below, so
              recommending a default never takes the choice away. */}
          <button
            type="button"
            onClick={() => setSessionMode('practice')}
            className="w-full rounded-3xl border border-primary/50 bg-primary/10 p-5 text-start transition-colors pointer-hover:bg-primary/15"
          >
            <span className="mb-1 flex items-center justify-between gap-2">
              <strong className="kz-ar-caption block text-primary">{SESSION_MODE_COPY.practice.labelAr}</strong>
              <span className="kz-ar-micro shrink-0 rounded-full border border-primary/40 px-2 py-0.5 font-bold text-primary">
                موصى به
              </span>
            </span>
            <span className="kz-ar-micro block text-kz-inkDim">{SESSION_MODE_COPY.practice.descriptionAr}</span>
          </button>
          <button
            type="button"
            onClick={() => setSessionMode('real')}
            className="w-full rounded-3xl kz-chip border border-white/10 bg-white/5 p-5 text-start transition-colors pointer-hover:bg-white/10"
          >
            <strong className="kz-ar-caption mb-1 block text-kz-inkDim">{SESSION_MODE_COPY.real.labelAr}</strong>
            <span className="kz-ar-micro text-kz-inkFaint">{SESSION_MODE_COPY.real.descriptionAr}</span>
          </button>
          <button
            type="button"
            onClick={() => setSessionMode('practice')}
            className="w-full rounded-2xl px-4 py-3 text-center font-arabic text-xs font-bold text-kz-lavender transition-colors pointer-hover:text-kz-ink min-h-touch"
          >
            ابدأ «تدريب» الآن
          </button>
        </div>
      </div>
    );
  }

  // A short, honest status line under the chat only while it has something to say.
  const statusLabelAr = voice.isRecording
    ? 'أنا أستمع إليك… تحدث الآن'
    : voice.mode === 'recorder'
      ? 'أفتح المايك… اسمح بالوصول إن ظهرت نافذة الإذن'
      : live.conversation.status === 'transcribing'
        ? 'جارٍ التعرف على كلامك…'
        : !voice.isSupported
          ? 'الإدخال الصوتي غير متاح — اكتب بالألمانية'
          : null;

  const showEmptyHint = messages.length <= 1 && !isGenerating && !isSessionCompleted;

  return (
    // The whole screen is one column that fits the visible viewport. The transcript
    // is the only flexible row, so it takes every pixel the chrome does not.
    <div
      className="relative mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-kz-soft-black text-kz-ink"
      style={viewportHeight ? { height: viewportHeight } : undefined}
    >
      {/* A single low radial light behind the chat, so the screen reads as one
          surface instead of a black rectangle with a header glued on. */}
      <div aria-hidden className="kz-conversation-bg pointer-events-none absolute inset-0" />

      {/* Header: back · title with the round segments · ⋯. Three controls at most;
          difficulty and translate live behind the ⋯. */}
      <header className="relative z-20 shrink-0 border-b border-white/[0.06] bg-kz-soft-black/50 px-2 py-1 backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={onBack}
            aria-label="العودة"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-kz-inkDim transition-colors pointer-hover:bg-white/10"
          >
            <ArrowRight className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 px-1">
            <p className="kz-ar-caption truncate text-center text-kz-ink">{characterNameAr}</p>
            <div className="mt-1 flex items-center justify-center gap-2">
              <div
                data-testid="round-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={targetTurns}
                aria-valuenow={userTurnsCount}
                aria-label={`الجولة ${Math.min(userTurnsCount + 1, targetTurns)} من ${targetTurns}`}
                className="flex items-center gap-1"
              >
                {Array.from({ length: targetTurns }).map((_, index) => (
                  <span
                    key={index}
                    className={`h-1 w-4 rounded-full transition-colors duration-fast ${
                      index < userTurnsCount ? 'bg-primary' : 'bg-white/15'
                    }`}
                  />
                ))}
              </div>
              <span
                data-testid="level-chip"
                className="kz-de-caption shrink-0 rounded-full border border-white/10 px-1.5 font-german font-bold text-kz-lavender"
              >
                {effectiveLevel}
              </span>
            </div>
          </div>

          <button
            onClick={() => setOptionsOpen(true)}
            aria-label="خيارات الجلسة"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-kz-inkDim transition-colors pointer-hover:bg-white/10"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </header>

      <ConversationTranscript
        scrollRef={scrollRef}
        onScroll={handleTranscriptScroll}
        messages={messages}
        showArabicTranslation={showArabicTranslation}
        showAllTranslations={showAllTranslations}
        knownWords={knownWords}
        showHelp={!realMode}
        isGenerating={isGenerating}
        turnError={turnError}
        isSessionCompleted={isSessionCompleted}
        speakingId={speakingId}
        activeCharIndex={activeCharIndex}
        onToggleTranslation={handleToggleTranslation}
        onRetryTranslation={requestOpenerTranslation}
        onSpeak={handleSpeak}
        onSlowSpeak={handleSlowSpeak}
        onWordClick={handleWordClick}
        onRetryFailedTurn={retryFailedTurn}
      />

      {/* Empty / first state: one line telling the learner what the microphone is
          for. It disappears the moment the conversation has something in it. */}
      {showEmptyHint && (
        <p className="pointer-events-none px-4 pb-1 text-center kz-ar-caption text-kz-inkDim">
          اضغط على الميكروفون وتحدث
        </p>
      )}

      {statusLabelAr && (
        <p
          className="pointer-events-none px-4 pb-1 text-center kz-ar-micro font-semibold text-kz-lavender"
          role="status"
        >
          {statusLabelAr}
        </p>
      )}

      {/* The bottom input bar: hint · field · orb/send. */}
      <ConversationDock
        showHelp={!realMode}
        visibleHints={visibleHints}
        isHintRevealed={isHintRevealed}
        isHintExpanded={isHintExpanded}
        isRefreshingHints={isRefreshingHints}
        hintQuotaSpent={hintQuotaSpent}
        micError={micError}
        orbState={orbState}
        orbTone={orbTone}
        orbLabelAr={orbLabelAr}
        orbReadLevel={voice.read}
        orbDisabled={!voice.isSupported || live.conversation.status === 'quota_exhausted'}
        isRecording={voice.isRecording}
        isCoachSpeaking={speakingId !== null}
        interimText={voice.interimText}
        onOrbPress={() => {
          // A tap on the microphone is a physical event; say so on the hand as well
          // as on the screen, where the platform can.
          triggerHaptic('light');
          void handleOrbPress();
        }}
        onRevealHint={() => {
          setIsHintRevealed(true);
          triggerHaptic('light');
        }}
        onHideHint={() => setIsHintRevealed(false)}
        onToggleHintExpanded={() => {
          setIsHintExpanded((v) => !v);
          triggerHaptic('light');
        }}
        onRefreshHints={refreshHints}
        onUseHint={handleUseHint}
        hintBank={hintBank}
        onPickHintWord={(word) => {
          track('word_bank_tapped', { skill: 'chat' });
          setInputText((prev) => (prev ? `${prev} ${word}` : word));
        }}
        onDismissError={() => dispatch({ type: 'dismiss_error' })}
        inputRef={inputRef}
        inputText={inputText}
        isGenerating={isGenerating}
        onInputTextChange={setInputText}
        onInputKeyDown={(key) => key === 'Enter' && handleSendMessage()}
        onSend={() => handleSendMessage()}
      />

      {/* ⋯: the conversation-level controls, out of the header and into a sheet. */}
      <BottomSheet isOpen={optionsOpen} onClose={() => setOptionsOpen(false)} title="خيارات الجلسة">
        <div className="space-y-1">
          <button
            onClick={() => handleNudgeDifficulty('easier')}
            disabled={effectiveLevel === 'A1'}
            className="flex min-h-control w-full items-center justify-between rounded-control px-3 kz-ar-caption text-kz-ink transition-colors pointer-hover:bg-white/5 disabled:opacity-30"
          >
            <span>أسهل</span>
            <ChevronDown className="h-4 w-4 text-kz-inkFaint" />
          </button>
          <div className="flex min-h-control w-full items-center justify-between rounded-control px-3 kz-ar-caption text-kz-inkDim">
            <span>المستوى الحالي</span>
            <span className="kz-de-caption font-german font-bold text-kz-lavender">{effectiveLevel}</span>
          </div>
          <button
            onClick={() => handleNudgeDifficulty('harder')}
            disabled={effectiveLevel === 'B2'}
            className="flex min-h-control w-full items-center justify-between rounded-control px-3 kz-ar-caption text-kz-ink transition-colors pointer-hover:bg-white/5 disabled:opacity-30"
          >
            <span>أصعب</span>
            <ChevronUp className="h-4 w-4 text-kz-inkFaint" />
          </button>
          {!realMode && (
            <button
              onClick={handleToggleAllTranslations}
              aria-label={showAllTranslations ? 'إخفاء كل الترجمات' : 'إظهار كل الترجمات'}
              className="flex min-h-control w-full items-center justify-between rounded-control px-3 kz-ar-caption text-kz-ink transition-colors pointer-hover:bg-white/5"
            >
              <span className="flex items-center gap-2">
                <Languages className="h-4 w-4 text-kz-inkDim" />
                إظهار الترجمة تلقائياً
              </span>
              <span
                className={`kz-ar-micro rounded-full px-2 py-0.5 font-bold ${
                  showAllTranslations ? 'bg-primary text-on-lavender' : 'bg-white/10 text-kz-inkDim'
                }`}
              >
                {showAllTranslations ? 'مفعّل' : 'متوقف'}
              </span>
            </button>
          )}
        </div>
      </BottomSheet>

      {/* Word Insight Bottom Sheet */}
      <WordInsightBottomSheet
        word={selectedWordForInsight}
        isOpen={!!selectedWordForInsight}
        onClose={() => setSelectedWordForInsight(null)}
        isSaved={live.savedWords.some((sw) => sw.wordId === selectedWordForInsight?.id)}
        onToggleSave={handleToggleSaveWord}
      />

      {/* Pro Paywall (level lock, quota exhaustion) */}
      <PaywallModal
        isOpen={paywall.isOpen}
        onClose={() => setPaywall((p) => ({ ...p, isOpen: false }))}
        onUpgrade={() => {
          setPaywall((p) => ({ ...p, isOpen: false }));
          if (onOpenSubscription) onOpenSubscription();
        }}
        title={paywall.title || undefined}
        description={paywall.description || undefined}
      />
    </div>
  );
};
