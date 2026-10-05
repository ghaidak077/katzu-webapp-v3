import { useState, useEffect, useRef, useCallback } from 'react';
import { chooseGermanVoice } from './voiceChoice';
import { isSpeechOutputAvailable } from '@/lib/audio/nativeSpeech';

interface UseSpeechOutputOptions {
  speed?: number; // 0.8 or 1.0
  lang?: string; // 'de-DE'
  onWordBoundary?: (charIndex: number, charLength: number) => void;
  onEnd?: () => void;
}

// Module-level singletons: voice availability and the user-gesture unlock are
// shared across every screen that uses TTS (browsers only unlock audio after
// the user interacts with the page — a mobile autoplay policy).
let ttsPrimedByGesture = false;
let voicesDiscovered = false;

/**
 * The device's own German voice when it has one, otherwise the best available.
 *
 * The ranking lives in `voiceChoice.ts` so the decision is testable; this is only
 * the adapter from the platform's `SpeechSynthesisVoice` objects to it.
 */
function selectGermanVoice(synth: SpeechSynthesis | null): SpeechSynthesisVoice | null {
  if (!synth) return null;
  const voices = synth.getVoices();
  if (voices.length === 0) return null;
  const ranked = chooseGermanVoice(
    voices.map((voice) => ({
      name: voice.name,
      lang: voice.lang,
      // `localService` is true for a voice rendered on the device. It is the flag
      // that distinguishes Android's own engine from Chrome's network voices.
      local: Boolean(voice.localService),
    })),
  );
  if (!ranked) return null;
  return voices.find((voice) => voice.name === ranked.name && voice.lang === ranked.lang) || null;
}

export function useSpeechOutput({
  speed = 1.0,
  lang = 'de-DE',
  onWordBoundary,
  onEnd,
}: UseSpeechOutputOptions = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);
  const [voicesReady, setVoicesReady] = useState(voicesDiscovered);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Latest callbacks via refs so a changing identity never breaks speech.
  const onWordBoundaryRef = useRef(onWordBoundary);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onWordBoundaryRef.current = onWordBoundary;
  }, [onWordBoundary]);
  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  // Synth + voice discovery. Chrome/Android populate voices asynchronously —
  // listening for 'voiceschanged' is what makes auto-speak actually audible.
  useEffect(() => {
    if (!isSpeechOutputAvailable()) return;
    const synth = window.speechSynthesis;
    synthRef.current = synth;

    const loadVoices = () => {
      if (synth.getVoices().length > 0) {
        voicesDiscovered = true;
        setVoicesReady(true);
      }
    };
    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);
    // Belt-and-suspenders for engines that never fire voiceschanged.
    const retry = window.setInterval(loadVoices, 1000);
    const stopRetry = window.setTimeout(() => window.clearInterval(retry), 8000);

    return () => {
      synth.removeEventListener?.('voiceschanged', loadVoices);
      window.clearInterval(retry);
      window.clearTimeout(stopRetry);
    };
  }, []);

  // Prime the TTS engine on the user's first gesture anywhere in the app:
  // speak a silent utterance so subsequent programmatic speech is allowed.
  useEffect(() => {
    if (ttsPrimedByGesture) return;
    const prime = () => {
      ttsPrimedByGesture = true;
      try {
        if (isSpeechOutputAvailable()) {
          const u = new SpeechSynthesisUtterance(' ');
          u.volume = 0;
          u.lang = 'de-DE';
          window.speechSynthesis.speak(u);
        }
      } catch {
        /* ignore — priming is best-effort */
      }
    };
    const opts = { once: true, capture: true } as AddEventListenerOptions;
    window.addEventListener('pointerdown', prime, opts);
    window.addEventListener('touchstart', prime, opts);
    window.addEventListener('keydown', prime, opts);
    return () => {
      window.removeEventListener('pointerdown', prime, opts);
      window.removeEventListener('touchstart', prime, opts);
      window.removeEventListener('keydown', prime, opts);
    };
  }, []);

  const stop = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsPlaying(false);
      setActiveCharIndex(null);
    }
  }, []);

  const speak = useCallback(
    (text: string, customSpeed?: number) => {
      if (!synthRef.current || !text?.trim()) return;

      // Cancel ongoing speech before starting the new utterance.
      synthRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = customSpeed ?? speed;

      const germanVoice = selectGermanVoice(synthRef.current);
      if (germanVoice) {
        utterance.voice = germanVoice;
      }

      utterance.onstart = () => {
        setIsPlaying(true);
        setActiveCharIndex(0);
      };

      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          setActiveCharIndex(event.charIndex);
          onWordBoundaryRef.current?.(event.charIndex, event.charLength || 0);
        }
      };

      utterance.onend = () => {
        setIsPlaying(false);
        setActiveCharIndex(null);
        onEndRef.current?.();
      };

      utterance.onerror = () => {
        setIsPlaying(false);
        setActiveCharIndex(null);
      };

      synthRef.current.speak(utterance);
    },
    [speed, lang]
  );

  return {
    speak,
    stop,
    isPlaying,
    activeCharIndex,
    voicesReady,
    hasGestureUnlock: ttsPrimedByGesture,
  };
}
