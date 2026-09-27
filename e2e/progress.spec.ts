import { expect, test } from '@playwright/test';
import { bootSignedIn, seedRows } from './harness';

const NOW = 1_800_000_000_000;

/**
 * The Progress tab, with real recorded history seeded into the app's own tables.
 *
 * The point of these assertions is the honesty standard: the capability sentence
 * names a scenario, every list row carries the state the review engine recorded
 * and where it came from, and the numbers that used to decorate this screen without
 * pointing at anything ("إجمالي الجمل") are gone.
 */
test('Progress leads with capability and tags every row with its state and origin', async ({ page }) => {
  await bootSignedIn(page, { user: { cefrLevel: 'A1' } });

  await seedRows(page, 'sessions', [
    {
      id: 'sess_1',
      scenarioId: 'cafe_order',
      scenarioTitle: 'الطلب في المقهى',
      cefrLevel: 'A1',
      sentencesSpoken: 5,
      wordsLearned: 20,
      accuracyPercent: 88,
      durationSeconds: 240,
      timestamp: NOW,
      wasIndependentOnly: true,
      independentSentences: 5,
      hintAssistedSentences: 0,
      mode: 'quick',
    },
  ]);
  await seedRows(page, 'scenario_training', [
    {
      scenarioId: 'cafe_order',
      userId: 'current_user',
      studiedAt: NOW,
      quizAttempted: true,
      lastScore: 90,
      effectiveLevel: 'A1',
      updatedAt: NOW,
    },
  ]);
  await seedRows(page, 'review_items', [
    {
      userId: 'current_user',
      kind: 'vocab',
      refId: 'vocab:999',
      sourceId: 999,
      promptAr: 'موعد',
      answerDe: 'der Termin',
      dueAt: NOW + 86_400_000,
      intervalDays: 7,
      ease: 2.5,
      reps: 3,
      lapses: 0,
      reviews: 3,
      createdAt: NOW,
    },
    {
      userId: 'current_user',
      kind: 'mistake',
      refId: 'mistake:7',
      sourceId: 7,
      promptAr: 'حالات الإعراب (Akkusativ / Dativ)',
      answerDe: 'Ich möchte einen Kaffee',
      dueAt: NOW,
      intervalDays: 1,
      ease: 2.3,
      reps: 1,
      lapses: 0,
      reviews: 1,
      createdAt: NOW,
    },
  ]);
  await seedRows(page, 'vocabulary', [
    {
      id: 999,
      german: 'Termin',
      article: 'der',
      part_of_speech: 'Noun',
      translation_ar: 'موعد',
      translation_en: 'appointment',
      example_de: 'Ich habe morgen einen Termin.',
      example_ar: 'لدي موعد غداً.',
      example_en: '',
      level: 'A1',
      topic: 'food',
    },
  ]);
  await seedRows(page, 'grammar', [
    {
      id: 'akkusativ_articles',
      title_ar: 'حالات الإعراب (Akkusativ / Dativ)',
      rule_de: 'Akkusativ nach möchte',
      level: 'A1',
      explanation_ar: 'بعد möchte يأتي الاسم في حالة النصب.',
      example_de: 'Ich möchte einen Kaffee.',
      example_ar: 'أريد قهوة.',
    },
  ]);
  await seedRows(page, 'mistakes', [
    {
      userId: 'current_user',
      scenarioId: 'cafe_order',
      original: 'ein Kaffee',
      corrected: 'einen Kaffee',
      grammarRule: 'Akkusativ: einen Kaffee',
      timestamp: NOW,
      wasHintUsed: false,
      isMastered: false,
    },
  ]);

  await page.goto('/app/progress');

  await expect(page.getByRole('heading', { name: 'ما أصبحت قادراً عليه' })).toBeVisible();
  // The capability sentence names the real situation, not an abstract score.
  await expect(page.getByText(/تستطيع التعامل مع «الطلب في المقهى» بالألمانية بدون مساعدة/)).toBeVisible();

  // Vocabulary: the review engine's own state, plus where the word came from.
  await expect(page.getByText('der Termin').first()).toBeVisible();
  await expect(page.getByText('ثابتة (3 مراجعات ناجحة)')).toBeVisible();
  // The origin is named and tappable. Which food scenario wins the topic join is
  // fixture order, so this asserts the behaviour (every reviewed word can name
  // where it came from) rather than one particular scenario title.
  await expect(page.getByRole('button', { name: /^من / }).first()).toBeVisible();

  // Grammar: the rule the learner actually made mistakes against, with a count
  // that traces back to the recorded mistake. The same label also appears in the
  // "most repeated" line, so the list row is addressed by its own state label.
  await expect(page.getByText('حالات الإعراب (Akkusativ / Dativ)').first()).toBeVisible();
  await expect(page.getByText('تكررت مرة أو مرتين').first()).toBeVisible();

  // The vanity tiles the old screen led with must not come back.
  await expect(page.getByText('إجمالي الجمل')).toHaveCount(0);
  await expect(page.getByText('وقت التحدث')).toHaveCount(0);
});

test('Progress states an unmeasured skill instead of showing a zero', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/app/progress');

  // Three of the four skills are genuinely unmeasured on a fresh account; each
  // one says so instead of rendering a zero.
  await expect(page.getByText('لم تُقس بعد')).toHaveCount(3);
  await expect(page.getByText('لم يبدأ بعد — قريباً')).toBeVisible();
});
