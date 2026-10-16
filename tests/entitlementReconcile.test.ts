import { describe, expect, it } from 'vitest';
import { reconcileEntitlement } from '../src/lib/entitlement/reconcile';

/**
 * B2: entitlement is set once by sign-in and redemption, and nothing re-checked
 * it — so a learner who paid on one device stayed free on another, and one whose
 * subscription the server had stopped honouring kept Pro until the stored date
 * happened to pass. These cases pin both directions of the correction, and the
 * two ways a correction must NOT happen.
 */

const ACTIVE = { active: true, checked: true, expiresAt: '2026-12-01T00:00:00.000Z' };

describe('reconciling the subscription with the server', () => {
  it('gives a paying learner their Pro back on a device that never saw them pay', () => {
    // The pay-on-the-phone, open-on-the-tablet case: local says free, the server
    // says otherwise, and the server wins.
    expect(reconcileEntitlement(ACTIVE, { isSubscriptionActive: false, subscriptionExpiresAt: null })).toEqual({
      isSubscriptionActive: true,
      subscriptionExpiresAt: '2026-12-01T00:00:00.000Z',
    });
  });

  it('takes Pro away from a row the server no longer honours', () => {
    // A refund, a revocation or an expiry the device never noticed. The date is
    // KEPT rather than cleared: it is the record of when it ended.
    expect(
      reconcileEntitlement(
        { active: false, checked: true, expiresAt: null },
        { isSubscriptionActive: true, subscriptionExpiresAt: '2026-01-01T00:00:00.000Z' },
      ),
    ).toEqual({ isSubscriptionActive: false });
  });

  it('never lets an unanswered question change anything', () => {
    // Offline, a captive portal, a 500, no session token: the call returns
    // `active: false`, and `checked: false` is the whole reason that may not be
    // written down. A network failure is not a refund.
    const local = { isSubscriptionActive: true, subscriptionExpiresAt: '2026-01-01T00:00:00.000Z' };
    expect(reconcileEntitlement({ active: false, checked: false }, local)).toBeNull();
    expect(reconcileEntitlement(null, local)).toBeNull();
    expect(reconcileEntitlement(undefined, local)).toBeNull();
  });

  it('costs nothing when the app and the server already agree', () => {
    // No write, no re-render: the common case is every open for most learners.
    expect(reconcileEntitlement(ACTIVE, { isSubscriptionActive: true, subscriptionExpiresAt: ACTIVE.expiresAt })).toBeNull();
    expect(reconcileEntitlement({ active: false, checked: true }, { isSubscriptionActive: false })).toBeNull();
  });

  it('keeps a known expiry when the server omits the date', () => {
    // `expiresAt` is what B3 warns from; an answer that is silent about the date
    // must not erase the one the app already holds.
    expect(
      reconcileEntitlement(
        { active: true, checked: true, expiresAt: null },
        { isSubscriptionActive: true, subscriptionExpiresAt: '2026-11-01T00:00:00.000Z' },
      ),
    ).toBeNull();
    expect(
      reconcileEntitlement({ active: true, checked: true, expiresAt: null }, { isSubscriptionActive: false }),
    ).toEqual({ isSubscriptionActive: true });
  });

  it('moves the date when the server names a different one', () => {
    // A renewal extends the expiry; the local row has to follow or the app would
    // stop honouring Pro early.
    expect(
      reconcileEntitlement(ACTIVE, {
        isSubscriptionActive: true,
        subscriptionExpiresAt: '2026-11-01T00:00:00.000Z',
      }),
    ).toEqual({ subscriptionExpiresAt: '2026-12-01T00:00:00.000Z' });
  });

  it('stores the free allowance the ledger reports, and only a number (B5)', () => {
    // The count is what the conversation screen shows before the wall. A number
    // the server gave is stored; `null` (ledger unreachable) never overwrites
    // what is there, because a stale number and no number are different claims.
    expect(
      reconcileEntitlement({ active: false, checked: true, freeSessionsRemaining: 2 }, { isSubscriptionActive: false, freeSessionsRemaining: 3 }),
    ).toEqual({ freeSessionsRemaining: 2 });
    expect(
      reconcileEntitlement({ active: false, checked: true, freeSessionsRemaining: 0 }, { isSubscriptionActive: false, freeSessionsRemaining: 3 }),
    ).toEqual({ freeSessionsRemaining: 0 });
    expect(
      reconcileEntitlement({ active: false, checked: true, freeSessionsRemaining: null }, { isSubscriptionActive: false, freeSessionsRemaining: 3 }),
    ).toBeNull();
    // Nothing about the allowance travels with an unanswered question either.
    expect(
      reconcileEntitlement({ active: false, checked: false, freeSessionsRemaining: 0 }, { isSubscriptionActive: false, freeSessionsRemaining: 3 }),
    ).toBeNull();
  });

  it('truncates a fractional count instead of printing one', () => {
    // A balance is a whole number of conversations; 2.5 remaining is not a thing
    // the UI has a form for.
    expect(
      reconcileEntitlement({ active: false, checked: true, freeSessionsRemaining: 2.7 }, { isSubscriptionActive: false, freeSessionsRemaining: 3 }),
    ).toEqual({ freeSessionsRemaining: 2 });
  });

  it('tolerates a missing local row', () => {
    expect(reconcileEntitlement(ACTIVE, null)).toEqual({
      isSubscriptionActive: true,
      subscriptionExpiresAt: '2026-12-01T00:00:00.000Z',
    });
    expect(reconcileEntitlement({ active: false, checked: true }, undefined)).toBeNull();
  });
});
