import { expect, test } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The paywall, as a browser test.
 *
 * The claims worth defending are not the layout: that the four founding prices
 * appear with their published future price beside them, that a price appears
 * only when the server produced one, that the rules that end the offer travel
 * with the cards, and that a learner with no money has a real way forward (the
 * free mock) instead of a wall.
 */

/** The catalogue the mocked `/pricing` answers with, in the standard group. */
const PRICES = [
  {
    product: 'monthly',
    amountCents: 1499,
    futureCents: 2999,
    months: 1,
    recommended: false,
    currency: 'USD',
    group: 'standard',
    cell: null,
  },
  {
    product: 'quarterly',
    amountCents: 2999,
    futureCents: 5999,
    months: 3,
    recommended: false,
    currency: 'USD',
    group: 'standard',
    cell: null,
  },
  {
    product: 'halfyear',
    amountCents: 4999,
    futureCents: 9999,
    months: 6,
    recommended: true,
    currency: 'USD',
    group: 'standard',
    cell: null,
  },
  {
    product: 'yearly',
    amountCents: 9999,
    futureCents: 19999,
    months: 12,
    recommended: false,
    currency: 'USD',
    group: 'standard',
    cell: null,
  },
];

const ANSWER = {
  prices: PRICES,
  group: 'standard',
  foundingCap: 1000,
  foundingEndsOn: '2027-01-31',
  refundDays: 7,
  refundPlanIds: ['quarterly', 'halfyear', 'yearly'],
  activationHours: 12,
  freeLessonsPerMonth: 3,
};

test.describe('the paywall', () => {
  test('shows the four founding prices, each with the future price struck beside it', async ({
    page,
  }) => {
    await bootSignedIn(page, { pricing: ANSWER });
    await page.goto('/paywall');

    // Only prices the server sent, in dollars, to the cent.
    await expect(page.getByTestId('price-monthly')).toHaveText('$14.99');
    await expect(page.getByTestId('price-quarterly')).toHaveText('$29.99');
    await expect(page.getByTestId('price-halfyear')).toHaveText('$49.99');
    await expect(page.getByTestId('price-yearly')).toHaveText('$99.99');

    // 14.99 must never round to $15, and 49.99 must keep its cents.
    await expect(page.getByTestId('price-monthly')).not.toHaveText('$15');

    // The struck price is the real published future price, not an invented
    // anchor — read from the same row the founding price came from.
    await expect(
      page.getByTestId('price-monthly').locator('..').locator('span.line-through'),
    ).toHaveText('$29.99');
    await expect(
      page.getByTestId('price-yearly').locator('..').locator('span.line-through'),
    ).toHaveText('$199.99');

    // The per-month figure is on every plan longer than a month, and is the same
    // arithmetic the site build does ($29.99 / 3 → $10).
    await expect(page.getByText('$10 شهرياً')).toBeVisible();
    await expect(page.getByText('$8.33 شهرياً').first()).toBeVisible();

    // Four plans, in the config's order, with the badge on the 6-month one only.
    for (const name of ['شهر واحد', '3 أشهر', '6 أشهر', '12 شهراً']) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('أفضل قيمة')).toHaveCount(1);

    // Nothing it must never claim, and nothing it sold before.
    await expect(page.getByText('غير محدود')).toHaveCount(0);
    await expect(page.getByText(/مدى الحياة/)).toHaveCount(0);
    await expect(page.getByText(/\$60|\$42|KATZU26|لفترة محدودة/)).toHaveCount(0);
    await expect(page.getByText(/24 ساعة/)).toHaveCount(0);
  });

  test('states the rules that end the founding price, next to the cards', async ({ page }) => {
    await bootSignedIn(page, { pricing: ANSWER });
    await page.goto('/paywall');

    await expect(page.getByText('قواعد العرض')).toBeVisible();
    // The two conditions, the renewal promise, the refund rule and the 12-hour
    // activation promise — the numbers the server sent, not typed here.
    await expect(page.getByText(/1,000 عضو دافع/)).toBeVisible();
    await expect(page.getByText(/31 يناير 2027/)).toBeVisible();
    await expect(page.getByText(/يحتفظون بسعرهم في كل تجديد/)).toBeVisible();
    await expect(
      page.getByText(/استرداد كامل خلال أول 7 أيام على باقات 3 أشهر و6 أشهر و12 شهراً/),
    ).toBeVisible();
    await expect(page.getByText(/لا استرداد على باقة شهر واحد/).first()).toBeVisible();
    await expect(page.getByText(/خلال 12 ساعة كحد أقصى/).first()).toBeVisible();

    // The one-line copy a buyer reads before paying.
    await expect(
      page.getByText(/الدفع دون بطاقة بنكية · التفعيل خلال 12 ساعة/),
    ).toBeVisible();
  });

  test('offers the free mock as the way out, not a dead end', async ({ page }) => {
    await bootSignedIn(page, { pricing: ANSWER });
    await page.goto('/paywall');

    await page.getByRole('button', { name: /جرّب محاكاة B1 مجاناً أولاً/ }).click();
    await expect(page).toHaveURL(/\/mock$/);
  });

  test('shows no price and no buy button when the server cannot be reached', async ({ page }) => {
    await bootSignedIn(page, { pricing: null });
    await page.goto('/paywall');

    await expect(page.getByText(/تعذّر تحميل الأسعار الآن/)).toBeVisible();
    await expect(page.getByTestId('price-monthly')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /اختر هذه الباقة/ })).toHaveCount(0);
    // And the honest alternative is still there.
    await expect(page.getByRole('button', { name: /محاكاة B1/ }).first()).toBeVisible();
  });

  test('tells a special-region buyer, in Arabic, what happens after they pay', async ({ page }) => {
    // Region no longer moves the price; it only routes the instructions.
    const special = ANSWER.prices.map((row) => ({ ...row, group: 'special' }));
    await bootSignedIn(page, { pricing: { ...ANSWER, prices: special, group: 'special' } });
    await page.goto('/paywall');

    await expect(page.getByTestId('price-monthly')).toHaveText('$14.99');

    // The instructions open on the buy click, not before: a learner who is only
    // looking is not shown a form of words about bank transfers.
    await expect(page.getByText(/مصرف وسيط/)).toHaveCount(0);
    await page.getByRole('button', { name: /اختر هذه الباقة/ }).first().click();

    await expect(page.getByText('كيف تدفع من هذه المنطقة')).toBeVisible();
    await expect(page.getByText(/1\./).first()).toBeVisible();
    // The timing is the published upper bound, and the caveat names the risk.
    await expect(page.getByText(/وقت التفعيل: خلال 12 ساعة كحد أقصى/)).toBeVisible();
    await expect(page.getByText(/تمرّ عبر مصرف وسيط/)).toBeVisible();
  });
});

/**
 * One price, everywhere it appears.
 *
 * The public price lives on the marketing site, built from the same
 * `pricing.config.json`, so the app's own surfaces must still agree with each
 * other: the paywall page and the paywall sheet both read `GET /pricing`, and a
 * failure shows no amount anywhere rather than a stale one.
 */
test.describe('the price is the same everywhere it appears', () => {
  test('the paywall quotes the server amount, in the server\'s currency', async ({ page }) => {
    await bootSignedIn(page, { pricing: ANSWER });
    await page.goto('/paywall');
    await expect(page.getByTestId('price-monthly')).toHaveText('$14.99');
    await expect(page.getByTestId('price-halfyear')).toHaveText('$49.99');
  });

  test('the paywall shows no amount when the server cannot be reached', async ({ page }) => {
    await bootSignedIn(page, { pricing: null });
    await page.goto('/paywall');
    await expect(page.getByText(/تعذّر تحميل الأسعار الآن/)).toBeVisible();
    await expect(page.getByTestId('price-yearly')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /اختر هذه الباقة/ })).toHaveCount(0);
  });
});
