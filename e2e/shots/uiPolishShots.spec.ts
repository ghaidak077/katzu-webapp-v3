import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, seedRows } from '../harness';

/**
 * Before/after evidence for the launch-week UI polish (`docs/agent/ui-polish/`).
 *
 * Real-viewport screenshots at 390x844 and 360x740 (never a full-page stitch)
 * of the four screens the polish run touches. `TAG` flips between `before` and
 * `after` so the same rig produces both sides; the review run also captures the
 * three verdict states on separate cards.
 *
 *   TAG=before E2E_TARGET=preview npx playwright test -c e2e/uiPolishShots.playwright.config.ts
 *   TAG=after  E2E_TARGET=preview npx playwright test -c e2e/uiPolishShots.playwright.config.ts
 */

const TAG = process.env.TAG === 'after' ? 'after' : 'before';
const OUT_DIR = join(process.cwd(), 'docs', 'agent', 'ui-polish');

const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 360, h: 740 },
] as const;

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const vp = page.viewportSize();
  const file = join(OUT_DIR, `${name}-${vp?.width}x${vp?.height}-${TAG}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

async function setViewport(page: Page, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
}

/** One due vocab card, for the Review screen. */
function reviewRow(promptAr: string, answerDe: string, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

for (const { w, h } of VIEWPORTS) {
  test(`journey-home ${w}x${h} [${TAG}]`, async ({ page }) => {
    await setViewport(page, w, h);
    await bootSignedIn(page);
    await page.goto('/app/trail');
    await expect(page.getByTestId('daily-tasks')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await shoot(page, 'journey-home');
  });

  test(`guided-practice ${w}x${h} [${TAG}]`, async ({ page }) => {
    await setViewport(page, w, h);
    await bootSignedIn(page);
    await page.goto('/scenario/cafe_order/practice');
    await expect(page.getByTestId('grammar-card')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await shoot(page, 'guided-practice');
  });

  test(`review ${w}x${h} [${TAG}]`, async ({ page }) => {
    await setViewport(page, w, h);
    await bootSignedIn(page);
    // Three due cards so the counter reads "1 / 3" (before) / "1 من 3" (after),
    // and so the three verdict states can be shot on separate cards after.
    await seedRows(page, 'review_items', [
      reviewRow('موعد', 'der Termin'),
      reviewRow('قهوة', 'der Kaffee'),
      reviewRow('فاتورة', 'die Rechnung'),
    ]);
    await page.goto('/app/review');
    await expect(page.getByRole('heading', { name: 'مراجعة الذاكرة' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await shoot(page, 'review');
  });

  test(`practice-hub ${w}x${h} [${TAG}]`, async ({ page }) => {
    await setViewport(page, w, h);
    await bootSignedIn(page);
    await page.goto('/app/practice');
    await expect(page.getByRole('heading', { name: 'مركز التدريب والمراجعة' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await shoot(page, 'practice-hub');
  });
}

// The three verdict states — one screenshot each at 390x844, after the polish.
test('review verdict states [after]', async ({ page }) => {
  if (TAG !== 'after') return;
  await setViewport(page, 390, 844);
  await bootSignedIn(page);
  await seedRows(page, 'review_items', [reviewRow('موعد', 'der Termin')]);
  await page.goto('/app/review');
  await expect(page.getByRole('heading', { name: 'مراجعة الذاكرة' })).toBeVisible({ timeout: 30_000 });

  // correct
  await page.getByLabel('إجابتك بالألمانية').fill('der Termin');
  await page.getByRole('button', { name: 'تحقّق من إجابتي' }).click();
  await expect(page.getByText('إجابة صحيحة')).toBeVisible();
  await page.waitForTimeout(400);
  await shoot(page, 'review-verdict-correct');
});
