import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, seedRows } from './harness';

/**
 * A scenario's 16:9 banner, from the content column to the card.
 *
 * The banner is per scenario and updatable from the content editor, which makes
 * one thing worth proving in a browser: `banner_url` written onto a row must reach
 * the screen *everywhere the scenario is listed* — and a scenario without one must
 * still show a real 16:9 visual instead of a broken frame. Both halves are checked
 * here; `tests/sceneBanner.test.ts` pins the precedence rule itself.
 *
 * The write goes straight into the app's own IndexedDB, which is where the content
 * sync puts it — the same store, so the reading code under test is the real one.
 */

const PATCHED_ART = 'https://cdn.katzu.test/art/cafe_order-banner.png';
const BANNER = '[data-testid="scenario-banner"]';

async function setBanner(page: Page, id: string, url: string): Promise<void> {
  await page.evaluate(
    ([scenarioId, bannerUrl]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('KatzuWebDB');
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('scenarios', 'readwrite');
          const store = tx.objectStore('scenarios');
          const get = store.get(scenarioId as string);
          get.onsuccess = () => store.put({ ...get.result, banner_url: bannerUrl });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    [id, url] as const,
  );
}

/**
 * Every *laid-out* banner, with the source it chose.
 *
 * Laid-out, because the journey route keeps its inactive tab panels mounted — a
 * banner inside one of those is in the DOM with a 0×0 box and says nothing about
 * what the learner sees. `width > 0` is that filter.
 */
async function bannerGeometry(page: Page) {
  const all = await page.locator(BANNER).evaluateAll((elements) =>
    elements.map((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
      src: element.querySelector('img')?.getAttribute('src') ?? '',
    })),
  );
  return all.filter((box) => box.width > 0 && box.height > 0);
}

function expectSixteenByNine(box: { width: number; height: number; src: string }): void {
  expect(box.width).toBeGreaterThan(0);
  expect(Math.abs(box.width / box.height - 16 / 9), `${box.src} is not 16:9`).toBeLessThan(0.05);
}

test('a scenario’s own banner reaches every screen that lists it', async ({ page }) => {
  await bootSignedIn(page);
  await setBanner(page, 'cafe_order', PATCHED_ART);

  // The mission card on Journey Home.
  //
  // The arrival episode is what a first-run learner is sent to, and this test is
  // about artwork reaching the screens that list a scenario — so the day is pinned
  // to `cafe_order` by leaving it unfinished, which is the mission the patched
  // banner belongs to. Without the pin the assertion would also depend on which
  // scenario the calendar happened to rotate to.
  await seedRows(page, 'scenario_training', [
    { scenarioId: 'cafe_order', userId: 'current_user', studiedAt: 1, quizAttempted: false, lastScore: 0, effectiveLevel: 'A1', updatedAt: 1 },
  ]);
  await page.goto('/app');
  await expect(page.getByRole('button', { name: /أكمل من حيث توقفت|ابدأ مهمة اليوم/ })).toBeVisible();
  const home = await bannerGeometry(page);
  // At least the mission card's — and every laid-out banner on this screen is the
  // day's scenario, so every one of them carries the patched artwork.
  expect(home.length).toBeGreaterThanOrEqual(1);
  for (const box of home) {
    expect(box.src).toBe(PATCHED_ART);
    expectSixteenByNine(box);
  }

  // The scenario library, where every scenario is browsable.
  await page.getByRole('button', { name: 'كل المشاهد والمستويات' }).click();
  await expect(page).toHaveURL(/\/app\/library$/);
  // The route changes before React's lazy-loaded Trail screen is mounted. Wait
  // on the exact card and its banner, not the URL, so a cold chunk cannot make
  // the geometry read race the render.
  const cafeCard = page.getByRole('button', { name: /الطلب في المقهى \(Im Café bestellen\)/ });
  await expect(cafeCard).toBeVisible();
  const libraryBanner = cafeCard.locator(BANNER);
  await expect(libraryBanner).toBeVisible();
  await expect(libraryBanner.locator('img')).toHaveAttribute('src', PATCHED_ART);
  const library = await bannerGeometry(page);
  expect(library.length).toBeGreaterThanOrEqual(1);
  for (const box of library) expectSixteenByNine(box);

  // The scenario's own screen. It reads the scenario before it draws, so the wait
  // is for its own content rather than for a timeout.
  await page.goto('/scenario/cafe_order');
  await expect(page.getByText('Im Café bestellen')).toBeVisible();
  const detail = await bannerGeometry(page);
  expect(detail[0].src).toBe(PATCHED_ART);
  expectSixteenByNine(detail[0]);
});

test('a scenario with no banner keeps a real 16:9 visual', async ({ page }) => {
  await bootSignedIn(page);
  await page.goto('/scenario/bakery_shopping');
  await expect(page.getByText('Beim Bäcker einkaufen')).toBeVisible();

  // The built-in floor, requested at the size this column renders (the placeholder
  // photographs were 1200px wide and 235 KB each; this is the same picture at
  // 63 KB, measured).
  const banners = await bannerGeometry(page);
  expect(banners[0].src).toBe(
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=640&h=360&q=60',
  );
  expectSixteenByNine(banners[0]);
});
