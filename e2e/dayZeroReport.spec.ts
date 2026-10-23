import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import * as axe from 'axe-core';
import { bootSignedIn, turn } from './harness';

const require = createRequire(import.meta.url);

/**
 * Step 5 — the day-0 finish line, proven in a browser.
 *
 * The first finished conversation is the one report a brand-new learner may see
 * as a finish line: a celebration, ONE primary action («العودة إلى الرحلة»), and
 * everything a returning learner expects — the capability card, the debrief, the
 * corrections drill, the exam card, the Pro offer — behind a quiet
 * «تفاصيل الجلسة» disclosure. Pushing a first-timer into review is the bug this
 * screen exists to prevent, so the dock must never offer it on day 0.
 *
 * The gate is pure (`tests/dayZeroFinish.test.ts`); this spec proves the DOM
 * follows it, in all four situations that must NOT celebrate as well as the one
 * that may. Every case sets the device switch explicitly instead of leaning on the
 * build default, so the same spec is honest against a bundle built with
 * `VITE_GUIDED_HOME=0` and one built with `=1`.
 */

const DAY_ZERO_H1 = 'أنجزت محادثتك الأولى!';
const DAY_ZERO_SENTENCE = 'أنجزتَ 4 جمل بنفسك — وهذه بدايتك.';
const CORRECTIONS_TEASER = 'تصحيح واحد من هذه الجلسة — ستجدها في تفاصيل الجلسة';
const DETAILS = 'تفاصيل الجلسة';
const RETURN_DOCK = 'العودة إلى الرحلة';
const REVIEW_DOCK = 'راجع تصحيحات هذه الجلسة';
const OLD_CELEBRATION = 'إنجاز رائع يا بطل';
const PRO_OFFER_TITLE = 'ما يفتحه Pro — وما يبقى مجانياً';

async function setSwitch(page: Page, value: '1' | '0') {
  await page.addInitScript((flag) => {
    try {
      localStorage.setItem('kz.guidedHome', flag);
    } catch {
      /* storage disabled: the build default applies */
    }
  }, value);
}

/** The four scripted turns the shared mock answers, with one real correction. */
function episodeTurns() {
  return [
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
    turn({ reply_de: 'Perfekt. Auf Wiedersehen!' }),
  ];
}

/** Walks the whole four-turn cafe episode and stops on the report. */
async function finishCafeEpisode(page: Page) {
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();

  const replies = [
    'Guten Tag! Möchten Sie einen Kaffee?',
    'Gerne. Einen Kaffee, bitte schön.',
    'Sehr gern. Möchten Sie noch etwas?',
    'Perfekt. Auf Wiedersehen!',
  ];

  for (const reply of replies) {
    const input = page.getByPlaceholder(/Schreib deinen Satz/);
    await input.fill('Ich möchte einen Kaffee bitte');
    await page.getByRole('button', { name: 'أرسل جملتك' }).click();
    await expect(page.getByText(reply)).toBeVisible();
  }

  await expect(page).toHaveURL(/\/session-report$/, { timeout: 30_000 });
}

/** Every WCAG A/AA violation axe finds, at any impact level. */
async function violations(page: Page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const results = await page.evaluate(async () => {
    const engine = (window as unknown as { axe: typeof axe }).axe;
    return engine.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
  });
  return results.violations;
}

/** The bar this project holds every active screen to: no critical/serious. */
function seriousOrCritical(found: Awaited<ReturnType<typeof violations>>) {
  return found
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id}(${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`);
}

test('the first finished conversation is a finish line — celebration, one action, details behind a disclosure', async ({
  page,
}) => {
  await setSwitch(page, '1');
  await bootSignedIn(page, { turns: episodeTurns() });
  await finishCafeEpisode(page);

  // ONE h1, and it is the finish line — not the returning learner's outcome card.
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: DAY_ZERO_H1 })).toBeVisible();

  // The measured sentence, the correction teaser, and tomorrow's line — which is
  // shown alone and carries no button of its own on the first view.
  await expect(page.getByText(DAY_ZERO_SENTENCE)).toBeVisible();
  await expect(page.getByText(CORRECTIONS_TEASER)).toBeVisible();
  await expect(page.getByText(/^غداً:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'مشهد آخر الآن' })).toHaveCount(0);

  // The old full screen is not on the first view: its capability/debrief cards
  // are behind the disclosure, so neither the number nor the drill is visible yet.
  await expect(page.getByText('جُمل نطقتها بلا مساعدة')).toHaveCount(0);
  await expect(page.getByText('أثبّت الصيغة الصحيحة — أعد كتابتها مرة واحدة الآن')).toHaveCount(0);

  // The dock is ONE primary «العودة إلى الرحلة»; review is not offered at all.
  await expect(page.getByRole('button', { name: RETURN_DOCK })).toHaveCount(1);
  await expect(page.getByRole('button', { name: REVIEW_DOCK })).toHaveCount(0);

  // The headline a returning learner's report could show never appears on day 0.
  await expect(page.getByText(OLD_CELEBRATION)).toHaveCount(0);

  // The Pro offer is earned by this first episode, but it is not the finish line:
  // it waits behind the disclosure like the rest of the evidence.
  await expect(page.getByText(PRO_OFFER_TITLE)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'تفاصيل Pro' })).toHaveCount(0);

  // Closed disclosure is accessible.
  expect(seriousOrCritical(await violations(page))).toEqual([]);

  // The quiet disclosure reveals the whole rest of the report — nothing deleted.
  const details = page.getByRole('button', { name: DETAILS });
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await details.click();
  await expect(details).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'مشهد آخر الآن' })).toBeVisible();
  await expect(page.getByText('جُمل نطقتها بلا مساعدة')).toBeVisible();
  await expect(page.getByText('أثبّت الصيغة الصحيحة — أعد كتابتها مرة واحدة الآن')).toBeVisible();
  await expect(page.getByText('Ich möchte ein Kaffee')).toBeVisible();
  await expect(page.getByText(PRO_OFFER_TITLE)).toBeVisible();
  await expect(page.getByRole('button', { name: 'تفاصيل Pro' })).toBeVisible();

  // Still one h1 and one primary after opening; the disclosure adds no competitor.
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('button', { name: RETURN_DOCK })).toHaveCount(1);
  await expect(page.getByRole('button', { name: REVIEW_DOCK })).toHaveCount(0);

  // Open disclosure is accessible too — the exact moment a11y regressions hide.
  expect(seriousOrCritical(await violations(page))).toEqual([]);
});

test('with the flag off, the first conversation still renders today\'s full report', async ({ page }) => {
  await setSwitch(page, '0');
  await bootSignedIn(page, { turns: episodeTurns() });
  await finishCafeEpisode(page);

  // No finish line, no disclosure: the screen that shipped before is unchanged.
  await expect(page.getByRole('heading', { level: 1, name: DAY_ZERO_H1 })).toHaveCount(0);
  await expect(page.getByRole('button', { name: DETAILS })).toHaveCount(0);

  // Today's evidence cards are on the first screen, as before.
  await expect(page.getByText('جُمل نطقتها بلا مساعدة')).toBeVisible();
  await expect(page.getByText('تصحيحات هذه الجلسة', { exact: true })).toBeVisible();
  await expect(page.getByText('Akkusativ: einen Kaffee')).toBeVisible();

  // Today's dock keeps the review route beside the way back.
  await expect(page.getByRole('button', { name: REVIEW_DOCK })).toBeVisible();
  await expect(page.getByRole('button', { name: RETURN_DOCK })).toBeVisible();
  await expect(page.getByText(OLD_CELEBRATION)).toHaveCount(0);
});

test('a returning learner never sees the day-0 celebration, even with the flag on', async ({ page }) => {
  await setSwitch(page, '1');
  // `history: true` seeds one finished conversation, so this is the learner's
  // SECOND session — the gate must hold at count 2.
  await bootSignedIn(page, { history: true, turns: episodeTurns() });
  await finishCafeEpisode(page);

  await expect(page.getByRole('heading', { level: 1, name: DAY_ZERO_H1 })).toHaveCount(0);
  await expect(page.getByRole('button', { name: DETAILS })).toHaveCount(0);
  await expect(page.getByText('جُمل نطقتها بلا مساعدة')).toBeVisible();
  await expect(page.getByText('تصحيحات هذه الجلسة', { exact: true })).toBeVisible();
  await expect(page.getByText(OLD_CELEBRATION)).toHaveCount(0);
});

test('a recovered report never celebrates — only a live completion does', async ({ page }) => {
  await setSwitch(page, '1');
  await bootSignedIn(page, { turns: episodeTurns() });
  await finishCafeEpisode(page);

  // Prove the live path really did celebrate first, so this test is not passing
  // because the report failed to render.
  await expect(page.getByRole('heading', { level: 1, name: DAY_ZERO_H1 })).toBeVisible();

  // Drop the in-memory/session copy and reload: the report now rebuilds from the
  // saved session (`fromRecovered`), which may never claim a live finish line.
  await page.evaluate(() => sessionStorage.removeItem('katzu_session_summary'));
  await page.reload();

  await expect(page.getByText('جُمل نطقتها بلا مساعدة')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: DAY_ZERO_H1 })).toHaveCount(0);
  await expect(page.getByRole('button', { name: DETAILS })).toHaveCount(0);
  await expect(page.getByText(OLD_CELEBRATION)).toHaveCount(0);
});
