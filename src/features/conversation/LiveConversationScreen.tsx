import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { db } from '@/lib/db/katzuDb';
import { enrolMistake } from '@/lib/srs/store';
import { buildLearnerMemory } from '@/lib/coach/profile';
import { workerClient } from '@/lib/api/workerClient';
import { useVoiceCapture, voiceStartFailureMessageAr } from '@/lib/audio/useVoiceCapture';
import { triggerHaptic } from '@/lib/utils/haptics';
import { GermanText } from '@/components/common/GermanText';
import { HintOption } from '@/components/common/HintOption';
import { WordInsightBottomSheet } from '@/components/sheets/WordInsightBottomSheet';
import { PaywallModal } from '@/components/sheets/PaywallModal';
import { isProEffective } from '@/lib/utils/subscription';
import { servedLevel } from '@/lib/entitlement/trial';
import { KatzuThinking } from '@/components/effects/KatzuThinking';
import { Button } from '@/components/ui/Button';
import { KatzuOrb, type OrbState } from '@/components/voice/KatzuOrb';
import { planTurns } from '@/lib/conversation/turnPlan';
import { ConversationMessage } from './ConversationMessage';
import {
  ArrowRight,
  MicOff,
  Send,
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
  classifyTurnError,
  conversationReducer,
  initialConversationState,
  isTurnInFlight,
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

/** The learner reads the transcript; keep it clear of the dock at every height. */
function orbSizeForViewport(): number {
  if (typeof window === 'undefined') return 148;
  const height = window.innerHeight || 800;
  const width = window.innerWidth || 400;
  // Big enough to be the app's signature object, never big enough to leave the
  // transcript a slot instead of a screen.
  return Math.round(Math.min(168, Math.max(116, Math.min(height * 0.19, width * 0.44))));
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
  // The dock shows one suggestion by default; the other conversational moves
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
  const [orbSize] = useState<number>(orbSizeForViewport);

  const scenario = useLiveQuery(() => db.scenarios.get(scenarioId));
  const user = useLiveQuery(() => db.users.get('current_user'));
  const isProUser = isProEffective(user);
  const vocabulary = useLiveQuery(() => db.vocabulary.toArray()) || [];
  const savedWords = useLiveQuery(() => db.saved_words.toArray()) || [];

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Only follow the conversation when the learner is already at its end: yanking
  // someone who scrolled back to re-read a correction is the rudest thing a chat
  // can do.
  const stickToBottomRef = useRef(true);
  /** Until this timestamp, scroll events are the app's own, not the learner's. */
  const programmaticScrollUntilRef = useRef(0);
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

  /**
   * The bubble being spoken, and the word of it that is being said.
   *
   * Katzu's reply is spoken automatically (below), so this is what turns the voice
   * into something the learner can follow with their eyes: the engine reports a
   * character position per word, and the transcript marks the word it is on.
   */
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const { speak, stop: stopSpeaking, activeCharIndex } = useSpeechOutput({
    speed: user?.speechSpeed || 1.0,
    onEnd: () => setSpeakingId(null),
  });

  /**
   * Speaking. `useVoiceCapture` owns the microphone (one acquisition for both the
   * orb's amplitude and the recording) and the worker transcribes the result —
   * see the hook for why the browser's own speech recogniser is gone.
   */
  const voice = useVoiceCapture({
    onTranscript: (text) => {
      // A turn in flight already carries the learner's sentence; a late
      // transcription must not overwrite the box they are watching.
      if (inFlightRef.current) return;
      setInputText(text);
      dispatch({ type: 'transcribe_ok' });
      // The recognised sentence is deliberately NOT auto-sent. The learner sees
      // what was heard before it becomes their turn: a mis-heard sentence that
      // auto-submits would be graded as their mistake, saved as their mistake and
      // scheduled for review — the app would be measuring something they never
      // said. One tap on أرسل is the price of honest memory.
      inputRef.current?.focus();
    },
    onFailure: (failure, messageAr) => {
      dispatch({
        type: failure === 'denied' ? 'mic_denied' : 'speech_failed',
        messageAr,
      });
    },
  });

  const characterNameAr = scenario?.title_ar || 'المحادثة';

  // The words the app can actually explain. Everything else is plain text: a
  // transcript where every word looks tappable but most taps do nothing teaches
  // the learner to stop tapping.
  const knownWords = useMemo(
    () => new Set(vocabulary.map((entry) => entry.german.replace(/[^a-zA-ZäöüÄÖÜß]/g, '').toLowerCase())),
    [vocabulary],
  );

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
                : conversation.status === 'recording'
                  ? 'listening'
                  : 'idle';

  // The recorder is the truth about the microphone, including the stops the app
  // decides on its own (silence, no speech, the twenty-second ceiling).
  useEffect(() => {
    if (conversation.status === 'recording' && !voice.isRecording) {
      dispatch({ type: 'stop_recording' });
    }
  }, [voice.isRecording, conversation.status]);

  // Magenta is reserved for a turn the learner actually got right — the last
  // evaluation produced no correction. It is never the resting colour.
  const lastEvaluation = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.sender === 'KATZU' && message.id !== 'msg_initial') return message;
    }
    return undefined;
  }, [messages]);
  const orbTone: 'lavender' | 'earned' =
    conversation.status === 'showing_feedback' && lastEvaluation && !lastEvaluation.hasCorrection
      ? 'earned'
      : 'lavender';

  const orbLabelAr = !voice.isSupported
    ? 'الإدخال الصوتي غير متاح — اكتب بالألمانية'
    : voice.isRecording
      ? 'إيقاف التسجيل'
      : conversation.status === 'transcribing'
        ? 'جارٍ التعرف على كلامك'
        : conversation.status === 'evaluating' || conversation.status === 'generating_reply'
          ? 'كَاتْزُو يعمل على ردّك'
          : conversation.status === 'quota_exhausted'
            ? 'انتهت الجلسات المجانية'
            : conversation.status === 'offline'
              ? 'لا يوجد اتصال'
              : 'ابدأ التحدث';

  /**
   * Tap the orb to speak. The typed path is never closed by a failure: a denied
   * microphone raises the machine's mic_denied state, which keeps the learner's
   * existing text and points them at the input box.
   */
  const handleOrbPress = useCallback(async () => {
    dispatch({ type: 'dismiss_error' });
    // Never talk over the learner: the moment they take the microphone, Katzu
    // stops speaking (and the highlight goes with it).
    stopSpeaking();
    if (voice.isRecording) {
      voice.stop();
      return;
    }
    const failure = await voice.start();
    if (failure) {
      // One wording for every screen (see `voiceStartFailureMessageAr`): the same
      // denied tap must not read differently in the conversation and in practice.
      dispatch({
        type: failure === 'denied' ? 'mic_denied' : 'speech_failed',
        messageAr: voiceStartFailureMessageAr(failure),
      });
      return;
    }
    dispatch({ type: 'start_recording' });
  }, [voice]);

  /** The always-present escape hatch: stop the microphone and type instead. */
  const handleTypeInstead = useCallback(() => {
    if (voice.isRecording) voice.stop();
    dispatch({ type: 'dismiss_error' });
    inputRef.current?.focus();
  }, [voice]);

  const handleToggleTranslation = useCallback((messageId: string) => {
    setShowArabicTranslation((prev) => ({ ...prev, [messageId]: !prev[messageId] }));
  }, []);

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

  /**
   * Scrolls the transcript to its newest message, and marks the scroll as ours.
   *
   * A programmatic scroll fires the same `scroll` events a finger does, and the
   * handler below reads those events to decide whether the learner still wants to
   * follow the conversation — so without this window the app's own scroll to the
   * bottom was read as the learner scrolling away, and the transcript stopped
   * following after the first reply. Measured in `e2e/conversationLayout.spec.ts`:
   * message boxes ended up under the dock, which is the bug the layout pass fixed.
   */
  const scrollTranscriptToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    programmaticScrollUntilRef.current = Date.now() + 400;
    stickToBottomRef.current = true;
    // Instant on purpose. A smooth scroll animates towards the height the content
    // had when it was measured, and a reply that reflows or gains its translation
    // mid-animation leaves the newest message short of the view — measured 169 px
    // short in `e2e/conversationLayout.spec.ts`, which is a whole message hidden
    // under the dock. Following the conversation is worth more than the glide.
    element.scrollTop = element.scrollHeight;
  }, []);

  // The transcript scrolls inside its own region, so a new message can never push
  // the dock off-screen and the dock can never cover a message. Every source of
  // new height is a dependency: a reply, its translation arriving a moment later,
  // and the two translation toggles.
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    scrollTranscriptToBottom();
  }, [messages, isGenerating, showAllTranslations, showArabicTranslation, scrollTranscriptToBottom]);

  const handleTranscriptScroll = useCallback(() => {
    // Inside the window, this event is the app's own scroll, not the learner's.
    if (Date.now() < programmaticScrollUntilRef.current) return;
    const element = scrollRef.current;
    if (!element) return;
    stickToBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }, []);

  /**
   * When the transcript region resizes, keep the learner on the newest message.
   *
   * The dock changes height while a conversation is running: the suggestion panel
   * opens, a microphone warning appears, and on a phone the keyboard takes half the
   * screen. Each of those makes the transcript shorter, which used to leave the
   * message the learner was reading cut off at the new edge until they scrolled.
   *
   * "Was the bottom visible" is answered from the *previous* height, because the
   * resize itself is what makes the current metrics say no: reading them after the
   * fact cannot tell "the learner scrolled up" from "the dock grew".
   */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let previousHeight = element.clientHeight;
    const observer = new ResizeObserver(() => {
      const wasAtBottom = element.scrollTop + previousHeight >= element.scrollHeight - 80;
      previousHeight = element.clientHeight;
      if (wasAtBottom) scrollTranscriptToBottom();
    });
    observer.observe(element);
    return () => observer.disconnect();
    // `sessionMode` is the dependency that matters: before a mode is chosen the
    // screen renders the chooser, the transcript does not exist yet, and an effect
    // that only watched a stable callback would never attach the observer at all.
  }, [scrollTranscriptToBottom, sessionMode]);

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
  const handleWordClick = useCallback(
    (wordRaw: string) => {
      const cleaned = wordRaw.replace(/[^a-zA-ZäöüÄÖÜß]/g, '');
      const found = vocabulary.find((v) => v.german.toLowerCase() === cleaned.toLowerCase());
      if (found) setSelectedWordForInsight(found);
    },
    [vocabulary],
  );

  // Toggle saving word in insight sheet
  const handleToggleSaveWord = async (wordId: number) => {
    const exists = savedWords.some((sw) => sw.wordId === wordId);
    if (exists) {
      await db.saved_words.delete(wordId);
    } else {
      await db.saved_words.put({ wordId, savedAt: Date.now() });
    }
  };

  const handleSpeak = useCallback(
    (message: ChatMessage) => {
      setSpeakingId(message.id);
      speak(message.germanText);
    },
    [speak],
  );

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
    if (voice.isRecording) voice.stop();

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

      // Speak Katzu's reply automatically, and highlight it word by word while it
      // is being said — a voice-only conversation leaves the learner guessing
      // which parts they missed.
      setSpeakingId(katzuReply.id);
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
    inputRef.current?.focus();
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
      setCurrentLevel(levelOrder[currentIndex - 1]);
      triggerHaptic('light');
    } else if (direction === 'harder' && currentIndex < levelOrder.length - 1) {
      setCurrentLevel(levelOrder[currentIndex + 1]);
      triggerHaptic('light');
    }
  };

  if (!sessionMode) {
    return (
      <main className="flex min-h-screen max-w-md mx-auto flex-col justify-center bg-black p-6 text-kz-ink">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 self-start rounded-2xl border border-white/10 bg-white/5 p-2"
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
            className="w-full rounded-3xl border border-white/10 bg-white/5 p-5 text-start transition-colors hover:bg-white/10"
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
      <header className="relative z-20 shrink-0 border-b border-white/[0.06] bg-black/80 px-3 pt-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            aria-label="العودة"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition-colors hover:bg-white/10"
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
            onClick={() => {
              setShowAllTranslations((v) => !v);
              setShowArabicTranslation({}); // clear per-message overrides
              triggerHaptic('light');
            }}
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

        {/* The round progress, as the header's own bottom edge. */}
        <div className="absolute bottom-0 start-0 h-[2px] rounded-full bg-primary transition-all duration-500" style={{ width: `${turnProgress * 100}%` }} />
      </header>

      {/* Transcript */}
      <div
        ref={scrollRef}
        onScroll={handleTranscriptScroll}
        data-testid="conversation-transcript"
        className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-4"
      >
        {messages.map((msg, index) => {
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
            <ConversationMessage
              key={msg.id}
              message={msg}
              isTranslationVisible={isTransVisible}
              knownWords={knownWords}
              onToggleTranslation={handleToggleTranslation}
              onRetryTranslation={requestOpenerTranslation}
              onSpeak={handleSpeak}
              onWordClick={handleWordClick}
              spokenCharIndex={speakingId === msg.id ? activeCharIndex : null}
              isNewest={index === messages.length - 1}
            />
          );
        })}

        {isGenerating && (
          <div className="flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <KatzuThinking size={20} layout="inline" labelAr="كَاتْزُو يفكر في الرد…" className="gap-2" />
          </div>
        )}

        {/* Failed-turn error card with retry — never a silent hang */}
        {turnError && !isGenerating && (
          <div className="animate-fade-in space-y-2 rounded-2xl border border-status-error/40 bg-surface-subtle p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-status-error">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>تعذر إرسال جملتك:</span>
            </div>
            <div dir="ltr" className="font-german text-xs text-kz-inkDim">
              {turnError.failedText}
            </div>
            <p className="kz-ar-micro text-kz-inkDim">{turnError.message}</p>
            <button
              onClick={retryFailedTurn}
              className="kz-ar-micro flex items-center gap-1.5 rounded-xl border border-primary/50 bg-primary/20 px-3 py-1.5 font-bold text-primary transition-colors hover:bg-primary/30"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Rule 7: Celebration Card on Exchange Completion */}
        {isSessionCompleted && (
          <div className="animate-fade-in my-2 flex items-center gap-3 rounded-3xl border border-primary/40 bg-white/5 p-4 shadow-glow-purple">
            <div className="flex-1">
              <div className="kz-ar-micro flex items-center gap-1.5 font-bold text-status-success">
                <CheckCircle2 className="h-4 w-4" />
                اكتملت محادثة السيناريو بنجاح!
              </div>
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
      </div>

      {/* The dock: hints, the orb, the typed sentence. Always below the transcript,
          never over it. */}
      <div
        data-testid="conversation-dock"
        className="shrink-0 border-t border-white/[0.06] bg-black/85 px-4 pt-2.5 backdrop-blur-xl"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {/* Hints as an on-demand button: a single 💡 pill that reveals the one
            context-aware suggestion when tapped — no always-visible strip
            competing with the chat. */}
        {visibleHints.length > 0 && !isHintRevealed && (
          <button
            onClick={() => {
              setIsHintRevealed(true);
              triggerHaptic('light');
            }}
            className="kz-ar-micro mb-2 flex items-center gap-1.5 rounded-full border border-primary/30 bg-white/5 px-3 py-1.5 font-semibold text-primary transition-colors hover:border-primary/60"
          >
            <Lightbulb className="h-3.5 w-3.5" />
            اقتراح لردّك
          </button>
        )}

        {visibleHints.length > 0 && isHintRevealed && (
          <div className="mb-2 flex items-start gap-1.5">
            <div className="max-h-[26vh] min-w-0 flex-1 space-y-1.5 overflow-y-auto">
              <HintOption hint={visibleHints[0]} onUse={() => handleUseHint(visibleHints[0])} primary />
              {visibleHints.length > 1 && (
                <>
                  <button
                    onClick={() => {
                      setIsHintExpanded((v) => !v);
                      triggerHaptic('light');
                    }}
                    className="kz-ar-micro flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-kz-inkDim transition-colors hover:text-primary"
                  >
                    <span>
                      {isHintExpanded
                        ? 'إخفاء الخيارات الأخرى'
                        : `خيارات أخرى في هذا الموقف (${visibleHints.length - 1})`}
                    </span>
                    {isHintExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
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
              className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-kz-inkDim transition-colors hover:text-primary"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingHints ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setIsHintRevealed(false)}
              aria-label="إخفاء الاقتراح"
              className="shrink-0 rounded-xl p-2 text-kz-inkDim transition-colors hover:text-kz-ink"
            >
              ✕
            </button>
          </div>
        )}

        {/* Mic / STT error banner */}
        {micError && (
          <div className="kz-ar-micro mb-2 flex items-start gap-2 rounded-xl border border-status-learning/40 bg-white/5 p-2.5 text-status-learning">
            <MicOff className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{micError}</span>
            <button
              onClick={() => dispatch({ type: 'dismiss_error' })}
              aria-label="إخفاء"
              className="min-h-[32px] min-w-[32px] text-kz-inkFaint hover:text-kz-ink"
            >
              ✕
            </button>
          </div>
        )}

        {/* The orb owns the microphone, and the label under it is the only place
            the app says what the microphone is doing. */}
        <div className="flex flex-col items-center">
          <KatzuOrb
            state={orbState}
            readLevel={voice.read}
            tone={orbTone}
            size={orbSize}
            onPress={() => void handleOrbPress()}
            disabled={!voice.isSupported || conversation.status === 'quota_exhausted'}
            labelAr={orbLabelAr}
          />
          <span
            className={`kz-ar-micro h-4 transition-opacity ${
              voice.isRecording ? 'text-kz-lavender opacity-100' : 'text-kz-inkFaint opacity-70'
            }`}
          >
            {voice.isRecording
              ? 'أنا أستمع إليك… تحدث الآن'
              : conversation.status === 'transcribing'
                ? 'جارٍ التعرف على كلامك…'
                : !voice.isSupported
                  ? 'الإدخال الصوتي غير متاح — اكتب بالألمانية'
                  : 'اضغط على الدائرة وتحدث'}
          </span>
        </div>

        {/* Live captions while the learner speaks. The platform recogniser returns
            words as they are said, so the learner can see their own German land —
            which is the difference between dictating and being transcribed after
            the fact. It renders only when there is something to show (the recorder
            fallback cannot know the words until the recording ends), so nothing
            here can announce a caption that is not coming. */}
        {voice.isRecording && voice.interimText && (
          <div
            data-testid="live-caption"
            className="mt-2 flex items-center gap-2 rounded-xl border border-kz-lavender/25 bg-kz-lavender/10 px-3 py-2"
          >
            <span className="kz-ar-micro shrink-0 font-semibold text-kz-lavender">أسمع</span>
            <span dir="ltr" className="min-w-0 flex-1 truncate font-german text-sm text-kz-ink">
              {voice.interimText}
            </span>
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            dir="ltr"
            placeholder={voice.isRecording ? 'أنا أستمع إليك…' : 'اكتب جملتك بالألمانية…'}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 font-german text-sm outline-none transition-colors placeholder:font-arabic placeholder:text-xs placeholder:text-kz-inkFaint focus:border-primary/60"
          />

          {/* Typing is always one tap away — and it is a control inside the row,
              not a third line of copy under it. */}
          <button
            onClick={handleTypeInstead}
            aria-label="اكتب بدلاً من التحدث"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-kz-inkDim transition-colors hover:text-kz-ink"
          >
            <Keyboard className="h-4 w-4" />
          </button>

          <Button
            size="md"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl p-0"
            disabled={!inputText.trim() || isGenerating}
            onClick={() => handleSendMessage()}
            aria-label="أرسل جملتك"
          >
            <Send className="h-5 w-5 rotate-180" aria-hidden />
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

export default LiveConversationScreen;
