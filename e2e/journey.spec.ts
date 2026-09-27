import { expect, test } from '@playwright/test';
import { bootSignedIn, orb, say, silence, turn } from './harness';

/**
 * The daily episode, end to end, in a real browser.
 *
 * One test per screen, and each asserts on what the screen *claims* — the
 * evidence list, the honest wording of a graded moment, the single primary
 * action — because those are the parts a typecheck cannot see. The last test
 * walks the whole loop into the Debrief, which is the only way to prove the
 * hand-off between the five screens actually happens.
 */

test('Journey Home shows one mission, one action, and a real day count', async ({ page }) => {
  await bootSignedIn(page);

  await expect(page.getByText(/اليوم 1 · الفصل 1 من/)).toBeVisible();

  const primary = page.getByRole('button', { name: 'ابدأ مهمة اليوم' });
  await expect(primary).toBeVisible();
  await expect(primary).toBeEnabled();
  // Exactly one primary action: no competing hero card next to it.
  await expect(page.getByRole('button', { name: /ابدأ مهمة اليوم|راجع .* الآن/ })).toHaveCount(1);

  await primary.click();
  await expect(page).toHaveURL(/\/scenario\/.+\/story$/);
});

/**
 * The episode screens are lazily imported and this suite shares one CPU with the
 * dev server. Until the chunk arrives React keeps the previous screen mounted, so
 * the URL is already `/story` while Journey Home is still painted — and Journey
 * Home's German title satisfies an LTR probe on its own. Gate on a control only
 * this screen has, and allow for a cold chunk on a single core.
 */
const EPISODE_READY_MS = 45_000;

test('Story Setup introduces a situation, not a settings screen', async ({ page }) => {
  await bootSignedIn(page);

  await page.getByRole('button', { name: 'ابدأ مهمة اليوم' }).click();
  await expect(page).toHaveURL(/\/scenario\/.+\/story$/);

  // Two ways out of the opening, and only one of them is the primary action.
  const start = page.getByRole('button', { name: 'بدء' });
  await expect(start).toBeVisible({ timeout: EPISODE_READY_MS });
  await expect(page.getByRole('button', { name: 'ليس الآن' })).toBeVisible();

  // A real German opener from the scenario content, isolated LTR. Asserted after
  // the screen's own control, so this can only match the opener card.
  const opener = page.locator('[dir="ltr"]').first();
  await expect(opener).toBeVisible();
  await expect(opener).not.toBeEmpty();

  await start.click();
  await expect(page).toHaveURL(/\/scenario\/.+\/practice$/);
});

/**
 * The thinking indicator must survive the episode opening.
 *
 * Regression, measured before the fix: the indicator's WebGL cleanup forced
 * `WEBGL_lose_context.loseContext()` on unmount. The next mount asks the *same*
 * canvas for a context and gets the same **lost** one back (verified in-page:
 * `isContextLost()` true, `getShaderParameter` → null), so the compile was reported
 * as a failure — empty info log, `"shader compile error"` — and the indicator stayed
 * an empty box for the rest of its life. That is what this asserts.
 *
 * Wall-clock stalls are deliberately *not* asserted here. The same transition was
 * measured from 77 ms to 48.6 s in this sandbox, and the range tracks CPU contention
 * with the dev server (one core), not the app: the identical GL call that appeared to
 * block for 9,303 ms inside the app took 98 ms on a quiet page. A timing budget here
 * would be a test of the machine. The measurements live in
 * `KATZU_V2_IMPLEMENTATION_LOG.md` instead.
 */
test('the thinking indicator survives the episode opening', async ({ page }) => {
  const failedSetups: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('[SiriWave] shader setup failed')) failedSetups.push(message.text());
  });

  await bootSignedIn(page);
  await page.getByRole('button', { name: 'ابدأ مهمة اليوم' }).click();

  // The indicator is on screen while the opener's translation is in flight, and the
  // gloss arriving is what unmounts it — the transition the regression lived in.
  await expect(page.locator('canvas.kz-animated').first()).toBeVisible({ timeout: EPISODE_READY_MS });
  await expect(page.getByText('ترجمة الاختبار')).toBeVisible();
  await page.waitForTimeout(500);

  expect(failedSetups).toHaveLength(0);
});

test('a scenario that is not on the device says so and keeps a way back', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/not_on_this_device/story');

  // An absent row is stated, never hidden behind a permanent "loading" — and the
  // failure state offers the trail instead of trapping the learner on it.
  await expect(page.getByText('لم نجد هذا المشهد على هذا الجهاز بعد.')).toBeVisible();
  await page.getByRole('button', { name: 'العودة' }).click();
  await expect(page).toHaveURL(/\/app\/trail$/);
});

test('Guided Practice rehearses real lines and grades honestly', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/cafe_order/practice');

  // Real content cards, never a placeholder deck.
  const cards = page.getByRole('button', { name: /^استمع: / });
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
  expect(await cards.count()).toBeLessThanOrEqual(3);

  // Retrieval: the honest path states the correct sentence instead of implying
  // the learner produced it.
  await page.getByRole('button', { name: 'أرني الصحيحة' }).click();
  await expect(page.getByText(/الجملة الصحيحة:/)).toBeVisible();

  // Listening: a repeat is reported as word coverage, never as a pronunciation
  // score the app cannot measure.
  await page.getByRole('button', { name: 'كرّر بصوتك' }).click();
  // Wait for the microphone to be open before speaking — the same gate the live
  // conversation's test uses. Without it the tone could be raised and dropped
  // while `getUserMedia` was still resolving, and the app's honest "we heard no
  // clear sentence" state would be the test's fault, not the app's.
  await expect(page.getByRole('button', { name: 'أوقف التسجيل' })).toBeVisible();
  await say(page, 'Guten Tag, ich möchte einen Kaffee bitte');
  await silence(page);
  await expect(page.getByText(/سمعنا /)).toBeVisible();

  await page.getByRole('button', { name: 'أنا جاهز' }).click();
  await expect(page).toHaveURL(/\/scenario\/.+\/live$/);
});

test('Live Interaction runs a turn with the orb and keeps the typed path open', async ({ page }) => {
  // A real turn takes a moment; the delay is what makes the orb's in-flight
  // state observable at all (an instant reply would skip straight to feedback).
  await bootSignedIn(page, { turnDelayMs: 900 });
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تمرين سريع' }).click();

  // Turn one of three at A1 — pacing comes from the tested rule, not the screen.
  await expect(page.getByText(/الجولة 1 من 3/)).toBeVisible();

  // The orb is the microphone control, and says which state it is in.
  await expect(orb(page)).toHaveAttribute('aria-label', 'ابدأ التحدث');
  await orb(page).click();
  await expect(orb(page)).toHaveAttribute('aria-label', 'إيقاف التسجيل');
  await expect(page.getByText('أنا أستمع إليك… تحدث الآن')).toBeVisible();

  // The learner speaks and stops; the app's own endpointing ends the recording,
  // the worker recognises it, and the sentence lands in the LTR input.
  await say(page, 'Guten Tag, ich möchte einen Kaffee bitte');
  await silence(page);
  const input = page.getByPlaceholder(/اكتب جملتك بالألمانية|أنا أستمع إليك/);
  await expect(input).toHaveValue('Guten Tag, ich möchte einen Kaffee bitte');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();

  // In flight the orb says what it is doing rather than showing a spinner.
  await expect(page.getByRole('button', { name: 'كَاتْزُو يعمل على ردّك' })).toBeVisible();
  await expect(page.getByText('Sehr gern. Möchten Sie noch etwas?')).toBeVisible();
  await expect(page.getByText(/الجولة 2 من 3/)).toBeVisible();

  // The typed path is always one tap away, never behind a failure.
  await page.getByRole('button', { name: 'اكتب بدلاً من التحدث' }).click();
  await expect(input).toBeFocused();
});

test('the whole loop ends on a Debrief that states only what was measured', async ({ page }) => {
  await bootSignedIn(page, {
    turns: [
      turn({ reply_de: 'Guten Tag! Möchten Sie einen Kaffee?' }),
      turn({
        reply_de: 'Gerne. Einen Kaffee, bitte schön.',
        is_correct: false,
        original_mistake: 'Ich möchte ein Kaffee',
        corrected_german: 'Ich möchte einen Kaffee',
        grammar_rule: 'Akkusativ: einen Kaffee',
        explanation_ar: 'بعد möchte يأتي الاسم في حالة النصب.',
      }),
      turn({ reply_de: 'Sehr gern. Möchten Sie noch etwas?' }),
    ],
  });

  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تمرين سريع' }).click();

  const replies = [
    'Guten Tag! Möchten Sie einen Kaffee?',
    'Gerne. Einen Kaffee, bitte schön.',
    'Sehr gern. Möchten Sie noch etwas?',
  ];

  for (const reply of replies) {
    const input = page.getByPlaceholder(/اكتب جملتك بالألمانية|أنا أستمع إليك/);
    await input.fill('Ich möchte einen Kaffee bitte');
    await page.getByRole('button', { name: 'أرسل جملتك' }).click();
    // Each turn's own reply is the completion signal; the state machine refuses a
    // second submit while a turn is in flight (by design), so this cannot race.
    await expect(page.getByText(reply)).toBeVisible();
  }

  // The hand-off is delayed on purpose (the learner reads the last reply first),
  // so this waits rather than asserting instantly.
  await expect(page).toHaveURL(/\/session-report$/, { timeout: 30_000 });

  await expect(page.getByText('ملخّص الجلسة')).toBeVisible();
  // Evidence, not celebration: both numbers trace back to the three turns sent.
  await expect(page.getByText('جُمل نطقتها بلا مساعدة')).toBeVisible();
  await expect(page.getByText('تصحيحات هذه الجلسة', { exact: true })).toBeVisible();
  await expect(page.getByText('أبرز ما يحتاج تثبيتاً')).toBeVisible();
  // The correction from turn two is the one the Debrief names.
  await expect(page.getByText('Akkusativ: einen Kaffee')).toBeVisible();
  await expect(page.getByText('إنجاز رائع يا بطل')).toHaveCount(0);
});

/**
 * The live caption, and the engine that produces it.
 *
 * The platform recogniser returns words while the learner is still speaking, which
 * is what makes the conversation feel live instead of transcribed-after-the-fact.
 * `interimHoldMs` holds the interim open long enough to assert it on a sandbox that
 * dilates timers; the app itself never waits for anything here.
 */
test('the learner sees their own German while they are still speaking', async ({ page }) => {
  await bootSignedIn(page, { interimHoldMs: 1500 });
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تمرين سريع' }).click();

  await expect(orb(page)).toHaveAttribute('aria-label', 'ابدأ التحدث');
  await orb(page).click();
  await expect(orb(page)).toHaveAttribute('aria-label', 'إيقاف التسجيل');

  await say(page, 'Guten Tag, ich möchte einen Kaffee bitte');
  const caption = page.getByTestId('live-caption');
  await expect(caption).toBeVisible();
  await expect(caption).toContainText('Guten Tag');

  // The final result still lands in the composer, and the caption goes away with
  // the session that produced it.
  const input = page.getByPlaceholder(/اكتب جملتك بالألمانية|أنا أستمع إليك/);
  await expect(input).toHaveValue('Guten Tag, ich möchte einen Kaffee bitte');
  await expect(caption).toHaveCount(0);
});

/**
 * The browser with no platform recogniser at all — every Firefox learner, and any
 * device whose engine refuses the job.
 *
 * Same test body as the conversation above, one flag different: the app must fall
 * back to recording and recognising on the worker, and the learner must not be able
 * to tell which engine served them (other than the caption, which only the platform
 * recogniser can produce).
 */
test('a browser without a platform recogniser still speaks through the worker', async ({ page }) => {
  await bootSignedIn(page, { nativeSpeech: false });
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تمرين سريع' }).click();

  await orb(page).click();
  await expect(page.getByText('أنا أستمع إليك… تحدث الآن')).toBeVisible();
  await say(page, 'Guten Tag, ich möchte einen Kaffee bitte');
  await silence(page);

  const input = page.getByPlaceholder(/اكتب جملتك بالألمانية|أنا أستمع إليك/);
  await expect(input).toHaveValue('Guten Tag, ich möchte einen Kaffee bitte');
  // No native engine, so no live caption is possible — and none is claimed.
  await expect(page.getByTestId('live-caption')).toHaveCount(0);

  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Sehr gern. Möchten Sie noch etwas?')).toBeVisible();
});

test('a denied microphone is stated in Arabic and never closes the typed path', async ({ page }) => {
  await bootSignedIn(page, { denyMicrophone: true });
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تمرين سريع' }).click();

  await orb(page).click();
  await expect(page.getByText(/لم يُسمح بالوصول للمايك/)).toBeVisible();

  // The escape hatch still works: the learner types and the turn goes through.
  const input = page.getByPlaceholder(/اكتب جملتك بالألمانية|أنا أستمع إليك/);
  await input.fill('Guten Tag');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Sehr gern. Möchten Sie noch etwas?')).toBeVisible();
});
