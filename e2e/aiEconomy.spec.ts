import { expect, test } from '@playwright/test';
import { bootSignedIn, turn } from './harness';

/**
 * The AI economy of the conversation, asserted as counts (V19 Phase 2).
 *
 * Phase 0 measured the baseline: every screen open spent one `/ai/translate`
 * before the learner said anything, and the hint floor ignored the last AI
 * message. The contract now:
 *  - opening the conversation and reading the opener costs ZERO `/ai/*` calls;
 *  - the opener's Arabic comes from stored data (it is on screen without any
 *    model round-trip);
 *  - a typed learner turn costs exactly ONE `/ai/turn` and nothing else.
 *
 * The mock records every AI request; the assertions are on that record, so a
 * regression here is a count, not an impression.
 */

test('opening the conversation makes zero AI calls and shows the stored opener gloss', async ({ page }) => {
  const aiCalls: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!url.hostname.includes('e2e-worker.test')) return;
    if (url.pathname.startsWith('/ai/')) aiCalls.push(url.pathname);
  });

  await bootSignedIn(page);
  await page.goto('/scenario/airport_arrival/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();

  // The opener bubble is on screen with its Arabic gloss (stored data — the
  // mock's translate answer is 'ترجمة الاختبار', which must NOT be needed).
  const opener = page.locator('article[aria-label="رسالة من كَاتْزُو"]').first();
  await expect(opener).toContainText('Guten Tag. Fehlt Ihr Koffer?');
  await expect(opener).toContainText('هل ينقصك حقيبتك؟');
  await expect(opener.getByText('عرض الترجمة')).toHaveCount(0); // nothing pending

  // Settle, then count.
  await page.waitForTimeout(600);
  expect(aiCalls, 'no /ai/* before the first learner message').toEqual([]);
});

test('a typed turn costs exactly one /ai/turn and no other AI call', async ({ page }) => {
  const aiCalls: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!url.hostname.includes('e2e-worker.test')) return;
    if (url.pathname.startsWith('/ai/')) aiCalls.push(url.pathname);
  });

  await bootSignedIn(page);
  await page.goto('/scenario/friend_catchup/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.locator('article[aria-label="رسالة من كَاتْزُو"]').first()).toBeVisible();

  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Mein Koffer ist nicht angekommen.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();

  await expect(page.getByText('Sehr gern. Möchten Sie noch etwas?')).toBeVisible();
  expect(aiCalls, 'one chat call per typed turn').toEqual(['/ai/turn']);
});

test('hints are AI only: no authored floor is offered before a turn', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/airport_arrival/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.locator('article[aria-label="رسالة من كَاتْزُو"]').first()).toBeVisible();

  // 2026-11-10: the stored starter-phrase floor is gone. With no model hint for
  // this turn the sheet offers ONE small AI call («اطلب تلميحاً»), never a
  // stored sentence dressed as the persona's suggestion.
  await page.getByRole('button', { name: 'اقتراح لردّك' }).click();
  await expect(page.getByTestId('request-hint')).toBeVisible();
  await expect(page.getByText('Guten Tag. Hier ist mein Pass.')).toHaveCount(0);
  await expect(page.getByText(/Hier ist mein Pass/)).toHaveCount(0);
});

test('the suggestion chips offer their words to build the reply', async ({ page }) => {
  await bootSignedIn(page, {
    turns: [
      turn({
        reply_de: 'Guten Tag! Fehlt Ihr Koffer?',
        hint_de: 'Ja, mein Koffer fehlt.',
        hint_ar: 'نعم، حقيبتي مفقودة.',
      }),
    ],
  });
  await page.goto('/scenario/airport_arrival/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.locator('article[aria-label="رسالة من كَاتْزُو"]').first()).toBeVisible();

  // A hint exists only after a turn that carried one (AI only, no starter floor).
  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Mein Koffer ist weg.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Guten Tag! Fehlt Ihr Koffer?')).toBeVisible();

  await page.getByRole('button', { name: 'اقتراح لردّك' }).click();

  // The words of the offered reply are tappable into the composer, so a learner
  // who is not ready to send the canned sentence can build their own from it.
  const bank = page.getByTestId('word-bank');
  await expect(bank).toBeVisible();
  const chip = bank.getByRole('button').first();
  const word = (await chip.textContent())?.trim() || '';
  await chip.click();
  await expect(page.getByPlaceholder('Schreib deinen Satz…')).toHaveValue(new RegExp(word));
});
