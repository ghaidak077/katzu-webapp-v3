import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, seedRows } from '../harness';
import { seedServedContent } from '../servedContent';

/**
 * Evidence rig for the vertical unit path at 390×844.
 *
 * The six states the owner asked to see, each a real viewport (never a
 * full-page stitch). The output is ignored by git (`.tmp/`), so this rig writes
 * evidence rather than tracked docs:
 *
 *   npx playwright test e2e/shots/unitPathShots.spec.ts
 */

const VIEWPORT = { width: 390, height: 844 };
const OUT_DIR = join(process.cwd(), '.tmp', 'unit-path');

/** Unit 1 of the served map, in the order the unit renders them. */
const UNIT_ONE_IDS = [
  'first_greetings',
  'numbers_and_prices',
  'letters_and_forms',
  'supermarket_checkout',
  'bakery_shopping',
  'cafe_order',
];

function independentSession(scenarioId: string, index: number): Record<string, unknown> {
  return {
    id: `shot-${scenarioId}`,
    scenarioId,
    scenarioTitle: scenarioId,
    cefrLevel: 'A1',
    accuracyPercent: 88,
    independentSentences: 5,
    hintAssistedSentences: 0,
    sentencesSpoken: 5,
    wordsLearned: 12,
    durationSeconds: 300,
    xpEarned: 20,
    timestamp: Date.now() - (index + 1) * 86_400_000,
    updatedAt: Date.now(),
  };
}

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

async function bootWithContent(page: Page, doneCount = 0): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await bootSignedIn(page);
  await seedServedContent(page);
  if (doneCount > 0) {
    await seedRows(
      page,
      'sessions',
      UNIT_ONE_IDS.slice(0, doneCount).map(independentSession),
    );
  }
  await page.goto('/app/library');
  await expect(page.getByTestId('trail-primary-cta')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('trail-unit-map')).toBeVisible();
  await expect(page.getByTestId('trail-scenario-card').first()).toBeVisible();
  await expect
    .poll(async () => page.getByTestId('trail-unit-count').first().innerText())
    .toContain(`من 6`);
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${name}-390x844.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

test.describe.configure({ mode: 'serial' });

test('new user — nothing started, no reviews', async ({ page }) => {
  await bootWithContent(page, 0);
  await expect(page.getByTestId('trail-free-sessions')).toContainText('3 من 3');
  await shoot(page, '01-new-user');
});

test('mid-unit — three of six situations finished', async ({ page }) => {
  await bootWithContent(page, 3);
  await expect
    .poll(async () => page.getByTestId('trail-unit-count').first().innerText())
    .toBe('3 من 6');
  await shoot(page, '02-mid-unit');
});

test('finished unit — all six done, next unit open', async ({ page }) => {
  await bootWithContent(page, 6);
  await expect
    .poll(async () => page.getByTestId('trail-unit-count').first().innerText())
    .toBe('6 من 6');
  await shoot(page, '03-finished-unit');
});

test('130 due reviews — ten-item action, backlog in small text', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await bootSignedIn(page);
  await seedServedContent(page);
  await seedRows(
    page,
    'review_items',
    Array.from({ length: 130 }, (_, index) => reviewRow(index)),
  );
  await page.goto('/app/library');
  await expect(page.getByTestId('trail-review-row')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('+120 في الانتظار')).toBeVisible();
  await shoot(page, '04-130-reviews');
});

test('zero due reviews — the path leads, not a review count', async ({ page }) => {
  await bootWithContent(page, 2);
  await expect(page.getByText('لا مراجعة مستحقة الآن — وقتك للمشهد التالي.')).toBeVisible();
  await shoot(page, '05-zero-reviews');
});

test('free learner at session 3 of 3', async ({ page }) => {
  await bootWithContent(page, 2);
  await expect(page.getByTestId('trail-free-sessions')).toHaveText('جلسة مجانية 3 من 3');
  await shoot(page, '06-free-session-3-of-3');
});
