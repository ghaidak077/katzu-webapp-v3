import { expect, test } from '@playwright/test';
import { bootSignedIn, seedStoreRow, turn } from './harness';

/**
 * The reported A1 session, replayed on the built bundle.
 *
 * «أول الكلمات: مرحباً ومع السلامة» produced four defects at once:
 *  1. the app's own question «Wie heißt du nochmal, bitte?» came back corrected
 *     (the name rule read «du» as a person's name);
 *  2. «Ich heiße ghaidak» was corrected with an invented final period;
 *  3. the hint sheet was empty after «Wie geht es dir?»;
 *  4. the hints offered café/tea lines in a greetings scene.
 *
 * This test drives exactly those turns through the same local rules the screen
 * uses, so a regression is a visible assertion, not an impression.
 */

test('the first-words session is corrected and hinted correctly', async ({ page }) => {
  const corrections = page.getByText('تصحيح كَاتْزُو');

  await bootSignedIn(page, {
    turns: [
      turn({ reply_de: 'Wie heißt du nochmal, bitte?', is_correct: true }),
      turn({ reply_de: 'Schön, Ghaidak. Wie geht es dir?', is_correct: true }),
    ],
  });

  // The offline seed only ships a handful of scenes, and `first_greetings` is
  // not one of them: the app reads the opener from Dexie, so the row has to be
  // there before the route can render it. Seed the same shape the curriculum
  // loader writes.
  await seedStoreRow(page, 'scenarios', {
    id: 'first_greetings',
    title_de: 'Erste Wörter: Hallo und Tschüss',
    title_ar: 'أول الكلمات: مرحباً ومع السلامة',
    ai_persona: 'Nachbarin katze',
    category: 'daily_life',
    icon: 'hand',
    initial_message_a0: 'Hallo! Wie heißt du?',
    initial_message_a1: 'Hallo! Ich bin Frau Yilmaz. Wie heißt du?',
    initial_message_a2: 'Hallo, ich wohne neu hier. Wie heißt du?',
    initial_message_b1: 'Hallo! Ich bin neu in der Straße. Wie heißt du, und woher kommst du?',
    initial_message_b2: 'Hallo! Ich bin letzte Woche eingezogen. Wie heißt du, und wie gefällt dir die Nachbarschaft?',
  });

  await page.goto('/scenario/first_greetings/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.locator('article[aria-label="رسالة من كَاتْزُو"]').first()).toBeVisible();

  // 1. The app's own correct question is never "corrected".
  const input = page.getByPlaceholder(/Schreib deinen Satz/);
  await input.fill('Wie heißt du nochmal, bitte?');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Wie heißt du nochmal, bitte?').last()).toBeVisible();
  await expect(corrections).toHaveCount(0);

  // 2. One real capitalisation error, no silent final period.
  await input.fill('Ich heiße ghaidak');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(corrections).toBeVisible();
  await expect(page.getByText(/^Ich heiße Ghaidak$/)).toBeVisible();
  await expect(page.getByText('قريب! بقي تصحيح واحد.')).toBeVisible();
  await expect(page.getByText(/^Ich heiße Ghaidak\.$/)).toHaveCount(0);

  // 3 + 4. After «Wie geht es dir?» the sheet is non-empty, the direct answer is
  // first, and a greetings scene never offers café lines.
  await expect(page.getByText('Schön, Ghaidak. Wie geht es dir?')).toBeVisible();
  await page.getByRole('button', { name: 'اقتراح لردّك' }).click();
  const chips = page.locator('[data-testid="conversation-controls"] button');
  await expect(chips.first()).toContainText('Mir geht es gut, danke.');
  await expect(page.getByText(/Tee|Kaffee|Kuchen/i)).toHaveCount(0);
});
