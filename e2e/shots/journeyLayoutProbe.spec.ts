import { expect, test } from '@playwright/test';
import { bootSignedIn, seedRows } from '../harness';
import { seedServedContent } from '../servedContent';

/**
 * Acceptance probe for the path screen — it measures the rendered layout at
 * 390×844 instead of trusting an eyeball.
 *
 * The screen this replaces carried four competing stories above the fold (rank,
 * CEFR tabs, mission strip, review chip), three-digit review counts, full-width
 * banners that pushed every situation below the fold, and an empty timeline
 * column. The contract now is the opposite, and each clause below is a number:
 *
 *   - exactly one primary action, always naming a situation;
 *   - review is a secondary row, capped at ten items, backlog in small text;
 *   - no rank card and no second progression system on the path;
 *   - at least three compact situation cards fully visible without scrolling;
 *   - locked levels say why they are locked;
 *   - on the profile, the XP text and the bar come from one calculation.
 */

const VIEWPORT = { width: 390, height: 844 };

function reviewRow(index: number): Record<string, unknown> {
  const answerDe = `Wort${index}`;
  return {
    userId: 'current_user',
    kind: 'vocab',
    refId: `vocab:${answerDe}`,
    sourceId: 5000 + index,
    promptAr: `كلمة ${index}`,
    answerDe,
    contextDe: `Ich lerne ${answerDe} heute.`,
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

test('the path at 390x844 answers "what now" with one primary action', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await bootSignedIn(page);
  await seedServedContent(page);
  await page.goto('/app/library');

  const cta = page.getByTestId('trail-primary-cta');
  await expect(cta).toBeVisible({ timeout: 30_000 });
  // One primary action, and it names the session rather than "review".
  await expect(cta).toHaveCount(1);
  await expect(cta).toContainText(/تابع|ابدأ جلسة اليوم/);
  await expect(page.getByTestId('trail-session-preview')).toBeVisible();

  // Rank moved to the profile; the path has one progression system.
  await expect(page.getByTestId('trail-rank-card')).toHaveCount(0);
  await expect(page.getByTestId('trail-rank-pill')).toHaveCount(0);

  await expect(page.getByTestId('trail-goal-ring')).toBeVisible();
  await expect(page.getByTestId('trail-level-card')).toBeVisible();
  await expect(page.getByTestId('trail-unit-map')).toBeVisible();
  // Wait for the unit's rows, not just the map: the card count is content, and
  // measuring while Dexie is still hydrating is a race, not a layout verdict.
  await expect(page.getByTestId('trail-scenario-card').nth(2)).toBeVisible();

  const metrics = await page.evaluate(() => {
    const vh = window.innerHeight;
    const box = (el: Element | null) => (el ? el.getBoundingClientRect().toJSON() : null);
    const cards = [...document.querySelectorAll('[data-testid="trail-scenario-card"]')];
    return {
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      cta: box(document.querySelector('[data-testid="trail-primary-cta"]')),
      firstCard: box(cards[0] ?? null),
      cardsAboveFold: cards.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= vh;
      }).length,
      cardWidths: cards.map((el) => Math.round(el.getBoundingClientRect().width)),
    };
  });

  expect(metrics.scrollWidth, 'no horizontal clipping').toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.cta!.bottom, 'primary action above the first card').toBeLessThan(metrics.firstCard!.top);
  expect(metrics.cardsAboveFold, 'at least three situations visible without scrolling').toBeGreaterThanOrEqual(3);
  for (const width of metrics.cardWidths) {
    expect(width, 'cards span the path width').toBeGreaterThanOrEqual(300);
  }
});

test('every card carries the three evidence stages', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await bootSignedIn(page);
  await seedServedContent(page);
  await page.goto('/app/library');

  const firstCard = page.getByTestId('trail-scenario-card').first();
  await expect(firstCard).toBeVisible({ timeout: 30_000 });
  const mastery = firstCard.getByTestId('trail-mastery');
  await expect(mastery).toContainText('دراسة');
  await expect(mastery).toContainText('مع مساعدة');
  await expect(mastery).toContainText('وحدك');
});

test('130 due reviews become a ten-item action with the backlog in small text', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await bootSignedIn(page);
  await seedRows(
    page,
    'review_items',
    Array.from({ length: 130 }, (_, index) => reviewRow(index)),
  );
  await page.goto('/app/library');

  const row = page.getByTestId('trail-review-row');
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText('مراجعة سريعة: 10 عناصر · 3 دقائق');
  await expect(page.getByText('+120 في الانتظار')).toBeVisible();
  // The primary action still leads and still names a situation.
  const cta = page.getByTestId('trail-primary-cta');
  await expect(cta).toContainText(/تابع|ابدأ جلسة اليوم/);
  const ctaBox = await cta.boundingBox();
  const rowBox = await row.boundingBox();
  expect(ctaBox!.y).toBeLessThan(rowBox!.y);
});

test('future units are dimmed, marked, and cannot be opened', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await bootSignedIn(page);
  await seedServedContent(page);
  await page.goto('/app/library');

  const headers = page.getByTestId('trail-unit-header');
  await expect(headers.first()).toBeVisible({ timeout: 30_000 });
  // The current unit is open; the next one may be opened; everything beyond it
  // is dimmed and disabled instead of a level picker.
  await expect(headers.first()).toHaveAttribute('aria-expanded', 'true');
  await expect(headers.nth(2)).toBeDisabled();
  await expect(headers.nth(2)).toHaveAttribute('aria-label', /مقفلة/);
});

test('the profile XP text and its bar share one calculation', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  // The fill animates from 0 to its target; read the settled value, not a frame
  // mid-transition (measured: one run read matrix(0.425856, …) at ~800 ms).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 800 XP sits in the third rung; the next rung opens at 1500 XP.
  await bootSignedIn(page, { user: { totalXp: 800, cefrLevel: 'A1' } });
  await page.goto('/app/profile');

  const card = page.getByTestId('profile-rank-card');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText('800 / 1500 XP');
  await expect(card).toContainText('الرتبة 3 من 6');

  const bar = card.getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-valuenow', '53');
  // 800 / 1500 = 53.3% → scaleX(0.53). Poll the settled computed matrix instead
  // of sampling one frame of the fill's transition.
  await expect
    .poll(async () => bar.locator('div').evaluate((el) => getComputedStyle(el).transform))
    .toBe('matrix(0.53, 0, 0, 1, 0, 0)');
});
