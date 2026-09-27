import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Live microphone amplitude and frequency bands, from the Web Audio API.
 *
 * This is the real signal — `AnalyserNode` over the learner's own MediaStream,
 * not an animation that pretends to react. The orb reads it every animation
 * frame through a stable `read()` function, so sixty redraws a second cost zero
 * React renders.
 *
 * Failure is a first-class state. A denied permission, a missing
 * `getUserMedia`, or a context that cannot resume all surface as `error`, and the
 * caller shows Arabic text plus the typed fallback rather than a dead microphone.
 */

export type MicLevelError = 'unsupported' | 'denied' | 'failed' | null;

export interface MicSample {
  /** Smoothed 0..1 amplitude (RMS mapped to a usable range). */
  amplitude: number;
  /** Four bands, low → high speech energy, each 0..1. */
  bands: [number, number, number, number];
  /** True while the stream is live and producing samples. */
  active: boolean;
}

const ZERO_SAMPLE: MicSample = { amplitude: 0, bands: [0, 0, 0, 0], active: false };

/** Speech sits between roughly 85 Hz and 3 kHz; the bands track that range. */
const BAND_UPPER_EDGES = [300, 900, 2000, 4200];
const ATTACK = 0.45;
const RELEASE = 0.07;
/** Below this, a frame counts as silence for voice-activity detection. */
export const VOICE_ACTIVITY_THRESHOLD = 0.11;

interface AudioGraph {
  context: AudioContext;
  stream: MediaStream;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
}

export interface UseMicLevelResult {
  isActive: boolean;
  error: MicLevelError;
  /** Starts the stream. Resolves null on success, or why it could not start. */
  start: () => Promise<MicLevelError>;
  stop: () => void;
  /** Current sample; call from a rAF loop. */
  read: () => MicSample;
}

export function useMicLevel(): UseMicLevelResult {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<MicLevelError>(null);
  const graphRef = useRef<AudioGraph | null>(null);
  const timeBufferRef = useRef<Float32Array | null>(null);
  const freqBufferRef = useRef<Uint8Array | null>(null);
  const smoothedRef = useRef({ amplitude: 0, bands: [0, 0, 0, 0] as [number, number, number, number] });

  const stop = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) {
      setIsActive(false);
      return;
    }
    try {
      graph.source.disconnect();
      graph.analyser.disconnect();
      graph.stream.getTracks().forEach((track) => track.stop());
      void graph.context.suspend();
    } catch {
      /* teardown is best-effort; the stream is already released below */
    }
    graphRef.current = null;
    smoothedRef.current = { amplitude: 0, bands: [0, 0, 0, 0] };
    setIsActive(false);
  }, []);

  /**
   * Bounded resume.
   *
   * A context that refuses to resume (no output device, a browser policy, a
   * headless environment) must never hold the microphone control hostage: speech
   * recognition is a separate API and works regardless, so a stalled or rejected
   * resume costs the orb its reactivity and nothing else. Without the bound, the
   * learner taps the orb and *nothing happens at all* — no listening, no error.
   */
  const resumeWithin = async (context: AudioContext, timeoutMs = 400): Promise<void> => {
    try {
      await Promise.race([
        context.resume(),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    } catch {
      /* a rejected resume is not a microphone failure */
    }
  };

  const start = useCallback(async (): Promise<MicLevelError> => {
    if (graphRef.current) {
      // Already running (the learner tapped the orb twice): resume and report.
      await resumeWithin(graphRef.current.context);
      setIsActive(true);
      setError(null);
      return null;
    }

    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!mediaDevices?.getUserMedia) {
      setError('unsupported');
      return 'unsupported';
    }

    try {
      const stream = await mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      const AudioContextCtor =
        typeof window !== 'undefined'
          ? window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          : undefined;
      if (!AudioContextCtor) {
        stream.getTracks().forEach((track) => track.stop());
        setError('unsupported');
        return 'unsupported';
      }

      const context = new AudioContextCtor();
      // Safari starts a fresh context suspended until a gesture; this call is
      // inside the learner's tap, so resuming here is legitimate — but bounded.
      if (context.state === 'suspended') await resumeWithin(context);

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);

      graphRef.current = { context, stream, analyser, source };
      timeBufferRef.current = new Float32Array(analyser.fftSize);
      freqBufferRef.current = new Uint8Array(analyser.frequencyBinCount);
      setError(null);
      setIsActive(true);
      return null;
    } catch (caught) {
      const name = (caught as { name?: string })?.name;
      const reason: MicLevelError = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed';
      setError(reason);
      setIsActive(false);
      return reason;
    }
  }, []);

  const read = useCallback((): MicSample => {
    const graph = graphRef.current;
    const timeBuffer = timeBufferRef.current;
    const freqBuffer = freqBufferRef.current;
    if (!graph || !timeBuffer || !freqBuffer) return ZERO_SAMPLE;

    graph.analyser.getFloatTimeDomainData(timeBuffer as Float32Array<ArrayBuffer>);
    let sumSquares = 0;
    for (let index = 0; index < timeBuffer.length; index += 1) sumSquares += timeBuffer[index] * timeBuffer[index];
    const rms = Math.sqrt(sumSquares / timeBuffer.length);
    // Speech RMS sits well below 1.0; 4.5 maps a normal voice onto most of the
    // range without clipping a loud one to the ceiling.
    const target = Math.min(1, rms * 4.5);

    const smoothed = smoothedRef.current;
    const coefficient = target > smoothed.amplitude ? ATTACK : RELEASE;
    smoothed.amplitude += (target - smoothed.amplitude) * coefficient;

    graph.analyser.getByteFrequencyData(freqBuffer as Uint8Array<ArrayBuffer>);
    const nyquist = graph.context.sampleRate / 2;
    let previousBin = 0;
    const bands: [number, number, number, number] = [0, 0, 0, 0];
    BAND_UPPER_EDGES.forEach((edge, bandIndex) => {
      const upperBin = Math.min(freqBuffer.length - 1, Math.floor((edge / nyquist) * freqBuffer.length));
      let total = 0;
      let count = 0;
      for (let bin = previousBin; bin <= upperBin; bin += 1) {
        total += freqBuffer[bin];
        count += 1;
      }
      const average = count > 0 ? total / count / 255 : 0;
      bands[bandIndex] = average;
      smoothed.bands[bandIndex] += (average - smoothed.bands[bandIndex]) * 0.25;
      previousBin = upperBin + 1;
    });

    return { amplitude: smoothed.amplitude, bands: smoothed.bands, active: true };
  }, []);

  useEffect(() => stop, [stop]);

  return { isActive, error, start, stop, read };
}
