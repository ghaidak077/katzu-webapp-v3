import { expect, test, type Locator } from '@playwright/test';
import { bootSignedIn, openLibraryFromHome, seedRows } from './harness';
import { seedServedContent } from './servedContent';

/**
 * Stage 2 — the first three minutes, on the phone the learner actually holds.
 *
 * The flow itself is covered by onboarding/journey/paywall specs. What this file
 * defends is the part a walkthrough catches and a unit test cannot:
 *
 *  - a screen that reports an empty state without saying what to do next,
 *  - a control too small to hit one-handed,
 *  - an offer that asks for money without naming the price, what stays free, or
 *    the terms it is sold under.
 *
 * 390x844 is the iPhone 14/15 CSS viewport: the narrowest rectangle the Arabic
 * layout has to survive without clipping or losing a target.
 */
test.use({ viewport: { width: 390, height: 844 } });

/** Every control a thumb must hit, measured rather than assumed. */
async function expectTapTarget(locator: Locator, label: string) {
  await expect(locator, label).toBeVisible();
  // The Pro offer arrives inside `Modal`, which grows from `scale-95` as it opens,
  // and `boundingBox()` reports the *transformed* rectangle. Measuring during that
  // entrance read the dismiss CTA as 43.4955px on a loaded CI runner — a control
  // that is 44px the instant the dialog settles. Wait for the running animations to
  // finish first. The wait is bounded so a perpetual animation elsewhere on the
  // page cannot hang the test, and infinite loops are excluded because their
  // `finished` promise never resolves.
  await locator.evaluate(async () => {
    const running = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      return animation.playState === 'running' && timing?.iterations !== Infinity;
    });
    await Promise.race([
      Promise.all(running.map((animation) => animation.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  });
  const box = await locator.boundingBox();
  expect(box, `${label} must be laid out`).not.toBeNull();
  expect(
    Math.round(box!.height),
    `${label} must be at least 44px tall (measured ${box!.height}px)`,
  ).toBeGreaterThanOrEqual(44);
}

test('an empty mistake bank says what to do next instead of only congratulating', async ({ page }) => {
  await bootSignedIn(page, { history: true });
  await page.goto('/app/practice');

  // Launch polish: the drill tile was RENAMED «تدريب الأخطاء» so it says what
  // it opens (the retype modal), distinct from the «ملف أخطائك» patterns card.
  await page.getByRole('button', { name: 'تدريب الأخطاء' }).first().click();

  // The state, then the mechanism — a learner who has never made a recorded
  // mistake must still learn how mistakes get recorded.
  await expect(page.getByText(/بنك أخطائك فارغ الآن/)).toBeVisible();
  await expect(page.getByText(/كل خطأ يرصده كاتزو خلال مشهد/)).toBeVisible();
  await expectTapTarget(
    page.getByRole('button', { name: 'العودة إلى التدريب' }),
    'mistake-bank way forward',
  );
});

test('a saved-word list with nothing in it offers the way out', async ({ page }) => {
  await bootSignedIn(page, { history: true });
  await page.goto('/app/practice');

  await page.getByRole('button', { name: /^المحفوظة/ }).click();

  await expect(page.getByText(/لم تحفظ أي كلمة بعد/)).toBeVisible();
  const back = page.getByRole('button', { name: 'اعرض كل الكلمات' });
  await expectTapTarget(back, 'saved-list way forward');

  // And the way out actually works: the full list comes back.
  await back.click();
  await expect(page.getByText(/لم تحفظ أي كلمة بعد/)).toHaveCount(0);
  // Launch polish 4.5: the filter names the STATE («الكل (n)»), not an action
  // («ابحث في الكل» duplicated the search field above it).
  await expect(page.getByRole('button', { name: /^الكل \(/ })).toBeVisible();
});

test('the Pro offer names the price, the free tier, the terms and who sells it', async ({ page }) => {
  // L1: the price the modal shows now comes from `GET /pricing`, in dollars. This
  // assertion used to look for «دولار / شهر» — the hardcoded crypto fallback,
  // which is the defect this change removed, so the expected value moves to the
  // server's own number and the "never a placeholder" check becomes explicit.
  await bootSignedIn(page, {
    pricing: {
      prices: [
        {
          product: 'monthly',
          amountCents: 1499,
          futureCents: 2999,
          months: 1,
          recommended: false,
          currency: 'USD',
          group: 'standard',
          cell: null,
        },
        {
          product: 'quarterly',
          amountCents: 2999,
          futureCents: 5999,
          months: 3,
          recommended: false,
          currency: 'USD',
          group: 'standard',
          cell: null,
        },
        {
          product: 'halfyear',
          amountCents: 4999,
          futureCents: 9999,
          months: 6,
          recommended: true,
          currency: 'USD',
          group: 'standard',
          cell: null,
        },
        {
          product: 'yearly',
          amountCents: 9999,
          futureCents: 19999,
          months: 12,
          recommended: false,
          currency: 'USD',
          group: 'standard',
          cell: null,
        },
      ],
      group: 'standard',
      foundingCap: 1000,
      foundingEndsOn: '2027-01-31',
      refundDays: 7,
      refundPlanIds: ['quarterly', 'halfyear', 'yearly'],
      activationHours: 12,
      freeLessonsPerMonth: 3,
    },
  });

  // The unit map replaced the level pills, so the free plan's honest path to the
  // offer is a unit boundary: a learner who finished A1 sees the first A2 unit
  // as the current, expanded one, and its scenarios carry the Pro lock.
  await seedServedContent(page);
  const A1_UNIT_IDS = [
    // u1-first-words
    'first_greetings',
    'numbers_and_prices',
    'letters_and_forms',
    'supermarket_checkout',
    'bakery_shopping',
    'cafe_order',
    // u2-arrival
    'airport_arrival',
    'train_first_ride',
    'train_station',
    'pass_und_dokumente',
    'banking_first_visit',
    // u3-out-and-about
    'anmeldung_buergeramt',
    'termin_online_buchen',
    'doctor_visit',
    'friend_catchup',
    'restaurant_besonders',
  ];
  const now = Date.now();
  await seedRows(
    page,
    'sessions',
    A1_UNIT_IDS.map((scenarioId, index) => ({
      // The evidence the capability model counts as INDEPENDENT: four unaided
      // sentences above the accuracy bar.
      id: `e2e-a1-${scenarioId}`,
      scenarioId,
      scenarioTitle: scenarioId,
      cefrLevel: 'A1',
      sentencesSpoken: 4,
      wordsLearned: 12,
      accuracyPercent: 90,
      durationSeconds: 180,
      timestamp: now - index * 1_000,
      wasIndependentOnly: true,
      independentSentences: 4,
      hintAssistedSentences: 0,
      mode: 'practice',
      mistakesCount: 0,
    })),
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

  // Reach the library the way a learner does, then tap a locked A2 card — the
  // offer appears at the session boundary with the unit preview behind it.
  await openLibraryFromHome(page);
  const lockedCard = page.locator('[data-testid="trail-scenario-card"][aria-label*="تفتح مع Pro"]').first();
  await expectTapTarget(lockedCard, 'locked A2 scenario card');
  await lockedCard.click();

  await expect(page.getByText('عضوية Katzu Pro')).toBeVisible();

  // The price is the server's, in its currency, never absent and never a
  // placeholder — and never the retired hardcoded dollar fallback.
  await expect(page.getByTestId('modal-price-halfyear')).toHaveText('$49.99');
  await expect(page.getByTestId('modal-future-halfyear')).toHaveText('$99.99');
  await expect(page.getByTestId('modal-price-monthly')).toHaveText('$14.99');
  await expect(page.getByTestId('modal-price-yearly')).toHaveText('$99.99');
  await expect(page.getByText(/\$0|— \$|غير متاح/)).toHaveCount(0);

  // What Pro unlocks, and — just as importantly — what stays free forever.
  await expect(page.getByText('ما يفتحه Pro:')).toBeVisible();
  await expect(page.getByText('ويبقى مجانياً دائماً:')).toBeVisible();

  // Both ways in: buy a code, or redeem one already held.
  await expectTapTarget(page.getByRole('link', { name: 'اشترِ كود تفعيل Pro' }), 'buy CTA');
  await expectTapTarget(
    page.getByRole('button', { name: /لديّ كود بالفعل/ }),
    'redeem CTA',
  );
  await expectTapTarget(
    page.getByRole('button', { name: /تابع مجاناً/ }),
    'dismiss CTA',
  );

  // The legal pages a payment implies, linked to the real public routes. They
  // moved off the app on 2026-10-28: the marketing site renders every legal
  // section inline on `/help`, and the old `/trust/*` URLs are single-hop 301s.
  await expectTapTarget(page.getByRole('link', { name: 'سياسة الخصوصية' }), 'privacy link');
  await expect(page.getByRole('link', { name: 'سياسة الخصوصية' })).toHaveAttribute(
    'href',
    'https://website.katzuai.com/help#privacy',
  );
  await expect(page.getByRole('link', { name: 'شروط الاستخدام' })).toHaveAttribute(
    'href',
    'https://website.katzuai.com/help#terms',
  );

  // No manufactured pressure and no invented social proof.
  await expect(
    page.getByText(/ينتهي العرض|عرض محدود|آخر فرصة|باقي \d+|السعر سيرتفع|يوصي|آلاف المتعلمين/),
  ).toHaveCount(0);
});
