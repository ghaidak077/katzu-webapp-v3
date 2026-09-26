import { describe, expect, it, vi } from 'vitest';
import {
  PRELOAD_RECOVERY_WINDOW_MS,
  installPreloadRecovery,
  shouldRecover,
} from '@/lib/utils/preloadRecovery';

/**
 * Route code splitting plus an auto-updating service worker means a deploy can
 * replace a chunk the learner is about to request. These tests pin the recovery
 * rule: reload once, never loop, and never let a storage failure turn into a
 * dead screen.
 */
describe('preload recovery', () => {
  it('recovers when nothing has been recovered yet', () => {
    expect(shouldRecover(0, 1_000_000)).toBe(true);
  });

  it('refuses a second recovery inside the window, so a reload cannot loop', () => {
    const now = 1_000_000;
    expect(shouldRecover(now - (PRELOAD_RECOVERY_WINDOW_MS - 1), now)).toBe(false);
    expect(shouldRecover(now - PRELOAD_RECOVERY_WINDOW_MS, now)).toBe(true);
  });

  it('reloads once on the preload error and remembers when', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    const listeners: Record<string, Array<() => void>> = {};
    const target = {
      addEventListener: (type: string, listener: () => void) => {
        listeners[type] = [...(listeners[type] || []), listener];
      },
      removeEventListener: (type: string, listener: () => void) => {
        listeners[type] = (listeners[type] || []).filter((l) => l !== listener);
      },
    };
    const reload = vi.fn();
    const dispose = installPreloadRecovery(target as never, storage as never, () => 5_000, reload);

    expect(listeners['vite:preloadError']).toHaveLength(1);
    listeners['vite:preloadError'][0]();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(1);

    // The same session fires again (React re-mounts the failed route): no loop.
    listeners['vite:preloadError'][0]();
    expect(reload).toHaveBeenCalledTimes(1);

    dispose();
    expect(listeners['vite:preloadError']).toHaveLength(0);
  });

  it('still reloads when storage throws (private mode, blocked cookies)', () => {
    const captured: Array<() => void> = [];
    const target = {
      addEventListener: (_type: string, listener: () => void) => captured.push(listener),
      removeEventListener: () => {},
    };
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const reload = vi.fn();

    installPreloadRecovery(target as never, throwing as never, () => 42, reload);
    captured[0]();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
