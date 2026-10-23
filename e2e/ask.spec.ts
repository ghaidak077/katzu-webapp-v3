import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * Ask Katzu (V28 Stage 2A): one question about German in, a validated answer and
 * short practice out. These assertions are the product contract, not decoration:
 * the entry is reachable, the answer explains in Arabic with German examples, a
 * practice answer is graded deterministically, a wrong one lands in the review
 * bank, and anything off-topic is refused politely.
 */

async function countTable(page: Page, table: string): Promise<number> {
  return page.evaluate(async (tableName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('KatzuWebDB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction(tableName).objectStore(tableName).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  }, table);
}

async function askQuestion(page: Page, question: string): Promise<void> {
  await page.getByPlaceholder(/الفرق بين/).fill(question);
  await page.getByRole('button', { name: 'اسأل' }).click();
}

test('the Practice tab opens Ask Katzu, which explains, then checks understanding', async ({ page }) => {
  await bootSignedIn(page, { history: true });
  await page.goto('/app/practice');

  // The entry is a real, keyboard-reachable control on the Practice tab.
  await page.getByRole('button', { name: /اسأل كَاتْزُو عن الألمانية/ }).click();
  await expect(page).toHaveURL(/\/app\/ask$/);

  await askQuestion(page, 'اشرح لي حالة الأكوزاتيف.');

  // The Arabic explanation and a German example with its Arabic.
  await expect(page.getByText('الأكوزاتيف حالة النصب')).toBeVisible();
  await expect(page.getByText('Ich kaufe den Kaffee.')).toBeVisible();
  await expect(page.getByText('أشتري القهوة.')).toBeVisible();

  // Three practice items, graded deterministically: the fill answer is correct…
  const inputs = page.getByPlaceholder('اكتب الجواب بالألمانية');
  const checks = page.getByRole('button', { name: 'تحقّق' });

  await inputs.nth(1).fill('den');
  await checks.nth(1).click();
  await expect(page.getByText('صحيحة — فهمت الفكرة.')).toBeVisible();

  // A wrong free translation is corrected, but never recorded: a translation can
  // be phrased many correct ways, so it is not proof of a knowledge gap — the
  // filing rule is pinned in tests/askPractice.test.ts (only a clear wrong on a
  // fill or reorder item is evidence of one).
  const mistakesBefore = await countTable(page, 'mistakes');
  await inputs.nth(0).fill('Ich kaufe Apfel falsch');
  await checks.nth(0).click();
  await expect(page.getByText('ليست الصيغة الصحيحة بعد')).toBeVisible();
  expect(await countTable(page, 'mistakes')).toBe(mistakesBefore);

  // A wrong word order on a reorder item is a clear miss: corrected and recorded.
  // Both corrections are on screen at this point (the translation above and this
  // one), so assert the count rather than a single element.
  await inputs.nth(2).fill('den Kaffee Ich kaufe');
  await checks.nth(2).click();
  await expect(page.getByText('ليست الصيغة الصحيحة بعد')).toHaveCount(2);
  await expect.poll(() => countTable(page, 'mistakes')).toBeGreaterThan(mistakesBefore);

  // A language question carries no legal notice.
  await expect(page.getByText(/ليس استشارة قانونية/)).toHaveCount(0);
});

test('official German shows the not-legal-advice notice, and off-topic is refused', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/app/ask');

  await askQuestion(page, 'اشرح لي معنى هذا النص: Bescheid vom Amt.');
  await expect(page.getByText(/ليس استشارة قانونية أو هجرة/)).toBeVisible();
  await expect(page.getByText('ألمانية رسمية', { exact: true })).toBeVisible();

  // An unrelated question is refused politely, never answered wrongly.
  await askQuestion(page, 'ما الطقس غداً في برلين؟');
  await expect(page.getByText(/اسألني عن كلمة أو قاعدة أو جملة/).first()).toBeVisible();
});
