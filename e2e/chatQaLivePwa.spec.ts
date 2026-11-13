import { expect, test } from '@playwright/test';
import { bootSignedIn } from './harness';
import { createLiveProxy } from '../scripts/qa/liveProxy.mjs';

/**
 * The PWA update check, during a real conversation.
 *
 * The gate suite runs with service workers blocked (the bundle it tests has no
 * offline layer), so nothing there can prove what happens when an installed app
 * checks for a new version mid-conversation. The failure this guards is not a
 * missing manifest — `playReadiness` owns installation and the offline shell —
 * it is an update that reloads the page under the learner: the last exchange is
 * gone, the input is empty, and the turn they were about to send is lost.
 *
 * This runs the built bundle with the real registration allowed, sends a live
 * turn, triggers `registration.update()` while the reply is on screen, and
 * asserts the page did not navigate, did not reload and kept the conversation.
 */

const KEY = process.env.GROQ_API_KEY || '';
test.skip(!KEY, 'set GROQ_API_KEY to run the live PWA update test');

test('an update check never reloads a conversation in progress', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootSignedIn(page);

  const proxy = createLiveProxy({ key: KEY, maxUsd: 1 });
  await page.route('**/ai/turn', async (route) => {
    const result = await proxy.handle(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.body) });
  });

  await page.goto('/scenario/first_greetings/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();

  const registered = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return { controlled: false, scope: '' };
    // Let an in-flight first install settle before checking "an update".
    await navigator.serviceWorker.ready;
    return { controlled: navigator.serviceWorker.controller !== null, scope: registration.scope };
  });
  expect(registered.scope, 'the built bundle must register a service worker').toBeTruthy();

  const input = page.getByPlaceholder(/Schreib deinen Satz/);
  await input.fill('Hallo, ich bin Sami.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  const reply = page.locator('article[aria-label="رسالة من كَاتْزُو"]').first();
  await expect(reply).toBeVisible({ timeout: 40_000 });
  const replyText = await reply.innerText();

  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  const urlBefore = page.url();

  const update = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return { ok: false, waiting: false };
    try {
      await registration.update();
      return {
        ok: true,
        waiting: registration.waiting !== null,
        installing: registration.installing !== null,
      };
    } catch (error) {
      return { ok: false, error: String((error as Error)?.message || error).slice(0, 120) };
    }
  });
  expect(update.ok, `update() must not throw: ${JSON.stringify(update)}`).toBe(true);

  // Give a reload-happy implementation the time to do the wrong thing.
  await page.waitForTimeout(2_000);
  expect(navigations, 'an update check must not navigate the page').toBe(0);
  expect(page.url()).toBe(urlBefore);
  await expect(reply).toBeVisible();
  expect(await reply.innerText()).toBe(replyText);
  expect(await input.inputValue(), 'the composer keeps whatever was typed').toBe('');

  // Still a usable conversation after the check: the learner can keep going.
  await input.fill('Mir geht es gut, danke.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.locator('article[aria-label="رسالة من كَاتْزُو"]')).toHaveCount(2, { timeout: 40_000 });
});
