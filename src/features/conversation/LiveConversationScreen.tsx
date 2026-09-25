import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { enrolMistake } from '@/lib/srs/store';
import { workerClient } from '@/lib/api/workerClient';
import { useSpeechInput } from '@/lib/speech/useSpeechInput';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { triggerHaptic } from '@/lib/utils/haptics';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { AudioWaveform } from '@/components/common/AudioWaveform';
import { HintOption } from '@/components/common/HintOption';
import { WordInsightBottomSheet } from '@/components/sheets/WordInsightBottomSheet';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import { isProEffective } from '@/lib/utils/subscription';
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
  ChevronDown,
  ChevronUp,
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
import { localDateKey, recalculateStreak } from '@/lib/utils/streak';
import { logError, logEvent } from '@/lib/utils/diagnostics';

export interface LiveConversationScreenProps {
  scenarioId: string;
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

export const LiveConversationScreen: React.FC<LiveConversationScreenProps> = ({
  scenarioId,
  onBack,
  onOpenSubscription,
  onCompleteSession,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showArabicTranslation, setShowArabicTranslation] = useState<Record<string, boolean>>({});
  // Global switch: every Katzu message shows its Arabic translation at once.
  // A per-message toggle still wins because an explicit override beats the global.
  const [showAllTranslations, setShowAllTranslations] = useState(false);
  const [currentHints, setCurrentHints] = useState<ContextualHint[]>([]);
  const [isHintRevealed, setIsHintRevealed] = useState(false);
  // The sheet shows one suggestion by default; the other conversational moves
  // are one tap away rather than competing with the chat.
  const [isHintExpanded, setIsHintExpanded] = useState(false);
  // Cached starter phrases are the always-available hint floor — shown when AI
  // hints fail/paywall and refreshed from the Worker when the cache is empty.
  const [starterHints, setStarterHints] = useState<ContextualHint[]>([]);
  const [turnError, setTurnError] = useState<{ failedText: string; message: string } | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [isHintUsedForCurrentTurn, setIsHintUsedForCurrentTurn] = useState(false);
  const [paywall, setPaywall] = useState<{ isOpen: boolean; title: string; description: string }>({
    isOpen: false,
    title: '',
    description: '',
  });
  const [selectedWordForInsight, setSelectedWordForInsight] = useState<VocabularyEntity | null>(null);
  const [startTime] = useState<number>(Date.now());
  const [sessionMode, setSessionMode] = useState<SessionMode | null>(null);
  const [sessionId] = useState<string>(() => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

  const scenario = useLiveQuery(() => db.scenarios.get(scenarioId));
  const user = useLiveQuery(() => db.users.get('current_user'));
  const isProUser = isProEffective(user);
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

  // Free accounts stay at their level: the أسهل/أصعب nudge is Pro-only, so a
  // free user can never steer the AI into a level the server will reject.
  const handleNudgeDifficulty = (direction: 'easier' | 'harder') => {
    if (!isProUser) {
      setPaywall({
        isOpen: true,
        title: 'تغيير المستوى أثناء المحادثة ميزة Pro',
        description:
          'في الخطة المجانية تتدرب على مستواك الحالي فقط. رَقِّ حسابك لفتح التعديل الفوري للصعوبة (أسهل / أصعب) وكل المستويات من A1 حتى B2.',
      });
      return;
    }
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
    onError: (error) => {
      // Surface STT failures so the mic button never appears silently broken.
      const messages: Record<string, string> = {
        'not-allowed': 'لم يُسمح بالوصول للمايك. اسمح بالوصول من إعدادات المتصفح ثم أعد المحاولة.',
        'service-not-allowed': 'خدمة التعرف على الصوت غير مفعلة في هذا المتصفح. يمكنك الكتابة بدلاً من التحدث.',
        'network': 'التعرف على الصوت يحتاج اتصالاً بالإنترنت. تحقق من شبكتك أو اكتب جملتك.',
        'no-speech': 'لم أسمع شيئاً — اقترب من المايك وحاول مرة أخرى.',
        'audio-capture': 'لم أتمكن من الوصول للمايك. تأكد من توصيله والمحاولة مجدداً.',
        'language-not-supported': 'التعرف الصوتي الألماني غير مدعوم في هذا المتصفح — استخدم Edge أو Chrome على أندرويد، أو اكتب جملتك.',
      };
      setMicError(messages[error] || `تعذر الإدخال الصوتي (${error}). يمكنك الكتابة بالألمانية بدلاً من ذلك.`);
      logError('stt', `Speech recognition error: ${error}`);
    },
  });

  // Auto scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Initial message and starter hints (Rule 5: No call needed for turn 0)
  // Cached D1 starter phrases are the always-available hint floor: if the AI
  // hints call fails or is paywalled, the user still gets real suggestions.
  const loadStarterHints = useCallback(async () => {
    try {
      let phrases = await db.starter_phrases
        .where('scenario_id')
        .equals(scenarioId)
        .toArray();
      // Empty cache (first launch / fresh device): fetch this scenario's real
      // starter phrases from the Worker, then show them.
      if (phrases.length === 0) {
        const detail = await workerClient.fetchScenarioDetail(scenarioId);
        if (detail.starterPhrases.length > 0) {
          logEvent('hints', `Starter phrases fetched from worker (${detail.starterPhrases.length})`);
          phrases = detail.starterPhrases;
        }
      }
      if (phrases.length > 0) {
        setStarterHints(phrases.map((p) => ({ german: p.german, arabic: p.translation_ar })));
      }
    } catch {
      /* offline with empty cache — hints bar simply stays hidden */
    }
  }, [scenarioId]);

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
    setTurnError(null);

    // Load cached starter phrases as initial hints
    void loadStarterHints();

    // Give the opener a real Arabic translation (edge-cached) instead of the
    // scenario title placeholder, so the global translation toggle works from
    // the very first message.
    if (welcomeMsg.germanText) {
      workerClient
        .translateText(welcomeMsg.germanText)
        .then((ar) => {
          if (ar) {
            setMessages((prev) =>
              prev.map((m) => (m.id === 'msg_initial' ? { ...m, arabicTranslation: ar } : m)),
            );
          }
        })
        .catch(() => {
          /* placeholder title stays — translation is a progressive enhancement */
        });
    }
  }, [scenario, scenarioId, effectiveLevel, sessionMode, loadStarterHints]);

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
    setTurnError(null);
    setMicError(null);

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
        followupAr: res.followupAr || undefined,
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
        const mistake = {
          userId: 'current_user',
          scenarioId,
          original: res.mistakeSegment,
          corrected: res.correctedSegment,
          grammarRule: res.grammarRule || 'قواعد نحوية',
          roastComment: res.roastComment,
          timestamp: Date.now(),
          wasHintUsed,
        };
        const mistakeId = await db.mistakes.put(mistake);
        // Every correction earns a scheduled retrieval: the app remembers what
        // this learner keeps getting wrong, instead of only archiving it.
        await enrolMistake({ ...mistake, id: mistakeId });
      }

      // The turn response already carries ONE context-aware hint (same AI
      // call as the reply — no extra network round-trip). Fall back to the
      // starter-phrase floor when the model didn't provide one. The pill
      // re-arms so each new turn offers a fresh on-demand suggestion.
      if (res.hints && res.hints.length > 0) {
        setCurrentHints(res.hints);
        logEvent('hints', `Embedded hint loaded (${res.hints.length})`);
      } else {
        void loadStarterHints();
      }
      setIsHintRevealed(false);
      setIsHintExpanded(false);

      // Check for completion (Rule 7)
      if (isFinalTurn) {
        setIsSessionCompleted(true);
        triggerHaptic('success');
        setTimeout(() => {
          finishSession(updatedHistory);
        }, 3200);
      }
    } catch (e: any) {
      if (e?.code === 'PAYWALL_REQUIRED') {
        // Server-side entitlement rejection (level lock or quota) — show the
        // Katzu paywall instead of a dead error in the chat.
        setPaywall({
          isOpen: true,
          title: 'هذا المستوى ميزة Pro',
          description: e?.message || 'رَقِّ حسابك لفتح كل المستويات من A1 حتى B2 ومحادثات غير محدودة.',
        });
      } else {
        // The user's message stays in the transcript with a visible error card
        // and a one-tap retry — never a silent spinner or a swallowed error.
        const message =
          e?.code === 'REQUEST_TIMEOUT'
            ? 'انتهت مهلة الاتصال بالخادم. تحقق من الإنترنت ثم أعد الإرسال.'
            : e?.code === 'NETWORK_ERROR'
              ? 'تعذر الوصول إلى الخادم. تحقق من اتصالك بالإنترنت وحاول مجدداً.'
              : e?.code === 'WORKER_URL_MISSING'
                ? 'رابط الخادم غير مضبوط في هذا الإصدار — حدّث التطبيق أو تواصل مع الدعم.'
                : e?.message || 'تعذر إرسال الجملة. تحقق من اتصالك وأعد المحاولة.';
        setTurnError({ failedText: text, message });
        logError('ai/turn', `Turn failed (${e?.code || 'UNKNOWN'}): ${message}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const retryFailedTurn = () => {
    if (!turnError) return;
    const { failedText } = turnError;
    setTurnError(null);
    // Remove the failed user message before re-sending so the transcript has
    // exactly one copy of the sentence.
    setMessages((prev) => {
      const idx = prev.map((m) => m.germanText).lastIndexOf(failedText);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
    handleSendMessage(failedText);
  };

  const handleUseHint = (hint: ContextualHint) => {
    setInputText(hint.german);
    setIsHintUsedForCurrentTurn(true);
    setMicError(null);
    triggerHaptic('light');
  };

  // AI hints when loaded; otherwise the D1 starter-phrase floor. The user must
  // never face an empty suggestions bar mid-conversation.
  const visibleHints = currentHints.length > 0 ? currentHints : starterHints;

  const [isRefreshingHints, setIsRefreshingHints] = useState(false);
  const refreshHints = async () => {
    if (isRefreshingHints) return;
    setIsRefreshingHints(true);
    try {
      const lastKatzu = [...messages].reverse().find((m) => m.sender === 'KATZU');
      if (lastKatzu) {
        const fresh = await workerClient.fetchHints({
          scenarioTitle: scenario?.title_de || '',
          cefrLevel: effectiveLevel,
          lastAiReply: lastKatzu.germanText,
          history: messages.map((m) => ({
            sender: m.sender === 'USER' ? 'user' : 'model',
            text: m.germanText,
          })),
        });
        if (fresh && fresh.length > 0) {
          setCurrentHints(fresh);
          logEvent('hints', `Hints refreshed manually (${fresh.length})`);
        } else {
          void loadStarterHints();
        }
      } else {
        void loadStarterHints();
      }
    } catch {
      void loadStarterHints();
    } finally {
      setIsRefreshingHints(false);
    }
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

    // Daily habit loop: consecutive day extends the streak, a missed day resets
    // it honestly, same-day repeats never inflate it (all logic unit-tested).
    const streakResult = recalculateStreak({
      lastActiveDate: user?.lastActiveDate,
      streakDays: user?.streakDays || 0,
    });

    db.users.update('current_user', {
      totalXp: (user?.totalXp || 0) + earnedXp,
      streakDays: streakResult.streakDays,
      lastActiveDate: localDateKey(),
      updatedAt: Date.now(),
    });

    // Auto sync progress to cloud if authenticated (session token only)
    if (user?.sessionToken) {
      workerClient.syncProgress(user.sessionToken).catch((err) => {
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
        <div className="flex items-center gap-1.5">
          {/* Global translation toggle: show/hide Arabic for all messages */}
          <button
            onClick={() => {
              setShowAllTranslations((v) => !v);
              setShowArabicTranslation({}); // clear per-message overrides
              triggerHaptic('light');
            }}
            aria-label={showAllTranslations ? 'إخفاء كل الترجمات' : 'إظهار كل الترجمات'}
            title={showAllTranslations ? 'إخفاء كل الترجمات' : 'إظهار كل الترجمات'}
            className={`p-2 rounded-2xl border transition-colors ${
              showAllTranslations
                ? 'bg-primary/20 border-primary/50 text-primary'
                : 'bg-surface-card border-border-subtle text-text-secondary hover:bg-surface-subtle'
            }`}
          >
            <Languages className="w-4 h-4" />
          </button>
          <div className="px-2.5 py-1 rounded-full bg-surface-card border border-border-subtle text-[11px] font-semibold text-text-secondary">
            الجولة {Math.min(userTurnsCount + 1, targetTurns)} / {targetTurns}
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-44">
        {messages.map((msg) => {
          const isKatzu = msg.sender === 'KATZU';
          // Explicit per-message choice overrides the global toggle.
          const isTransVisible =
            msg.id in showArabicTranslation
              ? showArabicTranslation[msg.id]
              : showAllTranslations;

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
                {/* German text with clickable words — whole sentence lives in one
                    LTR-isolated block so RTL layout can never reorder the words
                    (Rule 8). Words stay clickable for the word-insight sheet. */}
                <div
                  dir="ltr"
                  style={{ unicodeBidi: 'isolate' }}
                  className={`text-sm font-semibold leading-relaxed mb-1 font-german ${isKatzu ? 'text-left' : 'text-right'}`}
                >
                  {msg.germanText.split(' ').map((word, wIdx) => (
                    <span
                      key={wIdx}
                      onClick={() => handleWordClick(word)}
                      className="cursor-pointer hover:underline"
                    >
                      {word}
                      {wIdx < msg.germanText.split(' ').length - 1 ? ' ' : ''}
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

                {/* Katzu's inviting follow-up question (keeps the conversation moving) */}
                {msg.sender === 'KATZU' && msg.followupAr && (
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] font-arabic text-status-learning">
                    <span aria-hidden>💬</span>
                    <span>{msg.followupAr}</span>
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

        {/* Failed-turn error card with retry — never a silent hang */}
        {turnError && !isGenerating && (
          <div className="p-3.5 rounded-2xl bg-surface-subtle border border-status-error/50 space-y-2 animate-fade-in">
            <div className="flex items-center gap-1.5 text-xs font-bold text-status-error">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>تعذر إرسال جملتك:</span>
            </div>
            <div dir="ltr" className="font-german text-xs text-text-secondary">{turnError.failedText}</div>
            <p className="text-[11px] font-arabic text-text-secondary">{turnError.message}</p>
            <button
              onClick={retryFailedTurn}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/20 border border-primary/50 text-primary text-xs font-bold font-arabic hover:bg-primary/30 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              إعادة المحاولة
            </button>
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
        {/* Hints as an on-demand button: a single 💡 pill that reveals the
            one context-aware suggestion when tapped — no always-visible strip
            competing with the chat. */}
        {visibleHints.length > 0 && (
          <div className="flex flex-col gap-2">
            {!isHintRevealed && (
              <button
                onClick={() => { setIsHintRevealed(true); triggerHaptic('light'); }}
                className="self-start flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-surface-card border border-primary/30 text-xs font-arabic font-semibold text-primary hover:border-primary/60 transition-all"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                اقتراح لردّك
              </button>
            )}
            {isHintRevealed && (
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Primary suggestion stays the only thing visible by
                      default; the expander reveals the other moves. */}
                  <HintOption hint={visibleHints[0]} onUse={() => handleUseHint(visibleHints[0])} primary />
                  {visibleHints.length > 1 && (
                    <>
                      <button
                        onClick={() => {
                          setIsHintExpanded((v) => !v);
                          triggerHaptic('light');
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-surface-subtle border border-border-subtle text-[11px] font-arabic font-semibold text-text-secondary hover:text-primary transition-colors"
                      >
                        <span>
                          {isHintExpanded ? 'إخفاء الخيارات الأخرى' : `خيارات أخرى في هذا الموقف (${visibleHints.length - 1})`}
                        </span>
                        {isHintExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {isHintExpanded &&
                        visibleHints.slice(1, 4).map((hint, hIdx) => (
                          <HintOption key={hIdx} hint={hint} onUse={() => handleUseHint(hint)} />
                        ))}
                    </>
                  )}
                </div>
                <button
                  onClick={refreshHints}
                  aria-label="تحديث الاقتراحات"
                  title="تحديث الاقتراحات"
                  className="flex-shrink-0 p-2 rounded-xl bg-surface-card border border-border-subtle text-text-secondary hover:text-primary transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingHints ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setIsHintRevealed(false)}
                  aria-label="إخفاء الاقتراح"
                  className="flex-shrink-0 p-2 rounded-xl text-text-secondary hover:text-text-primary transition-colors"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mic / STT error banner */}
        {micError && (
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-surface-subtle border border-status-learning/40 text-[11px] font-arabic text-status-learning">
            <MicOff className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1">{micError}</span>
            <button
              onClick={() => setMicError(null)}
              aria-label="إخفاء"
              className="text-text-muted hover:text-text-primary"
            >
              ✕
            </button>
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
            onClick={() => {
              setMicError(null);
              if (isListening) {
                stopListening();
              } else {
                startListening();
              }
            }}
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
