import { defineConfig, devices } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The correction-card screenshot rig.
 *
 * Separate from the gate suite for the same reason as the other shot rigs: it
 * starts the real preview bundle, drives a scripted `/ai/turn` through the app,
 * and saves real-viewport evidence instead of assertions.
 *
 *   E2E_TARGET=preview npx playwright test -c e2e/correctionCardShots.playwright.config.ts
 */

export default defineConfig({
  testDir: './shots',
  testMatch: /correctionCardShots\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['line']],
  outputDir: './test-results/correction-card',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio',
      ],
    },
    permissions: ['microphone'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: process.env.E2E_TARGET === 'preview'
      ? 'npm run build && npx vite preview --port 3000 --strictPort'
      : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.E2E_TARGET || process.env.E2E_TARGET !== 'preview',
    timeout: 180_000,
    cwd: join(__dirname, '..'),
    env: { VITE_WORKER_URL: 'https://e2e-worker.test', VITE_ANALYTICS_DEV: '1' },
  },
});
