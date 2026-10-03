import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The first quiz of a scenario must not reshuffle under the learner.
 *
 * The shipped defect: `QuizScreen` re-derived its deck from live queries and the
 * generator shuffled with `Math.random`, so on the first visit — while the
 * content heal re-emitted those queries several times — the options visibly
 * reordered (and the correct index moved) about five times before settling. The
 * fix seeds the shuffler per scenario and freezes the first non-empty deck.
 *
 * This spec reproduces the real trigger rather than hoping for it: the screen's
 * mount-time heal fetches the scenario detail and its topic vocabulary and
 * `bulkPut`s them, re-emitting `scenarioQ`/`phrasesQ`/`vocabQ` while the deck is
 * on screen. The worker is mocked to answer those two requests with real rows, so
 * the emits happen exactly as they do on a cold device.
 */

const VOCABULARY = [
  { id: 9101, german: 'Kaffee', article: 'der', translation_ar: 'قهوة', topic: 'travel', level: 'A1' },
  { id: 9102, german: 'Tee', article: 'der', translation_ar: 'شاي', topic: 'travel', level: 'A1' },
  { id: 9103, german: 'Rechnung', article: 'die', translation_ar: 'فاتورة', topic: 'travel', level: 'A1' },
  { id: 9104, german: 'Wasser', article: 'das', translation_ar: 'ماء', topic: 'travel', level: 'A1' },
  { id: 9105, german: 'Brot', article: 'das', translation_ar: 'خبز', topic: 'travel', level: 'A1' },
];

const SCENARIO_DETAIL = {
  id: 'airport_arrival',
  title_de: 'Am Flughafen: das Gepäck',
  title_ar: 'في المطار: الأمتعة',
  category: 'travel',
  starter_phrases: [
    { id: 9101, scenario_id: 'airport_arrival', level: 'A1', german: 'Hier ist mein Pass.', translation_ar: 'هذا جواز سفري.', sort_order: 1 },
    { id: 9102, scenario_id: 'airport_arrival', level: 'A1', german: 'Mein Koffer ist nicht angekommen.', translation_ar: 'لم تصل حقيبتي.', sort_order: 2 },
    { id: 9103, scenario_id: 'airport_arrival', level: 'A1', german: 'Was soll ich tun?', translation_ar: 'ماذا أفعل؟', sort_order: 3 },
    { id: 9104, scenario_id: 'airport_arrival', level: 'A1', german: 'Wo ist das Büro?', translation_ar: 'أين المكتب؟', sort_order: 4 },
  ],
};

/** The option buttons currently on screen, in document order. */
async function optionOrder(page: Page): Promise<string> {
  const texts = await page.locator('[data-testid="quiz-options"] button').allInnerTexts();
  return texts.map((text) => text.trim()).join('|');
}

test('the first quiz of a scenario renders one stable option order', async ({ page }) => {
  await bootSignedIn(page);

  // Registered after the harness's catch-all, so these win for the two URLs the
  // quiz's heal calls. The delay makes the heal land while the first question is
  // already on screen — exactly the cold-device ordering that produced the churn.
  const delayed = (body: unknown, ms: number) => async (route: import('@playwright/test').Route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  };
  await page.route(/\/scenarios\/airport_arrival$/, delayed(SCENARIO_DETAIL, 900));
  await page.route(/\/vocabulary(\?|$)/, delayed(VOCABULARY, 1100));

  const quizOptions = page.locator('[data-testid="quiz-options"] button');
  await page.goto('/scenario/airport_arrival/quiz');

  // Watch the first question from mount until it settles. Every distinct option
  // ordering we ever see is recorded; a stable deck yields exactly one.
  const seen = new Set<string>();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if ((await quizOptions.count()) >= 4) {
      const order = await optionOrder(page);
      if (order) seen.add(order);
      if (seen.size > 1) break;
    }
    await page.waitForTimeout(40);
  }

  expect(seen.size, `options reordered: ${[...seen].join('  ->  ')}`).toBe(1);
  await expect(quizOptions).toHaveCount(4);
  expect((await optionOrder(page)).split('|').filter(Boolean)).toHaveLength(4);
});
