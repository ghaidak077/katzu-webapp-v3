import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSpeechOutputOptions {
  speed?: number; // 0.8 or 1.0
  lang?: string; // 'de-DE'
  onWordBoundary?: (charIndex: number, charLength: number) => void;
  onEnd?: () => void;
}

export function useSpeechOutput({
  speed = 1.0,
  lang = 'de-DE',
  onWordBoundary,
  onEnd,
}: UseSpeechOutputOptions = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
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
      if (!synthRef.current) return;

      // Cancel ongoing speech
      synthRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = customSpeed ?? speed;

      // Try selecting a natural German voice if available
      const voices = synthRef.current.getVoices();
      const germanVoice = voices.find((v) => v.lang.startsWith('de') && !v.name.includes('Google'));
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
          onWordBoundary?.(event.charIndex, event.charLength || 0);
        }
      };

      utterance.onend = () => {
        setIsPlaying(false);
        setActiveCharIndex(null);
        onEnd?.();
      };

      utterance.onerror = () => {
        setIsPlaying(false);
        setActiveCharIndex(null);
      };

      utteranceRef.current = utterance;
      synthRef.current.speak(utterance);
    },
    [speed, lang, onWordBoundary, onEnd]
  );

  return {
    speak,
    stop,
    isPlaying,
    activeCharIndex,
  };
}
