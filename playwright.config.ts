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
 * first with `npm run dev`, or, to exercise the production bundle, with
 * `npm run build && npx vite preview --port 3000 --strictPort` (same port, so the rest of
 * this config is unchanged).
 */
// `E2E_TARGET=preview` runs the suite against the production bundle in `dist/` instead of the
// dev server. The build must carry the harness's placeholder worker origin: the suite mocks
// off-origin requests only and leaves localhost to the server under test, so a bundle built
// with an empty `VITE_WORKER_URL` calls the preview server itself and every turn 404s
// (measured: 27/37 that way, 37/37 with the origin set). `webServer.env` supplies it to the
// build subprocess, so no shell prefix and no platform-specific syntax is needed.
const targetPreview = process.env.E2E_TARGET === 'preview';

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
    // The built app registers a Workbox service worker, which then serves requests that
    // `page.route()` mocks never reach — measured: the same 37 tests scored 26/37 against
    // `vite preview` and 37/37 against the dev server. Blocking service workers makes the
    // production bundle the configuration under test; the offline shell is covered by the
    // PWA unit tests in `tests/pwaOffline.test.ts`, not here.
    serviceWorkers: 'block',
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
    command: targetPreview
      ? 'npm run build && npx vite preview --port 3000 --strictPort'
      : 'npm run dev',
    url: 'http://localhost:3000',
    // Never reuse a server for the preview run: a stray dev server would silently turn the
    // "production bundle" run back into a dev run.
    reuseExistingServer: !targetPreview,
    timeout: 120_000,
    // The harness mocks every off-origin request, but the app refuses to send
    // one at all when no worker origin is configured (WORKER_URL_MISSING fails
    // the turn before any fetch). A VITE_ var must exist at build/dev-server
    // start, so the suite carries its own placeholder instead of depending on
    // an untracked .env that only some checkouts have.
    env: { VITE_WORKER_URL: 'https://e2e-worker.test' },
  },
});
