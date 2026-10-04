import { expect, test } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * V34, in a real browser.
 *
 * The unit suite proves the pointer-following specular and the beam's animation
 * driver are gone from the source. These two assertions prove it in the rendered
 * app, which is the only place the claim actually matters: on Journey Home, with
 * a real pointer, nothing about the page changes as the pointer crosses it.
 */

test('nothing on Journey Home follows the pointer', async ({ page }) => {
  await bootSignedIn(page);

  const surface = page.locator('.kz-surface').first();
  await expect(surface).toBeVisible();

  // The light direction is a token, not a value something writes per move.
  const readSpec = () =>
    surface.evaluate((node) => {
      const style = getComputedStyle(node);
      return { x: style.getPropertyValue('--kz-spec-x').trim(), inline: node.getAttribute('style') ?? '' };
    });

  const before = await readSpec();
  for (let index = 0; index < 60; index += 1) {
    await page.mouse.move(20 + index * 6, 140 + (index % 7) * 40);
  }
  const after = await readSpec();

  expect(after.x).toBe(before.x);
  expect(after.inline).not.toContain('--kz-spec-');

  // And the surface kept its material: the specular sheen is still painted, it
  // is simply lit from a fixed direction instead of a moving one.
  const background = await surface.evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(background).toContain('radial-gradient');
});

test('the ambient beam is painted once, not driven every frame', async ({ page }) => {
  await bootSignedIn(page);

  const beam = page.locator('[data-rim]').first();
  await expect(beam).toBeVisible();

  // The old driver wrote seventeen `--qw*` / `--qop-*` custom properties onto
  // this element thirty times a second, forever. A painted edge writes none.
  await page.waitForTimeout(1200);
  const driven = await beam.evaluate((node) =>
    Array.from(node.style).filter((name) => name.startsWith('--q')),
  );
  expect(driven, `ambient beam is still being driven: ${driven.join(', ')}`).toEqual([]);

  // The edge itself is still there — the visual claim is unchanged.
  const ring = await beam.evaluate((node) => getComputedStyle(node, '::after').backgroundImage);
  expect(ring).toContain('radial-gradient');
});