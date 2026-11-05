import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, turn } from '../harness';

/**
 * Evidence for the per-reply «أبلغ عن رد سيئ» action at phone width.
 *
 * The action is an icon-only button in the meta row under every Katzu bubble.
 * This rig renders the real built bundle at 390 px, drives one scripted AI
 * reply, measures where the button sits relative to the bubble, and captures
 * both the transcript and the confirmation sheet.
 *
 *   E2E_TARGET=preview npx playwright test -c e2e/reportActionShots.playwright.config.ts
 */

const OUT_DIR = join(process.cwd(), 'docs', 'agent', 'report-action');

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, name);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

test('report action under an AI reply at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootSignedIn(page, {
    turns: [
      turn({
        reply_de: 'Sehr gern. Möchten Sie noch etwas trinken?',
        reply_ar: 'بكل سرور. هل تريد شراباً آخر؟',
      }),
    ],
  });

  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich möchte einen Kaffee bitte');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();

  const report = page.getByRole('button', { name: 'أبلغ عن رد سيئ' }).last();
  await expect(report).toBeVisible({ timeout: 20_000 });
  await report.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  const button = await report.boundingBox();
  const bubble = await page.getByText('Sehr gern. Möchten Sie noch etwas trinken?').first().boundingBox();
  console.log('REPORT_BUTTON', JSON.stringify(button));
  console.log('AI_BUBBLE', JSON.stringify(bubble));

  await shoot(page, 'report-action-390x844.png');

  await report.click();
  await expect(page.getByText('إرسال هذا التبادل لفريق كاتزو؟')).toBeVisible();
  await page.waitForTimeout(300);
  await shoot(page, 'report-confirm-390x844.png');
});
