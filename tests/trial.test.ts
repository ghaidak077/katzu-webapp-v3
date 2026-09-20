import { describe, it, expect } from 'vitest';
import type { CEFRLevel } from '../src/types/models';

describe('Free Trial & Gating Rules', () => {
  interface MockUser {
    isSubscriptionActive: boolean;
    freeSessionsRemaining: number;
    cefrLevel: CEFRLevel;
  }

  function canStartConversation(user: MockUser, scenarioLevel: CEFRLevel): {
    allowed: boolean;
    reason?: 'TRIAL_EXPIRED' | 'PRO_REQUIRED';
  } {
    if (user.isSubscriptionActive) {
      return { allowed: true };
    }

    if (scenarioLevel !== 'A1') {
      return { allowed: false, reason: 'PRO_REQUIRED' };
    }

    if (user.freeSessionsRemaining <= 0) {
      return { allowed: false, reason: 'TRIAL_EXPIRED' };
    }

    return { allowed: true };
  }

  function decrementSession(user: MockUser): MockUser {
    if (user.isSubscriptionActive) return user;
    return {
      ...user,
      freeSessionsRemaining: Math.max(0, user.freeSessionsRemaining - 1),
    };
  }

  it('allows new trial users to access A1 scenarios with 3 sessions', () => {
    const newUser: MockUser = {
      isSubscriptionActive: false,
      freeSessionsRemaining: 3,
      cefrLevel: 'A1',
    };

    const result = canStartConversation(newUser, 'A1');
    expect(result.allowed).toBe(true);
  });

  it('blocks trial users from accessing A2, B1, or B2 scenarios without Pro', () => {
    const trialUser: MockUser = {
      isSubscriptionActive: false,
      freeSessionsRemaining: 3,
      cefrLevel: 'A1',
    };

    expect(canStartConversation(trialUser, 'A2').allowed).toBe(false);
    expect(canStartConversation(trialUser, 'A2').reason).toBe('PRO_REQUIRED');
    expect(canStartConversation(trialUser, 'B1').allowed).toBe(false);
    expect(canStartConversation(trialUser, 'B2').allowed).toBe(false);
  });

  it('decrements free sessions upon completing a conversation', () => {
    let user: MockUser = {
      isSubscriptionActive: false,
      freeSessionsRemaining: 3,
      cefrLevel: 'A1',
    };

    user = decrementSession(user);
    expect(user.freeSessionsRemaining).toBe(2);

    user = decrementSession(user);
    expect(user.freeSessionsRemaining).toBe(1);

    user = decrementSession(user);
    expect(user.freeSessionsRemaining).toBe(0);

    // Floor at zero
    user = decrementSession(user);
    expect(user.freeSessionsRemaining).toBe(0);
  });

  it('triggers trial expired paywall when 0 sessions remain', () => {
    const expiredUser: MockUser = {
      isSubscriptionActive: false,
      freeSessionsRemaining: 0,
      cefrLevel: 'A1',
    };

    const result = canStartConversation(expiredUser, 'A1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('TRIAL_EXPIRED');
  });

  it('grants unlimited access across all levels when subscription is active', () => {
    const proUser: MockUser = {
      isSubscriptionActive: true,
      freeSessionsRemaining: 0,
      cefrLevel: 'B2',
    };

    expect(canStartConversation(proUser, 'A1').allowed).toBe(true);
    expect(canStartConversation(proUser, 'A2').allowed).toBe(true);
    expect(canStartConversation(proUser, 'B1').allowed).toBe(true);
    expect(canStartConversation(proUser, 'B2').allowed).toBe(true);

    const afterSession = decrementSession(proUser);
    expect(afterSession.freeSessionsRemaining).toBe(0);
  });
});
