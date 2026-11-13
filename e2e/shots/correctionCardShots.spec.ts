import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, turn } from '../harness';

/**
 * Before/after evidence for the correction card in a real phone viewport.
 *
 * Three cases, chosen because each one exercises a different deterministic local
 * check (they do not need the AI at all, so the "after" side proves the local
 * checker even when the worker only ever returns a generic reply):
 *
 *   1. spelling        `Ich leibe katze`            -> liebe / Katze
 *   2. capitalisation  `hallo Frau Meier ich ...`   -> greeting comma + names
 *   3. false friend    `Ich habe ein Gift für dich` -> Geschenk
 *
 * The same rig produces both sides; `TAG` only changes the file name and
 * `SHOT_OUT` lets a detached HEAD worktree write into the main tree's `.tmp`.
 *
 *   TAG=before E2E_TARGET=preview npx playwright test -c e2e/correctionCardShots.playwright.config.ts
 *   TAG=after  E2E_TARGET=preview npx playwright test -c e2e/correctionCardShots.playwright.config.ts
 */

const TAG = process.env.TAG === 'after' ? 'after' : 'before';
const OUT_DIR = process.env.SHOT_OUT || join(process.cwd(), '.tmp');

const CASES = [
  {
    slug: 'spelling',
    original: 'Ich leibe katze',
    corrected: 'Ich liebe eine Katze.',
    rule: 'Rechtschreibung: ie statt ei',
    explanation: 'اكتب ie بدل ei، والاسم Katze يبدأ بحرف كبير.',
  },
  {
    slug: 'greeting-name',
    original: 'hallo Frau Meier ich heiße ghaidak',
    corrected: 'Hallo Frau Meier, ich heiße Ghaidak.',
    rule: 'Komma nach Anrede',
    explanation: 'بعد النداء تكتب فاصلة، والأسماء تبدأ بحرف كبير.',
  },
  {
    slug: 'false-friend',
    original: 'Ich habe ein Gift für dich',
    corrected: 'Ich habe ein Geschenk für dich.',
    rule: 'Bedeutung: Gift ≠ Geschenk',
    explanation: 'Gift تعني «سُم»؛ الهدية هي Geschenk.',
  },
] as const;

async function shoot(page: Page, slug: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `correction-${slug}-390x844-${TAG}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

for (const item of CASES) {
  test(`correction card: ${item.slug} [${TAG}]`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootSignedIn(page, {
      turns: [
        turn({
          reply_de: 'Verstanden. Noch etwas?',
          reply_ar: 'فهمت. هل من شيء آخر؟',
          understood_de: item.corrected,
          fix_reason_ar: item.explanation,
        }),
      ],
    });

    await page.goto('/scenario/cafe_order/live');
    await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();

    await page.getByPlaceholder(/Schreib deinen Satz/).fill(item.original);
    await page.getByRole('button', { name: 'أرسل جملتك' }).click();

    // The header exists in both the before and after card, so the same rig can
    // capture either build without depending on the new markup.
    const cardHeader = page.getByText('تصحيح كَاتْزُو', { exact: true });
    await expect(cardHeader).toBeVisible({ timeout: 20_000 });
    await cardHeader.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await shoot(page, item.slug);
  });
}
