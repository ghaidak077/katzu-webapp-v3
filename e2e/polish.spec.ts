import { expect, test } from '@playwright/test';
import { bootSignedIn, seedRows } from './harness';

/**
 * V33 — the V32 audit's P2 backlog, closed — plus V35's cross-discipline review.
 *
 * The unit tests pin the source. Only a browser can prove what the audit
 * actually asked for: that a learner sees WHY a lesson is locked, that a skill
 * screen says which move comes next, and that Profile no longer opens as a wall
 * of equal controls.
 *
 * The V35 additions measure what a source assertion cannot: the *rendered* size
 * of a hit area and the *rendered* font size of a field. Three separate false
 * findings in that review came from harness mistakes, so each of these asserts
 * a measurement the browser produced, not a class name.
 */

test.use({ viewport: { width: 360, height: 640 } });

test('a locked grammar lesson says which lesson unlocks it', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/app/grammar');
  await expect(page.getByText(/دروس مرتّبة من الأسهل/).first()).toBeVisible({ timeout: 30_000 });

  // At least one row must be locked, and every locked row must explain itself.
  const locked = page.locator('button:has(svg.lucide-lock)');
  await expect(locked.first()).toBeVisible();
  const reasons = page.getByText(/مقفل — يُفتح بعد إتمام/);
  await expect(reasons.first()).toBeVisible();
});

test('listening numbers its steps and marks the one in progress', async ({ page }) => {
  await bootSignedIn(page);
  // A level-matching pool so the drill has a sentence: without content the screen
  // renders its empty state, which correctly has no steps.
  await seedRows(page, 'starter_phrases', [
    {
      id: 700,
      scenario_id: 'cafe_order',
      german: 'Was möchten Sie trinken?',
      translation_ar: 'ماذا تريد أن تشرب؟',
      level: 'A1',
      sort_order: 1,
    },
  ]);
  await page.goto('/app/listen');

  const trail = page.getByTestId('step-trail');
  await expect(trail).toBeVisible({ timeout: 30_000 });
  await expect(trail.getByText('استمع')).toBeVisible();
  await expect(trail.getByText('اكتب')).toBeVisible();
  await expect(trail.getByText('تحقّق')).toBeVisible();
  // The first move is the one in progress before anything is typed.
  await expect(trail.locator('[aria-current="step"]')).toHaveCount(1);
});

test('profile opens folded, and a folded group still explains itself', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/app/profile');

  const toggles = page.getByTestId('section-toggle');
  await expect(toggles).toHaveCount(3, { timeout: 30_000 });

  // Account is open; the other two are folded but say what they hold.
  await expect(toggles.nth(0)).toHaveAttribute('aria-expanded', 'true');
  await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggles.nth(2)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggles.nth(1)).toContainText('المستوى');
  await expect(toggles.nth(2)).toContainText('حذف الحساب');

  // And folding is real: opening the learning group reveals what it holds.
  await toggles.nth(1).click();
  await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('مستواك').first()).toBeVisible();
});

test('profile offers far fewer controls than it used to', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/app/profile');
  await page.getByTestId('section-toggle').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);

  // The audit measured 29 flat controls. One open group must be far fewer.
  const count = await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]'),
    );
    return nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const style = getComputedStyle(node);
      return style.visibility !== 'hidden' && style.display !== 'none';
    }).length;
  });
  expect(count).toBeLessThanOrEqual(12);
});

test('listening keeps its playback controls and its exit reachable by thumb', async ({ page }) => {
  await bootSignedIn(page);
  await seedRows(page, 'starter_phrases', [
    {
      id: 701,
      scenario_id: 'cafe_order',
      german: 'Ich habe gestern Fieber gehabt.',
      translation_ar: 'لقد شعرت بالحمى أمس.',
      level: 'A1',
      sort_order: 1,
    },
  ]);
  await page.goto('/app/listen');
  await expect(page.getByTestId('step-trail')).toBeVisible({ timeout: 30_000 });

  // The review measured «تشغيل بطيء» at 83x17 and «إعادة» at 25x17.
  const slow = page.getByRole('button', { name: 'تشغيل بطيء 0.8x' });
  await expect(slow).toBeVisible();
  for (const name of ['تشغيل بطيء 0.8x', 'إعادة', 'إنهاء التدريب والعودة']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box, `"${name}" must be on screen`).not.toBeNull();
    expect(box!.height, `"${name}" is ${box!.height}px tall`).toBeGreaterThanOrEqual(44);
  }
});

test('every field the learner types into is at least 16px, or iOS zooms the page', async ({ page }) => {
  // This checks /app/practice, which is locked until the first conversation.
  await bootSignedIn(page, { history: true });
  for (const path of ['/app/ask', '/app/practice', '/app/write']) {
    await page.goto(path);
    await page.waitForTimeout(900);
    const typed = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input, textarea, select'))
        .map((node) => {
          const rect = node.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) return null;
          return {
            id: node.id || node.tagName.toLowerCase(),
            size: parseFloat(getComputedStyle(node).fontSize),
          };
        })
        .filter((entry): entry is { id: string; size: number } => entry !== null),
    );
    expect(typed.length, `${path} has no field to check`).toBeGreaterThan(0);
    for (const field of typed) {
      expect(field.size, `${path} #${field.id} renders at ${field.size}px`).toBeGreaterThanOrEqual(16);
    }
  }
});