import { expect, test } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The free B1 mock, driven the way a learner drives it.
 *
 * What is worth proving end to end and not only in unit tests:
 *  - a signed-in learner who has never paid can reach the mock and is put
 *    straight into part 1, with the honest notice on screen;
 *  - the mock speaks German at B1, not the café's A1;
 *  - the learner who has already used the free mock is told the truth and sent
 *    to the offer — no dead end, no silent wall.
 */

test.describe('the free B1 mock', () => {
  test('puts a signed-in learner into part one with the clock and the honest notice', async ({ page }) => {
    await bootSignedIn(page, { user: { cefrLevel: 'B1' } });
    await page.goto(`/mock`);

    // Part one, its brief, and a clock that is counting from five minutes.
    await expect(page.getByText('الجزء 1 من 3')).toBeVisible();
    await expect(page.getByText('الجزء الأول: التخطيط مع شريك المحادثة')).toBeVisible();
    await expect(page.getByTestId('mock-clock')).toBeVisible();
    await expect(page.getByTestId('mock-clock')).toHaveText(/[45]:\d{2}/);
    // The examiner opens the part, in German.
    await expect(page.getByText('Guten Tag! Erzählen Sie mir bitte')).toBeVisible();
    // The level chip says B1, whatever the learner was placed at.
    await expect(page.getByTestId('level-chip')).toHaveText('B1');
  });

  test('refuses honestly once the one free mock is used, and offers the way forward', async ({ page }) => {
    // `bootSignedIn` re-installs the backend mock with the options it is given,
    // so the flag has to travel with it rather than in a separate call.
    await bootSignedIn(page, { mockCreditRequired: true, user: { cefrLevel: 'B1' } });
    await page.goto(`/mock`);

    await expect(page.getByText('انتهت المحاكاة المجانية الواحدة')).toBeVisible();
    await expect(page.getByRole('button', { name: /اعرف الخيارات/ })).toBeVisible();
  });

  test('never claims an official grade anywhere on the mock', async ({ page }) => {
    await bootSignedIn(page, { user: { cefrLevel: 'B1' } });
    await page.goto(`/mock`);

    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/goethe|telc|ösd/i);
    expect(body).not.toMatch(/ناجح|راسب|اجتزت/);
  });
});