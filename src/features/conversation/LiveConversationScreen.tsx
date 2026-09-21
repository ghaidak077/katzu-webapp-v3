import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { workerClient } from '@/lib/api/workerClient';
import { useSpeechInput } from '@/lib/speech/useSpeechInput';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { triggerHaptic } from '@/lib/utils/haptics';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { AudioWaveform } from '@/components/common/AudioWaveform';
import { WordInsightBottomSheet } from '@/components/sheets/WordInsightBottomSheet';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  ArrowRight,
  Mic,
  MicOff,
  Send,
  Volume2,
  Sparkles,
  RefreshCw,
  Lightbulb,
  AlertTriangle,
  Languages,
  CheckCircle2,
} from 'lucide-react';
import type {
  ChatMessage,
  ContextualHint,
  CEFRLevel,
  VocabularyEntity,
  SessionEntity,
  SessionMode,
} from '@/types/models';
import { calculateIndependentAccuracy } from '@/features/report/metrics';

export interface LiveConversationScreenProps {
  scenarioId: string;
  onBack: () => void;
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

export const LiveConversationScreen: React.FC<LiveConversationScreenProps> = ({
  scenarioId,
  onBack,
  onCompleteSession,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showArabicTranslation, setShowArabicTranslation] = useState<Record<string, boolean>>({});
  const [currentHints, setCurrentHints] = useState<ContextualHint[]>([]);
  const [isHintUsedForCurrentTurn, setIsHintUsedForCurrentTurn] = useState(false);
  const [selectedWordForInsight, setSelectedWordForInsight] = useState<VocabularyEntity | null>(null);
  const [startTime] = useState<number>(Date.now());
  const [sessionMode, setSessionMode] = useState<SessionMode | null>(null);
  const [sessionId] = useState<string>(() => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

  const scenario = useLiveQuery(() => db.scenarios.get(scenarioId));
  const user = useLiveQuery(() => db.users.get('current_user'));
  const vocabulary = useLiveQuery(() => db.vocabulary.toArray()) || [];
  const savedWords = useLiveQuery(() => db.saved_words.toArray()) || [];

  const chatEndRef = useRef<HTMLDivElement>(null);
  const [currentLevel, setCurrentLevel] = useState<CEFRLevel>(user?.cefrLevel || 'A1');
  const [isSessionCompleted, setIsSessionCompleted] = useState(false);

  // Sync user's default level initially if not yet changed
  useEffect(() => {
    if (user?.cefrLevel) {
      setCurrentLevel(user.cefrLevel);
    }
  }, [user?.cefrLevel]);

  const effectiveLevel = currentLevel;

  // Automated CEFR Exchange Target turns (Rule 7)
  const targetTurns = sessionMode === 'immersion'
    ? (effectiveLevel === 'A1' || effectiveLevel === 'A2' ? 8 : 10)
    : effectiveLevel === 'A1' ? 3 : effectiveLevel === 'A2' ? 4 : effectiveLevel === 'B1' ? 5 : 6;
  const userTurnsCount = messages.filter((m) => m.sender === 'USER').length;

  // Real-time difficulty nudge handlers (Rule: Real-time difficulty nudge أسهل / أصعب)
  const handleNudgeDifficulty = (direction: 'easier' | 'harder') => {
    const levelOrder: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];
    const currentIndex = levelOrder.indexOf(effectiveLevel);
    if (direction === 'easier' && currentIndex > 0) {
      const newLvl = levelOrder[currentIndex - 1];
      setCurrentLevel(newLvl);
      triggerHaptic('light');
    } else if (direction === 'harder' && currentIndex < levelOrder.length - 1) {
      const newLvl = levelOrder[currentIndex + 1];
      setCurrentLevel(newLvl);
      triggerHaptic('light');
    }
  };

  const { speak, isPlaying } = useSpeechOutput({ speed: user?.speechSpeed || 1.0 });

  const { isListening, transcript, isSupported, startListening, stopListening } = useSpeechInput({
    onResult: (text, isFinal) => {
      setInputText(text);
      if (isFinal) {
        stopListening();
      }
    },
  });

  // Auto scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Initial message and starter hints (Rule 5: No call needed for turn 0)
  useEffect(() => {
    if (!scenario || !sessionMode) return;

    const initialMsgText =
      effectiveLevel === 'A1'
        ? scenario.initial_message_a1
        : effectiveLevel === 'A2'
        ? scenario.initial_message_a2
        : effectiveLevel === 'B1'
        ? scenario.initial_message_b1
        : scenario.initial_message_b2;

    const welcomeMsg: ChatMessage = {
      id: 'msg_initial',
      sender: 'KATZU',
      germanText: initialMsgText || 'Hallo! Wie kann ich Ihnen helfen?',
      arabicTranslation: scenario.title_ar,
      timestamp: Date.now(),
    };

    setMessages([welcomeMsg]);

    // Load cached starter phrases as initial hints
    db.starter_phrases
      .where('scenario_id')
      .equals(scenarioId)
      .toArray()
      .then((phrases) => {
        if (phrases.length > 0) {
          setCurrentHints(
            phrases.map((p) => ({ german: p.german, arabic: p.translation_ar }))
          );
        }
      });
  }, [scenario, scenarioId, effectiveLevel, sessionMode]);

  // Handle German word click for insight
  const handleWordClick = (wordRaw: string) => {
    const cleaned = wordRaw.replace(/[^a-zA-ZäöüÄÖÜß]/g, '');
    const found = vocabulary.find(
      (v) => v.german.toLowerCase() === cleaned.toLowerCase()
    );
    if (found) {
      setSelectedWordForInsight(found);
    }
  };

  // Toggle saving word in insight sheet
  const handleToggleSaveWord = async (wordId: number) => {
    const exists = savedWords.some((sw) => sw.wordId === wordId);
    if (exists) {
      await db.saved_words.delete(wordId);
    } else {
      await db.saved_words.put({ wordId, savedAt: Date.now() });
    }
  };

  // Rule 5: Exactly ONE /ai/turn call per user turn
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isGenerating) return;

    setInputText('');
    stopListening();

    const wasHintUsed = isHintUsedForCurrentTurn;
    setIsHintUsedForCurrentTurn(false);

    // 1. Add User message
    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'USER',
      germanText: text,
      wasHintUsed,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsGenerating(true);

    const isFinalTurn = userTurnsCount + 1 >= targetTurns;

    // 2. Call Worker /ai/turn (Executes Call A and Call B in parallel on Worker)
    try {
      const historyPayload = newMessages.map((m) => ({
        sender: m.sender === 'USER' ? 'user' : 'model',
        text: m.germanText,
      }));

      const res = await workerClient.sendTurn({
        scenarioId,
        userMessage: text,
        history: historyPayload,
        cefrLevel: effectiveLevel,
        scenarioTitle: scenario?.title_de || '',
        sarcasmLevel: user?.sarcasmLevel || 'SASSY',
        isFinalTurn,
        mode: sessionMode === 'immersion' ? 'extended' : 'roleplay',
        sessionId,
      });

      // 3. Form Katzu reply with pedagogical evaluation embedded
      const katzuReply: ChatMessage = {
        id: `ktz_${Date.now()}`,
        sender: 'KATZU',
        germanText: res.germanReply,
        arabicTranslation: res.arabicTranslation,
        hasCorrection: res.isCorrect === false,
        originalMistake: res.mistakeSegment,
        correctedGerman: res.correctedSegment,
        grammarRule: res.grammarRule,
        explanationAr: res.explanationAr,
        roastComment: res.roastComment,
        positiveNoteAr: res.positiveNoteAr,
        timestamp: Date.now(),
      };

      const updatedHistory = [...newMessages, katzuReply];
      setMessages(updatedHistory);

      // Speak Katzu's reply automatically
      speak(res.germanReply);

      // Save mistake to database if an error occurred
      if (res.isCorrect === false && res.mistakeSegment && res.correctedSegment) {
        await db.mistakes.put({
          userId: 'current_user',
          scenarioId,
          original: res.mistakeSegment,
          corrected: res.correctedSegment,
          grammarRule: res.grammarRule || 'قواعد نحوية',
          roastComment: res.roastComment,
          timestamp: Date.now(),
          wasHintUsed,
        });
      }

      // Fetch fresh contextual hints from AI router for next turn
      workerClient
        .fetchHints({
          scenarioTitle: scenario?.title_de || '',
          cefrLevel: effectiveLevel,
          lastAiReply: res.germanReply,
          history: updatedHistory.map((m) => ({
            sender: m.sender === 'USER' ? 'user' : 'model',
            text: m.germanText,
          })),
        })
        .then((newHints) => {
          if (newHints && newHints.length > 0) {
            setCurrentHints(newHints);
          }
        })
        .catch(() => {});

      // Check for completion (Rule 7)
      if (isFinalTurn) {
        setIsSessionCompleted(true);
        triggerHaptic('success');
        setTimeout(() => {
          finishSession(updatedHistory);
        }, 3200);
      }
    } catch (e) {
      console.error('Conversation turn failed:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseHint = (hint: ContextualHint) => {
    setInputText(hint.german);
    setIsHintUsedForCurrentTurn(true);
    triggerHaptic('light');
  };

  const finishSession = (finalMessages: ChatMessage[]) => {
    const userMsgs = finalMessages.filter((m) => m.sender === 'USER');
    const independentMsgs = userMsgs.filter((m) => !m.wasHintUsed);
    const assistedMsgs = userMsgs.filter((m) => m.wasHintUsed);

    // Rule 6: Session accuracy is computed strictly on independent user sentences
    const userMsgTurns = userMsgs.map((uMsg) => {
      // Find the immediately following Katzu message
      const uIndex = finalMessages.findIndex((m) => m.id === uMsg.id);
      const nextKatzuMsg = finalMessages.slice(uIndex + 1).find((m) => m.sender === 'KATZU');
      const hasError = !!nextKatzuMsg?.hasCorrection;
      return {
        wasHintUsed: !!uMsg.wasHintUsed,
        hasError,
      };
    });

    const independentTurns = userMsgTurns.filter((t) => !t.wasHintUsed);
    const accuracy = calculateIndependentAccuracy(
      independentTurns.map((turn) => ({ hasError: turn.hasError })),
    );

    const mistakesList = finalMessages
      .filter((m) => m.hasCorrection && m.originalMistake && m.correctedGerman)
      .map((m) => ({
        original: m.originalMistake!,
        corrected: m.correctedGerman!,
        grammarRule: m.grammarRule || 'قاعدة نحوية',
      }));

    const duration = Math.round((Date.now() - startTime) / 1000);

    // Save session record in Dexie
    const sessionRecord: SessionEntity = {
      id: sessionId,
      scenarioId,
      scenarioTitle: scenario?.title_ar || '',
      cefrLevel: effectiveLevel,
      sentencesSpoken: userMsgs.length,
      wordsLearned: userMsgs.length * 4,
      accuracyPercent: accuracy,
      durationSeconds: duration,
      timestamp: Date.now(),
      wasIndependentOnly: assistedMsgs.length === 0,
      independentSentences: independentMsgs.length,
      hintAssistedSentences: assistedMsgs.length,
      mode: sessionMode || 'quick',
    };
    db.sessions.put(sessionRecord);

    // Update local learning stats; trial entitlement is enforced by the Worker.
    const earnedXp = Math.round((accuracy ?? 0) * 1.5) + (assistedMsgs.length === 0 ? 50 : 25);

    db.users.update('current_user', {
      totalXp: (user?.totalXp || 0) + earnedXp,
      lastActiveDate: new Date().toISOString().split('T')[0],
      updatedAt: Date.now(),
    });

    // Auto sync progress to cloud if authenticated
    if (user?.idToken) {
      workerClient.syncProgress(user.idToken).catch((err) => {
        console.warn('Background progress sync failed:', err);
      });
    }

    onCompleteSession({
      scenarioId,
      scenarioTitle: scenario?.title_ar || '',
      cefrLevel: effectiveLevel,
      sentencesSpoken: userMsgs.length,
      accuracyPercent: accuracy,
      durationSeconds: duration,
      independentSentences: independentMsgs.length,
      assistedSentences: assistedMsgs.length,
      mistakes: mistakesList,
    });
  };

  if (!sessionMode) {
    return (
      <main className="min-h-screen bg-black text-text-primary p-6 max-w-md mx-auto flex flex-col justify-center">
        <button
          type="button"
          onClick={onBack}
          className="self-start p-2 rounded-2xl bg-surface-card border border-border-subtle mb-8"
          aria-label="العودة"
        >
          <ArrowRight className="w-5 h-5 text-text-secondary" />
        </button>
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold font-arabic mb-2">اختر طريقة التدريب</h1>
          <p className="text-sm text-text-secondary font-arabic">
            اختر الوقت المناسب لك، وسنحافظ على تقدمك بصراحة.
          </p>
        </div>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setSessionMode('quick')}
            className="w-full text-start rounded-3xl bg-surface-card border border-primary/40 p-5 hover:bg-surface-subtle"
          >
            <strong className="block font-arabic text-primary mb-1">تمرين سريع</strong>
            <span className="text-xs text-text-secondary font-arabic">
              {effectiveLevel === 'A1' ? 3 : effectiveLevel === 'A2' ? 4 : effectiveLevel === 'B1' ? 5 : 6} جولات مركزة
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSessionMode('immersion')}
            className="w-full text-start rounded-3xl bg-surface-card border border-border-subtle p-5 hover:bg-surface-subtle"
          >
            <strong className="block font-arabic text-primary mb-1">تحدي واقعي مكثف</strong>
            <span className="text-xs text-text-secondary font-arabic">
              {effectiveLevel === 'A1' || effectiveLevel === 'A2' ? 8 : 10} جولات مع سياق أطول
            </span>
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-black text-text-primary flex flex-col justify-between max-w-md mx-auto relative">
      {/* Sticky Header with Turn Pill */}
      <div className="p-4 border-b border-border-subtle bg-black/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
        <button
          onClick={onBack}
          className="p-2 rounded-2xl bg-surface-card border border-border-subtle hover:bg-surface-subtle transition-colors"
        >
          <ArrowRight className="w-5 h-5 text-text-secondary" />
        </button>

        {/* Turn Progress Pill & Real-time Difficulty Nudge (Rule: أسهل / أصعب) */}
        <div className="flex items-center gap-1.5 p-1 rounded-full bg-surface-card border border-border-subtle text-xs font-semibold">
          <button
            onClick={() => handleNudgeDifficulty('easier')}
            disabled={effectiveLevel === 'A1'}
            className="px-2 py-0.5 rounded-full text-[11px] font-arabic text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-secondary transition-colors"
            title="تقليل الصعوبة"
          >
            أسهل
          </button>
          <Badge variant="primary" size="sm">
            {effectiveLevel}
          </Badge>
          <button
            onClick={() => handleNudgeDifficulty('harder')}
            disabled={effectiveLevel === 'B2'}
            className="px-2 py-0.5 rounded-full text-[11px] font-arabic text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-secondary transition-colors"
            title="زيادة الصعوبة"
          >
            أصعب
          </button>
        </div>

        {/* Turn Counter Pill (Auto-completes dynamically based on CEFR level) */}
        <div className="px-2.5 py-1 rounded-full bg-surface-card border border-border-subtle text-[11px] font-semibold text-text-secondary">
          الجولة {Math.min(userTurnsCount + 1, targetTurns)} / {targetTurns}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-44">
        {messages.map((msg) => {
          const isKatzu = msg.sender === 'KATZU';
          const isTransVisible = showArabicTranslation[msg.id];

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isKatzu ? 'items-start' : 'items-end'}`}
            >
              <div
                className={`max-w-[88%] rounded-3xl p-4 border transition-all ${
                  isKatzu
                    ? 'bg-surface-card border-border-subtle text-text-primary rounded-tl-sm'
                    : 'bg-primary text-white border-primary/40 rounded-tr-sm shadow-glow-purple'
                }`}
              >
                {/* German text with clickable words */}
                <div className="text-sm font-semibold leading-relaxed mb-1">
                  {msg.germanText.split(' ').map((word, wIdx) => (
                    <span
                      key={wIdx}
                      onClick={() => handleWordClick(word)}
                      className="cursor-pointer hover:underline inline-block mx-0.5"
                    >
                      <GermanText>{word}</GermanText>
                    </span>
                  ))}
                </div>

                {/* Translation toggle & Audio */}
                {isKatzu && (
                  <div className="flex items-center justify-between pt-2 mt-2 border-t border-border-subtle/50 text-xs">
                    <button
                      onClick={() => speak(msg.germanText)}
                      className="text-primary hover:text-primary-container p-1 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                    {msg.arabicTranslation && (
                      <button
                        onClick={() =>
                          setShowArabicTranslation((prev) => ({
                            ...prev,
                            [msg.id]: !prev[msg.id],
                          }))
                        }
                        className="text-text-secondary hover:text-text-primary font-arabic flex items-center gap-1 text-[11px]"
                      >
                        <Languages className="w-3.5 h-3.5" />
                        {isTransVisible ? 'إخفاء الترجمة' : 'عرض الترجمة'}
                      </button>
                    )}
                  </div>
                )}

                {/* Visible Arabic translation */}
                {isTransVisible && msg.arabicTranslation && (
                  <div className="mt-2 pt-2 border-t border-border-subtle/50 text-xs font-arabic text-text-secondary">
                    {msg.arabicTranslation}
                  </div>
                )}
              </div>

              {/* Pedagogical Evaluation Card for User Mistake */}
              {msg.hasCorrection && (
                <div className="max-w-[88%] mt-2 p-3.5 rounded-2xl bg-surface-subtle border border-status-error/40 text-xs space-y-2 animate-fade-in text-start">
                  <div className="flex items-center gap-1.5 text-status-error font-bold">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>تصحيح كَاتْزُو السريع:</span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-status-error line-through text-opacity-80">
                      <GermanText>{msg.originalMistake}</GermanText>
                    </div>
                    <div className="text-status-success font-bold">
                      <GermanText>{msg.correctedGerman}</GermanText>
                    </div>
                  </div>

                  {msg.grammarRule && (
                    <div className="font-mono text-cyan-300 text-[11px] bg-surface-card p-1.5 rounded-lg border border-border-subtle">
                      قاعدة: {msg.grammarRule}
                    </div>
                  )}

                  {msg.explanationAr && (
                    <p className="text-text-secondary font-arabic text-[11px] leading-relaxed">
                      {msg.explanationAr}
                    </p>
                  )}

                  {msg.positiveNoteAr && (
                    <p className="text-status-success font-arabic text-[11px] font-semibold">
                      ✦ {msg.positiveNoteAr}
                    </p>
                  )}

                  {msg.roastComment && (
                    <p className="text-status-learning font-arabic italic text-[11px]">
                      «{msg.roastComment}»
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {isGenerating && (
          <div className="flex items-center gap-2 text-xs text-text-secondary p-3 bg-surface-card rounded-2xl w-fit border border-border-subtle animate-pulse">
            <KatzuMascot name="avatar" className="w-5 h-5" />
            <span>كَاتْزُو يفكر في الرد...</span>
          </div>
        )}

        {/* Rule 7: Celebration Card on Exchange Completion */}
        {isSessionCompleted && (
          <div className="p-4 rounded-3xl bg-surface-card border border-primary/40 shadow-glow-purple flex items-center gap-3 animate-fade-in my-2">
            <KatzuMascot name="celebrating" className="w-12 h-12 flex-shrink-0 object-contain" />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-status-success mb-0.5">
                <CheckCircle2 className="w-4 h-4" />
                اكتملت محادثة السيناريو بنجاح!
              </div>
              <p className="text-[11px] text-text-secondary font-arabic">
                أحسنت! جاري إعداد تقرير أدائك اللغوي مع كَاتْزُو...
              </p>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Floating Bottom Input Bar & Pre-fetched Hints */}
      <div className="fixed bottom-0 start-0 end-0 bg-gradient-to-t from-black via-black/95 to-transparent p-4 max-w-md mx-auto z-20 space-y-2.5">
        {/* Next-turn Contextual Hints Bar */}
        {currentHints.length > 0 && !isGenerating && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <div className="flex-shrink-0 p-1.5 rounded-xl bg-surface-card text-primary">
              <Lightbulb className="w-3.5 h-3.5" />
            </div>
            {currentHints.map((hint, hIdx) => (
              <button
                key={hIdx}
                onClick={() => handleUseHint(hint)}
                className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-surface-card border border-border-subtle hover:border-primary/40 text-xs font-semibold text-text-secondary hover:text-text-primary transition-all flex flex-col items-start"
              >
                <GermanText className="text-primary font-bold">{hint.german}</GermanText>
                <span className="text-[10px] text-text-muted">{hint.arabic}</span>
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        {!isSupported && (
          <p className="text-[11px] text-text-muted font-arabic mb-2">
            الإدخال الصوتي غير متاح في هذا المتصفح؛ يمكنك الكتابة بالألمانية هنا.
          </p>
        )}
        <div className="flex items-center gap-2">
          {/* Mic Button (STT) */}
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={!isSupported}
            aria-label={isSupported ? 'بدء الإدخال الصوتي' : 'الإدخال الصوتي غير متاح'}
            className={`p-3.5 rounded-2xl border transition-all flex items-center justify-center flex-shrink-0 ${
              isListening
                ? 'bg-status-error border-status-error text-white animate-pulse shadow-glow-purple'
                : 'bg-surface-card border-border-subtle text-primary hover:bg-surface-subtle'
            }`}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <input
            type="text"
            dir="ltr"
            placeholder={isListening ? 'أنا أستمع إليك... تحدث الآن' : 'اكتب جملتك بالألمانية أو اضغط المايك...'}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            className="flex-1 h-12 bg-surface-card border border-border-subtle focus:border-primary rounded-2xl px-4 text-sm font-german outline-none transition-all placeholder:font-arabic placeholder:text-xs placeholder:text-text-muted"
          />

          <Button
            size="md"
            className="h-12 w-12 rounded-2xl p-0 flex items-center justify-center flex-shrink-0"
            disabled={!inputText.trim() || isGenerating}
            onClick={() => handleSendMessage()}
          >
            <Send className="w-5 h-5 rotate-180" />
          </Button>
        </div>
      </div>

      {/* Word Insight Bottom Sheet */}
      <WordInsightBottomSheet
        word={selectedWordForInsight}
        isOpen={!!selectedWordForInsight}
        onClose={() => setSelectedWordForInsight(null)}
        isSaved={savedWords.some((sw) => sw.wordId === selectedWordForInsight?.id)}
        onToggleSave={handleToggleSaveWord}
      />
    </div>
  );
};
