/**
 * V31 Batch 1 — the moments of truth.
 *
 * Every case here is a defect that shipped: the free wall that could not be
 * retried past, a paywall that printed a session count it never owned, a hint
 * button that looked alive after its budget was gone, and a debrief that
 * vanished with the tab that earned it. Each test names the defect it prevents.
 */

import { describe, expect, it } from 'vitest';
import { isEntitlementUnavailable, isEntitlementWall } from '@/lib/entitlement/codes';
import { classifyTurnError } from '@/lib/conversation/stateMachine';
import { freeSessionsCopy } from '@/lib/entitlement/trialCopy';
import {
  latestRecoverableSession,
  mistakesForSession,
  previousMistakeCountFor,
  summaryFromSession,
} from '@/features/report/recover';
import type { MistakeEntity, SessionEntity } from '@/types/models';

const session = (over: Partial<SessionEntity> = {}): SessionEntity => ({
  id: 's1',
  scenarioId: 'cafe_order',
  scenarioTitle: 'الطلب في المقهى',
  cefrLevel: 'A1',
  sentencesSpoken: 6,
  wordsLearned: 24,
  accuracyPercent: 67,
  durationSeconds: 420,
  timestamp: 1_700_000_000_000,
  wasIndependentOnly: false,
  independentSentences: 4,
  hintAssistedSentences: 2,
  mode: 'practice',
  mistakesCount: 2,
  ...over,
});

const mistake = (over: Partial<MistakeEntity> = {}): MistakeEntity => ({
  id: 1,
  userId: 'current_user',
  scenarioId: 'cafe_order',
  original: 'Ich möchte ein Kaffee.',
  corrected: 'Ich möchte einen Kaffee.',
  grammarRule: 'der/die/das',
  timestamp: 1_699_999_000_000,
  wasHintUsed: false,
  ...over,
});

describe('entitlement codes — the free wall is a wall', () => {
  it('treats a spent trial as terminal, not retryable', () => {
    // The defect: `FREE_QUOTA_EXHAUSTED` matched nothing, so the learner got a
    // "try again" card that could never clear.
    const error = classifyTurnError({
      code: 'FREE_QUOTA_EXHAUSTED',
      message: 'انتهت الجلسات التجريبية المجانية (3 جلسات).',
    });
    expect(error.kind).toBe('quota');
    expect(error.retryable).toBe(false);
  });

  it('still treats a level lock as terminal', () => {
    expect(isEntitlementWall('PAYWALL_REQUIRED')).toBe(true);
    expect(classifyTurnError({ code: 'PAYWALL_REQUIRED' }).retryable).toBe(false);
  });

  it('treats an unreadable ledger as a glitch, because retrying can clear it', () => {
    // Showing a paywall for a 503 would charge the learner for the server's
    // bad morning — the opposite dishonesty, and the one the writing screen had.
    expect(isEntitlementUnavailable('QUOTA_UNAVAILABLE')).toBe(true);
    expect(isEntitlementWall('QUOTA_UNAVAILABLE')).toBe(false);
    const error = classifyTurnError({ code: 'QUOTA_UNAVAILABLE' });
    expect(error.retryable).toBe(true);
    expect(error.kind).not.toBe('quota');
  });

  it('leaves a genuine AI failure retryable', () => {
    const error = classifyTurnError({ code: 'AI_TURN_HTTP_ERROR', message: 'boom' });
    expect(error.kind).toBe('ai_service');
    expect(error.retryable).toBe(true);
  });

  it('does not let a missing code crash the classifier', () => {
    expect(() => classifyTurnError(undefined)).not.toThrow();
    expect(classifyTurnError(undefined).retryable).toBe(true);
    expect(isEntitlementWall(undefined)).toBe(false);
  });
});

describe('the paywall states a count it owns', () => {
  it('uses the server number, not the locally seeded three', () => {
    expect(freeSessionsCopy(1)).toContain('جلسة واحدة');
    // L2: the numeral in Arabic prose is Arabic-Indic, matching the landing
    // page's «٣ جلسات». The assertion this replaces checked the same fact with a
    // Western "3"; only the digit shape moved.
    expect(freeSessionsCopy(3)).toContain('٣ جلسات');
    expect(freeSessionsCopy(0)).toContain('انتهت جلساتك');
  });

  it('never renders an unreadable ledger as zero', () => {
    const copy = freeSessionsCopy(null);
    expect(copy).not.toContain('0 ');
    expect(copy).toContain('خوادمنا');
  });

  it('keeps the promise that review stays free in every state', () => {
    for (const value of [null, 0, 1, 3]) {
      expect(freeSessionsCopy(value)).toContain('مجانيان بلا حد');
    }
  });
});

describe('the debrief survives the tab that earned it', () => {
  it('rebuilds the corrections from the session own rows', () => {
    const current = session();
    const mistakes = [
      mistake({ id: 1, timestamp: 1_699_999_000_000 }),
      mistake({ id: 2, timestamp: 1_699_999_500_000 }),
      // A later mistake from the NEXT session must not leak in.
      mistake({ id: 3, timestamp: 1_700_000_500_000 }),
    ];
    const scoped = mistakesForSession(current, mistakes);
    expect(scoped).toHaveLength(2);
    expect(scoped.map((m) => m.id)).toEqual([1, 2]);
  });

  it('ignores mistakes from another scenario entirely', () => {
    const scoped = mistakesForSession(session({ mistakesCount: 1 }), [
      mistake({ id: 9, scenarioId: 'doctor_visit' }),
    ]);
    expect(scoped).toHaveLength(0);
  });

  it('yields no corrections rather than an approximate set for an old row', () => {
    const scoped = mistakesForSession(session({ mistakesCount: undefined }), [
      mistake({ id: 1 }),
      mistake({ id: 2, timestamp: 1_699_999_500_000 }),
    ]);
    expect(scoped).toHaveLength(0);
  });

  it('compares against the prior attempt only', () => {
    const current = session({ timestamp: 2000, mistakesCount: 1 });
    const sessions = [
      current,
      session({ id: 'old', timestamp: 1000, mistakesCount: 4 }),
      session({ id: 'newer', timestamp: 3000, mistakesCount: 0 }),
    ];
    expect(previousMistakeCountFor(current, sessions)).toBe(4);
  });

  it('refuses to invent a comparison when no prior attempt recorded one', () => {
    const current = session({ timestamp: 2000 });
    expect(previousMistakeCountFor(current, [current])).toBeNull();
  });

  it('rebuilds a full report from durable rows alone', () => {
    const current = session();
    const rebuilt = summaryFromSession(
      current,
      [mistake({ id: 1 }), mistake({ id: 2, timestamp: 1_699_999_500_000 })],
      [current],
    );
    expect(rebuilt).not.toBeNull();
    expect(rebuilt!.scenarioId).toBe('cafe_order');
    expect(rebuilt!.sentencesSpoken).toBe(6);
    expect(rebuilt!.mistakes).toHaveLength(2);
    expect(rebuilt!.debrief.headlineAr).toBeTruthy();
    expect(rebuilt!.debrief.didWellAr.length).toBeGreaterThan(0);
  });

  it('picks the newest session, and refuses one with no sentences', () => {
    const sessions = [
      session({ id: 'a', timestamp: 1000 }),
      session({ id: 'b', timestamp: 3000 }),
      session({ id: 'empty', timestamp: 4000, sentencesSpoken: 0 }),
    ];
    expect(latestRecoverableSession(sessions)?.id).toBe('b');
    expect(latestRecoverableSession([])).toBeNull();
  });

  it('returns null rather than a report full of zeroes', () => {
    expect(summaryFromSession(undefined as never, [], [])).toBeNull();
  });
});