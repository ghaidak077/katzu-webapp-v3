import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The locked grammar path (V28 Stage 2B), driven in a real browser.
 *
 * The app is signed in at A1, and its seeded fixture grammar rows are all A1, so
 * the path starts at lesson 1 of 4 with everything after it locked. The test then
 * earns the unlock the only honest way: a qualifying attempt in one session is NOT
 * enough, so it takes a second, separate session — exactly the rule the pure
 * `lessonState` encodes.
 */

const FIRST_LESSON_TITLE = 'أدوات التعريف والتنكير';
const SECOND_LESSON_TITLE = 'الطلب والاستفسار';
/** The first lesson's own example sentence; all three generated exercises check it. */
const FIRST_SENTENCE = 'Der Kaffee ist lecker. Die Milch ist frisch. Das Wasser ist kalt.';

const nextButton = (page: Page, order: number) =>
  page.getByRole('button', { name: new RegExp(`^تابع: الدرس ${order}`) });

/** A lesson row on the path list — anchored by its order number so it cannot be
 * confused with the "تابع" button, which also carries the lesson title. */
const lessonRow = (page: Page, order: number, title: string) =>
  page.getByRole('button', { name: new RegExp(`^${order} A1 ${title}`) });

/** Answers the three own-exercises of the open lesson and submits one attempt. */
async function completeSession(page: Page): Promise<void> {
  const inputs = page.getByPlaceholder('اكتب بالألمانية');
  await expect(inputs).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) await inputs.nth(index).fill(FIRST_SENTENCE);

  const checks = page.getByRole('button', { name: 'تحقّق' });
  for (let index = 0; index < 3; index += 1) await checks.nth(index).click();

  const submit = page.getByRole('button', { name: 'أنهيت التمارين — احسب محاولتي' });
  await expect(submit).toBeEnabled();
  await submit.click();
}

test('the path opens lesson 1 and locks everything after it', async ({ page }) => {
  await bootSignedIn(page);

  await page.goto('/app/grammar');
  await expect(page.getByRole('heading', { name: 'مسار القواعد' })).toBeVisible();
  await expect(page.getByText(/أكملت 0 من 4/)).toBeVisible();

  // Lesson 1 is the one obvious next action, and it is not a dead end.
  const next = nextButton(page, 1);
  await expect(next).toBeVisible();
  await next.click();
  await expect(page.getByText(FIRST_LESSON_TITLE).first()).toBeVisible();

  // Back on the path: lesson 2 is present but locked, so it cannot be opened.
  await page.getByRole('button', { name: 'كل الدروس' }).click();
  await expect(lessonRow(page, 2, SECOND_LESSON_TITLE)).toBeDisabled();
});

test('one session is not enough; a second session passes lesson 1 and unlocks lesson 2', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/app/grammar');

  // Session 1: a perfect run, but a single sitting never passes a lesson.
  await nextButton(page, 1).click();
  await completeSession(page);
  await expect(page.getByText(/محاولة ناجحة/)).toBeVisible();
  await expect(page.getByText(/تحتاج محاولة ناجحة أخرى في جلسة منفصلة/)).toBeVisible();

  await page.getByRole('button', { name: 'كل الدروس' }).click();
  await expect(lessonRow(page, 2, SECOND_LESSON_TITLE)).toBeDisabled();

  // Session 2: same lesson, a new sitting — this is what a pass requires.
  await nextButton(page, 1).click();
  await completeSession(page);
  await expect(page.getByText(/أتممت هذا الدرس/)).toBeVisible();

  // The next lesson is now open, both in the lesson view and on the path.
  await expect(page.getByRole('button', { name: /^الدرس التالي:/ })).toBeVisible();
  await page.getByRole('button', { name: 'كل الدروس' }).click();
  await expect(page.getByText(/أكملت 1 من 4/)).toBeVisible();
  await expect(lessonRow(page, 2, SECOND_LESSON_TITLE)).toBeEnabled();
  await expect(nextButton(page, 2)).toBeVisible();
});
