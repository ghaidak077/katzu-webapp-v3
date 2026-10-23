import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, seedRows } from '../harness';

/**
 * Step 7 evidence — progressive reveal, at the owner's 390×844.
 *
 * One real viewport per state (never a full-page stitch), `TAG=before|after`
 * so the same rig produces both sides:
 *
 *   TAG=before npx playwright test -c e2e/step7RevealShots.playwright.config.ts
 *   TAG=after  npx playwright test -c e2e/step7RevealShots.playwright.config.ts
 *
 * The four states the step changes: day 0 (hero only), the sheet on day 0 (no
 * «تقدّمك»), day 1 (habit panel, review still waiting) and day 2 with three
 * sessions (review in the hero, progress facts in the sheet).
 */

const TAG = process.env.TAG === 'after' ? 'after' : 'before';
const OUT_DIR = join(process.cwd(), 'docs', 'agent', 'ui-polish');

/** The device switch, set before the first document runs (the owner's lever). */
async function guidedOn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kz.guidedHome', '1');
    } catch {
      /* storage disabled: the build default applies */
    }
  });
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const vp = page.viewportSize();
  const file = join(OUT_DIR, `step7-${name}-${vp?.width}x${vp?.height}-${TAG}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

function sheet(page: Page) {
  return page.getByRole('dialog', { name: 'المزيد' });
}

async function openMore(page: Page): Promise<void> {
  await page.getByTestId('journey-more').click();
  await expect(sheet(page)).toBeVisible();
}

function aSession(
  id = 'sess_step7_1',
  scenarioId = 'airport_arrival',
  timestamp = Date.now(),
): Record<string, unknown> {
  return {
    id,
    scenarioId,
    scenarioTitle: 'في المطار: الأمتعة',
    cefrLevel: 'A1',
    sentencesSpoken: 4,
    wordsLearned: 16,
    accuracyPercent: 90,
    durationSeconds: 200,
    timestamp,
    wasIndependentOnly: true,
    independentSentences: 4,
    hintAssistedSentences: 0,
    mode: 'practice',
    mistakesCount: 0,
  };
}

function aDueCard(): Record<string, unknown> {
  return {
    userId: 'current_user',
    kind: 'vocab',
    refId: 'vocab:step7-1',
    sourceId: 9101,
    promptAr: 'موعد',
    answerDe: 'der Termin',
    dueAt: Date.now() - 60_000,
    intervalDays: 1,
    ease: 2.5,
    reps: 1,
    lapses: 0,
    reviews: 1,
    createdAt: Date.now() - 86_400_000,
  };
}

test('guided home, day 0 [after reveal]', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await guidedOn(page);
  await bootSignedIn(page);
  await expect(page.getByTestId('journey-more')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await shoot(page, 'home-day0');
});

test('guided home, day 0: the sheet [after reveal]', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await guidedOn(page);
  await bootSignedIn(page);
  await openMore(page);
  await page.waitForTimeout(400);
  await shoot(page, 'more-day0');
});

test('guided home, day 1 (one session) [after reveal]', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await guidedOn(page);
  await bootSignedIn(page);
  await seedRows(page, 'sessions', [aSession()]);
  await page.reload();
  await expect(page.getByTestId('daily-tasks')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await shoot(page, 'home-day1');
});

test('guided home, day 2 with three sessions [after reveal]', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await guidedOn(page);
  await bootSignedIn(page);
  const yesterday = Date.now() - 86_400_000;
  await seedRows(page, 'sessions', [
    aSession('sess_step7_1', 'airport_arrival', yesterday),
    aSession('sess_step7_2', 'cafe_order', yesterday),
    aSession('sess_step7_3', 'supermarket', yesterday),
  ]);
  await seedRows(page, 'review_items', [aDueCard()]);
  await page.reload();
  await expect(page.getByTestId('daily-tasks')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await shoot(page, 'home-day2');
});

test('guided home, day 2 with three sessions: the sheet [after reveal]', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await guidedOn(page);
  await bootSignedIn(page);
  const yesterday = Date.now() - 86_400_000;
  await seedRows(page, 'sessions', [
    aSession('sess_step7_1', 'airport_arrival', yesterday),
    aSession('sess_step7_2', 'cafe_order', yesterday),
    aSession('sess_step7_3', 'supermarket', yesterday),
  ]);
  await seedRows(page, 'review_items', [aDueCard()]);
  await page.reload();
  await openMore(page);
  await page.waitForTimeout(400);
  await shoot(page, 'more-day2');
});
