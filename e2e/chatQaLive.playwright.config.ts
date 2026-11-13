import { defineConfig, devices } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The live practice-chat rig — separate from the gate suite on purpose.
 *
 * It spends real model tokens, needs a provider key, and measures the free
 * tier's latency, so it can never be part of `npm run verify`. It starts the
 * built bundle (the thing that ships), drives it at 390×844 with a throttled
 * phone connection, and answers `/ai/turn` from the Worker's own roleplay code.
 *
 *   GROQ_API_KEY=... E2E_TARGET=preview npx playwright test -c e2e/chatQaLive.playwright.config.ts
 *
 * `live` blocks service workers like the gate suite; `live-pwa` allows them for
 * the one test that needs a real registration to survive an update check.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './',
  testMatch: /chatQaLive(Pwa)?\.spec\.ts/,
  // A scenario is up to seven turns on a free tier that can pause ~65 s on a
  // 429, so the wall clock is provider weather, not a product threshold. The
  // product latency number is printed from the proxy's own timings instead.
  timeout: 480_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['line']],
  outputDir: './test-results/chat-qa-live',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'off',
    viewport: { width: 390, height: 844 },
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
  projects: [
    {
      name: 'live',
      testMatch: /chatQaLive\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], serviceWorkers: 'block' },
    },
    {
      name: 'live-pwa',
      testMatch: /chatQaLivePwa\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], serviceWorkers: 'allow' },
    },
  ],
  webServer: {
    command:
      process.env.E2E_TARGET === 'preview'
        ? 'npm run build && npx vite preview --port 3000 --strictPort'
        : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.E2E_TARGET || process.env.E2E_TARGET !== 'preview',
    timeout: 240_000,
    cwd: join(__dirname, '..'),
    env: { VITE_WORKER_URL: 'https://e2e-worker.test', VITE_ANALYTICS_DEV: '1' },
  },
});
