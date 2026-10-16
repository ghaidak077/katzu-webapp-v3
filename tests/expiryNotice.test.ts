import { describe, expect, it } from 'vitest';
import { EXPIRY_WARN_DAYS, daysUntilExpiry, expiryNoticeAr } from '../src/lib/entitlement/expiry';

/**
 * B3: nothing told a paying learner their month was ending — `days_remaining` was
 * returned on every check and read by no screen — so the first news was the level
 * chip dropping to A1 mid-episode. These cases pin the two boundaries that make
 * the notice useful rather than noise: it speaks only in the last week, and only
 * while the subscription is really live.
 */

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 1, 12, 0, 0);
const at = (days: number) => new Date(now + days * DAY).toISOString();

describe('days left on a subscription', () => {
  it('rounds a part-day up, so hours of Pro never read as nothing', () => {
    // Four hours left is "today", not "0 days" and not "no date".
    expect(daysUntilExpiry(new Date(now + 4 * 3_600_000).toISOString(), now)).toBe(1);
    expect(daysUntilExpiry(new Date(now + 30 * 3_600_000).toISOString(), now)).toBe(2);
    expect(daysUntilExpiry(at(3), now)).toBe(3);
  });

  it('says so when it already ended, instead of going quiet', () => {
    // A negative is information ("it lapsed"), which is a different fact from
    // "there is no date" — the caller decides what to render.
    expect(daysUntilExpiry(at(-1), now)).toBe(-1);
    expect(daysUntilExpiry(at(-30), now)).toBe(-30);
  });

  it('returns null for a date it cannot use', () => {
    expect(daysUntilExpiry(null, now)).toBeNull();
    expect(daysUntilExpiry(undefined, now)).toBeNull();
    expect(daysUntilExpiry('', now)).toBeNull();
    expect(daysUntilExpiry('not a date', now)).toBeNull();
  });
});

describe('the notice a paying learner sees', () => {
  it('speaks in the last week and stays silent before it', () => {
    expect(expiryNoticeAr(at(EXPIRY_WARN_DAYS), true, now)).toContain('يتبقّى');
    expect(expiryNoticeAr(at(EXPIRY_WARN_DAYS + 1), true, now)).toBeNull();
    // A learner three weeks from renewal is not sold to; that is the whole point
    // of a warn window rather than a countdown.
    expect(expiryNoticeAr(at(30), true, now)).toBeNull();
  });

  it('agrees with Arabic number forms rather than hard-coding one', () => {
    expect(expiryNoticeAr(at(0), true, now)).toContain('اليوم');
    expect(expiryNoticeAr(at(1), true, now)).toContain('يوم واحد');
    expect(expiryNoticeAr(at(2), true, now)).toContain('يومان');
    expect(expiryNoticeAr(at(3), true, now)).toContain('3 أيام');
    expect(expiryNoticeAr(at(7), true, now)).toContain('7 أيام');
  });

  it('always names the way to renew, in every form', () => {
    for (const days of [0, 1, 2, 3, 7]) {
      expect(expiryNoticeAr(at(days), true, now)).toContain('جدّد بكود جديد');
    }
  });

  it('stays silent for a row the app no longer treats as Pro', () => {
    // A revoked or expired subscription keeps its date (B2 keeps it on purpose),
    // so without this check the app would promise a month it stopped honouring.
    expect(expiryNoticeAr(at(3), false, now)).toBeNull();
    expect(expiryNoticeAr(at(3), false, now)).toBeNull();
  });

  it('says nothing about a subscription that already ended', () => {
    // The paywall and the level gate are where "your month is over" belongs; a
    // "it ended" card on the home screen would be a nag with no action in it.
    expect(expiryNoticeAr(at(-1), true, now)).toBeNull();
    expect(expiryNoticeAr(at(-400), true, now)).toBeNull();
  });

  it('has nothing to say without a usable date', () => {
    expect(expiryNoticeAr(null, true, now)).toBeNull();
    expect(expiryNoticeAr('garbage', true, now)).toBeNull();
  });
});
