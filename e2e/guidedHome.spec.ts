import { expect, test } from '@playwright/test';
import { bootSignedIn, seedRows } from './harness';

/**
 * The guided home, proven in a browser — both ways.
 *
 * `guidedHome` trims Journey Home to the hero, the chapter's path and the day's
 * tasks while it is on, and has to restore the screen that shipped before it
 * while it is off. A unit test can prove the switch's precedence
 * (`tests/guidedHome.test.ts`); only a browser can prove the DOM follows it.
 *
 * The off case is exercised through the device switch
 * (`localStorage['kz.guidedHome'] = '0'`) set in an init script, i.e. before the
 * app's first document runs — the same lever the owner has on a real phone.
 *
 * The one primary action, whatever today's mission is (same shape as
 * `e2e/journey.spec.ts`, which owns the wording).
 */
const PRIMARY_ACTION = /ابدأ مهمة اليوم|ابدأ من لحظة الوصول|أكمل من حيث توقفت|ابدأ مشهداً جديداً|ابدأ تدريب|راجع \d+ الآن/;

/** One completed session — enough for the weekly recap and for `firstSessionDone`. */
function aSession(): Record<string, unknown> {
  const now = Date.now();
  return {
    id: 'sess_guided_1',
    scenarioId: 'airport_arrival',
    scenarioTitle: 'في المطار: الأمتعة',
    cefrLevel: 'A1',
    sentencesSpoken: 4,
    wordsLearned: 16,
    accuracyPercent: 90,
    durationSeconds: 200,
    timestamp: now,
    wasIndependentOnly: true,
    independentSentences: 4,
    hintAssistedSentences: 0,
    mode: 'practice',
    mistakesCount: 0,
  };
}

/**
 * The device switch, set before the app's first document runs.
 *
 * Both sides are asserted explicitly rather than leaning on the build default:
 * a dev server defaults this flag ON and a shipped bundle defaults it OFF, and a
 * test that only passes on one of them proves half a flag. The same lever is what
 * the owner has on a real phone.
 */
async function setSwitch(page: import('@playwright/test').Page, value: '1' | '0') {
  await page.addInitScript((flag) => {
    try {
      localStorage.setItem('kz.guidedHome', flag);
    } catch {
      /* storage disabled: the build default applies */
    }
  }, value);
}

test('the guided home shows one action, the path and the tasks — and nothing about later', async ({ page }) => {
  await setSwitch(page, '1');
  await bootSignedIn(page);

  // The three things it keeps.
  const primary = page.getByRole('button', { name: PRIMARY_ACTION });
  await expect(primary).toBeVisible();
  await expect(primary).toHaveCount(1);
  await expect(page.getByTestId('daily-tasks')).toBeVisible();
  // The chapter's path: the strip's accessible name is the chapter title, so
  // asserting the role (not a pixel) proves the path is on the screen.
  await expect(page.getByRole('progressbar').first()).toBeVisible();

  // The six secondary blocks, none of them rendered at all.
  await expect(page.getByText('أكمل تفضيلاتك')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Katzu Pro' })).toHaveCount(0);
  await expect(page.getByTestId('chapter-goal-card')).toHaveCount(0);
  await expect(page.getByTestId('weekly-recap-card')).toHaveCount(0);
  await expect(page.getByTestId('journey-level-chip')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'كل المشاهد والمستويات' })).toHaveCount(0);
});

test('with the switch off, the same learner gets the screen that shipped before it', async ({ page }) => {
  await setSwitch(page, '0');
  await bootSignedIn(page);
  // A completed session so the weekly recap has something in it: the off state
  // must show it, and the on state (the next test) must not.
  await seedRows(page, 'sessions', [aSession()]);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText('أكمل تفضيلاتك')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Katzu Pro' })).toBeVisible();
  await expect(page.getByTestId('weekly-recap-card')).toBeVisible();
  await expect(page.getByTestId('journey-level-chip')).toBeVisible();
  await expect(page.getByRole('button', { name: 'كل المشاهد والمستويات' })).toBeVisible();
  // Still exactly one mission action: the flag changes what else is on screen.
  await expect(page.getByRole('button', { name: PRIMARY_ACTION })).toHaveCount(1);
});

test('after a completed session the guided home still keeps the later blocks away', async ({ page }) => {
  await setSwitch(page, '1');
  await bootSignedIn(page);
  await seedRows(page, 'sessions', [aSession()]);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

  // The recap would have real content here — that is why its absence proves the
  // flag rather than an empty week.
  await expect(page.getByTestId('weekly-recap-card')).toHaveCount(0);
  await expect(page.getByTestId('chapter-goal-card')).toHaveCount(0);
  await expect(page.getByTestId('journey-level-chip')).toHaveCount(0);
  await expect(page.getByRole('button', { name: PRIMARY_ACTION })).toHaveCount(1);
  await expect(page.getByTestId('daily-tasks')).toBeVisible();
});
