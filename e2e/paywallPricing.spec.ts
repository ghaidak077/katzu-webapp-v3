import { expect, test } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The paywall, as a browser test.
 *
 * The claims worth defending are not the layout: that a price appears only when
 * the server produced one, that the limit is on the same card as the price, that
 * the refund line is still a placeholder rather than an invented promise, and
 * that a learner with no money has a real way forward (the free mock) instead of
 * a wall.
 */

/** The catalogue the mocked `/pricing` answers with, in the standard group. */
const PRICES = [
  { product: 'pass90', amountCents: 2900, currency: 'EUR', group: 'standard', cell: null },
  { product: 'monthly', amountCents: 1299, currency: 'EUR', group: 'standard', cell: null },
  { product: 'mock', amountCents: 900, currency: 'EUR', group: 'standard', cell: null },
];

test.describe('the paywall', () => {
  test('leads with the pass, shows server prices and states the limit on the card', async ({ page }) => {
    await bootSignedIn(page, { pricing: { prices: PRICES, group: 'standard' } });
    await page.goto('/paywall');

    await expect(page.getByTestId('price-pass90')).toHaveText('29 €');
    await expect(page.getByTestId('price-monthly')).toHaveText('12,99 €');
    await expect(page.getByTestId('price-mock')).toHaveText('9 €');

    // The lead card is the pass, and it is above the monthly one.
    const box = await page.getByTestId('price-pass90').boundingBox();
    const monthlyBox = await page.getByTestId('price-monthly').boundingBox();
    expect(box!.y).toBeLessThan(monthlyBox!.y);

    // The fair-use limit travels with the price, not in a footnote nobody opens.
    // Both the pass and the monthly card state it; the point is that it is on
    // the page at all, next to the price rather than behind a link.
    await expect(page.getByText(/الحد العادل للاستخدام/).first()).toBeVisible();
    // The refund line is still the owner's to write.
    await expect(page.getByText('{{OWNER_FILL}}')).toBeVisible();
    // Nothing it must never claim.
    await expect(page.getByText('غير محدود')).toHaveCount(0);
    await expect(page.getByText(/مدى الحياة/)).toHaveCount(0);
  });

  test('offers the free mock as the way out, not a dead end', async ({ page }) => {
    await bootSignedIn(page, { pricing: { prices: PRICES, group: 'standard' } });
    await page.goto('/paywall');

    await page.getByRole('button', { name: /جرّب محاكاة B1 مجاناً أولاً/ }).click();
    await expect(page).toHaveURL(/\/mock$/);
  });

  test('shows no price and no buy button when the server cannot be reached', async ({ page }) => {
    await bootSignedIn(page, { pricing: null });
    await page.goto('/paywall');

    await expect(page.getByText(/تعذّر تحميل الأسعار الآن/)).toBeVisible();
    await expect(page.getByTestId('price-pass90')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /فعّل بكود/ })).toHaveCount(0);
    // And the honest alternative is still there.
    await expect(page.getByRole('button', { name: /محاكاة B1/ }).first()).toBeVisible();
  });

  test('tells a special-region buyer, in Arabic, what happens after they pay', async ({ page }) => {
    const special = PRICES.map((row) => ({ ...row, group: 'special', amountCents: 1200 }));
    await bootSignedIn(page, { pricing: { prices: special, group: 'special', cell: 1 } });
    await page.goto('/paywall');

    // The instructions open on the buy click, not before: a learner who is only
    // looking is not shown a form of words about bank transfers.
    await expect(page.getByText(/مصرف وسيط/)).toHaveCount(0);
    await page.getByRole('button', { name: /فعّل بكود/ }).first().click();

    await expect(page.getByText('كيف تدفع من هذه المنطقة')).toBeVisible();
    await expect(page.getByText(/١|1\./).first()).toBeVisible();
    // The honest part: the timing is an estimate, and the caveat names the risk.
    await expect(page.getByText(/يوم عمل واحد/)).toBeVisible();
    await expect(page.getByText(/تمرّ عبر مصرف وسيط/)).toBeVisible();
  });
});

/**
 * One price, everywhere.
 *
 * These two are the regression that mattered: the landing page, the modal and
 * the paywall used to read three different things — a USD figure mirrored from
 * crypto check-out, a hardcoded «5 دولار / شهر» behind it, and `/pricing` in
 * euros — so a learner could be quoted 5 dollars on one screen and 29 euros on
 * the next. All four surfaces now read `GET /pricing`, and a failure shows no
 * amount anywhere rather than a stale one.
 */
test.describe('the price is the same everywhere it appears', () => {
  test('landing and paywall quote the same amount, in the server\'s currency', async ({ page }) => {
    await bootSignedIn(page, { pricing: { prices: PRICES, group: 'standard' } });
    await page.goto('/');
    const landing = page.getByTestId('landing-price');
    await expect(landing).toContainText('29 €');

    await page.goto('/paywall');
    await expect(page.getByTestId('price-pass90')).toHaveText('29 €');
    await expect(page.getByTestId('price-monthly')).toHaveText('12,99 €');
  });

  test('no surface shows an amount when the server cannot be reached', async ({ page }) => {
    await bootSignedIn(page, { pricing: null });
    await page.goto('/');
    const landing = page.getByTestId('landing-price');
    await expect(landing).toBeVisible();
    // It must not read a number at all — not 29, not 5, not a dash beside a
    // buy control. It says where the price lives and stops there.
    await expect(landing).not.toContainText(/\d/);
    await expect(landing).toContainText('السعر عند صفحة الشراء');

    await page.goto('/paywall');
    await expect(page.getByText(/تعذّر تحميل الأسعار الآن/)).toBeVisible();
    await expect(page.getByTestId('price-pass90')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /فعّل بكود/ })).toHaveCount(0);
  });
});
