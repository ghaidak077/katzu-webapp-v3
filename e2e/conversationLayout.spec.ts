import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, orb, turn } from './harness';

/**
 * The conversation layout, as geometry.
 *
 * Regression, reported from a real phone session: the Katzu orb floated over the
 * German text ("Die Miete beträgt 800 Eu…" cut off mid-sentence), and the
 * suggestion pill floated over the same bubble. The cause was structural — the
 * dock was `position: fixed` over a scrolling list that reserved a hardcoded
 * `pb-44`, which was shorter than the dock (orb + suggestion + input + the typing
 * line). Nothing about that could be seen by a typecheck, and a screenshot only
 * shows the screen it was taken on.
 *
 * So the assertion is a measurement, not a picture: every message box must end
 * above the dock, and no message box may intersect the orb. Both are checked with
 * the suggestion panel open, because that is the tallest the dock ever gets.
 */

async function sendTurns(page: Page, count: number): Promise<void> {
  const input = page.getByPlaceholder(/اكتب جملتك بالألمانية|أنا أستمع إليك/);
  for (let index = 0; index < count; index += 1) {
    await input.fill(`Ich möchte einen Termin am Montag bitte ${index}`);
    await page.getByRole('button', { name: 'أرسل جملتك' }).click();
    await expect(input).toHaveValue('');
  }
  // The last reply is the signal that the final turn landed.
  await expect(page.getByText('Sehr gern. Möchten Sie noch etwas?').last()).toBeVisible();
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function assertNothingIsCovered(page: Page): Promise<void> {
  const dock = await page.getByTestId('conversation-dock').boundingBox();
  const orbBox = await orb(page).boundingBox();
  expect(dock, 'the dock must be laid out').not.toBeNull();
  expect(orbBox, 'the orb must be laid out').not.toBeNull();

  const bubbles = page.locator('article');
  const count = await bubbles.count();
  expect(count).toBeGreaterThan(0);

  // The transcript must be scrolled to the end, or "nothing reaches into the dock"
  // is trivially true of a region nobody has scrolled yet.
  //
  // Polled rather than read once, and the reason is a measured one. When the dock
  // grows, React commits the new height first and the app's ResizeObserver pins the
  // scroll in the same frame's before-paint step; a single `evaluate` can land in
  // the window between those two and see the commit's *new* clientHeight against the
  // *old* scrollTop (measured: 347 and 384, i.e. 21 px short) without the learner
  // ever seeing it. A transcript that never reaches its end still fails here — this
  // waits, it does not forgive.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const element = document.querySelector('[data-testid="conversation-transcript"]') as HTMLElement;
          return element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
        }),
      { message: 'the transcript is scrolled to its newest message', timeout: 3000 },
    )
    .toBe(true);

  for (let index = 0; index < count; index += 1) {
    const box = await bubbles.nth(index).boundingBox();
    if (!box) continue;
    // A message scrolled out of the top of the region is fine. A message whose box
    // reaches into the dock is the bug: that is a sentence the learner cannot read.
    expect(box.y + box.height, `message ${index} reaches into the dock`).toBeLessThanOrEqual(dock!.y + 2);
    expect(intersects(box, orbBox!), `message ${index} is under the orb`).toBe(false);
  }
}

test('the transcript ends above the dock, with the suggestion panel open', async ({ page }) => {
  await bootSignedIn(page, {
    turns: [
      turn({
        reply_de:
          'Die Miete beträgt 800 Euro kalt, dazu kommen 150 Euro Nebenkosten und die Kaution von drei Monatsmieten.',
        hints: [{ german: 'Ist die Kaution verhandelbar?', translation_ar: 'هل يمكن التفاوض على مبلغ التأمين؟' }],
      }),
      turn({ reply_de: 'Sehr gern. Möchten Sie noch etwas?' }),
      turn({ reply_de: 'Sehr gern. Möchten Sie noch etwas?' }),
    ],
  });

  await page.goto('/scenario/cafe_order/live');
  // The long episode: three of its eight turns leave the session running, so the
  // layout is measured mid-conversation rather than on the debrief hand-off.
  await page.getByRole('button', { name: 'تحدي واقعي مكثف' }).click();

  // Three turns overflow the transcript region, which is the state the overlap was
  // reported in: the list is scrolled and the dock is at its full height.
  await sendTurns(page, 3);
  await assertNothingIsCovered(page);

  // And with the on-demand suggestion revealed — the pill that covered the same
  // bubble in the report.
  await page.getByRole('button', { name: 'اقتراح لردّك' }).click();
  await expect(page.getByText('Ist die Kaution verhandelbar?')).toBeVisible();
  await assertNothingIsCovered(page);
});

test('the dock fits a short phone without pushing the transcript off screen', async ({ page }) => {
  // 360×640 is the smallest viewport this app still supports, and the one where a
  // dock that grows without a bound would leave the learner three visible lines.
  await page.setViewportSize({ width: 360, height: 640 });
  await bootSignedIn(page);
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تمرين سريع' }).click();

  await expect(page.getByText('الجولة 1 من 3')).toBeVisible();
  await assertNothingIsCovered(page);

  const transcript = await page.getByTestId('conversation-transcript').boundingBox();
  // The transcript keeps at least a third of the screen even here.
  expect(transcript!.height).toBeGreaterThan(180);
});
