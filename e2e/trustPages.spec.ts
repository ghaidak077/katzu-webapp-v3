import { test, expect } from '@playwright/test';
import { mockBackend } from './harness';

/**
 * The public trust pages, as a stranger reads them.
 *
 * WHY THIS EXISTS
 * C1 shipped these pages as fields and left ten owner-only `{{OWNER_FILL}}`
 * placeholders. The unit tests pin `content.ts`; nothing pinned what a VISITOR
 * sees, and the audit found the gap: `/trust/privacy` rendered the raw token in
 * the middle of the policy — the same defect B1 fixed on the paywall's refund
 * line — and one of those "owner fields" was an address the app already prints in
 * three other places.
 *
 * Two things are asserted, and they pull in opposite directions on purpose: the
 * page must never show an unfinished token (so a reader is not shown scaffolding),
 * and it must never pretend to be complete (so the missing sections are still
 * counted out loud). A page that satisfies only the first would be a lie.
 */
const SUPPORT = 'support@ghaidak.com';

for (const page of ['privacy', 'terms', 'refund', 'imprint', 'contact'] as const) {
  test(`/trust/${page} reaches a visitor with no account and shows no raw placeholder`, async ({ browser }) => {
    // A fresh context: no seeded learner, no session, nothing but a link.
    const context = await browser.newContext();
    const visitor = await context.newPage();
    await mockBackend(visitor);
    await visitor.goto(`/trust/${page}`);
    await expect(visitor.locator('#root')).not.toBeEmpty({ timeout: 20_000 });

    const body = await visitor.locator('body').innerText();
    expect(body, 'a visitor must never read the raw placeholder token').not.toContain('{{');
    expect(body).not.toContain('OWNER_FILL');
    // Nor an obvious scaffold word standing in for a sentence.
    expect(body).not.toMatch(/\bTODO\b|Lorem ipsum/);
    await context.close();
  });
}

test('the privacy policy names the address the app actually answers on', async ({ browser }) => {
  const context = await browser.newContext();
  const visitor = await context.newPage();
  await mockBackend(visitor);
  await visitor.goto('/trust/privacy');
  await expect(visitor.getByText('لأي سؤال عن الخصوصية')).toBeVisible();
  // The address is not an owner decision — the contact button below it and the
  // public deletion page both use this one, so asking the owner for it made the
  // policy say "write to <unfinished>" while the app knew the answer.
  await expect(visitor.getByText(new RegExp(SUPPORT))).toBeVisible();
  await context.close();
});

test('an unfinished policy still says so out loud', async ({ browser }) => {
  const context = await browser.newContext();
  const visitor = await context.newPage();
  await mockBackend(visitor);
  await visitor.goto('/trust/imprint');
  await expect(visitor.locator('#root')).not.toBeEmpty({ timeout: 20_000 });
  // The imprint is the page with the most open owner fields, so the warning must
  // be here. If the owner ever fills them, this assertion is meant to be updated
  // with the count — not deleted, which would remove the honesty check.
  await expect(visitor.getByText(/غير مكتملة/)).toBeVisible();
  await context.close();
});
