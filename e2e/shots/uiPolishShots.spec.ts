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
    await bootSignedIn(page, { history: true });
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
    await bootSignedIn(page, { history: true });
    await page.goto('/app/practice');
    await expect(page.getByRole('heading', { name: 'مركز التدريب والمراجعة' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await shoot(page, 'practice-hub');
  });
}

// The three verdict states — one screenshot each at 390x844, after the polish.
// Test-only fixtures: three due cards, each graded to a specific verdict so the
// three result states can be captured and inspected for warm tones (no red).
test('review verdict states [after]', async ({ page }) => {
  if (TAG !== 'after') return;
  await setViewport(page, 390, 844);
  await bootSignedIn(page, { history: true });
  await seedRows(page, 'review_items', [
    reviewRow('موعد', 'der Termin'),
    reviewRow('فاتورة', 'die Rechnung'),
    reviewRow('قهوة', 'der Kaffee'),
  ]);
  await page.goto('/app/review');
  await expect(page.getByRole('heading', { name: 'مراجعة الذاكرة' })).toBeVisible({ timeout: 30_000 });

  // Card 1 (der Termin): exact answer → correct
  await page.getByLabel('إجابتك بالألمانية').fill('der Termin');
  await page.getByRole('button', { name: 'تحقّق من إجابتي' }).click();
  await expect(page.getByText('إجابة صحيحة')).toBeVisible();
  await page.waitForTimeout(400);
  await shoot(page, 'review-verdict-correct');

  // Advance: good → next card
  await page.getByRole('button', { name: 'سهلة' }).click();
  await page.waitForTimeout(300);

  // Card 2 (die Rechnung): wrong article → close (almost)
  await page.getByLabel('إجابتك بالألمانية').fill('der Rechnung');
  await page.getByRole('button', { name: 'تحقّق من إجابتي' }).click();
  await expect(page.getByText('المعنى صحيح')).toBeVisible();
  await page.waitForTimeout(400);
  await shoot(page, 'review-verdict-almost');

  // A near miss is recorded as 'again': the correct form and one way forward.
  await page.getByRole('button', { name: 'التالي' }).click();
  await page.waitForTimeout(300);

  // Card 3 (der Kaffee): different noun → wrong (incorrect)
  await page.getByLabel('إجابتك بالألمانية').fill('der Tee');
  await page.getByRole('button', { name: 'تحقّق من إجابتي' }).click();
  await expect(page.getByText('الصيغة الصحيحة')).toBeVisible();
  await page.waitForTimeout(400);
  await shoot(page, 'review-verdict-incorrect');
});

// ---------------------------------------------------------------------------
// Review V41 evidence: one card per task type, five states, flag OFF and ON.
//
// The owner asked to see the cue before and after the contract change. These
// tests are deliberately selector-tolerant so the *same* file runs against the
// old bundle (TAG=before) and the new one (TAG=after): old review had an Arabic
// input for de_to_ar and no retry, new review is read-and-reveal for that type.
// The screenshot set is evidence, not an assertion suite — the gate assertions
// live in e2e/review.spec.ts.
//
//   TAG=after  FLAG=off E2E_TARGET=preview npx playwright test -c e2e/uiPolishShots.playwright.config.ts -g "review task"
//   TAG=before FLAG=off E2E_TARGET=preview npx playwright test -c e2e/uiPolishShots.playwright.config.ts -g "review task"
// ---------------------------------------------------------------------------

type ReviewShotType = 'vocab' | 'sentence-ar-to-de' | 'sentence-de-to-ar' | 'correction';
type ReviewShotState = 'initial' | 'typed' | 'correct' | 'wrong' | 'reveal';

const REVIEW_SHOTS = join(process.cwd(), 'docs', 'agent', 'review-v41');
const REVIEW_FLAG = process.env.FLAG === 'on' ? 'on' : 'off';

async function shootReview(
  page: Page,
  type: ReviewShotType,
  state: ReviewShotState,
): Promise<void> {
  const dir = join(REVIEW_SHOTS, TAG);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `review-task-${type}-${state}-${REVIEW_FLAG}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

function reviewTaskRow(type: ReviewShotType): Record<string, unknown> {
  const base = {
    userId: 'current_user',
    dueAt: 1,
    intervalDays: 1,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    reviews: 0,
    createdAt: 1,
  };
  if (type === 'vocab') {
    return {
      ...base,
      kind: 'vocab',
      refId: 'vocab:9701',
      sourceId: 9701,
      promptAr: 'موعد',
      answerDe: 'der Termin',
      contextDe: 'Ich habe morgen einen Termin.',
      direction: 'ar_to_de',
    };
  }
  if (type === 'sentence-ar-to-de') {
    return {
      ...base,
      kind: 'phrase',
      refId: 'phrase:9702',
      promptAr: 'أريد قهوة من فضلك.',
      answerDe: 'Ich möchte einen Kaffee, bitte.',
      explanationAr: 'طلب مهذب في المقهى.',
      direction: 'ar_to_de',
    };
  }
  if (type === 'sentence-de-to-ar') {
    return {
      ...base,
      kind: 'phrase',
      refId: 'phrase:9703',
      promptAr: 'أريد قهوة من فضلك.',
      answerDe: 'Ich möchte einen Kaffee, bitte.',
      explanationAr: 'جملة طلب مهذبة.',
      direction: 'de_to_ar',
    };
  }
  return {
    ...base,
    kind: 'mistake',
    refId: 'mistake:9704',
    sourceId: 9704,
    promptAr: 'Akkusativ — اكتب الجملة الصحيحة بالألمانية',
    meaningAr: 'أريد قهوة',
    contextDe: 'Ich möchte ein Kaffee',
    answerDe: 'Ich möchte einen Kaffee',
    explanationAr: 'بعد möchte نستخدم einen.',
    direction: 'ar_to_de',
  };
}

const REVIEW_TYPES: ReviewShotType[] = [
  'vocab',
  'sentence-ar-to-de',
  'sentence-de-to-ar',
  'correction',
];
const REVIEW_STATES: ReviewShotState[] = ['initial', 'typed', 'correct', 'wrong', 'reveal'];

for (const type of REVIEW_TYPES) {
  for (const state of REVIEW_STATES) {
    test(`review task ${type} ${state} [${TAG}] [flag ${REVIEW_FLAG}]`, async ({ page }) => {
      // New de_to_ar is read-and-reveal by design: there is no input to type
      // into and therefore no correct/wrong typed state to photograph.
      if (TAG === 'after' && type === 'sentence-de-to-ar' && !['initial', 'reveal'].includes(state)) {
        test.skip(true, 'read-and-reveal type has no typed states');
      }

      await setViewport(page, 390, 844);
      await page.addInitScript(
        (value: string) => localStorage.setItem('kz.guidedHome', value),
        REVIEW_FLAG === 'on' ? '1' : '0',
      );
      await bootSignedIn(page, { history: true });
      const row = reviewTaskRow(type);
      await seedRows(page, 'review_items', [row]);
      await page.goto('/app/review');
      await expect(page.getByRole('heading', { name: 'مراجعة الذاكرة' })).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(500);

      const input = page.locator('input[type="text"]').first();
      const typedAnswer = type === 'sentence-de-to-ar' ? String(row.promptAr) : String(row.answerDe);

      if (state === 'typed') {
        await input.fill(typedAnswer.slice(0, Math.max(4, Math.ceil(typedAnswer.length / 2))));
      } else if (state === 'correct') {
        await input.fill(typedAnswer);
        await page.getByRole('button', { name: 'تحقّق من إجابتي' }).click();
        await expect(page.getByRole('status').first()).toBeVisible();
      } else if (state === 'wrong') {
        await input.fill(type === 'sentence-de-to-ar' ? 'شيء آخر' : 'Ich trinke Tee.');
        await page.getByRole('button', { name: 'تحقّق من إجابتي' }).click();
        await expect(page.getByRole('status').first()).toBeVisible();
      } else if (state === 'reveal') {
        await page.getByRole('button', { name: /أرني|اكشف/ }).first().click();
        await expect(page.getByRole('status').first()).toBeVisible();
      }

      await page.waitForTimeout(500);
      await shootReview(page, type, state);
    });
  }
}
