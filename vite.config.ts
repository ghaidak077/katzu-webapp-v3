import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.workers\.dev\/(scenarios|vocabulary|grammar)/,
            handler: 'StaleWhileRevalidate',
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
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000,
    host: true
  }
});
