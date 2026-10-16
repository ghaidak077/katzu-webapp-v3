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
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.getByTestId('round-progress')).toHaveAttribute('aria-label', /الجولة 1 من 4/);
  await expect(page.getByTestId('level-chip')).toHaveText('A1');

  // The whole point of the rule: the first episode *completes*. The mock refuses
  // any level but A1 for this account exactly as the Worker does, so a reply
  // here is proof the turn was sent at a level the trial serves.
  const input = page.getByPlaceholder(/Schreib deinen Satz/);
  await input.fill('Guten Tag');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Sehr gern. Möchten Sie noch etwas?')).toBeVisible();
  await expect(page.getByText('هذا المستوى ميزة Pro')).toHaveCount(0);
});

test('the fourth conversation ends in the Pro card, not in a retry that cannot clear', async ({ page }) => {
  // Failure state #5 from the launch audit, and the one the whole priced funnel
  // rests on: the three free conversations are spent. The mock answers exactly
  // what the Worker answers (402, `FREE_QUOTA_EXHAUSTED`, its own sentence), so
  // this is the state a real learner reaches on their fourth send.
  const events: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.endsWith('/analytics/events')) return;
    try {
      const body = JSON.parse(request.postData() || '{}');
      for (const event of body.events || []) events.push(String(event.name));
    } catch {
      /* a malformed batch is not this test's concern */
    }
  });

  await bootSignedIn(page, { freeQuotaExhausted: true });
  await page.goto('/scenario/airport_arrival/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();

  const input = page.getByPlaceholder(/Schreib deinen Satz/);
  await input.fill('Guten Tag');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();

  // The offer names the allowance in the words the learner was promised before
  // they started (B5's own `MAX_FREE_SESSIONS_AR`), not "your free sessions".
  await expect(page.getByText(/انتهت 3/)).toBeVisible({ timeout: 20_000 });
  // And it is NOT the generic failure card: before V31 a quota wall fell into
  // that branch and offered a retry no retry could ever clear.
  await expect(page.getByText('أعد المحاولة')).toHaveCount(0);
  // The top of the funnel is measured, not assumed — the event A5 added has to
  // reach the collector from the surface that hits it.
  await expect.poll(() => events.filter((name) => name === 'free_session_exhausted').length).toBeGreaterThan(0);
});

test('writing is served at the level the trial allows, never the measured one', async ({ page }) => {
  // Same free-A2 account: writing must not be the skill where "more advanced"
  // means "locked out". The task is built at A1 and the paragraph gets graded.
  await bootSignedIn(page, { user: { cefrLevel: 'A2', placementCompletedAt: Date.now() } });
  await page.goto('/app/write');

  await page.getByPlaceholder('Schreibe hier auf Deutsch…').fill('Ich möchte einen Termin am Montag bitte');
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
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.getByTestId('round-progress')).toHaveAttribute('aria-label', /الجولة 1 من 6/);
  await expect(page.getByTestId('level-chip')).toHaveText('A2');

  const input = page.getByPlaceholder(/Schreib deinen Satz/);
  await input.fill('Guten Tag');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Sehr gern. Möchten Sie noch etwas?')).toBeVisible();
});

test('a Pro row the server no longer honours stops being Pro on the next open', async ({ page }) => {
  // B2, the case the app never handled: the stored row says Pro (the learner paid
  // on another device, or was refunded since) while the server disagrees. The
  // local flag used to be whatever sign-in last wrote, so Pro survived until the
  // stored date happened to pass. Now the open reconciles it, and the visible
  // proof is the level the episode is actually served at: the same A2 account as
  // the Pro test above, minus the subscription the server honours.
  await bootSignedIn(page, {
    isPro: true,
    subscriptionActive: false,
    user: { cefrLevel: 'A2', placementCompletedAt: Date.now() },
  });

  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  // A1 and its four rounds are the trial's level; A2 and six rounds would mean the
  // demotion never happened.
  await expect(page.getByTestId('level-chip')).toHaveText('A1');
  await expect(page.getByTestId('round-progress')).toHaveAttribute('aria-label', /الجولة 1 من 4/);
});

/**
 * B4: the Pro benefit the paywall names third — «تغيير الصعوبة أثناء المحادثة» —
 * is a real control (`handleNudgeDifficulty` behind the ⋯ sheet), and it is
 * Pro-only: a free learner tapping it gets the offer instead of the level. The
 * claim is on the screen that asks for money, so it is pinned here rather than
 * left to a code read; the baseline used to record this as an unverified promise.
 */
test('the difficulty nudge is a real control, and it is Pro-only', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();

  await page.getByRole('button', { name: 'خيارات الجلسة' }).click();
  await page.getByRole('button', { name: 'أصعب' }).click();

  // The free learner is offered Pro, and the level does not move.
  await expect(page.getByText('تغيير المستوى أثناء المحادثة ميزة Pro')).toBeVisible();
  await expect(page.getByTestId('level-chip')).toHaveText('A1');
});

test('a Pro learner nudges the level mid-conversation', async ({ page }) => {
  await bootSignedIn(page, { isPro: true });
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();

  await page.getByRole('button', { name: 'خيارات الجلسة' }).click();
  await page.getByRole('button', { name: 'أصعب' }).click();

  // The level moved, and nothing was sold: this is the benefit the paywall names.
  await expect(page.getByTestId('level-chip')).toHaveText('A2');
  await expect(page.getByText('تغيير المستوى أثناء المحادثة ميزة Pro')).toHaveCount(0);
});

/**
 * B5: the free allowance is said where it is spent, not only at the wall. The
 * learner used to find out how many free conversations they had at the moment the
 * last one ran out — the worst possible moment to be told there is a limit, and
 * the worst moment to sell Pro from.
 */
test('the free allowance is stated before the first turn, from the server', async ({ page }) => {
  await bootSignedIn(page, { freeSessionsRemaining: 2 });
  await page.goto('/scenario/cafe_order/live');

  const allowance = page.getByTestId('free-allowance');
  await expect(allowance).toBeVisible();
  // Two is the dual in Arabic, not "2 جلسة" — the copy owner decides the form.
  await expect(allowance).toContainText(/محادثتان|جلستان/);
});

test('an unreadable ledger is not turned into a number', async ({ page }) => {
  // `null` from the server is "we could not check", and the honest rendering is
  // silence on this line rather than the locally-seeded 3 the app used to print.
  await bootSignedIn(page, { freeSessionsRemaining: null });
  await page.goto('/scenario/cafe_order/live');
  await expect(page.getByTestId('free-allowance')).toHaveCount(0);
});

test('a Pro learner is not shown an allowance they do not have', async ({ page }) => {
  await bootSignedIn(page, { isPro: true, freeSessionsRemaining: 3 });
  await page.goto('/scenario/cafe_order/live');
  await expect(page.getByTestId('free-allowance')).toHaveCount(0);
});

test('the last week of a paid month is named, with the way to renew it', async ({ page }) => {
  // B3: nothing told a paying learner their month was ending, so the first news
  // was the level dropping to A1 mid-episode with no explanation. The notice
  // reads the date the row already holds, so this is also the offline case.
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
  await bootSignedIn(page, {
    isPro: true,
    subscriptionExpiresAt: soon,
    user: { subscriptionExpiresAt: soon },
  });

  const card = page.getByTestId('pro-expiry-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('3 أيام');
  // It is a notice with an action, not a nag: the renewal is one tap away.
  await page.getByRole('button', { name: 'تجديد الاشتراك' }).click();
  await expect(page).toHaveURL(/\/subscription$/);
});

test('a month with weeks left is left alone', async ({ page }) => {
  // The other boundary: a countdown that runs from the day they pay is nagging,
  // and it is what teaches a learner to stop reading that part of the screen.
  await bootSignedIn(page, { isPro: true });
  await expect(page.getByTestId('pro-expiry-card')).toHaveCount(0);
});

test('the Pro offer appears on the Debrief, after the episode is finished', async ({ page }) => {
  await bootSignedIn(page, {
    turns: [
      turn({ reply_de: 'Guten Tag! Möchten Sie einen Kaffee?' }),
      turn({ reply_de: 'Gerne, einen Kaffee.' }),
      turn({ reply_de: 'Sehr gern. Möchten Sie noch etwas?' }),
      turn({ reply_de: 'Perfekt, bis bald!' }),
    ],
  });

  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();

  for (const reply of ['Guten Tag! Möchten Sie einen Kaffee?', 'Gerne, einen Kaffee.', 'Sehr gern. Möchten Sie noch etwas?', 'Perfekt, bis bald!']) {
    const input = page.getByPlaceholder(/Schreib deinen Satz/);
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

/**
 * A6: a redeem link carries the code, so the box starts filled and normalised.
 * This is the one interface a paying learner actually uses, so the prefill is
 * verified through the browser rather than by type-checking alone.
 */
test('a redeem link pre-fills the code box, normalised to uppercase', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/subscription?code=de-1m-abc123');
  await expect(page.getByLabel('كود تفعيل الاشتراك')).toHaveValue('DE-1M-ABC123');
});
