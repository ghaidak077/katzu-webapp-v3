import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../vite.config';

/**
 * Katzu sells itself as the app you can practise with anywhere, and a learner
 * with no signal is the normal case in Germany, not the edge case. These tests
 * pin the two build settings that decide whether an installed PWA opens offline
 * or shows the browser's error page — a regression here is invisible on a
 * developer's always-online machine.
 */
describe('offline app shell', () => {
  it('answers a cold offline navigation with the cached shell', () => {
    expect(pwaOptions.workbox.navigateFallback).toBe('index.html');
  });

  it('precaches the html it falls back to', () => {
    expect(pwaOptions.workbox.globPatterns.join(',')).toContain('html');
  });

  it('activates a new service worker immediately so a deploy cannot strand a stale bundle', () => {
    // An old bundle against a newer database raises VersionError; autoUpdate is
    // what stops a learner's open tab from keeping the old one alive.
    expect(pwaOptions.registerType).toBe('autoUpdate');
  });
});
