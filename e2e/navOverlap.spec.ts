import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * G3 (launch polish): the floating tab bar must never cover the last content
 * on a main tab.
 *
 * The fix is `.kz-tab-scroll` (nav height + safe-area inset + 16px of reserved
 * padding-bottom on the screen roots). This spec measures the RESULT in a real
 * 360x740 viewport: scrolled to the very bottom, the bottom-most interactive
 * element of each main tab must sit fully above the tab bar's top edge (with a
 * 4px tolerance for borders) and actually receive a tap — visibility alone hid
 * the defect before, because Playwright's "visible" ignores the overlay.
 */

test.use({ viewport: { width: 360, height: 740 } });

/**
 * The bottom-most interactive element on each tab. `css` is a plain
 * querySelector string (page.evaluate is DOM, not Playwright); when the
 * element has no testid the test waits on `name` first and resolves the CSS
 * after, so Playwright-only pseudo-selectors are never needed.
 */
const LAST_ELEMENTS = [
  { tab: '/app/trail', css: '[data-testid="journey-level-chip"]' },
  // The vocabulary bank's browse button is the last control on the Practice tab.
  { tab: '/app/practice', css: 'div.rounded-2xl > button', name: 'تصفّح الكلمات' },
] as const;

async function bottomGap(page: Page, selector: string): Promise<{ gap: number; tappable: boolean }> {
  // Scroll the page itself to the very bottom, then ask the browser whether a
  // tap at the element's centre would hit THE ELEMENT (not the glass nav).
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { gap: -1, tappable: false };
    const rect = el.getBoundingClientRect();
    const nav = document.querySelector('nav.fixed');
    const navTop = nav ? nav.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
    const gap = navTop - rect.bottom;
    // elementFromPoint is the honest tap test: an overlay covering the centre
    // answers with itself, not with the element under the finger.
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const tappable = !!hit && (el === hit || el.contains(hit) || (hit instanceof Node && hit.contains(el)));
    return { gap, tappable };
  }, selector);
}

for (const { tab, css, name } of LAST_ELEMENTS) {
  test(`last element on ${tab} is fully visible and tappable at 360x740`, async ({ page }) => {
    await bootSignedIn(page);
    await page.goto(tab);
    // Resolve through Playwright first (name-based when there is no testid),
    // then measure the resolved element's own CSS inside the page.
    const target = name ? page.getByRole('button', { name }).first() : page.locator(css).first();
    await expect(target).toBeVisible({ timeout: 30_000 });
    const resolvedCss = name
      ? await target.evaluate((el) => {
          if (el.id) return `#${el.id}`;
          if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
          // Fall back to a positional path the page can re-find.
          const path: string[] = [];
          let node: Element | null = el;
          while (node && node !== document.body) {
            const parent: Element | null = node.parentElement;
            const index = parent ? Array.from(parent.children).indexOf(node) : 0;
            path.unshift(`${node.tagName.toLowerCase()}:nth-child(${index + 1})`);
            node = parent;
          }
          return path.join(' > ');
        })
      : css;

    const { gap, tappable } = await bottomGap(page, resolvedCss);
    // 4px tolerance: a hairline border may graze the nav's top edge without
    // the content being covered in any meaningful way.
    expect(gap, `bottom of the last element must clear the tab bar (gap ${gap}px)`).toBeGreaterThanOrEqual(4);
    expect(tappable, 'the element must receive a tap at its own centre').toBe(true);
  });
}
