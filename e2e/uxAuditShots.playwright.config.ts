import { defineConfig, devices } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The "walk in as a learner" audit rig: real screenshots of the journey a
 * normal user actually takes, at one phone viewport, so a review can be done by
 * looking instead of by reading code.
 *
 * It writes PNGs to `.tmp/ux-audit/` (machine state, never a tracked document):
 * this rig is an audit, not evidence for a change, so it must not rewrite files
 * under `docs/`.
 *
 *   npx playwright test -c e2e/uxAuditShots.playwright.config.ts --reporter=line
 */

export default defineConfig({
  testDir: './shots',
  testMatch: /uxAuditShots\.spec\.ts/,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['line']],
  outputDir: '../test-results/ux-audit',
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
    reuseExistingServer: !process.env.E2E_TARGET || process.env.E2E_TARGET !== 'preview',
    timeout: 180_000,
    cwd: join(__dirname, '..'),
    env: { VITE_WORKER_URL: 'https://e2e-worker.test', VITE_ANALYTICS_DEV: '1' },
  },
});
