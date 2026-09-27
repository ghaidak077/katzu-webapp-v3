import { useCallback, useEffect, useRef, useState } from 'react';
import { useMicLevel, VOICE_ACTIVITY_THRESHOLD, type MicSample } from './useMicLevel';
import { playCue } from './cues';
import { triggerHaptic } from '@/lib/utils/haptics';
import {
  MIC_PERMISSION_MESSAGE_AR,
  isUsableTranscript,
  UNUSABLE_TRANSCRIPT_MESSAGE_AR,
} from '@/lib/conversation/stateMachine';
import { workerClient } from '@/lib/api/workerClient';

/**
 * Speaking, for the real device a learner actually holds.
 *
 * This replaces the browser's Web Speech API (`webkitSpeechRecognition`), which
 * failed three ways at once on Android — the platform most of this app's learners
 * use (reported from a live session: the mic made the Android system chime and
 * recorded nothing):
 *
 *  1. it captured nothing. Chrome's recognizer and the app's own `getUserMedia`
 *     analyser (the orb's amplitude source) compete for the microphone, and the
 *     recognizer lost;
 *  2. it plays an Android system sound when it opens the mic, and a web page
 *     cannot mute a sound the operating system makes;
 *  3. it does not exist in Firefox at all, and is unreliable in iOS Safari, so
 *     "speak German" was silently unavailable on those browsers.
 *
 * One pipeline replaces it: `getUserMedia` for the stream (already needed by the
 * orb), `MediaRecorder` for the words, the worker's `/ai/transcribe` for the
 * recognition. That works on every target platform, keeps ONE microphone
 * acquisition, and gives the learner their own feedback — a haptic tap and a soft
 * synthesised blip — instead of the OS chime.
 *
 * Endpointing is local and explicit: the analyser that moves the orb also ends
 * the recording, so the learner stops speaking and the turn begins. The numbers
 * live in `decideStop` (pure, unit-tested) rather than inside the frame loop.
 */

export type VoiceCaptureFailure = 'unsupported' | 'denied' | 'failed' | 'empty';

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
  /** Starts recording. Resolves the reason it could not, or null on success. */
  start: () => Promise<VoiceCaptureFailure | null>;
  /** Ends the recording and transcribes what was said. */
  stop: () => void;
  /** Live microphone sample for the orb. */
  read: () => MicSample;
}

export function useVoiceCapture(options: VoiceCaptureOptions): UseVoiceCaptureResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  const mic = useMicLevel();
  // Stable members only: `mic` is a fresh object every render, and an effect
  // keyed on it would tear down a live recording on any unrelated re-render.
  const { start: startMic, stop: stopMic, read: readMic, getStream } = mic;

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stopReasonRef = useRef<StopReason>('manual');
  const frameRef = useRef(0);
  const maxDurationRef = useRef(options.maxDurationMs ?? MAX_RECORDING_MS);

  // Options through a ref: a re-render must never restart a recording.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const hasRecorder = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
    const canCapture = Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia);
    setIsSupported(hasRecorder && canCapture);
  }, []);

  const releaseMic = useCallback(() => {
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    recorderRef.current = null;
    chunksRef.current = [];
    stopMic();
    setIsRecording(false);
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

  const start = useCallback(async (): Promise<VoiceCaptureFailure | null> => {
    if (recorderRef.current) {
      finish('manual');
      return null;
    }
    if (!isSupported) return 'unsupported';

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
      setIsRecording(true);
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
  }, [finish, getStream, isSupported, readMic, releaseMic, startMic, transcribe]);

  /**
   * Stopping is also feedback: the learner gets the same cue and haptic whether
   * the app ended the recording or they did.
   */
  const stop = useCallback(() => {
    if (!recorderRef.current) return;
    triggerHaptic('light');
    playCue('stop');
    finish('manual');
  }, [finish]);

  useEffect(
    () => () => {
      window.cancelAnimationFrame(frameRef.current);
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      } catch {
        /* unmount during teardown is not a failure worth reporting */
      }
      stopMic();
    },
    [stopMic],
  );

  return { isRecording, isTranscribing, isSupported, start, stop, read: readMic };
}

export default useVoiceCapture;
