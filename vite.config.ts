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
function publicOriginFiles(): Plugin {
  const origin = String(process.env.VITE_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  const abs = (p: string) => (origin ? `${origin}${p}` : p);
  const routes = ['/', '/trust/privacy', '/trust/terms', '/demo', '/welcome'];
  return {
    name: 'katzu-public-origin-files',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: ['User-agent: *', 'Allow: /', '', `Sitemap: ${abs('/sitemap.xml')}`, ''].join('\n'),
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
