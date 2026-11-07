import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, seedStoreRow, turn } from '../harness';

/**
 * Before/after evidence for the session-replay fixes, at a real phone viewport.
 *
 * Two states the owner actually saw:
 *   1. correction — `Ich heiße ghaidak`: exactly one capital `G`, and no final
 *      period silently added (the old build also mangled a following `dir`).
 *   2. hints      — after «Wie geht es dir?» the sheet is not empty and its first
 *      chip answers the question («Mir geht es gut, danke.»).
 *
 * The same rig produces both sides; `TAG` only changes the file name.
 *
 *   TAG=before E2E_TARGET=preview npx playwright test -c e2e/sessionFixShots.playwright.config.ts
 *   TAG=after  E2E_TARGET=preview npx playwright test -c e2e/sessionFixShots.playwright.config.ts
 */

const TAG = process.env.TAG === 'after' ? 'after' : 'before';
const OUT_DIR = process.env.SHOT_OUT || join(process.cwd(), '.tmp');

async function shoot(page: Page, slug: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `session-fix-${slug}-390x844-${TAG}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

async function openGreetings(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootSignedIn(page, {
    user: { displayName: 'Ghaidak' },
    turns: [
      turn({ reply_de: 'Wie heißt du nochmal, bitte?', is_correct: true }),
      turn({ reply_de: 'Schön, Ghaidak. Wie geht es dir?', is_correct: true }),
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

test(`session fix: correction [${TAG}]`, async ({ page }) => {
  await openGreetings(page);

  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich heiße ghaidak');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();

  const cardHeader = page.getByText('تصحيح كَاتْزُو', { exact: true });
  await expect(cardHeader).toBeVisible({ timeout: 20_000 });
  await cardHeader.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shoot(page, 'correction');
});

test(`session fix: hints [${TAG}]`, async ({ page }) => {
  await openGreetings(page);

  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich heiße Ghaidak.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Wie heißt du nochmal, bitte?').first()).toBeVisible({ timeout: 20_000 });

  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich heiße Ghaidak.');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Schön, Ghaidak. Wie geht es dir?').first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'اقتراح لردّك' }).click();
  await page.waitForTimeout(600);
  await shoot(page, 'hints');
});
