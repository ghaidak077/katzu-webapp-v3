import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import * as axe from 'axe-core';
import { bootSignedIn, turn } from './harness';

const require = createRequire(import.meta.url);

/**
 * The live conversation's accessibility, asserted on the built bundle.
 *
 * Three findings came out of the V40 redesign's own measurement, and all three were
 * invisible to every gate the project ran — a typecheck cannot see the
 * accessibility tree, and the existing axe gate filters to critical/serious, which
 * is exactly the band the viewport failure is not in.
 *
 *  1. **An invisible control was still announced.** The orb and the send plane
 *     cross-fade in one 56px slot, and the half not showing was hidden with
 *     `opacity-0` only. Measured with an empty field: `disabled=true`, so Tab could
 *     not reach it, but it was still in the accessibility tree — a screen reader
 *     walked from the field into an invisible "أرسل جملتك" and then into the
 *     microphone. With text typed, the reverse: the microphone stayed announced
 *     behind the send button. The test below drives the learner's own path — Tab
 *     out of the field — rather than reading a computed style.
 *  2. **The viewport meta blocked pinch-zoom** (`maximum-scale=1.0,
 *     user-scalable=no`), a WCAG 1.4.4 failure. axe reported it as the *only*
 *     violation on this screen, at moderate impact.
 *  3. **The round counter could promise a round that never comes.** `userTurnsCount`
 *     is clamped into the label, and the last round of an A1 session has to read
 *     "4 من 4", never "5 من 4".
 */

/** Every WCAG A/AA violation axe finds, at any impact level. */
async function violations(page: import('@playwright/test').Page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const results = await page.evaluate(async () => {
    const engine = (window as unknown as { axe: typeof axe }).axe;
    return engine.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
  });
  return results.violations.map((v) => `${v.id}(${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`);
}

/** Opens the live conversation in Practice mode and waits for the bar to settle. */
async function openLive(page: import('@playwright/test').Page) {
  await bootSignedIn(page, { turns: [turn(), turn(), turn(), turn(), turn()] });
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await expect(page.getByRole('button', { name: 'ابدأ التحدث' })).toBeVisible();
}

/** The accessible name of whatever currently holds focus. */
async function focusedLabel(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
}

test('an empty field offers only the microphone, never an invisible send button', async ({ page }) => {
  await openLive(page);

  // The control that is not on screen must not exist for assistive tech. This is
  // the assertion the old `opacity-0` wrapper failed: `getByRole` walks the
  // accessibility tree, so a transparent-but-present button is a match.
  await expect(page.getByRole('button', { name: 'أرسل جملتك' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ابدأ التحدث' })).toBeVisible();

  // And the learner's own path out of the field lands on the microphone. `Tab`
  // skips a `disabled` control on its own, but the programmatic-focus case below is
  // the one a `disabled` attribute alone does not cover.
  await page.getByPlaceholder(/Schreib deinen Satz/).focus();
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('ابدأ التحدث');

  // A hidden control must also not be focusable by script.
  const sendFocusable = await page.evaluate(() => {
    const send = document.querySelector('[aria-label="أرسل جملتك"]') as HTMLButtonElement | null;
    if (!send) return 'absent';
    send.focus();
    return document.activeElement === send;
  });
  expect(sendFocusable).toBe(false);
});

test('typing swaps the microphone for the send button in the tab order too', async ({ page }) => {
  await openLive(page);

  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich möchte einen Termin am Montag');
  await expect(page.getByRole('button', { name: 'أرسل جملتك' })).toBeVisible();

  // The microphone is now the control that is not on screen.
  await expect(page.getByRole('button', { name: 'ابدأ التحدث' })).toHaveCount(0);

  await page.getByPlaceholder(/Schreib deinen Satz/).focus();
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('أرسل جملتك');

  // The cross-fade still works: the button the learner now sees really sends.
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Sehr gern. Möchten Sie noch etwas?').first()).toBeVisible();

  // Sending empties the field, and the microphone comes back.
  await expect(page.getByRole('button', { name: 'ابدأ التحدث' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'أرسل جملتك' })).toHaveCount(0);
});

test('the live conversation has no WCAG A/AA violation, at any impact', async ({ page }) => {
  await openLive(page);
  expect(await violations(page)).toEqual([]);

  // The same screen with text typed, so the other half of the action slot is the
  // one on screen — the state the old `opacity-0` wrapper hid a control in.
  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich möchte einen Termin');
  expect(await violations(page)).toEqual([]);
});

test('the round counter never promises a round past the last one', async ({ page }) => {
  await openLive(page);
  const progress = page.getByTestId('round-progress');
  const input = page.getByPlaceholder(/Schreib deinen Satz/);

  for (let index = 0; index < 5; index += 1) {
    const state = await progress.evaluate((el) => ({
      now: Number(el.getAttribute('aria-valuenow')),
      max: Number(el.getAttribute('aria-valuemax')),
      label: el.getAttribute('aria-label') ?? '',
      segments: el.children.length,
    }));
    // The bar renders one segment per round, so the count is the plan's, not a
    // hard-coded four: A1 runs 4 turns, A2 runs 6.
    expect(state.segments).toBe(state.max);
    expect(state.now).toBeLessThanOrEqual(state.max);
    // "الجولة N من M" with N clamped: the last round reads "4 من 4", never "5 من 4".
    const claimed = Number(state.label.match(/الجولة (\d+)/)?.[1]);
    expect(claimed).toBeGreaterThanOrEqual(1);
    expect(claimed).toBeLessThanOrEqual(state.max);

    if (!(await input.isVisible())) break;
    await input.fill(`Ich möchte einen Termin am Montag bitte ${index}`);
    await page.getByRole('button', { name: 'أرسل جملتك' }).click();
    await page.waitForTimeout(300);
  }
});