import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, seedRows } from '../harness';

/**
 * Acceptance probe for the journey-polish brief — measures the rendered layout
 * instead of trusting an eyeball: the current node visible without scrolling at
 * 390x844, no horizontal clipping, unwrapped header chips, compact sections,
 * and 16:9 thumbnails where artwork exists.
 */

function reviewRow(promptAr: string, answerDe: string): Record<string, unknown> {
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

test.describe.configure({ mode: 'serial' });

test('layout probe at 390x844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
  const firstCard = page.getByRole('button', { name: /الطلب في المقهى/ }).first();
  await expect(firstCard).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);

  const metrics = await page.evaluate(() => {
    const box = (el: Element | null) => (el ? el.getBoundingClientRect().toJSON() : null);
    const byTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`);
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      // No horizontal clipping anywhere.
      scrollWidth: document.documentElement.scrollWidth,
      // Header chips: one line each (height ≈ one min-h-touch chip, not two).
      streakChip: box(byTestId('trail-streak-chip')),
      rankPill: box(byTestId('trail-rank-pill')),
      // Compact sections.
      rankCard: box(byTestId('trail-rank-card')),
      // The first path card and the timeline line.
      firstCard: box(document.querySelector('[data-testid="trail-path"] button')),
      line: box(document.querySelector('[data-testid="trail-path"] > div[aria-hidden]')),
      // Banner thumbnails are 16:9.
      banners: [...document.querySelectorAll('[data-testid="scenario-banner"]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(3) };
      }),
      // Glow count: only the current card may carry a purple glow.
      glows: [...document.querySelectorAll('.shadow-glow-purple')].length,
    };
  });

  expect(metrics.scrollWidth, 'no horizontal clipping').toBeLessThanOrEqual(metrics.viewport.w);
  expect(metrics.streakChip!.height, 'streak chip unwrapped').toBeLessThanOrEqual(44);
  expect(metrics.rankPill!.height, 'rank pill unwrapped').toBeLessThanOrEqual(44);
  expect(metrics.rankCard!.height, 'rank card collapsed (~72px)').toBeLessThanOrEqual(84);
  // The current node's card is visible without scrolling at 390x844.
  expect(metrics.firstCard!.top, 'first path card above the fold').toBeLessThan(metrics.viewport.h);
  expect(metrics.firstCard!.bottom, 'first path card fully visible').toBeLessThanOrEqual(metrics.viewport.h);
  // The timeline never crosses a card: it lives in the 40px node gutter.
  expect(metrics.line!.width).toBeLessThanOrEqual(4);
  for (const b of metrics.banners) {
    expect(b.h, 'thumbnail ≤120px').toBeLessThanOrEqual(120);
    expect(Math.abs(b.ratio - 16 / 9), `16:9 thumbnail (${b.w}x${b.h})`).toBeLessThan(0.05);
  }
  // Glow rule: at most one, and only a card can carry it. With reviews due the
  // mission is the review strip, so no path card is current — 0 is correct.
  expect(metrics.glows, 'at most one glow on the screen').toBeLessThanOrEqual(1);
  expect(metrics.glows, 'no glow while the review strip leads').toBe(0);

  // The rank card: collapsed and readable.
  const stripBox = await page.locator('[data-testid="trail-rank-card"]').boundingBox();
  expect(stripBox).toBeTruthy();
});

test('no reviews due: the current scenario card carries the one glow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootSignedIn(page);
  await page.goto('/app/library');
  const firstCard = page.getByRole('button', { name: /الطلب في المقهى/ }).first();
  await expect(firstCard).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);

  const metrics = await page.evaluate(() => ({
    glows: [...document.querySelectorAll('.shadow-glow-purple')].length,
    firstCardTop: document.querySelector('[data-testid="trail-path"] button')?.getBoundingClientRect().top ?? 9999,
  }));
  // The mission is a scenario now, so its card is the current node and the one
  // glow — visible without scrolling at 390x844.
  expect(metrics.glows).toBe(1);
  expect(metrics.firstCardTop).toBeLessThan(844);
});

test('review strip shows the agreeing count and the fixed subtitle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
  await expect(page.getByText('8 عناصر للمراجعة')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('حان وقت تثبيتها')).toBeVisible();
  // The duplicate tag is gone: «مراجعة اليوم» appears in the CTA only.
  await expect(page.getByText('مراجعة اليوم')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /راجع 8 عناصر الآن/ })).toBeVisible();
});
