import { expect, test } from '@playwright/test';
import { bootSignedIn, turn } from './harness';

const PRO_OFFER_TITLE = 'ما يفتحه Pro — وما يبقى مجانياً';

/**
 * The paywall rule, as a browser test.
 *
 * Three claims to defend: nothing gates the learner before they have finished a
 * real episode (at any level, in any skill), the free tier is served at a level
 * the Worker actually accepts, and the Pro offer appears afterwards — on the
 * Debrief, next to the evidence, where it can be read and ignored.
 *
 * The backend mock refuses any level but A1 for a free account, exactly as
 * `checkUserEntitlement` does, so a screen that offers a level the deployed
 * Worker rejects fails here rather than passing green.
 */
test('an A2 learner is not gated before their first episode', async ({ page }) => {
  // The level that used to be locked behind Pro on Journey Home.
  await bootSignedIn(page, { user: { cefrLevel: 'A2', placementCompletedAt: Date.now() } });

  // No upgrade surface on arrival.
  await expect(page.getByText('عضوية Katzu Pro')).toHaveCount(0);
  await expect(page.getByText(/يُفتح مع Pro|ميزة Pro/)).toHaveCount(0);

  // And today's mission opens the episode instead of a wall. The label is the
  // plan's own, so it differs by mission — what matters here is that it opens the
  // episode rather than a paywall.
  // `ابدأ تدريب` rather than `تدريب`, so the bottom navigation's "التدريب" tab is
  // not matched as well as the mission's own action.
  const primary = page.getByRole('button', { name: /ابدأ مهمة اليوم|ابدأ من لحظة الوصول|أكمل من حيث توقفت|ابدأ مشهداً جديداً|ابدأ تدريب/ });
  await expect(primary).toBeEnabled();
  await primary.click();
  await expect(page).toHaveURL(/\/scenario\/(.+)\/story$/);
  const scenarioId = new URL(page.url()).pathname.split('/')[2];

  // The free mission runs at the level the trial actually serves, and says so.
  // A measured A2 cannot buy an A2 conversation, so promising one here would
  // send the learner into a wall on their own first turn.
  await page.goto(`/scenario/${scenarioId}/live`);
  await page.getByRole('button', { name: 'تمرين سريع' }).click();
  await expect(page.getByText(/الجولة 1 من 3 · A1/)).toBeVisible();

  // The whole point of the rule: the first episode *completes*. The mock refuses
  // any level but A1 for this account exactly as the Worker does, so a reply
  // here is proof the turn was sent at a level the trial serves.
  const input = page.getByPlaceholder(/اكتب جملتك بالألمانية|أنا أستمع إليك/);
  await input.fill('Guten Tag');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Sehr gern. Möchten Sie noch etwas?')).toBeVisible();
  await expect(page.getByText('هذا المستوى ميزة Pro')).toHaveCount(0);
});

test('writing is served at the level the trial allows, never the measured one', async ({ page }) => {
  // Same free-A2 account: writing must not be the skill where "more advanced"
  // means "locked out". The task is built at A1 and the paragraph gets graded.
  await bootSignedIn(page, { user: { cefrLevel: 'A2', placementCompletedAt: Date.now() } });
  await page.goto('/app/write');

  await page.getByPlaceholder('Schreiben Sie hier auf Deutsch...').fill('Ich möchte einen Termin am Montag bitte');
  await page.getByRole('button', { name: 'صحّح نصّي' }).click();

  await expect(page.getByText('85%')).toBeVisible();
  await expect(page.getByText(/تتطلب اشتراك Katzu Pro/)).toHaveCount(0);
});

test('a Pro learner runs the episode at their own measured level', async ({ page }) => {
  // The other half of the rule: Pro must not be a downgrade. Same A2 account,
  // now subscribed — the conversation is served at A2 and the pacing follows it.
  await bootSignedIn(page, {
    isPro: true,
    user: { cefrLevel: 'A2', placementCompletedAt: Date.now() },
  });

  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تمرين سريع' }).click();
  await expect(page.getByText(/الجولة 1 من 4 · A2/)).toBeVisible();

  const input = page.getByPlaceholder(/اكتب جملتك بالألمانية|أنا أستمع إليك/);
  await input.fill('Guten Tag');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Sehr gern. Möchten Sie noch etwas?')).toBeVisible();
});

test('the Pro offer appears on the Debrief, after the episode is finished', async ({ page }) => {
  await bootSignedIn(page, {
    turns: [
      turn({ reply_de: 'Guten Tag! Möchten Sie einen Kaffee?' }),
      turn({ reply_de: 'Gerne, einen Kaffee.' }),
      turn({ reply_de: 'Sehr gern. Möchten Sie noch etwas?' }),
    ],
  });

  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تمرين سريع' }).click();

  for (const reply of ['Guten Tag! Möchten Sie einen Kaffee?', 'Gerne, einen Kaffee.', 'Sehr gern. Möchten Sie noch etwas?']) {
    const input = page.getByPlaceholder(/اكتب جملتك بالألمانية|أنا أستمع إليك/);
    await input.fill('Ich möchte einen Kaffee bitte');
    await page.getByRole('button', { name: 'أرسل جملتك' }).click();
    await expect(page.getByText(reply)).toBeVisible();
  }

  await expect(page).toHaveURL(/\/session-report$/, { timeout: 30_000 });

  // The offer is a card, not a wall: the learner's own next step is still the
  // primary action, and nothing here blocks a return to the journey.
  await expect(page.getByText(PRO_OFFER_TITLE)).toBeVisible();
  await expect(page.getByRole('button', { name: 'تفاصيل Pro' })).toBeVisible();
  // No urgency devices anywhere on the screen.
  await expect(page.getByText(/ينتهي العرض|عرض محدود|آخر فرصة|باقي \d+|السعر سيرتفع/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'العودة إلى الرحلة' })).toBeVisible();
});
