import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, seedStoreRow, turn } from '../harness';

/**
 * Before/after evidence for the scripted-conversation rebuild, at 390×844.
 *
 * The session that failed in the real app: the learner answered «Wie heißt du?»
 * and the next bubble asked it again. The script engine now advances to the next
 * step, so the same input produces the next question instead.
 *
 *   TAG=after  E2E_TARGET=preview npx playwright test -c e2e/sessionFixShots.playwright.config.ts
 */

const TAG = process.env.TAG === 'after' ? 'after' : 'before';
const OUT_DIR = process.env.SHOT_OUT || join(process.cwd(), '.tmp');

async function shoot(page: Page, slug: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `session-replay-${slug}-390x844-${TAG}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

async function openGreetings(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootSignedIn(page, {
    user: { displayName: 'Ghaidak' },
    turns: [
      turn({
        reply_de: 'Woher kommst du?',
        reply_ar: 'من أين أنت؟',
        understood_de: 'Ich heiße Ghaidak.',
        hint_de: 'Ich heiße ___.',
        hint_ar: 'اسمي ___.',
      }),
    ],
  });
  await seedStoreRow(page, 'scenarios', {
    id: 'first_greetings',
    title_de: 'Erste Wörter: Hallo und Tschüss',
    title_ar: 'أول الكلمات: مرحباً ومع السلامة',
    ai_persona: 'Nachbarin katze',
    category: 'daily_life',
    icon: 'hand',
    initial_message_a0: 'Hallo! Wie heißt du?',
    initial_message_a1: 'Hallo! Ich bin Frau Yilmaz. Wie heißt du?',
    initial_message_a2: 'Hallo, ich wohne neu hier. Wie heißt du?',
    initial_message_b1: 'Hallo! Ich bin neu in der Straße. Wie heißt du, und woher kommst du?',
    initial_message_b2: 'Hallo! Ich bin letzte Woche eingezogen. Wie heißt du, und wie gefällt dir die Nachbarschaft?',
  });
  await page.goto('/scenario/first_greetings/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
}

test(`session replay: name answered without a repeat [${TAG}]`, async ({ page }) => {
  await openGreetings(page);

  await expect(page.getByText(/Wie heißt du\?/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich heiße Ghaidak.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();

  // The next question is the next STEP. The old engine could re-ask the name.
  await expect(page.getByText(/Woher kommst du/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Wie heißt du nochmal/)).toHaveCount(0);
  await page.waitForTimeout(400);
  await shoot(page, 'name-answered');
});

test(`session replay: hint dock [${TAG}]`, async ({ page }) => {
  await openGreetings(page);

  // The dock carries the persona's next sentence, which the turn returns; on a
  // cold open the starter floor is fetched from the Worker, so answer first.
  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich heiße Ghaidak.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();

  const dock = page.getByTestId('hint-dock');
  await expect(dock).toBeVisible({ timeout: 20_000 });
  await expect(dock).toContainText('Ich heiße ___.');
  await expect(dock.getByRole('button', { name: /سمّعني/ })).toBeVisible();
  await page.waitForTimeout(300);
  await shoot(page, 'hint-dock');
});

test(`session replay: correction chip [${TAG}]`, async ({ page }) => {
  await openGreetings(page);

  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich heise Ghaidak');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();

  const chip = page.getByTestId('correction-card').getByText('تصحيح صغير', { exact: true });
  await expect(chip).toBeVisible({ timeout: 20_000 });
  await chip.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shoot(page, 'correction-collapsed');
});
