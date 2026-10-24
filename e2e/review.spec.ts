import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, seedRows } from './harness';

/**
 * Review, walked in a real browser.
 *
 * WHY THIS FILE EXISTS: the owner reported cards with no question, a topic label
 * as the only cue, and a "correct" answer that was never checked. The contract is
 * now one task per card, built by `buildReviewTask`; these specs prove each task
 * type reaches the learner as one clear instruction, feedback and schedule write,
 * against the real bundle and the real IndexedDB. Scheduler assertions matter
 * because a screen that looks right but never grades is still a broken drill.
 */

/** A due timestamp in the past, so the review engine treats the row as due now. */
const DUE = 1;

/** The stored schedule for one refId — proves the screen actually graded it. */
async function readReviewRow(page: Page, refId: string): Promise<Record<string, any> | undefined> {
  return page.evaluate(async (wanted) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('KatzuWebDB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<Record<string, any> | undefined>((resolve, reject) => {
      const request = db.transaction('review_items').objectStore('review_items').index('refId').get(wanted);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return row;
  }, refId);
}

test('Review shows only answerable cards, grades one, and reaches its summary', async ({ page }) => {
  await bootSignedIn(page, { history: true });

  await seedRows(page, 'review_items', [
    {
      userId: 'current_user',
      kind: 'vocab',
      refId: 'vocab:999',
      sourceId: 999,
      promptAr: 'موعد',
      answerDe: 'der Termin',
      contextDe: 'Ich habe morgen einen Termin.',
      direction: 'ar_to_de',
      dueAt: DUE,
      intervalDays: 1,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      reviews: 0,
      createdAt: 1,
    },
    // Explicitly suppressed (the old bad row the V28 migration flags): hidden.
    {
      userId: 'current_user',
      kind: 'vocab',
      refId: 'vocab:777',
      promptAr: 'صيغة صحيحة',
      answerDe: 'irgendwas',
      suppressed: true,
      dueAt: DUE,
      intervalDays: 1,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      reviews: 0,
      createdAt: 1,
    },
    // Not suppressed, but fails the contract (placeholder prompt): also hidden.
    {
      userId: 'current_user',
      kind: 'vocab',
      refId: 'vocab:888',
      promptAr: 'صيغة صحيحة',
      answerDe: 'etwas anderes',
      dueAt: DUE,
      intervalDays: 1,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      reviews: 0,
      createdAt: 1,
    },
  ]);

  await page.goto('/app/review');

  // The session opens on the one servable card — the other two never reach it.
  await expect(page.getByRole('heading', { name: 'مراجعة الذاكرة' })).toBeVisible();
  await expect(page.getByText('موعد')).toBeVisible();
  await expect(page.getByText('صيغة صحيحة')).toHaveCount(0);
  // Screen 3.1: the counter is Arabic prose now («1 من 1»); the old «1 / 1"
  // bidi-flipped to "1 / 1"'s mirror on RTL layouts.
  await expect(page.getByTestId('review-counter')).toHaveText('1 من 1');

  // The learner produces German from the Arabic meaning and it grades correctly.
  await page.getByLabel('إجابتك بالألمانية').fill('der Termin');
  await page.getByRole('button', { name: 'تحقّق من إجابتي' }).click();
  await expect(page.getByText('إجابة صحيحة')).toBeVisible();

  // Self-grade, which advances the schedule and finishes the one-item session.
  await page.getByRole('button', { name: 'سهلة' }).click();
  await expect(page.getByRole('heading', { name: 'مراجعة اليوم' })).toBeVisible();
  await expect(page.getByText('من أول محاولة')).toBeVisible();

  // The schedule really moved: one rep, no lapse, due in the future.
  const row = await readReviewRow(page, 'vocab:999');
  expect(row?.reps).toBe(1);
  expect(row?.lapses).toBe(0);
  expect(row?.reviews).toBe(1);
  expect(row?.dueAt).toBeGreaterThan(DUE);
  expect(row?.lastReviewedAt).toBeGreaterThan(0);
});

test('Review hands the learner the words, and an honest way out', async ({ page }) => {
  await bootSignedIn(page, { history: true });

  // A production card the learner may not have the vocabulary for: the Arabic
  // prompt is clear, but building `der Termin` needs the words.
  await seedRows(page, 'review_items', [
    {
      userId: 'current_user',
      kind: 'vocab',
      refId: 'vocab:999',
      sourceId: 999,
      promptAr: 'موعد',
      answerDe: 'der Termin',
      direction: 'ar_to_de',
      dueAt: DUE,
      intervalDays: 1,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      reviews: 0,
      createdAt: 1,
    },
  ]);

  await page.goto('/app/review');
  await expect(page.getByText('موعد')).toBeVisible();

  // No word bank by default: the hint is a second-attempt aid, not the answer.
  await expect(page.getByTestId('word-bank')).toHaveCount(0);

  // Miss once, which records 'again' and brings the card back for one retry.
  await page.getByLabel('إجابتك بالألمانية').fill('Tee');
  await page.getByRole('button', { name: 'تحقّق من إجابتي' }).click();
  await expect(page.getByText('الصيغة الصحيحة')).toBeVisible();
  await page.getByRole('button', { name: 'التالي' }).click();

  // The retry offers the hint, and its chips assemble the answer.
  await page.getByRole('button', { name: /تلميح: أول كلمات الإجابة/ }).click();
  await expect(page.getByTestId('word-bank')).toBeVisible();
  await page.getByRole('button', { name: 'der', exact: true }).click();
  await page.getByRole('button', { name: 'Termin', exact: true }).click();
  await expect(page.getByLabel('إجابتك بالألمانية')).toHaveValue(/der.*Termin|Termin.*der/);

  // The honest way out: one block with the correct answer and one way forward.
  await page.getByRole('button', { name: 'لا أتذكّر — أرني الإجابة' }).click();
  await expect(page.getByText('الصيغة الصحيحة')).toBeVisible();
  await expect(page.getByRole('button', { name: 'فهمت، التالي' })).toBeVisible();
  // No rating after a reveal; it is already recorded as a miss.
  await expect(page.getByRole('button', { name: 'سهلة' })).toHaveCount(0);
  await page.getByRole('button', { name: 'فهمت، التالي' }).click();
  await expect(page.getByRole('heading', { name: 'مراجعة اليوم' })).toBeVisible();
  await expect(page.getByText('يحتاج تثبيتاً')).toBeVisible();

  // Two misses (the wrong attempt and the reveal), both recorded as 'again'.
  const row = await readReviewRow(page, 'vocab:999');
  expect(row?.reps).toBe(0);
  expect(row?.lapses).toBe(2);
  expect(row?.reviews).toBe(2);
  expect(row?.dueAt).toBeGreaterThan(DUE);
});

test('Review asks for a German sentence from one full Arabic cue', async ({ page }) => {
  await bootSignedIn(page, { history: true });

  await seedRows(page, 'review_items', [
    {
      userId: 'current_user',
      kind: 'phrase',
      refId: 'phrase:901',
      promptAr: 'أريد قهوة من فضلك.',
      answerDe: 'Ich möchte einen Kaffee, bitte.',
      explanationAr: 'طلب مهذب في المقهى.',
      direction: 'ar_to_de',
      dueAt: DUE,
      intervalDays: 1,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      reviews: 0,
      createdAt: 1,
    },
  ]);

  await page.goto('/app/review');

  // One task, one type chip, one full sentence as the cue.
  await expect(page.getByText('جملة', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'اكتب الجملة بالألمانية' })).toBeVisible();
  await expect(page.getByText('أريد قهوة من فضلك.')).toBeVisible();
  await expect(page.getByText('طلب مهذب في المقهى.')).toBeVisible();

  const input = page.getByLabel('إجابتك بالألمانية');
  await expect(input).toHaveAttribute('dir', 'ltr');
  await expect(input).toHaveAttribute('lang', 'de');
  await input.fill('Ich möchte einen Kaffee, bitte.');
  await page.getByRole('button', { name: 'تحقّق من إجابتي' }).click();
  await expect(page.getByText('إجابة صحيحة')).toBeVisible();
  await page.getByRole('button', { name: 'سهلة' }).click();

  await expect(page.getByRole('heading', { name: 'مراجعة اليوم' })).toBeVisible();
  const row = await readReviewRow(page, 'phrase:901');
  expect(row?.reps).toBe(1);
  expect(row?.lapses).toBe(0);
  expect(row?.dueAt).toBeGreaterThan(DUE);
});

test('Review reads a German sentence, reveals its meaning, and self-rates', async ({ page }) => {
  await bootSignedIn(page, { history: true });

  await seedRows(page, 'review_items', [
    {
      userId: 'current_user',
      kind: 'phrase',
      refId: 'phrase:902',
      promptAr: 'أريد قهوة من فضلك.',
      answerDe: 'Ich möchte einen Kaffee, bitte.',
      explanationAr: 'جملة طلب مهذبة.',
      direction: 'de_to_ar',
      dueAt: DUE,
      intervalDays: 1,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      reviews: 0,
      createdAt: 1,
    },
  ]);

  await page.goto('/app/review');

  // The German is the cue; no German input is offered for this direction.
  await expect(page.getByRole('heading', { name: 'اقرأ الجملة ثم اكشف معناها' })).toBeVisible();
  await expect(page.getByText('Ich möchte einen Kaffee, bitte.')).toBeVisible();
  await expect(page.getByLabel('إجابتك بالألمانية')).toHaveCount(0);

  await page.getByRole('button', { name: 'اكشف المعنى' }).click();
  await expect(page.getByText('المعنى', { exact: true })).toBeVisible();
  await expect(page.getByText('أريد قهوة من فضلك.')).toBeVisible();
  await expect(page.getByText('جملة طلب مهذبة.')).toBeVisible();

  // Self-rating is the only grade for a read-and-reveal card.
  await page.getByRole('button', { name: 'بسهولة' }).click();
  await expect(page.getByRole('heading', { name: 'مراجعة اليوم' })).toBeVisible();

  const row = await readReviewRow(page, 'phrase:902');
  expect(row?.reps).toBe(1);
  expect(row?.lapses).toBe(0);
  expect(row?.dueAt).toBeGreaterThan(DUE);
});

test('Review shows the learner sentence, the correction, and the reason', async ({ page }) => {
  await bootSignedIn(page, { history: true });

  await seedRows(page, 'review_items', [
    {
      userId: 'current_user',
      kind: 'mistake',
      refId: 'mistake:903',
      promptAr: 'Akkusativ — اكتب الجملة الصحيحة بالألمانية',
      meaningAr: 'أريد قهوة',
      contextDe: 'Ich möchte ein Kaffee',
      answerDe: 'Ich möchte einen Kaffee',
      explanationAr: 'بعد möchte نستخدم einen.',
      direction: 'ar_to_de',
      dueAt: DUE,
      intervalDays: 1,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      reviews: 0,
      createdAt: 1,
    },
  ]);

  await page.goto('/app/review');

  await expect(page.getByText('تصحيح', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'صحّح جملتك السابقة' })).toBeVisible();
  await expect(page.getByText('أريد قهوة')).toBeVisible();
  await expect(page.getByText('إجابتك السابقة')).toBeVisible();
  await expect(page.getByText('Ich möchte ein Kaffee')).toBeVisible();
  await expect(page.getByPlaceholder('أعد كتابتها صحيحة…')).toBeVisible();

  // Repeating the old sentence is not a correction: the right form and the
  // reason appear, and the card comes back once for a retry.
  await page.getByLabel('إجابتك بالألمانية').fill('Ich möchte ein Kaffee');
  await page.getByRole('button', { name: 'تحقّق من إجابتي' }).click();
  await expect(page.getByText('الصيغة الصحيحة')).toBeVisible();
  await expect(page.getByText('بعد möchte نستخدم einen.')).toBeVisible();
  await page.getByRole('button', { name: 'التالي' }).click();

  // A correction never offers the answer as chips.
  await expect(page.getByRole('button', { name: /تلميح: أول كلمات الإجابة/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'لا أتذكّر — أرني الإجابة' }).click();
  await expect(page.getByRole('button', { name: 'فهمت، التالي' })).toBeVisible();
  await page.getByRole('button', { name: 'فهمت، التالي' }).click();
  await expect(page.getByRole('heading', { name: 'مراجعة اليوم' })).toBeVisible();

  const row = await readReviewRow(page, 'mistake:903');
  expect(row?.reps).toBe(0);
  expect(row?.lapses).toBe(2);
  expect(row?.dueAt).toBeGreaterThan(DUE);
});
