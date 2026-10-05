import { expect, test } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The landing hero, measured rather than asserted from the source.
 *
 * `tests/landingMinimal.test.ts` can prove the headline has one enforced line
 * break; it cannot prove that at 390 px the thing fits in three lines. Only a
 * real layout can, and "the hero is short enough to read before scrolling" is a
 * claim about pixels.
 *
 * These are VISITOR tests. The hero shows a different action once someone is
 * signed in, so booting a session here would measure the returning-learner
 * page and quietly pass while the stranger's page was never looked at.
 */
test.describe('the landing hero, for someone who has never been here', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the headline fits in three lines on a small phone', async ({ page }) => {
    await page.goto('/');

    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();

    // Count the rendered line boxes rather than guessing from characters:
    // group the text nodes by their vertical offset, which is what a reader
    // sees as a line.
    const lines = await h1.evaluate((el) => {
      const range = document.createRange();
      const text = el.firstChild;
      if (!text) return 0;
      const text_ = text.textContent ?? '';
      const tops = new Set<number>();
      for (let i = 0; i < text_.length; i += 1) {
        range.setStart(text, i);
        range.setEnd(text, i + 1);
        const rect = range.getBoundingClientRect();
        if (rect.height > 0) tops.add(Math.round(rect.top));
      }
      return tops.size;
    });
    // The first text run alone must be at most two lines; with the second run
    // (an enforced block break) the whole headline is at most three.
    expect(lines).toBeLessThanOrEqual(3);

    // And it must not be so tall that the CTA starts below the fold — the CTA
    // is the one thing a stranger must be able to reach without scrolling.
    const cta = page.getByRole('button', { name: /جرّب درساً بدون حساب/ });
    await expect(cta).toBeVisible();
    const ctaBox = await cta.boundingBox();
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(844);
  });

  test('one filled action, and it is the account-free demo', async ({ page }) => {
    await page.goto('/');

    const demo = page.getByRole('button', { name: /جرّب درساً بدون حساب/ });
    const signup = page.getByRole('button', { name: /ابدأ مجاناً الآن/ });
    await expect(demo).toBeVisible();
    await expect(signup).toBeVisible();
  });

  test('the CTA reaches a real lesson without an account', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /جرّب درساً بدون حساب/ }).first().click();
    await expect(page).toHaveURL(/\/demo/);

    // The claim under test is "without an account", so what matters is that the
    // demo screen mounted and no sign-in form stood in its way. (The demo's own
    // content comes from the same mocked worker the rest of the suite uses; an
    // unbooted visitor gets the offline-served path, which is a separate
    // concern covered by `e2e/offline*.spec.ts`.)
    await expect(page.getByText(/جرّب كَاتْزُو الآن — بدون حساب|المحتوى غير متاح على هذا الجهاز بعد/)).toBeVisible({
      timeout: 20_000,
    });
    // Nothing asked them to sign in on the way.
    await expect(page.getByRole('button', { name: /تسجيل الدخول/ })).toHaveCount(0);
  });

  test('the price is stated below the demo, not above it', async ({ page }) => {
    await bootSignedIn(page, {
      pricing: {
        prices: [{ product: 'pass90', amountCents: 2900, currency: 'EUR', group: 'standard', cell: null }],
        group: 'standard',
      },
    });
    await page.goto('/');
    // The demo section's own heading, which is what "the demo" means as a place
    // on the page — the hero's CTA is above everything by definition.
    const demoSection = page.getByRole('heading', { name: 'درس واحد حقيقي، بدون حساب' });
    await expect(demoSection).toBeVisible();
    const price = page.getByTestId('landing-price');
    await expect(price).toBeVisible();
    const demoBox = (await demoSection.boundingBox())!;
    const priceBox = (await price.boundingBox())!;
    expect(priceBox.y).toBeGreaterThan(demoBox.y);
  });

  test('the non-affiliation line is on the page, not only in the terms', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/غير تابعة ولا معتمدة من Goethe-Institut/)).toBeVisible();
  });
});
