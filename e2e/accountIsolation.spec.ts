import { test, expect } from '@playwright/test';
import { bootSignedIn, seedRows } from './harness';

test('sign-out clears the active report and patterns without transferring retained progress', async ({ page }) => {
  await bootSignedIn(page, { user: { accountId: 'account-a' } });
  await seedRows(page, 'sync_queue', [{
    ownerAccountId: 'account-a', payload: { stats: {}, trainings: [], saved_word_ids: [], mistakes: [], session_summaries: [] },
    createdAt: 0, attempts: 0, nextRetryAt: 0,
  }]);
  await seedRows(page, 'memory_patterns', [{
    patternId: 'account-a-pattern', kind: 'mistake', labelAr: 'اختبار', count: 1, lastSeenAt: 0, updatedAt: 0,
  }]);
  await page.evaluate(() => sessionStorage.setItem('katzu_session_summary', JSON.stringify({ marker: 'account-a' })));
  await page.goto('/app/profile');
  await page.getByRole('button', { name: 'تسجيل الخروج من الحساب' }).click();
  await expect(page).toHaveURL(/\/signin/);
  const state = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('KatzuWebDB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = (table: string) => new Promise<number>((resolve, reject) => {
      const request = database.transaction(table).objectStore(table).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = { patterns: await count('memory_patterns'), retained: await count('sync_queue'), report: sessionStorage.getItem('katzu_session_summary') };
    database.close();
    return result;
  });
  expect(state).toEqual({ patterns: 0, retained: 1, report: null });
});
