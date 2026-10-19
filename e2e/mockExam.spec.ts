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

  test('a finished three-part mock shows the pillars and every part in the debrief', async ({ page }) => {
    // The debrief's evidence cards are unit-tested, but only a browser can prove
    // that three real part completions reach them: the summary is accumulated
    // across three separate conversation sessions, each torn down by its own end
    // action, and the result screen only renders once the third one lands.
    await bootSignedIn(page, { user: { cefrLevel: 'B1' } });
    await page.goto(`/mock`);

    const input = page.getByPlaceholder(/Schreib deinen Satz/);
    for (let part = 1; part <= 3; part++) {
      await expect(page.getByText(`الجزء ${part} من 3`)).toBeVisible();
      await input.fill('Ich möchte einen Kaffee bitte');
      await page.getByRole('button', { name: 'أرسل جملتك' }).click();
      // The examiner answers before the learner is allowed to end the part.
      await expect(page.getByText('Sehr gern. Möchten Sie noch etwas?').last()).toBeVisible();
      await page.getByRole('button', { name: 'خيارات الجلسة' }).click();
      await page.getByRole('button', { name: 'إنهاء الجلسة وعرض الملخص' }).click();
    }

    // The estimate, and all four pillars — coverage is the one that proves three
    // parts counted, and it can only be 100% when every part completed.
    await expect(page.getByTestId('mock-score')).toBeVisible();
    const pillars = page.getByTestId('mock-pillars');
    await expect(pillars).toBeVisible();
    await expect(pillars).toContainText('الاستقلالية بلا تلميح');
    await expect(pillars).toContainText('دقة القواعد');
    await expect(pillars).toContainText('تغطية الأجزاء الثلاثة');
    await expect(pillars).toContainText('إجمالي الجمل المستقلة');
    await expect(pillars).toContainText('100%');

    // One row per part, each naming its own sentence count.
    const parts = page.getByTestId('mock-parts-summary');
    await expect(parts).toBeVisible();
    for (let part = 1; part <= 3; part++) {
      await expect(parts).toContainText(`الجزء ${part}: 1 جملة`);
    }
  });

  test('never claims an official grade anywhere on the mock', async ({ page }) => {
    await bootSignedIn(page, { user: { cefrLevel: 'B1' } });
    await page.goto(`/mock`);

    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/goethe|telc|ösd/i);
    expect(body).not.toMatch(/ناجح|راسب|اجتزت/);
  });
});