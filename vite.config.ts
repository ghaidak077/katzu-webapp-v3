import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

/**
 * Exported so a test can pin the offline contract: the generated sw.js must
 * answer a cold offline navigation with the cached shell instead of the
 * browser's error page.
 */
export const pwaOptions = {
  registerType: 'autoUpdate' as const,
  // Deliberately no `includeAssets`. Every public asset (favicon, mascot art,
  // fonts) already matches `globPatterns` below, and listing a file twice —
  // once unrevisioned from `includeAssets`, once revisioned from the glob —
  // makes workbox throw `add-to-cache-list-conflicting-entries` at install.
  // The throw is silent to the learner: the worker still activates, with an
  // empty precache and no navigation fallback, so the installed PWA dies
  // offline. Verified against the generated sw.js, not just these options:
  // `tests/pwaOffline.test.ts` pins the overlap rule.
  //
  // `includeManifestIcons` off for the same reason seen from the other side:
  // the two manifest icons are already precached by `globPatterns` below, and
  // letting the plugin add a second, separately-revisioned copy of the same URL
  // is the very conflict the comment above describes.
  includeManifestIcons: false,
  manifest: {
    name: 'Katzu — رفيقك لتعلم الألمانية',
    short_name: 'Katzu',
    description: 'تحدث الألمانية بثقة وبدون خوف مع قطك الذكي',
    theme_color: '#000000',
    background_color: '#000000',
    display: 'standalone',
    dir: 'rtl',
    lang: 'ar',
    // C4: the install-identity fields. Without `id` and `start_url` a launcher
    // derives the app's identity from wherever it happened to open the link, so
    // the same install can appear twice on one phone and a re-share of a deep
    // link can open a second, separate app. Both are pinned to the app root and
    // `scope` is explicit, so every route inside the PWA belongs to this install.
    id: '/',
    start_url: '/?source=pwa',
    scope: '/',
    // Portrait phones are the whole audience; a landscape lock makes a mock
    // interview feel broken on a phone held sideways.
    orientation: 'portrait',
    categories: ['education', 'productivity'],
    // Opaque, correctly sized icons. The art used to ship as the raw mascot PNG
    // with a transparent background and a declared size that did not match the
    // file (a 512px image labelled 192x192), which an Android/iOS launcher draws
    // on white — the "white and broken" install icon. These are composited on the
    // brand's near-black violet so no transparency can ever show through, and
    // `sizes` is the real pixel size. The maskable copy keeps the head inside the
    // 40%-radius safe zone so a squircle mask never clips it.
    icons: [
      {
        src: 'assets/logo/logo-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: 'assets/logo/logo-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: 'assets/logo/logo-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ],
    // The two things a learner would want one tap from the installed icon. Each
    // carries `url` inside the scope above, so a launcher shortcut can never open
    // a route the service worker's offline shell does not cover.
    shortcuts: [
      {
        name: 'محاكاة B1 مجانية',
        short_name: 'محاكاة',
        url: '/mock',
        icons: [{ src: 'assets/logo/logo-192.png', sizes: '192x192', type: 'image/png' }]
      },
      {
        name: 'المهمة اليومية',
        short_name: 'المهمة',
        url: '/app/trail',
        icons: [{ src: 'assets/logo/logo-192.png', sizes: '192x192', type: 'image/png' }]
      }
    ]
  },
  workbox: {
    // `webp` is here for the hero (`assets/mascot/katzu_welcome.webp`, the one
    // painted sticker the app renders at full width): without it the precache
    // would ship a hero that only exists online, and a cold offline open would
    // show the app shell with a broken image (V16).
    // A7: `ttf` is deliberately NOT here. The four TTF faces (cairo 586 KB +
    // three Satoshi ~72 KB) are the second `src` in each `@font-face`, i.e. a
    // fallback a browser only reaches for when it cannot read woff2 — and such a
    // browser cannot register a service worker, so it never reads this precache
    // either. Precaching them cost every install **821 KB** of downloads that
    // nothing on any supported browser would ever request. The files stay in
    // `public/` so the online fallback is unchanged.
    globPatterns: ['**/*.{js,css,html,ico,png,webp,woff2}'],
    // The plugin treats everything under Vite's `assets/` directory as
    // content-addressed and precaches it with `revision: null` (immutable).
    // That is true for bundled chunks (`index-iXSWghpY.js`) but false for the
    // public files this app copies there — fonts and mascot art keep their
    // names across content changes, so `revision: null` would serve a replaced
    // font or mascot from the old cache forever. Match only the hash Vite
    // really appends; everything else then gets a content hash like any other
    // precache entry.
    dontCacheBustURLsMatching: /-[A-Za-z0-9_-]{8}\.(js|css)$/,
    // A cold offline open must land on the cached app shell. Without a
    // navigation fallback the installed PWA shows the browser's offline error
    // page, which makes the whole offline-first loop unreachable — exactly the
    // moment a learner on a train needs it. The worker API is a different origin
    // and is never a navigation, so it is unaffected by this rule.
    navigateFallback: 'index.html',
    // The public pages moved to the marketing site and `public/_redirects`
    // answers each old URL with a 301. A navigation fallback would win first —
    // the worker answers every in-scope navigation from the precached shell —
    // so an installed PWA would keep showing the app on a URL that no longer
    // exists and the redirect would never run. These pathnames are the exact
    // set of the redirect rules; every real app route stays served offline.
    navigateFallbackDenylist: [
      /^\/(?:faq|pricing|compare|about|how-it-works|who-its-for|demo|privacy|terms)(?:\/|$)/,
      /^\/trust(?:\/|$)/,
      /^\/en(?:\/|$)/,
      /^\/use-cases(?:\/|$)/
    ],
    // The cache generation. Bumping it is what retires the store written by the
    // previous policy; `cleanupOutdatedCaches` then deletes the old
    // `*-precache-*` caches instead of leaving them on the device.
    cacheId: 'katzu-app-v2',
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.workers\.dev\/(scenarios|vocabulary|grammar)/,
        handler: 'StaleWhileRevalidate' as const,
        options: {
          cacheName: 'katzu-api-content',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
          }
        }
      }
    ]
  }
};

/**
 * `APP_ORIGIN` — the single host every public URL is derived from.
 *
 * `robots.txt` and `sitemap.xml` were checked-in files holding `https://katzu.app`,
 * a host that does not resolve, so they advertised a dead domain and listed
 * routes that do not exist (`/privacy` — the real one is `/trust/privacy`).
 * They are generated at build time from `VITE_PUBLIC_APP_URL` instead, so a
 * domain change is one env var and the files can never drift from the app.
 *
 * When the origin is unset the entries are emitted as relative paths, which is
 * honest: a Pages build with no origin must not invent one.
 */
/**
 * The Digital Asset Links document, as a pure function of its two inputs.
 *
 * Exported so the contract can be tested without running a build: an empty list
 * when unfilled, the real statement when both halves are present, and nothing
 * usable when only one half is set. A file that exists but says nothing fails
 * Android verification as loudly as a missing one — which is the honest state,
 * and far better than a placeholder fingerprint that makes a wrong certificate
 * look configured.
 */
export function assetLinksContent({
  packageName,
  certSha256,
}: { packageName?: string | null; certSha256?: string | null } = {}): string {
  const package_name = String(packageName || '').trim();
  const sha256_cert_fingerprints = String(certSha256 || '').trim();
  if (!package_name || !sha256_cert_fingerprints) return '[]\n';
  return (
    JSON.stringify(
      [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name,
            sha256_cert_fingerprints: [sha256_cert_fingerprints],
          },
        },
      ],
      null,
      2,
    ) + '\n'
  );
}

/**
 * Normalise a configured origin to scheme + host, or return ''.
 *
 * A build-time env file is operator data, not learner input, but a typo
 * (`katzuai.com`, a trailing path) must not emit an invalid canonical URL.
 */
export function normalizeOrigin(origin: string): string {
  const raw = String(origin || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

/**
 * Make the share image absolute when the build knows its origin.
 *
 * `index.html` deliberately holds a root-relative `og:image`, because this repo
 * must never hardcode a host it cannot resolve (`tests/landingMinimal.test.ts`
 * fails if one appears). But a social crawler fetches the image by absolute URL,
 * so when `VITE_PUBLIC_APP_URL` is set the build rewrites exactly the two image
 * tags and nothing else — the width/height/alt lines and everything else are
 * left byte-for-byte. With no origin the tags stay relative, which resolves
 * against whatever host serves the page and is the honest state until a domain
 * is decided. Exported so the transform is tested without running a build.
 */
export function absoluteOgImages(html: string, origin: string): string {
  const base = normalizeOrigin(origin);
  if (!base) return html;
  return html.replace(
    /(<meta\s+(?:property="og:image"|name="twitter:image")\s+content=")(\/[^"]*)(")/g,
    (_match, head: string, path: string, tail: string) => `${head}${base}${path}${tail}`,
  );
}

/**
 * Add `og:url` when the build knows its origin.
 *
 * WHY IT IS INJECTED RATHER THAN WRITTEN IN index.html
 * `og:url` must be absolute, and this repository may not hardcode a host it cannot
 * resolve — so a relative `/` in the source file would be an invalid tag shipped to
 * every crawler that does not run JavaScript. The tag exists only when there is an
 * origin to put in it; the app sets it at runtime from `publicAppUrl()` otherwise.
 * (The landing screen already tried to update this tag — and silently did nothing,
 * because no HTML ever contained one.)
 */
export function withAbsoluteOgUrl(html: string, origin: string): string {
  const base = normalizeOrigin(origin);
  if (!base) return html;
  if (/property="og:url"/.test(html)) return html;
  return html.replace('</head>', `  <meta property="og:url" content="${base}/" />\n</head>`);
}

/**
 * Add the canonical link when the build knows its origin.
 *
 * The landing screen creates this at runtime, which is too late for a crawler
 * that does not execute JavaScript. The build writes the static tag; the
 * runtime effect then updates the same link instead of creating a second one.
 */
export function withCanonicalUrl(html: string, origin: string): string {
  const base = normalizeOrigin(origin);
  if (!base) return html;
  if (/rel="canonical"/.test(html)) return html;
  return html.replace('</head>', `  <link rel="canonical" href="${base}/" />\n</head>`);
}

/**
 * Add a minimal WebSite JSON-LD block when the build knows its origin.
 *
 * The page is a single public product site; `WebSite` with a canonical `url`
 * and language is the honest machine-readable description of it. The value is
 * JSON-stringified (and `<` escaped) so the origin can never terminate the
 * script element.
 */
export function withStructuredData(html: string, origin: string): string {
  const base = normalizeOrigin(origin);
  if (!base) return html;
  if (/application\/ld\+json/.test(html)) return html;
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Katzu',
    url: `${base}/`,
    inLanguage: 'ar',
  }).replace(/</g, '\\u003c');
  return html.replace('</head>', `  <script type="application/ld+json">${json}</script>\n</head>`);
}

/**
 * A8: the variables a Play build must have, as a pure function of the env.
 *
 * A Play/TWA build that ships without any one of these is worse than a build that
 * does not ship: a missing origin bakes relative canonical/og URLs, and a missing
 * package or certificate makes `.well-known/assetlinks.json` an empty `[]` that
 * Android rejects — so link handling silently fails after the app is installed.
 * Outside a Play build this returns an empty list: the app build has to keep
 * working with nothing configured (the honest relative/empty states).
 */
export function missingPlayBuildVars(env: Record<string, string | undefined> = {}): string[] {
  if (String(env.VITE_PLAY_BUILD || '') !== '1') return [];
  return ['VITE_PUBLIC_APP_URL', 'VITE_ANDROID_PACKAGE_NAME', 'VITE_ANDROID_CERT_SHA256']
    .filter((name) => !String(env[name] || '').trim());
}

function publicOriginFiles(env: Record<string, string | undefined>): Plugin {
  // Fail the build before anything is emitted: a Play build with an unfilled
  // value is a configuration error, not a deployment to discover in the store.
  const missingPlayVars = missingPlayBuildVars(env);
  if (missingPlayVars.length) {
    throw new Error(
      `VITE_PLAY_BUILD=1 requires ${missingPlayVars.join(', ')} — refusing to build a Play bundle with an unfilled value.`,
    );
  }
  const origin = normalizeOrigin(String(env.VITE_PUBLIC_APP_URL || ''));
  const packageName = String(env.VITE_ANDROID_PACKAGE_NAME || '').trim();
  const sha256 = String(env.VITE_ANDROID_CERT_SHA256 || '').trim();
  return {
    name: 'katzu-public-origin-files',
    transformIndexHtml(html) {
      // The marketing landing, the topic pages and the trust pages no longer
      // live on this origin (they moved to website.katzuai.com), so the shell
      // only gets the app's own canonical/og URLs and its WebSite JSON-LD —
      // no landing body in `#root`, no hreflang to pages that are gone.
      return withStructuredData(
        withCanonicalUrl(withAbsoluteOgUrl(absoluteOgImages(html, origin), origin), origin),
        origin,
      );
    },
    generateBundle() {
      // C4: Digital Asset Links. Android refuses to hand a web app's real
      // identity (and any Play-distributed build) to the browser until this file
      // proves the signing certificate is the one Play signs with — so a TWA or a
      // Play "web app" listing fails verification without it. See
      // `assetLinksContent` for why an empty list beats a placeholder.
      this.emitFile({
        type: 'asset',
        fileName: '.well-known/assetlinks.json',
        source: assetLinksContent({ packageName, certSha256: sha256 }),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Vite does not copy `.env.production` into `process.env` for the config
  // file. Load it explicitly (with an empty prefix so the build-only Android
  // values are visible too) and hand the result to the public-file plugin.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      publicOriginFiles(env),
      VitePWA(pwaOptions)
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true
    }
  };
});
