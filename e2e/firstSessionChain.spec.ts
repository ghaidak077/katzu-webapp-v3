import { expect, test } from '@playwright/test';
import { bootSignedIn, readStoredUser, seedFinishedEpisode, seedStoreRow } from './harness';

/**
 * Step 2 — the first-session chain, in a browser.
 *
 * The claim under test is narrow and load-bearing: with `guidedHome` on, a new
 * learner's two answers lead *into the first episode*, not to a home screen that
 * asks them to choose again; and when they come back, the home tells the truth
 * about what is finished.
 *
 * Two states are staged on purpose, because they are two real learners: the
 * guided chain (the default in dev) and the same learner with the flag off, where
 * none of this may happen at all.
 *
 * The fallback for a device that has no arrival row lives in
 * `tests/openingScene.test.ts`: the app re-seeds that row on every launch, so the
 * state cannot be produced honestly in a browser — a pure resolver can be tested
 * for it instead, which is why the decision was extracted.
 *
 * 390×844: the narrowest rectangle the chain has to survive.
 */
test.use({ viewport: { width: 390, height: 844 } });

/** Answer the two first-run questions the way a learner does. */
async function answerPreferences(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /الحياة اليومية في ألمانيا/ }).click();
  await page.getByRole('button', { name: /20\s*دقائق/ }).click();
}

test('the questions end inside «لحظة الوصول», not on the home screen', async ({ page }) => {
  await bootSignedIn(page, { user: { onboardingCompletedAt: 0 } });
  await page.goto('/onboarding');
  await answerPreferences(page);

  await expect(page).toHaveURL(/\/scenario\/airport_arrival\/story$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('في المطار');
  // The episode's own action, not a second menu: the story opens the practice.
  await page.getByRole('button', { name: 'ابدأ التدريب' }).click();
  await expect(page).toHaveURL(/\/scenario\/airport_arrival\/practice$/);
});

test('the skip link ends the questions on the default minutes and still opens the episode', async ({ page }) => {
  await bootSignedIn(page, { user: { onboardingCompletedAt: 0 } });
  await page.goto('/onboarding');
  await page.getByRole('button', { name: /الحياة اليومية في ألمانيا/ }).click();

  // A third way past the preferences step that is not an answer: the app saves
  // the default 10 minutes and stops asking. It must not invent a goal.
  await page.getByRole('button', { name: 'تخطَّ الأسئلة وابدأ الآن' }).click();
  await expect(page).toHaveURL(/\/scenario\/[a-z_]+\/story$/);

  const stored = await readStoredUser(page);
  expect(stored?.dailyGoalMinutes).toBe(10);
  expect(typeof stored?.onboardingCompletedAt).toBe('number');
});

test('with the flag off the questions still end on the home screen', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kz.guidedHome', '0');
  });
  await bootSignedIn(page, { user: { onboardingCompletedAt: 0 } });
  await page.goto('/onboarding');
  await answerPreferences(page);

  await expect(page).toHaveURL(/\/app\/trail$/);
  await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
});

test('quitting after guided practice resumes on the home hero', async ({ page }) => {
  await bootSignedIn(page);
  // The state «أنا جاهز» writes: studied, never quizzed (the V2 chain has no quiz).
  await seedStoreRow(page, 'scenario_training', {
    scenarioId: 'cafe_order',
    userId: 'current_user',
    studiedAt: Date.now() - 60_000,
    quizAttempted: false,
    lastScore: 0,
    effectiveLevel: 'A1',
    updatedAt: Date.now() - 60_000,
  });
  await page.reload();

  await expect(page.getByRole('button', { name: 'أكمل من حيث توقفت' })).toBeVisible({ timeout: 30_000 });
});

test('a finished conversation is not offered again as “continue”', async ({ page }) => {
  await bootSignedIn(page);
  // The exact post-report state: a session row (the app writes one when the
  // conversation completes) plus the training row that still reads unquizzed.
  // Before step 2 this made the day-1 hero say «أكمل من حيث توقفت» forever.
  await seedFinishedEpisode(page, 'train_station');
  await page.reload();

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('أكمل من حيث توقفت')).toHaveCount(0);
});
