import { defineConfig, devices } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The marketing screenshot rig (`e2e/shots/marketingShots.spec.ts`).
 *
 * Third rig of the same shape as `uiPolishShots` / `journeyPolishShots`, with two
 * deliberate differences:
 *
 * 1. **Phone devices, not desktop viewports.** The marketing kit (`docs/MARKETING-KIT.md`
 *    §6) specifies the store sizes 1290x2796 (iPhone 15 Pro Max) and 1080x2400
 *    (Android), which are CSS 430x932 and 360x800 at deviceScaleFactor 3. A desktop
 *    context cannot produce those pixels, so each device is a Playwright project.
 * 2. **Its own port (3101) and its own server.** The gate suite and the other rigs
 *    share port 3000; a marketing run must not fight or silently reuse whichever
 *    server happens to be up, because a dev server started without the harness's
 *    placeholder worker origin makes every conversation turn fail
 *    (`WORKER_URL_MISSING`). It always builds and serves the production bundle, so
 *    the shots show what a learner actually installs.
 *
 *   npx playwright test -c e2e/marketingShots.playwright.config.ts --reporter=line
 *
 * Output: `docs/marketing/screenshots-mobile/` (written by the spec, at device pixels).
 */
export default defineConfig({
  testDir: './shots',
  testMatch: /marketingShots\.spec\.ts/,
  // One test walks the whole product on a real phone context: measured 3.5–4 min for
  // 24 screens, so the ceiling is generous. It bit once at 180 s — the run died on the
  // LAST screen with "Target page, context or browser has been closed", which reads
  // like a broken app and is only a too-tight timeout.
  timeout: 600_000,
  expect: { timeout: 20_000 },
  // Two workers, one per device: the projects share nothing (separate contexts) and the
  // public screens never touch the seeded database, so the two device walks can run at
  // the same time. Tests inside a project stay sequential — they share one page.
  workers: 2,
  fullyParallel: false,
  reporter: [['line']],
  outputDir: './test-results/marketing-shots',
  use: {
    baseURL: 'http://localhost:3101',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    // No action may silently eat the whole test budget. Without this, one locator read
    // on an element that never appears waits to the test timeout (measured: 572 s).
    actionTimeout: 30_000,
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
      name: 'iphone-15-pro-max',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 430, height: 932 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'android-1080x2400',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 800 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 3101 --strictPort',
    url: 'http://localhost:3101',
    reuseExistingServer: false,
    timeout: 180_000,
    cwd: join(__dirname, '..'),
    env: { VITE_WORKER_URL: 'https://e2e-worker.test' },
  },
});
