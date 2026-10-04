import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * V36 — a screen a screen reader cannot name.
 *
 * The unit tests and `scripts/simplicity-check.mjs` read the SOURCE. That is
 * enough to catch a screen with no `<h1>`/`<h2>` at all, but it cannot see that
 * a heading is visually hidden, empty, or belongs to a state the learner never
 * reaches. So this spec measures the rendered DOM, on the two screens the audit
 * found genuinely unnamed plus the two error surfaces that rendered silently.
 *
 * Guided Practice and Quiz were both named by an `<h3>` that a static rule
 * accepted: a grammar title at line 304 of the practice screen, and a result
 * heading that only renders after the last question. A source grep saw both as
 * "has a heading". A browser does not.
 */

test.use({ viewport: { width: 360, height: 640 } });

/** The heading levels that actually name a page: h1 or h2, never h3. */
async function namedBy(page: Page, screen: string): Promise<string> {
  const text = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('h1, h2'));
    return nodes
      .map((node) => (node.textContent ?? '').trim())
      .filter((value) => value.length > 0)
      .join(' | ');
  });
  expect(text, `${screen} exposes no non-empty h1/h2`).not.toBe('');
  return text;
}

test('Guided Practice names itself, not just its grammar card', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/cafe_order/practice');
  await expect(page.getByRole('button', { name: /^استمع: / }).first()).toBeVisible({ timeout: 30_000 });
  expect(await namedBy(page, 'guided practice')).toContain('تدريب موجّه');
});

test('the Quiz screen is named while a question is on screen, not only at the end', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/cafe_order/quiz');
  const options = page.getByTestId('quiz-options');
  await expect(options).toBeVisible({ timeout: 30_000 });
  // Measured mid-quiz: the result screen's «أحسنت! أتممت الاختبار» is not rendered
  // here, so anything found now came from the question state itself.
  expect(await namedBy(page, 'quiz')).toContain('اختبار سريع');
});

test('a failed explanation is announced instead of only being drawn', async ({ page }) => {
  await bootSignedIn(page);
  // The real endpoint is `/ai/ask` (see `workerClient.askKatzu`). Registered after
  // `bootSignedIn`, so it takes priority over the harness's catch-all `**/*`.
  await page.route('**/ai/ask', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/app/ask');
  await page.getByPlaceholder(/الفرق بين/).fill('Was bedeutet das?');
  await page.getByRole('button', { name: 'اسأل' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(alert).toContainText('تعذّر الحصول على شرح');
  // The one next action a failure owes the learner.
  await expect(alert.getByRole('button', { name: 'أعد المحاولة' })).toBeVisible();
});

test('the tab title follows the route, so two tabs can be told apart', async ({ page }) => {
  await bootSignedIn(page);
  const seen = new Map<string, string>();
  for (const [path, expected] of [
    ['/app/trail', 'المهمة اليومية'],
    ['/app/grammar', 'القواعد'],
    ['/app/ask', 'اسأل كَاتْزُو'],
  ] as const) {
    await page.goto(path);
    await expect
      .poll(async () => page.evaluate(() => document.title), { timeout: 30_000 })
      .toContain(expected);
    expect(page.url()).not.toBe(seen.get(expected));
    seen.set(expected, page.url());
  }
});
