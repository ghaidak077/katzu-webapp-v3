import React, { useMemo } from 'react';
import { ArrowRight, Languages } from 'lucide-react';
import { WordInsightBottomSheet } from '@/components/sheets/WordInsightBottomSheet';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { triggerHaptic } from '@/lib/utils/haptics';
import { SESSION_MODE_COPY } from '@/lib/conversation/turnPlan';
import { buildWordBank } from '@/lib/utils/wordBank';
import { track } from '@/lib/analytics/client';
import type { SessionDebrief } from '@/lib/debrief/debrief';
import type { CEFRLevel } from '@/types/models';
import { ConversationComposer, ConversationControls } from './ConversationDock';
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

  const turnProgress = Math.min(1, userTurnsCount / Math.max(1, targetTurns));

  return (
    // The whole screen is one column that fits the visible viewport, ordered
    // header → voice/hint controls → transcript → composer (V29). The transcript
    // is the only flexible row, so it takes every pixel the chrome does not; the
    // voice mass sits ABOVE it and the thumb-reachable composer BELOW it, so no
    // message can ever end up under either.
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl kz-chip border border-white/10 bg-white/5 transition-colors pointer-hover:bg-white/10"
          >
            <ArrowRight className="h-5 w-5 text-kz-inkDim" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="kz-ar-caption truncate text-kz-ink">{characterNameAr}</p>
            <p className="kz-ar-micro text-kz-inkFaint">
              الجولة {Math.min(userTurnsCount + 1, targetTurns)} من {targetTurns} · {effectiveLevel}
            </p>
          </div>

          {!realMode && (
            <button
              onClick={handleToggleAllTranslations}
              aria-label={showAllTranslations ? 'إخفاء كل الترجمات' : 'إظهار كل الترجمات'}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition-colors ${
                showAllTranslations
                  ? 'border-primary/50 bg-primary/20 text-primary'
                  : 'border-white/10 bg-white/5 text-kz-inkDim pointer-hover:bg-white/10'
              }`}
            >
              <Languages className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Difficulty: real functionality, deliberately secondary — a learner who
            never touches it still finishes the episode. */}
        <div className="mt-1 flex items-center justify-center gap-1">
          <button
            onClick={() => handleNudgeDifficulty('easier')}
            disabled={effectiveLevel === 'A1'}
            className="kz-ar-micro flex min-h-[28px] items-center rounded-full px-2.5 text-kz-inkFaint transition-colors pointer-hover:text-kz-inkDim disabled:opacity-25"
          >
            أسهل
          </button>
          <span className="kz-de-caption px-1 font-german font-bold text-kz-lavender">{effectiveLevel}</span>
          <button
            onClick={() => handleNudgeDifficulty('harder')}
            disabled={effectiveLevel === 'B2'}
            className="kz-ar-micro flex min-h-[28px] items-center rounded-full px-2.5 text-kz-inkFaint transition-colors pointer-hover:text-kz-inkDim disabled:opacity-25"
          >
            أصعب
          </button>
        </div>

        {/* The round progress, as the header's own bottom edge. Instant width
            change (V19 motion rule): a transition here is decoration. */}
        <div className="absolute bottom-0 start-0 h-[2px] rounded-full bg-primary" style={{ width: `${turnProgress * 100}%` }} />
      </GlassSurface>

      {/* The voice control and the suggestions, compact, under the header. */}
      <ConversationControls
        showHelp={!realMode}
        visibleHints={visibleHints}
        isHintRevealed={isHintRevealed}
        isHintExpanded={isHintExpanded}
        isRefreshingHints={isRefreshingHints}
        hintQuotaSpent={hintQuotaSpent}
        micError={micError}
        orbState={orbState}
        orbTone={orbTone}
        orbSize={orbSize}
        orbLabelAr={orbLabelAr}
        orbReadLevel={voice.read}
        orbDisabled={!voice.isSupported || live.conversation.status === 'quota_exhausted'}
        isRecording={voice.isRecording}
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
        hintBank={hintBank}
        onPickHintWord={(word) => {
          track('word_bank_tapped', { skill: 'chat' });
          setInputText((prev) => (prev ? `${prev} ${word}` : word));
        }}
        onDismissError={() => dispatch({ type: 'dismiss_error' })}
      />

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
        onWordClick={handleWordClick}
        onRetryFailedTurn={retryFailedTurn}
      />

      {/* The typed composer: one thumb-reachable row at the bottom. */}
      <ConversationComposer
        inputRef={inputRef}
        inputText={inputText}
        isGenerating={isGenerating}
        isRecording={voice.isRecording}
        onInputTextChange={setInputText}
        onInputKeyDown={(key) => key === 'Enter' && handleSendMessage()}
        onSend={() => handleSendMessage()}
        onTypeInstead={handleTypeInstead}
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


