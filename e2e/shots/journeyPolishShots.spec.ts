import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, seedRows } from '../harness';

/**
 * Acceptance evidence for the Journey (library) screen polish.
 *
 * Real-viewport screenshots (never a full-page stitch) of the three states the
 * brief asks for: the top of the screen, the screen scrolled to the path, and
 * the 0-reviews state where the review strip gives way to the scenario mission.
 * `TAG` flips between `before` and `after`.
 *
 *   TAG=before E2E_TARGET=preview npx playwright test -c e2e/journeyPolishShots.playwright.config.ts
 */

const TAG = process.env.TAG === 'after' ? 'after' : 'before';
const OUT_DIR = join(process.cwd(), 'docs', 'agent', 'journey-polish');

const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 360, h: 640 },
] as const;

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const vp = page.viewportSize();
  const file = join(OUT_DIR, `${name}-${vp?.width}x${vp?.height}-${TAG}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

/** Eight due review items — the brief's «8 عناصر» example state. */
function reviewRow(promptAr: string, answerDe: string) {
  return {
    userId: 'current_user',
    kind: 'vocab',
    refId: `vocab:${answerDe}`,
    sourceId: 4242,
    promptAr,
    answerDe,
    contextDe: `Ich habe morgen ${answerDe.replace(/^der |die |das /, 'einen ')}.`,
    direction: 'ar_to_de',
    dueAt: 1,
    intervalDays: 1,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    reviews: 0,
    createdAt: 1,
  };
}

for (const { w, h } of VIEWPORTS) {
  test(`journey-library top ${w}x${h} [${TAG}]`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await bootSignedIn(page);
    await seedRows(page, 'review_items', [
      reviewRow('موعد', 'der Termin'),
      reviewRow('قهوة', 'der Kaffee'),
      reviewRow('فاتورة', 'die Rechnung'),
      reviewRow('خبز', 'das Brot'),
      reviewRow('تذكرة', 'die Fahrkarte'),
      reviewRow('طبيب', 'der Arzt'),
      reviewRow('شقة', 'die Wohnung'),
      reviewRow('سؤال', 'die Frage'),
    ]);
    await page.goto('/app/library');
    await expect(page.getByRole('button', { name: /الطلب في المقهى/ }).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await shoot(page, 'journey-library-top');
  });

  test(`journey-library path ${w}x${h} [${TAG}]`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await bootSignedIn(page);
    await page.goto('/app/library');
    await expect(page.getByRole('button', { name: /الطلب في المقهى/ }).first()).toBeVisible({ timeout: 30_000 });
    // Scroll so the path fills the frame.
    const firstCard = page.getByRole('button', { name: /الطلب في المقهى/ }).first();
    await firstCard.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(400);
    await shoot(page, 'journey-library-path');
  });

  test(`journey-library no reviews ${w}x${h} [${TAG}]`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await bootSignedIn(page);
    await page.goto('/app/library');
    await expect(page.getByRole('button', { name: /الطلب في المقهى/ }).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await shoot(page, 'journey-library-noreviews');
  });
}
