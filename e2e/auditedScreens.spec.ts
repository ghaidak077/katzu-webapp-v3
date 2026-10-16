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

    // The screen settles into ONE of three states, and the third one is the
    // happy path: with the mocked backend the free mock really starts, so the
    // exam's own round counter is on screen. That arm was missing, which is why
    // this spec was intermittently red — it waited for a loading label that
    // React is free to batch away (measured: pass at 3.7s in one run, 20s
    // timeout in the next, on identical code), and the page it had actually
    // reached showed «الجولة 1 من 9» with the opener. The loading label is
    // accepted only because the gate copy is what the assertion is about.
    const started = page.getByRole('progressbar', { name: /الجولة 1 من/ });
    const gate = page.getByText(/تسجيل الدخول|تعذّر|تعذر/).first();
    await expect(
      started.or(gate).or(page.getByText('جارٍ تجهيز المحاكاة…')),
    ).toBeVisible({ timeout: 20_000 });

    // The invariant, asserted unconditionally rather than only when a gate
    // happens to be on screen: a signed-in learner is never sent to sign in.
    await expect(
      page.getByText('يرجى تسجيل الدخول بحساب Google أولاً'),
      'signed-in learner must not be told to sign in with Google',
    ).toHaveCount(0);
  });
});
