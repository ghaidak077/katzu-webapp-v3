import { expect, test } from '@playwright/test';
import { collectPageErrors, mockBackend } from './harness';

/**
 * The public demo — value before signup.
 *
 * Its whole job is to give a visitor one real learning turn before an account
 * exists, and until this spec nothing automated looked at it. The regression it
 * guards is structural: the lesson is read from Dexie, so it arrives a render
 * after mount, and the reducer kept the null of the first render — the demo
 * showed «جارٍ تحضير الدرس التجريبي…» forever, on every device, signed out and
 * signed in alike. A unit test cannot see that (the reducer itself was
 * correct); only a browser can.
 *
 * Signed out on purpose: no `seedSignedInUser`, because an anonymous visitor is
 * the only audience this flow has.
 */
test('the public demo teaches one real turn without an account', async ({ page }) => {
  const errors = collectPageErrors(page);
  await mockBackend(page);

  await page.goto('/demo');
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });

  // The Arabic shell, and real German isolated LTR — before anything is clicked.
  await expect(page.locator('html[dir="rtl"]')).toHaveCount(1);
  const start = page.getByRole('button', { name: 'ابدأ الدرس التجريبي' });
  await expect(start).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[dir="ltr"]').first()).not.toBeEmpty();

  await start.click();

  // Study: real lines from the device's own content, with their Arabic meaning.
  const understood = page.getByRole('button', { name: /فهمتها/ });
  await expect(understood).toBeVisible();
  for (let step = 0; step < 3; step++) {
    if (!(await understood.count())) break;
    await understood.click();
    await page.waitForTimeout(150);
  }

  // Quiz: comprehension questions from the same content; any answer advances,
  // and a wrong one is stated rather than hidden (that is the honest path).
  for (let question = 0; question < 3; question++) {
    if (!(await page.getByText('ما معنى هذه الجملة بالألمانية؟').count())) break;
    // The options are the only buttons in the quiz card; the mic button is on
    // the production card, one stage later.
    await page.locator('button[class*="p-3.5"]').first().click();
    await page.getByRole('button', { name: /السؤال التالي|إلى التحدث/ }).click();
  }

  // Production: the visitor writes their own German and gets Arabic feedback.
  const input = page.getByLabel('جملتك بالألمانية');
  await expect(input).toBeVisible();
  await input.fill('Ich möchte ein Brot bitte');
  await page.getByRole('button', { name: 'تحقّق من جملتي' }).click();

  // Done: what they can now handle, their sentence, and the correct form.
  await expect(page.getByText('أكملت درسك الأول')).toBeVisible();
  await expect(page.getByText('الصيغة الصحيحة:')).toBeVisible();
  await expect(page.getByText(/تدرّبت على/)).toBeVisible();

  expect(errors).toEqual([]);
});
