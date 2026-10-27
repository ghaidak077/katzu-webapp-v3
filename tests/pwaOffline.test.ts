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

  it('lets the legacy page redirects run instead of answering them from the shell', () => {
    // The landing, topic and trust pages now live on website.katzuai.com and
    // `public/_redirects` answers the old paths with a 301. Workbox's
    // navigation fallback would otherwise serve the cached app shell for those
    // navigations first, so a returning learner would never reach the redirect.
    // Both halves matter: every migrated path must be denied, and no app route
    // may be, or the offline app breaks for that screen.
    const denylist = pwaOptions.workbox.navigateFallbackDenylist as unknown as RegExp[];
    const denied = (pathname: string) => denylist.some((rule) => rule.test(pathname));
    for (const path of [
      '/faq', '/pricing', '/compare', '/about', '/how-it-works', '/who-its-for',
      '/demo', '/privacy', '/terms', '/en', '/en/pricing',
      '/trust', '/trust/privacy', '/use-cases', '/use-cases/students'
    ]) {
      expect(denied(path), path).toBe(true);
    }
    for (const path of ['/', '/app', '/app/trail', '/main', '/welcome', '/signin',
      '/onboarding', '/subscription', '/mock', '/scenario/airport-arrival', '/english']) {
      expect(denied(path), path).toBe(false);
    }
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

  it('does not precache the TTF fallbacks a supported browser never requests (A7)', () => {
    // Measured before this rule: 114 precache entries / 4951.75 KiB, of which
    // 821 KB was the four TTF faces. Each is the second `src` in an `@font-face`
    // whose first is woff2 — so the only browser that would ever fetch one cannot
    // run a service worker at all, and the bytes were paid by every install for
    // nobody. The files stay served online; they are just not install weight.
    const extensions = (pwaOptions.workbox.globPatterns as unknown as string[]).join(' ');
    expect(extensions).not.toContain('ttf');
    // The woff2 faces are the ones actually rendered and must still be there, or
    // the diet becomes a first-paint flash of a system font.
    expect(extensions).toContain('woff2');
  });

  it('lets workbox content-hash the public files copied under assets/', () => {    // Without an override the plugin treats everything under `assets/` as
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

  it('app _headers names the one Worker origin instead of any workers.dev host', async () => {
    // `connect-src https://*.workers.dev` let an injected script exfiltrate a
    // session token to any Workers subdomain. The app talks to exactly one
    // Worker, so the policy names it; .env.production builds the bundle that
    // calls it.
    const csp = await readHeaders('_headers');
    const connectSrc = csp.match(/connect-src ([^;]+);/)?.[1] ?? '';
    expect(connectSrc).toContain('https://katzu-test.ghaidakalosh008.workers.dev');
    expect(connectSrc).not.toContain('*.workers.dev');
    expect(connectSrc).toContain("'self'");
  });

  it('app _headers carries HSTS and a COOP that keeps the Google popup', async () => {
    const csp = await readHeaders('_headers');
    expect(csp).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    // `same-origin` severs the window.opener a GIS popup needs to hand its
    // credential back: the popup closes, no token arrives, sign-in dead-ends.
    expect(csp).toMatch(/Cross-Origin-Opener-Policy: same-origin-allow-popups\r?\n/);
    expect(csp).not.toMatch(/Cross-Origin-Opener-Policy: same-origin\r?\n/);
  });

  it('app _headers allows exactly the Google Identity endpoints sign-in needs', async () => {
    const headers = await readHeaders('_headers');
    // Read the directive from the policy line only: the file's comments mention
    // "style-src" too, and a regex over the whole file happily matched them.
    const cspLine = headers.split(/\r?\n/).find((line) => line.includes('Content-Security-Policy:')) ?? '';
    const directive = (name: string) => cspLine.match(new RegExp(`(?:^|; )${name} ([^;]+)`))?.[1] ?? '';
    const scriptSrc = directive('script-src');

    // GIS's own script, its injected iframe, its stylesheet and its XHRs.
    expect(scriptSrc).toContain('https://accounts.google.com/gsi/client');
    // The script stays path-scoped: the bare host would allow any Google script.
    expect(scriptSrc).not.toMatch(/https:\/\/accounts\.google\.com(?![\/\w-])/);
    // No scheme-only source ("https:") — that is the real wildcard.
    expect(scriptSrc).not.toMatch(/https:(?!\/\/)/);
    expect(directive('connect-src')).toContain('https://accounts.google.com');
    expect(directive('frame-src')).toContain('https://accounts.google.com');
    expect(directive('style-src')).toContain('https://accounts.google.com/gsi/style');
    // The button's font and the One Tap avatar are cross-origin hosts.
    expect(directive('font-src')).toContain('https://fonts.gstatic.com');
    expect(directive('img-src')).toContain('https://*.googleusercontent.com');
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

describe('production build environment', () => {
  const read = async (file: string) =>
    (await import('node:fs/promises')).readFile(new URL(`../${file}`, import.meta.url), 'utf8');

  it('bakes the Worker origin into the bundle, so the app can reach its API', async () => {
    // 2026-10-27: a manual `wrangler pages deploy dist` shipped a bundle whose
    // `VITE_WORKER_URL` was empty — the dashboard build env does not apply to a
    // local build — so every API call answered WORKER_URL_MISSING and a direct
    // POST to katzuai.com/auth/session hit the static host (405). The value is
    // public and belongs in the tracked production env for exactly that reason.
    const env = await read('.env.production');
    const match = env.match(/^VITE_WORKER_URL=(\S+)$/m);
    expect(match, 'VITE_WORKER_URL is missing from .env.production').not.toBeNull();
    expect(match![1]).toMatch(/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/);
  });

  it('uses the same Worker origin the Worker allows in CORS', async () => {
    const env = await read('.env.production');
    const worker = env.match(/^VITE_WORKER_URL=(\S+)$/m)![1];
    const toml = await read('wrangler.toml');
    const allowed = toml.match(/^ALLOWED_ORIGINS\s*=\s*"([^"]+)"/m)?.[1] ?? '';
    expect(allowed.split(',').map((origin) => origin.trim())).toContain(worker);
  });
});
