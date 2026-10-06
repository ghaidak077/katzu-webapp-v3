import { expect, test } from '@playwright/test';
import { bootSignedIn, seedRows } from './harness';

/**
 * The four skill surfaces, walked in a real browser.
 *
 * WHY THIS FILE EXISTS: review, listen, write and coach each had unit coverage
 * (`tests/reviewValidation.test.ts`, `tests/listeningDrill.test.ts`,
 * `tests/writing.test.ts`, `tests/coachProfile.test.ts`) and an offline-route
 * audit, but no browser spec — so nothing proved the screens actually render,
 * grade and finish against the built bundle. The Trail's Arabic rank badge (V28
 * Stage 3) was in the same position: `rankFor` was unit-tested, the label the
 * learner reads was not.
 *
 * Every assertion here is on what the learner sees, not on internal state, and
 * the history each screen needs is seeded into the app's own tables exactly the
 * way the app would have written it (`seedRows`).
 */

/** A due timestamp in the past, so the review engine treats the row as due now. */
const DUE = 1;

test('Review shows only answerable cards, grades one, and reaches its summary', async ({ page }) => {
  await bootSignedIn(page);

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
  await page.getByRole('button', { name: 'بسهولة' }).click();
  await expect(page.getByRole('heading', { name: 'مراجعة اليوم' })).toBeVisible();
  await expect(page.getByText('من أول محاولة')).toBeVisible();
});

test('Review hands the learner the words, and an honest way out', async ({ page }) => {
  await bootSignedIn(page);

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

  // The word bank is offered and its chips assemble the answer.
  await expect(page.getByText('بنك الكلمات — اضغط لتضيف الكلمة')).toBeVisible();
  await page.getByRole('button', { name: 'der', exact: true }).click();
  await page.getByRole('button', { name: 'Termin', exact: true }).click();
  await expect(page.getByLabel('إجابتك بالألمانية')).toHaveValue(/der.*Termin|Termin.*der/);

  // The honest way out: reveal the answer without guessing, and it is recorded
  // as a miss, not a clean recall.
  await page.getByRole('button', { name: 'لا أتذكّر — أرني الإجابة' }).click();
  await expect(page.getByText('ليس بعد — هذه هي الصيغة الصحيحة')).toBeVisible();
  await expect(page.getByText('كشفت الإجابة')).toBeVisible();
  // Graded (not "again", which would requeue the single card) and the reveal is
  // counted once as a miss, not as a clean recall.
  await page.getByRole('button', { name: 'بصعوبة' }).click();
  await expect(page.getByRole('heading', { name: 'مراجعة اليوم' })).toBeVisible();
  await expect(page.getByText('يحتاج تثبيتاً')).toBeVisible();
});

test('Listening dictation grades what was heard and reveals the sentence', async ({ page }) => {
  await bootSignedIn(page);

  // A level-matching pool so the drill has a sentence to play. One phrase and one
  // word is enough; the queue order is shuffled, which is why the assertions below
  // are about the grading behaviour rather than one particular sentence.
  await seedRows(page, 'starter_phrases', [
    {
      id: 500,
      scenario_id: 'cafe_order',
      german: 'Was möchten Sie trinken?',
      translation_ar: 'ماذا تريد أن تشرب؟',
      level: 'A1',
      sort_order: 1,
    },
  ]);
  await seedRows(page, 'vocabulary', [
    {
      id: 501,
      german: 'Kaffee',
      article: 'der',
      part_of_speech: 'Noun',
      translation_ar: 'قهوة',
      translation_en: 'coffee',
      example_de: 'Ich möchte einen Kaffee.',
      example_ar: 'أريد قهوة.',
      example_en: '',
      level: 'A1',
      topic: 'food',
    },
  ]);

  await page.goto('/app/listen');

  await expect(page.getByRole('heading', { name: 'تدريب الاستماع' })).toBeVisible();

  // The words of the sentence being dictated are tappable into the input. A
  // single-word item has no bank (one chip would be the whole answer), so walk the
  // short queue until a sentence item shows one.
  const bank = page.getByTestId('word-bank');
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await bank.isVisible()) break;
    await page.getByLabel('ما سمعته بالألمانية').fill('zwischenstand');
    await page.getByRole('button', { name: 'تحقّق' }).click();
    await page.getByRole('button', { name: /الجملة التالية|أظهر النتيجة/ }).click();
  }
  await expect(bank).toBeVisible();

  // A chip fills the input, so the learner who cannot make out the words can
  // still reconstruct the sentence they heard.
  const chip = bank.getByRole('button').first();
  const firstWord = (await chip.textContent())?.trim() || '';
  await chip.click();
  await expect(page.getByLabel('ما سمعته بالألمانية')).toHaveValue(new RegExp(firstWord));

  // Grading is unchanged: a deliberately wrong transcription names what was missed.
  await page.getByLabel('ما سمعته بالألمانية').fill('voellig falsch');
  await page.getByRole('button', { name: 'تحقّق' }).click();

  await expect(page.getByText(/أمسكت \d+ من \d+ كلمات/)).toBeVisible();
  // The full sentence is revealed after answering, so the ear can compare.
  await expect(page.getByText('الجملة كاملة')).toBeVisible();
  await expect(page.getByRole('button', { name: /الجملة التالية|أظهر النتيجة/ })).toBeVisible();
});

test('Writing grades a paragraph and shows the rubric and corrected copy', async ({ page }) => {
  await bootSignedIn(page);

  await page.goto('/app/write');

  await expect(page.getByRole('heading', { name: 'الكتابة (Schreiben)' })).toBeVisible();

  // The worker rejects anything under 20 characters, so the test writes a real one.
  await page.getByPlaceholder('Schreibe hier auf Deutsch…').fill(
    'Ich möchte einen Termin am Montag vereinbaren, weil ich zum Arzt muss.',
  );
  await page.getByRole('button', { name: 'صحّح نصّي' }).click();

  // The mocked worker returns 85% with a four-dimension rubric.
  await expect(page.getByText('85%')).toBeVisible();
  await expect(page.getByText('معايير التقييم — من 4')).toBeVisible();
  await expect(page.getByText('ملاحظة المعلّم')).toBeVisible();
  await expect(page.getByText('النسخة المصححة')).toBeVisible();
  await expect(page.getByRole('button', { name: 'اكتب من جديد' })).toBeVisible();
});

test('Writing offers the scenario words to build the paragraph', async ({ page }) => {
  await bootSignedIn(page);

  await page.goto('/app/write');
  await expect(page.getByRole('heading', { name: 'الكتابة (Schreiben)' })).toBeVisible();

  // Writing has no single answer, so the bank is assembled from the scenario's own
  // vocabulary and phrases — the seed content gives the first scenario (café) a
  // food topic with plenty of words.
  const bank = page.getByTestId('word-bank');
  await expect(bank).toBeVisible();

  const chip = bank.getByRole('button').first();
  const word = (await chip.textContent())?.trim() || '';
  await chip.click();
  await expect(page.getByPlaceholder('Schreibe hier auf Deutsch…')).toHaveValue(new RegExp(word));
});

test('the vocabulary bridge reports its bank taps and its reveals', async ({ page }) => {
  await bootSignedIn(page);

  // Collect every analytics batch the app posts (the client flushes ~2 s after a
  // tracked event). This proves the two new events actually leave the device, not
  // just that `track()` was called.
  const names: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.endsWith('/analytics/events')) return;
    try {
      const body = JSON.parse(request.postData() || '{}');
      for (const event of body.events || []) names.push(String(event.name));
    } catch {
      /* a malformed batch is not this test's concern */
    }
  });

  // Two production cards: one to use the bank on, one to give up on.
  const card = (id: number, promptAr: string, answerDe: string) => ({
    userId: 'current_user',
    kind: 'vocab',
    refId: `vocab:${id}`,
    sourceId: id,
    promptAr,
    answerDe,
    contextDe: '',
    direction: 'ar_to_de',
    dueAt: DUE,
    intervalDays: 1,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    reviews: 0,
    createdAt: 1,
  });
  await seedRows(page, 'review_items', [
    card(901, 'موعد', 'der Termin'),
    card(902, 'ماء', 'das Wasser'),
  ]);

  await page.goto('/app/review');
  await expect(page.getByTestId('word-bank')).toBeVisible();

  // First card: build from the bank, then grade it and move on.
  await page.getByTestId('word-bank').getByRole('button').first().click();
  await page.getByRole('button', { name: 'تحقّق من إجابتي' }).click();
  await page.getByRole('button', { name: 'بسهولة' }).click();

  // Second card: the honest way out.
  await page.getByRole('button', { name: 'لا أتذكّر — أرني الإجابة' }).click();

  await expect
    .poll(() => names, { timeout: 15_000 })
    .toEqual(expect.arrayContaining(['word_bank_tapped', 'review_revealed']));
});

test('Coach aggregates repeated mistakes and offers a focused drill', async ({ page }) => {
  await bootSignedIn(page);

  // Three mistakes in one category (word order) is the evidence floor the coach
  // requires before it names patterns.
  await seedRows(page, 'mistakes', [
    {
      userId: 'current_user',
      scenarioId: 'cafe_order',
      original: 'Ich trinke heute einen Tee',
      corrected: 'Heute trinke ich einen Tee',
      grammarRule: 'موقع الفعل في الجملة',
      timestamp: 3,
      wasHintUsed: false,
      isMastered: false,
    },
    {
      userId: 'current_user',
      scenarioId: 'doctor_visit',
      original: 'Ich habe seit gestern Kopfschmerzen',
      corrected: 'Ich habe seit gestern starke Kopfschmerzen',
      grammarRule: 'موقع الفعل والترتيب',
      timestamp: 2,
      wasHintUsed: false,
      isMastered: false,
    },
    {
      userId: 'current_user',
      scenarioId: 'job_interview',
      original: 'Morgen ich fahre nach Berlin',
      corrected: 'Morgen fahre ich nach Berlin',
      grammarRule: 'ترتيب الجملة',
      timestamp: 1,
      wasHintUsed: false,
      isMastered: false,
    },
  ]);

  await page.goto('/app/coach');

  await expect(page.getByRole('heading', { name: 'ملف أخطائك' })).toBeVisible();
  await expect(page.getByText('أكثر ثلاثة أنماط عندك')).toBeVisible();
  await expect(page.getByText('ترتيب الجملة وموقع الفعل').first()).toBeVisible();
  // The drill entry point is real and enabled.
  await expect(page.getByRole('button', { name: 'تدرّب على هذا الآن' }).first()).toBeEnabled();
});

test('Trail shows the earned Arabic rank and its position in the ladder', async ({ page }) => {
  // 800 XP sits inside the third rung (umlaut, 750 XP), so the badge must read
  // "rank 3 of 6" — the same single ladder the unit tests pin.
  await bootSignedIn(page, { user: { totalXp: 800, cefrLevel: 'A1' } });

  await page.goto('/app/library');

  await expect(page.getByText('صياد الأُملاوت · الرتبة 3 من 6')).toBeVisible();
  await expect(page.getByText(/XP للرتبة التالية/)).toBeVisible();
});
