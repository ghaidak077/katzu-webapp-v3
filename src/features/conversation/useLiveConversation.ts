import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { db } from '@/lib/db/katzuDb';
import { enrolMistake } from '@/lib/srs/store';
import { buildMemorySummary } from '@/lib/memory/summary';
import { listMemoryPatterns, rebuildMemoryPatterns } from '@/lib/memory/patterns';
import { workerClient } from '@/lib/api/workerClient';
import { useVoiceCapture, voiceStartFailureMessageAr } from '@/lib/audio/useVoiceCapture';
import { triggerHaptic } from '@/lib/utils/haptics';
import { logError, logEvent } from '@/lib/utils/diagnostics';
import { track } from '@/lib/analytics/client';
import { isProEffective } from '@/lib/utils/subscription';
import { servedLevel } from '@/lib/entitlement/trial';
import { isEntitlementUnavailable, isEntitlementWall } from '@/lib/entitlement/codes';
import { levelSpecFor } from '@/lib/levels/levelSpec';
import { calculateIndependentAccuracy } from '@/features/report/metrics';
import { buildSessionDebrief, type SessionDebrief } from '@/lib/debrief/debrief';
import { localDateKey, recalculateStreak } from '@/lib/utils/streak';
import { sessionXp } from '@/lib/progress/sessionXp';
import { creditXp, xpEarnedToday } from '@/lib/progress/dailyXp';
import { enqueueDailyEvent, sessionEventId } from '@/lib/progress/dailyAuthority';
import { markScenarioTaskDone } from '@/lib/daily/taskStore';
import { classifyTurnError, conversationReducer, initialConversationState, isTurnInFlight } from '@/lib/conversation/stateMachine';
import { openerForLevel, rankHintFloor, storedOpenerArabic } from '@/lib/conversation/opener';
import { sessionTurnCap } from '@/lib/conversation/turnPlan';
import type { OrbState } from '@/components/voice/KatzuOrb';
import type {
  ChatMessage,
  ContextualHint,
  CEFRLevel,
  VocabularyEntity,
  SessionEntity,
  SessionMode,
} from '@/types/models';

/**
 * Everything the live conversation screen thinks with (B4d mechanical split).
 *
 * Extracted verbatim from `LiveConversationScreen`: the conversation state
 * machine, the speech/voice hooks, the opener + hints loading, the turn send
 * path with its quota/retry/idempotency rules, the session finishing, and the
 * orb's derived state. Zero behaviour change — the screen was becoming a
 * 1,200-line file where the turn logic and the JSX guarded each other from
 * being read; the hook is the same code, ordered and documented, so the screen
 * can be read as a layout. Every value the JSX needs is on the returned object;
 * no state was renamed, re-timed or re-derived.
 */

export interface UseLiveConversationOptions {
  scenarioId: string;
  vocabularyContext?: string[];
  grammarId?: string;
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
    debrief: SessionDebrief;
  }) => void;
}

/** The learner reads the transcript; keep it clear of the dock at every height. */
function orbSizeForViewport(): number {
  if (typeof window === 'undefined') return 148;
  const height = window.innerHeight || 800;
  const width = window.innerWidth || 400;
  // V29: the orb now lives in a compact control bar above the transcript, so it
  // is sized to be a clear target in that row — never big enough to push the
  // conversation into a sliver (measured: the old 116–168 px orb plus its label
  // and the suggestion pill made the dock 245 px of a 539 px viewport).
  return Math.round(Math.min(120, Math.max(84, Math.min(height * 0.13, width * 0.3))));
}

export function useLiveConversation({
  scenarioId,
  vocabularyContext = [],
  grammarId,
  onCompleteSession,
}: UseLiveConversationOptions) {
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
  // LEVEL-SPEC.md Arabic support: the spec sets the INITIAL visibility per level
  // (A0 always, A1 default-on, A2 on tap, B1+ hidden). It runs when the episode's
  // level is set and re-runs if the level changes (e.g. a mid-session upgrade);
  // the learner's manual toggle always wins afterwards — "hidden by default"
  // never means "removed".
  const arabicDefaultForLevel = levelSpecFor(currentLevel).arabicSupport;
  const appliedLevelRef = useRef<CEFRLevel | null>(null);
  useEffect(() => {
    if (appliedLevelRef.current === currentLevel) return;
    appliedLevelRef.current = currentLevel;
    setShowAllTranslations(arabicDefaultForLevel === 'always' || arabicDefaultForLevel === 'default');
  }, [arabicDefaultForLevel, currentLevel]);
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
  const targetTurns = sessionTurnCap(effectiveLevel);
  // REAL mode (V28 Stage 1D): the same conversation with no help — no hints, no
  // translation, no live correction. The turn call is unchanged and still returns
  // the evaluation, so the end-of-session report is built from it.
  const realMode = sessionMode === 'real';
  const userTurnsCount = messages.filter((m) => m.sender === 'USER').length;

  /**
   * The bubble being spoken, and the word of it that is being said.
   *
   * Katzu's reply is spoken automatically (below), so this is what turns the voice
   * into something the learner can follow with their eyes: the engine reports a
   * character position per word, and the transcript marks the word it is on.
   */
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  // The level sets the base speaking speed (LEVEL-SPEC.md); a learner's own
  // speed preference still wins — the spec default is a starting point, not a
  // cage, and it must never make speech *faster* than their own setting.
  const { speak, stop: stopSpeaking, activeCharIndex } = useSpeechOutput({
    speed: Math.min(user?.speechSpeed || 1.0, levelSpecFor(currentLevel).speakingSpeed),
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

  // The `earned` tone (the --kz-magenta violet) is reserved for a turn the learner
  // actually got right — the last evaluation produced no correction. It is never
  // the resting colour. V31: named by role, not by an old hue name, so nobody
  // reads "magenta" here and paints a pink that is no longer in the palette.
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
  //
  // Level floor (V21): phrases are filtered to the learner's effective level
  // first, falling back outward (level → neighbours → all) so a learner never
  // sees hints pitched at the wrong level when rows for theirs exist — the
  // B2 learner must not train on A1 scaffolding while real B2 lines sit unused.
  const loadStarterHints = useCallback(async () => {
    const levelOrder = (level: string): number => {
      const rungs = ['A1', 'A2', 'B1', 'B2'];
      const index = rungs.indexOf(level.toUpperCase());
      return index === -1 ? 1 : index;
    };
    type PhraseRow = { level?: string | null; german: string; translation_ar?: string | null };
    const phrasesByLevel = (rows: PhraseRow[]): Array<PhraseRow[]> => {
      const target = levelOrder(effectiveLevel);
      const sorted = [...rows].sort(
        (a, b) => Math.abs(levelOrder(String(a.level)) - target) - Math.abs(levelOrder(String(b.level)) - target),
      );
      const buckets = new Map<string, PhraseRow[]>();
      for (const row of sorted) {
        const key = String(row.level || '').toUpperCase();
        const bucket = buckets.get(key) || [];
        bucket.push(row);
        buckets.set(key, bucket);
      }
      return [...buckets.values()].sort(
        (a, b) => Math.abs(levelOrder(String(a[0].level)) - target) - Math.abs(levelOrder(String(b[0].level)) - target),
      );
    };
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
        // Nearest-level bucket first; a bucket with too few phrases is topped
        // up from the next-nearest so the floor never thins out below three.
        const [best, ...rest] = phrasesByLevel(phrases);
        let picked = [...best];
        for (const bucket of rest) {
          if (picked.length >= 3) break;
          picked = picked.concat(bucket);
        }
        setStarterHints(picked.map((p) => ({ german: p.german, arabic: p.translation_ar || '' })));
      }
    } catch {
      /* offline with empty cache — hints bar simply stays hidden */
    }
  }, [scenarioId, effectiveLevel]);

  /**
   * The opener is the one Katzu message no AI call produces, so its Arabic is
   * fetched on its own. The first attempt can race the session-token exchange at
   * mount, hence one retry; after that the failure is shown honestly with a way
   * back, instead of a bubble that silently cannot be translated.
   */
  /**
   * V19 Phase 2: the opener's Arabic is stored data first, AI refinement second.
   *
   * The measured Phase-0 behaviour — an automatic `/ai/translate` on every open,
   * before the learner says anything — is gone. `storedOpenerArabic` answers
   * from content the app already ships; when it has no gloss (and only then) the
   * translate route is asked once, as a *refinement*, and its failure is shown
   * honestly with a retry. An opener with a stored gloss never spends quota.
   */
  const requestOpenerTranslation = useCallback(async (messageId: string, germanText: string) => {
    const stored = storedOpenerArabic(germanText);
    if (stored) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, arabicTranslation: stored, translationState: undefined } : m,
        ),
      );
      return;
    }
    // No stored gloss: try the refinement once, then say so with a way back.
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

    // One level→opener rule, shared with the story screen's logic (tested in
    // openerForLevel): the same sentence the learner saw when the episode opened.
    const initialMsgText = openerForLevel(scenario, effectiveLevel);

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

    // Load cached starter phrases as initial hints (never in REAL mode).
    if (sessionMode !== 'real') void loadStarterHints();

    // V19: stored gloss first (zero AI calls before the first message), AI
    // refinement only when no gloss ships for this opener, with an honest
    // retry affordance on failure — see requestOpenerTranslation.
    requestOpenerTranslation(welcomeMsg.id, welcomeMsg.germanText);
  }, [scenario, scenarioId, effectiveLevel, sessionMode, loadStarterHints, requestOpenerTranslation]);

  // Handle German word click for insight.
  //
  // V29: every tapped word opens the sheet. It used to open only when the word was
  // an exact match in the loaded topic vocabulary, so an unknown word — exactly the
  // word a struggling learner taps — did nothing at all, which reads as a broken
  // app. An unmatched word now gets an honest, non-AI card (no quota spent): the
  // word itself, its pronunciation, and where to take it next. Saving is disabled
  // for it, because it has no content row to remember.
  const handleWordClick = useCallback(
    (wordRaw: string) => {
      const cleaned = wordRaw.replace(/[^a-zA-ZäöüÄÖÜß]/g, '');
      if (!cleaned) return;
      const found = vocabulary.find((v) => v.german.toLowerCase() === cleaned.toLowerCase());
      setSelectedWordForInsight(
        found ?? {
          id: 0,
          german: cleaned,
          article: '',
          plural: '',
          translation_ar: 'هذه الكلمة ليست في محتوى مشهدك بعد. يمكنك سماعها الآن، وستُضاف إلى مفرداتك عند دراستها.',
          translation_en: '',
          example_de: '',
          example_ar: '',
          part_of_speech: '—',
          level: effectiveLevel,
          topic: '',
        },
      );
    },
    [vocabulary, effectiveLevel],
  );

  // Toggle saving word in insight sheet
  const handleToggleSaveWord = async (wordId: number) => {
    // The synthetic "not in your content yet" card has no row to save.
    if (!wordId) return;
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

      // Long memory (V21 Phase 3): rebuild the derived pattern view from the
      // source tables (mistakes + review items), then pack the ≤150-token
      // summary for the tutor. Rebuilt per turn on purpose: the correction from
      // THIS turn is part of it next turn, and the rebuild is two local scans.
      // The items ride the existing allow-listed `learner_memory` wire field.
      await rebuildMemoryPatterns();
      const learnerMemory = buildMemorySummary({
        patterns: await listMemoryPatterns(),
        level: effectiveLevel,
        goal: user?.primaryGoal ?? null,
        profession: user?.profession ?? null,
      }).items;

      const res = await workerClient.sendTurn({
        scenarioId,
        vocabularyContext,
        grammarId,
        userMessage: text,
        history: historyPayload,
        cefrLevel: effectiveLevel,
        scenarioTitle: scenario?.title_de || '',
        sarcasmLevel: user?.sarcasmLevel || 'SASSY',
        isFinalTurn,
        mode: sessionMode === 'real' ? 'extended' : 'roleplay',
        sessionId,
        learnerMemory,
        // Which turn of the episode this is — rotates the persona's
        // live-conversation behaviour (ask, repeat-check, react, advance) on the
        // worker side without changing the wire format's other fields.
        turnIndex: userTurnsCount,
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
        grammarId: res.grammarId,
        grammarReference: res.grammarReference,
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
          grammarId: res.grammarId,
          grammarReference: res.grammarReference,
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
      if (realMode) {
        setCurrentHints([]);
      } else if (res.hints && res.hints.length > 0) {
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
          void finishSession(updatedHistory);
        }, 3200);
      }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (isEntitlementWall(err?.code)) {
        // Server-side entitlement rejection (level lock, or the three free
        // conversations spent) — show the Katzu paywall instead of a dead error
        // in the chat, and mark the quota state so a retry cannot burn the
        // learner's remaining allowance.
        //
        // V31: this used to match only `PAYWALL_REQUIRED`, so `FREE_QUOTA_EXHAUSTED`
        // fell through to the generic branch and produced a "try again" card that
        // no retry could ever clear. The entitlement that must be paid for is the
        // same entitlement either way.
        dispatch({ type: 'quota_exhausted', messageAr: err?.message });
        setPaywall({
          isOpen: true,
          title: err?.code === 'FREE_QUOTA_EXHAUSTED' ? 'انتهت جلساتك المجانية' : 'هذا المستوى ميزة Pro',
          description: err?.message || 'رَقِّ حسابك لفتح كل المستويات من A0 حتى B2 ومحادثات بلا حدّ جلسات.',
        });
      } else {
        // The user's message stays in the transcript with a visible error card
        // and a one-tap retry — never a silent spinner or a swallowed error.
        const message =
          err?.code === 'REQUEST_TIMEOUT'
            ? 'انتهت مهلة الاتصال بالخادم. جملتك محفوظة — أعد الإرسال عندما يعود الاتصال.'
            : err?.code === 'NETWORK_ERROR'
              ? 'تعذر الوصول إلى الخادم. جملتك محفوظة هنا، أعد المحاولة.'
              : err?.code === 'WORKER_URL_MISSING'
                ? 'خدمة كَاتْزُو غير متاحة في هذه النسخة. تواصل معنا وسنعيد لك للعمل — جملتك محفوظة.'
                : // The Worker could not read the trial ledger. Say THAT, rather
                  // than the generic AI-service line: the learner has not run out,
                  // the server lost count, and retrying is the honest action.
                  isEntitlementUnavailable(err?.code)
                  ? 'تعذّر التحقق من رصيدك على الخادم الآن — لم تُستهلك جلسة. جملتك محفوظة، أعد المحاولة بعد قليل.'
                  : classifyTurnError(e).messageAr;
        dispatch({ type: 'turn_failed', error: { ...classifyTurnError(e), messageAr: message } });
        logError('ai/turn', `Turn failed (${err?.code || 'UNKNOWN'}): ${message}`);
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

  // AI hints when loaded; otherwise the D1 starter-phrase floor, ranked against
  // what the other side just said (V19 Phase 2): the first suggestion must be a
  // plausible ANSWER to the last AI message, not the scenario's sort_order[0].
  // The measured mismatch this fixes: the opener asked "Fehlt Ihr Koffer?" and
  // the floor offered "Hier ist mein Pass." — a passport answer to a luggage
  // question. The user must never face an empty suggestions bar either.
  const lastAssistantGerman = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.sender === 'KATZU') return message.germanText;
    }
    return null;
  }, [messages]);
  const visibleHints = useMemo(
    () => (realMode ? [] : rankHintFloor(currentHints.length > 0 ? currentHints : starterHints, lastAssistantGerman)),
    [realMode, currentHints, starterHints, lastAssistantGerman],
  );

  const [isRefreshingHints, setIsRefreshingHints] = useState(false);
  /**
   * V31: today's AI hint budget is spent. The starter-phrase floor keeps the
   * panel useful, but the learner is told once and the refresh stops pretending
   * to do something it can no longer do.
   */
  const [hintQuotaSpent, setHintQuotaSpent] = useState(false);
  const refreshHints = async () => {
    if (isRefreshingHints || hintQuotaSpent) return;
    setIsRefreshingHints(true);
    try {
      const lastKatzu = [...messages].reverse().find((m) => m.sender === 'KATZU');
      if (lastKatzu) {
        const { hints: fresh, quotaExceeded } = await workerClient.fetchHintsWithStatus({
          scenarioTitle: scenario?.title_de || '',
          cefrLevel: effectiveLevel,
          lastAiReply: lastKatzu.germanText,
          history: messages.map((m) => ({
            sender: m.sender === 'USER' ? 'user' : 'model',
            text: m.germanText,
          })),
        });
        if (quotaExceeded) {
          setHintQuotaSpent(true);
          void loadStarterHints();
          logEvent('hints', 'daily hint budget spent — showing the starter floor');
        } else if (fresh.length > 0) {
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

  const finishSession = async (finalMessages: ChatMessage[]) => {
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

    // V28 Stage 1D: the learner's last attempt at THIS scenario, for the report's
    // "versus your previous attempt" line. Read from the session table the app
    // already owns; a prior row that recorded no count yields no comparison, so
    // the report never invents a baseline.
    const priorSessions = await db.sessions.toArray();
    const previousAttempt = priorSessions
      .filter(
        (s) =>
          s.scenarioId === scenarioId &&
          typeof s.mistakesCount === 'number' &&
          s.timestamp < startTime,
      )
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    const previousMistakeCount = previousAttempt?.mistakesCount ?? null;

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
      mode: sessionMode || 'practice',
      mistakesCount: mistakesList.length,
    };
    db.sessions.put(sessionRecord);
    track('conversation_completed', {
      scenarioId,
      count: independentMsgs.length,
      state: accuracy === null ? 'unmeasured' : String(accuracy),
    });
    // V24 Phase 7: the funnel's scenario-level completion — the session record
    // was just persisted, so this only fires for sessions that really finished.
    track('scenario_completed', { scenarioId, count: independentMsgs.length });

    // Update local learning stats; trial entitlement is enforced by the Worker.
    // XP rule is pure + tested (sessionXp): REAL mode carries a higher weight
    // because an unaided conversation is the performance the product builds.
    const earnedXp = sessionXp({
      accuracyPercent: accuracy,
      assistedSentences: assistedMsgs.length,
      mode: sessionMode || 'practice',
    });

    // V28 Stage 3: XP is credited only through the anti-farming daily cap, so a
    // day of grinding pays the same as a few good conversations. `priorSessions`
    // (read above for the report comparison) is exactly today's already-credited
    // evidence — this session is not saved until below.
    const xpCredit = creditXp({
      totalXp: user?.totalXp || 0,
      earnedToday: xpEarnedToday(priorSessions, Date.now()),
      amount: earnedXp,
    });

    // Daily habit loop: consecutive day extends the streak, a missed day resets
    // it honestly, same-day repeats never inflate it (all logic unit-tested).
    const streakResult = recalculateStreak({
      lastActiveDate: user?.lastActiveDate,
      streakDays: user?.streakDays || 0,
    });

    db.users.update('current_user', {
      totalXp: xpCredit.totalXp,
      streakDays: streakResult.streakDays,
      lastActiveDate: localDateKey(),
      updatedAt: Date.now(),
    });

    // V28 Stage 3: today's scenario task is done the moment a conversation ends.
    await markScenarioTaskDone();

    // V29: report what this session measured to the server, which owns the day —
    // so the daily XP cap and the streak are enforced against the SERVER's clock,
    // not this device's. Queued durably; sent by the sync below (or next online).
    enqueueDailyEvent({
      id: sessionEventId(Date.now()),
      type: 'session',
      accuracyPercent: accuracy,
      assistedSentences: assistedMsgs.length,
      mode: sessionMode || 'practice',
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
      // Deterministic Phase-2 debrief, built from the same numbers this
      // function just computed — no extra AI call anywhere.
      debrief: buildSessionDebrief({
        scenarioTitle: scenario?.title_ar || '',
        level: effectiveLevel,
        mode: sessionMode || 'practice',
        sentencesSpoken: userMsgs.length,
        independentSentences: independentMsgs.length,
        assistedSentences: assistedMsgs.length,
        accuracyPercent: accuracy,
        mistakes: mistakesList,
        previousMistakeCount,
      }),
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

  const handleToggleAllTranslations = () => {
    setShowAllTranslations((v) => !v);
    setShowArabicTranslation({}); // clear per-message overrides
    triggerHaptic('light');
  };

  return {
    // data
    scenario,
    user,
    isProUser,
    savedWords,
    messages,
    conversation,
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
  };
}
