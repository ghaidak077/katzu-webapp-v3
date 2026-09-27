import { expect, test } from '@playwright/test';
import { bootSignedIn, readStoredUser } from './harness';

/**
 * Onboarding, as the first conversation with Katzu.
 *
 * The assertions are about structure and effect, not adjectives: one question per
 * screen, dots instead of a counter, and every answer visible in the stored
 * profile afterwards. The last one matters most — a question whose answer goes
 * nowhere is data collection dressed up as personalisation.
 */
test('Onboarding asks one question at a time and stores every answer', async ({ page }) => {
  await bootSignedIn(page, { user: { onboardingCompletedAt: 0 } });
  await page.goto('/onboarding');

  // Dots, not a fraction: no "سؤال 1 من 4" counter anywhere.
  await expect(page.getByRole('progressbar', { name: 'تقدم الأسئلة' })).toBeVisible();
  await expect(page.getByText(/سؤال \d من/)).toHaveCount(0);

  // Katzu's opening, and exactly one question on screen.
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByText('قبل أن نبدأ، عرّفني بنفسك')).toBeVisible();

  await expect(page.getByText('لماذا تتعلّم الألمانية؟')).toBeVisible();
  await page.getByRole('button', { name: /الحياة اليومية في ألمانيا/ }).click();

  await expect(page.getByText('وأين أنت الآن من ألمانيا؟')).toBeVisible();
  await page.getByRole('button', { name: 'أعيش في ألمانيا بالفعل' }).click();

  // The question that decides how the placement is offered.
  await expect(page.getByText('هل جرّبت الألمانية قبل اليوم؟')).toBeVisible();
  await page.getByRole('button', { name: /أستطيع إدارة محادثة بسيطة/ }).click();

  await expect(page.getByText('وكم دقيقة تستطيع أن تعطيني يومياً؟')).toBeVisible();
  await page.getByRole('button', { name: /20\s*دقائق/ }).click();

  await expect(page.getByText('هل هناك تاريخ تنتظره؟ (اختياري)')).toBeVisible();
  await page.getByRole('button', { name: 'لا يوجد تاريخ محدد' }).click();

  // Someone who already speaks some German is offered the measurement first —
  // that is the one decision the previous-experience answer is allowed to make.
  await expect(page.getByText(/دقيقتان من القياس قد توفّر/)).toBeVisible();
  await page.getByRole('button', { name: /ابدأ القياس/ }).click();
  await expect(page).toHaveURL(/\/placement$/);

  const stored = await readStoredUser(page);
  expect(stored?.primaryGoal).toBe('daily_life');
  expect(stored?.arrivalStatus).toBe('living_in_germany');
  expect(stored?.previousGerman).toBe('can_hold');
  expect(stored?.dailyGoalMinutes).toBe(20);
  expect(typeof stored?.onboardingCompletedAt).toBe('number');
  // A self-report never sets a level: only the placement check may do that.
  expect(stored?.cefrLevel).toBe('A1');
});

test('a first-timer is offered the start rather than pushed into the check', async ({ page }) => {
  await bootSignedIn(page, { user: { onboardingCompletedAt: 0 } });
  await page.goto('/onboarding');

  await page.getByRole('button', { name: /الحياة اليومية في ألمانيا/ }).click();
  await page.getByRole('button', { name: /ما زلت أستعد للسفر/ }).click();
  await page.getByRole('button', { name: /لم أجرّب الألمانية قبل/ }).click();
  await page.getByRole('button', { name: /10\s*دقائق/ }).click();
  await page.getByRole('button', { name: 'لا يوجد تاريخ محدد' }).click();

  await expect(page.getByText(/يمكنك أن تبدأ الآن مباشرة/)).toBeVisible();
  await page.getByRole('button', { name: /ابدأ من A1 مباشرة/ }).click();

  // Skipping leaves the level unmeasured, and the journey is where they land.
  await expect(page).toHaveURL(/\/app\/trail$/);
  const stored = await readStoredUser(page);
  expect(stored?.previousGerman).toBe('first_time');
  expect(typeof stored?.placementSkippedAt).toBe('number');
});
