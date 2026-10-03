import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALLOWED_PROP_KEYS,
  MAX_ATTEMPTS,
  MAX_BATCH_SIZE,
  analyticsEventKey,
  dedupeEvents,
  isRetryDue,
  planAnalyticsBatch,
  planAnalyticsRetry,
  purgeExpiredEvents,
  shouldTrackAnalytics,
  validateAnalyticsEvent,
  type AnalyticsEvent,
} from '../src/lib/analytics/events';
import {
  enqueueEvent,
  hashAccountId,
  isAnalyticsOptedOut,
  queueSnapshot,
  setAnalyticsOptOut,
} from '../src/lib/analytics/client';

const now = 1_800_000_000_000;

function event(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    name: 'demo_started',
    ts: now,
    installId: 'install-12345678',
    appVersion: '1.0.0',
    route: '/demo',
    ...overrides,
  };
}

describe('analytics event validation', () => {
  it('accepts a well-formed event', () => {
    const result = validateAnalyticsEvent(event(), now);
    expect(result.ok).toBe(true);
  });

  it('accepts the vocabulary-bridge events and their surface prop', () => {
    const tapped = validateAnalyticsEvent(event({ name: 'word_bank_tapped', props: { skill: 'review', kind: 'vocab' } }), now);
    expect(tapped.ok).toBe(true);
    if (tapped.ok) expect(tapped.event.props).toEqual({ skill: 'review', kind: 'vocab' });

    const revealed = validateAnalyticsEvent(event({ name: 'review_revealed', props: { skill: 'review', kind: 'vocab' } }), now);
    expect(revealed.ok).toBe(true);
  });

  it('rejects unknown event names', () => {
    expect(validateAnalyticsEvent({ ...event(), name: 'screen_recorded' }, now).ok).toBe(false);
  });

  it('rejects events with a fabricated timestamp', () => {
    expect(validateAnalyticsEvent({ ...event(), ts: now - 30 * 24 * 60 * 60 * 1000 }, now).ok).toBe(false);
    expect(validateAnalyticsEvent({ ...event(), ts: 'yesterday' }, now).ok).toBe(false);
  });

  it('rejects a missing or too-short installation id', () => {
    expect(validateAnalyticsEvent({ ...event(), installId: '' }, now).ok).toBe(false);
    expect(validateAnalyticsEvent({ ...event(), installId: 'abc' }, now).ok).toBe(false);
  });

  it('drops properties that are not on the allowlist', () => {
    const result = validateAnalyticsEvent(
      {
        ...event(),
        props: { scenarioId: 'doctor_visit', transcript: 'Ich habe Fieber', email: 'a@b.c' },
      },
      now,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.event.props || {})).toEqual(['scenarioId']);
    expect([...ALLOWED_PROP_KEYS]).not.toContain('transcript');
  });

  it('keeps only known levels and goals', () => {
    const good = validateAnalyticsEvent({ ...event(), level: 'B1', goal: 'work' }, now);
    expect(good.ok && good.event.level).toBe('B1');
    const bad = validateAnalyticsEvent({ ...event(), level: 'C2', goal: 'fluency' }, now);
    expect(bad.ok && bad.event.level).toBeUndefined();
    expect(bad.ok && bad.event.goal).toBeUndefined();
  });
});

describe('analytics deduplication and batching', () => {
  it('drops an event that is already queued', () => {
    const first = event();
    const tail = dedupeEvents([first], [{ ...first }]);
    expect(tail).toHaveLength(0);
    expect(analyticsEventKey(first)).toBe(analyticsEventKey({ ...first }));
  });

  it('keeps genuinely different events', () => {
    const tail = dedupeEvents([event()], [event({ name: 'demo_completed' })]);
    expect(tail).toHaveLength(1);
  });

  it('purges expired events instead of back-filling them', () => {
    const old = event({ ts: now - 8 * 24 * 60 * 60 * 1000 });
    expect(purgeExpiredEvents([old, event()], now)).toHaveLength(1);
  });

  it('batches at most MAX_BATCH_SIZE events', () => {
    const queue = Array.from({ length: MAX_BATCH_SIZE + 3 }, () => event());
    const { batch, rest } = planAnalyticsBatch(queue);
    expect(batch).toHaveLength(MAX_BATCH_SIZE);
    expect(rest).toHaveLength(3);
  });
});

describe('analytics offline retry', () => {
  it('re-queues a failed batch with growing backoff', () => {
    const first = planAnalyticsRetry([event()], 0, now)!;
    expect(first.attempts).toBe(1);
    expect(first.nextRetryAt).toBe(now + 30_000);
    const second = planAnalyticsRetry([event()], 1, now)!;
    expect(second.nextRetryAt).toBe(now + 60_000);
  });

  it('drops a batch after MAX_ATTEMPTS instead of retrying forever', () => {
    expect(planAnalyticsRetry([event()], MAX_ATTEMPTS, now)).toBeNull();
  });

  it('waits until the backoff window has passed', () => {
    expect(isRetryDue({ nextRetryAt: now + 10_000, attempts: 1 }, now)).toBe(false);
    expect(isRetryDue({ nextRetryAt: now, attempts: 1 }, now)).toBe(true);
  });
});

describe('analytics opt-out and privacy', () => {
  // Vitest runs in a node environment here (the app's own storage access is
  // guarded); a tiny in-memory stand-in lets the queue rules be exercised
  // exactly as they run in a browser.
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    };
  });

  it('is off by default and can be turned on and back off', () => {
    expect(isAnalyticsOptedOut()).toBe(false);
    setAnalyticsOptOut(true);
    expect(isAnalyticsOptedOut()).toBe(true);
    setAnalyticsOptOut(false);
    expect(isAnalyticsOptedOut()).toBe(false);
  });

  it('deletes the pending queue when the learner opts out', () => {
    enqueueEvent(event(), now);
    expect(queueSnapshot().length).toBe(1);
    setAnalyticsOptOut(true);
    expect(queueSnapshot().length).toBe(0);
  });

  it('does not queue the same event twice', () => {
    enqueueEvent(event(), now);
    enqueueEvent(event(), now + 1);
    expect(queueSnapshot().length).toBe(1);
  });

  it('never sends an email address as the account id', () => {
    const hash = hashAccountId('learner@example.com');
    expect(hash).toMatch(/^acct_/);
    expect(hash).not.toContain('@');
    expect(hash).not.toContain('example');
    expect(hashAccountId('learner@example.com')).toBe(hash);
  });

  it('is disabled in development builds unless explicitly forced', () => {
    expect(shouldTrackAnalytics({ optedOut: false, isDev: true })).toBe(false);
    expect(shouldTrackAnalytics({ optedOut: false, isDev: false })).toBe(true);
    expect(shouldTrackAnalytics({ optedOut: true, isDev: false })).toBe(false);
    expect(shouldTrackAnalytics({ optedOut: false, isDev: true, forceInDev: true })).toBe(true);
  });
});
