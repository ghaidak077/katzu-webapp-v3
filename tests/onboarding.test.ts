import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAILY_MINUTES,
  PREVIOUS_GERMAN_COPY,
  emptyOnboardingAnswers,
  isOnboardingComplete,
  needsOnboarding,
  onboardingPatch,
  placementOffer,
  placementSkipPatch,
  sanitizeTargetDate,
} from '../src/lib/onboarding/preferences';
import type { PreviousGerman } from '../src/types/models';

describe('onboarding preferences', () => {
  it('asks a signed-in learner who never completed onboarding', () => {
    expect(needsOnboarding({ isLoggedIn: true })).toBe(true);
  });

  it('never asks a signed-out visitor', () => {
    expect(needsOnboarding({ isLoggedIn: false })).toBe(false);
    expect(needsOnboarding(null)).toBe(false);
  });

  it('does not ask a returning learner again', () => {
    expect(needsOnboarding({ isLoggedIn: true, onboardingCompletedAt: 1_700_000_000_000 })).toBe(false);
  });

  it('persists answers as an additive profile patch with defaults', () => {
    const patch = onboardingPatch({
      ...emptyOnboardingAnswers(),
      primaryGoal: 'work',
      arrivalStatus: 'preparing',
      dailyMinutes: 20,
    });
    expect(patch.primaryGoal).toBe('work');
    expect(patch.arrivalStatus).toBe('preparing');
    // Reuses the existing dailyGoalMinutes field instead of a duplicate one.
    expect(patch.dailyGoalMinutes).toBe(20);
    expect(patch.onboardingCompletedAt).toBeTypeOf('number');
  });

  it('falls back to the default daily minutes when none was chosen', () => {
    const patch = onboardingPatch(emptyOnboardingAnswers());
    expect(patch.dailyGoalMinutes).toBe(DEFAULT_DAILY_MINUTES);
  });

  it('requires goal, arrival and daily time before it counts as complete', () => {
    expect(isOnboardingComplete(emptyOnboardingAnswers())).toBe(false);
    expect(
      isOnboardingComplete({
        ...emptyOnboardingAnswers(),
        primaryGoal: 'exam',
        arrivalStatus: 'recently_arrived',
        dailyMinutes: 5,
      }),
    ).toBe(true);
  });

  it('accepts a sane target date and rejects a typo', () => {
    const now = new Date(2026, 0, 1).getTime();
    const inTwoMonths = now + 60 * 24 * 60 * 60 * 1000;
    expect(sanitizeTargetDate('exam', inTwoMonths, now)).toBe(inTwoMonths);
    expect(sanitizeTargetDate('exam', Number.NaN, now)).toBeNull();
    expect(sanitizeTargetDate('exam', now - 5 * 24 * 60 * 60 * 1000, now)).toBeNull();
    expect(sanitizeTargetDate('exam', now + 10 * 365 * 24 * 60 * 60 * 1000, now)).toBeNull();
  });

  it('marks a skipped placement as unmeasured, never as mastered', () => {
    const patch = placementSkipPatch(1234);
    expect(patch.placementSkippedAt).toBe(1234);
    expect(patch.cefrLevel).toBeUndefined();
  });

  it('stores what the learner tried before as its own answer', () => {
    const patch = onboardingPatch({ ...emptyOnboardingAnswers(), previousGerman: 'some_basics' });
    expect(patch.previousGerman).toBe('some_basics');
    // Unanswered stays unset rather than defaulting to "first time".
    expect(onboardingPatch(emptyOnboardingAnswers()).previousGerman).toBeUndefined();
  });

  it('never lets the self-report set a level on its own', () => {
    for (const previous of ['first_time', 'some_basics', 'can_hold'] as PreviousGerman[]) {
      expect(onboardingPatch({ ...emptyOnboardingAnswers(), previousGerman: previous }).cefrLevel).toBeUndefined();
    }
  });

  it('offers a first-timer the start and pushes the check for everyone else', () => {
    expect(placementOffer('first_time').primary).toBe('start');
    expect(placementOffer(null).primary).toBe('start');
    expect(placementOffer('some_basics').primary).toBe('placement');
    expect(placementOffer('can_hold').primary).toBe('placement');
    // The recommendation is a sentence the screen shows verbatim, not a bare flag.
    expect(placementOffer('can_hold').recommendAr.length).toBeGreaterThan(20);
  });

  it('has learner-facing wording for every previous-experience answer', () => {
    for (const previous of ['first_time', 'some_basics', 'can_hold'] as PreviousGerman[]) {
      expect(PREVIOUS_GERMAN_COPY[previous].labelAr).not.toHaveLength(0);
      expect(PREVIOUS_GERMAN_COPY[previous].hintAr).not.toHaveLength(0);
    }
  });
});
