import { expect, test } from '@playwright/test';
import { bootSignedIn, turn } from './harness';

/**
 * The reported A1 session, replayed on the built bundle.
 *
 * The conversation below runs on an UNMIGRATED scene (`landlord_followup`), so
 * it still exercises the model-driven engine and its local corrector/hint rules.
 * The scripted scenes have their own gate (`tests/scenarioScript.test.ts`).
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
      turn({ reply_de: 'Wie heißt du nochmal, bitte?' }),
      turn({
        reply_de: 'Schön, Ghaidak. Wie geht es dir?',
        // The persona read the name and spelled it with ß — the only fix it made.
        // (A capital-letter-only fix is deliberately not a chip: case alone is
        // not a correction, so this case has to be a real spelling fix.)
        understood_de: 'Ich heiße Ghaidak',
        fix_reason_ar: 'اكتب ß بدل s في heiße.',
        // The persona's own next sentence is what the dock offers — a greeting
        // answer, never the scene's café/landlord starter lines.
        hint_de: 'Mir geht es gut, danke.',
        hint_ar: 'أنا بخير، شكراً.',
      }),
    ],
  });

  await page.goto('/scenario/landlord_followup/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.locator('article[aria-label="رسالة من كَاتْزُو"]').first()).toBeVisible();

  // 1. The app's own correct question is never "corrected".
  const input = page.getByPlaceholder(/Schreib deinen Satz/);
  await input.fill('Wie heißt du nochmal, bitte?');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Wie heißt du nochmal, bitte?').last()).toBeVisible();
  await expect(corrections).toHaveCount(0);

  // 2. One real capitalisation error, no silent final period.
  await input.fill('Ich heise Ghaidak');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  // The card is collapsed to a quiet chip under the learner's own line.
  await page.getByText(/تصحيح صغير/).click();
  await expect(corrections).toBeVisible();
  await expect(page.getByText(/^Ich heiße Ghaidak$/)).toBeVisible();
  await expect(page.getByText('قريب! بقي تصحيح واحد.')).toBeVisible();
  await expect(page.getByText(/^Ich heiße Ghaidak\.$/)).toHaveCount(0);

  // 3 + 4. After «Wie geht es dir?» the dock carries the reply's own hint — a
  // greeting answer, not a stored starter line — and a greetings scene never
  // offers café lines.
  await expect(page.getByText('Schön, Ghaidak. Wie geht es dir?')).toBeVisible();
  await expect(page.getByTestId('hint-dock')).toContainText('Mir geht es gut, danke.');
  await expect(page.getByTestId('hint-dock')).not.toContainText(/Tee|Kaffee|Kuchen|Heizung/i);
  await expect(page.getByRole('button', { name: 'اقتراح لردّك' })).toHaveCount(0);
});
