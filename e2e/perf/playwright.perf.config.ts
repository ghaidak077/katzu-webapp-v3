import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';

/**
 * The measurement configuration for `e2e/perf/perfprobe.spec.ts`.
 *
 * The probe is deliberately not part of the suite: it reports numbers rather than
 * asserting thresholds, so it belongs where a human runs it on purpose. Every
 * other setting — the browser flags, the media stubs, the web server — is the
 * main config's, so the numbers describe the same app the suite tests.
 *
 *   npm run build && npx vite preview --port 3000 --strictPort
 *   npx playwright test --config=e2e/perf/playwright.perf.config.ts
 *
 * The server must already be running: `reuseExistingServer` is what keeps the
 * production bundle under test instead of a dev server. `testIgnore` is cleared
 * because the base config excludes this directory from the suite.
 */
export default defineConfig(base, {
  // `testDir` is relative to *this* file, so '.' is e2e/perf. The base config's
  // `testIgnore` excludes that directory from the suite; clearing it here is
  // what lets this config measure the probe at all.
  testDir: '.',
  testMatch: /perfprobe\.spec\.ts/,
  testIgnore: /^$/,
});