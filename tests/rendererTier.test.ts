// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyRendererTier, detectTier } from '@/lib/design/rendererTier';

/**
 * B4c renderer tier — deterministic selection and root-class application.
 *
 * detectTier must stay a pure function of the environment signals so the
 * decision is testable and never flaps mid-session (see rendererTier.ts).
 */

type NavigatorOverrides = {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { saveData?: boolean } | undefined;
};

const originalNavigator = globalThis.navigator;
const originalMatchMedia = window.matchMedia;
/** jsdom does not implement matchMedia; a never-matching stub is the neutral default. */
const neutralMatchMedia = ((query: string) => ({
  matches: false,
  media: query,
})) as unknown as typeof window.matchMedia;

function setNavigator(overrides: NavigatorOverrides): void {
  // Only install the neutral matchMedia when the test has not already set one
  // (the prefers-reduced-motion test installs its own first).
  if (!window.matchMedia || window.matchMedia === neutralMatchMedia) {
    window.matchMedia = neutralMatchMedia;
  }
  vi.stubGlobal('navigator', {
    ...(typeof originalNavigator !== 'undefined' ? originalNavigator : {}),
    ...overrides,
  });
}

beforeEach(() => {
  window.matchMedia = originalMatchMedia ?? neutralMatchMedia;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalMatchMedia) window.matchMedia = originalMatchMedia;
  document.documentElement.classList.remove('kz-lite');
});

describe('detectTier', () => {
  it('returns full when nothing constrains the device', () => {
    setNavigator({ hardwareConcurrency: 8, deviceMemory: 8 });
    expect(detectTier()).toBe('full');
  });

  it('returns reduced when Save-Data is on', () => {
    setNavigator({ hardwareConcurrency: 8, deviceMemory: 8, connection: { saveData: true } });
    expect(detectTier()).toBe('reduced');
  });

  it('returns reduced when prefers-reduced-motion is set', () => {
    // Set BEFORE setNavigator, whose neutral default would otherwise overwrite it.
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
    })) as unknown as typeof window.matchMedia;
    setNavigator({ hardwareConcurrency: 8, deviceMemory: 8 });
    expect(detectTier()).toBe('reduced');
  });

  it('returns reduced for a low-core device', () => {
    setNavigator({ hardwareConcurrency: 4, deviceMemory: 8 });
    expect(detectTier()).toBe('reduced');
  });

  it('returns reduced for a low-memory device', () => {
    setNavigator({ hardwareConcurrency: 8, deviceMemory: 2 });
    expect(detectTier()).toBe('reduced');
  });

  it('defaults to full when the device reports no signals at all', () => {
    setNavigator({ hardwareConcurrency: undefined, deviceMemory: undefined });
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    expect(detectTier()).toBe('full');
  });
});

describe('applyRendererTier', () => {
  it('adds kz-lite only for the reduced tier', () => {
    applyRendererTier('reduced');
    expect(document.documentElement.classList.contains('kz-lite')).toBe(true);

    applyRendererTier('full');
    expect(document.documentElement.classList.contains('kz-lite')).toBe(false);
  });
});
