import { expect, test } from '@playwright/test';

/**
 * C4 — the install and offline contract, measured in a real browser.
 *
 * The unit tests pin the build settings; this pins the consequence. A PWA can
 * have a perfect manifest and still die on a train, because the failure that
 * matters is not the manifest — it is the moment a learner opens the installed
 * app with no signal and gets the browser's error page instead of their
 * progress. That only reproduces with a service worker actually controlling the
 * page, which is why this spec runs in its own config with `serviceWorkers`
 * allowed (the main suite blocks them on purpose, for the reason documented in
 * `playwright.config.ts`).
 *
 * Run it with:
 *   npm run build && npx vite preview --port 3000 --strictPort
 *   npx playwright test --config=e2e/playReadiness.playwright.config.ts
 */

test.describe('the installed app', () => {
  test('serves a manifest an installer can accept', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();

    const manifest = await (await request.get(new URL(href!, page.url()).toString())).json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.scope).toBe('/');
    // A launcher needs one opaque 512 and one maskable 512.
    const icons = manifest.icons as Array<{ sizes: string; purpose?: string }>;
    expect(icons.some((i) => i.sizes === '512x512')).toBe(true);
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  test('serves asset links at the path Android actually fetches', async ({ request }) => {
    // The file must EXIST even when nothing is configured: a missing file and an
    // empty statement list are both a failed verification, and the empty list is
    // the honest one.
    const response = await request.get('/.well-known/assetlinks.json');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('json');
    const statements = await response.json();
    expect(Array.isArray(statements)).toBe(true);
  });

  test('opens offline from the cached shell, not the browser error page', async ({ page, context }) => {
    await page.goto('/');
    // The worker must take control; an uncontrolled first load cannot serve
    // anything offline no matter what is in the cache.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 30_000,
    });

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      // The app root is inside the navigation fallback, so a reload with no
      // network must still render the shell.
      await expect(page.locator('#root')).toBeVisible();
      // The app's own first paint, and explicitly NOT Chromium's offline page —
      // which renders its own document with a `#main`-less body and no #root.
      await expect(page.locator('#root')).not.toBeEmpty();
      await expect(page.getByText('صفحة غير متصلة')).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText('ERR_INTERNET_DISCONNECTED');
      // Some app copy at all: the shell that answered is ours.
      await expect(page.locator('#root')).toContainText(/[؀-ۿ]/);
    } finally {
      await context.setOffline(false);
    }
  });
});