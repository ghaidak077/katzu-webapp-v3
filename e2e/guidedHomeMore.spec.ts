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
function aSession(
  id = 'sess_more_1',
  scenarioId = 'airport_arrival',
  timestamp = Date.now(),
): Record<string, unknown> {
  return {
    id,
    scenarioId,
    scenarioTitle: 'في المطار: الأمتعة',
    cefrLevel: 'A1',
    sentencesSpoken: 4,
    wordsLearned: 16,
    accuracyPercent: 90,
    durationSeconds: 200,
    timestamp,
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

  // Continue learning on day 0 is the library and nothing else: grammar,
  // listening, writing and coach are the Practice tab's screens, and that tab is
  // locked until the first finished conversation. Listing them here would be a
  // side door around the lock the next step adds.
  await expect(page.getByTestId('more-library')).toBeVisible();
  for (const row of ['more-grammar', 'more-listening', 'more-writing', 'more-coach']) {
    await expect(page.getByTestId(row)).toHaveCount(0);
  }
  await expect(page.getByTestId('more-preferences')).toBeVisible();

  // Day 0 tells the truth about day 0: no review list, no week, no offer.
  await expect(page.getByTestId('more-review')).toHaveCount(0);
  await expect(page.getByTestId('weekly-recap-card')).toHaveCount(0);
  await expect(page.getByTestId('more-pro')).toHaveCount(0);
  await expect(page.getByTestId('capability-card')).toHaveCount(0);
  // Step 7: day 0 has no «تقدّمك» section at all — no capability, no goal card,
  // no recap and no level line before there is a history to describe.
  await expect(page.getByTestId('chapter-goal-card')).toHaveCount(0);
  await expect(page.getByTestId('journey-level-line')).toHaveCount(0);

  // Closing returns to the screen, not to a blank one. (The habit panel arrives
  // with the first finished session, so day 0 has no tasks to return to.)
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByTestId('daily-tasks')).toHaveCount(0);
});

test('each destination in the sheet is one tap from the home screen', async ({ page }) => {
  await setSwitch(page, '1');
  await bootSignedIn(page);
  // One finished session, because four of these rows are the Practice tab's and
  // stay hidden until it unlocks (step 1c). Day-0 navigation to the library is
  // covered where it naturally happens: `openLibraryFromHome` in banner/firstRun.
  await seedRows(page, 'sessions', [aSession()]);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

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
  // A due card does not unlock the skills either: the tab lock follows sessions.
  await expect(page.getByTestId('more-writing')).toHaveCount(0);
});

test('day 1 with a due card: the skills unlock, but review and the progress facts still wait', async ({ page }) => {
  await setSwitch(page, '1');
  await bootSignedIn(page);
  await seedRows(page, 'sessions', [aSession()]);
  await seedRows(page, 'review_items', [aDueCard()]);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

  await openMore(page);

  // The first session is a real episode, so the Practice tab's rows and the Pro
  // offer arrive on the same fact the tab lock reads.
  for (const row of ['more-grammar', 'more-listening', 'more-writing', 'more-coach']) {
    await expect(page.getByTestId(row)).toBeVisible();
  }
  await expect(page.getByTestId('more-pro')).toBeVisible();

  // Review is returning work: it waits for day 2, even with a card due — and the
  // progress facts wait for three sessions, so «تقدّمك» is not there yet.
  await expect(page.getByTestId('more-review')).toHaveCount(0);
  await expect(page.getByTestId('weekly-recap-card')).toHaveCount(0);
  await expect(page.getByTestId('chapter-goal-card')).toHaveCount(0);
  await expect(page.getByTestId('journey-level-line')).toHaveCount(0);

  // The offer itself still respects the one rule: it opens the real paywall.
  await page.getByTestId('more-pro').click();
  await expect(page).toHaveURL(/\/subscription$/);
});

test('day 2 with three sessions: exactly one review entry point, and the progress facts', async ({ page }) => {
  await setSwitch(page, '1');
  await bootSignedIn(page);
  // Three finished conversations, yesterday: a small history (progress) and a
  // second day (review), while today's daily tasks stay open.
  const yesterday = Date.now() - 86_400_000;
  await seedRows(page, 'sessions', [
    aSession('sess_day2_1', 'airport_arrival', yesterday),
    aSession('sess_day2_2', 'cafe_order', yesterday),
    aSession('sess_day2_3', 'supermarket', yesterday),
  ]);
  await seedRows(page, 'review_items', [aDueCard()]);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

  // The hero is today's review — and it is the ONE review entry point. (The
  // agreed CTA spells a single item out: «راجع عنصراً واحداً الآن».)
  const hero = page.getByRole('button', { name: /^راجع / });
  await expect(hero).toBeVisible();
  await expect(hero).toHaveCount(1);

  await openMore(page);
  // The sheet does not repeat the hero's review, and the progress facts are here
  // because this learner has a history now.
  await expect(page.getByTestId('more-review')).toHaveCount(0);
  await expect(page.getByTestId('weekly-recap-card')).toBeVisible();
  await expect(page.getByTestId('journey-level-line')).toBeVisible();
  expect(
    (await page.getByTestId('capability-card').count()) + (await page.getByTestId('chapter-goal-card').count()),
  ).toBe(1);
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
