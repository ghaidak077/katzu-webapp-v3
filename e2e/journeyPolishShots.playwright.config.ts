import { defineConfig, devices } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Screenshot rig for the Journey (library) screen polish — same shape as
 * `uiPolishShots.playwright.config.ts`, with the webServer rooted at the
 * project directory.
 */
export default defineConfig({
  testDir: './shots',
  testMatch: /journeyPolishShots\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['line']],
  outputDir: './test-results/journey-polish',
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
    cwd: __dirname ? join(__dirname, '..') : undefined,
    env: { VITE_WORKER_URL: 'https://e2e-worker.test', VITE_ANALYTICS_DEV: '1' },
  },
});
