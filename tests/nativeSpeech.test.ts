import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_NATIVE_FALLBACKS,
  NATIVE_MAX_SESSION_MS,
  NATIVE_NO_SPEECH_MS,
  NATIVE_START_TIMEOUT_MS,
  classifyRecognitionError,
  isNativeRecognitionAvailable,
  mayFallBack,
  nativeWatchdogVerdict,
  syntheticListeningSample,
} from '@/lib/audio/nativeSpeech';

/**
 * When the platform's recogniser is used, and what happens when it cannot do the job.
 *
 * This is the rule that decides whether a learner on a device whose native engine
 * misbehaves gets a second chance automatically or is simply told what happened, so
 * it is pinned here rather than inferred from the call site. The two refusals
 * (`not-allowed`, `audio-capture`) deliberately do **not** fall back: the recorder
 * pipeline fails identically for both, and on Android retrying costs the learner a
 * second microphone chime to prove what the first attempt already said.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('classifyRecognitionError', () => {
  it('shows a refusal instead of retrying it on the other engine', () => {
    for (const code of ['not-allowed', 'service-not-allowed']) {
      const verdict = classifyRecognitionError(code);
      expect(verdict, code).toEqual({ failure: 'denied', fallback: false });
    }
    expect(classifyRecognitionError('audio-capture')).toEqual({ failure: 'failed', fallback: false });
  });

  it('hands the phone\u2019s own failure to the recorder pipeline', () => {
    // `no-speech` and `aborted` are what an engine emits when it opened, heard
    // something it could not use, and gave up — the reported Android failure.
    expect(classifyRecognitionError('no-speech')).toEqual({ failure: 'empty', fallback: true });
    expect(classifyRecognitionError('aborted')).toEqual({ failure: 'empty', fallback: true });
    expect(classifyRecognitionError('network')).toEqual({ failure: 'failed', fallback: true });
    expect(classifyRecognitionError('language-not-supported')).toEqual({ failure: 'failed', fallback: true });
  });

  it('treats an abort the learner asked for as a normal end, not an engine failure', () => {
    // Tapping stop with nothing said is not the recogniser misbehaving, so it must
    // not spend a fallback that a genuinely broken engine will need.
    expect(classifyRecognitionError('aborted', { requestedStop: true })).toEqual({
      failure: 'empty',
      fallback: false,
    });
  });

  it('falls back on a code it has never seen, rather than staying silent', () => {
    for (const code of ['something-new', '', 'AUDIO-CAPTURE-ISH']) {
      const verdict = classifyRecognitionError(code);
      expect(verdict.fallback, code).toBe(true);
      expect(verdict.failure, code).not.toBeNull();
    }
  });

  it('is case-insensitive, because engines disagree about casing', () => {
    expect(classifyRecognitionError('No-Speech')).toEqual(classifyRecognitionError('no-speech'));
    expect(classifyRecognitionError('NOT-ALLOWED')).toEqual(classifyRecognitionError('not-allowed'));
  });
});

describe('mayFallBack', () => {
  it('bounds how many times one session may hand over to the recorder', () => {
    expect(MAX_NATIVE_FALLBACKS).toBe(2);
    expect(mayFallBack(0)).toBe(true);
    expect(mayFallBack(1)).toBe(true);
    expect(mayFallBack(2)).toBe(false);
    expect(mayFallBack(3)).toBe(false);
  });
});

describe('isNativeRecognitionAvailable', () => {
  it('is false when there is no window at all (server render, worker)', () => {
    vi.stubGlobal('window', undefined);
    expect(isNativeRecognitionAvailable()).toBe(false);
  });

  it('accepts the prefixed constructor, which is what Safari and older Chrome expose', () => {
    vi.stubGlobal('window', { webkitSpeechRecognition: class {} });
    expect(isNativeRecognitionAvailable()).toBe(true);
    vi.stubGlobal('window', { SpeechRecognition: class {} });
    expect(isNativeRecognitionAvailable()).toBe(true);
    // Firefox: neither. The recorder pipeline is what those learners get.
    vi.stubGlobal('window', {});
    expect(isNativeRecognitionAvailable()).toBe(false);
  });
});

describe('nativeWatchdogVerdict', () => {
  it('gives a zombie engine a few seconds, then lets go', () => {
    // Measured behaviour on desktop Edge and some Android builds: `start()` is
    // accepted, `onstart` never fires, `onend` never fires, and the UI sits on
    // "listening" for as long as the learner is willing to wait.
    expect(nativeWatchdogVerdict({ started: false, heardAnything: false, elapsedMs: 0 })).toBe('keep');
    expect(
      nativeWatchdogVerdict({ started: false, heardAnything: false, elapsedMs: NATIVE_START_TIMEOUT_MS - 1 }),
    ).toBe('keep');
    expect(
      nativeWatchdogVerdict({ started: false, heardAnything: false, elapsedMs: NATIVE_START_TIMEOUT_MS }),
    ).toBe('abandon');
  });

  it('waits patiently once it is hearing words, and still bounds the session', () => {
    expect(nativeWatchdogVerdict({ started: true, heardAnything: true, elapsedMs: NATIVE_NO_SPEECH_MS + 1000 })).toBe('keep');
    expect(
      nativeWatchdogVerdict({ started: true, heardAnything: true, elapsedMs: NATIVE_MAX_SESSION_MS }),
    ).toBe('abandon');
  });

  it('does not hold the microphone for a silent room', () => {
    expect(nativeWatchdogVerdict({ started: true, heardAnything: false, elapsedMs: 1000 })).toBe('keep');
    expect(nativeWatchdogVerdict({ started: true, heardAnything: false, elapsedMs: NATIVE_NO_SPEECH_MS })).toBe(
      'abandon',
    );
  });
});

describe('syntheticListeningSample', () => {
  it('breathes inside a range that cannot be mistaken for the learner\u2019s voice', () => {
    // It drives a decorative orb while the platform recogniser owns the microphone.
    // It must be visibly alive and must never approach a level the app would treat
    // as speech (`VOICE_ACTIVITY_THRESHOLD` is 0.11) — nothing may read this as a
    // measurement of anyone speaking.
    const samples = Array.from({ length: 200 }, (_, index) => syntheticListeningSample(index * 25));
    const amplitudes = samples.map((sample) => sample.amplitude);
    expect(Math.min(...amplitudes)).toBeGreaterThan(0);
    expect(Math.max(...amplitudes)).toBeLessThan(0.45);
    expect(new Set(amplitudes).size).toBeGreaterThan(20);
    for (const sample of samples) {
      expect(sample.active).toBe(true);
      expect(sample.bands).toHaveLength(4);
      // Bands fall off towards the top, like speech energy does.
      expect(sample.bands[0]).toBeGreaterThanOrEqual(sample.bands[3]);
    }
  });
});
