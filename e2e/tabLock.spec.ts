import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The Practice/Progress lock (step 3), in the browser.
 *
 * The rule is a pure function (`isFirstSessionDone`, proven in
 * `tests/guidedHome.test.ts`); what only a browser can prove is that the DOM
 * follows it: a tap on a locked tab opens the sheet instead of navigating, a
 * typed URL to a locked screen is replaced with the home screen (and Back does
 * not bounce), the primary opens the SAME opening episode the onboarding hop
 * uses, a Pro learner and a learner with no free conversations left are not
 * locked, a finished conversation opens both tabs, and with the switch OFF
 * today's screen renders with no lock and no badge.
 *
 * The switch is set in an init script, i.e. before the app's first document
 * runs, which is the same lever the owner has on a phone.
 */

async function setSwitch(page: Page, value: '1' | '0') {
  await page.addInitScript((flag) => {
    try {
      localStorage.setItem('kz.guidedHome', flag);
    } catch {
      /* storage disabled: the build default applies */
    }
  }, value);
}

const practiceTab = (page: Page) => page.getByRole('button', { name: 'التدريب' }).first();
const progressTab = (page: Page) => page.getByRole('button', { name: 'التقدم' }).first();
/** The lock sheet's title, addressed by its heading. */
const lockSheet = (page: Page) => page.getByRole('heading', { name: 'هذا القسم يفتح بعد أول محادثة' });
const lockBadges = (page: Page) => page.locator('[data-testid^="tab-lock-"]');
const later = (page: Page) => page.getByRole('button', { name: 'لاحقاً' });

test.describe('the Practice/Progress lock (step 3)', () => {
  test('day 0 (ON): tapping a locked tab opens the sheet and never moves the highlight', async ({ page }) => {
    await setSwitch(page, '1');
    await bootSignedIn(page);
    await page.goto('/app/trail');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The two locked tabs wear the badge; Trail does not.
    await expect(lockBadges(page)).toHaveCount(2);
    await expect(page.locator('nav [aria-current="page"]')).toHaveCount(1);

    // A forced, real-user tap: the locked tab is `aria-disabled` (decision F)
    // but still responds to a tap by opening the sheet.
    await practiceTab(page).click({ force: true });
    await expect(lockSheet(page)).toBeVisible();
    // Still exactly one highlight, still on Trail: the tap was a peek, not a route.
    await expect(page.locator('nav [aria-current="page"]')).toHaveCount(1);
    await expect(page).toHaveURL(/\/app\/trail$/);

    // Dismiss, and the other locked tab behaves the same.
    await later(page).click();
    await expect(lockSheet(page)).toHaveCount(0);
    await progressTab(page).click({ force: true });
    await expect(lockSheet(page)).toBeVisible();
    await expect(page).toHaveURL(/\/app\/trail$/);
  });

  test('day 0 (ON): a typed URL to a locked screen is replaced, the sheet opens, and Back does not bounce', async ({ page }) => {
    await setSwitch(page, '1');
    await bootSignedIn(page);
    await page.goto('/app/trail');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('/app/practice');
    await expect(page).toHaveURL(/\/app\/trail$/);
    await expect(lockSheet(page)).toBeVisible();

    await later(page).click();
    await page.goto('/app/review');
    await expect(page).toHaveURL(/\/app\/trail$/);
    await expect(lockSheet(page)).toBeVisible();

    // Back answers with the home screen instead of bouncing back to the locked
    // route (the guard replaces the URL rather than pushing a frame).
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/trail$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('day 0 (ON): the primary opens the same opening episode the onboarding hop resolves', async ({ page }) => {
    await setSwitch(page, '1');
    await bootSignedIn(page);
    await page.goto('/app/trail');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await practiceTab(page).click({ force: true });
    await expect(lockSheet(page)).toBeVisible();
    await page.getByRole('button', { name: 'ابدأ أول محادثة' }).click();
    await expect(page).toHaveURL(/\/scenario\/airport_arrival\/story/);
  });

  test('ON: a Pro learner is not locked', async ({ page }) => {
    await setSwitch(page, '1');
    await bootSignedIn(page, { isPro: true });
    await page.goto('/app/trail');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(lockBadges(page)).toHaveCount(0);
    await practiceTab(page).click();
    await expect(page).toHaveURL(/\/app\/practice/);
    await expect(lockSheet(page)).toHaveCount(0);
  });

  test('ON: a learner whose free allowance is spent is not locked', async ({ page }) => {
    await setSwitch(page, '1');
    await bootSignedIn(page, { user: { freeSessionsRemaining: 0 } });
    await page.goto('/app/trail');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(lockBadges(page)).toHaveCount(0);
    await progressTab(page).click();
    await expect(page).toHaveURL(/\/app\/progress/);
    await expect(lockSheet(page)).toHaveCount(0);
  });

  test('ON: after a finished episode both tabs open normally', async ({ page }) => {
    await setSwitch(page, '1');
    await bootSignedIn(page, { history: true });
    await page.goto('/app/trail');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(lockBadges(page)).toHaveCount(0);
    await practiceTab(page).click();
    await expect(page).toHaveURL(/\/app\/practice/);
    await expect(lockSheet(page)).toHaveCount(0);
    await progressTab(page).click();
    await expect(page).toHaveURL(/\/app\/progress/);
    await expect(lockSheet(page)).toHaveCount(0);
  });

  test('OFF: no lock, no badge — today is the shipped screen', async ({ page }) => {
    await setSwitch(page, '0');
    await bootSignedIn(page);
    await page.goto('/app/trail');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(lockBadges(page)).toHaveCount(0);
    await practiceTab(page).click();
    await expect(page).toHaveURL(/\/app\/practice/);
    await expect(lockSheet(page)).toHaveCount(0);
  });
});
