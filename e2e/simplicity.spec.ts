import { expect, test } from '@playwright/test';
import { bootSignedIn, mockBackend } from './harness';

/**
 * V32 — stupid simple, proven in a browser.
 *
 * Each test here defends a decision the V32 audit measured on the real screens:
 * a quiz a learner could only escape by guessing, three input boxes on one
 * screen sharing a placeholder, six listen buttons that all announced the same
 * thing, a screen with no heading at all, and a first-run that would not open
 * until you typed a name nobody had asked you for.
 *
 * A unit test could assert the strings exist; only a browser can assert that a
 * learner can actually GET THROUGH.
 */

test.use({ viewport: { width: 360, height: 640 } });

test('the quiz can be finished without ever guessing an answer', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/cafe_order/quiz');
  await expect(page.getByTestId('quiz-options')).toBeVisible({ timeout: 30_000 });

  const escape = page.getByRole('button', { name: 'لا أعرف — أرني الإجابة' });
  await expect(escape).toBeVisible();

  const finished = page.getByText('أحسنت! أتممت الاختبار');

  // Walk the whole deck through the exit hatch alone — no option is ever tapped.
  //
  // After clicking «عرض النتيجة» the result screen has not rendered yet, and the
  // options container stays mounted while a question is revealed — so waiting on it
  // proves nothing about whether the next state arrived (it is visible on the very
  // question just answered). The loop then raced the finish and, on the last
  // question, waited forever for an escape button the finished deck never brings
  // back. That was the CI hang. The state really changed only when the escape hatch
  // returns (a fresh question) or the result screen appears (the deck ended), so
  // wait on exactly those two.
  for (let question = 0; question < 40; question += 1) {
    if (await finished.isVisible()) break;
    await escape.click();
    // The reveal must state the answer in words, not only tint one option green.
    await expect(page.getByText(/الصحيحة:/)).toBeVisible();
    await page.getByRole('button', { name: /السؤال التالي|عرض النتيجة/ }).click();
    await expect(escape.or(finished)).toBeVisible();
  }

  await expect(finished).toBeVisible({ timeout: 20_000 });
  // A revealed question is never counted as correct. Zero takes the plural form,
  // so this is «0 إجابة صحيحة» — the `arCount` output, not a bare "no".
  await expect(page.getByText(/نتيجتك: 0 إجابة/)).toBeVisible();
});

test('guided practice gives every input its own label', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/cafe_order/practice');
  await expect(page.getByText('قاعدة اليوم').first()).toBeVisible({ timeout: 30_000 });

  // The defect: two boxes on one screen both reading "Schreibe hier auf Deutsch…",
  // so there was no way to tell which answer went where without reading up.
  const placeholders = await page.evaluate(() =>
    [...document.querySelectorAll('input, textarea')]
      .map((el) => (el.getAttribute('placeholder') || '').trim())
      .filter(Boolean),
  );
  expect(placeholders.length).toBeGreaterThan(1);
  const duplicates = placeholders.filter((p, i) => placeholders.indexOf(p) !== i);
  expect(duplicates, `duplicate input placeholders: ${duplicates.join(' | ')}`).toEqual([]);
});

test('the study screen gives every listen button its own name', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/cafe_order/study');
  await expect(page.getByText('العبارات').first()).toBeVisible({ timeout: 30_000 });

  const names = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim())
      .filter((n) => n.includes('استمع')),
  );
  expect(names.length).toBeGreaterThan(1);
  // Six buttons all named "استمع إلى النطق" tell a screen-reader user nothing
  // about WHICH phrase they are about to hear.
  expect(new Set(names).size, `repeated listen labels: ${names.join(' | ')}`).toBe(names.length);
  for (const name of names) expect(name.length).toBeGreaterThan('استمع إلى النطق'.length);
});

test('Ask has a heading, and its example is something you can tap', async ({ page }) => {
  // `bootSignedIn` rather than a hand-rolled seed: the harness already knows to
  // wait for the app to finish seeding its own database before writing the user.
  await bootSignedIn(page);
  await page.goto('/app/ask');

  // A screen with no heading is a screen a screen reader cannot name.
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 });

  // The example used to exist only as a placeholder: readable, but not tappable,
  // and gone the moment you typed. It is a button now.
  const box = page.locator('textarea').first();
  await expect(box).toBeVisible();
  await page.getByRole('button', { name: 'جرّب مثالاً' }).click();
  await expect(box).not.toHaveValue('');
});

test('a learner can reach sign-in from /welcome without typing anything', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/welcome');
  const start = page.getByRole('button', { name: /ابدأ رحلتك الآن/ });
  await expect(start).toBeVisible({ timeout: 20_000 });
  // V32: the name used to be required, and the primary button stayed disabled
  // until it was typed — a free-text gate at the front door of the app.
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByRole('button', { name: /تابع|أكمل/ }).first()).toBeVisible({ timeout: 10_000 });
});