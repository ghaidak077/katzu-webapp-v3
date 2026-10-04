import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, turn } from './harness';

/**
 * The two modes of the same conversation (V28 Stage 1D).
 *
 * PRACTICE = help: the suggestion pill, the Arabic translation, and the live
 * correction card. REAL = none of those — the same turn call still runs and still
 * returns the evaluation, so the end-of-session report can name every mistake the
 * learner was never shown live, and the correction is answerable.
 */

function countAiTurn(page: Page): string[] {
  const calls: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!url.hostname.includes('e2e-worker.test')) return;
    if (url.pathname.startsWith('/ai/turn')) calls.push(url.pathname);
  });
  return calls;
}

const CORRECTION_TURN = turn({
  reply_de: 'Verstanden.',
  is_correct: false,
  original_mistake: 'Ich möchte ein Kaffee',
  corrected_german: 'Ich möchte einen Kaffee',
  grammar_rule: 'Akkusativ: einen Kaffee',
  explanation_ar: 'بعد möchte يأتي الاسم في حالة النصب.',
});

test('PRACTICE mode shows the hint and the live correction, one /ai/turn per turn', async ({ page }) => {
  const aiTurn = countAiTurn(page);
  await bootSignedIn(page, {
    turns: [
      turn({
        ...CORRECTION_TURN,
        hints: [{ german: 'Ja, bitte einen Kaffee.', translation_ar: 'نعم، قهوة من فضلك.' }],
      }),
    ],
  });

  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();

  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich möchte ein Kaffee');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Verstanden.')).toBeVisible();

  // Help is on: the suggestion pill exists and answers the reply.
  await page.getByRole('button', { name: 'اقتراح لردّك' }).click();
  await expect(page.getByText('Ja, bitte einen Kaffee.')).toBeVisible();

  // And the correction is shown live.
  await expect(page.getByText('تصحيح كَاتْزُو')).toBeVisible();
  await expect(page.getByText('Ich möchte einen Kaffee')).toBeVisible();

  expect(aiTurn, 'exactly one chat call per typed turn').toEqual(['/ai/turn']);
});

test('REAL mode hides every aid, still reports the mistake, and its correction is answerable', async ({ page }) => {
  const aiTurn = countAiTurn(page);
  await bootSignedIn(page, {
    turns: [
      // A hint is present in the payload but REAL mode must never surface it.
      turn({
        reply_de: 'Guten Tag! Möchten Sie einen Kaffee?',
        hints: [{ german: 'Ja, bitte einen Kaffee.', translation_ar: 'نعم، قهوة من فضلك.' }],
      }),
      turn({ reply_de: 'Gerne. Einen Kaffee, bitte schön.' }),
      CORRECTION_TURN,
      turn({ reply_de: 'Sehr gern. Möchten Sie noch etwas?' }),
    ],
  });

  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'محادثة حقيقية (بدون مساعدة)' }).click();

  // No aid is present, anywhere, from the first screen.
  await expect(page.getByRole('button', { name: 'اقتراح لردّك' })).toHaveCount(0);
  await expect(page.getByText('عرض الترجمة')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /الترجمات/ })).toHaveCount(0);

  const input = page.getByPlaceholder(/Schreib deinen Satz/);
  const replies = [
    'Guten Tag! Möchten Sie einen Kaffee?',
    'Gerne. Einen Kaffee, bitte schön.',
    'Verstanden.',
    'Sehr gern. Möchten Sie noch etwas?',
  ];
  for (const reply of replies) {
    await input.fill('Ich möchte einen Kaffee bitte');
    await page.getByRole('button', { name: 'أرسل جملتك' }).click();
    await expect(page.getByText(reply)).toBeVisible();
  }

  // No live correction ever appeared, even for the turn that carried one.
  await expect(page.getByText('تصحيح كَاتْزُو')).toHaveCount(0);
  expect(aiTurn, 'exactly one /ai/turn per turn, no extra calls').toEqual([
    '/ai/turn',
    '/ai/turn',
    '/ai/turn',
    '/ai/turn',
  ]);

  // The A1 cap (4) ended the episode; the report names the mistake that was
  // hidden live.
  await expect(page).toHaveURL(/\/session-report$/, { timeout: 30_000 });
  await expect(page.getByText('تصحيحات هذه الجلسة', { exact: true })).toBeVisible();
  await expect(page.getByText('Akkusativ: einen Kaffee')).toBeVisible();
  await expect(page.getByText('Ich möchte einen Kaffee')).toBeVisible();

  // And the correction is answerable: the report's drill accepts it through the
  // review store (the item was enqueued by the REAL-mode turn).
  await page.getByPlaceholder('اكتب الجملة الصحيحة').fill('Ich möchte einen Kaffee');
  await page.getByRole('button', { name: 'تحقّق' }).click();
  await expect(page.getByText(/ستعود هذه الجملة في مراجعتك/)).toBeVisible();
});
