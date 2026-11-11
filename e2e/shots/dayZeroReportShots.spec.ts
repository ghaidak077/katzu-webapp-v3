import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, turn } from '../harness';

/**
 * Evidence for Step 5 — the day-0 finish line.
 *
 * Four real-viewport (390×844) screenshots: the first view, the same view with
 * «تفاصيل الجلسة» open, the early-ended variant (the honest «بدأتَ رحلتك» line),
 * and the flag-off screen that must stay exactly as shipped. The device switch
 * is set per test, so the rig proves both flag states from one build.
 *
 *   E2E_TARGET=preview npx playwright test -c e2e/dayZeroShots.playwright.config.ts
 */

const OUT_DIR = join(process.cwd(), 'docs', 'agent', 'day-zero-finish');

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const vp = page.viewportSize();
  const file = join(OUT_DIR, `${name}-${vp?.width}x${vp?.height}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

async function setSwitch(page: Page, value: '1' | '0') {
  await page.addInitScript((flag) => {
    try {
      localStorage.setItem('kz.guidedHome', flag);
    } catch {
      /* storage disabled: the build default applies */
    }
  }, value);
}

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

async function openCafe(page: Page): Promise<void> {
  await page.goto('/scenario/cafe_order/live');
  await page.getByRole('button', { name: 'تدريب (مع مساعدة)' }).click();
}

async function finishCafe(page: Page): Promise<void> {
  await openCafe(page);
  const replies = [
    'Guten Tag! Möchten Sie einen Kaffee?',
    'Gerne. Einen Kaffee, bitte schön.',
    'Sehr gern. Möchten Sie noch etwas?',
    'Perfekt. Auf Wiedersehen!',
  ];
  for (const reply of replies) {
    await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich möchte einen Kaffee bitte');
    await page.getByRole('button', { name: 'أرسل جملتك' }).click();
    await expect(page.getByText(reply)).toBeVisible();
  }
  await expect(page).toHaveURL(/\/session-report$/, { timeout: 30_000 });
}

test('day 0 — closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setSwitch(page, '1');
  await bootSignedIn(page, { turns: episodeTurns() });
  await finishCafe(page);
  await expect(page.getByRole('heading', { level: 1, name: 'أنجزت محادثتك الأولى!' })).toBeVisible();
  await page.waitForTimeout(500);
  await shoot(page, 'day-zero-closed');
});

test('day 0 — details open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setSwitch(page, '1');
  await bootSignedIn(page, { turns: episodeTurns() });
  await finishCafe(page);
  const details = page.getByRole('button', { name: 'تفاصيل الجلسة' });
  await details.click();
  await expect(page.locator('#day-zero-details')).toBeVisible();
  await page.locator('#day-zero-details').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(400);
  await shoot(page, 'day-zero-open');
});

test('day 0 — ended early', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setSwitch(page, '1');
  await bootSignedIn(page, { turns: episodeTurns() });
  await openCafe(page);
  await page.getByPlaceholder(/Schreib deinen Satz/).fill('Ich möchte einen Kaffee bitte');
  await page.getByRole('button', { name: 'أرسل جملتك' }).click();
  await expect(page.getByText('Guten Tag! Möchten Sie einen Kaffee?')).toBeVisible();
  await page.getByRole('button', { name: 'خيارات الجلسة' }).click();
  await page.getByRole('button', { name: 'إنهاء الجلسة وعرض الملخص' }).click();
  await expect(page).toHaveURL(/\/session-report$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'بدأتَ رحلتك — هذه أول محادثة لك.' })).toBeVisible();
  await page.waitForTimeout(500);
  await shoot(page, 'day-zero-early-ended');
});

test('flag off — today\'s full report', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setSwitch(page, '0');
  await bootSignedIn(page, { turns: episodeTurns() });
  await finishCafe(page);
  await expect(page.getByText('جُمل نطقتها بلا مساعدة')).toBeVisible();
  await page.waitForTimeout(500);
  await shoot(page, 'day-zero-flag-off');
});
