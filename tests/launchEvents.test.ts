import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS } from '../src/lib/analytics/events';
import { EVENT_NAMES, FUNNEL_EVENTS } from '../cloudflare-analytics.js';

/**
 * The four events the launch funnel was missing.
 *
 * Two things have to hold for each: it must be fired at a path that really
 * exists (an allow-listed event nobody sends is a name, not a measurement), and
 * it must carry nothing that identifies a learner or reproduces their content.
 * `tests/analyticsRoute.test.ts` already pins the two allow-lists equal; this
 * pins that the new names are actually wired up and stay privacy-clean.
 */

/** The events this batch added, and where each one has to be fired from. */
const ADDED: Array<{ name: string; firedIn: string; snippet: RegExp }> = [
  {
    name: 'free_session_exhausted',
    firedIn: 'src/features/conversation/useLiveConversation.ts',
    snippet: /track\(\s*'free_session_exhausted'/,
  },
  {
    name: 'exam_date_set',
    firedIn: 'src/features/onboarding/OnboardingScreen.tsx',
    snippet: /track\(\s*'exam_date_set'/,
  },
  {
    name: 'referral_converted',
    firedIn: 'src/features/auth/SubscriptionRedemptionScreen.tsx',
    snippet: /track\(\s*'referral_converted'/,
  },
  {
    name: 'share_landed',
    firedIn: 'src/App.tsx',
    snippet: /track\(\s*'share_landed'/,
  },
];

function source(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('the events the funnel was missing', () => {
  it('are in the client allow-list', () => {
    for (const { name } of ADDED) expect(ANALYTICS_EVENTS).toContain(name);
  });

  it('are in the Worker allow-list, which is pinned equal by analyticsRoute.test.ts', () => {
    for (const { name } of ADDED) expect(EVENT_NAMES).toContain(name);
  });

  it('are each fired at a file that exists, on a real code path', () => {
    // An allow-listed name nobody sends is the exact failure this batch was
    // meant to prevent: the dashboard would show a funnel with a permanent zero.
    for (const { name, firedIn, snippet } of ADDED) {
      const text = source(firedIn);
      expect(text, `${name} must be fired in ${firedIn}`).toMatch(snippet);
    }
  });

  it('count a free wall without counting a level lock', () => {
    // A learner locked out of B2 on turn one has spent nothing. Counting both as
    // "exhausted" would make the free allowance look far smaller than it is.
    const text = source('src/features/conversation/useLiveConversation.ts');
    const block = text.slice(text.indexOf("'free_session_exhausted'") - 400);
    expect(block).toMatch(/if \(err\?\.code === 'FREE_QUOTA_EXHAUSTED'\)/);
  });

  it('record a referral only when the server accepted it', () => {
    const text = source('src/features/auth/SubscriptionRedemptionScreen.tsx');
    expect(text).toMatch(/if \(result\.success\) \{\s*track\('referral_converted'/);
  });

  it('reach a durable row, so the conversion edges outlive the KV window', () => {
    // Rare, decision-shaping events belong in a table with a TTL, not in KV
    // where they expire in 30 days and the launch question goes with them.
    expect(FUNNEL_EVENTS.has('free_session_exhausted')).toBe(true);
    expect(FUNNEL_EVENTS.has('referral_converted')).toBe(true);
  });

  it('carry no date, no code and no learner text', () => {
    // `exam_date_set` reports lead time in days; `referral_converted` reports
    // only that it happened. Neither may smuggle the value it observed.
    const onDate = source('src/features/onboarding/OnboardingScreen.tsx');
    const fired = onDate.slice(onDate.indexOf("const days ="), onDate.indexOf("track('exam_date_set'"));
    // The reported number is a duration, not the date itself.
    expect(fired).toMatch(/\(value - Date\.now\(\)\) \/ 86_400_000/);
    expect(onDate.slice(onDate.indexOf("track('exam_date_set'"), onDate.indexOf("track('exam_date_set'") + 160)).toMatch(
      /count: days/,
    );
    // And the date value itself is never an allow-listed property. (The path is
    // the direct one: a `..` chain through a directory that does not exist
    // resolves on Windows and throws ENOENT on Linux — this test was green here
    // and red on CI for exactly that reason.)
    expect(source('src/lib/analytics/events.ts')).not.toMatch(/targetDate/);

    const referral = source('src/features/auth/SubscriptionRedemptionScreen.tsx');
    const claim = referral.slice(referral.indexOf("track('referral_converted'"));
    expect(claim.slice(0, 160)).not.toContain('referralCode');
  });

  it('skip the two names that have no path to fire from', () => {
    // `order_intent`: the app never creates an order — check-out is a separate
    // origin — and `purchase_clicked` already marks the outbound buy.
    // `share_clicked`: `share_click` already fires at all four share surfaces;
    // a second name would split the funnel rather than measure it.
    for (const name of ['order_intent', 'share_clicked']) {
      expect(ANALYTICS_EVENTS).not.toContain(name);
      expect(EVENT_NAMES).not.toContain(name);
    }
  });
});

/**
 * A5: the four emissions the funnel was blind to.
 *
 * Each was a measurement the app appeared to take and did not: a name in the
 * allow-list with no call site, or a call site under a name the D1 funnel does
 * not aggregate. Both failures look identical on the dashboard — a permanent
 * zero — which is why they are pinned here rather than trusted.
 */
describe('A5: the funnel can see these now', () => {
  it('fires onboarding_goal at the moment the goal is chosen', () => {
    const text = source('src/features/onboarding/OnboardingScreen.tsx');
    expect(text).toMatch(/track\(\s*'onboarding_goal'/);
    // The goal it records is the one just picked, not a later default.
    const call = text.slice(text.indexOf("track('onboarding_goal'"));
    expect(call.slice(0, 120)).toMatch(/kind: goal/);
  });

  it('fires paywall_view from the modal too, not only paywall_viewed', () => {
    // The modal used to fire ONLY `paywall_viewed`, and the funnel aggregates
    // `paywall_view` — so every modal gate (level, session cap, mock) was
    // invisible to it while looking like a paywall nobody ever saw.
    const text = source('src/components/sheets/PaywallModal.tsx');
    expect(text).toMatch(/track\(\s*'paywall_view',/);
    expect(text).toMatch(/track\(\s*'paywall_viewed',/);
    const call = text.slice(text.indexOf("track('paywall_view',"));
    expect(call.slice(0, 120)).toMatch(/source: 'modal'/);
  });

  it('names the exam card share in its own kind', () => {
    const text = source('src/features/report/SessionReportScreen.tsx');
    const call = text.slice(text.indexOf("track('share_click'"));
    expect(call.slice(0, 120)).toMatch(/kind: 'exam_card'/);
  });

  it('measures seconds to the first accepted turn, and nothing else', () => {
    const text = source('src/features/conversation/useLiveConversation.ts');
    expect(ANALYTICS_EVENTS).toContain('time_to_first_turn');
    expect(EVENT_NAMES).toContain('time_to_first_turn');
    const call = text.slice(text.indexOf("track('time_to_first_turn'"));
    // A duration, never a timestamp or a transcript.
    expect(call.slice(0, 160)).toMatch(/count: elapsedSeconds/);
    expect(text).toMatch(/firstTurnTrackedRef/);
  });

  it('takes the elapsed time from the recording clock, not the wall clock', () => {
    // A resumed session must not report hours: the measurement is anchored where
    // the scenario opened, and the anchor is reset on every open.
    const text = source('src/features/conversation/useLiveConversation.ts');
    const anchor = text.indexOf('sessionOpenedAtRef.current = Date.now()');
    expect(anchor).toBeGreaterThan(-1);
    expect(text.slice(anchor, anchor + 200)).toMatch(/firstTurnTrackedRef.current = false/);
  });
});

describe('the allow-list is still closed', () => {
  it('every event the app fires exists in both lists', () => {
    // Walks the app rather than trusting a hand-written list: a `track()` call
    // with a name the Worker would drop is a measurement that never arrives.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry)) files.push(path);
      }
    };
    walk('src');
    const fired = new Set<string>();
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(/track\(\s*'([a-z0-9_]+)'/g)) {
        fired.add(m[1]);
      }
    }
    expect(fired.size).toBeGreaterThan(10);
    for (const name of fired) {
      expect(ANALYTICS_EVENTS, `client fired ${name}`).toContain(name);
      expect(EVENT_NAMES, `worker would drop ${name}`).toContain(name);
    }
  });
});
