import { describe, expect, it } from 'vitest';
import {
  MAX_RECORDING_MS,
  NO_SPEECH_MS,
  RECORDING_FAILED_MESSAGE_AR,
  SILENCE_END_MS,
  UNSUPPORTED_MESSAGE_AR,
  decideStop,
  pickAudioMime,
  voiceStartFailureMessageAr,
} from '../src/lib/audio/useVoiceCapture';
import { MIC_PERMISSION_MESSAGE_AR, UNUSABLE_TRANSCRIPT_MESSAGE_AR } from '../src/lib/conversation/stateMachine';
import { VOICE_ACTIVITY_THRESHOLD } from '../src/lib/audio/useMicLevel';

const SPEAKING = VOICE_ACTIVITY_THRESHOLD + 0.2;
const QUIET = 0.01;

describe('decideStop', () => {
  it('keeps recording while the learner is still speaking', () => {
    expect(decideStop({ elapsedMs: 5000, spokeAtMs: 200, silenceMs: 0, amplitude: SPEAKING })).toBeNull();
  });

  it('lets a learner pause to think without cutting them off', () => {
    // A pause inside a sentence is not the end of it: German word order does this
    // to people, and a recorder that stops at the first gap grades half a sentence.
    expect(
      decideStop({ elapsedMs: 4000, spokeAtMs: 300, silenceMs: SILENCE_END_MS - 100, amplitude: QUIET }),
    ).toBeNull();
  });

  it('ends the recording once the learner has stopped talking', () => {
    expect(
      decideStop({ elapsedMs: 4000, spokeAtMs: 300, silenceMs: SILENCE_END_MS, amplitude: QUIET }),
    ).toBe('silence');
  });

  it('gives up when nobody speaks at all', () => {
    // The app must not hold the microphone open for a silent room while showing
    // nothing: this is the "tapped by mistake" case.
    expect(decideStop({ elapsedMs: NO_SPEECH_MS - 100, spokeAtMs: null, silenceMs: 0, amplitude: QUIET })).toBeNull();
    expect(decideStop({ elapsedMs: NO_SPEECH_MS, spokeAtMs: null, silenceMs: 0, amplitude: QUIET })).toBe('no_speech');
  });

  it('never reports silence before anything was said', () => {
    // Silence with no speech yet is "no speech", not "the learner finished" — the
    // distinction decides whether a model call is worth making.
    expect(decideStop({ elapsedMs: 3000, spokeAtMs: null, silenceMs: 3000, amplitude: QUIET })).toBeNull();
  });

  it('stops at the hard ceiling even mid-sentence', () => {
    expect(
      decideStop({ elapsedMs: MAX_RECORDING_MS, spokeAtMs: 100, silenceMs: 0, amplitude: SPEAKING }),
    ).toBe('max_duration');
  });

  it('honours injected limits, so the rules stay one implementation', () => {
    const limits = { maxDurationMs: 1000, silenceEndMs: 200, noSpeechMs: 500 };
    expect(decideStop({ elapsedMs: 1000, spokeAtMs: 10, silenceMs: 0, amplitude: SPEAKING }, limits)).toBe(
      'max_duration',
    );
    expect(decideStop({ elapsedMs: 400, spokeAtMs: 10, silenceMs: 200, amplitude: QUIET }, limits)).toBe('silence');
  });
});

describe('voiceStartFailureMessageAr', () => {
  it('explains every reason a recording could not start, in Arabic', () => {
    // The three callers (conversation, practice, public demo) each used to decide
    // this for themselves, and two of them discarded the return value entirely —
    // which made a denied microphone a button that visibly did nothing.
    expect(voiceStartFailureMessageAr('denied')).toBe(MIC_PERMISSION_MESSAGE_AR);
    expect(voiceStartFailureMessageAr('unsupported')).toBe(UNSUPPORTED_MESSAGE_AR);
    expect(voiceStartFailureMessageAr('empty')).toBe(UNUSABLE_TRANSCRIPT_MESSAGE_AR);
    expect(voiceStartFailureMessageAr('failed')).toBe(RECORDING_FAILED_MESSAGE_AR);
  });

  it('never answers a failure with an English internal message', () => {
    const kinds = ['denied', 'unsupported', 'empty', 'failed'] as const;
    for (const kind of kinds) {
      const message = voiceStartFailureMessageAr(kind);
      expect(message, kind).toMatch(/[\u0600-\u06FF]/);
      // Every one of them also names the way out the learner still has. Two
      // phrasings cover it — "اكتب جملتك" and "يمكنك الكتابة" — and both are
      // checked, because the promise is what must not go missing.
      expect(message, kind).toMatch(/اكتب|الكتابة/);
    }
  });
});

describe('pickAudioMime', () => {
  it('prefers the container the worker and the model both handle best', () => {
    expect(pickAudioMime(() => true)).toBe('audio/webm;codecs=opus');
  });

  it('falls back to what the browser actually supports', () => {
    // Safari records AAC in an MP4 container and nothing else from this list.
    expect(pickAudioMime((type) => type === 'audio/mp4')).toBe('audio/mp4');
    expect(pickAudioMime((type) => type.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickAudioMime((type) => type === 'audio/ogg;codecs=opus')).toBe('audio/ogg;codecs=opus');
  });

  it("asks the browser to choose when it supports nothing we know", () => {
    expect(pickAudioMime(() => false)).toBe('');
  });

  it('survives an engine that throws on an unknown type', () => {
    expect(
      pickAudioMime((type) => {
        if (type === 'audio/webm;codecs=opus') throw new Error('unsupported');
        return type === 'audio/mp4';
      }),
    ).toBe('audio/mp4');
    expect(
      pickAudioMime(() => {
        throw new Error('no MediaRecorder at all');
      }),
    ).toBe('');
  });
});
