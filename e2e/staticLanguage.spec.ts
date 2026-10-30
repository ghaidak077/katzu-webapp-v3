import { expect, test } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The opener's Arabic and a tapped word's meaning are STATIC data now (V30).
 *
 * Two regressions are pinned here, both measured as user-visible failures before:
 *  A) the first message of a scenario showed «تعذرت الترجمة — أعد المحاولة»
 *     because the gloss came from `/ai/translate` and there is no provider key;
 *  B) tapping most German words showed «هذه الكلمة ليست في محتوى مشهدك بعد» with
 *     the part of speech «—», because the card only knew exact vocabulary rows.
 *
 * The app's own bundle now carries both answers, so the assertions run with the
 * AI endpoints BLOCKED — that is the offline guarantee, and it proves no AI call
 * is needed for either.
 */

const OPENERS = 'airport_arrival';

async function openScenario(page: import('@playwright/test').Page) {
  await bootSignedIn(page);
  await page.goto(`/scenario/${OPENERS}/live`);
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  const opener = page.locator('article[aria-label="رسالة من كَاتْزُو"]').first();
  await expect(opener).toBeVisible();
  return opener;
}

test('the opener shows its Arabic with every AI endpoint blocked', async ({ page }) => {
  const aiCalls: string[] = [];
  await page.route('**/ai/**', (route) => {
    aiCalls.push(route.request().url());
    return route.abort();
  });

  const opener = await openScenario(page);

  await expect(opener).toContainText('Guten Tag. Fehlt Ihr Koffer?');
  await expect(opener).toContainText('هل ينقصك حقيبتك؟');
  await expect(opener.getByText('تعذرت الترجمة — أعد المحاولة')).toHaveCount(0);
  expect(aiCalls, 'an opener never needs the model, even blocked').toEqual([]);
  console.log(`[ai-calls] opening a conversation: ${aiCalls.length} (was 1 /ai/translate before V30)`);
});

test('tapping a word the scene uses shows its meaning, not a dead end', async ({ page }) => {
  const aiCalls: string[] = [];
  await page.route('**/ai/**', (route) => {
    aiCalls.push(route.request().url());
    return route.abort();
  });

  const opener = await openScenario(page);

  // "Fehlt" is a verb from the opener and not a vocabulary row: exactly the word
  // the old card could not answer.
  await opener.getByText('Fehlt', { exact: true }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('ينقص');
  await expect(sheet).toContainText('فعل'); // part of speech, not «—»
  await expect(sheet).toContainText('A1');
  await expect(sheet).not.toContainText('ليست في محتوى مشهدك بعد');
  expect(aiCalls, 'a word card is answered from the bundle, never from the model').toEqual([]);
  console.log(`[ai-calls] opening a conversation + one word card: ${aiCalls.length}`);
});