import { test, expect, type Page } from '@playwright/test';
import { bootSignedIn, mockBackend, seedRows } from './harness';

/**
 * The public erasure page, as the two people who reach it experience it.
 *
 * WHY THIS SPEC EXISTS
 * The erasure path had a worker test (`tests/accountOps.test.ts`) proving the
 * server deletes, and no test at all proving the PAGE a worried learner actually
 * opens. Two real defects lived in that gap, both found by loading the URL:
 *
 * 1. The page could not be reached without a session. The seed gives every
 *    first-time visitor a `current_user` row with `isLoggedIn: false`, and the
 *    shell's guard did not list `/delete-account` as public, so a signed-out
 *    learner — the exact person the page was written for — was bounced to the
 *    welcome screen.
 * 2. It answered «استلمنا طلبك عبر البريد» after a call that could only fail:
 *    there is no server route that queues a request, so a signed-out learner was
 *    handed a false receipt for an erasure request.
 *
 * What the copy must never do is the assertion that is worth the most here, so
 * it is written as a negative on both branches: never «استلمنا» without a
 * mailbox, never «تم حذف حسابك» without the server's own `success`.
 */
const SUPPORT = 'support@ghaidak.com';

/** The local rows that must survive or disappear, read from the app's own DB. */
async function readLocalState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('KatzuWebDB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = (table: string) =>
      new Promise<number>((resolve, reject) => {
        const request = database.transaction(table).objectStore(table).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const user = await new Promise<{ isLoggedIn?: boolean } | undefined>((resolve, reject) => {
      const request = database.transaction('users').objectStore('users').get('current_user');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const patterns = await count('memory_patterns');
    database.close();
    return { patterns, signedIn: user?.isLoggedIn === true };
  });
}

test('a learner with no session still reaches the erasure page, and is handed a real mail route', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/delete-account');

  // Reachability first: this is the assertion the defect above would fail.
  await expect(page.getByRole('heading', { name: 'طلب حذف الحساب' })).toBeVisible();
  await expect(page.getByText(new RegExp(SUPPORT))).toBeVisible();
  await expect(page.getByRole('button', { name: 'افتح رسالة الحذف في بريدي' })).toBeEnabled();

  await page.getByLabel('بريدك الإلكتروني').fill('someone@example.com');
  await page.getByRole('button', { name: 'افتح رسالة الحذف في بريدي' }).click();

  // Nothing was sent from this page — the draft is opened, and it says so.
  await expect(page.getByText(/لم يُرسل شيء بعد/)).toBeVisible();
  await expect(page.getByText(/استلمنا طلبك/)).toHaveCount(0);

  // The draft itself carries the only credential the page has: the address.
  const mail = page.getByRole('link', { name: 'افتح الرسالة مرة أخرى' });
  await expect(mail).toHaveAttribute('href', new RegExp(`^mailto:${SUPPORT}`));
  expect(await mail.getAttribute('href')).toContain(encodeURIComponent('someone@example.com'));

  // And it never asks for something it has no way to check.
  expect(await page.locator('input[type="password"]').count()).toBe(0);
});

test('an address that cannot identify an account is refused with one next action', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/delete-account');

  await page.getByLabel('بريدك الإلكتروني').fill('not-an-email');
  await page.getByRole('button', { name: /افتح رسالة الحذف في بريدي|احذف حسابي الآن/ }).click();

  await expect(page.getByRole('alert')).toContainText('اكتب بريداً صحيحاً');
  // The refusal must not have opened anything: still the form, no draft state.
  await expect(page.getByText(/لم يُرسل شيء بعد/)).toHaveCount(0);
});

test('a deletion the server refused is never reported as a completed one', async ({ page }) => {
  // The default mock is the server answering `DELETE_INCOMPLETE`.
  await bootSignedIn(page);
  await page.goto('/delete-account');

  await page.getByLabel('بريدك الإلكتروني').fill('e2e@katzu.test');
  await page.getByRole('button', { name: 'احذف حسابي الآن' }).click();

  await expect(page.getByRole('alert')).toContainText('تعذّر إكمال الحذف من هنا');
  await expect(page.getByText(/تم حذف حسابك/)).toHaveCount(0);
  // Still on the page and still signed in, so the learner can retry instead of
  // being thrown out on the strength of a deletion that did not happen.
  await expect(page).toHaveURL(/\/delete-account/);
  expect((await readLocalState(page)).signedIn).toBe(true);
});

test('a completed deletion also clears this device and returns to sign-in', async ({ page }) => {
  await bootSignedIn(page, { deleteAccountOk: true });
  await seedRows(page, 'memory_patterns', [
    { patternId: 'p1', kind: 'mistake', labelAr: 'اختبار', count: 1, lastSeenAt: 0, updatedAt: 0 },
  ]);
  await page.goto('/delete-account');

  await page.getByLabel('بريدك الإلكتروني').fill('e2e@katzu.test');
  await page.getByRole('button', { name: 'احذف حسابي الآن' }).click();

  await expect(page.getByText(/تم حذف حسابك/)).toBeVisible();
  // The page promises the deletion covers this device too, and only this code can
  // keep that promise — the server route has never heard of the device.
  await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
  expect(await readLocalState(page)).toEqual({ patterns: 0, signedIn: false });
});
