import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, mockBackend } from './harness';

/**
 * 200 % zoom / reflow (WCAG 1.4.10, AA).
 *
 * At 200 % zoom a 640 px-wide phone viewport becomes 320 CSS px, which is the
 * width the guideline names. The failure this guards is the one no screenshot
 * shows: a layout that is merely *wide* pushes the document into a second,
 * horizontal scroll direction, so a learner at 200 % has to pan sideways to read
 * a line — and on a phone that fight is usually lost.
 *
 * Measured on the document, not on inner scrollers: a transcript or a chip row
 * that scrolls on purpose is not a reflow bug.
 */

const NARROW = { width: 320, height: 640 };

/** The widest of the document's scroll sizes, and the viewport it should fit. */
async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: Math.max(doc.scrollWidth, document.body.scrollWidth),
      clientWidth: doc.clientWidth,
    };
  });
}

async function expectNoSidewaysScroll(page: Page, label: string) {
  // Layout settles a frame or two after the lazy shell chunk lands.
  await page.waitForTimeout(400);
  const { scrollWidth, clientWidth } = await horizontalOverflow(page);
  expect(
    scrollWidth,
    `${label} at 320 px: the document is ${scrollWidth} px wide inside ${clientWidth} px and has to be panned sideways`,
  ).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('200 % zoom (320 px reflow)', () => {
  test.use({ viewport: NARROW });

  test('the public pages reflow without sideways scrolling', async ({ page }) => {
    await mockBackend(page);
    for (const route of ['/', '/demo', '/welcome', '/trust/privacy']) {
      await page.goto(route);
      await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
      await expectNoSidewaysScroll(page, route);
    }
  });

  test('the signed-in screens reflow without sideways scrolling', async ({ page }) => {
    await bootSignedIn(page, { user: { cefrLevel: 'B1' } });
    for (const route of ['/app/trail', '/app/practice', '/app/progress', '/app/profile', '/mock']) {
      await page.goto(route);
      await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
      await expectNoSidewaysScroll(page, route);
    }
  });
});
