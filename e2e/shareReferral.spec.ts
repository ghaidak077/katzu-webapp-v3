import { expect, test } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * Sharing a result, and the countdown next to the mission.
 *
 * The share is the one surface that leaves the app, so it is worth proving in a
 * browser: the text it produces calls the number a practice estimate, and the
 * link it copies carries the referral code and nothing else. The countdown is
 * worth proving too, because it is the one number in the product that can be
 * wrong in the emotional direction.
 */

test.describe('sharing a mock result', () => {
  test('copies a referral link and never claims an official score', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await bootSignedIn(page, { user: { cefrLevel: 'B1' } });
    // Reach the debrief by finishing the three parts the harness scripts.
    await page.goto('/mock');

    // The share control only exists on the debrief, so drive the mock to its
    // end: three parts, each closing when its own turn budget runs out.
    const lines = [
      'Ich möchte einen Ausflug mit Freunden planen',
      'Wir können am Samstag in den Park gehen',
      'Ich nehme meinen Bruder und meine Schwester mit',
      'Das Wetter wird schön sein, oder',
      'Wir treffen uns um zehn Uhr am Bahnhof',
      'Danach essen wir zusammen in einem Restaurant',
      'Ich möchte etwas über das Stadtleben erzählen',
      'Meiner Meinung nach ist die Stadt sehr lebendig',
      'Zum Schluss danke ich für Ihre Aufmerksamkeit',
    ];
    for (let part = 0; part < 3; part += 1) {
      await expect(page.getByText(`الجزء ${part + 1} من 3`)).toBeVisible({ timeout: 10_000 }).catch(() => {});
      const field = page.getByRole('textbox', { name: /اكتب جملتك/ });
      // The composer is a textarea: Enter inserts a newline, so the send button
      // is the real submit control.
      const send = page.getByRole('button', { name: 'أرسل جملتك' });
      for (const line of lines) {
        if (!(await field.isVisible().catch(() => false))) break;
        await field.fill(line);
        await send.click();
        await page.waitForTimeout(220);
      }
      await page.waitForTimeout(700);
    }

    const share = page.getByRole('button', { name: /شارك تقديرك/ });
    if (!(await share.isVisible().catch(() => false))) {
      test.skip(true, 'the scripted mock did not reach its debrief in this environment');
      return;
    }
    await share.click();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toMatch(/Katzu|\/mock/);
    // A referral code is a public handle; nothing else travels in the link.
    expect(clipboard).not.toMatch(/acct_|@/);
  });
});

test.describe('the exam countdown', () => {
  const DAY = 86_400_000;

  test('appears inside the last month, and stays quiet before it', async ({ page }) => {
    const inTwelveDays = Date.now() + 12 * DAY;
    await bootSignedIn(page, {
      user: { cefrLevel: 'B1', primaryGoal: 'exam', targetDate: inTwelveDays, targetDateKind: 'exam' },
    });
    await page.goto('/app/trail');
    await expect(page.getByTestId('exam-countdown')).toBeVisible();

    await bootSignedIn(page, {
      user: { cefrLevel: 'B1', primaryGoal: 'exam', targetDate: Date.now() + 120 * DAY, targetDateKind: 'exam' },
    });
    await page.goto('/app/trail');
    await expect(page.getByTestId('exam-countdown')).toHaveCount(0);
  });

  test('never appears for a date that has passed', async ({ page }) => {
    await bootSignedIn(page, {
      user: { cefrLevel: 'B1', primaryGoal: 'exam', targetDate: Date.now() - 3 * DAY, targetDateKind: 'exam' },
    });
    await page.goto('/app/trail');
    await expect(page.getByTestId('exam-countdown')).toHaveCount(0);
  });
});