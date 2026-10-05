import { defineConfig, type Plugin } from 'vite';
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
        src: 'assets/mascot/katzu_icon_192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: 'assets/mascot/katzu_icon_512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: 'assets/mascot/katzu_icon_maskable_512.png',
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
        icons: [{ src: 'assets/mascot/katzu_icon_192.png', sizes: '192x192', type: 'image/png' }]
      },
      {
        name: 'المهمة اليومية',
        short_name: 'المهمة',
        url: '/app/trail',
        icons: [{ src: 'assets/mascot/katzu_icon_192.png', sizes: '192x192', type: 'image/png' }]
      }
    ]
  },
  workbox: {
    // `webp` is here for the hero (`assets/mascot/katzu_welcome.webp`, the one
    // painted sticker the app renders at full width): without it the precache
    // would ship a hero that only exists online, and a cold offline open would
    // show the app shell with a broken image (V16).
    globPatterns: ['**/*.{js,css,html,ico,png,webp,ttf,woff2}'],
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

function publicOriginFiles(): Plugin {
  const origin = String(process.env.VITE_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  const abs = (p: string) => (origin ? `${origin}${p}` : p);
  const routes = ['/', '/trust/privacy', '/trust/terms', '/demo', '/welcome'];
  const packageName = String(process.env.VITE_ANDROID_PACKAGE_NAME || '').trim();
  const sha256 = String(process.env.VITE_ANDROID_CERT_SHA256 || '').trim();
  return {
    name: 'katzu-public-origin-files',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: ['User-agent: *', 'Allow: /', '', `Sitemap: ${abs('/sitemap.xml')}`, ''].join('\n'),
      });

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
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source:
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          routes.map((r) => `  <url>\n    <loc>${abs(r)}</loc>\n  </url>`).join('\n') +
          '\n</urlset>\n',
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    publicOriginFiles(),
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
});
