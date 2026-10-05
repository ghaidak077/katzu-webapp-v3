import { defineConfig } from '@playwright/test';
import base from '../playwright.config';

/**
 * The configuration for `e2e/playReadiness.spec.ts`.
 *
 * It differs from the suite in exactly one way, and the difference is the whole
 * point: `serviceWorkers: 'allow'`. The main suite blocks service workers on
 * purpose, because a registered worker serves requests that `page.route()` mocks
 * never reach and the suite would measure its own mocks. The offline contract is
 * the one thing that cannot be tested with the worker blocked — it is the
 * product's headline claim for a learner on a train — so it gets its own run.
 *
 *   npm run build && npx vite preview --port 3000 --strictPort
 *   npx playwright test --config=e2e/playReadiness.playwright.config.ts
 *
 * Not part of `npm run test:e2e`: the suite runs one worker against a shared
 * database and this spec wants the network switched off for a page.
 */
export default defineConfig(base, {
  testDir: '.',
  testMatch: /playReadiness\.spec\.ts/,
  testIgnore: /^$/,
  use: {
    ...base.use,
    serviceWorkers: 'allow',
  },
});