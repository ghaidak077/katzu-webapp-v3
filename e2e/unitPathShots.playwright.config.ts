import { defineConfig, devices } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Screenshot rig for the vertical unit path (390×844) — same shape as the other
 * evidence configs, writing to the git-ignored `.tmp/unit-path/`.
 *
 *   npx playwright test -c e2e/unitPathShots.playwright.config.ts
 */
export default defineConfig({
  testDir: './shots',
  testMatch: /unitPathShots\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['line']],
  outputDir: '../.tmp/unit-path/test-results',
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
    command:
      process.env.E2E_TARGET === 'preview'
        ? 'npm run build && npx vite preview --port 3000 --strictPort'
        : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: process.env.E2E_TARGET !== 'preview',
    timeout: 180_000,
    cwd: join(__dirname, '..'),
    env: { VITE_WORKER_URL: 'https://e2e-worker.test', VITE_ANALYTICS_DEV: '1' },
  },
});
