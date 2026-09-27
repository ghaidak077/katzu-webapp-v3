import { useCallback, useEffect, useRef, useState } from 'react';
import { useMicLevel, VOICE_ACTIVITY_THRESHOLD, type MicSample } from './useMicLevel';
import { playCue } from './cues';
import { triggerHaptic } from '@/lib/utils/haptics';
import {
  MIC_PERMISSION_MESSAGE_AR,
  isUsableTranscript,
  UNUSABLE_TRANSCRIPT_MESSAGE_AR,
} from '@/lib/conversation/stateMachine';
import {
  classifyRecognitionError,
  isNativeRecognitionAvailable,
  mayFallBack,
  nativeWatchdogVerdict,
  startNativeRecognition,
  syntheticListeningSample,
  type NativeRecognitionSession,
  type VoiceCaptureFailure,
  type VoiceMode,
} from './nativeSpeech';
import { workerClient } from '@/lib/api/workerClient';

/**
 * Speaking, for the device the learner actually holds.
 *
 * TWO ENGINES, AND WHY BOTH
 * The platform's own recogniser is used first (`nativeSpeech.ts`): it is the
 * phone's own engine, it returns words *while* the learner speaks — which is what
 * makes the conversation feel live — and it needs no round trip, no provider key
 * and no per-minute cost. The app already shipped a second pipeline for the
 * browsers that have no native recognition at all (Firefox): record with
 * `MediaRecorder` and recognise on the worker (`POST /ai/transcribe`). That one is
 * no longer the default, and it is not deleted, because a platform recogniser that
 * cannot do the job on a given device must cost the learner nothing:
 *
 *  - when the engine reports something it cannot work with (`no-speech`,
 *    `aborted`, `network`, `language-not-supported`), the hook switches this
 *    session's remaining attempts to the recorder pipeline — bounded by
 *    `MAX_NATIVE_FALLBACKS` so a broken engine cannot make every tap try, fail and
 *    retry;
 *  - when it reports a refusal (`not-allowed`, `audio-capture`) nothing is gained
 *    by trying the other engine, so the learner is told.
 *
 * THE ONE BUG THIS SHAPE EXISTS TO AVOID
 * Native recognition previously "recorded nothing" on Android. The cause was this
 * hook's own gratitude for the orb: it opened a `getUserMedia` stream for the
 * analyser, and on that platform the two compete for one microphone, with the
 * recogniser losing. Native mode therefore **never opens a stream** — the orb is
 * driven by `syntheticListeningSample`, which says the microphone is open without
 * pretending to measure it — and the recorder path is the only place a stream is
 * acquired. That is also why the two paths never run at once.
 *
 * The platform's microphone chime is the one thing this design accepts: it is the
 * operating system's sound, no page can mute it, and it is the price of using the
 * device engine. The app's own blip and haptic still mark the start and the end.
 */

export type { VoiceCaptureFailure, VoiceMode } from './nativeSpeech';

export interface VoiceCaptureOptions {
  /** One finished, recognised German sentence. */
  onTranscript: (text: string) => void;
  /** Something went wrong; `messageAr` is ready to show. */
  onFailure: (failure: VoiceCaptureFailure, messageAr: string) => void;
  /** Injected in tests; defaults to the worker's transcription route. */
  transcribe?: (audio: { base64: string; mime: string }) => Promise<{ text: string }>;
  /** Hard ceiling on one recording. See `MAX_RECORDING_MS`. */
  maxDurationMs?: number;
}

/** A sentence, not a monologue: 20s of German holds a full A1–B2 answer. */
export const MAX_RECORDING_MS = 20000;
/** This much silence after speech ends the recording. */
export const SILENCE_END_MS = 1200;
/** Nobody said anything for this long: stop rather than record a silent room. */
export const NO_SPEECH_MS = 7000;
/** Under this, the learner tapped and stopped by accident — not worth a model call. */
export const MIN_RECORDING_MS = 400;
/** The worker rejects anything longer; checking here keeps a doomed request home. */
const MAX_ENCODED_CHARS = 400000;

export const RECORDING_FAILED_MESSAGE_AR =
  'تعذّر تجهيز التسجيل على هذا المتصفح. يمكنك الكتابة بالألمانية — النتيجة نفسها.';
export const TOO_LONG_MESSAGE_AR = 'التسجيل أطول من المسموح. سجّل جملة واحدة قصيرة.';
export const TRANSCRIBE_FAILED_MESSAGE_AR =
  'تعذر التعرف على صوتك الآن. أعد المحاولة، أو اكتب جملتك بالألمانية — النتيجة نفسها.';
export const UNSUPPORTED_MESSAGE_AR =
  'هذا المتصفح لا يسجّل الصوت. اكتب جملتك بالألمانية — النتيجة نفسها.';

/**
 * The Arabic line for a failure `start()` **returned**.
 *
 * `start()` reports its failures two ways on purpose: as a return value, because a
 * caller may need to tell "the microphone never opened" from "the learner said
 * nothing", and through `onFailure` for everything that happens *after* recording
 * begins. Two of the three callers only read the return value, and one of them
 * discarded it — so a denied microphone was a tap that visibly did nothing. Every
 * screen that shows a message shows this one, so the wording cannot drift between
 * the conversation, the practice screen and the public demo.
 */
export function voiceStartFailureMessageAr(failure: VoiceCaptureFailure): string {
  if (failure === 'denied') return MIC_PERMISSION_MESSAGE_AR;
  if (failure === 'unsupported') return UNSUPPORTED_MESSAGE_AR;
  if (failure === 'empty') return UNUSABLE_TRANSCRIPT_MESSAGE_AR;
  return RECORDING_FAILED_MESSAGE_AR;
}

export interface StopDecisionInput {
  /** Milliseconds since the recording started. */
  elapsedMs: number;
  /** When speech was first detected, or null if the learner has not spoken yet. */
  spokeAtMs: number | null;
  /** How long the current silence has lasted (0 while they are speaking). */
  silenceMs: number;
  amplitude: number;
}

export type StopReason = 'max_duration' | 'silence' | 'no_speech' | 'manual';

/**
 * Whether to end the recording, as one pure rule.
 *
 * Exported so the boundaries are testable without a microphone: a learner who
 * paused to think must not be cut off, and one who tapped by mistake must not
 * hold the microphone for twenty seconds while the app says nothing.
 */
export function decideStop(
  input: StopDecisionInput,
  limits: { maxDurationMs: number; silenceEndMs: number; noSpeechMs: number } = {
    maxDurationMs: MAX_RECORDING_MS,
    silenceEndMs: SILENCE_END_MS,
    noSpeechMs: NO_SPEECH_MS,
  },
): StopReason | null {
  if (input.elapsedMs >= limits.maxDurationMs) return 'max_duration';
  const speaking = input.amplitude > VOICE_ACTIVITY_THRESHOLD;
  if (input.spokeAtMs == null) {
    // Still waiting for a first word — counted from the start, because the
    // learner's silence here is the app holding the microphone for nothing.
    return !speaking && input.elapsedMs >= limits.noSpeechMs ? 'no_speech' : null;
  }
  return !speaking && input.silenceMs >= limits.silenceEndMs ? 'silence' : null;
}

/** The recorder's container, the most capable one the browser actually supports. */
export function pickAudioMime(isSupported: (type: string) => boolean = () => false): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  for (const candidate of candidates) {
    try {
      if (isSupported(candidate)) return candidate;
    } catch {
      /* an engine that throws on an unknown type simply cannot record it */
    }
  }
  // '' lets the browser choose its own default container, which the worker sniffs.
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('read_failed'));
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.readAsDataURL(blob);
  });
}

export interface UseVoiceCaptureResult {
  isRecording: boolean;
  isTranscribing: boolean;
  isSupported: boolean;
  /** Which engine is serving this attempt, or null when nothing is running. */
  mode: VoiceMode | null;
  /**
   * The words so far, while the learner is speaking — the live caption. Native
   * recognition only; empty on the recorder path, which cannot know them until the
   * recording ends.
   */
  interimText: string;
  /** Starts listening. Resolves the reason it could not, or null on success. */
  start: () => Promise<VoiceCaptureFailure | null>;
  /** Ends the recording and transcribes what was said. */
  stop: () => void;
  /** Live microphone sample for the orb. */
  read: () => MicSample;
}

/** Whether this browser can record and send audio to the worker. */
function canRecord(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof window.MediaRecorder !== 'undefined' &&
    Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia)
  );
}

export function useVoiceCapture(options: VoiceCaptureOptions): UseVoiceCaptureResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [mode, setMode] = useState<VoiceMode | null>(null);
  const [interimText, setInterimText] = useState('');

  const mic = useMicLevel();
  // Stable members only: `mic` is a fresh object every render, and an effect
  // keyed on it would tear down a live session on any unrelated re-render.
  const { start: startMic, stop: stopMic, read: readMic, getStream } = mic;

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stopReasonRef = useRef<StopReason>('manual');
  const frameRef = useRef(0);
  const maxDurationRef = useRef(options.maxDurationMs ?? MAX_RECORDING_MS);

  // Native sessions: the engine's session, whether the learner asked to stop, and
  // how many times this session has handed over to the recorder.
  const nativeRef = useRef<NativeRecognitionSession | null>(null);
  const nativeAskedStopRef = useRef(false);
  const nativeStartedAtRef = useRef(0);
  const nativeFallbacksRef = useRef(0);
  const nativeRetiredRef = useRef(false);
  // Watchdog state: did the engine announce itself, and what has it heard?
  const nativeStartSeenRef = useRef(false);
  const nativeHeardRef = useRef<string | null>(null);
  const nativeWatchRef = useRef(0);

  // Options through a ref: a re-render must never restart a recording.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // A platform recogniser that exists is enough on its own: the recorder path is
    // the fallback, not a requirement, and a device that ships the first without
    // `MediaRecorder` can still speak to the app.
    setIsSupported(isNativeRecognitionAvailable() || canRecord());
  }, []);

  const releaseMic = useCallback(() => {
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    recorderRef.current = null;
    chunksRef.current = [];
    stopMic();
    setIsRecording(false);
    setMode(null);
  }, [stopMic]);

  const transcribe = useCallback(async (base64: string, mime: string) => {
    if (base64.length > MAX_ENCODED_CHARS) {
      optionsRef.current.onFailure('failed', TOO_LONG_MESSAGE_AR);
      return;
    }
    setIsTranscribing(true);
    try {
      // Called through the client, never as a detached reference: `workerClient`
      // methods read `this` (the base URL and the auth token), so handing one
      // straight to `run` throws before a request is ever made — which reached the
      // learner as an English engine message and an empty input box.
      const run =
        optionsRef.current.transcribe ??
        ((audio: { base64: string; mime: string }) => workerClient.transcribeAudio(audio));
      const { text } = await run({ base64, mime });
      const cleaned = String(text || '').trim();
      // Recognition returning noise ("a", a dash) is a failed listening attempt,
      // not a turn: sending it would spend a model call and a unit of quota to
      // grade a sentence the learner never said.
      if (!isUsableTranscript(cleaned)) {
        optionsRef.current.onFailure('empty', UNUSABLE_TRANSCRIPT_MESSAGE_AR);
        return;
      }
      optionsRef.current.onTranscript(cleaned);
    } catch (error) {
      // Never swallowed. An error raised by our own client boundary carries a
      // `code` and a message already written in Arabic (a dead session, a paywall,
      // audio the worker refused) — that one is the learner's to read. Anything
      // else is an engine message in English about internals the learner cannot
      // act on, so it gets the app's own Arabic retry text instead.
      const coded = error as { message?: string; code?: string };
      optionsRef.current.onFailure(
        'failed',
        coded?.code && coded.message ? String(coded.message) : TRANSCRIBE_FAILED_MESSAGE_AR,
      );
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  /** Ends the recording for a reason. The recorder's own `onstop` does the rest. */
  const finish = useCallback(
    (reason: StopReason) => {
      const recorder = recorderRef.current;
      if (!recorder) return;
      stopReasonRef.current = reason;
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        releaseMic();
      }
    },
    [releaseMic],
  );

  /** Closes the native session's own state. The engine may still deliver a final. */
  const closeNative = useCallback(() => {
    window.clearInterval(nativeWatchRef.current);
    nativeWatchRef.current = 0;
    nativeRef.current = null;
    nativeAskedStopRef.current = false;
    nativeStartSeenRef.current = false;
    nativeHeardRef.current = null;
    setMode(null);
    setInterimText('');
    setIsRecording(false);
  }, []);

  /** Spends one fallback, and retires the native engine when the budget is gone. */
  const spendFallback = useCallback(() => {
    nativeFallbacksRef.current += 1;
    if (!mayFallBack(nativeFallbacksRef.current)) nativeRetiredRef.current = true;
  }, []);

  const startRecorder = useCallback(async (): Promise<VoiceCaptureFailure | null> => {
    if (!canRecord()) return 'unsupported';
    const micFailure = await startMic();
    if (micFailure) return micFailure;

    const stream = getStream();
    if (!stream) return 'failed';

    try {
      const mimeType = pickAudioMime((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 16000 })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      stopReasonRef.current = 'manual';
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const elapsed = Date.now() - startedAtRef.current;
        const reason = stopReasonRef.current;
        // The microphone is released before the network call: the OS indicator
        // goes out the moment the learner stops talking, not when the model
        // answers.
        releaseMic();
        const tooShort = elapsed < MIN_RECORDING_MS || chunks.length === 0;
        if (tooShort || reason === 'no_speech') {
          optionsRef.current.onFailure('empty', UNUSABLE_TRANSCRIPT_MESSAGE_AR);
          return;
        }
        void blobToBase64(new Blob(chunks, { type }))
          .then((base64) => transcribe(base64, type.split(';')[0]))
          .catch(() => optionsRef.current.onFailure('failed', RECORDING_FAILED_MESSAGE_AR));
      };

      recorder.onerror = () => {
        releaseMic();
        optionsRef.current.onFailure('failed', RECORDING_FAILED_MESSAGE_AR);
      };

      // Timeslice: a recorder that only emits on `stop` can emit nothing at all
      // when the recording is very short, which looks exactly like a dead mic.
      recorder.start(250);
      setMode('recorder');
      setIsRecording(true);
      setInterimText('');
      triggerHaptic('medium');
      playCue('start');

      // The orb's analyser is the endpoint detector too.
      let spokeAtMs: number | null = null;
      let silentSince = 0;
      const loop = () => {
        const sample = readMic();
        const elapsed = Date.now() - startedAtRef.current;
        const speaking = sample.active && sample.amplitude > VOICE_ACTIVITY_THRESHOLD;
        if (speaking) {
          if (spokeAtMs == null) spokeAtMs = elapsed;
          silentSince = 0;
        } else if (spokeAtMs != null && silentSince === 0) {
          silentSince = Date.now();
        }
        const reason = decideStop(
          {
            elapsedMs: elapsed,
            spokeAtMs,
            silenceMs: silentSince ? Date.now() - silentSince : 0,
            amplitude: sample.active ? sample.amplitude : 0,
          },
          {
            maxDurationMs: maxDurationRef.current,
            silenceEndMs: SILENCE_END_MS,
            noSpeechMs: NO_SPEECH_MS,
          },
        );
        if (reason) {
          finish(reason);
          return;
        }
        frameRef.current = window.requestAnimationFrame(loop);
      };
      frameRef.current = window.requestAnimationFrame(loop);
      return null;
    } catch {
      releaseMic();
      return 'failed';
    }
  }, [finish, getStream, readMic, releaseMic, startMic, transcribe]);

  const startNative = useCallback((): VoiceCaptureFailure | null => {
    const session = startNativeRecognition({
      onStart: () => {
        nativeStartSeenRef.current = true;
        setIsRecording(true);
        playCue('start');
      },
      onInterim: (text) => {
        nativeHeardRef.current = text;
        setInterimText(text);
      },
      onFinal: (text) => {
        const requestedStop = nativeAskedStopRef.current;
        closeNative();
        const cleaned = String(text || '').trim();
        // Nothing usable is a failed attempt, not a turn — the same rule the
        // worker path applies to a transcript it could not use.
        if (!isUsableTranscript(cleaned)) {
          optionsRef.current.onFailure('empty', UNUSABLE_TRANSCRIPT_MESSAGE_AR);
          return;
        }
        if (requestedStop) {
          triggerHaptic('light');
          playCue('stop');
        }
        optionsRef.current.onTranscript(cleaned);
      },
      onEnd: () => {
        closeNative();
        // The engine closed without a final result. That is the case the phone
        // reported, and it is the reason the recorder pipeline is still here: the
        // next attempt uses it.
        spendFallback();
        optionsRef.current.onFailure('empty', UNUSABLE_TRANSCRIPT_MESSAGE_AR);
      },
      onError: (code) => {
        const verdict = classifyRecognitionError(code, {
          requestedStop: nativeAskedStopRef.current,
        });
        closeNative();
        if (verdict.fallback) spendFallback();
        if (verdict.failure) {
          optionsRef.current.onFailure(verdict.failure, voiceStartFailureMessageAr(verdict.failure));
        }
      },
    });

    // The constructor exists (the caller checked) and still no session came back:
    // `start()` threw, which means the engine is not usable right now. That is a
    // recording failure, not a browser without support.
    if (!session) return 'failed';

    nativeRef.current = session;
    nativeAskedStopRef.current = false;
    nativeStartedAtRef.current = Date.now();
    nativeStartSeenRef.current = false;
    nativeHeardRef.current = null;
    setMode('native');
    setInterimText('');
    setIsRecording(true);
    triggerHaptic('medium');

    // The zombie guard. An engine that never reports anything cannot be allowed to
    // hold the microphone: the learner would watch "listening" while nothing is
    // ever recognised. When the watchdog gives up, the words on screen (if any) are
    // the learner's sentence — the caption and the transcript can never disagree
    // about what was said — and the next attempt records instead.
    nativeWatchRef.current = window.setInterval(() => {
      const open = nativeRef.current;
      if (!open) return;
      const verdict = nativeWatchdogVerdict({
        started: nativeStartSeenRef.current,
        heardAnything: Boolean(nativeHeardRef.current),
        elapsedMs: Date.now() - nativeStartedAtRef.current,
      });
      if (verdict !== 'abandon') return;
      const heard = nativeHeardRef.current;
      closeNative();
      open.abort();
      spendFallback();
      if (heard) optionsRef.current.onTranscript(heard);
      else optionsRef.current.onFailure('empty', UNUSABLE_TRANSCRIPT_MESSAGE_AR);
    }, 500);
    return null;
  }, [closeNative, spendFallback]);

  const start = useCallback(async (): Promise<VoiceCaptureFailure | null> => {
    if (recorderRef.current || nativeRef.current) {
      // A second tap is a stop, never a second engine.
      if (nativeRef.current) {
        nativeAskedStopRef.current = true;
        nativeRef.current.stop();
      } else {
        finish('manual');
      }
      return null;
    }
    if (isNativeRecognitionAvailable() && !nativeRetiredRef.current) {
      const failure = startNative();
      if (!failure) return null;
      // The engine exists but refused to open; the recorder is the answer.
      spendFallback();
    }
    if (!isSupported) return 'unsupported';
    return startRecorder();
  }, [finish, isSupported, spendFallback, startNative, startRecorder]);

  /**
   * Stopping is also feedback: the learner gets the same cue and haptic whether
   * the app ended it or they did.
   */
  const stop = useCallback(() => {
    if (nativeRef.current) {
      nativeAskedStopRef.current = true;
      playCue('stop');
      nativeRef.current.stop();
      // The engine finalises asynchronously; the screen must stop saying
      // "listening" the moment the learner stops, not when the text arrives.
      setIsRecording(false);
      return;
    }
    if (!recorderRef.current) return;
    triggerHaptic('light');
    playCue('stop');
    finish('manual');
  }, [finish]);

  /**
   * The orb's level. Real analyser samples on the recorder path; on the native path
   * there is deliberately no stream of ours to read (see the header), so the orb
   * breathes from the recogniser's own open/closed state.
   */
  const read = useCallback((): MicSample => {
    if (nativeRef.current) return syntheticListeningSample(Date.now() - nativeStartedAtRef.current);
    return readMic();
  }, [readMic]);

  useEffect(
    () => () => {
      window.cancelAnimationFrame(frameRef.current);
      window.clearInterval(nativeWatchRef.current);
      nativeRef.current?.abort();
      nativeRef.current = null;
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      } catch {
        /* unmount during teardown is not a failure worth reporting */
      }
      stopMic();
    },
    [stopMic],
  );

  return { isRecording, isTranscribing, isSupported, mode, interimText, start, stop, read };
}

export default useVoiceCapture;
