import { expect, test } from '@playwright/test';
import { bootSignedIn, readStoredUser } from './harness';

/**
 * Onboarding, as the first conversation with Katzu.
 *
 * A3 changed the shape: first-run asks exactly TWO questions (goal + daily
 * minutes) and lands on the mission; the arrival, previous-German and target-date
 * questions plus the placement offer moved to the debrief card. The edit screen
 * keeps the full set. The assertions are about structure and effect, not
 * adjectives — a question whose answer goes nowhere is data collection dressed up
 * as personalisation.
 */
test('first run asks two questions and lands on the mission', async ({ page }) => {
  await bootSignedIn(page, { user: { onboardingCompletedAt: 0 } });
  await page.goto('/onboarding');

  // Dots, not a fraction: no "سؤال 1 من 4" counter anywhere.
  await expect(page.getByRole('progressbar', { name: 'تقدم الأسئلة' })).toBeVisible();
  await expect(page.getByText(/سؤال \d من/)).toHaveCount(0);

  // Katzu's opening, and the first question.
  await expect(page.getByText('قبل أن نبدأ، عرّفني بنفسك')).toBeVisible();
  await expect(page.getByText('لماذا تتعلّم الألمانية؟')).toBeVisible();
  await page.getByRole('button', { name: /الحياة اليومية في ألمانيا/ }).click();

  // The second and LAST question. The moved questions must not appear on the
  // first-run path at all.
  await expect(page.getByText('وكم دقيقة تستطيع أن تعطيني يومياً؟')).toBeVisible();
  await expect(page.getByText('وأين أنت الآن من ألمانيا؟')).toHaveCount(0);
  await expect(page.getByText('هل جرّبت الألمانية قبل اليوم؟')).toHaveCount(0);
  await expect(page.getByText('هل هناك تاريخ تنتظره؟ (اختياري)')).toHaveCount(0);
  await expect(page.getByText('هل أقيس مستواك الآن؟')).toHaveCount(0);

  await page.getByRole('button', { name: /20\s*دقائق/ }).click();

  // Straight to the mission — never the placement check.
  await expect(page).toHaveURL(/\/app\/trail$/);

  const stored = await readStoredUser(page);
  expect(stored?.primaryGoal).toBe('daily_life');
  expect(stored?.dailyGoalMinutes).toBe(20);
  expect(typeof stored?.onboardingCompletedAt).toBe('number');
  // The level stays the A1 default: a first-run learner is never asked, so nothing
  // may be invented for them (the seeded 'preparing' arrival status is left as it
  // was — first-run does not ask or overwrite it).
  expect(stored?.cefrLevel).toBe('A1');
  // No implicit "skipped" either — the placement offer is still available later.
  // (The seeded value is 0; a first-run save must not stamp it with a timestamp.)
  expect(stored?.placementSkippedAt || 0).toBe(0);
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
