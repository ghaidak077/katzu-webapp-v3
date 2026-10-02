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
  await expect(page.getByText('1 / 1')).toBeVisible();

  // The learner produces German from the Arabic meaning and it grades correctly.
  await page.getByLabel('إجابتك بالألمانية').fill('der Termin');
  await page.getByRole('button', { name: 'تحقّق من إجابتي' }).click();
  await expect(page.getByText('إجابة صحيحة')).toBeVisible();

  // Self-grade, which advances the schedule and finishes the one-item session.
  await page.getByRole('button', { name: 'بسهولة' }).click();
  await expect(page.getByRole('heading', { name: 'مراجعة اليوم' })).toBeVisible();
  await expect(page.getByText('من أول محاولة')).toBeVisible();
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

  // A deliberately wrong transcription: the point is that the dictation grades and
  // names what was missed instead of silently accepting anything.
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
  await page.getByPlaceholder('Schreiben Sie hier auf Deutsch...').fill(
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
