import { expect, test } from '@playwright/test';
import { bootSignedIn, seedRows } from './harness';

/**
 * The three daily tasks (V28 Stage 3) on Journey Home.
 *
 * Proves what a learner sees: all three tasks named with their one action when
 * none is done, and the same panel turning to done + a started streak once the
 * day's own record says the work happened. The rule itself is unit-tested; this
 * is the rendering contract.
 *
 * Step 7: the panel is a habit surface, not a first-run one — it appears with
 * the first finished conversation. Both tests therefore record one session,
 * dated yesterday so today's tasks still start at 0/3.
 */

function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** One finished session, dated yesterday so it does not complete today's task. */
function aSession(): Record<string, unknown> {
  return {
    id: 'sess_daily_1',
    scenarioId: 'airport_arrival',
    scenarioTitle: 'في المطار: الأمتعة',
    cefrLevel: 'A1',
    sentencesSpoken: 4,
    wordsLearned: 16,
    accuracyPercent: 90,
    durationSeconds: 200,
    timestamp: Date.now() - 86_400_000,
    wasIndependentOnly: true,
    independentSentences: 4,
    hintAssistedSentences: 0,
    mode: 'practice',
    mistakesCount: 0,
  };
}

test('Journey Home names the three daily tasks with one action each', async ({ page }) => {
  await bootSignedIn(page);
  await seedRows(page, 'sessions', [aSession()]);
  await page.reload();

  const panel = page.getByTestId('daily-tasks');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('محادثة مشهد واحدة')).toBeVisible();
  await expect(panel.getByText('خطوة قواعد واحدة')).toBeVisible();
  await expect(panel.getByText('دفعة مراجعة')).toBeVisible();
  // Launch polish: the panel is a compact checklist — whole rows are the tap
  // targets now, so the per-task text buttons are gone. The names survive as
  // the row's accessible name; the done state renders as a checklist row, not
  // a removed button.
  await expect(panel.getByRole('button', { name: /محادثة مشهد واحدة/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /خطوة قواعد واحدة/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /دفعة مراجعة/ })).toBeVisible();
  await expect(panel.getByText('0 / 3')).toBeVisible();
});

test('a completed day renders as done and starts the daily streak', async ({ page }) => {
  await bootSignedIn(page);
  await seedRows(page, 'sessions', [aSession()]);

  const now = Date.now();
  await seedRows(page, 'daily_tasks', [
    {
      dateKey: localDayKey(new Date(now)),
      scenario: true,
      grammar: true,
      review: true,
      reviewReps: 5,
      completedAt: now,
      updatedAt: now,
    },
  ]);

  await page.goto('/app/trail');

  const panel = page.getByTestId('daily-tasks');
  await expect(panel.getByText('3 / 3')).toBeVisible();
  // V31: the one is written as a WORD, not as "1 يوم" — Arabic does not put a
  // digit in front of the singular. The string below is the correct Arabic, and
  // this assertion is what keeps it that way.
  await expect(panel.getByText('يوم متتالٍ في مهام اليوم')).toBeVisible();
  await expect(panel.getByText('تم', { exact: true })).toHaveCount(3);
});
