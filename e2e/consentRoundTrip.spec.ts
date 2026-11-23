import { expect, test, type Page, type Route } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The consent switch, from the tap to the next page load.
 *
 * WHY THIS SPEC EXISTS
 * The worker's `/consent/conversation` route is covered turn by turn in
 * `tests/conversationConsent.test.ts` (namespaced key, withdrawal deletes, refuses a
 * dead grant). The SCREEN was not: nothing proved that the switch shows the server's
 * answer, that a tap actually writes it, or that a failed write leaves the switch
 * where the learner can see it did not save. The last one matters most — an opt-out
 * that silently failed would leave stored text in place while the learner believes
 * it gone, so the copy for that branch is a promise the code has to keep.
 *
 * The route below is stateful (it remembers the grant between requests) so the
 * reload assertion reads the server's state back through `getConversationConsent`
 * rather than the React state the click just set. It is a stand-in for the worker,
 * not a second implementation of it.
 */

type ConsentState = { available: boolean; granted: boolean; deletedTurns: number };

// A prefix match: the accessible name is the switch’s whole text block, and the
// label’s own parentheses are literal there, not a regex group.
const CONSENT_NAME = /مراجعة المحادثات/;

/** A memory-backed `/consent/conversation`: GET reports, POST writes, as the worker does. */
async function serveConsent(page: Page, state: ConsentState, failWrites = false) {
  const handler = async (route: Route) => {
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (route.request().method() === 'GET') {
      return json({ ok: true, available: state.available, granted: state.granted });
    }
    const body = JSON.parse(route.request().postData() || '{}') as { granted?: unknown };
    if (failWrites) return json({ ok: false, error: 'network' });
    if (typeof body.granted !== 'boolean') return json({ ok: false, error: 'bad_request' });
    if (body.granted && !state.available) return json({ ok: false, error: 'unavailable' });
    state.granted = body.granted;
    state.deletedTurns = body.granted ? 0 : 4;
    return json({ ok: true, granted: state.granted, deleted_turns: state.deletedTurns });
  };
  await page.route('**/consent/conversation', handler);
}

/** Open the Profile tab, where the switch lives, and expand its section. */
async function openProfile(page: Page) {
  await page.getByRole('button', { name: /الملف/ }).click();
  const section = page.getByRole('button', { name: /الحساب والخصوصية/ });
  await expect(section).toBeVisible({ timeout: 15_000 });
  if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click();
  await expect(page.getByRole('switch', { name: CONSENT_NAME })).toBeVisible();
}

test('a grant is written, survives a reload, and a withdrawal is shown only after the server confirms it', async ({
  page,
}) => {
  const state: ConsentState = { available: true, granted: false, deletedTurns: 0 };
  await bootSignedIn(page);
  await serveConsent(page, state);
  await openProfile(page);

  const toggle = page.getByRole('switch', { name: CONSENT_NAME });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(toggle).toBeEnabled();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(state.granted, 'the tap reached the server, not just React state').toBe(true);

  // The reload is the assertion that matters: nothing local can make this true.
  await page.reload();
  await openProfile(page);
  await expect(page.getByRole('switch', { name: CONSENT_NAME })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await page.getByRole('switch', { name: CONSENT_NAME }).click();
  await expect(page.getByRole('switch', { name: CONSENT_NAME })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  expect(state.deletedTurns, 'withdrawal asked the server to delete the stored turns').toBe(4);
});

test('a failed write leaves the switch off and says it failed', async ({ page }) => {
  const state: ConsentState = { available: true, granted: false, deletedTurns: 0 };
  await bootSignedIn(page);
  await serveConsent(page, state, true);
  await openProfile(page);

  const toggle = page.getByRole('switch', { name: CONSENT_NAME });
  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('alert')).toContainText('تعذر حفظ الموافقة');
  expect(state.granted).toBe(false);
});

test('when the operator switch is off the control is disabled and explains itself', async ({ page }) => {
  const state: ConsentState = { available: false, granted: false, deletedTurns: 0 };
  await bootSignedIn(page);
  await serveConsent(page, state);
  await openProfile(page);

  await expect(page.getByRole('switch', { name: CONSENT_NAME })).toBeDisabled();
  await expect(page.getByText('حفظ المحادثات للمراجعة غير مفعّل على الخادم الآن')).toBeVisible();
});
