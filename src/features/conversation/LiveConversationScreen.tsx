import React from 'react';
import { ArrowRight, Languages } from 'lucide-react';
import { WordInsightBottomSheet } from '@/components/sheets/WordInsightBottomSheet';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { triggerHaptic } from '@/lib/utils/haptics';
import { planTurns } from '@/lib/conversation/turnPlan';
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
  }) => void;
}

/**
 * The live conversation screen (B4d mechanical split).
 *
 * All conversation logic — state machine, voice, turn sending, session
 * finishing — lives in `useLiveConversation`; the transcript region is
 * `ConversationTranscript` and the dock is `ConversationDock`. This file is the
 * layout that wires them together. Zero behaviour change: every prop passed
 * down is the same value the inline JSX read before the split, and the DOM
 * structure (including every `data-testid`, aria label and class name) is
 * byte-identical to the pre-split screen.
 */
export const LiveConversationScreen: React.FC<LiveConversationScreenProps> = ({
  scenarioId,
  vocabularyContext,
  grammarId,
  onBack,
  onOpenSubscription,
  onCompleteSession,
}) => {
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
    turnError,
    micError,
    isSessionCompleted,
    isGenerating,
    sessionMode,
    setSessionMode,
    effectiveLevel,
    targetTurns,
    userTurnsCount,
    characterNameAr,
    orbState,
    orbTone,
    orbLabelAr,
    orbSize,
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
    handleTypeInstead,
    handleToggleTranslation,
    handleToggleAllTranslations,
    handleTranscriptScroll,
    handleWordClick,
    handleToggleSaveWord,
    handleSpeak,
    handleSendMessage,
    retryFailedTurn,
    requestOpenerTranslation,
    handleUseHint,
    refreshHints,
    handleNudgeDifficulty,
  } = live;

  if (!sessionMode) {
    return (
      <main className="flex min-h-screen max-w-md mx-auto flex-col justify-center bg-black p-6 text-kz-ink">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 self-start rounded-2xl kz-chip border border-white/10 bg-white/5 p-2"
          aria-label="العودة"
        >
          <ArrowRight className="h-5 w-5 text-kz-inkDim" />
        </button>
        <div className="mb-6 text-center">
          <h1 className="kz-ar-title mb-2 font-bold">اختر طريقة التدريب</h1>
          <p className="kz-ar-caption text-kz-inkDim">
            اختر الوقت المناسب لك، وسنحافظ على تقدمك بصراحة.
          </p>
        </div>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setSessionMode('quick')}
            className="w-full rounded-3xl border border-primary/40 bg-white/5 p-5 text-start transition-colors hover:bg-white/10"
          >
            <strong className="kz-ar-caption mb-1 block text-primary">تمرين سريع</strong>
            <span className="kz-ar-micro text-kz-inkDim">
              {planTurns('quick', effectiveLevel)} جولات مركزة
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSessionMode('immersion')}
            className="w-full rounded-3xl kz-chip border border-white/10 bg-white/5 p-5 text-start transition-colors hover:bg-white/10"
          >
            <strong className="kz-ar-caption mb-1 block text-primary">تحدي واقعي مكثف</strong>
            <span className="kz-ar-micro text-kz-inkDim">
              {planTurns('immersion', effectiveLevel)} جولات مع سياق أطول
            </span>
          </button>
        </div>
      </main>
    );
  }

  const turnProgress = Math.min(1, userTurnsCount / Math.max(1, targetTurns));

  return (
    // The whole screen is one column that fits the visible viewport. The transcript
    // scrolls inside its own region and the dock is a sibling below it, so no
    // message can ever end up underneath the orb — the overlap reported from a
    // real session was a `fixed` dock over a list that could not know its height.
    <div className="relative mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-black text-kz-ink">
      {/* Header: who the learner is talking to, which round, and the two controls
          that belong to the conversation as a whole. */}
      {/* V20: the header is a glass surface like the dock below it — one
          material for the conversation's floating chrome. Rounded-bottom pill
          look is wrong for a top bar, so it is a flush glass slab with the
          same edge light; blur is tier-aware via kz-surface/kz-lite. */}
      <GlassSurface
        tier="floating"
        className="relative z-20 shrink-0 rounded-none border-b border-white/[0.08] px-3 pt-2.5"
      >
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            aria-label="العودة"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl kz-chip border border-white/10 bg-white/5 transition-colors hover:bg-white/10"
          >
            <ArrowRight className="h-5 w-5 text-kz-inkDim" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="kz-ar-caption truncate text-kz-ink">{characterNameAr}</p>
            <p className="kz-ar-micro text-kz-inkFaint">
              الجولة {Math.min(userTurnsCount + 1, targetTurns)} من {targetTurns} · {effectiveLevel}
            </p>
          </div>

          <button
            onClick={handleToggleAllTranslations}
            aria-label={showAllTranslations ? 'إخفاء كل الترجمات' : 'إظهار كل الترجمات'}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition-colors ${
              showAllTranslations
                ? 'border-primary/50 bg-primary/20 text-primary'
                : 'border-white/10 bg-white/5 text-kz-inkDim hover:bg-white/10'
            }`}
          >
            <Languages className="h-4 w-4" />
          </button>
        </div>

        {/* Difficulty: real functionality, deliberately secondary — a learner who
            never touches it still finishes the episode. */}
        <div className="mt-1 flex items-center justify-center gap-1">
          <button
            onClick={() => handleNudgeDifficulty('easier')}
            disabled={effectiveLevel === 'A1'}
            className="kz-ar-micro flex min-h-[28px] items-center rounded-full px-2.5 text-kz-inkFaint transition-colors hover:text-kz-inkDim disabled:opacity-25"
          >
            أسهل
          </button>
          <span className="kz-de-caption px-1 font-german font-bold text-kz-lavender">{effectiveLevel}</span>
          <button
            onClick={() => handleNudgeDifficulty('harder')}
            disabled={effectiveLevel === 'B2'}
            className="kz-ar-micro flex min-h-[28px] items-center rounded-full px-2.5 text-kz-inkFaint transition-colors hover:text-kz-inkDim disabled:opacity-25"
          >
            أصعب
          </button>
        </div>

        {/* The round progress, as the header's own bottom edge. Instant width
            change (V19 motion rule): a transition here is decoration. */}
        <div className="absolute bottom-0 start-0 h-[2px] rounded-full bg-primary" style={{ width: `${turnProgress * 100}%` }} />
      </GlassSurface>

      <ConversationTranscript
        scrollRef={scrollRef}
        onScroll={handleTranscriptScroll}
        messages={messages}
        showArabicTranslation={showArabicTranslation}
        showAllTranslations={showAllTranslations}
        knownWords={knownWords}
        isGenerating={isGenerating}
        turnError={turnError}
        isSessionCompleted={isSessionCompleted}
        speakingId={speakingId}
        activeCharIndex={activeCharIndex}
        onToggleTranslation={handleToggleTranslation}
        onRetryTranslation={requestOpenerTranslation}
        onSpeak={handleSpeak}
        onWordClick={handleWordClick}
        onRetryFailedTurn={retryFailedTurn}
      />

      <ConversationDock
        inputRef={inputRef}
        visibleHints={visibleHints}
        isHintRevealed={isHintRevealed}
        isHintExpanded={isHintExpanded}
        isRefreshingHints={isRefreshingHints}
        micError={micError}
        orbState={orbState}
        orbTone={orbTone}
        orbSize={orbSize}
        orbLabelAr={orbLabelAr}
        orbReadLevel={voice.read}
        orbDisabled={!voice.isSupported || live.conversation.status === 'quota_exhausted'}
        isRecording={voice.isRecording}
        isVoiceSupported={voice.isSupported}
        conversationStatusLabelAr={
          voice.isRecording
            ? 'أنا أستمع إليك… تحدث الآن'
            : live.conversation.status === 'transcribing'
              ? 'جارٍ التعرف على كلامك…'
              : !voice.isSupported
                ? 'الإدخال الصوتي غير متاح — اكتب بالألمانية'
                : 'اضغط على الدائرة وتحدث'
        }
        interimText={voice.interimText}
        inputText={inputText}
        isGenerating={isGenerating}
        onInputTextChange={setInputText}
        onInputKeyDown={(key) => key === 'Enter' && handleSendMessage()}
        onSend={() => handleSendMessage()}
        onTypeInstead={handleTypeInstead}
        onOrbPress={() => void handleOrbPress()}
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
        onDismissError={() => dispatch({ type: 'dismiss_error' })}
      />

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


