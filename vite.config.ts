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
  includeAssets: ['favicon.ico', 'assets/mascot/*.png', 'assets/fonts/*.ttf'],
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
