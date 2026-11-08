import { expect, test } from '@playwright/test';
import { bootSignedIn, turn } from './harness';
import { seedServedContent } from './servedContent';

/**
 * The scripted conversation's AI half (V34).
 *
 * The app owns the arc of a migrated scene: which question is on screen, what
 * counts as an answer, and what is asked next. The model owns the human part:
 * reading the learner's sentence, reacting in character, and writing a hint for
 * THIS attempt. These tests assert the wire carries that contract and that a
 * model which understands nothing cannot move the scene on.
 */

/** The body of the one `/ai/turn` the scripted branch sends. */
async function captureScriptTurn(page: import('@playwright/test').Page): Promise<Record<string, unknown>> {
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/ai/turn'),
    page.getByRole('button', { name: 'أرسل جملتك' }).click(),
  ]);
  return JSON.parse(request.postData() || '{}') as Record<string, unknown>;
}

test('a scripted turn sends the question packet, not a free-form prompt', async ({ page }) => {
  await bootSignedIn(page, {
    turns: [turn({ reply_de: 'Alles klar.', reply_ar: 'كل شيء واضح.' })],
  });
  // A served learner has the 49 scenario rows; the offline seed has six and
  // none of them is first_greetings, so without this the live screen has no
  // scenario row and silently keeps the legacy engine.
  await seedServedContent(page);
  await page.goto('/scenario/first_greetings/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();

  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich heiße Ghaidak.');
  const body = await captureScriptTurn(page);

  const context = body.script_context as Record<string, unknown>;
  expect(context, 'the scripted packet rides the existing /ai/turn call').toBeTruthy();
  expect(context.step_id).toBe('name');
  expect(context.slot).toBe('name');
  expect(String(context.question_de)).toContain('Wie heißt du');
  expect(String(context.question_de)).not.toContain('Woher');
});

test('a model that did not read the answer cannot move the scene on', async ({ page }) => {
  // The learner says they are tired, not their name. The model says so, and the
  // script re-asks the SAME question instead of treating "müde" as a name.
  await bootSignedIn(page, {
    turns: [
      turn({
        reply_de: 'Alles klar.',
        reply_ar: 'كل شيء واضح.',
        script_matched: false,
      }),
      turn({ reply_de: 'Freut mich!', reply_ar: 'سعيد بمعرفتك!' }),
    ],
  });
  // A served learner has the 49 scenario rows; the offline seed has six and
  // none of them is first_greetings, so without this the live screen has no
  // scenario row and silently keeps the legacy engine.
  await seedServedContent(page);
  await page.goto('/scenario/first_greetings/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();

  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich bin müde.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();

  await expect(page.getByText('Alles klar.')).toBeVisible();
  // The same question, reworded — never the next step and never the name "Müde".
  await expect(page.getByText(/wie ist dein Name|Wie darf ich dich nennen/i)).toBeVisible();
  await expect(page.getByText(/Woher kommst du/)).toHaveCount(0);
  await expect(page.getByText(/Freut mich, Müde/)).toHaveCount(0);
});

test('the hint dock shows the repair the model wrote for the failed attempt', async ({ page }) => {
  await bootSignedIn(page, {
    turns: [
      turn({
        reply_de: 'Kein Problem.',
        reply_ar: 'لا مشكلة.',
        script_matched: false,
        script_hint_de: 'Ich heiße Ghaidak.',
        script_hint_ar: 'اسمي غيدق.',
      }),
    ],
  });
  // A served learner has the 49 scenario rows; the offline seed has six and
  // none of them is first_greetings, so without this the live screen has no
  // scenario row and silently keeps the legacy engine.
  await seedServedContent(page);
  await page.goto('/scenario/first_greetings/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();

  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich bin müde.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();

  const dock = page.getByTestId('hint-dock');
  await expect(dock).toContainText('Ich heiße Ghaidak.');
  // It is the model's repair, not the authored placeholder that was on screen
  // before the attempt.
  await expect(dock).not.toContainText('Ich heiße ___.');
});
