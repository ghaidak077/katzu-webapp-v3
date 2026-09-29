import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke suite for the Katzu V2 episode.
 *
 * These tests are the only place the app is exercised as a *browser* rather than
 * as modules: real routing, real Dexie writes, real canvas/rAF, real Web Audio.
 * They cover the five screens of the daily loop — Journey Home → Story Setup →
 * Guided Practice → Live Interaction → Debrief — with the backend and the
 * microphone mocked, so a green run means the screens work, not that the network
 * happened to be up.
 *
 * `reuseExistingServer` is deliberate: the managed preview (port 3000) is the
 * server under test, so Playwright never spawns a competing dev server. Start it
 * first with `freebuff-preview start`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // One worker: every spec drives the same shared local database through the same
  // preview server, and the episode is a sequence, not a set of independent units.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    // A fake capture device gives the orb a real (silent) MediaStream, so the
    // analyser path is genuinely exercised instead of stubbed.
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        // This sandbox runs as root, and Chromium's GPU process refuses to start
        // under a sandbox it cannot use — which costs WebGL, and therefore costs
        // the orb its real body. Measured: without this, `getContext('webgl2')`
        // returns null and the orb silently takes its 2D fallback.
        '--no-sandbox',
        '--disable-gpu-sandbox',
        // Software WebGL (SwiftShader), so the orb's GL body is the one under test.
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        // A headless machine has no output device, and a context that cannot
        // resume is exactly the case the orb's bounded resume exists for.
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
    timeout: 120_000,
    // The harness mocks every off-origin request, but the app refuses to send
    // one at all when no worker origin is configured (WORKER_URL_MISSING fails
    // the turn before any fetch). A VITE_ var must exist at build/dev-server
    // start, so the suite carries its own placeholder instead of depending on
    // an untracked .env that only some checkouts have.
    env: { VITE_WORKER_URL: 'https://e2e-worker.test' },
  },
});
