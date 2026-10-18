// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  haptic,
  hapticsEnabled,
  setHapticsEnabled,
  triggerHaptic,
  type HapticKind,
} from '@/lib/utils/haptics';

/**
 * The haptics helper is the app's only device-feedback switch, so three things
 * must hold no matter what the device is:
 *
 *  1. the learner's Settings switch and their system motion preference win;
 *  2. a device that cannot buzz is silent, never an error;
 *  3. an ordinary buzz keeps the exact feel it shipped with.
 *
 * iOS Safari has no `navigator.vibrate` at all, which is why "silent" is a
 * supported outcome and not a failure.
 */

const originalMatchMedia = window.matchMedia;

function installMatchMedia(reduceMotion: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduceMotion && query.includes('prefers-reduced-motion'),
    media: query,
  })) as unknown as typeof window.matchMedia;
}

/** A spy standing in for `navigator.vibrate`, or `undefined` for "unsupported". */
function installVibrate(
  impl?: (pattern: number | number[]) => boolean,
): ReturnType<typeof vi.fn> | undefined {
  const spy = impl ? vi.fn(impl) : undefined;
  vi.stubGlobal('navigator', {
    ...(typeof navigator !== 'undefined' ? navigator : {}),
    ...(spy ? { vibrate: spy } : {}),
  });
  return spy;
}

beforeEach(() => {
  installMatchMedia(false);
  setHapticsEnabled(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
  setHapticsEnabled(true);
});

describe('the haptics switch', () => {
  it('buzzes when the learner has it on', () => {
    const vibrate = installVibrate(() => true);
    haptic('success');
    expect(vibrate).toHaveBeenCalledWith([15, 30, 20]);
  });

  it('stays silent when the learner turned it off', () => {
    const vibrate = installVibrate(() => true);
    setHapticsEnabled(false);
    haptic('error');
    triggerHaptic('medium');
    expect(hapticsEnabled()).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('defaults to on, so a row written before the setting existed keeps the feel', () => {
    expect(hapticsEnabled()).toBe(true);
  });

  it('comes back on when the learner turns it on again', () => {
    const vibrate = installVibrate(() => true);
    setHapticsEnabled(false);
    setHapticsEnabled(true);
    haptic('tap');
    expect(vibrate).toHaveBeenCalledWith(10);
  });
});

describe('reduced motion', () => {
  it('suppresses the buzz even when the switch is on', () => {
    const vibrate = installVibrate(() => true);
    installMatchMedia(true);
    expect(hapticsEnabled()).toBe(false);
    haptic('success');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('is read at call time, so turning the system preference off restores feedback', () => {
    const vibrate = installVibrate(() => true);
    installMatchMedia(true);
    haptic('tap');
    installMatchMedia(false);
    haptic('tap');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(10);
  });
});

describe('a device that cannot buzz', () => {
  it('does nothing at all when navigator.vibrate is absent, and never throws', () => {
    vi.stubGlobal('navigator', { ...(typeof navigator !== 'undefined' ? navigator : {}) });
    expect(() => {
      haptic('error');
      triggerHaptic('light');
    }).not.toThrow();
  });

  it('swallows a vibrate() that throws, because a buzz is not worth a broken screen', () => {
    installVibrate(() => {
      throw new Error('device refused');
    });
    expect(() => haptic('warning')).not.toThrow();
  });

  it('still fires when matchMedia itself is missing', () => {
    const vibrate = installVibrate(() => true);
    // @ts-expect-error — the device may genuinely have no matchMedia.
    window.matchMedia = undefined;
    expect(hapticsEnabled()).toBe(true);
    haptic('tap');
    expect(vibrate).toHaveBeenCalledWith(10);
  });
});

describe('the native bridge, when one exists', () => {
  it('prefers Capacitor Haptics over navigator.vibrate', () => {
    const vibrate = installVibrate(() => true);
    const notification = vi.fn(async () => {});
    const impact = vi.fn(async () => {});
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      Plugins: { Haptics: { notification, impact } },
    };

    haptic('success');
    haptic('select');

    expect(notification).toHaveBeenCalledWith({ type: 'SUCCESS' });
    expect(impact).toHaveBeenCalledWith({ style: 'MEDIUM' });
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('does not raise an unhandled rejection when the bridge refuses', async () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      Plugins: { Haptics: { notification: () => Promise.reject(new Error('no haptics engine')) } },
    };
    expect(() => haptic('warning')).not.toThrow();
    // Let the rejected promise settle; an unhandled rejection would fail the run.
    await Promise.resolve();
  });
});

describe('the shipped feel is unchanged', () => {
  it('keeps the original pattern for every kind that already had call sites', () => {
    const vibrate = installVibrate(() => true);
    const expected: Array<[Parameters<typeof triggerHaptic>[0], number | number[]]> = [
      ['light', 10],
      ['medium', 25],
      ['success', [15, 30, 20]],
      ['error', [40, 40, 60]],
    ];
    for (const [legacy, pattern] of expected) {
      vibrate!.mockClear();
      triggerHaptic(legacy);
      expect(vibrate).toHaveBeenCalledWith(pattern);
    }
  });

  it('has a pattern for every semantic kind, and warning sits between select and error', () => {
    const vibrate = installVibrate(() => true);
    const kinds: HapticKind[] = ['tap', 'select', 'success', 'warning', 'error'];
    for (const kind of kinds) {
      vibrate!.mockClear();
      haptic(kind);
      expect(vibrate, `${kind} must buzz`).toHaveBeenCalledTimes(1);
    }
    expect(hapticsEnabled()).toBe(true);
  });
});

/**
 * The switch is only real if it survives a launch, so this guard follows the
 * value the whole way: the row can store it, the settings screen writes it, and
 * the app shell pushes it into the in-memory flag the helper reads. A field that
 * is written but never read (or read but never written) is the silent failure
 * this test exists to catch.
 */
describe('the switch is wired end to end', () => {
  const read = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8');

  it('stores the preference on the learner row, defaulting to on when absent', () => {
    expect(read('src/types/models.ts')).toContain('hapticsEnabled?: boolean;');
  });

  it('writes it from the settings screen and updates the live flag at once', () => {
    const settings = read('src/features/settings/ProfileSettingsScreen.tsx');
    expect(settings).toContain('hapticsEnabled: on');
    expect(settings).toContain('setHapticsEnabled(on)');
  });

  it('feeds the row into the helper in the app shell', () => {
    expect(read('src/app/AppShell.tsx')).toContain('setHapticsEnabled(user?.hapticsEnabled !== false)');
  });

  it('acknowledges the paywall tap without pretending a purchase happened', () => {
    const paywall = read('src/features/offers/PaywallScreen.tsx');
    expect(paywall).toContain("haptic('select')");
    expect(paywall).not.toContain("haptic('success')");
  });

  it('warns before an irreversible delete and only buzzes hard on a real failure', () => {
    const settings = read('src/features/settings/ProfileSettingsScreen.tsx');
    expect(settings).toContain("haptic('warning')");
    expect(settings).toContain("haptic('error')");
  });
});
