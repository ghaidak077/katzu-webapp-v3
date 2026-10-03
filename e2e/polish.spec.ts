import { expect, test } from '@playwright/test';
import { bootSignedIn, seedRows } from './harness';

/**
 * V33 — the V32 audit's P2 backlog, closed.
 *
 * The unit tests pin the source. Only a browser can prove what the audit
 * actually asked for: that a learner sees WHY a lesson is locked, that a skill
 * screen says which move comes next, and that Profile no longer opens as a wall
 * of equal controls.
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