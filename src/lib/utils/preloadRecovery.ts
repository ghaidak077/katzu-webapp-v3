/**
 * Route-level code splitting has exactly one failure mode, and it is a real one:
 * the app ships `registerType: 'autoUpdate'`, so a deploy replaces the chunk
 * files while a learner is mid-session. The route they tap next asks for a hash
 * that no longer exists, the dynamic import rejects, and React unmounts into the
 * error boundary — a dead screen caused by a successful deploy.
 *
 * Vite reports that case as `vite:preloadError` (any error from a module
 * preload). A reload fixes it because the service worker then serves the new
 * bundle, but a reload that can repeat is worse than the bug, so the recovery is
 * allowed at most once per window.
 */

/** A second preload failure inside this window is not a stale chunk — reloading again would loop. */
export const PRELOAD_RECOVERY_WINDOW_MS = 10_000;

const STORAGE_KEY = 'katzu_preload_recovery_at';

/** The rule, kept pure so it can be tested without a browser. */
export function shouldRecover(lastRecoveredAt: number, now: number): boolean {
  return !(lastRecoveredAt > 0 && now - lastRecoveredAt < PRELOAD_RECOVERY_WINDOW_MS);
}

/**
 * Installs the listener. Pass the window (and clock) in tests; production uses
 * the real ones. Returns a disposer so a test can clean up after itself.
 */
export function installPreloadRecovery(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage(),
  now: () => number = Date.now,
  reload: () => void = () => window.location.reload(),
): () => void {
  const onPreloadError = () => {
    const at = now();
    let last = 0;
    try {
      last = Number(storage?.getItem(STORAGE_KEY) || 0) || 0;
    } catch {
      last = 0;
    }
    if (!shouldRecover(last, at)) return;
    try {
      storage?.setItem(STORAGE_KEY, String(at));
    } catch {
      /* private mode: reloading once is still better than a dead screen */
    }
    reload();
  };

  target.addEventListener('vite:preloadError', onPreloadError);
  return () => target.removeEventListener('vite:preloadError', onPreloadError);
}

/** Storage access itself can throw (Safari private mode, blocked cookies). */
function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
