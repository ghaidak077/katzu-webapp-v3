// Audio & Haptics utilities matching KatzuHaptics.kt

/**
 * Haptic feedback, in one place.
 *
 * WHY A SEMANTIC API
 * `light` / `medium` described the motor instead of the event: a caller had to
 * know that a correct answer is "success" and a failed check is "error", so two
 * screens could give the same event two different buzzes. The five kinds below
 * say what happened, and the pattern for each kind is decided here once.
 *
 * ORDER OF DEVICES
 *  1. a Capacitor bridge, IF the app is ever wrapped in a native shell. This
 *     repo ships a PWA (no `capacitor.config.*`, no android/ios project), so the
 *     bridge is normally absent — it is feature-detected, never required, and no
 *     Capacitor package is installed for it;
 *  2. `navigator.vibrate` on Android Chrome;
 *  3. nothing at all — the correct behaviour on a device that cannot buzz.
 *     iOS Safari has never implemented the Vibration API, so an iPhone gets
 *     silence rather than an error.
 *
 * The learner's Settings switch and their system motion preference both win over
 * the caller. A colour, a word or a shake already carries the feedback, so a
 * muted device loses nothing that matters.
 */

export type HapticKind = 'tap' | 'select' | 'success' | 'warning' | 'error';

/** The motor-named kinds the shipped call sites still pass. */
type LegacyHapticKind = 'light' | 'medium' | 'success' | 'error';

/**
 * Durations in ms, or a pattern of on/off times. `tap`/`select`/`success`/`error`
 * keep exactly the values they had before this file grew a vocabulary — the
 * existing call sites must not change feel. `warning` is new and deliberately
 * longer than `select` but shorter than `error`: it is a "look at this", not a
 * "you got it wrong".
 */
const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 10,
  select: 25,
  success: [15, 30, 20],
  warning: [25, 40, 25],
  error: [40, 40, 60],
};

const LEGACY: Record<LegacyHapticKind, HapticKind> = {
  light: 'tap',
  medium: 'select',
  success: 'success',
  error: 'error',
};

/**
 * The learner's switch, held in memory because a haptic fires from an event
 * handler and cannot await a database read. TRUE by default; a row written
 * before this setting existed has no field, and absent means on.
 */
let enabled = true;

/** Called from the settings screen and once per session by the app shell. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on !== false;
}

/** The switch AND the system preference — what the devices below may act on. */
export function hapticsEnabled(): boolean {
  return enabled && !prefersReducedMotion();
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  } catch {
    return false;
  }
}

/** The subset of `@capacitor/haptics` this file would call, if it were present. */
interface CapacitorHaptics {
  impact?: (options: { style: string }) => Promise<void>;
  notification?: (options: { type: string }) => Promise<void>;
  vibrate?: (options: { duration: number }) => Promise<void>;
}

function capacitorHaptics(): CapacitorHaptics | null {
  const plugins = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  const haptics = plugins?.Haptics as CapacitorHaptics | undefined;
  return haptics && typeof haptics === 'object' ? haptics : null;
}

/** What the native bridge does for each kind; the web path uses PATTERNS. */
function playNative(native: CapacitorHaptics, kind: HapticKind): void {
  const promise =
    kind === 'success' || kind === 'warning' || kind === 'error'
      ? native.notification?.({ type: kind.toUpperCase() })
      : native.impact?.({ style: kind === 'tap' ? 'LIGHT' : 'MEDIUM' });
  // A rejected bridge is not worth an unhandled rejection in the console.
  if (promise && typeof promise.catch === 'function') promise.catch(() => {});
}

/** Fire one haptic. Never throws: a buzz is never worth breaking a screen. */
export function haptic(kind: HapticKind = 'tap'): void {
  if (!hapticsEnabled()) return;
  try {
    const native = capacitorHaptics();
    if (native) {
      playNative(native, kind);
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tap);
    }
  } catch {
    // Ignore vibration errors
  }
}

/**
 * The original entry point, kept so the ~48 shipped call sites do not churn.
 * New code should call `haptic()` with the event, not the motor.
 */
export function triggerHaptic(type: LegacyHapticKind = 'light'): void {
  haptic(LEGACY[type] ?? 'tap');
}

// Bidi text helper: Isolate German substrings with LTR markers (matching isolateGerman in Android Type.kt)
export function isolateGerman(text: string): string {
  if (!text) return '';
  return `⁦${text}⁩`;
}
