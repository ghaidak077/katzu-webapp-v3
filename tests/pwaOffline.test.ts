import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../vite.config';

/**
 * Katzu sells itself as the app you can practise with anywhere, and a learner
 * with no signal is the normal case in Germany, not the edge case. These tests
 * pin the build settings that decide whether an installed PWA opens offline or
 * shows the browser's error page — a regression here is invisible on a
 * developer's always-online machine.
 *
 * The first three options look right and still shipped a dead offline shell:
 * `navigateFallback` and `globPatterns` were set, and the generated `sw.js`
 * contained both — but the precache list held the same files twice (once
 * unrevisioned from `includeAssets`/manifest icons, once revisioned from the
 * glob), workbox threw `add-to-cache-list-conflicting-entries` while
 * `precacheAndRoute` was building its route table, and the worker activated
 * with an empty cache, no navigation route and a silent failure. Measured on
 * the built output: `caches` empty, offline navigation `ERR_INTERNET_DISCONNECTED`.
 * So the tests below also pin the *ownership* rules: every file appears exactly
 * once in the manifest, and only Vite's hash-suffixed chunks are treated as
 * immutable.
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

  it('gives every precached file exactly one owner', () => {
    // `includeAssets` entries are emitted unrevisioned, while the same file
    // matched by `globPatterns` is emitted with a revision — two entries for one
    // URL, which workbox treats as a conflict and throws over. The glob above
    // already covers favicon, mascot art and fonts, so nothing belongs here.
    expect(Object.keys(pwaOptions)).not.toContain('includeAssets');
    // The manifest icons are matcher-approved by the plugin by default, adding a
    // second, separately-revisioned copy of the same two PNGs. Seen from either
    // side, the rule is the same: one file, one entry.
    expect(pwaOptions.includeManifestIcons).toBe(false);
  });

  it('precaches the hero in every format the app actually paints (V16)', () => {
    // The hero was switched to WebP for weight; a `globPatterns` list that grew
    // the painted format but not the glob would leave the image online-only, and
    // a cold offline open would render the shell with a broken hero.
    const globs = pwaOptions.workbox.globPatterns as unknown as string[];
    const extensions = globs.join(' ');
    expect(extensions).toContain('webp');
    expect(extensions).toContain('png');
  });

  it('lets workbox content-hash the public files copied under assets/', () => {
    // Without an override the plugin treats everything under `assets/` as
    // content-addressed and precaches it with `revision: null` (immutable).
    // Bundled chunks really are addressed by their hash; the public files this
    // app keeps there — `assets/fonts/*.ttf`, `assets/mascot/*.png` — are not,
    // so a replaced font or mascot would otherwise never invalidate.
    const immutable = pwaOptions.workbox.dontCacheBustURLsMatching;
    expect(immutable.test('assets/index-iXSWghpY.js')).toBe(true);
    expect(immutable.test('assets/LiveConversationScreen-CG8R_xgG.css')).toBe(true);
    expect(immutable.test('assets/fonts/cairo.ttf')).toBe(false);
    expect(immutable.test('assets/mascot/katzu_avatar.png')).toBe(false);
    // The hero ships as WebP (V16) and must be content-hashed like the other art.
    expect(immutable.test('assets/mascot/katzu_welcome.webp')).toBe(false);
    expect(immutable.test('index.html')).toBe(false);
    expect(immutable.test('registerSW.js')).toBe(false);
  });
});

describe('Pages _headers security policy (P3)', () => {
  const readHeaders = async (file: string) =>
    (await import('node:fs/promises')).readFile(new URL(`../public/${file}`, import.meta.url), 'utf8');

  it('app _headers pins the hardening directives (object-src, base-uri, frame-ancestors, form-action)', async () => {
    const csp = await readHeaders('_headers');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("form-action 'self'");
    // img-src must not carry the blanket https: wildcard — every remote image
    // host must be named, so a hijacked content row cannot load from anywhere.
    expect(csp).not.toMatch(/img-src[^;]*https:\s*(;|$)/);
    expect(csp).toMatch(/img-src 'self' data:/);
  });


  it('app _headers drops unsafe-inline from script-src (built entry is a file, not inline)', async () => {
    const csp = await readHeaders('_headers');
    const scriptSrc = csp.match(/script-src ([^;]+);/)?.[1] ?? '';
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // The Google Identity script stays loadable, by host — not by scheme-relaxed wildcard.
    expect(scriptSrc).toContain('https://accounts.google.com/gsi/client');
  });

  it('sales site _headers carries the equivalent strict CSP', async () => {
    // The sales _headers lives in ../sales/, outside public/.
    const sales = await (await import('node:fs/promises')).readFile(new URL('../sales/_headers', import.meta.url), 'utf8');
    expect(sales).toContain("object-src 'none'");
    expect(sales).toContain("base-uri 'self'");
    expect(sales).toContain("frame-ancestors 'none'");
    expect(sales).toContain("form-action 'self'");
    expect(sales).not.toMatch(/img-src[^;]*https:\s*(;|$)/);
  });
});
