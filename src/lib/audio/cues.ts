/**
 * The two sounds the microphone is allowed to make.
 *
 * The Android build of Chrome plays an OS-level chime when the *browser's* speech
 * recognizer opens the mic, and no page can mute a sound the operating system
 * makes. Katzu does not use that recognizer any more (see `useVoiceCapture`), so
 * the app owns its own feedback — and owns it properly:
 *
 * - a short, soft two-note blip, synthesised here rather than shipped as an audio
 *   file, so there is no asset to download, decode, or cache;
 * - at a level that reads as confirmation, not as an alarm. Two blips at ~90 ms
 *   and a peak gain of 0.06 are audible on a phone speaker and invisible in a
 *   noisy room — the haptic is the primary signal.
 *
 * Nothing here is on the critical path: no `AudioContext` support, a blocked
 * context, or a throw all leave the microphone working and silent.
 */

type CueKind = 'start' | 'stop';

/** Soft, rounded, no click: the ear hears a tone, not a transient. */
const CUES: Record<CueKind, { notes: Array<{ hz: number; at: number; ms: number }> }> = {
  // Rising: the mic is open.
  start: { notes: [{ hz: 660, at: 0, ms: 90 }, { hz: 990, at: 70, ms: 110 }] },
  // Falling, quieter: the mic is closed.
  stop: { notes: [{ hz: 660, at: 0, ms: 80 }, { hz: 440, at: 60, ms: 100 }] },
};

const PEAK_GAIN = 0.06;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context || context.state === 'closed') context = new Ctor();
  return context;
}

/**
 * Plays one cue. Safe to call from anywhere; resolves immediately when the cue
 * cannot play. The context is resumed here because every call is inside — or a
 * direct consequence of — the learner's tap on the orb.
 */
export function playCue(kind: CueKind): void {
  const ctx = audioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const note of CUES[kind].notes) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = note.hz;
      const start = now + note.at / 1000;
      const end = start + note.ms / 1000;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }
  } catch {
    /* no audio output available — the haptic still fires */
  }
}
