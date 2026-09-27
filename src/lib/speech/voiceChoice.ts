/**
 * Which German voice Katzu speaks with.
 *
 * The app used to rank by name — "prefer a natural female voice, then anything that
 * is not Google" — which is a guess about a catalogue that differs per platform. On
 * the device most learners hold it did the wrong thing: Android ships its **own**
 * German engine (offline, immediate, the voice the system speaks with), while
 * Chrome exposes Google's network voices, and the name heuristic could pick either.
 * The owner asked for the Android voice specifically, and the flag that identifies
 * it is not the name: `localService` is true for a voice rendered on the device and
 * false for one streamed from a server.
 *
 * So the ranking is:
 *
 *  1. **the device's own German voice** — offline, no round trip, and the voice the
 *     learner already hears from their phone (`localService`);
 *  2. a device voice with a "natural" name, if the platform offers several;
 *  3. any German voice at all — never stay silent when a usable voice exists,
 *     because a silent tutor is worse than a robotic one.
 *
 * Pure and small on purpose: this is a ranking decision, so it is a testable
 * function rather than a chain of `find(...)` calls inside a hook.
 */

export interface VoiceCandidate {
  name: string;
  lang: string;
  /** True when the engine renders this voice on the device, without a server. */
  local: boolean;
}

/** Names that usually mark a higher-quality/instrumented voice, when the platform has one. */
const NATURAL_HINTS = ['natural', 'neural', 'helena', 'anna', 'petra', 'katja', 'marlene', 'vicki'];

function isGerman(voice: VoiceCandidate): boolean {
  return String(voice.lang || '').toLowerCase().startsWith('de');
}

/** Prefer a named natural voice, then anything not branded by the browser vendor. */
function quality(voice: VoiceCandidate): number {
  const name = voice.name.toLowerCase();
  if (NATURAL_HINTS.some((hint) => name.includes(hint))) return 2;
  if (!name.includes('google')) return 1;
  return 0;
}

/**
 * Highest quality first, then by name.
 *
 * The name is the tie-break on purpose: a platform that lists two equally ranked
 * German voices would otherwise pick whichever the engine happened to enumerate
 * first, so the learner could get a different tutor voice after a device update.
 * Code-unit comparison, not `localeCompare`, so the order cannot depend on which
 * ICU data the browser ships.
 */
function rankQuality(a: VoiceCandidate, b: VoiceCandidate): number {
  const difference = quality(b) - quality(a);
  if (difference !== 0) return difference;
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}

export function chooseGermanVoice(voices: readonly VoiceCandidate[]): VoiceCandidate | null {
  const german = voices.filter(isGerman);
  if (german.length === 0) return null;

  const local = german.filter((voice) => voice.local).sort(rankQuality);
  if (local.length > 0) return local[0];

  // No device engine on this platform (desktop Chrome is the usual case: its
  // voices are served from the network), so the best available German voice wins.
  return [...german].sort(rankQuality)[0];
}
