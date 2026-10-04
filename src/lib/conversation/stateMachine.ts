/**
 * The live conversation as one explicit state machine.
 *
 * WHY
 * The screen previously tracked the moment with unrelated booleans
 * (`isGenerating`, `turnError`, `micError`, `isSessionCompleted`, plus a paywall
 * object), and they could contradict each other: a spinner could keep running
 * beside an error card, a double-tap could fire two turns (two quota
 * consumptions for one sentence), and a recoverable failure could clear the
 * learner's text — the one thing they must never have to retype.
 *
 * States are a closed set, every transition is a value in/values out, and the
 * rules below are unit-tested:
 *
 *  - a submit while a turn is in flight is ignored (no duplicate sends, no
 *    double quota consumption);
 *  - `retry` is only possible from `retryable_error` (or `offline`), and it
 *    reuses the same turn id and the same text;
 *  - the learner's text is preserved across every failure and only cleared by a
 *    successful turn;
 *  - quota exhaustion and session invalidation are terminal for the session, so
 *    a retry cannot burn the learner's remaining allowance.
 */

import { isEntitlementUnavailable, isEntitlementWall } from '@/lib/entitlement/codes';

export type ConversationStatus =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'evaluating'
  | 'generating_reply'
  | 'showing_feedback'
  | 'retryable_error'
  | 'offline'
  | 'quota_exhausted'
  | 'completed';

export type ConversationErrorKind =
  | 'mic_permission'
  | 'speech_recognition'
  | 'network'
  | 'ai_service'
  | 'quota'
  | 'invalid_session';

export interface ConversationError {
  kind: ConversationErrorKind;
  /** Arabic, actionable message shown to the learner. */
  messageAr: string;
  retryable: boolean;
}

export interface ConversationState {
  status: ConversationStatus;
  /** The learner's sentence for the turn that is in flight or failed. */
  pendingText: string | null;
  /** Stable id for the logical turn, reused by retry. */
  turnId: number | null;
  attempts: number;
  error: ConversationError | null;
  /** True while the tab was hidden mid-turn. */
  backgrounded: boolean;
}

export type ConversationEvent =
  | { type: 'start_recording' }
  | { type: 'stop_recording' }
  | { type: 'transcribe_ok' }
  | { type: 'mic_denied'; messageAr?: string }
  | { type: 'speech_failed'; messageAr?: string }
  | { type: 'submit'; text: string; turnId: number }
  | { type: 'reply_progress' }
  | { type: 'turn_ok' }
  | { type: 'turn_failed'; error: ConversationError }
  | { type: 'retry' }
  | { type: 'dismiss_error' }
  | { type: 'going_offline' }
  | { type: 'back_online' }
  | { type: 'quota_exhausted'; messageAr?: string }
  | { type: 'complete' }
  | { type: 'backgrounded' }
  | { type: 'foregrounded' }
  | { type: 'reset' };

export const MIC_PERMISSION_MESSAGE_AR =
  'لم يُسمح بالوصول للمايك. اسمح بالوصول من إعدادات المتصفح ثم أعد المحاولة، أو اكتب جملتك — الكتابة تعمل دائماً.';

export const SPEECH_FAILURE_MESSAGE_AR =
  'تعذر التعرف على صوتك هذه المرة. يمكنك المحاولة مرة أخرى أو كتابة جملتك بالألمانية — النتيجة نفسها.';

export const NETWORK_ERROR_MESSAGE_AR =
  'تعذر الوصول إلى الخادم. جملتك محفوظة هنا — أعد المحاولة عندما يعود الاتصال.';

export const AI_SERVICE_MESSAGE_AR =
  'تعذر إكمال هذا الدور الآن. جملتك لم تُفقد — أعد المحاولة.';

export const QUOTA_MESSAGE_AR =
  'انتهت جلساتك المجانية. جملتك محفوظة ويمكنك متابعة ما تعلمته والمراجعة، أو تفعيل Pro لمحادثات بلا حدّ جلسات.';

export const SESSION_INVALID_MESSAGE_AR =
  'انتهت جلسة الدخول. سجّل الدخول من جديد ثم أعد إرسال جملتك — لن تُفقد.';

export function initialConversationState(): ConversationState {
  return {
    status: 'idle',
    pendingText: null,
    turnId: null,
    attempts: 0,
    error: null,
    backgrounded: false,
  };
}

export function isTurnInFlight(state: ConversationState): boolean {
  return state.status === 'evaluating' || state.status === 'generating_reply';
}

/**
 * Turn states that may accept a new submit. `offline` is included on purpose:
 * the browser can come back without firing an event, and silently refusing the
 * learner's sentence would look like a broken input rather than a network state.
 */
function acceptsSubmit(status: ConversationStatus): boolean {
  return (
    status === 'idle' ||
    status === 'recording' ||
    status === 'transcribing' ||
    status === 'showing_feedback' ||
    status === 'retryable_error' ||
    status === 'offline'
  );
}

export function conversationReducer(state: ConversationState, event: ConversationEvent): ConversationState {
  switch (event.type) {
    case 'start_recording':
      if (state.status === 'recording' || state.status === 'transcribing') return state;
      if (state.status === 'completed' || state.status === 'quota_exhausted') return state;
      return { ...state, status: 'recording', error: null };

    case 'stop_recording':
      return state.status === 'recording' ? { ...state, status: 'transcribing' } : state;

    case 'transcribe_ok':
      return state.status === 'transcribing' ? { ...state, status: 'idle' } : state;

    case 'mic_denied':
      return {
        ...state,
        status: 'retryable_error',
        error: {
          kind: 'mic_permission',
          messageAr: event.messageAr || MIC_PERMISSION_MESSAGE_AR,
          retryable: true,
        },
      };

    case 'speech_failed':
      return {
        ...state,
        status: 'retryable_error',
        error: {
          kind: 'speech_recognition',
          messageAr: event.messageAr || SPEECH_FAILURE_MESSAGE_AR,
          retryable: true,
        },
      };

    case 'submit': {
      // The duplicate-send guard: a submit arriving while a turn is already in
      // flight is dropped instead of costing a second AI call and a second unit
      // of quota for one sentence.
      if (!acceptsSubmit(state.status)) return state;
      const text = String(event.text || '').trim();
      if (!text) return state;
      return {
        ...state,
        status: 'evaluating',
        pendingText: text,
        turnId: event.turnId,
        attempts: state.attempts + 1,
        error: null,
      };
    }

    case 'reply_progress':
      return state.status === 'evaluating' ? { ...state, status: 'generating_reply' } : state;

    case 'turn_ok':
      if (!isTurnInFlight(state)) return state;
      // Only a successful turn clears the text (the transcript already holds it).
      return { ...state, status: 'showing_feedback', pendingText: null, error: null, attempts: 0 };

    case 'turn_failed':
      if (!isTurnInFlight(state)) return state;
      return { ...state, status: 'retryable_error', error: event.error };

    case 'retry': {
      if (state.status !== 'retryable_error' && state.status !== 'offline') return state;
      if (!state.pendingText) return state;
      if (state.error && !state.error.retryable) return state;
      return {
        ...state,
        status: 'evaluating',
        attempts: state.attempts + 1,
        error: null,
      };
    }

    case 'dismiss_error':
      // Hiding the message must not throw away the learner's sentence: the text
      // stays in `pendingText`, so a later retry still has something to send.
      return state.status === 'retryable_error' || state.status === 'offline'
        ? { ...state, status: 'idle', error: null }
        : state;

    case 'going_offline':
      if (state.status === 'completed' || state.status === 'quota_exhausted') return state;
      return {
        ...state,
        status: 'offline',
        error: {
          kind: 'network',
          messageAr: NETWORK_ERROR_MESSAGE_AR,
          retryable: true,
        },
      };

    case 'back_online':
      if (state.status !== 'offline') return state;
      // With a sentence waiting, the learner gets a one-tap retry; with nothing
      // pending, there is no failure to show and the screen just accepts input.
      return state.pendingText ? { ...state, status: 'retryable_error' } : { ...state, status: 'idle', error: null };

    case 'quota_exhausted':
      return {
        ...state,
        status: 'quota_exhausted',
        error: {
          kind: 'quota',
          messageAr: event.messageAr || QUOTA_MESSAGE_AR,
          retryable: false,
        },
      };

    case 'complete':
      if (state.status === 'quota_exhausted') return state;
      return { ...state, status: 'completed', pendingText: null, error: null };

    case 'backgrounded':
      return { ...state, backgrounded: true };

    case 'foregrounded':
      // A turn that was in flight while hidden keeps its state; if the browser
      // killed the request, the failure handler raises a retryable error with
      // the text intact. Nothing is silently dropped either way.
      return { ...state, backgrounded: false };

    case 'reset':
      return initialConversationState();

    default:
      return state;
  }
}

/**
 * Maps a thrown turn error (the worker client's coded errors) to the state
 * machine's vocabulary. Unknown failures are `ai_service` and retryable: the
 * learner's sentence is preserved, so retrying is always safe for them.
 *
 * V31: the code is matched against the shared entitlement set, not against one
 * literal. `FREE_QUOTA_EXHAUSTED` is exactly as terminal as `PAYWALL_REQUIRED`
 * — both spend money to clear — and classifying it as a retryable AI glitch is
 * what gave a free learner an unresolvable "try again" card.
 */
export function classifyTurnError(error: unknown): ConversationError {
  const code = String((error as { code?: string })?.code || '');
  const raw = String((error as { message?: string })?.message || '');
  if (isEntitlementWall(code) || /quota|trial|entitlement|paywall/i.test(raw)) {
    return { kind: 'quota', messageAr: QUOTA_MESSAGE_AR, retryable: false };
  }
  if (code === 'UNAUTHENTICATED' || code === 'SESSION_EXPIRED' || code === 'invalid_id_token') {
    return { kind: 'invalid_session', messageAr: SESSION_INVALID_MESSAGE_AR, retryable: false };
  }
  if (
    code === 'REQUEST_TIMEOUT' ||
    code === 'NETWORK_ERROR' ||
    code === 'WORKER_URL_MISSING' ||
    // The Worker could not read the trial ledger. The allowance is unknown, not
    // gone, so this is the one quota code a retry can genuinely clear.
    isEntitlementUnavailable(code)
  ) {
    return { kind: 'network', messageAr: NETWORK_ERROR_MESSAGE_AR, retryable: true };
  }
  return { kind: 'ai_service', messageAr: AI_SERVICE_MESSAGE_AR, retryable: true };
}

export const UNUSABLE_TRANSCRIPT_MESSAGE_AR =
  'لم نسمع جملة واضحة. تحدّث مرة أخرى، وتأكد أن المايك قريب منك — أو اكتب جملتك، فهي تعمل دائماً.';

/**
 * Whether a final transcript is a real attempt at a sentence.
 *
 * Speech recognition loves to return a stray "a", a dash, or punctuation when
 * it fires on background noise. Sending that as a turn costs a model call, a unit
 * of the learner's quota, and an evaluation of a sentence they never said — so a
 * transcript with fewer than two letters is treated as a failed listening attempt
 * instead, which keeps the microphone honest and the typed path open.
 */
export function isUsableTranscript(text: string | undefined): boolean {
  const letters = String(text || '').match(/[A-Za-zÄÖÜäöüß\u0600-\u06FF]/g);
  return (letters?.length || 0) >= 2;
}
