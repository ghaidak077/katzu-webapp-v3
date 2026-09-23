import { useState, useRef, useCallback, useEffect } from 'react';

interface UseSpeechInputOptions {
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  lang?: string; // default 'de-DE'
}

/**
 * Speech-to-text hook built around a *stable* recognition instance.
 *
 * The instance is created lazily on first use (not in an effect keyed on
 * callbacks) and event handlers always call the latest callbacks through
 * refs, so parent re-renders — including every interim-transcript update —
 * can never tear down an active listening session.
 */
export function useSpeechInput({ onResult, onError, lang = 'de-DE' }: UseSpeechInputOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const recognitionLangRef = useRef<string | null>(null);
  const listeningRef = useRef(false);

  // Latest callbacks via refs — identity changes never recreate the recognizer.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Feature detection once, on mount.
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
    setIsSupported(supported);
  }, []);

  const ensureRecognition = useCallback((): any | null => {
    // Recreate only if missing or the language actually changed.
    if (recognitionRef.current && recognitionLangRef.current === lang) {
      return recognitionRef.current;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listeningRef.current = true;
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      let isFinal = false;

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        currentTranscript += item[0].transcript;
        if (item.isFinal) {
          isFinal = true;
        }
      }

      setTranscript(currentTranscript);
      onResultRef.current?.(currentTranscript, isFinal);
    };

    recognition.onerror = (event: any) => {
      listeningRef.current = false;
      setIsListening(false);
      // 'aborted' is expected when we cancel programmatically; surface the rest
      // (permission denial, network, no-speech) so the UI can tell the user.
      if (event?.error && event.error !== 'aborted') {
        onErrorRef.current?.(event.error);
      }
    };

    recognition.onend = () => {
      listeningRef.current = false;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognitionLangRef.current = lang;
    return recognition;
  }, [lang]);

  const startListening = useCallback(() => {
    const recognition = ensureRecognition();
    if (!recognition) return;
    if (listeningRef.current) return; // ignore double-taps; one session at a time
    setTranscript('');
    try {
      recognition.start();
      listeningRef.current = true;
    } catch {
      // start() throws InvalidStateError if already started — safe to ignore.
    }
  }, [ensureRecognition]);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || !listeningRef.current) {
      setIsListening(false);
      return;
    }
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
    listeningRef.current = false;
    setIsListening(false);
  }, []);

  // Abort on unmount only — never on re-render.
  useEffect(
    () => () => {
      try {
        recognitionRef.current?.abort?.();
      } catch {
        /* ignore */
      }
    },
    []
  );

  return {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
  };
}
