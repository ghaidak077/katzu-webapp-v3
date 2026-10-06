import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, mockBackend } from './harness';

/**
 * Read-only production smoke.
 *
 * The checks a human would do by hand after a deploy — the page loads, the price
 * is the same everywhere, the free-session promise is the right one, the admin
 * surface is closed, the share tags are on the document — as one spec that can
 * be pointed at the live site with `E2E_TARGET=production npx playwright test
 * e2e/productionSmoke.spec.ts`.
 *
 * It writes NOTHING: no account, no order, no redemption, no analytics beyond
 * the page's own landing_viewed. Every request is a GET. That is deliberate —
 * it is the suite that is safe to run against the real thing.
 *
 * In the default preview run it still executes, via the harness's mocked
 * backend, so the same assertions guard the bundle before a deploy. Three parts
 * declare themselves and skip where they are meaningless: the failure-mode price
 * (needs the mock), the live admin 401 (needs the real worker), and the paywall
 * half of the price parity (an anonymous visitor cannot reach `/paywall`, and
 * this suite does not sign in).
 */

const PRODUCTION = process.env.E2E_TARGET === 'production';

const PRICES = [
  { product: 'pass90', amountCents: 2900, currency: 'EUR', group: 'standard', cell: null },
  { product: 'monthly', amountCents: 1299, currency: 'EUR', group: 'standard', cell: null },
  { product: 'mock', amountCents: 900, currency: 'EUR', group: 'standard', cell: null },
];

/** The amount in a price string, group-agnostic: `Katzu Pro — 29 €` → `29`. */
function amountOf(text: string): string {
  const match = text.match(/(\d[\d.,]*)\s*€/);
  expect(match, `no euro amount in "${text}"`).toBeTruthy();
  return match![1];
}

/** Set a waiter for the app's own `/pricing` call, so no host is hardcoded. */
async function workerOriginFromPricing(page: Page): Promise<string> {
  const priced = page.waitForRequest((request) => {
    try {
      return new URL(request.url()).pathname === '/pricing';
    } catch {
      return false;
    }
  });
  await page.goto('/');
  return new URL((await priced).url()).origin;
}

test.describe('production smoke (read-only)', () => {
  test('a tagged landing loads, carries the share tags, and stays quiet in the console', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));

    // In the preview run the bundle is built against a placeholder worker origin
    // (`e2e-worker.test`), so every off-origin call has to be mocked or the
    // console fills with failed fetches the real site would never make — and the
    // console assertion below would fail on the harness, not the app. Against
    // production there is nothing to mock and nothing to fake.
    if (!PRODUCTION) await mockBackend(page, { pricing: { prices: PRICES, group: 'standard' } });

    await page.goto('/?src=test');

    await expect(page.locator('h1').first()).toBeVisible();
    // The share tags the unfurl depends on, read from the live document head.
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');

    // The tag is captured without the page breaking: an unknown `?src=` must not
    // throw. Nothing else in the console either.
    expect(errors).toEqual([]);
  });

  test('the landing and the paywall quote the same amount', async ({ page }) => {
    if (!PRODUCTION) await bootSignedIn(page, { pricing: { prices: PRICES, group: 'standard' } });

    await page.goto('/');
    const landing = page.getByTestId('landing-price');
    await expect(landing).toBeVisible();
    // The badge wears the brand name alone until `/pricing` answers, so reading
    // it the instant it appears compares a blank against a number. Wait for the
    // server's amount to land (measured: it can take a moment against production).
    await expect(landing).toContainText('€');
    const amount = amountOf(await landing.innerText());

    await page.goto('/paywall');
    // The auth guard resolves asynchronously, so for a moment the paywall route
    // is mounted and then an anonymous visitor is sent away. Wait for whichever
    // ending is real before deciding — the price card, or the redirect.
    await page.waitForFunction(
      () =>
        Boolean(document.querySelector('[data-testid="price-pass90"]')) ||
        /^\/(welcome|signin)/.test(window.location.pathname),
      undefined,
      { timeout: 20_000 },
    );
    if (!/^\/paywall/.test(new URL(page.url()).pathname)) {
      // `/paywall` is session-gated (`isPublicPath` in App.tsx does not list it).
      // This smoke is read-only and does not sign in, so the cross-surface half
      // is preview-only; the landing half above still ran against production.
      test.skip(true, `anonymous /paywall redirected to ${new URL(page.url()).pathname}; the smoke does not sign in`);
    }
    // The same number, from the same `/pricing` call, on the other surface.
    await expect(page.getByTestId('price-pass90')).toContainText(amount);
  });

  test('the free-session promise says three, in Western digits', async ({ page }) => {
    if (!PRODUCTION) await bootSignedIn(page, { pricing: { prices: PRICES, group: 'standard' } });

    await page.goto('/');
    // The always-visible free column states it; the FAQ states it again.
    await expect(page.getByText(/3 جلسات محادثة مجانية/).first()).toBeVisible();
    // And the Arabic-Indic shape is gone from the product (L12).
    await expect(page.getByText(/٣ جلسات/)).toHaveCount(0);
  });

  test('shows no price when /pricing is unreachable', async ({ page }) => {
    // Preview only: production's `/pricing` is live, and this one needs a mocked
    // failure to be meaningful.
    test.skip(PRODUCTION, 'preview-only: the live /pricing cannot be made to fail from here');
    await bootSignedIn(page, { pricing: null });

    await page.goto('/');
    await expect(page.getByTestId('landing-price')).not.toContainText(/\d/);
    await page.goto('/paywall');
    await expect(page.getByTestId('price-pass90')).toHaveCount(0);
  });

  test('the admin orders route refuses an unauthenticated caller', async ({ page, request }) => {
    // Production only: the preview harness mocks every off-origin request, so a
    // 401 there would be the mock's answer, not the worker's.
    test.skip(!PRODUCTION, 'production-only: needs the real worker, not the mock');

    const origin = await workerOriginFromPricing(page);
    const response = await request.get(`${origin}/admin/api/orders`);
    expect(response.status()).toBe(401);
  });
});
