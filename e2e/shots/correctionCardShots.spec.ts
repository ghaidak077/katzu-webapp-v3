import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { bootSignedIn, turn } from '../harness';

/**
 * Before/after evidence for the correction card at the narrow phone width.
 *
 * Three cases, chosen because each stresses a different part of the card:
 * a one-letter spelling slip (`halo` → `hallo`), a capitalisation error, and a
 * long German compound that has to wrap inside a 360 px viewport. The same rig
 * produces both sides; `TAG` only changes the file name.
 *
 *   TAG=before E2E_TARGET=preview npx playwright test -c e2e/correctionCardShots.playwright.config.ts
 *   TAG=after  E2E_TARGET=preview npx playwright test -c e2e/correctionCardShots.playwright.config.ts
 */

const TAG = process.env.TAG === 'after' ? 'after' : 'before';
const OUT_DIR = join(process.cwd(), 'docs', 'agent', 'correction-card');

const CASES = [
  {
    slug: 'one-letter',
    original: 'halo',
    corrected: 'hallo',
    rule: 'Groß- und Kleinschreibung',
    explanation: 'كلمة التحية تُكتب بلامين: hallo. اللام المزدوجة هي الفرق الوحيد.',
  },
  {
    slug: 'capitalisation',
    original: 'ich möchte einen Kaffee',
    corrected: 'Ich möchte einen Kaffee',
    rule: 'Groß- und Kleinschreibung',
    explanation: 'أول كلمة في الجملة الألمانية تبدأ بحرف كبير: Ich.',
  },
  {
    slug: 'long-word',
    original: 'Ich habe die Krankenversicherungsbescheinigung nicht',
    corrected: 'Ich habe die Krankenversicherungsbescheinigung nicht dabei',
    rule: 'ترتيب الكلمات: الفعل في الموضع الثاني',
    explanation: 'أضف dabei في نهاية الجملة لتوضيح أنك لا تحمل الوثيقة معك الآن.',
  },
] as const;

async function shoot(page: Page, slug: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `correction-${slug}-360x740-${TAG}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
}

for (const item of CASES) {
  test(`correction card: ${item.slug} [${TAG}]`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await bootSignedIn(page, {
      turns: [
        turn({
          reply_de: 'Verstanden. Noch etwas?',
          reply_ar: 'فهمت. هل من شيء آخر؟',
          is_correct: false,
          original_mistake: item.original,
          corrected_german: item.corrected,
          grammar_rule: item.rule,
          explanation_ar: item.explanation,
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
