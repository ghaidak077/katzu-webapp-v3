import type { MicSample } from './useMicLevel';

/**
 * The platform's own speech recognition, and the rules for when the app must stop
 * using it.
 *
 * WHY NATIVE FIRST, AGAIN, AFTER REMOVING IT
 * The previous pass deleted the Web Speech API and moved recognition to the worker
 * because on a real Android phone Chrome's recogniser *captured nothing* and played
 * a system chime. Both observations were real; the diagnosis of the first one was
 * incomplete. The recogniser did not fail on its own — the app was holding a
 * `getUserMedia` stream at the same time (the orb's analyser) and the two compete
 * for one microphone on that platform, with the recogniser losing. Native
 * recognition is also simply the better engine where it works: it is the phone's
 * own, it needs no round trip, no provider key and no per-minute cost, it returns
 * **interim** words as the learner speaks (which is what makes the chat feel live),
 * and it works offline.
 *
 * So the app uses it when it exists, and this file keeps the two things that make
 * that decision safe:
 *
 *  - **the competing stream is never opened.** In native mode the orb is driven by
 *    `syntheticListeningSample` (see its note) instead of an analyser of our own,
 *    because opening one is what broke the recogniser on the phone;
 *  - **every failure has a verdict.** `classifyRecognitionError` says whether a
 *    given engine error should be shown to the learner or answered by falling back
 *    to the recorder pipeline the app already ships (`/ai/transcribe`). A platform
 *    recogniser that misbehaves costs the learner nothing: the next attempt records
 *    and recognises on the worker instead.
 *
 * The chime is the one thing this file cannot remove, and it is documented rather
 * than hidden: the platform plays it when its recogniser opens the microphone, no
 * page can mute it, and preferring the device engine is a decision that accepts it.
 */

/** Shared with `useVoiceCapture`; the vocabulary every screen already shows. */
export type VoiceCaptureFailure = 'unsupported' | 'denied' | 'failed' | 'empty';

/** Which pipeline is currently serving the learner. `null` when nothing is running. */
export type VoiceMode = 'native' | 'recorder';

/**
 * How many times one session may hand over to the recorder after the platform
 * recogniser fails. Bounded on purpose: an engine that is broken on this device
 * must not make every tap try, fail and retry.
 */
export const MAX_NATIVE_FALLBACKS = 2;

/**
 * How long to wait for the engine's own `start` before treating it as a zombie.
 *
 * This is not hypothetical: desktop Edge and some Android builds accept `start()`,
 * say nothing at all, and never fire `onstart` *or* `onend`. The version of the app
 * that used the Web Speech API before had a three-second watchdog for it by name
 * ("zombie recognizer"), and dropping that while rewriting the pipeline is how a
 * learner ends up staring at a microphone that is listening to nothing.
 */
export const NATIVE_START_TIMEOUT_MS = 3000;
/** With words on screen, this is long enough for a slow engine to finish a sentence. */
export const NATIVE_MAX_SESSION_MS = 15000;
/** Nothing heard at all: the same patience the recorder path gives a silent room. */
export const NATIVE_NO_SPEECH_MS = 7000;

/**
 * Whether a native session should keep waiting, or be abandoned.
 *
 * `abandon` means "stop waiting on the engine": the caller then delivers whatever
 * was heard (the caption's own words) or reports that nothing was, and the recorder
 * pipeline answers the next attempt. It is a pure decision so the three cases —
 * never started, started and silent, started and talking for too long — are pinned
 * by tests rather than by a timer nobody can read.
 */
export function nativeWatchdogVerdict(input: {
  started: boolean;
  heardAnything: boolean;
  elapsedMs: number;
}): 'keep' | 'abandon' {
  if (!input.started) return input.elapsedMs >= NATIVE_START_TIMEOUT_MS ? 'abandon' : 'keep';
  if (input.heardAnything) return input.elapsedMs >= NATIVE_MAX_SESSION_MS ? 'abandon' : 'keep';
  return input.elapsedMs >= NATIVE_NO_SPEECH_MS ? 'abandon' : 'keep';
}

/** What the app should do about one engine error. */
export interface RecognitionVerdict {
  /** The failure to show, or null when there is nothing the learner needs to hear. */
  failure: VoiceCaptureFailure | null;
  /** Whether the recorder pipeline should answer this attempt instead. */
  fallback: boolean;
}

/**
 * W3C `SpeechRecognitionErrorEvent.error` values → what the learner gets.
 *
 * The table is the whole point of this module, so it is written out rather than
 * inferred from a prefix:
 *
 * | code                    | shown as                     | falls back |
 * |-------------------------|------------------------------|------------|
 * | `not-allowed`           | microphone permission denied | no         |
 * | `service-not-allowed`   | microphone permission denied | no         |
 * | `audio-capture`         | recording unavailable        | no         |
 * | `no-speech`             | nothing clear was heard      | **yes**    |
 * | `network`               | recording unavailable        | **yes**    |
 * | `language-not-supported`| recording unavailable        | **yes**    |
 * | `aborted`               | nothing clear was heard      | **yes**    |
 * | anything else           | recording unavailable        | **yes**    |
 *
 * Two of those choices are the interesting ones. `not-allowed` and
 * `audio-capture` do **not** fall back: a refused permission and a device with no
 * microphone fail identically in the recorder pipeline, so trying it would spend a
 * second permission prompt (and, on Android, a second chime) to prove nothing.
 * `no-speech` and `aborted` **do** fall back: those are the codes the recogniser
 * emits when it opened, heard something it could not use, and gave up — and that is
 * exactly the failure the phone reported.
 */
export function classifyRecognitionError(code: string, options: { requestedStop?: boolean } = {}): RecognitionVerdict {
  const value = String(code || '').toLowerCase();
  switch (value) {
    case 'not-allowed':
    case 'service-not-allowed':
      return { failure: 'denied', fallback: false };
    case 'audio-capture':
      return { failure: 'failed', fallback: false };
    case 'no-speech':
      return { failure: 'empty', fallback: true };
    case 'aborted':
      // An abort we asked for is the normal end of a learner who tapped stop with
      // nothing said; anything else is the engine giving up on its own.
      return options.requestedStop ? { failure: 'empty', fallback: false } : { failure: 'empty', fallback: true };
    case 'network':
    case 'language-not-supported':
      return { failure: 'failed', fallback: true };
    default:
      return { failure: 'failed', fallback: true };
  }
}

/** Whether this session has fallbacks left. Pure, so the budget is testable. */
export function mayFallBack(useCount: number, limit: number = MAX_NATIVE_FALLBACKS): boolean {
  return useCount < limit;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

/**
 * Whether this browser has a usable platform recogniser.
 *
 * Firefox has none at all, which is why the recorder pipeline is not dead code: it
 * is what those learners get, and it is what every learner gets when the platform
 * engine refuses this device.
 */
export function isNativeRecognitionAvailable(): boolean {
  return recognitionConstructor() !== null;
}

/**
 * Whether this browser can speak German back to the learner.
 *
 * The twin of `isNativeRecognitionAvailable`, and it exists because the TTS side
 * had no named check: `useSpeechOutput` asked `'speechSynthesis' in window` inline
 * at three separate sites, so the answer was duplicated, untested, and invisible
 * to a screen that wanted to offer typed input instead. One function means one
 * place to test and one place to branch on.
 *
 * Presence of the API is not the same as a usable voice: a browser can expose
 * `speechSynthesis` and still ship zero voices. Callers pair this with
 * `useSpeechOutput`'s `voicesReady` before promising spoken playback.
 */
export function isSpeechOutputAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

export interface NativeRecognitionHandlers {
  /** The words so far, re-sent as they change. Interims must never be sent as a turn. */
  onInterim: (text: string) => void;
  /** One finished sentence. */
  onFinal: (text: string) => void;
  /** The engine closed the microphone, for any reason. */
  onEnd: () => void;
  /** An engine error; `classifyRecognitionError` turns it into a verdict. */
  onError: (code: string) => void;
  onStart?: () => void;
}

export interface NativeRecognitionSession {
  /** Asks the engine to finish and deliver its final result. */
  stop: () => void;
  /** Tears the session down without a result. */
  abort: () => void;
}

/**
 * Opens one recognition session. Returns null when this browser has no native
 * recogniser, so a caller can decide synchronously.
 *
 * The engine's own endpointing is used (`continuous = false`): the learner stops
 * talking, the engine finalises, and the app never has to guess where a sentence
 * ended. Interim results are on because they are the live caption the learner sees
 * while speaking.
 */
export function startNativeRecognition(
  handlers: NativeRecognitionHandlers,
  lang = 'de-DE',
): NativeRecognitionSession | null {
  const Constructor = recognitionConstructor();
  if (!Constructor) return null;

  let recognition: SpeechRecognitionLike;
  try {
    recognition = new Constructor();
  } catch {
    return null;
  }

  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let closed = false;
  let finalText = '';
  let lastHeard = '';

  recognition.onstart = () => handlers.onStart?.();

  recognition.onresult = (event) => {
    // Read the **whole** list, not just from `resultIndex`: the spec's result list
    // is cumulative, so each event re-sends everything heard so far and the final
    // event re-sends the finalised text. Adding to a running total instead would
    // count the same words once per event ("Ich möchte einen Ich möchte einen
    // Kaffee"), which is exactly the kind of transcript that gets graded as the
    // learner's mistake.
    let final = '';
    let interim = '';
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript ?? '';
      if (result?.isFinal) final += transcript;
      else interim += transcript;
    }
    finalText = final;
    const spoken = `${final}${final && interim ? ' ' : ''}${interim}`.replace(/\s+/g, ' ').trim();
    lastHeard = spoken;
    if (interim) handlers.onInterim(spoken);
  };

  recognition.onerror = (event) => {
    closed = true;
    handlers.onError(String(event?.error || 'unknown'));
  };

  recognition.onend = () => {
    if (closed) return;
    closed = true;
    // The finalised text is what the engine stands behind. If it ended with words it
    // never finalised — some Android builds do exactly that — the last thing it
    // heard is still the learner's sentence, and the app's own `isUsableTranscript`
    // guard is what decides whether it is worth sending. Reporting "nothing heard"
    // while the caption on screen says otherwise would be a lie.
    const text = (finalText.trim() ? finalText : lastHeard).replace(/\s+/g, ' ').trim();
    if (text) handlers.onFinal(text);
    else handlers.onEnd();
  };

  try {
    recognition.start();
  } catch {
    // `start()` throws when a session is already running (InvalidStateError). A
    // second session is not what the caller wanted, and it is not an error the
    // learner needs: the running one is still live.
    return null;
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        /* already ended */
      }
    },
    abort: () => {
      closed = true;
      try {
        recognition.abort();
      } catch {
        /* already ended */
      }
    },
  };
}

/**
 * A breathing level for the orb while the platform recogniser owns the microphone.
 *
 * **Not a measurement, and named so nobody can mistake it for one.** In native mode
 * the app must not open its own `getUserMedia` stream (that competition is exactly
 * what silenced the recogniser on Android), so there is no analyser to read. The orb
 * is therefore driven by the recogniser's own state — open, and open for how long —
 * with a slow two-frequency envelope that reads as "listening" without claiming to
 * be the learner's voice. The `replying` motion has been documented the same way
 * since it was written; this is that rule applied honestly to one more state.
 */
export function syntheticListeningSample(elapsedMs: number): MicSample {
  const t = Math.max(0, elapsedMs);
  // Two incommensurate periods, so the breathing never visibly loops.
  const envelope = 0.2 + 0.09 * Math.sin(t / 430) + 0.05 * Math.sin(t / 167);
  const amplitude = Math.min(0.42, Math.max(0.06, envelope));
  // The bands follow the same envelope, weighted low → high like speech energy.
  const bands: [number, number, number, number] = [
    amplitude * 0.9,
    amplitude * 0.75,
    amplitude * 0.5,
    amplitude * 0.25,
  ];
  return { amplitude, bands, active: true };
}
