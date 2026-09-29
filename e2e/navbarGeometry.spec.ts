import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The bottom navbar's active-tab indicator is a measured shape, not a picture.
 *
 * The pre-V19 bug this pins: the container was a 28px-radius glass rectangle
 * with `overflow: visible`, and the active tab painted its own `rounded-2xl`
 * tint inside it — so the highlight's corners clashed with the container's, at
 * every width, in both directions. The V19 fix renders ONE pill from the
 * container itself (`GlassEffectContainer`), sized by the inner-radius rule
 * (radius 27 = container 28 − the 1px optical edge), clipped by the container.
 *
 * These assertions are geometry, so they cannot be fooled by a screenshot that
 * happens to look right: the pill must sit inside the container, the container
 * must clip, and the pill's radius must equal the container's minus its inset.
 */

const TABS = [
  { label: 'الرحلة', name: 'Trail' },
  { label: 'التدريب', name: 'Practice' },
  { label: 'التقدم', name: 'Progress' },
  { label: 'الملف', name: 'Profile' },
] as const;

interface Geometry {
  container: { width: number; height: number; overflow: string; radius: number };
  pill: { width: number; height: number; radius: number; gaps: { left: number; right: number; top: number; bottom: number } } | null;
  btnAlignsWithPill: boolean | null;
}

async function readNavbar(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav.fixed');
    if (!nav) throw new Error('navbar not mounted');
    const host = nav.querySelector('[data-glass-container]');
    if (!host) throw new Error('glass container not mounted');
    const hostRect = host.getBoundingClientRect();
    const hostStyle = getComputedStyle(host);
    const pill = host.querySelector(':scope > div[data-glass-pill]');
    const pillRect = pill ? pill.getBoundingClientRect() : null;
    const btn = nav.querySelector('[aria-current="page"]') ?? null;
    const btnRect = btn ? btn.getBoundingClientRect() : null;
    const r = (v: number) => Math.round(v * 10) / 10;
    return {
      container: {
        width: r(hostRect.width),
        height: r(hostRect.height),
        overflow: hostStyle.overflow,
        radius: parseFloat(hostStyle.borderRadius),
      },
      pill: pillRect
        ? {
            width: r(pillRect.width),
            height: r(pillRect.height),
            radius: parseFloat(pill ? getComputedStyle(pill).borderRadius : '0'),
            gaps: {
              left: r(pillRect.left - hostRect.left),
              right: r(hostRect.right - pillRect.right),
              top: r(pillRect.top - hostRect.top),
              bottom: r(hostRect.bottom - pillRect.bottom),
            },
          }
        : null,
      btnAlignsWithPill: pillRect && btnRect
        ? Math.abs(btnRect.left - pillRect.left) < 0.75 &&
          Math.abs(btnRect.top - pillRect.top) < 0.75 &&
          Math.abs(btnRect.width - pillRect.width) < 0.75 &&
          Math.abs(btnRect.height - pillRect.height) < 0.75
        : null,
    };
  });
}

test.describe('navbar indicator geometry', () => {
  for (const width of [390, 360]) {
    test(`the active pill is concentric with the container at ${width}px (every tab, RTL)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await bootSignedIn(page);
      await page.goto('/app/trail');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      for (const tab of TABS) {
        await page.getByRole('button', { name: tab.label }).first().click();
        await expect(page.locator(`nav.fixed [aria-current="page"]`)).toHaveCount(1);

        const g = await readNavbar(page);
        // The container clips its children — no pill corner can overhang.
        expect(g.container.overflow, 'the container must clip its children').toBe('hidden');
        // One highlight: the container's pill, and it covers the active button
        // exactly (equal inset on all sides would also pass, but the tab bar's
        // design is a full-height segment, so the pill fills the cell).
        expect(g.pill, `a pill exists for ${tab.name}`).not.toBeNull();
        expect(g.btnAlignsWithPill, `the highlight is exactly on ${tab.name}`).toBe(true);
        // Inner-radius rule: pill radius = container radius − inset. The pill is
        // a full-height cell (inset 0), so its radius must be within 1px of the
        // container's — the pre-V19 values (18px pill in a 28px container) were
        // the visible clash.
        expect(g.container.radius - g.pill!.radius, `concentric radius for ${tab.name}`).toBeLessThanOrEqual(1.01);
        expect(g.pill!.radius, `no sharp-cornered pill for ${tab.name}`).toBeGreaterThanOrEqual(20);
        // No overhang: the pill never leaves the container.
        expect(g.pill!.gaps.left).toBeGreaterThanOrEqual(-0.01);
        expect(g.pill!.gaps.right).toBeGreaterThanOrEqual(-0.01);
        expect(g.pill!.gaps.top).toBeGreaterThanOrEqual(-0.01);
        expect(g.pill!.gaps.bottom).toBeGreaterThanOrEqual(-0.01);
      }
    });
  }

  test('the indicator mirrors correctly in LTR and stays inside the container', async ({ page }) => {
    await bootSignedIn(page);
    await page.goto('/app/trail');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Force LTR: the app is Arabic-first, but the geometry must not depend on it.
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'ltr'));
    await page.getByRole('button', { name: 'الرحلة' }).first().click();

    const g = await readNavbar(page);
    expect(g.pill).not.toBeNull();
    expect(g.btnAlignsWithPill).toBe(true);
    // In LTR the first tab sits at the inline-start edge; in RTL it sits at the
    // other end. What must hold in both: the pill is flush with one end, inside
    // the container, and concentric.
    const flush =
      Math.min(g.pill!.gaps.left, g.pill!.gaps.right) <= 0.01;
    expect(flush, 'the pill sits against one end of the container').toBe(true);
    expect(g.container.radius - g.pill!.radius).toBeLessThanOrEqual(1.01);
  });

  test('switching tabs does not animate the pill (instant switch)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await bootSignedIn(page);
    await page.goto('/app/trail');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'التدريب' }).first().click();
    await expect(page.locator('nav.fixed [aria-current="page"]')).toHaveCount(1);
    // Wait for the pill to reach Practice (the second tab; the page is RTL, so
    // from the container's right edge that is one tab width in).
    // This waits out React's commit, not an animation — with the old 320ms FLIP
    // the pill is already at its final `left` here, offset by a transform.
    await expect
      .poll(async () => {
        const g = await readNavbar(page);
        return g.pill ? Math.min(g.pill.gaps.left, g.pill.gaps.right) : -1;
      })
      .toBe(93.5);

    // The morph proof: a travelling pill offsets its final position with a
    // transform for MORPH_MS (320ms). The fixed pill never carries one.
    const transform = await page.evaluate(() => {
      const pill = document.querySelector('nav.fixed [data-glass-pill]');
      return pill ? getComputedStyle(pill).transform : 'missing';
    });
    expect(transform, 'the pill must not be mid-FLIP').toBe('none');

    // And its position is stable: two reads, same place.
    const a = await readNavbar(page);
    const b = await readNavbar(page);
    expect(b.pill!.gaps).toEqual(a.pill!.gaps);
  });
});
