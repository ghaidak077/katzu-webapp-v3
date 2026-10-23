import { defineConfig, devices } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Screenshot rig for Step 7 (progressive reveal). Same shape as
 * `dayZeroShots.playwright.config.ts`; run it on purpose, never as part of the
 * gate (`*Shots.spec.ts` is ignored by the main config).
 */
export default defineConfig({
  testDir: './shots',
  testMatch: /step7RevealShots\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['line']],
  outputDir: '../test-results/step7-reveal-shots',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180_000,
    cwd: __dirname ? join(__dirname, '..') : undefined,
    env: { VITE_WORKER_URL: 'https://e2e-worker.test', VITE_ANALYTICS_DEV: '1' },
  },
});
