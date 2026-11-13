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

test('hints are AI only: no authored floor is offered, and a missing hint asks for one', async ({ page }) => {
  const aiCalls: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!url.hostname.includes('e2e-worker.test')) return;
    if (url.pathname.startsWith('/ai/')) aiCalls.push(url.pathname);
  });

  // A scripted turn with NO hint: the reply arrives, the hint does not.
  await bootSignedIn(page, { turns: [turn({ reply_de: 'Oh! Ihr Koffer fehlt. Wie sieht er aus?' })] });
  await page.goto('/scenario/airport_arrival/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.locator('article[aria-label="رسالة من كَاتْزُو"]').first()).toBeVisible();

  // 2026-11-13: the stored starter-phrase floor, the word bank and the
  // «اقتراح لردّك» sheet are gone. Before any turn there is no hint at all —
  // not a stored sentence dressed as the persona's suggestion.
  await expect(page.getByTestId('hint-dock')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'اقتراح لردّك' })).toHaveCount(0);
  await expect(page.getByText(/Hier ist mein Pass/)).toHaveCount(0);

  // The mock's turn carries no hint, so after it the screen asks for one
  // («اطلب تلميحاً») instead of inventing a sentence: exactly ONE small call.
  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Mein Koffer ist weg.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Oh! Ihr Koffer fehlt. Wie sieht er aus?')).toBeVisible();
  const ask = page.getByTestId('hint-request').getByRole('button');
  await expect(ask).toBeVisible();
  const before = aiCalls.filter((p) => p === '/ai/hints').length;
  await ask.click();
  await expect
    .poll(() => aiCalls.filter((p) => p === '/ai/hints').length, { timeout: 5000 })
    .toBe(before + 1);
  // The mock answers with no hints, so nothing is dressed up as one.
  await expect(page.getByTestId('hint-dock')).toHaveCount(0);
  await expect(page.getByText(/Hier ist mein Pass/)).toHaveCount(0);
});

test('a hint rides the reply: it is shown, never inserted and never sent', async ({ page }) => {
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

  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Mein Koffer ist weg.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Guten Tag! Fehlt Ihr Koffer?')).toBeVisible();

  // The hint dock: the same response's sentence, its Arabic, hear/slow/type.
  const dock = page.getByTestId('hint-dock');
  await expect(dock).toContainText('Ja, mein Koffer fehlt.');
  await expect(dock).toContainText('نعم، حقيبتي مفقودة.');
  await expect(dock.getByRole('button', { name: /سمّعني/ })).toBeVisible();
  await expect(dock.getByRole('button', { name: /ببطء/ })).toBeVisible();

  // «قلها» only moves the caret: a hint is never inserted and never sent, so the
  // learner still produces the sentence and the report can see they did.
  const composer = page.getByPlaceholder(/Schreib deinen Satz/);
  const turnsBefore = await page.locator('article[aria-label="رسالة من كَاتْزُو"]').count();
  await dock.getByRole('button', { name: /قلها/ }).click();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue('');
  expect(await page.locator('article[aria-label="رسالة من كَاتْزُو"]').count()).toBe(turnsBefore);
  expect(await page.getByTestId('hint-request').count(), 'a shown hint needs no request').toBe(0);
});
