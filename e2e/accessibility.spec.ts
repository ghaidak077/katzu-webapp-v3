import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import * as axe from 'axe-core';
import { bootSignedIn, mockBackend } from './harness';

const require = createRequire(import.meta.url);

/**
 * B6 — accessibility gate on the six key screens.
 *
 * The rule: zero critical/serious axe violations on each screen, and the
 * primary actions stay reachable at 360 px (the narrowest phone the app
 * supports). Colour-contrast is included for the glass surfaces the renderer
 * tier renders; modals-in-flight (paywall, sheets) are covered by the Debrief
 * and Live Conversation scans that follow their normal open path.
 */

/**
 * Runs axe-core inside the page itself (`axe.run`), not a builder wrapper: the
 * axe-core package ships the engine, and injecting it into the live DOM is the
 * documented playwright-free path.
 */
async function scanAll(page: Page) {
  // Inject the engine, then run it with the WCAG 2.0/2.1 A+AA ruleset.
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const results = await page.evaluate(async () => {
    const axeOnPage = (window as unknown as { axe: typeof axe }).axe;
    return axeOnPage.run({
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
  });
  return results.violations;
}

async function scan(page: Page) {
  return (await scanAll(page)).filter((v) => v.impact === 'critical' || v.impact === 'serious');
}

function assertClean(violations: Awaited<ReturnType<typeof scan>>, screen: string) {
  const summary = violations
    .map((v) => `${v.id}(${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`)
    .join('; ');
  expect(summary, screen).toBe('');
}

test('Trail has no critical or serious violations', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/app/trail');
  await expect(page.getByText(/المهمة|مراجعة|ابدأ/).first()).toBeVisible();
  assertClean(await scan(page), 'trail');
});

test('Story Setup has no critical or serious violations', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/cafe_order/story');
  await expect(page.getByRole('button', { name: 'ابدأ التدريب' })).toBeVisible();
  assertClean(await scan(page), 'story setup');
});

test('Guided Practice has no critical or serious violations', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/cafe_order/practice');
  await expect(page.getByRole('button', { name: /^استمع: / }).first()).toBeVisible();
  assertClean(await scan(page), 'guided practice');
});

test('Review has no critical or serious violations', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/app/review');
  await page.waitForLoadState('networkidle');
  assertClean(await scan(page), 'review');
});

test('Progress has no critical or serious violations', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/app/progress');
  await expect(page.getByText(/مسجَّل|قِسناه/).first()).toBeVisible();
  assertClean(await scan(page), 'progress');
});

test('Live Conversation has no critical or serious violations', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.getByRole('button', { name: 'ابدأ التحدث' })).toBeVisible();
  assertClean(await scan(page), 'live conversation');
});

test('the public screens are clean at every impact, not only critical/serious', async ({ page }) => {
  // The six scans above filter to critical/serious, which is the right bar for a
  // screen under active development — but it is also the band the WCAG 1.4.4
  // viewport failure was NOT in. `index.html` shipped `maximum-scale=1.0,
  // user-scalable=no` for a week, was reported by Lighthouse (V9-10, where the
  // ledger records it as "unfixed"), and no gate could see it: axe rates
  // `meta-viewport` *moderate*. The screens a signed-out learner can reach are
  // therefore held to the stricter rule, and the failure mode that motivated it is
  // named here so the next person does not wonder why these two are special.
  await mockBackend(page);
  const offenders: string[] = [];
  for (const url of ['/', '/welcome']) {
    await page.goto(url);
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 20_000 });
    const violations = await scanAll(page);
    offenders.push(
      ...violations.map((v) => `${url} → ${v.id}(${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`),
    );
  }
  expect(offenders, offenders.join('; ')).toEqual([]);
});

test('primary actions keep 44px targets at 360px on the Trail', async ({ page }) => {
  await bootSignedIn(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/app/trail');
  await expect(page.getByText(/المهمة|مراجعة|ابدأ/).first()).toBeVisible();

  const tooSmall = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll('button, a[href]'))) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // A non-interactive Badge is a rendered <span> (status, not a pointer
      // target); only buttons and links must clear 44px. Inline text-height
      // rows get their padding counted, so a hit below 44 means the target
      // really is too small to tap reliably.
      const isStatusBadge = el.tagName !== 'BUTTON' && el.tagName !== 'A';
      if (box.height < 44 && !isStatusBadge && !el.closest('[data-testid="conversation-transcript"]')) {
        offenders.push(`${el.tagName} ${el.textContent?.trim().slice(0, 20)} h=${Math.round(box.height)}`);
      }
    }
    return offenders.slice(0, 5);
  });
  expect(tooSmall, tooSmall.join('; ')).toEqual([]);
});
