import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, seedRows } from './harness';

/**
 * «المزيد» — the guided home's one secondary surface, proven in a browser.
 *
 * The guided home keeps the hero, the chapter's path and the day's tasks. Every
 * other block the old home carried moved into this sheet, so two things have to
 * be true and are proven here:
 *
 *  1. **Nothing became unreachable.** Each destination the removed footer chips
 *     reached — plus the review queue, the Pro offer and the preferences edit —
 *     is one tap from the sheet, and the tap lands on the route.
 *  2. **The sheet is not a dump.** On day 0 it shows no review row (nothing has
 *     been finished), no recap (no week to report) and no Pro offer (`trial`
 *     says "after a real episode, never before it"). After one session those
 *     rows appear — because they now mean something, not because the sheet
 *     always shows everything.
 *
 * The switch is set in an init script, i.e. before the app's first document
 * runs, which is the same lever the owner has on a phone.
 */

async function setSwitch(page: Page, value: '1' | '0') {
  await page.addInitScript((flag) => {
    try {
      localStorage.setItem('kz.guidedHome', flag);
    } catch {
      /* storage disabled: the build default applies */
    }
  }, value);
}

/** The sheet, addressed by its accessible name (the `BottomSheet` title). */
function sheet(page: Page) {
  return page.getByRole('dialog', { name: 'المزيد' });
}

async function openMore(page: Page) {
  await page.getByTestId('journey-more').click();
  await expect(sheet(page)).toBeVisible();
}

/** One completed session — the thing that makes review and Pro mean something. */
function aSession(): Record<string, unknown> {
  return {
    id: 'sess_more_1',
    scenarioId: 'airport_arrival',
    scenarioTitle: 'في المطار: الأمتعة',
    cefrLevel: 'A1',
    sentencesSpoken: 4,
    wordsLearned: 16,
    accuracyPercent: 90,
    durationSeconds: 200,
    timestamp: Date.now(),
    wasIndependentOnly: true,
    independentSentences: 4,
    hintAssistedSentences: 0,
    mode: 'practice',
    mistakesCount: 0,
  };
}

/** One card that is due right now. */
function aDueCard(): Record<string, unknown> {
  return {
    userId: 'current_user',
    kind: 'vocab',
    refId: 'vocab:more-1',
    sourceId: 9001,
    promptAr: 'موعد',
    answerDe: 'der Termin',
    dueAt: Date.now() - 60_000,
    intervalDays: 1,
    ease: 2.5,
    reps: 1,
    lapses: 0,
    reviews: 1,
    createdAt: Date.now() - 86_400_000,
  };
}

test('day 0: the sheet carries the destinations and nothing about later', async ({ page }) => {
  await setSwitch(page, '1');
  await bootSignedIn(page);

  // The entry point is a quiet control that announces itself as one — never an
  // automatic open, which is the wall this screen is being rescued from.
  const entry = page.getByTestId('journey-more');
  await expect(entry).toHaveAttribute('aria-haspopup', 'dialog');
  await openMore(page);

  // Continue learning: the scenarios plus the skills that used to be a tab away.
  for (const row of ['more-library', 'more-grammar', 'more-listening', 'more-writing', 'more-coach']) {
    await expect(page.getByTestId(row)).toBeVisible();
  }
  await expect(page.getByTestId('more-preferences')).toBeVisible();

  // Day 0 tells the truth about day 0: no review list, no week, no offer.
  await expect(page.getByTestId('more-review')).toHaveCount(0);
  await expect(page.getByTestId('weekly-recap-card')).toHaveCount(0);
  await expect(page.getByTestId('more-pro')).toHaveCount(0);
  await expect(page.getByTestId('capability-card')).toHaveCount(0);
  // The goal card is the one «تقدّمك» line a new learner can honestly be shown.
  await expect(page.getByTestId('chapter-goal-card')).toBeVisible();

  // Closing returns to the screen, not to a blank one.
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('daily-tasks')).toBeVisible();
});

test('each destination in the sheet is one tap from the home screen', async ({ page }) => {
  await setSwitch(page, '1');
  await bootSignedIn(page);

  const destinations = [
    ['more-library', /\/app\/library$/],
    ['more-grammar', /\/app\/grammar$/],
    ['more-listening', /\/app\/listen$/],
    ['more-writing', /\/app\/write$/],
    ['more-coach', /\/app\/coach$/],
    // The preferences edit the old home nag pointed at (`/onboarding?mode=edit`).
    ['more-preferences', /\/onboarding(\?.*)?$/],
  ] as const;

  for (const [row, url] of destinations) {
    if (!/\/app\/trail$/.test(page.url())) await page.goto('/app/trail');
    await expect(page.getByTestId('journey-more')).toBeVisible({ timeout: 30_000 });
    await openMore(page);
    await page.getByTestId(row).click();
    await expect(page).toHaveURL(url);
    // The sheet goes with the tap: a learner never lands under an overlay.
    await expect(sheet(page)).toHaveCount(0);
  }
});

test('a due card on day 0 is not enough: review needs a finished session', async ({ page }) => {
  // The demo visitor case: cards can exist before anything has been completed.
  // Review is an obligation, so it is not offered as one until the learner has
  // actually finished something — the rule the home screen owns (`firstSessionDone`).
  await setSwitch(page, '1');
  await bootSignedIn(page);
  await seedRows(page, 'review_items', [aDueCard()]);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

  await openMore(page);
  await expect(page.getByTestId('more-review')).toHaveCount(0);
  await expect(page.getByTestId('weekly-recap-card')).toHaveCount(0);
  await expect(page.getByTestId('more-pro')).toHaveCount(0);
});

test('after the first session the sheet gains review, the recap and the Pro offer', async ({ page }) => {
  await setSwitch(page, '1');
  await bootSignedIn(page);
  await seedRows(page, 'sessions', [aSession()]);
  await seedRows(page, 'review_items', [aDueCard()]);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

  await openMore(page);

  // Review is due AND something has been finished — the two conditions, both now
  // real. The sheet lists it even though the hero is the review CTA today: a
  // menu that hides the queue it offers is how a learner concludes it is gone.
  const reviewRow = page.getByTestId('more-review');
  await expect(reviewRow).toBeVisible();
  await expect(reviewRow).toContainText('مراجعة مستحقة: 1');
  await reviewRow.click();
  await expect(page).toHaveURL(/\/app\/review$/);

  // Back on home, the same sheet now holds the week and the offer.
  await page.goto('/app/trail');
  await openMore(page);
  await expect(page.getByTestId('weekly-recap-card')).toBeVisible();
  await expect(page.getByTestId('more-pro')).toBeVisible();
  // A learner who has finished a session has earned *something* to show here.
  expect(
    (await page.getByTestId('capability-card').count()) + (await page.getByTestId('chapter-goal-card').count()),
  ).toBe(1);

  // The offer itself still respects the one rule: it opens the real paywall.
  await page.getByTestId('more-pro').click();
  await expect(page).toHaveURL(/\/subscription$/);
});

test('the sheet fits a 320px phone without horizontal overflow', async ({ page }) => {
  await setSwitch(page, '1');
  await bootSignedIn(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/app/trail');
  await openMore(page);

  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const wide: string[] = [];
    for (const el of Array.from(document.querySelectorAll('[role="dialog"] button, [role="dialog"] p'))) {
      const box = el.getBoundingClientRect();
      // 0.5px of rounding is not a defect; anything wider than the viewport is.
      if (box.width > 0 && (box.left < -0.5 || box.right > width + 0.5)) {
        wide.push(`${el.tagName} ${el.textContent?.trim().slice(0, 18)} ${Math.round(box.left)}→${Math.round(box.right)}`);
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, width, wide: wide.slice(0, 4) };
  });
  expect(overflow.wide, overflow.wide.join('; ')).toEqual([]);
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);
});

test('every row in the sheet is a 44px target', async ({ page }) => {
  await setSwitch(page, '1');
  await bootSignedIn(page);
  await openMore(page);

  const undersized = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll('[role="dialog"] button'))) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.height < 44) {
        offenders.push(`${el.getAttribute('data-testid') ?? el.textContent?.trim().slice(0, 18)} h=${Math.round(box.height)}`);
      }
    }
    return offenders;
  });
  expect(undersized, undersized.join('; ')).toEqual([]);
});
