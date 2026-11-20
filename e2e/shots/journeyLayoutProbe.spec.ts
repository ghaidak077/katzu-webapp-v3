import { expect, test } from '@playwright/test';
import { bootSignedIn, seedRows } from '../harness';
import { seedServedContent } from '../servedContent';

/**
 * Acceptance probe for the path screen — it measures the rendered layout at
 * 390×844 instead of trusting an eyeball.
 *
 * The screen this replaces carried four competing stories above the fold (rank,
 * CEFR tabs, mission strip, review chip), a «0 / 20» goal ring, three-digit
 * review counts, full-width banners that pushed every situation below the fold,
 * and an empty timeline column. The contract now is the opposite, and each
 * clause below is a number:
 *
 *   - a header that greets and holds one streak, nothing to score;
 *   - exactly one primary action, on the hero, naming a situation;
 *   - review is a secondary row, capped at ten items, backlog in small text;
 *   - no rank card and no second progression system on the path;
 *   - at least three timeline rows fully visible without scrolling;
 *   - a row opens its three stages and starts the recommended one;
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
  // One primary action, and it starts the recommended stage of a situation.
  await expect(cta).toHaveCount(1);
  await expect(cta).toHaveText(/ابدأ|حدّث المشاهد/);
  await expect(cta).toHaveAttribute('aria-label', /ابدأ .+ — (دراسة|مع مساعدة|وحدك)/);
  await expect(page.getByTestId('trail-session-preview')).toBeVisible();

  // The header greets by name and holds one streak chip; the «0 / 20» ring is
  // gone because progress lives on the profile.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('أهلاً');
  await expect(page.getByTestId('trail-streak-chip')).toHaveCount(1);
  await expect(page.getByTestId('trail-goal-ring')).toHaveCount(0);

  // Rank moved to the profile; the path has one progression system.
  await expect(page.getByTestId('trail-rank-card')).toHaveCount(0);
  await expect(page.getByTestId('trail-rank-pill')).toHaveCount(0);
  await expect(page.getByTestId('trail-level-card')).toHaveCount(0);

  await expect(page.getByTestId('trail-unit-map')).toBeVisible();
  await expect(page.getByTestId('trail-level-line')).toBeVisible();
  // Wait for the unit's rows, not just the map: the row count is content, and
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
  expect(metrics.cta!.bottom, 'primary action above the first row').toBeLessThan(metrics.firstCard!.top);
  expect(metrics.cardsAboveFold, 'at least three situations visible without scrolling').toBeGreaterThanOrEqual(3);
  for (const width of metrics.cardWidths) {
    expect(width, 'rows span the path width').toBeGreaterThanOrEqual(300);
  }
});

test('a row opens its three stages and starts the recommended one', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await bootSignedIn(page);
  await seedServedContent(page);
  await page.goto('/app/library');

  const firstRow = page.getByTestId('trail-scenario-card').first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });
  // The stage the evidence supports is in the row's name, and the visual meter
  // keeps its three segments without repeating the words.
  await expect(firstRow).toHaveAttribute('aria-label', /— (دراسة|مع مساعدة|وحدك)/);
  await expect(firstRow.getByTestId('trail-stage-segment')).toHaveCount(3);

  await firstRow.click();
  const start = page.getByTestId('trail-sheet-start');
  await expect(start).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('دراسة');
  await expect(page.getByRole('dialog')).toContainText('مع مساعدة');
  await expect(page.getByRole('dialog')).toContainText('وحدك');
  await expect(page.getByRole('dialog')).toContainText('المقترحة');
  await expect(start).toHaveAttribute('aria-label', /^ابدأ (دراسة|مع مساعدة|وحدك)/);

  await start.click();
  await expect(page).toHaveURL(/\/scenario\/[^/]+\/story/);
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
  // The words the learner hears carry the capped count; the visible row stays
  // short enough to sit under the hero.
  await expect(row).toHaveAttribute('aria-label', /مراجعة سريعة: 10 عناصر · 3 دقائق/);
  await expect(row).toContainText('مراجعة سريعة');
  await expect(row).toContainText('3 دقائق');
  await expect(page.getByText('+120 في الانتظار')).toBeVisible();
  // The primary action still leads and still names a situation.
  const cta = page.getByTestId('trail-primary-cta');
  await expect(cta).toHaveText(/ابدأ|حدّث المشاهد/);
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
