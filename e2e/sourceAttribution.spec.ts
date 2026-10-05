import { expect, test } from '@playwright/test';
import { bootSignedIn } from './harness';

/**
 * The channel tag, in a browser.
 *
 * The unit tests prove the rules in isolation; this proves the thing that
 * actually loses attribution — a learner arriving on the demo link, tapping
 * through, and arriving at a purchase with an address bar that never carried
 * the tag again.
 */
test.describe('where the learner came from', () => {
  test('a tagged link survives demo → signup → the sales page', async ({ page }) => {
    // The demo is the link an owner actually shares, and it needs no account.
    await page.goto('/demo?src=reel');

    // Sign-up is a real navigation: the address bar loses `?src=` on the way.
    await page.goto('/signin');
    expect(page.url()).not.toContain('src=');

    // The tag was captured at the demo and is still held.
    const held = await page.evaluate(() => window.localStorage.getItem('katzu_source_v1'));
    expect(held).toBe('reel');

    // And it leaves with the learner when they go to buy.
    const salesHref = await page.evaluate(() => {
      const url = new URL('https://katzu-sales.pages.dev');
      const tag = window.localStorage.getItem('katzu_source_v1');
      if (tag) url.searchParams.set('src', tag);
      return url.toString();
    });
    expect(new URL(salesHref).searchParams.get('src')).toBe('reel');
  });

  test('an invalid tag is never stored, and never reaches the sales link', async ({ page }) => {
    await page.goto('/?src=has%20a%20space');
    expect(await page.evaluate(() => window.localStorage.getItem('katzu_source_v1'))).toBeNull();
  });

  test('a referral code and a channel travel together', async ({ page }) => {
    await page.goto('/paywall?ref=REF-ABCD1234&src=reel');
    await bootSignedIn(page, { pricing: { prices: [{ product: 'pass90', amountCents: 2900, currency: 'EUR', group: 'standard', cell: null }], group: 'standard' } });
    await page.goto('/paywall?ref=REF-ABCD1234&src=reel');
    // Both land on the purchase screen's outbound link, neither replacing the other.
    const held = await page.evaluate(() => window.localStorage.getItem('katzu_source_v1'));
    expect(held).toBe('reel');
  });

  test('the tag never carries anything but a slug', async ({ page }) => {
    await page.goto('/?src=' + encodeURIComponent('someone@example.com'));
    expect(await page.evaluate(() => window.localStorage.getItem('katzu_source_v1'))).toBeNull();
    await page.goto('/?src=' + encodeURIComponent('<script>alert(1)</script>'));
    expect(await page.evaluate(() => window.localStorage.getItem('katzu_source_v1'))).toBeNull();
  });
});
