import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { enrolMistake } from '@/lib/srs/store';
import { buildLearnerMemory } from '@/lib/coach/profile';
import { workerClient } from '@/lib/api/workerClient';
import { useSpeechInput } from '@/lib/speech/useSpeechInput';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { triggerHaptic } from '@/lib/utils/haptics';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { HintOption } from '@/components/common/HintOption';
import { WordInsightBottomSheet } from '@/components/sheets/WordInsightBottomSheet';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import { isProEffective } from '@/lib/utils/subscription';
import { servedLevel } from '@/lib/entitlement/trial';
import { KatzuThinking } from '@/components/effects/KatzuThinking';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { KatzuOrb, type OrbState } from '@/components/voice/KatzuOrb';
import { GlassButton } from '@/components/glass/GlassButton';
import { useMicLevel } from '@/lib/audio/useMicLevel';
import { planTurns } from '@/lib/conversation/turnPlan';
import {
  ArrowRight,
  Mic,
  MicOff,
  Send,
  Volume2,
  RefreshCw,
  Lightbulb,
  AlertTriangle,
  Languages,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Keyboard,
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
import { track } from '@/lib/analytics/client';
import {
  classifySpeechError,
  classifyTurnError,
  conversationReducer,
  initialConversationState,
  isTurnInFlight,
  isUsableTranscript,
  MIC_PERMISSION_MESSAGE_AR,
  UNUSABLE_TRANSCRIPT_MESSAGE_AR,
} from '@/lib/conversation/stateMachine';

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
  // One explicit conversation state machine owns every in-between state. The
  // derived values below are the only way the UI reads them, so a spinner can
  // never run beside an error card and two sends can never overlap.
  const [conversation, dispatch] = useReducer(conversationReducer, undefined, initialConversationState);
  const isGenerating = isTurnInFlight(conversation);
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
  // Derived, never stored: the machine already has exactly one error.
  const conversationError = conversation.error;
  const turnError =
    conversation.pendingText &&
    conversationError &&
    (conversationError.kind === 'network' ||
      conversationError.kind === 'ai_service' ||
      conversationError.kind === 'invalid_session')
      ? { failedText: conversation.pendingText, message: conversationError.messageAr }
      : null;
  const micError =
    conversationError &&
    (conversationError.kind === 'mic_permission' || conversationError.kind === 'speech_recognition')
      ? conversationError.messageAr
      : null;
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
  const [currentLevel, setCurrentLevel] = useState<CEFRLevel>(servedLevel(user?.cefrLevel, isProUser));
  const isSessionCompleted = conversation.status === 'completed';
  const firstIndependentTrackedRef = useRef(false);
  const inFlightRef = useRef(false);

  // Sync the episode's level once the learner row is loaded, and again if they
  // upgrade mid-session — Pro unlocks the level the placement measured, and the
  // conversation should follow without a reload.
  useEffect(() => {
    setCurrentLevel(servedLevel(user?.cefrLevel, isProUser));
  }, [user?.cefrLevel, isProUser]);

  const effectiveLevel = currentLevel;

  // Turn pacing comes from the explicit, tested rule in turnPlan.ts — the screen
  // no longer decides session length, so the documented and implemented numbers
  // cannot drift apart.
  const targetTurns = planTurns(sessionMode ?? 'quick', effectiveLevel);
  const userTurnsCount = messages.filter((m) => m.sender === 'USER').length;

  // The أسهل/أصعب nudge is Pro-only. A free conversation runs at the level the
  // trial serves, and stepping away from it is the one thing the server would
  // refuse — so the control that could do that is the control that asks for Pro.
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

  const { speak } = useSpeechOutput({ speed: user?.speechSpeed || 1.0 });

  // Recognition and the analyser are two APIs over the same microphone, so both
  // are released from the one place the learner stops speaking. The ref lets the
  // speech hook close the audio graph without depending on its declaration order.
  const micStopRef = useRef<() => void>(() => {});
  const {
    isListening,
    isSupported,
    startListening,
    stopListening: stopRecognition,
  } = useSpeechInput({
    onResult: (text, isFinal) => {
      if (isFinal && !isUsableTranscript(text)) {
        // Recognition fired on noise: report a failed listening attempt rather
        // than sending a turn the learner never said. Whatever is already in the
        // box is left untouched — it may be a sentence they typed.
        stopRecognition();
        micStopRef.current();
        dispatch({ type: 'speech_failed', messageAr: UNUSABLE_TRANSCRIPT_MESSAGE_AR });
        return;
      }
      setInputText(text);
      if (isFinal) {
        stopRecognition();
        micStopRef.current();
      }
    },
    onError: (error) => {
      // Every STT failure becomes a machine state, so the mic can never appear
      // silently broken and the typed fallback stays available.
      const classified = classifySpeechError(error);
      dispatch({
        type: classified.kind === 'mic_permission' ? 'mic_denied' : 'speech_failed',
        messageAr: classified.messageAr,
      });
      logError('stt', `Speech recognition error: ${error}`);
    },
  });

  // The orb is the microphone control, so it owns the real audio stream. Speech
  // recognition and the analyser are separate APIs over the same permission:
  // recognition gives words, the analyser gives the amplitude the orb moves to.
  const mic = useMicLevel();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const characterNameAr = scenario?.title_ar || 'المحادثة';

  /**
   * The orb's state is derived from the conversation machine — never from a
   * second set of booleans that could disagree with it. Quota and offline come
   * first because they are terminal for the turn, not transient.
   */
  const orbState: OrbState =
    conversation.status === 'quota_exhausted'
      ? 'quota'
      : conversation.status === 'offline'
        ? 'offline'
        : conversation.status === 'retryable_error'
          ? 'error'
          : conversation.status === 'generating_reply'
            ? 'replying'
            : conversation.status === 'evaluating'
              ? 'evaluating'
              : conversation.status === 'transcribing'
                ? 'transcribing'
                : isListening
                  ? 'listening'
                  : 'idle';

  // Magenta is reserved for a turn the learner actually got right — the last
  // evaluation produced no correction. It is never the resting colour.
  const lastEvaluation = [...messages].reverse().find((message) => message.sender === 'KATZU' && message.id !== 'msg_initial');
  const orbTone: 'lavender' | 'earned' =
    conversation.status === 'showing_feedback' && lastEvaluation && !lastEvaluation.hasCorrection
      ? 'earned'
      : 'lavender';

  const orbLabelAr = !isSupported
    ? 'الإدخال الصوتي غير متاح — اكتب بالألمانية'
    : isListening
      ? 'إيقاف الاستماع'
      : orbState === 'transcribing'
        ? 'جارٍ التعرف على كلامك'
        : orbState === 'evaluating' || orbState === 'replying'
          ? 'كَاتْزُو يعمل على ردّك'
          : orbState === 'quota'
            ? 'انتهت الجلسات المجانية'
            : orbState === 'offline'
              ? 'لا يوجد اتصال'
              : 'ابدأ التحدث';

  // Releasing the microphone is one action for the whole screen: speech
  // recognition and the audio analyser both stop, so the orb can never keep
  // reacting to a live microphone after the learner finished speaking.
  const stopListening = useCallback(() => {
    stopRecognition();
    micStopRef.current();
  }, [stopRecognition]);

  useEffect(() => {
    micStopRef.current = mic.stop;
  }, [mic.stop]);

  /**
   * Tap the orb to speak. The typed path is never closed by a failure: a denied
   * microphone raises the machine's mic_denied state, which keeps the learner's
   * existing text and points them at the input box.
   */
  const handleOrbPress = useCallback(async () => {
    dispatch({ type: 'dismiss_error' });
    if (isListening) {
      stopListening();
      return;
    }
    const failure = await mic.start();
    if (failure) {
      dispatch({
        type: failure === 'denied' ? 'mic_denied' : 'speech_failed',
        messageAr:
          failure === 'denied'
            ? MIC_PERMISSION_MESSAGE_AR
            : 'تعذّر تشغيل المايك في هذا المتصفح. يمكنك الكتابة — النتيجة نفسها.',
      });
      return;
    }
    startListening();
  }, [isListening, stopListening, startListening, mic]);

  /** The always-present escape hatch: stop listening and type instead. */
  const handleTypeInstead = useCallback(() => {
    if (isListening) stopListening();
    dispatch({ type: 'dismiss_error' });
    inputRef.current?.focus();
  }, [isListening, stopListening]);

  // Connectivity is part of the conversation state, not a separate banner: a
  // turn that cannot be sent must say so where the learner sent it from.
  useEffect(() => {
    const onOffline = () => dispatch({ type: 'going_offline' });
    const onOnline = () => dispatch({ type: 'back_online' });
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Backgrounding the tab mid-turn must not lose the turn: a browser that kills
  // the request fires the failure path, which keeps the learner's sentence.
  useEffect(() => {
    const onVisibility = () =>
      dispatch({ type: document.visibilityState === 'hidden' ? 'backgrounded' : 'foregrounded' });
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

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

  /**
   * The opener is the one Katzu message no AI call produces, so its Arabic is
   * fetched on its own. The first attempt can race the session-token exchange at
   * mount, hence one retry; after that the failure is shown honestly with a way
   * back, instead of a bubble that silently cannot be translated.
   */
  const requestOpenerTranslation = useCallback(async (messageId: string, germanText: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, translationState: 'pending' as const } : m)),
    );
    const arabic = await workerClient.translateTextReliable(germanText).catch(() => '');
    if (!arabic) {
      logError('ai/translate', 'Opener translation unavailable after one retry');
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? arabic
            ? { ...m, arabicTranslation: arabic, translationState: undefined }
            : { ...m, translationState: 'unavailable' as const }
          : m,
      ),
    );
  }, []);

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
      // No placeholder translation: the scenario title is a TOPIC, not a
      // translation of the opener, and showing it made the first bubble of every
      // conversation say something the German never said.
      translationState: 'pending',
      timestamp: Date.now(),
    };

    setMessages([welcomeMsg]);
    dispatch({ type: 'reset' });
    track('conversation_started', { scenarioId, kind: sessionMode });

    // Load cached starter phrases as initial hints
    void loadStarterHints();

    // The opener's Arabic comes from the edge-cached /ai/translate route, which
    // needs a session token — at mount it may not be exchanged yet, so a single
    // silent failure would leave the whole first bubble untranslated. Retry once
    // and, if it still fails, say so with a retry the learner can tap.
    requestOpenerTranslation(welcomeMsg.id, welcomeMsg.germanText);
  }, [scenario, scenarioId, effectiveLevel, sessionMode, loadStarterHints, requestOpenerTranslation]);

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

  // Rule 5: Exactly ONE /ai/turn call per user turn. The state machine refuses
  // a submit while a turn is in flight and the ref closes the window before the
  // next render, so a double-tap cannot buy two calls (and two units of quota)
  // for one sentence.
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || inFlightRef.current) return;
    inFlightRef.current = true;
    dispatch({ type: 'submit', text, turnId: Date.now() });
    await sendTurn(text);
  };

  const sendTurn = async (text: string) => {
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

    const isFinalTurn = userTurnsCount + 1 >= targetTurns;

    // 2. Call Worker /ai/turn (Executes Call A and Call B in parallel on Worker)
    try {
      // Everything BEFORE the message being sent. `newMessages` includes it, and
      // sending it in both places made the worker hand the model the learner's
      // sentence twice in a row — which is what let it answer the previous
      // question instead of the one on screen.
      const historyPayload = messages.map((m) => ({
        sender: m.sender === 'USER' ? 'user' : 'model',
        text: m.germanText,
      }));

      // What this learner keeps getting wrong, so the tutor can steer the
      // conversation into re-using it instead of meeting them as a stranger.
      // Read per turn on purpose: the correction from THIS turn is part of it
      // next turn, and the table is small.
      const learnerMemory = buildLearnerMemory(
        await db.mistakes.where('userId').equals('current_user').toArray(),
      );

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
        learnerMemory,
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
      dispatch({ type: 'turn_ok' });

      // The first sentence produced without a hint is the product's real "you
      // can speak" moment, and the funnel needs to know it happened.
      if (!wasHintUsed && !firstIndependentTrackedRef.current) {
        firstIndependentTrackedRef.current = true;
        track('first_independent_turn', { scenarioId, count: 1 });
      }

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
        dispatch({ type: 'complete' });
        triggerHaptic('success');
        setTimeout(() => {
          finishSession(updatedHistory);
        }, 3200);
      }
    } catch (e: any) {
      if (e?.code === 'PAYWALL_REQUIRED') {
        // Server-side entitlement rejection (level lock or quota) — show the
        // Katzu paywall instead of a dead error in the chat, and mark the quota
        // state so a retry cannot burn the learner's remaining allowance.
        dispatch({ type: 'quota_exhausted', messageAr: e?.message });
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
            ? 'انتهت مهلة الاتصال بالخادم. جملتك محفوظة — أعد الإرسال عندما يعود الاتصال.'
            : e?.code === 'NETWORK_ERROR'
              ? 'تعذر الوصول إلى الخادم. جملتك محفوظة هنا، أعد المحاولة.'
              : e?.code === 'WORKER_URL_MISSING'
                ? 'رابط الخادم غير مضبوط في هذا الإصدار — حدّث التطبيق أو تواصل مع الدعم.'
                : classifyTurnError(e).messageAr;
        dispatch({ type: 'turn_failed', error: { ...classifyTurnError(e), messageAr: message } });
        logError('ai/turn', `Turn failed (${e?.code || 'UNKNOWN'}): ${message}`);
      }
    } finally {
      inFlightRef.current = false;
    }
  };

  const retryFailedTurn = () => {
    const failedText = conversation.pendingText;
    if (!failedText || inFlightRef.current) return;
    // Remove the failed user message before re-sending so the transcript has
    // exactly one copy of the sentence.
    setMessages((prev) => {
      const idx = prev.map((m) => m.germanText).lastIndexOf(failedText);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
    inFlightRef.current = true;
    dispatch({ type: 'retry' });
    void sendTurn(failedText);
  };

  const handleUseHint = (hint: ContextualHint) => {
    setInputText(hint.german);
    setIsHintUsedForCurrentTurn(true);
    dispatch({ type: 'dismiss_error' });
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
    track('conversation_completed', {
      scenarioId,
      count: independentMsgs.length,
      state: accuracy === null ? 'unmeasured' : String(accuracy),
    });

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

        {/* Who the learner is speaking to, and which round this is. Navigation and
            translation keep the corners; difficulty moves to its own quiet row so
            the header holds one idea instead of three competing pills. */}
        <div className="flex min-w-0 flex-col items-center px-2">
          <span className="kz-ar-caption max-w-[44vw] truncate text-kz-ink">{characterNameAr}</span>
          <span className="kz-ar-micro text-kz-inkFaint">
            الجولة {Math.min(userTurnsCount + 1, targetTurns)} من {targetTurns} · {effectiveLevel}
          </span>
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
        </div>
      </div>

      {/* Difficulty nudge: real functionality, deliberately secondary — a learner
          who never touches it still finishes the episode. */}
      <div className="flex items-center justify-center gap-2 px-4 pb-1.5 pt-0.5">
        <button
          onClick={() => handleNudgeDifficulty('easier')}
          disabled={effectiveLevel === 'A1'}
          className="kz-ar-micro flex min-h-[32px] items-center rounded-full border border-white/10 px-2.5 text-kz-inkFaint transition-colors hover:text-kz-inkDim disabled:opacity-30 disabled:hover:text-kz-inkFaint"
        >
          أسهل
        </button>
        <span className="kz-ar-micro text-kz-inkFaint">صعوبة المحادثة</span>
        <button
          onClick={() => handleNudgeDifficulty('harder')}
          disabled={effectiveLevel === 'B2'}
          className="kz-ar-micro flex min-h-[32px] items-center rounded-full border border-white/10 px-2.5 text-kz-inkFaint transition-colors hover:text-kz-inkDim disabled:opacity-30 disabled:hover:text-kz-inkFaint"
        >
          أصعب
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-44">
        {messages.map((msg) => {
          const isKatzu = msg.sender === 'KATZU';
          // Explicit per-message choice overrides the global toggle. The
          // scenario opener is the exception: it is the only message a learner
          // has no way to guess at (no earlier turn to decode it against), so
          // its Arabic shows unless they hide it themselves.
          const isTransVisible =
            msg.id in showArabicTranslation
              ? showArabicTranslation[msg.id]
              : msg.id === 'msg_initial'
                ? true
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
                    {msg.arabicTranslation ? (
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
                    ) : msg.translationState === 'pending' ? (
                      <span className="flex items-center gap-1 text-[11px] font-arabic text-text-muted animate-pulse">
                        <Languages className="w-3.5 h-3.5" />
                        جارٍ الترجمة…
                      </span>
                    ) : msg.translationState === 'unavailable' ? (
                      <button
                        onClick={() => requestOpenerTranslation(msg.id, msg.germanText)}
                        className="flex items-center gap-1 text-[11px] font-arabic text-status-learning hover:text-status-learning/80"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        تعذرت الترجمة — إعادة المحاولة
                      </button>
                    ) : null}
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

              {/* Pedagogical Evaluation Card for User Mistake.
                  Two things matter here: the learner must be able to tell the
                  wrong line from the right one at a glance, and German text has
                  to stay direction-isolated — an English or German rule inside
                  this RTL card reorders its own punctuation ("…position .in
                  statements") unless it is wrapped in <bdi dir="auto">. */}
              {msg.hasCorrection && (
                <div className="max-w-[88%] mt-2 rounded-2xl bg-surface-subtle border border-status-error/40 text-xs overflow-hidden animate-fade-in text-start">
                  <div className="flex items-center gap-2 px-3.5 py-2 bg-status-error/10 border-b border-status-error/20">
                    <KatzuMascot name="avatar" className="w-5 h-5" />
                    <span className="font-arabic font-bold text-status-error">تصحيح كَاتْزُو</span>
                  </div>

                  <div className="p-3.5 space-y-3">
                    {(msg.originalMistake || msg.correctedGerman) && (
                      <div className="space-y-2">
                        {msg.originalMistake && (
                          <div className="flex items-baseline gap-2">
                            <span className="shrink-0 font-arabic text-[10px] text-text-muted">قلت</span>
                            <GermanText className="text-status-error/80 line-through decoration-status-error/60">
                              {msg.originalMistake}
                            </GermanText>
                          </div>
                        )}
                        {msg.correctedGerman && (
                          <div className="flex items-baseline gap-2">
                            <span className="shrink-0 font-arabic text-[10px] text-text-muted">الصحيح</span>
                            <GermanText className="font-bold text-status-success">
                              {msg.correctedGerman}
                            </GermanText>
                          </div>
                        )}
                      </div>
                    )}

                    {msg.grammarRule && (
                      <bdi
                        dir="auto"
                        className="inline-flex items-center gap-1.5 rounded-full bg-status-learning/10 border border-status-learning/25 px-2.5 py-1 font-arabic text-[11px] text-status-learning"
                      >
                        <span aria-hidden>📌</span>
                        {msg.grammarRule}
                      </bdi>
                    )}

                    {msg.explanationAr && (
                      <p className="font-arabic text-[11px] leading-relaxed text-text-secondary">
                        {msg.explanationAr}
                      </p>
                    )}

                    {msg.positiveNoteAr && (
                      <p className="font-arabic text-[11px] font-semibold text-status-success">
                        ✦ {msg.positiveNoteAr}
                      </p>
                    )}

                    {msg.roastComment && (
                      <p className="font-arabic text-[11px] italic text-status-learning/90 border-s-2 border-status-learning/40 ps-2.5">
                        «{msg.roastComment}»
                      </p>
                    )}
                  </div>
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
              {/* The Debrief is compiling: the same processing motion the rest of
                  the app uses, so "thinking" looks like one thing everywhere. */}
              <div className="mt-1">
                <KatzuThinking
                  size={22}
                  layout="inline"
                  labelAr="أحسنت! جاري إعداد تقرير أدائك اللغوي مع كَاتْزُو..."
                  className="gap-2"
                />
              </div>
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
              onClick={() => dispatch({ type: 'dismiss_error' })}
              aria-label="إخفاء"
              className="text-text-muted hover:text-text-primary min-h-[44px] min-w-[44px]"
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
        {/* The orb, one continuous object across every turn state, above the
            typing row. It owns the microphone; the input rows below are the
            always-available typed alternative. */}
        <div className="flex flex-col items-center gap-1">
          <KatzuOrb
            state={orbState}
            readLevel={mic.read}
            tone={orbTone}
            onPress={() => void handleOrbPress()}
            disabled={!isSupported || orbState === 'quota'}
            labelAr={orbLabelAr}
          />
          {orbState === 'listening' && (
            <span className="kz-ar-micro text-kz-lavender">أنا أستمع إليك… تحدث الآن</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            dir="ltr"
            placeholder={isListening ? 'أنا أستمع إليك... تحدث الآن' : 'اكتب جملتك بالألمانية هنا…'}
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
            aria-label="أرسل جملتك"
          >
            <Send className="w-5 h-5 rotate-180" aria-hidden />
          </Button>
        </div>

        {/* Always present, never behind a failure state. */}
        <div className="flex items-center justify-center">
          <GlassButton variant="quiet" onClick={handleTypeInstead} className="gap-1.5">
            <Keyboard className="h-3.5 w-3.5" />
            {isListening ? 'اكتب بدلاً من ذلك' : 'تفضّل الكتابة؟ اكتب هنا'}
          </GlassButton>
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
