import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The bottom tab bar is a BAR, and these assertions are the contract.
 *
 * It used to be a floating glass pill with a travelling indicator
 * (`GlassEffectContainer`, V19). The home/path redesign moved both main tabs to
 * one flat language, and the bar went with them: it is now the bottom edge of
 * the screen — full-bleed inside the app's column, flush with the bottom, one
 * hairline divider along its top, and blur reading the content that scrolls
 * under it. Nothing floats and nothing travels.
 *
 * Geometry, not pictures: the browser is asked for the real computed box, the
 * real border, and the two real ink colours, so a screenshot that happens to
 * look right cannot pass this.
 */

const TABS = [
  { label: 'الرحلة', name: 'Trail' },
  { label: 'التدريب', name: 'Practice' },
  { label: 'التقدم', name: 'Progress' },
  { label: 'الملف', name: 'Profile' },
] as const;

/** Is this computed colour the accent (180 160 255), allowing engine rounding? */
function isAccent(color: string): boolean {
  const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length < 3) return false;
  const accent = [180, 160, 255];
  return channels.every((channel, index) => Math.abs(channel - accent[index]) <= 4);
}

/** Force the guided home on before the app's first load — the flag is cached per load. */
async function setSwitch(page: Page, value: '1' | '0') {
  await page.addInitScript((flag) => {
    try {
      localStorage.setItem('kz.guidedHome', flag);
    } catch {
      /* storage disabled: the build default applies */
    }
  }, value);
}

interface BarShape {
  nav: {
    top: number;
    bottom: number;
    width: number;
    radius: number;
    borderTopWidth: number;
    borderTopColor: string;
    background: string;
    backdrop: string;
  };
  targets: Array<{ label: string; width: number; height: number; current: boolean; color: string }>;
  activeCount: number;
  pillPresent: boolean;
}

async function readBar(page: Page): Promise<BarShape> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav.fixed');
    if (!nav) throw new Error('navbar not mounted');
    const navStyle = getComputedStyle(nav);
    const navRect = nav.getBoundingClientRect();
    const round = (v: number) => Math.round(v * 10) / 10;
    const buttons = Array.from(nav.querySelectorAll('button'));
    return {
      nav: {
        top: round(navRect.top),
        bottom: round(navRect.bottom),
        width: round(navRect.width),
        radius: parseFloat(navStyle.borderTopLeftRadius),
        borderTopWidth: parseFloat(navStyle.borderTopWidth),
        borderTopColor: navStyle.borderTopColor,
        background: navStyle.backgroundColor,
        backdrop: navStyle.backdropFilter,
      },
      targets: buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          label: (button.textContent ?? '').trim(),
          width: round(rect.width),
          height: round(rect.height),
          current: button.getAttribute('aria-current') === 'page',
          color: getComputedStyle(button).color,
        };
      }),
      activeCount: nav.querySelectorAll('[aria-current="page"]').length,
      pillPresent: Boolean(nav.querySelector('[data-glass-pill]')),
    };
  });
}

test.describe('tab bar contract', () => {
  for (const width of [390, 360]) {
    test(`flat bar at ${width}px: flush, hairline divider, four thumbs, one active tab`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      // Measures all four tabs switching, so it needs the finished conversation
      // that opens Practice and Progress — otherwise the taps open the lock
      // sheet and only Trail is ever measured.
      await bootSignedIn(page, { history: true });
      await page.goto('/app/trail');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // The tab's ink animates (`transition-colors`). Measuring a mid-transition
      // frame would read a blend of the muted ink and the accent — a number that
      // is neither — so the end state is what this spec measures: transitions
      // are flattened to zero here, and nowhere else.
      await page.addStyleTag({
        content: '*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }',
      });

      const shape = await readBar(page);

      // The bar IS the bottom edge: flush with the viewport, not a pill floating
      // above it. A 1px tolerance covers sub-pixel rounding.
      expect(Math.abs(shape.nav.bottom - 780), 'flush with the viewport bottom').toBeLessThanOrEqual(1);
      expect(shape.nav.radius, 'the bar is not a rounded pill').toBeLessThanOrEqual(1);
      // The divider is one hairline, and it is drawn (a colour, not transparent).
      expect(shape.nav.borderTopWidth, 'a 1px top divider').toBeGreaterThanOrEqual(0.9);
      expect(shape.nav.borderTopWidth, 'one pixel, not a frame').toBeLessThanOrEqual(1.1);
      expect(shape.nav.borderTopColor).not.toContain('rgba(0, 0, 0, 0)');
      // The material: a translucent canvas with blur behind it, so content
      // scrolling under the bar reads through instead of vanishing behind a slab.
      expect(shape.nav.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(shape.nav.backdrop).toContain('blur');
      // Four targets, each at least 44px in both directions (WCAG 2.5.8), and no
      // leftover travelling pill.
      expect(shape.targets).toHaveLength(TABS.length);
      for (const target of shape.targets) {
        expect(target.height, `${target.label} is a thumb target`).toBeGreaterThanOrEqual(44);
        expect(target.width, `${target.label} is a thumb target`).toBeGreaterThanOrEqual(44);
      }
      expect(shape.pillPresent, 'no travelling pill').toBe(false);

      for (const tab of TABS) {
        await page.getByRole('button', { name: tab.label }).first().click();
        await expect(page.locator('nav.fixed [aria-current="page"]')).toHaveCount(1);

        const after = await readBar(page);
        expect(after.activeCount, `exactly one active tab for ${tab.name}`).toBe(1);
        // The active tab is the accent, and it is the ONLY accent one: the other
        // three carry muted ink. `--kz-lavender` is 180 160 255.
        const active = after.targets.filter((target) => target.current);
        expect(active, `one accent tab for ${tab.name}`).toHaveLength(1);
        expect(isAccent(active[0].color), `the active tab is the accent: ${active[0].color}`).toBe(true);
        for (const target of after.targets.filter((t) => !t.current)) {
          expect(isAccent(target.color), `inactive tabs are muted, not accent: ${target.color}`).toBe(false);
        }
        // Switching tabs never changes the bar's own box: there is no pill to
        // travel, so nothing about the surface may move.
        expect(after.nav.top, 'the bar does not move when the tab changes').toBe(shape.nav.top);
        expect(after.nav.bottom).toBe(shape.nav.bottom);
      }
    });
  }

  test('every tab keeps a visible label, so the bar is never four bare glyphs', async ({ page }) => {
    await bootSignedIn(page);
    await page.goto('/app/trail');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    for (const tab of TABS) {
      const label = page.locator('nav.fixed').getByText(tab.label, { exact: true });
      await expect(label, `${tab.name} is named in the bar`).toBeVisible();
    }
  });

  test('day 0: tapping a locked tab opens the sheet and the bar never moves', async ({ page }) => {
    // No history: this is the "before the first conversation" state the lock is
    // about. Tapping التدريب must neither navigate nor change the active tab.
    await setSwitch(page, '1');
    await page.setViewportSize({ width: 390, height: 780 });
    await bootSignedIn(page);
    await page.goto('/app/trail');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect(page.locator('nav.fixed [aria-current="page"]')).toHaveCount(1);
    const before = await readBar(page);

    // The locked tab is `aria-disabled` (never the native disabled attribute, so
    // a tap still opens the sheet), which blocks Playwright's actionability wait
    // — force the click so the app's own guard is the one that answers it.
    await page.getByRole('button', { name: 'التدريب' }).first().click({ force: true });

    // The lock sheet explains why, instead of navigating.
    await expect(page.getByRole('heading', { name: 'هذا القسم يفتح بعد أول محادثة' })).toBeVisible();
    // Still exactly one active tab, still Trail — the tap was a peek.
    await expect(page.locator('nav.fixed [aria-current="page"]')).toHaveCount(1);
    expect(page.url()).toContain('/app/trail');

    const after = await readBar(page);
    expect(after.nav).toEqual(before.nav);
    expect(after.targets.find((target) => target.current)?.label).toBe(before.targets.find((target) => target.current)?.label);
  });
});
