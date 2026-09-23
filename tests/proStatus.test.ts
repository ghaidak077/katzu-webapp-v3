import { describe, expect, it } from 'vitest';
import { isProEffective } from '@/lib/utils/subscription';

describe('isProEffective', () => {
  it('rejects missing or inactive flags', () => {
    expect(isProEffective(null)).toBe(false);
    expect(isProEffective(undefined)).toBe(false);
    expect(isProEffective({})).toBe(false);
    expect(isProEffective({ isSubscriptionActive: false })).toBe(false);
  });

  it('accepts an active subscription without an expiry date', () => {
    expect(isProEffective({ isSubscriptionActive: true, subscriptionExpiresAt: null })).toBe(true);
    expect(isProEffective({ isSubscriptionActive: true })).toBe(true);
  });

  it('accepts an active subscription with a future expiry', () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    expect(isProEffective({ isSubscriptionActive: true, subscriptionExpiresAt: future })).toBe(true);
  });

  it('downgrades an expired subscription even if the flag is stale-true', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isProEffective({ isSubscriptionActive: true, subscriptionExpiresAt: past })).toBe(false);
  });

  it('treats an unparsable expiry conservatively as active (server decides)', () => {
    expect(isProEffective({ isSubscriptionActive: true, subscriptionExpiresAt: 'not-a-date' })).toBe(true);
  });
});
