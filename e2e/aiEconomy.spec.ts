import { expect, test } from '@playwright/test';
import { bootSignedIn } from './harness';

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
  await page.goto('/scenario/airport_arrival/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.locator('article[aria-label="رسالة من كَاتْزُو"]').first()).toBeVisible();

  await page.getByRole('button', { name: 'اكتب بدلاً من التحدث' }).click();
  await page.getByPlaceholder(/اكتب جملتك بالألمانية/).fill('Mein Koffer ist nicht angekommen.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();

  await expect(page.getByText('Sehr gern. Möchten Sie noch etwas?')).toBeVisible();
  expect(aiCalls, 'one chat call per typed turn').toEqual(['/ai/turn']);
});

test('the suggestion floor answers the last AI message, not the scenario first phrase', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/airport_arrival/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.locator('article[aria-label="رسالة من كَاتْزُو"]').first()).toBeVisible();

  // The opener asks about the suitcase; the floor's first suggestion must
  // address the luggage (or be a yes/no move), never the passport line the
  // old sort_order floor opened with.
  await page.getByRole('button', { name: 'اقتراح لردّك' }).click();
  // V29: the suggestion pill and its options moved to the control bar under the
  // header, so the floor's answers are addressed there now.
  const first = page.locator('[data-testid="conversation-controls"] button').filter({ hasText: /[Gg]epäck|[Kk]offer|^Ja,|^Nein,/ }).first();
  await expect(first).toBeVisible();
  await expect(page.getByText('Guten Tag. Hier ist mein Pass.')).toHaveCount(0);
});

test('the suggestion chips offer their words to build the reply', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/airport_arrival/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.locator('article[aria-label="رسالة من كَاتْزُو"]').first()).toBeVisible();

  await page.getByRole('button', { name: 'اقتراح لردّك' }).click();

  // The words of the offered reply are tappable into the composer, so a learner
  // who is not ready to send the canned sentence can build their own from it.
  const bank = page.getByTestId('word-bank');
  await expect(bank).toBeVisible();
  const chip = bank.getByRole('button').first();
  const word = (await chip.textContent())?.trim() || '';
  await chip.click();
  await expect(page.getByPlaceholder('اكتب جملتك بالألمانية…')).toHaveValue(new RegExp(word));
});
