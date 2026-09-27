import { describe, expect, it } from 'vitest';
import { chooseGermanVoice, type VoiceCandidate } from '@/lib/speech/voiceChoice';

/**
 * The voice the learner hears.
 *
 * The case that matters is the one reported from a real phone: Android offers its
 * own German engine (offline, `localService`) alongside Chrome's network voices, and
 * the owner asked for the device one. Ranking by name alone cannot make that choice,
 * which is why `local` is the first key.
 */
const voice = (name: string, lang = 'de-DE', local = false): VoiceCandidate => ({ name, lang, local });

describe('chooseGermanVoice', () => {
  it('picks the device engine over a network voice, whatever they are called', () => {
    const chosen = chooseGermanVoice([
      voice('Google Deutsch', 'de-DE', false),
      voice('Deutsch (Deutschland)', 'de-DE', true),
    ]);
    expect(chosen?.name).toBe('Deutsch (Deutschland)');
    expect(chosen?.local).toBe(true);
  });

  it('prefers a natural device voice when the platform ships several', () => {
    const chosen = chooseGermanVoice([
      voice('Deutsch (Deutschland)', 'de-DE', true),
      voice('Deutsch Natural', 'de-DE', true),
    ]);
    expect(chosen?.name).toBe('Deutsch Natural');
  });

  it('falls back to the best network voice when there is no device engine', () => {
    // Desktop Chrome: every German voice is served from Google's servers.
    const chosen = chooseGermanVoice([
      voice('Google Deutsch', 'de-DE', false),
      voice('Anna', 'de-DE', false),
      voice('Ping', 'de-DE', false),
    ]);
    expect(chosen?.name).toBe('Anna');
  });

  it('never chooses a non-German voice, even when the device has one', () => {
    const chosen = chooseGermanVoice([
      voice('English (United States)', 'en-US', true),
      voice('Arabic (Egypt)', 'ar-EG', true),
      voice('Français', 'fr-FR', true),
    ]);
    expect(chosen).toBeNull();
  });

  it('accepts the regional German variants, not only de-DE', () => {
    expect(chooseGermanVoice([voice('Deutsch (Österreich)', 'de-AT', true)])?.name).toBe('Deutsch (Österreich)');
    expect(chooseGermanVoice([voice('Deutsch (Schweiz)', 'de-CH', true)])?.name).toBe('Deutsch (Schweiz)');
  });

  it('is stable — the same catalogue always gives the same voice', () => {
    const catalogue = [
      voice('Google Deutsch', 'de-DE', false),
      voice('Deutsch (Deutschland)', 'de-DE', true),
      voice('Deutsch (Deutschland) #2', 'de-DE', true),
    ];
    const first = chooseGermanVoice(catalogue)?.name;
    for (let run = 0; run < 5; run += 1) {
      expect(chooseGermanVoice([...catalogue].reverse())?.name).toBe(first);
    }
  });
});
