import { expect, test } from '@playwright/test';
import { bootSignedIn, mockBackend, readStoredUser, seedSignedInUser } from './harness';

/**
 * Onboarding, as the first conversation with Katzu.
 *
 * Phase 4 changed the shape again: first-run asks exactly ONE question (the
 * goal) and lands on the first episode; the daily minutes default to ten, and the
 * arrival, previous-German, target-date and placement questions moved to the
 * debrief card. The edit screen keeps the full set. The assertions are about
 * structure and effect, not adjectives — a question whose answer goes nowhere is
 * data collection dressed up as personalisation.
 */

/** Force the guided home on before the app's first load — the flag is cached per load. */
async function setSwitch(page: import('@playwright/test').Page, value: '1' | '0') {
  await page.addInitScript((flag) => {
    try {
      localStorage.setItem('kz.guidedHome', flag);
    } catch {
      /* storage disabled: the build default applies */
    }
  }, value);
}

test('first run asks one question and opens the opening episode', async ({ page }) => {
  await setSwitch(page, '1');
  await bootSignedIn(page, { user: { onboardingCompletedAt: 0 } });
  await page.goto('/onboarding');

  // Dots, not a fraction: no "سؤال 1 من 4" counter anywhere.
  await expect(page.getByRole('progressbar', { name: 'تقدم الأسئلة' })).toBeVisible();
  await expect(page.getByText(/سؤال \d من/)).toHaveCount(0);

  // Katzu's opening, and the only question.
  await expect(page.getByText('ما هدفك من الألمانية؟')).toBeVisible();
  await expect(page.getByText('لماذا تتعلّم الألمانية؟')).toBeVisible();
  await page.getByRole('button', { name: /لمّ الشمل/ }).click();

  // The click is the answer AND the ending: no second question, no placement
  // check, no home-screen card to decode first — straight into the first
  // episode's Story screen.
  await expect(page).toHaveURL(/\/scenario\/airport_arrival\/story$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('في المطار');
  await expect(page.getByText('وكم دقيقة تستطيع أن تعطيني يومياً؟')).toHaveCount(0);

  const stored = await readStoredUser(page);
  expect(stored?.primaryGoal).toBe('family');
  // The minutes question is gone from the first run: the default is written
  // rather than a number invented for the learner.
  expect(stored?.dailyGoalMinutes).toBe(10);
  expect(typeof stored?.onboardingCompletedAt).toBe('number');
  // The level stays the A1 default: a first-run learner is never asked, so nothing
  // may be invented for them (the seeded 'preparing' arrival status is left as it
  // was — first-run does not ask or overwrite it).
  expect(stored?.cefrLevel).toBe('A1');
  // No implicit "skipped" either — the placement offer is still available later.
  // (The seeded value is 0; a first-run save must not stamp it with a timestamp.)
  expect(stored?.placementSkippedAt || 0).toBe(0);
});

test('a stranger lands on the app and walks to the first mission', async ({ page }) => {
  await setSwitch(page, '1');
  // The launch path end to end, with the one seam the suite cannot cross made
  // explicit: Google's own sign-in cannot be driven from a test, so the harness
  // seeds exactly the session that button would have created, and everything
  // before and after that point is the real app. Without this, every other spec
  // starts inside the app and nothing checks that a stranger can get in.
  //
  // The marketing landing page lives on the separate site now, so the app's own
  // front door is `/welcome`. `/` still has to land there rather than showing a
  // dead end: old links and bookmarks reach the app, not a blank route.
  await mockBackend(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('تحدث الألمانية');
  await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();

  await seedSignedInUser(page, { onboardingCompletedAt: 0 });
  await page.goto('/onboarding');
  await page.getByRole('button', { name: /لمّ الشمل/ }).click();

  // The first episode, not the placement check, and nothing asked twice on the
  // way. Then one step further: the story's own action opens the practice.
  await expect(page).toHaveURL(/\/scenario\/airport_arrival\/story$/);
  await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
  await expect(page.getByText('وكم دقيقة تستطيع أن تعطيني يومياً؟')).toHaveCount(0);

  await page.getByRole('button', { name: 'ابدأ التدريب' }).click();
  await expect(page).toHaveURL(/\/scenario\/airport_arrival\/practice$/);
});

test('the edit flow keeps the full question set and stores every answer', async ({ page }) => {
  await bootSignedIn(page, { user: { onboardingCompletedAt: Date.now() } });
  await page.goto('/onboarding?mode=edit');

  await expect(page.getByText('تعديل التفضيلات')).toBeVisible();
  await page.getByRole('button', { name: /الحياة اليومية في ألمانيا/ }).click();
  await page.getByRole('button', { name: /أعيش في ألمانيا بالفعل/ }).click();
  await page.getByRole('button', { name: /أستطيع إدارة محادثة بسيطة/ }).click();
  await page.getByRole('button', { name: /20\s*دقائق/ }).click();

  // Edit mode ends on the target-date step, whose action is "حفظ التفضيلات"
  // (the first-run-only "no date" shortcut is not shown here).
  await page.getByRole('button', { name: /حفظ التفضيلات/ }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);

  const stored = await readStoredUser(page);
  expect(stored?.primaryGoal).toBe('daily_life');
  expect(stored?.arrivalStatus).toBe('living_in_germany');
  expect(stored?.previousGerman).toBe('can_hold');
  expect(stored?.dailyGoalMinutes).toBe(20);
});
