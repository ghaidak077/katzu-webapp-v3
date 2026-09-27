import { defineConfig } from 'vite';
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
    icons: [
      {
        src: 'assets/mascot/katzu_avatar.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: 'assets/mascot/katzu_welcome.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,ttf,woff2}'],
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

export default defineConfig({
  plugins: [
    react(),
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
