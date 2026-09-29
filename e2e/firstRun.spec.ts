import { expect, test, type Locator } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * Stage 2 — the first three minutes, on the phone the learner actually holds.
 *
 * The flow itself is covered by onboarding/journey/paywall specs. What this file
 * defends is the part a walkthrough catches and a unit test cannot:
 *
 *  - a screen that reports an empty state without saying what to do next,
 *  - a control too small to hit one-handed,
 *  - an offer that asks for money without naming the price, what stays free, or
 *    the terms it is sold under.
 *
 * 390x844 is the iPhone 14/15 CSS viewport: the narrowest rectangle the Arabic
 * layout has to survive without clipping or losing a target.
 */
test.use({ viewport: { width: 390, height: 844 } });

/** Every control a thumb must hit, measured rather than assumed. */
async function expectTapTarget(locator: Locator, label: string) {
  await expect(locator, label).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} must be laid out`).not.toBeNull();
  expect(
    Math.round(box!.height),
    `${label} must be at least 44px tall (measured ${box!.height}px)`,
  ).toBeGreaterThanOrEqual(44);
}

test('an empty mistake bank says what to do next instead of only congratulating', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/app/practice');

  await page.getByRole('button', { name: 'بنك الأخطاء' }).first().click();

  // The state, then the mechanism — a learner who has never made a recorded
  // mistake must still learn how mistakes get recorded.
  await expect(page.getByText(/بنك أخطائك فارغ الآن/)).toBeVisible();
  await expect(page.getByText(/كل خطأ يرصده كاتزو خلال مشهد/)).toBeVisible();
  await expectTapTarget(
    page.getByRole('button', { name: 'العودة إلى التدريب' }),
    'mistake-bank way forward',
  );
});

test('a saved-word list with nothing in it offers the way out', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/app/practice');

  await page.getByRole('button', { name: /^المحفوظة/ }).click();

  await expect(page.getByText(/لم تحفظ أي كلمة بعد/)).toBeVisible();
  const back = page.getByRole('button', { name: 'اعرض كل الكلمات' });
  await expectTapTarget(back, 'saved-list way forward');

  // And the way out actually works: the full list comes back.
  await back.click();
  await expect(page.getByText(/لم تحفظ أي كلمة بعد/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^الكل \(/ })).toBeVisible();
});

test('the Pro offer names the price, the free tier, the terms and who sells it', async ({ page }) => {
  await bootSignedIn(page);

  // The level pills live in the scenario library, one tap from the mission.
  await page.getByRole('button', { name: 'كل المشاهد والمستويات' }).click();

  // A2 is locked on the free plan, so the pill is the honest path to the offer.
  const lockedPill = page.getByRole('button', { name: 'A2', exact: true });
  await expectTapTarget(lockedPill, 'CEFR level pill');
  await lockedPill.click();

  await expect(page.getByText('عضوية Katzu Pro')).toBeVisible();

  // The price is the Worker's (or the app's honest fallback), never absent and
  // never a placeholder.
  await expect(page.getByText(/دولار \/ شهر/)).toBeVisible();

  // What Pro unlocks, and — just as importantly — what stays free forever.
  await expect(page.getByText('ما يفتحه Pro:')).toBeVisible();
  await expect(page.getByText('ويبقى مجانياً دائماً:')).toBeVisible();

  // Both ways in: buy a code, or redeem one already held.
  await expectTapTarget(page.getByRole('link', { name: 'اشترِ كود تفعيل Pro' }), 'buy CTA');
  await expectTapTarget(
    page.getByRole('button', { name: /لديّ كود بالفعل/ }),
    'redeem CTA',
  );
  await expectTapTarget(
    page.getByRole('button', { name: /ليس الآن/ }),
    'dismiss CTA',
  );

  // The legal pages a payment implies, linked to the real public routes.
  await expectTapTarget(page.getByRole('link', { name: 'سياسة الخصوصية' }), 'privacy link');
  await expect(page.getByRole('link', { name: 'سياسة الخصوصية' })).toHaveAttribute(
    'href',
    /\/trust\/privacy$/,
  );
  await expect(page.getByRole('link', { name: 'شروط الاستخدام' })).toHaveAttribute(
    'href',
    /\/trust\/terms$/,
  );

  // No manufactured pressure and no invented social proof.
  await expect(
    page.getByText(/ينتهي العرض|عرض محدود|آخر فرصة|باقي \d+|السعر سيرتفع|يوصي|آلاف المتعلمين/),
  ).toHaveCount(0);
});
