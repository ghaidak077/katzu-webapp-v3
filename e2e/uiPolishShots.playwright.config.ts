import { defineConfig, devices } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The UI-polish screenshot rig (`e2e/shots/`).
 *
 * Separate from the main config so the evidence run never mixes with gate
 * assertions: it starts the same preview bundle the main suite tests
 * (`E2E_TARGET=preview`), signs the learner in through the same harness, and
 * saves real-viewport screenshots (never a full-page stitch) of the four
 * launch-week screens at the two reference sizes.
 *
 *   E2E_TARGET=preview npx playwright test -c e2e/uiPolishShots.playwright.config.ts --reporter=line
 */

export default defineConfig({
  // Resolved relative to THIS file (e2e/), so the rig lives in e2e/shots/.
  testDir: './shots',
  testMatch: /uiPolishShots\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['line']],
  outputDir: './test-results/ui-polish',
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
