/**
 * Coverage for the screens the product-experience-audit (2026-10-07) could not
 * walk: guided practice, the live conversation failure path, and the mock gate.
 *
 * `bootSignedIn` seeds the signed-in learner the rest of the suite uses. The
 * harness's mocked backend is left ON for the practice and mock specs, and OFF
 * for the live-failure spec: a live turn against an unreachable worker must
 * fail with an honest retry card that does NOT advance the round counter.
 */
import { test, expect } from '@playwright/test';
import { bootSignedIn, seedSignedInUser } from './harness';

test.describe('audited screens: practice, live failure, mock gate', () => {
  test('guided practice opens with local content and readiness meter', async ({ page }) => {
    await bootSignedIn(page);
    await page.goto('/scenario/airport_arrival/practice');
    await expect(page.getByRole('heading', { name: /تدريب موجّه/ })).toBeVisible();
    await expect(page.getByText('Mein Koffer ist nicht angekommen.').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'أنا جاهز' })).toBeEnabled();
  });

  test('live conversation: a failed send keeps the round counter honest', async ({ page }) => {
    // Seeded WITHOUT the mocked backend: the worker is genuinely unreachable.
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
    await seedSignedInUser(page);
    await page.goto('/scenario/airport_arrival/live');

    // mode chooser → training mode
    await page.getByRole('button', { name: /ابدأ «تدريب» الآن/ }).click();
    const opener = page.getByRole('article').first();
    await expect(opener).toBeVisible();
    const roundLabel = page.getByRole('progressbar');
    await expect(roundLabel).toHaveAttribute('aria-label', /الجولة 1 /);

    // Send a reply; with no worker the turn fails.
    await page.getByRole('textbox', { name: 'اكتب جملتك بالألمانية' }).fill('Ja, mein Koffer ist nicht angekommen.');
    await page.keyboard.press('Enter');

    // The honest failure: a retry card, and the round did NOT advance to 2.
    await expect(page.getByText('أعد المحاولة').first()).toBeVisible({ timeout: 20_000 });
    await expect(roundLabel).toHaveAttribute('aria-label', /الجولة 1 /);
    await expect(page.getByRole('button', { name: 'إعادة المحاولة' })).toBeVisible();
  });

  test('mock gate does not tell a signed-in learner to sign in with Google', async ({ page }) => {
    await bootSignedIn(page);
    await page.goto('/mock');
    // Either the mock starts (worker reachable) or the gate shows. The gate copy
    // must distinguish "not signed in" from "server unreachable/session stale".
    const gate = page.getByText(/تسجيل الدخول|تعذّر|تعذر/).first();
    await expect(gate.or(page.getByText('جارٍ تجهيز المحاكاة…'))).toBeVisible({ timeout: 20_000 });
    const gateText = (await gate.count()) ? await gate.innerText() : '';
    if (gateText) {
      expect(gateText, 'signed-in learner must not be told to sign in with Google').not.toContain(
        'يرجى تسجيل الدخول بحساب Google أولاً',
      );
    }
  });
});
