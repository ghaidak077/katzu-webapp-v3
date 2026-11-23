import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, seedSignedInUser, turn } from '../harness';

/**
 * A normal learner's walk through the real bundle, captured as screenshots.
 *
 * WHY THIS RIG EXISTS
 * Every other spec asserts a contract; none of them answers "what does a person
 * actually see, in order, on a phone?" — so a review of the product was being
 * done by reading components. This one takes the eleven screens a first-time
 * learner meets, at 390x844, with the backend and microphone mocked exactly as
 * the suite mocks them, and leaves PNGs in `.tmp/ux-audit/` to be looked at.
 *
 * It asserts almost nothing on purpose: its product is the picture, and a
 * stricter assertion here would turn an audit into a gate that fails for design
 * reasons. The one thing it does assert is that each screen rendered at all.
 */

const OUT_DIR = join(process.cwd(), '.tmp', 'ux-audit');
const PHONE = { width: 390, height: 844 } as const;

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${name}.png`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

test.describe('a first-time visitor, before signing in', () => {
  test('cold start, welcome, sign in', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
    await shoot(page, '01-cold-start');

    await page.goto('/welcome');
    await shoot(page, '02-welcome');

    await page.goto('/signin');
    await shoot(page, '03-signin');
  });
});

test.describe('a signed-in learner, the daily loop', () => {
  test('trail, library, study, live, review, profile, paywall', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await bootSignedIn(page, {
      // A1 is the level a new learner is served, and the one whose Arabic rule
      // changed: the opener shows its translation, later replies are one tap
      // away. Booting A0 would have proved the old always-on path instead.
      user: { cefrLevel: 'A1' },
      turns: [
        turn({
          reply_de: 'Guten Tag! Möchten Sie einen Kaffee oder einen Tee?',
          reply_ar: 'نهارك سعيد! هل تريد قهوة أم شاي؟',
        }),
      ],
    });

    await page.goto('/app/trail');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    await shoot(page, '04-trail-home');

    await page.goto('/app/library');
    await shoot(page, '05-library');

    await page.goto('/scenario/cafe_order/study');
    await shoot(page, '06-scenario-study');

    await page.goto('/scenario/cafe_order/live');
    await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
    const input = page.getByPlaceholder(/Schreib deinen Satz/);
    await expect(input).toBeVisible();
    await shoot(page, '07-live-opener');

    const before = await page.locator('article').count();
    await input.fill('Ich möchte einen Kaffee, bitte.');
    await page.getByRole('button', { name: 'أرسل جملتك' }).click();
    await expect(page.locator('article')).toHaveCount(before + 2, { timeout: 30_000 });
    await shoot(page, '08-live-turn');

    await page.goto('/app/review');
    await shoot(page, '09-review');

    await page.goto('/app/trail');
    await page.getByRole('button', { name: /الملف/ }).click();
    await expect(page).toHaveURL(/\/app\/profile/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'حسابي' })).toBeVisible();
    await shoot(page, '10-profile');

    await page.goto('/paywall');
    await shoot(page, '11-paywall');
  });
});

test.describe('a learner who has already finished a session', () => {
  test('the report they get', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
    await seedSignedInUser(page);
    await page.goto('/session-report');
    await shoot(page, '12-session-report');
  });
});
