import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';

/**
 * VERIFY aid for the journey-polish brief: one contact sheet of the mascot
 * stickers in the asset set, so the pose choice for the review strip is made
 * from what the art actually shows. Saved as an artifact for the owner.
 */
test('mascot contact sheet', async ({ page }) => {
  const stickers = [
    'trail_header', 'peace', 'thumbs_up', 'celebrating',
    'listening', 'practice', 'trail_guide', 'word_insight',
  ];
  const html = `<html><body style="background:#111;display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:8px">
    ${stickers
      .map(
        (name) =>
          `<figure style="margin:0;text-align:center"><img src="/assets/mascot/katzu_${name}.png" style="width:110px;height:110px;object-fit:contain"><figcaption style="color:#ddd;font:11px sans-serif">${name}</figcaption></figure>`,
      )
      .join('')}
  </body></html>`;
  await page.setViewportSize({ width: 560, height: 300 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  mkdirSync(join(process.cwd(), 'docs', 'agent', 'journey-polish'), { recursive: true });
  const file = join(process.cwd(), 'docs', 'agent', 'journey-polish', 'mascot-contact-sheet.png');
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
});
