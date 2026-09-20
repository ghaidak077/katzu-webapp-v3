// Audio & Haptics utilities matching KatzuHaptics.kt

export function triggerHaptic(type: 'light' | 'medium' | 'success' | 'error' = 'light') {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      switch (type) {
        case 'light':
          navigator.vibrate(10);
          break;
        case 'medium':
          navigator.vibrate(25);
          break;
        case 'success':
          navigator.vibrate([15, 30, 20]);
          break;
        case 'error':
          navigator.vibrate([40, 40, 60]);
          break;
      }
    } catch {
      // Ignore vibration errors
    }
  }
}

// Bidi text helper: Isolate German substrings with LTR markers (matching isolateGerman in Android Type.kt)
export function isolateGerman(text: string): string {
  if (!text) return '';
  return `⁦${text}⁩`;
}
